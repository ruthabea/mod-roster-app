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
  site?: string;
  mobile?: string;
}

interface NotificationResult {
  name: string;
  email: string | null;
  sentTo?: string;
  success: boolean;
  error?: string;
  app?: string;
  team?: string;
  time?: string;
  mobile?: string;
  site?: string;
  isWeekly?: boolean;
  acknowledgementToken?: string;
}

interface AcknowledgementRecord {
  person_name: string;
  email: string;
  week_start: string;
  day_of_week: string;
  notification_type: 'daily' | 'weekly';
  app: string;
  team: string;
  site: string;
  shifts_count: number;
}

interface Manager {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

interface ModScheduleEntry {
  id: number;
  date: string;
  onsite_name: string | null;
  onsite_email: string | null;
  offshore_name: string | null;
  offshore_email: string | null;
}

// Format date for MOD schedule (e.g., "23-Jun")
function formatModDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${month}`;
}

// Generate MOD schedule HTML section for On-Call Summary
function generateModScheduleHtml(modSchedule: ModScheduleEntry[]): string {
  if (!modSchedule || modSchedule.length === 0) {
    return '';
  }
  
  const rows = modSchedule.map((entry, index) => `
    <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f0fdf4'};">
      <td style="padding: 10px 12px; border: 1px solid #d1d5db; color: #1e293b; font-weight: 600; font-size: 13px; text-align: center;">
        ${formatModDate(entry.date)}
      </td>
      <td style="padding: 10px 12px; border: 1px solid #d1d5db; color: #334155; font-size: 13px; text-align: center;">
        ${entry.onsite_name || '-'}
      </td>
      <td style="padding: 10px 12px; border: 1px solid #d1d5db; color: #334155; font-size: 13px; text-align: center;">
        ${entry.offshore_name || '-'}
      </td>
    </tr>
  `).join('');
  
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
      <tr>
        <td align="center">
          <h3 style="color: #1e293b; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">
            📋 MOD Schedule for the Week
          </h3>
        </td>
      </tr>
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 500px;">
            <tr style="background-color: #059669;">
              <th style="padding: 12px 10px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 700; border: 1px solid #047857; width: 70px;">
                Days
              </th>
              <th style="padding: 12px 10px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 700; border: 1px solid #047857;">
                Onsite MOD<br>(7AM to 7PM AEST)
              </th>
              <th style="padding: 12px 10px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 700; border: 1px solid #047857;">
                Offshore MOD<br>(7PM to 7AM AEST)
              </th>
            </tr>
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  `;
}

// Site to notification timezone mapping
// Philippines → AEST, India → IST, Australia → AEST
const SITE_TIMEZONE_MAP: Record<string, string> = {
  "philippines": "AEST",
  "india": "IST",
  "australia": "AEST",
};

// Shift time mapping based on timezone
const SHIFT_TIME_MAP: Record<string, string> = {
  "AEST": "16:00 - 02:30 (AEST) / 10:30 - 21:00 (IST)",
  "IST": "10:30 - 21:00 (IST) / 16:00 - 02:30 (AEST)",
};

function getShiftTimeDisplay(timeShift: string): string {
  const upperTime = timeShift?.toUpperCase()?.trim();
  if (SHIFT_TIME_MAP[upperTime]) {
    return SHIFT_TIME_MAP[upperTime];
  }
  return timeShift || '-';
}

function getSiteTimezone(site: string): string {
  const siteLower = site?.toLowerCase()?.trim() || '';
  return SITE_TIMEZONE_MAP[siteLower] || 'AEST';
}

// Create acknowledgement record and return token
async function createAcknowledgementRecord(
  supabase: ReturnType<typeof createClient>,
  record: AcknowledgementRecord
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("acknowledgements")
      .insert({
        person_name: record.person_name,
        email: record.email,
        week_start: record.week_start,
        day_of_week: record.day_of_week,
        notification_type: record.notification_type,
        app: record.app,
        team: record.team,
        site: record.site,
        shifts_count: record.shifts_count,
        acknowledged: false,
      })
      .select("token")
      .single();
    
    if (error) {
      console.error(`Failed to create acknowledgement record for ${record.person_name}:`, error.message);
      return null;
    }
    
    return data?.token || null;
  } catch (err) {
    console.error(`Error creating acknowledgement record:`, err);
    return null;
  }
}

