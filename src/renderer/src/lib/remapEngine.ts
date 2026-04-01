import type { EcuDef, MapDef, StageParams } from './ecuDefinitions'
import { ADDONS } from './ecuDefinitions'
import type { ExtractedMap } from './binaryParser'
import { writeMap } from './binaryParser'

export type Stage = 1 | 2 | 3
export type AddonId = 'popbang' | 'dpf' | 'egr' | 'launchcontrol' | 'speedlimiter' | 'adblue' | 'dpf_sensors' | 'egr_dtcs' | 'cat' | 'sai' | 'evap'

export interface MapChange {
  mapDef: MapDef
  before: number[][]   // physical values before
  after: number[][]    // physical values after
  beforeRaw: number[][]
  afterRaw: number[][]
  avgChangePct: number
  maxChangePct: number
  found: boolean
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
  }
}

// ─── Apply stage params to raw values ────────────────────────────────────────
function applyParams(raw: number[][], params: StageParams, mapDef: MapDef): number[][] {
  return raw.map(row => row.map(v => {
    let result = v
    if (params.multiplier !== undefined) result *= params.multiplier
    if (params.addend !== undefined) result += params.addend
    if (params.clampMax !== undefined) result = Math.min(result, params.clampMax)
    if (params.clampMin !== undefined) result = Math.max(result, params.clampMin)
    // Respect data type limits
    switch (mapDef.dtype) {
      case 'uint8':  result = Math.max(0, Math.min(255, result)); break
      case 'int8':   result = Math.max(-128, Math.min(127, result)); break
      case 'uint16': result = Math.max(0, Math.min(65535, result)); break
      case 'int16':  result = Math.max(-32768, Math.min(32767, result)); break
    }
    return Math.round(result)
  }))
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
function calcChangePct(before: number[][], after: number[][]): { avg: number; max: number } {
  let totalPct = 0
  let maxPct = 0
  let count = 0
  for (let r = 0; r < before.length; r++) {
    for (let c = 0; c < before[r].length; c++) {
      const b = before[r][c]
      if (b === 0) continue
      const pct = Math.abs((after[r][c] - b) / b) * 100
      totalPct += pct
      maxPct = Math.max(maxPct, pct)
      count++
    }
  }
  return { avg: count > 0 ? totalPct / count : 0, max: maxPct }
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

    // If no modification needed, record as unchanged
    const isIdentity = (params.multiplier === undefined || params.multiplier === 1) &&
                       (params.addend === undefined || params.addend === 0) &&
                       params.clampMax === undefined && params.clampMin === undefined

    const newRaw = isIdentity ? rawData : applyParams(rawData, params, mapDef)
    const physAfter = newRaw.map((row, r) =>
      row.map((v, c) => {
        if (!isIdentity) return v * mapDef.factor + mapDef.offsetVal
        return physBefore[r]?.[c] ?? 0
      })
    )

    if (!isIdentity && found) {
      workingBuffer = writeMap(workingBuffer, extracted, newRaw)
    }

    const { avg, max } = calcChangePct(rawData, newRaw)
    changes.push({
      mapDef, before: physBefore, after: physAfter,
      beforeRaw: rawData, afterRaw: newRaw,
      avgChangePct: avg, maxChangePct: max, found,
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
  const mapsModified = changes.filter(c => c.avgChangePct > 0 && c.found).length
  const mapsNotFound = changes.filter(c => !c.found && c.mapDef.critical).length

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
