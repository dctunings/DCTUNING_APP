// Hook to check and manage user subscription
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

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
}

export function useSubscription(user: User | null): SubscriptionState & {
  refresh: () => Promise<void>
  createCheckoutSession: (planId: string, interval: 'monthly' | 'yearly') => Promise<void>
  openCustomerPortal: () => Promise<void>
} {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)

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

      // First login — create an inactive subscription record
      if (!subData) {
        const { data: newSub } = await supabase
          .from('subscriptions')
          .insert({ user_id: user.id, status: 'inactive', plan_id: null })
          .select('*, plan:subscription_plans(*)')
          .single()
        subData = newSub ?? null

        // Notify owner about the new signup (best-effort, don't block)
        supabase.functions.invoke('notify-signup').catch(() => {})
      }

      setSubscription(subData ?? null)
    } catch (e) {
      console.error('Subscription load error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [user?.id])

  const isOwner = user?.email === 'dctunings@gmail.com'
  const hasPaidSub = subscription?.status === 'active' || subscription?.status === 'trialing'

  const isActive = isOwner || hasPaidSub
  const isPro = isOwner || (hasPaidSub && (subscription?.plan_id === 'pro' || subscription?.plan_id === 'agency'))
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
    refresh: loadData, createCheckoutSession, openCustomerPortal
  }
}
