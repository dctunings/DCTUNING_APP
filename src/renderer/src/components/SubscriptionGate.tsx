import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Subscription, SubscriptionPlan } from '../lib/useSubscription'
import PricingPage from '../pages/PricingPage'

interface Props {
  user: User | null
  children: ReactNode
  setPage: (p: string) => void
  loading: boolean
  isActive: boolean
  subscription: Subscription | null
  plans: SubscriptionPlan[]
  daysRemaining: number | null
  createCheckoutSession: (planId: string, interval: 'monthly' | 'yearly') => Promise<void>
  openCustomerPortal: () => Promise<void>
}

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

export default function SubscriptionGate({
  user,
  children,
  setPage,
  loading,
  isActive,
  subscription,
  plans,
  daysRemaining,
  createCheckoutSession,
  openCustomerPortal,
}: Props) {
  // Not logged in — let through (auth handles separately)
  if (!user) {
    return <>{children}</>
  }

  // Loading spinner
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <div style={{
          width: 28,
          height: 28,
          border: '2.5px solid rgba(0,174,200,0.2)',
          borderTop: '2.5px solid #00aec8',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 13 }}>Loading subscription...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Logged in but no active subscription — show pricing page
  if (!isActive) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
        {isDemoMode && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'rgba(0,174,200,0.12)',
            border: '1px solid rgba(0,174,200,0.3)',
            borderRadius: 0,
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ fontSize: 12, color: '#00aec8', fontWeight: 600 }}>
              Demo Mode — Stripe is not configured
            </span>
            <button
              onClick={() => setPage('dashboard')}
              style={{
                background: '#00aec8',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Continue in Demo Mode
            </button>
          </div>
        )}
        <PricingPage
          user={user}
          onBack={() => setPage('dashboard')}
          plans={plans}
          subscription={subscription}
          isActive={isActive}
          createCheckoutSession={createCheckoutSession}
          openCustomerPortal={openCustomerPortal}
        />
      </div>
    )
  }

  // Expiring soon banner
  const showExpiryBanner = daysRemaining !== null && daysRemaining <= 7 && daysRemaining > 0

  return (
    <>
      {showExpiryBanner && (
        <div style={{
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderBottom: '1px solid rgba(245,158,11,0.2)',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
          fontSize: 12,
        }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
            ⚠ Your {subscription?.plan?.name} subscription expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} — Renew now
          </span>
          <button
            onClick={openCustomerPortal}
            style={{
              background: '#f59e0b',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Manage Billing
          </button>
        </div>
      )}
      {children}
    </>
  )
}
