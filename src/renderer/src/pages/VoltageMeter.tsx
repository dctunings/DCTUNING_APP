import { useState, useEffect } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Button } from '../components/ui'

interface Props {
  connected: boolean
}

export default function VoltageMeter({ connected }: Props) {
  const [voltage, setVoltage] = useState(12.6)
  const [history, setHistory] = useState<number[]>([])
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (running) {
      interval = setInterval(() => {
        const v = 11.5 + Math.random() * 2.5
        setVoltage(v)
        setHistory(prev => [...prev.slice(-29), v])
      }, 500)
    }
    return () => clearInterval(interval)
  }, [running])

  const getStatus = (v: number) => {
    if (v >= 12.4) return { label: 'Good', color: '#10b981', bg: 'rgba(16,185,129,0.12)' }
    if (v >= 12.0) return { label: 'Fair', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
    return { label: 'Low', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  }

  const status = getStatus(voltage)
  const maxV = Math.max(...history, voltage)
  const minV = Math.min(...history, voltage)
  const avgV = history.length ? (history.reduce((a, b) => a + b, 0) / history.length).toFixed(2) : voltage.toFixed(2)

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader
        title="Voltage Meter"
        subtitle={connected ? "Real-time battery voltage monitoring" : "Connect an OBD2 adapter for live data"}
        icon="⚡"
      />

      <Grid cols={4} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="Current" value={voltage.toFixed(2)} unit="V" icon="⚡" color="#00aec8" />
        <StatCard label="Average" value={avgV} unit="V" icon="📊" color="#10b981" />
        <StatCard label="Max" value={maxV.toFixed(2)} unit="V" icon="📈" color="#f59e0b" />
        <StatCard label="Min" value={minV.toFixed(2)} unit="V" icon="📉" color="#ec4899" />
      </Grid>

      <SectionTitle>Live Voltage</SectionTitle>
      <Card style={{ marginBottom: 24, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: status.color, lineHeight: 1 }}>
          {voltage.toFixed(2)}
          <span style={{ fontSize: 24, color: '#666', marginLeft: 4 }}>V</span>
        </div>
        <div style={{
          display: 'inline-block',
          marginTop: 12,
          padding: '6px 16px',
          borderRadius: 8,
          background: status.bg,
          color: status.color,
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}>
          {status.label}
        </div>
        {!connected && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
            🔌 Simulated data — connect OBD2 adapter for real readings
          </div>
        )}
      </Card>

      <SectionTitle>Controls</SectionTitle>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <Button onClick={() => setRunning(!running)} variant={running ? 'danger' : 'primary'}>
          {running ? '⏹ Stop Monitoring' : '▶ Start Monitoring'}
        </Button>
        <Button variant="secondary" onClick={() => { setHistory([]); setVoltage(12.6) }}>
          🔄 Reset
        </Button>
      </div>

      {history.length > 0 && (
        <>
          <SectionTitle>Voltage History</SectionTitle>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '10px 0' }}>
              {history.map((v, i) => {
                const h = Math.max(4, ((v - 11) / 3) * 100)
                const c = v >= 12.4 ? '#10b981' : v >= 12.0 ? '#f59e0b' : '#ef4444'
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      background: c,
                      borderRadius: 2,
                      opacity: 0.7,
                      minWidth: 3,
                    }}
                    title={`${v.toFixed(2)}V`}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#444', marginTop: 6 }}>
              <span>-30s</span>
              <span>Now</span>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
