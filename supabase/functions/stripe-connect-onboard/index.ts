import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const ALLOWED_ORIGINS = new Set([
  'https://app.dctuning.ie',
  'https://www.dctuning.ie',
  'https://dctuning.ie',
  'http://localhost:5173',
  'http://localhost:5174',
])
function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.dctuning.ie'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    // Authenticate the caller — Stripe Connect account belongs to the JWT
    // owner, not whoever the client says.
    const authHeader = req.headers.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const body = await req.json().catch(() => ({}))
    const userId = user.id
    const email = user.email
    const businessName = body.businessName

    const { data: sellerProfile } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_connect_account_id, stripe_connect_enabled')
      .eq('id', userId)
      .single()

    let accountId = sellerProfile?.stripe_connect_account_id

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'IE',
        email,
        business_profile: {
          name: businessName || 'DCTuning Seller',
          product_description: 'ECU tuning files and services',
        },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      })
      accountId = account.id
      await supabaseAdmin.from('seller_profiles').upsert({
        id: userId,
        stripe_connect_account_id: accountId,
        stripe_connect_enabled: false,
      })
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'https://app.dctuning.ie/marketplace?onboarding=refresh',
      return_url: 'https://app.dctuning.ie/marketplace?onboarding=success',
      type: 'account_onboarding',
    })

    return new Response(JSON.stringify({ url: accountLink.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('stripe-connect-onboard error', err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})
