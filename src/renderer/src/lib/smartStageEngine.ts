import type { EcuDef } from './ecuDefinitions'
import { extractMap, syntheticMapDefFromSignature } from './binaryParser'
import type { ExtractedMap, SignatureMatch } from './binaryParser'
import { buildRemap } from './remapEngine'
import type { Stage, AddonId, RemapResult, MapChange } from './remapEngine'

// ─── Smart Stage engine ──────────────────────────────────────────────────────
// Turns a list of scanner signature matches + a binary into a full Stage 1/2/3 remap.
// This is what unlocks the "258k signatures → 440 wired maps" gap: every sig the
// scanner finds can now be auto-tuned using category-driven multipliers + physical-
// unit safety clamps (from categoryClamps.ts) instead of only the hand-wired maps
// in ecuDefinitions.
//
// Safety model:
//   1. By default, only `scalingVerified` sigs are auto-tuned — these are sigs whose
//      factor/unit/dtype have been confirmed by ≥2 training pairs. Unverified sigs
//      skip auto-tuning (user can still edit them manually via Stage Editor).
//   2. Each synthesized MapDef gets physical-unit clamps from categoryClamps, so a
//      blind 1.18× multiplier can never push boost past 3.0 bar abs or fuel past
//      120 mg/stk — even if the raw data happened to already be near the ceiling.
//   3. Uniform-read maps (all-same-value, e.g. erased flash regions) are skipped by
//      the underlying buildRemap safety gate — no ECU-wrecking writes from bogus addrs.

export interface SmartStageOptions {
  verifiedOnly: boolean    // default true — only tune sigs with cross-pair-confirmed scaling
  minQuality?: number      // 0–1 — skip low-quality matches (default 0.3)
  categories?: Set<string> // if set, only auto-tune sigs in these categories (else: all)
  excludeIds?: Set<string> // synthesized map ids the user unchecked in the preview
}

export interface SmartStageSkip {
  match: SignatureMatch
  reason: 'unverified' | 'low-quality' | 'category-excluded' | 'user-excluded' | 'extract-failed' | 'uniform' | 'runaway-change' | 'oversized'
}

// v3.11.21 — maximum map size (rows × cols) that Smart Stage will auto-tune.
// Most real ECU tunable maps are 2×2 to 32×32 (≤1024 cells). Sigs claiming more
// than 512 cells are almost always one of:
//   • Large torque-monitor ceiling arrays (pinned to constant, not meant to multiply)
//   • Catalog parsing errors (rows/cols swapped or inflated)
//   • Concatenated data blocks spanning multiple logical maps
// Auto-multiplying these produces cascade clobbering: a 2000-cell write landing over
// regions where smaller, legitimate maps live, corrupting them in ways that slip past
// the per-map runaway checks (since the damage is technically OUTSIDE the affected
// map's declared region).
// PPD1 torque-monitor ceiling (2688 cells in ecuDefinitions.ts) is a known case —
// it's wired with a fixed clampMax 55415 in the hand-wired def, not a multiplier.
// Auto-tune path shouldn't try to scale it.
const MAX_AUTO_TUNE_CELLS = 512

export interface SmartStageResult {
  remap: RemapResult              // same shape as manual Stage 1/2/3 — ready for download
  totalMatches: number            // how many sigs the scanner found
  applied: number                 // how many ended up in the remap
  skipped: SmartStageSkip[]       // what was skipped and why
  mapsClamped: number             // count of applied maps that hit a physical-unit clamp
  mapsReverted: number            // count of maps reverted by the runaway sanity cap
}

// v3.11.17 runaway-change threshold. If any single cell in a map would change by more
// than this fraction after stage params are applied, we revert the map to its original
// bytes. Catches two failure modes seen in the ME7.5 1.8T test run:
//   1. Tiny-value maps (raw 0-16) getting blind-multiplied into huge-value maps (raw 3072 = 19,000%)
//   2. Already-near-max maps getting clamped far below their stock value (-62%)
// 0.6 = 60%: a Stage 3 fuel map going from raw 50000 → 71000 is only +42% — under the cap.
// A Stage 1 boost going from 20000 → 23000 is +15% — fine. Anything above 60% is pathological.
const RUNAWAY_CHANGE_THRESHOLD = 0.60

