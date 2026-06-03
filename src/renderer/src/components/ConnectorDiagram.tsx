/**
 * ConnectorDiagram — renders a visual ECU connector pin grid
 * with highlighted pins for +12V, GND, CAN-L, CAN-H, GPT0, GPT1.
 * Matches the PCMTuner PDF style.
 */
import type { EcuPinout } from '../data/ecuPinouts'

const PIN_COLORS: Record<string, string> = {
  v12:  '#ef4444',
  gnd:  '#444',
  canl: '#22c55e',
  canh: '#fff',
  gpt:  '#eab308',
}

const PIN_LABELS: Record<string, string> = {
  v12: '+12V',
  gnd: 'GND',
  canl: 'CAN-L',
  canh: 'CAN-H',
  gpt: 'GPT',
}

/** Parse "T94: 5, 87" or "T103:8, T95: 27" into { connector: pin[] } map */
function parsePins(str: string): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  // Handle formats: "T94: 5, 87" or "T103: 8, T95: 27" or "T60: 44, 52"
  const parts = str.split(/,\s*/)
  let lastConn = ''
  for (const part of parts) {
    const match = part.match(/([A-Za-z]+\d*)\s*:\s*(\d+|[A-Z]\d+)/)
    if (match) {
      lastConn = match[1].toUpperCase()
      if (!result[lastConn]) result[lastConn] = []
      const pin = parseInt(match[2])
      if (!isNaN(pin)) result[lastConn].push(pin)
    } else {
      // Just a number, belongs to lastConn
      const pin = parseInt(part.trim())
      if (!isNaN(pin) && lastConn) {
        result[lastConn].push(pin)
      }
    }
  }
  return result
}

/** Get total pin count for a connector name like T94 → 94, T60 → 60, T105 → 105 */
function connectorPinCount(name: string): number {
  const m = name.match(/\d+/)
  return m ? parseInt(m[0]) : 0
}

interface Props {
  pinout: EcuPinout
}

export default function ConnectorDiagram({ pinout }: Props) {
  // Build a combined map: connector → pin → color
  const pinMap: Record<string, Record<number, string>> = {}
  const signals = [
    { key: 'v12', data: pinout.v12 },
    { key: 'gnd', data: pinout.gnd },
    { key: 'canl', data: pinout.canl },
    { key: 'canh', data: pinout.canh },
    { key: 'gpt', data: pinout.gpt },
  ]

  for (const sig of signals) {
    const parsed = parsePins(sig.data)
    for (const [conn, pins] of Object.entries(parsed)) {
      if (!pinMap[conn]) pinMap[conn] = {}
      for (const pin of pins) {
        pinMap[conn][pin] = PIN_COLORS[sig.key]
      }
    }
  }

  // Render each connector that has pins
  const connectors = pinout.conn.filter(c => {
    const name = c.toUpperCase()
    return pinMap[name] && Object.keys(pinMap[name]).length > 0
  })

  // Also include connectors found in pin data but not in conn array
  for (const name of Object.keys(pinMap)) {
    if (!connectors.some(c => c.toUpperCase() === name)) {
      connectors.push(name)
    }
  }

  return (
    <div>
      {/* Connector grids */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, justifyContent: 'center' }}>
        {connectors.map(connName => {
          const name = connName.toUpperCase()
          const highlights = pinMap[name] || {}
          const totalPins = connectorPinCount(name)
          if (totalPins < 1 || totalPins > 120) return null

          // Calculate grid: rows of ~15-22 pins
          const cols = totalPins <= 30 ? Math.min(totalPins, 15) : totalPins <= 60 ? 15 : totalPins <= 100 ? 20 : 22
          const rows: number[][] = []
          for (let i = totalPins; i >= 1; i -= cols) {
            const rowStart = Math.max(1, i - cols + 1)
            const row: number[] = []
            for (let p = rowStart; p <= i; p++) row.push(p)
            rows.unshift(row)
          }

          return (
            <div key={name} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 12px', minWidth: 160 }}>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 13, marginBottom: 6, color: '#fff' }}>{connName}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {rows.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                    {row.map(pin => {
                      const color = highlights[pin]
                      return (
                        <div key={pin} style={{
                          width: 12, height: 12, borderRadius: 2, fontSize: 6, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: color || 'rgba(255,255,255,0.07)',
                          color: color ? (color === '#fff' || color === '#eab308' || color === '#22c55e' ? '#000' : '#fff') : 'rgba(255,255,255,0.15)',
                          border: color ? 'none' : '1px solid rgba(255,255,255,0.04)',
                          cursor: color ? 'default' : 'default',
                        }} title={color ? `Pin ${pin}` : `${pin}`}>
                          {color ? pin : ''}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', fontSize: 10 }}>
        {Object.entries(PIN_COLORS).map(([key, color]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, border: color === '#444' ? '1px solid #888' : 'none' }} />
            <span style={{ color: '#999' }}>{PIN_LABELS[key]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
