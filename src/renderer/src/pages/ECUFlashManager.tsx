import { useState, useEffect, useRef } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { bridge } from '../lib/bridgeClient'

interface ConnectResult { ok: boolean; error?: string }
interface Props {
  connected: boolean
  activeVehicle: ActiveVehicle | null
  onConnect?: () => Promise<ConnectResult>
}

interface ECUFlashDef {
  id: string
  name: string
  manufacturer: string
  family: string
  vehicles: string[]
  protocol: number
  baudRate: number
  sessionType: number
  securityLevel: number
  seedLength: number
  flashStartAddr: number
  flashSize: number
  chunkSize: number
  canFlashOBD: boolean
  requiresBench: boolean
  notes: string
}

interface ECUIdentification {
  vin?: string
  ecuSerial?: string
  swVersion?: string
  hwVersion?: string
  partNumber?: string
  supplierName?: string
  systemName?: string
  raw: Record<string, string>
}

type Tab = 'select' | 'read' | 'write' | 'seedkey' | 'checksum'
type Phase = 'idle' | 'reading-id' | 'reading-flash' | 'writing' | 'done' | 'error'

const PROTOCOL_LABELS: Record<number, string> = {
  3: 'K-Line ISO9141',
  4: 'KWP2000 ISO14230',
  6: 'CAN ISO15765',
}

const MFR_COLORS: Record<string, string> = {
  Bosch: '#00aec8',
  Siemens: '#60a5fa',
  Continental: '#60a5fa',
  Delphi: '#a78bfa',
  Marelli: '#f97316',
  Denso: '#4ade80',
  BMW: '#3b82f6',
}

// Checksum helpers (browser-side, no Node required)
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function boschSimpleChecksum(data: Uint8Array, start: number, end: number): number {
  let sum = 0
  for (let i = start; i < end && i < data.length; i++) sum = (sum + data[i]) & 0xFF
  return (0x100 - sum) & 0xFF
}

