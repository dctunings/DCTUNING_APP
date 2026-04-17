import type { EcuDef, MapDef, StageParams } from './ecuDefinitions'
import { ADDONS } from './ecuDefinitions'
import type { ExtractedMap } from './binaryParser'
import { writeMap } from './binaryParser'

export type Stage = 1 | 2 | 3
export type AddonId = 'popbang' | 'dpf' | 'egr' | 'launchcontrol' | 'speedlimiter' | 'revlimit' | 'overboost' | 'popcorn' | 'adblue' | 'dpf_sensors' | 'egr_dtcs' | 'cat' | 'sai' | 'evap'

export interface MapChange {
  mapDef: MapDef
  before: number[][]   // physical values before
  after: number[][]    // physical values after
  beforeRaw: number[][]
  afterRaw: number[][]
  avgChangePct: number
  maxChangePct: number
  found: boolean
  skippedUniform: boolean  // true = map read all-same values → wrong address or erased flash → write blocked
}

export interface RemapResult {
  ecuDef: EcuDef
  stage: Stage
  addons: AddonId[]
  changes: MapChange[]
  modifiedBuffer: ArrayBuffer
  checksumWarning: boolean
  summary: {
    boostChangePct: number
    fuelChangePct: number
    torqueChangePct: number
    mapsModified: number
    mapsNotFound: number
    mapsBlockedUniform: number  // maps with uniform reads that were NOT written (safety gate)
  }
}

// ─── Apply stage params to raw values ────────────────────────────────────────
// Supports lastNRows / lastNCols masking: only the last N rows or cols are modified.
// Used for popcorn limiter — retards timing only in the highest-RPM cells.
// cellGrid: optional per-cell multiplier grid (zone editor). When supplied, each cell
// uses its own multiplier instead of the uniform params.multiplier.
function applyParams(raw: number[][], params: StageParams, mapDef: MapDef, cellGrid?: number[][]): number[][] {
  const rowStart = params.lastNRows !== undefined ? Math.max(0, raw.length - params.lastNRows) : 0
  return raw.map((row, r) => {
    const colStart = params.lastNCols !== undefined ? Math.max(0, row.length - params.lastNCols) : 0
    return row.map((v, c) => {
      // Outside the target zone — leave raw value completely untouched
      if (r < rowStart || c < colStart) return v
      let result = v
      // Per-cell multiplier (zone editor) takes precedence over stage-level uniform multiplier
      const cellMul = cellGrid?.[r]?.[c]
      if (cellMul !== undefined) {
        result *= cellMul
      } else if (params.multiplier !== undefined) {
        result *= params.multiplier
      }
      if (params.addend !== undefined) result += params.addend
      if (params.clampMax !== undefined) result = Math.min(result, params.clampMax)
      if (params.clampMin !== undefined) result = Math.max(result, params.clampMin)
      // Respect data type limits (float32 is never rounded — preserve precision)
      switch (mapDef.dtype) {
        case 'uint8':   result = Math.max(0, Math.min(255, result)); break
        case 'int8':    result = Math.max(-128, Math.min(127, result)); break
        case 'uint16':  result = Math.max(0, Math.min(65535, result)); break
        case 'int16':   result = Math.max(-32768, Math.min(32767, result)); break
        case 'float32': return result  // no integer rounding for floats
      }
      return Math.round(result)
    })
  })
}

// ─── Get params for a map given stage + addons ────────────────────────────────
function getParams(mapDef: MapDef, stage: Stage, addons: AddonId[]): StageParams {
  // Check if any active addon overrides this map
  for (const addonId of addons) {
    if (mapDef.addonOverrides?.[addonId]) {
      return mapDef.addonOverrides[addonId]
    }
  }
  // Otherwise use stage params
  return stage === 1 ? mapDef.stage1 : stage === 2 ? mapDef.stage2 : mapDef.stage3
}

// ─── Calculate percent change ─────────────────────────────────────────────────
// Handles raw value 0 correctly for signed maps (int8/int16) where 0 is a valid
// and meaningful stored value (e.g. KFZWMN raw 0 = -48°BTDC, CWSAWE raw 0 = disabled flag).
// When before=0 and after≠0, treat as 100% change rather than silently skipping.
function calcChangePct(before: number[][], after: number[][]): { avg: number; max: number } {
  let totalPct = 0
  let maxPct = 0
  let count = 0
  for (let r = 0; r < before.length; r++) {
    for (let c = 0; c < before[r].length; c++) {
      const b = before[r][c]
      const a = after[r][c]
      if (b === 0) {
        // Avoid division by zero: treat 0→nonzero as 100% change, 0→0 as no change
        if (a !== 0) { totalPct += 100; maxPct = Math.max(maxPct, 100); count++ }
        continue
      }
      const pct = Math.abs((a - b) / b) * 100
      totalPct += pct
      maxPct = Math.max(maxPct, pct)
      count++
    }
  }
  return { avg: count > 0 ? totalPct / count : 0, max: maxPct }
}

