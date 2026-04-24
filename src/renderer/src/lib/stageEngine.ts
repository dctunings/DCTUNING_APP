// Unified Stage Engine — the one flow every "Apply Stage N" button runs through.
//
// Tiered resolution for "no ECU left behind":
//
//   Tier 1  BIT-EXACT RECIPE
//     User's ORI hash matches a recipe. Apply the recipe's byte-deltas directly.
//     Output = exact reproduction of a proven tuner Stage 1/2/3 file. Zero guessing.
//
//   Tier 2  MAP-NAME MULTIPLIER LIBRARY
//     No recipe match, but the sig scanner found named DAMOS maps in the ORI and
//     we have cross-recipe multiplier statistics for those map names. Apply the
//     median multiplier that real tuners used on each map name across 6,000+
//     proven tunes. Name-based transfer learning — works on ECU variants we've
//     never seen, as long as their maps are named things we've seen tuned before.
//
//   Tier 3  CATEGORY DEFAULT
//     Map's name isn't in the multiplier library (novel name). Fall back to the
//     category-driven defaults in syntheticMapDefFromSignature. Safety checks
//     and oversized filters from v3.11.x still apply.
//
//   REFUSED (safety gate, v3.14)
//     If signal is too low to trust any tier — few verified sig matches, no
//     recipe, no library hits — we REFUSE rather than emit a guess. Output is
//     null. The UI surfaces the refusal reason and does not produce a tune file.
//     "No ECU left behind" means every *supported-family* ECU gets a tune. It
//     does NOT mean we should hallucinate a tune for something we can't read.

import type { EcuDef } from './ecuDefinitions'
import type { Stage, AddonId, RemapResult } from './remapEngine'
import type { SignatureMatch, ExtractedMap } from './binaryParser'
import type { RecipeManifestEntry } from './recipeEngine'

export type StageTier =
  | 'recipe-exact'
  | 'recipe-variant'
  | 'multiplier-library'
  | 'category-default'
  | 'refused'             // safety gate: not enough signal for a trustworthy tune

export interface StageResult {
  tier: StageTier              // which resolution path produced the output
  remap: RemapResult | null    // null iff tier === 'refused'
  sourceDescription: string    // human text for the UI: "Proven tune from tuner file 8DE3" etc.
  mapsModified: number
  recipeRegions?: number       // set when tier is recipe-*: region count
  learnedMapNames?: string[]   // set when tier is multiplier-library: map names we tuned
  refusalReason?: string       // set when tier === 'refused'
  confidence?: {               // diagnostic counts (populated for all non-refused tiers too)
    verifiedMatches: number    // sig matches with scalingVerified === true
    libraryHits: number        // verified matches that also had a library multiplier
    recipeAvailable: boolean   // a recipe was available for this stage
  }
  validation?: ShapeValidation // set for Tier 2/3 only; recipe tier skips this since its summary is zeroed
}

// ─── Shape validator ────────────────────────────────────────────────────────
// Second, independent safety net (on top of refuse-if-unknown). Answers: "does
// the resulting tune LOOK like other Stage X tunes?" Catches Tier 2 going off
// the rails when a user's binary has signature hits but wildly wrong offsets.
export interface ShapeValidation {
  severity: 'ok' | 'soft' | 'hard'
  warnings: string[]
}

// Per-stage expected aggregate change-percentage ranges, distilled from real
// tuner behaviour across the recipe corpus. Outside these = manual review.
const STAGE_SHAPE_RANGES: Record<Stage, { boost: [number, number]; fuel: [number, number]; torque: [number, number] }> = {
  1: { boost: [3, 20],  fuel: [3, 20],  torque: [10, 35] },
  2: { boost: [8, 30],  fuel: [8, 25],  torque: [20, 55] },
  3: { boost: [12, 45], fuel: [12, 35], torque: [25, 85] },
}

