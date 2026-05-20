import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Subscription, SubscriptionPlan } from '../lib/useSubscription'

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

/**
 * Legacy SubscriptionGate — now a pass-through.
 * Per-page subscription gates in RemapBuilder and PerformanceMonitor
 * handle access control using the new buyer/seller subscription tables.
 */
export default function SubscriptionGate({ children }: Props) {
  return <>{children}</>
}
