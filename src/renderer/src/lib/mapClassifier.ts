/**
 * mapClassifier.ts — Binary map finder + classifier for ECU tuning
 *
 * Scans raw ECU .bin files for calibration map structures (monotonic axis
 * sequences followed by 2D data blocks) and classifies each candidate against
 * known map types from ecuDefinitions.
 *
 * Scoring system (0-100 per candidate × mapDef pair):
 *   Dimension match   25 pts — exact rows/cols vs mapDef
 *   Value range        25 pts — physical plausibility after applying mapDef factor
 *   Axis fingerprint   25 pts — RPM/load/temp pattern matching
 *   Offset proximity   15 pts — distance to A2L anchors or fixedOffset
 *   Structural bonus   10 pts — SOI triplets, pairs, unique dimensions
 */

import type { EcuDef, MapDef, MapCategory } from './ecuDefinitions'
import type { A2LMapDef } from './a2lParser'
import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScannedCandidate {
  offset: number           // byte offset of the data block (after axes)
  headerOffset?: number    // byte offset of the Kf_ header (before axes)
  rows: number
  cols: number
  dtype: 'uint16' | 'int16' | 'uint8'
  le: boolean
  axisX: { values: number[]; min: number; max: number }
  axisY: { values: number[]; min: number; max: number } | null
  valueRange: { min: number; max: number; mean: number; stddev: number }
  rawData: number[][]
  confidence: number       // scanner-level quality 0-1
}

export interface ScoreBreakdown {
  dimension: number        // 0-25
  valueRange: number       // 0-25
  axisFingerprint: number  // 0-25
  proximity: number        // 0-15
  structural: number       // 0-10
}

export interface ClassificationHypothesis {
  mapDefId: string
  mapDefName: string
  category: MapCategory
  score: number            // 0-100
  breakdown: ScoreBreakdown
}

export interface ClassifiedCandidate {
  candidate: ScannedCandidate
  hypotheses: ClassificationHypothesis[]  // top 3, sorted desc
  bestMatch: ClassificationHypothesis | null  // null if below threshold
  assigned: boolean        // won the cross-exclusion assignment
  groupId?: string         // e.g. "soi_triplet_0" for structural groups
}

export interface GroundTruthAnchor {
  mapDefId: string
  offset: number
  source: 'a2l' | 'signature'
}

export interface ClassificationResult {
  candidates: ClassifiedCandidate[]
  unmatched: ClassifiedCandidate[]      // score < threshold
  anchors: GroundTruthAnchor[]
}

