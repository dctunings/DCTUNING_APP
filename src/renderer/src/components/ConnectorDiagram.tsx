/**
 * ConnectorDiagram — renders visual ECU connector pin grids
 * with highlighted pins for +12V, GND, CAN-L, CAN-H, GPT0, GPT1.
 * Matches the PCMTuner PDF style — shows ALL pin positions with
 * pin numbers at edges and highlighted pins in colour.
 */
import type { EcuPinout } from '../data/ecuPinouts'

const PIN_COLORS = {
  v12:  '#ef4444',
  gnd:  '#1a1a1a',
  canl: '#22c55e',
  canh: '#fff',
  gpt0: '#00aec8',  // Teal — matches PDF GPT0
  gpt1: '#eab308',  // Yellow — matches PDF GPT1
}

const PIN_LABELS = {
  v12: '+12V',
  gnd: 'GND',
  canl: 'CAN-L',
  canh: 'CAN-H',
  gpt0: 'GPT0',
  gpt1: 'GPT1',
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

/** Parse GPT field into separate GPT0 and GPT1 — first pin = GPT0, second = GPT1 */
function parseGptPins(str: string): { gpt0: Record<string, number[]>; gpt1: Record<string, number[]> } {
  const gpt0: Record<string, number[]> = {}
  const gpt1: Record<string, number[]> = {}

  const parts = str.split(/,\s*/)
  let lastConn = ''
  let pinIndex = 0

  for (const part of parts) {
    const match = part.match(/([A-Za-z]+\d*)\s*:\s*(\d+|[A-Z]\d+)/)
    if (match) {
      lastConn = match[1].toUpperCase()
      const pin = parseInt(match[2])
      if (!isNaN(pin)) {
        const target = pinIndex === 0 ? gpt0 : gpt1
        if (!target[lastConn]) target[lastConn] = []
        target[lastConn].push(pin)
        pinIndex++
      }
    } else {
      const pin = parseInt(part.trim())
      if (!isNaN(pin) && lastConn) {
        const target = pinIndex === 0 ? gpt0 : gpt1
        if (!target[lastConn]) target[lastConn] = []
        target[lastConn].push(pin)
        pinIndex++
      }
    }
  }
  return { gpt0, gpt1 }
}

/** Determine the real pin count for a connector */
function getConnectorSize(name: string, highlightedPins: Record<number, string>): number {
  if (KNOWN_CONNECTORS[name]) return KNOWN_CONNECTORS[name]
  const maxPin = Math.max(0, ...Object.keys(highlightedPins).map(Number))
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
  // Build combined map: connector → pin → color
  const pinMap: Record<string, Record<number, string>> = {}

  // Standard signals (not GPT)
  const signals = [
    { key: 'v12', data: pinout.v12 },
    { key: 'gnd', data: pinout.gnd },
    { key: 'canl', data: pinout.canl },
    { key: 'canh', data: pinout.canh },
  ]

  for (const sig of signals) {
    const parsed = parsePins(sig.data)
    for (const [conn, pins] of Object.entries(parsed)) {
      if (!pinMap[conn]) pinMap[conn] = {}
      for (const pin of pins) {
        pinMap[conn][pin] = PIN_COLORS[sig.key as keyof typeof PIN_COLORS]
      }
    }
  }

  // GPT — split into GPT0 (teal) and GPT1 (yellow)
  const { gpt0, gpt1 } = parseGptPins(pinout.gpt)
  for (const [conn, pins] of Object.entries(gpt0)) {
    if (!pinMap[conn]) pinMap[conn] = {}
    for (const pin of pins) pinMap[conn][pin] = PIN_COLORS.gpt0
  }
  for (const [conn, pins] of Object.entries(gpt1)) {
    if (!pinMap[conn]) pinMap[conn] = {}
    for (const pin of pins) pinMap[conn][pin] = PIN_COLORS.gpt1
  }

  // Collect all connectors that have data
  const connectorNames: string[] = []
  for (const name of Object.keys(pinMap)) {
    if (!connectorNames.includes(name)) connectorNames.push(name)
  }
  connectorNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return (
    <div>
      {/* Connector grids */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, justifyContent: 'center' }}>
        {connectorNames.map(name => {
          const highlights = pinMap[name] || {}
          const totalPins = getConnectorSize(name, highlights)
          if (totalPins < 1) return null

          const cols = totalPins <= 20 ? 10 : totalPins <= 40 ? 10 : totalPins <= 60 ? 15 : totalPins <= 96 ? 16 : 20
          const rows: number[][] = []
          const numRows = Math.ceil(totalPins / cols)
          for (let r = numRows - 1; r >= 0; r--) {
            const rowStart = r * cols + 1
            const rowEnd = Math.min(rowStart + cols - 1, totalPins)
            const row: number[] = []
            for (let p = rowStart; p <= rowEnd; p++) row.push(p)
            rows.push(row)
          }
          rows.reverse()

          return (
            <div key={name} style={{
              background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: '12px 14px',
              border: '1px solid rgba(255,255,255,0.08)', minWidth: cols * 16,
            }}>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, marginBottom: 8, color: '#fff', letterSpacing: 1 }}>{name}</div>
              <div style={{
                border: '2px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: 4,
                display: 'inline-flex', flexDirection: 'column', gap: 2, width: '100%',
              }}>
                {rows.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <span style={{ width: 18, fontSize: 7, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2, fontFamily: 'monospace', flexShrink: 0 }}>
                      {row[row.length - 1]}
                    </span>
                    {row.map(pin => {
                      const color = highlights[pin]
                      const isDark = color === '#1a1a1a'
                      const isLight = color === '#fff' || color === '#eab308' || color === '#22c55e' || color === '#00aec8'
                      return (
                        <div key={pin} title={`Pin ${pin}`} style={{
                          width: 14, height: 14, borderRadius: 2, fontSize: 7, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: color || 'rgba(255,255,255,0.06)',
                          color: color ? (isLight ? '#000' : isDark ? '#aaa' : '#fff') : 'rgba(255,255,255,0.12)',
                          border: color ? (isDark ? '1px solid #666' : `1px solid ${color}`) : '1px solid rgba(255,255,255,0.06)',
                          fontFamily: 'monospace',
                        }}>
                          {color ? pin : '·'}
                        </div>
                      )
                    })}
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

      {/* Legend — separate GPT0 and GPT1 */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', fontSize: 10 }}>
        {Object.entries(PIN_LABELS).map(([key, label]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: PIN_COLORS[key as keyof typeof PIN_COLORS],
              border: key === 'gnd' ? '1px solid #666' : `1px solid ${PIN_COLORS[key as keyof typeof PIN_COLORS]}`,
            }} />
            <span style={{ color: '#999', fontWeight: 600 }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
