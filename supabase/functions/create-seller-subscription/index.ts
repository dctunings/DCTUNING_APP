import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { userId, email, planId } = await req.json()
    if (!userId || !planId) {
      return new Response(JSON.stringify({ error: 'Missing userId or planId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Get plan details
    const { data: plan } = await supabaseAdmin
      .from('seller_subscription_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Get or create Stripe customer
    let buyerCustomerId: string | null = null
    const { data: existingBuyer } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .single()

    if (existingBuyer?.stripe_customer_id) {
      buyerCustomerId = existingBuyer.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      })
      buyerCustomerId = customer.id
      await supabaseAdmin.from('subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: buyerCustomerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    }

    // Create subscription checkout session
    const session = await stripe.checkout.sessions.create({
      customer: buyerCustomerId,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${plan.name} Seller Subscription`,
            description: `Platform fee: ${Math.round(plan.platform_fee_percent * 100)}% per sale`,
          },
          unit_amount: Math.round(plan.monthly_fee_eur * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: 'https://app.dctuning.ie/marketplace?subscription=success',
      cancel_url: 'https://app.dctuning.ie/marketplace?subscription=cancel',
      metadata: { userId, planId },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
