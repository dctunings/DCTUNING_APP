import { useState, useEffect } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { elm327 } from '../lib/elm327WebSerial'

interface Props {
  connected: boolean
  setConnected: (v: boolean) => void
  activeVehicle: ActiveVehicle | null
}

interface SerialPort {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  vendorId?: string
  productId?: string
}

interface KnownDeviceInfo {
  brand: string
  model: string
  category: 'professional' | 'prosumer' | 'clone' | 'budget'
  protocols: string[]
  maxBaudRate: number
  canFlash: boolean
  isClone: boolean
  driverNote: string
  setupTip: string
}

interface J2534Device {
  name: string
  dll: string
  vendor: string
  is64bit: boolean
  exists: boolean
  known: KnownDeviceInfo | null
}

// Protocol ID numeric values (J2534 spec)
const PROTOCOL_OPTIONS = [
  { label: 'Auto (ISO15765 CAN 500k)', protocolId: 6, baud: 500000 },
  { label: 'CAN 250k (ISO15765)',       protocolId: 6, baud: 250000 },
  { label: 'K-Line ISO9141',            protocolId: 3, baud: 10400  },
  { label: 'KWP2000 ISO14230',          protocolId: 4, baud: 10400  },
  { label: 'J1850 PWM',                 protocolId: 1, baud: 41600  },
  { label: 'J1850 VPW',                 protocolId: 2, baud: 10400  },
]

const ELM_BAUD_RATES = ['Auto Detect (38400)', '115200', '57600', '38400', '19200', '9600']

const PROTOCOL_TABLE = [
  { proto: 'J1850 PWM',       desc: '41.6 kbps, Ford',               use: 'Ford pre-2008' },
  { proto: 'J1850 VPW',       desc: '10.4 kbps, GM',                 use: 'GM pre-2008' },
  { proto: 'ISO 9141-2',      desc: 'K-Line, 10.4 kbps',             use: 'Asian/Euro OBD' },
  { proto: 'ISO 14230-4',     desc: 'KWP2000, K-Line',               use: 'Asian/Euro OBD' },
  { proto: 'ISO 15765-4',     desc: 'CAN, 250/500 kbps',             use: '2008+ All Makes' },
  { proto: 'ISO 15765 (UDS)', desc: 'Unified Diagnostic Services',   use: 'Modern ECU flash' },
  { proto: 'SAE J2190',       desc: 'Enhanced diagnostics',          use: 'OEM-specific' },
]

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  professional: { label: 'Professional', color: '#4ade80' },
  prosumer:     { label: 'Prosumer',     color: '#60a5fa' },
  clone:        { label: 'Clone',        color: '#fb923c' },
  budget:       { label: 'Budget',       color: '#a3a3a3' },
}

const isElectron = () => !!(window as any).api
const hasWebSerial = () => 'serial' in navigator

