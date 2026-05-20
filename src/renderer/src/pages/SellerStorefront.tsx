// Seller Storefront — public page for browsing a single seller's profile
// and active listings. Importable by slug (/seller/<slug>) or by the
// currently-logged-in user.
//
// Damo audit fix Apr 28 2026: previously imported from the broken
// `sellerStore.ts` module (queried non-existent columns). Now uses the
// canonical `marketplace.ts` types and column names.

import { useState, useEffect } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Badge } from '../components/ui'
import { supabase } from '../lib/supabase'
import {
  getSellerBySlug,
  getMySellerProfile,
  getSellerStats,
  updateSellerProfile,
  searchListings,
  type SellerProfile,
  type SellerStats,
  type TuneListing,
  type TuneReview,
} from '../lib/marketplace'

interface Props {
  sellerSlug?: string
  onBuyTune?: (listingId: string) => void
}

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: '#eee', fontSize: 14, outline: 'none' }
const lS: React.CSSProperties = { fontSize: 12, color: '#aaa', marginBottom: 4, display: 'block' }
const bS: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }

export default function SellerStorefront({ sellerSlug, onBuyTune }: Props) {
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [listings, setListings] = useState<TuneListing[]>([])
  const [reviews, setReviews] = useState<TuneReview[]>([])
  const [stats, setStats] = useState<SellerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<'listings' | 'reviews' | 'about'>('listings')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Edit form state
  const [editBio, setEditBio] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editSpecialties, setEditSpecialties] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [editPhone, setEditPhone] = useState('')

  useEffect(() => {
    loadStorefront()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerSlug])

  const loadStorefront = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let seller: SellerProfile | null = null

      if (sellerSlug) {
        seller = await getSellerBySlug(sellerSlug)
      } else if (user) {
        seller = await getMySellerProfile()
      }

      if (!seller) {
        setError('Seller not found')
        setLoading(false)
        return
      }

      setProfile(seller)
      setIsOwner(user?.id === seller.id)

      setEditBio(seller.bio || '')
      setEditLocation(seller.location || '')
      setEditSpecialties((seller.specialties || []).join(', '))
      setEditWebsite(seller.website || '')
      setEditPhone(seller.phone || '')

      // Load active listings for this seller + their stats + reviews.
      // Listings come from the standard searchListings filtered by seller_id.
      const [activeListings, sellerStats] = await Promise.all([
        supabase.from('tune_listings').select('*')
          .eq('seller_id', seller.id).eq('status', 'active')
          .order('created_at', { ascending: false }),
        getSellerStats(seller.id),
      ])

      const ls = (activeListings.data || []) as TuneListing[]
      setListings(ls)
      setStats(sellerStats)

      // Load reviews across all of this seller's listings.
      if (ls.length > 0) {
        const { data: revs } = await supabase
          .from('tune_reviews')
          .select('*')
          .in('listing_id', ls.map(l => l.id))
          .order('created_at', { ascending: false })
        setReviews((revs || []) as TuneReview[])
      } else {
        setReviews([])
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load storefront')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!profile) return
    try {
      await updateSellerProfile({
        bio: editBio.trim() || null,
        location: editLocation.trim() || null,
        specialties: editSpecialties.split(',').map(s => s.trim()).filter(Boolean),
        website: editWebsite.trim() || null,
        phone: editPhone.trim() || null,
      })
      setSuccess('Profile updated!')
      setEditing(false)
      setTimeout(() => setSuccess(''), 3000)
      loadStorefront()
    } catch (e: any) {
      setError(e.message || 'Failed to update profile')
    }
  }

  const stars = (rating: number) => {
    const full = Math.floor(rating)
    return Array.from({ length: 5 }, (_, i) => i < full ? 'star' : 'empty')
  }

  // Display name fallback chain: business_name → display_name → email-ish
  const sellerName = (p: SellerProfile) => p.business_name || p.display_name || 'Seller'

  if (loading) return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Seller Storefront" subtitle="Loading..." icon="" />
    </div>
  )

  if (!profile) return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Seller Not Found" subtitle="This seller profile does not exist or has been removed" icon="" />
    </div>
  )

  const displayName = sellerName(profile)

  return (
    <div style={{ padding: '0 4px' }}>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
          {error}<span onClick={() => setError('')} style={{ float: 'right', cursor: 'pointer' }}>X</span>
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#34d399', fontSize: 13 }}>{success}</div>
      )}

      {/* SELLER HEADER */}
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: 'linear-gradient(135deg, #00aec8, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{displayName}</div>
            {profile.location && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{profile.location}</div>}
            {profile.specialties && profile.specialties.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {profile.specialties.map(s => <Badge key={s} color="#00aec8" bg="rgba(0,174,200,0.12)">{s}</Badge>)}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {stats && (
              <div style={{ display: 'flex', gap: 20, justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{stats.totalListings}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Tunes</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{stats.totalSales}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Sales</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{stats.avgRating > 0 ? stats.avgRating + '/5' : 'New'}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{stats.totalReviews} Reviews</div>
                </div>
              </div>
            )}
            {isOwner && (
              <button onClick={() => setEditing(!editing)} style={{ ...bS, background: '#374151', color: '#ccc', marginTop: 12, fontSize: 11, padding: '6px 14px' }}>
                {editing ? 'Cancel Edit' : 'Edit Profile'}
              </button>
            )}
          </div>
        </div>
        {profile.bio && !editing && <div style={{ fontSize: 14, color: '#aaa', marginTop: 16, lineHeight: 1.6 }}>{profile.bio}</div>}
        {profile.website && !editing && <div style={{ fontSize: 12, color: '#00aec8', marginTop: 8 }}>{profile.website}</div>}
      </Card>

      {/* EDIT PROFILE FORM */}
      {editing && isOwner && (
        <Card style={{ marginBottom: 20, padding: 20 }}>
          <SectionTitle>Edit Your Storefront</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lS}>Bio / About</label>
              <textarea value={editBio} onChange={e => setEditBio(e.target.value)}
                placeholder="Tell customers about your tuning experience, specialties, and workshop..."
                rows={4} style={{ ...iS, resize: 'vertical' }} />
            </div>
            <div>
              <label style={lS}>Location</label>
              <input type="text" value={editLocation} onChange={e => setEditLocation(e.target.value)}
                placeholder="e.g. Sligo, Ireland" style={iS} />
            </div>
            <div>
              <label style={lS}>Specialties (comma separated)</label>
              <input type="text" value={editSpecialties} onChange={e => setEditSpecialties(e.target.value)}
                placeholder="e.g. VAG, BMW, Diesel, Stage 2" style={iS} />
            </div>
            <div>
              <label style={lS}>Website</label>
              <input type="text" value={editWebsite} onChange={e => setEditWebsite(e.target.value)}
                placeholder="https://yoursite.com" style={iS} />
            </div>
            <div>
              <label style={lS}>Phone</label>
              <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                placeholder="+353 ..." style={iS} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button onClick={handleSaveProfile} style={{ ...bS, background: '#10b981', color: '#fff' }}>Save Profile</button>
            <button onClick={() => setEditing(false)} style={{ ...bS, background: '#374151', color: '#ccc' }}>Cancel</button>
          </div>
        </Card>
      )}

      {/* TAB NAVIGATION */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['listings', 'reviews', 'about'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...bS, background: tab === t ? '#00aec8' : 'rgba(255,255,255,0.05)', color: tab === t ? '#fff' : '#888', padding: '8px 20px' }}>
            {t === 'listings' ? `Tunes (${listings.length})` : t === 'reviews' ? `Reviews (${reviews.length})` : 'About'}
          </button>
        ))}
      </div>

      {/* LISTINGS TAB */}
      {tab === 'listings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listings.length > 0 ? listings.map(l => (
            <Card key={l.id} style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#eee' }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {l.vehicle_make} {l.vehicle_model}
                    {(l.vehicle_year_start || l.vehicle_year_end) && ` (${l.vehicle_year_start || '?'}-${l.vehicle_year_end || '?'})`}
                    {l.ecu_family && ` | ${l.ecu_family}`}
                    {l.stage && ` | ${l.stage}`}
                  </div>
                  {l.description && <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>{l.description}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>
                    {l.is_free || !l.price_eur ? 'Free' : '€' + l.price_eur}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{l.download_count || 0} downloads</div>
                  {onBuyTune && (
                    <button onClick={() => onBuyTune(l.id)}
                      style={{ ...bS, background: '#00aec8', color: '#fff', marginTop: 8, padding: '6px 16px', fontSize: 12 }}>
                      {l.is_free ? 'Get Free' : 'Buy Tune'}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>No tunes listed yet</div>
            </Card>
          )}
        </div>
      )}

      {/* REVIEWS TAB */}
      {tab === 'reviews' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reviews.length > 0 ? reviews.map(r => (
            <Card key={r.id} style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {stars(r.rating).map((s, i) => (
                      <span key={i} style={{ color: s === 'star' ? '#f59e0b' : '#374151', fontSize: 14 }}>
                        {s === 'star' ? '★' : '☆'}
                      </span>
                    ))}
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{new Date(r.created_at).toLocaleDateString('en-IE')}</span>
                    {r.title && <span style={{ fontSize: 13, color: '#eee', marginLeft: 8, fontWeight: 600 }}>{r.title}</span>}
                  </div>
                  {r.body && <div style={{ fontSize: 14, color: '#ccc', lineHeight: 1.5 }}>{r.body}</div>}
                </div>
              </div>
            </Card>
          )) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>No reviews yet</div>
            </Card>
          )}
        </div>
      )}

      {/* ABOUT TAB */}
      {tab === 'about' && (
        <Card style={{ padding: 20 }}>
          <SectionTitle>About {displayName}</SectionTitle>
          {profile.bio ? (
            <div style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7, marginTop: 12 }}>{profile.bio}</div>
          ) : (
            <div style={{ fontSize: 14, color: '#888', marginTop: 12 }}>This seller hasn't added a bio yet.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
            {profile.location && (
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Location</div>
                <div style={{ fontSize: 14, color: '#eee' }}>{profile.location}</div>
              </div>
            )}
            {profile.website && (
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Website</div>
                <div style={{ fontSize: 14, color: '#00aec8' }}>{profile.website}</div>
              </div>
            )}
            {profile.phone && (
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Phone</div>
                <div style={{ fontSize: 14, color: '#eee' }}>{profile.phone}</div>
              </div>
            )}
            {profile.specialties && profile.specialties.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Specialties</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {profile.specialties.map(s => <Badge key={s} color="#00aec8" bg="rgba(0,174,200,0.12)">{s}</Badge>)}
                </div>
              </div>
            )}
          </div>
          {stats && (
            <Grid cols={4} gap={12} style={{ marginTop: 20 }}>
              <StatCard label="Tunes Listed" value={stats.totalListings} icon="" color="#00aec8" />
              <StatCard label="Total Sales" value={stats.totalSales} icon="" color="#10b981" />
              <StatCard label="Avg Rating" value={stats.avgRating > 0 ? stats.avgRating + '/5' : 'New'} icon="" color="#f59e0b" />
              <StatCard label="Reviews" value={stats.totalReviews} icon="" color="#8b5cf6" />
            </Grid>
          )}
        </Card>
      )}
    </div>
  )
}
