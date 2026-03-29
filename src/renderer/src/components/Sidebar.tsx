import type { Page } from '../App'
import type { User } from '@supabase/supabase-js'
import type { Subscription } from '../lib/useSubscription'

interface Props {
  currentPage: Page
  setPage: (p: Page) => void
  user: User | null
  subscription?: Subscription | null
  isActive?: boolean
  isPro?: boolean
  isAgency?: boolean
  daysRemaining?: number | null
  onSignOut?: () => void
}

// ── Clean SVG icons (16×16 stroke-based) ─────────────────────
const Icons: Record<string, JSX.Element> = {
  home: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  vin: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  scanner: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12H3M21 12h-2M12 5V3M12 21v-2"/>
      <circle cx="12" cy="12" r="4"/>
      <path d="M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  voltage: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  wiring: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
    </svg>
  ),
  tunes: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  cloning: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  performance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
    </svg>
  ),
  emissions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  ),
  j2534: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  unlock: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    </svg>
  ),
  devices: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M14 10h4M14 14h2"/>
      <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  remap: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  ecuflash: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      <circle cx="19" cy="5" r="3" fill="currentColor" stroke="none" opacity="0.7"/>
    </svg>
  ),
  account: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  lock: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
}

// Pro-only pages that require at least Pro plan
const PRO_ONLY_PAGES: Page[] = ['tunes', 'j2534', 'unlock', 'cloning', 'emissions', 'ecuflash']

const navItems: { section: string; items: { id: Page; icon: keyof typeof Icons; label: string }[] }[] = [
  {
    section: 'DCTuning',
    items: [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'vin',       icon: 'vin',       label: 'VIN Decoder' },
    ]
  },
  {
    section: 'Diagnostics',
    items: [
      { id: 'scanner',  icon: 'scanner',  label: 'ECU Scanner' },
      { id: 'voltage',  icon: 'voltage',  label: 'Voltage Meter' },
      { id: 'wiring',   icon: 'wiring',   label: 'Wiring Diagrams' },
    ]
  },
  {
    section: 'ECU Tools',
    items: [
      { id: 'tunes',       icon: 'tunes',       label: 'Tune Manager' },
      { id: 'ecuflash',    icon: 'ecuflash',    label: 'ECU Flash' },
      { id: 'cloning',     icon: 'cloning',     label: 'ECU Cloning' },
      { id: 'performance', icon: 'performance', label: 'Performance' },
      { id: 'remap',       icon: 'remap',       label: 'Remap Builder' },
    ]
  },
  {
    section: 'Advanced',
    items: [
      { id: 'emissions', icon: 'emissions', label: 'Emissions Delete' },
      { id: 'j2534',     icon: 'j2534',     label: 'J2534 PassThru' },
      { id: 'unlock',    icon: 'unlock',    label: 'ECU Unlock' },
      { id: 'devices',   icon: 'devices',   label: 'Device Library' },
    ]
  }
]

function getPlanBadge(subscription: Subscription | null | undefined, isActive: boolean | undefined): {
  label: string
  bg: string
  color: string
} | null {
  if (!isActive || !subscription) return null
  const status = subscription.status
  if (status === 'trialing') return { label: 'TRIAL', bg: 'rgba(234,179,8,0.15)', color: '#eab308' }
  const planId = subscription.plan_id
  if (planId === 'agency') return { label: 'AGENCY', bg: 'rgba(168,85,247,0.15)', color: '#a855f7' }
  if (planId === 'pro') return { label: 'PRO', bg: 'rgba(0,174,200,0.15)', color: '#00aec8' }
  if (planId === 'starter') return { label: 'STARTER', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' }
  return null
}

function getInitials(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (user.email || 'U').slice(0, 2).toUpperCase()
}

export default function Sidebar({ currentPage, setPage, user, subscription, isActive, isPro, daysRemaining, onSignOut }: Props) {
  const planBadge = getPlanBadge(subscription, isActive)

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(0,174,200,.6)', boxShadow: '0 0 18px rgba(0,174,200,.35), 0 0 6px rgba(0,174,200,.2)', flexShrink: 0, background: '#000' }}>
            <img src="/logo.jpg" alt="DC" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name" style={{ fontSize: 14, letterSpacing: '-0.4px' }}>DCTuning</div>
            <div className="sidebar-logo-sub">Ireland · v1.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      {navItems.map((section) => (
        <div className="sidebar-section" key={section.section}>
          <div className="sidebar-section-label">{section.section}</div>
          {section.items.map((item) => {
            const isProOnly = PRO_ONLY_PAGES.includes(item.id)
            const isLocked = isProOnly && !isPro && isActive

            return (
              <div
                key={item.id}
                className={`sidebar-nav-item${currentPage === item.id ? ' active' : ''}${isLocked ? ' locked' : ''}`}
                onClick={() => setPage(item.id)}
                style={isLocked ? { opacity: 0.55 } : undefined}
                title={isLocked ? 'Pro plan required' : undefined}
              >
                <span className="nav-icon">{Icons[item.icon]}</span>
                {item.id === 'remap' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.label}
                    <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'var(--accent)', color: '#000', letterSpacing: '0.5px' }}>NEW</span>
                  </span>
                ) : item.label}
                {isLocked && (
                  <span style={{ marginLeft: 'auto', color: '#555', display: 'flex', alignItems: 'center' }}>
                    {Icons.lock}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Account section — only for logged in users */}
      {user && (
        <div className="sidebar-section" style={{ marginTop: 4 }}>
          <div className="sidebar-section-label">Account</div>
          <div
            className={`sidebar-nav-item${currentPage === 'account' ? ' active' : ''}`}
            onClick={() => setPage('account')}
          >
            {/* Avatar circle */}
            <span style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #00cce0 0%, #008fab 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              fontWeight: 900,
              color: '#000',
              flexShrink: 0,
            }}>
              {getInitials(user)}
            </span>
            <span>Billing & Account</span>
            {planBadge && (
              <span style={{
                marginLeft: 'auto',
                background: planBadge.bg,
                color: planBadge.color,
                fontSize: 8,
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: 4,
                letterSpacing: '0.4px',
                flexShrink: 0,
              }}>
                {planBadge.label}
              </span>
            )}
          </div>
          <div
            className={`sidebar-nav-item${currentPage === 'pricing' ? ' active' : ''}`}
            onClick={() => setPage('pricing')}
          >
            <span className="nav-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </span>
            Plans & Pricing
            {daysRemaining !== null && daysRemaining <= 7 && daysRemaining > 0 && (
              <span style={{
                marginLeft: 'auto',
                background: 'rgba(245,158,11,0.15)',
                color: '#f59e0b',
                fontSize: 8,
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: 4,
              }}>
                {daysRemaining}d
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div className="status-dot online" />
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Signed In</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
              {user.user_metadata?.full_name || user.email}
            </div>
            {onSignOut && (
              <div
                onClick={onSignOut}
                style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', transition: 'all .12s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,68,68,.3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div className="status-dot offline" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Not signed in</span>
            </div>
            <div
              style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => setPage('tunes')}
            >
              Sign in →
            </div>
          </>
        )}
        <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 10, opacity: 0.5 }}>
          DCTuning Ireland · v1.0
        </div>
      </div>
    </aside>
  )
}
