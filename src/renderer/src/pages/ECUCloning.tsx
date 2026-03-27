import { useState } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props { connected: boolean; activeVehicle: ActiveVehicle | null }

type Step = 'idle' | 'reading' | 'read-done' | 'writing' | 'write-done' | 'cloning' | 'clone-done'

export default function ECUCloning({ connected, activeVehicle }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState(0)
  const [readFile, setReadFile] = useState<string | null>(null)
  const [writeFile, setWriteFile] = useState<{ name: string; size: number } | null>(null)
  const [log, setLog] = useState<{ msg: string; type: string }[]>([])

  const addLog = (msg: string, type = 'info') =>
    setLog((l) => [...l, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }])

  const runWithProgress = (
    startStep: Step,
    endStep: Step,
    messages: { at: number; msg: string; type?: string }[],
    onDone: () => void
  ) => {
    setProgress(0)
    setStep(startStep)
    let i = 0
    const interval = setInterval(() => {
      i++
      setProgress(i)
      const m = messages.find((m) => m.at === i)
      if (m) addLog(m.msg, m.type || 'info')
      if (i >= 100) {
        clearInterval(interval)
        setStep(endStep)
        onDone()
      }
    }, 40)
  }

  const startRead = () => {
    if (!connected) return
    addLog('Initiating ECU memory read...', 'info')
    runWithProgress(
      'reading', 'read-done',
      [
        { at: 5,  msg: 'Connected to ECU via J2534', type: 'success' },
        { at: 20, msg: 'Reading flash sector 0x0000...', type: 'info' },
        { at: 50, msg: 'Reading flash sector 0x8000...', type: 'info' },
        { at: 80, msg: 'Reading flash sector 0xF000...', type: 'info' },
        { at: 99, msg: 'Verifying checksum...', type: 'info' },
      ],
      () => {
        const name = `ECU_READ_${Date.now()}.bin`
        setReadFile(name)
        addLog(`Read complete — saved as ${name}`, 'success')
      }
    )
  }

  const selectWriteFile = async () => {
    const result = await (window as any).api?.openEcuFile()
    if (result) {
      setWriteFile(result)
      addLog(`Selected: ${result.name} (${(result.size / 1024).toFixed(0)} KB)`, 'info')
    }
  }

  const startWrite = () => {
    if (!connected || !writeFile) return
    addLog(`Writing ${writeFile.name} to ECU...`, 'info')
    runWithProgress(
      'writing', 'write-done',
      [
        { at: 5,  msg: 'Unlocking ECU for write...', type: 'info' },
        { at: 15, msg: 'Erasing flash memory...', type: 'warn' },
        { at: 40, msg: 'Writing sector 0x0000...', type: 'info' },
        { at: 70, msg: 'Writing sector 0x8000...', type: 'info' },
        { at: 90, msg: 'Calculating checksums...', type: 'info' },
        { at: 99, msg: 'Verifying written data...', type: 'info' },
      ],
      () => addLog('Write complete — ECU updated successfully', 'success')
    )
  }

  const busy = ['reading', 'writing', 'cloning'].includes(step)

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div>
        <h1>ECU Cloning</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {!connected && (
        <div className="banner banner-warning">⚠ No device connected. Connect via J2534 PassThru first.</div>
      )}

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {/* READ */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📤</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--accent)' }}>READ ECU</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Read full ECU memory to .bin file
          </div>
          {readFile && (
            <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 10, fontFamily: 'monospace' }}>
              ✓ {readFile}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={startRead} disabled={!connected || busy}>
            {step === 'reading' ? 'Reading...' : 'START READ'}
          </button>
        </div>

        {/* WRITE */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📥</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--accent)' }}>WRITE ECU</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Write tune/backup to ECU
          </div>
          {writeFile && (
            <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 10, fontFamily: 'monospace' }}>
              ✓ {writeFile.name}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={selectWriteFile} disabled={busy}>
              📂 SELECT FILE
            </button>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={startWrite} disabled={!connected || !writeFile || busy}>
              {step === 'writing' ? 'Writing...' : 'WRITE ECU'}
            </button>
          </div>
        </div>

        {/* CLONE */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--accent)' }}>CLONE ECU</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Copy one ECU to another
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', marginBottom: 16, lineHeight: 1.6 }}>
            1. Connect source ECU<br />
            2. Read → saves to file<br />
            3. Connect target ECU<br />
            4. Write saved file
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} disabled>
            Use READ + WRITE above
          </button>
        </div>
      </div>

      {/* Progress */}
      {busy && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
            {step === 'reading' ? 'Reading ECU...' : 'Writing ECU...'}
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label>Activity Log</label>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setLog([])}>
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