export interface ClassifyOptions {
  a2lMaps?: A2LMapDef[]
  signatureMatches?: Map<string, number>  // mapDefId → offset
  buffer?: ArrayBuffer
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_THRESHOLD = 30   // minimum score to be considered a match (lowered to catch more real maps)
const MAX_HYPOTHESES = 3

// Physical value plausibility ranges per map type
// { category → { min, max } } in physical units after factor applied
const PHYSICAL_RANGES: Record<string, { min: number; max: number }[]> = {
  boost:    [{ min: 0.1, max: 5.0 }, { min: 800, max: 3500 }, { min: 50, max: 160 }, { min: 1.0, max: 4.0 }],  // bar | mbar (EDC15) | % load (ME7 LDRXN) | ratio (ME7 KFLDHBN)
  torque:   [{ min: 0, max: 600 }],                  // Nm (factor 0.1)
  fuel:     [{ min: 0, max: 80 }, { min: 0, max: 45 }, { min: 0, max: 65 }, { min: 700, max: 2200 }],  // mg/st | degrees | mg/st DCM6.2 | rail pressure bar
  smoke:    [{ min: 5, max: 25 }, { min: 30, max: 80 }, { min: 0.7, max: 1.3 }],  // mg/st narrow | wide (EDC15 0.1) | lambda dimensionless
  ignition: [{ min: -10, max: 45 }, { min: -50, max: 70 }],  // degrees BTDC: EDC16 (factor ~0.022) | MED17 int8 (factor 0.75)
  limiter:  [{ min: 1000, max: 7000 }, { min: 100, max: 300 }],  // RPM or km/h (factor 1)
  emission: [{ min: 0, max: 100 }],                   // % (factor 0.4) or g/L (factor 1)
}

// RPM axis fingerprint: diesel idle 500-900, petrol×10 2000-8000
const RPM_IDLE_BAND = { min: 300, max: 8000 }     // covers raw RPM and RPM×10
const RPM_REDLINE_BAND = { min: 3000, max: 28000 } // covers 5500 RPM and 26000 RPM×10
const RPM_SPAN_RANGE = { min: 1500, max: 26000 }   // covers both scales

// ─── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scans a raw ECU binary for calibration map structures using Bosch inline
 * axis layout detection.
 *
 * Pass 1 — Bosch Kf_ layout: [Xcols:u16][Yrows:u16][X_axis][Y_axis][data]
 * Pass 2 — Standalone monotonic axis followed by data block
 */
export function scanBinaryForMaps(
  buffer: ArrayBuffer,
  ecuDef: EcuDef | null
): ScannedCandidate[] {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  // Determine endianness from ECU family, NOT from mapDef.le (which may be wrong in ecuDefinitions).
  // ALL Bosch ECUs store Kf_ calibration data in big-endian format — this is a Bosch convention
  // regardless of processor architecture (TriCore is LE, but Bosch cal data is BE).
  // Only truly LE families would be non-Bosch ECUs (Continental Simos, etc.).
  // ENDIANNESS — confirmed by reverse engineering real binaries:
  //   EDC16: BIG-ENDIAN Kf_ headers (confirmed working, 2MB file)
  //   SID:   BIG-ENDIAN (Bosch diesel, same era as EDC16)
  //   EDC17: LITTLE-ENDIAN! (confirmed: 4MB Audi Q3 EDC17C74 — Kf_ LE finds 562 perfect maps)
  //   MED17: LITTLE-ENDIAN (TriCore, same Bosch software gen as EDC17)
  //   EDC15: LITTLE-ENDIAN (C167 native, confirmed by 0xEA38 marker analysis)
  //   ME7/MS43: LITTLE-ENDIAN (C167 native, handled by own scanner passes)
  const BIG_ENDIAN_FAMILIES = ['EDC16', 'SID', 'DCM6']
  const le = ecuDef ? !BIG_ENDIAN_FAMILIES.some(f => ecuDef.family.toUpperCase().includes(f)) : true
  const candidates: ScannedCandidate[] = []
  const usedRanges: Array<[number, number]> = []
  const MAX_CANDIDATES = 4000  // Raised from 650 — real ECUs have 3000-4000+ maps per A2L

  // Bosch ECU layout: code first, calibration data second.
  // Different ECU families have cal regions at different offsets:
  //   ME7 (1MB):    cal at ~50-95% (0x80000-0xFFFFF) — smaller file, maps spread wider
  //   EDC16 (2MB):  cal at ~82-97% (0x1A0000-0x1F0000) — concentrated upper region
  //   EDC17 (4MB):  cal at ~75-97% — large file, broad cal region
  // Strategy: scan the cal region but prioritize LARGE maps (≥6×6).
  const calEnd = len - 32
  const family = ecuDef?.family?.toUpperCase() ?? ''
  let calStartPct = 0.82  // default for 2MB+ ECUs
  if (family.includes('ME7') || family.includes('ME9') || family.includes('MED9') || family.includes('MS43')) {
    calStartPct = 0.10  // ME7/ME9/MS43 1MB files: Kf_ maps found as early as 11% (0x1C000 in 1MB)
  } else if (family.includes('EDC15')) {
    calStartPct = 0.53  // EDC15 512KB files: cal at ~0x44000 (53%)
  } else if (family.includes('MG1')) {
    calStartPct = 0.20  // MG1CS002 VAG 2MB: cal at 0x080000 = 25%, start early to catch all
  } else if (family.includes('MED17') || family.includes('MEVD17')) {
    // MED17.5 StageX: boost at 0x4FE0C (24%), ignition at 0x5F32E (29%), torque at 0x40346 (12%).
    // 4MB files: cal at ~50%. 2MB files: cal starts at ~10%.
    calStartPct = len >= 0x400000 ? 0.50 : 0.10
  } else if (family.includes('EDC17')) {
    // EDC17C46 StageX: SOI at 0x26C0E (15% of 2MB), boost at ~25%, gearbox at 0x7E2xx (50%).
    // 4MB files: cal at ~50%. 2MB files: cal starts at ~10%.
    calStartPct = len >= 0x400000 ? 0.50 : 0.10
  } else if (len < 0x100000) {
    calStartPct = 0.35  // Small files: scan from 35%
  } else if (len >= 0x400000) {
    calStartPct = 0.70  // 4MB+ files: cal starts around 70%
  }
  const calStart = (Math.floor(len * calStartPct)) & ~1

  // ── Pass 1 & 2: Kf_ layout maps ──
  // Kf_ format [cols:u16][rows:u16][X_axis][Y_axis][data] confirmed in:
  //   EDC16 (BE), EDC17/MED17 (LE), ME7/ME9/MS43 (LE)
  // Skip for EDC15 (0xEA38 marker format) and DCM6 (Delphi count-prefixed axes).
  const KF_SKIP = ['EDC15', 'DCM6']  // Each has its own scanner pass
  const isKfSkip = KF_SKIP.some(f => family.includes(f))

  if (!isKfSkip) {
    // Pass 1: Large Kf_ maps only (min 6×6 = 36 cells) — these are the tuning maps
    scanKfRegion(view, calStart, calEnd, le, ecuDef, candidates, usedRanges, MAX_CANDIDATES, 6, 36)

    // Pass 2: Smaller Kf_ maps (4×4 to 5×5) — limiters, DPF, EGR
    if (candidates.length < MAX_CANDIDATES) {
      scanKfRegion(view, calStart, calEnd, le, ecuDef, candidates, usedRanges, MAX_CANDIDATES, 4, 16)
    }

    // Pass 2b: Tiny maps (2×4 to 3×5) — torque limiter curves, single-axis maps
    if (candidates.length < MAX_CANDIDATES) {
      scanKfRegion(view, calStart, calEnd, le, ecuDef, candidates, usedRanges, MAX_CANDIDATES, 2, 8)
    }
  }

  // ── Pass 3: EDC17/MED17 axis marker scan for TriCore ECUs ──
  const TRICORE_FAMILIES = ['EDC17', 'MED17', 'SIMOS18', 'SIMOS19', 'MEVD17', 'MED9', 'MG1']
  if (ecuDef && TRICORE_FAMILIES.some(f => ecuDef.family.toUpperCase().includes(f))) {
    const markerCandidates = scanEDC17AxisMarkers(buffer, ecuDef)
    for (const mc of markerCandidates) {
      if (candidates.length >= MAX_CANDIDATES) break
      // Avoid duplicates with Kf_ results
      if (!overlaps(usedRanges, mc.headerOffset ?? mc.offset, mc.offset + mc.rows * mc.cols * 2)) {
        candidates.push(mc)
        usedRanges.push([mc.headerOffset ?? mc.offset, mc.offset + mc.rows * mc.cols * 2])
      }
    }
  }

  // ── Pass 4: EDC15 axis-marker scanner (C167 LE format) ──
  // EDC15 uses a unique format discovered by reverse engineering real binaries:
  //   [0xEA38:u16_LE][X_count:u16_LE][X_axis][separator:u16][Y_count:u16_LE][Y_axis][DATA]
  // ALL data is little-endian. The 0xEA38 marker precedes most axis definitions.
  // Cal data stored in 3 redundant copies — only scan the first.
  if (family.includes('EDC15')) {
    const edc15Candidates = scanEDC15AxisMarkers(buffer, ecuDef)
    for (const mc of edc15Candidates) {
      if (candidates.length >= MAX_CANDIDATES) break
      if (!overlaps(usedRanges, mc.headerOffset ?? mc.offset, mc.offset + mc.rows * mc.cols * 2)) {
        candidates.push(mc)
        usedRanges.push([mc.headerOffset ?? mc.offset, mc.offset + mc.rows * mc.cols * 2])
      }
    }
  }

  // ── Pass 5: ME7 axis pair scan — DISABLED ──
  // ME7 now works via Kf_ LE scanner (Pass 1/2) — found 30+ maps in test files.
  // The old axis-pair scanner caused app freezes in v2.11.0–v2.11.3 and is no longer needed.
  // scanME7AxisPairs() function kept below for reference but not called.

  // ── Pass 6: MED17 u8-dimension scanner ──
  // MED17.1.1 (TriCore) has NO Kf_ headers. Maps use a different format:
  //   [xCount:u8][yCount:u8][X_axis][Y_axis][data]
  // Both u16 and u8 data variants exist. Cal region at 87-98% of 4MB file.
  // Discovered by reverse-engineering Audi RS6 MED17.1.1 binary.
  const TRICORE_DIM_FAMILIES = ['MED17', 'MED9', 'MEVD17']
  if (ecuDef && TRICORE_DIM_FAMILIES.some(f => family.includes(f)) && candidates.length < 20) {
    const triCoreCandidates = scanTriCoreDimPairs(buffer, ecuDef)
    for (const mc of triCoreCandidates) {
      if (candidates.length >= MAX_CANDIDATES) break
      if (!overlaps(usedRanges, mc.headerOffset ?? mc.offset, mc.offset + mc.rows * mc.cols * 2)) {
        candidates.push(mc)
        usedRanges.push([mc.headerOffset ?? mc.offset, mc.offset + mc.rows * mc.cols * 2])
      }
    }
  }

  // ── Pass 7: SIMOS18 blind smooth-block scanner ──
  // Continental SIMOS18 has NO inline map markers of any kind. Maps are raw packed
  // u16 LE data blocks with zero headers. Axes stored separately in a different region.
  // Discovered by reverse-engineering Audi S1 SIMOS18.1 binary.
  // Strategy: scan cal data region for smooth NxN blocks using statistical detection.
  // Cal region at ~43% of 4.5MB file (0x200000-0x27D000).
  const SIMOS_FAMILIES = ['SIMOS18', 'SIMOS19', 'SIMOS12', 'SIMOS']
  if (ecuDef && SIMOS_FAMILIES.some(f => family.includes(f)) && candidates.length < 20) {
    const simosCandidates = scanSIMOSBlindBlocks(buffer, ecuDef)
    for (const mc of simosCandidates) {
      if (candidates.length >= MAX_CANDIDATES) break
      if (!overlaps(usedRanges, mc.offset, mc.offset + mc.rows * mc.cols * 2)) {
        candidates.push(mc)
        usedRanges.push([mc.offset, mc.offset + mc.rows * mc.cols * 2])
      }
    }
  }

  // ── Pass 8: Delphi DCM6.2 count-prefixed axis scanner ──
  // Delphi DCM6.2 (MPC5xxx PowerPC) uses count-prefixed axes, big-endian:
  //   [Ycount:BE_u16][Y_axis: Ycount×BE_u16][Xcount:BE_u16][X_axis: Xcount×BE_u16][data: Y×X × BE_u16]
  // Cal region: 0x040000-0x17FFFF in 4MB files.
  // Discovered by reverse-engineering VW Golf 1.6 TDI CR D0B16 binary.
  const DELPHI_FAMILIES = ['DCM6.2', 'DCM6.1', 'DCM7', 'DCM6']
  if (ecuDef && DELPHI_FAMILIES.some(f => family.includes(f))) {
    const delphiCandidates = scanDelphiCountPrefixed(buffer, ecuDef)
    for (const dc of delphiCandidates) {
      if (candidates.length >= MAX_CANDIDATES) break
      if (!overlaps(usedRanges, dc.offset, dc.offset + dc.rows * dc.cols * 2)) {
        candidates.push(dc)
        usedRanges.push([dc.offset, dc.offset + dc.rows * dc.cols * 2])
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence || a.offset - b.offset)
  return candidates
}

// ─── Kf_ region scanner ───────────────────────────────────────────────────────

function scanKfRegion(
  view: DataView, start: number, end: number, le: boolean,
  ecuDef: EcuDef | null,
  candidates: ScannedCandidate[],
  usedRanges: Array<[number, number]>,
  maxCandidates: number,
  minDim = 4,
  minCells = 24
): void {
  const bufLen = view.byteLength
  for (let i = start; i <= end - 8; i += 2) {
    if (candidates.length >= maxCandidates) break

    const d0 = rU16(view, i, le)
    const d1 = rU16(view, i + 2, le)

    if (d0 < minDim || d0 > 24 || d1 < minDim || d1 > 24) continue
    if (d0 * d1 < minCells) continue

    const cols = d0, rows = d1
    const xStart = i + 4
    const yStart = xStart + cols * 2
    const dataStart = yStart + rows * 2
    const dataBytes = rows * cols * 2
    if (dataStart + dataBytes > bufLen) continue

    const xAxis = readMonoAxis(view, xStart, cols, le)
    if (!xAxis) continue
    const yAxis = readMonoAxis(view, yStart, rows, le)
    if (!yAxis) continue

    if (xAxis[cols - 1] - xAxis[0] < 30) continue   // lowered for ME7 small axis spans
    if (yAxis[rows - 1] - yAxis[0] < 10) continue   // lowered for ME7

    // Reject small parameter tables: at least one axis must have values in engine range
    // Real maps have RPM (800+), pressure (500+), load, or temperature axes
    // Small param tables have axes like [3-70], [10-200] — not real tuning maps
    const maxAxisVal = Math.max(xAxis[cols - 1], yAxis[rows - 1])
    if (maxAxisVal < 400) continue

    if (overlaps(usedRanges, i, dataStart + dataBytes)) continue

    const stats = readBlock(view, dataStart, rows, cols, le)
    if (stats.allZero || stats.allFF || stats.stddev < 3) continue

    // Reject constant/near-constant fill: data must have >3 distinct values
    const uniqueSet = new Set<number>()
    for (const row of stats.rawData) for (const v of row) uniqueSet.add(v)
    if (uniqueSet.size <= 3) continue

    const xSpan = xAxis[cols - 1] - xAxis[0]
    const dimMatch = ecuDef ? ecuDef.maps.some(m => m.rows === rows && m.cols === cols) ? 1 : 0.4 : 0.5
    // Prioritize larger maps (16x14=224 cells) over small ones (5x5=25 cells)
    const cellCount = rows * cols
    const sizeBonus = Math.min(1, cellCount / 120)  // full score at 120+ cells (~10x12)
    const confidence = Math.min(1, xSpan / 2000) * 0.25 + Math.min(1, stats.stddev / 50) * 0.25 + dimMatch * 0.25 + sizeBonus * 0.25

    candidates.push({
      offset: dataStart, headerOffset: i, rows, cols, dtype: 'uint16', le,
      axisX: { values: xAxis, min: xAxis[0], max: xAxis[cols - 1] },
      axisY: { values: yAxis, min: yAxis[0], max: yAxis[rows - 1] },
      valueRange: { min: stats.min, max: stats.max, mean: stats.mean, stddev: stats.stddev },
      rawData: [], confidence,  // rawData omitted to save memory
    })
    usedRanges.push([i, dataStart + dataBytes])
    i = dataStart + dataBytes - 2
  }
}

// ─── Scanner helpers ──────────────────────────────────────────────────────────

function rU16(view: DataView, offset: number, le: boolean): number {
  return le ? view.getUint16(offset, true) : view.getUint16(offset, false)
}

function readMonoAxis(view: DataView, start: number, count: number, le: boolean): number[] | null {
  const a: number[] = []
  for (let j = 0; j < count; j++) {
    const v = rU16(view, start + j * 2, le)
    if (v >= 0xFFF0) return null  // erased flash
    if (j > 0 && v <= a[j - 1]) return null  // not strictly increasing
    a.push(v)
  }
  return a
}

function tryReadAxisFwd(view: DataView, start: number, le: boolean, bufLen: number): number[] | null {
  const a: number[] = []
  for (let j = 0; j < 24; j++) {
    const off = start + j * 2
    if (off + 2 > bufLen) break
    const v = rU16(view, off, le)
    if (j === 0 && (v === 0 || v >= 0xFFF0 || v > 30000)) return null
    if (j > 0 && v <= a[j - 1]) break
    a.push(v)
  }
  return a.length >= 4 ? a : null
}

function readBlock(view: DataView, start: number, rows: number, cols: number, le: boolean) {
  const rawData: number[][] = []
  let vMin = Infinity, vMax = -Infinity, vSum = 0
  let allZero = true, allFF = true
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      const v = rU16(view, start + (r * cols + c) * 2, le)
      row.push(v)
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
      vSum += v
      if (v !== 0) allZero = false
      if (v !== 0xFFFF) allFF = false
    }
    rawData.push(row)
  }
  const n = rows * cols
  const mean = vSum / n
  let var_ = 0
  for (const row of rawData) for (const v of row) var_ += (v - mean) ** 2
  const stddev = Math.sqrt(var_ / n)
  return { rawData, min: vMin, max: vMax, mean, stddev, allZero, allFF }
}

function overlaps(ranges: Array<[number, number]>, start: number, end: number): boolean {
  for (const [rs, re] of ranges) {
    if (start < re && end > rs) return true
  }
  return false
}

// ─── Map data reader (on-demand from binary) ─────────────────────────────────

export interface MapGridData {
  grid: number[][]         // physical values (factor applied) — rows = RPM, cols = Load
  rawGrid: number[][]      // raw uint16 values
  xLabels: string[]        // column headers across top (Load/IQ breakpoints)
  yLabels: string[]        // row headers down left (RPM breakpoints)
  unit: string             // physical unit (bar, Nm, mg/st, etc.)
  name: string             // map name
  category: string         // map category
  rows: number
  cols: number
}

/**
 * Read a map from the binary buffer at the candidate's offset.
 * Uses axis values from the Kf_ header and applies the matched mapDef's
 * factor/offsetVal for physical display.
 */
export function readMapFromCandidate(
  buffer: ArrayBuffer,
  candidate: ScannedCandidate,
  mapDefId: string,
  ecuDef: EcuDef
): MapGridData | null {
  const view = new DataView(buffer)
  const md = ecuDef.maps.find(m => m.id === mapDefId)
  if (!md) return null

  const { offset, rows, cols, le } = candidate
  const factor = md.factor
  const offsetVal = md.offsetVal

  // Read raw data from binary at the candidate's data offset.
  // EDC15 format: data already stored as RPM-rows × Load-cols → NO transpose needed.
  // Kf_ format (EDC16): rows=Load, cols=RPM → MUST transpose for tuning convention.
  // MED17 u8: 1 byte per cell (uint8 dtype).
  const isEDC15 = ecuDef.family.toUpperCase().includes('EDC15')
  const isU8 = candidate.dtype === 'uint8'
  const bytesPerCell = isU8 ? 1 : 2
  const rawGridOrig: number[][] = []
  const gridOrig: number[][] = []
  for (let r = 0; r < rows; r++) {
    const rawRow: number[] = []
    const physRow: number[] = []
    for (let c = 0; c < cols; c++) {
      const byteOff = offset + (r * cols + c) * bytesPerCell
      if (byteOff + bytesPerCell > buffer.byteLength) return null
      const raw = isU8
        ? view.getUint8(byteOff)
        : le ? view.getUint16(byteOff, true) : view.getUint16(byteOff, false)
      rawRow.push(raw)
      physRow.push(raw * factor + offsetVal)
    }
    rawGridOrig.push(rawRow)
    gridOrig.push(physRow)
  }

  let grid: number[][]
  let rawGrid: number[][]
  let yLabels: string[]
  let xLabels: string[]
  let tRows: number
  let tCols: number

  const isMED17 = ecuDef.family.toUpperCase().includes('MED17') || ecuDef.family.toUpperCase().includes('MEVD17')
  const isDelphi = ecuDef.family.toUpperCase().includes('DCM6')
  // EDC17 uses RPM×2 in axis values — apply ×0.5 scaling for display.
  // Detect EDC17-family ECUs (not EDC16, not EDC15 — those use raw RPM).
  const isEDC17 = ecuDef.family.toUpperCase().includes('EDC17')
  const rpmScale = isEDC17 ? 0.5 : 1.0
  const fmtAxis = (v: number, isRpmAxis: boolean) => {
    const scaled = isRpmAxis ? v * rpmScale : v
    return formatAxisValue(scaled)
  }
  // ─── SIMPLE ORIENTATION LOGIC ────────────────────────────────────────────
  // FIXED HOUSE STYLE: RPM on Y-axis (rows, left side), Load on X-axis (cols, top).
  // RPM = the axis with LARGER max value. Load/IQ = smaller max value.
  // No more guessing. Just: bigger axis = RPM = rows.

  // ─── AXIS LABELING BASED ON MAP CATEGORY ────────────────────────────────
  // The mapDef category tells us EXACTLY what axes this map has.
  // No more guessing from raw values.
  //
  // Category     | Y-axis (rows)        | X-axis (cols)
  // fuel         | RPM (factor 1)       | IQ/Load (factor 0.01 = mg/st)
  // torque       | Torque Nm (factor 0.1)| IQ/Load (factor 0.01)
  // boost        | IQ/Load (factor 0.01)| RPM (factor 1)
  // smoke        | RPM (factor 1)       | Airflow (factor 0.01)
  // ignition     | RPM (factor 1)       | IQ/Load (factor 0.01)
  // limiter      | RPM (factor 1)       | Load (factor 0.01)
  // emission     | RPM (factor 1)       | Load (factor 0.01)

  // Kf_ format: gridOrig is rows(Y) × cols(X) from the binary.
  // X_axis = Kf_ cols breakpoints, Y_axis = Kf_ rows breakpoints.
  // For categories where Y should be RPM: check if Y raw values look like RPM (500+).
  // If not, transpose.

  const cat = md.category
  // Determine which axis scaling to use based on category
  type AxisScale = { factor: number; unit: string }
  let rowScale: AxisScale  // Y-axis (rows/left side)
  let colScale: AxisScale  // X-axis (cols/top)
  let needsTranspose = false

  // ─── DAMOS-VERIFIED ORIENTATION ──────────────────────────────────────────
  // DAMOS A2L confirms: In Kf_ format, X_axis = RPM, Y_axis = Load/IQ.
  // Tuning convention (ECM Titanium / WinOLS): RPM down left, Load across top.
  // Since Kf_ stores X=RPM as cols and Y=Load as rows, we ALWAYS TRANSPOSE
  // Kf_ data to put RPM (X) on the left side (rows) for display.
  //
  // After transpose:  rows = RPM (was X/cols),  cols = Load (was Y/rows)

  // Axis labeling: RPM on rows (left), Load/IQ on cols (top)
  if (cat === 'torque') {
    rowScale = { factor: 0.1, unit: 'Nm' }
    colScale = { factor: 0.01, unit: 'mg/st' }
  } else if (cat === 'boost') {
    rowScale = { factor: 0.01, unit: 'mg/st' }
    colScale = { factor: 0.01, unit: 'mg/st' }
  } else {
    // fuel, smoke, ignition, limiter, emission
    rowScale = { factor: 1, unit: 'RPM' }
    colScale = { factor: 0.01, unit: 'mg/st' }
  }

  // Always transpose Kf_ maps: X_axis (RPM) becomes rows (left side)
  // The Kf_ X axis has the RPM/speed breakpoints — DAMOS confirms this across 2,801 A2L files.
  const xMax = candidate.axisX.values[candidate.axisX.values.length - 1]
  const yMax = candidate.axisY ? candidate.axisY.values[candidate.axisY.values.length - 1] : 0
  // Transpose if X axis looks like RPM (higher values) and Y axis looks like Load (lower values)
  // OR if category explicitly says RPM should be on rows
  if (xMax > yMax && cat !== 'boost') {
    needsTranspose = true
  } else if (cat === 'torque' && xMax < yMax) {
    needsTranspose = true  // Torque maps: smaller axis (torque Nm) should be rows
  }

  if (isEDC15 || isMED17 || isDelphi) {
    // Non-Kf_ scanners — data already oriented
    grid = gridOrig
    rawGrid = rawGridOrig
    tRows = rows
    tCols = cols
    yLabels = (candidate.axisY?.values ?? Array.from({ length: rows }, (_, i) => i)).map(v => {
      const pv = (v as number) * rowScale.factor * rpmScale
      return rowScale.factor === 1 ? formatAxisValue(pv) : pv.toFixed(pv >= 100 ? 0 : 1)
    })
    xLabels = candidate.axisX.values.map(v => {
      const pv = v * colScale.factor
      return colScale.factor === 1 ? formatAxisValue(pv) : pv.toFixed(pv >= 100 ? 0 : 1)
    })
  } else if (needsTranspose) {
    // TRANSPOSE: swap rows and cols
    tRows = cols
    tCols = rows
    grid = []
    rawGrid = []
    for (let r = 0; r < tRows; r++) {
      const physRow: number[] = []
      const rawRow: number[] = []
      for (let c = 0; c < tCols; c++) {
        physRow.push(gridOrig[c][r])
        rawRow.push(rawGridOrig[c][r])
      }
      grid.push(physRow)
      rawGrid.push(rawRow)
    }
    // After transpose: X becomes rows, Y becomes cols
    yLabels = candidate.axisX.values.map(v => {
      const pv = v * rowScale.factor * rpmScale
      return rowScale.factor === 1 ? formatAxisValue(pv) : pv.toFixed(pv >= 100 ? 0 : 1)
    })
    xLabels = (candidate.axisY?.values ?? Array.from({ length: tCols }, (_, i) => i)).map(v => {
      const pv = (v as number) * colScale.factor
      return colScale.factor === 1 ? formatAxisValue(pv) : pv.toFixed(pv >= 100 ? 0 : 1)
    })
  } else {
    // NO transpose — keep as-is
    grid = gridOrig
    rawGrid = rawGridOrig
    tRows = rows
    tCols = cols
    yLabels = (candidate.axisY?.values ?? Array.from({ length: rows }, (_, i) => i)).map(v => {
      const pv = (v as number) * rowScale.factor * rpmScale
      return rowScale.factor === 1 ? formatAxisValue(pv) : pv.toFixed(pv >= 100 ? 0 : 1)
    })
    xLabels = candidate.axisX.values.map(v => {
      const pv = v * colScale.factor
      return colScale.factor === 1 ? formatAxisValue(pv) : pv.toFixed(pv >= 100 ? 0 : 1)
    })
  }

  // ─── FORCE AXIS LABELS TO INCREASE ─────────────────────────────────────
  const parseLabel = (s: string) => {
    const n = parseFloat(s.replace(/k$/i, '')) * (s.toLowerCase().endsWith('k') ? 1000 : 1)
    return isNaN(n) ? 0 : n
  }
  if (yLabels.length >= 2 && parseLabel(yLabels[0]) > parseLabel(yLabels[yLabels.length - 1])) {
    grid.reverse(); rawGrid.reverse(); yLabels.reverse()
  }
  if (xLabels.length >= 2 && parseLabel(xLabels[0]) > parseLabel(xLabels[xLabels.length - 1])) {
    grid.forEach(row => row.reverse()); rawGrid.forEach(row => row.reverse()); xLabels.reverse()
  }

  return {
    grid, rawGrid, xLabels, yLabels,
    unit: md.unit, name: md.name, category: md.category,
    rows: tRows, cols: tCols,
  }
}

/**
 * Read map data from an unmatched candidate using AI match metadata.
 * Like readMapFromCandidate but doesn't require ecuDef mapDef lookup.
 */
export function readUnmatchedCandidate(
  buffer: ArrayBuffer,
  candidate: ScannedCandidate,
  aiMatch: AIMatch
): MapGridData | null {
  const view = new DataView(buffer)
  const { offset, rows, cols, le } = candidate
  const factor = aiMatch.factor || 1
  const offsetVal = 0

  const isU8 = candidate.dtype === 'uint8'
  const bytesPerCell = isU8 ? 1 : 2
  const gridKf: number[][] = []
  const rawGridKf: number[][] = []
  for (let r = 0; r < rows; r++) {
    const rawRow: number[] = []
    const physRow: number[] = []
    for (let c = 0; c < cols; c++) {
      const byteOff = offset + (r * cols + c) * bytesPerCell
      if (byteOff + bytesPerCell > buffer.byteLength) return null
      const raw = isU8
        ? view.getUint8(byteOff)
        : le ? view.getUint16(byteOff, true) : view.getUint16(byteOff, false)
      rawRow.push(raw)
      physRow.push(raw * factor + offsetVal)
    }
    rawGridKf.push(rawRow)
    gridKf.push(physRow)
  }

  // Determine if transpose is needed. Kf_ format maps need transpose (rows=Load → cols).
  // Non-Kf_ scanners (MED17 TriCore, EDC15 markers, Delphi axis-pair, SIMOS blind)
  // already produce data in the correct orientation — detected by headerOffset presence
  // (Kf_ scanner sets headerOffset = Kf_ position, but so do others; however Kf_ maps
  // always have le=true for EDC16 BE — actually simplest: check if candidate came from
  // a non-transpose scanner by looking at whether axisX length === rows).
  const isRowOriented = candidate.axisX.values.length === rows && candidate.axisY?.values.length === cols
  // Also treat Delphi (le=false) and SIMOS (synthetic 0,1,2... axes) as no-transpose
  const noTranspose = isRowOriented || !candidate.le && candidate.dtype === 'uint16'

  let grid: number[][]
  let rawGrid: number[][]
  let yLabels: string[]
  let xLabels: string[]
  let tRows: number
  let tCols: number

  if (noTranspose) {
    // Data already in Y-rows × X-cols orientation — no transpose needed.
    // axisY.length = rows (row breakpoints), axisX.length = cols (column breakpoints).
    grid = gridKf
    rawGrid = rawGridKf
    tRows = rows
    tCols = cols
    yLabels = candidate.axisY?.values.map(v => formatAxisValue(v)) ?? Array.from({ length: tRows }, (_, i) => String(i + 1))
    xLabels = candidate.axisX.values.map(v => formatAxisValue(v))
  } else {
    // SIMPLE: bigger max axis = RPM = rows. Same logic as readMapFromCandidate.
    const xMaxU = candidate.axisX.values[candidate.axisX.values.length - 1]
    const yMaxU = candidate.axisY ? candidate.axisY.values[candidate.axisY.values.length - 1] : 0
    const rpmHalf = (v: number) => v > 8000 ? v * 0.5 : v // EDC17 RPM×2

    if (yMaxU >= xMaxU) {
      // Y is bigger = RPM on rows already
      grid = gridKf
      rawGrid = rawGridKf
      tRows = rows
      tCols = cols
      yLabels = candidate.axisY?.values.map(v => formatAxisValue(rpmHalf(v))) ?? Array.from({ length: tRows }, (_, i) => String(i + 1))
      xLabels = candidate.axisX.values.map(v => formatAxisValue(v))
    } else {
      // X is bigger = TRANSPOSE
      tRows = cols
      tCols = rows
      grid = []
      rawGrid = []
      for (let r = 0; r < tRows; r++) {
        const physRow: number[] = []
        const rawRow: number[] = []
        for (let c = 0; c < tCols; c++) {
          physRow.push(gridKf[c][r])
          rawRow.push(rawGridKf[c][r])
        }
        grid.push(physRow)
        rawGrid.push(rawRow)
      }
      yLabels = candidate.axisX.values.map(v => formatAxisValue(rpmHalf(v)))
      xLabels = candidate.axisY?.values.map(v => formatAxisValue(v)) ?? Array.from({ length: tCols }, (_, i) => String(i + 1))
    }
  }

  // FORCE AXIS LABELS TO INCREASE
  const parseLabel = (s: string) => {
    const n = parseFloat(s.replace(/k$/i, '')) * (s.toLowerCase().endsWith('k') ? 1000 : 1)
    return isNaN(n) ? 0 : n
  }
  if (yLabels.length >= 2) {
    if (parseLabel(yLabels[0]) > parseLabel(yLabels[yLabels.length - 1])) {
      grid.reverse(); rawGrid.reverse(); yLabels.reverse()
    }
  }
  if (xLabels.length >= 2) {
    if (parseLabel(xLabels[0]) > parseLabel(xLabels[xLabels.length - 1])) {
      grid.forEach(row => row.reverse()); rawGrid.forEach(row => row.reverse()); xLabels.reverse()
    }
  }

  return {
    grid, rawGrid, xLabels, yLabels,
    unit: aiMatch.unit || '', name: aiMatch.mapName, category: aiMatch.category,
    rows: tRows, cols: tCols,
  }
}

/** Format an axis breakpoint value for display */
function formatAxisValue(v: number): string {
  if (v >= 10000) return (v / 1000).toFixed(0) + 'k'
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(v)
}

/**
 * Auto-detect axis type from raw values and return scaled labels + type name.
 * Heuristic detection based on value patterns:
 *   - RPM: 500-10000, at least some values > 2000, factor 1 (or 0.5 for EDC17)
 *   - IQ/fuel quantity: 0-6000, irregular spacing, often starts at 0
 *   - Torque: 0-4000, at factor 0.1 gives 0-400 Nm
 *   - Load %: values that at factor 0.01 give 0-100%
 *   - Pressure: 2000-4000 range (mbar)
 */
interface AxisInfo {
  type: 'rpm' | 'iq' | 'torque' | 'load' | 'pressure' | 'unknown'
  label: string       // e.g. "RPM", "Load %", "IQ mg/st"
  factor: number      // multiply raw by this to get physical
  values: string[]    // formatted physical values
}

function detectAxisType(rawValues: number[], rpmScale = 1.0): AxisInfo {
  if (rawValues.length < 2) return { type: 'unknown', label: '', factor: 1, values: rawValues.map(v => String(v)) }

  const first = rawValues[0]
  const last = rawValues[rawValues.length - 1]
  const span = last - first
  const max = last

  // Check RPM: MUST start at 500+ (just below diesel idle 700-900)
  // EDC16: raw RPM (700-4500), EDC17: RPM×2 (1400-9000)
  // Key distinction from IQ: RPM never starts at 0, IQ often does
  if (first >= 500 && max >= 2000 && max <= 14000 && span >= 1500) {
    const f = rpmScale
    return {
      type: 'rpm', label: 'RPM', factor: f,
      values: rawValues.map(v => formatAxisValue(v * f))
    }
  }

  // Check Torque: raw 0-4000, at ×0.1 = 0-400 Nm (typical diesel torque range)
  if (first <= 50 && max >= 200 && max <= 5000) {
    const physMax = max * 0.1
    if (physMax >= 20 && physMax <= 500) {
      return {
        type: 'torque', label: 'Nm', factor: 0.1,
        values: rawValues.map(v => (v * 0.1).toFixed(0))
      }
    }
  }

  // Check IQ/fuel: raw 0-6000+, irregular, starts at 0 or near 0
  if (first <= 50 && max >= 500 && max <= 7000) {
    // Could be IQ (mg/st at ×0.01) or just raw IQ
    const physAt001 = max * 0.01
    if (physAt001 >= 5 && physAt001 <= 70) {
      return {
        type: 'iq', label: 'mg/st', factor: 0.01,
        values: rawValues.map(v => (v * 0.01).toFixed(1))
      }
    }
    // Raw IQ values displayed as-is
    return {
      type: 'iq', label: 'IQ', factor: 1,
      values: rawValues.map(v => formatAxisValue(v))
    }
  }

  // Check pressure: 2000-4500 range (mbar)
  if (first >= 1500 && max <= 5000 && span < 3000) {
    return {
      type: 'pressure', label: 'mbar', factor: 1,
      values: rawValues.map(v => formatAxisValue(v))
    }
  }

  // Check Load %: if ×0.01 gives 0-100 range
  if (first >= 0 && max <= 10500) {
    const physMax = max * 0.01
    if (physMax >= 50 && physMax <= 105) {
      return {
        type: 'load', label: '%', factor: 0.01,
        values: rawValues.map(v => (v * 0.01).toFixed(0))
      }
    }
  }

  // Default: show raw values
  return {
    type: 'unknown', label: '', factor: 1,
    values: rawValues.map(v => formatAxisValue(v))
  }
}

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Classifies scanned binary candidates against known map types.
 * Returns classified results with confidence scores and cross-exclusion.
 */
export function classifyCandidates(
  candidates: ScannedCandidate[],
  ecuDef: EcuDef,
  options?: ClassifyOptions
): ClassificationResult {
  // Build ground truth anchors from A2L maps and signature matches
  const anchors: GroundTruthAnchor[] = []

  if (options?.signatureMatches) {
    for (const [mapDefId, offset] of options.signatureMatches) {
      anchors.push({ mapDefId, offset, source: 'signature' })
    }
  }
  if (options?.a2lMaps) {
    for (const a2l of options.a2lMaps) {
      // Try to match A2L map to ecuDef by name
      for (const md of ecuDef.maps) {
        if (md.a2lNames?.some(n => a2l.name.includes(n) || n.includes(a2l.name))) {
          anchors.push({ mapDefId: md.id, offset: a2l.fileOffset, source: 'a2l' })
          break
        }
      }
    }
  }

  // Detect structural groups (SOI triplets, pairs)
  const groups = detectGroups(candidates)

  // Score every (candidate, mapDef) pair
  const allScores: Array<{
    candidateIdx: number
    mapDefId: string
    hypothesis: ClassificationHypothesis
  }> = []

  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci]
    for (const md of ecuDef.maps) {
      const breakdown = scoreCandidate(cand, md, anchors, groups, ci)
      const total = breakdown.dimension + breakdown.valueRange + breakdown.axisFingerprint
        + breakdown.proximity + breakdown.structural
      allScores.push({
        candidateIdx: ci,
        mapDefId: md.id,
        hypothesis: {
          mapDefId: md.id,
          mapDefName: md.name,
          category: md.category,
          score: Math.round(total),
          breakdown,
        },
      })
    }
  }

  // Build per-candidate hypothesis lists (top 3)
  const candidateHypotheses: Map<number, ClassificationHypothesis[]> = new Map()
  for (let ci = 0; ci < candidates.length; ci++) {
    const scores = allScores
      .filter(s => s.candidateIdx === ci)
      .sort((a, b) => b.hypothesis.score - a.hypothesis.score)
      .slice(0, MAX_HYPOTHESES)
      .map(s => s.hypothesis)
    candidateHypotheses.set(ci, scores)
  }

  // Cross-exclusion: greedy assignment with variant cap.
  // Each candidate gets assigned to its best mapDef. Multiple candidates CAN share
  // the same mapDef (variants/codeblocks — e.g. 9 Driver's Wish maps for different gears).
  // But each candidate is only assigned ONCE, and each mapDef is limited to MAX_VARIANTS_PER_MAP
  // to prevent 157 maps all being classified as "Torque Limit" when an ECU has few definitions.
  const MAX_VARIANTS_PER_MAP = 12  // Realistic max: ~6 gears × 2 modes = 12 variants
  const sortedScores = [...allScores]
    .filter(s => s.hypothesis.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.hypothesis.score - a.hypothesis.score)

  const assignedCandidates = new Set<number>()
  const assignments = new Map<number, string>()  // candidateIdx → mapDefId
  const variantCounts = new Map<string, number>()  // mapDefId → count

  for (const entry of sortedScores) {
    if (assignedCandidates.has(entry.candidateIdx)) continue
    // Check variant cap — don't assign more than MAX_VARIANTS_PER_MAP to one mapDef
    const curCount = variantCounts.get(entry.mapDefId) ?? 0
    if (curCount >= MAX_VARIANTS_PER_MAP) continue  // skip — this mapDef is full, candidate goes to unknown
    assignedCandidates.add(entry.candidateIdx)
    assignments.set(entry.candidateIdx, entry.mapDefId)
    variantCounts.set(entry.mapDefId, curCount + 1)
  }

  // Build final results.
  // A candidate is "classified" only if:
  //   1. It won the cross-exclusion assignment AND below variant cap, OR
  //   2. Its top hypothesis scores ≥ HIGH_CONFIDENCE (independently credible without assignment)
  // Maps above the variant cap go to "unknown" where AI matching can identify them properly.
  const HIGH_CONFIDENCE = 50
  const classified: ClassifiedCandidate[] = []
  const unmatched: ClassifiedCandidate[] = []

  for (let ci = 0; ci < candidates.length; ci++) {
    const hyps = candidateHypotheses.get(ci) || []
    const bestHyp = hyps.length > 0 && hyps[0].score >= SCORE_THRESHOLD ? hyps[0] : null
    const isAssigned = assignments.has(ci)

    // Find group membership
    let groupId: string | undefined
    for (const [gid, members] of groups) {
      if (members.includes(ci)) { groupId = gid; break }
    }

    const result: ClassifiedCandidate = {
      candidate: candidates[ci],
      hypotheses: hyps,
      bestMatch: bestHyp,
      assigned: isAssigned,
      groupId,
    }

    // Gate: must be assigned OR score high enough to stand on its own
    if (bestHyp && (isAssigned || bestHyp.score >= HIGH_CONFIDENCE)) {
      classified.push(result)
    } else {
      unmatched.push(result)
    }
  }

  // Sort classified by score descending
  classified.sort((a, b) => (b.bestMatch?.score ?? 0) - (a.bestMatch?.score ?? 0))

  return { candidates: classified, unmatched, anchors }
}

