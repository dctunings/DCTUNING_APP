// Seller Dashboard — overview, sales list, customer breakdown.
//
// Damo audit fix Apr 28 2026: was querying non-existent columns
// (`amount`/`status` on tune_purchases; `platform_fee_pct` on
// seller_subscription_plans) so every load showed €0 / no sales. Updated
// to use canonical column names from the migrations
// (`price_paid`/`payment_status`/`platform_fee_percent`).

import { useState, useEffect, useCallback } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Badge } from '../components/ui'
import { supabase } from '../lib/supabase'
import {
  getMySellerProfile,
  getSellerStats,
  type SellerProfile,
  type SellerStats,
} from '../lib/marketplace'

interface Sale {
  id: string
  buyer_id: string
  price_paid: number
  platform_fee: number
  seller_earnings: number
  created_at: string
  payment_status: string
  listing_title: string
  vehicle: string
}

interface SubscriptionInfo {
  plan_name: string
  status: string
  fee_pct: number
  period_end: string | null
}

const bS: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }

const fmtEur = (n: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function SellerDashboard() {
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [stats, setStats] = useState<SellerStats | null>(null)
  const [sales, setSales] = useState<Sale[]>([])
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSeller, setIsSeller] = useState(false)
  const [tab, setTab] = useState<'overview' | 'sales' | 'customers'>('overview')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const seller = await getMySellerProfile()
      if (!seller) { setIsSeller(false); setLoading(false); return }
      setProfile(seller)
      setIsSeller(true)

      // Stats from the canonical helper.
      const s = await getSellerStats(seller.id)
      setStats(s)

      // Sales — completed purchases where I'm the seller.
      const { data: purchases } = await supabase
        .from('tune_purchases')
        .select('id, buyer_id, price_paid, platform_fee, seller_earnings, created_at, payment_status, listing:tune_listings(title, vehicle_make, vehicle_model)')
        .eq('seller_id', seller.id)
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100)
      if (purchases) {
        setSales(purchases.map((p: any) => ({
          id: p.id,
          buyer_id: p.buyer_id,
          price_paid: Number(p.price_paid) || 0,
          platform_fee: Number(p.platform_fee) || 0,
          seller_earnings: Number(p.seller_earnings) || 0,
          created_at: p.created_at,
          payment_status: p.payment_status,
          listing_title: p.listing?.title || 'Unknown',
          vehicle: `${p.listing?.vehicle_make || ''} ${p.listing?.vehicle_model || ''}`.trim() || 'Unknown vehicle',
        })))
      }

      // Subscription — join with plan to get the human name + fee %.
      const { data: subData } = await supabase
        .from('seller_subscriptions')
        .select('status, current_period_end, plan:seller_subscription_plans(name, platform_fee_percent)')
        .eq('user_id', seller.id)
        .eq('status', 'active')
        .maybeSingle()
      if (subData) {
        const plan = (subData as any).plan
        setSub({
          plan_name: plan?.name || 'Unknown',
          status: subData.status,
          fee_pct: Number(plan?.platform_fee_percent) || 0,
          period_end: subData.current_period_end,
        })
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthlySales = sales.filter(s => s.created_at.startsWith(thisMonth))
  const monthlyEarnings = monthlySales.reduce((sum, s) => sum + s.seller_earnings, 0)

  const sellerName = profile?.business_name || profile?.display_name || 'Your seller overview'

  if (loading) return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Seller Dashboard" subtitle="Loading..." icon="" />
    </div>
  )

  if (!isSeller) return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Seller Dashboard" subtitle="Become a seller to access your dashboard" icon="" />
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>You don't have a seller account yet</div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Subscribe to a seller plan to start listing and selling tunes on the marketplace.</div>
        </div>
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Seller Dashboard" subtitle={sellerName} icon="" />

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
          {error}<span onClick={() => setError('')} style={{ float: 'right', cursor: 'pointer' }}>X</span>
        </div>
      )}

      {/* STATS */}
      <Grid cols={4} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="Total Sales" value={stats?.totalSales || 0} icon="" color="#10b981" />
        <StatCard label="This Month" value={fmtEur(monthlyEarnings)} icon="" color="#00aec8" />
        <StatCard label="Total Earnings" value={fmtEur(stats?.totalEarnings || 0)} icon="" color="#f59e0b" />
        <StatCard label="Avg Rating" value={stats?.avgRating ? stats.avgRating + '/5' : 'New'} icon="" color="#8b5cf6" />
      </Grid>

      {/* SUBSCRIPTION INFO */}
      {sub && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: '#888' }}>Current Plan</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 2 }}>{sub.plan_name}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#888' }}>Platform Fee</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginTop: 2 }}>{sub.fee_pct}%</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#888' }}>You Keep</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 2 }}>{100 - sub.fee_pct}%</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge color="#10b981" bg="rgba(16,185,129,0.12)">{sub.status}</Badge>
              {sub.period_end && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Renews: {fmtDate(sub.period_end)}</div>}
            </div>
          </div>
        </Card>
      )}

      {/* TAB NAV */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['overview', 'sales', 'customers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...bS, background: tab === t ? '#00aec8' : 'rgba(255,255,255,0.05)', color: tab === t ? '#fff' : '#888', padding: '8px 20px' }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <SectionTitle>Recent Sales</SectionTitle>
            {sales.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {sales.slice(0, 5).map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#eee' }}>{s.listing_title}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{s.vehicle} | {fmtDate(s.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>{fmtEur(s.seller_earnings)}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>Fee: {fmtEur(s.platform_fee)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#888', marginTop: 12 }}>No sales yet. List tunes in the Marketplace to start selling.</div>
            )}
          </Card>
          {profile && (
            <Card style={{ padding: 20 }}>
              <SectionTitle>Your Storefront</SectionTitle>
              <div style={{ fontSize: 13, color: '#aaa', marginTop: 8 }}>
                Share your storefront link with customers:
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#00aec8', marginTop: 8, padding: '8px 12px', background: 'rgba(0,174,200,0.08)', borderRadius: 6 }}>
                {profile.slug ? '/seller/' + profile.slug : 'Set up your profile to get a shareable link'}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* SALES TAB */}
      {tab === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sales.length > 0 ? sales.map(s => (
            <Card key={s.id} style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#eee' }}>{s.listing_title}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.vehicle} | {fmtDate(s.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Sale</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#eee' }}>{fmtEur(s.price_paid)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Fee</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>{fmtEur(s.platform_fee)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Earned</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{fmtEur(s.seller_earnings)}</div>
                  </div>
                  <Badge color={s.payment_status === 'completed' ? '#10b981' : '#f59e0b'} bg={s.payment_status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'}>{s.payment_status}</Badge>
                </div>
              </div>
            </Card>
          )) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>No sales yet</div>
            </Card>
          )}
        </div>
      )}

      {/* CUSTOMERS TAB */}
      {tab === 'customers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sales.length > 0 ? (() => {
            const customerMap = new Map<string, { count: number; total: number; lastDate: string; tunes: string[] }>()
            sales.forEach(s => {
              const existing = customerMap.get(s.buyer_id) || { count: 0, total: 0, lastDate: s.created_at, tunes: [] }
              existing.count++
              existing.total += s.seller_earnings
              if (s.created_at > existing.lastDate) existing.lastDate = s.created_at
              if (!existing.tunes.includes(s.listing_title)) existing.tunes.push(s.listing_title)
              customerMap.set(s.buyer_id, existing)
            })
            return [...customerMap.entries()].map(([buyerId, info]) => (
              <Card key={buyerId} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#eee' }}>Customer {buyerId.slice(0, 8)}...</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {info.count} purchase{info.count > 1 ? 's' : ''} | Last: {fmtDate(info.lastDate)}
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{info.tunes.join(', ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{fmtEur(info.total)}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>Total earned</div>
                  </div>
                </div>
              </Card>
            ))
          })() : (
            <Card>
              <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>No customers yet</div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
