// Seller Subscription API
import { supabase } from './supabase'

export interface SellerSub {
  id: string
  user_id: string
  plan_id: string
  status: 'active' | 'canceled' | 'past_due'
  current_period_end: string | null
  plan?: {
    name: string
    monthly_fee_eur: number
    platform_fee_percent: number
    max_sales: number | null
  }
}

export async function getSellerSub(): Promise<SellerSub | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('seller_subscriptions')
    .select('*, plan:seller_subscription_plans(*)')
    .eq('user_id', user.id)
    .single()
  if (!data) return null
  return data as SellerSub
}

export async function hasActiveSellerSub(): Promise<boolean> {
  const sub = await getSellerSub()
  return sub?.status === 'active' && (!sub.current_period_end || new Date(sub.current_period_end) > new Date())
}
