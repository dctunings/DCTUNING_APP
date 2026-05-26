import React, { useState, useEffect } from 'react'
import { PageHeader, Card, Grid, StatCard, SectionTitle, Badge } from '../components/ui'
import { bridge } from '../lib/bridgeClient'

type Page = string

interface Props {
  setPage?: (p: Page) => void
  connected?: boolean
  setConnected?: (c: boolean) => void
}

interface ScannedDevice {
  name?: string
  dll?: string
  exists?: boolean
  vendor?: string
  [key: string]: unknown
}

export default function J2534PassThru({ setPage, setConnected: setGlobalConnected }: Props) {
  const [connected, setConnected] = useState(false)
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const [protocol, setProtocol] = useState('CAN')
  const [baudRate, setBaudRate] = useState(500000)
  const [error, setError] = useState<string | null>(null)
  const [bridgePresent, setBridgePresent] = useState(false)
  const [devices, setDevices] = useState<ScannedDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<ScannedDevice | null>(null)
  const [scanning, setScanning] = useState(false)
  const [channelId, setChannelId] = useState<number | null>(null)
  const [ecuInfo, setEcuInfo] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    bridge.probe().then(ok => {
      setBridgePresent(ok)
      if (ok) {
        bridge.connect().then(c => setBridgeConnected(c))
        scanDevices()
      }
    })
    const unsub = bridge.onStateChange(c => setBridgeConnected(c))
    return () => { unsub() }
  }, [])

  const scanDevices = async () => {
    setScanning(true)
    setError(null)
    try {
      const result = await bridge.scanDevices()
      const list = (Array.isArray(result) ? result : []) as ScannedDevice[]
      const available = list.filter(d => d.exists !== false)
      setDevices(available)
      if (available.length > 0 && !selectedDevice) setSelectedDevice(available[0])
    } catch (e) {
      setError(`Scan failed: ${String(e)}`)
      setDevices([])
    }
    setScanning(false)
  }

  const protocolToId = (p: string): number => {
    switch (p) {
      case 'CAN': return 5
      case 'ISO15765': return 6
      case 'K-Line': return 3
      case 'J1850': return 1
      default: return 5
    }
  }

  const handleConnect = async () => {
    setError(null)
    if (!selectedDevice?.dll) {
      setError('Select a J2534 device first')
      return
    }
    try {
      // Check bridge WebSocket is connected
      if (!bridgeConnected) {
        const ok = await bridge.connect()
        if (!ok) throw new Error('Could not connect to bridge WebSocket')
      }
      // Close any existing handle first to be safe
      try { await bridge.j2534Close() } catch { /* ignore */ }

      const opened = await bridge.j2534Open(selectedDevice.dll)
      if (!opened.ok) throw new Error(opened.error || 'Failed to open device')

      const conn = await bridge.j2534Connect(protocolToId(protocol), baudRate)
      if (!conn.ok) throw new Error(conn.error || 'Failed to connect protocol')

      setChannelId(conn.channelId ?? null)
      setConnected(true)
      setGlobalConnected?.(true)

      try {
        const id = await bridge.j2534ReadECUID()
        if (id?.ok && id.id) setEcuInfo(id.id)
      } catch { /* optional */ }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setConnected(false)
      setGlobalConnected?.(false)
      setChannelId(null)
    }
  }

  const handleDisconnect = async () => {
    setError(null)
    let disconnectError: string | null = null
    try {
      const result = await bridge.j2534Close() as { ok?: boolean; error?: string } | unknown
      if (result && typeof result === 'object' && 'ok' in result && (result as any).ok === false) {
        disconnectError = ((result as any).error) || 'Bridge returned ok:false on close'
      }
    } catch (e) {
      disconnectError = e instanceof Error ? e.message : String(e)
    }

    // Verify it actually disconnected
    try {
      const status = await bridge.j2534IsOpen()
      if (status?.ok) {
        // Still open — try once more aggressively
        try { await bridge.j2534Close() } catch { /* ignore */ }
      }
    } catch { /* ignore probe error */ }

    setConnected(false)
    setGlobalConnected?.(false)
    setChannelId(null)
    setEcuInfo(null)

    if (disconnectError) {
      setError(`Disconnect warning: ${disconnectError}`)
    }
  }

  const downloadBridge = () => {
    if (setPage) setPage('bridge-download')
    else window.open('https://github.com/dctunings/j2534-bridge/releases', '_blank')
  }

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <PageHeader
        title="🔌 J2534 PassThru"
        subtitle="Connect to J2534 PassThru devices for ECU communication, flashing, and diagnostics."
      />

      <Grid columns={4} gap={12} style={{ marginBottom: 16 }}>
        <StatCard
          title="Bridge"
          value={bridgePresent ? (bridgeConnected ? 'Connected' : 'Detected') : 'Not Found'}
          color={bridgePresent && bridgeConnected ? '#22c55e' : bridgePresent ? '#f59e0b' : 'var(--muted)'}
        />
        <StatCard title="Devices" value={devices.length.toString()} color={devices.length > 0 ? '#22c55e' : 'var(--muted)'} />
        <StatCard title="Protocol" value={protocol} color="#00aecd" />
        <StatCard
          title="ECU Channel"
          value={connected ? (channelId !== null ? `#${channelId}` : 'Active') : 'Idle'}
          color={connected ? '#22c55e' : 'var(--muted)'}
        />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <SectionTitle>Connection</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bridgePresent ? (
              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(0,174,200,0.06)', border: '1px solid rgba(0,174,200,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>🖥️ Local Bridge</div>
                  <Badge variant={bridgeConnected ? 'success' : 'warning'}>
                    {bridgeConnected ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>ws://127.0.0.1:8765</div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Bridge not detected on this machine.
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={downloadBridge}
                    style={{
                      padding: '8px 16px', borderRadius: 6,
                      background: 'var(--accent)', color: '#000', fontWeight: 700,
                      fontSize: 12, border: 'none', cursor: 'pointer',
                    }}
                  >
                    ⬇️ Download Bridge
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  Required for J2534 hardware (Scanmatik, Tactrix, KESS, etc.) in the browser.
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {connected ? (
              <button
                onClick={handleDisconnect}
                style={{
                  padding: '8px 16px', borderRadius: 6,
                  background: '#ef4444', color: '#fff', fontWeight: 700,
                  fontSize: 12, border: 'none', cursor: 'pointer',
                }}
              >
                🔌 Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={!bridgePresent || !selectedDevice}
                style={{
                  padding: '8px 16px', borderRadius: 6,
                  background: (bridgePresent && selectedDevice) ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: (bridgePresent && selectedDevice) ? '#000' : 'var(--muted)',
                  fontWeight: 700, fontSize: 12, border: 'none',
                  cursor: (bridgePresent && selectedDevice) ? 'pointer' : 'not-allowed',
                }}
              >
                🖥️ Connect
              </button>
            )}
            {bridgePresent && (
              <button
                onClick={scanDevices}
                disabled={scanning}
                style={{
                  padding: '8px 16px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontWeight: 700, fontSize: 12,
                  cursor: scanning ? 'wait' : 'pointer',
                }}
              >
                {scanning ? '🔄 Scanning…' : '🔍 Rescan'}
              </button>
            )}
            <button
              onClick={downloadBridge}
              style={{
                padding: '8px 16px', borderRadius: 6,
                background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              ⬇️ Download Bridge
            </button>
          </div>
        </Card>

        <Card>
          <SectionTitle>Protocol Settings</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Protocol</label>
              <select
                value={protocol}
                onChange={e => setProtocol(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13 }}
              >
                <option value="CAN">CAN (ISO 11898)</option>
                <option value="ISO15765">ISO 15765-4 (CAN)</option>
                <option value="K-Line">K-Line (ISO 9141-2)</option>
                <option value="J1850">J1850 (PWM/VPW)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Baud Rate</label>
              <select
                value={baudRate}
                onChange={e => setBaudRate(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13 }}
              >
                <option value={500000}>500,000 (Standard CAN)</option>
                <option value={250000}>250,000</option>
                <option value={125000}>125,000</option>
                <option value={1000000}>1,000,000 (High-speed CAN)</option>
                <option value={115200}>115,200 (K-Line)</option>
                <option value={10400}>10,400 (K-Line slow)</option>
              </select>
            </div>
          </div>
        </Card>
      </Grid>

      {bridgePresent && devices.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Detected J2534 Devices</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {devices.map((dev, idx) => {
              const isSelected = selectedDevice?.dll === dev.dll
              return (
                <button
                  key={String(dev.dll || idx)}
                  onClick={() => setSelectedDevice(dev)}
                  style={{
                    padding: '10px 14px', borderRadius: 6,
                    background: isSelected ? 'rgba(0,174,200,0.12)' : 'rgba(255,255,255,0.04)',
                    border: isSelected ? '1px solid rgba(0,174,200,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    color: '#fff', fontSize: 13, textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{String(dev.name || 'Unknown Device')}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {dev.vendor ? String(dev.vendor) + ' • ' : ''}{String(dev.dll || '')}
                    </div>
                  </div>
                  {isSelected && <Badge variant="success">Selected</Badge>}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {connected && (
        <Card style={{ marginTop: 16 }}>
          <SectionTitle>Device Information</SectionTitle>
          <Grid columns={2} gap={12}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>J2534 Device</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{String(selectedDevice?.name || '—')}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Channel ID</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{channelId !== null ? '#' + channelId : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Protocol</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{protocol}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Baud Rate</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{baudRate.toLocaleString()}</div>
            </div>
            {ecuInfo && Object.entries(ecuInfo).slice(0, 6).map(([key, value]) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{key}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>{String(value)}</div>
              </div>
            ))}
          </Grid>
        </Card>
      )}

      {error && <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</div>}
    </div>
  )
}
