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

import type { EcuDef } from './ecuDefinitions'
import type { Stage, AddonId, RemapResult } from './remapEngine'
import type { SignatureMatch, ExtractedMap } from './binaryParser'
import type { RecipeManifestEntry } from './recipeEngine'

export type StageTier = 'recipe-exact' | 'recipe-variant' | 'multiplier-library' | 'category-default'

export interface StageResult {
  tier: StageTier              // which resolution path produced the output
  remap: RemapResult           // same shape as manual Stage 1/2/3 (downstream UI unchanged)
  sourceDescription: string    // human text for the UI: "Proven tune from tuner file 8DE3" etc.
  mapsModified: number
  recipeRegions?: number       // set when tier is recipe-*: region count
  learnedMapNames?: string[]   // set when tier is multiplier-library: map names we tuned
}

// ─── Map-multiplier library entry ────────────────────────────────────────────
export interface MapMultiplierEntry {
  name: string
  family: string
  count?: { s1: number; s2: number; s3: number }
  stage1?: { median: number; p25: number; p75: number; n: number }
  stage2?: { median: number; p25: number; p75: number; n: number }
  stage3?: { median: number; p25: number; p75: number; n: number }
}

// Lazily-loaded module-level cache
let mapMultiplierCache: Map<string, MapMultiplierEntry> | null = null
let mapMultiplierPromise: Promise<Map<string, MapMultiplierEntry>> | null = null

export async function loadMapMultiplierLibrary(): Promise<Map<string, MapMultiplierEntry>> {
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
          const map = new Map<string, MapMultiplierEntry>()
          for (const e of res.entries as MapMultiplierEntry[]) map.set(e.name, e)
          mapMultiplierCache = map
          return map
        }
      }
      // Web path: static asset
      const res = await fetch('./map-multipliers.json', { cache: 'force-cache' })
      if (!res.ok) return new Map()
      const entries = (await res.json()) as MapMultiplierEntry[]
      const map = new Map<string, MapMultiplierEntry>()
      for (const e of entries) map.set(e.name, e)
      mapMultiplierCache = map
      return map
    } catch {
      return new Map()
    }
  })()
  return mapMultiplierPromise
}

// ─── Resolve a multiplier for a given map + stage ────────────────────────────
// Returns null if the map name isn't in the library (caller falls back to tier 3).
export function resolveMultiplier(
  lib: Map<string, MapMultiplierEntry>,
  mapName: string,
  stage: Stage,
): { multiplier: number; source: 'library-median' | 'library-p75' | 'library-p25'; n: number } | null {
  const entry = lib.get(mapName)
  if (!entry) return null
  const key = `stage${stage}` as 'stage1' | 'stage2' | 'stage3'
  const s = entry[key]
  if (!s || s.n < 2) return null // floor: need at least 2 observations to trust
  // Use median (robust to outliers); p25/p75 available for "conservative" / "aggressive" modes
  return { multiplier: s.median, source: 'library-median', n: s.n }
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
      }
    }
  }

  // ─── TIER 2: map-name multiplier library (+ TIER 3 fallback per-map) ──────
  const { syntheticMapDefFromSignature, extractMap } = await import('./binaryParser')
  const { buildRemap } = await import('./remapEngine')
  const lib = await loadMapMultiplierLibrary()

  const overriddenMaps: ExtractedMap[] = []
  const learnedNames: string[] = []
  let tierUsed: StageTier = 'category-default'

  for (const match of sigMatches) {
    if (!match.scalingVerified) continue
    const learned = resolveMultiplier(lib, match.name, stage)
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
        tierUsed = 'multiplier-library' // any library hit promotes the tier badge
      }
    } else {
      const extracted = extractMap(buffer, mapDef, ecuDef.family)
      if (extracted.found) overriddenMaps.push(extracted)
    }
  }

  const remap = buildRemap(buffer, ecuDef, stage, addons, overriddenMaps)
  return {
    tier: tierUsed,
    remap,
    sourceDescription: tierUsed === 'multiplier-library'
      ? `${learnedNames.length} maps tuned using multipliers learned from the full recipe corpus`
      : `Category-based defaults — no recipe or library data for this variant`,
    mapsModified: remap.summary.mapsModified,
    learnedMapNames: learnedNames,
  }
}
