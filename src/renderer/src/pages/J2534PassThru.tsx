import { useState, useEffect } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props { connected: boolean; setConnected: (v: boolean) => void; activeVehicle: ActiveVehicle | null }

interface SerialPort { path: string; manufacturer?: string; serialNumber?: string; pnpId?: string; vendorId?: string; productId?: string }
interface J2534Device { name: string; dll: string; vendor: string }

const PROTOCOLS = ['Auto Detect', 'CAN (ISO 15765)', 'K-Line (ISO 9141)', 'K-Line (ISO 14230 KWP2000)', 'J1850 PWM', 'J1850 VPW', 'UDS (ISO 14229)']
const BAUD_RATES = ['Auto Detect (38400)', '115200', '57600', '38400', '19200', '9600']

const PROTOCOL_TABLE = [
  { proto: 'J1850 PWM',       desc: '41.6 kbps, Ford',               use: 'Ford pre-2008' },
  { proto: 'J1850 VPW',       desc: '10.4 kbps, GM',                 use: 'GM pre-2008' },
  { proto: 'ISO 9141-2',      desc: 'K-Line, 10.4 kbps',             use: 'Asian/Euro OBD' },
  { proto: 'ISO 14230-4',     desc: 'KWP2000, K-Line',               use: 'Asian/Euro OBD' },
  { proto: 'ISO 15765-4',     desc: 'CAN, 250/500 kbps',             use: '2008+ All Makes' },
  { proto: 'ISO 15765 (UDS)', desc: 'Unified Diagnostic Services',   use: 'Modern ECU flash' },
  { proto: 'SAE J2190',       desc: 'Enhanced diagnostics',          use: 'OEM-specific' },
]

