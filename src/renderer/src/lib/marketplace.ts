// Tune Marketplace API for DCTuning.
//
// Single canonical module for everything tune-marketplace + seller-related.
// Damo audit fix Apr 28 2026: consolidated sellerStore.ts + marketplace.ts
// into this file. sellerStore.ts had a parallel set of types and queries
// using column names that didn't match the SQL migrations (`status='approved'`
// when valid values are pending/active/paused/rejected/removed,
// `payment_status` queried as `status`, etc.) — every query in it was
// broken. Their useful functions (storefront stats, seller-by-slug,
// customer list) are folded in here with correct columns.
//
// Pricing: EUR-only. The old price_usd column was dropped in the
// 20260428 migration. Anywhere this file mentioned price_usd has been
// removed.

import { supabase } from './supabase'

// ── Helper: Get seller platform fee based on subscription tier ──────────────

export async function getSellerPlatformFeePercent(sellerId: string): Promise<number> {
  const { data: sub } = await supabase
    .from('seller_subscriptions')
    .select('plan_id')
    .eq('user_id', sellerId)
    .eq('status', 'active')
    .maybeSingle()

  if (!sub) return 0.20 // Default to Starter 20%

  switch (sub.plan_id) {
    case 'starter': return 0.20
    case 'pro': return 0.12
    case 'enterprise': return 0.08
    default: return 0.20
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface TuneListing {
  id: string
  seller_id: string
  title: string
  description: string | null
  ecu_family: string
  vehicle_make: string
  vehicle_model: string
  vehicle_year_start: number | null
  vehicle_year_end: number | null
  engine_code: string | null
  fuel_type: 'petrol' | 'diesel' | 'e85' | 'methanol' | null
  power_gain_hp: number
  torque_gain_nm: number
  stage: 'stock' | 'stage1' | 'stage2' | 'stage3' | 'custom' | null
  tune_file_path: string | null     // Storage path, NOT a public URL (Apr 28 fix)
  tune_file_size: number
  price_eur: number
  is_free: boolean
  status: 'pending' | 'active' | 'paused' | 'rejected' | 'removed'
  moderation_notes: string | null
  download_count: number
  purchase_count: number
  avg_rating: number
  review_count: number
  created_at: string
  updated_at: string
  seller?: SellerProfile
}

export interface SellerProfile {
  id: string                              // = auth.users.id
  display_name: string | null
  business_name: string | null
  slug: string | null                     // unique URL handle (/seller/<slug>)
  bio: string | null
  website: string | null
  location: string | null
  phone: string | null
  logo_url: string | null
  specialties: string[] | null            // e.g. ["VAG","BMW","Diesel","Stage 2"]
  is_verified: boolean
  total_sales: number
  total_earnings: number
  stripe_connect_account_id: string | null
  stripe_connect_enabled: boolean
}

export interface TunePurchase {
  id: string
  buyer_id: string
  seller_id: string
  listing_id: string
  price_paid: number
  platform_fee: number
  seller_earnings: number
  payment_status: 'pending' | 'completed' | 'refunded' | 'disputed'
  stripe_payment_intent_id: string | null
  download_count: number
  last_downloaded_at: string | null
  created_at: string
  listing?: TuneListing
}

export interface TuneReview {
  id: string
  listing_id: string
  reviewer_id: string
  purchase_id: string
  rating: number
  title: string | null
  body: string | null
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface CreateListingInput {
  title: string
  description?: string
  ecu_family: string
  vehicle_make: string
  vehicle_model: string
  vehicle_year_start?: number
  vehicle_year_end?: number
  engine_code?: string
  fuel_type?: 'petrol' | 'diesel' | 'e85' | 'methanol'
  power_gain_hp?: number
  torque_gain_nm?: number
  stage?: 'stock' | 'stage1' | 'stage2' | 'stage3' | 'custom'
  price_eur: number
  is_free?: boolean
  tune_file_path?: string  // Storage path returned from uploadTuneFile()
}

export interface SearchFilters {
  make?: string
  model?: string
  ecu_family?: string
  stage?: string
  fuel_type?: string
  min_price?: number
  max_price?: number
  sort_by?: 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'popular'
}

export interface SellerStats {
  totalListings: number
  totalSales: number
  totalEarnings: number
  avgRating: number
  totalReviews: number
}

// ── Listings ────────────────────────────────────────────────────────────────

export async function searchListings(
  filters: SearchFilters = {},
  page = 0,
  pageSize = 20,
): Promise<{ listings: TuneListing[]; count: number }> {
  let query = supabase
    .from('tune_listings')
    .select('*', { count: 'exact' })
    .eq('status', 'active')

  if (filters.make) query = query.ilike('vehicle_make', `%${filters.make}%`)
  if (filters.model) query = query.ilike('vehicle_model', `%${filters.model}%`)
  if (filters.ecu_family) query = query.ilike('ecu_family', `%${filters.ecu_family}%`)
  if (filters.stage) query = query.eq('stage', filters.stage)
  if (filters.fuel_type) query = query.eq('fuel_type', filters.fuel_type)
  if (filters.min_price !== undefined) query = query.gte('price_eur', filters.min_price)
  if (filters.max_price !== undefined) query = query.lte('price_eur', filters.max_price)

  switch (filters.sort_by) {
    case 'price_asc': query = query.order('price_eur', { ascending: true }); break
    case 'price_desc': query = query.order('price_eur', { ascending: false }); break
    case 'rating': query = query.order('avg_rating', { ascending: false }); break
    case 'popular': query = query.order('purchase_count', { ascending: false }); break
    default: query = query.order('created_at', { ascending: false })
  }

  const { data, error, count } = await query.range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw error

  const listings = (data || []) as TuneListing[]
  const sellerIds = [...new Set(listings.map(l => l.seller_id))]
  if (sellerIds.length > 0) {
    const { data: sellers } = await supabase.from('seller_profiles').select('*').in('id', sellerIds)
    if (sellers) {
      const sellerMap = new Map(sellers.map(s => [s.id, s as SellerProfile]))
      listings.forEach(l => { l.seller = sellerMap.get(l.seller_id) })
    }
  }

  return { listings, count: count || 0 }
}

export async function getListingById(id: string): Promise<TuneListing | null> {
  const { data, error } = await supabase.from('tune_listings').select('*').eq('id', id).single()
  if (error || !data) return null

  const listing = data as TuneListing
  const { data: seller } = await supabase.from('seller_profiles').select('*').eq('id', listing.seller_id).single()
  if (seller) listing.seller = seller as SellerProfile

  return listing
}

export async function createListing(input: CreateListingInput): Promise<TuneListing> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  // Check seller has active subscription
  const { data: sellerSub } = await supabase
    .from('seller_subscriptions')
    .select('plan_id, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!sellerSub) {
    throw new Error('Active seller subscription required to list tunes. Subscribe in Seller Account.')
  }

  const record = {
    seller_id: user.id,
    title: input.title,
    description: input.description || null,
    ecu_family: input.ecu_family,
    vehicle_make: input.vehicle_make,
    vehicle_model: input.vehicle_model,
    vehicle_year_start: input.vehicle_year_start || null,
    vehicle_year_end: input.vehicle_year_end || null,
    engine_code: input.engine_code || null,
    fuel_type: input.fuel_type || null,
    power_gain_hp: input.power_gain_hp || 0,
    torque_gain_nm: input.torque_gain_nm || 0,
    stage: input.stage || 'custom',
    price_eur: input.is_free ? 0 : input.price_eur,
    is_free: input.is_free || false,
    tune_file_path: input.tune_file_path || null,
    status: 'pending' as const,
  }

  const { data, error } = await supabase.from('tune_listings').insert(record).select().single()
  if (error) throw error
  return data as TuneListing
}

export async function updateListing(id: string, updates: Partial<CreateListingInput>): Promise<void> {
  const { error } = await supabase.from('tune_listings').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('tune_listings').delete().eq('id', id)
  if (error) throw error
}

export async function getMyListings(): Promise<TuneListing[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('tune_listings')
    .select('*')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as TuneListing[]
}

// ── Admin / Moderation ──────────────────────────────────────────────────────

export async function getPendingListings(): Promise<TuneListing[]> {
  const { data, error } = await supabase
    .from('tune_listings')
    .select('*, seller:seller_profiles(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as TuneListing[]
}

export async function moderateListing(
  id: string,
  action: 'approve' | 'reject',
  notes?: string,
): Promise<void> {
  // Admin gating happens at the DB level via the
  // "Admins can moderate listings" RLS policy keyed on profiles.is_admin.
  // The 20260428 migration added that policy + a profiles.is_admin column.
  const updates = {
    status: action === 'approve' ? 'active' : 'rejected',
    moderation_notes: notes || null,
  }

  const { error } = await supabase.from('tune_listings').update(updates).eq('id', id)
  if (error) throw error
}

export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return !!data?.is_admin
}

// ── Purchases ───────────────────────────────────────────────────────────────

/**
 * Buy a tune. For free tunes the purchase is created directly. For paid
 * tunes this opens Stripe Checkout — the actual purchase row is created
 * server-side by create-tune-checkout (which re-fetches authoritative
 * pricing), and the webhook flips it to 'completed' after payment.
 */
export async function purchaseTune(listingId: string): Promise<TunePurchase> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  const listing = await getListingById(listingId)
  if (!listing) throw new Error('Listing not found')
  if (listing.status !== 'active') throw new Error('Listing not available')

  // Already bought?
  const { data: existing } = await supabase
    .from('tune_purchases')
    .select('*')
    .eq('buyer_id', user.id)
    .eq('listing_id', listingId)
    .eq('payment_status', 'completed')
    .maybeSingle()
  if (existing) return existing as TunePurchase

  const price = Number(listing.price_eur ?? 0)
  const isFree = listing.is_free || price <= 0

  // Paid → Stripe Checkout (server recomputes price, ignores client values)
  if (!isFree) {
    const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
      'create-tune-checkout',
      { body: { listingId } },
    )
    if (checkoutError) throw new Error('Checkout failed: ' + checkoutError.message)
    if (checkoutData?.url) {
      window.open(checkoutData.url, '_blank')
      // Return a placeholder pending row — webhook will fill in the real one.
      return {
        id: 'pending',
        buyer_id: user.id,
        seller_id: listing.seller_id,
        listing_id: listingId,
        price_paid: price,
        platform_fee: 0,
        seller_earnings: 0,
        payment_status: 'pending',
        stripe_payment_intent_id: null,
        download_count: 0,
        last_downloaded_at: null,
        created_at: new Date().toISOString(),
      } as TunePurchase
    }
    throw new Error('Checkout returned no URL')
  }

  // Free tune — purchase row created via edge function for RLS safety
  // (clients can't INSERT tune_purchases directly anymore).
  const feePercent = await getSellerPlatformFeePercent(listing.seller_id)
  const platformFee = 0
  const sellerEarnings = 0

  const { data, error } = await supabase.functions.invoke('claim-free-tune', {
    body: { listingId, platformFee, sellerEarnings, feePercent },
  })
  if (error) throw new Error('Free-tune claim failed: ' + error.message)
  return data as TunePurchase
}

