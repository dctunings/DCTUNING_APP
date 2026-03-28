import { useState, useRef, useEffect } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props { activeVehicle: ActiveVehicle | null }

type Tab = 'fuel' | 'timing' | 'boost' | 'limiters'

// ─── Axes ────────────────────────────────────────────────────────────────────
const RPM_AXIS  = [600, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000]
const LOAD_AXIS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]   // descending so 100% load is top row
const ROWS = LOAD_AXIS.length
const COLS = RPM_AXIS.length

// ─── Default maps ─────────────────────────────────────────────────────────────
function makeDefaultFuelMap(): number[][] {
  // Relative fuel quantity % (100 = stock baseline)
  return [
    [ 95,  97,  99, 102, 105, 108, 111, 112, 110, 107, 104,  99],  // 100% load
    [ 92,  94,  97,  99, 102, 105, 108, 109, 107, 104, 101,  96],  //  90%
    [ 88,  91,  94,  96,  99, 102, 104, 106, 104, 101,  98,  93],  //  80%
    [ 84,  87,  90,  93,  96,  98, 101, 102, 100,  97,  94,  89],  //  70%
    [ 80,  83,  86,  89,  92,  95,  97,  98,  96,  93,  90,  85],  //  60%
    [ 76,  79,  82,  85,  88,  91,  93,  94,  92,  89,  86,  81],  //  50%
    [ 72,  75,  78,  81,  84,  87,  89,  90,  88,  85,  82,  77],  //  40%
    [ 68,  71,  74,  77,  80,  83,  85,  86,  84,  81,  78,  73],  //  30%
    [ 64,  67,  70,  73,  76,  79,  81,  82,  80,  77,  74,  69],  //  20%
    [ 60,  63,  66,  69,  72,  75,  77,  78,  76,  73,  70,  65],  //  10%
  ]
}

function makeDefaultTimingMap(): number[][] {
  // Ignition advance degrees BTDC
  return [
    [  6,   8,  10,  11,  11,  10,   9,   7,   5,   4,   3,   2],  // 100% load — retarded under boost
    [  8,  10,  12,  13,  14,  13,  12,  10,   8,   6,   5,   3],  //  90%
    [ 10,  12,  14,  16,  17,  17,  16,  14,  12,  10,   8,   6],  //  80%
    [ 12,  14,  16,  18,  20,  21,  20,  18,  16,  14,  12,  10],  //  70%
    [ 14,  16,  18,  20,  22,  24,  24,  22,  20,  18,  16,  13],  //  60%
    [ 16,  18,  20,  22,  25,  27,  27,  26,  24,  22,  19,  16],  //  50%
    [ 18,  20,  22,  24,  27,  30,  30,  29,  27,  25,  22,  19],  //  40%
    [ 20,  22,  25,  27,  30,  33,  33,  32,  30,  28,  25,  22],  //  30%
    [ 22,  24,  27,  30,  33,  36,  36,  35,  33,  31,  28,  25],  //  20%
    [ 24,  26,  29,  32,  35,  38,  38,  37,  35,  33,  30,  27],  //  10% — most advance at light load
  ]
}

// ─── Boost curve (1-D, RPM-keyed) ────────────────────────────────────────────
const DEFAULT_BOOST_CURVE: number[] = [0.0, 0.2, 0.6, 1.0, 1.2, 1.4, 1.5, 1.55, 1.5, 1.45, 1.3, 1.1]  // bar

// ─── Limiters ─────────────────────────────────────────────────────────────────
interface LimiterValue { label: string; value: number; unit: string; min: number; max: number; step: number; description: string }
const DEFAULT_LIMITERS: LimiterValue[] = [
  { label: 'Rev Limiter',        value: 7000, unit: ' RPM',  min: 4000, max: 9000, step: 100, description: 'Hard engine RPM cut' },
  { label: 'Soft Rev Limiter',   value: 6750, unit: ' RPM',  min: 3500, max: 8500, step: 100, description: 'Fuel-cut warning zone entry' },
  { label: 'Speed Limiter',      value: 250,  unit: ' km/h', min: 50,   max: 350,  step: 5,   description: 'Top speed governor (0 = disabled)' },
  { label: 'Launch Control RPM', value: 4200, unit: ' RPM',  min: 1500, max: 7000, step: 100, description: 'Launch control hold RPM' },
  { label: 'Boost Cut Pressure', value: 1.8,  unit: ' bar',  min: 0.5,  max: 3.0,  step: 0.05,description: 'Overboost safety cut pressure' },
  { label: 'Idle RPM Target',    value: 800,  unit: ' RPM',  min: 500,  max: 1400, step: 50,  description: 'Warm idle target' },
]