export default function J2534PassThru({ connected, setConnected, activeVehicle }: Props) {
  const [serialPorts, setSerialPorts] = useState<SerialPort[]>([])
  const [j2534Devices, setJ2534Devices] = useState<J2534Device[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const [protocol, setProtocol] = useState(PROTOCOLS[0])
  const [baudRate, setBaudRate] = useState(BAUD_RATES[0])
  const [connecting, setConnecting] = useState(false)
  const [log, setLog] = useState<{ msg: string; type: string }[]>([])
  const [deviceInfo, setDeviceInfo] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)

  const addLog = (msg: string, type = 'info') =>
    setLog((l) => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])

  const scanDevices = async () => {
    setScanning(true)
    addLog('Scanning for serial ports and J2534 devices...', 'info')
    const api = (window as any).api

    // Scan serial ports
    const portsRaw: SerialPort[] = (await api?.listSerialPorts()) || []
    setSerialPorts(portsRaw)

    if (portsRaw.length > 0) {
      addLog(`Found ${portsRaw.length} serial port(s):`, 'success')
      for (const p of portsRaw) {
        const mfr = p.manufacturer ? ` (${p.manufacturer})` : ''
        addLog(`  ${p.path}${mfr}`, 'info')
      }
    } else {
      addLog('No serial ports detected', 'warn')
    }

    // Scan J2534 registry (Windows)
    const j2534Raw: J2534Device[] = (await api?.scanJ2534()) || []
    setJ2534Devices(j2534Raw)

    if (j2534Raw.length > 0) {
      addLog(`Found ${j2534Raw.length} J2534 device(s) in registry:`, 'success')
      for (const d of j2534Raw) {
        addLog(`  ${d.name}${d.vendor ? ` — ${d.vendor}` : ''}`, 'info')
      }
    } else {
      addLog('No J2534 DLLs found in Windows registry', 'info')
    }

    setScanning(false)
  }

  const connect = async () => {
    if (!selectedPort) return
    setConnecting(true)
    addLog(`Connecting to ${selectedPort}...`, 'info')
    const api = (window as any).api

    if (api?.obdConnect) {
      const result = await api.obdConnect(selectedPort)
      if (result?.ok) {
        setConnected(true)
        setDeviceInfo({
          'Device': selectedPort,
          'ELM327 Info': result.info || '—',
          'Protocol': protocol,
          'Baud Rate': baudRate,
        })
        addLog(`✓ Connected: ${result.info}`, 'success')
      } else {
        const errMsg = result?.error || 'Unknown error'
        addLog(`✗ Connection failed: ${errMsg}`, 'error')
        setConnecting(false)
        return
      }
    } else {
      // No IPC — dev mode fallback
      addLog(`⚠ Running without Electron IPC. Simulating connection to ${selectedPort}.`, 'warn')
      setConnected(true)
      setDeviceInfo({
        'Device': selectedPort,
        'ELM327 Info': 'ELM327 v1.5 | Battery: 12.4V (simulated)',
        'Protocol': protocol,
        'Baud Rate': baudRate,
      })
      addLog('Simulated connection established', 'success')
    }

    setConnecting(false)
    addLog(`Protocol: ${protocol}`, 'info')
    addLog(`Baud Rate: ${baudRate}`, 'info')
  }

  const disconnect = async () => {
    const api = (window as any).api
    if (api?.obdDisconnect) {
      await api.obdDisconnect()
    }
    setConnected(false)
    setDeviceInfo({})
    addLog('Disconnected from device', 'warn')
  }

  const ecuOp = async (op: string) => {
    if (!connected) { addLog(`${op}: not connected`, 'error'); return }
    addLog(`${op}: initiated...`, 'info')

    const api = (window as any).api

    if (op === 'READ ECU ID') {
      addLog('Sending ATI to read ELM327 version...', 'info')
      addLog('Use "ECU Scanner" tab for full diagnostics', 'info')
      return
    }

    if (op === 'CLEAR DTCs') {
      if (!api?.obdClearDTCs) {
        addLog('OBD IPC not available', 'error')
        return
      }
      addLog('Sending Mode 04 — Clear DTCs...', 'info')
      const result = await api.obdClearDTCs()
      if (result?.ok) {
        addLog('✓ Diagnostic codes cleared', 'success')
      } else {
        addLog(`✗ Clear failed: ${result?.error || 'Unknown error'}`, 'error')
      }
      return
    }

    if (op === 'LIVE DATA') {
      addLog('Navigate to ECU Scanner → Live Data tab for real-time PIDs', 'info')
      return
    }

    // For flash operations — inform user these require manufacturer-specific DLL support
    if (op === 'READ FLASH' || op === 'WRITE FLASH') {
      addLog(`${op}: Requires OEM-specific J2534 DLL and vehicle software`, 'warn')
      addLog('Contact DCTuning for ECU flash service', 'info')
      return
    }

    if (op === 'RECOVERY MODE') {
      addLog('Recovery mode: requires vehicle-specific bootloader protocol', 'warn')
      return
    }

    setTimeout(() => addLog(`${op}: complete`, 'success'), 600)
  }

  useEffect(() => { scanDevices() }, [])

  // Build combined device list for dropdown
  const allPorts = [
    ...serialPorts.map((p) => ({
      value: p.path,
      label: `${p.path}${p.manufacturer ? ` — ${p.manufacturer}` : ''}`,
      group: 'Serial Ports',
    })),
    ...j2534Devices.map((d) => ({
      value: d.dll,
      label: `${d.name}${d.vendor ? ` (${d.vendor})` : ''}`,
      group: 'J2534 Devices',
    })),
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
        <h1>J2534 PassThru Interface</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        SAE J2534 compliant device communication for ECU diagnostics and reprogramming
      </div>

      <div className="grid-2" style={{ gap: 20, marginBottom: 20 }}>
        {/* Device Selection */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Device Selection</div>

          <div style={{ marginBottom: 12 }}>
            <label>ELM327 / PassThru Device</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                style={{ flex: 1 }}
                disabled={connected}
              >
                <option value="">Select a device...</option>
                {allPorts.length > 0 ? (
                  ['Serial Ports', 'J2534 Devices'].map((group) => {
                    const items = allPorts.filter((p) => p.group === group)
                    if (!items.length) return null
                    return (
                      <optgroup key={group} label={group}>
                        {items.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </optgroup>
                    )
                  })
                ) : (
                  <option disabled>No devices found — click Scan</option>
                )}
              </select>
              <button
                className="btn btn-secondary"
                onClick={scanDevices}
                disabled={scanning || connected}
                style={{ whiteSpace: 'nowrap' }}
              >
                {scanning ? '⏳' : '🔄'} Scan
              </button>
            </div>
          </div>

          {serialPorts.length === 0 && !scanning && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
              💡 Plug in your ELM327 adapter (USB or Bluetooth) then click Scan
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={connect}
              disabled={!selectedPort || connecting || connected}
            >
              {connecting ? '⏳ Connecting...' : '🔗 Connect'}
            </button>
            <button className="btn btn-danger" onClick={disconnect} disabled={!connected}>
              Disconnect
            </button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Connection Status</div>
          {Object.entries({
            'Device Status': connected ? '● Connected' : '● Not Connected',
            ...deviceInfo,
          }).map(([k, v]) => (
            <div
              key={k}
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, gap: 12 }}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{k}:</span>
              <span style={{
                color: k === 'Device Status' ? (connected ? 'var(--success)' : 'var(--danger)') : 'var(--text-secondary)',
                fontWeight: k === 'Device Status' ? 700 : 400,
                textAlign: 'right',
                wordBreak: 'break-word',
              }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Protocol Config */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Protocol Configuration</div>
        <div className="grid-3">
          <div>
            <label>Protocol</label>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value)} style={{ marginTop: 6 }} disabled={connected}>
              {PROTOCOLS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label>Baud Rate</label>
            <select value={baudRate} onChange={(e) => setBaudRate(e.target.value)} style={{ marginTop: 6 }} disabled={connected}>
              {BAUD_RATES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label>CAN ID Format</label>
            <select style={{ marginTop: 6 }} disabled={connected}>
              <option>11-bit (Standard)</option>
              <option>29-bit (Extended)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ECU Operations */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>ECU Operations</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['READ ECU ID', 'READ FLASH', 'WRITE FLASH', 'RECOVERY MODE', 'CLEAR DTCs', 'LIVE DATA'].map((op) => (
            <button key={op} className="btn btn-secondary" onClick={() => ecuOp(op)} disabled={!connected}>
              {op}
            </button>
          ))}
        </div>
        {connected && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            💡 Use the <strong>ECU Scanner</strong> page for full DTC scan and live PID data
          </div>
        )}
      </div>

      {/* Protocol Reference */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>J2534 Protocol Reference</div>
        <table className="data-table">
          <thead><tr><th>Protocol</th><th>Description</th><th>Typical Use</th></tr></thead>
          <tbody>
            {PROTOCOL_TABLE.map((r) => (
              <tr key={r.proto}>
                <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{r.proto}</td>
                <td>{r.desc}</td>
                <td>{r.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label>Activity Log</label>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setLog([])}>
            Clear
          </button>
        </div>
        <div className="activity-log">
          {log.length === 0 && (
            <div className="log-line info" style={{ opacity: 0.5 }}>No activity yet</div>
          )}
          {log.map((l, i) => (
            <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