// v3.11.19 additional safety checks, motivated by the PPD1 03G906018DH test where multiple
// maps had mean-value changes of 200-300% (catastrophic) while slipping past the per-cell
// check. Three additional failure modes to catch:
//   3. Mean blowout: mean(after)/mean(before) > 1.6  — the whole map shifted aggressively
//      beyond what any stage multiplier should produce (S3 torque 1.50 is the ceiling).
//   4. Cell saturation cluster: >20% of cells pinned at dtype max (65535 for uint16) when
//      they weren't before — the map's shape has collapsed against the clamp.
//   5. Range collapse: (max-min) shrunk to <50% of the original range — the map lost its
//      dynamic response, engine will behave unpredictably across load/RPM.
const MEAN_BLOWOUT_RATIO     = 1.60   // any mean shift >60% vs stock = map is broken
const SATURATION_CELL_PCT    = 0.20   // >20% of cells saturated at dtype-max → broken
const RANGE_COLLAPSE_RATIO   = 0.50   // post-range < 50% of pre-range → broken

// ─── Main entry point ────────────────────────────────────────────────────────
export function buildSmartStage(
  buffer: ArrayBuffer,
  ecuDef: EcuDef,
  matches: SignatureMatch[],
  stage: Stage,
  addons: AddonId[],
  options: SmartStageOptions = { verifiedOnly: true },
): SmartStageResult {
  const opts: Required<Pick<SmartStageOptions, 'verifiedOnly' | 'minQuality'>> & SmartStageOptions = {
    ...options,
    verifiedOnly: options.verifiedOnly ?? true,
    minQuality: options.minQuality ?? 0.3,
  }
  const skipped: SmartStageSkip[] = []
  const extractedMaps: ExtractedMap[] = []
  // v3.11.19: track actual extraction offsets per mapDef id. extractMap can fall back
  // from fixedOffset to signature search or calSearch, and the real write location
  // ends up in extracted.offset. revertMapInBuffer needs THIS offset, not mapDef.fixedOffset,
  // to accurately undo the write.
  const extractedOffsetByMapId = new Map<string, number>()

  for (const match of matches) {
    // 1. Verified-scaling gate (default-on safety)
    if (opts.verifiedOnly && !match.scalingVerified) {
      skipped.push({ match, reason: 'unverified' })
      continue
    }

    // 1a. v3.11.21: oversized-map filter — skip maps claiming >512 cells. These cause
    // cascade clobbering through adjacent map regions when auto-multiplied.
    const cellCount = match.rows * match.cols
    if (cellCount > MAX_AUTO_TUNE_CELLS) {
      skipped.push({ match, reason: 'oversized' })
      continue
    }

    // 2. Synthesize MapDef (includes category classification + physical-unit clamps)
    const mapDef = syntheticMapDefFromSignature(match)

    // 3. Category filter (if user narrowed to e.g. "boost+fuel only")
    if (opts.categories && !opts.categories.has(mapDef.category)) {
      skipped.push({ match, reason: 'category-excluded' })
      continue
    }

    // 4. User-exclusion (e.g. unchecked in the preview table)
    if (opts.excludeIds && opts.excludeIds.has(mapDef.id)) {
      skipped.push({ match, reason: 'user-excluded' })
      continue
    }

    // 5. Extract map data at the sig's reported offset
    const extracted = extractMap(buffer, mapDef, ecuDef.family)
    if (!extracted.found) {
      skipped.push({ match, reason: 'extract-failed' })
      continue
    }

    extractedMaps.push(extracted)
    extractedOffsetByMapId.set(mapDef.id, extracted.offset)
  }

  // 6. Hand off to the existing remap engine — which applies the stage params,
  //    physical clamps (now baked into the MapDef), uniform-safety gate, writes
  //    the modified bytes, and reports summary stats.
  const remap = buildRemap(buffer, ecuDef, stage, addons, extractedMaps)

  // 7. RUNAWAY SANITY CAP (v3.11.17)
  //    For every applied map, check whether any single cell changed by more than
  //    RUNAWAY_CHANGE_THRESHOLD (60%) vs its original raw value. If yes, revert
  //    that map — write the original raw bytes back over the modified region.
  //    This catches:
  //      • Tiny-value maps (raw 0-16) that got blind-multiplied to huge values
  //      • Clamp asymmetry where one cell got pushed far below its original value
  //    Maps reverted here are flagged as 'runaway-change' in the skipped list so
  //    the UI can show "N maps reverted for safety" to the user.
  let workingBuffer = remap.modifiedBuffer
  let mapsReverted = 0

  // v3.11.19: read actual post-write buffer bytes at each map's offset. This catches
  // cross-map clobbering — when multiple sig matches overlap, later writes overwrite
  // earlier ones, producing final bytes that don't match the per-map `afterRaw` we
  // computed. Comparing afterRaw alone missed these cases.
  const readMapBytes = (buf: ArrayBuffer, offset: number, rows: number, cols: number, dtype: string, le: boolean): number[] => {
    const view = new DataView(buf)
    const elSize = dtype === 'uint8' || dtype === 'int8' ? 1
                 : dtype === 'float32' || dtype === 'uint32' || dtype === 'int32' ? 4
                 : 2
    const cells: number[] = []
    const total = rows * cols
    for (let i = 0; i < total; i++) {
      const off = offset + i * elSize
      if (off + elSize > buf.byteLength) break
      switch (dtype) {
        case 'uint8':   cells.push(view.getUint8(off)); break
        case 'int8':    cells.push(view.getInt8(off)); break
        case 'int16':   cells.push(view.getInt16(off, le)); break
        case 'float32': cells.push(view.getFloat32(off, le)); break
        default:        cells.push(view.getUint16(off, le)) // uint16 default
      }
    }
    return cells
  }

  for (const c of remap.changes) {
    if (!c.found || c.skippedUniform || c.avgChangePct === 0) continue

    // Flatten before values (from extract-time) and read actual after values from the
    // current working buffer — this reflects the true state, including any cross-map
    // clobbering from overlapping sig writes.
    const before: number[] = []
    for (let r = 0; r < c.beforeRaw.length; r++) {
      for (let col = 0; col < c.beforeRaw[r].length; col++) {
        before.push(c.beforeRaw[r][col])
      }
    }
    if (before.length < 4) continue

    const realOffset = extractedOffsetByMapId.get(c.mapDef.id) ?? c.mapDef.fixedOffset ?? -1
    if (realOffset < 0) continue
    const after = readMapBytes(workingBuffer, realOffset, c.mapDef.rows, c.mapDef.cols, c.mapDef.dtype, c.mapDef.le)
    if (after.length !== before.length) continue

    // Check 1 (v3.11.17): per-cell change >60% OR small-value absolute delta >60
    let runaway = false
    let reason = ''
    for (let i = 0; i < before.length && !runaway; i++) {
      if (before[i] === after[i]) continue
      if (Math.abs(before[i]) < 100) {
        if (Math.abs(after[i] - before[i]) > 60) { runaway = true; reason = 'per-cell-blowout' }
      } else {
        if (Math.abs((after[i] - before[i]) / before[i]) > RUNAWAY_CHANGE_THRESHOLD) {
          runaway = true; reason = 'per-cell-blowout'
        }
      }
    }

    // Check 2 (v3.11.19): mean-value shift beyond any reasonable stage multiplier
    if (!runaway) {
      const meanB = before.reduce((s, v) => s + v, 0) / before.length
      const meanA = after.reduce((s, v) => s + v, 0) / after.length
      if (meanB > 0 && (meanA / meanB > MEAN_BLOWOUT_RATIO || meanA / meanB < (1 / MEAN_BLOWOUT_RATIO))) {
        runaway = true; reason = 'mean-blowout'
      }
    }

    // Check 3 (v3.11.19): >20% of cells pinned at dtype-max (saturation cluster)
    if (!runaway) {
      const dtypeMax = c.mapDef.dtype === 'uint8'  ? 255
                     : c.mapDef.dtype === 'uint16' ? 65535
                     : c.mapDef.dtype === 'int8'   ? 127
                     : c.mapDef.dtype === 'int16'  ? 32767
                     : Infinity
      const saturationThreshold = dtypeMax - Math.max(1, Math.floor(dtypeMax * 0.005))
      const satBefore = before.filter(v => v >= saturationThreshold).length
      const satAfter  = after.filter(v => v >= saturationThreshold).length
      const newSat = satAfter - satBefore
      if (newSat > 0 && (newSat / after.length) > SATURATION_CELL_PCT) {
        runaway = true; reason = 'saturation-cluster'
      }
    }

    // Check 4 (v3.11.19): dynamic range collapsed — map lost its shape
    if (!runaway) {
      const rangeB = Math.max(...before) - Math.min(...before)
      const rangeA = Math.max(...after) - Math.min(...after)
      if (rangeB > 10 && rangeA / rangeB < RANGE_COLLAPSE_RATIO) {
        runaway = true; reason = 'range-collapse'
      }
    }

    if (runaway) {
      // Revert using the ACTUAL extracted offset (may differ from mapDef.fixedOffset when
      // extractMap fell back to signature/calSearch — v3.11.19 fix). realOffset already
      // computed above when reading post-write buffer bytes.
      workingBuffer = revertMapInBuffer(workingBuffer, buffer, c, realOffset)
      const m = matches.find(mm => {
        const synthId = `sig_${mm.family}_${mm.offset.toString(16)}_${mm.name.replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 120)
        return synthId === c.mapDef.id
      })
      if (m) skipped.push({ match: m, reason: 'runaway-change' })
      mapsReverted++
      // Silently log the reason for post-run diagnostics (visible in DevTools console)
      console.warn(`[SmartStage] reverted ${c.mapDef.name} (${c.mapDef.id}): ${reason}`)
      // Mark the change so the caller knows this map was rolled back
      c.afterRaw = c.beforeRaw.map(row => [...row])
      c.after = c.before.map(row => [...row])
      c.avgChangePct = 0
      c.maxChangePct = 0
    }
  }
  remap.modifiedBuffer = workingBuffer

  // 8. Count how many of the applied maps hit a physical clamp
  const mapsClamped = countClampedMaps(remap.changes)

  // 9. Anything the engine safety-gated out as uniform ends up in remap.summary.mapsBlockedUniform
  //    — we translate those back into skipped[] for a single unified diagnostics list.
  for (const c of remap.changes) {
    if (c.skippedUniform) {
      const m = matches.find(mm => {
        const synthId = `sig_${mm.family}_${mm.offset.toString(16)}_${mm.name.replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 120)
        return synthId === c.mapDef.id
      })
      if (m) skipped.push({ match: m, reason: 'uniform' })
    }
  }

  // 10. Update the remap summary to reflect reverted maps
  remap.summary.mapsModified = Math.max(0, remap.summary.mapsModified - mapsReverted)

  return {
    remap,
    totalMatches: matches.length,
    applied: remap.summary.mapsModified,
    skipped,
    mapsClamped,
    mapsReverted,
  }
}

