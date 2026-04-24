import { useState, useCallback, useRef, useEffect } from 'react'
import { ECU_DEFINITIONS, ADDONS } from '../lib/ecuDefinitions'
import type { EcuDef, MapDef, MapCategory, DataType } from '../lib/ecuDefinitions'
import { detectEcu, detectEcuFromFilename, detectEcuFromCatalog, extractAllMaps, extractMap, validateA2LMapsInBinary, syntheticMapDefFromA2L, syntheticMapDefFromSignature, extractPartNumberFromBinary } from '../lib/binaryParser'
import type { SignatureMatch } from '../lib/binaryParser'
import type { DetectedEcu, DetectedCatalogEcu, ExtractedMap, A2LValidationResult } from '../lib/binaryParser'
import { buildRemap, buildFilename } from '../lib/remapEngine'
import type { Stage, AddonId, RemapResult } from '../lib/remapEngine'
import { buildSmartStage } from '../lib/smartStageEngine'
import type { SmartStageResult } from '../lib/smartStageEngine'
import { verifyChecksum, correctChecksum, correctBlockChecksums, checksumSupportInfo, type ChecksumSupport } from '../lib/checksumEngine'
import type { BlockCorrectionResult } from '../lib/checksumEngine'
import { parseA2L, extractMapsFromA2L, detectBaseAddress, guessEcuFamily, ECU_BASE_ADDRESSES } from '../lib/a2lParser'
import type { A2LParseResult, A2LMapDef } from '../lib/a2lParser'
import { suppressDTCs, getActiveDTCGroups } from '../lib/dtcRemoval'
import type { DTCPatternResult } from '../lib/dtcRemoval'
import { scanBinaryForMaps, classifyCandidates, matchUnknownsByDNA } from '../lib/mapClassifier'
import type { ClassificationResult } from '../lib/mapClassifier'
import { applyMemoryToCandidates } from '../lib/memoryLookup'
import type { MemoryMatch } from '../lib/memoryLookup'

import { supabase } from '../lib/supabase'
import type { EcuFileState } from '../App'

interface DefinitionEntry {
  id: string
  filename: string
  file_type: 'a2l'                 // A2L-only after cleanup — DRT and KP libraries no longer consumed.
  driver_name: string | null
  ecu_family: string | null
  make: string | null
  model: string | null
  storage_path: string
  map_count: number
  curve_count: number
}

// ─── Multi-candidate base address search ────────────────────────────────────
// When the binary is available, try multiple base address candidates and return
// the one that produces the most 'valid' A2L map validations.
// Handles: ME7/ME9 A2Ls mis-guessed as MED17, tool-format header offsets,
// non-standard ECU variants, and any A2L whose family isn't in the lookup table.
function pickBestBaseAddress(buffer: ArrayBuffer, result: A2LParseResult): number {
  const preferred = detectBaseAddress(result)

  // If the ECU family is definitively identified, trust the lookup table and skip
  // the scoring search entirely.  The multi-candidate search is only a fallback for
  // A2Ls whose family cannot be recognised (unknown tool, unusual naming, etc.).
  // Without this short-circuit, the scoring can accidentally prefer derivedBase
  // (minAddr & 0xFFFF0000, e.g. 0x1C0000 for EDC16) over the correct 0x000000.
  const family = guessEcuFamily(result)
  if (family && ECU_BASE_ADDRESSES[family] !== undefined) return preferred

  const addrs = result.characteristics
    .filter(c => c.type !== 'VALUE')
    .map(c => c.address)
    .filter(a => a > 0)
  const minAddr = addrs.length > 0 ? Math.min(...addrs) : preferred
  const derivedBase = minAddr & 0xFFFF0000

  const candidates = [...new Set([preferred, 0x80000000, 0x00000000, 0x80800000, 0xC0000000, 0xFFE00000, 0x00200000, derivedBase])]

  let bestBase = preferred
  let bestScore = -1
  for (const base of candidates) {
    const maps = extractMapsFromA2L(result, base)
    if (maps.length === 0) continue
    const validation = validateA2LMapsInBinary(buffer, maps)
    const validCount = validation.filter(v => v.status === 'valid').length
    const score = validCount / Math.max(validation.length, 1)
    if (score > bestScore) { bestScore = score; bestBase = base }
  }
  return bestBase
}

// ─── Calibration proximity helper ─────────────────────────────────────────────
// Given a filename like "7L0907401F_0040_387060_P397.a2l" and a target number
// like 387808, extracts all 5-9 digit numbers from the filename and returns
// the closest one with its delta so the tuner can spot the best match at a glance.
function closestCalNum(filename: string, targetStr: string): { num: number; delta: number } | null {
  const target = parseInt(targetStr, 10)
  if (isNaN(target) || target === 0) return null
  const matches = [...filename.matchAll(/(?<!\d)(\d{5,9})(?!\d)/g)].map(m => parseInt(m[1], 10))
  if (matches.length === 0) return null
  let best = matches[0]
  let bestDelta = Math.abs(best - target)
  for (const n of matches) {
    const d = Math.abs(n - target)
    if (d < bestDelta) { best = n; bestDelta = d }
  }
  return { num: best, delta: bestDelta }
}

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
    [0.60, '#90ce00'],
    [0.72, '#e8c000'],
    [0.84, '#f07000'],
    [1.00, '#e02020'],
  ]
  const p = Math.max(0, Math.min(1, pct))
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (p <= t1) {
      return lerpColor(c0, c1, (p - t0) / (t1 - t0))
    }
  }
  return stops[stops.length - 1][1]
}