// ─── Scoring functions ────────────────────────────────────────────────────────

function scoreCandidate(
  cand: ScannedCandidate,
  md: MapDef,
  anchors: GroundTruthAnchor[],
  groups: Map<string, number[]>,
  candidateIdx: number
): ScoreBreakdown {
  return {
    dimension: scoreDimension(cand, md),
    valueRange: scoreValueRange(cand, md),
    axisFingerprint: scoreAxisFingerprint(cand, md),
    proximity: scoreProximity(cand, md, anchors),
    structural: scoreStructural(cand, md, groups, candidateIdx),
  }
}

/** Score dimension match (0-25) */
function scoreDimension(cand: ScannedCandidate, md: MapDef): number {
  const { rows: cr, cols: cc } = cand
  const { rows: mr, cols: mc } = md

  // Small maps (≤4×4) are extremely common as random data in ECU binaries.
  // Penalize them unless they're an exact match for a known small mapDef (limiters).
  const isSmallCandidate = cr <= 4 && cc <= 4
  const isSmallMapDef = mr <= 4 && mc <= 4

  // Exact match
  if (cr === mr && cc === mc) return 25

  // Transposed match (some tools swap rows/cols)
  if (cr === mc && cc === mr) return 20

  const rowDiff = Math.abs(cr - mr)
  const colDiff = Math.abs(cc - mc)

  // Small candidate matching a large mapDef (or vice versa) — very unlikely to be correct
  if (isSmallCandidate && !isSmallMapDef) return 0
  if (!isSmallCandidate && isSmallMapDef) return 0

  // One exact, other within ±2
  if ((rowDiff === 0 && colDiff <= 2) || (colDiff === 0 && rowDiff <= 2)) return 18

  // Both within ±2
  if (rowDiff <= 2 && colDiff <= 2) return 12

  // One exact, other further off
  if (rowDiff === 0 || colDiff === 0) return 6

  // Both within ±4
  if (rowDiff <= 4 && colDiff <= 4) return 4

  return 0
}

