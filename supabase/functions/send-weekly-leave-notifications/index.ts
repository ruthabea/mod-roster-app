import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MS_TENANT_ID = Deno.env.get('MS_TENANT_ID')!
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET')!
const MS_SENDER_EMAIL = Deno.env.get('MS_SENDER_EMAIL')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VacationRequest {
  id: number
  employee_name: string
  email: string
  site: string | null
  team: string | null
  approver_name: string | null
  manager_email: string
  start_date: string
  end_date: string
  request_type: string
  reason: string | null
  status: string
}

// Get manager name from email
function getManagerNameFromEmail(email: string): string {
  const localPart = email.toLowerCase().split('@')[0]
  const nameParts = localPart.split(/[._-]/)
  return nameParts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// Get Microsoft Graph API access token
async function getMsGraphToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get MS Graph token: ${await response.text()}`)
  }

  const data = await response.json()
  return data.access_token
}

// Send email via Microsoft Graph API (multiple recipients)
async function sendEmailViaGraph(
  accessToken: string,
  toEmails: string[],
  subject: string,
  htmlContent: string
): Promise<void> {
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${MS_SENDER_EMAIL}/sendMail`

  const toRecipients = toEmails.map(email => ({
    emailAddress: { address: email.trim() }
  }))

  const emailPayload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: htmlContent },
      toRecipients,
    },
    saveToSentItems: true,
  }

  const response = await fetch(sendMailUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  })

  if (!response.ok) {
    throw new Error(`Failed to send email: ${await response.text()}`)
  }
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  })
}

// Get week date range string
function getWeekDateRange(startOfWeek: Date, endOfWeek: Date): string {
  const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const start = startOfWeek.toLocaleDateString('en-US', formatOptions)
  const end = endOfWeek.toLocaleDateString('en-US', { ...formatOptions, year: 'numeric' })
  return `${start} - ${end}`
}

// Calculate working days
function calculateWorkingDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  let count = 0
  const current = new Date(start)
  
  while (current <= end) {
    const dayOfWeek = current.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return count
}

