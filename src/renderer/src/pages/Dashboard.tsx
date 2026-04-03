import { useEffect, useState } from 'react'
import type { Page } from '../App'
import { supabase } from '../lib/supabase'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props {
  setPage: (p: Page) => void
  connected: boolean
  activeVehicle: ActiveVehicle | null
}

// Clean SVG icons for quick action cards
const QAIcons: Record<string, JSX.Element> = {
  vin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  ),
  scanner: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12H3M21 12h-2M12 5V3M12 21v-2"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  ),
  cloning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  j2534: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  emissions: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  ),
  unlock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    </svg>
  ),
  performance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
    </svg>
  ),
  tunes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
}

const quickActions: { id: Page; icon: keyof typeof QAIcons; label: string; desc: string; color?: string }[] = [
  { id: 'vin',        icon: 'vin',        label: 'VIN Decoder',     desc: 'Decode any VIN & match to DB' },
  { id: 'scanner',    icon: 'scanner',    label: 'ECU Scanner',     desc: 'Read & clear fault codes' },
  { id: 'cloning',    icon: 'cloning',    label: 'ECU Cloning',     desc: 'Read / write / clone ECU' },
  { id: 'j2534',      icon: 'j2534',      label: 'J2534 PassThru',  desc: 'Direct hardware interface' },
  { id: 'emissions',  icon: 'emissions',  label: 'Emissions Delete', desc: 'DPF / EGR / AdBlue delete' },
  { id: 'unlock',     icon: 'unlock',     label: 'ECU Unlock',      desc: 'Security & checksum bypass' },
]

export default function Dashboard({ setPage, connected, activeVehicle }: Props) {
  const [vehicleCount, setVehicleCount] = useState(0)
  const [makeCount, setMakeCount] = useState(0)

  useEffect(() => {
    supabase.from('vehicle_database').select('*', { count: 'exact', head: true })
      .then(({ count }) => setVehicleCount(count || 0))
    supabase.rpc('get_vehicle_makes')
      .then(({ data }) => { if (data) setMakeCount(data.length) })
  }, [])

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
          }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.4px' }}>DCTuning</h1>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 18 }}>
          Professional ECU Remapping Suite · Ireland
        </p>
      </div>

      {/* Stats row */}
      <div className="grid-3" style={{ marginBottom: 22 }}>
        <div className="stat-box">
          <div className="stat-label">Vehicle Database</div>
          <div className="stat-value">{vehicleCount.toLocaleString()}</div>
          <div className="stat-sub">{makeCount} manufacturers</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Device Status</div>
          <div style={{ marginTop: 6, marginBottom: 4 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 700,
              color: connected ? 'var(--success)' : 'var(--text-muted)',
            }}>
              <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
              {connected ? 'OBD2 Connected' : 'Not Connected'}
            </span>
          </div>
          <div className="stat-sub">J2534 / ELM327</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Software</div>
          <div className="stat-value" style={{ fontSize: 22 }}>v{__APP_VERSION__}</div>
          <div className="stat-sub">DCTuning</div>
        </div>
      </div>

      {/* Active vehicle panel */}
      {activeVehicle && (
        <div className="card card-accent" style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12, opacity: 0.7 }}>
            Active Vehicle
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.3px', marginBottom: 4 }}>
                {activeVehicle.make} {activeVehicle.model}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 6 }}>
                {activeVehicle.variant} · {activeVehicle.year_from}–{activeVehicle.year_to ?? '—'}
              </div>
              <code style={{
                background: 'rgba(0,174,200,0.08)', border: '1px solid rgba(0,174,200,0.18)',
                borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--accent)',
              }}>
                {activeVehicle.ecu}
              </code>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>{activeVehicle.ps}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>PS · {activeVehicle.kw} kW</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeVehicle.fuel_type}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <button className="btn btn-primary"    style={{ fontSize: 11, height: 30, padding: '0 12px' }} onClick={() => setPage('scanner')}>Scan ECU</button>
            <button className="btn btn-secondary"  style={{ fontSize: 11, height: 30, padding: '0 12px' }} onClick={() => setPage('cloning')}>Clone</button>
            <button className="btn btn-secondary"  style={{ fontSize: 11, height: 30, padding: '0 12px' }} onClick={() => setPage('unlock')}>Unlock</button>
            <button className="btn btn-secondary"  style={{ fontSize: 11, height: 30, padding: '0 12px' }} onClick={() => setPage('performance')}>Performance</button>
          </div>
        </div>
      )}

      {/* Quick access */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        Quick Access
      </div>
      <div className="grid-3" style={{ gap: 10 }}>
        {quickActions.map((a) => (
          <div
            key={a.id}
            className="card"
            onClick={() => setPage(a.id)}
            style={{ cursor: 'pointer', padding: '16px 18px', transition: 'border-color 0.12s, background 0.12s' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,174,200,0.3)'
              e.currentTarget.style.background = 'var(--bg-card-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'var(--bg-card)'
            }}
          >
            <div style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
              {QAIcons[a.icon]}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, color: 'var(--text-primary)' }}>{a.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{a.desc}</div>
          </div>
        ))}
      </div>

      {/* Footer bar */}
      <div style={{
        marginTop: 22, padding: '10px 14px',
        background: 'var(--bg-card)', borderRadius: 8,
        border: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-muted)',
        display: 'flex', gap: 20, alignItems: 'center',
      }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>DCTuning Ireland</span>
        <span>Supabase Cloud DB</span>
        <span>OBD2 · J2534 · KWP2000 · UDS</span>
        <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 600 }}>v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
