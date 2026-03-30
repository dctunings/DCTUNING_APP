// Hook to check and manage user subscription
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

const TRIAL_DURATION_MS = 60 * 60 * 1000 // 1 hour

export interface SubscriptionPlan {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  features: string[]
  max_seats: number
}

export interface Subscription {
  id: string
  plan_id: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  billing_interval: string
  trial_started_at: string | null
  plan?: SubscriptionPlan
}

export interface SubscriptionState {
  subscription: Subscription | null
  plans: SubscriptionPlan[]
  loading: boolean
  isActive: boolean
  isPro: boolean
  isAgency: boolean
  daysRemaining: number | null
  isTrialActive: boolean
  trialMinutesLeft: number | null
  trialExpired: boolean
}

export function useSubscription(user: User | null): SubscriptionState & {
  refresh: () => Promise<void>
  createCheckoutSession: (planId: string, interval: 'monthly' | 'yearly') => Promise<void>
  openCustomerPortal: () => Promise<void>
} {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [trialMinutesLeft, setTrialMinutesLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    try {
      const { data: plansData } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_monthly')
      if (plansData) setPlans(plansData)

      let { data: subData } = await supabase
        .from('subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // First login — create a trial record
      if (!subData) {
        const now = new Date().toISOString()
        const { data: newSub } = await supabase
          .from('subscriptions')
          .insert({ user_id: user.id, trial_started_at: now, status: 'trial', plan_id: null })
          .select('*, plan:subscription_plans(*)')
          .single()
        subData = newSub ?? null
      } else if (!subData.trial_started_at) {
        // Existing user with no trial timestamp — set it now
        const now = new Date().toISOString()
        await supabase
          .from('subscriptions')
          .update({ trial_started_at: now })
          .eq('user_id', user.id)
        subData = { ...subData, trial_started_at: now }
      }

      setSubscription(subData ?? null)
    } catch (e) {
      console.error('Subscription load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [user?.id])

  // Trial countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    const trialStart = subscription?.trial_started_at
      ? new Date(subscription.trial_started_at).getTime()
      : null

    if (!trialStart) return

    const tick = () => {
      const elapsed = Date.now() - trialStart
      const remaining = TRIAL_DURATION_MS - elapsed
      setTrialMinutesLeft(remaining > 0 ? Math.ceil(remaining / 60000) : 0)
    }

    tick()
    timerRef.current = setInterval(tick, 30000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [subscription?.trial_started_at])

  const isOwner = user?.email === 'dctunings@gmail.com'

  const hasPaidSub = subscription?.status === 'active' || subscription?.status === 'trialing'

  // Trial state must be computed before isActive/isPro so they can include it
  const trialStart = subscription?.trial_started_at
    ? new Date(subscription.trial_started_at).getTime()
    : null
  const isTrialActive = !isOwner && !hasPaidSub && trialStart !== null
    && (Date.now() - trialStart) < TRIAL_DURATION_MS
  const trialExpired = !isOwner && !hasPaidSub && trialStart !== null
    && (Date.now() - trialStart) >= TRIAL_DURATION_MS

  // Trial users get full Pro access; after trial expires isActive becomes false → pricing wall
  const isActive = isOwner || hasPaidSub || isTrialActive
  const isPro = isOwner || isTrialActive || (hasPaidSub && (subscription?.plan_id === 'pro' || subscription?.plan_id === 'agency'))
  const isAgency = isOwner || (hasPaidSub && subscription?.plan_id === 'agency')

  let daysRemaining: number | null = null
  if (subscription?.current_period_end) {
    const end = new Date(subscription.current_period_end)
    daysRemaining = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const openUrl = (url: string) => {
    if (window.electron?.shell?.openExternal) {
      window.electron.shell.openExternal(url)
    } else {
      window.location.href = url
    }
  }

  const createCheckoutSession = async (planId: string, interval: 'monthly' | 'yearly') => {
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
    if (isDemoMode) {
      alert('Stripe not configured — add STRIPE_SECRET_KEY to Supabase Edge Function env vars')
      return
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planId, interval, userId: user?.id, userEmail: user?.email }
      })
      if (error) throw error
      if (data?.url) {
        openUrl(data.url)
        if (window.electron?.shell?.openExternal) {
          setTimeout(() => loadData(), 10000)
        }
      }
    } catch (e) {
      console.error('Checkout error:', e)
      alert('Failed to start checkout. Please try again.')
    }
  }

  const openCustomerPortal = async () => {
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
    if (isDemoMode) {
      alert('Stripe not configured — add STRIPE_SECRET_KEY to Supabase Edge Function env vars')
      return
    }
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { userId: user?.id }
      })
      if (error) throw error
      if (data?.url) openUrl(data.url)
    } catch (e) {
      console.error('Portal error:', e)
      alert('Failed to open billing portal. Please try again.')
    }
  }

  return {
    subscription, plans, loading,
    isActive, isPro, isAgency, daysRemaining,
    isTrialActive, trialMinutesLeft, trialExpired,
    refresh: loadData, createCheckoutSession, openCustomerPortal
  }
}