// Generate "no leaves" email HTML
function generateNoLeavesEmail(managerNames: string, teams: string[], weekRange: string): string {
  const teamList = teams.join(', ')
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                📅 Weekly Planned Leave Summary
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Week of ${weekRange}
              </p>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">
                Teams: ${teamList}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${managerNames},
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #e8f5e9; border-radius: 8px; border: 1px solid #c8e6c9; margin: 0;">
                <tr>
                  <td style="padding: 25px; text-align: center;">
                    <p style="margin: 0; font-size: 36px;">✅</p>
                    <p style="margin: 15px 0 0 0; color: #2e7d32; font-size: 18px; font-weight: 600;">
                      No scheduled vacation for the week.
                    </p>
                    <p style="margin: 8px 0 0 0; color: #555555; font-size: 14px;">
                      All team members are available this week.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                This is an automated notification from the MOD Roster Application.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

// Generate weekly leave summary email HTML (grouped by team)
function generateWeeklyLeaveEmail(
  managerNames: string,
  teams: string[],
  weekRange: string,
  leavesByTeam: Map<string, VacationRequest[]>
): string {
  const teamList = teams.join(', ')
  
  // Generate tables for each team
  let teamSections = ''
  let totalLeaves = 0
  
  for (const team of teams) {
    const leaves = leavesByTeam.get(team) || []
    if (leaves.length === 0) continue
    
    totalLeaves += leaves.length
    
    const leaveRows = leaves.map(leave => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #333333; font-size: 14px;">
          ${leave.employee_name}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #333333; font-size: 14px;">
          ${leave.request_type}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #333333; font-size: 14px;">
          ${formatDate(leave.start_date)}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #333333; font-size: 14px;">
          ${formatDate(leave.end_date)}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #333333; font-size: 14px; text-align: center;">
          ${calculateWorkingDays(leave.start_date, leave.end_date)}
        </td>
      </tr>
    `).join('')
    
    teamSections += `
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 12px 0; color: #1976D2; font-size: 16px; font-weight: 600; border-bottom: 2px solid #1976D2; padding-bottom: 8px;">
          📁 ${team} (${leaves.length} leave${leaves.length > 1 ? 's' : ''})
        </h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333333; border-bottom: 2px solid #e0e0e0; font-size: 13px;">Employee</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333333; border-bottom: 2px solid #e0e0e0; font-size: 13px;">Type</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333333; border-bottom: 2px solid #e0e0e0; font-size: 13px;">From</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333333; border-bottom: 2px solid #e0e0e0; font-size: 13px;">To</th>
              <th style="padding: 10px 12px; text-align: center; font-weight: 600; color: #333333; border-bottom: 2px solid #e0e0e0; font-size: 13px;">Days</th>
            </tr>
          </thead>
          <tbody>
            ${leaveRows}
          </tbody>
        </table>
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="650" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); padding: 30px 40px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                📅 Weekly Planned Leave Summary
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Week of ${weekRange}
              </p>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">
                Teams: ${teamList}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hi ${managerNames},
              </p>
              <p style="margin: 0 0 25px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                Here's a summary of the approved leaves for your team members this week:
              </p>
              
              ${teamSections}
              
              <p style="margin: 25px 0 0 0; color: #777777; font-size: 13px; line-height: 1.5; background: #f8f9fa; padding: 12px 15px; border-radius: 6px;">
                <strong>Total: ${totalLeaves}</strong> team member(s) on leave this week across ${teams.length} team(s).
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                This is an automated notification from the MOD Roster Application.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let testEmail: string | null = null
    try {
      const body = await req.json()
      testEmail = body.testEmail || null
    } catch {
      // No body
    }
    
    console.log('Starting weekly leave notification job (Approach C+: Combine teams with same managers)...')
    if (testEmail) {
      console.log(`TEST MODE: All emails will be sent to ${testEmail}`)
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Calculate current week (Monday to Sunday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() + diffToMonday)
    startOfWeek.setHours(0, 0, 0, 0)
    
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)
    
    const startDateStr = startOfWeek.toISOString().split('T')[0]
    const endDateStr = endOfWeek.toISOString().split('T')[0]
    
    console.log(`Fetching approved leaves for week: ${startDateStr} to ${endDateStr}`)
    
    // Fetch approved vacation requests that overlap with current week
    const { data: leaves, error: leavesError } = await supabase
      .from('vacation_requests')
      .select('*')
      .eq('status', 'approved')
      .lte('start_date', endDateStr)
      .gte('end_date', startDateStr)
      .order('start_date', { ascending: true })
    
    if (leavesError) {
      throw new Error(`Failed to fetch leaves: ${leavesError.message}`)
    }
    
    // Fetch ALL vacation requests to build team -> managers mapping
    const { data: allRequests, error: requestsError } = await supabase
      .from('vacation_requests')
      .select('team, manager_email, approver_name')
    
    if (requestsError) {
      throw new Error(`Failed to fetch vacation requests: ${requestsError.message}`)
    }
    
    // Step 1: Build team -> unique manager emails mapping
    const teamManagersMap = new Map<string, Set<string>>() // team -> Set of manager emails
    const managerNames = new Map<string, string>() // email -> name
    
    for (const req of allRequests || []) {
      if (!req.team || !req.manager_email) continue
      
      if (!teamManagersMap.has(req.team)) {
        teamManagersMap.set(req.team, new Set())
      }
      
      // Extract individual emails from manager_email
      const emails = req.manager_email.split(';').map(e => e.trim().toLowerCase()).filter(e => e.length > 0)
      const names = (req.approver_name || '').split(',').map(n => n.trim())
      
      emails.forEach((email, idx) => {
        teamManagersMap.get(req.team)!.add(email)
        if (!managerNames.has(email)) {
          managerNames.set(email, names[idx] || getManagerNameFromEmail(email))
        }
      })
    }
    
    console.log(`Found ${teamManagersMap.size} teams`)
    
    // Step 2: Group teams by their manager set (normalized key)
    const managerGroupToTeams = new Map<string, string[]>() // managerKey -> [teams]
    const managerGroupToEmails = new Map<string, string[]>() // managerKey -> [emails]
    
    for (const [team, managers] of teamManagersMap) {
      const sortedEmails = Array.from(managers).sort()
      const managerKey = sortedEmails.join(';')
      
      if (!managerGroupToTeams.has(managerKey)) {
        managerGroupToTeams.set(managerKey, [])
        managerGroupToEmails.set(managerKey, sortedEmails)
      }
      managerGroupToTeams.get(managerKey)!.push(team)
    }
    
    console.log(`Grouped into ${managerGroupToTeams.size} unique manager groups`)
    
    // Step 3: Organize this week's leaves by team
    const leavesByTeam = new Map<string, VacationRequest[]>()
    for (const leave of leaves || []) {
      const team = leave.team || 'Unknown'
      if (!leavesByTeam.has(team)) {
        leavesByTeam.set(team, [])
      }
      leavesByTeam.get(team)!.push(leave)
    }
    
    const accessToken = await getMsGraphToken()
    const weekRange = getWeekDateRange(startOfWeek, endOfWeek)
    
    let emailsSent = 0
    let noLeavesEmailsSent = 0
    const errors: string[] = []
    const emailResults: { teams: string[], managers: string[], leavesCount: number, sent: boolean }[] = []
    
    // Step 4: Send ONE email per manager group
    for (const [managerKey, teams] of managerGroupToTeams) {
      const managerEmails = managerGroupToEmails.get(managerKey) || []
      const managerNamesList = managerEmails.map(e => managerNames.get(e) || getManagerNameFromEmail(e))
      const managerNamesStr = managerNamesList.join(', ')
      
      // Count total leaves for these teams
      let totalLeavesForGroup = 0
      for (const team of teams) {
        totalLeavesForGroup += (leavesByTeam.get(team) || []).length
      }
      
      // Build team list for subject
      const teamListForSubject = teams.join(', ')
      
      try {
        const recipients = testEmail ? [testEmail] : managerEmails
        const originalRecipients = managerEmails.join(', ')
        
        if (totalLeavesForGroup > 0) {
          // Has leaves - send leave summary
          const subject = testEmail 
            ? `[TEST] 📅 Weekly Planned Leave Summary [${teamListForSubject}] - ${weekRange} (For: ${originalRecipients})`
            : `📅 Weekly Planned Leave Summary [${teamListForSubject}] - ${weekRange}`
          
          const htmlContent = generateWeeklyLeaveEmail(managerNamesStr, teams, weekRange, leavesByTeam)
          
          await sendEmailViaGraph(accessToken, recipients, subject, htmlContent)
          console.log(`Leave summary sent to ${recipients.join(', ')} for teams: ${teamListForSubject} (${totalLeavesForGroup} leaves)`)
          emailsSent++
          emailResults.push({ teams, managers: managerEmails, leavesCount: totalLeavesForGroup, sent: true })
        } else {
          // No leaves - send "no scheduled vacation" email
          const subject = testEmail 
            ? `[TEST] 📅 Weekly Planned Leave Summary [${teamListForSubject}] - ${weekRange} (For: ${originalRecipients})`
            : `📅 Weekly Planned Leave Summary [${teamListForSubject}] - ${weekRange}`
          
          const htmlContent = generateNoLeavesEmail(managerNamesStr, teams, weekRange)
          
          await sendEmailViaGraph(accessToken, recipients, subject, htmlContent)
          console.log(`"No leaves" email sent to ${recipients.join(', ')} for teams: ${teamListForSubject}`)
          noLeavesEmailsSent++
          emailResults.push({ teams, managers: managerEmails, leavesCount: 0, sent: true })
        }
        
        // In test mode, send all groups to see the full picture
        if (testEmail && (emailsSent + noLeavesEmailsSent) >= 5) {
          console.log('Test mode: Stopping after 5 emails')
          break
        }
      } catch (emailError) {
        const errorMsg = `Failed to send to ${managerEmails.join(', ')}: ${emailError.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
        emailResults.push({ teams, managers: managerEmails, leavesCount: totalLeavesForGroup, sent: false })
      }
    }
    
    const result = {
      success: true,
      approach: 'C+ - Combine teams with same managers',
      testMode: !!testEmail,
      testEmail: testEmail || undefined,
      weekRange,
      totalLeaves: leaves?.length || 0,
      totalTeams: teamManagersMap.size,
      totalManagerGroups: managerGroupToTeams.size,
      leaveSummariesSent: emailsSent,
      noLeavesEmailsSent: noLeavesEmailsSent,
      emailResults: emailResults,
      errors: errors.length > 0 ? errors : undefined
    }
    
    console.log('Weekly leave notification job completed:', result)
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Error in weekly leave notification:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