export async function getMyPurchases(): Promise<TunePurchase[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('tune_purchases')
    .select('*, listing:tune_listings(*)')
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as TunePurchase[]
}

export async function getMySales(): Promise<TunePurchase[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('tune_purchases')
    .select('*, listing:tune_listings(*)')
    .eq('seller_id', user.id)
    .eq('payment_status', 'completed')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as TunePurchase[]
}

// ── Download ────────────────────────────────────────────────────────────────

/**
 * Download a purchased tune. The bucket is private — this hits the
 * download-tune edge function which (a) verifies a completed purchase
 * exists, (b) mints a 5-minute signed URL.
 */
export async function downloadTuneFile(purchaseId: string): Promise<{ url: string; filename: string }> {
  const { data, error } = await supabase.functions.invoke('download-tune', { body: { purchaseId } })
  if (error) throw new Error('Download failed: ' + error.message)
  if (!data?.url) throw new Error('No download URL returned')
  return { url: data.url, filename: data.filename || 'tune.bin' }
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export async function getReviewsForListing(listingId: string): Promise<TuneReview[]> {
  const { data, error } = await supabase
    .from('tune_reviews')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as TuneReview[]
}

export async function createReview(
  listingId: string,
  purchaseId: string,
  rating: number,
  title: string,
  body: string,
): Promise<TuneReview> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  const record = {
    listing_id: listingId,
    reviewer_id: user.id,
    purchase_id: purchaseId,
    rating,
    title: title || null,
    body: body || null,
  }

  const { data, error } = await supabase.from('tune_reviews').insert(record).select().single()
  if (error) throw error
  return data as TuneReview
}

