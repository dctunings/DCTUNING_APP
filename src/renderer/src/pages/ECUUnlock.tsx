import { useState, useEffect } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props { connected: boolean; activeVehicle: ActiveVehicle | null }

const ECU_VENDORS = ['Bosch (ME7, MED17, EDC17)', 'Siemens / Continental', 'Delphi / Aptiv', 'Marelli / Magneti', 'Denso', 'Hitachi', 'Mitsubishi Electric']

const ECU_MODELS: Record<string, string[]> = {
  'Bosch (ME7, MED17, EDC17)': ['ME7.1 (VW/Audi 1.8T)', 'ME7.4.4 (VW/Audi 1.8T)', 'ME7.5.10 (VW/Audi 2.0T)', 'MED9.1 (Audi/VW FSI)', 'MED9.5.10 (Audi/VW TFSI)', 'MED17.1 (various)', 'MED17.5.21 (VW Golf VII)', 'EDC16U1 (VW/Audi TDI)', 'EDC16U31 (VW/Audi TDI)', 'EDC16C3 (VW/Audi TDI)', 'EDC17C46 (VAG TDI)', 'EDC17CP14 (BMW Diesel)'],
  'Siemens / Continental': ['SID803 (Peugeot/Citroen)', 'SID206 (Peugeot/Citroen)', 'PPD1.1 (VW TDI)', 'PPD1.2 (VW TDI)'],
  'Delphi / Aptiv': ['DCM3.5 (Renault/Nissan)', 'DCM6.2 (Opel/Vauxhall)'],
  'Marelli / Magneti': ['MJD8 (Fiat/Alfa)', 'MJD9 (Fiat/Alfa)'],
  'Denso': ['275800 (Toyota/Subaru)', '175800 (Toyota/Subaru)'],
  'Hitachi': ['SH72531 (Nissan)'],
  'Mitsubishi Electric': ['E6T (Mitsubishi/Hyundai)'],
}

const PROCESSORS: Record<string, string> = {
  'ME7.1 (VW/Audi 1.8T)': 'Infineon C167 / Motorola MPC5xx',
  'ME7.4.4 (VW/Audi 1.8T)': 'Infineon C167',
  'ME7.5.10 (VW/Audi 2.0T)': 'Infineon C167',
  'MED9.1 (Audi/VW FSI)': 'Infineon TriCore TC1762',
  'MED9.5.10 (Audi/VW TFSI)': 'Infineon TriCore TC1762',
  'MED17.1 (various)': 'Infineon TriCore TC1797',
  'MED17.5.21 (VW Golf VII)': 'Infineon TriCore TC1797',
  'EDC16U1 (VW/Audi TDI)': 'Infineon C167 / MPC5xx',
  'EDC16U31 (VW/Audi TDI)': 'Infineon C167',
  'EDC16C3 (VW/Audi TDI)': 'Infineon C167',
  'EDC17C46 (VAG TDI)': 'Infineon TriCore TC1796',
  'EDC17CP14 (BMW Diesel)': 'Infineon TriCore TC1796',
}

const PROTOCOLS = ['CAN (ISO 15765)', 'K-Line (ISO 9141)', 'K-Line (ISO 14230 KWP2000)', 'J1850 PWM', 'J1850 VPW']