// Generate acknowledge button HTML
function generateAcknowledgeButton(token: string): string {
  const acknowledgeUrl = `${SUPABASE_URL}/functions/v1/acknowledge-oncall?token=${token}`;
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center">
          <a href="${acknowledgeUrl}" 
             style="display: inline-block; background: #059669; color: white; text-decoration: none; 
                    padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;
                    box-shadow: 0 2px 4px rgba(5,150,105,0.3);">
            ✅ Acknowledge Receipt
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top: 12px;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            Please click the button above to confirm you have received this notification.
          </p>
        </td>
      </tr>
    </table>
  `;
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

// CC email for Weekly On-Call Summary
const WEEKLY_SUMMARY_CC_EMAIL = "AIOOptusLeads@amdocs.com";

// Send email via Microsoft Graph API
async function sendEmailViaGraph(
  accessToken: string,
  toEmail: string,
  subject: string,
  htmlContent: string,
  ccEmails?: string[]
): Promise<void> {
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${MS_SENDER_EMAIL}/sendMail`;

  const emailPayload: any = {
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

  // Add CC recipients if provided
  if (ccEmails && ccEmails.length > 0) {
    emailPayload.message.ccRecipients = ccEmails.map(email => ({
      emailAddress: {
        address: email,
      },
    }));
  }

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

// Check if a person is on-call for the entire week (Mon-Sun)
function isOnCallForEntireWeek(roster: RosterEntry[], personName: string): boolean {
  const nameLower = personName.toLowerCase().trim();
  const daysToCheck = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  
  for (const day of daysToCheck) {
    let foundForDay = false;
    for (const row of roster) {
      const dayValue = row[day as keyof RosterEntry] as string;
      if (dayValue && dayValue.toLowerCase().trim() === nameLower) {
        foundForDay = true;
        break;
      }
    }
    if (!foundForDay) return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_SENDER_EMAIL) {
      throw new Error("Microsoft Graph API credentials are not set.");
    }
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not set");
    }

    // Parse request parameters
    let targetTimezone: string | null = null;
    let testMode = false;
    let sendManagerSummary = true;
    let testEmail: string | null = null; // Send all emails to this address for testing
    let simulateDay: string | null = null; // Simulate a specific day (mon, tue, wed, thu, fri, sat, sun)
    let onlyManagerSummary = false; // If true, skip individual notifications and only send manager summary
    
    const url = new URL(req.url);
    const urlTestMode = url.searchParams.get("testMode");
    const urlTimezone = url.searchParams.get("timezone");
    const urlSkipManager = url.searchParams.get("skipManagerSummary");
    const urlTestEmail = url.searchParams.get("testEmail");
    const urlSimulateDay = url.searchParams.get("simulateDay");
    const urlOnlyManagerSummary = url.searchParams.get("onlyManagerSummary");
    
    if (urlTestMode === "true" || urlTestMode === "1") testMode = true;
    if (urlTimezone) targetTimezone = urlTimezone;
    if (urlSkipManager === "true" || urlSkipManager === "1") sendManagerSummary = false;
    if (urlTestEmail) testEmail = urlTestEmail;
    if (urlSimulateDay) simulateDay = urlSimulateDay.toLowerCase();
    if (urlOnlyManagerSummary === "true" || urlOnlyManagerSummary === "1") onlyManagerSummary = true;
    
    try {
      const body = await req.json();
      targetTimezone = body.timezone || targetTimezone;
      if (body.testMode === true || body.testMode === "true") testMode = true;
      if (body.skipManagerSummary === true || body.skipManagerSummary === "true") sendManagerSummary = false;
      if (body.testEmail) testEmail = body.testEmail;
      if (body.simulateDay) simulateDay = body.simulateDay.toLowerCase();
      if (body.onlyManagerSummary === true || body.onlyManagerSummary === "true") onlyManagerSummary = true;
    } catch {
      // No body or invalid JSON
    }
    
    const isTestEmailMode = !!testEmail;
    const validDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    if (simulateDay && !validDays.includes(simulateDay)) {
      simulateDay = null; // Invalid day, ignore
    }
    
    console.log(`Mode: ${testMode ? 'TEST (dry run)' : isTestEmailMode ? 'TEST EMAIL' : 'NORMAL'}, Timezone: ${targetTimezone || 'ALL'}, Manager Summary: ${sendManagerSummary ? 'YES' : 'SKIP'}, Individual Notifications: ${onlyManagerSummary ? 'SKIP' : 'YES'}${isTestEmailMode ? `, Test Email: ${testEmail}` : ''}${simulateDay ? `, Simulating: ${simulateDay.toUpperCase()}` : ''}`);

    const accessToken = await getMsGraphToken();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate dates based on timezone
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const now = new Date();
    
    let timezoneOffset: number;
    let timezoneLabel: string;
    
    if (targetTimezone === "IST") {
      timezoneOffset = 5.5 * 60 * 60 * 1000;
      timezoneLabel = "IST (UTC+5:30)";
    } else {
      timezoneOffset = 10 * 60 * 60 * 1000;
      timezoneLabel = "AEST (UTC+10)";
    }
    
    const localTime = new Date(now.getTime() + timezoneOffset);
    const today = localTime;
    // Use simulateDay if provided for testing, otherwise use actual day
    const dayKey = simulateDay || days[today.getUTCDay()];
    const isMonday = dayKey === 'mon';
    
    if (simulateDay) {
      console.log(`⚠️ SIMULATING ${simulateDay.toUpperCase()} (actual day: ${days[today.getUTCDay()]})`);
    }
    
    const todayFormatted = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Calculate week dates
    const currentWeekStart = new Date(today);
    const dayOfWeek = currentWeekStart.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - daysToMonday);
    const weekStartStr = currentWeekStart.toISOString().split('T')[0];
    
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    const weekStartFormatted = currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekEndFormatted = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    console.log(`Fetching roster for week: ${weekStartStr} to ${weekEndStr}`);

    // Fetch roster data
    const { data: roster, error: rosterError } = await supabase
      .from("roster")
      .select("*")
      .eq("week_start", weekStartStr);

    if (rosterError) throw new Error(`Failed to fetch roster: ${rosterError.message}`);

    console.log(`Found ${roster?.length || 0} roster entries`);

    // Fetch staff directory with site
    const { data: staff, error: staffError } = await supabase
      .from("staff_directory")
      .select("*");

    if (staffError) throw new Error(`Failed to fetch staff: ${staffError.message}`);

    // Build staff lookup map
    const staffMap = new Map<string, { email: string; mobile: string; site: string }>();
    (staff as StaffEntry[]).forEach((s) => {
      staffMap.set(s.name.toLowerCase(), { 
        email: s.email, 
        mobile: s.mobile || '',
        site: s.site || 'Philippines'
      });
    });

    // Get today's on-call people, filtered by site/timezone
    // Consolidate multiple shifts for the same person
    interface ShiftInfo {
      app: string;
      team: string;
      time: string;
    }
    interface PersonShifts {
      name: string;
      site: string;
      isWeekly: boolean;
      shifts: ShiftInfo[];
    }
    
    const personShiftsMap = new Map<string, PersonShifts>();
    const notifiedWeeklyNames = new Set<string>(); // Track who got weekly email

    (roster as RosterEntry[]).forEach((row) => {
      const personName = row[dayKey as keyof RosterEntry] as string;
      if (personName && personName.trim()) {
        const nameLower = personName.toLowerCase().trim();
        const staffInfo = staffMap.get(nameLower);
        const site = staffInfo?.site || 'Philippines';
        const personTimezone = getSiteTimezone(site);
        
        // Filter by timezone: only process people whose site matches the cron job timezone
        if (targetTimezone && personTimezone !== targetTimezone) {
          console.log(`Skipping ${personName} (Site: ${site}, TZ: ${personTimezone}) - doesn't match target ${targetTimezone}`);
          return;
        }
        
        // Check if person is on-call for entire week
        const isWeekly = isOnCallForEntireWeek(roster as RosterEntry[], personName);
        
        // If weekly and not Monday, skip (they already got weekly email on Monday)
        if (isWeekly && !isMonday) {
          if (!notifiedWeeklyNames.has(nameLower)) {
            console.log(`Skipping ${personName} - weekly on-call, already notified on Monday`);
            notifiedWeeklyNames.add(nameLower);
          }
          return;
        }
        
        // Add or update person's shifts
        if (personShiftsMap.has(nameLower)) {
          // Add this shift to existing person
          const existing = personShiftsMap.get(nameLower)!;
          existing.shifts.push({
            app: row.app,
            team: row.team,
            time: row.time_shift,
          });
        } else {
          // New person
          personShiftsMap.set(nameLower, {
            name: personName.trim(),
            site: site,
            isWeekly: isWeekly,
            shifts: [{
              app: row.app,
              team: row.team,
              time: row.time_shift,
            }],
          });
        }
      }
    });
    
    // Convert map to array for processing
    const onCallPeople = Array.from(personShiftsMap.values());
    console.log(`Found ${onCallPeople.length} on-call people (with consolidated shifts)`);

    // Send notifications
    const results: NotificationResult[] = [];

    // Skip individual notifications if onlyManagerSummary is true
    if (onlyManagerSummary) {
      console.log('Skipping individual notifications (onlyManagerSummary=true)');
    }

    for (const person of onCallPeople) {
      // Skip individual notifications if only sending manager summary
      if (onlyManagerSummary) {
        continue;
      }
      const staffInfo = staffMap.get(person.name.toLowerCase());
      const primaryShift = person.shifts[0]; // First shift for subject line
      const hasMultipleShifts = person.shifts.length > 1;

      if (!staffInfo) {
        results.push({
          name: person.name,
          email: null,
          success: false,
          error: "Email not found in Staff Directory",
          app: primaryShift.app,
          team: primaryShift.team,
          time: person.shifts.map(s => s.time).join(' | '),
          mobile: '',
          site: person.site,
          isWeekly: person.isWeekly,
        });
        continue;
      }

      const { email, mobile } = staffInfo;

      if (testMode) {
        results.push({
          name: person.name,
          email: email,
          success: true,
          app: person.shifts.map(s => s.app).join(', '),
          team: person.shifts.map(s => s.team).join(', '),
          time: person.shifts.map(s => s.time).join(' | '),
          mobile: mobile,
          site: person.site,
          isWeekly: person.isWeekly,
        });
        console.log(`[TEST MODE] Skipped: ${person.name} (${person.isWeekly ? 'WEEKLY' : 'DAILY'}, ${person.shifts.length} shift(s))`);
        continue;
      }

      try {
        let subject: string;
        let htmlContent: string;

        // Determine actual recipient (use testEmail if provided)
        const actualRecipient = testEmail || email;
        const testEmailPrefix = testEmail ? `[TEST for ${person.name}] ` : '';

        // Create acknowledgement record
        const ackToken = await createAcknowledgementRecord(supabase, {
          person_name: person.name,
          email: email,
          week_start: weekStartStr,
          day_of_week: dayKey,
          notification_type: person.isWeekly ? 'weekly' : 'daily',
          app: person.shifts.map(s => s.app).join(', '),
          team: person.shifts.map(s => s.team).join(', '),
          site: person.site,
          shifts_count: person.shifts.length,
        });

        const acknowledgeButtonHtml = ackToken ? generateAcknowledgeButton(ackToken) : '';

        // Build shift rows for the email table
        const buildShiftRows = (bgColors: string[]) => person.shifts.map((shift, idx) => `
          <tr style="background: ${bgColors[idx % bgColors.length]};">
            <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${hasMultipleShifts ? `Shift ${idx + 1}` : 'Shift'}</td>
            <td style="padding: 14px; border-bottom: 1px solid #e2e8f0;">
              <strong>${shift.app}</strong> - ${shift.team}<br>
              <span style="font-size: 13px; color: #64748b;">${getShiftTimeDisplay(shift.time)}</span>
            </td>
          </tr>
        `).join('');

        if (person.isWeekly) {
          // Weekly email - sent only on Monday
          const appList = [...new Set(person.shifts.map(s => s.app))].join(', ');
          subject = `${testEmailPrefix}On-Call Reminder: You are on duty this week - ${appList}`;
          htmlContent = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #7c3aed; border-radius: 12px 12px 0 0;">
                <tr>
                  <td style="padding: 24px; color: white;">
                    <h2 style="margin: 0; font-size: 24px;">📅 Weekly On-Call Reminder</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${weekStartFormatted} - ${weekEndFormatted}</p>
                    ${hasMultipleShifts ? `<p style="margin: 4px 0 0 0; font-size: 13px; background: rgba(255,255,255,0.2); display: inline-block; padding: 4px 8px; border-radius: 4px;">📋 ${person.shifts.length} Shifts Assigned</p>` : ''}
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 0 0 12px 12px;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="font-size: 16px; color: #334155; margin: 0 0 16px 0;">Hello <strong>${person.name}</strong>,</p>
                    <p style="font-size: 16px; color: #334155; margin: 0 0 24px 0;">This is a reminder that you are scheduled as <strong style="color: #7c3aed;">on-call support for the entire week</strong>.</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                      <tr style="background: #7c3aed;">
                        <th style="padding: 14px; text-align: left; color: white; font-size: 14px; width: 30%;">Details</th>
                        <th style="padding: 14px; text-align: left; color: white; font-size: 14px;">Information</th>
                      </tr>
                      <tr style="background: #f5f3ff;">
                        <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">Period</td>
                        <td style="padding: 14px; border-bottom: 1px solid #e2e8f0; color: #7c3aed; font-weight: 600;">${weekStartFormatted} - ${weekEndFormatted}</td>
                      </tr>
                      ${buildShiftRows(['#ede9fe', '#f5f3ff'])}
                    </table>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f3ff; border-radius: 8px; border-left: 4px solid #7c3aed; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0; color: #5b21b6; font-size: 15px;">
                            📋 Please ensure you are available throughout the week. Thank you for your commitment! 💪
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    ${acknowledgeButtonHtml}
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding-top: 20px;">
                          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
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
        } else {
          // Daily email
          const appList = [...new Set(person.shifts.map(s => s.app))].join(', ');
          subject = `${testEmailPrefix}On-Call Reminder: You are on duty today - ${appList}`;
          htmlContent = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #4f46e5; border-radius: 12px 12px 0 0;">
                <tr>
                  <td style="padding: 24px; color: white;">
                    <h2 style="margin: 0; font-size: 24px;">🔔 On-Call Reminder</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${todayFormatted}</p>
                    ${hasMultipleShifts ? `<p style="margin: 4px 0 0 0; font-size: 13px; background: rgba(255,255,255,0.2); display: inline-block; padding: 4px 8px; border-radius: 4px;">📋 ${person.shifts.length} Shifts Assigned</p>` : ''}
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 0 0 12px 12px;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="font-size: 16px; color: #334155; margin: 0 0 16px 0;">Hello <strong>${person.name}</strong>,</p>
                    <p style="font-size: 16px; color: #334155; margin: 0 0 24px 0;">This is a reminder that you are scheduled as <strong style="color: #4f46e5;">on-call support</strong> today.</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                      <tr style="background: #4f46e5;">
                        <th style="padding: 14px; text-align: left; color: white; font-size: 14px; width: 30%;">Details</th>
                        <th style="padding: 14px; text-align: left; color: white; font-size: 14px;">Information</th>
                      </tr>
                      ${buildShiftRows(['#f0fdf4', '#dcfce7'])}
                    </table>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border-radius: 8px; border-left: 4px solid #059669; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px;">
                          <p style="margin: 0; color: #166534; font-size: 15px;">
                            📋 Please ensure you are available during your shift${hasMultipleShifts ? 's' : ''}. Have a great day! 💪
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    ${acknowledgeButtonHtml}
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding-top: 20px;">
                          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
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
        }

        await sendEmailViaGraph(accessToken, actualRecipient, subject, htmlContent);

        results.push({
          name: person.name,
          email: email,
          sentTo: actualRecipient,
          success: true,
          app: person.shifts.map(s => s.app).join(', '),
          team: person.shifts.map(s => s.team).join(', '),
          time: person.shifts.map(s => s.time).join(' | '),
          mobile: mobile,
          site: person.site,
          isWeekly: person.isWeekly,
          acknowledgementToken: ackToken || undefined,
        });
      } catch (emailError) {
        results.push({
          name: person.name,
          email: email,
          success: false,
          error: emailError instanceof Error ? emailError.message : "Unknown error",
          app: person.shifts.map(s => s.app).join(', '),
          team: person.shifts.map(s => s.team).join(', '),
          time: person.shifts.map(s => s.time).join(' | '),
          mobile: mobile,
          site: person.site,
          isWeekly: person.isWeekly,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    // ==================== MANAGER SUMMARY EMAIL (Monday only) ====================
    // Manager Summary includes ALL on-call people from ALL sites (not filtered by timezone)
    const managerResults: { name: string; email: string; sentTo?: string; success: boolean; error?: string }[] = [];

    if (sendManagerSummary && isMonday) {
      const { data: managers, error: managersError } = await supabase
        .from("managers")
        .select("*")
        .eq("active", true);
      
      // Fetch MOD schedule for the week
      const { data: modSchedule, error: modError } = await supabase
        .from("mod_schedule")
        .select("*")
        .gte("date", weekStartStr)
        .lte("date", weekEndStr)
        .order("date", { ascending: true });
      
      if (modError) {
        console.error("Error fetching MOD schedule:", modError.message);
      } else {
        console.log(`Found ${modSchedule?.length || 0} MOD schedule entries for this week`);
      }
      
      const modScheduleHtml = generateModScheduleHtml((modSchedule as ModScheduleEntry[]) || []);

      if (!managersError && managers && managers.length > 0) {
        console.log(`Sending weekly summary to ${managers.length} managers`);

        // Define application/team order (same as On-Call Roster)
        const APP_TEAM_ORDER = [
          { app: 'Frontend', team: 'ASOM' },
          { app: 'Frontend', team: 'OMS' },
          { app: 'Frontend', team: 'CRM/SDP/MCO/WSF' },
          { app: 'Digital', team: 'Digital' },
          { app: 'Infra', team: 'Infra' },
          { app: 'Backend', team: 'INV/AMDD' },
          { app: 'Backend', team: 'CM/AR/CL' },
          { app: 'Backend', team: 'TC/AEM/OFCA' },
          { app: 'Backend', team: 'ANM' },
          { app: 'ODS', team: 'ODS' },
          { app: 'ODS', team: 'ODS Infra' },
        ];

        // Build complete list of ALL on-call people for the ENTIRE WEEK
        // Group by App/Team for ordering
        interface ManagerShiftInfo {
          app: string;
          team: string;
          time: string;
        }
        interface ManagerPersonShifts {
          name: string;
          site: string;
          email: string;
          mobile: string;
          isWeekly: boolean;
          shifts: ManagerShiftInfo[];
          onCallDays: string[];
          app: string;
          team: string;
        }
        
        const allPersonShiftsMap = new Map<string, ManagerPersonShifts>();
        const weekDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const dayLabels: Record<string, string> = {
          'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed', 'thu': 'Thu', 
          'fri': 'Fri', 'sat': 'Sat', 'sun': 'Sun'
        };

        // Track which app/team combinations have support
        const appTeamWithSupport = new Set<string>();

        // Process ALL days of the week for the manager summary
        (roster as RosterEntry[]).forEach((row) => {
          weekDays.forEach((day) => {
            const personName = row[day as keyof RosterEntry] as string;
            if (personName && personName.trim()) {
              const nameLower = personName.toLowerCase().trim();
              const staffInfo = staffMap.get(nameLower);
              const site = staffInfo?.site || 'Philippines';
              const isWeekly = isOnCallForEntireWeek(roster as RosterEntry[], personName);
              
              // Track this app/team has support
              appTeamWithSupport.add(`${row.app}|${row.team}`);
              
              // Create unique key per person per app/team
              const personAppTeamKey = `${nameLower}|${row.app}|${row.team}`;
              
              if (allPersonShiftsMap.has(personAppTeamKey)) {
                const existing = allPersonShiftsMap.get(personAppTeamKey)!;
                // Add day if not already added
                if (!existing.onCallDays.includes(dayLabels[day])) {
                  existing.onCallDays.push(dayLabels[day]);
                }
                // Add shift if unique (time combo)
                const shiftKey = row.time_shift;
                const existingShiftKeys = existing.shifts.map(s => s.time);
                if (!existingShiftKeys.includes(shiftKey)) {
                  existing.shifts.push({
                    app: row.app,
                    team: row.team,
                    time: row.time_shift,
                  });
                }
              } else {
                // New person for this app/team
                allPersonShiftsMap.set(personAppTeamKey, {
                  name: personName.trim(),
                  site: site,
                  email: staffInfo?.email || '',
                  mobile: staffInfo?.mobile || '',
                  isWeekly: isWeekly,
                  app: row.app,
                  team: row.team,
                  shifts: [{
                    app: row.app,
                    team: row.team,
                    time: row.time_shift,
                  }],
                  onCallDays: [dayLabels[day]],
                });
              }
            }
          });
        });
        
        // Convert to array and sort by App/Team order
        const allOnCallPeople = Array.from(allPersonShiftsMap.values());
        
        // Sort by application/team order
        allOnCallPeople.sort((a, b) => {
          const aIndex = APP_TEAM_ORDER.findIndex(o => o.app === a.app && o.team === a.team);
          const bIndex = APP_TEAM_ORDER.findIndex(o => o.app === b.app && o.team === b.team);
          const aOrder = aIndex === -1 ? 999 : aIndex;
          const bOrder = bIndex === -1 ? 999 : bIndex;
          if (aOrder !== bOrder) return aOrder - bOrder;
          // Same app/team, sort by name
          return a.name.localeCompare(b.name);
        });
        
        console.log(`Manager summary includes ${allOnCallPeople.length} on-call entries from all sites (grouped by App/Team)`);

        // Find app/team combinations with NO support planned
        const noSupportPlanned = APP_TEAM_ORDER.filter(at => !appTeamWithSupport.has(`${at.app}|${at.team}`));
        console.log(`App/Teams with no support: ${noSupportPlanned.length}`);

        // Generate "No Support Planned" HTML section
        const noSupportHtml = noSupportPlanned.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
            <tr>
              <td>
                <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border-radius: 8px;">
                  <tr>
                    <td style="padding: 16px 20px;">
                      <h3 style="color: white; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">
                        ⚠️ Applications with No Planned Support This Week
                      </h3>
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 6px;">
                        <tr style="background: #fef2f2;">
                          <th style="padding: 10px 14px; text-align: left; color: #991b1b; font-size: 13px; font-weight: 600; border-bottom: 2px solid #fecaca;">Application</th>
                          <th style="padding: 10px 14px; text-align: left; color: #991b1b; font-size: 13px; font-weight: 600; border-bottom: 2px solid #fecaca;">Team</th>
                          <th style="padding: 10px 14px; text-align: left; color: #991b1b; font-size: 13px; font-weight: 600; border-bottom: 2px solid #fecaca;">Status</th>
                        </tr>
                        ${noSupportPlanned.map((at, idx) => `
                          <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#fef2f2'};">
                            <td style="padding: 10px 14px; border-bottom: 1px solid #fecaca; font-size: 14px; font-weight: 600; color: #1e293b;">${at.app}</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #fecaca; font-size: 14px; color: #475569;">${at.team}</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #fecaca;">
                              <span style="display: inline-block; background: #dc2626; color: white; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">No Support Assigned</span>
                            </td>
                          </tr>
                        `).join('')}
                      </table>
                      <p style="color: #fecaca; font-size: 12px; margin: 12px 0 0 0;">
                        Please ensure on-call support is assigned for these applications.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        ` : '';

        // Application color mapping for visual grouping
        const appColors: Record<string, string> = {
          'Frontend': '#3b82f6',
          'Digital': '#8b5cf6',
          'Infra': '#f59e0b',
          'Backend': '#10b981',
          'ODS': '#ec4899',
          'B2B': '#6366f1',
        };

        const rosterTableRows = allOnCallPeople.map((r, index) => {
          const hasMultipleShifts = r.shifts.length > 1;
          const timeDisplay = r.shifts.map(s => getShiftTimeDisplay(s.time)).join('<br>');
          const appColor = appColors[r.app] || '#64748b';
          
          // Format days display
          const daysDisplay = r.isWeekly 
            ? '<span style="display: inline-block; background: #7c3aed; color: white; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;">Mon-Sun</span>'
            : `<span style="font-size: 14px; color: #334155;">${r.onCallDays.join(', ')}</span>`;
          
          return `
          <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
              <span style="display: inline-block; background: ${appColor}; color: white; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${r.app}</span>
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #475569; font-weight: 500;">${r.team}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #1e293b;">
              ${r.name}
              ${hasMultipleShifts ? `<br><span style="display: inline-block; margin-top: 3px; font-size: 11px; font-weight: 600; background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px;">${r.shifts.length} shifts</span>` : ''}
            </td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; line-height: 1.5;">${timeDisplay || '-'}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${daysDisplay}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px;"><a href="mailto:${r.email}" style="color: #0369a1; text-decoration: none;">${r.email || 'N/A'}</a></td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155;">${r.mobile || '-'}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155;">${r.site || '-'}</td>
          </tr>
        `}).join('');
        
        // Use testEmail for managers if provided, otherwise send to actual managers
        const managerEmails = testEmail 
          ? [{ emailAddress: { address: testEmail } }]
          : (managers as Manager[]).map(m => ({ emailAddress: { address: m.email } }));

        // Count by site for summary stats
        const philippinesCount = allOnCallPeople.filter(p => p.site?.toLowerCase() === 'philippines').length;
        const indiaCount = allOnCallPeople.filter(p => p.site?.toLowerCase() === 'india').length;
        const australiaCount = allOnCallPeople.filter(p => p.site?.toLowerCase() === 'australia').length;

        const managerTestPrefix = testEmail ? `[TEST] ` : '';
        const managerSubject = `${managerTestPrefix}📋 Weekly On-Call Summary - ${weekStartFormatted} to ${weekEndFormatted}`;
        const managerHtmlContent = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 950px; margin: 0 auto; background: #f8fafc; padding: 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #059669; border-radius: 12px 12px 0 0;">
              <tr>
                <td style="padding: 24px; color: white;">
                  <h2 style="margin: 0; font-size: 22px; font-weight: 600;">📋 Weekly On-Call Summary</h2>
                  <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${weekStartFormatted} - ${weekEndFormatted}</p>
                  <p style="margin: 8px 0 0 0; font-size: 13px;"><a href="https://ruthabea.github.io/mod-roster-app/" style="color: #fef3c7; text-decoration: underline;">📌 OPTUS/ON-Call Roster</a></p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="0" cellspacing="0" style="background: white; border-radius: 0 0 12px 12px;">
              <tr>
                <td style="padding: 24px;">
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                    <tr>
                      <td width="25%" style="padding: 0 4px 0 0;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: #4f46e5; border-radius: 8px;">
                          <tr>
                            <td style="padding: 18px 12px; text-align: center; color: white;">
                              <div style="font-size: 32px; font-weight: 700;">${allOnCallPeople.length}</div>
                              <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Total On-Call</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="25%" style="padding: 0 4px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: #059669; border-radius: 8px;">
                          <tr>
                            <td style="padding: 18px 12px; text-align: center; color: white;">
                              <div style="font-size: 32px; font-weight: 700;">${philippinesCount}</div>
                              <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Philippines</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="25%" style="padding: 0 4px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: #ea580c; border-radius: 8px;">
                          <tr>
                            <td style="padding: 18px 12px; text-align: center; color: white;">
                              <div style="font-size: 32px; font-weight: 700;">${indiaCount}</div>
                              <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">India</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="25%" style="padding: 0 0 0 4px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: #2563eb; border-radius: 8px;">
                          <tr>
                            <td style="padding: 18px 12px; text-align: center; color: white;">
                              <div style="font-size: 32px; font-weight: 700;">${australiaCount}</div>
                              <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Australia</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <h3 style="color: #1e293b; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Weekly On-Call Roster</h3>
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0;">
                    <tr style="background: #059669;">
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Application</th>
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Team</th>
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Name</th>
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Shift</th>
                      <th style="padding: 12px 10px; text-align: center; color: white; font-size: 13px; font-weight: 600;">Day</th>
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Email</th>
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Mobile</th>
                      <th style="padding: 12px 10px; text-align: left; color: white; font-size: 13px; font-weight: 600;">Site</th>
                    </tr>
                    ${rosterTableRows}
                  </table>
                  
                  ${noSupportHtml}
                  
                  ${modScheduleHtml}
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; border-top: 1px solid #e2e8f0;">
                    <tr>
                      <td style="padding-top: 20px;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                          This is an automated summary from the MOD & On-Call Roster Portal.<br>
                          Week: ${weekStartStr} to ${weekEndStr} | Sent from: ${MS_SENDER_EMAIL}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        `;

        try {
          const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${MS_SENDER_EMAIL}/sendMail`;
          
          const emailPayload = {
            message: {
              subject: managerSubject,
              body: { contentType: "HTML", content: managerHtmlContent },
              toRecipients: managerEmails,
              // Skip CC when in test mode
              ...(testEmail ? {} : { ccRecipients: [
                { emailAddress: { address: "OPTUSL2@amdocs.com" } },
                { emailAddress: { address: "AIOOptusL2@amdocs.com" } },
                { emailAddress: { address: "AIOOptusLeads@amdocs.com" } }
              ] }),
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
            throw new Error(`Failed to send manager email: ${errorData}`);
          }

          for (const manager of managers as Manager[]) {
            managerResults.push({ name: manager.name, email: manager.email, sentTo: testEmail || manager.email, success: true });
          }
          console.log(`Summary sent to ${testEmail ? testEmail + ' (test mode)' : managers.length + ' managers'} - includes ${allOnCallPeople.length} on-call people from all sites`);
        } catch (managerEmailError) {
          for (const manager of managers as Manager[]) {
            managerResults.push({
              name: manager.name,
              email: manager.email,
              sentTo: testEmail || manager.email,
              success: false,
              error: managerEmailError instanceof Error ? managerEmailError.message : "Unknown error",
            });
          }
        }
      }
    } else if (sendManagerSummary && !isMonday) {
      console.log("Manager summary skipped - only sent on Mondays");
    } else {
      console.log("Manager summary skipped (skipManagerSummary=true)");
    }

    return new Response(
      JSON.stringify({
        success: true,
        testMode,
        testEmail: testEmail || null,
        simulateDay: simulateDay || null,
        summary: {
          total: results.length,
          sent: testMode ? 0 : successCount,
          failed: testMode ? 0 : errorCount,
          date: today.toISOString(),
          day: dayKey,
          actualDay: days[today.getUTCDay()],
          isMonday,
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          timezone: timezoneLabel,
          targetFilter: targetTimezone || "ALL",
          sender: MS_SENDER_EMAIL,
          managersSent: managerResults.filter(r => r.success).length,
          managersTotal: managerResults.length,
          testEmailMode: isTestEmailMode,
          simulatedDay: simulateDay ? true : false,
        },
        results,
        managerResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
