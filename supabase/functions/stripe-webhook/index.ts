import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
      },
    })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed'
    console.error('Webhook signature error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log('Stripe webhook event:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const planId = session.metadata?.planId
        const interval = session.metadata?.interval || 'monthly'

        if (!userId || !planId) {
          console.error('Missing userId or planId in checkout session metadata')
          break
        }

        const subscriptionId = session.subscription as string
        const customerId = session.customer as string

        // Fetch the subscription from Stripe to get period dates
        let stripeSub: Stripe.Subscription | null = null
        if (subscriptionId) {
          stripeSub = await stripe.subscriptions.retrieve(subscriptionId)
        }

        // Upsert subscription record
        const { error } = await supabaseAdmin
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan_id: planId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: stripeSub?.status || 'active',
            billing_interval: interval,
            current_period_start: stripeSub?.current_period_start
              ? new Date(stripeSub.current_period_start * 1000).toISOString()
              : null,
            current_period_end: stripeSub?.current_period_end
              ? new Date(stripeSub.current_period_end * 1000).toISOString()
              : null,
            cancel_at_period_end: stripeSub?.cancel_at_period_end || false,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id',
          })

        if (error) console.error('checkout.session.completed upsert error:', error)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId

        if (!userId) {
          console.warn('No userId in subscription metadata, looking up by stripe_subscription_id')
          // Fall back to lookup by stripe_subscription_id
          const { error } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: sub.status,
              current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              cancel_at_period_end: sub.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', sub.id)

          if (error) console.error('subscription.updated (by sub id) error:', error)
          break
        }

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)

        if (error) console.error('subscription.updated error:', error)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId

        const updatePayload = {
          status: 'canceled',
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }

        let error
        if (userId) {
          ;({ error } = await supabaseAdmin
            .from('subscriptions')
            .update(updatePayload)
            .eq('user_id', userId))
        } else {
          ;({ error } = await supabaseAdmin
            .from('subscriptions')
            .update(updatePayload)
            .eq('stripe_subscription_id', sub.id))
        }

        if (error) console.error('subscription.deleted error:', error)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id

        if (!subId) break

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subId)

        if (error) console.error('invoice.payment_failed error:', error)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Handler error'
    console.error('Webhook handler error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