export function validateStageShape(remap: RemapResult, stage: Stage): ShapeValidation {
  const warnings: string[] = []
  let severity: 'ok' | 'soft' | 'hard' = 'ok'
  const bump = (s: 'soft' | 'hard') => {
    if (s === 'hard' || severity === 'ok') severity = s
  }

  const s = remap.summary

  // 1) Maps modified — too few means Tier 2/3 found almost nothing to tune
  const minMaps = stage === 1 ? 3 : stage === 2 ? 5 : 8
  if (s.mapsModified < minMaps) {
    warnings.push(`Only ${s.mapsModified} maps modified — expected at least ${minMaps} for Stage ${stage}. Tune may be incomplete.`)
    bump('hard')
  } else if (s.mapsModified > 300) {
    warnings.push(`${s.mapsModified} maps modified — unusually high; verify benign maps weren't accidentally included.`)
    bump('soft')
  }

  // 2) Per-category aggregate change — catches multiplier values way outside typical
  const exp = STAGE_SHAPE_RANGES[stage]
  const checkCategory = (label: string, value: number, [lo, hi]: [number, number]) => {
    if (!isFinite(value) || value === 0) return // 0 = nothing in category, not a failure
    if (value > hi * 1.5) {
      warnings.push(`${label} +${value.toFixed(1)}% is well above Stage ${stage} typical (${lo}-${hi}%). Manual review required.`)
      bump('hard')
    } else if (value < lo * 0.5) {
      warnings.push(`${label} +${value.toFixed(1)}% is well below Stage ${stage} typical (${lo}-${hi}%). Possibly under-tuned.`)
      bump('soft')
    } else if (value > hi || value < lo) {
      warnings.push(`${label} +${value.toFixed(1)}% slightly outside Stage ${stage} typical (${lo}-${hi}%).`)
      bump('soft')
    }
  }
  checkCategory('Boost target', s.boostChangePct, exp.boost)
  checkCategory('Fuel quantity', s.fuelChangePct, exp.fuel)
  checkCategory('Torque limit', s.torqueChangePct, exp.torque)

  // 3) Blocked-as-uniform ratio — high ratio means wrong offsets or erased flash
  const attempted = s.mapsModified + s.mapsBlockedUniform + s.mapsNotFound
  if (attempted > 0) {
    const blockedRatio = s.mapsBlockedUniform / attempted
    if (blockedRatio > 0.5) {
      warnings.push(`${Math.round(blockedRatio * 100)}% of candidate maps blocked as uniform — likely wrong offsets or erased flash. Tune is probably unsafe.`)
      bump('hard')
    }
  }

  return { severity, warnings }
}

// ─── Safety thresholds ──────────────────────────────────────────────────────
// These are the "minimum confidence" bars for firing each tier without a recipe.
// Tier 1 (recipe) is never gated — if we have proven bytes, we use them.
const MIN_VERIFIED_MATCHES = 5     // total scalingVerified sig matches needed without a recipe
const MIN_LIBRARY_HITS = 2         // library-backed maps needed to justify Tier 2 tier label

// ─── Map-multiplier library entry ────────────────────────────────────────────
// v3.14: entries are keyed on (family, name). family === '*' is the cross-family
// aggregate used as a fallback when a specific family doesn't have enough data.
export interface MapMultiplierEntry {
  name: string
  family: string                         // specific family (e.g. 'EDC16', 'ME7', 'PPD1') or '*' for aggregate
  count?: { s1: number; s2: number; s3: number }
  stage1?: { median: number; p25: number; p75: number; n: number }
  stage2?: { median: number; p25: number; p75: number; n: number }
  stage3?: { median: number; p25: number; p75: number; n: number }
}

// v3.14: dual-index library — prefer family-specific, fall back to cross-family.
export interface MapMultiplierLibrary {
  byFamilyName: Map<string, MapMultiplierEntry>   // key: `${family}::${name}`, specific families only
  byName: Map<string, MapMultiplierEntry>         // key: name, cross-family '*' aggregate entries
}

// Lazily-loaded module-level cache
let mapMultiplierCache: MapMultiplierLibrary | null = null
let mapMultiplierPromise: Promise<MapMultiplierLibrary> | null = null

function indexEntries(entries: MapMultiplierEntry[]): MapMultiplierLibrary {
  const byFamilyName = new Map<string, MapMultiplierEntry>()
  const byName = new Map<string, MapMultiplierEntry>()
  for (const e of entries) {
    if (e.family === '*') {
      byName.set(e.name, e)
    } else {
      byFamilyName.set(`${e.family}::${e.name}`, e)
    }
  }
  // Backwards-compat: if the JSON is the old flat schema (no '*' entries),
  // every entry becomes both a family-specific AND a cross-family fallback.
  if (byName.size === 0 && byFamilyName.size > 0) {
    for (const e of entries) byName.set(e.name, e)
  }
  return { byFamilyName, byName }
}

