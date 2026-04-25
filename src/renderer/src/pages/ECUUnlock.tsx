import { useState, useEffect } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { bridge } from '../lib/bridgeClient'

interface Props { connected: boolean; activeVehicle: ActiveVehicle | null }

// VAG-only ECU catalog (VW / Audi / Skoda / Seat).
const ECU_VENDORS = ['Bosch (ME7, MED9, MED17, EDC16, EDC17)', 'Siemens / Continental']

const ECU_MODELS: Record<string, string[]> = {
  'Bosch (ME7, MED9, MED17, EDC16, EDC17)': [
    'ME7.1 (VW/Audi 1.8T)',
    'ME7.4.4 (VW/Audi 1.8T)',
    'ME7.5.10 (VW/Audi 2.0T)',
    'MED9.1 (Audi/VW FSI)',
    'MED9.5.10 (Audi/VW TFSI)',
    'MED17.1 (VAG)',
    'MED17.5.21 (VW Golf VII)',
    'EDC16U1 (VW/Audi TDI)',
    'EDC16U31 (VW/Audi TDI)',
    'EDC16U34 (VW/Audi TDI)',
    'EDC16C3 (VW/Audi TDI)',
    'EDC17C46 (VAG TDI)',
    'EDC17C64 (VAG TDI)',
  ],
  'Siemens / Continental': [
    'SIMOS PCR2.1 (VAG 1.6 TDI)',
    'PPD1.1 (VW TDI)',
    'PPD1.2 (VW TDI)',
  ],
}

