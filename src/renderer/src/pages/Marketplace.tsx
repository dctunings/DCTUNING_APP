import { useState, useEffect, useCallback } from 'react'
import type { TuneListing, SearchFilters, TuneReview, TunePurchase } from '../lib/marketplace'
import { supabase } from '../lib/supabase'
import {
  searchListings,
  getListingById,
  purchaseTune,
  getReviewsForListing,
  createReview,
  getMyPurchases,
  getMyListings,
  createListing,
  uploadTuneFile,
  downloadTuneFile,
  getPendingListings,
  moderateListing,
  getStripeConnectUrl,
  isAdmin as checkIsAdmin,
} from '../lib/marketplace'
import { hasActiveSellerSub } from '../lib/sellerSubscription'

// ── SVG Icons ─────────────────────────────────────────────────────
const Icons = {
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  star: <svg width="14" height="14" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" strokeWidth={1}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  cart: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  chevronLeft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
  chevronRight: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  shield: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
}

// ── Main Component ────────────────────────────────────────────────

export default function Marketplace({ navigateTo }: { navigateTo?: (p: string) => void }) {
  const [listings, setListings] = useState<TuneListing[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<SearchFilters>({ sort_by: 'newest' })
  const [searchQuery, setSearchQuery] = useState('')

  // Detail view
  const [selectedListing, setSelectedListing] = useState<TuneListing | null>(null)
  const [reviews, setReviews] = useState<TuneReview[]>([])
  const [purchasing, setPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<'browse' | 'purchases' | 'my-listings' | 'admin'>('browse')
  const [myPurchases, setMyPurchases] = useState<TunePurchase[]>([])
  const [myListings, setMyListings] = useState<TuneListing[]>([])

  // Admin
  const [pendingListings, setPendingListings] = useState<TuneListing[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  // Create listing modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '', description: '', ecu_family: '', vehicle_make: '', vehicle_model: '',
    vehicle_year_start: '', vehicle_year_end: '', engine_code: '', fuel_type: 'petrol',
    power_gain_hp: '', torque_gain_nm: '', stage: 'stage1', price_eur: '', is_free: false,
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Stripe Connect
  const [connectLoading, setConnectLoading] = useState(false)

  // Seller subscription
  const [sellerSub, setSellerSub] = useState<any>(null)
  const [checkingSub, setCheckingSub] = useState(true)

  const loadListings = useCallback(async () => {
    setLoading(true)
    try {
      const f: SearchFilters = { ...filters }
      if (searchQuery) {
        f.make = searchQuery
        f.model = searchQuery
      }
      const result = await searchListings(f, page, 20)
      setListings(result.listings)
      setTotalCount(result.count)
    } catch (e) {
      console.error('Marketplace load error:', e)
    } finally {
      setLoading(false)
    }
  }, [filters, page, searchQuery])

  useEffect(() => {
    loadListings()
  }, [loadListings])

  useEffect(() => {
    hasActiveSellerSub().then(setSellerSub).finally(() => setCheckingSub(false))
  }, [])

  const handlePurchase = async (listingId: string) => {
    setPurchasing(true)
    try {
      const result = await purchaseTune(listingId)
      if (result.payment_status === 'pending' && result.id === 'pending') {
        // Stripe checkout opened in new tab
        setPurchased(true)
        setTimeout(() => setPurchased(false), 3000)
      } else {
        setPurchased(true)
        setTimeout(() => setPurchased(false), 3000)
      }
    } catch (e) {
      alert('Purchase failed: ' + (e as Error).message)
    } finally {
      setPurchasing(false)
    }
  }

  const handleDownload = async (purchaseId: string) => {
    setDownloadingId(purchaseId)
    try {
      const { url, filename } = await downloadTuneFile(purchaseId)
      // Create temporary link to download
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      alert('Download failed: ' + (e as Error).message)
    } finally {
      setDownloadingId(null)
    }
  }

  const openDetail = async (listing: TuneListing) => {
    setSelectedListing(listing)
    const revs = await getReviewsForListing(listing.id)
    setReviews(revs)
  }

  const loadMyData = async (tab: 'purchases' | 'my-listings' | 'admin') => {
    if (tab === 'purchases') {
      const p = await getMyPurchases()
      setMyPurchases(p)
    } else if (tab === 'my-listings') {
      const l = await getMyListings()
      setMyListings(l)
    } else if (tab === 'admin') {
      const isAdminUser = await checkIsAdmin()
      setIsAdmin(isAdminUser)
      if (isAdminUser) {
        try {
          const p = await getPendingListings()
          setPendingListings(p)
        } catch (e) {
          console.error('Failed to load pending listings:', e)
        }
      }
    }
  }

  // Check admin status on mount — uses profiles.is_admin, not user_metadata
  useEffect(() => {
    checkIsAdmin().then(setIsAdmin)
  }, [])

  useEffect(() => {
    if (activeTab !== 'browse') loadMyData(activeTab as any)
  }, [activeTab])

  const handleModerate = async (id: string, action: 'approve' | 'reject') => {
    try {
      await moderateListing(id, action)
      setPendingListings(prev => prev.filter(l => l.id !== id))
    } catch (e) {
      alert('Moderation failed: ' + (e as Error).message)
    }
  }

  const handleStripeConnect = async () => {
    setConnectLoading(true)
    try {
      const url = await getStripeConnectUrl()
      if (url) window.open(url, '_blank')
      else alert('Stripe Connect not configured')
    } catch (e) {
      alert('Failed to get Stripe Connect URL: ' + (e as Error).message)
    } finally {
      setConnectLoading(false)
    }
  }

  const handleCreateListing = async () => {
    setCreating(true)
    try {
      // uploadTuneFile now returns a Storage PATH (not a public URL) — the
      // bucket is private and downloads go through the signed-URL edge
      // function. Pass it as tune_file_path on the listing.
      let tuneFilePath = ''
      if (uploadFile) {
        tuneFilePath = await uploadTuneFile(uploadFile)
      }
      await createListing({
        title: createForm.title,
        description: createForm.description,
        ecu_family: createForm.ecu_family,
        vehicle_make: createForm.vehicle_make,
        vehicle_model: createForm.vehicle_model,
        vehicle_year_start: createForm.vehicle_year_start ? parseInt(createForm.vehicle_year_start) : undefined,
        vehicle_year_end: createForm.vehicle_year_end ? parseInt(createForm.vehicle_year_end) : undefined,
        engine_code: createForm.engine_code,
        fuel_type: createForm.fuel_type as any,
        power_gain_hp: createForm.power_gain_hp ? parseInt(createForm.power_gain_hp) : 0,
        torque_gain_nm: createForm.torque_gain_nm ? parseInt(createForm.torque_gain_nm) : 0,
        stage: createForm.stage as any,
        price_eur: createForm.is_free ? 0 : parseFloat(createForm.price_eur) || 0,
        is_free: createForm.is_free,
        tune_file_path: tuneFilePath,
      })
      setShowCreateModal(false)
      setCreateForm({ title: '', description: '', ecu_family: '', vehicle_make: '', vehicle_model: '', vehicle_year_start: '', vehicle_year_end: '', engine_code: '', fuel_type: 'petrol', power_gain_hp: '', torque_gain_nm: '', stage: 'stage1', price_eur: '', is_free: false })
      setUploadFile(null)
      if (activeTab === 'my-listings') loadMyData('my-listings')
    } catch (e) {
      alert('Failed to create listing: ' + (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const tabs = [
    { id: 'browse', label: 'Browse', icon: '🔍' },
    { id: 'purchases', label: 'My Purchases', icon: '📦' },
    { id: 'my-listings', label: 'My Listings', icon: '🏷️' },
  ] as const

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🏪 Tune Marketplace</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Buy and sell verified ECU tunes from trusted tuners worldwide
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleStripeConnect} disabled={connectLoading} style={btnStyle('secondary')}>
            {connectLoading ? 'Loading...' : '💳 Seller Account'}
          </button>
          {sellerSub ? (
            <button onClick={() => setShowCreateModal(true)} style={btnStyle('primary')}>
              {Icons.plus} Create Listing
            </button>
          ) : (
            <button onClick={() => navigateTo?.('pricing')} style={btnStyle('secondary')}>
              🔒 Subscribe to List
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: activeTab === t.id ? 'var(--accent)' : 'transparent',
              color: activeTab === t.id ? '#000' : 'var(--muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
        {/* Admin tab - only show if user has access */}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: activeTab === 'admin' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'admin' ? '#000' : 'var(--muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {Icons.shield} Moderation
          </button>
        )}
      </div>

      {activeTab === 'browse' && (
        <>
          {/* Search & Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '8px 14px', borderRadius: 8, flex: 1, minWidth: 200 }}>
              {Icons.search}
              <input
                type="text"
                placeholder="Search by make, model, ECU family..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(0) }}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 13, width: '100%' }}
              />
            </div>
            <select value={filters.stage || ''} onChange={e => { setFilters(f => ({ ...f, stage: e.target.value || undefined })); setPage(0) }} style={selectStyle}>
              <option value="">All Stages</option>
              <option value="stage1">Stage 1</option>
              <option value="stage2">Stage 2</option>
              <option value="stage3">Stage 3</option>
              <option value="custom">Custom</option>
            </select>
            <select value={filters.fuel_type || ''} onChange={e => { setFilters(f => ({ ...f, fuel_type: e.target.value || undefined })); setPage(0) }} style={selectStyle}>
              <option value="">All Fuels</option>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="e85">E85</option>
            </select>
            <select value={filters.sort_by || 'newest'} onChange={e => { setFilters(f => ({ ...f, sort_by: e.target.value as any })); setPage(0) }} style={selectStyle}>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Top Rated</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>

          {/* Results */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading tunes...</div>
          ) : listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏪</div>
              <div>No tunes found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Be the first to list a tune!</div>
              <button onClick={() => setShowCreateModal(true)} style={{ ...btnStyle('primary'), marginTop: 16 }}>
                {Icons.plus} Create Listing
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {listings.map(l => (
                  <div
                    key={l.id}
                    onClick={() => openDetail(l)}
                    style={{
                      background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16,
                      cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 10,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(184,240,42,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{l.title}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                        {l.is_free ? 'FREE' : `€${l.price_eur}`}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {l.vehicle_year_start}{l.vehicle_year_end && l.vehicle_year_end !== l.vehicle_year_start ? `-${l.vehicle_year_end}` : ''} {l.vehicle_make} {l.vehicle_model}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Badge text={l.ecu_family} />
                      {l.stage && <Badge text={l.stage.toUpperCase()} color="#60a5fa" />}
                      {l.fuel_type && <Badge text={l.fuel_type.toUpperCase()} color="#f97316" />}
                    </div>
                    {l.power_gain_hp > 0 && (
                      <div style={{ fontSize: 12, color: '#4ade80' }}>
                        +{l.power_gain_hp} HP / +{l.torque_gain_nm} Nm
                      </div>
                    )}
                    {l.seller?.display_name && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#000' }}>
                          {l.seller.display_name[0].toUpperCase()}
                        </span>
                        {l.seller.display_name}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} style={{ opacity: i < Math.round(l.avg_rating) ? 1 : 0.3 }}>★</span>
                        ))}
                        <span>({l.review_count})</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {l.purchase_count} sold
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...iconBtnStyle, opacity: page === 0 ? 0.3 : 1 }}>
                  {Icons.chevronLeft}
                </button>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Page {page + 1} of {Math.max(1, Math.ceil(totalCount / 20))} ({totalCount} results)
                </span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 20 >= totalCount} style={{ ...iconBtnStyle, opacity: (page + 1) * 20 >= totalCount ? 0.3 : 1 }}>
                  {Icons.chevronRight}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* My Purchases */}
      {activeTab === 'purchases' && (
        <div>
          {myPurchases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
              <div>No purchases yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {myPurchases.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.listing?.title || 'Unknown Tune'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {p.listing?.vehicle_make} {p.listing?.vehicle_model} · €{p.price_paid}
                      {' · '}Downloads: {p.download_count}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleDownload(p.id)} disabled={downloadingId === p.id} style={btnStyle('secondary')}>
                      {downloadingId === p.id ? 'Downloading...' : <>{Icons.download} Download</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Listings */}
      {activeTab === 'my-listings' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowCreateModal(true)} style={btnStyle('primary')}>
              {Icons.plus} Create Listing
            </button>
          </div>
          {myListings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏷️</div>
              <div>No listings yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Create your first tune listing</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {myListings.map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{l.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Status: <span style={{ color: l.status === 'active' ? '#4ade80' : l.status === 'pending' ? '#facc15' : '#f87171' }}>{l.status}</span>
                      {' · '}{l.purchase_count} sales · €{l.price_eur}
                    </div>
                  </div>
                  <button style={btnStyle('secondary')}>Edit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Moderation */}
      {activeTab === 'admin' && (
        <div>
          {!isAdmin ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
              <div>Admin access required</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>You need moderator permissions to view this section</div>
            </div>
          ) : pendingListings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <div>No pending listings</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>All listings have been moderated</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {pendingListings.map(l => (
                <div key={l.id} style={{ padding: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{l.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {l.vehicle_make} {l.vehicle_model} · {l.ecu_family} · €{l.price_eur}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        By: {l.seller?.display_name || 'Unknown'} · Submitted: {new Date(l.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleModerate(l.id, 'approve')} style={{ ...btnStyle('primary'), background: '#10b981' }}>
                        {Icons.check} Approve
                      </button>
                      <button onClick={() => handleModerate(l.id, 'reject')} style={{ ...btnStyle('secondary'), background: '#ef4444', color: '#fff' }}>
                        {Icons.x} Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedListing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setSelectedListing(null)}>
          <div style={{
            background: '#1a1a2e', borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '90vh',
            overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{selectedListing.title}</h3>
              <button onClick={() => setSelectedListing(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>{Icons.close}</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <InfoRow label="Vehicle" value={`${selectedListing.vehicle_year_start || ''} ${selectedListing.vehicle_make} ${selectedListing.vehicle_model}`} />
                <InfoRow label="ECU Family" value={selectedListing.ecu_family} />
                <InfoRow label="Stage" value={selectedListing.stage?.toUpperCase() || 'Custom'} />
                <InfoRow label="Fuel" value={selectedListing.fuel_type?.toUpperCase() || 'N/A'} />
                <InfoRow label="Power Gain" value={`+${selectedListing.power_gain_hp} HP`} />
                <InfoRow label="Torque Gain" value={`+${selectedListing.torque_gain_nm} Nm`} />
              </div>

              {selectedListing.description && (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
                  {selectedListing.description}
                </div>
              )}

              {/* Seller */}
              <div
                onClick={() => { setSelectedListing(null); navigateTo?.('storefront') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#000' }}>
                  {(selectedListing.seller?.display_name || 'T')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedListing.seller?.display_name || 'Unknown Tuner'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {selectedListing.seller?.is_verified ? '✓ Verified' : ''} {selectedListing.seller?.total_sales || 0} sales
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--accent)' }}>View Store →</div>
              </div>

              {/* Reviews */}
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Reviews ({reviews.length})</h4>
                {reviews.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>No reviews yet</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {reviews.slice(0, 3).map(r => (
                      <div key={r.id} style={{ padding: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} style={{ color: i < r.rating ? '#facc15' : 'var(--muted)', fontSize: 12 }}>★</span>
                          ))}
                        </div>
                        {r.body && <div style={{ marginTop: 4 }}>{r.body}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Purchase Button */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setSelectedListing(null)} style={btnStyle('secondary')}>Close</button>
                <button
                  onClick={() => handlePurchase(selectedListing.id)}
                  disabled={purchasing}
                  style={{
                    ...btnStyle('primary'),
                    opacity: purchasing ? 0.6 : 1,
                    background: purchased ? '#10b981' : 'var(--accent)',
                  }}
                >
                  {purchasing ? 'Processing...' : purchased ? '✅ Purchased!' : <>{Icons.cart} {selectedListing.is_free ? 'Get Free' : `Buy €${selectedListing.price_eur}`}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Listing Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 101,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => setShowCreateModal(false)}>
          <div style={{
            background: '#1a1a2e', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh',
            overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>🏷️ Create Tune Listing</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>{Icons.close}</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="Title" value={createForm.title} onChange={v => setCreateForm(f => ({ ...f, title: v }))} placeholder="e.g. Stage 1 Tune for A4 B9" />
                <FormField label="ECU Family" value={createForm.ecu_family} onChange={v => setCreateForm(f => ({ ...f, ecu_family: v }))} placeholder="e.g. MED17.1" />
                <FormField label="Vehicle Make" value={createForm.vehicle_make} onChange={v => setCreateForm(f => ({ ...f, vehicle_make: v }))} placeholder="e.g. Audi" />
                <FormField label="Vehicle Model" value={createForm.vehicle_model} onChange={v => setCreateForm(f => ({ ...f, vehicle_model: v }))} placeholder="e.g. A4" />
                <FormField label="Year Start" value={createForm.vehicle_year_start} onChange={v => setCreateForm(f => ({ ...f, vehicle_year_start: v }))} placeholder="2019" />
                <FormField label="Year End" value={createForm.vehicle_year_end} onChange={v => setCreateForm(f => ({ ...f, vehicle_year_end: v }))} placeholder="2023" />
                <FormField label="Engine Code" value={createForm.engine_code} onChange={v => setCreateForm(f => ({ ...f, engine_code: v }))} placeholder="e.g. CYMC" />
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Fuel Type</label>
                  <select value={createForm.fuel_type} onChange={e => setCreateForm(f => ({ ...f, fuel_type: e.target.value }))} style={inputStyle}>
                    <option value="petrol">Petrol</option>
                    <option value="diesel">Diesel</option>
                    <option value="e85">E85</option>
                    <option value="methanol">Methanol</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Stage</label>
                  <select value={createForm.stage} onChange={e => setCreateForm(f => ({ ...f, stage: e.target.value }))} style={inputStyle}>
                    <option value="stage1">Stage 1</option>
                    <option value="stage2">Stage 2</option>
                    <option value="stage3">Stage 3</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <FormField label="Power Gain (HP)" value={createForm.power_gain_hp} onChange={v => setCreateForm(f => ({ ...f, power_gain_hp: v }))} placeholder="50" />
                <FormField label="Torque Gain (Nm)" value={createForm.torque_gain_nm} onChange={v => setCreateForm(f => ({ ...f, torque_gain_nm: v }))} placeholder="80" />
                <FormField label="Price (EUR)" value={createForm.price_eur} onChange={v => setCreateForm(f => ({ ...f, price_eur: v }))} placeholder="99.99" disabled={createForm.is_free} />
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={createForm.is_free} onChange={e => setCreateForm(f => ({ ...f, is_free: e.target.checked }))} style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 13 }}>Free tune</span>
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe your tune, modifications, requirements..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Tune File</label>
                <input
                  type="file"
                  accept=".bin,.frf,.ori,.mod,.dat,.kp"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  style={{ fontSize: 13, color: 'var(--muted)' }}
                />
                {uploadFile && <div style={{ fontSize: 12, marginTop: 4, color: '#4ade80' }}>Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button onClick={() => setShowCreateModal(false)} style={btnStyle('secondary')}>Cancel</button>
                <button
                  onClick={handleCreateListing}
                  disabled={creating || !createForm.title || !createForm.ecu_family || !createForm.vehicle_make || !createForm.vehicle_model}
                  style={{ ...btnStyle('primary'), opacity: creating || !createForm.title ? 0.6 : 1 }}
                >
                  {creating ? 'Creating...' : '🏷️ Create Listing'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── UI Helpers ────────────────────────────────────────────────────

function Badge({ text, color = '#9ca3af' }: { text: string; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      background: `${color}20`, color, textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {text}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function FormField({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
      />
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary') {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  } as React.CSSProperties
  if (variant === 'primary') {
    return { ...base, background: 'var(--accent)', color: '#000' }
  }
  return { ...base, background: 'rgba(255,255,255,0.08)', color: 'inherit', border: '1px solid rgba(255,255,255,0.1)' }
}

const iconBtnStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: 'none',
  background: 'rgba(255,255,255,0.06)', color: 'var(--muted)',
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 12px', color: 'inherit', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 12px', color: 'inherit', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