export async function loadMapMultiplierLibrary(): Promise<MapMultiplierLibrary> {
  if (mapMultiplierCache) return mapMultiplierCache
  if (mapMultiplierPromise) return mapMultiplierPromise
  mapMultiplierPromise = (async () => {
    try {
      // Electron path: bundled resource
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      if (api?.loadMapMultipliers) {
        const res = await api.loadMapMultipliers()
        if (res?.ok && Array.isArray(res.entries)) {
          mapMultiplierCache = indexEntries(res.entries as MapMultiplierEntry[])
          return mapMultiplierCache
        }
      }
      // Web path: static asset
      const res = await fetch('./map-multipliers.json', { cache: 'force-cache' })
      if (!res.ok) return { byFamilyName: new Map(), byName: new Map() }
      const entries = (await res.json()) as MapMultiplierEntry[]
      mapMultiplierCache = indexEntries(entries)
      return mapMultiplierCache
    } catch {
      return { byFamilyName: new Map(), byName: new Map() }
    }
  })()
  return mapMultiplierPromise
}

// ─── Resolve a multiplier for a given map + stage ────────────────────────────
// v3.14: prefer family-specific, fall back to cross-family '*'.
// Returns null if nothing reliable exists (caller falls back to tier 3).
export function resolveMultiplier(
  lib: MapMultiplierLibrary,
  mapName: string,
  stage: Stage,
  family?: string,
): { multiplier: number; source: 'library-family' | 'library-cross-family'; n: number } | null {
  const key = `stage${stage}` as 'stage1' | 'stage2' | 'stage3'

  // 1) Family-specific: use if we have ≥2 observations for this exact family
  if (family) {
    const entry = lib.byFamilyName.get(`${family}::${mapName}`)
    if (entry) {
      const s = entry[key]
      if (s && s.n >= 2) return { multiplier: s.median, source: 'library-family', n: s.n }
    }
  }

  // 2) Cross-family fallback: still requires ≥2 observations
  const agg = lib.byName.get(mapName)
  if (agg) {
    const s = agg[key]
    if (s && s.n >= 2) return { multiplier: s.median, source: 'library-cross-family', n: s.n }
  }

  return null
}

// ─── Match a RecipeManifestEntry for the given stage ────────────────────────
export function pickBestRecipeForStage(
  matches: { entry: RecipeManifestEntry; confidence: 'exact' | 'variant' | 'part-only'; stage: number }[],
  stage: Stage,
): { entry: RecipeManifestEntry; confidence: 'exact' | 'variant' | 'part-only' } | null {
  // Preference: exact > variant > part-only; only for this stage
  const order = ['exact', 'variant', 'part-only'] as const
  for (const conf of order) {
    const m = matches.find(x => x.stage === stage && x.confidence === conf)
    if (m) return { entry: m.entry, confidence: m.confidence }
  }
  return null
}

// ─── Stage engine summary for UI display ────────────────────────────────────
export function describeTier(tier: StageTier, recipeRegions?: number, learnedMapNames?: string[]): string {
  switch (tier) {
    case 'recipe-exact':
      return `Bit-exact proven tune (${recipeRegions ?? 0} regions)`
    case 'recipe-variant':
      return `Applied proven tune from same variant (${recipeRegions ?? 0} regions)`
    case 'multiplier-library':
      return `Learned multipliers from ${learnedMapNames?.length ?? 0} matched maps across the tune corpus`
    case 'category-default':
      return `Category-based multipliers (fallback — no proven data for this variant)`
    case 'refused':
      return `Unsupported variant — insufficient signal for a safe tune`
  }
}

