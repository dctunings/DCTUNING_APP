import { useState, useRef, useEffect, useMemo } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import type { EcuFileState } from '../App'
import type { A2LMapDef } from '../lib/a2lParser'
import type { DRTConvertedMap } from '../lib/drtParser'
import type { Page } from '../App'

interface Props {
  activeVehicle: ActiveVehicle | null
  ecuFile: EcuFileState | null
  setPage: (p: Page) => void
}

type Tab = 'fuel' | 'timing' | 'boost' | 'limiters'

// ─── Unified map type (A2L and DRT share same shape) ─────────────────────────
type AnyMap = A2LMapDef | DRTConvertedMap

// ─── Binary read/write helpers ────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function readGrid(buffer: ArrayBuffer, map: AnyMap): number[][] | null {
  const { fileOffset, rows, cols, dataType, factor, physicalOffset: physOff } = map
  const bytesPerVal = dataType === 'uint8' || dataType === 'int8' ? 1 : dataType === 'float32' ? 4 : 2
  const needed = fileOffset + rows * cols * bytesPerVal
  if (fileOffset < 0 || needed > buffer.byteLength) return null
  const view = new DataView(buffer)
  const grid: number[][] = []
  let off = fileOffset
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      let raw = 0
      if      (dataType === 'uint8')   { raw = view.getUint8(off);              off += 1 }
      else if (dataType === 'int8')    { raw = view.getInt8(off);               off += 1 }
      else if (dataType === 'uint16')  { raw = view.getUint16(off, true);       off += 2 }
      else if (dataType === 'int16')   { raw = view.getInt16(off, true);        off += 2 }
      else if (dataType === 'float32') { raw = view.getFloat32(off, true);      off += 4 }
      row.push(raw * factor + physOff)
    }
    grid.push(row)
  }
  return grid
}

function writeGridToBuffer(buffer: ArrayBuffer, map: AnyMap, grid: number[][]): void {
  const { fileOffset, rows, cols, dataType, factor, physicalOffset: physOff } = map
  const view = new DataView(buffer)
  let off = fileOffset
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const phys = grid[r]?.[c] ?? 0
      const raw = (phys - physOff) / factor
      if      (dataType === 'uint8')   { view.setUint8(off, clamp(Math.round(raw), 0, 255));           off += 1 }
      else if (dataType === 'int8')    { view.setInt8(off,  clamp(Math.round(raw), -128, 127));        off += 1 }
      else if (dataType === 'uint16')  { view.setUint16(off, clamp(Math.round(raw), 0, 65535), true);  off += 2 }
      else if (dataType === 'int16')   { view.setInt16(off,  clamp(Math.round(raw), -32768, 32767), true); off += 2 }
      else if (dataType === 'float32') { view.setFloat32(off, phys, true);                             off += 4 }
    }
  }
}

function findBestMap(maps: AnyMap[], category: string, need2D = false): AnyMap | null {
  const filtered = maps.filter(m => m.category === category && (!need2D || m.rows > 1))
  if (!filtered.length) return null
  // prefer larger maps (more data)
  return filtered.sort((a, b) => (b.rows * b.cols) - (a.rows * a.cols))[0]
}

function buildAxisLabels(map: AnyMap, axis: 'x' | 'y'): string[] {
  const def = axis === 'x' ? map.axisX : map.axisY
  const size = axis === 'x' ? map.cols : map.rows
  if (!def || size === 0) return Array.from({ length: size }, (_, i) => String(i + 1))
  const { min, max } = def
  return Array.from({ length: size }, (_, i) => {
    const v = size > 1 ? min + (i / (size - 1)) * (max - min) : min
    return Math.round(v).toLocaleString()
  })
}

// ─── Demo fallbacks (used when no ECU file loaded) ────────────────────────────
const DEMO_RPM  = ['600','800','1.2k','1.6k','2k','2.5k','3k','4k','5k','6k','7k','8k']
const DEMO_LOAD = ['100%','90%','80%','70%','60%','50%','40%','30%','20%','10%']

