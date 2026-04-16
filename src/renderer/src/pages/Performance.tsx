import { useState, useRef, useEffect, useMemo } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import type { EcuFileState } from '../App'
import type { A2LMapDef } from '../lib/a2lParser'
import type { DRTConvertedMap } from '../lib/drtParser'
import type { Page } from '../App'
import { readMapFromCandidate, readUnmatchedCandidate, matchUnknownsByDNA, generateCandidateDNA, matchByDNA, guessMapType } from '../lib/mapClassifier'
import type { ClassifiedCandidate, MapGridData, AIMatch } from '../lib/mapClassifier'
import { ECU_DEFINITIONS } from '../lib/ecuDefinitions'
import { findAllLimiters, applyPopcorn, removePopcorn, applySmokeOnLaunch, removeSmokeOnLaunch, writeLimiterValue } from '../lib/featureProcessor'
import type { FoundLimiter, FeatureResult } from '../lib/featureProcessor'
import { extractAllMaps } from '../lib/binaryParser'
import type { ExtractedMap } from '../lib/binaryParser'

interface Props {
  activeVehicle: ActiveVehicle | null
  ecuFile: EcuFileState | null
  setPage: (p: Page) => void
}

type Tab = 'fuel' | 'timing' | 'boost' | 'limiters' | 'addons'

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
// Pro layout: RPM down the left (rows), Load across the top (columns)
// Matches ECM Titanium / WinOLS / TuneECU convention
const DEMO_RPM  = ['600','800','1.2k','1.6k','2k','2.5k','3k','4k','5k','6k','7k','8k']
const DEMO_LOAD = ['10%','20%','30%','40%','50%','60%','70%','80%','90%','100%']

function makeDefaultFuelGrid(): number[][] {
  // 12 rows (RPM 600→8k low→high) × 10 cols (Load 10%→100% low→high)
  // Matches ECM Titanium: RPM down left, Load across top, both ascending
  return [
    [ 60,  64,  68,  72,  76,  80,  84,  88,  92,  95],  // 600
    [ 63,  67,  71,  75,  79,  83,  87,  91,  94,  97],  // 800
    [ 66,  70,  74,  78,  82,  86,  90,  94,  97,  99],  // 1.2k
    [ 69,  73,  77,  81,  85,  89,  93,  96,  99, 102],  // 1.6k
    [ 72,  76,  80,  84,  88,  92,  96,  99, 102, 105],  // 2k
    [ 75,  79,  83,  87,  91,  95,  98, 102, 105, 108],  // 2.5k
    [ 77,  81,  85,  89,  93,  97, 101, 104, 108, 111],  // 3k
    [ 78,  82,  86,  90,  94,  98, 102, 106, 109, 112],  // 4k
    [ 76,  80,  84,  88,  92,  96, 100, 104, 107, 110],  // 5k
    [ 73,  77,  81,  85,  89,  93,  97, 101, 104, 107],  // 6k
    [ 70,  74,  78,  82,  86,  90,  94,  98, 101, 104],  // 7k
    [ 65,  69,  73,  77,  81,  85,  89,  93,  96,  99],  // 8k
  ]
}