// ─── Compose a synthesized ExtractedMap list using tier-2 multipliers ───────
// For each sig scanner match where we have a library multiplier, synthesize
// the MapDef + override its stage multiplier with the learned value. The
// existing remapEngine pipeline handles extract + write + checksum.
// (Imports lazy-loaded inside applyStage to avoid circular deps.)
export async function applyStageUnified(params: {
  buffer: ArrayBuffer
  ecuDef: EcuDef
  stage: Stage
  addons: AddonId[]
  sigMatches: SignatureMatch[]
  recipeMatches: { entry: RecipeManifestEntry; confidence: 'exact' | 'variant' | 'part-only'; stage: number }[]
}): Promise<StageResult> {
  const { buffer, ecuDef, stage, addons, sigMatches, recipeMatches } = params

  const verifiedMatches = sigMatches.filter(m => m.scalingVerified)

  // ─── TIER 1: exact / variant recipe match for this stage ──────────────────
  const recipeMatch = pickBestRecipeForStage(recipeMatches, stage)
  if (recipeMatch) {
    const { loadRecipe, applyRecipe } = await import('./recipeEngine')
    const recipe = await loadRecipe(recipeMatch.entry.path)
    if (recipe) {
      const tuned = applyRecipe(buffer, recipe)
      const tier: StageTier = recipeMatch.confidence === 'exact' ? 'recipe-exact' : 'recipe-variant'
      return {
        tier,
        remap: {
          ecuDef, stage, addons, changes: [],
          modifiedBuffer: tuned,
          checksumWarning: false,
          summary: {
            boostChangePct: 0, fuelChangePct: 0, torqueChangePct: 0,
            mapsModified: recipe.regions.length, mapsNotFound: 0, mapsBlockedUniform: 0,
          },
        },
        sourceDescription: `Applied proven tune from ${recipeMatch.entry.sourceTunedFile}`,
        mapsModified: recipe.regions.length,
        recipeRegions: recipe.regions.length,
        confidence: {
          verifiedMatches: verifiedMatches.length,
          libraryHits: 0,  // not computed on recipe path
          recipeAvailable: true,
        },
      }
    }
  }

  // ─── SAFETY GATE (pre-Tier-2/3) ──────────────────────────────────────────
  // Without a recipe, we need enough recognized maps to trust the output.
  // Below MIN_VERIFIED_MATCHES we're not tuning — we're guessing. Refuse.
  if (verifiedMatches.length < MIN_VERIFIED_MATCHES) {
    return {
      tier: 'refused',
      remap: null,
      sourceDescription: 'Unsupported variant',
      mapsModified: 0,
      refusalReason:
        `Only ${verifiedMatches.length} verified map${verifiedMatches.length === 1 ? '' : 's'} ` +
        `found in this binary (need ≥${MIN_VERIFIED_MATCHES} for a safe tune). ` +
        `No recipe is available for this variant. This ECU appears to be an unsupported ` +
        `or unidentified family — request library coverage rather than tuning blind.`,
      confidence: {
        verifiedMatches: verifiedMatches.length,
        libraryHits: 0,
        recipeAvailable: false,
      },
    }
  }

  // ─── TIER 2: map-name multiplier library (+ TIER 3 fallback per-map) ──────
  const { syntheticMapDefFromSignature, extractMap } = await import('./binaryParser')
  const { buildRemap } = await import('./remapEngine')
  const lib = await loadMapMultiplierLibrary()

  const overriddenMaps: ExtractedMap[] = []
  const learnedNames: string[] = []

  for (const match of verifiedMatches) {
    // v3.14 scalingVerified-gate audit findings:
    //   1) Skip malformed shapes (rows=0 or cols=0) — catalog noise
    //   2) Skip single-cell VALUE entries without library backing. These are often
    //      sensor thresholds / diagnostic values; multiplying blindly is risky.
    //      If a library observation exists for this exact name, tuner intent is
    //      proven and we proceed (e.g. rev limiter, speed limiter).
    const cellCount = (match.rows || 0) * (match.cols || 0)
    if (cellCount < 1) continue
    const learned = resolveMultiplier(lib, match.name, stage, ecuDef.family)
    if (cellCount === 1 && !learned) continue
    const mapDef = syntheticMapDefFromSignature(match)
    if (learned) {
      // Override the category default with the learned multiplier
      const overrideDef = {
        ...mapDef,
        stage1: { ...mapDef.stage1, multiplier: learned.multiplier },
        stage2: { ...mapDef.stage2, multiplier: learned.multiplier },
        stage3: { ...mapDef.stage3, multiplier: learned.multiplier },
      }
      const extracted = extractMap(buffer, overrideDef, ecuDef.family)
      if (extracted.found) {
        overriddenMaps.push(extracted)
        learnedNames.push(match.name)
      }
    } else {
      const extracted = extractMap(buffer, mapDef, ecuDef.family)
      if (extracted.found) overriddenMaps.push(extracted)
    }
  }

  // Tier label is driven by library hit count — not just "any hit"
  const tierUsed: StageTier =
    learnedNames.length >= MIN_LIBRARY_HITS ? 'multiplier-library' : 'category-default'

  const remap = buildRemap(buffer, ecuDef, stage, addons, overriddenMaps)
  const validation = validateStageShape(remap, stage)
  return {
    tier: tierUsed,
    remap,
    sourceDescription: tierUsed === 'multiplier-library'
      ? `${learnedNames.length} maps tuned using multipliers learned from the full recipe corpus`
      : `Category-based defaults — no recipe or library data for this variant`,
    mapsModified: remap.summary.mapsModified,
    learnedMapNames: learnedNames,
    confidence: {
      verifiedMatches: verifiedMatches.length,
      libraryHits: learnedNames.length,
      recipeAvailable: false,
    },
    validation,
  }
}
