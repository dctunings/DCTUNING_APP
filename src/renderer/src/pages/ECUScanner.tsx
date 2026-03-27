import { useState, useEffect, useRef } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props { connected: boolean; activeVehicle: ActiveVehicle | null }

interface DTCCode {
  code: string
  description: string
  status: 'active' | 'pending' | 'stored'
}

interface LivePID {
  pid: string
  name: string
  value: number
  unit: string
}

// Basic DTC lookup for common codes — extended with common European car faults
const DTC_DB: Record<string, string> = {
  P0001: 'Fuel Volume Regulator Control Circuit Open',
  P0002: 'Fuel Volume Regulator Control Circuit Range/Performance',
  P0016: 'Crankshaft Position - Camshaft Position Correlation (Bank 1 Sensor A)',
  P0087: 'Fuel Rail/System Pressure Too Low',
  P0088: 'Fuel Rail/System Pressure Too High',
  P0097: 'Intake Air Temp Sensor 2 Circuit Low',
  P0099: 'Intake Air Temp Sensor 2 Circuit Intermittent/Erratic',
  P0100: 'Mass or Volume Air Flow Circuit Malfunction',
  P0101: 'Mass Air Flow Circuit Range/Performance',
  P0102: 'Mass Air Flow Circuit Low Input',
  P0103: 'Mass Air Flow Circuit High Input',
  P0105: 'Manifold Absolute Pressure Circuit Malfunction',
  P0106: 'MAP Circuit Range/Performance',
  P0107: 'MAP Circuit Low Input',
  P0108: 'MAP Circuit High Input',
  P0110: 'Intake Air Temperature Circuit Malfunction',
  P0111: 'Intake Air Temperature Circuit Range/Performance',
  P0112: 'Intake Air Temperature Circuit Low Input',
  P0113: 'Intake Air Temperature Circuit High Input',
  P0115: 'Engine Coolant Temperature Circuit Malfunction',
  P0116: 'Engine Coolant Temperature Circuit Range/Performance',
  P0117: 'Engine Coolant Temperature Circuit Low Input',
  P0118: 'Engine Coolant Temperature Circuit High Input',
  P0120: 'Throttle/Pedal Position Sensor A Circuit Malfunction',
  P0121: 'Throttle Position Sensor Range/Performance',
  P0122: 'Throttle Position Sensor Low Input',
  P0123: 'Throttle Position Sensor High Input',
  P0128: 'Coolant Temperature Below Thermostat Regulating Temperature',
  P0130: 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 1)',
  P0131: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)',
  P0132: 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 1)',
  P0133: 'O2 Sensor Circuit Slow Response (Bank 1 Sensor 1)',
  P0134: 'O2 Sensor Circuit No Activity Detected (Bank 1 Sensor 1)',
  P0171: 'System Too Lean (Bank 1)',
  P0172: 'System Too Rich (Bank 1)',
  P0174: 'System Too Lean (Bank 2)',
  P0175: 'System Too Rich (Bank 2)',
  P0190: 'Fuel Rail Pressure Sensor Circuit Malfunction',
  P0191: 'Fuel Rail Pressure Sensor Circuit Range/Performance',
  P0193: 'Fuel Rail Pressure Sensor Circuit High Input',
  P0200: 'Injector Circuit Malfunction',
  P0201: 'Injector Circuit Malfunction — Cylinder 1',
  P0202: 'Injector Circuit Malfunction — Cylinder 2',
  P0203: 'Injector Circuit Malfunction — Cylinder 3',
  P0204: 'Injector Circuit Malfunction — Cylinder 4',
  P0230: 'Fuel Pump Primary Circuit Malfunction',
  P0234: 'Turbocharger/Supercharger A Overboost Condition',
  P0236: 'Turbocharger Boost Sensor A Circuit Range/Performance',
  P0237: 'Turbocharger Boost Sensor A Circuit Low',
  P0238: 'Turbocharger Boost Sensor A Circuit High',
  P0243: 'Turbocharger Wastegate Solenoid A Malfunction',
  P0244: 'Turbocharger Wastegate Solenoid A Range/Performance',
  P0245: 'Turbocharger Wastegate Solenoid A Low',
  P0246: 'Turbocharger Wastegate Solenoid A High',
  P0261: 'Cylinder 1 Injector Circuit Low',
  P0263: 'Cylinder 1 Contribution/Balance Fault',
  P0299: 'Turbocharger/Supercharger Underboost Condition',
  P0300: 'Random/Multiple Cylinder Misfire Detected',
  P0301: 'Cylinder 1 Misfire Detected',
  P0302: 'Cylinder 2 Misfire Detected',
  P0303: 'Cylinder 3 Misfire Detected',
  P0304: 'Cylinder 4 Misfire Detected',
  P0305: 'Cylinder 5 Misfire Detected',
  P0306: 'Cylinder 6 Misfire Detected',
  P0335: 'Crankshaft Position Sensor A Circuit Malfunction',
  P0336: 'Crankshaft Position Sensor A Circuit Range/Performance',
  P0340: 'Camshaft Position Sensor A Circuit Malfunction (Bank 1)',
  P0341: 'Camshaft Position Sensor A Circuit Range/Performance',
  P0380: 'Glow Plug/Heater Circuit A Malfunction',
  P0381: 'Glow Plug/Heater Indicator Circuit Malfunction',
  P0400: 'Exhaust Gas Recirculation Flow Malfunction',
  P0401: 'Exhaust Gas Recirculation Flow Insufficient Detected',
  P0402: 'Exhaust Gas Recirculation Flow Excessive Detected',
  P0403: 'Exhaust Gas Recirculation Control Circuit Malfunction',
  P0404: 'EGR Control Circuit Range/Performance',
  P0405: 'EGR Sensor A Circuit Low',
  P0406: 'EGR Sensor A Circuit High',
  P0420: 'Catalyst System Efficiency Below Threshold (Bank 1)',
  P0430: 'Catalyst System Efficiency Below Threshold (Bank 2)',
  P0440: 'Evaporative Emission Control System Malfunction',
  P0441: 'EVAP Emission Control System Incorrect Purge Flow',
  P0442: 'EVAP Emission Control System Leak Detected (Small)',
  P0455: 'EVAP Emission Control System Leak Detected (Large)',
  P0470: 'Exhaust Pressure Sensor Malfunction',
  P0471: 'Exhaust Pressure Sensor Range/Performance',
  P0472: 'Exhaust Pressure Sensor Low',
  P0473: 'Exhaust Pressure Sensor High',
  P0480: 'Cooling Fan 1 Control Circuit Malfunction',
  P0481: 'Cooling Fan 2 Control Circuit Malfunction',
  P0500: 'Vehicle Speed Sensor Malfunction',
  P0501: 'Vehicle Speed Sensor Range/Performance',
  P0506: 'Idle Air Control System RPM Lower Than Expected',
  P0507: 'Idle Air Control System RPM Higher Than Expected',
  P0545: 'Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 1)',
  P0562: 'System Voltage Low',
  P0563: 'System Voltage High',
  P0600: 'Serial Communication Link Malfunction',
  P0601: 'Internal Control Module Memory Check Sum Error',
  P0602: 'Control Module Programming Error',
  P0605: 'Internal Control Module ROM Error',
  P0606: 'PCM Processor Fault',
  P0651: 'Sensor Reference Voltage B Circuit Open',
  P0671: 'Cylinder 1 Glow Plug Circuit',
  P0672: 'Cylinder 2 Glow Plug Circuit',
  P0673: 'Cylinder 3 Glow Plug Circuit',
  P0674: 'Cylinder 4 Glow Plug Circuit',
  P0676: 'Cylinder 6 Glow Plug Circuit',
  P0683: 'Glow Plug Control Module to PCM Communication Circuit',
  P0700: 'Transmission Control System Malfunction',
  P0705: 'Transmission Range Sensor Circuit Malfunction',
  P0725: 'Engine Speed Input Circuit Malfunction',
  P0730: 'Incorrect Gear Ratio',
  P0731: 'Gear 1 Incorrect Ratio',
  P0732: 'Gear 2 Incorrect Ratio',
  P0741: 'Torque Converter Clutch Circuit Performance or Stuck Off',
  P0748: 'Pressure Control Solenoid A Electrical',
  P0826: 'Up and Down Shift Switch Circuit',
  P1292: 'High Pressure Fuel System — Fuel Rail Pressure Too High',
  P2002: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 1)',
  P2015: 'Intake Manifold Runner Position Sensor/Switch Circuit Range/Performance',
  P2077: 'Exhaust Gas Temp Sensor Circuit High (Bank 1, Sensor 2)',
  P2088: 'Camshaft Control Circuit Open (Bank 1)',
  P2100: 'Throttle Actuator A Control Motor Circuit Open',
  P2101: 'Throttle Actuator A Control Motor Circuit Range/Performance',
  P2106: 'Throttle Actuator Control System — Forced Limited Power',
  P2120: 'Throttle/Pedal Position Sensor/Switch D Circuit',
  P2122: 'Throttle/Pedal Position Sensor D Circuit Low',
  P2123: 'Throttle/Pedal Position Sensor D Circuit High',
  P2127: 'Throttle/Pedal Position Sensor E Circuit Low',
  P2128: 'Throttle/Pedal Position Sensor E Circuit High',
  P2187: 'System Too Lean At Idle (Bank 1)',
  P2188: 'System Too Rich At Idle (Bank 1)',
  P2191: 'System Too Lean At Higher Load (Bank 1)',
  P2192: 'System Too Rich At Higher Load (Bank 1)',
  P2293: 'Fuel Pressure Regulator 2 Performance',
  P2413: 'EGR System Performance',
  P242F: 'Diesel Particulate Filter Restriction — Ash Accumulation',
  P2452: 'Diesel Particulate Filter Differential Pressure Sensor A Circuit',
  P2453: 'DPF Differential Pressure Sensor A Circuit Range/Performance',
  P2457: 'Exhaust Gas Recirculation Cooling System Performance',
  P2562: 'Turbocharger Boost Control Position Sensor Circuit Low',
  P2563: 'Turbocharger Boost Control Position Sensor Circuit Range/Performance',
  U0001: 'High Speed CAN Communication Bus',
  U0100: 'Lost Communication With ECM/PCM A',
  U0121: 'Lost Communication With Anti-Lock Brake System (ABS) Control Module',
  U0155: 'Lost Communication With Instrument Panel Cluster (IPC) Control Module',
  C0035: 'Left Front Wheel Speed Sensor Circuit',
  C0040: 'Right Front Wheel Speed Sensor Circuit',
  C0045: 'Left Rear Wheel Speed Sensor Circuit',
  C0050: 'Right Rear Wheel Speed Sensor Circuit',
  B1000: 'ECU Internal Fault',
  B1001: 'ECU Fault',
}

