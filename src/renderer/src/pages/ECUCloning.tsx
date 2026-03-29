import { useState, useEffect, useRef } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props {
  connected: boolean
  activeVehicle: ActiveVehicle | null
}

type Step = 'idle' | 'identifying' | 'reading' | 'read-done' | 'writing' | 'write-done' | 'error'

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

interface LogEntry {
  msg: string
  type: 'info' | 'success' | 'warn' | 'error'
}

// Protocol options (matching J2534PassThru page)
const PROTOCOL_OPTIONS = [
  { label: 'ISO 15765 CAN 500k (default)', protocolId: 6 },
  { label: 'ISO 15765 CAN 250k',           protocolId: 6 },
  { label: 'K-Line ISO9141',               protocolId: 3 },
  { label: 'KWP2000 ISO14230',             protocolId: 4 },
]

const CHUNK_SIZES = [128, 256, 512]

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function ECUCloning({ connected, activeVehicle }: Props) {
  const api = (window as any).api

  // ── Shared state ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])

  // ── ECU ID state ────────────────────────────────────────────────────────────
  const [ecuId, setEcuId] = useState<ECUIdentification | null>(null)

  // ── READ state ──────────────────────────────────────────────────────────────
  const [readStartAddr, setReadStartAddr] = useState('0x000000')
  const [readEndAddr, setReadEndAddr] = useState('0x080000')
  const [readChunk, setReadChunk] = useState<number>(256)
  const [readProtocol, setReadProtocol] = useState<number>(6)
  const [readResult, setReadResult] = useState<Uint8Array | null>(null)
  const [readFileName, setReadFileName] = useState<string>('')

  // ── WRITE state ─────────────────────────────────────────────────────────────
  const [writeFile, setWriteFile] = useState<{ name: string; size: number; data?: number[] } | null>(null)
  const [writeStartAddr, setWriteStartAddr] = useState('0x000000')
  const [writeChunk, setWriteChunk] = useState<number>(256)
  const [writeProtocol, setWriteProtocol] = useState<number>(6)

  // ── Progress event listener ─────────────────────────────────────────────────
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (api?.onJ2534Progress) {
      const unsub = api.onJ2534Progress((data: { pct: number; msg: string }) => {
        setProgress(data.pct)
        setProgressMsg(data.msg)
        addLog(data.msg, 'info')
      })
      unsubRef.current = unsub
    }
    return () => {
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const addLog = (msg: string, type: LogEntry['type'] = 'info') =>
    setLog((l) => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])

  const parseHexAddr = (s: string): number => {
    const cleaned = s.trim().replace(/^0x/i, '')
    return parseInt(cleaned, 16) || 0
  }

  const busy = ['identifying', 'reading', 'writing'].includes(step)

  // ── ECU Identification ──────────────────────────────────────────────────────
  const handleIdentify = async () => {
    if (!connected) return
    setStep('identifying')
    setEcuId(null)
    addLog('Reading ECU identification DIDs via UDS...', 'info')
    try {
      const result = await api.j2534ReadECUID()
      if (result.ok && result.id) {
        setEcuId(result.id)
        const found = Object.keys(result.id.raw ?? {}).length
        if (found > 0) {
          addLog(`ECU identified — ${found} DID(s) read successfully`, 'success')
        } else {
          addLog('ECU responded but no readable data found (may need extended session or different protocol)', 'warn')
        }
      } else {
        addLog(`ECU identification failed: ${result.error ?? 'unknown error'}`, 'error')
      }
    } catch (err: unknown) {
      addLog(`ECU identification exception: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
    setStep('idle')
  }

  // ── ECU Flash READ ──────────────────────────────────────────────────────────
  const handleRead = async () => {
    if (!connected) return
    const startAddr = parseHexAddr(readStartAddr)
    const endAddr = parseHexAddr(readEndAddr)
    if (endAddr <= startAddr) {
      addLog('End address must be greater than start address', 'error')
      return
    }
    const totalLength = endAddr - startAddr

    setStep('reading')
    setProgress(0)
    setProgressMsg('')
    setReadResult(null)
    addLog(`Starting ECU read: 0x${startAddr.toString(16).toUpperCase()} → 0x${endAddr.toString(16).toUpperCase()} (${formatSize(totalLength)})`, 'info')

    try {
      const result = await api.j2534ReadECUFlash(startAddr, totalLength, readChunk, readProtocol)
      if (result.ok && result.data) {
        // result.data arrives as a plain object (IPC serialisation), reconstruct as Uint8Array
        const arr = result.data instanceof Uint8Array
          ? result.data
          : new Uint8Array(Object.values(result.data as Record<string, number>))
        setReadResult(arr)
        const name = `ECU_READ_0x${startAddr.toString(16).toUpperCase()}_${Date.now()}.bin`
        setReadFileName(name)
        addLog(`Read complete — ${formatSize(arr.length)} captured`, 'success')
        setStep('read-done')
      } else {
        addLog(`Read failed: ${result.error ?? 'unknown error'}`, 'error')
        setStep('error')
      }
    } catch (err: unknown) {
      addLog(`Read exception: ${err instanceof Error ? err.message : String(err)}`, 'error')
      setStep('error')
    }
  }

  const handleDownload = () => {
    if (!readResult) return
    const blob = new Blob([readResult], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = readFileName || 'ecu_read.bin'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addLog(`Downloaded: ${readFileName}`, 'success')
  }

  // ── ECU Flash WRITE ─────────────────────────────────────────────────────────
  const handleSelectWriteFile = async () => {
    const result = await api?.openEcuFile()
    if (result) {
      setWriteFile({ name: result.name, size: result.size })
      addLog(`Selected: ${result.name} (${formatSize(result.size)})`, 'info')
    }
  }

  const handleWrite = async () => {
    if (!connected || !writeFile) return
    setStep('writing')
    setProgress(0)
    setProgressMsg('')
    addLog(`Starting ECU write: ${writeFile.name} (${formatSize(writeFile.size)})`, 'warn')
    addLog('WARNING: Do not disconnect or power off during write!', 'warn')

    try {
      // Re-read the file content fresh via the IPC channel
      const fileResult = await api?.openEcuFile()
      if (!fileResult) {
        addLog('File selection cancelled', 'warn')
        setStep('idle')
        return
      }

      // The file data may not be returned from openEcuFile — we need a readFile IPC
      // Since openEcuFile only returns {path, name, size}, we use a workaround:
      // Ask the user to re-select; in practice main/index.ts must return data too.
      // For now, indicate that write requires the data buffer.
      // (The existing open-ecu-file handler returns size but not the bytes array)
      addLog('Note: openEcuFile does not return file bytes. Please implement a readEcuFileBytes IPC handler or use the drag-and-drop approach.', 'warn')
      addLog('Write aborted — file bytes not available via current IPC API', 'error')
      setStep('error')
    } catch (err: unknown) {
      addLog(`Write exception: ${err instanceof Error ? err.message : String(err)}`, 'error')
      setStep('error')
    }
  }

  // ── WRITE using file input (renderer-side FileReader, no IPC needed for bytes) ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [writeFileData, setWriteFileData] = useState<Uint8Array | null>(null)

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setWriteFile({ name: file.name, size: file.size })
    addLog(`Selected: ${file.name} (${formatSize(file.size)})`, 'info')
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result instanceof ArrayBuffer) {
        setWriteFileData(new Uint8Array(ev.target.result))
        addLog('File loaded into memory — ready to write', 'success')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleWriteReal = async () => {
    if (!connected || !writeFileData) return
    const startAddr = parseHexAddr(writeStartAddr)

    setStep('writing')
    setProgress(0)
    setProgressMsg('')
    addLog(`Starting ECU flash write @ 0x${startAddr.toString(16).toUpperCase()} — ${formatSize(writeFileData.length)}`, 'warn')
    addLog('WARNING: Do not disconnect or power off during write!', 'warn')

    try {
      const dataArr = Array.from(writeFileData)
      const result = await api.j2534WriteECUFlash(dataArr, startAddr, writeChunk, writeProtocol)
      if (result.ok) {
        addLog(`Write complete — ${formatSize(result.bytesWritten ?? writeFileData.length)} written to ECU`, 'success')
        setStep('write-done')
      } else {
        addLog(`Write failed: ${result.error ?? 'unknown error'}`, 'error')
        if ((result.error ?? '').includes('Security Access')) {
          addLog('Tip: Flash write requires ECU security access (seed/key). Use bench mode or a specialist tool for this ECU type.', 'warn')
        }
        setStep('error')
      }
    } catch (err: unknown) {
      addLog(`Write exception: ${err instanceof Error ? err.message : String(err)}`, 'error')
      setStep('error')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </div>
        <h1>ECU Read / Write / Clone</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {!connected && (
        <div className="banner banner-warning">
          No J2534 device connected. Connect via J2534 PassThru before using ECU read/write.
        </div>
      )}

      {/* ── ECU IDENTIFICATION ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)', letterSpacing: '0.05em' }}>
            ECU IDENTIFICATION
          </div>
          <button
            className="btn btn-primary"
            onClick={handleIdentify}
            disabled={!connected || busy}
            style={{ minWidth: 140 }}
          >
            {step === 'identifying' ? 'Identifying...' : 'READ ECU ID'}
          </button>
        </div>

        {ecuId ? (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                { label: 'VIN',          value: ecuId.vin },
                { label: 'Part Number',  value: ecuId.partNumber },
                { label: 'SW Version',   value: ecuId.swVersion },
                { label: 'HW Version',   value: ecuId.hwVersion },
                { label: 'ECU Serial',   value: ecuId.ecuSerial },
                { label: 'Supplier',     value: ecuId.supplierName },
                { label: 'System Name',  value: ecuId.systemName },
              ].map(({ label, value }) =>
                value ? (
                  <tr key={label} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '6px 12px 6px 0', color: 'var(--text-muted)', width: 130, whiteSpace: 'nowrap' }}>
                      {label}:
                    </td>
                    <td style={{ padding: '6px 0', fontFamily: 'monospace', color: 'var(--text)', fontWeight: 600 }}>
                      {value}
                    </td>
                  </tr>
                ) : null
              )}
              {Object.keys(ecuId.raw).length === 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: '8px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No readable identification data found. ECU may require a different protocol or session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Reads standard UDS DIDs: VIN (0xF190), Part Number (0xF187), SW/HW versions, ECU serial, supplier.
            No security access required.
          </div>
        )}
      </div>

      {/* ── READ + WRITE grid ──────────────────────────────────────────────── */}
      <div className="grid-2" style={{ marginBottom: 16 }}>

        {/* ── READ ECU ─────────────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)', marginBottom: 12, letterSpacing: '0.05em' }}>
            READ ECU FLASH
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Start Address</label>
              <input
                className="input"
                value={readStartAddr}
                onChange={(e) => setReadStartAddr(e.target.value)}
                placeholder="0x000000"
                disabled={busy}
                style={{ fontFamily: 'monospace', width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>End Address</label>
              <input
                className="input"
                value={readEndAddr}
                onChange={(e) => setReadEndAddr(e.target.value)}
                placeholder="0x080000"
                disabled={busy}
                style={{ fontFamily: 'monospace', width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Chunk Size</label>
              <select
                className="input"
                value={readChunk}
                onChange={(e) => setReadChunk(Number(e.target.value))}
                disabled={busy}
                style={{ width: '100%' }}
              >
                {CHUNK_SIZES.map((s) => (
                  <option key={s} value={s}>{s} bytes</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Protocol</label>
              <select
                className="input"
                value={readProtocol}
                onChange={(e) => setReadProtocol(Number(e.target.value))}
                disabled={busy}
                style={{ width: '100%' }}
              >
                {PROTOCOL_OPTIONS.map((p) => (
                  <option key={p.label} value={p.protocolId}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {readStartAddr && readEndAddr && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              Total: {formatSize(Math.max(0, parseHexAddr(readEndAddr) - parseHexAddr(readStartAddr)))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleRead}
              disabled={!connected || busy}
            >
              {step === 'reading' ? 'Reading...' : 'START READ'}
            </button>
            {readResult && (
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleDownload}
                disabled={busy}
              >
                DOWNLOAD .BIN
              </button>
            )}
          </div>

          {readResult && step === 'read-done' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--success)', fontFamily: 'monospace' }}>
              {readFileName} ({formatSize(readResult.length)})
            </div>
          )}
        </div>

        {/* ── WRITE ECU ────────────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)', marginBottom: 12, letterSpacing: '0.05em' }}>
            WRITE ECU FLASH
          </div>

          <div className="banner banner-warning" style={{ fontSize: 11, marginBottom: 12, padding: '8px 12px' }}>
            Flash write requires ECU security access (seed/key algorithm). Without the manufacturer's
            algorithm, write will stop after seed request. Use bench/bootloader mode or a specialist
            tool for ECUs with active security. NEVER interrupt a write in progress — this may brick the ECU.
          </div>

          {/* Hidden native file input for renderer-side file reading */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin,.hex,.ori,.sgo"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />

          <div style={{ marginBottom: 12 }}>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              SELECT FILE (.bin / .hex / .ori)
            </button>
            {writeFile && (
              <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'monospace', marginBottom: 8 }}>
                {writeFile.name} ({formatSize(writeFile.size)})
                {writeFileData && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>loaded</span>}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Start Address</label>
              <input
                className="input"
                value={writeStartAddr}
                onChange={(e) => setWriteStartAddr(e.target.value)}
                placeholder="0x000000"
                disabled={busy}
                style={{ fontFamily: 'monospace', width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Chunk Size</label>
              <select
                className="input"
                value={writeChunk}
                onChange={(e) => setWriteChunk(Number(e.target.value))}
                disabled={busy}
                style={{ width: '100%' }}
              >
                {CHUNK_SIZES.map((s) => (
                  <option key={s} value={s}>{s} bytes</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Protocol</label>
              <select
                className="input"
                value={writeProtocol}
                onChange={(e) => setWriteProtocol(Number(e.target.value))}
                disabled={busy}
                style={{ width: '100%' }}
              >
                {PROTOCOL_OPTIONS.map((p) => (
                  <option key={p.label} value={p.protocolId}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', background: 'var(--danger, #e53e3e)' }}
            onClick={handleWriteReal}
            disabled={!connected || !writeFileData || busy}
          >
            {step === 'writing' ? 'Writing...' : 'WRITE TO ECU'}
          </button>
        </div>
      </div>

      {/* ── CLONE INFO ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)', marginBottom: 10, letterSpacing: '0.05em' }}>
          CLONE ECU (2-STEP PROCESS)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { n: '1', title: 'Connect Source ECU', desc: 'Connect donor ECU via J2534 interface. Ensure ignition is on and battery voltage is stable.' },
            { n: '2', title: 'READ Source ECU', desc: 'Use READ above with the correct address range for your ECU type. Download the .bin file.' },
            { n: '3', title: 'Connect Target ECU', desc: 'Disconnect source, connect target/replacement ECU. Verify connection via ECU ID.' },
            { n: '4', title: 'WRITE to Target', desc: 'Select the saved .bin file, verify start address, then use WRITE. Security access may be required.' },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: 'flex', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--accent)', color: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12, flexShrink: 0, marginTop: 2,
              }}>{n}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PROGRESS ───────────────────────────────────────────────────────── */}
      {busy && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {step === 'reading' ? 'Reading ECU Flash...' :
               step === 'writing' ? 'Writing ECU Flash...' : 'Identifying ECU...'}
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{progress}%</span>
          </div>
          <div className="progress-bar" style={{ marginBottom: 8 }}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          {progressMsg && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {progressMsg}
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVITY LOG ───────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
            {log.map((l, i) => (
              <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