/** Score physical value plausibility (0-25) */
function scoreValueRange(cand: ScannedCandidate, md: MapDef): number {
  // Apply mapDef's factor to candidate raw values to get physical range
  const physMin = cand.valueRange.min * md.factor + md.offsetVal
  const physMax = cand.valueRange.max * md.factor + md.offsetVal

  // Get expected ranges for this map's category
  const ranges = PHYSICAL_RANGES[md.category]
  if (!ranges || ranges.length === 0) return 5  // unknown category, small credit

  let bestScore = 0
  for (const expected of ranges) {
    // Calculate overlap fraction
    const overlapMin = Math.max(physMin, expected.min)
    const overlapMax = Math.min(physMax, expected.max)

    if (overlapMin > overlapMax) continue  // no overlap at all

    const overlapSize = overlapMax - overlapMin
    const physSize = physMax - physMin
    const expectedSize = expected.max - expected.min

    if (physSize <= 0 || expectedSize <= 0) continue

    // Fraction of candidate range within expected range (high = candidate fits well)
    const candOverlap = overlapSize / physSize
    // Fraction of expected range covered (high = candidate spans most of expected)
    const expOverlap = overlapSize / expectedSize

    // Penalize if candidate range extends far beyond expected (e.g. 0-65535 raw → 0-65 bar)
    const overextension = physSize > 0 ? Math.max(0, (physMax - expected.max) / physSize) + Math.max(0, (expected.min - physMin) / physSize) : 0
    const overextPenalty = Math.max(0, 1 - overextension)

    const score = (candOverlap * 0.5 + expOverlap * 0.2 + overextPenalty * 0.3)
    if (score > bestScore) bestScore = score
  }

  return Math.round(bestScore * 25)
}

// Per-mapDef axis fingerprints for precise identification.
// Maps with the same category (e.g. fuel) have different Y-axis patterns.
// Key: mapDef.id prefix → { yMin, yMax } expected raw axis range
const MAP_AXIS_HINTS: Record<string, { yMin: number; yMax: number; xMin?: number; xMax?: number; valueSpread?: [number, number]; dataRange?: [number, number]; yStartRange?: [number, number] }> = {
  // Smoke limiter: Y = airflow/MAF breakpoints (raw 3000-5000 range)
  // Values are NARROW: stock raw 950-1250 = 9.5-12.5 mg/st
  'edc16_smoke':   { yMin: 2500, yMax: 6000, valueSpread: [500, 2000] },
  // Torque→IQ: Y = torque request breakpoints (raw 0-3800)
  // Values are WIDE: raw 0-7240 = 0-72.4 mg/st
  'edc16_torque_iq': { yMin: 0, yMax: 4000, valueSpread: [3000, 10000] },
  // Boost target: Y = load/IQ (raw 0-4500)
  'edc16_boost':   { yMin: 0, yMax: 5000 },
  // Driver's wish: Y = pedal % (raw 0-10000 at factor 0.1)
  'edc16_drivers': { yMin: 0, yMax: 10500 },
  // Injection duration: Y = IQ (raw 0-3000)
  'edc16_fuel':    { yMin: 0, yMax: 4500, xMin: 500, xMax: 5500 },
  // SOI: Y = IQ (raw 0-2000)
  'edc16_soi':     { yMin: 0, yMax: 2500 },
  // MED17 axes use RPM×10: idle 2000-8000, redline 24000-28000
  // Boost target 12×16: X = RPM×10, Y = load (259-1408). Raw data 500-3500 mbar range.
  'med17_boost':   { yMin: 100, yMax: 2000, xMin: 1500, xMax: 28000, dataRange: [200, 4500] },
  // Fuel injection 16×16: X = RPM×10, Y = load. Raw data = duration in µs.
  'med17_fuel':    { yMin: 100, yMax: 2000, xMin: 1500, xMax: 28000, dataRange: [100, 65000] },
  // Torque limit 8×8: X = RPM×10 or direct RPM, Y = variable. Raw 0-6000 (0-600 Nm).
  'med17_torque':  { yMin: 100, yMax: 8000, xMin: 500, xMax: 28000, dataRange: [0, 6500] },
  // Ignition timing 12×16: X = RPM×10, Y = load (raw 427-7256). Data = int8 degrees.
  'med17_ign':     { yMin: 200, yMax: 8000, xMin: 1500, xMax: 28000 },
  // EDC17 extra maps: lambda, rail pressure, torque monitor
  'edc17_lambda':  { yMin: 0, yMax: 5000, xMin: 1000, xMax: 12000, dataRange: [500, 1500] },
  'edc17_rail':    { yMin: 0, yMax: 5000, xMin: 1000, xMax: 12000, dataRange: [5000, 25000] },
  'edc17_torque_monitor': { yMin: 0, yMax: 5000, xMin: 1000, xMax: 12000, dataRange: [0, 6500] },
  // MG1 maps: driver's wish, lambda, N75, rail pressure, torque monitor
  'mg1_drivers':   { yMin: 0, yMax: 10000, xMin: 500, xMax: 14000 },
  'mg1_lambda':    { yMin: 0, yMax: 5000, xMin: 500, xMax: 14000, dataRange: [500, 1500] },
  'mg1_n75':       { yMin: 0, yMax: 5000, xMin: 500, xMax: 14000, dataRange: [0, 1000] },
  'mg1_rail':      { yMin: 0, yMax: 5000, xMin: 500, xMax: 14000, dataRange: [5000, 25000] },
  'mg1_torque':    { yMin: 0, yMax: 10000, xMin: 500, xMax: 14000, dataRange: [0, 6500] },
  // DCM6.2 Delphi: Y = pressure (3000-21600 mbar), X = IQ/load (0-3300)
  // dataRange = [rawMin, rawMax] hard bounds on raw u16 values for this map type
  // yStartRange = [min, max] required range for Y-axis first value (rejects maps with wrong base pressure)
  'dcm62_boost':   { yMin: 2500, yMax: 22000, xMin: 0, xMax: 4000, valueSpread: [1000, 5000], dataRange: [500, 6500], yStartRange: [2800, 4000] },
  'dcm62_fuel':    { yMin: 2500, yMax: 20000, xMin: 0, xMax: 4000, valueSpread: [200, 5000], dataRange: [50, 6500], yStartRange: [2800, 4000] },
  'dcm62_torque':  { yMin: 2500, yMax: 22000, xMin: 0, xMax: 5000, dataRange: [0, 4500], yStartRange: [2800, 4000] },
}

/** Score axis fingerprint (0-25) */
function scoreAxisFingerprint(cand: ScannedCandidate, md: MapDef): number {
  let score = 0
  const ax = cand.axisX
  const xMin = ax.min
  const xMax = ax.max
  const xSpan = xMax - xMin

  // Check if X-axis looks like RPM (most common for diesel ECU maps)
  if (xMin >= RPM_IDLE_BAND.min && xMin <= RPM_IDLE_BAND.max) score += 5
  if (xMax >= RPM_REDLINE_BAND.min && xMax <= RPM_REDLINE_BAND.max) score += 4
  if (xSpan >= RPM_SPAN_RANGE.min && xSpan <= RPM_SPAN_RANGE.max) score += 3

  // Per-mapDef axis hint matching (more precise than category-based)
  const hintKey = Object.keys(MAP_AXIS_HINTS).find(k => md.id.startsWith(k))
  if (hintKey && cand.axisY) {
    const hint = MAP_AXIS_HINTS[hintKey]
    const yMin = cand.axisY.min
    const yMax = cand.axisY.max

    // HARD DISQUALIFIER: if dataRange is specified and raw values are outside bounds,
    // this candidate cannot be this map type. Return 0 immediately.
    if (hint.dataRange) {
      if (cand.valueRange.max > hint.dataRange[1] * 1.2 || cand.valueRange.min > hint.dataRange[1]) {
        return 0  // raw data WAY too high — wrong map
      }
    }

    // HARD DISQUALIFIER: Y-axis start must be in expected range for pressure-based maps.
    // The real DCM6.2 tuning maps all have Y starting at ~3200 mbar (atmospheric+).
    // Maps with Y starting at 16000+ are correction maps, not tuning maps.
    if (hint.yStartRange) {
      if (yMin < hint.yStartRange[0] || yMin > hint.yStartRange[1]) {
        return 0  // Y-axis start outside expected range — wrong map
      }
    }

    // Y-axis range overlap with expected hint
    if (yMin >= hint.yMin - 200 && yMax <= hint.yMax + 500) score += 7
    else if (yMax <= hint.yMax * 2) score += 3
    // X-axis hint if available
    if (hint.xMin !== undefined && hint.xMax !== undefined) {
      if (xMin >= hint.xMin - 200 && xMax <= hint.xMax + 500) score += 3
    }
    // Value spread check: smoke maps have narrow data range, fuel maps have wide range
    if (hint.valueSpread) {
      const dataSpread = cand.valueRange.max - cand.valueRange.min
      if (dataSpread >= hint.valueSpread[0] && dataSpread <= hint.valueSpread[1]) score += 5
    }
    // Data range bonus: raw values within expected bounds
    if (hint.dataRange) {
      const inRange = cand.valueRange.min >= hint.dataRange[0] * 0.5 && cand.valueRange.max <= hint.dataRange[1] * 1.1
      if (inRange) score += 3
    }
  } else if (cand.axisY) {
    // Fallback: category-based Y-axis scoring
    const ySpan = cand.axisY.max - cand.axisY.min
    switch (md.category) {
      case 'boost':
        if (ySpan > 500 && ySpan < 5000) score += 6
        break
      case 'fuel': case 'smoke':
        if (ySpan > 200 && ySpan < 5500) score += 6
        break
      case 'torque':
        if (ySpan >= 50 && ySpan <= 12000) score += 6
        break
      case 'ignition':
        if (ySpan >= 100 && ySpan <= 2500) score += 6
        break
      case 'emission':
        if (cand.axisY.min >= 0 && cand.axisY.max <= 200) score += 6
        break
    }
  } else {
    if (md.rows <= 2) score += 4  // 1D maps (limiters)
  }

  return Math.min(25, score)
}

/** Score offset proximity to known anchors (0-15) */
function scoreProximity(
  cand: ScannedCandidate,
  md: MapDef,
  anchors: GroundTruthAnchor[]
): number {
  let bestScore = 0

  // Check against ground truth anchors (A2L/signature matches).
  // Bosch Kf_ maps may have slight offset differences (2-10 bytes) due to
  // extra axis breakpoints in the binary vs A2L-declared dimensions.
  // Treat anything within 16 bytes as an exact match.
  for (const anchor of anchors) {
    if (anchor.mapDefId !== md.id) continue
    const dist = Math.abs(cand.offset - anchor.offset)
    if (dist <= 16) bestScore = Math.max(bestScore, 15)
    else if (dist <= 256) bestScore = Math.max(bestScore, 13)
    else if (dist <= 4096) bestScore = Math.max(bestScore, 10)
    else if (dist <= 65536) bestScore = Math.max(bestScore, 5)
  }

  // Fallback: check against fixedOffset from ecuDef
  if (bestScore === 0 && md.fixedOffset !== undefined && md.fixedOffset >= 0) {
    const dist = Math.abs(cand.offset - md.fixedOffset)
    if (dist <= 64) bestScore = Math.max(bestScore, 15)      // near-exact match
    else if (dist <= 1024) bestScore = Math.max(bestScore, 12)
    else if (dist <= 4096) bestScore = Math.max(bestScore, 8)
    else if (dist <= 65536) bestScore = Math.max(bestScore, 3)
  }

  return bestScore
}

/** Score structural patterns (0-10) */
function scoreStructural(
  cand: ScannedCandidate,
  md: MapDef,
  groups: Map<string, number[]>,
  candidateIdx: number
): number {
  let score = 0

  // Check if candidate is part of a structural group
  for (const [groupId, members] of groups) {
    if (!members.includes(candidateIdx)) continue

    if (groupId.startsWith('cluster_')) {
      // Large cluster (3+ maps with same dims nearby) — gear/mode variants.
      // Strong signal for torque, boost, or fuel maps (EDC17 has 3-30+ per cluster).
      score = Math.max(score, 8)
    } else if (groupId.startsWith('triplet_')) {
      // SOI triplet: 3+ maps with identical dimensions at regular spacing
      if (md.category === 'ignition' || md.category === 'fuel') {
        score = Math.max(score, 10)
      } else {
        score = Math.max(score, 5)
      }
    } else if (groupId.startsWith('pair_')) {
      // Primary + fallback pair
      if (md.category === 'boost' || md.category === 'torque' || md.category === 'fuel') {
        score = Math.max(score, 5)
      }
    }
  }

  // Unique dimension bonus: if only one mapDef has these exact dimensions,
  // it's a strong signal even without other evidence
  // (This is handled implicitly by dimension scoring, but add a small bonus
  // for truly unique dims like 4×4 DPF regen or 1×1 limiters)
  if (md.rows <= 2 && md.cols <= 2 && cand.rows <= 2 && cand.cols <= 2) {
    score = Math.max(score, 6)
  }

  return Math.min(10, score)
}

// ─── Structural group detection ───────────────────────────────────────────────

