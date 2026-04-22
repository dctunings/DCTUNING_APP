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
  reason: 'unverified' | 'low-quality' | 'category-excluded' | 'user-excluded' | 'extract-failed' | 'uniform' | 'runaway-change'
}

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

  for (const match of matches) {
    // 1. Verified-scaling gate (default-on safety)
    if (opts.verifiedOnly && !match.scalingVerified) {
      skipped.push({ match, reason: 'unverified' })
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
  for (const c of remap.changes) {
    if (!c.found || c.skippedUniform || c.avgChangePct === 0) continue
    let runaway = false
    for (let r = 0; r < c.beforeRaw.length && !runaway; r++) {
      for (let col = 0; col < c.beforeRaw[r].length && !runaway; col++) {
        const before = c.beforeRaw[r][col]
        const after = c.afterRaw[r][col]
        if (before === after) continue
        // Handle before=0 separately — any change from 0 is technically "infinite %"
        // but small absolute deltas on small-value maps are harmless. Use absolute-
        // delta check when before is small (< 100 raw units).
        if (Math.abs(before) < 100) {
          if (Math.abs(after - before) > 60) runaway = true
        } else {
          const changeFrac = Math.abs((after - before) / before)
          if (changeFrac > RUNAWAY_CHANGE_THRESHOLD) runaway = true
        }
      }
    }
    if (runaway) {
      // Revert this map's bytes to the original ORI values
      workingBuffer = revertMapInBuffer(workingBuffer, buffer, c)
      // Record the revert in the skipped list for UI diagnostics
      const m = matches.find(mm => {
        const synthId = `sig_${mm.family}_${mm.offset.toString(16)}_${mm.name.replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 120)
        return synthId === c.mapDef.id
      })
      if (m) skipped.push({ match: m, reason: 'runaway-change' })
      mapsReverted++
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
function revertMapInBuffer(working: ArrayBuffer, original: ArrayBuffer, change: MapChange): ArrayBuffer {
  const out = working.slice(0)
  const outBytes = new Uint8Array(out)
  const origBytes = new Uint8Array(original)
  const mapDef = change.mapDef
  const off = mapDef.fixedOffset
  if (off === undefined || off < 0) return out
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
