// Stripe webhook — handles seller-subscription, buyer-tool-subscription, and
// tune-purchase lifecycle events. All writes use the service role so they
// bypass RLS (clients have read-only access to these tables).
//
// Damo audit fix Apr 28 2026: previous version used wrong column names
// (`status`/`user_id` on tune_purchases — actual columns are
// `payment_status`/`buyer_id`) so paid purchases never got marked complete.
// Also looked up tune_listings by `tune_stage`/`file_path` which don't exist
// (real columns: `stage`/`tune_file_path`).

import Stripe from "npm:stripe@12"
import { createClient } from "npm:@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
})
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const ALLOWED_ORIGINS = new Set([
  "https://app.dctuning.ie",
  "https://www.dctuning.ie",
  "https://dctuning.ie",
])
function corsHeaders(origin: string | null) {
  // Stripe doesn't send Origin — webhook responses don't need CORS. But for
  // the unlikely OPTIONS pre-flight we still want to be tight.
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://app.dctuning.ie"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  const signature = req.headers.get("stripe-signature")
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400, headers: corsHeaders(origin) })
  }
  const body = await req.text()
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400, headers: corsHeaders(origin) })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id || session.metadata?.userId || session.metadata?.buyerId
        const subType = session.metadata?.subscription_type

        // ── Subscription activations ──
        if (session.mode === "subscription" && userId) {
          const subscriptionId = session.subscription as string
          const sub = await stripe.subscriptions.retrieve(subscriptionId)
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
          const periodStart = new Date(sub.current_period_start * 1000).toISOString()

          if (subType === "buyer_tools") {
            await supabase.from("buyer_tool_subscriptions").upsert({
              user_id: userId,
              status: "active",
              stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
              stripe_subscription_id: subscriptionId,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              monthly_download_limit: 5,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
          } else if (subType === "seller") {
            const planId = session.metadata?.plan_id || "starter"
            await supabase.from("seller_subscriptions").upsert({
              user_id: userId,
              plan_id: planId,
              status: "active",
              stripe_subscription_id: subscriptionId,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
          }
        }

        // ── One-off tune purchase ──
        if (session.mode === "payment" && userId) {
          const listingId = session.metadata?.listingId || session.metadata?.listing_id
          const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null

          // Mark the matching pending purchase as completed. Match on
          // (buyer_id, listing_id, pending) — the create-tune-checkout
          // function inserts the pending row right before redirecting.
          if (listingId) {
            await supabase.from("tune_purchases")
              .update({
                payment_status: "completed",
                stripe_payment_intent_id: paymentIntentId,
              })
              .eq("buyer_id", userId)
              .eq("listing_id", listingId)
              .eq("payment_status", "pending")

            // Pull the listing so we can deliver the file to the buyer's
            // library (tune_files).
            const { data: listing } = await supabase
              .from("tune_listings")
              .select("vehicle_make, vehicle_model, stage, tune_file_path, seller_id, title")
              .eq("id", listingId)
              .single()

            if (listing) {
              let sellerName = "Unknown Seller"
              if (listing.seller_id) {
                const { data: sp } = await supabase
                  .from("seller_profiles")
                  .select("display_name, business_name")
                  .eq("id", listing.seller_id)
                  .single()
                if (sp) sellerName = sp.business_name || sp.display_name || sellerName
              }

              const fileName = listing.tune_file_path
                ? listing.tune_file_path.split("/").pop() || "tune.bin"
                : "tune.bin"

              await supabase.from("tune_files").insert({
                user_id: userId,
                vehicle_name: `${listing.vehicle_make || ""} ${listing.vehicle_model || ""}`.trim(),
                file_type: listing.stage || "stage1",
                file_name: fileName,
                storage_path: listing.tune_file_path,
                seller_name: sellerName,
                seller_id: listing.seller_id,
                listing_id: listingId,
                notes: `Purchased: ${listing.title || ""}`,
              })
            }
          }
        }
        break
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
        const periodStart = new Date(sub.current_period_start * 1000).toISOString()
        const updates = {
          status: sub.status === "active" || sub.status === "trialing" ? "active"
                : sub.status === "past_due" ? "past_due"
                : sub.status === "canceled" || sub.status === "unpaid" ? "canceled"
                : sub.status,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }
        await supabase.from("seller_subscriptions").update(updates).eq("stripe_subscription_id", sub.id)
        await supabase.from("buyer_tool_subscriptions").update(updates).eq("stripe_subscription_id", sub.id)
        break
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        await supabase.from("seller_subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id)
        await supabase.from("buyer_tool_subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id)
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoice.subscription as string | null
        if (subId) {
          await supabase.from("seller_subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId)
          await supabase.from("buyer_tool_subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId)
        }
        break
      }

      // ── Stripe Connect onboarding signals ──
      case "account.updated": {
        const account = event.data.object as Stripe.Account
        const enabled = !!(account.charges_enabled && account.payouts_enabled)
        await supabase.from("seller_profiles")
          .update({ stripe_connect_enabled: enabled })
          .eq("stripe_connect_account_id", account.id)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  } catch (err) {
    console.error("webhook handler error", err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    })
  }
})