export default function J2534PassThru({ connected, setConnected, activeVehicle }: Props) {
  const [serialPorts, setSerialPorts]       = useState<SerialPort[]>([])
  const [j2534Devices, setJ2534Devices]     = useState<J2534Device[]>([])
  const [selectedPort, setSelectedPort]     = useState('')
  const [elmBaudRate, setElmBaudRate]       = useState(ELM_BAUD_RATES[0])
  const [protocolIdx, setProtocolIdx]       = useState(0)
  const [connecting, setConnecting]         = useState(false)
  const [connectingDll, setConnectingDll]   = useState<string | null>(null)
  const [log, setLog]                       = useState<{ msg: string; type: string }[]>([])
  const [deviceInfo, setDeviceInfo]         = useState<Record<string, string>>({})
  const [scanning, setScanning]             = useState(false)
  const [j2534DeviceInfo, setJ2534DeviceInfo] = useState<string>('')

  const addLog = (msg: string, type = 'info') =>
    setLog((l) => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])

  const scanDevices = async () => {
    setScanning(true)
    addLog('Scanning for serial ports and J2534 devices...', 'info')
    const api = (window as any).api

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

    const j2534Raw: J2534Device[] = (await api?.scanJ2534()) || []
    setJ2534Devices(j2534Raw)

    if (j2534Raw.length > 0) {
      addLog(`Found ${j2534Raw.length} J2534 device(s) in Windows registry:`, 'success')
      for (const d of j2534Raw) {
        const id = d.known ? `${d.known.brand} ${d.known.model}` : d.name
        const exists = d.exists ? 'DLL OK' : 'DLL MISSING'
        addLog(`  ${id} — ${exists}`, d.exists ? 'info' : 'warn')
      }
    } else {
      addLog('No J2534 DLLs found in Windows registry (PassThruSupport.04.04)', 'info')
    }

    setScanning(false)
  }

  // ── Connect via J2534 DLL bridge ──────────────────────────────────────────
  const connectJ2534 = async (device: J2534Device) => {
    if (!device.exists) {
      addLog(`Cannot connect — DLL not found on disk: ${device.dll}`, 'error')
      return
    }
    const proto = PROTOCOL_OPTIONS[protocolIdx]
    setConnectingDll(device.dll)
    addLog(`Opening J2534 device: ${device.name}`, 'info')
    addLog(`DLL: ${device.dll}`, 'info')

    const api = (window as any).api

    const openResult = await api?.j2534Open(device.dll)
    if (!openResult?.ok) {
      addLog(`Open failed: ${openResult?.error || 'Unknown error'}`, 'error')
      setConnectingDll(null)
      return
    }
    addLog(`Device opened — ${openResult.info}`, 'success')
    setJ2534DeviceInfo(openResult.info || '')

    addLog(`Connecting channel: ${proto.label} (protocol ${proto.protocolId}, ${proto.baud} baud)`, 'info')
    const connResult = await api?.j2534Connect(proto.protocolId, proto.baud)
    if (!connResult?.ok) {
      addLog(`Channel connect failed: ${connResult?.error || 'Unknown error'}`, 'error')
      await api?.j2534Close()
      setConnectingDll(null)
      return
    }

    setConnected(true)
    setDeviceInfo({
      'Device':    device.name,
      'Brand':     device.known?.brand || 'Unknown',
      'Model':     device.known?.model || device.name,
      'DLL':       device.dll.split(/[\\/]/).pop() || device.dll,
      'Protocol':  proto.label,
      'Channel':   String(connResult.channelId ?? '—'),
      'API':       'J2534 DLL Bridge',
      'Info':      openResult.info || '—',
    })
    addLog(`Connected via J2534 DLL (channel ${connResult.channelId})`, 'success')
    setConnectingDll(null)
  }

  // ── Web Serial connect ────────────────────────────────────────────────────
  const connectWebSerial = async () => {
    if (!hasWebSerial()) {
      addLog('Web Serial API not available. Use Chrome, Edge, or Brave.', 'error')
      return
    }
    setConnecting(true)
    addLog('Opening Web Serial port picker...', 'info')

    const baudNum = parseInt(elmBaudRate.replace(/[^0-9]/g, '')) || 38400
    const result = await elm327.connect(baudNum)

    if (result.ok) {
      setConnected(true)
      setDeviceInfo({
        'Device':     elm327.getPortLabel() || 'Web Serial Port',
        'ELM327 Info': result.info || '—',
        'Protocol':   'Auto (ELM327)',
        'Baud Rate':  String(baudNum),
        'API':        'Web Serial (Chrome)',
      })
      addLog(`Connected: ${result.info}`, 'success')
    } else {
      if (result.error !== 'Port selection cancelled.') {
        addLog(`Connection failed: ${result.error}`, 'error')
      } else {
        addLog('Port selection cancelled', 'warn')
      }
    }
    setConnecting(false)
  }

  // ── Electron ELM327 connect ───────────────────────────────────────────────
  const connectElectron = async () => {
    if (!selectedPort) return
    setConnecting(true)
    addLog(`Connecting to ${selectedPort}...`, 'info')
    const api = (window as any).api

    if (api?.obdConnect) {
      const result = await api.obdConnect(selectedPort)
      if (result?.ok) {
        setConnected(true)
        setDeviceInfo({
          'Device':     selectedPort,
          'ELM327 Info': result.info || '—',
          'API':        'Electron SerialPort',
        })
        addLog(`Connected: ${result.info}`, 'success')
      } else {
        addLog(`Connection failed: ${result?.error || 'Unknown error'}`, 'error')
        setConnecting(false)
        return
      }
    } else {
      addLog('Electron IPC not available — use Web Serial instead', 'warn')
      setConnecting(false)
      return
    }
    setConnecting(false)
  }

  const disconnect = async () => {
    const api = (window as any).api
    if (api?.obdDisconnect) await api.obdDisconnect()
    if (api?.j2534Close)   await api.j2534Close()
    if (elm327.isConnected()) await elm327.disconnect()
    setConnected(false)
    setDeviceInfo({})
    setJ2534DeviceInfo('')
    addLog('Disconnected from device', 'warn')
  }

  const ecuOp = async (op: string) => {
    if (!connected) { addLog(`${op}: not connected`, 'error'); return }
    addLog(`${op}: initiated...`, 'info')
    const api = (window as any).api

    if (op === 'READ ECU ID') {
      addLog('Use "ECU Scanner" tab for full diagnostics', 'info')
      return
    }

    if (op === 'CLEAR DTCs') {
      const proto = PROTOCOL_OPTIONS[protocolIdx]
      // Prefer J2534 DLL path if open
      if (api?.j2534IsConnected && await api.j2534IsConnected()) {
        addLog('Sending Mode 04 via J2534 DLL...', 'info')
        const result = await api.j2534ClearDTCs(proto.protocolId)
        if (result?.ok) addLog('Diagnostic codes cleared', 'success')
        else addLog(`Clear failed: ${result?.error}`, 'error')
      } else if (elm327.isConnected()) {
        addLog('Sending Mode 04 via ELM327...', 'info')
        const result = await elm327.clearDTCs()
        if (result.ok) addLog('Diagnostic codes cleared', 'success')
        else addLog(`Clear failed: ${result.error}`, 'error')
      } else if (api?.obdClearDTCs) {
        const result = await api.obdClearDTCs()
        if (result?.ok) addLog('Diagnostic codes cleared', 'success')
        else addLog(`Clear failed: ${result?.error || 'Unknown error'}`, 'error')
      } else {
        addLog('No OBD connection available', 'error')
      }
      return
    }

    if (op === 'READ DTCs') {
      const proto = PROTOCOL_OPTIONS[protocolIdx]
      if (api?.j2534IsConnected && await api.j2534IsConnected()) {
        addLog('Reading DTCs via J2534 DLL...', 'info')
        const result = await api.j2534ReadDTCs(proto.protocolId)
        if (result?.ok) {
          if (result.codes?.length) {
            addLog(`Found ${result.codes.length} DTC(s): ${result.codes.join(', ')}`, 'warn')
          } else {
            addLog('No fault codes stored', 'success')
          }
        } else {
          addLog(`Read DTCs failed: ${result?.error}`, 'error')
        }
      } else {
        addLog('J2534 DLL not connected — use ECU Scanner page for ELM327 DTCs', 'info')
      }
      return
    }

    if (op === 'LIVE DATA') {
      addLog('Navigate to ECU Scanner → Live Data tab for real-time PIDs', 'info')
      return
    }

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

  useEffect(() => {
    if (isElectron()) scanDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentProto = PROTOCOL_OPTIONS[protocolIdx]

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <h1>J2534 PassThru Interface</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        SAE J2534 compliant device communication for ECU diagnostics and reprogramming
      </div>

      {/* ── J2534 Devices ── */}
      {isElectron() && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>J2534 Devices</div>
            <button
              className="btn btn-secondary"
              onClick={scanDevices}
              disabled={scanning || connected}
              style={{ fontSize: 12, padding: '4px 12px' }}
            >
              {scanning ? 'Scanning...' : 'Refresh Scan'}
            </button>
          </div>

          {j2534Devices.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              No J2534 devices found in Windows registry (PassThruSupport.04.04).
              {scanning ? ' Scanning...' : ' Click "Refresh Scan" to retry.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {j2534Devices.map((device) => {
                const badge = device.known
                  ? CATEGORY_BADGE[device.known.category]
                  : null
                const isConnecting = connectingDll === device.dll
                const dllName = device.dll.split(/[\\/]/).pop() || device.dll

                return (
                  <div
                    key={device.dll}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '14px 16px',
                      opacity: !device.exists ? 0.6 : 1,
                    }}
                  >
                    {/* Top row: name + badge + DLL exists indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {device.known?.brand
                          ? `${device.known.brand} — ${device.known.model}`
                          : device.name}
                      </span>
                      {badge && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: badge.color,
                          border: `1px solid ${badge.color}`,
                          borderRadius: 4,
                          padding: '1px 7px',
                        }}>
                          {badge.label}
                        </span>
                      )}
                      <span style={{
                        fontSize: 11,
                        color: device.exists ? 'var(--success)' : 'var(--danger)',
                        marginLeft: 'auto',
                        fontWeight: 600,
                      }}>
                        {device.exists ? 'DLL OK' : 'DLL MISSING'}
                      </span>
                    </div>

                    {/* Registry name (if different from brand/model) */}
                    {device.known && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        Registry: {device.name}{device.vendor ? ` — ${device.vendor}` : ''}
                      </div>
                    )}

                    {/* DLL path */}
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                      wordBreak: 'break-all',
                    }}>
                      {dllName}
                    </div>

                    {/* Protocols */}
                    {device.known && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {device.known.protocols.map((p) => (
                          <span key={p} style={{
                            fontSize: 10,
                            background: 'var(--bg-tertiary)',
                            color: 'var(--accent)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            padding: '1px 6px',
                          }}>
                            {p}
                          </span>
                        ))}
                        {device.known.canFlash && (
                          <span style={{
                            fontSize: 10,
                            background: 'rgba(184,240,42,0.1)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                            borderRadius: 4,
                            padding: '1px 6px',
                            fontWeight: 600,
                          }}>
                            ECU FLASH
                          </span>
                        )}
                      </div>
                    )}

                    {/* Clone warning */}
                    {device.known?.isClone && (
                      <div style={{
                        background: 'rgba(251,146,60,0.1)',
                        border: '1px solid rgba(251,146,60,0.4)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: '#fb923c',
                        marginBottom: 8,
                      }}>
                        <strong>Clone hardware detected.</strong> {device.known.driverNote}
                      </div>
                    )}

                    {/* Driver note for non-clones */}
                    {device.known?.driverNote && !device.known.isClone && (
                      <div style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginBottom: 8,
                        fontStyle: 'italic',
                      }}>
                        {device.known.driverNote}
                      </div>
                    )}

                    {/* Connect button */}
                    <button
                      className={`btn ${device.exists ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => connectJ2534(device)}
                      disabled={!device.exists || connected || isConnecting}
                      style={{ fontSize: 12 }}
                    >
                      {isConnecting
                        ? 'Connecting...'
                        : device.exists
                          ? `Connect (${currentProto.label})`
                          : 'DLL Not Found'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Web Serial + Electron ELM327 ── */}
      <div className="grid-2" style={{ gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Web Serial (ELM327)</div>

          {hasWebSerial() && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Connect your ELM327 USB adapter directly from Chrome/Edge/Brave
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select
                  value={elmBaudRate}
                  onChange={(e) => setElmBaudRate(e.target.value)}
                  disabled={connected}
                  style={{ flex: 1 }}
                >
                  {ELM_BAUD_RATES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <button
                className="btn btn-primary"
                onClick={connectWebSerial}
                disabled={connecting || connected}
                style={{ width: '100%' }}
              >
                {connecting ? 'Connecting...' : 'Connect ELM327 via Web Serial'}
              </button>
              {!connected && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  A browser port picker will open — select your ELM327/OBD2 USB adapter
                </div>
              )}
            </div>
          )}

          {isElectron() && (
            <>
              {hasWebSerial() && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0', textAlign: 'center' }}>
                  — or select COM port manually —
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label>ELM327 Serial Port</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    style={{ flex: 1 }}
                    disabled={connected}
                  >
                    <option value="">Select a COM port...</option>
                    {serialPorts.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.path}{p.manufacturer ? ` — ${p.manufacturer}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    onClick={scanDevices}
                    disabled={scanning || connected}
                  >
                    {scanning ? '...' : 'Scan'}
                  </button>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={connectElectron}
                disabled={!selectedPort || connecting || connected}
                style={{ width: '100%' }}
              >
                {connecting ? 'Connecting...' : 'Connect via COM Port'}
              </button>
            </>
          )}

          {!hasWebSerial() && !isElectron() && (
            <div className="banner banner-warning" style={{ fontSize: 12 }}>
              Web Serial not supported. Use Chrome, Edge, or Brave — or run the desktop app.
            </div>
          )}

          {connected && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-danger" onClick={disconnect} style={{ width: '100%' }}>
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Connection Status */}
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Connection Status</div>
          {Object.entries({
            'Device Status': connected ? 'Connected' : 'Not Connected',
            ...deviceInfo,
          }).map(([k, v]) => (
            <div
              key={k}
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, gap: 12 }}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{k}:</span>
              <span style={{
                color:
                  k === 'Device Status'
                    ? connected ? 'var(--success)' : 'var(--danger)'
                    : 'var(--text-secondary)',
                fontWeight: k === 'Device Status' ? 700 : 400,
                textAlign: 'right',
                wordBreak: 'break-word',
              }}>
                {k === 'Device Status' ? (connected ? '● ' : '● ') + v : v}
              </span>
            </div>
          ))}
          {!connected && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
              Connect a J2534 device above or use the Web Serial path
            </div>
          )}
        </div>
      </div>

      {/* ── Protocol Config ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Protocol Configuration</div>
        <div className="grid-3">
          <div>
            <label>J2534 Protocol</label>
            <select
              value={protocolIdx}
              onChange={(e) => setProtocolIdx(Number(e.target.value))}
              style={{ marginTop: 6 }}
              disabled={connected}
            >
              {PROTOCOL_OPTIONS.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Baud Rate</label>
            <div style={{
              marginTop: 6,
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}>
              {currentProto.baud.toLocaleString()} bps
            </div>
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

      {/* ── ECU Operations ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>ECU Operations</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['READ ECU ID', 'READ DTCs', 'CLEAR DTCs', 'LIVE DATA', 'READ FLASH', 'WRITE FLASH', 'RECOVERY MODE'].map((op) => (
            <button key={op} className="btn btn-secondary" onClick={() => ecuOp(op)} disabled={!connected}>
              {op}
            </button>
          ))}
        </div>
        {connected && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            Use the ECU Scanner page for full DTC scan and live PID data
          </div>
        )}
      </div>

      {/* ── Protocol Reference ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>J2534 Protocol Reference</div>
        <table className="data-table">
          <thead>
            <tr><th>Protocol</th><th>Description</th><th>Typical Use</th></tr>
          </thead>
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

      {/* ── Activity Log ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label>Activity Log</label>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => setLog([])}
          >
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
