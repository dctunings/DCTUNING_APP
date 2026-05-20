import Stripe from "npm:stripe@12"
import { createClient } from "npm:@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" })
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

// Stripe price IDs by plan_id. Server-side only — clients can't substitute.
const PRICE_MAP: Record<string, string> = {
  starter: "price_1TWOazRG1RgGIqld1RyKh7Pd",
  pro: "price_1TWOazRG1RgGIqldjz2KzfoI",
  enterprise: "price_1TWOazRG1RgGIqld1qjLEsnc",
}

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
    // Verify caller is authenticated. Resolve userId from the JWT, not the
    // request body — the client doesn't get to pick whose subscription this is.
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

    const body = await req.json()
    const planId = body.planId || body.plan_id

    if (!planId) {
      return new Response(JSON.stringify({ error: "Missing planId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }
    const priceId = PRICE_MAP[planId]
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Unknown plan: ${planId}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        user_id: user.id,
        plan_id: planId,
        subscription_type: "seller",
      },
      success_url: body.successUrl || `${origin || "https://app.dctuning.ie"}?subscribed=seller`,
      cancel_url: body.cancelUrl || `${origin || "https://app.dctuning.ie"}?page=pricing`,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("create-seller-checkout-session error", err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
