// notify-signup — emails Damo when a new user signs up.
//
// Called from the client after creating an inactive subscription record.
// Uses JWT auth (the user just signed up, so they have a valid token).
// Sends via Gmail SMTP using the same credentials as send-remap-email.

import { createClient } from "jsr:@supabase/supabase-js@2"
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

const ALLOWED_ORIGINS = new Set([
  "https://app.dctuning.ie",
  "https://www.dctuning.ie",
  "https://dctuning.ie",
  "http://localhost:5173",
  "http://localhost:5174",
])

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://app.dctuning.ie"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

const NOTIFY_EMAIL = "dctunings@gmail.com"
const FROM_NAME = "DCTuning Ireland"

async function sendViaGmail(to: string, subject: string, html: string): Promise<void> {
  const gmailUser = Deno.env.get("GMAIL_USER") || NOTIFY_EMAIL
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")
  if (!gmailPass) {
    console.warn("GMAIL_APP_PASSWORD not set — skipping signup notification email")
    return
  }

  const client = new SmtpClient()
  await client.connectTLS({
    hostname: "smtp.gmail.com",
    port: 465,
    username: gmailUser,
    password: gmailPass,
  })

  await client.send({
    from: `${FROM_NAME} <${gmailUser}>`,
    to: [to],
    subject,
    content: "Please view this email in an HTML-capable email client.",
    html,
  })

  await client.close()
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get("authorization") || ""
    const jwt = authHeader.replace(/^Bearer\s+/i, "")
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Build the notification email
    const signupTime = new Date().toLocaleString("en-IE", { timeZone: "Europe/Dublin" })
    const userEmail = user.email || "unknown"
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || "—"
    const provider = user.app_metadata?.provider || "email"

    const subject = `🆕 New signup: ${userEmail}`
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  body{background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;margin:0;padding:0}
  .wrap{max-width:520px;margin:0 auto;padding:32px 20px}
  .logo{font-size:22px;font-weight:900;margin-bottom:24px}.logo span{color:#b8f02a}
  .badge{display:inline-block;background:rgba(0,174,200,.12);border:1px solid rgba(0,174,200,.3);color:#00aec8;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px}
  .card{background:#111;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:24px;margin-bottom:16px}
  .h1{font-size:20px;font-weight:800;margin-bottom:6px}
  .sub{font-size:13px;color:rgba(255,255,255,.45);margin-bottom:16px}
  .kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:14px}
  .kv:last-child{border-bottom:none}
  .kv-l{color:rgba(255,255,255,.4)}.kv-r{color:#fff;font-weight:600}
  .lime{color:#b8f02a}
  .footer{font-size:11px;color:rgba(255,255,255,.2);text-align:center;margin-top:20px}
</style></head>
<body><div class="wrap">
  <div class="logo">DC<span>Tuning</span> Ireland</div>
  <div class="badge">New Signup</div>
  <div class="card">
    <div class="h1">New user signed up! 🎉</div>
    <div class="sub">A new account has been created.</div>
    <div class="kv"><span class="kv-l">Email</span><span class="kv-r">${userEmail}</span></div>
    <div class="kv"><span class="kv-l">Name</span><span class="kv-r">${userName}</span></div>
    <div class="kv"><span class="kv-l">Provider</span><span class="kv-r">${provider}</span></div>
    <div class="kv"><span class="kv-l">Time</span><span class="kv-r">${signupTime}</span></div>
    <div class="kv"><span class="kv-l">Status</span><span class="kv-r lime">Awaiting subscription</span></div>
  </div>
  <div class="footer">DCTuning Ireland · Automated signup notification</div>
</div></body></html>`

    await sendViaGmail(NOTIFY_EMAIL, subject, html)
    console.log(`Signup notification sent for ${userEmail}`)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("notify-signup error:", message)
    // Don't fail the signup flow — notification is best-effort
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 200, // Return 200 even on error so the client doesn't retry
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