/**
 * Detects structural groups among candidates:
 * - Clusters: 3+ candidates with identical dimensions within 8KB of each other
 *   (EDC17 has gear/mode variant maps packed in clusters of 3-30+)
 * - Triplets: 3+ candidates with regular offset spacing (SOI maps)
 * - Pairs: 2 candidates with identical dimensions within 1KB
 */
function detectGroups(candidates: ScannedCandidate[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  const assigned = new Set<number>()

  // Group candidates by dimension signature
  const dimGroups = new Map<string, number[]>()
  for (let i = 0; i < candidates.length; i++) {
    const key = `${candidates[i].rows}x${candidates[i].cols}`
    const arr = dimGroups.get(key) || []
    arr.push(i)
    dimGroups.set(key, arr)
  }

  let groupCounter = 0
  for (const [, indices] of dimGroups) {
    if (indices.length < 2) continue

    // Sort by offset
    const sorted = [...indices].sort((a, b) => candidates[a].offset - candidates[b].offset)

    // Cluster detection: find groups of maps with same dims within 8KB of each other.
    // EDC17 has clusters of 3-30+ maps for gear/mode variants.
    let cluster: number[] = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const gap = candidates[sorted[i]].offset - candidates[cluster[cluster.length - 1]].offset
      if (gap <= 8192) {
        cluster.push(sorted[i])
      } else {
        // End of cluster — save if 3+ maps
        if (cluster.length >= 3) {
          const gid = `cluster_${groupCounter++}`
          groups.set(gid, [...cluster])
          cluster.forEach(idx => assigned.add(idx))
        }
        cluster = [sorted[i]]
      }
    }
    // Final cluster
    if (cluster.length >= 3) {
      const gid = `cluster_${groupCounter++}`
      groups.set(gid, [...cluster])
      cluster.forEach(idx => assigned.add(idx))
    }

    // Check for regular triplets (SOI-style evenly spaced maps)
    if (sorted.length >= 3 && !sorted.some(i => assigned.has(i))) {
      const offsets = sorted.map(i => candidates[i].offset)
      const gaps = offsets.slice(1).map((o, i) => o - offsets[i])
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
      const isRegular = avgGap >= 64 && avgGap <= 4096 &&
        gaps.every(g => Math.abs(g - avgGap) / avgGap < 0.25)
      if (isRegular) {
        groups.set(`triplet_${groupCounter++}`, sorted)
        sorted.forEach(idx => assigned.add(idx))
        continue
      }
    }

    // Check for pairs (2 candidates within 1KB)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (assigned.has(sorted[i]) || assigned.has(sorted[i + 1])) continue
      const dist = candidates[sorted[i + 1]].offset - candidates[sorted[i]].offset
      if (dist <= 1024) {
        groups.set(`pair_${groupCounter++}`, [sorted[i], sorted[i + 1]])
        assigned.add(sorted[i])
        assigned.add(sorted[i + 1])
      }
    }
  }

  return groups
}

// ─── Auto-Labeling Engine ────────────────────────────────────────────────────

/**
 * Heuristic map type guesser for unknown/unmatched maps.
 * Uses dimensions + value ranges to suggest a map type when the classifier
 * can't match against known definitions. Returns a suggested label with
 * "(auto)" suffix to indicate it's a heuristic guess, not a confirmed match.
 */
export function guessMapType(cand: ScannedCandidate): AIMatch | null {
  const { rows, cols, valueRange } = cand
  const cells = rows * cols
  const { min, max, mean } = valueRange

  // Large maps (14×14+) — main tuning maps
  if (rows >= 12 && cols >= 12 && cells >= 144) {
    if (max > 2000 && max < 6000 && min > 100)
      return { mapName: 'Boost Target (auto)', category: 'boost', similarity: 0.6, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.001, unit: 'bar', source: 'heuristic', confidence: 0.6 }
    if (max > 50000)
      return { mapName: 'Injection Duration (auto)', category: 'fuel', similarity: 0.55, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.001, unit: 'ms', source: 'heuristic', confidence: 0.55 }
    if (max < 1500 && min > 400)
      return { mapName: 'Lambda Target (auto)', category: 'smoke', similarity: 0.6, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.001, unit: 'λ', source: 'heuristic', confidence: 0.6 }
    if (max < 7000 && mean < 4000 && mean > 500)
      return { mapName: 'Torque Map (auto)', category: 'torque', similarity: 0.5, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.1, unit: 'Nm', source: 'heuristic', confidence: 0.5 }
    if (max > 6000 && max < 25000 && min > 3000)
      return { mapName: 'Rail Pressure (auto)', category: 'fuel', similarity: 0.55, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.1, unit: 'bar', source: 'heuristic', confidence: 0.55 }
  }

  // Medium maps (8×8 to 12×12) — limits, EGR, secondary maps
  if (rows >= 6 && cols >= 6 && cells >= 36 && cells < 144) {
    if (max < 7000 && mean > 100 && mean < 4000)
      return { mapName: 'Torque Limit (auto)', category: 'torque', similarity: 0.5, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.1, unit: 'Nm', source: 'heuristic', confidence: 0.5 }
    if (max < 1000 && mean < 500)
      return { mapName: 'N75 Duty (auto)', category: 'boost', similarity: 0.45, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 0.1, unit: '%', source: 'heuristic', confidence: 0.45 }
  }

  // Small maps (2×N or N×2) — 1D curves, limiters
  if ((rows <= 2 || cols <= 2) && cells >= 4) {
    if (max > 3000 && max < 8000)
      return { mapName: 'RPM Curve (auto)', category: 'limiter', similarity: 0.5, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 1, unit: 'RPM', source: 'heuristic', confidence: 0.5 }
    if (max > 100 && max < 350)
      return { mapName: 'Speed Curve (auto)', category: 'limiter', similarity: 0.5, ecuFamily: '', dimensions: `${rows}x${cols}`, factor: 1, unit: 'km/h', source: 'heuristic', confidence: 0.5 }
  }

  return null
}

// ─── DNA Generation (renderer-side) ──────────────────────────────────────────

/**
 * Generate a 128-dim DNA vector from a scanned candidate's raw data in the buffer.
 * Same algorithm as dna.ts in the MCP server.
 */
export function generateCandidateDNA(
  buffer: ArrayBuffer,
  candidate: ScannedCandidate
): number[] {
  const view = new DataView(buffer)
  const { offset, rows, cols, le } = candidate

  // Read raw uint16 values into grid
  const grid: number[][] = []
  let min = Infinity, max = -Infinity
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      const byteOff = offset + (r * cols + c) * 2
      if (byteOff + 2 > buffer.byteLength) { row.push(0); continue }
      const val = le ? view.getUint16(byteOff, true) : view.getUint16(byteOff, false)
      row.push(val)
      if (val < min) min = val
      if (val > max) max = val
    }
    grid.push(row)
  }

  // Normalize to 0.0–1.0
  const range = max - min || 1
  const normalized = grid.map(row => row.map(v => (v - min) / range))

  // Resample to 8×8 via bilinear interpolation
  const resampled: number[][] = []
  for (let r = 0; r < 8; r++) {
    const rRow: number[] = []
    for (let c = 0; c < 8; c++) {
      const srcR = (r / 7) * (rows - 1)
      const srcC = (c / 7) * (cols - 1)
      const r0 = Math.floor(srcR), r1 = Math.min(r0 + 1, rows - 1)
      const c0 = Math.floor(srcC), c1 = Math.min(c0 + 1, cols - 1)
      const fr = srcR - r0, fc = srcC - c0
      rRow.push(
        normalized[r0][c0] * (1 - fr) * (1 - fc) +
        normalized[r0][c1] * (1 - fr) * fc +
        normalized[r1][c0] * fr * (1 - fc) +
        normalized[r1][c1] * fr * fc
      )
    }
    resampled.push(rRow)
  }

  // 64 value features + 32 horizontal gradients + 32 vertical gradients = 128
  const dna: number[] = resampled.flat()
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) dna.push(resampled[r][c * 2 + 1] - resampled[r][c * 2])
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) dna.push(resampled[r * 2 + 1][c] - resampled[r * 2][c])
  while (dna.length < 128) dna.push(0)
  return dna.slice(0, 128)
}

// ─── AI Match Result ─────────────────────────────────────────────────────────

export interface AIMatch {
  mapName: string
  category: string
  similarity: number     // 0-1
  ecuFamily: string
  dimensions: string
  factor: number
  unit: string
  source: string         // 'a2l' | 'kp' | 'dimension'
  confidence: number
}

/**
 * Search the Supabase tuning_knowledge DB for maps matching a DNA vector.
 * Returns top matches sorted by similarity.
 */
export async function matchByDNA(
  dna: number[],
  ecuFamily?: string,
  threshold = 0.65,
  limit = 3
): Promise<AIMatch[]> {
  try {
    const { data, error } = await supabase.rpc('match_map_dna', {
      query_embedding: `[${dna.join(',')}]`,
      query_family: ecuFamily ?? null,
      match_threshold: threshold,
      match_count: limit,
    })
    if (error || !data) return []
    return (data as any[]).map(row => ({
      mapName: row.map_name ?? 'Unknown',
      category: row.category ?? 'other',
      similarity: row.similarity ?? 0,
      ecuFamily: row.ecu_family ?? '',
      dimensions: row.dimensions ?? '',
      factor: row.factor ?? 1,
      unit: row.unit ?? '',
      source: row.source_definition ?? 'dimension',
      confidence: row.confidence ?? 0.5,
    }))
  } catch {
    return []
  }
}

/**
 * Batch-match all unmatched candidates against the AI database.
 * Returns a map of candidate offset → best AIMatch.
 */
export async function matchUnknownsByDNA(
  buffer: ArrayBuffer,
  unmatched: ClassifiedCandidate[],
  ecuFamily?: string
): Promise<Map<number, AIMatch>> {
  const results = new Map<number, AIMatch>()
  // Process in parallel batches of 5 to avoid hammering the DB
  const BATCH = 5
  for (let i = 0; i < unmatched.length; i += BATCH) {
    const batch = unmatched.slice(i, i + BATCH)
    const promises = batch.map(async (cc) => {
      const dna = generateCandidateDNA(buffer, cc.candidate)
      const matches = await matchByDNA(dna, ecuFamily, 0.65, 1)
      if (matches.length > 0) {
        results.set(cc.candidate.offset, matches[0])
      }
    })
    await Promise.all(promises)
  }
  return results
}

// ─── ME7 Axis Pair Scanner ───────────────────────────────────────────────────

/**
 * Checks if an axis has automotive-plausible values.
 * Returns a type string ('rpm'|'load'|'pedal'|'torque'|'misc') or null if implausible.
 *
 * Automotive ECU axes have specific value ranges:
 *   RPM:    300-8500 range, first < 1500, last > 2500, all < 10000
 *   Load:   0-300 range (mg/stroke, %, mbar), first < 60, last > 60, all < 500
 *   Pedal:  0-100 range, first < 10, last > 80, all ≤ 100
 *   Torque: 0-600 range, all < 1000
 *   Misc:   0-1000 range (temperature, voltage, etc.)
 *
 * Rejects axes with values > 10000 (these are addresses, pointers, or random data).
 */
function classifyAxis(values: number[]): 'rpm' | 'load' | 'pedal' | 'torque' | null {
  if (values.length < 4) return null
  const first = values[0]
  const last = values[values.length - 1]
  const maxVal = last  // monotonic, so last is max

  // Hard reject: any value > 10000 is not a real ECU axis
  // (RPM never exceeds ~9000 in automotive, load/pedal/torque much less)
  if (maxVal > 10000) return null

  // RPM: typical idle 500-1200, redline 3500-8500
  if (first >= 200 && first <= 1500 && last >= 2500 && last <= 9000) return 'rpm'

  // Load (%): 0-300 range (0-100% or 0-300 mg/stroke)
  if (first <= 60 && last >= 50 && last <= 500) return 'load'

  // Pedal position: 0-100%
  if (first <= 10 && last >= 70 && last <= 105) return 'pedal'

  // Torque: 0-600 Nm
  if (first <= 50 && last >= 100 && last <= 800) return 'torque'

  return null
}

/**
 * Scans ME7/ME9 binaries for map structures without Kf_ dimension prefix.
 *
 * ME7 uses C167 processor (LITTLE-ENDIAN). Map layout:
 *   [X_axis: N×u16_LE][Y_axis: M×u16_LE][data: N×M×u16_LE]
 *
 * Strategy: scan for consecutive monotonic uint16 LE sequences where BOTH
 * axes have automotive-plausible values (RPM 300-8500, Load 0-300, etc.).
 *
 * Key filters to avoid false positives:
 *   - Both axes must classify as automotive types (rpm/load/pedal/torque)
 *   - No axis value > 10000 (rejects pointers, addresses, random data)
 *   - Minimum 6×4 or 4×6 cells (skip tiny candidates)
 *   - Data block has stddev > 5 (not flat/empty)
 */
/**
 * Fast ME7 axis pair scanner using anchor-value search.
 *
 * Instead of checking every 2-byte position (293K iterations on a 1MB file),
 * we search ONLY for positions where uint16_LE matches known ME7 axis starting
 * values. This reduces iterations from ~293K to ~500-2000 (only positions where
 * the byte pattern matches a known axis start value).
 *
 * Known ME7 axis start values:
 *   RPM axes start at:  720, 500, 600, 800, 1000
 *   Load axes start at: 0, 5, 10, 20
 *   Pedal axes start at: 0, 3, 5
 *   Torque axes start at: 0, 10, 50
 *
 * For each hit, try to read a monotonic axis forward, validate as automotive,
 * then check for a Y axis immediately following.
 */