function hexPreview(data: Uint8Array, n = 16): string {
  return Array.from(data.slice(0, n))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

function fmtHex(n: number, pad = 6): string {
  return '0x' + n.toString(16).toUpperCase().padStart(pad, '0')
}

function fmtSize(bytes: number): string {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

export default function ECUFlashManager({ connected, activeVehicle, onConnect }: Props) {
  const [tab, setTab] = useState<Tab>('select')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const handleQuickConnect = async () => {
    if (!onConnect) return
    setConnecting(true); setConnectError(null)
    const r = await onConnect()
    setConnecting(false)
    if (!r.ok) setConnectError(r.error || 'Connect failed')
  }
  const [ecuDefs, setEcuDefs] = useState<ECUFlashDef[]>([])
  const [selectedEcu, setSelectedEcu] = useState<ECUFlashDef | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [log, setLog] = useState<{ msg: string; type: string }[]>([])
  const [ecuId, setEcuId] = useState<ECUIdentification | null>(null)
  const [readData, setReadData] = useState<Uint8Array | null>(null)
  const [writeFile, setWriteFile] = useState<{ name: string; size: number; data: Uint8Array } | null>(null)
  const [startAddr, setStartAddr] = useState('0x000000')
  const [seedInput, setSeedInput] = useState('')
  const [keyResult, setKeyResult] = useState<{ ok: boolean; key?: number[]; error?: string } | null>(null)
  const [csumFile, setCsumFile] = useState<{ name: string; data: Uint8Array } | null>(null)
  const [csumResult, setCsumResult] = useState<{ stored: string; calculated: string; match: boolean } | null>(null)
  const [confirmWrite, setConfirmWrite] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const addLog = (msg: string, type = 'info') => {
    setLog(l => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])
  }

  // Load ECU definitions from main process
  useEffect(() => {
    const api = (window as any).api
    api?.j2534GetECUDefinitions?.().then((defs: ECUFlashDef[]) => {
      if (defs?.length) {
        setEcuDefs(defs)
        setSelectedEcu(defs[0])
      }
    })
  }, [])

  // Subscribe to J2534 progress events
  useEffect(() => {
    const api = (window as any).api
    if (!api?.onJ2534Progress) return
    const unsub = api.onJ2534Progress(({ pct, msg }: { pct: number; msg: string }) => {
      setProgress(pct)
      setProgressMsg(msg)
      addLog(msg, pct === 100 ? 'success' : pct < 0 ? 'error' : 'info')
    })
    unsubRef.current = unsub
    return () => { unsubRef.current?.() }
  }, [])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // ── ECU Identification ─────────────────────────────────────────────────────
  const readEcuId = async () => {
    if (!connected) { addLog('Not connected — connect a J2534 device first', 'error'); return }
    setPhase('reading-id')
    setEcuId(null)
    const api = (window as any).api
    const useBridge = !api?.j2534ReadECUID && bridge.isConnected()
    addLog(`Reading ECU identification DIDs... (${api?.j2534ReadECUID ? 'desktop' : useBridge ? 'bridge' : 'no backend'})`, 'info')
    const result = api?.j2534ReadECUID
      ? await api.j2534ReadECUID()
      : useBridge ? await bridge.j2534ReadECUID() : { ok: false, error: 'Install desktop app or DCTuning Bridge' }
    if (result?.ok && result.id) {
      setEcuId(result.id)
      addLog('ECU identification complete', 'success')
      // Try to auto-match ECU def
      const id = result.id as ECUIdentification
      if (id.partNumber || id.systemName) {
        const search = `${id.partNumber || ''} ${id.systemName || ''}`.toLowerCase()
        const match = ecuDefs.find(d =>
          d.vehicles.some(v => v.toLowerCase().split(' ').some(w => search.includes(w))) ||
          search.includes(d.family.toLowerCase())
        )
        if (match) {
          setSelectedEcu(match)
          addLog(`Auto-matched ECU definition: ${match.name}`, 'success')
        }
      }
    } else {
      addLog(`ECU ID read failed: ${result?.error || 'No response'}`, 'error')
    }
    setPhase('idle')
  }

  // ── Read Flash ─────────────────────────────────────────────────────────────
  const readFlash = async () => {
    if (!connected || !selectedEcu) return
    setPhase('reading-flash')
    setProgress(0)
    setReadData(null)
    addLog(`Starting flash read: ${selectedEcu.name}`, 'info')
    addLog(`Address: ${fmtHex(selectedEcu.flashStartAddr)} → ${fmtHex(selectedEcu.flashStartAddr + selectedEcu.flashSize)} (${fmtSize(selectedEcu.flashSize)})`, 'info')

    const api = (window as any).api
    const useBridge = !api?.j2534ReadECUFlash && bridge.isConnected()
    const result = api?.j2534ReadECUFlash
      ? await api.j2534ReadECUFlash(
          selectedEcu.flashStartAddr,
          selectedEcu.flashSize,
          selectedEcu.chunkSize,
          selectedEcu.protocol
        )
      : useBridge
        ? await bridge.j2534ReadFlash(
            selectedEcu.flashStartAddr,
            selectedEcu.flashSize,
            selectedEcu.chunkSize,
            selectedEcu.protocol
          )
        : { ok: false, error: 'Install desktop app or DCTuning Bridge' }

    if (result?.ok && result.data) {
      const bytes = new Uint8Array(result.data)
      setReadData(bytes)
      addLog(`Read complete — ${fmtSize(result.bytesRead || bytes.length)}`, 'success')
      setPhase('done')
    } else {
      addLog(`Read failed: ${result?.error || 'Unknown error'}`, 'error')
      setPhase('error')
    }
  }

  const downloadReadData = () => {
    if (!readData) return
    const blob = new Blob([readData], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedEcu?.id || 'ecu'}_read_${Date.now()}.bin`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Write Flash ────────────────────────────────────────────────────────────
  const pickWriteFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.bin,.hex,.ori'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const buf = await file.arrayBuffer()
      setWriteFile({ name: file.name, size: file.size, data: new Uint8Array(buf) })
      setConfirmWrite(false)
      addLog(`Loaded: ${file.name} (${fmtSize(file.size)})`, 'info')
    }
    input.click()
  }

  const writeFlash = async () => {
    if (!connected || !selectedEcu || !writeFile) return
    setPhase('writing')
    setProgress(0)
    setConfirmWrite(false)
    const addr = parseInt(startAddr, 16) || selectedEcu.flashStartAddr
    addLog(`Starting flash write: ${writeFile.name} → ${fmtHex(addr)}`, 'warn')
    addLog(`ECU: ${selectedEcu.name} | Protocol: ${PROTOCOL_LABELS[selectedEcu.protocol] || selectedEcu.protocol}`, 'info')

    const api = (window as any).api
    const dataArr = Array.from(writeFile.data)
    const result = await api?.j2534WriteECUFlash?.(
      dataArr,
      addr,
      selectedEcu.chunkSize,
      selectedEcu.protocol,
      selectedEcu.id
    )

    if (result?.ok) {
      addLog(`Write complete — ${fmtSize(result.bytesWritten || writeFile.size)}`, 'success')
      setPhase('done')
    } else {
      addLog(`Write failed: ${result?.error || 'Unknown error'}`, 'error')
      setPhase('error')
    }
  }

  // ── Seed/Key ────────────────────────────────────────────────────────────────
  const calcKey = async () => {
    if (!selectedEcu || !seedInput.trim()) return
    const api = (window as any).api
    const result = await api?.j2534CalcKey?.(selectedEcu.id, seedInput.trim())
    setKeyResult(result)
  }

  // ── Checksum ────────────────────────────────────────────────────────────────
  const pickCsumFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.bin,.hex,.ori'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const buf = await file.arrayBuffer()
      setCsumFile({ name: file.name, data: new Uint8Array(buf) })
      setCsumResult(null)
    }
    input.click()
  }

  const checkChecksum = () => {
    if (!csumFile || !selectedEcu) return
    const data = csumFile.data
    const algo = selectedEcu.manufacturer === 'Bosch' && selectedEcu.flashSize >= 0x100000
      ? 'crc32' : 'simple'

    let stored = '—'
    let calculated = '—'
    let match = false

    if (algo === 'crc32') {
      // Read stored CRC from last 4 bytes of main code area
      const csumOffset = Math.min(selectedEcu.flashSize - 8, data.length - 8)
      const s = data[csumOffset] | (data[csumOffset+1] << 8) | (data[csumOffset+2] << 16) | (data[csumOffset+3] << 24)
      stored = '0x' + (s >>> 0).toString(16).toUpperCase().padStart(8, '0')
      // Calculate over code area (skip last 4 bytes)
      const calc = crc32(data.slice(0, csumOffset))
      calculated = '0x' + calc.toString(16).toUpperCase().padStart(8, '0')
      match = (s >>> 0) === calc
    } else {
      // Simple sum checksum — common on ME7/EDC16
      const csumOffset = Math.min(0x7FFF, data.length - 1)
      stored = '0x' + data[csumOffset].toString(16).toUpperCase().padStart(2, '0')
      const calc = boschSimpleChecksum(data, 0, csumOffset)
      calculated = '0x' + calc.toString(16).toUpperCase().padStart(2, '0')
      match = data[csumOffset] === calc
    }
    setCsumResult({ stored, calculated, match })
  }

  const fixChecksum = () => {
    if (!csumFile || !selectedEcu || !csumResult) return
    const data = new Uint8Array(csumFile.data)
    const algo = selectedEcu.manufacturer === 'Bosch' && selectedEcu.flashSize >= 0x100000 ? 'crc32' : 'simple'

    if (algo === 'crc32') {
      const csumOffset = Math.min(selectedEcu.flashSize - 8, data.length - 8)
      const calc = crc32(data.slice(0, csumOffset))
      data[csumOffset]   =  calc & 0xFF
      data[csumOffset+1] = (calc >> 8)  & 0xFF
      data[csumOffset+2] = (calc >> 16) & 0xFF
      data[csumOffset+3] = (calc >> 24) & 0xFF
    } else {
      const csumOffset = Math.min(0x7FFF, data.length - 1)
      data[csumOffset] = boschSimpleChecksum(data, 0, csumOffset)
    }

    const blob = new Blob([data], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = csumFile.name.replace(/\.bin$/i, '_fixed.bin')
    a.click()
    URL.revokeObjectURL(url)
    setCsumResult(prev => prev ? { ...prev, match: true } : prev)
  }

  const busy = ['reading-id', 'reading-flash', 'writing'].includes(phase)

  // ── Group ECU defs by manufacturer ──────────────────────────────────────────
  const grouped = ecuDefs.reduce<Record<string, ECUFlashDef[]>>((acc, def) => {
    ;(acc[def.manufacturer] = acc[def.manufacturer] || []).push(def)
    return acc
  }, {})

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <h1>ECU Flash Manager</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {!connected && (
        <div className="banner banner-warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            {bridge.isConnected()
              ? (connectError ? `Connect failed: ${connectError}` : 'Bridge running but no J2534 device opened.')
              : <>⚠ No J2534 device connected. Install <strong>DCTuning Bridge</strong> or use the desktop app to access J2534 hardware.</>}
          </span>
          {bridge.isConnected() && onConnect && (
            <button
              onClick={handleQuickConnect}
              disabled={connecting}
              style={{
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: 'var(--accent)', color: '#000',
                fontWeight: 800, fontSize: 12, cursor: connecting ? 'wait' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              {connecting ? 'Connecting…' : '🔌 Connect Device'}
            </button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { id: 'select',   label: '① ECU Select' },
          { id: 'read',     label: '② Read ECU' },
          { id: 'write',    label: '③ Write ECU' },
          { id: 'seedkey',  label: '🔑 Seed/Key' },
          { id: 'checksum', label: '✓ Checksum' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'Manrope, sans-serif',
            background: tab === t.id ? 'var(--accent-dim)' : 'var(--bg-card)',
            border: `1px solid ${tab === t.id ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6, color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB 1: ECU SELECT ──────────────────────────────────────────────── */}
      {tab === 'select' && (
        <>
          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>ECU Definition</div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Select ECU family</label>
              <select
                value={selectedEcu?.id || ''}
                onChange={e => setSelectedEcu(ecuDefs.find(d => d.id === e.target.value) || null)}
                style={{ width: '100%', marginBottom: 12 }}
              >
                {Object.entries(grouped).map(([mfr, defs]) => (
                  <optgroup key={mfr} label={mfr}>
                    {defs.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', fontSize: 12 }}
                onClick={readEcuId}
                disabled={!connected || busy}
              >
                {phase === 'reading-id' ? '⏳ Identifying...' : '🔍 Auto-Detect from Connected ECU'}
              </button>
            </div>

            {selectedEcu && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>{selectedEcu.name}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                    background: `${MFR_COLORS[selectedEcu.manufacturer] || '#888'}22`,
                    color: MFR_COLORS[selectedEcu.manufacturer] || '#888',
                    border: `1px solid ${MFR_COLORS[selectedEcu.manufacturer] || '#888'}44`,
                  }}>{selectedEcu.manufacturer}</span>
                </div>
                {[
                  ['Protocol',   PROTOCOL_LABELS[selectedEcu.protocol] || String(selectedEcu.protocol)],
                  ['Flash Size', fmtSize(selectedEcu.flashSize)],
                  ['Start Addr', fmtHex(selectedEcu.flashStartAddr)],
                  ['Chunk Size', `${selectedEcu.chunkSize} bytes`],
                  ['OBD Flash',  selectedEcu.canFlashOBD ? '✓ Supported' : '✗ Bench only'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, gap: 8 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                    <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
                {selectedEcu.notes && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    💡 {selectedEcu.notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedEcu && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Compatible Vehicles</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedEcu.vehicles.map(v => (
                  <span key={v} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 4,
                    background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}>{v}</span>
                ))}
              </div>
            </div>
          )}

          {ecuId && (
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--accent)' }}>ECU Identity (Read from Vehicle)</div>
              <table className="data-table">
                <tbody>
                  {[
                    ['VIN',          ecuId.vin],
                    ['Part Number',  ecuId.partNumber],
                    ['SW Version',   ecuId.swVersion],
                    ['HW Version',   ecuId.hwVersion],
                    ['ECU Serial',   ecuId.ecuSerial],
                    ['Supplier',     ecuId.supplierName],
                    ['System Name',  ecuId.systemName],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <tr key={k as string}>
                      <td style={{ color: 'var(--text-muted)', width: '35%', fontSize: 12 }}>{k}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: READ ECU ────────────────────────────────────────────────── */}
      {tab === 'read' && (
        <>
          {!selectedEcu ? (
            <div className="banner banner-warning">Select an ECU definition on the ECU Select tab first.</div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Read ECU Flash</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {selectedEcu.name} · {fmtSize(selectedEcu.flashSize)} · {PROTOCOL_LABELS[selectedEcu.protocol]}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={readEcuId} disabled={!connected || busy} style={{ flex: 1 }}>
                    {phase === 'reading-id' ? '⏳ Reading...' : '🔍 Read ECU Identity'}
                  </button>
                  <button className="btn btn-primary" onClick={readFlash} disabled={!connected || busy} style={{ flex: 1 }}>
                    {phase === 'reading-flash' ? '⏳ Reading Flash...' : '📤 Read Full Flash'}
                  </button>
                </div>

                {busy && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{progressMsg}</div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%`, transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{progress}%</div>
                  </div>
                )}
              </div>

              {readData && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--success)' }}>✓ Read Complete</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {fmtSize(readData.length)} · CRC32: 0x{crc32(readData).toString(16).toUpperCase().padStart(8, '0')}
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={downloadReadData}>⬇ Download .bin</button>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', background: 'rgba(0,0,0,.3)', padding: '8px 12px', borderRadius: 6 }}>
                    {hexPreview(readData, 32)}...
                  </div>
                </div>
              )}

              {ecuId && (
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, color: 'var(--accent)' }}>ECU Identity</div>
                  <table className="data-table">
                    <tbody>
                      {[['VIN', ecuId.vin], ['Part Number', ecuId.partNumber], ['SW Version', ecuId.swVersion], ['HW Version', ecuId.hwVersion], ['Supplier', ecuId.supplierName]]
                        .filter(([, v]) => v).map(([k, v]) => (
                        <tr key={k as string}>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12, width: '35%' }}>{k}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── TAB 3: WRITE ECU ───────────────────────────────────────────────── */}
      {tab === 'write' && (
        <>
          <div className="banner banner-danger" style={{ marginBottom: 16 }}>
            <strong>⚠ WARNING — ECU flashing risk</strong>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Interrupted or incorrect flash write can permanently brick your ECU. Always use a stable bench power supply (13.2–13.8V). Never disconnect the vehicle during flashing. Test on a spare ECU first.
            </div>
          </div>

          {!selectedEcu ? (
            <div className="banner banner-warning">Select an ECU definition on the ECU Select tab first.</div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Flash File</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <button className="btn btn-secondary" onClick={pickWriteFile} disabled={busy} style={{ flexShrink: 0 }}>
                    📂 Select .bin File
                  </button>
                  {writeFile && (
                    <div style={{ fontSize: 12 }}>
                      <strong>{writeFile.name}</strong>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{fmtSize(writeFile.size)}</span>
                      {writeFile.size !== selectedEcu.flashSize && (
                        <span style={{ color: 'var(--warning)', marginLeft: 8 }}>
                          ⚠ Size mismatch (expected {fmtSize(selectedEcu.flashSize)})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {writeFile && (
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', background: 'rgba(0,0,0,.3)', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>
                    {hexPreview(writeFile.data, 32)}...
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Start Address (hex)</label>
                    <input
                      type="text"
                      value={startAddr}
                      onChange={e => setStartAddr(e.target.value)}
                      placeholder={fmtHex(selectedEcu.flashStartAddr)}
                      style={{ fontFamily: 'monospace', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ECU</label>
                    <input type="text" value={selectedEcu.name} readOnly style={{ opacity: 0.6 }} />
                  </div>
                </div>

                {!confirmWrite ? (
                  <button
                    className="btn btn-danger"
                    style={{ width: '100%' }}
                    disabled={!connected || !writeFile || busy}
                    onClick={() => setConfirmWrite(true)}
                  >
                    ⚡ FLASH ECU
                  </button>
                ) : (
                  <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>⚠ Confirm ECU Flash</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginBottom: 12 }}>
                      You are about to write <strong>{writeFile?.name}</strong> to <strong>{selectedEcu.name}</strong>. This cannot be undone without the original file. Are you sure?
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-danger" style={{ flex: 1 }} onClick={writeFlash} disabled={busy}>
                        {phase === 'writing' ? '⏳ Flashing...' : 'YES — FLASH NOW'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setConfirmWrite(false)} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                )}

                {busy && phase === 'writing' && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{progressMsg}</div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--danger)', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{progress}%</div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── TAB 4: SEED/KEY ────────────────────────────────────────────────── */}
      {tab === 'seedkey' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Security Seed/Key Calculator</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Calculate the security key from a seed for supported ECU families. Enter the seed bytes received from the ECU.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ECU Family</label>
              <select
                value={selectedEcu?.id || ''}
                onChange={e => setSelectedEcu(ecuDefs.find(d => d.id === e.target.value) || null)}
                style={{ width: '100%' }}
              >
                {Object.entries(grouped).map(([mfr, defs]) => (
                  <optgroup key={mfr} label={mfr}>
                    {defs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Seed Bytes (hex, space-separated — e.g. <code style={{ fontFamily: 'monospace' }}>A3 F2 11 CC</code>)
              </label>
              <input
                type="text"
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                placeholder="A3 F2 11 CC"
                style={{ fontFamily: 'monospace', fontSize: 14, width: '100%' }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={calcKey}
              disabled={!selectedEcu || !seedInput.trim()}
            >
              🔑 Calculate Key
            </button>

            {keyResult && (
              <div style={{
                marginTop: 16, padding: '12px 16px', borderRadius: 8,
                background: keyResult.ok ? 'rgba(74,222,128,.08)' : 'rgba(239,68,68,.08)',
                border: `1px solid ${keyResult.ok ? 'rgba(74,222,128,.25)' : 'rgba(239,68,68,.25)'}`,
              }}>
                {keyResult.ok ? (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Key to send (0x27 0x02 + key):</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: 'var(--success)', letterSpacing: 2 }}>
                      {keyResult.key!.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      Algorithm: {selectedEcu?.family} · Seed length: {keyResult.key!.length} bytes
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--danger)', fontSize: 13 }}>✗ {keyResult.error}</div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Supported ECU Families</div>
            <table className="data-table">
              <thead>
                <tr><th>ECU</th><th>Family</th><th>Seed Length</th><th>Status</th></tr>
              </thead>
              <tbody>
                {ecuDefs.map(d => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 12 }}>{d.family}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.seedLength} bytes</td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Supported</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB 5: CHECKSUM ────────────────────────────────────────────────── */}
      {tab === 'checksum' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Checksum Tool</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Check and fix ECU binary file checksums. Select the ECU family first to use the correct algorithm.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ECU Family (determines checksum algorithm)</label>
              <select
                value={selectedEcu?.id || ''}
                onChange={e => { setSelectedEcu(ecuDefs.find(d => d.id === e.target.value) || null); setCsumResult(null) }}
                style={{ width: '100%' }}
              >
                {Object.entries(grouped).map(([mfr, defs]) => (
                  <optgroup key={mfr} label={mfr}>
                    {defs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={pickCsumFile} style={{ flexShrink: 0 }}>
                📂 Load .bin File
              </button>
              {csumFile && (
                <div style={{ fontSize: 12 }}>
                  <strong>{csumFile.name}</strong>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{fmtSize(csumFile.data.length)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={checkChecksum} disabled={!csumFile || !selectedEcu} style={{ flex: 1 }}>
                ✓ Check Checksum
              </button>
              <button className="btn btn-secondary" onClick={fixChecksum} disabled={!csumResult || csumResult.match} style={{ flex: 1 }}>
                🔧 Fix &amp; Download
              </button>
            </div>

            {csumResult && (
              <div style={{
                marginTop: 16, padding: '14px 16px', borderRadius: 8,
                background: csumResult.match ? 'rgba(74,222,128,.08)' : 'rgba(251,146,60,.08)',
                border: `1px solid ${csumResult.match ? 'rgba(74,222,128,.25)' : 'rgba(251,146,60,.35)'}`,
              }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Stored in file:</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15 }}>{csumResult.stored}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Calculated:</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: csumResult.match ? 'var(--success)' : 'var(--warning)' }}>
                      {csumResult.calculated}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: csumResult.match ? 'var(--success)' : 'var(--warning)' }}>
                      {csumResult.match ? '✓ VALID' : '⚠ MISMATCH — click Fix & Download'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Activity Log ────────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <label>Activity Log</label>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setLog([])}>Clear</button>
          </div>
          <div className="activity-log">
            {log.map((l, i) => (
              <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}