function makeDefaultFuelGrid(): number[][] {
  return [
    [ 95,  97,  99, 102, 105, 108, 111, 112, 110, 107, 104,  99],
    [ 92,  94,  97,  99, 102, 105, 108, 109, 107, 104, 101,  96],
    [ 88,  91,  94,  96,  99, 102, 104, 106, 104, 101,  98,  93],
    [ 84,  87,  90,  93,  96,  98, 101, 102, 100,  97,  94,  89],
    [ 80,  83,  86,  89,  92,  95,  97,  98,  96,  93,  90,  85],
    [ 76,  79,  82,  85,  88,  91,  93,  94,  92,  89,  86,  81],
    [ 72,  75,  78,  81,  84,  87,  89,  90,  88,  85,  82,  77],
    [ 68,  71,  74,  77,  80,  83,  85,  86,  84,  81,  78,  73],
    [ 64,  67,  70,  73,  76,  79,  81,  82,  80,  77,  74,  69],
    [ 60,  63,  66,  69,  72,  75,  77,  78,  76,  73,  70,  65],
  ]
}

function makeDefaultTimingGrid(): number[][] {
  return [
    [  6,   8,  10,  11,  11,  10,   9,   7,   5,   4,   3,   2],
    [  8,  10,  12,  13,  14,  13,  12,  10,   8,   6,   5,   3],
    [ 10,  12,  14,  16,  17,  17,  16,  14,  12,  10,   8,   6],
    [ 12,  14,  16,  18,  20,  21,  20,  18,  16,  14,  12,  10],
    [ 14,  16,  18,  20,  22,  24,  24,  22,  20,  18,  16,  13],
    [ 16,  18,  20,  22,  25,  27,  27,  26,  24,  22,  19,  16],
    [ 18,  20,  22,  24,  27,  30,  30,  29,  27,  25,  22,  19],
    [ 20,  22,  25,  27,  30,  33,  33,  32,  30,  28,  25,  22],
    [ 22,  24,  27,  30,  33,  36,  36,  35,  33,  31,  28,  25],
    [ 24,  26,  29,  32,  35,  38,  38,  37,  35,  33,  30,  27],
  ]
}

const DEFAULT_BOOST: number[] = [0.0, 0.2, 0.6, 1.0, 1.2, 1.4, 1.5, 1.55, 1.5, 1.45, 1.3, 1.1]

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
    [0.00, '#0a1628'], [0.15, '#0d3b7a'], [0.30, '#0077b6'],
    [0.45, '#00b4a0'], [0.60, '#90be00'], [0.72, '#e8c000'],
    [0.84, '#f07000'], [1.00, '#e02020'],
  ]
  const p = Math.max(0, Math.min(1, pct))
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1]
    if (p <= t1) return lerpColor(c0, c1, (p - t0) / (t1 - t0))
  }
  return stops[stops.length - 1][1]
}
function textForBg(bg: string): string {
  const m = bg.match(/\d+/g)
  if (!m) return '#fff'
  return (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) > 110 ? '#000' : '#fff'
}

// ─── Dynamic Map Grid ─────────────────────────────────────────────────────────
interface MapGridProps {
  grid: number[][]
  xLabels: string[]   // column headers (RPM / x-axis)
  yLabels: string[]   // row headers (Load / y-axis)
  unit: string
  decimals: number
  onChange: (row: number, col: number, val: number) => void
}