// ─── Color helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}
function heatColor(pct: number): string {
  const stops: [number, string][] = [
    [0.00, '#0a1628'],
    [0.15, '#0d3b7a'],
    [0.30, '#0077b6'],
    [0.45, '#00b4a0'],
    [0.60, '#90be00'],
    [0.72, '#e8c000'],
    [0.84, '#f07000'],
    [1.00, '#e02020'],
  ]
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1]
    const [t1, c1] = stops[i]
    if (pct <= t1) {
      const t = (pct - t0) / (t1 - t0)
      return lerpColor(c0, c1, t)
    }
  }
  return stops[stops.length - 1][1]
}

// ─── MapGrid component ────────────────────────────────────────────────────────
interface MapGridProps {
  grid: number[][]
  unit: string
  decimals: number
  minOverride?: number
  maxOverride?: number
  onChange: (row: number, col: number, val: number) => void
}

function MapGrid({ grid, unit, decimals, minOverride, maxOverride, onChange }: MapGridProps) {
  const [selRow, setSelRow] = useState(0)
  const [selCol, setSelCol] = useState(0)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const allVals = grid.flat()
  const mapMin = minOverride ?? Math.min(...allVals)
  const mapMax = maxOverride ?? Math.max(...allVals)

  const cellColor = (v: number) => {
    const pct = mapMax === mapMin ? 0.5 : (v - mapMin) / (mapMax - mapMin)
    return heatColor(Math.max(0, Math.min(1, pct)))
  }

  const fmt = (v: number) => v.toFixed(decimals)

  useEffect(() => {
    setEditVal(fmt(grid[selRow][selCol]))
  }, [selRow, selCol, grid])

  const commitEdit = () => {
    const n = parseFloat(editVal)
    if (!isNaN(n)) onChange(selRow, selCol, n)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp')    { e.preventDefault(); setSelRow((r) => Math.max(0, r - 1)); commitEdit() }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setSelRow((r) => Math.min(ROWS - 1, r + 1)); commitEdit() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); setSelCol((c) => Math.max(0, c - 1)); commitEdit() }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSelCol((c) => Math.min(COLS - 1, c + 1)); commitEdit() }
    if (e.key === 'Enter') { commitEdit(); setSelRow((r) => Math.min(ROWS - 1, r + 1)) }
    if (e.key === 'Tab') { e.preventDefault(); commitEdit(); setSelCol((c) => (c + 1) % COLS) }
  }

  const selectedVal = grid[selRow][selCol]
  const textColor = (bg: string) => {
    // parse rgb(r,g,b) to determine light/dark
    const m = bg.match(/\d+/g)
    if (!m) return '#fff'
    const lum = 0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]
    return lum > 110 ? '#000' : '#fff'
  }

  return (
    <div>
      {/* Grid */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace', tableLayout: 'fixed', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ width: 52, padding: '4px 6px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                Load\RPM
              </th>
              {RPM_AXIS.map((rpm) => (
                <th key={rpm} style={{ width: 54, padding: '4px 3px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10, letterSpacing: '-0.3px' }}>
                  {rpm >= 1000 ? `${rpm / 1000}k` : rpm}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LOAD_AXIS.map((load, ri) => (
              <tr key={load}>
                <td style={{ padding: '2px 6px 2px 0', textAlign: 'right', color: 'var(--accent)', fontWeight: 700, fontSize: 10, userSelect: 'none' }}>
                  {load}%
                </td>
                {RPM_AXIS.map((_, ci) => {
                  const v = grid[ri][ci]
                  const bg = cellColor(v)
                  const fg = textColor(bg)
                  const isSel = ri === selRow && ci === selCol
                  return (
                    <td
                      key={ci}
                      onClick={() => { setSelRow(ri); setSelCol(ci) }}
                      style={{
                        width: 54,
                        height: 26,
                        textAlign: 'center',
                        background: bg,
                        color: fg,
                        fontWeight: isSel ? 900 : 600,
                        fontSize: 11,
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        border: isSel ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.3)',
                        outline: isSel ? '1px solid rgba(0,174,200,0.4)' : 'none',
                        userSelect: 'none',
                        transition: 'border 0.05s',
                      }}
                    >
                      {fmt(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cell editor bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 14px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          marginBottom: 12,
        }}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div style={{ display: 'flex', gap: 16, fontSize: 12, flexShrink: 0 }}>
          <span>
            <span style={{ color: 'var(--text-muted)' }}>Load: </span>
            <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{LOAD_AXIS[selRow]}%</span>
          </span>
          <span>
            <span style={{ color: 'var(--text-muted)' }}>RPM: </span>
            <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{RPM_AXIS[selCol].toLocaleString()}</span>
          </span>
          <span>
            <span style={{ color: 'var(--text-muted)' }}>Cell: </span>
            <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 700 }}>
              [{selRow},{selCol}]
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 260 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>Value:</label>
          <input
            ref={inputRef}
            type="number"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitEdit(); inputRef.current?.blur() }
              if (e.key === 'Escape') { setEditVal(fmt(selectedVal)); inputRef.current?.blur() }
            }}
            onBlur={commitEdit}
            style={{ width: 90, height: 30, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{unit}</span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const n = parseFloat(editVal)
              if (!isNaN(n)) { setEditVal(fmt(n + Math.pow(10, -decimals))); setTimeout(commitEdit, 0) }
            }}
          >▲</button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const n = parseFloat(editVal)
              if (!isNaN(n)) { setEditVal(fmt(n - Math.pow(10, -decimals))); setTimeout(commitEdit, 0) }
            }}
          >▼</button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          ← → ↑ ↓ navigate · Enter confirm
        </div>
      </div>

      {/* Heat legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{fmt(mapMin)}{unit}</span>
        <div style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(0.3)}, ${heatColor(0.5)}, ${heatColor(0.7)}, ${heatColor(1)})`,
        }} />
        <span>{fmt(mapMax)}{unit}</span>
      </div>
    </div>
  )
}

// ─── Boost Curve component ────────────────────────────────────────────────────
function BoostCurve({ curve, onChange }: { curve: number[]; onChange: (i: number, v: number) => void }) {
  const [selIdx, setSelIdx] = useState(0)
  const [editVal, setEditVal] = useState(curve[0].toFixed(2))
  const maxBar = Math.max(...curve, 2.0)

  useEffect(() => {
    setEditVal(curve[selIdx].toFixed(2))
  }, [selIdx, curve])

  const commitEdit = () => {
    const n = parseFloat(editVal)
    if (!isNaN(n) && n >= 0 && n <= 4.0) onChange(selIdx, n)
  }

  return (
    <div>
      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, marginBottom: 12, padding: '0 0 0 4px' }}>
        {RPM_AXIS.map((rpm, i) => {
          const pct = curve[i] / maxBar
          const isSel = i === selIdx
          const boost = curve[i]
          const col = boost < 0.5 ? 'var(--text-muted)' : boost < 1.0 ? 'var(--accent)' : boost < 1.6 ? '#ffcc00' : 'var(--danger)'
          return (
            <div
              key={rpm}
              onClick={() => setSelIdx(i)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: 4 }}
            >
              <div style={{
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: 700,
                color: isSel ? 'var(--accent)' : col,
                marginBottom: 2,
              }}>
                {boost.toFixed(2)}
              </div>
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(4, pct * 130)}px`,
                  background: isSel
                    ? 'var(--accent)'
                    : `linear-gradient(to top, ${col}, ${col}88)`,
                  borderRadius: '3px 3px 0 0',
                  border: isSel ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                  transition: 'height 0.2s ease',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* RPM labels */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {RPM_AXIS.map((rpm, i) => (
          <div
            key={rpm}
            onClick={() => setSelIdx(i)}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 10,
              fontFamily: 'monospace',
              color: i === selIdx ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: i === selIdx ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {rpm >= 1000 ? `${rpm / 1000}k` : rpm}
          </div>
        ))}
      </div>

      {/* Editor bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>RPM: </span>
          <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{RPM_AXIS[selIdx].toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target Boost:</label>
          <input
            type="number"
            min={0} max={4} step={0.05}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            style={{ width: 80, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', height: 30 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>bar</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => { const v = +(parseFloat(editVal) + 0.05).toFixed(2); setEditVal(String(v)); onChange(selIdx, v) }}>▲</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => { const v = +(parseFloat(editVal) - 0.05).toFixed(2); setEditVal(String(v)); onChange(selIdx, v) }}>▼</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Click bar to select · ▲▼ to adjust
        </div>
      </div>

      {/* Reference labels */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11 }}>
        {[
          { range: '0.0–0.4 bar', label: 'Atmospheric / Off-boost',   color: 'var(--text-muted)' },
          { range: '0.5–1.0 bar', label: 'Stage 1 territory',          color: 'var(--accent)' },
          { range: '1.0–1.5 bar', label: 'Stage 2 / Performance',      color: '#ffcc00' },
          { range: '> 1.5 bar',   label: 'Stage 3 / High performance', color: 'var(--danger)' },
        ].map((r) => (
          <div key={r.range} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)' }}><strong style={{ color: r.color }}>{r.range}</strong> {r.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const STORAGE_KEY = 'dc_performance_maps'

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Performance({ activeVehicle }: Props) {
  const [tab, setTab] = useState<Tab>('fuel')
  const [fuelMap,    setFuelMap]    = useState<number[][]>(makeDefaultFuelMap)
  const [timingMap,  setTimingMap]  = useState<number[][]>(makeDefaultTimingMap)
  const [boostCurve, setBoostCurve] = useState<number[]>(DEFAULT_BOOST_CURVE)
  const [limiters,   setLimiters]   = useState<LimiterValue[]>(DEFAULT_LIMITERS)
  const [dirty,      setDirty]      = useState(false)
  const [savedAt,    setSavedAt]    = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Load saved maps from localStorage on mount ────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.fuelMap)    setFuelMap(saved.fuelMap)
      if (saved.timingMap)  setTimingMap(saved.timingMap)
      if (saved.boostCurve) setBoostCurve(saved.boostCurve)
      if (saved.limiters)   setLimiters(saved.limiters)
      if (saved.savedAt)    setSavedAt(saved.savedAt)
    } catch { /* ignore corrupt data */ }
  }, [])

  const updateGrid = (
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    row: number, col: number, val: number
  ) => {
    setGrid((g) => {
      const next = g.map((r) => [...r])
      next[row][col] = val
      return next
    })
    setDirty(true)
  }

  const updateBoost = (i: number, v: number) => {
    setBoostCurve((c) => { const n = [...c]; n[i] = v; return n })
    setDirty(true)
  }

  const updateLimiter = (i: number, v: number) => {
    setLimiters((l) => { const n = [...l]; n[i] = { ...n[i], value: v }; return n })
    setDirty(true)
  }

  const resetDefaults = () => {
    if (tab === 'fuel')     { setFuelMap(makeDefaultFuelMap());     setDirty(false) }
    if (tab === 'timing')   { setTimingMap(makeDefaultTimingMap()); setDirty(false) }
    if (tab === 'boost')    { setBoostCurve([...DEFAULT_BOOST_CURVE]); setDirty(false) }
    if (tab === 'limiters') { setLimiters([...DEFAULT_LIMITERS]);   setDirty(false) }
  }

  // ── Save all maps to localStorage ─────────────────────────────────────────
  const saveAll = () => {
    const now = new Date().toLocaleString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fuelMap, timingMap, boostCurve, limiters, savedAt: now
    }))
    setSavedAt(now)
    setDirty(false)
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    let csv = ''
    if (tab === 'fuel' || tab === 'timing') {
      const grid = tab === 'fuel' ? fuelMap : timingMap
      csv = ['Load\\RPM', ...RPM_AXIS].join(',') + '\n'
      csv += LOAD_AXIS.map((load, ri) => [load, ...grid[ri]].join(',')).join('\n')
    } else if (tab === 'boost') {
      csv = 'RPM,Boost(bar)\n' + RPM_AXIS.map((rpm, i) => `${rpm},${boostCurve[i]}`).join('\n')
    } else {
      csv = 'Parameter,Value,Unit\n' + limiters.map((l) => `${l.label},${l.value},${l.unit.trim()}`).join('\n')
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dctuning_${tab}_map.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── Import CSV ────────────────────────────────────────────────────────────
  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
        if (tab === 'fuel' || tab === 'timing') {
          // expect: Load\RPM, rpm1, rpm2... then rows
          const dataLines = lines.slice(1)
          const grid = dataLines.map(line => {
            const parts = line.split(',')
            return parts.slice(1).map(Number)
          })
          if (grid.length === ROWS && grid[0].length === COLS) {
            if (tab === 'fuel') setFuelMap(grid)
            else setTimingMap(grid)
            setDirty(true)
          } else {
            alert(`Invalid CSV — expected ${ROWS} rows × ${COLS} cols, got ${grid.length} × ${grid[0]?.length ?? 0}`)
          }
        } else if (tab === 'boost') {
          const vals = lines.slice(1).map(l => parseFloat(l.split(',')[1]))
          if (vals.length === COLS && vals.every(v => !isNaN(v))) {
            setBoostCurve(vals)
            setDirty(true)
          } else {
            alert(`Invalid CSV — expected ${COLS} RPM rows`)
          }
        } else {
          // limiters: Parameter,Value,Unit
          const updated = [...limiters]
          lines.slice(1).forEach(line => {
            const [label, val] = line.split(',')
            const idx = updated.findIndex(l => l.label === label?.trim())
            if (idx >= 0 && val) updated[idx] = { ...updated[idx], value: parseFloat(val) }
          })
          setLimiters(updated)
          setDirty(true)
        }
      } catch { alert('Failed to parse CSV file') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'fuel',    label: '⛽ Fuel Map',        desc: 'Injection quantity (% of stock baseline)' },
    { id: 'timing',  label: '⚡ Ignition Timing', desc: 'Advance degrees BTDC vs RPM and load' },
    { id: 'boost',   label: '💨 Boost Curve',     desc: 'Target boost pressure (bar) vs RPM' },
    { id: 'limiters',label: '🚫 Limiters',         desc: 'Rev, speed, launch and boost cut limits' },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div>
        <div style={{ flex: 1 }}>
          <h1>Performance Tuning</h1>
        </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {dirty && (
            <span className="badge" style={{ background: 'rgba(255,150,0,.12)', color: '#ff9500', border: '1px solid #ff9500', fontSize: 11 }}>
              ● Unsaved Changes
            </span>
          )}
          {savedAt && !dirty && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>✓ Saved {savedAt}</span>
          )}
        </div>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px',
              background: tab === t.id ? 'var(--accent-dim)' : 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'Manrope, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.15s',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {/* Map description */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>
              {tabs.find((t) => t.id === tab)?.label.replace(/^[^ ]+ /, '')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {tabs.find((t) => t.id === tab)?.desc}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => importRef.current?.click()}>📤 Import CSV</button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={exportCSV}>📥 Export CSV</button>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={resetDefaults}>↩ Reset</button>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveAll}>
              💾 Save
            </button>
          </div>
        </div>

        {/* Fuel Map */}
        {tab === 'fuel' && (
          <MapGrid
            grid={fuelMap}
            unit="%"
            decimals={0}
            minOverride={55}
            maxOverride={115}
            onChange={(r, c, v) => updateGrid(setFuelMap, r, c, v)}
          />
        )}

        {/* Timing Map */}
        {tab === 'timing' && (
          <MapGrid
            grid={timingMap}
            unit="°"
            decimals={1}
            minOverride={0}
            maxOverride={42}
            onChange={(r, c, v) => updateGrid(setTimingMap, r, c, v)}
          />
        )}

        {/* Boost Curve */}
        {tab === 'boost' && (
          <BoostCurve curve={boostCurve} onChange={updateBoost} />
        )}

        {/* Limiters */}
        {tab === 'limiters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {limiters.map((item, i) => {
              const pct = ((item.value - item.min) / (item.max - item.min)) * 100
              const col = i === 0 ? 'var(--danger)' : i === 4 ? 'var(--warning)' : 'var(--accent)'
              return (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{item.description}</span>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: col }}>
                      {item.value.toLocaleString()}{item.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    value={item.value}
                    onChange={(e) => updateLimiter(i, parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: col, cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    <span>{item.min.toLocaleString()}{item.unit}</span>
                    <div className="progress-bar" style={{ flex: 1, height: 3, margin: '5px 12px 0' }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: col }} />
                    </div>
                    <span>{item.max.toLocaleString()}{item.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="banner banner-warning" style={{ marginTop: 16, fontSize: 12 }}>
        ⚠ These maps represent tuning parameters for educational/reference purposes. Writing values to an ECU requires a connected J2534 or KESS interface and vehicle-specific software. Always tune on a dyno with a qualified tuner.
      </div>
    </div>
  )
}
