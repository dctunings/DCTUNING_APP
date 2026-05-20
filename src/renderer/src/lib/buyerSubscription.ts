// Buyer Tool Subscription API — €34.99/month for Remap Builder + Performance Monitor
import { supabase } from './supabase'

export interface BuyerToolSub {
  id: string
  user_id: string
  status: 'active' | 'canceled' | 'past_due'
  stripe_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  monthly_download_limit: number
}

export async function getBuyerToolSub(): Promise<BuyerToolSub | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('buyer_tool_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!data) return null
  return data as BuyerToolSub
}

export async function hasActiveBuyerToolSub(): Promise<boolean> {
  const sub = await getBuyerToolSub()
  return sub?.status === 'active' && (!sub.current_period_end || new Date(sub.current_period_end) > new Date())
}

// Check if user has access to premium tools (either seller OR buyer subscription)
export async function hasToolAccess(): Promise<{ hasAccess: boolean; isSeller: boolean; isBuyer: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { hasAccess: false, isSeller: false, isBuyer: false }

  // Admin bypass — checked via profiles.is_admin (Apr 28 2026 fix; was
  // previously a hardcoded email check which made adding new admins
  // require a code deploy).
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.is_admin) return { hasAccess: true, isSeller: true, isBuyer: false }

  // Check seller subscription first
  const { data: sellerSub } = await supabase
    .from('seller_subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle()

  const isSeller = sellerSub?.status === 'active' &&
    (!sellerSub.current_period_end || new Date(sellerSub.current_period_end) > new Date())

  if (isSeller) return { hasAccess: true, isSeller: true, isBuyer: false }

  // Check buyer tool subscription
  const { data: buyerSub } = await supabase
    .from('buyer_tool_subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle()

  const isBuyer = buyerSub?.status === 'active' &&
    (!buyerSub.current_period_end || new Date(buyerSub.current_period_end) > new Date())

  return { hasAccess: isBuyer, isSeller: false, isBuyer }
}

// Get this month's download count
export async function getMonthlyDownloadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { count } = await supabase
    .from('remap_downloads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('downloaded_at', monthStart)

  return count || 0
}

// Check if user can download (sellers = unlimited, buyers = 5/month)
export async function canDownloadRemap(): Promise<{ allowed: boolean; remaining: number; limit: number; isSeller: boolean }> {
  const access = await hasToolAccess()
  if (!access.hasAccess) return { allowed: false, remaining: 0, limit: 0, isSeller: false }

  // Sellers have unlimited downloads
  if (access.isSeller) return { allowed: true, remaining: 999, limit: 999, isSeller: true }

  // Buyers have 5/month limit
  const used = await getMonthlyDownloadCount()
  const limit = 5
  const remaining = Math.max(0, limit - used)
  return { allowed: remaining > 0, remaining, limit, isSeller: false }
}

// Log a download
export async function logRemapDownload(fileName: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('remap_downloads').insert({ user_id: user.id, file_name: fileName })
}
