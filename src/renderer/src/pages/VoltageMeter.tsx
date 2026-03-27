import { useEffect, useState, useRef } from 'react'

interface Props { connected: boolean }

export default function VoltageMeter({ connected }: Props) {
  const [voltage, setVoltage] = useState(0)
  const [min, setMin] = useState(99)
  const [max, setMax] = useState(0)
  const [avg, setAvg] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const [source, setSource] = useState<'live' | 'sim'>('sim')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const avgRef = useRef(0)

  useEffect(() => {
    if (!connected) {
      setVoltage(0)
      setMin(99)
      setMax(0)
      setAvg(0)
      setHistory([])
      avgRef.current = 0
      return
    }

    const poll = async () => {
      const api = (window as any).api
      if (api?.obdReadVoltage) {
        const v = await api.obdReadVoltage()
        if (typeof v === 'number' && v > 0) {
          setSource('live')
          applyReading(v)
          return
        }
      }
      // Fallback: simulate if no real hardware
      setSource('sim')
      const v = +(12.2 + Math.random() * 0.8 + (Math.random() > 0.9 ? -0.5 : 0)).toFixed(2)
      applyReading(v)
    }

    const applyReading = (v: number) => {
      setVoltage(v)
      setHistory((h) => [...h.slice(-29), v])
      setMin((m) => Math.min(m, v))
      setMax((m) => Math.max(m, v))
      avgRef.current = avgRef.current === 0 ? v : +(avgRef.current * 0.85 + v * 0.15).toFixed(3)
      setAvg(+avgRef.current.toFixed(2))
    }

    poll()
    intervalRef.current = setInterval(poll, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [connected])

  const pct = Math.min(100, Math.max(0, ((voltage - 10) / 6) * 100))
  const color = voltage < 11.5 ? 'var(--danger)' : voltage < 12.5 ? 'var(--warning)' : 'var(--success)'

  const statusLabel = () => {
    if (!connected) return { text: 'Not Connected', color: 'var(--text-muted)' }
    if (voltage < 11.5) return { text: 'Low Voltage — Check Battery', color: 'var(--danger)' }
    if (voltage < 12.0) return { text: 'Battery Weak', color: 'var(--warning)' }
    if (voltage < 12.6) return { text: 'Battery OK', color: 'var(--warning)' }
    if (voltage < 14.4) return { text: 'Charging / Engine Running', color: 'var(--success)' }
    if (voltage < 15.0) return { text: 'High Voltage — Check Alternator', color: 'var(--warning)' }
    return { text: 'Overvoltage — Check System', color: 'var(--danger)' }
  }

  const st = statusLabel()

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
        <h1>Voltage Meter</h1>
        {connected && (
          <span className="badge" style={{
            marginLeft: 12,
            background: source === 'live' ? 'rgba(184,240,42,.12)' : 'rgba(255,255,255,.06)',
            color: source === 'live' ? 'var(--accent)' : 'var(--text-muted)',
            border: `1px solid ${source === 'live' ? 'var(--accent)' : 'var(--border)'}`,
            fontSize: 11,
          }}>
            {source === 'live' ? '● Live OBD2' : '◌ Simulated'}
          </span>
        )}
      </div>

      {!connected && (
        <div className="banner banner-warning" style={{ marginBottom: 20 }}>
          ⚠ Connect an OBD2 device via J2534 PassThru to read live voltage data.
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Main gauge */}
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{
            fontSize: 72,
            fontWeight: 900,
            color,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            marginBottom: 8,
            letterSpacing: '-2px',
          }}>
            {connected ? voltage.toFixed(2) : '—.——'}
          </div>
          <div style={{ fontSize: 20, color: 'var(--text-muted)', marginBottom: 8 }}>Volts (DC)</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: st.color, marginBottom: 20 }}>{st.text}</div>

          <div className="progress-bar" style={{ height: 10, marginBottom: 8 }}>
            <div className="progress-fill" style={{
              width: `${pct}%`,
              background: color,
              transition: 'width 0.5s ease, background 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>10V</span><span>11V</span><span>12V</span><span>13V</span><span>14V</span><span>16V</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Minimum', value: connected && min < 99 ? `${min.toFixed(2)}V` : '—' },
            { label: 'Average',  value: connected && avg > 0 ? `${avg.toFixed(2)}V` : '—' },
            { label: 'Maximum', value: connected && max > 0 ? `${max.toFixed(2)}V` : '—' },
          ].map((s) => (
            <div className="stat-box" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            </div>
          ))}

          {/* Battery health indicator */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 10 }}>
              Voltage Reference
            </div>
            {[
              { range: '> 14.4V', label: 'Alternator Charging', color: 'var(--accent)' },
              { range: '12.6V',   label: 'Battery Full',         color: 'var(--success)' },
              { range: '12.0V',   label: 'Battery ~50%',         color: 'var(--warning)' },
              { range: '< 11.8V', label: 'Battery Discharged',   color: 'var(--danger)' },
            ].map((r) => (
              <div key={r.range} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ fontFamily: 'monospace', color: r.color }}>{r.range}</span>
                <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mini chart */}
      {connected && history.length > 1 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Voltage History (last 30 readings)
          </div>
          <svg width="100%" height="70" style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="vgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Fill area */}
            <polyline
              points={history.map((v, i) => {
                const x = (i / Math.max(history.length - 1, 1)) * 100
                const y = 60 - Math.max(0, Math.min(60, ((v - 10) / 6) * 60))
                return `${x}%,${y}`
              }).join(' ')}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dot for latest reading */}
            {(() => {
              const last = history[history.length - 1]
              const x = 100
              const y = 60 - Math.max(0, Math.min(60, ((last - 10) / 6) * 60))
              return <circle cx={`${x}%`} cy={y} r={4} fill="var(--accent)" />
            })()}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            <span>30s ago</span>
            <span>Now</span>
          </div>
        </div>
      )}
    </div>
  )
}
