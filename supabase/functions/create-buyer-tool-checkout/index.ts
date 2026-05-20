import Stripe from "npm:stripe@12"
import { createClient } from "npm:@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

// €34.99/month buyer-tool subscription Stripe price ID (server-side only)
const BUYER_TOOL_PRICE_ID = "price_1TWOayRG1RgGIqldzt6opVUx"

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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  try {
    // Authenticate via JWT — userId comes from the verified token, not the body.
    const authHeader = req.headers.get("authorization") || ""
    const jwt = authHeader.replace(/^Bearer\s+/i, "")
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt)
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer_email: user.email ?? undefined,
      mode: "subscription",
      line_items: [{ price: BUYER_TOOL_PRICE_ID, quantity: 1 }],
      metadata: {
        user_id: user.id,
        subscription_type: "buyer_tools",
      },
      success_url: `${origin || "https://app.dctuning.ie"}?subscribed=buyer`,
      cancel_url: `${origin || "https://app.dctuning.ie"}?page=pricing`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("create-buyer-tool-checkout error", err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
