import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SubscriptionPlan, Subscription } from '../lib/useSubscription'

interface Props {
  user: User | null
  onBack: () => void
  plans: SubscriptionPlan[]
  subscription: Subscription | null
  isActive: boolean
  createCheckoutSession: (planId: string, interval: 'monthly' | 'yearly') => Promise<void>
  openCustomerPortal: () => Promise<void>
}

const PLAN_STYLES: Record<string, { border: string; shadow: string; badge?: string }> = {
  starter: {
    border: '1.5px solid #3b82f6',
    shadow: '0 0 0 0 transparent',
  },
  pro: {
    border: '2px solid var(--accent)',
    shadow: '0 0 32px rgba(0,174,200,0.12), 0 4px 24px rgba(0,0,0,0.5)',
    badge: 'Most Popular',
  },
  agency: {
    border: '1.5px solid #a855f7',
    shadow: '0 0 0 0 transparent',
  },
}

const PLAN_COLORS: Record<string, string> = {
  starter: '#3b82f6',
  pro: '#00aec8',
  agency: '#a855f7',
}

export default function PricingPage({
  user,
  onBack,
  plans,
  subscription,
  isActive,
  createCheckoutSession,
  openCustomerPortal,
}: Props) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  const getPrice = (plan: SubscriptionPlan) => {
    if (interval === 'yearly') {
      return Math.round(plan.price_yearly / 12 / 100)
    }
    return Math.round(plan.price_monthly / 100)
  }

  const handleCTA = async (planId: string) => {
    setLoadingPlan(planId)
    try {
      await createCheckoutSession(planId, interval)
    } finally {
      setLoadingPlan(null)
    }
  }

  const handleManageBilling = async () => {
    setLoadingPlan('portal')
    try {
      await openCustomerPortal()
    } finally {
      setLoadingPlan(null)
    }
  }

  const isCurrentPlan = (planId: string) => isActive && subscription?.plan_id === planId

  // Sort plans in order: starter, pro, agency
  const orderedPlans = ['starter', 'pro', 'agency']
    .map(id => plans.find(p => p.id === id))
    .filter((p): p is SubscriptionPlan => !!p)

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--bg-primary)',
      padding: '32px 24px 48px',
      overflowY: 'auto',
    }}>
      {/* Back button */}
      {user && (
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 28,
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to app
        </button>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(0,174,200,0.1)',
          border: '1px solid rgba(0,174,200,0.25)',
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: 11,
          fontWeight: 700,
          color: '#00aec8',
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          Subscription Plans
        </div>
        <h1 style={{
          fontSize: 34,
          fontWeight: 900,
          color: '#fff',
          margin: '0 0 12px',
          letterSpacing: '-0.5px',
          lineHeight: 1.2,
        }}>
          Choose Your Plan
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Professional ECU tuning tools for every workshop
        </p>

        {/* Interval toggle */}
        <div style={{
          display: 'inline-flex',
          background: '#111',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: 3,
          gap: 2,
          alignItems: 'center',
        }}>
          <button
            onClick={() => setInterval('monthly')}
            style={{
              padding: '7px 18px',
              borderRadius: 7,
              border: 'none',
              background: interval === 'monthly' ? 'rgba(255,255,255,0.1)' : 'none',
              color: interval === 'monthly' ? '#fff' : 'var(--text-muted)',
              fontWeight: interval === 'monthly' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            style={{
              padding: '7px 18px',
              borderRadius: 7,
              border: 'none',
              background: interval === 'yearly' ? 'rgba(255,255,255,0.1)' : 'none',
              color: interval === 'yearly' ? '#fff' : 'var(--text-muted)',
              fontWeight: interval === 'yearly' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Yearly
            <span style={{
              background: '#00aec8',
              color: '#000',
              fontSize: 9,
              fontWeight: 900,
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: '0.4px',
            }}>
              20% OFF
            </span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      {orderedPlans.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Loading plans...</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          maxWidth: 980,
          margin: '0 auto 40px',
        }}>
          {orderedPlans.map((plan) => {
            const style = PLAN_STYLES[plan.id] || PLAN_STYLES.starter
            const color = PLAN_COLORS[plan.id] || '#888'
            const current = isCurrentPlan(plan.id)
            const isPro = plan.id === 'pro'

            return (
              <div
                key={plan.id}
                style={{
                  background: '#111',
                  border: current ? `2px solid ${color}` : style.border,
                  borderRadius: 14,
                  padding: '28px 24px 24px',
                  position: 'relative',
                  boxShadow: isPro ? style.shadow : undefined,
                  transform: isPro ? 'translateY(-4px)' : undefined,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Most Popular badge */}
                {isPro && (
                  <div style={{
                    position: 'absolute',
                    top: -1,
                    right: 20,
                    background: '#00aec8',
                    color: '#000',
                    fontSize: 9,
                    fontWeight: 900,
                    padding: '5px 12px',
                    borderRadius: '0 0 8px 8px',
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                  }}>
                    Most Popular
                  </div>
                )}

                {/* Current plan badge */}
                {current && (
                  <div style={{
                    position: 'absolute',
                    top: -1,
                    left: 20,
                    background: color,
                    color: plan.id === 'pro' ? '#000' : '#fff',
                    fontSize: 9,
                    fontWeight: 900,
                    padding: '5px 12px',
                    borderRadius: '0 0 8px 8px',
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                  }}>
                    Current Plan
                  </div>
                )}

                {/* Plan name */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      {plan.name}
                    </span>
                  </div>

                  {/* Price */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>€</span>
                    <span style={{ fontSize: 40, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-1px' }}>
                      {getPrice(plan)}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>/mo</span>
                  </div>
                  {interval === 'yearly' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Billed €{Math.round(plan.price_yearly / 100)}/year
                      <span style={{ color: '#00aec8', marginLeft: 6, fontWeight: 700 }}>Save €{Math.round((plan.price_monthly * 12 - plan.price_yearly) / 100)}</span>
                    </div>
                  )}
                  {interval === 'monthly' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Billed monthly
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                  {plan.features.map((feature, i) => (
                    <li key={i} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 9,
                      padding: '5px 0',
                      fontSize: 13,
                      color: feature.startsWith('Everything') ? 'var(--text-muted)' : '#ddd',
                      fontStyle: feature.startsWith('Everything') ? 'italic' : 'normal',
                    }}>
                      <span style={{
                        color: color,
                        fontWeight: 800,
                        fontSize: 14,
                        lineHeight: '18px',
                        flexShrink: 0,
                      }}>✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {current ? (
                  <button
                    onClick={handleManageBilling}
                    disabled={loadingPlan === 'portal'}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      borderRadius: 8,
                      border: `1.5px solid ${color}`,
                      background: 'none',
                      color: color,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: loadingPlan === 'portal' ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: loadingPlan === 'portal' ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {loadingPlan === 'portal' ? 'Loading...' : 'Manage Billing'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCTA(plan.id)}
                    disabled={loadingPlan === plan.id}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      borderRadius: 8,
                      border: isPro ? 'none' : `1.5px solid ${color}44`,
                      background: isPro ? '#00aec8' : `${color}22`,
                      color: isPro ? '#000' : color,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: loadingPlan === plan.id ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: loadingPlan === plan.id ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {loadingPlan === plan.id
                      ? 'Loading...'
                      : isActive
                        ? `Switch to ${plan.name}`
                        : `Subscribe to ${plan.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Trust badges */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        {[
          { icon: '✕', text: 'Cancel anytime' },
          { icon: '🔒', text: 'Stripe secured payments' },
          { icon: '⚡', text: 'Instant access after payment' },
        ].map((badge) => (
          <div key={badge.text} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            color: 'var(--text-muted)',
            background: '#111',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            padding: '7px 14px',
          }}>
            <span style={{ fontSize: 14 }}>{badge.icon}</span>
            {badge.text}
          </div>
        ))}
      </div>
    </div>
  )
}