function MapGrid({ grid, xLabels, yLabels, unit, decimals, onChange }: MapGridProps) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const [selRow, setSelRow] = useState(0)
  const [selCol, setSelCol] = useState(0)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const allVals = grid.flat()
  const mapMin = Math.min(...allVals)
  const mapMax = Math.max(...allVals)

  const fmt = (v: number) => v.toFixed(decimals)

  useEffect(() => { setEditVal(fmt(grid[selRow]?.[selCol] ?? 0)) }, [selRow, selCol, grid])

  const commitEdit = () => {
    const n = parseFloat(editVal)
    if (!isNaN(n)) onChange(selRow, selCol, n)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp')    { e.preventDefault(); commitEdit(); setSelRow(r => Math.max(0, r - 1)) }
    if (e.key === 'ArrowDown')  { e.preventDefault(); commitEdit(); setSelRow(r => Math.min(rows - 1, r + 1)) }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); commitEdit(); setSelCol(c => Math.max(0, c - 1)) }
    if (e.key === 'ArrowRight') { e.preventDefault(); commitEdit(); setSelCol(c => Math.min(cols - 1, c + 1)) }
    if (e.key === 'Enter') { commitEdit(); setSelRow(r => Math.min(rows - 1, r + 1)) }
    if (e.key === 'Tab')   { e.preventDefault(); commitEdit(); setSelCol(c => (c + 1) % cols) }
  }

  return (
    <div>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace', tableLayout: 'fixed', minWidth: Math.max(500, cols * 52 + 60) }}>
          <thead>
            <tr>
              <th style={{ width: 52, padding: '4px 6px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 10 }}>Y \ X</th>
              {xLabels.map((lbl, i) => (
                <th key={i} style={{ width: 52, padding: '4px 3px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10 }}>{lbl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={ri}>
                <td style={{ padding: '2px 6px 2px 0', textAlign: 'right', color: 'var(--accent)', fontWeight: 700, fontSize: 10, userSelect: 'none' }}>
                  {yLabels[ri] ?? ri}
                </td>
                {row.map((v, ci) => {
                  const bg = heatColor(mapMax === mapMin ? 0.5 : (v - mapMin) / (mapMax - mapMin))
                  const isSel = ri === selRow && ci === selCol
                  return (
                    <td key={ci} onClick={() => { setSelRow(ri); setSelCol(ci) }}
                      style={{
                        width: 52, height: 26, textAlign: 'center', background: bg,
                        color: textForBg(bg), fontWeight: isSel ? 900 : 600, fontSize: 11,
                        cursor: 'pointer', boxSizing: 'border-box',
                        border: isSel ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.3)',
                        userSelect: 'none', transition: 'border 0.05s',
                      }}>
                      {fmt(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cell editor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}
        onKeyDown={handleKeyDown} tabIndex={-1}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, flexShrink: 0 }}>
          <span><span style={{ color: 'var(--text-muted)' }}>Row: </span><span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{yLabels[selRow] ?? selRow}</span></span>
          <span><span style={{ color: 'var(--text-muted)' }}>Col: </span><span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{xLabels[selCol] ?? selCol}</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 260 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>Value:</label>
          <input ref={inputRef} type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { commitEdit(); inputRef.current?.blur() } if (e.key === 'Escape') { setEditVal(fmt(grid[selRow]?.[selCol] ?? 0)); inputRef.current?.blur() } }}
            onBlur={commitEdit}
            style={{ width: 90, height: 30, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', fontSize: 13 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{unit}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { const n = parseFloat(editVal) + Math.pow(10, -Math.max(0, decimals)); setEditVal(n.toFixed(decimals)); setTimeout(commitEdit, 0) }}>▲</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { const n = parseFloat(editVal) - Math.pow(10, -Math.max(0, decimals)); setEditVal(n.toFixed(decimals)); setTimeout(commitEdit, 0) }}>▼</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>← → ↑ ↓ navigate · Enter confirm</div>
      </div>

      {/* Heat legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{fmt(mapMin)}{unit}</span>
        <div style={{ flex: 1, height: 8, borderRadius: 4, background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(0.3)}, ${heatColor(0.5)}, ${heatColor(0.7)}, ${heatColor(1)})` }} />
        <span>{fmt(mapMax)}{unit}</span>
      </div>
    </div>
  )
}

// ─── Dynamic Boost Curve ──────────────────────────────────────────────────────
function BoostCurve({ curve, xLabels, onChange }: { curve: number[]; xLabels: string[]; onChange: (i: number, v: number) => void }) {
  const [selIdx, setSelIdx] = useState(0)
  const [editVal, setEditVal] = useState(curve[0]?.toFixed(2) ?? '0')
  const maxBar = Math.max(...curve, 2.0)

  useEffect(() => { setEditVal(curve[selIdx]?.toFixed(2) ?? '0') }, [selIdx, curve])
  const commitEdit = () => { const n = parseFloat(editVal); if (!isNaN(n)) onChange(selIdx, n) }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, marginBottom: 12, padding: '0 0 0 4px' }}>
        {curve.map((boost, i) => {
          const pct = boost / maxBar
          const isSel = i === selIdx
          const col = boost < 0.5 ? 'var(--text-muted)' : boost < 1.0 ? 'var(--accent)' : boost < 1.6 ? '#ffcc00' : 'var(--danger)'
          return (
            <div key={i} onClick={() => setSelIdx(i)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: 4 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: isSel ? 'var(--accent)' : col, marginBottom: 2 }}>{boost.toFixed(2)}</div>
              <div style={{ width: '100%', height: `${Math.max(4, pct * 130)}px`, background: isSel ? 'var(--accent)' : `linear-gradient(to top, ${col}, ${col}88)`, borderRadius: '3px 3px 0 0', border: isSel ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', transition: 'height 0.2s ease' }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {xLabels.map((lbl, i) => (
          <div key={i} onClick={() => setSelIdx(i)} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontFamily: 'monospace', color: i === selIdx ? 'var(--accent)' : 'var(--text-muted)', fontWeight: i === selIdx ? 700 : 400, cursor: 'pointer' }}>{lbl}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Point: </span><span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{xLabels[selIdx]}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Boost:</label>
          <input type="number" min={0} max={4} step={0.05} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} style={{ width: 80, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', height: 30 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>bar</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { const v = +(parseFloat(editVal) + 0.05).toFixed(2); setEditVal(String(v)); onChange(selIdx, v) }}>▲</button>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { const v = +(parseFloat(editVal) - 0.05).toFixed(2); setEditVal(String(v)); onChange(selIdx, v) }}>▼</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Click bar to select · ▲▼ to adjust</div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Performance({ activeVehicle, ecuFile, setPage }: Props) {
  const [tab, setTab] = useState<Tab>('fuel')
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Combine A2L + DRT maps ─────────────────────────────────────────────────
  const allMaps: AnyMap[] = useMemo(() => {
    if (!ecuFile) return []
    return [...ecuFile.a2lMaps, ...ecuFile.drtMaps]
  }, [ecuFile])

  // ── Find best map per category ─────────────────────────────────────────────
  const fuelMapDef    = useMemo(() => findBestMap(allMaps, 'fuel',      true),  [allMaps])
  const timingMapDef  = useMemo(() => findBestMap(allMaps, 'ignition',  true),  [allMaps])
  const boostMapDef   = useMemo(() => findBestMap(allMaps, 'boost',     false), [allMaps])
  const limiterMaps   = useMemo(() => allMaps.filter(m => m.category === 'limiter'), [allMaps])

  const isLive = allMaps.length > 0 && !!ecuFile?.fileBuffer

  // ── Read grids from binary ─────────────────────────────────────────────────
  const [fuelGrid,    setFuelGrid]    = useState<number[][]>(() => makeDefaultFuelGrid())
  const [timingGrid,  setTimingGrid]  = useState<number[][]>(() => makeDefaultTimingGrid())
  const [boostCurve,  setBoostCurve]  = useState<number[]>(DEFAULT_BOOST)
  const [limiterVals, setLimiterVals] = useState<number[]>([])

  // When ecuFile changes (new file loaded), read real values
  useEffect(() => {
    if (!ecuFile?.fileBuffer || !isLive) return

    if (fuelMapDef) {
      const g = readGrid(ecuFile.fileBuffer, fuelMapDef)
      if (g) setFuelGrid(g)
    }
    if (timingMapDef) {
      const g = readGrid(ecuFile.fileBuffer, timingMapDef)
      if (g) setTimingGrid(g)
    }
    if (boostMapDef) {
      const g = readGrid(ecuFile.fileBuffer, boostMapDef)
      if (g) setBoostCurve(g.flat())
    }
    if (limiterMaps.length > 0) {
      const vals = limiterMaps.map(m => {
        const g = readGrid(ecuFile.fileBuffer!, m)
        return g ? (g[0]?.[0] ?? 0) : 0
      })
      setLimiterVals(vals)
    }
    setDirty(false)
    setSavedAt(null)
  }, [ecuFile])

  // ── Axis labels ────────────────────────────────────────────────────────────
  const fuelXLabels   = isLive && fuelMapDef   ? buildAxisLabels(fuelMapDef,   'x') : DEMO_RPM
  const fuelYLabels   = isLive && fuelMapDef   ? buildAxisLabels(fuelMapDef,   'y') : DEMO_LOAD
  const timingXLabels = isLive && timingMapDef ? buildAxisLabels(timingMapDef, 'x') : DEMO_RPM
  const timingYLabels = isLive && timingMapDef ? buildAxisLabels(timingMapDef, 'y') : DEMO_LOAD
  const boostXLabels  = isLive && boostMapDef  ? buildAxisLabels(boostMapDef,  'x') : DEMO_RPM.slice(0, boostCurve.length)

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateFuel   = (r: number, c: number, v: number) => { setFuelGrid(g => { const n = g.map(row => [...row]); n[r][c] = v; return n }); setDirty(true) }
  const updateTiming = (r: number, c: number, v: number) => { setTimingGrid(g => { const n = g.map(row => [...row]); n[r][c] = v; return n }); setDirty(true) }
  const updateBoost  = (i: number, v: number) => { setBoostCurve(c => { const n = [...c]; n[i] = v; return n }); setDirty(true) }
  const updateLimiter = (i: number, v: number) => { setLimiterVals(l => { const n = [...l]; n[i] = v; return n }); setDirty(true) }

  // ── Export modified binary ─────────────────────────────────────────────────
  const exportBinary = () => {
    if (!ecuFile?.fileBuffer) return
    // Clone the buffer so we don't mutate the original
    const copy = ecuFile.fileBuffer.slice(0)
    if (fuelMapDef)   writeGridToBuffer(copy, fuelMapDef,   fuelGrid)
    if (timingMapDef) writeGridToBuffer(copy, timingMapDef, timingGrid)
    if (boostMapDef)  writeGridToBuffer(copy, boostMapDef,  boostCurve.map(v => [v]))
    limiterMaps.forEach((m, i) => { if (limiterVals[i] !== undefined) writeGridToBuffer(copy, m, [[limiterVals[i]]]) })

    const outName = ecuFile.fileName.replace(/(\.\w+)$/, '_performance_tuned$1')
    const blob = new Blob([copy], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = outName; a.click()
    URL.revokeObjectURL(a.href)
    setSavedAt(new Date().toLocaleString())
    setDirty(false)
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    let csv = ''
    if (tab === 'fuel') {
      csv = ['Y\\X', ...fuelXLabels].join(',') + '\n' + fuelGrid.map((row, ri) => [fuelYLabels[ri] ?? ri, ...row].join(',')).join('\n')
    } else if (tab === 'timing') {
      csv = ['Y\\X', ...timingXLabels].join(',') + '\n' + timingGrid.map((row, ri) => [timingYLabels[ri] ?? ri, ...row].join(',')).join('\n')
    } else if (tab === 'boost') {
      csv = 'Point,Boost(bar)\n' + boostCurve.map((v, i) => `${boostXLabels[i] ?? i},${v}`).join('\n')
    } else {
      csv = 'Parameter,Value\n' + limiterMaps.map((m, i) => `${m.name},${limiterVals[i] ?? 0}`).join('\n')
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dctuning_${tab}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  // ── CSV import ─────────────────────────────────────────────────────────────
  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const lines = (ev.target?.result as string).trim().split('\n').map(l => l.trim()).filter(Boolean)
        if (tab === 'fuel' || tab === 'timing') {
          const grid = lines.slice(1).map(l => l.split(',').slice(1).map(Number))
          if (grid.length > 0 && grid[0].length > 0) {
            if (tab === 'fuel') setFuelGrid(grid); else setTimingGrid(grid); setDirty(true)
          }
        } else if (tab === 'boost') {
          const vals = lines.slice(1).map(l => parseFloat(l.split(',')[1])).filter(v => !isNaN(v))
          if (vals.length > 0) { setBoostCurve(vals); setDirty(true) }
        }
      } catch { alert('Failed to parse CSV') }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const tabs: { id: Tab; label: string; desc: string; mapName?: string }[] = [
    { id: 'fuel',     label: '⛽ Fuel Map',         desc: fuelMapDef   ? `${fuelMapDef.name} — ${fuelMapDef.rows}×${fuelMapDef.cols}` : 'Injection quantity (demo data)', mapName: fuelMapDef?.name },
    { id: 'timing',   label: '⚡ Ignition Timing',  desc: timingMapDef ? `${timingMapDef.name} — ${timingMapDef.rows}×${timingMapDef.cols}` : 'Advance degrees BTDC (demo data)', mapName: timingMapDef?.name },
    { id: 'boost',    label: '💨 Boost Curve',      desc: boostMapDef  ? `${boostMapDef.name} — ${boostMapDef.cols} points` : 'Target boost pressure (demo data)', mapName: boostMapDef?.name },
    { id: 'limiters', label: '🚫 Limiters',          desc: limiterMaps.length > 0 ? `${limiterMaps.length} limiter maps found` : 'Rev, speed, boost limiters (demo data)' },
  ]

  return (
    <div>
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h1>Performance Tuning</h1>
          {isLive && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>📂 {ecuFile!.fileName} — {allMaps.length} maps loaded</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {dirty && <span className="badge" style={{ background: 'rgba(255,150,0,.12)', color: '#ff9500', border: '1px solid #ff9500', fontSize: 11 }}>● Unsaved Changes</span>}
          {savedAt && !dirty && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>✓ Exported {savedAt}</span>}
        </div>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {/* No file loaded banner */}
      {!isLive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(0,174,200,0.08)', border: '1px solid rgba(0,174,200,0.25)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--accent)' }}>Demo data — no ECU file loaded</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
              Go to <button onClick={() => setPage('remap')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0, textDecoration: 'underline', fontSize: 13 }}>Remap Builder</button> and load an ECU binary + A2L/DRT definition to see and edit real map data from your ECU.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', background: tab === t.id ? 'var(--accent-dim)' : 'transparent',
            border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
            color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif', fontWeight: 600, fontSize: 13, transition: 'all 0.15s', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>{tabs.find(t => t.id === tab)?.label.replace(/^[^ ]+ /, '')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{tabs.find(t => t.id === tab)?.desc}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => importRef.current?.click()}>📤 Import CSV</button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={exportCSV}>📥 Export CSV</button>
            {isLive ? (
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={exportBinary} disabled={!dirty && !!savedAt}>
                💾 Export Modified File
              </button>
            ) : (
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPage('remap')}>
                📂 Load ECU File
              </button>
            )}
          </div>
        </div>

        {/* Fuel Map */}
        {tab === 'fuel' && (
          <MapGrid grid={fuelGrid} xLabels={fuelXLabels} yLabels={fuelYLabels} unit="%" decimals={isLive && fuelMapDef?.dataType === 'float32' ? 3 : 1}
            onChange={updateFuel} />
        )}

        {/* Timing Map */}
        {tab === 'timing' && (
          <MapGrid grid={timingGrid} xLabels={timingXLabels} yLabels={timingYLabels} unit="°" decimals={isLive && timingMapDef?.dataType === 'float32' ? 3 : 1}
            onChange={updateTiming} />
        )}

        {/* Boost Curve */}
        {tab === 'boost' && (
          <BoostCurve curve={boostCurve} xLabels={boostXLabels.slice(0, boostCurve.length)} onChange={updateBoost} />
        )}

        {/* Limiters */}
        {tab === 'limiters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {isLive && limiterMaps.length > 0 ? (
              limiterMaps.map((m, i) => {
                const val = limiterVals[i] ?? 0
                const pct = Math.max(0, Math.min(1, (val - m.min) / Math.max(1, m.max - m.min))) * 100
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{m.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{m.description}</span>
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: 'var(--accent)' }}>{val.toFixed(m.dataType === 'float32' ? 2 : 0)}</span>
                    </div>
                    <input type="range" min={m.min} max={m.max} step={m.dataType === 'float32' ? 0.01 : 1} value={val}
                      onChange={e => updateLimiter(i, parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      <span>{m.min}</span>
                      <div className="progress-bar" style={{ flex: 1, height: 3, margin: '5px 12px 0' }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                      </div>
                      <span>{m.max}</span>
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                {isLive ? 'No limiter maps found in this definition file.' : 'Load an ECU file in Remap Builder to see real limiter values.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="banner banner-warning" style={{ marginTop: 16, fontSize: 12 }}>
        {isLive
          ? `⚡ Editing real ECU map data from ${ecuFile!.fileName}. Click "Export Modified File" to download the modified binary — then flash it to the ECU using a J2534 or KESS interface.`
          : '⚠ Load an ECU binary + A2L/DRT definition in the Remap Builder first to edit real map data. Values shown above are generic demo data only.'}
      </div>
    </div>
  )
}