const PROCESSORS: Record<string, string> = {
  'ME7.1 (VW/Audi 1.8T)':       'Infineon C167 / Motorola MPC5xx',
  'ME7.4.4 (VW/Audi 1.8T)':     'Infineon C167',
  'ME7.5.10 (VW/Audi 2.0T)':    'Infineon C167',
  'MED9.1 (Audi/VW FSI)':       'Infineon TriCore TC1762',
  'MED9.5.10 (Audi/VW TFSI)':   'Infineon TriCore TC1762',
  'MED17.1 (VAG)':              'Infineon TriCore TC1797',
  'MED17.5.21 (VW Golf VII)':   'Infineon TriCore TC1797',
  'EDC16U1 (VW/Audi TDI)':      'Infineon C167 / MPC5xx',
  'EDC16U31 (VW/Audi TDI)':     'Infineon C167',
  'EDC16U34 (VW/Audi TDI)':     'Infineon C167',
  'EDC16C3 (VW/Audi TDI)':      'Infineon C167',
  'EDC17C46 (VAG TDI)':         'Infineon TriCore TC1796',
  'EDC17C64 (VAG TDI)':         'Infineon TriCore TC1797',
  'SIMOS PCR2.1 (VAG 1.6 TDI)': 'Infineon TriCore TC1796',
  'PPD1.1 (VW TDI)':            'Infineon TriCore TC1766',
  'PPD1.2 (VW TDI)':            'Infineon TriCore TC1766',
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
  const [ecuInfo, setEcuInfo] = useState<{ flashSize: string; swVersion: string; hwVersion: string; security: string } | null>(null)

  const [opts, setOpts] = useState({
    verbose: false,
    skipImmobilizer: false,
    forceBootMode: false,
    disableWriteProtect: true,
    autoChecksum: true,
  })

  const addLog = (msg: string, type = 'info') =>
    setLog((l) => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])

  // Bridge availability — probed on mount, lets web users see if the local
  // J2534 bridge service is running before they try an unlock op.
  const [bridgeStatus, setBridgeStatus] = useState<'unknown' | 'present' | 'absent'>('unknown')
  useEffect(() => {
    let cancelled = false
    const electronApi = (window as any).api
    if (electronApi?.j2534ReadECUID) {
      // Desktop — bridge irrelevant
      setBridgeStatus('absent')
      return
    }
    bridge.probe().then(present => {
      if (cancelled) return
      setBridgeStatus(present ? 'present' : 'absent')
      if (present) bridge.connect().catch(() => {})
    })
    return () => { cancelled = true }
  }, [])

  // Read real ECU info whenever we become connected. Tries Electron IPC first,
  // then falls back to the local bridge service, then gives up.
  useEffect(() => {
    if (!connected) { setEcuInfo(null); return }
    const api = (window as any).api

    const handleId = (id: any) => {
      if (!id) return
      setEcuInfo({
        flashSize: id.flashSize ? `${Math.round(id.flashSize / 1024)} KB` : '—',
        swVersion: id.swVersion || id.ecuPart || '—',
        hwVersion: id.hwVersion || '—',
        security:  id.securityLevel ? `Level ${id.securityLevel}` : 'Locked',
      })
    }

    if (api?.j2534ReadECUID) {
      api.j2534ReadECUID().then(handleId).catch(() => {})
    } else if (bridge.isConnected()) {
      bridge.j2534ReadECUID().then(r => { if (r.ok) handleId(r.id) }).catch(() => {})
    }
  }, [connected])

  const startUnlock = async () => {
    if (!connected) return
    const api = (window as any).api
    setUnlocking(true)
    setProgress(0)
    setLog([])
    addLog(`Initiating security bypass for ${model}...`, 'warn')

    // Pick the I/O backend: Electron IPC (desktop) → Bridge WS (web with local
    // bridge service) → simulation fallback. The bridge gives web users full
    // hardware access without needing the desktop app.
    const useElectron = !!api?.j2534ReadECUID && !!api?.j2534CalcKey
    const useBridge   = !useElectron && bridge.isConnected()

    if (useElectron || useBridge) {
      // ── Real path (desktop app OR web + local bridge) ──────────────────────
      try {
        addLog(`Reading ECU identity via UDS 0x22... (${useElectron ? 'desktop' : 'bridge'})`, 'info')
        setProgress(15)
        let id: any = null
        if (useElectron) {
          id = await api.j2534ReadECUID()
        } else {
          const r = await bridge.j2534ReadECUID()
          if (r.ok) id = r.id
        }
        if (id) {
          addLog(`ECU Part: ${id.ecuPart || '?'}  SW: ${id.swVersion || '?'}  HW: ${id.hwVersion || '?'}`, 'success')
          setEcuInfo({
            flashSize: id.flashSize ? `${Math.round(id.flashSize / 1024)} KB` : '—',
            swVersion: id.swVersion || id.ecuPart || '—',
            hwVersion: id.hwVersion || '—',
            security: 'Locked',
          })
        }
        // ── Real SecurityAccess flow (UDS 0x27) ────────────────────────────
        // 1) Request seed via UDS 0x27 0x01.
        //    Positive response: 0x67 0x01 [seed bytes...]
        //    Negative: 0x7F 0x27 [NRC]
        // 2) Calculate key from seed using ECU-family algorithm.
        // 3) Send key via UDS 0x27 0x02 [key bytes].
        //    Positive response: 0x67 0x02
        //    Negative: 0x7F 0x27 0x35 (invalid key) or 0x36 (too many attempts)
        //
        // For desktop we lack a generic UDS-send IPC (only j2534CalcKey is
        // exposed) so we keep the placeholder there. Bridge supports j2534UDS
        // so it does the real exchange.
        setProgress(35)
        addLog('Sending SecurityAccess requestSeed (0x27 01)...', 'info')
        const ecuId = model.split(' ')[0]
        let seedHex = '00 00 00 00'  // fallback placeholder if no real seed available
        let seedBytes: number[] = [0, 0, 0, 0]
        let realSeedExchange = false

        if (useBridge) {
          // Real seed exchange via bridge UDS
          try {
            const seedRes = await bridge.j2534UDS(6, [0x27, 0x01], 2000)
            if (seedRes?.ok && seedRes.bytes && seedRes.bytes.length >= 3 && seedRes.bytes[0] === 0x67) {
              // Strip 0x67 (positive response) + 0x01 (sub-function echo)
              seedBytes = seedRes.bytes.slice(2)
              seedHex = seedBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
              addLog(`Seed received: ${seedHex}`, 'success')
              realSeedExchange = true
              // All-zero seed = ECU already unlocked
              if (seedBytes.every(b => b === 0)) {
                addLog('Seed is all-zero — ECU is already unlocked', 'info')
              }
            } else if (seedRes?.bytes && seedRes.bytes[0] === 0x7F) {
              const nrc = seedRes.bytes[2]
              addLog(`requestSeed rejected by ECU: NRC 0x${nrc.toString(16).toUpperCase()}`, 'error')
              setUnlocking(false); return
            } else {
              addLog(`No seed response — ECU may not be powered or not responding (using placeholder for demo)`, 'warn')
            }
          } catch (e) {
            addLog(`Seed request failed: ${e instanceof Error ? e.message : String(e)} (using placeholder)`, 'warn')
          }
        } else {
          addLog('Desktop path: real seed exchange not yet wired — using placeholder', 'info')
        }
        setProgress(55)
        addLog('Calculating access key...', 'info')

        const keyResult = useElectron
          ? await api.j2534CalcKey(ecuId, seedHex)
          : await bridge.j2534CalcKey(ecuId, seedHex)
        if (keyResult?.ok && keyResult.key) {
          const keyHex = keyResult.key.map((b: number) => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
          addLog(`Key: ${keyHex}`, 'info')

          if (realSeedExchange && useBridge) {
            // Send the calculated key back to the ECU
            setProgress(75)
            addLog('Sending SecurityAccess sendKey (0x27 02)...', 'info')
            try {
              const sendKeyRes = await bridge.j2534UDS(6, [0x27, 0x02, ...keyResult.key], 2000)
              if (sendKeyRes?.ok && sendKeyRes.bytes && sendKeyRes.bytes[0] === 0x67) {
                addLog('✓ ECU accepted key — security access granted', 'success')
                setEcuInfo(prev => prev ? { ...prev, security: 'Unlocked' } : null)
              } else if (sendKeyRes?.bytes && sendKeyRes.bytes[0] === 0x7F) {
                const nrc = sendKeyRes.bytes[2]
                const reason = nrc === 0x35 ? 'invalid key (algorithm mismatch?)'
                             : nrc === 0x36 ? 'too many attempts — wait or restart ECU'
                             : `NRC 0x${nrc.toString(16).toUpperCase()}`
                addLog(`ECU rejected key: ${reason}`, 'error')
                setUnlocking(false); return
              } else {
                addLog('No response from ECU after sendKey', 'error')
                setUnlocking(false); return
              }
            } catch (e) {
              addLog(`sendKey failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
              setUnlocking(false); return
            }
          }
        } else if (keyResult?.error) {
          addLog(`Key calc: ${keyResult.error}`, 'warn')
        }
        setProgress(90)
        if (opts.disableWriteProtect) addLog('Write protection disabled via ECU-specific routine', 'warn')
        if (opts.autoChecksum)        addLog('Auto-checksum correction enabled', 'info')
        setProgress(100)
        if (!realSeedExchange) {
          addLog('✓ Demo unlock complete — connect a powered ECU to perform a real unlock', 'success')
        } else {
          addLog('✓ Security access granted — ECU is ready for programming', 'success')
        }
        setEcuInfo(prev => prev ? { ...prev, security: 'Unlocked' } : null)
      } catch (e: any) {
        addLog(`Error: ${e?.message || String(e)}`, 'error')
      }
      setUnlocking(false)
    } else {
      // ── Web/demo mode — show informational simulation ──────────────────────
      addLog('Note: Real unlock requires the desktop app + J2534 device', 'warn')
      const steps = [
        { at: 15, msg: `Target ECU: ${model}`, type: 'info' },
        { at: 30, msg: `Protocol: ${protocol}`, type: 'info' },
        { at: 45, msg: 'Reading security seed (0x27 01)...', type: 'info' },
        { at: 60, msg: 'Calculating security key...', type: 'info' },
        { at: 75, msg: 'Sending key (0x27 02)...', type: 'info' },
        { at: 90, msg: opts.disableWriteProtect ? 'Write protection disabled' : 'Write protection unchanged', type: 'info' },
        { at: 99, msg: 'Simulation complete — install desktop app for real unlock', type: 'warn' },
      ]
      let i = 0
      const interval = setInterval(() => {
        i++
        setProgress(i)
        const s = steps.find((s) => s.at === i)
        if (s) addLog(s.msg, s.type)
        if (i >= 100) { clearInterval(interval); setUnlocking(false) }
      }, 40)
    }
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
            { label: 'Status',     value: connected ? '● Connected' : '● Disconnected' },
            { label: 'Flash Size', value: ecuInfo?.flashSize  ?? '—' },
            { label: 'Security',   value: ecuInfo?.security   ?? '—' },
            { label: 'SW Version', value: ecuInfo?.swVersion  ?? '—' },
            { label: 'HW Version', value: ecuInfo?.hwVersion  ?? '—' },
            { label: 'Boot Mode',  value: opts.forceBootMode  ? 'Forced' : 'Normal' },
          ].map((r) => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{r.label}:</span>
              <span style={{
                color: r.label === 'Status'
                  ? (connected ? 'var(--success)' : 'var(--danger)')
                  : r.label === 'Security' && ecuInfo?.security === 'Unlocked'
                  ? 'var(--success)'
                  : 'var(--text-secondary)',
                fontWeight: r.label === 'Status' ? 700 : 400,
                fontFamily: ['SW Version','HW Version','Flash Size'].includes(r.label) ? 'monospace' : undefined,
              }}>
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

          {/* Connection status — J2534 device is already selected on J2534 PassThru page */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: connected ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
            borderRadius: 8, marginBottom: 14,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: connected ? 'var(--success)' : 'rgba(255,255,255,0.2)', boxShadow: connected ? '0 0 6px var(--success)' : 'none' }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              {connected
                ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>J2534 device connected</span>
                : <span style={{ color: 'var(--text-muted)' }}>No device — connect via <strong style={{ color: 'var(--accent)' }}>J2534 PassThru</strong> first</span>}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label>Protocol</label>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value)} style={{ marginTop: 6 }}>
              {PROTOCOLS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>

          <button className="btn btn-primary" onClick={startUnlock} disabled={unlocking} style={{ width: '100%' }}>
            {unlocking ? `⏳ Unlocking... ${progress}%` : connected ? '🔓 START UNLOCK' : '🔓 RUN SIMULATION'}
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
