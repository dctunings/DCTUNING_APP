// create-tune-checkout — server-side authoritative checkout for one-off
// tune purchases.
//
// Damo audit fix Apr 28 2026: previous version trusted client-supplied
// price/fee values verbatim. Client could pass priceEur: 0.01 and buy any
// tune for one cent. Now we ignore client-side amounts and re-fetch the
// listing + seller plan from the DB to compute everything server-side.

import Stripe from "npm:stripe@12.0.0"
import { createClient } from "jsr:@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
})

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

// Platform fee % by plan. Mirrors the values in
// seller_subscription_plans.platform_fee_percent.
const PLATFORM_FEE_BY_PLAN: Record<string, number> = {
  starter: 0.20,
  pro: 0.12,
  enterprise: 0.08,
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  try {
    // Verify the caller is an authenticated user. We read the JWT directly
    // because the create-checkout flow is invoked from a logged-in client.
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

    const body = await req.json()
    const listingId = body.listingId
    if (!listingId) {
      return new Response(JSON.stringify({ error: "Missing listingId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Re-fetch listing — DO NOT trust client-supplied price or seller.
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("tune_listings")
      .select("id, title, price_eur, seller_id, status, is_free")
      .eq("id", listingId)
      .single()

    if (listingError || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }
    if (listing.status !== "active") {
      return new Response(JSON.stringify({ error: "Listing not available" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }
    if (listing.is_free || listing.price_eur <= 0) {
      return new Response(JSON.stringify({ error: "This tune is free — no checkout needed" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    const buyerId = user.id
    const buyerEmail = user.email
    if (buyerId === listing.seller_id) {
      return new Response(JSON.stringify({ error: "Sellers cannot buy their own listings" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Look up the seller's plan to determine platform fee %.
    const { data: sellerSub } = await supabaseAdmin
      .from("seller_subscriptions")
      .select("plan_id, status")
      .eq("user_id", listing.seller_id)
      .eq("status", "active")
      .maybeSingle()
    const planId = sellerSub?.plan_id || "starter"
    const feePercent = PLATFORM_FEE_BY_PLAN[planId] ?? 0.20

    // Authoritative pricing — derived from the DB.
    const priceEur = Number(listing.price_eur)
    const platformFee = Math.round(priceEur * feePercent * 100) / 100
    const sellerEarnings = Math.round((priceEur - platformFee) * 100) / 100

    // Re-use buyer's existing Stripe customer if we have one (from prior
    // subscription or purchase). Saves them re-entering card details.
    let buyerCustomerId: string | null = null
    const { data: existingBuyer } = await supabaseAdmin
      .from("buyer_tool_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", buyerId)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle()
    if (existingBuyer?.stripe_customer_id) {
      buyerCustomerId = existingBuyer.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: buyerEmail ?? undefined,
        metadata: { userId: buyerId },
      })
      buyerCustomerId = customer.id
    }

    // Seller Connect account (if onboarded).
    const { data: sellerProfile } = await supabaseAdmin
      .from("seller_profiles")
      .select("stripe_connect_account_id, stripe_connect_enabled")
      .eq("id", listing.seller_id)
      .single()
    const connectAccountId = sellerProfile?.stripe_connect_enabled
      ? sellerProfile.stripe_connect_account_id
      : null

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: buyerCustomerId,
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: listing.title || "ECU Tune", description: "Tune marketplace purchase" },
          unit_amount: Math.round(priceEur * 100),
        },
        quantity: 1,
      }],
      success_url: `${origin || "https://app.dctuning.ie"}/marketplace/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin || "https://app.dctuning.ie"}/marketplace`,
      metadata: {
        listingId,
        buyerId,
        sellerId: listing.seller_id,
        platformFee: String(platformFee),
        sellerEarnings: String(sellerEarnings),
      },
    }

    if (connectAccountId) {
      sessionConfig.payment_intent_data = {
        transfer_data: {
          destination: connectAccountId,
          // Stripe transfers seller_earnings to the connected account.
          // The platform automatically keeps (priceEur - sellerEarnings).
          amount: Math.round(sellerEarnings * 100),
        },
        application_fee_amount: Math.round(platformFee * 100),
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    // Insert pending purchase row. Webhook flips it to completed on
    // payment success.
    await supabaseAdmin.from("tune_purchases").insert({
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      listing_id: listingId,
      price_paid: priceEur,
      platform_fee: platformFee,
      seller_earnings: sellerEarnings,
      payment_status: "pending",
      stripe_payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("create-tune-checkout error", err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
