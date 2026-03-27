import type { User } from '@supabase/supabase-js'
import type { Subscription, SubscriptionPlan } from '../lib/useSubscription'

interface Props {
  user: User | null
  subscription: Subscription | null
  plans: SubscriptionPlan[]
  onUpgrade: () => void
  openCustomerPortal: () => Promise<void>
  daysRemaining: number | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:    { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
  trialing:  { bg: 'rgba(234,179,8,0.15)',  text: '#eab308' },
  canceled:  { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  past_due:  { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  inactive:  { bg: 'rgba(136,136,136,0.15)', text: '#888' },
}

const PLAN_COLORS: Record<string, string> = {
  starter: '#3b82f6',
  pro:     '#00aec8',
  agency:  '#a855f7',
}

function getInitials(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (user.email || 'U').slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IE', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function AccountPage({ user, subscription, plans, onUpgrade, openCustomerPortal, daysRemaining }: Props) {
  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Not signed in
      </div>
    )
  }

  const plan = subscription?.plan ?? plans.find(p => p.id === subscription?.plan_id) ?? null
  const status = subscription?.status || 'inactive'
  const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.inactive
  const planColor = plan ? (PLAN_COLORS[plan.id] || '#888') : '#888'
  const isActive = status === 'active' || status === 'trialing'
  const isStarter = isActive && plan?.id === 'starter'

  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IE', { year: 'numeric', month: 'long' })
    : '—'

  // Days remaining progress bar
  const maxDays = subscription?.billing_interval === 'yearly' ? 365 : 30
  const daysProgress = daysRemaining !== null
    ? Math.max(0, Math.min(100, (daysRemaining / maxDays) * 100))
    : 0

  return (
    <div style={{ maxWidth: 680, padding: '0 0 40px' }}>
      <h1 style={{
        fontSize: 22,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 24px',
        letterSpacing: '-0.3px',
      }}>
        Account & Billing
      </h1>

      {/* ── Account Info ─────────────────────────────── */}
      <section style={{
        background: '#111',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '20px 22px',
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 16px' }}>
          Account Info
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Avatar */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #00aec8 0%, #008fab 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 900,
            color: '#000',
            flexShrink: 0,
          }}>
            {getInitials(user)}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
              {user.user_metadata?.full_name || 'User'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.email}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, opacity: 0.7 }}>
              Joined {joined}
            </div>
          </div>
        </div>
      </section>

      {/* ── Current Plan ─────────────────────────────── */}
      <section style={{
        background: '#111',
        border: `1px solid ${isActive ? `${planColor}33` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 12,
        padding: '20px 22px',
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 16px' }}>
          Current Plan
        </h2>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            {/* Plan name badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                background: `${planColor}22`,
                color: planColor,
                border: `1px solid ${planColor}44`,
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {plan?.name || 'No Plan'}
              </span>
              {/* Status badge */}
              <span style={{
                background: statusStyle.bg,
                color: statusStyle.text,
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'capitalize',
                letterSpacing: '0.3px',
              }}>
                {status === 'trialing' ? 'Trial' : status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>

            {subscription?.current_period_end && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {subscription.cancel_at_period_end ? 'Cancels on' : 'Next billing'}: {' '}
                <span style={{ color: '#ddd', fontWeight: 600 }}>
                  {formatDate(subscription.current_period_end)}
                </span>
              </div>
            )}
            {subscription?.billing_interval && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, textTransform: 'capitalize' }}>
                {subscription.billing_interval} billing
              </div>
            )}
          </div>

          {/* Days remaining */}
          {daysRemaining !== null && (
            <div style={{ textAlign: 'right', minWidth: 100 }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: daysRemaining <= 7 ? '#f59e0b' : '#fff', lineHeight: 1 }}>
                {daysRemaining}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>days left</div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {daysRemaining !== null && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              height: 5,
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${daysProgress}%`,
                background: daysRemaining <= 7 ? '#f59e0b' : planColor,
                borderRadius: 3,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>0 days</span>
              <span>{maxDays} days</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Plan Features ─────────────────────────────── */}
      {plan && plan.features && plan.features.length > 0 && (
        <section style={{
          background: '#111',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          padding: '20px 22px',
          marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 14px' }}>
            Plan Features
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {plan.features.map((feature, i) => (
              <li key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '5px 0',
                fontSize: 13,
                color: '#ddd',
              }}>
                <span style={{ color: planColor, fontWeight: 800, fontSize: 15, lineHeight: '18px', flexShrink: 0 }}>✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Actions ─────────────────────────────── */}
      <section style={{
        background: '#111',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '20px 22px',
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 16px' }}>
          Actions
        </h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isActive && (
            <button
              onClick={openCustomerPortal}
              style={{
                background: '#00aec8',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Manage Billing
            </button>
          )}
          {isStarter && (
            <button
              onClick={onUpgrade}
              style={{
                background: 'rgba(0,174,200,0.1)',
                color: '#00aec8',
                border: '1.5px solid rgba(0,174,200,0.3)',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Upgrade to Pro ↗
            </button>
          )}
          {!isActive && (
            <button
              onClick={onUpgrade}
              style={{
                background: '#00aec8',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Choose a Plan
            </button>
          )}
        </div>
      </section>

      {/* ── Danger Zone ─────────────────────────────── */}
      {isActive && (
        <section style={{
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: 12,
          padding: '20px 22px',
        }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 10px' }}>
            Danger Zone
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            Canceling will keep your access until the end of the current billing period.
          </p>
          <button
            onClick={openCustomerPortal}
            style={{
              background: 'none',
              color: '#ef4444',
              border: '1.5px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel Subscription
          </button>
        </section>
      )}
    </div>
  )
}
