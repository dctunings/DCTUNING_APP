import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onBack: () => void
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

const SELLER_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 15,
    fee: 20,
    description: 'Perfect for individual tuners just getting started',
    features: ['Unlimited listings & sales', 'Unlimited remap downloads', '20% platform fee', 'All tools included', 'Stripe Connect payouts'],
    color: '#3b82f6',
    border: '1.5px solid #3b82f6',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    fee: 12,
    description: 'For established tuners with regular customers',
    features: ['Unlimited listings & sales', 'Unlimited remap downloads', '12% platform fee', 'All tools included', 'Featured listings', 'Priority support'],
    color: '#00aec8',
    border: '2px solid var(--accent)',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 49,
    fee: 8,
    description: 'For professional tuning shops with high volume',
    features: ['Unlimited listings & sales', 'Unlimited remap downloads', '8% platform fee', 'All tools included', 'Custom storefront', 'API access', 'Dedicated manager'],
    color: '#a855f7',
    border: '1.5px solid #a855f7',
  },
]

export default function PricingPage({ onBack }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleSellerSubscribe = async (planId: string) => {
    setLoading(planId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('Please sign in first'); return }
      const { data, error } = await supabase.functions.invoke('create-seller-checkout-session', {
        body: { userId: user.id, email: user.email, planId }
      })
      if (error) throw error
      if (data?.url) window.open(data.url, '_blank')
    } catch (err: any) {
      alert('Subscription error: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(null)
    }
  }

  const handleBuyerSubscribe = async () => {
    setLoading('buyer')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('Please sign in first'); return }
      const { data, error } = await supabase.functions.invoke('create-buyer-tool-checkout', {
        body: { userId: user.id, email: user.email }
      })
      if (error) throw error
      if (data?.url) window.open(data.url, '_blank')
    } catch (err: any) {
      alert('Subscription error: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--text)', cursor: 'pointer', marginBottom: 24 }}
      >
        ← Back
      </button>

      {/* ── Customer Plan ─────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 12 }}>For Customers</div>
        <h1 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 12 }}>Tune your own car.</h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 460, margin: '0 auto' }}>Build remaps and test performance without selling on the marketplace.</p>
      </div>

      <div style={{ maxWidth: 420, margin: '0 auto 48px', background: 'rgba(244,63,94,0.04)', border: '2px solid rgba(244,63,94,0.3)', borderRadius: 16, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Customer Tools</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Remap Builder + Performance Monitor access</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 16 }}>
          <span style={{ fontSize: 42, fontWeight: 800 }}>€34.99</span>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>/month</span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', display: 'grid', gap: 8, textAlign: 'left' }}>
          {[
            'Remap Builder with 6,722 recipes',
            'AI Copilot integration',
            '5 modified binary downloads per month',
            'Performance Monitor & virtual dyno',
            'J2534 PassThru flashing',
            'Fleet Dashboard & File Vault',
          ].map((f, i) => (
            <li key={i} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#f43f5e' }}>✓</span> {f}
            </li>
          ))}
        </ul>
        <button
          onClick={handleBuyerSubscribe}
          disabled={loading === 'buyer'}
          style={{ width: '100%', padding: '14px 24px', borderRadius: 10, border: 'none', background: '#f43f5e', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading === 'buyer' ? 'not-allowed' : 'pointer', opacity: loading === 'buyer' ? 0.6 : 1 }}
        >
          {loading === 'buyer' ? 'Loading...' : 'Subscribe — €34.99/month'}
        </button>
      </div>

      {/* ── Seller Plans ──────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#00aec8', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 12 }}>For Sellers</div>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 12 }}>Sell tunes & grow your business.</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 460, margin: '0 auto' }}>All tools included free. Unlimited remap downloads. List and sell on the Marketplace.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 40 }}>
        {SELLER_PLANS.map((plan) => (
          <div key={plan.id} style={{ padding: 24, borderRadius: 12, border: plan.border, background: 'rgba(255,255,255,0.03)', position: 'relative', boxShadow: plan.popular ? '0 0 32px rgba(0,174,200,0.12), 0 4px 24px rgba(0,0,0,0.5)' : 'none' }}>
            {plan.popular && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#00aec8', color: '#000', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>Most Popular</div>
            )}
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{plan.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{plan.description}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 800 }}>€{plan.price}</span>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>/month</span>
            </div>
            <div style={{ fontSize: 13, color: plan.color, fontWeight: 600, marginBottom: 20 }}>{plan.fee}% platform fee per sale</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', display: 'grid', gap: 8 }}>
              {plan.features.map((feature, i) => (
                <li key={i} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#00aec8' }}>✓</span> {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSellerSubscribe(plan.id)}
              disabled={loading === plan.id}
              style={{ width: '100%', padding: '12px 24px', borderRadius: 8, border: 'none', background: plan.popular ? '#00aec8' : 'rgba(255,255,255,0.08)', color: plan.popular ? '#000' : '#fff', fontSize: 14, fontWeight: 700, cursor: loading === plan.id ? 'not-allowed' : 'pointer', opacity: loading === plan.id ? 0.6 : 1 }}
            >
              {loading === plan.id ? 'Loading...' : `Subscribe to ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', padding: '20px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Just want to buy tunes? <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#00aec8', cursor: 'pointer', fontWeight: 600 }}>Browse marketplace free →</button>
        </p>
      </div>
    </div>
  )
}
