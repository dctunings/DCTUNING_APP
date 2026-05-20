// claim-free-tune — creates a completed purchase row for a free tune.
//
// Damo audit fix Apr 28 2026: client INSERTs into tune_purchases are now
// blocked by RLS (the old `WITH CHECK (true)` policy let anyone mint a
// completed purchase). All purchase creation goes through edge functions
// running with the service role.

import { createClient } from "jsr:@supabase/supabase-js@2"

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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  try {
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
    const listingId = body.listingId
    if (!listingId) {
      return new Response(JSON.stringify({ error: "Missing listingId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Re-fetch listing so we can verify it really IS free and is active.
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("tune_listings")
      .select("id, status, price_eur, is_free, seller_id, tune_file_path, title, vehicle_make, vehicle_model, stage")
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
    if (!listing.is_free && Number(listing.price_eur) > 0) {
      return new Response(JSON.stringify({ error: "This tune is not free — use Stripe checkout" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }
    if (user.id === listing.seller_id) {
      return new Response(JSON.stringify({ error: "Sellers cannot claim their own listings" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Idempotent — return existing completed purchase if there is one.
    const { data: existing } = await supabaseAdmin
      .from("tune_purchases")
      .select("*")
      .eq("buyer_id", user.id)
      .eq("listing_id", listingId)
      .eq("payment_status", "completed")
      .maybeSingle()
    if (existing) {
      return new Response(JSON.stringify(existing), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Create purchase + drop a tune_files row for the buyer's library.
    const { data: purchase, error: insertError } = await supabaseAdmin
      .from("tune_purchases")
      .insert({
        buyer_id: user.id,
        seller_id: listing.seller_id,
        listing_id: listingId,
        price_paid: 0,
        platform_fee: 0,
        seller_earnings: 0,
        payment_status: "completed",
      })
      .select()
      .single()

    if (insertError || !purchase) {
      return new Response(JSON.stringify({ error: insertError?.message || "Failed to create purchase" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Drop into buyer's library
    if (listing.tune_file_path) {
      let sellerName = "Unknown Seller"
      const { data: sp } = await supabaseAdmin
        .from("seller_profiles")
        .select("display_name, business_name")
        .eq("id", listing.seller_id)
        .maybeSingle()
      if (sp) sellerName = sp.business_name || sp.display_name || sellerName

      await supabaseAdmin.from("tune_files").insert({
        user_id: user.id,
        vehicle_name: `${listing.vehicle_make || ""} ${listing.vehicle_model || ""}`.trim(),
        file_type: listing.stage || "stage1",
        file_name: listing.tune_file_path.split("/").pop() || "tune.bin",
        storage_path: listing.tune_file_path,
        seller_name: sellerName,
        seller_id: listing.seller_id,
        listing_id: listingId,
        notes: `Free tune: ${listing.title || ""}`,
      }).then(() => {}).catch(() => {})
    }

    // Bump counters
    await supabaseAdmin.rpc("increment_purchase_count", { listing_id: listingId })
      .then(() => {}).catch(() => {})

    return new Response(JSON.stringify(purchase), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("claim-free-tune error", err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