function describeDTC(code: string): string {
  return DTC_DB[code] || DTC_DB[code.toUpperCase()] || 'Unknown fault code — check manufacturer documentation'
}

function classifyDTC(code: string): 'active' | 'pending' | 'stored' {
  // Real ELM327 mode 03 only returns confirmed (stored) codes.
  // We mark them all as 'stored' unless they begin with 'P0' (emission-related often active)
  // This is a best-effort classification — a real scan tool would use mode 07 for pending
  if (code.startsWith('P0') || code.startsWith('P1')) return 'active'
  return 'stored'
}

export default function ECUScanner({ connected, activeVehicle }: Props) {
  const [scanning, setScanning] = useState(false)
  const [dtcs, setDtcs] = useState<DTCCode[]>([])
  const [rawResponse, setRawResponse] = useState('')
  const [scanComplete, setScanComplete] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [tab, setTab] = useState<'dtc' | 'live'>('dtc')
  const [livePIDs, setLivePIDs] = useState<LivePID[]>([])
  const [livePolling, setLivePolling] = useState(false)
  const [scanError, setScanError] = useState('')
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startScan = async () => {
    if (!connected) return
    setScanning(true)
    setScanComplete(false)
    setDtcs([])
    setRawResponse('')
    setScanError('')

    const api = (window as any).api
    if (api?.obdReadDTCs) {
      const result = await api.obdReadDTCs()
      if (result?.error) {
        setScanError(result.error)
        setScanning(false)
        return
      }
      setRawResponse(result?.raw || '')
      const parsed: DTCCode[] = (result?.codes || []).map((code: string) => ({
        code,
        description: describeDTC(code),
        status: classifyDTC(code),
      }))
      setDtcs(parsed)
    } else {
      // No IPC available (running in browser dev mode)
      setScanError('OBD2 IPC not available. Run via Electron.')
    }
    setScanning(false)
    setScanComplete(true)
  }

  const clearCodes = async () => {
    if (!connected) return
    setClearing(true)
    const api = (window as any).api
    if (api?.obdClearDTCs) {
      const result = await api.obdClearDTCs()
      if (result?.ok) {
        setDtcs([])
        setScanComplete(false)
        setRawResponse('')
      } else {
        setScanError(result?.error || 'Clear failed')
      }
    }
    setClearing(false)
  }

  const pollLivePIDs = async () => {
    const api = (window as any).api
    if (!api?.obdReadAllPIDs) return
    const result = await api.obdReadAllPIDs()
    if (!result) return
    const pids: LivePID[] = Object.entries(result).map(([pid, data]: [string, any]) => ({
      pid,
      name: data.name,
      value: data.value,
      unit: data.unit,
    }))
    setLivePIDs(pids)
  }

  useEffect(() => {
    if (tab === 'live' && connected) {
      setLivePolling(true)
      pollLivePIDs()
      liveRef.current = setInterval(pollLivePIDs, 1000)
    } else {
      setLivePolling(false)
      if (liveRef.current) clearInterval(liveRef.current)
    }
    return () => { if (liveRef.current) clearInterval(liveRef.current) }
  }, [tab, connected])

  const statusColor = { active: 'var(--danger)', pending: 'var(--warning)', stored: 'var(--text-secondary)' }

  const barColor = (pid: string, value: number) => {
    if (pid === '010C') return value > 4000 ? 'var(--danger)' : value > 2500 ? 'var(--warning)' : 'var(--accent)'
    if (pid === '0105' || pid === '010F') return value > 100 ? 'var(--danger)' : value > 80 ? 'var(--warning)' : 'var(--accent)'
    if (pid === '0104' || pid === '0111') return value > 80 ? 'var(--danger)' : value > 60 ? 'var(--warning)' : 'var(--accent)'
    return 'var(--accent)'
  }

  const pidBarMax: Record<string, number> = {
    '010C': 8000,
    '010D': 250,
    '0105': 150,
    '010F': 100,
    '0104': 100,
    '010B': 300,
    '0111': 100,
    '012F': 100,
    '0142': 16,
    '015C': 150,
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12H3M21 12h-2M12 5V3M12 21v-2"/><circle cx="12" cy="12" r="4"/></svg></div>
        <h1>ECU Scanner</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {!connected && (
        <div className="banner banner-warning" style={{ marginBottom: 20 }}>
          ⚠ No OBD2 device connected. Connect an ELM327 adapter via J2534 PassThru first.
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['dtc', 'live'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 18px',
              background: tab === t ? 'var(--accent-dim)' : 'var(--bg-card)',
              border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 6,
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            {t === 'dtc' ? '🚨 Fault Codes' : '📊 Live Data'}
          </button>
        ))}
      </div>

      {/* ── DTC TAB ─────────────────────────────── */}
      {tab === 'dtc' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={startScan} disabled={!connected || scanning}>
                {scanning ? '⏳ Scanning...' : '📡 Scan for Faults'}
              </button>
              <button className="btn btn-danger" onClick={clearCodes} disabled={!connected || dtcs.length === 0 || clearing}>
                {clearing ? 'Clearing...' : '🗑 Clear All Codes'}
              </button>
              {scanComplete && (
                <span className="badge badge-success" style={{ marginLeft: 8 }}>
                  Scan Complete — {dtcs.length} code{dtcs.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>

            {scanning && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Sending Mode 03 request to ECU...
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: '70%', animation: 'progress-scan 3s linear forwards' }} />
                </div>
              </div>
            )}

            {scanError && (
              <div className="banner banner-danger" style={{ marginTop: 12 }}>⚠ {scanError}</div>
            )}
          </div>

          {dtcs.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Diagnostic Trouble Codes ({dtcs.length})
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dtcs.map((d) => (
                    <tr key={d.code}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                        {d.code}
                      </td>
                      <td>{d.description}</td>
                      <td>
                        <span style={{ color: statusColor[d.status], fontWeight: 600, fontSize: 12, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          ● {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rawResponse && (
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  Raw response: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{rawResponse}</span>
                </div>
              )}
            </div>
          )}

          {scanComplete && dtcs.length === 0 && !scanError && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>No fault codes found</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>All ECU systems reporting clean</div>
            </div>
          )}
        </>
      )}

      {/* ── LIVE DATA TAB ────────────────────────── */}
      {tab === 'live' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected && livePolling ? 'var(--success)' : 'var(--text-muted)',
              boxShadow: connected && livePolling ? '0 0 6px var(--success)' : 'none',
              animation: connected && livePolling ? 'pulse 1s infinite' : 'none',
            }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {connected ? (livePolling ? 'Live — polling every 1s' : 'Waiting...') : 'Not connected'}
            </span>
          </div>

          {!connected && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Connect OBD2 device to view live data</div>
            </div>
          )}

          {connected && livePIDs.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Waiting for ECU response...</div>
            </div>
          )}

          {livePIDs.length > 0 && (
            <div className="grid-2" style={{ gap: 12 }}>
              {livePIDs.map((p) => {
                const max = pidBarMax[p.pid] ?? 100
                const pct = Math.min(100, Math.max(0, (p.value / max) * 100))
                const col = barColor(p.pid, p.value)
                return (
                  <div key={p.pid} className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{p.name}</span>
                      <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: col }}>
                        {p.value}<span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 3 }}>{p.unit}</span>
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: 4 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: col, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
