// Supabase Edge Function: Send On-Call Notifications via Microsoft Graph API
// Deploy with: supabase functions deploy send-oncall-notifications

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Microsoft Graph API credentials
const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID");
const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID");
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET");
const MS_SENDER_EMAIL = Deno.env.get("MS_SENDER_EMAIL");

// Supabase credentials
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RosterEntry {
  id: number;
  time_shift: string;
  app: string;
  team: string;
  mon: string;
  tue: string;
  wed: string;
  thu: string;
  fri: string;
  sat: string;
  sun: string;
}

interface StaffEntry {
  name: string;
  email: string;
  timezone?: string;
}

interface NotificationResult {
  name: string;
  email: string | null;
  success: boolean;
  error?: string;
  app?: string;
  team?: string;
  time?: string;
}

interface Manager {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

// Shift time mapping based on timezone
const SHIFT_TIME_MAP: Record<string, string> = {
  "AEST": "16:00 - 02:30 (AEST) / 10:30 - 21:00 (IST)",
  "IST": "10:30 - 21:00 (IST) / 16:00 - 02:30 (AEST)",
};

function getShiftTimeDisplay(timeShift: string): string {
  // Check if it's a simple timezone value that needs mapping
  const upperTime = timeShift?.toUpperCase()?.trim();
  if (SHIFT_TIME_MAP[upperTime]) {
    return SHIFT_TIME_MAP[upperTime];
  }
  // If it already contains full format or unknown, return as-is
  return timeShift || '-';
}

// Get Microsoft Graph API access token
async function getMsGraphToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams();
  params.append("client_id", MS_CLIENT_ID!);
  params.append("client_secret", MS_CLIENT_SECRET!);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get access token: ${errorData}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Send email via Microsoft Graph API
async function sendEmailViaGraph(
  accessToken: string,
  toEmail: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${MS_SENDER_EMAIL}/sendMail`;

  const emailPayload = {
    message: {
      subject: subject,
      body: {
        contentType: "HTML",
        content: htmlContent,
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmail,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  const response = await fetch(sendMailUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send email: ${errorData}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate Microsoft Graph credentials
    if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_SENDER_EMAIL) {
      throw new Error("Microsoft Graph API credentials are not set. Please configure MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_SENDER_EMAIL.");
    }
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not set");
    }

    // Parse request body for timezone filter and test mode
    let targetTimezone: string | null = null;
    let testMode = false; // If true, only sends manager summary (skips individual notifications)
    
    // Check URL params first (for easy testing via browser)
    const url = new URL(req.url);
    const urlTestMode = url.searchParams.get("testMode");
    const urlTimezone = url.searchParams.get("timezone");
    
    if (urlTestMode === "true" || urlTestMode === "1") {
      testMode = true;
    }
    if (urlTimezone) {
      targetTimezone = urlTimezone;
    }
    
    // Then check request body (overrides URL params)
    try {
      const body = await req.json();
      targetTimezone = body.timezone || targetTimezone;
      if (body.testMode === true || body.testMode === "true") {
        testMode = true;
      }
    } catch {
      // No body or invalid JSON - use URL params or defaults
    }
    
    console.log(`Mode: ${testMode ? 'TEST (managers only)' : 'NORMAL'}, Timezone: ${targetTimezone || 'ALL'}`);

    // Get Microsoft Graph access token
    const accessToken = await getMsGraphToken();

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get today's day key based on target timezone
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const now = new Date();
    
    // Calculate offset based on target timezone
    let timezoneOffset: number;
    let timezoneLabel: string;
    
    if (targetTimezone === "IST") {
      timezoneOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
      timezoneLabel = "IST (UTC+5:30)";
    } else {
      // Default to AEST
      timezoneOffset = 10 * 60 * 60 * 1000; // AEST is UTC+10
      timezoneLabel = "AEST (UTC+10)";
    }
    
    const localTime = new Date(now.getTime() + timezoneOffset);
    const today = localTime;
    const dayKey = days[today.getUTCDay()];
    
    // Format today's date nicely
    const todayFormatted = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Calculate current week's start date (Monday)
    const currentWeekStart = new Date(today);
    const dayOfWeek = currentWeekStart.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 6 days back, else day - 1
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - daysToMonday);
    const weekStartStr = currentWeekStart.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    console.log(`Fetching roster for week starting: ${weekStartStr}`);

    // Fetch roster data for current week only
    const { data: roster, error: rosterError } = await supabase
      .from("roster")
      .select("*")
      .eq("week_start", weekStartStr);

    if (rosterError) {
      throw new Error(`Failed to fetch roster: ${rosterError.message}`);
    }

    console.log(`Found ${roster?.length || 0} roster entries for week ${weekStartStr}`);

    // Fetch staff directory (filtered by timezone if specified)
    let staffQuery = supabase.from("staff_directory").select("*");
    
    if (targetTimezone) {
      staffQuery = staffQuery.eq("timezone", targetTimezone);
    }
    
    const { data: staff, error: staffError } = await staffQuery;

    if (staffError) {
      throw new Error(`Failed to fetch staff: ${staffError.message}`);
    }

    // Build staff lookup map (case-insensitive)
    const staffMap = new Map<string, string>();
    (staff as StaffEntry[]).forEach((s) => {
      staffMap.set(s.name.toLowerCase(), s.email);
    });

    // Get today's on-call people (avoid duplicates)
    const onCallPeople: { name: string; app: string; team: string; time: string }[] = [];
    const addedNames = new Set<string>();

    (roster as RosterEntry[]).forEach((row) => {
      const personName = row[dayKey as keyof RosterEntry] as string;
      if (personName && personName.trim() && !addedNames.has(personName.toLowerCase())) {
        addedNames.add(personName.toLowerCase());
        onCallPeople.push({
          name: personName.trim(),
          app: row.app,
          team: row.team,
          time: row.time_shift,
        });
      }
    });

    // Send notifications (or skip if in test mode)
    const results: NotificationResult[] = [];

    for (const person of onCallPeople) {
      const email = staffMap.get(person.name.toLowerCase());

      if (!email) {
        results.push({
          name: person.name,
          email: null,
          success: false,
          error: "Email not found in Staff Directory",
          app: person.app,
          team: person.team,
          time: person.time,
        });
        continue;
      }

      // In test mode, skip individual notifications but still build results for manager summary
      if (testMode) {
        results.push({
          name: person.name,
          email: email,
          success: true, // Mark as "would be sent" for summary display
          app: person.app,
          team: person.team,
          time: person.time,
        });
        console.log(`[TEST MODE] Skipped individual notification to: ${person.name} (${email})`);
        continue;
      }

      // Send email via Microsoft Graph (only in normal mode)
      try {
        const subject = `On-Call Reminder: You are on duty today - ${person.app}`;
        const htmlContent = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
            <!-- Header -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #4f46e5; border-radius: 12px 12px 0 0;">
              <tr>
                <td style="padding: 24px; color: white;">
                  <h2 style="margin: 0; font-size: 24px;">🔔 On-Call Reminder</h2>
                  <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${todayFormatted}</p>
                </td>
              </tr>
            </table>
            
            <!-- Body -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 0 0 12px 12px;">
              <tr>
                <td style="padding: 24px;">
                  
                  <p style="font-size: 16px; color: #334155; margin: 0 0 16px 0;">Hello <strong>${person.name}</strong>,</p>
                  <p style="font-size: 16px; color: #334155; margin: 0 0 24px 0;">This is a reminder that you are scheduled as <strong style="color: #4f46e5;">on-call support</strong> today.</p>
                  
                  <!-- Details Table -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                    <tr style="background: #4f46e5;">
                      <th style="padding: 14px; text-align: left; font-weight: 600; color: white; font-size: 14px; width: 40%; border-bottom: 2px solid #3730a3;">Details</th>
                      <th style="padding: 14px; text-align: left; font-weight: 600; color: white; font-size: 14px; border-bottom: 2px solid #3730a3;">Information</th>
                    </tr>
                    <tr style="background: #f0fdf4;">
                      <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">Application</td>
                      <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; color: #475569;">${person.app}</td>
                    </tr>
                    <tr style="background: #dcfce7;">
                      <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">Team</td>
                      <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; color: #475569;">${person.team}</td>
                    </tr>
                    <tr style="background: #f0fdf4;">
                      <td style="padding: 14px; font-weight: 600; color: #1e293b;">Shift Time</td>
                      <td style="padding: 14px; color: #475569;">${getShiftTimeDisplay(person.time)}</td>
                    </tr>
                  </table>
                  
                  <!-- Call to Action -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border-radius: 8px; border-left: 4px solid #059669; margin-bottom: 24px;">
                    <tr>
                      <td style="padding: 16px;">
                        <p style="margin: 0; color: #166534; font-size: 15px;">
                          ✅ Please ensure you are available during your shift. Have a great day! 💪
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Footer -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #e2e8f0;">
                    <tr>
                      <td style="padding-top: 20px;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.6;">
                          This is an automated message from the MOD & On-Call Roster Portal.<br>
                          Sent from: ${MS_SENDER_EMAIL}
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
            </table>
          </div>
        `;

        await sendEmailViaGraph(accessToken, email, subject, htmlContent);

        results.push({
          name: person.name,
          email: email,
          success: true,
          app: person.app,
          team: person.team,
          time: person.time,
        });
      } catch (emailError) {
        results.push({
          name: person.name,
          email: email,
          success: false,
          error: emailError instanceof Error ? emailError.message : "Unknown error",
          app: person.app,
          team: person.team,
          time: person.time,
        });
      }
    }

    // Return results
    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    // ==================== MANAGER SUMMARY EMAIL ====================
    // Fetch active managers
    const { data: managers, error: managersError } = await supabase
      .from("managers")
      .select("*")
      .eq("active", true);

    const managerResults: { name: string; email: string; success: boolean; error?: string }[] = [];

    if (!managersError && managers && managers.length > 0) {
      console.log(`Sending summary to ${managers.length} managers`);

      // Build the on-call roster table rows
      const rosterTableRows = results.map((r, index) => `
        <tr style="background: ${r.success ? (index % 2 === 0 ? '#f0fdf4' : '#dcfce7') : '#fef2f2'};">
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b; font-weight: 500;">${r.name}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569;">${r.app || '-'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569;">${r.team || '-'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">${getShiftTimeDisplay(r.time || '')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #0369a1;"><a href="mailto:${r.email}" style="color: #0369a1; text-decoration: none;">${r.email || 'N/A'}</a></td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">
            ${r.success ? '<span style="color: #059669;">✅ Sent</span>' : '<span style="color: #dc2626;">❌ Failed</span>'}
          </td>
        </tr>
      `).join('');

      // Build summary email HTML for managers (email-client compatible - using tables instead of flexbox)
      const managerSubject = `📋 Daily On-Call Summary - ${todayFormatted}`;
      const managerHtmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #f8fafc; padding: 20px;">
          <!-- Header -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background: #059669; border-radius: 12px 12px 0 0;">
            <tr>
              <td style="padding: 24px; color: white;">
                <h2 style="margin: 0; font-size: 24px;">📋 Daily On-Call Summary</h2>
                <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${todayFormatted} | ${timezoneLabel}</p>
              </td>
            </tr>
          </table>
          
          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 0 0 12px 12px;">
            <tr>
              <td style="padding: 24px;">
                
                <!-- Summary Stats -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                  <tr>
                    <td width="33%" style="padding: 0 8px 0 0;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #4f46e5; border-radius: 8px;">
                        <tr>
                          <td style="padding: 16px; text-align: center; color: white;">
                            <div style="font-size: 32px; font-weight: bold;">${results.length}</div>
                            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Total On-Call</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="33%" style="padding: 0 4px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #059669; border-radius: 8px;">
                        <tr>
                          <td style="padding: 16px; text-align: center; color: white;">
                            <div style="font-size: 32px; font-weight: bold;">${successCount}</div>
                            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Notified</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td width="33%" style="padding: 0 0 0 8px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: ${errorCount > 0 ? '#dc2626' : '#9ca3af'}; border-radius: 8px;">
                        <tr>
                          <td style="padding: 16px; text-align: center; color: white;">
                            <div style="font-size: 32px; font-weight: bold;">${errorCount}</div>
                            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Failed</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                
                <!-- Roster Table -->
                <h3 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px;">Today's On-Call Roster</h3>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <tr style="background: #4f46e5;">
                    <th style="padding: 12px 10px; text-align: left; font-weight: 600; color: white; font-size: 13px; border-bottom: 2px solid #3730a3;">Name</th>
                    <th style="padding: 12px 10px; text-align: left; font-weight: 600; color: white; font-size: 13px; border-bottom: 2px solid #3730a3;">Application</th>
                    <th style="padding: 12px 10px; text-align: left; font-weight: 600; color: white; font-size: 13px; border-bottom: 2px solid #3730a3;">Team</th>
                    <th style="padding: 12px 10px; text-align: left; font-weight: 600; color: white; font-size: 13px; border-bottom: 2px solid #3730a3;">Shift Time</th>
                    <th style="padding: 12px 10px; text-align: left; font-weight: 600; color: white; font-size: 13px; border-bottom: 2px solid #3730a3;">Email</th>
                    <th style="padding: 12px 10px; text-align: center; font-weight: 600; color: white; font-size: 13px; border-bottom: 2px solid #3730a3;">Status</th>
                  </tr>
                  ${rosterTableRows}
                </table>
                
                ${errorCount > 0 ? `
                <!-- Error Alert -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                  <tr>
                    <td style="padding: 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #dc2626;">
                      <strong style="color: #dc2626;">⚠️ Attention Required</strong>
                      <p style="margin: 8px 0 0 0; color: #7f1d1d; font-size: 14px;">
                        ${errorCount} notification(s) failed to send. Please verify the staff directory has correct email addresses for the failed entries.
                      </p>
                    </td>
                  </tr>
                </table>
                ` : ''}
                
                <!-- Footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; border-top: 1px solid #e2e8f0;">
                  <tr>
                    <td style="padding-top: 20px;">
                      <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.6;">
                        This is an automated summary from the MOD & On-Call Roster Portal.<br>
                        Week: ${weekStartStr} | Day: ${dayKey.toUpperCase()} | Timezone: ${timezoneLabel}<br>
                        Sent from: ${MS_SENDER_EMAIL}
                      </p>
                    </td>
                  </tr>
                </table>
                
              </td>
            </tr>
          </table>
        </div>
      `;

      // Send to each manager
      for (const manager of managers as Manager[]) {
        try {
          await sendEmailViaGraph(accessToken, manager.email, managerSubject, managerHtmlContent);
          managerResults.push({
            name: manager.name,
            email: manager.email,
            success: true,
          });
          console.log(`Summary sent to manager: ${manager.name} (${manager.email})`);
        } catch (managerEmailError) {
          managerResults.push({
            name: manager.name,
            email: manager.email,
            success: false,
            error: managerEmailError instanceof Error ? managerEmailError.message : "Unknown error",
          });
          console.error(`Failed to send summary to manager ${manager.name}:`, managerEmailError);
        }
      }
    } else {
      console.log("No active managers found or error fetching managers");
    }

    const managersSent = managerResults.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        testMode: testMode,
        summary: {
          total: results.length,
          sent: testMode ? 0 : successCount, // In test mode, no individual emails were actually sent
          failed: testMode ? 0 : errorCount,
          skipped: testMode ? results.length : 0, // Show how many were skipped in test mode
          date: today.toISOString(),
          day: dayKey,
          weekStart: weekStartStr,
          timezone: timezoneLabel,
          targetFilter: targetTimezone || "ALL",
          sender: MS_SENDER_EMAIL,
          managersSent: managersSent,
          managersTotal: managerResults.length
        },
        results: results,
        managerResults: managerResults,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