function scanME7AxisPairs(
  view: DataView, start: number, end: number,
  ecuDef: EcuDef,
  candidates: ScannedCandidate[],
  usedRanges: Array<[number, number]>,
  maxCandidates: number
): void {
  const bufLen = view.byteLength
  const le = true  // C167 is little-endian

  // Known anchor values that ME7 axes commonly start with
  // RPM: idle region 500-1200
  // Load/Pedal/Torque: 0-50
  const ANCHOR_VALUES = new Set([
    // RPM starts
    500, 520, 560, 600, 640, 680, 700, 720, 740, 760, 800, 840, 880, 900, 960, 1000, 1040, 1080, 1100, 1120, 1200,
    // Load/torque/pedal starts (small values)
    0, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 25, 30, 40, 50,
    // Negative torque (stored as uint16, typically 0 or small positive after offset)
  ])

  for (let i = start; i <= end - 16 && candidates.length < maxCandidates; i += 2) {
    const firstVal = view.getUint16(i, le)

    // Only proceed if this value matches a known axis anchor
    if (!ANCHOR_VALUES.has(firstVal)) continue

    // Try to read X axis (monotonically increasing)
    const xAxis = tryReadAxisFwd(view, i, le, bufLen)
    if (!xAxis || xAxis.length < 4) continue

    // Validate X axis has automotive-plausible values
    const xType = classifyAxis(xAxis)
    if (!xType) continue

    // Y axis should start right after X axis
    const yStartPos = i + xAxis.length * 2
    const yAxis = tryReadAxisFwd(view, yStartPos, le, bufLen)
    if (!yAxis || yAxis.length < 4) continue

    // Validate Y axis has automotive-plausible values
    const yType = classifyAxis(yAxis)
    if (!yType) continue

    const cols = xAxis.length
    const rows = yAxis.length

    // Require meaningful map size — at least 24 cells
    if (cols * rows < 24) continue

    // Data block follows axes
    const dataStart = yStartPos + rows * 2
    const dataBytes = rows * cols * 2
    if (dataStart + dataBytes > bufLen) continue

    // Skip if overlapping with existing candidates
    if (overlaps(usedRanges, i, dataStart + dataBytes)) continue

    // Read and validate data block
    const stats = readBlock(view, dataStart, rows, cols, le)
    if (stats.allZero || stats.allFF || stats.stddev < 5) continue

    // Score: prefer larger maps, better axis types, matching ecuDef dimensions
    const dimMatch = ecuDef.maps.some(m =>
      (m.rows === rows && m.cols === cols) || (m.rows === cols && m.cols === rows)
    ) ? 1 : 0.3
    const axisBonus = (xType === 'rpm' || yType === 'rpm') ? 0.15 : 0
    const sizeBonus = Math.min(1, (cols * rows) / 100) * 0.15
    const confidence = Math.min(1,
      Math.min(1, (xAxis[cols - 1] - xAxis[0]) / 3000) * 0.20 +
      Math.min(1, stats.stddev / 80) * 0.20 +
      dimMatch * 0.25 +
      axisBonus +
      sizeBonus +
      0.05
    )

    candidates.push({
      offset: dataStart, headerOffset: i,
      rows, cols, dtype: 'uint16', le: true,
      axisX: { values: xAxis, min: xAxis[0], max: xAxis[cols - 1] },
      axisY: { values: yAxis, min: yAxis[0], max: yAxis[rows - 1] },
      valueRange: { min: stats.min, max: stats.max, mean: stats.mean, stddev: stats.stddev },
      rawData: [], confidence,
    })
    usedRanges.push([i, dataStart + dataBytes])
    i = dataStart + dataBytes - 2  // skip past this candidate
  }
}

// ─── fixedOffset Scanner (Pass 5) — C167/pointer-arch ECUs ──────────────────

/**
 * For C167-arch ECUs (ME7, EDC15, MS43), DAMOS symbol names in the binary
 * are NOT inline with data — they're in a definition section, and data is
 * at a separate address via a pointer table. So signature → sigOffset → data
 * does NOT work (it only works for EDC16/EDC17 inline layout).
 *
 * Instead, this pass tries fixedOffset from each mapDef — known byte offsets
 * for common ECU variants. Reads data at fixedOffset, validates quality,
 * and creates candidates for maps that pass validation.
 *
 * Also checks a range of nearby offsets (±512 bytes in 2-byte steps) around
 * fixedOffset to handle variant differences where the offset may be slightly shifted.
 */
function scanFixedOffsets(
  buffer: ArrayBuffer,
  ecuDef: EcuDef,
  candidates: ScannedCandidate[],
  usedRanges: Array<[number, number]>,
  maxCandidates: number
): void {
  const view = new DataView(buffer)
  const bufLen = buffer.byteLength
  const family = ecuDef.family.toUpperCase()

  // EDC15 fixedOffset values are variant-specific and may be wrong for the user's file.
  // For small files (≤1MB), fall back to scanning the full cal region with known dimensions.
  // This is fast because EDC15 files are 256KB-1MB and we know exact rows/cols/dtype.
  const isSmallFile = bufLen <= 0x100000  // ≤1MB
  // ME7/ME9 1MB files: cal data starts as early as 0x10000 (~6%) — AJQ variant maps at 7-11%.
  // EDC15 512KB files: cal data is in upper half (50%+). Starting at 40% to catch edge cases.
  // Starting too low (10%) causes scanner to find code/tables as false positives.
  const calStartPct = family.includes('ME7') || family.includes('ME9') || family.includes('MED9') ? 0.05
    : family.includes('EDC15') ? 0.40
    : family.includes('MS43') ? 0.10
    : 0.30
  const calRegionStart = (Math.floor(bufLen * calStartPct)) & ~1

  for (const md of ecuDef.maps) {
    if (candidates.length >= maxCandidates) break

    const { rows, cols, le } = md
    const bytesPerCell = md.dtype === 'uint8' || md.dtype === 'int8' ? 1
      : md.dtype === 'float32' ? 4
      : 2
    const dataBytes = rows * cols * bytesPerCell

    // Build list of offsets to try in priority order:
    // 1. fixedOffset ±512 (fast, exact for known variants)
    // 2. Cluster search: ±8KB around already-found maps (maps cluster in ROM)
    // 3. Cal region scan (fallback for small files ≤1MB)
    const offsets: number[] = []
    const coveredRanges: Array<[number, number]> = []  // track ranges already added

    // Priority 1: fixedOffset ±512
    if (md.fixedOffset !== undefined && md.fixedOffset >= 0) {
      offsets.push(md.fixedOffset)
      for (let delta = 2; delta <= 512; delta += 2) {
        offsets.push(md.fixedOffset + delta)
        offsets.push(md.fixedOffset - delta)
      }
      coveredRanges.push([md.fixedOffset - 512, md.fixedOffset + 512])
    }

    // Priority 2: Cluster search — ±8KB around already-found map offsets.
    // Cal maps are typically grouped together in ROM. If KFZW was found at 0x160A9,
    // KFZWOP and KFZWMN are likely within a few KB. Step by 2 (word-aligned).
    const CLUSTER_RADIUS = 8192  // 8KB
    for (const [usedStart] of usedRanges) {
      const cMin = Math.max(0, usedStart - CLUSTER_RADIUS) & ~1
      const cMax = Math.min(bufLen, usedStart + CLUSTER_RADIUS)
      // Skip if this cluster range is already covered
      if (coveredRanges.some(([lo, hi]) => cMin >= lo && cMax <= hi)) continue
      for (let off = cMin; off + dataBytes <= cMax; off += 2) {
        if (coveredRanges.some(([lo, hi]) => off >= lo && off <= hi)) continue
        offsets.push(off)
      }
      coveredRanges.push([cMin, cMax])
    }

    // Priority 3: Full cal region scan for small files (≤1MB).
    // Skip for 1×1 scalars — too many false positives when scanning blindly.
    const n = rows * cols
    if (isSmallFile && n > 1) {
      const step = dataBytes > 128 ? 4 : 2
      for (let off = calRegionStart; off + dataBytes <= bufLen; off += step) {
        if (coveredRanges.some(([lo, hi]) => off >= lo && off <= hi)) continue
        offsets.push(off)
      }
    } else if (!isSmallFile && md.fixedOffset === undefined) {
      // Large file with no fixedOffset and no cluster — skip
      if (offsets.length === 0) continue
    }

    let bestOffset = -1
    let bestScore = 0
    let bestGrid: number[][] = []
    let bestStats = { min: 0, max: 0, mean: 0, stddev: 0 }

    const scanStart = Date.now()
    for (const dataStart of offsets) {
      if (dataStart < 0 || dataStart + dataBytes > bufLen) continue
      if (overlaps(usedRanges, dataStart, dataStart + dataBytes)) continue

      // Time limit: 1500ms per map to prevent freezing on large cal region scans
      if (Date.now() - scanStart > 1500) break

      // Quick pre-filter: check first 2 cells — reject all-zero/all-FF blocks fast
      if (dataBytes > 4) {
        const c0 = bytesPerCell === 1 ? view.getUint8(dataStart) : view.getUint16(dataStart, le)
        const c1 = bytesPerCell === 1 ? view.getUint8(dataStart + bytesPerCell) : view.getUint16(dataStart + bytesPerCell, le)
        if (c0 === 0 && c1 === 0) continue
        if (bytesPerCell === 2 && c0 === 0xFFFF && c1 === 0xFFFF) continue
        if (bytesPerCell === 1 && c0 === 0xFF && c1 === 0xFF) continue
      }

      // Read data block
      const grid: number[][] = []
      let vMin = Infinity, vMax = -Infinity, vSum = 0
      let allZero = true, allFF = true

      for (let r = 0; r < rows; r++) {
        const row: number[] = []
        for (let c = 0; c < cols; c++) {
          const cellOff = dataStart + (r * cols + c) * bytesPerCell
          let v: number
          if (md.dtype === 'uint8') v = view.getUint8(cellOff)
          else if (md.dtype === 'int8') v = view.getInt8(cellOff)
          else if (md.dtype === 'float32') v = view.getFloat32(cellOff, le)
          else if (md.dtype === 'int16') v = view.getInt16(cellOff, le)
          else v = view.getUint16(cellOff, le)
          row.push(v)
          if (v < vMin) vMin = v
          if (v > vMax) vMax = v
          vSum += v
          if (v !== 0) allZero = false
          if (bytesPerCell === 1 && v !== 0xFF) allFF = false
          if (bytesPerCell === 2 && v !== 0xFFFF) allFF = false
        }
        grid.push(row)
      }

      if (allZero || allFF) continue

      const n = rows * cols
      const mean = vSum / n

      // Reject sparse data — if >60% of cells are zero, this isn't a real cal map
      if (n > 1) {
        let zeroCount = 0
        for (const row of grid) for (const v of row) if (v === 0) zeroCount++
        if (zeroCount / n > 0.60) continue
      }

      let var_ = 0
      for (const row of grid) for (const v of row) var_ += (v - mean) ** 2
      const stddev = Math.sqrt(var_ / n)

      // For scalar maps (1×1), just check value is in plausible range
      if (n === 1) {
        const phys = vMin * md.factor + md.offsetVal
        const ranges = PHYSICAL_RANGES[md.category]
        if (ranges && ranges.some(r => phys >= r.min && phys <= r.max)) {
          if (bestScore < 0.7) {
            bestScore = 0.7
            bestOffset = dataStart
            bestGrid = grid
            bestStats = { min: vMin, max: vMax, mean, stddev }
          }
        }
        continue
      }

      if (stddev < 1) continue

      // Reject near-constant data (e.g. 0, 413, 413, 413, 413... = one outlier + constant)
      // Real cal maps have meaningful variation. Coefficient of variation should be > 5%.
      if (n >= 4 && mean > 0 && stddev / mean < 0.05) continue

      // 1D maps (single row, multiple cols): check smoothness — should not have wild jumps.
      // Real 1D curves (LDRXN, MXMOM, LSMK) are smooth ramps or plateaus.
      if (rows === 1 && cols >= 4) {
        let smooth1D = 0
        for (let c = 1; c < cols; c++) {
          const diff = Math.abs(grid[0][c] - grid[0][c - 1])
          if (diff / range < 0.25) smooth1D++
        }
        const smooth1DPct = smooth1D / (cols - 1)
        if (smooth1DPct < 0.60) continue  // reject jagged 1D data
      }

      // Score the data quality — check physical plausibility
      const physMin = vMin * md.factor + md.offsetVal
      const physMax = vMax * md.factor + md.offsetVal
      const ranges = PHYSICAL_RANGES[md.category]
      let rangeScore = 0.3  // default if no range defined
      if (ranges) {
        // Hard reject: if physical values are completely outside ALL expected ranges, skip.
        // E.g. SDATF at 7205°BTDC when expected range is [-10, 45] — clearly wrong offset.
        let anyOverlap = false
        for (const expected of ranges) {
          const overlapMin = Math.max(physMin, expected.min)
          const overlapMax = Math.min(physMax, expected.max)
          if (overlapMin <= overlapMax) {
            anyOverlap = true
            const physSize = physMax - physMin
            if (physSize > 0) {
              rangeScore = Math.max(rangeScore, (overlapMax - overlapMin) / physSize)
            }
          }
        }
        // If NO physical range overlaps at all, this data is at the wrong offset — reject
        if (!anyOverlap) continue
      }

      // Smoothness check — real cal maps are smooth in BOTH row and column directions.
      // Check horizontal (row) and vertical (column) adjacent cell differences.
      // A jump > 20% of the total range is considered "rough" — real maps have gradual transitions.
      const range = vMax - vMin || 1
      let smoothCells = 0, totalChecked = 0

      // Row smoothness (horizontal)
      for (let r = 0; r < rows; r++) {
        for (let c = 1; c < cols; c++) {
          const diff = Math.abs(grid[r][c] - grid[r][c - 1])
          if (diff / range < 0.20) smoothCells++
          totalChecked++
        }
      }
      // Column smoothness (vertical) — critical for catching garbage
      for (let c = 0; c < cols; c++) {
        for (let r = 1; r < rows; r++) {
          const diff = Math.abs(grid[r][c] - grid[r - 1][c])
          if (diff / range < 0.20) smoothCells++
          totalChecked++
        }
      }
      const smoothness = totalChecked > 0 ? smoothCells / totalChecked : 0

      // Hard reject: real cal maps should have > 50% smooth adjacent cells (both directions).
      // Garbage data from random binary typically scores 20-40% smoothness.
      if (n >= 16 && smoothness < 0.50) continue

      const score = rangeScore * 0.5 + smoothness * 0.3 + Math.min(1, stddev / 100) * 0.2

      if (score > bestScore && score > 0.35) {
        bestScore = score
        bestOffset = dataStart
        bestGrid = grid
        bestStats = { min: vMin, max: vMax, mean, stddev }
      }

      // Early exit once we find a high-confidence match (saves time on cal region scan)
      if (bestScore > 0.75) break
    }

    if (bestOffset >= 0) {
      const xValues = md.axisXValues ?? Array.from({ length: cols }, (_, i) => i + 1)
      const yValues = md.axisYValues ?? (rows > 1 ? Array.from({ length: rows }, (_, i) => i + 1) : null)

      candidates.push({
        offset: bestOffset,
        rows, cols,
        dtype: md.dtype === 'int16' ? 'int16' : md.dtype === 'int8' ? 'int8' : md.dtype === 'uint8' ? 'uint8' : 'uint16',
        le,
        axisX: { values: xValues, min: xValues[0], max: xValues[xValues.length - 1] },
        axisY: yValues ? { values: yValues, min: yValues[0], max: yValues[yValues.length - 1] } : null,
        valueRange: bestStats,
        rawData: bestGrid,
        confidence: Math.min(0.85, bestScore),
      })
      usedRanges.push([bestOffset, bestOffset + dataBytes])
    }
  }
}

// ─── EDC15 Axis Marker Scanner ───────────────────────────────────────────────

/**
 * Scans for EDC15 calibration maps using the format discovered from real binary
 * reverse engineering. EDC15 (C167) stores maps in this structure:
 *
 *   [0xEA38:u16_LE][X_count:u16_LE][X_axis: X_count×u16_LE][sep:u16][Y_count:u16_LE][Y_axis: Y_count×u16_LE][DATA: X_count×Y_count×u16_LE]
 *
 * Key properties:
 * - ALL data is little-endian (C167 native byte order)
 * - 0xEA38 (59960) is the primary axis marker, appears before most map definitions
 * - A separator word (varies, typically >30000) sits between X axis and Y count
 * - Cal data stored in 3 redundant copies ~0xC000 apart — only scan first copy
 * - Data stored as X_count rows × Y_count columns
 * - Typical X axis: RPM (760-5355), Y axis: IQ/Load (0-5100)
 */
