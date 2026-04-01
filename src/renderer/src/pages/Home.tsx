import type { Page } from '../App'

interface Props { setPage: (p: Page) => void }

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  scanner:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12H3M21 12h-2M12 5V3M12 21v-2"/><circle cx="12" cy="12" r="4"/><path d="M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  performance: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  tunes:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  vin:         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  voltage:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  j2534:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  devices:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M14 10h4M14 14h2"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/></svg>,
  cloning:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  unlock:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>,
  emissions:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  wiring:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>,
  dashboard:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  arrow:       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  check:       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
}

// ─── Mini Scanner Preview ─────────────────────────────────────────────────────
function ScannerPreview() {
  const dtcs = [
    { code: 'P0299', desc: 'Turbocharger underboost', sev: 'warn' },
    { code: 'P0401', desc: 'EGR flow insufficient',   sev: 'warn' },
    { code: 'P0101', desc: 'MAF sensor range/perf',   sev: 'err'  },
  ]
  const pids = [
    { label: 'RPM',   val: '2,340', unit: 'rpm', pct: 39 },
    { label: 'Boost', val: '1.24',  unit: 'bar', pct: 62 },
    { label: 'IAT',   val: '34',    unit: '°C',  pct: 28 },
  ]
  return (
    <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)', marginTop: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Fault Codes</div>
      {dtcs.map((d) => (
        <div key={d.code} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4, background: d.sev === 'err' ? 'rgba(255,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: d.sev === 'err' ? '#ff4444' : '#f59e0b', flexShrink: 0 }}>{d.code}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.desc}</span>
        </div>
      ))}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '10px 0 8px' }} />
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Live Data</div>
      {pids.map((p) => (
        <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 30, flexShrink: 0 }}>{p.label}</span>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ width: `${p.pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', width: 42, textAlign: 'right', flexShrink: 0 }}>{p.val}<span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 400 }}> {p.unit}</span></span>
        </div>
      ))}
    </div>
  )
}

// ─── Mini Map Preview ─────────────────────────────────────────────────────────
function MapPreview() {
  const heat = [
    [0.05,0.12,0.28,0.42,0.58,0.70],
    [0.10,0.22,0.38,0.55,0.72,0.85],
    [0.18,0.32,0.50,0.68,0.82,0.94],
    [0.22,0.40,0.60,0.78,0.88,0.97],
    [0.15,0.30,0.50,0.65,0.78,0.88],
  ]
  const heatColor = (v: number) => {
    if (v < 0.25) return `rgba(30,80,200,${0.4+v})`
    if (v < 0.50) return `rgba(0,190,150,${0.5+v*0.3})`
    if (v < 0.75) return `rgba(0,174,200,${0.6+v*0.2})`
    return `rgba(255,${Math.round(180-v*120)},20,${0.7+v*0.2})`
  }
  const rpms = ['800','2k','3k','4k','5k','6k']
  return (
    <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)', marginTop: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Fuel Map  ·  RPM × Load</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {heat.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 3 }}>
            {row.map((v, ci) => (
              <div key={ci} style={{ flex: 1, height: 18, borderRadius: 3, background: heatColor(v), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: v > 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                  {Math.round(v * 100)}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
          {rpms.map((r) => <span key={r} style={{ flex: 1, fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'monospace' }}>{r}</span>)}
        </div>
      </div>
    </div>
  )
}

// ─── Tool Card (small) ────────────────────────────────────────────────────────
function ToolCard({ icon, title, desc, page, setPage }: { icon: JSX.Element; title: string; desc: string; page: Page; setPage: (p: Page) => void }) {
  return (
    <div
      className="card"
      onClick={() => setPage(page)}
      style={{ padding: '15px 16px', cursor: 'pointer', transition: 'border-color .12s, transform .1s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,174,200,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
        <span style={{ color: 'var(--accent)', display: 'flex', opacity: 0.9 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', opacity: 0.5 }}>{I.arrow}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>{desc}</p>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Home({ setPage }: Props) {
  return (
    <div style={{ paddingBottom: 48, maxWidth: 1120, margin: '0 auto' }}>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '44px 28px 36px',
        background: 'radial-gradient(ellipse at 30% -20%, rgba(0,174,200,0.09) 0%, transparent 55%)',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
      }}>

        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: '#000', letterSpacing: '-0.5px', flexShrink: 0 }}>DC</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', lineHeight: 1 }}>DCTuning <span style={{ color: 'var(--accent)' }}>Desktop</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Professional ECU Diagnostics & Tuning Suite · v1.0</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ready</span>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(30px,4vw,46px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.05, marginBottom: 14, letterSpacing: '-1px' }}>
          Diagnose. Tune.<br />
          <span style={{ color: 'var(--accent)', WebkitTextStroke: '0px' }}>Dominate.</span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.75, maxWidth: 500, marginBottom: 28 }}>
          Full-stack ECU tool for professional tuners. OBD2 diagnostics, live data streaming,
          2D map editing, J2534 pass-thru and a 20-device reference library — all in one place.
        </p>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 36 }}>
          <button className="btn btn-primary" style={{ gap: 7 }} onClick={() => setPage('scanner')}>
            {I.scanner} Start Scanning
          </button>
          <button className="btn btn-ghost" style={{ gap: 7 }} onClick={() => setPage('j2534')}>
            {I.j2534} Connect Device
          </button>
          <button className="btn btn-ghost" style={{ gap: 7 }} onClick={() => setPage('vin')}>
            {I.vin} Decode VIN
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          {[
            { n: '6,500+', l: 'Vehicles in Database' },
            { n: '20+',    l: 'Compatible Devices' },
            { n: '5',      l: 'Protocols' },
            { n: '120+',   l: 'DTC Descriptions' },
            { n: '12',     l: 'Tools & Pages' },
          ].map((s, i, arr) => (
            <div key={s.l} style={{ flex: 1, paddingRight: 20, borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none', marginRight: i < arr.length - 1 ? 20 : 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '-1px', lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Protocol strip ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 28px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', padding: '12px 0', marginRight: 20, whiteSpace: 'nowrap', borderRight: '1px solid var(--border)', paddingRight: 20 }}>
          Protocols
        </span>
        {[
          { name: 'CAN Bus',  sub: 'ISO 15765',  color: '#60a5fa' },
          { name: 'K-Line',   sub: 'ISO 14230',  color: 'var(--accent)' },
          { name: 'J1850',    sub: 'PWM / VPW',  color: '#f59e0b' },
          { name: 'J2534',    sub: 'Pass-Thru',  color: '#a78bfa' },
          { name: 'ELM327',   sub: 'AT Commands', color: '#34d399' },
        ].map((p, i) => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRight: i < 4 ? '1px solid var(--border)' : 'none', whiteSpace: 'nowrap' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{p.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.sub}</span>
          </div>
        ))}
      </div>

      {/* ── Featured tools (2-up) ────────────────────────────────────────────── */}
      <div style={{ padding: '28px 28px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Featured Tools</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* ECU Scanner — featured */}
          <div
            className="card"
            onClick={() => setPage('scanner')}
            style={{ padding: '22px 22px', cursor: 'pointer', background: 'linear-gradient(135deg, rgba(0,174,200,0.05) 0%, var(--bg-card) 60%)', transition: 'border-color .12s, transform .1s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,174,200,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = '' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>{I.scanner}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>ECU Scanner</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Live hardware · OBD2</div>
                </div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'rgba(0,174,200,0.12)', border: '1px solid rgba(0,174,200,0.25)', color: 'var(--accent)' }}>LIVE</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 0 }}>
              Read & clear fault codes. 120+ DTC descriptions built in. Real-time live data — RPM, boost, AFR, MAF, IAT, TPS.
            </p>
            <ScannerPreview />
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
              Open ECU Scanner {I.arrow}
            </div>
          </div>

          {/* Performance Maps — featured */}
          <div
            className="card"
            onClick={() => setPage('performance')}
            style={{ padding: '22px 22px', cursor: 'pointer', background: 'linear-gradient(135deg, rgba(0,174,200,0.05) 0%, var(--bg-card) 60%)', transition: 'border-color .12s, transform .1s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,174,200,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = '' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>{I.performance}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Performance Maps</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>2D map editor · Heatmap</div>
                </div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: 'rgba(0,174,200,0.12)', border: '1px solid rgba(0,174,200,0.25)', color: 'var(--accent)' }}>EDITOR</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              WinOLS-style RPM × Load heatmap grid. Keyboard nav, cell editing, boost curve editor, CSV export.
            </p>
            <MapPreview />
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
              Open Map Editor {I.arrow}
            </div>
          </div>
        </div>
      </div>

      {/* ── All tools grid ───────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 28px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>All Tools</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          <ToolCard page="tunes"     icon={I.tunes}     setPage={setPage} title="Tune Manager"     desc="Import and manage ECU binaries from KESS3, Flex, Autotuner and all major flash tools." />
          <ToolCard page="vin"       icon={I.vin}       setPage={setPage} title="VIN Decoder"      desc="Full 17-character VIN lookup. Returns make, model, year, engine and ECU family." />
          <ToolCard page="voltage"   icon={I.voltage}   setPage={setPage} title="Voltage Meter"    desc="Live battery voltage via OBD2. Animated chart with charging / healthy / low / critical states." />
          <ToolCard page="j2534"     icon={I.j2534}     setPage={setPage} title="J2534 PassThru"   desc="Scans Windows registry for J2534 devices. Reads ECU version and battery on connect." />
          <ToolCard page="devices"   icon={I.devices}   setPage={setPage} title="Device Library"   desc="20+ devices covered — KESS3, Flex, Autotuner, SM2 Pro, KT200 Plus. Protocol reference & ECU matrix." />
          <ToolCard page="cloning"   icon={I.cloning}   setPage={setPage} title="ECU Cloning"      desc="Full ECU image backup before every flash. Clone between matching ECUs. One-click restore." />
          <ToolCard page="unlock"    icon={I.unlock}    setPage={setPage} title="ECU Unlock"       desc="Tricore BSL, BDM and JTAG unlock for locked Bosch MED17/EDC17 and MPC5xx processors." />
          <ToolCard page="emissions" icon={I.emissions} setPage={setPage} title="Emissions Delete" desc="DPF, EGR and EGT software delete reference for supported ECU families." />
          <ToolCard page="wiring"    icon={I.wiring}    setPage={setPage} title="Wiring Diagrams"  desc="OBD2 pinouts, ECU harness diagrams and sensor wiring reference by vehicle and connector." />
          <ToolCard page="dashboard" icon={I.dashboard} setPage={setPage} title="Dashboard"        desc="Main work area — vehicle status, quick actions and connection state once a device is live." />
        </div>
      </div>

      {/* ── Device compatibility row ──────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Hardware Compatibility</span>
          <button onClick={() => setPage('devices')} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            Full Device Library {I.arrow}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 7 }}>
          {[
            { name: 'KESS3',          sub: 'Alientech · Pro',       badge: 'Files',  bc: '#60a5fa' },
            { name: 'K-TAG',          sub: 'Alientech · Pro',       badge: 'Files',  bc: '#60a5fa' },
            { name: 'Flex',           sub: 'Magic Motorsport',      badge: 'Files',  bc: '#60a5fa' },
            { name: 'Autotuner',       sub: 'J2534 / Files',         badge: 'J2534',  bc: '#a78bfa' },
            { name: 'Tactrix OP 2.0', sub: 'Subaru / Toyota',       badge: 'J2534',  bc: '#a78bfa' },
            { name: 'SM2 Pro',        sub: 'Scanmatik · €80–130',   badge: 'J2534',  bc: '#a78bfa' },
            { name: 'PCMTuner',       sub: 'J2534 flash suite',     badge: 'J2534',  bc: '#a78bfa' },
            { name: 'KT200 II',       sub: 'Tricore BSL',           badge: 'Files',  bc: '#60a5fa' },
            { name: 'OBDLink MX+',    sub: 'STN2120 chip',          badge: 'OBD2',   bc: 'var(--accent)' },
            { name: 'ELM327',         sub: 'Diagnostics only',      badge: 'OBD2',   bc: 'var(--accent)' },
          ].map((d) => (
            <div key={d.name} className="card" style={{ padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: `${d.bc}18`, border: `1px solid ${d.bc}44`, color: d.bc, flexShrink: 0 }}>{d.badge}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