// ─── Uniform-map detector ─────────────────────────────────────────────────────
// A map whose raw values are all identical is almost certainly a wrong-address
// read (erased 0xFF flash, zeroed region, or signature false-positive).
// Real boost/torque/fuel maps always vary across the RPM×load grid.
// The check matches the UI heatmap warning in RemapBuilder.tsx: mapRange < 0.5.
const POSITIVE_CATEGORIES = new Set(['boost', 'fuel', 'torque', 'limiter', 'emission', 'smoke'])

function isUniformMap(rawData: number[][], category: string, allowUniform?: boolean): boolean {
  if (allowUniform) return false                        // mapDef explicitly opted in to uniform data
                                                        // (e.g. torque monitor ceiling = intentional flat 1000 Nm)
  if (!POSITIVE_CATEGORIES.has(category)) return false  // ignition/misc: don't block
  const allVals = rawData.flatMap(r => r)
  if (allVals.length <= 4) return false                 // too small to judge
  const mn = Math.min(...allVals)
  const mx = Math.max(...allVals)
  return (mx - mn) < 0.5                               // flat to within half a raw unit
}

// ─── Main remap function ──────────────────────────────────────────────────────
export function buildRemap(
  buffer: ArrayBuffer,
  ecuDef: EcuDef,
  stage: Stage,
  addons: AddonId[],
  extractedMaps: ExtractedMap[],
): RemapResult {
  let workingBuffer = buffer.slice(0)
  const changes: MapChange[] = []

  for (const extracted of extractedMaps) {
    const { mapDef, rawData, data: physBefore, found } = extracted
    const params = getParams(mapDef, stage, addons)

    // If no modification needed, record as unchanged.
    // A masked param (lastNRows/lastNCols) is never identity even with neutral multiplier/addend.
    // A cell grid is also never identity — the tuner set it explicitly.
    const hasCellGrid = extracted.cellMultiplierGrid !== undefined
    const isIdentity = !hasCellGrid &&
                       (params.multiplier === undefined || params.multiplier === 1) &&
                       (params.addend === undefined || params.addend === 0) &&
                       params.clampMax === undefined && params.clampMin === undefined &&
                       params.lastNRows === undefined && params.lastNCols === undefined

    const newRaw = isIdentity ? rawData : applyParams(rawData, params, mapDef, extracted.cellMultiplierGrid)
    const physAfter = newRaw.map((row, r) =>
      row.map((v, c) => {
        if (!isIdentity) return v * mapDef.factor + mapDef.offsetVal
        return physBefore[r]?.[c] ?? 0
      })
    )

    // Safety gate: never write a map whose raw data is uniform (all identical values).
    // Uniform reads mean the address is wrong — erased flash (0xFF), zeroed region, or
    // a signature collision. Writing staged values into these bytes would corrupt the ECU file.
    // Exception: allowUniform=true maps (e.g. torque monitor ceiling) are intentionally flat.
    const uniform = found && isUniformMap(rawData, mapDef.category, mapDef.allowUniform)

    if (!isIdentity && found && !uniform) {
      workingBuffer = writeMap(workingBuffer, extracted, newRaw)
    }

    const { avg, max } = calcChangePct(rawData, newRaw)
    changes.push({
      mapDef, before: physBefore, after: physAfter,
      beforeRaw: rawData, afterRaw: newRaw,
      avgChangePct: avg, maxChangePct: max, found,
      skippedUniform: uniform,
    })
  }

  // Summary — average across ALL found maps in each category (EDC17 has 2 boost, 3 fuel, 2 torque)
  const avgCat = (cat: string) => {
    const relevant = changes.filter(c => c.mapDef.category === cat && c.found && c.avgChangePct > 0)
    if (relevant.length === 0) return 0
    return relevant.reduce((s, c) => s + c.avgChangePct, 0) / relevant.length
  }
  const boostChange = avgCat('boost')
  const fuelChange = avgCat('fuel')
  const torqueChange = avgCat('torque')
  const mapsModified = changes.filter(c => c.avgChangePct > 0 && c.found && !c.skippedUniform).length
  const mapsNotFound = changes.filter(c => !c.found && c.mapDef.critical).length
  const mapsBlockedUniform = changes.filter(c => c.skippedUniform).length

  return {
    ecuDef, stage, addons, changes,
    modifiedBuffer: workingBuffer,
    checksumWarning: mapsModified > 0,
    summary: {
      boostChangePct: boostChange,
      fuelChangePct: fuelChange,
      torqueChangePct: torqueChange,
      mapsModified,
      mapsNotFound,
      mapsBlockedUniform,
    },
  }
}

// ─── Generate filename ────────────────────────────────────────────────────────
export function buildFilename(originalName: string, ecuDef: EcuDef, stage: Stage, addons: AddonId[]): string {
  const base = originalName.replace(/\.(bin|hex|ori|ori2|mod)$/i, '')
  const addonStr = addons.length > 0 ? '_' + addons.map(a => a.toUpperCase()).join('_') : ''
  return `${base}_DCTuning_Stage${stage}${addonStr}.bin`
}

// Suppress unused import warning
void ADDONS