// ── Seller Profile (formerly sellerStore.ts) ────────────────────────────────

export async function getSellerProfile(userId: string): Promise<SellerProfile | null> {
  const { data, error } = await supabase.from('seller_profiles').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return data as SellerProfile
}

export async function getSellerBySlug(slug: string): Promise<SellerProfile | null> {
  const { data } = await supabase.from('seller_profiles').select('*').eq('slug', slug).maybeSingle()
  return (data as SellerProfile) || null
}

export async function getMySellerProfile(): Promise<SellerProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return getSellerProfile(user.id)
}

export async function updateSellerProfile(updates: Partial<SellerProfile>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  const { error } = await supabase.from('seller_profiles').upsert({ id: user.id, ...updates })
  if (error) throw error
}

export async function createSellerProfile(businessName: string): Promise<SellerProfile> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const { data, error } = await supabase
    .from('seller_profiles')
    .upsert({
      id: user.id,
      display_name: businessName,
      business_name: businessName,
      slug,
    })
    .select()
    .single()
  if (error) throw error
  return data as SellerProfile
}

/** Sellers with active subscriptions — for the marketplace's seller directory. */
export async function getActiveSellers(): Promise<SellerProfile[]> {
  const { data: subs } = await supabase
    .from('seller_subscriptions')
    .select('user_id')
    .eq('status', 'active')
  if (!subs || subs.length === 0) return []
  const userIds = subs.map(s => s.user_id)
  const { data } = await supabase
    .from('seller_profiles')
    .select('*')
    .in('id', userIds)
    .order('display_name')
  return (data || []) as SellerProfile[]
}

