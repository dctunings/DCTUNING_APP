// download-tune — generates a short-lived signed URL for a purchased tune.
//
// The tune-files Storage bucket is private (Damo fix Apr 28 2026). Buyers
// can't fetch tune files directly. This function:
//   1. Verifies the caller is authenticated.
//   2. Verifies they have a completed purchase for the given listingId.
//   3. Logs the download in remap_downloads (for quota tracking).
//   4. Mints a signed URL with a 5-minute TTL.
//
// Single TTL'd link per request — sharing the URL still grants access for
// 5 minutes max. Anything more permanent requires watermarking, which is
// out of scope.

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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    const body = await req.json().catch(() => ({}))
    const purchaseId: string | undefined = body.purchaseId
    if (!purchaseId) {
      return new Response(JSON.stringify({ error: "Missing purchaseId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Resolve purchase → listing → file path, ensuring the buyer owns it
    // and the payment is complete.
    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("tune_purchases")
      .select("id, listing_id, buyer_id, payment_status, download_count, listing:tune_listings(tune_file_path, title)")
      .eq("id", purchaseId)
      .eq("buyer_id", user.id)
      .eq("payment_status", "completed")
      .single()

    if (purchaseError || !purchase) {
      return new Response(JSON.stringify({ error: "Purchase not found or not completed" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    const listing = (purchase as any).listing
    const storagePath: string | undefined = listing?.tune_file_path
    if (!storagePath) {
      return new Response(JSON.stringify({ error: "No file attached to this purchase" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Mint a signed URL with a 5-minute TTL. Storage-level RLS is bypassed
    // because we're using the service role.
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("tune-files")
      .createSignedUrl(storagePath, 300, { download: true })

    if (signError || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: signError?.message || "Failed to sign URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      })
    }

    // Bump download counter on the purchase + the listing for stats.
    await supabaseAdmin.from("tune_purchases").update({
      download_count: (purchase.download_count || 0) + 1,
      last_downloaded_at: new Date().toISOString(),
    }).eq("id", purchaseId)

    // Best-effort log into remap_downloads for the buyer-tools quota
    // (sellers are unlimited; this still logs so admins see activity).
    await supabaseAdmin.from("remap_downloads").insert({
      user_id: user.id,
      file_name: storagePath.split("/").pop() || "tune.bin",
    }).then(() => {}).catch(() => {})

    const filename = storagePath.split("/").pop() || "tune.bin"
    return new Response(JSON.stringify({ url: signed.signedUrl, filename }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("download-tune error", err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