// ─── Mini heatmap grid ────────────────────────────────────────────────────────
function MiniHeatmap({ data, label, mapCategory, allowUniform }: { data: number[][], label: string, mapCategory?: string, allowUniform?: boolean }) {
  const PREVIEW_ROWS = 5
  const PREVIEW_COLS = 4
  // Show mid-map region (60% down rows, 30% across cols) — avoids the low-load
  // corner (row 0 = idle/fuel-cut) which shows near-zero values and is misleading.
  const rowStart = Math.max(0, Math.floor(data.length * 0.6) - Math.floor(PREVIEW_ROWS / 2))
  const colStart = Math.max(0, Math.floor((data[0]?.length ?? 0) * 0.3))
  const rows = data.slice(rowStart, rowStart + PREVIEW_ROWS)
  const allVals = rows.flatMap(r => r.slice(colStart, colStart + PREVIEW_COLS))
  const allMapVals = data.flatMap(r => r)
  const mapMin = Math.min(...allMapVals)
  const mapMax = Math.max(...allMapVals)
  const mapRange = mapMax - mapMin
  // Positive-expected categories: boost, fuel, torque, limiter, emission values should be > 0.
  const positiveExpected = ['boost', 'fuel', 'torque', 'limiter', 'emission', 'smoke'].includes(mapCategory ?? '')
  // sampleAllNegative: sample cells all negative AND tightly clustered.
  // Catches wrong-address maps where a few edge bytes > 0 break the mapMax < 0 test
  // but the operating region is uniformly-negative (raw = 0, physicalOffset < 0).
  const sampleRange = allVals.length > 0 ? Math.max(...allVals) - Math.min(...allVals) : 0
  const sampleAllNegative = positiveExpected && allVals.length > 0 && allVals.every(v => v < 0) && sampleRange < 0.5
  // isUniform: flags wrong-address reads. For positive-expected maps, ANY flat signal is
  // suspicious — real boost/torque/fuel maps always vary across RPM×load axes. The old
  // condition (mapRange < 0.5 && mapMax < 0) missed two common failure modes:
  //   • All-zero bytes  → mapMax = 0 (not < 0): LDRXNZK pointing at zeroed region
  //   • All-0xFF bytes  → mapMax = 1536 (= 65535 × 0.023438): KFMIRL at erased flash
  // Dropping the mapMax < 0 guard catches both — if mapRange < 0.5 on a boost/torque map,
  // it's wrong regardless of whether the flat value is negative, zero, or some large constant.
  const isUniform = !allowUniform && allMapVals.length > 4 && (
    positiveExpected
      ? mapRange < 0.5 || sampleAllNegative  // any flat read (zero, max, or negative) = wrong address
      : mapRange < 0.001                      // ignition/misc: strict check only
  )
  const mn = Math.min(...allVals)
  const mx = Math.max(...allVals)
  const range = mx - mn || 1

  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      {isUniform ? (
        <div style={{ fontSize: 9, color: '#f59e0b', padding: '4px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          ⚠ Uniform — definition may not match this binary. Try an A2L.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PREVIEW_COLS}, 1fr)`, gap: 2 }}>
          {rows.map((row, r) =>
            row.slice(colStart, colStart + PREVIEW_COLS).map((val, c) => (
              <div
                key={`${r}-${c}`}
                title={val.toFixed(3)}
                style={{
                  width: 22, height: 14, borderRadius: 2,
                  background: heatColor((val - mn) / range),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, color: 'rgba(255,255,255,0.6)', fontWeight: 700,
                }}
              >
                {/* Integer values (raw uint16 from sig-scan, or physical values that happen
                    to land whole like +0% boost where factor*raw is integer) render without
                    a fractional part — avoids "0.0" / "64.0" noise on raw-unit maps. */}
                {Number.isInteger(val) ? val : (val > 99 ? Math.round(val) : val.toFixed(1))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Category badge ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  boost:    '#00aec8',
  fuel:     '#3b82f6',
  torque:   '#f59e0b',
  ignition: '#a855f7',
  limiter:  '#ef4444',
  emission: '#6b7280',
  smoke:    '#f97316',
  misc:     '#64748b',
}

function CatBadge({ cat }: { cat: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
      background: `${CAT_COLORS[cat] ?? '#555'}22`,
      color: CAT_COLORS[cat] ?? '#aaa',
      border: `1px solid ${CAT_COLORS[cat] ?? '#555'}44`,
      textTransform: 'uppercase', letterSpacing: '0.6px',
    }}>
      {cat}
    </span>
  )
}

// v3.14 Phase B.6 — Build a rich, self-contained prompt for the AI copilot
// describing the currently-open map in the Zone Editor. Produces the exact
// user-message text that the chat sidebar will run on open.
function buildZoneAIPrompt(args: {
  mapName: string
  mapCategory: string
  unit: string
  factor: number
  offsetVal: number
  tuningMode: 'multiplier' | 'addend'
  rows: number
  cols: number
  physData: number[][]
  edits: Record<string, number>
  stageMul: number
  selection: { r1: number; r2: number; c1: number; c2: number } | null
  axisXLabel?: string
  axisYLabel?: string
  axisXVals?: number[]
  axisYVals?: number[]
}): string {
  // Compute phys-value min/max from the original data
  let pMin = Infinity, pMax = -Infinity, sum = 0, count = 0
  for (const row of args.physData) for (const v of row) {
    if (!isFinite(v)) continue
    if (v < pMin) pMin = v
    if (v > pMax) pMax = v
    sum += v; count++
  }
  const pMean = count > 0 ? sum / count : 0
  const editCount = Object.keys(args.edits).length
  const selLabel = args.selection
    ? `Selection: rows ${args.selection.r1}-${args.selection.r2}, cols ${args.selection.c1}-${args.selection.c2}`
    : 'No selection'

  const lines: string[] = []
  lines.push(`I'm editing a map in the Zone Editor. Advise me — what does this map do, which cells matter most, and what's risky to change?`)
  lines.push('')
  lines.push('## Map details')
  lines.push(`- Name: ${args.mapName}`)
  lines.push(`- Category: ${args.mapCategory}`)
  lines.push(`- Shape: ${args.rows} rows × ${args.cols} cols`)
  lines.push(`- Unit: ${args.unit || '(raw)'}`)
  lines.push(`- Tuning mode: ${args.tuningMode}`)
  if (args.axisXLabel || args.axisYLabel) {
    lines.push(`- Axes: Y=${args.axisYLabel ?? '?'}, X=${args.axisXLabel ?? '?'}`)
  }
  if (isFinite(pMin) && isFinite(pMax)) {
    lines.push(`- Physical value range: ${pMin.toFixed(2)} to ${pMax.toFixed(2)} ${args.unit || ''} (mean ${pMean.toFixed(2)})`)
  }
  lines.push(`- Stage default: ${args.tuningMode === 'multiplier' ? `×${args.stageMul.toFixed(3)}` : `+${args.stageMul} raw`}`)
  lines.push(`- User edits: ${editCount} cell${editCount === 1 ? '' : 's'} overridden`)
  lines.push(`- ${selLabel}`)
  return lines.join('\n')
}

// ─── Zone Editor: ECM Titanium-style drag-select + Pg+/Pg- staircase ─────────
// Each cell stores an absolute multiplier override. Drag to select a rectangle,
// then Pg+ / Pg- applies the step% to every selected cell cumulatively.
// Cells without an override use the stage default. No interpolation — pure manual.
export function computeCellGrid(
  edits: Record<string, number>,
  rows: number,
  cols: number,
  defaultVal: number,
): number[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => edits[`${r},${c}`] ?? defaultVal)
  )
}

interface ZoneEditorProps {
  rows: number
  cols: number
  // Per-cell edit values. In multiplier mode: absolute multipliers (1.05=+5%).
  // In addend mode: raw addend deltas (46 = +1° on SOI where factor=0.021973).
  edits: Record<string, number>
  // Uniform stage default. In multiplier mode: 1.12 = +12%. In addend mode: raw addend (0 = stock).
  stageMul: number
  physData: number[][]                    // original physical values for display
  factor: number
  offsetVal: number
  unit: string
  axisXLabel?: string                     // e.g. "Load" or "TANS_W"
  axisYLabel?: string                     // e.g. "RPM" or "NMOT_W"
  axisXVals?: number[]                    // col header values (load breakpoints)
  axisYVals?: number[]                    // row header values (RPM breakpoints)
  onApply: (newEdits: Record<string, number>) => void
  onClearAll: () => void
  // Tuning mode: 'multiplier' (default, % adjustments) or 'addend' (absolute delta in physical unit, e.g. degrees for SOI)
  tuningMode?: 'multiplier' | 'addend'
  // Default step size in the native unit (% for multiplier, physical unit for addend)
  defaultStep?: number
  // v3.14 Phase B.6 — map metadata for AI copilot context
  mapName?: string
  mapCategory?: string
  // v3.14 Phase B.6 — copilot trigger. When called with a prompt string, App opens
  // the chat sidebar and runs that prompt as a pending action.
  onAskAI?: (prompt: string) => void
}

function ZoneEditor({ rows, cols, edits, stageMul, physData, factor, offsetVal, unit, axisXLabel, axisYLabel, axisXVals, axisYVals, onApply, onClearAll, tuningMode = 'multiplier', defaultStep, mapName, mapCategory, onAskAI }: ZoneEditorProps) {
  const isAddendMode = tuningMode === 'addend'
  // ─── VIEW TRANSPOSE: ECM Titanium / WinOLS convention ─────────────────────
  // Binary Kf_ stores data as rows=Load/IQ (Y), cols=RPM (X). But professional
  // tuning convention displays RPM DOWN the left column and Load ACROSS the top.
  // So we transpose the display only — the internal edit keys and physData access
  // stay in (dataRow=Load, dataCol=RPM) format so writeMap stays correct.
  //
  //   VIEW coords: (viewR = RPM index, viewC = Load index)    ← what user sees
  //   DATA coords: (dataR = Load index, dataC = RPM index)    ← how binary is stored
  //
  //   Mapping:  dataR = viewC,  dataC = viewR
  //   Edit key format stays "${dataR},${dataC}" so nothing downstream needs to change.
  const viewRows = cols   // RPM count — displayed going DOWN the left
  const viewCols = rows   // Load count — displayed going ACROSS the top

  const [selStart, setSelStart] = useState<{ r: number; c: number } | null>(null)
  const [selEnd, setSelEnd]     = useState<{ r: number; c: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // Pg+/Pg- step. In multiplier mode: percent (0.5 = +0.5%). In addend mode: physical delta (0.5 = +0.5° for SOI).
  const [step, setStep] = useState(defaultStep ?? 0.5)

  const editCount = Object.keys(edits).length
  const hasAxes = (axisXVals && axisXVals.length > 0) || (axisYVals && axisYVals.length > 0)

  // Selection is stored in VIEW coords (what user sees)
  const sel = selStart && selEnd ? {
    r1: Math.min(selStart.r, selEnd.r), r2: Math.max(selStart.r, selEnd.r),
    c1: Math.min(selStart.c, selEnd.c), c2: Math.max(selStart.c, selEnd.c),
  } : null

  const isSelected = (viewR: number, viewC: number) =>
    sel !== null && viewR >= sel.r1 && viewR <= sel.r2 && viewC >= sel.c1 && viewC <= sel.c2

  // Edits use DATA coords (so writeMap gets the right cells)
  // In multiplier mode: returns absolute multiplier (default = stageMul, e.g. 1.05 for +5%).
  // In addend mode:     returns raw addend delta (default = stageMul which is 0 for stock).
  const getMul = (viewR: number, viewC: number) => {
    const dataR = viewC, dataC = viewR
    return edits[`${dataR},${dataC}`] ?? stageMul
  }
  const isEdited = (viewR: number, viewC: number) => {
    const dataR = viewC, dataC = viewR
    return edits[`${dataR},${dataC}`] !== undefined
  }

  // Modified physical value for display — fetch from transposed data
  const getDisplayVal = (viewR: number, viewC: number) => {
    const dataR = viewC, dataC = viewR
    const orig = physData[dataR]?.[dataC] ?? 0
    const val = getMul(viewR, viewC)
    const raw = factor !== 0 ? (orig - offsetVal) / factor : 0
    if (isAddendMode) {
      // val is raw addend — add to raw then convert to physical
      const newRaw = raw + val
      return newRaw * factor + offsetVal
    } else {
      // val is multiplier — multiply raw then convert to physical
      return raw * val * factor + offsetVal
    }
  }

  // Delta in display/native unit (% for multiplier, physical for addend)
  const getDeltaForDisplay = (viewR: number, viewC: number): number => {
    const val = getMul(viewR, viewC)
    if (isAddendMode) {
      // raw addend → physical delta (e.g. 46 raw * 0.021973 = +1.0°)
      return val * factor
    } else {
      return (val - 1) * 100
    }
  }

  const applyStep = (sign: 1 | -1) => {
    if (!sel) return
    const next = { ...edits }
    for (let viewR = sel.r1; viewR <= sel.r2; viewR++) {
      for (let viewC = sel.c1; viewC <= sel.c2; viewC++) {
        const dataR = viewC, dataC = viewR
        const key = `${dataR},${dataC}`
        const cur = next[key] ?? stageMul
        if (isAddendMode) {
          // step is in physical units (e.g. 0.5°). Convert to raw via factor.
          // factor 0.021973 °/unit means 1° = 1/0.021973 = 45.5 raw units per degree.
          const stepRaw = factor !== 0 ? step / factor : step
          const newVal = cur + sign * stepRaw
          // Clamp: allow ±20° for SOI (generous range; stage clampMax handles final safety)
          const maxRaw = factor !== 0 ? 20 / factor : 1000
          next[key] = Math.max(-maxRaw, Math.min(maxRaw, newVal))
        } else {
          next[key] = Math.max(0.01, Math.min(5.0, cur + sign * step / 100))
        }
      }
    }
    onApply(next)
  }

  const selectAll = () => { setSelStart({ r: 0, c: 0 }); setSelEnd({ r: viewRows - 1, c: viewCols - 1 }) }

  // Cell sizing — narrower when many display cols (which is Load count = rows internally)
  const cellW = viewCols > 14 ? 36 : viewCols > 10 ? 42 : viewCols > 7 ? 50 : 58
  const cellH = 28
  const rowHdrW = 52   // slightly wider — holds RPM labels like "10.8k"
  const colHdrH = 20

  const selSizeLabel = sel
    ? `${sel.r2 - sel.r1 + 1}×${sel.c2 - sel.c1 + 1} selected`
    : 'Drag to select'

  // Format axis value for header display
  const fmtAxis = (v: number) => v >= 10000 ? `${Math.round(v / 100) / 10}k` : v >= 1000 ? `${Math.round(v / 10) / 100}k` : v.toFixed(v % 1 === 0 ? 0 : 1)

  // Display axis values:
  //   Row headers (left, going down) show RPM = axisXVals (length = cols = viewRows)
  //   Col headers (top, going across) show Load = axisYVals (length = rows = viewCols)
  const rowAxisVals = axisXVals && axisXVals.length === cols ? axisXVals
    : axisXVals && axisXVals.length > 0 ? axisXVals
    : null
  const colAxisVals = axisYVals && axisYVals.length === rows ? axisYVals
    : axisYVals && axisYVals.length > 0 ? axisYVals
    : null
  // Display axis LABELS (also swapped — rows now show X-axis label, cols now show Y-axis label)
  const rowAxisLabel = axisXLabel || 'RPM'
  const colAxisLabel = axisYLabel || 'Load'

  return (
    <div
      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, marginTop: 10, overflowX: 'auto' }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
    >
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#b8f02a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zone Editor</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>
          {viewRows}×{viewCols}  (RPM × Load){isAddendMode ? ` · ${unit || '°'} mode` : ''}
        </span>

        {/* Step input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 8px' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Step</span>
          <input
            type="number" min={0.1} max={50} step={0.1} value={step}
            onChange={e => setStep(Math.max(0.1, Math.min(50, parseFloat(e.target.value) || (isAddendMode ? 0.5 : 0.5))))}
            style={{ width: 38, background: 'none', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center', outline: 'none' }}
          />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            {isAddendMode ? (unit || '°') : '%'}
          </span>
        </div>

        {/* Pg+ / Pg- buttons */}
        <button
          onClick={() => applyStep(1)}
          disabled={!sel}
          title={`Apply +${step}${isAddendMode ? (unit || '°') : '%'} to selected cells (ECM Titanium Pg+)`}
          style={{ fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 6, cursor: sel ? 'pointer' : 'not-allowed', border: '1px solid rgba(184,240,42,0.4)', background: sel ? 'rgba(184,240,42,0.12)' : 'rgba(255,255,255,0.03)', color: sel ? '#b8f02a' : 'rgba(255,255,255,0.2)', opacity: sel ? 1 : 0.5 }}
        >
          Pg+ +{step}{isAddendMode ? (unit || '°') : '%'}
        </button>
        <button
          onClick={() => applyStep(-1)}
          disabled={!sel}
          title={`Apply -${step}${isAddendMode ? (unit || '°') : '%'} to selected cells (ECM Titanium Pg-)`}
          style={{ fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 6, cursor: sel ? 'pointer' : 'not-allowed', border: '1px solid rgba(251,146,60,0.4)', background: sel ? 'rgba(251,146,60,0.1)' : 'rgba(255,255,255,0.03)', color: sel ? '#fb923c' : 'rgba(255,255,255,0.2)', opacity: sel ? 1 : 0.5 }}
        >
          Pg- -{step}{isAddendMode ? (unit || '°') : '%'}
        </button>

        <button onClick={selectAll} style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}>
          Select All
        </button>

        {/* Selection info */}
        <span style={{ fontSize: 10, color: sel ? '#22d3ee' : 'rgba(255,255,255,0.25)', fontWeight: sel ? 700 : 400 }}>
          {selSizeLabel}
        </span>

        {editCount > 0 && (
          <>
            <span style={{ fontSize: 10, color: 'rgba(184,240,42,0.7)', fontWeight: 700 }}>
              {editCount} cells modified
            </span>
            <button
              onClick={onClearAll}
              style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(251,146,60,0.4)', background: 'rgba(251,146,60,0.08)', color: '#fb923c', cursor: 'pointer' }}
            >
              ✕ Reset All
            </button>
          </>
        )}
        {/* v3.14 Phase B.6 — Ask AI copilot about this map */}
        {onAskAI && (
          <button
            onClick={() => onAskAI(buildZoneAIPrompt({
              mapName: mapName ?? '(unknown map)',
              mapCategory: mapCategory ?? 'unknown',
              unit, factor, offsetVal,
              tuningMode: isAddendMode ? 'addend' : 'multiplier',
              rows, cols,
              physData,
              edits,
              stageMul,
              selection: sel,
              axisXLabel, axisYLabel, axisXVals, axisYVals,
            }))}
            style={{
              marginLeft: editCount > 0 ? 0 : 'auto',
              fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              border: '1px solid rgba(124,58,237,0.4)',
              background: 'rgba(124,58,237,0.1)',
              color: '#c4b5fd', cursor: 'pointer',
            }}
            title="Ask the AI copilot about this map"
          >
            💬 Ask AI
          </button>
        )}
      </div>

      {/* ── Grid with axis headers — ECM Titanium style (RPM left, Load top) ── */}
      <div style={{ display: 'inline-block' }}>

        {/* ── Top: corner + Load header row ── */}
        <div style={{ display: 'flex', gap: 1, marginBottom: 1 }}>
          {/* Corner cell — RPM label (left axis, rows) / Load label (top axis, cols) */}
          <div style={{
            width: rowHdrW, height: colHdrH, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 6, fontWeight: 800, color: 'rgba(255,255,255,0.7)',
            background: 'linear-gradient(135deg,#3d0d0d,#5a1515)',
            border: '1px solid rgba(180,40,40,0.5)',
            borderRadius: 2, lineHeight: 1.1, textAlign: 'center',
          }}>
            {rowAxisLabel}<br/>{colAxisLabel}
          </div>
          {/* Column headers — Load axis (across the top) */}
          {Array.from({ length: viewCols }, (_, viewC) => (
            <div key={viewC} style={{
              width: cellW, height: colHdrH,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 7, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(180deg,#4a1010,#3a0c0c)',
              border: '1px solid rgba(180,40,40,0.45)',
              borderRadius: 2, overflow: 'hidden', flexShrink: 0,
            }}>
              {colAxisVals ? fmtAxis(colAxisVals[viewC]) : viewC + 1}
            </div>
          ))}
        </div>

        {/* ── Data rows with RPM headers on left (going down) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Array.from({ length: viewRows }, (_, viewR) => (
            <div key={viewR} style={{ display: 'flex', gap: 1 }}>
              {/* Row header — RPM (vertical axis, top→bottom = low→high RPM) */}
              <div style={{
                width: rowHdrW, height: cellH, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 700, color: '#fff',
                background: 'linear-gradient(90deg,#3a0c0c,#4a1010)',
                border: '1px solid rgba(180,40,40,0.45)',
                borderRadius: 2, overflow: 'hidden',
              }}>
                {rowAxisVals ? fmtAxis(rowAxisVals[viewR]) : viewR + 1}
              </div>

              {/* Data cells */}
              {Array.from({ length: viewCols }, (_, viewC) => {
                // Internal data coords: dataR = Load idx = viewC, dataC = RPM idx = viewR
                const dataR = viewC, dataC = viewR
                const key = `${dataR},${dataC}`
                const edited = isEdited(viewR, viewC)
                const selected = isSelected(viewR, viewC)
                const dispVal = getDisplayVal(viewR, viewC)

                // Delta display (in native unit): % for multiplier mode, degrees/units for addend mode
                const deltaShown = getDeltaForDisplay(viewR, viewC)
                // Stage default as a display delta too
                const stageDeltaShown = isAddendMode
                  ? stageMul * factor    // stageMul is raw addend → physical delta
                  : (stageMul - 1) * 100
                const extraDelta = deltaShown - stageDeltaShown
                // Intensity scale: for multiplier mode 6% beyond stage = full, for addend ~2° beyond = full
                const intensityScale = isAddendMode ? 2.0 : 6.0
                const rawIntensity = edited ? Math.max(0, Math.min(1, Math.abs(extraDelta) / intensityScale)) : 0
                const intensity = edited ? Math.max(0.15, rawIntensity) : 0
                const isAbove = extraDelta >= 0

                // ── Colours ──────────────────────────────────────────────────
                // SELECTED  → bright cyan (clear drag highlight)
                // INCREASED → dark forest green → vivid lime (ECM Titanium style)
                //   intensity 0.15 (first press):  rgba(20,  65, 20, 0.90)  — dark green
                //   intensity 1.00 (many presses): rgba(80, 210, 40, 0.97)  — bright lime
                // REDUCED   → dark amber → bright orange
                // DEFAULT   → near-black cell
                let bg: string
                let borderCol: string
                let textCol: string

                if (selected) {
                  bg = 'rgba(6,182,212,0.55)'
                  borderCol = 'rgba(6,182,212,0.9)'
                  textCol = '#fff'
                } else if (edited && isAbove) {
                  const r0 = Math.round(20 + intensity * 60)   // 20 → 80
                  const g0 = Math.round(65 + intensity * 145)  // 65 → 210
                  const b0 = Math.round(20 + intensity * 20)   // 20 → 40
                  const a0 = 0.80 + intensity * 0.17           // 0.80 → 0.97
                  bg = `rgba(${r0},${g0},${b0},${a0})`
                  borderCol = `rgba(${r0 + 20},${g0 + 20},${b0},0.7)`
                  // Text: dark on bright green, white on dark green
                  textCol = intensity > 0.6 ? '#0a1a00' : '#c8ffb0'
                } else if (edited && !isAbove) {
                  const r0 = Math.round(100 + intensity * 140)  // 100 → 240
                  const g0 = Math.round(45 + intensity * 60)    // 45 → 105
                  const b0 = 8
                  const a0 = 0.80 + intensity * 0.17
                  bg = `rgba(${r0},${g0},${b0},${a0})`
                  borderCol = `rgba(${r0},${g0 + 10},${b0},0.7)`
                  textCol = intensity > 0.6 ? '#1a0800' : '#ffd5a0'
                } else {
                  bg = 'rgba(255,255,255,0.04)'
                  borderCol = 'rgba(255,255,255,0.07)'
                  textCol = 'rgba(255,255,255,0.38)'
                }

                // Tooltip label: multiplier mode shows "+X%", addend mode shows "+X.X°" or "+X unit"
                const deltaSign = deltaShown >= 0 ? '+' : ''
                const deltaSuffix = isAddendMode ? (unit || '°') : '%'
                const deltaLabel = `${deltaSign}${deltaShown.toFixed(1)}${deltaSuffix}`
                return (
                  <div
                    key={key}
                    title={`${rowAxisLabel}:${rowAxisVals ? fmtAxis(rowAxisVals[viewR]) : viewR + 1}  ${colAxisLabel}:${colAxisVals ? fmtAxis(colAxisVals[viewC]) : viewC + 1} — ${deltaLabel} → ${dispVal.toFixed(Math.abs(dispVal) > 10 ? 1 : 2)}${unit ? ' ' + unit : ''}`}
                    style={{
                      width: cellW, height: cellH,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: edited ? 700 : 400,
                      userSelect: 'none', cursor: 'crosshair',
                      border: `1px solid ${borderCol}`,
                      background: bg,
                      color: textCol,
                      borderRadius: 2,
                      transition: 'background 0.06s',
                    }}
                    onMouseDown={e => { e.preventDefault(); setSelStart({ r: viewR, c: viewC }); setSelEnd({ r: viewR, c: viewC }); setDragging(true) }}
                    onMouseEnter={() => { if (dragging) setSelEnd({ r: viewR, c: viewC }) }}
                    onMouseUp={() => { setDragging(false) }}
                  >
                    {dispVal.toFixed(dispVal > 100 ? 0 : dispVal > 10 ? 1 : 2)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
        <span><span style={{ color: 'rgba(6,182,212,0.9)' }}>■</span> Selected</span>
        <span><span style={{ color: 'rgba(30,90,30,0.9)' }}>■</span>→<span style={{ color: 'rgba(80,210,40,0.9)' }}>■</span> Increased (dark→bright)</span>
        <span><span style={{ color: 'rgba(120,60,8,0.9)' }}>■</span>→<span style={{ color: 'rgba(240,110,8,0.9)' }}>■</span> Reduced</span>
        <span><span style={{ color: 'rgba(255,255,255,0.2)' }}>■</span> Stage default</span>
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.12)' }}>
          Drag → Pg+ increase · Pg- reduce · Shrink for staircase
        </span>
      </div>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = ['Load File', 'ECU Detected', 'Configure', 'Preview', 'Export']

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 12,
              background: i < current ? 'var(--accent)' : i === current ? 'var(--accent)' : 'var(--bg-card)',
              color: i <= current ? '#000' : 'var(--text-muted)',
              border: i > current ? '1px solid var(--border)' : 'none',
              boxShadow: i === current ? '0 0 0 3px rgba(0,174,200,0.2)' : 'none',
              transition: 'all 0.2s ease',
            }}>
              {i < current ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : i + 1}
            </div>
            <div style={{ fontSize: 10, fontWeight: i === current ? 700 : 500, color: i === current ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: '0 6px', marginBottom: 18,
              background: i < current ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s ease',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
// v3.14 Phase B.3 — summary shape shared with the AI chat sidebar. Keep minimal
// and shippable (no binary data) so it's cheap to send on every change.
export interface RemapTuneSummary {
  stage: Stage
  tier: import('../lib/stageEngine').StageTier
  sourceDescription: string
  boostChangePct: number
  fuelChangePct: number
  torqueChangePct: number
  mapsModified: number
  perMap: { name: string; category: string; avgChangePct: number; unit?: string }[]
  validationWarnings: string[]
}

interface RemapBuilderProps {
  onEcuLoaded?: (state: EcuFileState) => void
  onTuneApplied?: (summary: RemapTuneSummary | null) => void
  onAskAI?: (action: 'explain' | 'warnings' | 'safety') => void          // opens chat + runs quick-prompt
  onAskAICustom?: (prompt: string) => void                                // opens chat + runs custom prompt (Zone Editor)
}
export default function RemapBuilder({ onEcuLoaded, onTuneApplied, onAskAI, onAskAICustom }: RemapBuilderProps) {
  const [step, setStep] = useState(0)

  // Step 0 state
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)
  const [hexPreview, setHexPreview] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadError, setLoadError] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  // Step 1 state
  const [detected, setDetected] = useState<DetectedEcu | null>(null)
  // Catalog-backed detection (WinOLS 698-ECU catalog). Populated for ANY binary
  // with a recognised variant name — independent of our 217 internal EcuDefs.
  // Shown as a secondary hint when `detected` is null or weak.
  const [catalogHit, setCatalogHit] = useState<DetectedCatalogEcu | null>(null)
  const [selectedEcuId, setSelectedEcuId] = useState('')

  // Step 2 state
  const [stage, setStage] = useState<Stage>(1)
  const [addons, setAddons] = useState<AddonId[]>([])

  // Step 3 state
  const [extractedMaps, setExtractedMaps] = useState<ExtractedMap[]>([])
  // Per-map custom multiplier overrides (keyed by mapDef.id, value = multiplier e.g. 1.15 for +15%)
  // When set, overrides the stage default in both the preview heatmap and the final build.
  const [customMultipliers, setCustomMultipliers] = useState<Record<string, number>>({})
  // NOTE: v3.5.17 added a "Stage Intensity" slider here. Removed in v3.5.25 — the Stage 1/2/3
  // selector on the Configure step (Step 2) was the intended UI for staging aggressiveness.
  // Duplicating it with a global slider on the Preview page was unnecessary clutter.
  // If Stage 1 values feel too aggressive for a specific ECU family, the fix is to tune
  // the stage1 multipliers in ecuDefinitions.ts for that family (as done for EDC17/EDC16/MED17/MG1).
  // Per-map zone anchors for ECM Titanium-style region editing.
  // cellAnchors[mapId]["r,c"] = multiplier — sparse anchor points; non-anchor cells are IDW-interpolated.
  // When a map has anchors, cellAnchors takes precedence over customMultipliers.
  const [cellAnchors, setCellAnchors] = useState<Record<string, Record<string, number>>>({})
  // Which map's Zone Editor panel is currently open (null = all closed)
  const [zoneEditorMapId, setZoneEditorMapId] = useState<string | null>(null)
  // Advanced A2L section — which categories are expanded, and whether the whole section is open
  const [advancedSectionOpen, setAdvancedSectionOpen] = useState(false)
  const [advancedCatOpen, setAdvancedCatOpen] = useState<Record<string, boolean>>({})

  // Step 4 state
  const [remapResult, setRemapResult] = useState<RemapResult | null>(null)
  const [blockResult, setBlockResult] = useState<BlockCorrectionResult | null>(null)
  // v3.15.2 — surfaces checksum support info for the selected ECU so users on
  // 'none' / 'unknown' algos see a clear "do not flash directly" warning instead
  // of silently getting an uncorrected file.
  const [checksumSupport, setChecksumSupport] = useState<ChecksumSupport | null>(null)

  // A2L state
  const [a2lResult, setA2lResult] = useState<A2LParseResult | null>(null)
  const [a2lMaps, setA2lMaps] = useState<A2LMapDef[]>([])
  const [a2lFileName, setA2lFileName] = useState<string>('')

  // DTC removal state
  const [dtcResults, setDtcResults] = useState<DTCPatternResult[]>([])
  const [dtcSuppressedCount, setDtcSuppressedCount] = useState(0)

  // Binary scanner state (new classifier-based scanner)
  const [scanResult, setScanResult] = useState<ClassificationResult | null>(null)
  // Memory-identified candidates (matched against the local SQLite fingerprint
  // DB at %APPDATA%/DCTuning/memory.db). These are 100%-confidence matches —
  // user has previously confirmed "this exact Kf_ signature = this map".
  const [memoryMatches, setMemoryMatches] = useState<MemoryMatch[]>([])
  // UI state for the "Confirm as…" dialog that writes an entry to memory.
  const [showScanner, setShowScanner] = useState(false)
  const [scannerBusy, setScannerBusy] = useState(false)
  const [scannerDebug, setScannerDebug] = useState('')
  // Scanner state removed — UNKNOWN candidates were noise

  // VAG DAMOS-name signature scanner — scans the loaded binary against the
  // per-family signature catalog built from 1,126 ORI+A2L pairs (152,119 sigs).
  // Unlike the Kf_ scanner which only finds offsets, this finds REAL DAMOS names
  // like AccPed_trqEng0_MAP, InjCrv_phiMI1APSCor1EOM1_MAP with dimensions + descriptions.
  const [sigScanResult, setSigScanResult] = useState<{
    detectedFamily: string
    familyScores: Record<string, number>
    totalMaps: number
    byType: { MAP: number; CURVE: number; VALUE: number; VAL_BLK: number }
    matches: Array<{
      name: string; family: string; offset: number; rows: number; cols: number;
      type: 'MAP' | 'CURVE' | 'VALUE' | 'VAL_BLK'; desc: string; portable: boolean;
      // v6 verified scaling from A2L COMPU_METHOD
      factor?: number; offsetVal?: number; unit?: string; scalingVerified?: boolean;
      // v7 verified dtype + axis data offset within record (for Smart Stage)
      dtype?: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32';
      dataOffset?: number;
    }>
  } | null>(null)
  const [sigScanBusy, setSigScanBusy] = useState(false)
  const [sigScanError, setSigScanError] = useState('')
  const [showSigMaps, setShowSigMaps] = useState(false)
  const [sigMapFilter, setSigMapFilter] = useState<'MAP' | 'CURVE' | 'ALL'>('MAP')
  const [sigMapSearch, setSigMapSearch] = useState('')
  const [sigExpandedOffset, setSigExpandedOffset] = useState<number | null>(null)
  // Offsets of sig-scan matches that have been adopted into the Stage editor.
  // Keeps the button state consistent — once you've opened a map in Step 3
  // we show "✓ Added" instead of "Open in Stage Editor" and disable re-adding.
  const [adoptedSigOffsets, setAdoptedSigOffsets] = useState<Set<number>>(new Set())

  // Smart Stage — v3.11.14. Takes all scanner-identified maps and auto-applies
  // stage multipliers with physical-unit safety clamps. "Verified-only" gates to
  // sigs whose scaling was cross-confirmed by ≥2 training pairs (safer default).
  const [smartStageVerifiedOnly, setSmartStageVerifiedOnly] = useState(true)
  const [smartStageBusy, setSmartStageBusy] = useState(false)
  const [smartStageSummary, setSmartStageSummary] = useState<{ applied: number; total: number; clamped: number; skipped: number; reverted: number } | null>(null)

  // v3.12.0 Recipe Library — tuning by example.
  // When an ORI is loaded, the app computes its SHA-256 hash + extracts part/SW
  // number. Matches against the recipe manifest (list of extracted tuner Stage1/2/3
  // deltas). If a match is found, one-click "Apply Recipe" reproduces the proven
  // tune bit-exactly. No signatures, no safety nets — the recipe IS the tune.
  const [recipeMatches, setRecipeMatches] = useState<import('../lib/recipeEngine').RecipeMatch[] | null>(null)
  const [recipeBusy, setRecipeBusy] = useState(false)
  const [recipeApplyingPath, setRecipeApplyingPath] = useState<string | null>(null)

  // v3.13.0 — unified Stage Engine state. Single path for Apply Stage 1/2/3:
  // Tier 1 recipe (bit-exact) → Tier 2 learned multipliers → Tier 3 category default.
  const [unifiedBusy, setUnifiedBusy] = useState<Stage | null>(null)
  const [unifiedTier, setUnifiedTier] = useState<import('../lib/stageEngine').StageTier | null>(null)
  const [unifiedSource, setUnifiedSource] = useState<string>('')
  // v3.14 refuse-if-unknown: surfaces the safety-gate message when a tune is declined
  const [unifiedRefusal, setUnifiedRefusal] = useState<string | null>(null)
  // v3.14 shape validator: surfaces warnings when the tune output looks off
  const [unifiedValidation, setUnifiedValidation] = useState<import('../lib/stageEngine').ShapeValidation | null>(null)

  // Library search state
  const [libSearch, setLibSearch] = useState('')
  const [libResults, setLibResults] = useState<DefinitionEntry[]>([])
  const [libTotal, setLibTotal] = useState(0)
  const [libPage, setLibPage] = useState(0)
  const [libLoading, setLibLoading] = useState(false)
  const [libLoadError, setLibLoadError] = useState('')
  const [libLoadingId, setLibLoadingId] = useState<string | null>(null)
  const [libFallbackNote, setLibFallbackNote] = useState('')
  const [libOriginalNum, setLibOriginalNum] = useState('')  // the numeric query before fallback
  const LIB_PAGE_SIZE = 25

  // A2L validation state
  const [a2lValidation, setA2lValidation] = useState<A2LValidationResult[]>([])
  const [showSigExport, setShowSigExport] = useState(false)
  const [sigExportText, setSigExportText] = useState('')
  // Counts of how maps were located — split so the UI labels each source correctly.
  // Previously everything was lumped into a2lFallbackCount which falsely labelled scanner
  // matches as "via A2L/DRT ✓" even when the user had loaded no A2L or DRT file.
  const [a2lFallbackCount, setA2lFallbackCount] = useState(0)
  const [scannerFallbackCount, setScannerFallbackCount] = useState(0)

  const selectedEcu: EcuDef | undefined = ECU_DEFINITIONS.find(e => e.id === selectedEcuId)

  // v3.15.2 — recompute checksum support when the user-selected ECU changes so
  // the UI can warn before the user hits "Apply Stage" on an ECU we can't checksum.
  useEffect(() => {
    if (selectedEcu) setChecksumSupport(checksumSupportInfo(selectedEcu.checksumAlgo))
    else setChecksumSupport(null)
  }, [selectedEcuId])

  // ─── File loading ─────────────────────────────────────────────────────────
  const processFile = useCallback((buf: ArrayBuffer, name: string) => {
    setLoadError('')
    // ── File size sanity check ──────────────────────────────────────────────
    if (buf.byteLength < 4096) {
      setLoadError(`File too small (${buf.byteLength} bytes) — this doesn't look like a valid ECU binary.`)
      return
    }
    if (buf.byteLength > 8 * 1024 * 1024) {
      setLoadError(`File too large (${(buf.byteLength / 1048576).toFixed(1)} MB) — ECU binaries are typically under 4 MB. Check for corruption or wrong file.`)
      return
    }
    setFileName(name)
    setFileSize(buf.byteLength)
    setFileBuffer(buf)

    // Hex preview of first 32 bytes
    const bytes = new Uint8Array(buf.slice(0, 32))
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    setHexPreview(hex)

    // Auto-detect ECU — binary first, filename fallback for encrypted/proprietary files
    const det = detectEcu(buf) ?? detectEcuFromFilename(name, buf.byteLength)
    setDetected(det)
    if (det) {
      setSelectedEcuId(det.def.id)
    } else {
      setSelectedEcuId('')
    }
    // Catalog lookup runs independently — returns a variant hit even when we
    // don't have a full internal def for that ECU. Useful for "unknown" binaries.
    // Filename is passed because most diesel ECUs don't carry their family
    // name as a literal string in the flash — it's only in the filename.
    setCatalogHit(detectEcuFromCatalog(buf, name))
    // Clear ALL previously loaded A2L state when a new binary is loaded.
    // Without this, a second binary load retains the first binary's A2L addresses
    // and writes map data at completely wrong offsets into the new binary.
    setA2lResult(null); setA2lMaps([]); setA2lFileName('')
    setA2lValidation([])
    setA2lFallbackCount(0)
    setScannerFallbackCount(0)
    setShowSigExport(false)
    setSigExportText('')
    setLibSearch(''); setLibResults([]); setLibTotal(0); setLibPage(0)
    setLibFallbackNote(''); setLibOriginalNum(''); setLibLoadError('')
    setScanResult(null); setShowScanner(false)
    setMemoryMatches([])
    // Reset signature scan state for the new binary
    setSigScanResult(null); setSigScanBusy(false); setSigScanError(''); setShowSigMaps(false)
    setAdoptedSigOffsets(new Set()); setSigExpandedOffset(null); setSigMapSearch('')
    // v3.11.17: clear stale Smart Stage summary from previous file (prevented ME7.5 run
    // from showing its own stats because the strip was displaying the prior EDC16U run).
    setSmartStageSummary(null)

    // VAG DAMOS-name signature scan — runs in parallel with the Kf_ scanner.
    // Uses main-process IPC because the 152K-signature catalog lives on disk
    // in resources/vag-signatures/ and shouldn't be loaded into the renderer.
    setTimeout(async () => {
      setSigScanBusy(true)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (window as any).api
        // v3.11.22: browser-mode fallback. When running in the web version (app.dctuning.ie)
        // there's no Electron main process, so window.api.vagScanSignatures doesn't exist.
        // Use the pure-JS web scanner that fetches catalogs via HTTP instead.
        const scanFn: ((arr: number[]) => Promise<{ ok: boolean; result?: unknown; error?: string }>) | null =
          api?.vagScanSignatures
            ? api.vagScanSignatures
            : (async (arr: number[]) => {
                const { webScanSignatures } = await import('../lib/webVagScanner')
                return webScanSignatures(arr)
              })
        if (scanFn) {
          // Transfer the buffer as an Array to avoid IPC cloning a DetachedArrayBuffer —
          // main side converts back to Buffer. OK for ≤8MB binaries.
          const arr = Array.from(new Uint8Array(buf))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res: any = await scanFn(arr)
          if (res?.ok) {
            setSigScanResult(res.result)
            // v3.11.18 auto-select EcuDef from scanner family when header-based detection failed.
            // Fixes the PPD1 case: binary is identified as Siemens/Continental PPD1.2 via the
            // WinOLS catalog (50% confidence) and the scanner finds 805 PPD1 signatures, but
            // detectEcu() returns null because the EcuDef's identStrings don't match the specific
            // part number in the binary. Without auto-selection, the Smart Stage button is
            // disabled because selectedEcu is undefined.
            const fam = res.result.detectedFamily
            if (fam && fam !== 'UNKNOWN') {
              setSelectedEcuId(prev => {
                if (prev) return prev // don't override an existing choice
                // Find an EcuDef whose family string matches (case-insensitive)
                const famUpper = fam.toUpperCase()
                const match = ECU_DEFINITIONS.find(d => d.family.toUpperCase() === famUpper)
                return match?.id ?? ''
              })
            }
          } else {
            setSigScanError(res?.error || 'Signature scan failed')
          }
        }
      } catch (e) {
        setSigScanError(String(e))
      }
      setSigScanBusy(false)
    }, 100)

    // v3.12.0 — Recipe Library lookup. Runs in parallel with the scanner.
    // Compute SHA-256 hash of the ORI, extract part/SW number, look up matching
    // recipes from the 2,200+ recipe manifest. If matches found, user can one-click
    // apply the proven tuner delta — bit-exact reproduction, no inference.
    setRecipeMatches(null)
    setRecipeBusy(true)
    setTimeout(async () => {
      try {
        const { sha256Buffer, extractIdentsFromBinary, findMatchingRecipes, loadManifest } = await import('../lib/recipeEngine')
        const [hash, manifest] = await Promise.all([
          sha256Buffer(buf),
          loadManifest(),
        ])
        const idents = extractIdentsFromBinary(buf)
        const matches = findMatchingRecipes(manifest, hash, idents, buf.byteLength)
        setRecipeMatches(matches)
      } catch {
        setRecipeMatches([])
      } finally {
        setRecipeBusy(false)
      }
    }, 100)

    // Run binary map scanner in background
    const ecuForScan = det?.def ?? null
    setScannerDebug('Scanner starting... buf=' + buf.byteLength + ' ecu=' + (ecuForScan?.id ?? 'null'))
    setTimeout(async () => {
      setScannerBusy(true)
      try {
        const candidates = scanBinaryForMaps(buf, ecuForScan)
        setScannerDebug('Found ' + candidates.length + ' candidates')
        if (candidates.length > 0 && ecuForScan) {
          // ── Memory lookup FIRST — any Kf_ header we've confirmed before
          // gets auto-identified at 100% confidence, skipping the classifier.
          const mem = await applyMemoryToCandidates(buf, candidates)
          setMemoryMatches(mem.matched)
          // Classify only the candidates that weren't memory-hit
          const toClassify = mem.unmatched
          const result = classifyCandidates(toClassify, ecuForScan)
          setScannerDebug(
            'OK: ' + mem.matched.length + ' from memory, ' +
            result.candidates.length + ' identified, ' + result.unmatched.length + ' unknown'
          )
          setScanResult(result)
          // Share scanner results with Performance page
          onEcuLoaded?.({ fileName: name, fileBuffer: buf, detected: det, a2lMaps: [], scanResult: result })
          // AI match unmatched candidates in background (non-blocking)
          if (result.unmatched.length > 0) {
            matchUnknownsByDNA(buf, result.unmatched, ecuForScan.family).then(aiMatches => {
              if (aiMatches.size > 0) {
                setScannerDebug(prev => prev + ' | AI matched ' + aiMatches.size + ' unknowns')
              }
            }).catch(() => { /* AI matching failure shouldn't block scanning */ })
          }
        } else if (candidates.length > 0) {
          setScannerDebug('No ECU def — showing ' + candidates.length + ' unclassified')
          setScanResult({
            candidates: [],
            unmatched: candidates.map(c => ({
              candidate: c, hypotheses: [], bestMatch: null, assigned: false,
            })),
            anchors: [],
          })
        } else {
          setScannerDebug('ERROR: 0 candidates found — scanner returned empty')
        }
      } catch (e) { setScannerDebug('CRASH: ' + String(e)) }
      setScannerBusy(false)
    }, 50)

    setStep(1)
    // Share file state with Performance page (a2l/drt maps not loaded yet — updated later)
    onEcuLoaded?.({ fileName: name, fileBuffer: buf, detected: det, a2lMaps: [] })
  }, [onEcuLoaded])

  const handleFileOpen = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      if (api?.openEcuFile) {
        const result = await api.openEcuFile()
        if (result) {
          // Convert number[] back to ArrayBuffer
          const ab = new Uint8Array(result.buffer).buffer
          // Use full path as name so folder-based part number extraction works
          const nameWithPath = result.path || result.name
          processFile(ab, nameWithPath)
        }
      } else {
        // Fallback: file input
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.bin,.hex,.ori,.ori2,.mod'
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => processFile(reader.result as ArrayBuffer, file.name)
          reader.readAsArrayBuffer(file)
        }
        input.click()
      }
    } catch (err) {
      setLoadError(String(err))
    }
  }

  // Adopt a sig-scan match into the Stage editor. Builds a synthetic MapDef,
  // extracts the map data from the buffer, adds it to extractedMaps, and
  // navigates to Step 3 so the user sees it in the same card/heatmap UI they
  // use for curated maps. Factor defaults to 1.0 (raw values) — multiplier
  // edits still work for stage-style tuning even without physical units.
  const openSigMatchInStageEditor = useCallback((match: SignatureMatch) => {
    if (!fileBuffer) return
    if (adoptedSigOffsets.has(match.offset)) return
    const synth = syntheticMapDefFromSignature(match)
    const result = extractMap(fileBuffer, synth, detected?.def.family)
    if (!result.found) {
      // Shouldn't happen — scanner already verified the 24-byte signature at this offset.
      // Log a debug line and bail silently rather than break the UI.
      console.warn('[sig-adopt] extractMap returned not-found for', match.name, 'at 0x' + match.offset.toString(16))
      return
    }
    setExtractedMaps(prev => {
      // Guard against double-adding if user double-clicks or React StrictMode re-runs.
      if (prev.some(m => m.mapDef.id === synth.id)) return prev
      return [...prev, { ...result, source: 'signature' as const }]
    })
    setAdoptedSigOffsets(prev => new Set(prev).add(match.offset))
    // Jump to Step 3 only if we aren't already on it — otherwise the user's
    // scroll position on the scanner panel gets wiped unnecessarily.
    if (step !== 3) setStep(3)
  }, [fileBuffer, detected, step, adoptedSigOffsets])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => processFile(reader.result as ArrayBuffer, file.name)
    reader.readAsArrayBuffer(file)
  }, [processFile])

  // Loading state for the Preview Changes button — inline scanner for Delphi/no-signature
  // ECUs takes 3-5 seconds on a 4MB binary and blocks the UI thread. Without this flag
  // the button appears unresponsive and user thinks the app is stuck.
  const [isExtracting, setIsExtracting] = useState(false)

  // ─── Step 2→3: extract maps ───────────────────────────────────────────────
  // Wrapped in setTimeout so React can paint the 'Extracting...' state before the heavy
  // synchronous scanner work starts. Otherwise the user clicks, UI freezes for 3-5s with
  // no feedback, looking stuck.
  const handleConfigureNext = () => {
    if (!fileBuffer || !selectedEcu || isExtracting) return
    setIsExtracting(true)
    // Let React paint the disabled/loading button before we hog the main thread
    setTimeout(() => {
      try {
        doExtraction()
      } catch (e) {
        console.error('Map extraction crashed:', e)
        alert('Map extraction failed. Check console for details.\n\n' + String(e))
      } finally {
        setIsExtracting(false)
      }
    }, 30)
  }

  const doExtraction = () => {
    if (!fileBuffer || !selectedEcu) return
    let maps = extractAllMaps(fileBuffer, selectedEcu)

    // A2L fallback: for each map not found via binary signatures, try A2L-validated addresses.
    // Category bridge: A2L uses 'egr'/'dpf'; ecuDefinitions uses 'emission'.
    if (a2lValidation.length > 0) {
      const normCat = (c: string) => (c === 'egr' || c === 'dpf') ? 'emission' : c
      // Build sorted pool: valid first (by confidence desc), then uncertain.
      const validPool = a2lValidation.filter(v => v.status === 'valid').sort((a, b) => b.confidence - a.confidence)
      const uncertainPool = a2lValidation.filter(v => v.status === 'uncertain').sort((a, b) => b.confidence - a.confidence)
      const allPool = [...validPool, ...uncertainPool]
      // usedOffsets prevents two maps claiming the same binary address.
      // This was the root bug: bestByCategory stored ONE address per category so all
      // 3 fuel maps (Torque→IQ, IQ, Rail Pressure) got the same fallback address.
      const usedOffsets = new Set<number>()
      for (const em of maps) { if (em.found && em.offset >= 0) usedOffsets.add(em.offset) }
      let fallbackCount = 0

      // ── Phase A: A2L name-match OVERRIDES signature matches when available ──
      // A2L contains the manufacturer's authoritative memory map for THIS exact
      // software version (validated against the binary — 819 of 1069 maps showed
      // "valid" in the UI). Signatures are generic byte patterns — they can hit
      // the wrong occurrence in a variant. When we have an A2L name-match for
      // a mapDef, ALWAYS prefer the A2L address over a signature match.
      //
      // Previously: `if (em.found) return em` skipped A2L when signature hit.
      // Now: A2L name-match wins unconditionally, and we release the signature's
      // address from usedOffsets so it can be reused for another map.
      maps = maps.map(em => {
        if (!em.mapDef.a2lNames?.length) return em
        for (const v of allPool) {
          if (usedOffsets.has(v.map.fileOffset)) continue
          if (em.mapDef.a2lNames.some(n => n.toLowerCase() === v.map.name.toLowerCase())) {
            const synthDef = syntheticMapDefFromA2L(v.map, em.mapDef)
            const result = extractMap(fileBuffer, synthDef)
            if (result.found) {
              // If this map previously had a signature-based address, release
              // it — another map without an A2L name can still claim it.
              if (em.found && em.offset >= 0 && em.offset !== v.map.fileOffset) {
                usedOffsets.delete(em.offset)
              }
              usedOffsets.add(v.map.fileOffset)
              fallbackCount++
              return { ...result, source: 'a2l' as const }
            }
          }
        }
        return em
      })

      // ── Phase B: category fallback (Pass 2) for maps still not found after Phase A ──
      // Maps with a2lNameOnly:true are skipped — their category contains too many false
      // positives and only a precise name-match (Phase A) is trustworthy for them.
      maps = maps.map(em => {
        if (em.found) return em
        if (em.mapDef.a2lNameOnly) return em   // name-match only, no category fallback
        for (const v of allPool) {
          if (usedOffsets.has(v.map.fileOffset)) continue
          if (normCat(v.map.category) === em.mapDef.category) {
            const synthDef = syntheticMapDefFromA2L(v.map, em.mapDef)
            const result = extractMap(fileBuffer, synthDef)
            if (result.found) {
              usedOffsets.add(v.map.fileOffset)
              fallbackCount++
              return { ...result, source: 'a2l' as const }
            }
          }
        }
        return em
      })
      setA2lFallbackCount(fallbackCount)
    }

    // Scanner fallback: for ECUs like Delphi DCM6.2 (VAG TDI) where definitions have
    // no signatures (count-prefixed axis-inline format, no byte patterns to match),
    // use the binary scanner directly. Runs inline/synchronously so we don't depend
    // on the async scanner from upload time.
    //
    // Strategy: gather ALL scanner candidates (classified + unmatched + fresh scan),
    // then match each unfound mapDef by dimension + raw-data-range plausibility.
    // Classifier's strict axis-hints are bypassed here because they're tuned for one
    // specific reference binary (D0B16) and reject variants.
    const needsScanner = maps.some(m => !m.found && m.mapDef.signatures.length === 0)
    if (needsScanner) {
      try {
        // Run scanner + classifier inline (synchronous — no async timing issues)
        const freshCandidates = scanBinaryForMaps(fileBuffer, selectedEcu)
        const freshResult = freshCandidates.length > 0
          ? classifyCandidates(freshCandidates, selectedEcu)
          : null
        // Use fresh result if async scanResult is empty/stale
        const scanData = freshResult ?? scanResult
        if (scanData) {
          // Pool all candidates (both classified and unmatched) — classifier may have
          // rejected real DCM6.2 maps due to overly strict hints.
          const allScanned = [...scanData.candidates, ...scanData.unmatched]
          const scannerUsedOffsets = new Set<number>()
          for (const em of maps) { if (em.found && em.offset >= 0) scannerUsedOffsets.add(em.offset) }
          let scannerCount = 0

          maps = maps.map(em => {
            if (em.found) return em
            const mdRows = em.mapDef.rows, mdCols = em.mapDef.cols
            const mdFactor = em.mapDef.factor, mdOffset = em.mapDef.offsetVal ?? 0

            // Expected physical value range for this category (from classifier's PHYSICAL_RANGES)
            // We recompute here to avoid tight coupling to mapClassifier internals.
            const expectedRange = (() => {
              switch (em.mapDef.category) {
                case 'boost': return [0, 5000]   // bar or mbar
                case 'torque': return [0, 650]
                case 'fuel': return [0, 80]
                case 'smoke': return [0, 80]
                case 'ignition': return [-50, 70]
                case 'limiter': return [50, 8500]
                case 'emission': return [0, 100]
                default: return [0, 1e6]
              }
            })()

            // Score every candidate by dimension + physical plausibility
            let bestScore = -1
            let bestCand: typeof allScanned[number]['candidate'] | null = null
            for (const cc of allScanned) {
              const c = cc.candidate
              if (scannerUsedOffsets.has(c.offset)) continue

              // DIMENSION SCORE (0-100)
              let dimScore = 0
              if (c.rows === mdRows && c.cols === mdCols) dimScore = 100
              else if (c.rows === mdCols && c.cols === mdRows) dimScore = 80  // transposed
              else if (Math.abs(c.rows - mdRows) <= 1 && Math.abs(c.cols - mdCols) <= 1) dimScore = 40
              else continue  // dimensions too far off — skip

              // PHYSICAL PLAUSIBILITY SCORE (0-50)
              // Apply mapDef's factor to see if raw data falls in expected physical range
              const physMin = c.valueRange.min * mdFactor + mdOffset
              const physMax = c.valueRange.max * mdFactor + mdOffset
              let physScore = 0
              if (physMax >= expectedRange[0] && physMin <= expectedRange[1]) {
                // Some overlap with expected range
                const spanOk = (physMax - physMin) > (expectedRange[1] - expectedRange[0]) * 0.05
                physScore = spanOk ? 50 : 20
              }

              // CLASSIFIER BONUS (0-30): if classifier agreed this was our map
              let clsBonus = 0
              if (cc.bestMatch?.mapDefId === em.mapDef.id) clsBonus = 30
              else if (cc.bestMatch?.category === em.mapDef.category) clsBonus = 15

              const total = dimScore + physScore + clsBonus
              if (total > bestScore) {
                bestScore = total
                bestCand = c
              }
            }

            // Require at least 100 points (exact dim match OR dim + category agreement)
            if (!bestCand || bestScore < 100) return em

            // Build synthetic mapDef with scanner's actual dimensions/dtype/offset
            const synthDef = {
              ...em.mapDef,
              rows: bestCand.rows,
              cols: bestCand.cols,
              dtype: bestCand.dtype,
              le: bestCand.le,
              fixedOffset: bestCand.offset,
              signatures: [],
              sigOffset: 0,
            }
            const result = extractMap(fileBuffer, synthDef)
            if (result.found) {
              scannerUsedOffsets.add(result.offset)
              scannerCount++
              return { ...result, source: 'scanner' as const }
            }
            return em
          })
          // Track scanner-matched count SEPARATELY from a2l/drt fallback count so the UI
          // shows the correct source. Previously this incremented a2lFallbackCount which
          // caused a false "via A2L/DRT ✓" indicator when no A2L/DRT was loaded.
          setScannerFallbackCount(c => c + scannerCount)
        }
      } catch (e) {
        // Scanner/classifier crashed — not fatal, just skip fallback
        console.warn('Scanner fallback failed:', e)
      }
    }

    // ── A2L Extras: expose every A2L-validated map that isn't already in the
    // main Stage-1 cards, so the user can tune beyond the 14 hardcoded maps.
    // Each extra becomes an ExtractedMap with showPreview=false (doesn't appear
    // in the main Preview grid) and stage1/2/3 multipliers all = 1 (no auto-
    // modification). The Advanced A2L section renders them for read + optional
    // edit. If the user touches one, existing customMultipliers / cellAnchors
    // pick it up automatically at Build Remap time.
    if (a2lValidation.length > 0) {
      const mainOffsets = new Set<number>()
      for (const em of maps) if (em.found && em.offset >= 0) mainOffsets.add(em.offset)
      const validated = a2lValidation.filter(v => (v.status === 'valid' || v.status === 'uncertain') && !mainOffsets.has(v.map.fileOffset))
      for (const v of validated) {
        const a = v.map
        const allowedCats: Record<string, MapCategory> = {
          boost: 'boost', torque: 'torque', fuel: 'fuel', ignition: 'ignition',
          limiter: 'limiter', egr: 'emission', dpf: 'emission',
        }
        const cat: MapCategory = allowedCats[(a.category ?? '').toLowerCase()] ?? 'misc'
        const synthDef: MapDef = {
          id:           `a2l_extra_${a.name}`,
          name:         a.name,
          category:     cat,
          desc:         `A2L map · ${a.axisX?.label || ''} vs ${a.axisY?.label || ''} · ${a.rows}×${a.cols} ${a.dataType} · offset 0x${a.fileOffset.toString(16).toUpperCase()}`,
          signatures:   [],
          sigOffset:    0,
          fixedOffset:  a.fileOffset,
          rows:         a.rows,
          cols:         a.cols,
          dtype:        a.dataType as DataType,
          le:           a.le,
          factor:       a.factor || 1,
          offsetVal:    a.physicalOffset || 0,
          unit:         '',
          stage1:       { multiplier: 1 },
          stage2:       { multiplier: 1 },
          stage3:       { multiplier: 1 },
          critical:     false,
          showPreview:  false,
          // Keep extras out of signature/scanner fallback on future loads
          skipCalSearch: true,
        }
        const result = extractMap(fileBuffer, synthDef)
        if (result.found) {
          maps.push({ ...result, source: 'a2l' as const })
        }
      }
    }

    setExtractedMaps(maps)
    // Share extracted maps with Performance page via parent state
    const foundMaps = maps.filter(m => m.found)
    if (foundMaps.length > 0 && fileBuffer && detected) {
      onEcuLoaded?.({ fileName, fileBuffer, detected, a2lMaps: [], extractedMaps: foundMaps })
    }
    setStep(3)
  }

  // ─── Signature export ─────────────────────────────────────────────────────
  const handleExtractSignatures = () => {
    const valid = a2lValidation.filter(v => v.status === 'valid')
    if (valid.length === 0) {
      setSigExportText('// No maps validated yet. Load a binary first, then an A2L.')
      setShowSigExport(true)
      return
    }
    const lines: string[] = [
      `// Binary signatures extracted from: ${a2lFileName}`,
      `// Validated against: ${fileName}`,
      `// Paste into the relevant ECU entry in ecuDefinitions.ts → maps → signatures`,
      '',
    ]
    for (const v of valid) {
      const hexSig = v.signature
        .map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
        .join(', ')
      lines.push(`// ${v.map.name}  category: ${v.map.category}  confidence: ${(v.confidence * 100).toFixed(0)}%`)
      lines.push(`// file offset: 0x${v.map.fileOffset.toString(16).toUpperCase()}  ${v.map.rows}×${v.map.cols} ${v.map.dataType}`)
      lines.push(`signatures: [[${hexSig}]], sigOffset: 0,`)
      lines.push('')
    }
    setSigExportText(lines.join('\n'))
    setShowSigExport(true)
  }

  // ─── Step 3→4: build remap ────────────────────────────────────────────────
  const handleBuildRemap = () => {
    if (!fileBuffer || !selectedEcu || extractedMaps.length === 0) return

    // Inject custom per-map multipliers / zone grids: clone the extractedMaps and override
    // stage params for any map where the tuner has set a custom % or zone anchors.
    const mapsWithOverrides = extractedMaps.map(em => {
      const anchors = cellAnchors[em.mapDef.id] ?? {}
      const hasZoneAnchors = Object.keys(anchors).length > 0
      const custom = customMultipliers[em.mapDef.id]

      // Zone editor (per-cell anchors) takes precedence over uniform slider.
      // Build either cellMultiplierGrid or cellAddendGrid depending on mapDef.tuningMode.
      if (hasZoneAnchors) {
        const baseStageKey = `stage${stage}` as 'stage1' | 'stage2' | 'stage3'
        const baseParams = em.mapDef[baseStageKey]
        const { rows, cols } = em.mapDef
        const isAddendMode = em.mapDef.tuningMode === 'addend'
        if (isAddendMode) {
          // Addend mode: anchors store raw addend deltas per cell. Default = stage-level addend.
          const defaultAddend = baseParams?.addend ?? 0
          const addendGrid = computeCellGrid(anchors, rows, cols, defaultAddend)
          return {
            ...em,
            cellAddendGrid: addendGrid,
            mapDef: {
              ...em.mapDef,
              // Zero the stage-level addend so applyParams uses the per-cell values instead
              stage1: { ...baseParams, addend: 0 },
              stage2: { ...baseParams, addend: 0 },
              stage3: { ...baseParams, addend: 0 },
            },
          }
        } else {
          // Multiplier mode: anchors store per-cell multipliers. Default = stage-level multiplier.
          const defaultMul = baseParams?.multiplier ?? 1
          const grid = computeCellGrid(anchors, rows, cols, defaultMul)
          return {
            ...em,
            cellMultiplierGrid: grid,
            mapDef: {
              ...em.mapDef,
              stage1: { ...baseParams, multiplier: 1 },
              stage2: { ...baseParams, multiplier: 1 },
              stage3: { ...baseParams, multiplier: 1 },
            },
          }
        }
      }

      if (custom === undefined) return em
      // Uniform custom multiplier (existing slider logic)
      const baseStageKey = `stage${stage}` as 'stage1' | 'stage2' | 'stage3'
      const baseParams = em.mapDef[baseStageKey]
      const overrideDef = {
        ...em.mapDef,
        stage1: { ...baseParams, multiplier: custom },
        stage2: { ...baseParams, multiplier: custom },
        stage3: { ...baseParams, multiplier: custom },
      }
      return { ...em, mapDef: overrideDef }
    })
    const result = buildRemap(fileBuffer, selectedEcu, stage, addons, mapsWithOverrides)
    // Step 1: correct header checksum (works for all ECU families)
    const corrected = correctChecksum(result.modifiedBuffer, selectedEcu)
    // Step 2: attempt block-level checksum correction (EDC17/EDC16/MED17/SIMOS)
    const blockRes = correctBlockChecksums(corrected)
    setBlockResult(blockRes)
    // Step 3: DTC suppression — applied after checksum so DTC byte writes don't
    // invalidate the corrected checksum (DTC bytes are in calibration, not checksum regions).
    const emissionAddons = ['egr_dtcs', 'dpf_sensors', 'cat', 'sai', 'evap', 'adblue']
    const activeDtcAddons = addons.filter(a => emissionAddons.includes(a))
    let finalBuffer = corrected
    if (activeDtcAddons.length > 0) {
      const { modifiedBuffer, results, suppressedCount } = suppressDTCs(corrected, activeDtcAddons, selectedEcuId)
      finalBuffer = modifiedBuffer
      setDtcResults(results)
      setDtcSuppressedCount(suppressedCount)
    } else {
      setDtcResults([])
      setDtcSuppressedCount(0)
    }
    setRemapResult({ ...result, modifiedBuffer: finalBuffer })
    setStep(4)
  }

  // ─── Smart Stage: auto-tune every scanner-identified map ───────────────────
  // Uses buildSmartStage (loops signature matches → category-driven multipliers
  // with physical-unit clamps) instead of the manual wired-maps-only path. The
  // rest of the flow (checksum correction, DTC suppression, step-4 results UI)
  // is identical — we just swap the remap source.
  const handleSmartStage = async () => {
    if (!fileBuffer || !selectedEcu || !sigScanResult) return
    setSmartStageBusy(true)
    try {
      // selectedEcu family must be one the scanner detected — otherwise sig
      // offsets won't resolve to valid map data. Guard against mismatch.
      const ss: SmartStageResult = buildSmartStage(
        fileBuffer,
        selectedEcu,
        sigScanResult.matches as SignatureMatch[],
        stage,
        addons,
        { verifiedOnly: smartStageVerifiedOnly },
      )

      setSmartStageSummary({
        applied: ss.applied,
        total: ss.totalMatches,
        clamped: ss.mapsClamped,
        skipped: ss.skipped.length,
        reverted: ss.mapsReverted,
      })

      // Same post-processing as manual remap
      const corrected = correctChecksum(ss.remap.modifiedBuffer, selectedEcu)
      const blockRes = correctBlockChecksums(corrected)
      setBlockResult(blockRes)

      const emissionAddons = ['egr_dtcs', 'dpf_sensors', 'cat', 'sai', 'evap', 'adblue']
      const activeDtcAddons = addons.filter(a => emissionAddons.includes(a))
      let finalBuffer = corrected
      if (activeDtcAddons.length > 0) {
        const { modifiedBuffer, results, suppressedCount } = suppressDTCs(corrected, activeDtcAddons, selectedEcuId)
        finalBuffer = modifiedBuffer
        setDtcResults(results)
        setDtcSuppressedCount(suppressedCount)
      } else {
        setDtcResults([])
        setDtcSuppressedCount(0)
      }

      setRemapResult({ ...ss.remap, modifiedBuffer: finalBuffer })
      setStep(4)
    } catch (err) {
      console.error('Smart Stage failed:', err)
    } finally {
      setSmartStageBusy(false)
    }
  }

  // ─── v3.13.0 Unified Stage apply — the "one button, always works" flow ───
  // Tier 1: bit-exact recipe if we have one for this variant+stage
  // Tier 2: learned multipliers per-map-name from the full recipe corpus
  // Tier 3: category defaults (last-resort fallback)
  const handleUnifiedStage = async (stage: Stage) => {
    if (!fileBuffer || !selectedEcu) return
    setUnifiedBusy(stage)
    setUnifiedTier(null)
    setUnifiedSource('')
    setUnifiedRefusal(null)
    setUnifiedValidation(null)
    try {
      const { applyStageUnified } = await import('../lib/stageEngine')
      const result = await applyStageUnified({
        buffer: fileBuffer,
        ecuDef: selectedEcu,
        stage,
        addons,
        sigMatches: (sigScanResult?.matches ?? []) as SignatureMatch[],
        recipeMatches: recipeMatches ?? [],
      })
      setUnifiedTier(result.tier)
      setUnifiedSource(result.sourceDescription)

      // v3.14 safety gate: if the engine refused (not enough signal), short-circuit
      // before checksum / DTC / download. remap is null on refuse.
      if (result.tier === 'refused' || !result.remap) {
        setUnifiedRefusal(result.refusalReason ?? 'Unsupported variant — no safe tune available.')
        setRemapResult(null)
        onTuneApplied?.(null)  // clear AI chat context — nothing to explain
        return
      }

      // v3.14 shape validator: surface warnings if the output doesn't look like
      // a typical Stage N tune. Hard severity → likely wrong; soft → worth a look.
      if (result.validation && result.validation.severity !== 'ok') {
        setUnifiedValidation(result.validation)
      }

      // v3.14 Phase B.3 — publish a shippable summary to the AI chat so "Explain
      // this tune" has real context. Truncate per-map list to 30 (plenty for
      // context without blowing token budget).
      const remap = result.remap
      const perMap = remap.changes
        .filter(c => c.found && !c.skippedUniform && isFinite(c.avgChangePct) && c.avgChangePct !== 0)
        .slice(0, 30)
        .map(c => ({
          name: c.mapDef.name,
          category: c.mapDef.category,
          avgChangePct: c.avgChangePct,
          unit: c.mapDef.unit,
        }))
      onTuneApplied?.({
        stage,
        tier: result.tier,
        sourceDescription: result.sourceDescription,
        boostChangePct: remap.summary.boostChangePct,
        fuelChangePct: remap.summary.fuelChangePct,
        torqueChangePct: remap.summary.torqueChangePct,
        mapsModified: remap.summary.mapsModified,
        perMap,
        validationWarnings: result.validation?.warnings ?? [],
      })

      // Post-process: checksum correction (same as existing paths)
      const corrected = correctChecksum(result.remap.modifiedBuffer, selectedEcu)
      const blockRes = correctBlockChecksums(corrected)
      setBlockResult(blockRes)
      const emissionAddons = ['egr_dtcs', 'dpf_sensors', 'cat', 'sai', 'evap', 'adblue']
      const activeDtcAddons = addons.filter(a => emissionAddons.includes(a))
      let finalBuffer = corrected
      if (activeDtcAddons.length > 0) {
        const { modifiedBuffer, results, suppressedCount } = suppressDTCs(corrected, activeDtcAddons, selectedEcuId)
        finalBuffer = modifiedBuffer
        setDtcResults(results)
        setDtcSuppressedCount(suppressedCount)
      } else {
        setDtcResults([])
        setDtcSuppressedCount(0)
      }
      setRemapResult({ ...result.remap, modifiedBuffer: finalBuffer })
      setStep(4)
    } catch (err) {
      console.error('Unified Stage apply failed:', err)
    } finally {
      setUnifiedBusy(null)
    }
  }

  // ─── v3.12.0 Recipe apply: bit-exact reproduction of a proven tuner file ───
  // Fetches the recipe JSON by its relative path, applies byte-level deltas to
  // the ORI buffer, then runs the same post-processing as manual remap
  // (checksum correction, DTC suppression if addons active).
  const handleApplyRecipe = async (match: import('../lib/recipeEngine').RecipeMatch) => {
    if (!fileBuffer || !selectedEcu) return
    setRecipeApplyingPath(match.entry.path)
    try {
      const { loadRecipe, applyRecipe } = await import('../lib/recipeEngine')
      const recipe = await loadRecipe(match.entry.path)
      if (!recipe) {
        console.error('[Recipe] failed to load', match.entry.path)
        return
      }
      // Apply deltas to a fresh copy of the ORI
      const applied = applyRecipe(fileBuffer, recipe)
      // v3.15.2: surface partial-apply warnings before checksum/UI render
      if (applied.skipped.length > 0) {
        console.warn(`[Recipe] ${applied.skipped.length}/${recipe.regions.length} regions skipped (out of bounds). Output is partial.`, applied.skipped)
      }
      // Post-process: checksum correction (engine + block if applicable).
      // For 'exact' matches the checksums are already correct in the recipe
      // bytes, but running correctChecksum() is harmless and makes the flow
      // identical to manual/Smart Stage output.
      const corrected = correctChecksum(applied.buffer, selectedEcu)
      const blockRes = correctBlockChecksums(corrected)
      setBlockResult(blockRes)
      // Build a minimal RemapResult so the existing Step 4 UI can render the output.
      // We don't have per-map changes (recipes are byte-level), so summary stays zeroes
      // and the UI just shows "Applied proven tune · N regions · source: <tuner file>".
      setRemapResult({
        ecuDef: selectedEcu,
        stage: (match.stage as 1 | 2 | 3) || 1,
        addons: [],
        changes: [],
        modifiedBuffer: corrected,
        checksumWarning: applied.skipped.length > 0,  // v3.15.2: any partial apply = warn
        summary: {
          boostChangePct: 0,
          fuelChangePct: 0,
          torqueChangePct: 0,
          mapsModified: recipe.regions.length - applied.skipped.length,  // reflect the partial count
          mapsNotFound: applied.skipped.length,                          // surface as "not found"
          mapsBlockedUniform: 0,
        },
      })
      setStep(4)
    } catch (err) {
      console.error('Recipe apply failed:', err)
    } finally {
      setRecipeApplyingPath(null)
    }
  }

  // ─── Download ─────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!remapResult || !selectedEcu) return
    const outName = buildFilename(fileName, selectedEcu, stage, addons)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      if (api?.saveEcuFile) {
        await api.saveEcuFile({ defaultName: outName, buffer: Array.from(new Uint8Array(remapResult.modifiedBuffer)) })
      } else {
        // Fallback: blob download
        const blob = new Blob([remapResult.modifiedBuffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = outName; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setLoadError(`Save failed: ${String(err)}`)
    }
  }

  // ─── Addon toggle ─────────────────────────────────────────────────────────
  // Mutually exclusive pairs: selecting one from a pair auto-deselects the other.
  const ADDON_MUTEX: Partial<Record<AddonId, AddonId>> = {
    popbang:  'popcorn',   // Pop & Bang ↔ Popcorn Limiter (can't have both)
    popcorn:  'popbang',
  }
  const toggleAddon = (id: AddonId) => {
    setAddons(prev => {
      if (prev.includes(id)) return prev.filter(a => a !== id)          // deselect
      const mutual = ADDON_MUTEX[id]
      const filtered = mutual ? prev.filter(a => a !== mutual) : prev   // drop the paired addon
      return [...filtered, id]
    })
  }

  // ─── A2L load ─────────────────────────────────────────────────────────────
  const handleA2LLoad = async (file: File) => {
    try {
      const content = await file.text()
      const result = parseA2L(content)
      // Auto-detect base address: binary-aware multi-candidate search when binary
      // is loaded, otherwise derive from A2L addresses (handles ME7, EDC15, etc.)
      const baseAddr = fileBuffer ? pickBestBaseAddress(fileBuffer, result) : detectBaseAddress(result)
      const maps = extractMapsFromA2L(result, baseAddr)
      setA2lResult(result)
      setA2lMaps(maps)
      setA2lFileName(file.name)
      // Validate A2L addresses against the loaded binary
      if (fileBuffer) {
        const validation = validateA2LMapsInBinary(fileBuffer, maps)
        setA2lValidation(validation)
        setShowSigExport(false)
        // Re-classify binary scanner candidates with A2L anchors for improved accuracy
        const ecuForScan = selectedEcu ?? detected?.def ?? null
        if (ecuForScan) {
          try {
            const candidates = scanBinaryForMaps(fileBuffer, ecuForScan)
            if (candidates.length > 0) {
              // Memory lookup first — confirmed fingerprints override both A2L
              // and classifier because they're user-verified, 100% confidence.
              const mem = await applyMemoryToCandidates(fileBuffer, candidates)
              setMemoryMatches(mem.matched)
              const result = classifyCandidates(mem.unmatched, ecuForScan, { a2lMaps: maps })
              setScanResult(result)
            }
          } catch (_) { /* scanner failure shouldn't block A2L load */ }
        }
      }
      // Share with Performance page
      if (fileBuffer) onEcuLoaded?.({ fileName, fileBuffer, detected, a2lMaps: maps })
    } catch (e) {
      setLoadError(`A2L parse failed: ${String(e)}`)
    }
  }

  // ─── Library search ───────────────────────────────────────────────────────
  const searchLibrary = useCallback(async (query: string, page = 0): Promise<number> => {
    const q = query.trim()
    if (!q) { setLibResults([]); setLibTotal(0); setLibOriginalNum(''); return 0 }
    setLibLoading(true)
    setLibFallbackNote('')
    setLibOriginalNum('')
    try {
      // Bosch SW numbers: "389289" ↔ "1037389289" — search both forms so KP files are found
      // whether the user types the short WinOLS suffix or the full embedded SW number.
      const boschFull   = /^(\d{6})$/.exec(q)   // 6-digit → also try 1037XXXXXX
      const boschShort  = /^1037(\d{6})$/.exec(q) // 10-digit → also try 6-digit suffix
      const altQuery    = boschFull   ? `1037${boschFull[1]}`  :
                          boschShort  ? boschShort[1]           : null

      const orFilter = altQuery
        ? `filename.ilike.%${q}%,filename.ilike.%${altQuery}%,ecu_family.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,driver_name.ilike.%${q}%`
        : `filename.ilike.%${q}%,ecu_family.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,driver_name.ilike.%${q}%`

      const { data, count } = await supabase
        .from('definitions_index')
        .select('*', { count: 'exact' })
        .eq('file_type', 'a2l')                    // A2L-only library
        .or(orFilter)
        .not('filename', 'ilike', '._%')
        .order('filename')
        .range(page * LIB_PAGE_SIZE, (page + 1) * LIB_PAGE_SIZE - 1)

      // STRICT TOKEN MATCH: Postgres ilike %query% is a fuzzy substring match, which for
      // short part numbers like "00020023" matches hundreds of unrelated files where those
      // digits appear inside a longer number. Post-filter so the query only counts if it
      // appears as a bounded token (surrounded by non-alphanumeric chars or at start/end).
      //
      // User request: 'when click search SHOULD NOT LOAD LOADS A2L AND DRT FILES ONLY IF
      // ITS A MATCH' — so we apply strict bounded matching on filename.
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const boundaryRe = new RegExp(`(^|[^A-Za-z0-9])(${escape(q)}${altQuery ? '|' + escape(altQuery) : ''})([^A-Za-z0-9]|$)`, 'i')
      const strict = (data ?? []).filter(entry => boundaryRe.test(entry.filename))

      // EXACT-MATCH-ONLY policy: fuzzy substring hits where the query isn't a bounded
      // token in the filename are almost never the A2L for the binary the user loaded.
      // If strict has results → show those. If not → show nothing, even when fuzzy has hits.
      if (strict.length > 0) {
        if (strict.length < (data ?? []).length) {
          setLibFallbackNote(`${strict.length} of ${(data ?? []).length} fuzzy matches are exact part-number matches — showing only those.`)
        }
        setLibResults(strict as DefinitionEntry[])
        setLibTotal(strict.length)
        setLibPage(page)
        return strict.length
      } else {
        if ((data ?? []).length > 0) {
          setLibFallbackNote(`No exact matches for "${q}". ${(data ?? []).length} loose substring hits found but none are the A2L for this binary — hidden.`)
        }
        setLibResults([])
        setLibTotal(0)
        setLibPage(page)
        return 0
      }
    } finally {
      setLibLoading(false)
    }
  }, [LIB_PAGE_SIZE])

  // When ECU is detected, pre-fill library search; fall back to ECU family if part number finds nothing.
  // EDC15, ME7, ME9, MS43 embed DAMOS symbol tables so binary-only map extraction works.
  // All other ECUs (EDC16, EDC17, MED17, SIMOS, Delphi DCM/CRD, Marelli, SID, PPD1 etc.)
  // do NOT embed map addresses — an A2L or DRT definition file is required. Auto-open library.
  const SIG_SUPPORTED = ['edc15', 'me7', 'me9', 'me9_merc', 'bmw_ms43']
  useEffect(() => {
    if (!detected) return
    const family = detected.def.family || detected.def.name

    // Priority 1: scan the actual binary for embedded ASCII part numbers
    // Priority 2: scan ALL path segments (folder names often contain part numbers)
    //             e.g. "C:\ECU maps\A4 1.6 0261203941 1037358701 CS 3BE3\file.bin"
    // Priority 3: filename only
    const binaryPart = fileBuffer ? extractPartNumberFromBinary(fileBuffer) : null

    // Split full path into segments and search each one for a part number
    const pathSegments = fileName.replace(/\\/g, '/').split('/').filter(Boolean)
    let pathPart: string | null = null
    for (const seg of pathSegments.reverse()) { // search from deepest folder first
      // VW/Bosch alphanumeric: e.g. 03L906018AG
      const am = seg.match(/(?<![A-Za-z0-9])(\d{2,3}[A-Za-z]\d{5,9}[A-Za-z]{0,3})(?![A-Za-z0-9])/i)
      if (am && am[1].length >= 8) { pathPart = am[1]; break }
      // Bosch 10-digit: e.g. 0261203941, 0281014069 — any 10-digit starting with 02
      const bm = seg.match(/(?<!\d)(02\d{8})(?!\d)/)
      if (bm) { pathPart = bm[1]; break }
      // Generic long number: 7-10 digits not all zeros
      const gm = seg.match(/(?<!\d)(\d{8,10})(?!\d)/)
      if (gm && !/^0+$/.test(gm[1])) { pathPart = gm[1]; break }
    }

    const resolvedPart = binaryPart ?? pathPart

    if (resolvedPart) {
      const part = resolvedPart.toUpperCase()

      // Bosch SW numbers are 10-digit 1037XXXXXX — WinOLS KP/DRT files only store
      // the last 6-digit suffix (e.g. "389289" not "1037389289"). When we have a
      // full Bosch SW number, use the short suffix for the search box and auto-load
      // so KP files are found. Keep the full number as a secondary search.
      const boschSuffix = /^1037(\d{6})$/.exec(part)
      const searchTerm  = boschSuffix ? boschSuffix[1] : part   // "389289" or full part
      const altTerm     = boschSuffix ? part : null              // "1037389289" as fallback

      setLibSearch(searchTerm)

      // Build ilike filter: match searchTerm OR altTerm in filename
      const ilikeFilter = altTerm
        ? `filename.ilike.%${searchTerm}%,filename.ilike.%${altTerm}%`
        : `filename.ilike.%${searchTerm}%`

      // Try to auto-load if there is exactly one A2L whose filename contains this part number.
      // A2L-only: we no longer auto-load DRT/KP files.
      supabase
        .from('definitions_index')
        .select('*')
        .eq('file_type', 'a2l')
        .or(ilikeFilter)
        .not('filename', 'ilike', '._%')
        .order('filename')
        .limit(20)
        .then(({ data }) => {
          if (!data) return
          const exactHits = data.filter(e =>
            e.filename.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(searchTerm.replace(/[^A-Z0-9]/g, ''))
            || (altTerm && e.filename.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(altTerm.replace(/[^A-Z0-9]/g, '')))
          )
          // EXACT MATCH ONLY: auto-load when there is exactly ONE A2L matching the part number.
          // Anything else (zero matches, multiple ambiguous matches) → show nothing. A2L candidates
          // not tied to this exact binary are almost never the right map.
          if (exactHits.length === 1) {
            loadDefinitionFromLibrary(exactHits[0] as DefinitionEntry)
          } else {
            setLibResults([])
            setLibTotal(0)
            if (exactHits.length > 1) {
              setLibFallbackNote(
                `${exactHits.length} A2L files mention "${part}" but none is an exact match for this binary. Search manually if you have a specific file in mind.`,
              )
            }
          }
        })
    } else {
      // No part number found in binary or filename — pre-fill with ECU family
      setLibSearch(family)
    }

    // DRT + KP auto-suggest removed — library is A2L-only now.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected, fileName, fileBuffer])

  // Auto-scan removed — scanner candidates were noise in the preview

  const loadDefinitionFromLibrary = async (entry: DefinitionEntry) => {
    setLibLoadingId(entry.id)
    setLibLoadError('')
    try {
      const { data, error } = await supabase.storage
        .from('definition-files')
        .download(entry.storage_path)
      if (error || !data) throw error ?? new Error('Download failed')

      if (entry.file_type === 'a2l') {
        const text = await data.text()
        const result = parseA2L(text)
        const baseAddr = fileBuffer ? pickBestBaseAddress(fileBuffer, result) : detectBaseAddress(result)
        const maps = extractMapsFromA2L(result, baseAddr)
        setA2lResult(result)
        setA2lMaps(maps)
        setA2lFileName(entry.filename)
        // Validate A2L addresses against the loaded binary
        if (fileBuffer) {
          const validation = validateA2LMapsInBinary(fileBuffer, maps)
          setA2lValidation(validation)
          setShowSigExport(false)
        }
      } else {
        // Only A2L definitions are supported. Non-A2L files are ignored.
        setLibLoadError(`${entry.filename} is not an A2L — only A2L definitions are supported.`)
      }
      // If binary is already loaded, advance to step 1 automatically
      if (fileBuffer) setStep(1)
    } catch (e: any) {
      setLibLoadError(`Failed to load ${entry.filename}: ${e?.message ?? 'Unknown error'}`)
    } finally {
      setLibLoadingId(null)
    }
  }

  // ─── Render steps ─────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 12, padding: '48px 32px', textAlign: 'center',
          background: isDragOver ? 'rgba(0,174,200,0.05)' : 'var(--bg-card)',
          transition: 'all 0.15s ease', cursor: 'pointer',
        }}
        onClick={handleFileOpen}
      >
        <div style={{ marginBottom: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={isDragOver ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {isDragOver ? 'Drop ECU binary here' : 'Drag & drop ECU binary'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Supported: .bin .hex .ori .ori2 .mod
        </div>
        <button className="btn-primary" style={{ pointerEvents: 'none' }}>
          Browse File
        </button>
      </div>
      {loadError && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12 }}>
          {loadError}
        </div>
      )}
      {fileName && (
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{fileName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(fileSize / 1024).toFixed(0)} KB</span>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 6, wordBreak: 'break-all', letterSpacing: '0.5px' }}>
            {hexPreview}
          </div>
          <button
            className="btn-primary"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => setStep(1)}
          >
            Continue →
          </button>
        </div>
      )}
      {/* Definition file drop zone — A2L or DRT */}
      <div
        style={{
          marginTop: 16, border: '1px dashed var(--border)', borderRadius: 12,
          padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s ease',
          background: a2lFileName ? 'rgba(34,197,94,0.04)' : 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = a2lFileName ? 'rgba(34,197,94,0.4)' : 'var(--border)')}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
        onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        onDrop={e => {
          e.preventDefault()
          e.currentTarget.style.borderColor = 'var(--border)'
          const f = e.dataTransfer.files[0]
          if (!f) return
          const lower = f.name.toLowerCase()
          if (lower.endsWith('.a2l')) handleA2LLoad(f)
        }}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.a2l,.A2L'
          input.onchange = (ev) => {
            const f = (ev.target as HTMLInputElement).files?.[0]
            if (!f) return
            const lower = f.name.toLowerCase()
            if (lower.endsWith('.a2l')) handleA2LLoad(f)
          }
          input.click()
        }}
      >
        {a2lFileName ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ✓ A2L Loaded
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {a2lFileName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {a2lResult?.totalMaps} MAPs · {a2lResult?.totalCurves} CURVEs · Manufacturer-accurate definitions
            </div>
            {a2lValidation.length > 0 && (() => {
              const vCount = a2lValidation.filter(v => v.status === 'valid').length
              const total = a2lValidation.length
              const pct = Math.round(vCount / total * 100)
              const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'
              const icon = pct >= 70 ? '✓' : pct >= 40 ? '⚠' : '✗'
              const label = pct >= 70 ? 'Good match' : pct >= 40 ? 'Partial match' : 'Poor match — wrong ECU variant?'
              return (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: `${color}15`, color, border: `1px solid ${color}40` }}>
                    {icon} {pct}% binary match
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{vCount}/{total} maps confirmed · {label}</span>
                </div>
              )
            })()}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {SIG_SUPPORTED.includes(selectedEcuId || detected?.def.id || '')
                ? 'Optional: Drop an A2L definition or search library'
                : '⚠ Required: Drop an A2L file, or load one from the library above'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 700 }}>
                .a2l — Bosch/ASAP2
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, opacity: 0.7 }}>
              Unlocks manufacturer-accurate map addresses &amp; scaling
            </div>
          </>
        )}
      </div>

      {/* Scanner panel removed — UNKNOWN candidates were useless clutter */}
    </div>
  )

  const renderStep1 = () => (
    <div>
      {detected ? (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: 'rgba(0,174,200,0.06)', border: '1px solid rgba(0,174,200,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>ECU Detected</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {detected.matchedStrings.join(', ')}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{detected.def.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {detected.def.manufacturer} · {detected.def.family} · {(detected.fileSize / 1024).toFixed(0)} KB
          </div>
          {/* Confidence bar — boosted by sig-scanner family match when scanner agrees.
              v3.11.16: if sigScanResult picked a family overwhelmingly (top ≥5× 2nd-best)
              AND that family appears in the selected EcuDef's identStrings, treat this
              as a confirmed match and display ≥95% confidence. This prevents confusing
              "52% confidence" on a file the scanner identifies with 10,000+ sig hits. */}
          {(() => {
            const scannerAgrees = (() => {
              if (!sigScanResult) return null
              const fam = sigScanResult.detectedFamily
              if (!fam || fam === 'UNKNOWN') return null
              // Check scanner score dominance (top ≥5× next-best family)
              const scores = Object.entries(sigScanResult.familyScores).sort((a, b) => b[1] - a[1])
              if (scores.length === 0 || scores[0][1] < 500) return null
              const ratio = scores.length >= 2 && scores[1][1] > 0 ? scores[0][1] / scores[1][1] : Infinity
              if (ratio < 5) return null
              // Confirm the scanner's family matches the selected EcuDef's identStrings
              const famUpper = fam.toUpperCase()
              const idents = detected.def.identStrings.map(s => s.toUpperCase())
              const matches = idents.some(i => i === famUpper || i.startsWith(famUpper) || famUpper.startsWith(i))
              if (!matches) return null
              return { family: fam, ratio, topScore: scores[0][1] }
            })()
            const displayConfidence = scannerAgrees ? Math.max(detected.confidence, 0.95) : detected.confidence
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>Detection confidence</span>
                  <span style={{ color: scannerAgrees ? '#22c55e' : 'var(--accent)', fontWeight: 700 }}>
                    {(displayConfidence * 100).toFixed(0)}%{scannerAgrees ? ' ✓' : ''}
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${displayConfidence * 100}%`, background: scannerAgrees ? '#22c55e' : 'var(--accent)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
                {scannerAgrees && (
                  <div style={{ fontSize: 10, color: '#22c55e', marginTop: 4 }}>
                    ✓ Signature scanner confirms family <strong>{scannerAgrees.family}</strong> · {scannerAgrees.topScore.toLocaleString()} signature hits ({scannerAgrees.ratio.toFixed(0)}× over next candidate)
                  </div>
                )}
              </div>
            )
          })()}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Compatible vehicles: </span>
            {detected.def.vehicles.join(' · ')}
          </div>
          {catalogHit && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,174,200,0.15)' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>WinOLS variant: </span>
              {catalogHit.entry.manufacturer} {catalogHit.entry.variant}
              {catalogHit.entry.plugin && <> · plugin <code style={{ color: 'var(--accent)' }}>{catalogHit.entry.plugin}</code></>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>ECU Not Recognised</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{(fileSize / 1024).toFixed(0)} KB</span>
          </div>
          {fileSize < 131072 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6 }}>This file is <strong style={{ color: '#f59e0b' }}>{(fileSize / 1024).toFixed(0)} KB</strong> — likely a pre-OBD ECU (pre-1996) or a partial calibration-only read.</div>
              <div>Pre-OBD ECUs (Digifant, Motronic 1.x/2.x, early K-Jetronic) are not supported for software remapping — they require hardware chip replacement. If this is a modern ECU, the file may be incomplete — re-read with your flashing tool.</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6 }}>No matching ECU definition found for this binary. This may be an unsupported variant or the binary may be encrypted.</div>
              <div>You can manually select the closest ECU family below, or contact DCTuning to add support for this file.</div>
            </div>
          )}
          {catalogHit && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,174,200,0.07)', border: '1px solid rgba(0,174,200,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>💡 Identified via WinOLS catalog</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  confidence {(catalogHit.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {catalogHit.entry.manufacturer} {catalogHit.entry.variant}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Family: <strong style={{ color: 'var(--text-secondary)' }}>{catalogHit.entry.group ?? '—'}</strong>
                {catalogHit.entry.use && <> · Use: <strong style={{ color: 'var(--text-secondary)' }}>{catalogHit.entry.use}</strong></>}
                {catalogHit.entry.plugin && <> · WinOLS plugin: <strong style={{ color: 'var(--text-secondary)' }}>{catalogHit.entry.plugin}</strong></>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                Matched string in binary: <code style={{ color: 'var(--accent)' }}>{catalogHit.matchedString}</code>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── A2L/DRT required banner ───────────────────────────────────────────
          EDC15, ME7, ME9, MS43 embed DAMOS symbol tables → signatures work.
          All other ECUs (EDC16, EDC17, MED17, SIMOS, Delphi, Marelli, SID,
          PPD1 etc.) do NOT embed map addresses — an A2L or DRT file with the
          exact memory map is the only way to locate calibration tables.
      */}
      {(() => {
        const ecuId = selectedEcuId || detected?.def.id || ''
        const sigSupported = ['edc15', 'me7', 'me9', 'me9_merc', 'bmw_ms43'].includes(ecuId)
        const needsBanner  = ecuId && !sigSupported && !a2lResult
        if (!needsBanner) return null
        return (
          <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', marginBottom: 5 }}>
                Definition File Required for Map Extraction
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>{detected?.def.name ?? ecuId}</strong> does not embed map addresses in the binary.
                Maps can only be located using an
                <strong style={{ color: 'var(--text-secondary)'}}> A2L</strong> definition file
                that contains the exact calibration memory layout.
              </div>
              <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, fontWeight: 700 }}>
                👇 Search the library below and load a matching A2L file to proceed.
              </div>
            </div>
          </div>
        )
      })()}

      {a2lResult && (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
              ✓ A2L Definition Loaded
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
              ASAP2 / Bosch
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {`${a2lResult.totalMaps} MAPs · ${a2lResult.totalCurves} CURVEs · ${a2lResult.totalValues} scalar values`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(['boost', 'torque', 'fuel', 'ignition'] as const).map(cat => {
              const count = a2lMaps.filter(m => m.category === cat).length
              return count > 0 ? (
                <div key={cat} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{cat}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>{count} maps</span>
                </div>
              ) : null
            })}
          </div>
          {a2lResult?.warnings[0] && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>{a2lResult.warnings[0]}</div>
          )}

          {/* A2L address validation panel — only shown when A2L is the active definition */}
          {a2lValidation.length > 0 && a2lFileName && (() => {
            const vCount = a2lValidation.filter(v => v.status === 'valid').length
            const uCount = a2lValidation.filter(v => v.status === 'uncertain').length
            const iCount = a2lValidation.filter(v => v.status === 'invalid' || v.status === 'outofrange').length
            return (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Address Validation vs This Binary
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>✓ {vCount} valid</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>? {uCount} uncertain</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>✗ {iCount} mismatch</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/ {a2lValidation.length} total</span>
                </div>
                {vCount > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8, lineHeight: 1.5 }}>
                    {vCount} map address{vCount !== 1 ? 'es' : ''} confirmed in this binary — will be used automatically if binary signatures fail.
                  </div>
                )}
                {vCount === 0 && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>
                    ⚠ No addresses validated. This A2L may be for a different software version. Do not use for writing.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleExtractSignatures}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(184,240,42,0.3)', background: 'rgba(184,240,42,0.07)', color: '#b8f02a', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Export Signatures →
                  </button>
                </div>
                {showSigExport && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paste into ecuDefinitions.ts</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(sigExportText)}
                        style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Copy All
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={sigExportText}
                      style={{ width: '100%', minHeight: 140, background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#79c0ff', fontFamily: "'Courier New', monospace", fontSize: 11, padding: '8px', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={() => setShowSigExport(false)}
                      style={{ marginTop: 4, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        ECU Override
      </div>
      <select
        value={selectedEcuId}
        onChange={e => setSelectedEcuId(e.target.value)}
        style={{ width: '100%', marginBottom: 20 }}
      >
        <option value="">-- Select ECU family --</option>
        {ECU_DEFINITIONS.map(e => (
          <option key={e.id} value={e.id}>{e.name} — {e.family}</option>
        ))}
      </select>

      {selectedEcu && (
        <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Maps available for this ECU</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedEcu.maps.map(m => (
              <span key={m.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Library search panel — always visible at step 1 */}
      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(0,174,200,0.04)', border: '1px solid rgba(0,174,200,0.2)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          A2L / DRT Definition Library
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Search by ECU part number or family name for accurate map addresses
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={libSearch}
            onChange={e => setLibSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchLibrary(libSearch, 0)}
            placeholder="e.g. 387808, EDC16CP34, MED17..."
            style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => searchLibrary(libSearch, 0)}>
            Search
          </button>
        </div>
        {libFallbackNote && (
          <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.85)', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 5, padding: '5px 8px', marginBottom: 6 }}>
            ℹ {libFallbackNote}
          </div>
        )}
        {libLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Searching...</div>}
        {libResults.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{libTotal.toLocaleString()} result{libTotal !== 1 ? 's' : ''} — showing {libResults.length} (page {libPage + 1} of {Math.ceil(libTotal / LIB_PAGE_SIZE)})</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {libPage > 0 && <button onClick={() => searchLibrary(libSearch, libPage - 1)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>← Prev</button>}
                {(libPage + 1) * LIB_PAGE_SIZE < libTotal && <button onClick={() => searchLibrary(libSearch, libPage + 1)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Next →</button>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 340, overflowY: 'auto' }}>
              {[...libResults]
                .sort((a, b) => {
                  if (!libOriginalNum) return 0
                  const ca = closestCalNum(a.filename, libOriginalNum)
                  const cb = closestCalNum(b.filename, libOriginalNum)
                  return (ca?.delta ?? 999999) - (cb?.delta ?? 999999)
                })
                .map(entry => {
                const cal = libOriginalNum ? closestCalNum(entry.filename, libOriginalNum) : null
                return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: `1px solid ${cal && cal.delta < 2000 ? 'rgba(184,240,42,0.25)' : 'var(--border)'}` }}>
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {cal && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: cal.delta < 2000 ? '#b8f02a' : cal.delta < 10000 ? '#f59e0b' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                          {cal.num.toLocaleString()}
                          <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 3 }}>
                            {cal.delta === 0 ? '✓ exact' : `±${cal.delta.toLocaleString()}`}
                          </span>
                        </span>
                      )}
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>
                        .a2l
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.filename}</div>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 10, padding: '3px 10px', flexShrink: 0, marginLeft: 8 }}
                    disabled={libLoadingId === entry.id}
                    onClick={() => loadDefinitionFromLibrary(entry)}
                  >
                    {libLoadingId === entry.id ? '⏳' : 'Load'}
                  </button>
                </div>
                )
              })}
            </div>
          </>
        )}
        {libLoadError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{libLoadError}</div>}
      </div>

      {/* ── VAG Signature Scanner (DAMOS-named maps) ───────────────────────
          Matches the binary against 152,119 portable signatures harvested from
          1,126 ORI+A2L pairs. Produces real map names like AccPed_trqEng0_MAP
          instead of generic Kf_0xOFFSET markers. Validated on 21 held-out
          binaries: 86% find real maps. */}
      {/* v3.13.0 UNIFIED APPLY STAGE — single prominent button set at the very top.
           Tier 1 (recipe), Tier 2 (learned multipliers), Tier 3 (category) — the
           engine picks whichever path produces the best tune for this ECU. This
           replaces the previous two-path design (separate Recipe Library purple
           buttons + Smart Stage yellow buttons) with one obvious flow. */}
      {sigScanResult && selectedEcu && (
        <div style={{
          marginTop: 16,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(139,92,246,0.08))',
          border: '1px solid rgba(34,197,94,0.35)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.3px' }}>
              APPLY STAGE
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {recipeMatches && recipeMatches.some(m => m.confidence === 'exact')
                ? <>✓ <strong style={{ color: '#22c55e' }}>Proven tune available</strong> — bit-exact reproduction</>
                : recipeMatches && recipeMatches.length > 0
                  ? <>Same-variant tune available — high confidence</>
                  : <>Learned from the full tune corpus — maps tuned by name</>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([1, 2, 3] as const).map(stage => {
              const busy = unifiedBusy === stage
              const hasRecipeForStage = recipeMatches?.some(m => m.stage === stage) ?? false
              const hint = hasRecipeForStage
                ? 'Proven tune'
                : (recipeMatches && recipeMatches.length > 0 ? 'Variant tune' : 'Learned multipliers')
              return (
                <button
                  key={stage}
                  onClick={() => handleUnifiedStage(stage)}
                  disabled={busy || unifiedBusy !== null}
                  style={{
                    flex: 1, padding: '14px 0',
                    background: busy ? 'rgba(34,197,94,0.25)' : '#22c55e',
                    color: busy ? 'var(--text-muted)' : '#000',
                    border: 'none', borderRadius: 8,
                    cursor: (busy || unifiedBusy !== null) ? 'not-allowed' : 'pointer',
                    fontSize: 16, fontWeight: 900, textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  {busy ? 'Applying…' : `Stage ${stage}`}
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.4px', opacity: 0.7, marginTop: 3 }}>
                    {hint}
                  </div>
                </button>
              )
            })}
          </div>
          {unifiedTier && unifiedTier !== 'refused' && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Last tune used: <strong style={{ color: '#22c55e' }}>{unifiedTier}</strong> — {unifiedSource}
            </div>
          )}
          {/* v3.14 Phase B.3 — Ask Copilot buttons appear after a successful tune */}
          {unifiedTier && unifiedTier !== 'refused' && onAskAI && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => onAskAI('explain')}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 5,
                  background: 'rgba(124,58,237,0.12)',
                  border: '1px solid rgba(124,58,237,0.35)',
                  color: '#c4b5fd', cursor: 'pointer', fontWeight: 600,
                }}
              >💬 Explain this tune</button>
              {unifiedValidation && unifiedValidation.severity !== 'ok' && (
                <button
                  onClick={() => onAskAI('warnings')}
                  style={{
                    fontSize: 11, padding: '5px 10px', borderRadius: 5,
                    background: 'rgba(234,179,8,0.12)',
                    border: '1px solid rgba(234,179,8,0.35)',
                    color: '#fde68a', cursor: 'pointer', fontWeight: 600,
                  }}
                >⚠ Explain warnings</button>
              )}
              <button
                onClick={() => onAskAI('safety')}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 5,
                  background: 'rgba(0,174,200,0.12)',
                  border: '1px solid rgba(0,174,200,0.35)',
                  color: '#7dd3fc', cursor: 'pointer', fontWeight: 600,
                }}
              >🛡 Safety check</button>
            </div>
          )}
          {unifiedRefusal && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 6,
                fontSize: 12,
                color: '#fca5a5',
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#ef4444' }}>
                Tune refused — unsupported variant
              </div>
              <div>{unifiedRefusal}</div>
            </div>
          )}
          {unifiedValidation && unifiedValidation.severity !== 'ok' && (() => {
            const hard = unifiedValidation.severity === 'hard'
            return (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: hard ? 'rgba(239, 68, 68, 0.08)' : 'rgba(234, 179, 8, 0.08)',
                  border: `1px solid ${hard ? 'rgba(239, 68, 68, 0.35)' : 'rgba(234, 179, 8, 0.35)'}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: hard ? '#fca5a5' : '#fde68a',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6, color: hard ? '#ef4444' : '#eab308' }}>
                  {hard ? 'Tune shape warning — review before using' : 'Tune shape notice'}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {unifiedValidation.warnings.map((w, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>{w}</li>
                  ))}
                </ul>
              </div>
            )
          })()}
          {/* v3.15.2 — checksum-unsupported warning. Shown whenever the selected
              ECU has algo 'none' or 'unknown' so the user knows the output cannot
              be flashed directly without an external tool. */}
          {checksumSupport && !checksumSupport.supported && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.35)',
                borderRadius: 6,
                fontSize: 12,
                color: '#fde68a',
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#eab308' }}>
                ⚠ Checksum not auto-corrected for this ECU
              </div>
              <div>{checksumSupport.reason}</div>
            </div>
          )}
        </div>
      )}

      {/* v3.12.0 Recipe Library panel — shown FIRST (above Signature Scanner) when
           the loaded ORI matches a pre-extracted tuner recipe. One-click applies
           the proven tune bit-exactly. This is the primary flow — Smart Stage
           becomes the fallback for variants with no recipe match. */}
      {(recipeMatches !== null || recipeBusy) && (
        <div style={{ marginTop: 16, border: '1px solid rgba(139,92,246,0.4)', borderRadius: 10, overflow: 'hidden', background: 'rgba(139,92,246,0.04)' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: (recipeMatches && recipeMatches.length > 0) ? '1px solid rgba(139,92,246,0.25)' : 'none' }}>
            <span style={{ fontSize: 14 }}>📚</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recipe Library
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {recipeBusy ? 'Looking up variant…' : recipeMatches && recipeMatches.length > 0
                ? <><strong style={{ color: '#a78bfa' }}>{recipeMatches.length}</strong> proven tune{recipeMatches.length === 1 ? '' : 's'} match this ORI</>
                : 'No recipe for this variant — use Smart Stage below'}
            </span>
          </div>
          {recipeMatches && recipeMatches.length > 0 && (
            <div style={{ padding: '10px 16px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Each recipe is the byte-level delta from this exact ORI (or a close variant) to a real tuner's
                Stage N file. Apply = bit-exact reproduction of a proven tune. No multipliers, no safety nets,
                no guessing — the recipe <em>is</em> the tune.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recipeMatches.slice(0, 8).map((m, i) => {
                  const confColor = m.confidence === 'exact' ? '#22c55e'
                                 : m.confidence === 'variant' ? '#eab308' : '#f59e0b'
                  const confLabel = m.confidence === 'exact' ? 'BIT-EXACT MATCH'
                                 : m.confidence === 'variant' ? 'SAME VARIANT' : 'SAME ECU'
                  const applying = recipeApplyingPath === m.entry.path
                  return (
                    <div key={`${m.entry.path}-${i}`} style={{
                      padding: '10px 12px', background: 'rgba(139,92,246,0.06)',
                      border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: confColor, padding: '2px 6px', border: `1px solid ${confColor}40`, borderRadius: 4, letterSpacing: '0.4px' }}>
                        {confLabel}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Stage {m.stage}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                        {m.entry.partNumber} · {m.entry.swNumber}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {m.entry.regions} regions, {m.entry.totalBytesChanged.toLocaleString()}B modified
                      </span>
                      <button
                        onClick={() => handleApplyRecipe(m)}
                        disabled={applying || !selectedEcu}
                        style={{
                          marginLeft: 'auto', padding: '6px 14px', fontSize: 11, fontWeight: 700,
                          background: applying ? 'rgba(139,92,246,0.3)' : '#a78bfa',
                          color: applying ? 'var(--text-muted)' : '#000',
                          border: 'none', borderRadius: 6,
                          cursor: applying || !selectedEcu ? 'not-allowed' : 'pointer',
                          textTransform: 'uppercase', letterSpacing: '0.4px',
                        }}
                      >
                        {applying ? 'Applying…' : `Apply Stage ${m.stage}`}
                      </button>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', width: '100%', marginTop: 2 }}>
                        source: <code>{m.entry.sourceTunedFile}</code>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {(sigScanResult || sigScanBusy || sigScanError) && (
        <div style={{ marginTop: 16, border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, overflow: 'hidden' }}>
          <div
            onClick={() => setShowSigMaps(!showSigMaps)}
            style={{
              padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(34,197,94,0.05)', borderBottom: showSigMaps ? '1px solid rgba(34,197,94,0.2)' : 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>🏷️</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              DAMOS SIGNATURE SCANNER
            </span>
            {sigScanBusy ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Scanning against 152K signatures...</span>
            ) : sigScanError ? (
              <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 'auto' }}>{sigScanError}</span>
            ) : sigScanResult ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {sigScanResult.detectedFamily !== 'UNKNOWN' && (
                  <span style={{ color: '#22c55e', fontWeight: 700, marginRight: 8 }}>
                    {sigScanResult.detectedFamily}
                  </span>
                )}
                <span style={{ color: '#22c55e', fontWeight: 700 }}>{sigScanResult.byType.MAP}</span> MAPs,{' '}
                <span style={{ color: '#22c55e', fontWeight: 700 }}>{sigScanResult.byType.CURVE}</span> CURVEs,{' '}
                <span style={{ color: 'var(--text-muted)' }}>{sigScanResult.totalMaps} total</span>
              </span>
            ) : null}
            <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: showSigMaps ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </div>

          {/* Smart Stage strip — auto-tune every identified map with category-driven multipliers + physical-unit clamps */}
          {sigScanResult && sigScanResult.matches.length > 0 && (
            <div style={{
              padding: '10px 16px', background: 'rgba(234, 179, 8, 0.05)',
              borderBottom: showSigMaps ? '1px solid rgba(34,197,94,0.2)' : 'none',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#eab308', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                SMART STAGE
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 200 }}>
                Auto-tune <strong style={{ color: '#eab308' }}>{sigScanResult.matches.filter(m => !smartStageVerifiedOnly || m.scalingVerified).length}</strong>
                {' '}maps with category defaults + physical-unit safety clamps. Checksum auto-corrected.
              </span>
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={smartStageVerifiedOnly}
                  onChange={e => setSmartStageVerifiedOnly(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Verified scaling only
              </label>
              <button
                onClick={(e) => { e.stopPropagation(); handleSmartStage() }}
                disabled={smartStageBusy || !selectedEcu}
                style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 700,
                  background: smartStageBusy ? 'rgba(234,179,8,0.3)' : '#eab308',
                  color: smartStageBusy ? 'var(--text-muted)' : '#000',
                  border: 'none', borderRadius: 6,
                  cursor: (smartStageBusy || !selectedEcu) ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}
              >
                {smartStageBusy ? 'Applying…' : `⚡ Apply Stage ${stage}`}
              </button>
              {smartStageSummary && !smartStageBusy && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: '100%' }}>
                  Last run: <strong style={{ color: '#22c55e' }}>{smartStageSummary.applied}</strong> applied ·{' '}
                  <strong style={{ color: smartStageSummary.clamped > 0 ? '#eab308' : 'var(--text-muted)' }}>{smartStageSummary.clamped}</strong> hit safety clamp ·{' '}
                  {smartStageSummary.reverted > 0 && (
                    <><strong style={{ color: '#ef4444' }} title="Maps reverted because a cell would have changed by >60% — usually mis-classified sensor-cal or tiny-value flag map.">{smartStageSummary.reverted}</strong> reverted (runaway) · </>
                  )}
                  <strong style={{ color: 'var(--text-muted)' }}>{smartStageSummary.skipped}</strong> skipped (of {smartStageSummary.total} total)
                </span>
              )}
            </div>
          )}

          {showSigMaps && sigScanResult && (() => {
            // Group matches by offset — Bosch ECUs often have many related A2L names
            // sharing identical 24-byte default data, so we collapse them into one
            // row with "+N aliases" expand instead of listing each as a separate row.
            type Match = typeof sigScanResult.matches[0]
            const filteredMatches = sigScanResult.matches
              .filter(m => sigMapFilter === 'ALL' || m.type === sigMapFilter)
              .filter(m => !sigMapSearch.trim() || (
                m.name.toLowerCase().includes(sigMapSearch.toLowerCase()) ||
                m.desc.toLowerCase().includes(sigMapSearch.toLowerCase()) ||
                `0x${m.offset.toString(16)}`.toLowerCase().includes(sigMapSearch.toLowerCase())
              ))
            const byOffset = new Map<number, Match[]>()
            for (const m of filteredMatches) {
              if (!byOffset.has(m.offset)) byOffset.set(m.offset, [])
              byOffset.get(m.offset)!.push(m)
            }
            // Within each group, prefer "real" names over placeholder mapNNNN/scNNNN labels.
            // PPD1 + some EDC17C46 A2Ls use generic numbered labels as fallback when the
            // source didn't have real DAMOS names — pick any alias that has a meaningful
            // identifier (underscore + lowercase = typical DAMOS style) as primary instead.
            const isGenericName = (n: string) => /^(map|sc|var|char)\d+$/i.test(n)
            const hasRealStructure = (n: string) => /[a-z]_[a-z]/.test(n)
            for (const matches of byOffset.values()) {
              matches.sort((a, b) => {
                const aGeneric = isGenericName(a.name) ? 1 : 0
                const bGeneric = isGenericName(b.name) ? 1 : 0
                if (aGeneric !== bGeneric) return aGeneric - bGeneric  // real names first
                const aReal = hasRealStructure(a.name) ? 0 : 1
                const bReal = hasRealStructure(b.name) ? 0 : 1
                if (aReal !== bReal) return aReal - bReal
                return a.name.localeCompare(b.name)
              })
            }
            const groups = [...byOffset.entries()].sort(([a], [b]) => a - b)

            // Big-endian families. For the preview, we need to decode uint16 in the
            // right byte order — EDC16/EDC17/ME7/SIMOS12 are BE, MED17/MG1/SIMOS18 LE.
            const BE_FAMILIES = new Set(['EDC15', 'EDC16', 'EDC16U', 'EDC17', 'EDC17C46', 'EDC17C64', 'ME7', 'SIMOS8', 'SIMOS12', 'SIMOS16'])
            const isBE = BE_FAMILIES.has(sigScanResult.detectedFamily)

            // Given rows*cols 16-bit values at offset, return a 2D array of uint16 values.
            const previewValues = (offset: number, rows: number, cols: number): number[][] | null => {
              if (!fileBuffer) return null
              const byteLen = rows * cols * 2
              if (offset < 0 || offset + byteLen > fileBuffer.byteLength) return null
              const view = new DataView(fileBuffer)
              const out: number[][] = []
              for (let r = 0; r < rows; r++) {
                const row: number[] = []
                for (let c = 0; c < cols; c++) {
                  const i = offset + (r * cols + c) * 2
                  row.push(view.getUint16(i, !isBE))
                }
                out.push(row)
              }
              return out
            }

            // Quick stats for the preview header
            const previewStats = (vals: number[][]) => {
              let min = Infinity, max = -Infinity, sum = 0, n = 0
              for (const r of vals) for (const v of r) { if (v < min) min = v; if (v > max) max = v; sum += v; n++ }
              return { min, max, mean: Math.round(sum / n), n }
            }

            const copyToClipboard = (text: string) => {
              navigator.clipboard.writeText(text).catch(() => {})
            }

            return (
              <div style={{ padding: '12px 16px' }}>
                {/* Explainer — addresses the "is this legit?" trust question */}
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, padding: '8px 10px',
                  background: 'rgba(34,197,94,0.05)', borderLeft: '2px solid rgba(34,197,94,0.4)', borderRadius: 4,
                }}>
                  <strong style={{ color: '#22c55e' }}>How to read this:</strong>
                  {' '}Each offset shows one representative map name. Bosch ships many related A2L
                  variants sharing identical default data — click a row to see all the aliases at that offset.
                  Matches work on factory bytes, so tuned/Stage&nbsp;N files still detect unchanged maps correctly.
                </div>

                {/* Family confidence strip */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Family scores (sig hits across all candidates):{' '}
                  {Object.entries(sigScanResult.familyScores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, n]) =>
                    <span key={f} style={{ marginRight: 10 }}>
                      <span style={{ color: f === sigScanResult.detectedFamily ? '#22c55e' : 'var(--text-muted)', fontWeight: f === sigScanResult.detectedFamily ? 700 : 400 }}>{f}</span>={n}
                    </span>
                  )}
                </div>

                {/* Type filter tabs + search */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(['MAP', 'CURVE', 'ALL'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSigMapFilter(t)}
                      style={{
                        padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                        background: sigMapFilter === t ? 'rgba(34,197,94,0.15)' : 'transparent',
                        color: sigMapFilter === t ? '#22c55e' : 'var(--text-muted)',
                        border: `1px solid ${sigMapFilter === t ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        fontWeight: sigMapFilter === t ? 700 : 400,
                      }}
                    >
                      {t === 'MAP' ? `2D MAPs (${sigScanResult.byType.MAP})` :
                       t === 'CURVE' ? `CURVEs (${sigScanResult.byType.CURVE})` :
                       `All (${sigScanResult.totalMaps})`}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={sigMapSearch}
                    onChange={e => setSigMapSearch(e.target.value)}
                    placeholder="Search name, description, or 0xoffset..."
                    style={{
                      flex: 1, minWidth: 200, padding: '4px 10px', fontSize: 11,
                      background: 'rgba(255,255,255,0.03)', color: '#e5e5e5',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, outline: 'none',
                    }}
                  />
                  {sigMapSearch && (
                    <button
                      onClick={() => setSigMapSearch('')}
                      style={{ padding: '4px 10px', fontSize: 11, background: 'transparent', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {groups.length} unique offsets · {filteredMatches.length} names
                  </span>
                </div>

                {/* Grouped map list */}
                <div style={{ maxHeight: 420, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                  {groups.slice(0, 500).map(([offset, matches]) => {
                    const primary = matches[0]
                    const isExpanded = sigExpandedOffset === offset
                    return (
                      <div key={offset} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div
                          onClick={() => setSigExpandedOffset(isExpanded ? null : offset)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '90px 260px 50px 70px 50px 1fr',
                            gap: 8, padding: '6px 6px',
                            cursor: 'pointer',
                            background: isExpanded ? 'rgba(34,197,94,0.05)' : 'transparent',
                            color: primary.portable ? '#e5e5e5' : 'var(--text-muted)',
                          }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                        >
                          <span style={{ color: '#22c55e' }}>0x{offset.toString(16).padStart(6, '0')}</span>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={primary.name}>{primary.name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{primary.type}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{primary.rows}×{primary.cols}</span>
                          <span style={{ color: matches.length > 1 ? '#fbbf24' : 'var(--text-muted)', fontSize: 10 }}>
                            {matches.length > 1 ? `+${matches.length - 1} alias` : ''}
                          </span>
                          <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={primary.desc}>{primary.desc}</span>
                        </div>
                        {isExpanded && (() => {
                          // Read the actual map data from the binary — assumes uint16 cells.
                          // Most Bosch tunables are uint16, so this gives a meaningful preview.
                          const vals = previewValues(offset, primary.rows, primary.cols)
                          const stats = vals ? previewStats(vals) : null
                          // Color scale: map each value to green (low) → yellow (mid) → red (high)
                          const colorFor = (v: number) => {
                            if (!stats || stats.min === stats.max) return 'rgba(255,255,255,0.06)'
                            const t = (v - stats.min) / (stats.max - stats.min)
                            const r = Math.round(34 + (239 - 34) * t)
                            const g = Math.round(197 - (197 - 68) * t)
                            const b = Math.round(94 - (94 - 68) * t)
                            return `rgba(${r},${g},${b},0.18)`
                          }
                          return (
                            <div style={{ padding: '8px 14px 12px 98px', background: 'rgba(0,0,0,0.2)', fontSize: 11 }}>
                              <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Offset:</span>
                                <code style={{ color: '#22c55e' }}>0x{offset.toString(16).padStart(6, '0')}</code>
                                <button
                                  onClick={e => { e.stopPropagation(); copyToClipboard(`0x${offset.toString(16).padStart(6, '0')}`) }}
                                  style={{ padding: '2px 8px', fontSize: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, cursor: 'pointer' }}
                                >Copy offset</button>
                                {/* Only MAPs and CURVEs are worth opening in the Stage editor — VALUE scalars
                                    and VAL_BLKs don't have the row/col structure the editor expects. Also
                                    skip dead maps (no variance) where multiplying raw values does nothing
                                    useful — e.g. 1×1 all-zeros or all-same-constant lookup. */}
                                {(primary.type === 'MAP' || primary.type === 'CURVE') && (
                                  adoptedSigOffsets.has(offset) ? (
                                    <span style={{ padding: '2px 8px', fontSize: 10, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 4, fontWeight: 700 }}>
                                      ✓ Added to Stage Editor
                                    </span>
                                  ) : (stats && stats.min === stats.max) ? (
                                    <span title="All cells hold the same value — nothing to tune here. Multiplying a constant by a percentage just scales the constant; there's no gradient to modify." style={{ padding: '2px 8px', fontSize: 10, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}>
                                      Flat — not tunable
                                    </span>
                                  ) : (
                                    <button
                                      onClick={e => { e.stopPropagation(); openSigMatchInStageEditor(primary) }}
                                      style={{ padding: '3px 10px', fontSize: 10, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 800 }}
                                    >Open in Stage Editor →</button>
                                  )
                                )}
                                <span style={{ color: 'var(--text-muted)' }}>{primary.type} · {primary.rows}×{primary.cols} · {primary.family} · {isBE ? 'BE' : 'LE'} uint16</span>
                                {primary.portable ? (
                                  <span style={{ padding: '1px 6px', fontSize: 9, background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderRadius: 3 }}>PORTABLE</span>
                                ) : (
                                  <span style={{ padding: '1px 6px', fontSize: 9, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderRadius: 3 }}>PARTIAL</span>
                                )}
                                {/* v6: show verified physical unit next to the type. Only labeled when
                                    the scaling was confirmed across ≥2 training A2Ls — otherwise the
                                    preview stays raw. Separate from the LE/BE note because unit conveys
                                    different information (bar vs Nm vs mg/stk). */}
                                {primary.scalingVerified && primary.unit && (
                                  <span title={`Scaling verified from A2L COMPU_METHOD across multiple training pairs. factor=${primary.factor} offset=${primary.offsetVal ?? 0}`} style={{ padding: '1px 6px', fontSize: 9, background: 'rgba(0,174,200,0.15)', color: 'var(--accent)', borderRadius: 3, fontWeight: 700 }}>
                                    ✓ {primary.unit}
                                  </span>
                                )}
                                {stats && (
                                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10 }}>
                                    min=<b style={{ color: '#e5e5e5' }}>{stats.min}</b>{' '}
                                    max=<b style={{ color: '#e5e5e5' }}>{stats.max}</b>{' '}
                                    mean=<b style={{ color: '#e5e5e5' }}>{stats.mean}</b>{' '}
                                    ({stats.n} cells)
                                  </span>
                                )}
                              </div>
                              <div style={{ marginBottom: 8, color: '#e5e5e5' }}>{primary.desc}</div>

                              {/* Map value preview grid — raw uint16 values at this offset.
                                  Scaling factor is unknown per family so shows raw values.
                                  Heatmap colors let the user eyeball whether it looks like
                                  a real tunable map (gradient) vs a random hit (speckle). */}
                              {vals ? (
                                <div style={{ marginBottom: 8, overflowX: 'auto' }}>
                                  <table style={{ borderCollapse: 'collapse', fontSize: 10, fontFamily: 'monospace' }}>
                                    <tbody>
                                      {vals.map((row, r) => (
                                        <tr key={r}>
                                          {row.map((v, c) => (
                                            <td key={c} style={{
                                              padding: '2px 5px', minWidth: 32, textAlign: 'right',
                                              border: '1px solid rgba(255,255,255,0.05)',
                                              background: colorFor(v),
                                              color: '#e5e5e5',
                                            }}>{v}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div style={{ marginBottom: 8, color: '#ef4444', fontSize: 10 }}>
                                  Map preview unavailable — offset out of bounds for this binary.
                                </div>
                              )}

                              {matches.length > 1 && (
                                <div>
                                  <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {matches.length} A2L map names share this 24-byte signature (Bosch-default identical data):
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8 }}>
                                    {matches.map((m, i) => (
                                      <div key={i} style={{ color: '#e5e5e5', display: 'flex', gap: 8 }}>
                                        <span style={{ color: 'var(--text-muted)', minWidth: 20 }}>{i + 1}.</span>
                                        <span style={{ fontWeight: 600, flex: 1 }}>{m.name}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: 10, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.desc}>{m.desc}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                  {groups.length > 500 && (
                    <div style={{ padding: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
                      Showing first 500 of {groups.length} offset groups — use search above to narrow down
                    </div>
                  )}
                  {groups.length === 0 && (
                    <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>
                      No maps match your filter.
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Binary Map Scanner ─────────────────────────────────────────────── */}
      {(scanResult || scannerBusy) && (
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
            {scannerBusy ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Scanning...</span>
            ) : scanResult ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {memoryMatches.length + scanResult.candidates.length + scanResult.unmatched.length} candidate maps found
                {memoryMatches.length > 0 && (
                  <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 6 }}>
                    {memoryMatches.length} from memory
                  </span>
                )}
                {scanResult.candidates.length > 0 && (
                  <span style={{ color: '#22c55e', fontWeight: 700, marginLeft: 6 }}>
                    {scanResult.candidates.length} identified
                  </span>
                )}
              </span>
            ) : null}
            <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: showScanner ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </div>

          {showScanner && scanResult && (
            <div style={{ padding: '12px 16px', maxHeight: 420, overflowY: 'auto' }}>
              {/* Memory-confirmed maps — 100% confidence because user previously
                  confirmed these exact Kf_ fingerprints. Rendered first so
                  they're visually the top of the pile. */}
              {memoryMatches.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
                    ✓ Known Maps from Memory ({memoryMatches.length})
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {memoryMatches.slice(0, 20).map((m, idx) => (
                      <div key={idx} style={{
                        padding: '6px 12px', borderRadius: 6,
                        background: 'rgba(0,174,200,0.06)', border: '1px solid rgba(0,174,200,0.2)',
                        display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-secondary)',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 72, color: 'var(--accent)' }}>
                          0x{m.candidate.offset.toString(16).toUpperCase().padStart(6, '0')}
                        </span>
                        <span style={{ minWidth: 40 }}>{m.candidate.rows}×{m.candidate.cols}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.entry.mapName}
                          {m.entry.unit && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 10 }}>{m.entry.unit}</span>}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          seen {m.entry.seenCount}×
                        </span>
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          background: 'rgba(0,174,200,0.15)', color: 'var(--accent)', fontWeight: 700,
                        }}>
                          MEMORY
                        </span>
                      </div>
                    ))}
                    {memoryMatches.length > 20 && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: 4 }}>
                        +{memoryMatches.length - 20} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Classified candidates — grouped by map type */}
              {scanResult.candidates.length > 0 && (() => {
                // Group candidates by their best match mapDefId
                const groups = new Map<string, typeof scanResult.candidates>()
                for (const cc of scanResult.candidates) {
                  const key = cc.bestMatch?.mapDefId ?? 'unknown'
                  const arr = groups.get(key) || []
                  arr.push(cc)
                  groups.set(key, arr)
                }
                const catColors: Record<string, string> = {
                  boost: '#3b82f6', fuel: '#f59e0b', torque: '#ef4444', ignition: '#a855f7',
                  limiter: '#6b7280', emission: '#10b981', smoke: '#f97316', misc: '#6b7280',
                }
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
                      Identified Maps ({groups.size} types, {scanResult.candidates.length} total)
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {[...groups.entries()].map(([mapDefId, members]) => {
                        const primary = members[0]
                        const best = primary.bestMatch!
                        const conf = best.score
                        const confColor = conf >= 75 ? '#22c55e' : conf >= 55 ? '#f59e0b' : '#f97316'
                        const catColor = catColors[best.category] ?? '#6b7280'
                        const variantCount = members.length
                        return (
                          <div key={mapDefId} style={{
                            padding: '8px 12px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}40`,
                                textTransform: 'uppercase',
                              }}>
                                {best.category}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                                {best.mapDefName}
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: `${confColor}15`, color: confColor, border: `1px solid ${confColor}40`,
                              }}>
                                {conf}%
                              </span>
                              {variantCount > 1 && (
                                <span style={{
                                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                                  background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)',
                                }}>
                                  {variantCount} variants
                                </span>
                              )}
                            </div>
                            {/* Show addresses for all variants */}
                            <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {members.slice(0, 6).map((cc, i) => (
                                <span key={i} style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-muted)', padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.03)' }}>
                                  0x{cc.candidate.offset.toString(16).toUpperCase().padStart(6, '0')} ({cc.candidate.rows}×{cc.candidate.cols})
                                </span>
                              ))}
                              {members.length > 6 && (
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>+{members.length - 6} more</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Unmatched candidates */}
              {scanResult.unmatched.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
                    Unknown Maps ({scanResult.unmatched.length})
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {scanResult.unmatched.slice(0, 15).map((cc, idx) => {
                      // Surface the scanner's top hypothesis even though it was below
                      // the assignment threshold — gives the user something to confirm
                      // or reject instead of a blank "UNKNOWN".
                      const topGuess = cc.hypotheses[0]
                      return (
                      <div key={idx} style={{
                        padding: '6px 12px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--text-muted)',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 72, color: 'var(--text-secondary)' }}>
                          0x{cc.candidate.offset.toString(16).toUpperCase().padStart(6, '0')}
                        </span>
                        <span style={{ minWidth: 40 }}>{cc.candidate.rows}×{cc.candidate.cols}</span>
                        <span>Range: {cc.candidate.valueRange.min}–{cc.candidate.valueRange.max}</span>
                        {topGuess ? (
                          <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>
                            maybe {topGuess.mapDefName}
                            <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({topGuess.score}%)</span>
                          </span>
                        ) : null}
                        {cc.candidate.axisX && (
                          <span style={{ marginLeft: 'auto' }}>
                            RPM: {cc.candidate.axisX.min}–{cc.candidate.axisX.max}
                          </span>
                        )}
                        <span style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          background: 'rgba(107,114,128,0.1)', color: '#6b7280',
                        }}>
                          UNKNOWN
                        </span>
                      </div>
                      )
                    })}
                    {scanResult.unmatched.length > 15 && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: 4 }}>
                        +{scanResult.unmatched.length - 15} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Re-scan button */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 10, padding: '4px 12px' }}
                  onClick={() => {
                    if (!fileBuffer) return
                    setScannerBusy(true)
                    setTimeout(async () => {
                      try {
                        const ecuForScan = selectedEcu ?? detected?.def ?? null
                        const candidates = scanBinaryForMaps(fileBuffer, ecuForScan)
                        if (candidates.length > 0 && ecuForScan) {
                          // Memory lookup first — confirmed fingerprints win.
                          const mem = await applyMemoryToCandidates(fileBuffer, candidates)
                          setMemoryMatches(mem.matched)
                          const result = classifyCandidates(mem.unmatched, ecuForScan, {
                            a2lMaps: a2lMaps.length > 0 ? a2lMaps : undefined,
                          })
                          setScanResult(result)
                        }
                      } catch (e) { console.warn('Rescan failed:', e) }
                      setScannerBusy(false)
                    }, 50)
                  }}
                >
                  ↺ Rescan{a2lMaps.length > 0 ? ' (with A2L anchors)' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn-secondary" onClick={() => setStep(0)}>Back</button>
        <button className="btn-primary" disabled={!selectedEcuId} onClick={() => setStep(2)}>
          Continue →
        </button>
      </div>
    </div>
  )

  const STAGE_INFO: Record<Stage, { power: string; boost: string; torque: string; desc: string; color: string }> = {
    1: { power: '+15–25%', boost: '+18%', torque: '+28%', desc: 'Safe bolt-on gains on stock hardware. Raises torque ceiling, fuel quantity, smoke limiter and boost target in step. No turbo or intercooler upgrade required. Ideal for daily drivers.', color: '#3b82f6' },
    2: { power: '+25–40%', boost: '+28%', torque: '+45%', desc: 'Performance build. Uprated intercooler and sports exhaust recommended. SOI advance added for combustion efficiency. Significant power gains with proper supporting hardware.', color: '#f59e0b' },
    3: { power: '+40–60%', boost: '+40%', torque: '+65%', desc: 'Track/motorsport build. Hybrid or upgraded turbo, forged internals and uprated fuelling hardware required. Full map chain raised to maximum safe limits.', color: '#ef4444' },
  }

  const renderStep2 = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Remap Stage
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {([1, 2, 3] as Stage[]).map(s => {
            const info = STAGE_INFO[s]
            const active = stage === s
            return (
              <div
                key={s}
                onClick={() => setStage(s)}
                style={{
                  padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${active ? info.color : 'var(--border)'}`,
                  background: active ? `${info.color}11` : 'var(--bg-card)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? info.color : 'var(--bg-primary)',
                    color: active ? '#000' : 'var(--text-muted)', fontWeight: 800, fontSize: 12,
                  }}>
                    {s}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: active ? info.color : 'var(--text-secondary)' }}>Stage {s}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: active ? info.color : 'var(--text-primary)', marginBottom: 2 }}>{info.power}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>power gain</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(0,174,200,0.1)', color: 'var(--accent)', fontWeight: 700 }}>
                    Boost {info.boost}
                  </span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>
                    Torq {info.torque}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{info.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Add-ons
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ADDONS.map(addon => {
            const active = addons.includes(addon.id as AddonId)
            // Check ECU compatibility
            const compatible = !addon.compatEcus || addon.compatEcus.some(c => selectedEcuId === c || selectedEcuId.startsWith(c + '_'))
            // Check mutual exclusion — dimmed (but still clickable to swap) when its paired addon is active
            const mutualId = ADDON_MUTEX[addon.id as AddonId]
            const mutuallyBlocked = !!mutualId && addons.includes(mutualId)
            const canInteract = compatible && !mutuallyBlocked || active
            return (
              <div
                key={addon.id}
                onClick={() => compatible && toggleAddon(addon.id as AddonId)}
                style={{
                  padding: '12px 14px', borderRadius: 8, cursor: compatible ? 'pointer' : 'not-allowed',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(0,174,200,0.06)' : 'var(--bg-card)',
                  opacity: compatible ? (mutuallyBlocked ? 0.35 : 1) : 0.4,
                  transition: 'all 0.12s ease',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                  background: active ? 'var(--accent)' : 'var(--bg-primary)',
                  border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>{addon.name}</span>
                    {!compatible && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700, padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(239,68,68,0.4)' }}>Incompatible ECU</span>}
                    {mutuallyBlocked && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700, padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)' }}>Select to swap</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>{addon.desc}</div>
                  {addon.warning && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#f59e0b' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      {addon.warning}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── DTC Removal panel — shown when any emission addon is active ────────── */}
      {(() => {
        const activeDtcGroups = getActiveDTCGroups(addons)
        if (activeDtcGroups.length === 0) return null
        return (
          <div style={{ marginBottom: 24, padding: '14px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>🔇 DTC Suppression</span>
              <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)' }}>
                {activeDtcGroups.reduce((acc, g) => acc + g.codes.length, 0)} codes
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 12, lineHeight: 1.5 }}>
              The following OBD-II fault codes will be suppressed automatically during export by zeroing their monitoring enable flags in the ECU binary. Patterns are searched per ECU family — only confirmed pattern matches are written.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeDtcGroups.map(g => (
                <div key={g.id} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{g.label}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      via {g.addonId}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {g.codes.map(c => (
                      <span key={c} style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{g.note}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 10.5, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
              ℹ Pattern-based suppression. Some ECU variants may not have matching byte signatures — in that case no bytes are changed and the DTC may remain active. A2L-based suppression is more reliable and will be applied if an A2L file is loaded.
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setStep(1)} disabled={isExtracting}>Back</button>
        <button
          className="btn-primary"
          onClick={handleConfigureNext}
          disabled={isExtracting}
          style={isExtracting ? { opacity: 0.7, cursor: 'wait' } : undefined}
        >
          {isExtracting ? '⏳ Extracting maps… (can take 3-5s on large binaries)' : 'Preview Changes →'}
        </button>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div>
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{selectedEcu?.name}</strong> · Stage {stage}
        </span>
        {addons.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--accent)' }}>
            Addons: {addons.join(', ')}
          </span>
        )}
        {(() => {
          // Main counts exclude A2L extras (a2l_extra_* prefix) since they aren't
          // part of the curated Stage-N card set — they're available in the
          // Advanced A2L section below but shouldn't be counted as "hidden background".
          const mainMaps = extractedMaps.filter(m => !m.mapDef.id.startsWith('a2l_extra_'))
          const visibleFound = mainMaps.filter(m => m.found && m.mapDef.showPreview).length
          const visibleTotal = mainMaps.filter(m => m.mapDef.showPreview).length
          const totalFound = mainMaps.filter(m => m.found).length
          const totalAll = mainMaps.length
          const hiddenFound = totalFound - visibleFound
          return (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{visibleFound}</strong> / {visibleTotal} shown
              <span style={{ marginLeft: 6, opacity: 0.6 }}>
                · <strong style={{ color: 'var(--text-primary)' }}>{totalFound}</strong> / {totalAll} total {hiddenFound > 0 ? `(+${hiddenFound} background)` : ''}
              </span>
              {a2lFallbackCount > 0 && (
                <span style={{ marginLeft: 8, color: '#22c55e', fontWeight: 700 }}>
                  ({a2lFallbackCount} via A2L/DRT ✓)
                </span>
              )}
              {scannerFallbackCount > 0 && (
                <span style={{ marginLeft: 8, color: '#a855f7', fontWeight: 700 }} title="Located by binary scanner + classifier — axis-pattern match to map definition">
                  ({scannerFallbackCount} via SCAN)
                </span>
              )}
            </span>
          )
        })()}
      </div>

      {/* Stage Intensity slider removed in v3.5.25 — the Stage 1/2/3 selection on the
           Configure step is the intended UI for staging aggressiveness. */}

      {/* Scanner candidates removed — only show definition-matched maps */}

      {/* A2L fallback diagnostic — shown when all maps fail */}
      {extractedMaps.length > 0 && extractedMaps.filter(m => m.found).length === 0 && a2lValidation.length > 0 && (() => {
        const vCount = a2lValidation.filter(v => v.status === 'valid').length
        const uCount = a2lValidation.filter(v => v.status === 'uncertain').length
        return (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f87171' }}>⚠ No maps found</strong> — binary signatures don't match this ECU variant and no A2L/DRT was loaded.{' '}
            {vCount === 0 && uCount === 0
              ? 'Load an A2L or DRT file from the library (go Back → ECU Detected) to locate maps by address.'
              : vCount === 0
                ? `A2L validation found only ${uCount} uncertain address${uCount !== 1 ? 'es' : ''} — the A2L may be for a different software version. Try loading a DRT file from the library instead.`
                : 'A2L fallback failed to read valid data at the validated addresses. Try a DRT file from the library.'}
          </div>
        )
      })()}

      {/* ── Map chain dependency warnings ─────────────────────────────────────
           EDC17 tune chain: Drivers Wish → Torque Limit → Torque→IQ → IQ →
           Smoke Limiter (parallel cap). Boost chain: N75 duty → Boost Target.
           If a downstream map is found but its upstream guard is missing, warn the tuner.
      */}
      {extractedMaps.length > 0 && (() => {
        // ── Generalised map chain warnings — works for any ECU family ──────────
        // Uses category-based checks so EDC16, MED17, SIMOS all get warnings too.
        const pfx = selectedEcu?.id ?? ''
        const foundId  = (id: string)  => extractedMaps.find(m => m.mapDef.id === id)?.found ?? false
        const hasCat   = (cat: string) => extractedMaps.some(m => m.mapDef.category === cat && m.found)
        const defExists = (id: string) => extractedMaps.some(m => m.mapDef.id === id)
        const warnings: { key: string; msg: string }[] = []

        // Smoke limiter: any diesel with fuel maps found but smoke category missing
        if (hasCat('fuel') && defExists(`${pfx}_smoke_limiter`) && !foundId(`${pfx}_smoke_limiter`)) {
          warnings.push({ key: 'smoke', msg: '⚠ Smoke Limiter not found — fuel quantity gains will be silently capped at low airflow. Load an A2L/DRT with LmbdSmkLow / Qsmk_MAP to unlock full IQ range.' })
        }
        // Torque→IQ bridge: needed on any ECU that has this map defined
        if (hasCat('fuel') && defExists(`${pfx}_torque_iq`) && !foundId(`${pfx}_torque_iq`)) {
          warnings.push({ key: 'trq2iq', msg: '⚠ Torque→IQ map not found — injector demand disconnected from driver torque request. Stage gains will be incomplete without this bridge map.' })
        }
        // Driver's Wish: if torque limit is found but pedal mapping is missing
        if (foundId(`${pfx}_torque_limit`) && defExists(`${pfx}_drivers_wish`) && !foundId(`${pfx}_drivers_wish`)) {
          warnings.push({ key: 'drvwsh', msg: "⚠ Driver's Wish map not found — pedal-to-torque conversion unchanged. Throttle response and peak torque demand will remain at stock values despite torque limit raise." })
        }
        // N75/boost chain: duty raised but ceiling unchanged
        if (extractedMaps.some(m => m.found && m.mapDef.id.includes('n75')) && !hasCat('boost')) {
          warnings.push({ key: 'boosttgt', msg: '⚠ Boost Target map not found — N75 duty cycle was raised but the boost ceiling (pBoostSet) is unchanged. Actual boost gain will be limited.' })
        }

        // ── ME7-specific map chain warnings ──────────────────────────────────
        // LDRXN raised but invisible sub-chain limiters not found
        if (foundId('me7_boost_map') && defExists('me7_kfldhbn') && !foundId('me7_kfldhbn')) {
          warnings.push({ key: 'me7kfldhbn', msg: '⚠ ME7 KFLDHBN (Max Boost Pressure Ratio) not found — raising LDRXN without KFLDHBN leaves an invisible load ceiling that overrides the boost target. Car will feel like it has a boost leak. Must be raised alongside LDRXN.' })
        }
        if (foundId('me7_boost_map') && defExists('me7_ldrxnzk') && !foundId('me7_ldrxnzk')) {
          warnings.push({ key: 'me7ldrxnzk', msg: '⚠ ME7 LDRXNZK (Knock Fallback Boost) not found — under sustained knock the ECU drops to the stock low-boost fallback instead of the tuned value. Appears as intermittent boost drop on hard pulls.' })
        }
        if (foundId('me7_boost_map') && defExists('me7_kfldrl') && !foundId('me7_kfldrl')) {
          warnings.push({ key: 'me7kfldrl', msg: '⚠ ME7 KFLDRL (Wastegate Pre-Control) not found — the ECU has no feed-forward WGDC correction for the raised boost target. Boost build will be slow and the I-regulator will saturate, causing overshoot. Load an A2L to locate KFLDRL.' })
        }
        if (foundId('me7_kfldrl') && defExists('me7_kfldimx') && !foundId('me7_kfldimx')) {
          warnings.push({ key: 'me7kfldimx', msg: '⚠ ME7 KFLDIMX (Boost PID I-Limit) not found — the integral regulator ceiling is unchanged, limiting how much the PID can correct above the stock pre-control. Boost will fall short of the new target under load.' })
        }
        // KFMIRL raised without KFMIOP — torque model inconsistency
        if (foundId('me7_kfmirl') && defExists('me7_kfmiop') && !foundId('me7_kfmiop')) {
          warnings.push({ key: 'me7kfmiop', msg: '⚠ ME7 KFMIOP (Load→Torque forward map) not found — KFMIRL was raised but KFMIOP was not. The ECU torque model is now internally inconsistent. Closed-loop torque monitoring may oscillate or limit power unexpectedly.' })
        }
        // MLHFM not calibrated — all downstream calcs wrong
        if (foundId('me7_mlhfm') && defExists('me7_kfkhfm') && !foundId('me7_kfkhfm')) {
          warnings.push({ key: 'me7kfkhfm', msg: '⚠ ME7 KFKHFM (MAF Correction) not found — if the MAF sensor reading has errors at this load/RPM, the ECU will not correct for them. Fuelling and load accuracy depends on MLHFM + KFKHFM both being calibrated.' })
        }
        // ── Addon conflict warnings ──────────────────────────────────────────
        // Note: Pop & Bang / Popcorn Limiter are mutually exclusive in the UI (toggleAddon enforces this).
        // Launch Control + Rev Limiter Raise can both be selected — warn since LC takes precedence on rev limit maps.
        if (addons.includes('launchcontrol') && addons.includes('revlimit')) {
          warnings.push({ key: 'lc_revlimit_conflict', msg: '⚠ Launch Control and Rev Limiter Raise both active — Launch Control overrides the rev limit map (sets 2-step RPM). Rev Limiter Raise will have no effect while Launch Control is active. Select one or the other.' })
        }

        if (warnings.length === 0) return null
        return (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warnings.map(w => (
              <div key={w.key} style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.25)', fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
                {w.msg}
              </div>
            ))}
          </div>
        )
      })()}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {extractedMaps.map(m => {
          // Hide any map where showPreview is false (N75, DPF/EGR emission maps, misc internal maps).
          // These are located and modified by the engine but don't need a heatmap card shown to the tuner.
          if (!m.mapDef.showPreview) return null
          // Effective params: addon override takes precedence over stage params —
          // matches remapEngine.ts getParams() exactly so badge and preview are accurate.
          let effectiveParams = m.mapDef[`stage${stage}` as 'stage1' | 'stage2' | 'stage3']
          for (const addonId of addons) {
            if (m.mapDef.addonOverrides?.[addonId]) {
              effectiveParams = m.mapDef.addonOverrides[addonId]
              break
            }
          }
          // Apply custom multiplier override if tuner has set one
          const customMul = customMultipliers[m.mapDef.id]
          const params = customMul !== undefined
            ? { ...effectiveParams, multiplier: customMul }
            : effectiveParams
          // Badge: multiplier != 1 → show %; multiplier 0 with addend → show "SET"; addend-only → show physical delta
          const isSet = params.multiplier === 0 && params.addend !== undefined  // full replacement (e.g. popbang)
          const expectedPct = !isSet && params.multiplier !== undefined && params.multiplier !== 1
            ? (params.multiplier - 1) * 100
            : 0
          const expectedAddend = !isSet && params.multiplier === undefined && params.addend
            ? params.addend * m.mapDef.factor
            : 0
          // Stage default % for the reset button tooltip
          const stageDefaultMul = effectiveParams.multiplier ?? 1
          const stageDefaultPct = Math.round((stageDefaultMul - 1) * 100)

          return (
            <div
              key={m.mapDef.id}
              style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--bg-card)', border: `1px solid ${m.found ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CatBadge cat={m.mapDef.category} />
                {m.source === 'a2l' && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>A2L</span>
                )}
                {m.source === 'fixedOffset' && (
                  <span title="Located by hardcoded offset — lower confidence than signature match" style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>OFFSET</span>
                )}
                {m.source === 'scanner' && (
                  <span title="Located by binary scanner + classifier — matches axis pattern to map definition. Used for Delphi/non-Bosch formats." style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>SCAN</span>
                )}
                {m.source === 'signature' && m.mapDef.id.startsWith('sig_') && (
                  <span title="Added from the DAMOS Signature Scanner. Raw uint16 values (no curated stage config) — use the multiplier to apply a percentage, or Zone Edit for per-region changes." style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>SIG</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                  {m.mapDef.name}
                  {m.found && m.offset >= 0 && (
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.22)', fontFamily: 'monospace', marginLeft: 10 }}>
                      0x{m.offset.toString(16).toUpperCase().padStart(6, '0')}
                    </span>
                  )}
                </span>
                {m.found ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isSet && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#a855f7', padding: '2px 7px', borderRadius: 4, background: 'rgba(168,85,247,0.1)' }}>
                        SET {((params.addend ?? 0) * m.mapDef.factor + m.mapDef.offsetVal).toFixed(1)}{m.mapDef.unit ? m.mapDef.unit : ''}
                      </span>
                    )}
                    {!isSet && expectedPct > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', padding: '2px 7px', borderRadius: 4, background: 'rgba(0,174,200,0.1)' }}>
                        +{expectedPct.toFixed(0)}%
                      </span>
                    )}
                    {!isSet && expectedAddend !== 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', padding: '2px 7px', borderRadius: 4, background: 'rgba(0,174,200,0.1)' }}>
                        {expectedAddend > 0 ? '+' : ''}{expectedAddend.toFixed(1)}{m.mapDef.unit ? ` ${m.mapDef.unit}` : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Found</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {m.mapDef.critical && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                    )}
                    <span style={{ fontSize: 10, color: m.mapDef.critical ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                      {m.mapDef.critical ? 'Not Found (Critical)' : 'Not Found'}
                    </span>
                    {!a2lResult && (
                      <span style={{ fontSize: 9, color: 'rgba(0,174,200,0.65)', fontWeight: 700 }}>
                        → Load A2L
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                {m.mapDef.desc}
              </div>
              {m.found && (() => {
                const allVals = m.data.flatMap(r => r)
                if (allVals.length === 0) return null
                const mn = Math.min(...allVals)
                const mx = Math.max(...allVals)
                const unit = m.mapDef.unit ?? ''
                return (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.2px' }}>
                    {mn.toFixed(1)} – {mx.toFixed(1)}{unit ? ` ${unit}` : ''}
                  </div>
                )
              })()}
              {/* ── Per-map adjustment controls — show for:
                   • multiplier-based maps (always, including stock-default multiplier=1)
                   • addend-based maps (SOI etc) — uses its own Zone Editor in degrees mode
                   Fully addon-only maps (limiters) still skipped. ── */}
              {m.found && !isSet && (effectiveParams.multiplier !== undefined || m.mapDef.tuningMode === 'addend') && (() => {
                const isAddendModeCard = m.mapDef.tuningMode === 'addend'
                const mapAnchors = cellAnchors[m.mapDef.id] ?? {}
                const hasZone = Object.keys(mapAnchors).length > 0
                const isZoneOpen = zoneEditorMapId === m.mapDef.id
                // When zone editor is active, the "current %" badge reflects the default anchor value
                const currentPct = hasZone
                  ? Math.round((stageDefaultMul - 1) * 100)   // show stage default (zone controls per-cell)
                  : Math.round((params.multiplier ?? stageDefaultMul) * 100) - 100
                const isCustom = customMul !== undefined && !hasZone

                return (
                  <div style={{ marginTop: 6, marginBottom: 4 }}>
                    {/* ── Slider row (multiplier mode) / label-only row (addend mode) ── */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 7,
                      background: hasZone ? 'rgba(184,240,42,0.06)' : isCustom ? 'rgba(184,240,42,0.04)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${hasZone ? 'rgba(184,240,42,0.35)' : isCustom ? 'rgba(184,240,42,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {isAddendModeCard ? (hasZone ? 'Zone Δ°' : 'Timing Δ') : (hasZone ? 'Base %' : 'Adjustment')}
                      </span>
                      {isAddendModeCard ? (
                        // Addend mode: show current stage addend in degrees, no slider (use Zone Editor for per-cell tuning)
                        <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                          Stage {stage} default: <strong style={{ color: '#fff' }}>
                            {(effectiveParams.addend ?? 0) === 0
                              ? 'stock'
                              : `${(effectiveParams.addend ?? 0) > 0 ? '+' : ''}${((effectiveParams.addend ?? 0) * m.mapDef.factor).toFixed(1)}${m.mapDef.unit || '°'}`}
                          </strong>
                          {hasZone && (
                            <span style={{ marginLeft: 8, color: '#b8f02a', fontWeight: 700 }}>
                              · {Object.keys(cellAnchors[m.mapDef.id] ?? {}).length} cells tuned
                            </span>
                          )}
                          <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                            — use Zone Editor →
                          </span>
                        </span>
                      ) : (
                        <>
                          <input
                            type="range"
                            min={0} max={50} step={1}
                            value={currentPct}
                            disabled={hasZone}
                            onChange={e => {
                              const pct = parseInt(e.target.value)
                              setCustomMultipliers(prev => ({ ...prev, [m.mapDef.id]: 1 + pct / 100 }))
                            }}
                            style={{ flex: 1, accentColor: 'var(--accent)', cursor: hasZone ? 'not-allowed' : 'pointer', minWidth: 80, opacity: hasZone ? 0.4 : 1 }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: hasZone ? 'rgba(184,240,42,0.5)' : isCustom ? '#b8f02a' : 'var(--accent)', minWidth: 34, textAlign: 'right' }}>
                              {currentPct >= 0 ? '+' : ''}{currentPct}%
                            </span>
                            <input
                              type="number" min={0} max={50}
                              value={currentPct}
                              disabled={hasZone}
                              onChange={e => {
                                const pct = Math.max(0, Math.min(50, parseInt(e.target.value) || 0))
                                setCustomMultipliers(prev => ({ ...prev, [m.mapDef.id]: 1 + pct / 100 }))
                              }}
                              style={{ width: 44, padding: '3px 5px', borderRadius: 5, border: `1px solid ${isCustom ? 'rgba(184,240,42,0.35)' : 'rgba(255,255,255,0.12)'}`, background: 'rgba(0,0,0,0.3)', color: hasZone ? 'rgba(255,255,255,0.3)' : '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' }}
                            />
                          </div>
                        </>
                      )}
                      {isCustom && !hasZone && !isAddendModeCard && (
                        <button
                          onClick={() => setCustomMultipliers(prev => { const n = { ...prev }; delete n[m.mapDef.id]; return n })}
                          title={`Reset to Stage ${stage} default (+${stageDefaultPct}%)`}
                          style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          ↺ S{stage} default
                        </button>
                      )}
                      {/* Zone Editor toggle button */}
                      <button
                        onClick={() => setZoneEditorMapId(isZoneOpen ? null : m.mapDef.id)}
                        title={isZoneOpen ? 'Close Zone Editor' : 'Open Zone Editor — set different % per RPM/load cell (ECM Titanium style)'}
                        style={{
                          fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
                          border: `1px solid ${isZoneOpen || hasZone ? 'rgba(184,240,42,0.5)' : 'rgba(255,255,255,0.15)'}`,
                          background: isZoneOpen || hasZone ? 'rgba(184,240,42,0.12)' : 'rgba(255,255,255,0.04)',
                          color: isZoneOpen || hasZone ? '#b8f02a' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {hasZone ? `📐 Zones (${Object.keys(mapAnchors).length} cells)` : '📐 Zone Editor'}
                      </button>
                    </div>

                    {/* ── Zone Editor panel (shown when open) ── */}
                    {isZoneOpen && (() => {
                      const a2lMapForZone = a2lMaps.find(am => am.name === m.mapDef.name)
                      // Build evenly-spaced axis values from A2L min/max when no explicit breakpoints
                      const buildAxisVals = (size: number, min: number, max: number) =>
                        Array.from({ length: size }, (_, i) => min + (max - min) * i / Math.max(size - 1, 1))
                      const xVals = a2lMapForZone?.axisX
                        ? buildAxisVals(a2lMapForZone.axisX.size, a2lMapForZone.axisX.min, a2lMapForZone.axisX.max)
                        : undefined
                      const yVals = a2lMapForZone?.axisY
                        ? buildAxisVals(a2lMapForZone.axisY.size, a2lMapForZone.axisY.min, a2lMapForZone.axisY.max)
                        : undefined
                      return (
                        <ZoneEditor
                          rows={m.mapDef.rows}
                          cols={m.mapDef.cols}
                          edits={mapAnchors}
                          stageMul={m.mapDef.tuningMode === 'addend' ? (params.addend ?? 0) : (params.multiplier ?? stageDefaultMul)}
                          physData={m.data}
                          factor={m.mapDef.factor}
                          offsetVal={m.mapDef.offsetVal ?? 0}
                          unit={m.mapDef.unit ?? ''}
                          axisXLabel={a2lMapForZone?.axisX?.label}
                          axisYLabel={a2lMapForZone?.axisY?.label}
                          axisXVals={xVals}
                          axisYVals={yVals}
                          tuningMode={m.mapDef.tuningMode ?? 'multiplier'}
                          defaultStep={m.mapDef.zoneStep}
                          mapName={m.mapDef.name}
                          mapCategory={m.mapDef.category}
                          onAskAI={onAskAICustom}
                          onApply={newEdits => setCellAnchors(prev => ({ ...prev, [m.mapDef.id]: newEdits }))}
                          onClearAll={() => setCellAnchors(prev => { const n = { ...prev }; delete n[m.mapDef.id]; return n })}
                        />
                      )
                    })()}
                  </div>
                )
              })()}
              {(() => {
                const a2lMap = a2lMaps.find(am => am.name === m.mapDef.name)
                return a2lMap ? (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7, marginBottom: m.found && m.mapDef.showPreview ? 6 : 0 }}>
                    {a2lMap.axisX.label}{a2lMap.axisY ? ` \u00d7 ${a2lMap.axisY.label}` : ''}
                  </div>
                ) : null
              })()}
              {m.found && m.mapDef.showPreview && (() => {
                // Build per-cell grid for the After preview if zone anchors are set.
                // Addend-mode maps use a grid of raw addends (0 = stock); multiplier-mode use
                // absolute multipliers (1.0 = stock).
                const mapAnchors = cellAnchors[m.mapDef.id] ?? {}
                const hasZone = Object.keys(mapAnchors).length > 0
                const isAddendModePrev = m.mapDef.tuningMode === 'addend'
                const defaultValForGrid = isAddendModePrev
                  ? (params.addend ?? 0)
                  : (params.multiplier ?? stageDefaultMul)
                const cellGrid = hasZone
                  ? computeCellGrid(mapAnchors, m.mapDef.rows, m.mapDef.cols, defaultValForGrid)
                  : null
                return (
                  <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                    <MiniHeatmap data={m.data} label="Before (stock)" mapCategory={m.mapDef.category} allowUniform={m.mapDef.allowUniform} />
                    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: 14 }}>→</div>
                    <MiniHeatmap
                      data={m.data.map((row, r) => row.map((v, c) => {
                        // Mirror remapEngine.ts applyParams exactly: operate in RAW space,
                        // then convert back to physical.
                        const rowStart = params.lastNRows !== undefined ? Math.max(0, m.data.length - params.lastNRows) : 0
                        const colStart = params.lastNCols !== undefined ? Math.max(0, row.length - params.lastNCols) : 0
                        if (r < rowStart || c < colStart) return v
                        const f   = m.mapDef.factor   || 1
                        const off = m.mapDef.offsetVal ?? 0
                        const oldRaw = f !== 0 ? (v - off) / f : 0
                        let newRaw = oldRaw
                        const cellAnchorVal = cellGrid?.[r]?.[c]
                        if (isAddendModePrev) {
                          // Addend mode: cellGrid holds raw addend delta; fall back to stage addend
                          if (cellAnchorVal !== undefined) newRaw = oldRaw + cellAnchorVal
                          else if (params.addend !== undefined) newRaw = oldRaw + params.addend
                        } else {
                          // Multiplier mode: cellGrid holds multiplier
                          if (cellAnchorVal !== undefined) newRaw = oldRaw * cellAnchorVal
                          else if (params.multiplier !== undefined) newRaw = oldRaw * params.multiplier
                          if (params.addend !== undefined) newRaw += params.addend
                        }
                        if (params.clampMax !== undefined) newRaw = Math.min(newRaw, params.clampMax)
                        if (params.clampMin !== undefined) newRaw = Math.max(newRaw, params.clampMin)
                        return newRaw * f + off
                      }))}
                      label={`After (Stage ${stage}${addons.length > 0 ? ' + addons' : ''}${hasZone ? ' + zones' : ''})`}
                      mapCategory={m.mapDef.category}
                      allowUniform={m.mapDef.allowUniform}
                    />
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* ── Advanced A2L maps — everything the loaded A2L exposes that isn't ──
           in the Stage-N curated cards. Grouped by category, collapsible.
           Clicking a map opens it in the existing Zone Editor; any edits flow
           through the same customMultipliers / cellAnchors pipeline, so the
           Build Remap button writes them naturally without touching the
           remap engine. Untouched extras default to 1× (no change).
      */}
      {(() => {
        const extras = extractedMaps.filter(m => m.found && m.mapDef.id.startsWith('a2l_extra_'))
        if (extras.length === 0) return null

        // Group by category
        const byCat: Record<string, typeof extras> = {}
        for (const e of extras) {
          const c = e.mapDef.category || 'misc'
          if (!byCat[c]) byCat[c] = []
          byCat[c].push(e)
        }
        // Stable category order
        const catOrder: MapCategory[] = ['boost', 'fuel', 'torque', 'ignition', 'smoke', 'limiter', 'emission', 'misc']
        const cats = catOrder.filter(c => byCat[c] && byCat[c].length > 0)

        const totalEdited = extras.filter(e => customMultipliers[e.mapDef.id] !== undefined || (cellAnchors[e.mapDef.id] && Object.keys(cellAnchors[e.mapDef.id]).length > 0)).length

        return (
          <div style={{ marginBottom: 20, borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div
              onClick={() => setAdvancedSectionOpen(!advancedSectionOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {advancedSectionOpen ? '▼' : '▶'} A2L Maps (Advanced)
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                {extras.length} additional maps from loaded A2L — click any to tune beyond the Stage {stage} cards
              </span>
              {totalEdited > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)' }}>
                  {totalEdited} edited
                </span>
              )}
            </div>

            {advancedSectionOpen && (
              <div style={{ padding: '0 16px 12px 16px', borderTop: '1px solid var(--border)' }}>
                {cats.map(cat => {
                  const list = byCat[cat]
                  const editedInCat = list.filter(e => customMultipliers[e.mapDef.id] !== undefined || (cellAnchors[e.mapDef.id] && Object.keys(cellAnchors[e.mapDef.id]).length > 0)).length
                  const open = advancedCatOpen[cat] ?? false
                  return (
                    <div key={cat} style={{ marginTop: 10 }}>
                      <div
                        onClick={() => setAdvancedCatOpen({ ...advancedCatOpen, [cat]: !open })}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', userSelect: 'none', background: 'rgba(0,0,0,0.18)', borderRadius: 6 }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {open ? '▼' : '▶'} {cat.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                          {list.length} maps
                        </span>
                        {editedInCat > 0 && (
                          <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>{editedInCat} edited</span>
                        )}
                      </div>
                      {open && (
                        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                          {list
                            .slice()
                            .sort((a, b) => a.mapDef.name.localeCompare(b.mapDef.name))
                            .map(m => {
                              const id = m.mapDef.id
                              const isMapOpen = zoneEditorMapId === id
                              const hasEdit = customMultipliers[id] !== undefined || (cellAnchors[id] && Object.keys(cellAnchors[id]).length > 0)
                              const vals = m.data.flatMap(r => r)
                              const vMin = vals.length ? Math.min(...vals) : 0
                              const vMax = vals.length ? Math.max(...vals) : 0
                              return (
                                <div key={id} style={{
                                  background: hasEdit ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
                                  border: `1px solid ${hasEdit ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.05)'}`,
                                  borderRadius: 6, padding: '6px 10px',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)', minWidth: 78 }}>
                                      0x{m.offset.toString(16).toUpperCase().padStart(6, '0')}
                                    </span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {m.mapDef.name}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
                                      {m.mapDef.rows}×{m.mapDef.cols}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 110, textAlign: 'right', fontFamily: 'monospace' }}>
                                      {vMin.toFixed(1)} – {vMax.toFixed(1)}
                                    </span>
                                    <button
                                      className="btn-secondary"
                                      style={{ fontSize: 10, padding: '2px 10px' }}
                                      onClick={() => setZoneEditorMapId(isMapOpen ? null : id)}
                                    >
                                      {hasEdit ? '📐 Edited' : isMapOpen ? 'Close' : 'Edit'}
                                    </button>
                                  </div>
                                  {isMapOpen && (
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                      <ZoneEditor
                                        rows={m.mapDef.rows}
                                        cols={m.mapDef.cols}
                                        edits={cellAnchors[id] ?? {}}
                                        stageMul={customMultipliers[id] ?? 1}
                                        physData={m.data}
                                        factor={m.mapDef.factor}
                                        offsetVal={m.mapDef.offsetVal}
                                        unit={m.mapDef.unit}
                                        axisXLabel="X"
                                        axisYLabel="Y"
                                        mapName={m.mapDef.name}
                                        mapCategory={m.mapDef.category}
                                        onAskAI={onAskAICustom}
                                        onApply={(next) => setCellAnchors({ ...cellAnchors, [id]: next })}
                                        onClearAll={() => { const c = { ...cellAnchors }; delete c[id]; setCellAnchors(c); const cm = { ...customMultipliers }; delete cm[id]; setCustomMultipliers(cm) }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setStep(2)}>Back</button>
        <button className="btn-primary" onClick={handleBuildRemap}>
          Build Remap →
        </button>
      </div>
    </div>
  )

  const renderStep4 = () => {
    if (!remapResult || !selectedEcu) return null
    const { summary } = remapResult
    // Verify on the OUTPUT buffer — correctChecksum was already applied in handleBuildRemap.
    // valid=true means the correction succeeded. valid=false only occurs for algo='none' (SIMOS18)
    // or an ECU whose checksum algo we don't handle — in that case warn the tuner.
    const cksm = verifyChecksum(remapResult.modifiedBuffer, selectedEcu)
    const checksumHandled = selectedEcu.checksumAlgo !== 'none' && selectedEcu.checksumAlgo !== 'unknown'

    return (
      <div>
        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Maps Modified', value: String(summary.mapsModified), unit: '', color: 'var(--accent)', zero: summary.mapsModified === 0 },
            { label: 'Boost Change', value: summary.boostChangePct > 0 ? `+${summary.boostChangePct.toFixed(1)}` : '–', unit: summary.boostChangePct > 0 ? '%' : '', color: '#3b82f6', zero: summary.boostChangePct === 0 },
            { label: 'Torque Change', value: summary.torqueChangePct > 0 ? `+${summary.torqueChangePct.toFixed(1)}` : '–', unit: summary.torqueChangePct > 0 ? '%' : '', color: '#f59e0b', zero: summary.torqueChangePct === 0 },
            { label: 'Fuel Change', value: summary.fuelChangePct > 0 ? `+${summary.fuelChangePct.toFixed(1)}` : '–', unit: summary.fuelChangePct > 0 ? '%' : '', color: '#a855f7', zero: summary.fuelChangePct === 0 },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center', opacity: stat.zero ? 0.45 : 1 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: stat.zero ? 'var(--text-muted)' : stat.color, marginBottom: 2 }}>
                {stat.value}{stat.unit}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Checksum status */}
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: !checksumHandled ? 'rgba(245,158,11,0.08)' : cksm.valid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${!checksumHandled ? 'rgba(245,158,11,0.25)' : cksm.valid ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: !checksumHandled ? '#f59e0b' : cksm.valid ? '#22c55e' : '#ef4444' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2,
              color: !checksumHandled ? '#f59e0b' : cksm.valid ? '#22c55e' : '#ef4444' }}>
              {!checksumHandled
                ? 'Checksum — Manual Correction Required'
                : cksm.valid
                  ? '✓ Checksum Corrected and Verified'
                  : '✗ Checksum Correction Failed — Do Not Flash'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              Algorithm: {cksm.algo} · Offset: 0x{cksm.offset.toString(16).toUpperCase()}
              {!checksumHandled && ' · Use WinOLS or your flashing tool to correct before writing to ECU'}
            </div>
          </div>
        </div>

        {/* Block-level checksum — show result, success, or warning depending on detection outcome.
            Three states: (1) block table found + corrected, (2) monolithic Bosch header (no blocks needed),
            (3) no block table AND no monolithic header (genuine warning — user needs external tool). */}
        {['edc17', 'edc16', 'simos18', 'simos10', 'simos11', 'pcr21', 'med17'].includes(selectedEcu?.id ?? '') && (
          blockResult && blockResult.blocksFixed > 0 ? (
            // Block table was found and corrected automatically
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>✅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 3 }}>
                  Block Checksums Auto-Corrected — {blockResult.blocksFixed} segment{blockResult.blocksFixed > 1 ? 's' : ''} fixed
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  Block descriptor table found at 0x{blockResult.tableOffset.toString(16).toUpperCase()} · Algorithm: {blockResult.initMode === 'blockid' ? 'Bosch block-ID CRC32' : 'Standard CRC32'} · File is ready to flash.
                </div>
              </div>
            </div>
          ) : blockResult && blockResult.initMode === 'monolithic' ? (
            // v3.11.16: EDC16U-style monolithic cal file — Bosch FADECAFE/CAFEAFFE descriptor
            // at 0x40000 confirms single-region file with only a header CRC. No block table
            // to worry about. The main bosch-crc32 already corrected at checksumOffset is sufficient.
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>✅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 3 }}>
                  Monolithic Cal File — Single Header CRC Sufficient
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  Bosch program descriptor (FADECAFE/CAFEAFFE magic) found at 0x{blockResult.tableOffset.toString(16).toUpperCase()}.
                  This variant has no separate block CRC table — the main header checksum (already corrected above) is the only checksum.
                  File is ready to flash.
                </div>
              </div>
            </div>
          ) : (
            // Genuine warning — no block table, no monolithic header detected either.
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', marginBottom: 3 }}>Block Checksums — Verify Before Flashing</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Block descriptor table not found automatically for this {selectedEcu?.name} variant.
                  Use <strong style={{ color: 'rgba(255,255,255,0.75)' }}>WinOLS</strong>, <strong style={{ color: 'rgba(255,255,255,0.75)' }}>BDM100</strong>, or
                  your flashing tool's built-in checksum correction before writing to the ECU.
                  Flashing without correct block checksums will cause the ECU to reject the calibration.
                </div>
              </div>
            </div>
          )
        )}

        {/* Maps modified warning */}
        {summary.mapsNotFound > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontSize: 11.5, color: '#ef4444' }}>
              {summary.mapsNotFound} critical map(s) not found in binary. The file may still have been modified for located maps. Verify carefully before flashing.
            </span>
          </div>
        )}
        {summary.mapsBlockedUniform > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontSize: 11.5, color: '#f59e0b' }}>
              {summary.mapsBlockedUniform} map(s) had uniform (blank) reads and were <strong>not written</strong> — load an A2L or DRT to resolve correct addresses.
            </span>
          </div>
        )}

        {/* DTC suppression results */}
        {dtcResults.length > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', marginBottom: 6 }}>
              🔇 DTC Suppression — {dtcSuppressedCount} pattern{dtcSuppressedCount !== 1 ? 's' : ''} zeroed
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dtcResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5 }}>
                  <span style={{ color: '#22c55e', fontWeight: 700, minWidth: 14 }}>✓</span>
                  <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', minWidth: 80 }}>
                    0x{r.offset.toString(16).toUpperCase().padStart(6, '0')}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', minWidth: 48 }}>
                    {r.originalByte.toString(16).padStart(2,'0').toUpperCase()} → {r.newByte.toString(16).padStart(2,'0').toUpperCase()}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
            {dtcSuppressedCount === 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                No matching DTC patterns found in this binary — patterns may differ for this ECU software version.
              </div>
            )}
          </div>
        )}

        {/* Output file info */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--accent)', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Output file</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', marginBottom: 4 }}>
            {buildFilename(fileName, selectedEcu, stage, addons)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {(remapResult.modifiedBuffer.byteLength / 1024).toFixed(0)} KB · Stage {stage}
            {addons.length > 0 ? ' + ' + addons.join(', ') : ''}
          </div>
        </div>

        {/* Download button */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setStep(3)}>Back</button>
          <button
            className="btn-primary"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleDownload}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Modified Binary
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setStep(0); setFileName(''); setFileBuffer(null); setHexPreview(''); setLoadError('')
              setDetected(null); setSelectedEcuId(''); setAddons([]); setStage(1)
              setExtractedMaps([]); setRemapResult(null); setBlockResult(null)
              // Clear A2L definition state — old definition must not bleed into a new file
              setA2lResult(null); setA2lMaps([]); setA2lFileName('')
              setA2lValidation([]); setA2lFallbackCount(0); setScannerFallbackCount(0); setShowSigExport(false); setSigExportText('')
              // Clear library search state
              setLibSearch(''); setLibResults([]); setLibTotal(0); setLibPage(0)
              setLibFallbackNote(''); setLibOriginalNum(''); setLibLoadError('')
              // v3.14: clear stage engine tier/refusal state so previous file's verdict doesn't bleed through
              setUnifiedTier(null); setUnifiedSource(''); setUnifiedRefusal(null); setUnifiedValidation(null)
            }}
          >
            New File
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            Remap Builder
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>AI-Assisted</span>
            <span>·</span>
            <span>Stage 1 / 2 / 3</span>
            <span>·</span>
            <span>{ECU_DEFINITIONS.map(e => e.family).join(' · ')}</span>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepBar current={step} />

      {/* Step content */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          {STEPS[step]}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          {[
            'Load an ECU binary file to begin. The system will automatically identify the ECU family.',
            'Confirm or override the detected ECU family before proceeding.',
            'Select your target stage and any optional add-ons.',
            'Review map changes before writing. Critical maps are highlighted.',
            'Your modified binary is ready. Download and flash with your preferred tool.',
          ][step]}
        </div>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>
    </div>
  )
}