function scanEDC15AxisMarkers(
  buffer: ArrayBuffer,
  ecuDef: EcuDef | null
): ScannedCandidate[] {
  const data = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const candidates: ScannedCandidate[] = []
  const usedRanges: Array<[number, number]> = []
  const le = true  // EDC15 C167 is little-endian

  // EDC15 cal region: maps found at ~0x58000 in 512KB files (68% mark).
  // 3 redundant copies: copy1 0x58000-0x64000, copy2 0x64000-0x70000, copy3 0x70000-0x7C000.
  // Only scan the first copy to avoid duplicates.
  // Binary analysis of real VW Golf 1.9 TDI 354613: 76 markers per copy, maps at 0x59866-0x60AFC.
  const calStart = len <= 0x100000
    ? Math.floor(len * 0.53) & ~1   // 512KB: 0x44000 = 53% (catch early cal tables)
    : Math.floor(len * 0.60) & ~1   // 1MB: start at 60%
  // Scan first copy plus extra margin — up to ~78% for 512KB
  const calEnd = Math.min(
    len <= 0x100000 ? Math.floor(len * 0.78) : Math.floor(len * 0.80),
    len - 32
  )

  // Primary scan: look for 0xEA38 marker followed by valid axis
  const MARKER = 59960  // 0xEA38

  for (let i = calStart; i < calEnd - 8 && candidates.length < 650; i += 2) {
    const val = view.getUint16(i, le)
    if (val !== MARKER) continue

    // Next word should be X axis count (2-24)
    const xCount = view.getUint16(i + 2, le)
    if (xCount < 2 || xCount > 24) continue

    const xStart = i + 4
    const xEnd = xStart + xCount * 2
    if (xEnd + 4 > len) continue

    // Read X axis — must be monotonically increasing
    const xAxis: number[] = []
    let xOk = true
    for (let j = 0; j < xCount; j++) {
      const v = view.getUint16(xStart + j * 2, le)
      if (j > 0 && v <= xAxis[j - 1]) { xOk = false; break }
      if (v > 50000) { xOk = false; break }
      xAxis.push(v)
    }
    if (!xOk || xAxis.length !== xCount) continue
    if (xAxis[xCount - 1] - xAxis[0] < 100) continue  // span too small

    // Skip separator word, then read Y count
    const sepOff = xEnd  // separator word
    const yCountOff = sepOff + 2
    if (yCountOff + 2 > len) continue

    const yCount = view.getUint16(yCountOff, le)
    if (yCount < 2 || yCount > 24) continue
    if (xCount * yCount < 8) continue  // at least 4×2 or 2×4

    const yStart = yCountOff + 2
    const yEnd = yStart + yCount * 2
    if (yEnd > len) continue

    // Read Y axis — must be monotonically increasing
    const yAxis: number[] = []
    let yOk = true
    for (let j = 0; j < yCount; j++) {
      const v = view.getUint16(yStart + j * 2, le)
      if (j > 0 && v <= yAxis[j - 1]) { yOk = false; break }
      if (v > 50000) { yOk = false; break }
      yAxis.push(v)
    }
    if (!yOk || yAxis.length !== yCount) continue
    if (yAxis[yCount - 1] - yAxis[0] < 10) continue  // span too small

    // Data block follows Y axis
    const dataStart = yEnd
    const dataBytes = xCount * yCount * 2
    if (dataStart + dataBytes > len) continue

    // Check for overlap with existing candidates
    if (overlaps(usedRanges, i, dataStart + dataBytes)) continue

    // Read and validate data block (xCount rows × yCount cols)
    const stats = readBlock(view, dataStart, xCount, yCount, le)
    if (stats.allZero || stats.allFF) continue
    // Skip constant maps (all same value) — stddev must be > 0
    if (stats.stddev < 1) continue

    // Smoothness check — real cal maps have smooth gradients
    let smoothH = 0, smoothV = 0, totalH = 0, totalV = 0
    const range = stats.max - stats.min || 1
    for (let r = 0; r < xCount; r++) {
      for (let c = 1; c < yCount; c++) {
        totalH++
        const v0 = view.getUint16(dataStart + (r * yCount + c - 1) * 2, le)
        const v1 = view.getUint16(dataStart + (r * yCount + c) * 2, le)
        if (Math.abs(v1 - v0) < range * 0.4) smoothH++
      }
    }
    for (let r = 1; r < xCount; r++) {
      for (let c = 0; c < yCount; c++) {
        totalV++
        const v0 = view.getUint16(dataStart + ((r - 1) * yCount + c) * 2, le)
        const v1 = view.getUint16(dataStart + (r * yCount + c) * 2, le)
        if (Math.abs(v1 - v0) < range * 0.4) smoothV++
      }
    }
    const hSmooth = totalH > 0 ? smoothH / totalH : 0
    const vSmooth = totalV > 0 ? smoothV / totalV : 0
    // Require some smoothness in at least one direction (lowered from 0.5 to catch more EDC15 maps)
    if (hSmooth < 0.35 && vSmooth < 0.35) continue

    // Score: prefer larger maps, better smoothness, matching ecuDef dimensions
    const dimMatch = ecuDef ? ecuDef.maps.some(m =>
      (m.rows === xCount && m.cols === yCount) || (m.rows === yCount && m.cols === xCount)
    ) ? 1 : 0.3 : 0.5
    const sizeBonus = Math.min(1, (xCount * yCount) / 150) * 0.15
    const smoothBonus = Math.max(hSmooth, vSmooth) * 0.25
    const spanBonus = Math.min(1, (xAxis[xCount - 1] - xAxis[0]) / 3000) * 0.15
    const confidence = Math.min(1,
      0.15 +  // base confidence for finding the 0xEA38 pattern
      spanBonus +
      smoothBonus +
      dimMatch * 0.20 +
      sizeBonus +
      Math.min(1, stats.stddev / 100) * 0.10
    )

    candidates.push({
      offset: dataStart, headerOffset: i,
      rows: xCount, cols: yCount,
      dtype: 'uint16', le: true,
      axisX: { values: xAxis, min: xAxis[0], max: xAxis[xCount - 1] },
      axisY: { values: yAxis, min: yAxis[0], max: yAxis[yCount - 1] },
      valueRange: { min: stats.min, max: stats.max, mean: stats.mean, stddev: stats.stddev },
      rawData: [], confidence,
    })
    usedRanges.push([i, dataStart + dataBytes])
    // Skip past this map
    i = dataStart + dataBytes - 2
  }

  return candidates
}

// ─── EDC17 Axis Marker Scanner ───────────────────────────────────────────────

/**
 * Scans for EDC17-style maps that use 0x02 axis markers instead of Bosch Kf_
 * inline axis layout. EDC17/MED17 (TriCore) uses a different structure:
 *
 *   [0x02][cols:u16][col_axis:cols*2B][0x02][rows:u16][row_axis:rows*2B][data:rows*cols*2B]
 *
 * The 0x02 marker byte precedes each axis definition.
 */
export function scanEDC17AxisMarkers(
  buffer: ArrayBuffer,
  ecuDef: EcuDef | null
): ScannedCandidate[] {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  // EDC17/MED17 TriCore cal data is LITTLE-ENDIAN (confirmed by real binary analysis).
  // Only EDC16/SID use big-endian. Determine per-family.
  const family = ecuDef?.family?.toUpperCase() ?? ''
  const BE_FAMILIES = ['EDC16', 'SID']
  const le = !BE_FAMILIES.some(f => family.includes(f))
  const candidates: ScannedCandidate[] = []
  const usedRanges: Array<[number, number]> = []

  // EDC17 cal region: typically 0x80000+ in 4MB+ files
  const calStart = (len >= 0x400000 ? Math.floor(len * 0.70) : Math.floor(len * 0.50)) & ~1
  const calEnd = len - 32

  for (let i = calStart; i < calEnd && candidates.length < 650; i++) {
    // Look for 0x02 or 0x01 marker byte
    const marker = view.getUint8(i)
    if (marker !== 0x02 && marker !== 0x01) continue

    // Read X-axis: [marker][count:u16][axis_data]
    const xCount = view.getUint16(i + 1, le)
    if (xCount < 2 || xCount > 24) continue

    const xStart = i + 3
    const xEnd = xStart + xCount * 2
    if (xEnd + 3 > len) continue

    const xAxis = readMonoAxis(view, xStart, xCount, le)
    if (!xAxis) continue

    // Expect another 0x02 or 0x01 marker for Y-axis
    const yMarker = view.getUint8(xEnd)
    if (yMarker !== 0x02 && yMarker !== 0x01) continue

    const yCount = view.getUint16(xEnd + 1, le)
    if (yCount < 2 || yCount > 24) continue
    if (xCount * yCount < 8) continue

    const yStart = xEnd + 3
    const yEnd = yStart + yCount * 2
    if (yEnd > len) continue

    const yAxis = readMonoAxis(view, yStart, yCount, le)
    if (!yAxis) continue

    // Data block follows immediately
    const dataStart = yEnd
    const dataBytes = xCount * yCount * 2
    if (dataStart + dataBytes > len) continue

    if (xAxis[xCount - 1] - xAxis[0] < 80) continue
    if (yAxis[yCount - 1] - yAxis[0] < 30) continue

    if (overlaps(usedRanges, i, dataStart + dataBytes)) continue

    const stats = readBlock(view, dataStart, yCount, xCount, le)
    if (stats.allZero || stats.allFF || stats.stddev < 3) continue

    const xSpan = xAxis[xCount - 1] - xAxis[0]
    const confidence = Math.min(1, xSpan / 2000) * 0.4 + Math.min(1, stats.stddev / 50) * 0.3 + 0.3

    candidates.push({
      offset: dataStart, headerOffset: i,
      rows: yCount, cols: xCount,
      dtype: 'uint16', le,
      axisX: { values: xAxis, min: xAxis[0], max: xAxis[xCount - 1] },
      axisY: { values: yAxis, min: yAxis[0], max: yAxis[yCount - 1] },
      valueRange: { min: stats.min, max: stats.max, mean: stats.mean, stddev: stats.stddev },
      rawData: [], confidence,
    })
    usedRanges.push([i, dataStart + dataBytes])
    i = dataStart + dataBytes - 1
  }

  return candidates
}

// ─── MED17 u8-dimension scanner ──────────────────────────────────────────────

/**
 * Scans Bosch TriCore ECUs (MED17, MEVD17, MED9) for calibration maps.
 * These ECUs have NO Kf_ headers. Maps use a compact u8-dimension format:
 *
 *   u16 variant: [xCount:u8][yCount:u8][X_axis:xCount*u16_LE][Y_axis:yCount*u16_LE][data:xCount*yCount*u16_LE]
 *   u8 variant:  [xCount:u8][yCount:u8][X_axis:xCount*u8][Y_axis:yCount*u8][data:xCount*yCount*u8]
 *
 * Discovered by reverse-engineering Audi RS6 4.0 TFSI MED17.1.1 binary.
 * NOTE: MG1 (Audi RS5 etc.) uses Kf_ format (u16 dims), NOT this format.
 * Cal region: MED17 4MB at 87-97%, MED17 2MB at 75-95%.
 * Endianness: little-endian (TriCore).
 */
