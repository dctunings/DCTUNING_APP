/**
 * ConnectorDiagram — renders visual ECU connector pin grids
 * with highlighted pins for +12V, GND, CAN-L, CAN-H, GPT0, GPT1.
 * Matches the PCMTuner PDF style — shows ALL pin positions with
 * pin numbers at edges and highlighted pins in colour.
 */
import type { EcuPinout } from '../data/ecuPinouts'

const PIN_COLORS: Record<string, string> = {
  v12:  '#ef4444',
  gnd:  '#1a1a1a',
  canl: '#22c55e',
  canh: '#fff',
  gpt:  '#3b82f6',
}

const PIN_LABELS: Record<string, string> = {
  v12: '+12V',
  gnd: 'GND',
  canl: 'CAN-L',
  canh: 'CAN-H',
  gpt: 'GPT',
}

/** Known connector sizes — standard ECU connector pin counts */
const KNOWN_CONNECTORS: Record<string, number> = {
  T53: 53, T58: 58, T60: 60, T86: 86, T91: 91, T94: 94, T95: 95, T96: 96,
  T103: 103, T105: 105,
}

/** Parse "T94: 5, 87" or "T103:8, T95: 27" into { connector: pin[] } map */
function parsePins(str: string): Record<string, number[]> {
  const result: Record<string, number[]> = {}
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
      const pin = parseInt(part.trim())
      if (!isNaN(pin) && lastConn) {
        result[lastConn].push(pin)
      }
    }
  }
  return result
}

/** Determine the real pin count for a connector */
function getConnectorSize(name: string, highlightedPins: Record<number, string>): number {
  // Check known standard connectors
  if (KNOWN_CONNECTORS[name]) return KNOWN_CONNECTORS[name]
  // For unknown connectors (BMW T1-T6 sub-connectors, etc.), find max pin number
  const maxPin = Math.max(0, ...Object.keys(highlightedPins).map(Number))
  // Round up to nearest reasonable connector size
  if (maxPin <= 10) return 10
  if (maxPin <= 20) return 20
  if (maxPin <= 30) return 30
  if (maxPin <= 40) return 40
  if (maxPin <= 50) return 50
  if (maxPin <= 60) return 60
  return Math.ceil(maxPin / 10) * 10
}

interface Props {
  pinout: EcuPinout
}

export default function ConnectorDiagram({ pinout }: Props) {
  // Build a combined map: connector → pin → { color, label }
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

  // Collect all connectors that have data
  const connectorNames: string[] = []
  for (const name of Object.keys(pinMap)) {
    if (!connectorNames.includes(name)) connectorNames.push(name)
  }
  // Sort by connector name
  connectorNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return (
    <div>
      {/* Connector grids */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, justifyContent: 'center' }}>
        {connectorNames.map(name => {
          const highlights = pinMap[name] || {}
          const totalPins = getConnectorSize(name, highlights)
          if (totalPins < 1) return null

          // Calculate grid layout — match PDF style with rows
          const cols = totalPins <= 20 ? 10 : totalPins <= 40 ? 10 : totalPins <= 60 ? 15 : totalPins <= 96 ? 16 : 20
          const rows: number[][] = []

          // Build rows top-to-bottom, pins go left-to-right per row
          // PDF style: highest pins at top, lowest at bottom
          const numRows = Math.ceil(totalPins / cols)
          for (let r = numRows - 1; r >= 0; r--) {
            const rowStart = r * cols + 1
            const rowEnd = Math.min(rowStart + cols - 1, totalPins)
            const row: number[] = []
            for (let p = rowStart; p <= rowEnd; p++) row.push(p)
            rows.push(row)
          }
          rows.reverse() // top row = highest pins

          return (
            <div key={name} style={{
              background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '12px 14px',
              border: '1px solid rgba(255,255,255,0.08)', minWidth: cols * 16,
            }}>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, marginBottom: 8, color: '#fff', letterSpacing: 1 }}>{name}</div>

              {/* Pin grid with border to look like connector shape */}
              <div style={{
                border: '2px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: 4,
                display: 'inline-flex', flexDirection: 'column', gap: 2, width: '100%',
              }}>
                {rows.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {/* Row start pin number */}
                    <span style={{ width: 18, fontSize: 7, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2, fontFamily: 'monospace', flexShrink: 0 }}>
                      {row[row.length - 1]}
                    </span>
                    {row.map(pin => {
                      const color = highlights[pin]
                      return (
                        <div key={pin} title={`Pin ${pin}`} style={{
                          width: 14, height: 14, borderRadius: 2, fontSize: 7, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: color || 'rgba(255,255,255,0.06)',
                          color: color
                            ? (color === '#fff' || color === '#eab308' || color === '#22c55e' || color === '#3b82f6' ? '#000' : '#fff')
                            : 'rgba(255,255,255,0.12)',
                          border: color
                            ? (color === '#1a1a1a' ? '1px solid #666' : `1px solid ${color}`)
                            : '1px solid rgba(255,255,255,0.06)',
                          fontFamily: 'monospace',
                        }}>
                          {color ? pin : '·'}
                        </div>
                      )
                    })}
                    {/* Row end pin number */}
                    <span style={{ width: 18, fontSize: 7, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', paddingLeft: 2, fontFamily: 'monospace', flexShrink: 0 }}>
                      {row[0]}
                    </span>
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
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, border: color === '#1a1a1a' ? '1px solid #666' : `1px solid ${color}` }} />
            <span style={{ color: '#999', fontWeight: 600 }}>{PIN_LABELS[key]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