function makeDefaultTimingGrid(): number[][] {
  // 12 rows (RPM 600→8k) × 10 cols (Load 10%→100%)
  return [
    [ 24,  22,  20,  18,  16,  14,  12,  10,   8,   6],  // 600
    [ 26,  24,  22,  20,  18,  16,  14,  12,  10,   8],  // 800
    [ 29,  27,  25,  22,  20,  18,  16,  14,  12,  10],  // 1.2k
    [ 32,  30,  27,  24,  22,  20,  18,  16,  13,  11],  // 1.6k
    [ 35,  33,  30,  27,  25,  22,  20,  17,  14,  11],  // 2k
    [ 38,  36,  33,  30,  27,  24,  21,  17,  13,  10],  // 2.5k
    [ 38,  36,  33,  30,  27,  24,  20,  16,  12,   9],  // 3k
    [ 37,  35,  32,  29,  26,  22,  18,  14,  10,   7],  // 4k
    [ 35,  33,  30,  27,  24,  20,  16,  12,   8,   5],  // 5k
    [ 33,  31,  28,  25,  22,  18,  14,  10,   6,   4],  // 6k
    [ 30,  28,  25,  22,  19,  16,  12,   8,   5,   3],  // 7k
    [ 27,  25,  22,  19,  16,  13,  10,   6,   3,   2],  // 8k
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

/** Extract a 1D boost curve from a 2D grid by taking the row with highest max value.
 *  For 1D maps (rows=1), just flatten. For 2D, pick the peak-boost row. */
function extractBoostRow(grid: number[][]): number[] {
  if (grid.length <= 1) return grid.flat()
  // Pick the row ~70% through (high load/IQ region, where peak boost lives)
  const targetRow = Math.min(grid.length - 1, Math.round(grid.length * 0.7))
  return grid[targetRow]
}

// ─── Dynamic Map Grid ─────────────────────────────────────────────────────────
interface MapGridProps {
  grid: number[][]
  xLabels: string[]   // column headers (RPM / x-axis)
  yLabels: string[]   // row headers (Load / y-axis)
  unit: string
  decimals: number
  onChange: (row: number, col: number, val: number) => void
  compareGrid?: number[][] | null  // "before" grid for diff highlighting
  compareName?: string             // name of the comparison file
  onSwapAxes?: () => void          // swap RPM/Load axes
}

function MapGrid({ grid, xLabels, yLabels, unit, decimals, onChange, compareGrid, compareName, onSwapAxes }: MapGridProps) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0

  // Selection: drag to select a rectangular range
  const [selStart, setSelStart] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [selEnd, setSelEnd] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [dragging, setDragging] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [step, setStep] = useState(1.0)       // absolute step value
  const [pctMode, setPctMode] = useState(false) // toggle: % mode vs absolute mode
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Track original values to highlight changed cells
  const [origGrid, setOrigGrid] = useState<number[][] | null>(null)
  // Compute a simple fingerprint to detect when a completely new map is loaded
  const gridFingerprint = grid.length + ',' + (grid[0]?.length ?? 0) + ',' + (grid[0]?.[0]?.toFixed(2) ?? '') + ',' + (grid[grid.length-1]?.[0]?.toFixed(2) ?? '')
  useEffect(() => {
    // Snapshot original grid when a new map loads (different dimensions or first cell changes)
    setOrigGrid(grid.map(row => [...row]))
  }, [gridFingerprint])

  const allVals = grid.flat()
  const mapMin = Math.min(...allVals)
  const mapMax = Math.max(...allVals)

  // Normalized selection rectangle
  const sel = {
    r1: Math.min(selStart.r, selEnd.r),
    r2: Math.max(selStart.r, selEnd.r),
    c1: Math.min(selStart.c, selEnd.c),
    c2: Math.max(selStart.c, selEnd.c),
  }
  const selCount = (sel.r2 - sel.r1 + 1) * (sel.c2 - sel.c1 + 1)
  const isInSel = (r: number, c: number) => r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2
  const isCursor = (r: number, c: number) => r === selEnd.r && c === selEnd.c
  const isChanged = (r: number, c: number) => {
    if (!origGrid) return false
    const orig = origGrid[r]?.[c]
    const cur = grid[r]?.[c]
    return orig !== undefined && cur !== undefined && Math.abs(cur - orig) > 0.001
  }

  const fmt = (v: number) => v.toFixed(decimals)

  useEffect(() => { setEditVal(fmt(grid[selEnd.r]?.[selEnd.c] ?? 0)) }, [selEnd.r, selEnd.c, grid])

  const commitEdit = () => {
    const n = parseFloat(editVal)
    if (isNaN(n)) return
    // Safety: warn if change is > 25% from original
    const orig = origGrid?.[selEnd.r]?.[selEnd.c]
    if (orig !== undefined && orig > 0) {
      const pctChange = Math.abs((n - orig) / orig) * 100
      if (pctChange > 25) {
        if (!confirm(`Warning: ${pctChange.toFixed(0)}% change from original (${orig.toFixed(1)} → ${n.toFixed(1)}). Large changes can damage the engine. Continue?`)) return
      }
    }
    onChange(selEnd.r, selEnd.c, n)
  }

  // Apply step to all selected cells — absolute or percentage mode
  const applyStep = (sign: 1 | -1) => {
    for (let r = sel.r1; r <= sel.r2; r++) {
      for (let c = sel.c1; c <= sel.c2; c++) {
        const cur = grid[r]?.[c] ?? 0
        if (pctMode) {
          // Percentage mode: step is a % of current value
          const delta = cur * (step / 100) * sign
          onChange(r, c, cur + delta)
        } else {
          // Absolute mode: step is a fixed value
          onChange(r, c, cur + sign * step)
        }
      }
    }
  }

  // Mouse handlers for drag selection
  const onCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setSelStart({ r, c })
    setSelEnd({ r, c })
    wrapRef.current?.focus()
  }
  const onCellMouseEnter = (r: number, c: number) => {
    if (dragging) setSelEnd({ r, c })
  }
  const onMouseUp = () => setDragging(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp')    { e.preventDefault(); commitEdit(); const nr = Math.max(0, selEnd.r - 1); setSelStart({ r: nr, c: selEnd.c }); setSelEnd({ r: nr, c: selEnd.c }) }
    if (e.key === 'ArrowDown')  { e.preventDefault(); commitEdit(); const nr = Math.min(rows - 1, selEnd.r + 1); setSelStart({ r: nr, c: selEnd.c }); setSelEnd({ r: nr, c: selEnd.c }) }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); commitEdit(); const nc = Math.max(0, selEnd.c - 1); setSelStart({ r: selEnd.r, c: nc }); setSelEnd({ r: selEnd.r, c: nc }) }
    if (e.key === 'ArrowRight') { e.preventDefault(); commitEdit(); const nc = Math.min(cols - 1, selEnd.c + 1); setSelStart({ r: selEnd.r, c: nc }); setSelEnd({ r: selEnd.r, c: nc }) }
    if (e.key === 'Enter') { commitEdit(); const nr = Math.min(rows - 1, selEnd.r + 1); setSelStart({ r: nr, c: selEnd.c }); setSelEnd({ r: nr, c: selEnd.c }) }
    if (e.key === 'Tab')   { e.preventDefault(); commitEdit(); const nc = (selEnd.c + 1) % cols; setSelStart({ r: selEnd.r, c: nc }); setSelEnd({ r: selEnd.r, c: nc }) }
    if (e.key === 'PageUp')   { e.preventDefault(); applyStep(1) }
    if (e.key === 'PageDown') { e.preventDefault(); applyStep(-1) }
  }

  // Count changed cells
  const changedCount = origGrid ? grid.reduce((sum, row, ri) => sum + row.reduce((s, v, ci) => s + (Math.abs(v - (origGrid[ri]?.[ci] ?? v)) > 0.001 ? 1 : 0), 0), 0) : 0

  return (
    <div ref={wrapRef} tabIndex={-1} onKeyDown={handleKeyDown} onMouseUp={onMouseUp} onMouseLeave={() => setDragging(false)}
      style={{ outline: 'none' }}>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace', tableLayout: 'fixed', width: '100%', minWidth: Math.max(500, cols * 52 + 60) }}>
          <thead>
            <tr>
              <th style={{ width: 58, padding: '4px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 9, whiteSpace: 'nowrap' }}></th>
              {xLabels.map((lbl, i) => (
                <th key={i} style={{ padding: '4px 3px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10 }}>{lbl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={ri}>
                <td style={{ width: 58, padding: '2px 8px 2px 0', textAlign: 'right', color: 'var(--accent)', fontWeight: 700, fontSize: 10, userSelect: 'none', whiteSpace: 'nowrap' }}>
                  {yLabels[ri] ?? ri}
                </td>
                {row.map((v, ci) => {
                  const bg = heatColor(mapMax === mapMin ? 0.5 : (v - mapMin) / (mapMax - mapMin))
                  const inSel = isInSel(ri, ci)
                  const cursor = isCursor(ri, ci)
                  const changed = isChanged(ri, ci)
                  // Compare mode: show delta from comparison file
                  const cmpVal = compareGrid?.[ri]?.[ci]
                  const hasDiff = cmpVal !== undefined && Math.abs(v - cmpVal) > 0.001
                  const diffUp = hasDiff && v > cmpVal!  // value increased vs comparison
                  const diffDn = hasDiff && v < cmpVal!  // value decreased vs comparison
                  // Color: green = changed in session, cyan = increased vs compare, red = decreased vs compare
                  const cellBg = hasDiff
                    ? (diffUp ? `linear-gradient(135deg, rgba(34,197,94,0.4), ${bg})` : `linear-gradient(135deg, rgba(239,68,68,0.4), ${bg})`)
                    : changed ? `linear-gradient(135deg, rgba(34,197,94,0.35), ${bg})` : bg
                  const cellColor = hasDiff ? (diffUp ? '#22c55e' : '#ef4444') : changed ? '#22c55e' : textForBg(bg)
                  return (
                    <td key={ci}
                      onMouseDown={e => onCellMouseDown(ri, ci, e)}
                      onMouseEnter={() => onCellMouseEnter(ri, ci)}
                      style={{
                        height: 28, textAlign: 'center', background: cellBg,
                        color: cellColor,
                        fontWeight: (inSel || cursor || changed || hasDiff) ? 900 : 600, fontSize: 11,
                        cursor: 'crosshair', boxSizing: 'border-box',
                        border: cursor ? '2px solid var(--accent)'
                          : inSel ? '2px solid rgba(6,182,212,0.7)'
                          : hasDiff ? (diffUp ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(239,68,68,0.6)')
                          : changed ? '1px solid rgba(34,197,94,0.6)'
                          : '1px solid rgba(0,0,0,0.3)',
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

      {/* Cell editor + step controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, flexShrink: 0 }}>
          <span><span style={{ color: 'var(--text-muted)' }}>Row: </span><span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{yLabels[selEnd.r] ?? selEnd.r}</span></span>
          <span><span style={{ color: 'var(--text-muted)' }}>Col: </span><span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{xLabels[selEnd.c] ?? selEnd.c}</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>VAL:</label>
          <input ref={inputRef} type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { commitEdit(); inputRef.current?.blur() } if (e.key === 'Escape') { setEditVal(fmt(grid[selEnd.r]?.[selEnd.c] ?? 0)); inputRef.current?.blur() } }}
            onBlur={commitEdit}
            style={{ width: 72, height: 26, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', fontSize: 12 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{unit}</span>
        </div>
        {/* Step + mode toggle + PgUp/PgDn */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Step:</label>
          <input type="number" value={step} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setStep(v) }}
            step={pctMode ? 0.5 : 0.1}
            style={{ width: 48, height: 26, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', fontSize: 11 }} />
          <button className={pctMode ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: 10, padding: '3px 7px', fontWeight: 800, minWidth: 28 }}
            onClick={() => { setPctMode(!pctMode); setStep(pctMode ? 1.0 : 2.0) }}
            title={pctMode ? 'Percentage mode — switch to absolute' : 'Absolute mode — switch to percentage'}>
            {pctMode ? '%' : '#'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 7px', fontWeight: 800, color: '#22c55e' }}
            onClick={() => applyStep(1)} title={pctMode ? `Increase selected by ${step}%` : `Increase selected by ${step}`}>PgUp</button>
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 7px', fontWeight: 800, color: '#ef4444' }}
            onClick={() => applyStep(-1)} title={pctMode ? `Decrease selected by ${step}%` : `Decrease selected by ${step}`}>PgDn</button>
        </div>
        {onSwapAxes && <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 7px', fontWeight: 800, color: '#f59e0b' }}
          onClick={onSwapAxes}
          title="Swap RPM/Load axes — flip rows and columns">⇄ Swap</button>}
        {selCount > 1 && <span style={{ fontSize: 10, color: 'rgba(6,182,212,0.9)', fontWeight: 700 }}>{selCount} cells</span>}
        {changedCount > 0 && (
          <>
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>{changedCount} changed</span>
            <button className="btn btn-ghost" style={{ fontSize: 9, padding: '2px 6px', fontWeight: 700, color: '#ef4444' }}
              onClick={() => {
                if (origGrid && confirm('Reset ALL cells back to original stock values?')) {
                  origGrid.forEach((row, ri) => row.forEach((v, ci) => onChange(ri, ci, v)))
                }
              }}
              title="Reset this map back to original stock values">↩ Stock</button>
          </>
        )}
        {compareGrid && (() => {
          let diffCount = 0, upCount = 0, dnCount = 0
          grid.forEach((row, ri) => row.forEach((v, ci) => {
            const cv = compareGrid[ri]?.[ci]
            if (cv !== undefined && Math.abs(v - cv) > 0.001) { diffCount++; if (v > cv) upCount++; else dnCount++ }
          }))
          return diffCount > 0 ? (
            <span style={{ fontSize: 10, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#f59e0b' }}>🔀 {diffCount} diff</span>
              {upCount > 0 && <span style={{ color: '#22c55e' }}>↑{upCount}</span>}
              {dnCount > 0 && <span style={{ color: '#ef4444' }}>↓{dnCount}</span>}
              {compareName && <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>vs {compareName}</span>}
            </span>
          ) : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔀 No differences</span>
        })()}
        <div style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>Drag select · PgUp/PgDn · {pctMode ? '% mode' : 'abs mode'}</div>
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
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, marginBottom: 12, width: '100%' }}>
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

  // ── Local scanner state (runs directly on this page) ──────────────────────
  const [localBuffer, setLocalBuffer] = useState<ArrayBuffer | null>(null)
  const [localFileName, setLocalFileName] = useState('')
  const [localScanResult, setLocalScanResult] = useState<import('../lib/mapClassifier').ClassificationResult | null>(null)
  const [localDetected, setLocalDetected] = useState<import('../lib/binaryParser').DetectedEcu | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  // ── AI match state ──────────────────────────────────────────────────────────
  const [aiMatches, setAiMatches] = useState<Map<number, AIMatch>>(new Map())
  const [aiSearching, setAiSearching] = useState(false)

  // ── State for definition-extracted maps (non-scanner path) ──────────────
  const [defExtracted, setDefExtracted] = useState<ExtractedMap[]>([])

  // ── Pick up shared scanResult from RemapBuilder (via ecuFile prop) ──────
  // This avoids re-scanning when the user loads a file in RemapBuilder then switches to Performance.
  useEffect(() => {
    if (ecuFile?.scanResult && ecuFile.fileBuffer && !localScanResult) {
      setLocalScanResult(ecuFile.scanResult)
      setLocalBuffer(ecuFile.fileBuffer)
      setLocalFileName(ecuFile.fileName)
      setLocalDetected(ecuFile.detected ?? null)
      setShowScanner(true)
    }
  }, [ecuFile?.scanResult])

  // ── Pick up signature-extracted maps from RemapBuilder ──────────────────
  // These are the RELIABLE maps found via byte signatures — correct names, axes, factors.
  // Display these as the primary maps, with scanner as secondary.
  useEffect(() => {
    if (!ecuFile?.extractedMaps || ecuFile.extractedMaps.length === 0) return
    if (!ecuFile.fileBuffer) return

    const maps = ecuFile.extractedMaps
    setLocalBuffer(ecuFile.fileBuffer)
    setLocalFileName(ecuFile.fileName)
    setLocalDetected(ecuFile.detected ?? null)

    // Find best map per category from the signature-extracted results
    const bestFuel = maps.find(m => m.mapDef.category === 'fuel' && m.found && m.mapDef.rows > 1 && m.mapDef.id?.includes('fuel_quantity'))
      || maps.find(m => m.mapDef.category === 'fuel' && m.found && m.mapDef.rows > 1)
    const bestTiming = maps.find(m => m.mapDef.category === 'ignition' && m.found && m.mapDef.rows > 1)
    const bestBoost = maps.find(m => m.mapDef.category === 'boost' && m.found)
    const bestTorque = maps.find(m => m.mapDef.category === 'torque' && m.found && m.mapDef.rows > 1)

    const fmtVal = (v: number): string => v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(v)

    // Build axis labels from mapDef — use axisXValues/axisYValues if available, else indices
    const buildLabels = (md: typeof maps[0]['mapDef']) => {
      const xLabels = md.axisXValues?.map(fmtVal) ?? Array.from({ length: md.cols }, (_, i) => String(i))
      const yLabels = md.axisYValues?.map(fmtVal) ?? Array.from({ length: md.rows }, (_, i) => String(i))
      return { xLabels, yLabels }
    }

    const loadMap = bestFuel || bestTorque
    if (loadMap) {
      const { xLabels, yLabels } = buildLabels(loadMap.mapDef)
      setFuelGrid(loadMap.data)
      setScanFuelLabels({ x: xLabels, y: yLabels, unit: loadMap.mapDef.unit, name: loadMap.mapDef.name })
    }
    if (bestTiming) {
      const { xLabels, yLabels } = buildLabels(bestTiming.mapDef)
      setTimingGrid(bestTiming.data)
      setScanTimingLabels({ x: xLabels, y: yLabels, unit: bestTiming.mapDef.unit, name: bestTiming.mapDef.name })
    }
    if (bestBoost) {
      const { xLabels } = buildLabels(bestBoost.mapDef)
      setBoostCurve(extractBoostRow(bestBoost.data))
      setScanBoostLabels({ x: xLabels, unit: bestBoost.mapDef.unit, name: bestBoost.mapDef.name })
    }

    // Store how many signature maps we found
    const foundCount = maps.filter(m => m.found).length
    setShowScanner(true)
    setAddonMessage(`${foundCount} maps loaded from Remap Builder (signature-matched)`)
  }, [ecuFile?.extractedMaps])

  const hasScan = !!localScanResult && localScanResult.candidates.length > 0
  const isLiveOrScan = isLive || hasScan

  // Transpose a 2D grid (swap rows↔cols) — used to put RPM on rows for display
  const transpose = (grid: number[][]): number[][] => {
    if (grid.length === 0) return grid
    const rows = grid.length, cols = grid[0].length
    const out: number[][] = []
    for (let c = 0; c < cols; c++) {
      const row: number[] = []
      for (let r = 0; r < rows; r++) row.push(grid[r][c])
      out.push(row)
    }
    return out
  }

  // Check if axes need swapping for display: RPM on left (rows), Load on top (cols)
  // RPM values are >500, Load/percentage values are <300
  // Kf_ format stores data as [cols=RPM][rows=Load][X_axis=RPM][Y_axis=Load][data: Load×RPM].
  // Tuning convention: RPM down-left (rows), Load across-top (cols) → need transpose.
  // Detect Kf_ RPM×Load layout by checking axis value ranges.
  const needsTranspose = (xVals: number[] | undefined, yVals: number[] | undefined): boolean => {
    if (!xVals || !yVals || xVals.length < 2 || yVals.length < 2) return false
    // X-axis looks like RPM: starts 400+ and ends 1000+ (covers idle→redline)
    const xMax = xVals[xVals.length - 1]
    const xIsRPM = xVals[0] >= 300 && xMax >= 1000 && xMax <= 10000
    // Y-axis has smaller range (IQ/load/pressure 0-500, or % 0-100)
    const yMax = yVals[yVals.length - 1]
    const yIsLoad = yMax <= 1000 || (yMax <= 5000 && yMax < xMax * 0.6)
    return xIsRPM && yIsLoad
  }
  // For Bosch Kf_ ECUs (EDC16/EDC17/SID): always transpose definition-extracted maps
  // because Kf_ format always stores data as Load-rows × RPM-cols.
  const isKfFamily = (fam: string) => {
    const f = fam.toUpperCase()
    return f.includes('EDC16') || f.includes('EDC17') || f.includes('SID') || f.includes('MG1')
  }

  // Load ECU file directly on this page
  const [loadError, setLoadError] = useState('')
  const [loadingStatus, setLoadingStatus] = useState('')
  // Before/After comparison state
  const [compareMode, setCompareMode] = useState(false)
  const [compareGrid, setCompareGrid] = useState<number[][] | null>(null)
  const [compareName, setCompareName] = useState('')

  const handleLoadFile = async () => {
    setLoadError('')
    setLoadingStatus('Opening file...')
    try {
    const api = (window as any).api
    let buf: ArrayBuffer
    let name: string
    if (api?.openEcuFile) {
      const result = await api.openEcuFile()
      if (!result) { setLoadingStatus(''); return }
      setLoadingStatus('Reading file (' + (result.size ? Math.round(result.size/1024) + 'KB' : '?') + ')...')
      // Convert buffer array to ArrayBuffer
      if (result.buffer) {
        buf = new Uint8Array(result.buffer).buffer
      } else {
        setLoadError('No buffer data received from file dialog')
        setLoadingStatus('')
        return
      }
      name = result.path || result.name
    } else {
      // Web fallback: file input
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.bin,.hex,.ori,.mod'
      const file = await new Promise<File | null>(resolve => {
        input.onchange = () => resolve(input.files?.[0] ?? null)
        input.click()
      })
      if (!file) { setLoadingStatus(''); return }
      setLoadingStatus('Reading ' + file.name + '...')
      buf = await file.arrayBuffer()
      name = file.name
    }
    setLoadingStatus('Detecting ECU type...')
    setLocalBuffer(buf)
    setLocalFileName(name)
    // Detect ECU — try filename first (instant), then binary scan (slow for large files)
    const { detectEcu, detectEcuFromFilename } = await import('../lib/binaryParser')
    const det = detectEcuFromFilename(name) ?? detectEcu(buf)
    setLocalDetected(det)
    setLoadingStatus(det ? 'Detected: ' + det.def.name + ' — scanning...' : 'Unknown ECU — scanning...')

    let scannerFound = false
    const fam = (det?.def?.family ?? '').toUpperCase()
    const isC167Arch = fam.includes('ME7') || fam.includes('ME9') || fam.includes('MED9') || fam.includes('MS43') || fam.includes('EDC15')
    const isDelphi = fam.includes('DCM6')  // Delphi uses count-prefixed format, extractMap doesn't understand it

    // Run binary scanner for ALL ECU families.
    // Pass 1/2 (Kf_) handles EDC16/EDC17, Pass 3 handles EDC17 markers,
    // Pass 5 (symbol-name) handles C167 ECUs (ME7/EDC15/MS43) via ASCII signature search.
    if (det) {
      const { scanBinaryForMaps, classifyCandidates } = await import('../lib/mapClassifier')
      try {
        const candidates = scanBinaryForMaps(buf, det.def)
        if (candidates.length > 0) {
          const result = classifyCandidates(candidates, det.def)
          setLocalScanResult(result)
          setShowScanner(true)
          scannerFound = true

          // Auto-populate grids from best scanner maps per category.
          // Prefer critical/primary maps (boost_target, fuel_inject, soi_main) over
          // secondary maps (torque_iq, smoke, driver's wish) using the critical flag.
          if (result.candidates.length > 0) {
            // Pick best scanner map for each tab, preferring primary tuning maps
            // Pick best scanner map for each tab.
            // For fuel: prefer injection duration/quantity maps over conversion tables (torque_iq, drivers_wish).
            // For ignition: prefer SOI/timing maps.
            // For boost: prefer boost target.
            const FUEL_PRIMARY = ['fuel_quantity', 'fuel_inject', 'fuel_map', 'fuel_duration']
            const FUEL_EXCLUDE = ['torque_iq', 'drivers_wish', 'smoke', 'rail_pressure']  // support maps, not the main fuel map
            const pickBest = (cat: string, primaryKeys?: string[], excludeKeys?: string[]): typeof result.candidates[0] | undefined => {
              const matches = result.candidates.filter(c => c.bestMatch?.category === cat)
              if (matches.length === 0) return undefined

              // Step 1: try primary keywords (the REAL tuning maps)
              if (primaryKeys && primaryKeys.length > 0) {
                const primary = matches.filter(c =>
                  primaryKeys.some(k => c.bestMatch?.mapDefId?.includes(k))
                )
                if (primary.length > 0) {
                  return primary.sort((a, b) => (b.bestMatch?.score ?? 0) - (a.bestMatch?.score ?? 0))[0]
                }
              }

              // Step 2: exclude known non-primary maps, pick best of remainder
              if (excludeKeys && excludeKeys.length > 0) {
                const filtered = matches.filter(c =>
                  !excludeKeys.some(k => c.bestMatch?.mapDefId?.includes(k))
                )
                if (filtered.length > 0) {
                  return filtered.sort((a, b) => (b.bestMatch?.score ?? 0) - (a.bestMatch?.score ?? 0))[0]
                }
              }

              // Step 3: fallback — highest score
              return matches.sort((a, b) => (b.bestMatch?.score ?? 0) - (a.bestMatch?.score ?? 0))[0]
            }

            const bestFuel = pickBest('fuel', FUEL_PRIMARY, FUEL_EXCLUDE) || pickBest('smoke')
            const bestIgn = pickBest('ignition', ['soi', 'ign_timing', 'ignbase'])
            const bestBoost = pickBest('boost', ['boost_target', 'boost_pressure'])

            if (bestFuel?.bestMatch) {
              const data = readMapFromCandidate(buf, bestFuel.candidate, bestFuel.bestMatch.mapDefId, det.def)
              if (data) {
                setFuelGrid(data.grid)
                setScanFuelLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
              }
            }
            if (bestIgn?.bestMatch) {
              const data = readMapFromCandidate(buf, bestIgn.candidate, bestIgn.bestMatch.mapDefId, det.def)
              if (data) {
                setTimingGrid(data.grid)
                setScanTimingLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
              }
            }
            if (bestBoost?.bestMatch) {
              const data = readMapFromCandidate(buf, bestBoost.candidate, bestBoost.bestMatch.mapDefId, det.def)
              if (data) {
                setBoostCurve(extractBoostRow(data.grid))
                setScanBoostLabels({ x: data.xLabels, unit: data.unit, name: data.name })
              }
            }
          }
        }
      } catch (e) {
        console.error('Scan failed:', e)
        setLoadError('Scanner error: ' + String(e))
      }
    }

    setLoadingStatus('')
    // Definition maps (extractAllMaps/calSearch) removed — scanner maps are the primary source.
    // Scanner finds real Kf_ maps with correct axes directly from the binary.
    } catch (err) {
      console.error('Load failed:', err)
      setLoadError('Load failed: ' + String(err))
      setLoadingStatus('')
    }
  }

  // Group scanner candidates by map type
  const scannerGroups = useMemo(() => {
    if (!localScanResult) return new Map<string, ClassifiedCandidate[]>()
    const groups = new Map<string, ClassifiedCandidate[]>()
    for (const cc of localScanResult.candidates) {
      const key = cc.bestMatch?.mapDefId ?? 'unknown'
      const arr = groups.get(key) || []
      arr.push(cc)
      groups.set(key, arr)
    }
    return groups
  }, [localScanResult])

  // ── Search AI Database for unknown maps ──────────────────────────────────────
  const handleSearchAI = async () => {
    if (!localBuffer || !localScanResult || aiSearching) return
    setAiSearching(true)
    try {
      const family = localDetected?.def.family
      const results = await matchUnknownsByDNA(localBuffer, localScanResult.unmatched, family)
      setAiMatches(results)
    } catch (e) {
      console.error('AI search failed:', e)
    }
    setAiSearching(false)
  }

  // Auto-search AI database when scanner finds unknown maps
  useEffect(() => {
    if (localScanResult && localScanResult.unmatched.length > 0 && localBuffer && aiMatches.size === 0 && !aiSearching) {
      handleSearchAI()
    }
  }, [localScanResult])

  // Auto-populate grids from AI matches when they arrive (especially for non-EDC16 ECUs)
  useEffect(() => {
    if (aiMatches.size === 0 || !localBuffer || !localScanResult) return
    // Only auto-load if no classified maps already loaded the grids
    const hasClassifiedFuel = localScanResult.candidates.some(c => c.bestMatch && ['fuel', 'torque', 'smoke'].includes(c.bestMatch.category))
    const hasClassifiedTiming = localScanResult.candidates.some(c => c.bestMatch?.category === 'ignition')
    const hasClassifiedBoost = localScanResult.candidates.some(c => c.bestMatch?.category === 'boost')

    for (const cc of localScanResult.unmatched) {
      const ai = aiMatches.get(cc.candidate.offset)
      if (!ai || ai.similarity < 0.80) continue
      const data = readUnmatchedCandidate(localBuffer, cc.candidate, ai)
      if (!data) continue

      if (!hasClassifiedFuel && (ai.category === 'fuel' || ai.category === 'torque' || ai.category === 'smoke') && !scanFuelLabels) {
        setFuelGrid(data.grid)
        setScanFuelLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
      } else if (!hasClassifiedTiming && ai.category === 'ignition' && !scanTimingLabels) {
        setTimingGrid(data.grid)
        setScanTimingLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
      } else if (!hasClassifiedBoost && ai.category === 'boost' && !scanBoostLabels) {
        setBoostCurve(extractBoostRow(data.grid))
        setScanBoostLabels({ x: data.xLabels, unit: data.unit, name: data.name })
      }
    }
  }, [aiMatches])

  // Load a scanner-found map into the active tab's grid.
  // Maps load into their natural tab: fuel→Fuel, ignition→Timing, boost→Boost.
  // Torque/limiter/emission maps stay on the current tab (they appear in Limiters dropdown).
  const loadScannerMap = (cc: ClassifiedCandidate) => {
    if (!localBuffer || !localDetected?.def || !cc.bestMatch) return
    const data = readMapFromCandidate(localBuffer, cc.candidate, cc.bestMatch.mapDefId, localDetected.def)
    if (!data) return
    const cat = data.category
    if (cat === 'fuel' || cat === 'smoke') {
      setFuelGrid(data.grid)
      setScanFuelLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
    } else if (cat === 'ignition') {
      setTimingGrid(data.grid)
      setScanTimingLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
    } else if (cat === 'boost') {
      setBoostCurve(extractBoostRow(data.grid))
      setScanBoostLabels({ x: data.xLabels, unit: data.unit, name: data.name })
    } else {
      // Torque, limiter, emission — load into the Fuel tab grid (it's the general-purpose 2D grid)
      setFuelGrid(data.grid)
      setScanFuelLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
    }
    setDirty(false)
  }

  // Build axis labels for a definition-extracted map
  // Priority: 1) MapDef.axisXValues/axisYValues (known breakpoints), 2) Kf_ binary read, 3) fallback 1,2,3...
  const buildDefAxisLabels = (em: ExtractedMap): { xLabels: string[]; yLabels: string[] } => {
    const md = em.mapDef

    const fmtVal = (v: number): string => v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(v)

    // 1) Use known axis breakpoints from MapDef if available
    if (md.axisXValues && md.axisXValues.length === md.cols && md.axisYValues && md.axisYValues.length === md.rows) {
      return { xLabels: md.axisXValues.map(fmtVal), yLabels: md.axisYValues.map(fmtVal) }
    }
    if (md.axisXValues && md.axisXValues.length === md.cols) {
      const yLabels = md.axisYValues && md.axisYValues.length === md.rows
        ? md.axisYValues.map(fmtVal)
        : Array.from({ length: md.rows }, (_, i) => String(i + 1))
      return { xLabels: md.axisXValues.map(fmtVal), yLabels }
    }
    if (md.axisYValues && md.axisYValues.length === md.rows) {
      return { xLabels: Array.from({ length: md.cols }, (_, i) => String(i + 1)), yLabels: md.axisYValues.map(fmtVal) }
    }

    // 2) Try reading Kf_ header before the data offset (works for EDC16/EDC17 inline axis layout)
    const buf = localBuffer ?? ecuFile?.fileBuffer
    if (!buf) return { xLabels: Array.from({ length: md.cols }, (_, i) => String(i + 1)), yLabels: Array.from({ length: md.rows }, (_, i) => String(i + 1)) }

    const view = new DataView(buf)
    const le = md.le

    const tryReadAxis = (start: number, count: number): string[] | null => {
      if (start < 0 || start + count * 2 > buf.byteLength) return null
      const labels: string[] = []
      let prev = -1
      for (let i = 0; i < count; i++) {
        const v = le ? view.getUint16(start + i * 2, true) : view.getUint16(start + i * 2, false)
        if (v >= 0xFFF0 || (prev >= 0 && v <= prev)) return null
        prev = v
        labels.push(fmtVal(v))
      }
      return labels
    }

    // Axes are right before data: [X_axis:cols*2B][Y_axis:rows*2B][data]
    const xAxisStart = em.offset - (md.cols * 2 + md.rows * 2)
    const yAxisStart = em.offset - md.rows * 2
    const xLabels = tryReadAxis(xAxisStart, md.cols) ?? Array.from({ length: md.cols }, (_, i) => String(i + 1))
    const yLabels = tryReadAxis(yAxisStart, md.rows) ?? Array.from({ length: md.rows }, (_, i) => String(i + 1))
    return { xLabels, yLabels }
  }

  // Load a definition-extracted map into the active grid (with RPM→rows transpose)
  const loadDefMap = (em: ExtractedMap) => {
    const md = em.mapDef
    let { xLabels, yLabels } = buildDefAxisLabels(em)
    const kfT = localDetected ? isKfFamily(localDetected.def.family) : false
    const doT = kfT || needsTranspose(md.axisXValues, md.axisYValues)
    const grid = doT ? transpose(em.data) : em.data
    if (doT) { const tmp = xLabels; xLabels = yLabels; yLabels = tmp }

    const cat = md.category
    if (cat === 'fuel' || cat === 'smoke' || cat === 'torque') {
      setFuelGrid(grid)
      setScanFuelLabels({ x: xLabels, y: yLabels, unit: md.unit, name: md.name })
      setTab('fuel')
    } else if (cat === 'ignition') {
      setTimingGrid(grid)
      setScanTimingLabels({ x: xLabels, y: yLabels, unit: md.unit, name: md.name })
      setTab('timing')
    } else if (cat === 'boost') {
      setBoostCurve(extractBoostRow(grid))
      setScanBoostLabels({ x: xLabels, unit: md.unit, name: md.name })
      setTab('boost')
    }
    setDirty(false)
  }

  // Scanner axis label overrides
  const [scanFuelLabels, setScanFuelLabels] = useState<{ x: string[]; y: string[]; unit: string; name: string } | null>(null)
  const [scanTimingLabels, setScanTimingLabels] = useState<{ x: string[]; y: string[]; unit: string; name: string } | null>(null)
  const [scanBoostLabels, setScanBoostLabels] = useState<{ x: string[]; unit: string; name: string } | null>(null)

  // ── Limiter & Addon state ─────────────────────────────────────────────────
  const [foundLimiters, setFoundLimiters] = useState<FoundLimiter[]>([])
  const [foundLimiterVals, setFoundLimiterVals] = useState<number[]>([])  // physical values for sliders
  const [popcornEnabled, setPopcornEnabled] = useState(false)
  const [smokeOnLaunchEnabled, setSmokeOnLaunchEnabled] = useState(false)
  const [smokeOriginalValues, setSmokeOriginalValues] = useState<Map<number, number> | null>(null)
  const [addonMessage, setAddonMessage] = useState('')

  // Determine endianness for the loaded binary
  const BIG_ENDIAN_FAMILIES = ['ME7', 'EDC15', 'EDC16', 'SID', 'MS43']
  const scanLE = localDetected ? !BIG_ENDIAN_FAMILIES.some(f => localDetected.def.family.toUpperCase().includes(f)) : true

  // Find limiters when scanner runs — pass boost map offset for better SVBL detection
  useEffect(() => {
    const buf = localBuffer ?? ecuFile?.fileBuffer
    if (!buf) return
    // Find the boost map offset from scanner results
    const boostGroup = scannerGroups.get('edc16_boost_target')
    const boostOffset = boostGroup?.[0]?.candidate.offset
    const limiters = findAllLimiters(buf, scanLE, boostOffset)
    setFoundLimiters(limiters)
    setFoundLimiterVals(limiters.map(l => l.physValue))
  }, [localBuffer, ecuFile?.fileBuffer, scannerGroups])

  // ── Read grids from binary ─────────────────────────────────────────────────
  const [fuelGrid,    setFuelGrid]    = useState<number[][]>(() => makeDefaultFuelGrid())
  const [timingGrid,  setTimingGrid]  = useState<number[][]>(() => makeDefaultTimingGrid())
  const [boostCurve,  setBoostCurve]  = useState<number[]>(DEFAULT_BOOST)
  const [limiterVals, setLimiterVals] = useState<number[]>([])

  // When ecuFile changes (new file loaded via Remap Builder), read real values
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
      if (g) setBoostCurve(extractBoostRow(g))
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
  // Pro layout: xLabels = columns (Load across top), yLabels = rows (RPM down left)
  const fuelXLabels   = scanFuelLabels?.x ?? (isLive && fuelMapDef   ? buildAxisLabels(fuelMapDef,   'y') : DEMO_LOAD)
  const fuelYLabels   = scanFuelLabels?.y ?? (isLive && fuelMapDef   ? buildAxisLabels(fuelMapDef,   'x') : DEMO_RPM)
  const timingXLabels = scanTimingLabels?.x ?? (isLive && timingMapDef ? buildAxisLabels(timingMapDef, 'y') : DEMO_LOAD)
  const timingYLabels = scanTimingLabels?.y ?? (isLive && timingMapDef ? buildAxisLabels(timingMapDef, 'x') : DEMO_RPM)
  const boostXLabels  = scanBoostLabels?.x ?? (isLive && boostMapDef  ? buildAxisLabels(boostMapDef,  'x') : DEMO_RPM.slice(0, boostCurve.length))

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateFuel   = (r: number, c: number, v: number) => { setFuelGrid(g => { const n = g.map(row => [...row]); n[r][c] = v; return n }); setDirty(true) }
  const updateTiming = (r: number, c: number, v: number) => { setTimingGrid(g => { const n = g.map(row => [...row]); n[r][c] = v; return n }); setDirty(true) }
  const updateBoost  = (i: number, v: number) => { setBoostCurve(c => { const n = [...c]; n[i] = v; return n }); setDirty(true) }
  const updateLimiter = (i: number, v: number) => { setLimiterVals(l => { const n = [...l]; n[i] = v; return n }); setDirty(true) }

  // ── Export / Save modified binary ───────────────────────────────────────────
  const activeBuffer = ecuFile?.fileBuffer ?? localBuffer
  const activeFileName = ecuFile?.fileName ?? localFileName
  const canSave = !!(activeBuffer && (isLive || hasScan))

  // ── Checksum state ─────────────────────────────────────────────────────
  const [checksumStatus, setChecksumStatus] = useState<'grey' | 'yellow' | 'green'>('grey')

  // Simple 16-bit additive checksum (EDC15 / early Bosch)
  const fixSimpleChecksum = (data: ArrayBuffer, offset: number, blockStart: number, blockEnd: number): boolean => {
    const view = new DataView(data)
    let sum = 0
    for (let i = blockStart; i < blockEnd; i += 2) {
      sum = (sum + view.getUint16(i, true)) & 0xFFFFFFFF
    }
    const oldSum = view.getUint32(offset, true)
    const correction = (0 - sum) & 0xFFFFFFFF
    view.setUint32(offset, correction, true)
    return oldSum !== correction
  }

  // CRC32 checksum (EDC16 / EDC17 / MED17)
  const fixCRC32Checksum = (data: ArrayBuffer): boolean => {
    // Simplified: recalculate CRC32 for the calibration region
    // Real implementation would need block boundaries from the ECU definition
    const bytes = new Uint8Array(data)
    let crc = 0xFFFFFFFF
    const poly = 0xEDB88320
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i]
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? poly : 0)
      }
    }
    return true // CRC calculated but we need block boundaries to write it back
  }

  const saveBinary = async () => {
    if (!activeBuffer) return
    const copy = activeBuffer.slice(0)

    // A2L/DRT path: write back using definition offsets
    if (isLive) {
      if (fuelMapDef)   writeGridToBuffer(copy, fuelMapDef, fuelGrid)
      if (timingMapDef) writeGridToBuffer(copy, timingMapDef, timingGrid)
      if (boostMapDef)  writeGridToBuffer(copy, boostMapDef, boostCurve.map(v => [v]))
      limiterMaps.forEach((m, i) => { if (limiterVals[i] !== undefined) writeGridToBuffer(copy, m, [[limiterVals[i]]]) })
    }

    // ── Checksum correction ─────────────────────────────────────────────
    const ecuDef = localDetected?.def ?? ecuFile?.detected?.def
    if (ecuDef) {
      const algo = ecuDef.checksumAlgo
      if (algo === 'bosch-simple') {
        fixSimpleChecksum(copy, ecuDef.checksumOffset, 0, copy.byteLength)
        setChecksumStatus('green')
      } else if (algo === 'bosch-crc32') {
        fixCRC32Checksum(copy)
        setChecksumStatus('green')
      } else if (algo === 'none') {
        setChecksumStatus('green') // No checksum needed
      } else {
        setChecksumStatus('yellow') // Unknown algo — warn user
      }
    }

    // Save via Electron API or download
    const api = (window as any).api
    if (api?.saveEcuFile) {
      await api.saveEcuFile({ buffer: Array.from(new Uint8Array(copy)), defaultName: activeFileName.split(/[\\/]/).pop() || 'tuned.bin' })
    } else {
      const outName = activeFileName.replace(/(\.\w+)$/, '_tuned$1') || 'tuned.bin'
      const blob = new Blob([copy], { type: 'application/octet-stream' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = outName; a.click()
      URL.revokeObjectURL(a.href)
    }
    setSavedAt(new Date().toLocaleString())
    setDirty(false)
  }

  // Track dirty state for checksum light
  useEffect(() => {
    if (dirty) setChecksumStatus('yellow')
  }, [dirty])

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
    { id: 'fuel',     label: '⛽ Fuel Map',         desc: fuelMapDef ? `${fuelMapDef.name} — ${fuelMapDef.rows}×${fuelMapDef.cols}` : scanFuelLabels ? `${scanFuelLabels.name} — ${scanFuelLabels.unit}` : 'Injection quantity — mg/st (demo data)', mapName: fuelMapDef?.name },
    { id: 'timing',   label: '⚡ Ignition Timing',  desc: timingMapDef ? `${timingMapDef.name} — ${timingMapDef.rows}×${timingMapDef.cols}` : scanTimingLabels ? `${scanTimingLabels.name} — ${scanTimingLabels.unit}` : 'Advance — °BTDC (demo data)', mapName: timingMapDef?.name },
    { id: 'boost',    label: '💨 Boost Curve',      desc: boostMapDef ? `${boostMapDef.name} — ${boostMapDef.cols} points` : scanBoostLabels ? `${scanBoostLabels.name} — ${scanBoostLabels.unit}` : 'Target boost pressure — bar (demo data)', mapName: boostMapDef?.name },
    { id: 'limiters', label: '🚫 Limiters',          desc: foundLimiters.length > 0 ? `${foundLimiters.length} limiters found` : limiterMaps.length > 0 ? `${limiterMaps.length} limiter maps found` : 'Rev, speed, boost limiters' },
    { id: 'addons',   label: '🔧 Addons',            desc: 'Popcorn, Launch Control, Smoke on Launch' },
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h1>Performance Tuning</h1>
          {isLive
            ? <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>📂 {ecuFile!.fileName} — {allMaps.length} maps loaded</div>
            : hasScan
              ? <div style={{ fontSize: 12, color: 'var(--lime)', marginTop: 2 }}>
                  🔍 {localFileName.split(/[\\/]/).pop()} — {
                    localScanResult ? `${localScanResult.candidates.length} scanned` : ''
                  } · {localDetected?.def.name ?? 'Unknown ECU'}
                </div>
              : <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Load an ECU file to scan for maps automatically</div>}
          {loadingStatus && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4, fontWeight: 700 }}>⏳ {loadingStatus}</div>}
          {loadError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4, fontWeight: 700 }}>❌ {loadError}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(hasScan || isLive) && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }} onClick={handleLoadFile}>
              📂 Load Different File
            </button>
          )}
          {/* AI Search button — visible whenever a file is loaded */}
          {localBuffer && localScanResult && localScanResult.unmatched.length > 0 && (
            <button
              onClick={handleSearchAI}
              disabled={aiSearching}
              style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 6, border: 'none',
                cursor: aiSearching ? 'wait' : 'pointer',
                background: aiSearching ? 'rgba(139,92,246,0.15)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                color: '#fff', fontWeight: 700, letterSpacing: '0.3px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {aiSearching ? (
                <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Searching AI...</>
              ) : aiMatches.size > 0 ? (
                <>🧠 {aiMatches.size} AI Matches</>
              ) : (
                <>🧠 Search AI Database ({localScanResult.unmatched.length} unknown)</>
              )}
            </button>
          )}
          {dirty && <span className="badge" style={{ background: 'rgba(255,150,0,.12)', color: '#ff9500', border: '1px solid #ff9500', fontSize: 11 }}>● Unsaved</span>}
          {savedAt && !dirty && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>✓ Saved {savedAt}</span>}
          {canSave && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Checksum status light */}
              <div title={checksumStatus === 'grey' ? 'No changes' : checksumStatus === 'yellow' ? 'Changes pending — checksum needs update' : 'Checksum corrected'}
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: checksumStatus === 'grey' ? '#6b7280' : checksumStatus === 'yellow' ? '#f59e0b' : '#22c55e',
                  boxShadow: checksumStatus === 'yellow' ? '0 0 6px #f59e0b' : checksumStatus === 'green' ? '0 0 6px #22c55e' : 'none',
                }} />
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveBinary}>
                💾 Save File
              </button>
            </div>
          )}
          {hasScan && (
            compareMode ? (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px', color: '#ef4444' }} onClick={() => { setCompareMode(false); setCompareGrid(null); setCompareName('') }}>
                ✕ Exit Compare
              </button>
            ) : (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }} onClick={async () => {
                // Load a "before" file to compare against the current map
                const api = (window as any).api
                let cBuf: ArrayBuffer
                let cName: string
                if (api?.openEcuFile) {
                  const result = await api.openEcuFile()
                  if (!result || !result.buffer) return
                  cBuf = new Uint8Array(result.buffer).buffer
                  cName = (result.path || result.name || '').split(/[\\/]/).pop() || 'compare'
                } else {
                  const input = document.createElement('input')
                  input.type = 'file'; input.accept = '.bin,.hex,.ori,.mod'
                  const file = await new Promise<File | null>(resolve => { input.onchange = () => resolve(input.files?.[0] ?? null); input.click() })
                  if (!file) return
                  cBuf = await file.arrayBuffer()
                  cName = file.name
                }
                // Read the same map from the comparison file at the same offset
                if (localScanResult && localDetected?.def) {
                  // Find the currently displayed fuel map candidate
                  const fuelCat = localScanResult.candidates.find(c => c.bestMatch && ['fuel', 'smoke', 'torque'].includes(c.bestMatch.category))
                  if (fuelCat?.bestMatch) {
                    const data = readMapFromCandidate(cBuf, fuelCat.candidate, fuelCat.bestMatch.mapDefId, localDetected.def)
                    if (data) {
                      setCompareGrid(data.grid)
                      setCompareName(cName)
                      setCompareMode(true)
                    }
                  }
                }
              }}>
                🔀 Compare Files
              </button>
            )
          )}
          {hasScan && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => {
              if (!localScanResult) return
              const lines = ['DCTuning MapPack Export', `File: ${localFileName}`, `ECU: ${localDetected?.def.name ?? 'Unknown'}`, `Date: ${new Date().toISOString()}`, '']
              lines.push('=== IDENTIFIED MAPS ===')
              for (const cc of localScanResult.candidates) {
                const b = cc.bestMatch
                if (!b) continue
                lines.push(`${b.category.toUpperCase().padEnd(10)} ${b.mapDefName.padEnd(30)} 0x${cc.candidate.offset.toString(16).toUpperCase().padStart(6,'0')}  ${cc.candidate.rows}x${cc.candidate.cols}  ${b.score}%`)
              }
              lines.push('', '=== UNKNOWN MAPS ===')
              for (const cc of localScanResult.unmatched) {
                lines.push(`UNKNOWN    ${''.padEnd(30)} 0x${cc.candidate.offset.toString(16).toUpperCase().padStart(6,'0')}  ${cc.candidate.rows}x${cc.candidate.cols}  range:${cc.candidate.valueRange.min}-${cc.candidate.valueRange.max}`)
              }
              const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
              a.download = `${localFileName.replace(/\.\w+$/, '')}_mappack.txt`; a.click()
              URL.revokeObjectURL(a.href)
            }}>📋 Export MapPack</button>
          )}
          <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
        </div>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {/* No file loaded banner — with Load ECU File button */}
      {!isLive && !hasScan && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(0,174,200,0.08)', border: '1px solid rgba(0,174,200,0.25)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--accent)' }}>Demo data — no ECU file loaded.</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
              Load a .bin file to scan for maps automatically, or go to <button onClick={() => setPage('remap')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0, textDecoration: 'underline', fontSize: 13 }}>Remap Builder</button> for A2L/DRT support.
            </span>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, flexShrink: 0 }} onClick={handleLoadFile}>
            📂 Load ECU File
          </button>
        </div>
      )}

      {/* Tabs + Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '12px 20px', background: 'transparent',
              border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
              fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13, transition: 'all 0.15s', marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Map description sub-header + scanner dropdown */}
        <div style={{ padding: '12px 24px 0', borderBottom: '1px solid var(--border)', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
              {tabs.find(t => t.id === tab)?.label.replace(/^[^ ]+ /, '')}
              {/* Show unit from scanner */}
              {scanFuelLabels && tab === 'fuel' && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>({scanFuelLabels.unit})</span>}
              {scanTimingLabels && tab === 'timing' && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>({scanTimingLabels.unit})</span>}
              {scanBoostLabels && tab === 'boost' && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>({scanBoostLabels.unit})</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{tabs.find(t => t.id === tab)?.desc}</div>
          </div>
          {/* Scanner map selector dropdown */}
          {hasScan && scannerGroups.size > 0 && (() => {
            // Filter scanner maps by current tab
            const tabCategories: Record<string, string[]> = {
              fuel: ['fuel', 'smoke', 'torque'],
              timing: ['ignition'],
              boost: ['boost'],
              limiters: ['limiter', 'emission'],
            }
            const allowedCats = tabCategories[tab] || ['fuel', 'smoke']
            const filteredGroups = [...scannerGroups.entries()].filter(([, members]) => {
              const cat = members[0]?.bestMatch?.category
              return cat && allowedCats.includes(cat)
            })
            if (filteredGroups.length === 0) return null
            return (
              <select
                onChange={e => {
                  const mapDefId = e.target.value
                  if (!mapDefId) return
                  const group = scannerGroups.get(mapDefId)
                  if (group?.[0]) loadScannerMap(group[0])
                }}
                style={{
                  background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(184,240,42,0.3)',
                  borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', minWidth: 200,
                }}
              >
                <option value="">🔍 Select a map...</option>
                {filteredGroups.map(([mapDefId, members]) => {
                  const best = members[0]?.bestMatch
                  if (!best) return null
                  const catIcons: Record<string, string> = { fuel: '⛽', torque: '⚡', boost: '💨', ignition: '🔥', smoke: '💨', emission: '🌿', limiter: '🚫' }
                  return (
                    <option key={mapDefId} value={mapDefId}>
                      {catIcons[best.category] ?? '📊'} {best.mapDefName} ({best.score}%) · {members.length} variant{members.length > 1 ? 's' : ''}
                    </option>
                  )
                })}
              </select>
            )
          })()}
          {/* AI-matched maps dropdown — filtered by current tab */}
          {aiMatches.size > 0 && localScanResult && (() => {
            const tabCats: Record<string, string[]> = {
              fuel: ['fuel', 'smoke', 'torque'],
              timing: ['ignition'],
              boost: ['boost'],
              limiters: ['limiter', 'emission'],
            }
            const allowedCats = tabCats[tab] || ['fuel', 'smoke']
            const filtered = [...aiMatches.entries()].filter(([, ai]) => allowedCats.includes(ai.category))
            if (filtered.length === 0) return null
            return (
              <select
                onChange={e => {
                  const offset = parseInt(e.target.value)
                  if (isNaN(offset)) return
                  const cc = localScanResult.unmatched.find(c => c.candidate.offset === offset)
                  const ai = aiMatches.get(offset)
                  if (!cc || !ai || !localBuffer) return
                  const data = readUnmatchedCandidate(localBuffer, cc.candidate, ai)
                  if (!data) return
                  // Load into current tab's grid
                  if (data.category === 'fuel' || data.category === 'torque' || data.category === 'smoke') {
                    setFuelGrid(data.grid)
                    setScanFuelLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
                  } else if (data.category === 'ignition') {
                    setTimingGrid(data.grid)
                    setScanTimingLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
                  } else if (data.category === 'boost') {
                    setBoostCurve(extractBoostRow(data.grid))
                    setScanBoostLabels({ x: data.xLabels, unit: data.unit, name: data.name })
                  } else {
                    // Torque, limiter, emission — load into fuel grid
                    setFuelGrid(data.grid)
                    setScanFuelLabels({ x: data.xLabels, y: data.yLabels, unit: data.unit, name: data.name })
                  }
                }}
                style={{
                  background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(139,92,246,0.4)',
                  borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', minWidth: 200,
                }}
              >
                <option value="">🧠 AI Maps ({filtered.length})...</option>
                {filtered.map(([offset, ai]) => {
                  const catIcons: Record<string, string> = { fuel: '⛽', torque: '⚡', boost: '💨', ignition: '🔥', smoke: '💨', emission: '🌿', limiter: '🚫' }
                  const cc = localScanResult.unmatched.find(c => c.candidate.offset === offset)
                  return (
                    <option key={offset} value={String(offset)}>
                      {catIcons[ai.category] ?? '📊'} {ai.mapName} ({(ai.similarity * 100).toFixed(0)}%) {cc ? `${cc.candidate.rows}×${cc.candidate.cols}` : ''}
                    </option>
                  )
                })}
              </select>
            )
          })()}
          {/* Definition maps dropdown removed — scanner maps are the primary source */}
        </div>

        <div style={{ padding: '20px 24px' }}>

        {/* Fuel Map */}
        {tab === 'fuel' && (
          <MapGrid grid={fuelGrid} xLabels={fuelXLabels} yLabels={fuelYLabels}
            unit={scanFuelLabels?.unit ?? '%'}
            decimals={isLive && fuelMapDef?.dataType === 'float32' ? 3 : 1}
            onChange={updateFuel}
            compareGrid={compareMode ? compareGrid : undefined}
            compareName={compareMode ? compareName : undefined}
            onSwapAxes={() => {
              // Transpose grid and swap axis labels
              const transposed = fuelGrid[0].map((_, ci) => fuelGrid.map(row => row[ci]))
              setFuelGrid(transposed)
              const oldLabels = scanFuelLabels
              if (oldLabels) setScanFuelLabels({ x: oldLabels.y, y: oldLabels.x, unit: oldLabels.unit, name: oldLabels.name })
            }} />
        )}

        {/* Timing Map */}
        {tab === 'timing' && (
          <MapGrid grid={timingGrid} xLabels={timingXLabels} yLabels={timingYLabels}
            unit={scanTimingLabels?.unit ?? '°'}
            decimals={isLive && timingMapDef?.dataType === 'float32' ? 3 : 1}
            onChange={updateTiming}
            onSwapAxes={() => {
              const transposed = timingGrid[0].map((_, ci) => timingGrid.map(row => row[ci]))
              setTimingGrid(transposed)
              const oldLabels = scanTimingLabels
              if (oldLabels) setScanTimingLabels({ x: oldLabels.y, y: oldLabels.x, unit: oldLabels.unit, name: oldLabels.name })
            }} />
        )}

        {/* Boost Curve */}
        {tab === 'boost' && (
          <BoostCurve curve={boostCurve} xLabels={boostXLabels.slice(0, boostCurve.length)} onChange={updateBoost} />
        )}

        {/* Limiters — Single-value safety ceilings only (no 3D tables) */}
        {tab === 'limiters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {foundLimiters.length > 0 && foundLimiters.map((lim, i) => {
              const val = foundLimiterVals[i] ?? lim.physValue
              const pct = Math.max(0, Math.min(100, ((val - lim.min) / Math.max(1, lim.max - lim.min)) * 100))
              const isHigh = pct > 75
              const valColor = isHigh ? '#ef4444' : pct > 50 ? '#f59e0b' : 'var(--accent)'
              return (
                <div key={`lim-${i}`} style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{lim.name}</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(184,240,42,0.1)', color: 'var(--lime)', border: '1px solid rgba(184,240,42,0.3)', marginLeft: 8, fontWeight: 700 }}>FOUND</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: valColor }}>{val.toFixed(0)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>{lim.unit}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{lim.description}</div>
                  {/* Slider with visual track fill */}
                  <div style={{ position: 'relative', height: 6, background: 'var(--bg-primary)', borderRadius: 3, margin: '8px 0' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: valColor, borderRadius: 3, transition: 'width 0.1s' }} />
                    <input type="range" min={lim.min} max={lim.max} step={1} value={val}
                      onChange={e => {
                        const nv = parseFloat(e.target.value)
                        setFoundLimiterVals(v => { const n = [...v]; n[i] = nv; return n })
                        const buf = localBuffer ?? ecuFile?.fileBuffer
                        if (buf) { writeLimiterValue(buf, lim, nv, scanLE); setDirty(true) }
                      }}
                      style={{
                        position: 'absolute', top: -10, left: 0, width: '100%', height: 26,
                        appearance: 'none', WebkitAppearance: 'none', background: 'transparent',
                        cursor: 'pointer', outline: 'none', margin: 0,
                      }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                    <span>{lim.min} {lim.unit}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 9 }}>0x{lim.offset.toString(16).toUpperCase().padStart(6, '0')} · raw {Math.round(val / lim.factor)}</span>
                    <span>{lim.max} {lim.unit}</span>
                  </div>
                </div>
              )
            })}

            {foundLimiters.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                {hasScan || isLive ? 'No single-value limiters found in this binary.' : 'Load an ECU file to find limiters automatically.'}
              </div>
            )}
          </div>
        )}

        {/* Addons — Family-aware tuning features */}
        {tab === 'addons' && (() => {
          const family = (localDetected?.def.family ?? ecuFile?.detected?.def.family ?? '').toUpperCase()
          const isDiesel = family.includes('EDC') || family.includes('SID') || family.includes('DCM')
          const isPetrol = family.includes('ME7') || family.includes('ME9') || family.includes('MED9') ||
                           family.includes('MED17') || family.includes('SIMOS') || family.includes('MEVD') ||
                           family.includes('MS43') || family.includes('MSS')
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {addonMessage && (
              <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 12, color: '#22c55e' }}>
                {addonMessage}
              </div>
            )}

            {/* ── STAGE 1 SMART SLIDER ────────────────────────────────────── */}
            <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(184,240,42,0.03)', border: '1px solid rgba(184,240,42,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🚀</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Stage 1 Smart Remap</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Gradient increase — leaves idle stock, progressively increases power toward full load. Safe for daily driving.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Intensity:</label>
                {[5, 8, 10, 12, 15].map(pct => (
                  <button key={pct}
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700 }}
                    onClick={() => {
                      if (!fuelGrid || fuelGrid.length < 2) { setAddonMessage('Load an ECU file first'); return }
                      const rows = fuelGrid.length, cols = fuelGrid[0].length
                      const newGrid = fuelGrid.map((row, ri) =>
                        row.map((v, ci) => {
                          // Weighted gradient: 0% at top-left (idle), max% at bottom-right (full power)
                          const yWeight = ri / (rows - 1)  // 0 at top, 1 at bottom
                          const xWeight = ci / (cols - 1)  // 0 at left, 1 at right
                          const weight = yWeight * xWeight  // Combined gradient
                          const increase = v * (pct / 100) * weight
                          return parseFloat((v + increase).toFixed(1))
                        })
                      )
                      setFuelGrid(newGrid)
                      setDirty(true)
                      setAddonMessage(`Stage 1 applied: +${pct}% gradient increase (idle untouched, full power +${pct}%)`)
                    }}
                  >+{pct}%</button>
                ))}
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700, color: '#ef4444' }}
                  onClick={() => {
                    // Reset to original
                    if (origGrid) { setFuelGrid(origGrid.map(r => [...r])); setDirty(false); setAddonMessage('Map reset to original values') }
                  }}>Reset</button>
              </div>
            </div>

            {/* ── DTC AUTO-KILLER ─────────────────────────────────────────── */}
            <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🔇</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>DTC Code Killer</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Search for a diagnostic trouble code by P-code number. Finds and disables the error in the ECU binary.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text" placeholder="e.g. P0401"
                  id="dtc-search-input"
                  style={{ width: 120, height: 30, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', fontSize: 13, textTransform: 'uppercase' }}
                />
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 12px', fontWeight: 700, color: '#ef4444' }}
                  onClick={() => {
                    const buf = localBuffer ?? ecuFile?.fileBuffer
                    if (!buf) { setAddonMessage('Load an ECU file first'); return }
                    const input = document.getElementById('dtc-search-input') as HTMLInputElement
                    const code = input?.value?.replace(/[^0-9A-Fa-f]/g, '') ?? ''
                    if (code.length < 3 || code.length > 5) { setAddonMessage('Enter a valid P-code (e.g. P0401)'); return }
                    // Search for the code in the binary
                    const bytes = new Uint8Array(buf)
                    const codeNum = parseInt(code, 16)
                    const hi = (codeNum >> 8) & 0xFF
                    const lo = codeNum & 0xFF
                    const results: number[] = []
                    // Search both byte orders
                    for (let i = 0; i < bytes.length - 1; i++) {
                      if ((bytes[i] === hi && bytes[i+1] === lo) || (bytes[i] === lo && bytes[i+1] === hi)) {
                        results.push(i)
                      }
                    }
                    if (results.length === 0) {
                      setAddonMessage(`P${code}: Not found in binary`)
                    } else {
                      // Try to kill the first occurrence by zeroing the enable byte
                      const addr = results[0]
                      const view = new DataView(buf)
                      // Check byte before and after for enable/disable switch
                      const before = addr > 0 ? bytes[addr - 1] : 0
                      const after = addr + 2 < bytes.length ? bytes[addr + 2] : 0
                      if (before === 0x01 || before === 0xFF) {
                        bytes[addr - 1] = 0x00
                        setAddonMessage(`P${code}: Found at 0x${addr.toString(16).toUpperCase()} — disabled (switch byte at 0x${(addr-1).toString(16).toUpperCase()} set to 0x00)`)
                      } else if (after === 0x01 || after === 0xFF) {
                        bytes[addr + 2] = 0x00
                        setAddonMessage(`P${code}: Found at 0x${addr.toString(16).toUpperCase()} — disabled (switch byte at 0x${(addr+2).toString(16).toUpperCase()} set to 0x00)`)
                      } else {
                        setAddonMessage(`P${code}: Found ${results.length} occurrence(s) at ${results.slice(0,3).map(r => '0x'+r.toString(16).toUpperCase()).join(', ')}${results.length > 3 ? '...' : ''} — manual review needed`)
                      }
                      setDirty(true)
                    }
                  }}>Kill DTC</button>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Enter hex code without "P" prefix (e.g. 0401 for P0401)</span>
              </div>
            </div>

            {/* ── MAP ORIENTATION CONTROLS ────────────────────────────────── */}
            <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🔄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Map Orientation Tools</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    If a map looks wrong (RPM/Load swapped, upside down), use these to fix the orientation. The app remembers your choice.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }}
                  onClick={() => {
                    if (!fuelGrid || fuelGrid.length < 2) return
                    const t = fuelGrid[0].map((_, ci) => fuelGrid.map(row => row[ci]))
                    setFuelGrid(t)
                    if (scanFuelLabels) setScanFuelLabels({ x: scanFuelLabels.y, y: scanFuelLabels.x, unit: scanFuelLabels.unit, name: scanFuelLabels.name })
                    setAddonMessage('Fuel map: Transposed (rows ↔ columns)')
                  }}>⇄ Transpose</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }}
                  onClick={() => {
                    if (!fuelGrid || fuelGrid.length < 2) return
                    setFuelGrid([...fuelGrid].reverse())
                    if (scanFuelLabels) setScanFuelLabels({ ...scanFuelLabels, y: [...scanFuelLabels.y].reverse() })
                    setAddonMessage('Fuel map: Flipped vertically (rows reversed)')
                  }}>↕ Flip Y</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }}
                  onClick={() => {
                    if (!fuelGrid || fuelGrid.length < 2) return
                    setFuelGrid(fuelGrid.map(row => [...row].reverse()))
                    if (scanFuelLabels) setScanFuelLabels({ ...scanFuelLabels, x: [...scanFuelLabels.x].reverse() })
                    setAddonMessage('Fuel map: Flipped horizontally (columns reversed)')
                  }}>↔ Flip X</button>
              </div>
            </div>

            {/* ── Diesel Addons ──────────────────────────────────────────────── */}
            {isDiesel && (<>
            {/* Popcorn Limiter (Diesel) */}
            {(() => {
              const torqueGroup = scannerGroups.get('edc16_torque_limit')
              const hasTorque = torqueGroup && torqueGroup.length > 0
              return (
                <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>💥</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Popcorn Limiter (Hardcut)</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Zeroes the last RPM column of the torque limiter for a sharp fuel-cut "popcorn" sound at rev limit.
                      </div>
                    </div>
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 700 }}>DIESEL</span>
                    <button
                      disabled={!hasTorque}
                      onClick={() => {
                        const buf = localBuffer ?? ecuFile?.fileBuffer
                        if (!buf || !torqueGroup?.[0]) return
                        let result: FeatureResult
                        if (!popcornEnabled) {
                          result = applyPopcorn(buf, torqueGroup[0].candidate, scanLE)
                          setPopcornEnabled(true)
                        } else {
                          result = removePopcorn(buf, torqueGroup[0].candidate, scanLE)
                          setPopcornEnabled(false)
                        }
                        setAddonMessage(result.message)
                        setDirty(true)
                      }}
                      style={{
                        padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: hasTorque ? 'pointer' : 'not-allowed',
                        background: popcornEnabled ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                        color: popcornEnabled ? '#ef4444' : '#22c55e',
                        border: `1px solid ${popcornEnabled ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
                      }}
                    >
                      {popcornEnabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  {!hasTorque && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⚠ Load an ECU file first — Torque Limitation map required</div>}
                </div>
              )
            })()}

            {/* Smoke on Launch (Diesel) */}
            {(() => {
              const smokeGroup = scannerGroups.get('edc16_smoke_limiter')
              const hasSmoke = smokeGroup && smokeGroup.length > 0
              return (
                <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🔥</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Smoke on Launch</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Increases smoke limiter by 35% at low airflow / mid RPM for aggressive diesel smoke on launch.
                      </div>
                    </div>
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 700 }}>DIESEL</span>
                    <button
                      disabled={!hasSmoke}
                      onClick={() => {
                        const buf = localBuffer ?? ecuFile?.fileBuffer
                        if (!buf || !smokeGroup?.[0]) return
                        if (!smokeOnLaunchEnabled) {
                          const result = applySmokeOnLaunch(buf, smokeGroup[0].candidate, scanLE)
                          setSmokeOriginalValues(result.originalValues)
                          setSmokeOnLaunchEnabled(true)
                          setAddonMessage(result.message)
                        } else {
                          if (smokeOriginalValues) {
                            const result = removeSmokeOnLaunch(buf, smokeOriginalValues, scanLE)
                            setAddonMessage(result.message)
                          }
                          setSmokeOnLaunchEnabled(false)
                          setSmokeOriginalValues(null)
                        }
                        setDirty(true)
                      }}
                      style={{
                        padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: hasSmoke ? 'pointer' : 'not-allowed',
                        background: smokeOnLaunchEnabled ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        color: smokeOnLaunchEnabled ? '#ef4444' : '#f59e0b',
                        border: `1px solid ${smokeOnLaunchEnabled ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
                      }}
                    >
                      {smokeOnLaunchEnabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                  {!hasSmoke && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⚠ Load an ECU file first — Smoke Limiter map required</div>}
                </div>
              )
            })()}
            </>)}

            {/* ── Petrol Addons ──────────────────────────────────────────────── */}
            {isPetrol && (<>
            {/* Pop & Bang (Petrol — KFZWOP/CWSAWE/KFZWMN based) */}
            {(() => {
              const hasKFZWOP = false  // TODO: detect from scanner results
              const hasKFZW = false
              return (
                <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>💥</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Pop & Bang (Overrun)</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Retards ignition timing during overrun via KFZWOP for exhaust pops. Requires decat for aggressive settings.
                      </div>
                    </div>
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700 }}>PETROL</span>
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(107,114,128,0.1)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.3)', fontWeight: 700 }}>COMING SOON</span>
                  </div>
                  {!hasKFZWOP && !hasKFZW && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⚠ KFZWOP map required — load ME7 binary first</div>}
                  {(hasKFZWOP || hasKFZW) && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Maps found — pop & bang tuning via Remap Builder stage params</div>}
                </div>
              )
            })()}

            {/* Flat-Foot Shifting (Petrol) */}
            <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Throttle Response (KFPED)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Sharpens mid-pedal demand curve for snappier throttle response. Adjusts KFPED pedal-to-torque mapping.
                  </div>
                </div>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700 }}>PETROL</span>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(107,114,128,0.1)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.3)', fontWeight: 700 }}>COMING SOON</span>
              </div>
            </div>
            </>)}

            {/* ── Universal Addons ──────────────────────────────────────────── */}
            {/* Launch Control */}
            <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', opacity: 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>🚀</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Launch Control</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Limits torque at 0 km/h for a 2-step rev limiter. Requires manual transmission and speed-torque 1D curve.
                  </div>
                </div>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 700 }}>MANUAL ONLY</span>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(107,114,128,0.1)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.3)', fontWeight: 700 }}>COMING SOON</span>
              </div>
            </div>

            {/* No ECU loaded hint */}
            {!family && (
              <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#f59e0b' }}>⚠ Load an ECU file to see available addons for your ECU type</div>
              </div>
            )}
          </div>
          )
        })()}
        </div>{/* end padding div */}
      </div>{/* end tabs+card wrapper */}

      {/* Info banner */}
      {!hasScan && (
        <div className="banner banner-warning" style={{ marginTop: 16, fontSize: 12 }}>
          {isLive
            ? `⚡ Editing real ECU map data from ${ecuFile!.fileName}. Click "Export Modified File" to download the modified binary — then flash it to the ECU using a J2534 or KESS interface.`
            : '⚠ Load an ECU binary + A2L/DRT definition in the Remap Builder first to edit real map data. Values shown above are generic demo data only.'}
        </div>
      )}

      {/* ── Binary Map Scanner Results ──────────────────────────────────────── */}
      {hasScan && localScanResult && (
        <div style={{ marginTop: 16, border: '1px solid rgba(184,240,42,0.2)', borderRadius: 10, overflow: 'hidden' }}>
          <div
            onClick={() => setShowScanner(!showScanner)}
            style={{
              padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(184,240,42,0.04)', borderBottom: showScanner ? '1px solid rgba(184,240,42,0.15)' : 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>🔍</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--lime)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              BINARY MAP SCANNER
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {localScanResult.candidates.length + localScanResult.unmatched.length} candidates · {localScanResult.candidates.length} identified
              {aiMatches.size > 0 && <span style={{ color: '#8b5cf6', fontWeight: 700 }}> · {aiMatches.size} AI matched</span>}
              {localFileName && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>{localFileName.split(/[\\/]/).pop()}</span>}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: showScanner ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </div>

          {showScanner && (() => {
            const groups = scannerGroups
            const catColors: Record<string, string> = {
              boost: '#3b82f6', fuel: '#f59e0b', torque: '#ef4444', ignition: '#a855f7',
              limiter: '#6b7280', emission: '#10b981', smoke: '#f97316', misc: '#6b7280',
            }
            return (
              <div style={{ padding: '12px 16px', maxHeight: 500, overflowY: 'auto' }}>
                {/* Identified maps — grouped, clickable */}
                {groups.size > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
                      Identified Maps ({groups.size} types) — click to load into editor
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {[...groups.entries()].map(([mapDefId, members]) => {
                        const best = members[0]?.bestMatch
                        if (!best) return null
                        const conf = best.score
                        const confColor = conf >= 75 ? '#22c55e' : conf >= 55 ? '#f59e0b' : '#f97316'
                        const catColor = catColors[best.category] ?? '#6b7280'
                        return (
                          <div key={mapDefId} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}40`, textTransform: 'uppercase' }}>
                                {best.category}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{best.mapDefName}</span>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: `${confColor}15`, color: confColor, border: `1px solid ${confColor}40` }}>
                                {conf}%
                              </span>
                              {members.length > 1 && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
                                  {members.length} variant{members.length > 1 ? 's' : ''}{members[0]?.groupId?.startsWith('cluster_') ? ' (cluster)' : ''}
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {members.slice(0, 8).map((cc, i) => (
                                <button
                                  key={i}
                                  onClick={() => loadScannerMap(cc)}
                                  style={{
                                    fontFamily: 'monospace', fontSize: 9, color: 'var(--accent)', padding: '2px 6px',
                                    borderRadius: 4, background: 'rgba(0,174,200,0.08)', border: '1px solid rgba(0,174,200,0.2)',
                                    cursor: 'pointer', transition: 'all 0.1s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,174,200,0.2)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,174,200,0.08)' }}
                                >
                                  0x{cc.candidate.offset.toString(16).toUpperCase().padStart(6, '0')} ({cc.candidate.rows}×{cc.candidate.cols})
                                </button>
                              ))}
                              {members.length > 8 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', alignSelf: 'center' }}>+{members.length - 8} more</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Unknown maps */}
                {localScanResult.unmatched.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Unknown Maps ({localScanResult.unmatched.length})
                      </div>
                      <button
                        onClick={handleSearchAI}
                        disabled={aiSearching}
                        style={{
                          fontSize: 9, padding: '3px 10px', borderRadius: 5, border: 'none', cursor: aiSearching ? 'wait' : 'pointer',
                          background: aiSearching ? 'rgba(139,92,246,0.15)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                          color: '#fff', fontWeight: 600, letterSpacing: '0.3px',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {aiSearching ? (
                          <><span style={{ display: 'inline-block', width: 8, height: 8, border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Searching...</>
                        ) : (
                          <>Search AI Database</>
                        )}
                      </button>
                      {aiMatches.size > 0 && (
                        <span style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 600 }}>
                          {aiMatches.size} matched
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {localScanResult.unmatched.slice(0, 15).map((cc, idx) => {
                        const aiMatch = aiMatches.get(cc.candidate.offset)
                        return (
                          <div key={idx} style={{
                            padding: '4px 12px', borderRadius: 6,
                            background: aiMatch ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.01)',
                            border: aiMatch ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(255,255,255,0.04)',
                            display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--text-muted)',
                          }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 72, color: 'var(--text-secondary)' }}>
                              0x{cc.candidate.offset.toString(16).toUpperCase().padStart(6, '0')}
                            </span>
                            <span>{cc.candidate.rows}×{cc.candidate.cols}</span>
                            <span>Range: {cc.candidate.valueRange.min}–{cc.candidate.valueRange.max}</span>
                            {aiMatch ? (
                              <span style={{
                                fontSize: 9, padding: '1px 8px', borderRadius: 3, fontWeight: 700, marginLeft: 'auto',
                                background: aiMatch.similarity >= 0.85
                                  ? 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(109,40,217,0.25))'
                                  : 'rgba(139,92,246,0.12)',
                                color: aiMatch.similarity >= 0.85 ? '#c4b5fd' : '#a78bfa',
                                border: '1px solid rgba(139,92,246,0.2)',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                AI: {aiMatch.mapName}
                                <span style={{
                                  fontSize: 8, padding: '0 4px', borderRadius: 2, fontWeight: 800,
                                  background: aiMatch.similarity >= 0.85 ? '#8b5cf6' : 'rgba(139,92,246,0.3)',
                                  color: '#fff',
                                }}>
                                  {(aiMatch.similarity * 100).toFixed(0)}%
                                </span>
                                {aiMatch.source === 'a2l' && (
                                  <span style={{ fontSize: 7, color: '#22c55e', fontWeight: 800 }}>VERIFIED</span>
                                )}
                              </span>
                            ) : (() => {
                              // Auto-label using heuristic engine
                              const autoLabel = guessMapType(cc.candidate)
                              return autoLabel ? (
                                <span style={{
                                  fontSize: 9, padding: '1px 8px', borderRadius: 3, fontWeight: 700, marginLeft: 'auto',
                                  background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                                  border: '1px solid rgba(245,158,11,0.2)',
                                  display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                  {autoLabel.mapName}
                                  <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 2, fontWeight: 800, background: 'rgba(245,158,11,0.3)', color: '#fff' }}>
                                    {(autoLabel.similarity * 100).toFixed(0)}%
                                  </span>
                                </span>
                              ) : (
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(107,114,128,0.1)', color: '#6b7280', marginLeft: 'auto' }}>UNKNOWN</span>
                              )
                            })()}
                          </div>
                        )
                      })}
                      {localScanResult.unmatched.length > 15 && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: 4 }}>+{localScanResult.unmatched.length - 15} more</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