function scanTriCoreDimPairs(
  buffer: ArrayBuffer,
  ecuDef: EcuDef | null
): ScannedCandidate[] {
  const data = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const candidates: ScannedCandidate[] = []
  const usedRanges: Array<[number, number]> = []
  const le = true  // MED17 TriCore is always LE

  // Cal region: ~87% for 4MB (MED17.1.1), ~75% for smaller (MED17.5.x 2MB)
  const calStart = (len >= 0x400000 ? Math.floor(len * 0.87) : Math.floor(len * 0.75)) & ~1
  const calEnd = Math.min(len - 32, len >= 0x400000 ? Math.floor(len * 0.97) : Math.floor(len * 0.95))

  // ── Sub-pass A: u16 maps (larger, more important — fuel, boost, torque) ──
  for (let i = calStart; i < calEnd - 20 && candidates.length < 650; i += 1) {
    const xc = data[i]
    const yc = data[i + 1]
    if (xc < 4 || xc > 24 || yc < 4 || yc > 24) continue
    if (xc * yc < 16) continue

    // Total bytes needed: 2 dim + xc*2 + yc*2 + xc*yc*2
    const totalBytes = 2 + xc * 2 + yc * 2 + xc * yc * 2
    if (i + totalBytes > len) continue

    // Check overlap with already-found maps
    if (overlaps(usedRanges, i, i + totalBytes)) continue

    // Read X axis (u16 LE, must be monotonically increasing)
    const xOff = i + 2
    const xAxis: number[] = []
    let xOk = true
    for (let j = 0; j < xc; j++) {
      const v = view.getUint16(xOff + j * 2, le)
      if (v > 50000) { xOk = false; break }
      if (j > 0 && v <= xAxis[j - 1]) { xOk = false; break }
      xAxis.push(v)
    }
    if (!xOk) continue
    const xSpan = xAxis[xc - 1] - xAxis[0]
    if (xSpan < 100) continue  // axis must span a meaningful range

    // Read Y axis (u16 LE, must be monotonically increasing)
    const yOff = xOff + xc * 2
    const yAxis: number[] = []
    let yOk = true
    for (let j = 0; j < yc; j++) {
      const v = view.getUint16(yOff + j * 2, le)
      if (v > 50000) { yOk = false; break }
      if (j > 0 && v <= yAxis[j - 1]) { yOk = false; break }
      yAxis.push(v)
    }
    if (!yOk) continue
    const ySpan = yAxis[yc - 1] - yAxis[0]
    if (ySpan < 50) continue

    // Data block
    const dataStart = yOff + yc * 2
    const dataBytes = xc * yc * 2
    const stats = readBlock(view, dataStart, yc, xc, le)
    if (stats.allZero || stats.allFF) continue
    if (stats.stddev < 3) continue

    // Smoothness check — reject noise/code
    let smoothH = 0, smoothV = 0, totalH = 0, totalV = 0
    const range = stats.max - stats.min || 1
    for (let r = 0; r < yc; r++) {
      for (let c = 1; c < xc; c++) {
        totalH++
        const v0 = view.getUint16(dataStart + (r * xc + c - 1) * 2, le)
        const v1 = view.getUint16(dataStart + (r * xc + c) * 2, le)
        if (Math.abs(v1 - v0) < range * 0.35) smoothH++
      }
    }
    for (let r = 1; r < yc; r++) {
      for (let c = 0; c < xc; c++) {
        totalV++
        const v0 = view.getUint16(dataStart + ((r - 1) * xc + c) * 2, le)
        const v1 = view.getUint16(dataStart + (r * xc + c) * 2, le)
        if (Math.abs(v1 - v0) < range * 0.35) smoothV++
      }
    }
    const hSmooth = totalH > 0 ? smoothH / totalH : 0
    const vSmooth = totalV > 0 ? smoothV / totalV : 0
    if (hSmooth < 0.50 && vSmooth < 0.50) continue

    const smoothMax = Math.max(hSmooth, vSmooth)
    const sizeBonus = Math.min(1, (xc * yc) / 120) * 0.15
    const confidence = Math.min(1,
      0.20 +
      Math.min(1, xSpan / 5000) * 0.15 +
      Math.min(1, ySpan / 5000) * 0.15 +
      smoothMax * 0.25 +
      sizeBonus +
      Math.min(1, stats.stddev / 200) * 0.10
    )

    candidates.push({
      offset: dataStart, headerOffset: i,
      rows: yc, cols: xc,
      dtype: 'uint16', le,
      axisX: { values: xAxis, min: xAxis[0], max: xAxis[xc - 1] },
      axisY: { values: yAxis, min: yAxis[0], max: yAxis[yc - 1] },
      valueRange: { min: stats.min, max: stats.max, mean: stats.mean, stddev: stats.stddev },
      rawData: [], confidence,
    })
    usedRanges.push([i, i + totalBytes])
    i += totalBytes - 1  // skip past this map
  }

  // ── Sub-pass B: u8 maps (smaller corrections, efficiency tables) ──
  for (let i = calStart; i < calEnd - 20 && candidates.length < 120; i += 1) {
    const xc = data[i]
    const yc = data[i + 1]
    if (xc < 4 || xc > 24 || yc < 4 || yc > 24) continue
    if (xc * yc < 16) continue

    // Total bytes: 2 dim + xc + yc + xc*yc (all u8)
    const totalBytes = 2 + xc + yc + xc * yc
    if (i + totalBytes > len) continue
    if (overlaps(usedRanges, i, i + totalBytes)) continue

    // Read X axis (u8, monotonically increasing)
    const xOff = i + 2
    const xAxis: number[] = []
    let xOk = true
    for (let j = 0; j < xc; j++) {
      const v = data[xOff + j]
      if (j > 0 && v <= xAxis[j - 1]) { xOk = false; break }
      xAxis.push(v)
    }
    if (!xOk) continue
    if (xAxis[xc - 1] - xAxis[0] < 10) continue

    // Read Y axis (u8, monotonically increasing)
    const yOff = xOff + xc
    const yAxis: number[] = []
    let yOk = true
    for (let j = 0; j < yc; j++) {
      const v = data[yOff + j]
      if (j > 0 && v <= yAxis[j - 1]) { yOk = false; break }
      yAxis.push(v)
    }
    if (!yOk) continue
    if (yAxis[yc - 1] - yAxis[0] < 5) continue

    // Read data block (u8 values)
    const dataStart = yOff + yc
    let minV = 255, maxV = 0, sum = 0
    let allZero = true, allFF = true
    for (let j = 0; j < xc * yc; j++) {
      const v = data[dataStart + j]
      if (v !== 0) allZero = false
      if (v !== 0xFF) allFF = false
      if (v < minV) minV = v
      if (v > maxV) maxV = v
      sum += v
    }
    if (allZero || allFF) continue
    const mean = sum / (xc * yc)
    const variance = Array.from(data.slice(dataStart, dataStart + xc * yc))
      .reduce((s, v) => s + (v - mean) ** 2, 0) / (xc * yc)
    const stddev = Math.sqrt(variance)
    if (stddev < 2) continue

    // Smoothness check
    let smoothH = 0, smoothV = 0, totalH = 0, totalV = 0
    const dRange = maxV - minV || 1
    for (let r = 0; r < yc; r++) {
      for (let c = 1; c < xc; c++) {
        totalH++
        if (Math.abs(data[dataStart + r * xc + c] - data[dataStart + r * xc + c - 1]) < dRange * 0.35) smoothH++
      }
    }
    for (let r = 1; r < yc; r++) {
      for (let c = 0; c < xc; c++) {
        totalV++
        if (Math.abs(data[dataStart + r * xc + c] - data[dataStart + (r - 1) * xc + c]) < dRange * 0.35) smoothV++
      }
    }
    const hSmooth = totalH > 0 ? smoothH / totalH : 0
    const vSmooth = totalV > 0 ? smoothV / totalV : 0
    if (hSmooth < 0.55 && vSmooth < 0.55) continue

    const smoothMax = Math.max(hSmooth, vSmooth)
    const sizeBonus = Math.min(1, (xc * yc) / 120) * 0.10
    const confidence = Math.min(1,
      0.15 +
      smoothMax * 0.30 +
      sizeBonus +
      Math.min(1, stddev / 30) * 0.15 +
      Math.min(1, (xAxis[xc - 1] - xAxis[0]) / 150) * 0.15 +
      Math.min(1, (yAxis[yc - 1] - yAxis[0]) / 150) * 0.15
    )

    candidates.push({
      offset: dataStart, headerOffset: i,
      rows: yc, cols: xc,
      dtype: 'uint8', le,  // MED17 u8 maps: 1 byte per cell
      axisX: { values: xAxis, min: xAxis[0], max: xAxis[xc - 1] },
      axisY: { values: yAxis, min: yAxis[0], max: yAxis[yc - 1] },
      valueRange: { min: minV, max: maxV, mean, stddev },
      rawData: [], confidence,
    })
    usedRanges.push([i, i + totalBytes])
    i += totalBytes - 1
  }

  return candidates
}

// ─── SIMOS18 blind smooth-block scanner ──────────────────────────────────────

/**
 * Scans Continental SIMOS18/SIMOS19 binaries for calibration maps.
 * These ECUs have NO inline map markers whatsoever — axes are stored separately
 * from data, linked only by the A2L definition file. Without A2L, we use
 * statistical detection: scan for smooth NxN u16 LE blocks in the cal region.
 *
 * Discovered by reverse-engineering Audi S1 2.0 TFSI SIMOS18.1 binary:
 *   - Cal region: 0x200000-0x27D000 in 4.5MB file (~43%)
 *   - Maps packed back-to-back, zero headers, zero axis data inline
 *   - Primary grid: 11x11 (242 bytes per map)
 *   - Boost target: 1209-2796 mbar, smooth 2D gradient
 *   - Data is u16 little-endian
 *
 * Strategy: try common grid dimensions (11x11, 9x9, 8x8, etc.) and look for
 * blocks with very high 2D smoothness (>85%) that are NOT axis tables.
 */
function scanSIMOSBlindBlocks(
  buffer: ArrayBuffer,
  ecuDef: EcuDef | null
): ScannedCandidate[] {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const candidates: ScannedCandidate[] = []
  const usedRanges: Array<[number, number]> = []
  const le = true

  // SIMOS18 cal region: ~43% in 4.5MB, ~40-60% range
  const calStart = (len >= 0x400000 ? Math.floor(len * 0.40) : Math.floor(len * 0.35)) & ~1
  const calEnd = Math.min(len - 32, len >= 0x400000 ? Math.floor(len * 0.62) : Math.floor(len * 0.70))
  const deadline = Date.now() + 3000  // 3 second safety limit

  // Grid dimensions to try (most common SIMOS sizes first)
  const DIMS: Array<[number, number]> = [
    [11, 11], [9, 9], [8, 8], [10, 10], [12, 12], [6, 6], [7, 7],
    [13, 13], [15, 15], [16, 16], [17, 17],
  ]

  for (const [rows, cols] of DIMS) {
    const cells = rows * cols
    const blockBytes = cells * 2
    if (candidates.length >= 80) break

    for (let i = calStart; i < calEnd - blockBytes; i += 2) {
      if (candidates.length >= 80) break
      if ((i & 0xFFF) === 0 && Date.now() > deadline) break  // time limit check every 4KB
      if (overlaps(usedRanges, i, i + blockBytes)) continue

      // Quick read first and last values for fast reject
      const v0 = view.getUint16(i, le)
      const vLast = view.getUint16(i + blockBytes - 2, le)
      if (v0 === 0 && vLast === 0) continue
      if (v0 === 0xFFFF && vLast === 0xFFFF) continue

      // Read all values
      const vals: number[] = new Array(cells)
      let vMin = 65535, vMax = 0, sum = 0
      for (let j = 0; j < cells; j++) {
        const v = view.getUint16(i + j * 2, le)
        vals[j] = v
        if (v < vMin) vMin = v
        if (v > vMax) vMax = v
        sum += v
      }

      const range = vMax - vMin
      if (range < 50) continue
      if (range > 55000) continue

      const mean = sum / cells
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / cells
      const stddev = Math.sqrt(variance)
      if (stddev < 10) continue

      // Reject monotonically increasing blocks (= axis tables)
      let monoUp = 0
      for (let j = 1; j < cells; j++) {
        if (vals[j] >= vals[j - 1]) monoUp++
      }
      if (monoUp > cells * 0.85) continue

      // 2D smoothness — STRICT for blind scanning
      let smoothH = 0, smoothV = 0, totalH = 0, totalV = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 1; c < cols; c++) {
          totalH++
          if (Math.abs(vals[r * cols + c] - vals[r * cols + c - 1]) < range * 0.20) smoothH++
        }
      }
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          totalV++
          if (Math.abs(vals[r * cols + c] - vals[(r - 1) * cols + c]) < range * 0.20) smoothV++
        }
      }
      const hSmooth = totalH > 0 ? smoothH / totalH : 0
      const vSmooth = totalV > 0 ? smoothV / totalV : 0
      if (hSmooth < 0.85 || vSmooth < 0.85) continue

      const smoothAvg = (hSmooth + vSmooth) / 2
      const sizeBonus = Math.min(1, cells / 150) * 0.10
      const confidence = Math.min(1,
        0.10 +
        smoothAvg * 0.40 +
        sizeBonus +
        Math.min(1, stddev / 500) * 0.15 +
        Math.min(1, range / 5000) * 0.10 +
        0.15
      )

      // Synthetic axis labels (no real axis data in SIMOS — axes stored elsewhere)
      const xLabels = Array.from({ length: cols }, (_, j) => j)
      const yLabels = Array.from({ length: rows }, (_, j) => j)

      candidates.push({
        offset: i,
        rows, cols,
        dtype: 'uint16', le,
        axisX: { values: xLabels, min: 0, max: cols - 1 },
        axisY: { values: yLabels, min: 0, max: rows - 1 },
        valueRange: { min: vMin, max: vMax, mean, stddev },
        rawData: [], confidence,
      })
      usedRanges.push([i, i + blockBytes])
    }
  }

  return candidates
}

/**
 * Scans Delphi DCM6.2 / DCM6.1 binaries for calibration maps.
 * Delphi uses Freescale MPC5xxx PowerPC — BIG ENDIAN with encrypted code regions.
 * Only the cal region (0x040000–0x17FFFF in 4MB files) is unencrypted.
 *
 * Map format: NO headers, NO dimension bytes.
 *   [X_axis: N × BE u16] [Y_axis: M × BE u16] [data: N×M × BE u16]
 * Maps separated by zero-padding gaps of variable length.
 *
 * Strategy: find pairs of consecutive monotonically increasing BE u16 sequences
 * (the X-axis followed by Y-axis), then read N×M data values after them.
 * Validate with smoothness checks to reject false positives.
 *
 * Discovered by reverse-engineering VW Golf 1.6 TDI CR Delphi DCM6.2 D0B16 binary.
 */
/**
 * Scans Delphi DCM6.x ECUs using count-prefixed axis format (big-endian).
 *
 * DCM6.2 (MPC5xxx PowerPC) map layout:
 *   [Ycount:BE_u16] [Y_axis: Ycount×BE_u16] [Xcount:BE_u16] [X_axis: Xcount×BE_u16] [data: Y×X × BE_u16]
 *
 * Cal region: 0x040000-0x172000 in 4MB files.
 * Discovered by reverse-engineering VW Golf 1.6 TDI CR D0B16 binary.
 */
function scanDelphiCountPrefixed(
  buffer: ArrayBuffer,
  ecuDef: EcuDef | null
): ScannedCandidate[] {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const candidates: ScannedCandidate[] = []
  const usedRanges: Array<[number, number]> = []
  const le = false  // Delphi MPC5xxx = big-endian

  const calStart = len >= 0x400000 ? 0x040000 : (Math.floor(len * 0.06) & ~1)
  const calEnd = len >= 0x400000
    ? Math.min(0x172000, len - 32)
    : Math.min(Math.floor(len * 0.40), len - 32)
  const deadline = Date.now() + 3000

  for (let i = calStart; i < calEnd - 20 && candidates.length < 650; i += 2) {
    if ((i & 0xFFF) === 0 && Date.now() > deadline) break

    // Read potential Y-axis count
    const yc = view.getUint16(i, le)
    if (yc < 4 || yc > 20) continue

    // Read Y-axis (monotonic increasing BE u16)
    const yStart = i + 2
    if (yStart + yc * 2 + 2 > calEnd) continue
    const yVals = readMonoAxis(view, yStart, yc, le)
    if (!yVals) continue
    if (yVals[yc - 1] - yVals[0] < 50) continue

    // Read X-axis count (immediately after Y-axis)
    const xcOff = yStart + yc * 2
    const xc = view.getUint16(xcOff, le)
    if (xc < 4 || xc > 20) continue
    if (xc * yc < 24) continue

    // Read X-axis
    const xStart = xcOff + 2
    if (xStart + xc * 2 > calEnd) continue
    const xVals = readMonoAxis(view, xStart, xc, le)
    if (!xVals) continue
    if (xVals[xc - 1] - xVals[0] < 50) continue

    // Require at least one axis to have engine-range values (> 400)
    const maxAxis = Math.max(yVals[yc - 1], xVals[xc - 1])
    if (maxAxis < 400) continue

    // Read data block
    const dataStart = xStart + xc * 2
    const dataBytes = yc * xc * 2
    if (dataStart + dataBytes > calEnd) continue

    // Check overlap
    const mapEnd = dataStart + dataBytes
    if (overlaps(usedRanges, i, mapEnd)) continue

    // Read and validate data
    const stats = readBlock(view, dataStart, yc, xc, le)
    if (stats.allZero || stats.allFF || stats.stddev < 3) continue

    // Unique values check
    const uniqueSet = new Set<number>()
    for (const row of stats.rawData) for (const v of row) uniqueSet.add(v)
    if (uniqueSet.size <= 3) continue

    // Confidence scoring
    const cellCount = yc * xc
    const sizeBonus = Math.min(1, cellCount / 200)
    const dimMatch = ecuDef ? ecuDef.maps.some(m =>
      (m.rows === yc && m.cols === xc) || (m.rows === xc && m.cols === yc)
    ) ? 1 : 0.4 : 0.5
    const confidence = Math.min(1,
      sizeBonus * 0.30 +
      Math.min(1, stats.stddev / 500) * 0.25 +
      dimMatch * 0.25 +
      Math.min(1, (stats.max - stats.min) / 5000) * 0.20
    )

    candidates.push({
      offset: dataStart,
      headerOffset: i,
      rows: yc, cols: xc,
      dtype: 'uint16', le,
      axisX: { values: xVals, min: xVals[0], max: xVals[xc - 1] },
      axisY: { values: yVals, min: yVals[0], max: yVals[yc - 1] },
      valueRange: { min: stats.min, max: stats.max, mean: stats.mean, stddev: stats.stddev },
      rawData: [], confidence,
    })
    usedRanges.push([i, mapEnd])

    // Jump past this map
    i = mapEnd - 2
  }

  return candidates
}