/** Aggregated stats for a seller's storefront. */
export async function getSellerStats(sellerId: string): Promise<SellerStats> {
  const [listingsRes, salesRes, reviewsRes] = await Promise.all([
    supabase.from('tune_listings').select('id', { count: 'exact', head: true })
      .eq('seller_id', sellerId).eq('status', 'active'),
    supabase.from('tune_purchases').select('seller_earnings')
      .eq('seller_id', sellerId).eq('payment_status', 'completed'),
    getSellerReviewsForSeller(sellerId),
  ])
  const totalEarnings = (salesRes.data || []).reduce((s, p) => s + (Number(p.seller_earnings) || 0), 0)
  const reviews = reviewsRes
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0
  return {
    totalListings: listingsRes.count || 0,
    totalSales: (salesRes.data || []).length,
    totalEarnings,
    avgRating: Math.round(avgRating * 10) / 10,
    totalReviews: reviews.length,
  }
}

/** All reviews across all of a seller's listings. */
async function getSellerReviewsForSeller(sellerId: string): Promise<TuneReview[]> {
  const { data: listings } = await supabase
    .from('tune_listings')
    .select('id')
    .eq('seller_id', sellerId)
  if (!listings || listings.length === 0) return []
  const listingIds = listings.map(l => l.id)
  const { data } = await supabase
    .from('tune_reviews')
    .select('*')
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false })
  return (data || []) as TuneReview[]
}

export const getSellerReviews = getSellerReviewsForSeller

/** Buyers who bought from this seller — used by Seller Dashboard's customers tab. */
export async function getSellerCustomers(sellerId: string) {
  const { data } = await supabase
    .from('tune_purchases')
    .select('buyer_id, price_paid, seller_earnings, created_at, listing:tune_listings(title, vehicle_make, vehicle_model)')
    .eq('seller_id', sellerId)
    .eq('payment_status', 'completed')
    .order('created_at', { ascending: false })
  return data || []
}

// ── Stripe Connect ──────────────────────────────────────────────────────────

export async function getStripeConnectUrl(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
    body: { businessName: profile?.full_name || user.email },
  })

  if (error) throw new Error('Failed to get Stripe Connect URL: ' + error.message)
  return data?.url || ''
}

// ── Upload ──────────────────────────────────────────────────────────────────

const ALLOWED_TUNE_EXTENSIONS = ['.bin', '.frf', '.ori', '.mod', '.dat', '.kp']
const MAX_TUNE_SIZE = 32 * 1024 * 1024 // 32 MB ceiling

/**
 * Upload a tune file. Returns the Storage PATH (not a URL) — the bucket is
 * private. The path goes into tune_listings.tune_file_path and is used by
 * the download-tune edge function to mint signed URLs at purchase time.
 */
export async function uploadTuneFile(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Must be logged in')

  // Validate file
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_TUNE_EXTENSIONS.includes(ext)) {
    throw new Error(`File type ${ext} not allowed. Allowed: ${ALLOWED_TUNE_EXTENSIONS.join(', ')}`)
  }
  if (file.size > MAX_TUNE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_TUNE_SIZE / 1024 / 1024} MB.`)
  }
  if (file.size === 0) {
    throw new Error('Empty file')
  }

  // Sanitize filename — keep extension, strip path components.
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100)
  const path = `tunes/${user.id}/${Date.now()}_${safeName}`

  const { error } = await supabase.storage.from('tune-files').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error

  return path  // NOT a URL — storage path only
}

// ── Seller Subscription ─────────────────────────────────────────────────────

export interface SellerSubscription {
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

export async function getMySellerSubscription(): Promise<SellerSubscription | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('seller_subscriptions')
    .select('*, plan:seller_subscription_plans(*)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) return null
  return data as SellerSubscription
}

export async function canCreateListing(): Promise<{ allowed: boolean; reason?: string }> {
  const sub = await getMySellerSubscription()
  if (!sub || sub.status !== 'active') {
    return { allowed: false, reason: 'Active seller subscription required to list tunes' }
  }
  return { allowed: true }
}

export async function createSellerSubscriptionCheckout(planId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-seller-checkout-session', {
    body: { planId },
  })
  if (error) throw new Error('Failed to create subscription: ' + error.message)
  return data?.url || ''
}