// ─── Revert a single map's bytes in the working buffer ───────────────────────
// Copies the ORI bytes over the region occupied by this map. Used when a map's
// post-stage values are deemed pathological (runaway change >60%).
// v3.11.19: takes an explicit `offset` parameter. Caller passes the actual extracted
// offset (from ExtractedMap.offset) which may differ from mapDef.fixedOffset when
// extractMap fell back to signature search or calSearch. Using the wrong offset
// would revert bytes that weren't actually modified — leaving the real tuned bytes
// in place, which is what we saw in the PPD1 BC52 test.
function revertMapInBuffer(working: ArrayBuffer, original: ArrayBuffer, change: MapChange, offset?: number): ArrayBuffer {
  const out = working.slice(0)
  const outBytes = new Uint8Array(out)
  const origBytes = new Uint8Array(original)
  const mapDef = change.mapDef
  const off = offset !== undefined && offset >= 0 ? offset : (mapDef.fixedOffset ?? -1)
  if (off < 0) return out
  // DataType in ecuDefinitions is narrower (uint8|int8|uint16|int16|float32) — no uint32/int32
  const dt = mapDef.dtype as string
  const dtypeSize = dt === 'uint8' || dt === 'int8' ? 1
                  : dt === 'float32' || dt === 'uint32' || dt === 'int32' ? 4
                  : 2
  const totalBytes = mapDef.rows * mapDef.cols * dtypeSize
  if (off + totalBytes > outBytes.length || off + totalBytes > origBytes.length) return out
  for (let i = 0; i < totalBytes; i++) outBytes[off + i] = origBytes[off + i]
  return out
}

// ─── Detect maps that saturated against their physical clamp ─────────────────
// A map is "clamped" if any cell in the after-grid exactly equals clampMax (or clampMin)
// AND that cell would have exceeded the clamp without capping (i.e. before*multiplier > clampMax).
function countClampedMaps(changes: MapChange[]): number {
  let n = 0
  for (const c of changes) {
    if (!c.found || c.skippedUniform) continue
    const mul = c.mapDef.stage1.multiplier ?? 1 // approx — we'd need the actual applied stage to be exact
    const cmax = c.mapDef.stage1.clampMax
    const cmin = c.mapDef.stage1.clampMin
    if (cmax === undefined && cmin === undefined) continue
    let hit = false
    outer: for (let r = 0; r < c.afterRaw.length; r++) {
      for (let col = 0; col < c.afterRaw[r].length; col++) {
        const before = c.beforeRaw[r][col]
        const after  = c.afterRaw[r][col]
        if (cmax !== undefined && after === cmax && before * mul > cmax) { hit = true; break outer }
        if (cmin !== undefined && after === cmin && before * mul < cmin) { hit = true; break outer }
      }
    }
    if (hit) n++
  }
  return n
}
