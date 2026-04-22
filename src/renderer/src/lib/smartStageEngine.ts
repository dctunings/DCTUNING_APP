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
  reason: 'unverified' | 'low-quality' | 'category-excluded' | 'user-excluded' | 'extract-failed' | 'uniform'
}

export interface SmartStageResult {
  remap: RemapResult              // same shape as manual Stage 1/2/3 — ready for download
  totalMatches: number            // how many sigs the scanner found
  applied: number                 // how many ended up in the remap
  skipped: SmartStageSkip[]       // what was skipped and why
  mapsClamped: number             // count of applied maps that hit a physical-unit clamp
}

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

  // 7. Count how many of the applied maps hit a physical clamp — useful for the UI
  //    to flag "X boost maps reached the 3.0 bar ceiling."
  const mapsClamped = countClampedMaps(remap.changes)

  // 8. Anything the engine safety-gated out as uniform ends up in remap.summary.mapsBlockedUniform
  //    — we translate those back into skipped[] for a single unified diagnostics list.
  for (const c of remap.changes) {
    if (c.skippedUniform) {
      // Locate the original SignatureMatch by synthesized MapDef id (prefix match)
      const m = matches.find(mm => {
        const synthId = `sig_${mm.family}_${mm.offset.toString(16)}_${mm.name.replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 120)
        return synthId === c.mapDef.id
      })
      if (m) skipped.push({ match: m, reason: 'uniform' })
    }
  }

  return {
    remap,
    totalMatches: matches.length,
    applied: remap.summary.mapsModified,
    skipped,
    mapsClamped,
  }
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