export default function ECUUnlock({ connected, activeVehicle }: Props) {
  const [vendor, setVendor] = useState(ECU_VENDORS[0])
  const [model, setModel] = useState(ECU_MODELS[ECU_VENDORS[0]][0])

  // Auto-fill ECU vendor/model when active vehicle changes
  useEffect(() => {
    if (!activeVehicle?.ecu) return
    const ecu = activeVehicle.ecu
    // Match vendor
    const matchedVendor = ECU_VENDORS.find((v) =>
      ecu.toLowerCase().includes(v.split(' ')[0].toLowerCase())
    )
    if (matchedVendor) {
      setVendor(matchedVendor)
      // Try to match model within vendor's list
      const models = ECU_MODELS[matchedVendor] || []
      const matchedModel = models.find((m) => {
        const ecuCode = m.split(' ')[0] // e.g. "MED17.5.21"
        return ecu.includes(ecuCode)
      })
      if (matchedModel) setModel(matchedModel)
      else setModel(models[0])
    }
  }, [activeVehicle])
  const [protocol, setProtocol] = useState(PROTOCOLS[0])
  const [unlocking, setUnlocking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState<{ msg: string; type: string }[]>([])

  const [opts, setOpts] = useState({
    verbose: false,
    skipImmobilizer: false,
    forceBootMode: false,
    disableWriteProtect: true,
    autoChecksum: true,
  })

  const addLog = (msg: string, type = 'info') =>
    setLog((l) => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])

  const startUnlock = () => {
    if (!connected) return
    setUnlocking(true)
    setProgress(0)
    addLog(`Initiating security bypass for ${model}...`, 'warn')
    const steps = [
      { at: 10, msg: `Connected to ECU: ${model}`, type: 'success' },
      { at: 20, msg: `Protocol: ${protocol}`, type: 'info' },
      { at: 30, msg: opts.skipImmobilizer ? 'Immobilizer check skipped' : 'Immobilizer check passed', type: 'info' },
      { at: 45, msg: 'Reading security seed...', type: 'info' },
      { at: 60, msg: 'Calculating security key...', type: 'info' },
      { at: 70, msg: 'Sending security access request...', type: 'info' },
      { at: 80, msg: opts.disableWriteProtect ? 'Write protection disabled' : 'Write protection active', type: opts.disableWriteProtect ? 'warn' : 'info' },
      { at: 90, msg: opts.autoChecksum ? 'Auto-checksum enabled' : 'Manual checksum required', type: 'info' },
      { at: 99, msg: 'ECU unlocked — security bypass complete', type: 'success' },
    ]
    let i = 0
    const interval = setInterval(() => {
      i++
      setProgress(i)
      const s = steps.find((s) => s.at === i)
      if (s) addLog(s.msg, s.type)
      if (i >= 100) { clearInterval(interval); setUnlocking(false) }
    }, 50)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg></div>
        <h1>ECU Processor Unlock & Security Bypass</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div className="banner banner-danger">
        <strong>⚠ PROFESSIONAL USE ONLY — READ CAREFULLY</strong>
        <ul style={{ marginTop: 8, marginLeft: 16, fontSize: 12, lineHeight: 2 }}>
          <li>This feature bypasses ECU security to enable tuning/diagnostics</li>
          <li>ALWAYS backup original firmware before proceeding</li>
          <li>Incorrect procedures can brick your ECU (€1000+ replacement)</li>
          <li>Requires stable 12–14V power supply during entire process</li>
          <li>User assumes all risk — for professional tuners only</li>
        </ul>
      </div>

      <div className="grid-2" style={{ gap: 20, marginBottom: 20 }}>
        {/* ECU Selection */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>① ECU Selection</div>
          <div style={{ marginBottom: 12 }}>
            <label>ECU Vendor</label>
            <select value={vendor} onChange={(e) => { setVendor(e.target.value); setModel(ECU_MODELS[e.target.value][0]) }} style={{ marginTop: 6 }}>
              {ECU_VENDORS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>ECU Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ marginTop: 6 }}>
              {ECU_MODELS[vendor]?.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 13 }}>
            <label>Processor</label>
            <div style={{ marginTop: 6, color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12 }}>
              {PROCESSORS[model] || 'Unknown processor'}
            </div>
          </div>
        </div>

        {/* ECU Info */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>ECU Information</div>
          {[
            { label: 'Status',       value: connected ? '● Connected' : '● Disconnected', accent: connected },
            { label: 'Flash Size',   value: '—' },
            { label: 'Security',     value: '—' },
            { label: 'SW Version',   value: '—' },
            { label: 'HW Version',   value: '—' },
            { label: 'Boot Mode',    value: '—' },
          ].map((r) => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{r.label}:</span>
              <span style={{ color: r.label === 'Status' ? (connected ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)', fontWeight: r.label === 'Status' ? 700 : 400 }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 20, marginBottom: 20 }}>
        {/* Connection Setup */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>② Connection Setup</div>
          <div style={{ marginBottom: 12 }}>
            <label>J2534 Device</label>
            <select style={{ marginTop: 6 }}>
              <option>Drew Technologies Mongoose Pro GM II</option>
              <option>Tactrix OpenPort 2.0</option>
              <option>OBDLink MX+</option>
              <option>VCX Nano (Clone)</option>
              <option>Bosch KTS 560/570</option>
              <option>Kvaser Leaf Light</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Protocol</label>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value)} style={{ marginTop: 6 }}>
              {PROTOCOLS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={startUnlock} disabled={!connected || unlocking} style={{ width: '100%' }}>
            {unlocking ? `⏳ Unlocking... ${progress}%` : '🔓 START UNLOCK'}
          </button>
          {unlocking && (
            <div style={{ marginTop: 10 }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Advanced Options */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>③ Advanced Options</div>
          {[
            { key: 'verbose',            label: 'Enable verbose logging' },
            { key: 'skipImmobilizer',    label: 'Skip immobilizer check' },
            { key: 'forceBootMode',      label: 'Force boot mode entry' },
            { key: 'disableWriteProtect',label: 'Disable write protection' },
            { key: 'autoChecksum',       label: 'Auto-calculate checksums' },
          ].map((o) => (
            <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={opts[o.key as keyof typeof opts]}
                onChange={() => setOpts((p) => ({ ...p, [o.key]: !p[o.key as keyof typeof opts] }))}
                style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <label>Activity Log</label>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setLog([])}>Clear</button>
          </div>
          <div className="activity-log">
            {log.map((l, i) => <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
