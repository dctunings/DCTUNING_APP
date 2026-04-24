// AI tool definitions + executors.
//
// The Claude API tool-use loop runs in the renderer (not main) because all the
// catalog data already lives here: ECU_DEFINITIONS from ecuDefinitions, the recipe
// manifest loaded via IPC, and the map-multiplier library. Main is a pure API
// proxy; renderer owns tool execution.
//
// Each tool is:
//   1) Declared with a JSON schema (sent to Claude so it knows when to call it)
//   2) Paired with an async executor that runs the actual query in the renderer
//
// CRITICAL — tools here are READ-ONLY. They query catalog data. None of them
// write files, modify binaries, or call destructive operations. Those paths
// live in stageEngine / remapEngine / binaryParser and are never exposed to
// the LLM. That boundary is enforced by simply not defining write tools.

import { ECU_DEFINITIONS } from './ecuDefinitions'
import type { RecipeManifestEntry } from './recipeEngine'
import { loadMapMultiplierLibrary, type MapMultiplierEntry } from './stageEngine'

// ── Tool schemas (what Claude sees) ───────────────────────────────────────
export const AI_TOOLS = [
  {
    name: 'search_ecus',
    description:
      'Search the DCTuning ECU catalog. Returns matching EcuDefs by part number, ' +
      'manufacturer, model, or family name. Use this to answer questions like ' +
      '"what ECU is in a 2010 Audi S3?" or "which variants are EDC16U?" Match is ' +
      'case-insensitive substring against id, manufacturer, family, and vehicles[].',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (part number, vehicle, family, etc.)' },
        limit: { type: 'number', description: 'Max results (default 10, max 30)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_ecu_details',
    description:
      'Fetch the full details for a specific ECU by its id (e.g. "03G906018DH"). ' +
      'Returns family, vehicles, file size, and a summary of its tunable maps ' +
      '(name, category, unit, whether it has a fixed offset for this variant).',
    input_schema: {
      type: 'object',
      properties: {
        ecuId: { type: 'string', description: 'ECU id from the catalog' },
      },
      required: ['ecuId'],
    },
  },
  {
    name: 'search_maps',
    description:
      'Search the map-multiplier library for tuning statistics on a given map name. ' +
      'Returns the median multiplier per stage that real tuners applied to that map ' +
      'across the full recipe corpus, split by ECU family (with a cross-family ' +
      'aggregate labelled "*"). Use this to answer "how do tuners typically modify X?"',
    input_schema: {
      type: 'object',
      properties: {
        namePattern: { type: 'string', description: 'Map name substring to match (case-insensitive)' },
        family: { type: 'string', description: 'Optional family filter (EDC16, ME7, PPD1, etc.)' },
        limit: { type: 'number', description: 'Max results (default 8, max 25)' },
      },
      required: ['namePattern'],
    },
  },
  {
    name: 'list_recipe_variants',
    description:
      'List ECU variants that have bit-exact recipes in the library. Useful for ' +
      'answering "do you support my ECU?" and "which Audi variants have Stage 2?". ' +
      'Optionally filter by part number substring or manufacturer.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional filter on part number substring' },
        stage: { type: 'number', description: 'Optional filter: 1, 2, or 3 — only show variants covered at this stage' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },
] as const

// ── Executors ─────────────────────────────────────────────────────────────
export type ToolName = typeof AI_TOOLS[number]['name']

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  recipeManifest: RecipeManifestEntry[] | null,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case 'search_ecus':        return { ok: true, result: await searchEcus(input) }
      case 'get_ecu_details':    return { ok: true, result: await getEcuDetails(input) }
      case 'search_maps':        return { ok: true, result: await searchMaps(input) }
      case 'list_recipe_variants': return { ok: true, result: await listRecipeVariants(input, recipeManifest) }
      default:                    return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Tool execution failed.'
    return { ok: false, error: msg }
  }
}

// ── Tool implementations ──────────────────────────────────────────────────
function searchEcus(input: Record<string, unknown>) {
  const query = String(input.query ?? '').trim().toLowerCase()
  const limit = clamp(Number(input.limit ?? 10), 1, 30)
  if (!query) return { error: 'Empty query' }

  const matches = ECU_DEFINITIONS.filter(e =>
    e.id.toLowerCase().includes(query) ||
    e.manufacturer.toLowerCase().includes(query) ||
    e.family.toLowerCase().includes(query) ||
    (e.vehicles ?? []).some(v => v.toLowerCase().includes(query))
  ).slice(0, limit)

  return {
    count: matches.length,
    matches: matches.map(e => ({
      id: e.id,
      name: e.name,
      manufacturer: e.manufacturer,
      family: e.family,
      vehicles: e.vehicles,
      mapCount: e.maps?.length ?? 0,
      fileSizeRange: e.fileSizeRange,
    })),
  }
}

function getEcuDetails(input: Record<string, unknown>) {
  const ecuId = String(input.ecuId ?? '').trim()
  if (!ecuId) return { error: 'ecuId required' }

  const ecu = ECU_DEFINITIONS.find(e => e.id.toLowerCase() === ecuId.toLowerCase())
  if (!ecu) return { error: `ECU not found: ${ecuId}` }

  return {
    id: ecu.id,
    name: ecu.name,
    manufacturer: ecu.manufacturer,
    family: ecu.family,
    vehicles: ecu.vehicles,
    identStrings: ecu.identStrings,
    fileSizeRange: ecu.fileSizeRange,
    checksumAlgo: ecu.checksumAlgo,
    maps: (ecu.maps ?? []).map(m => ({
      id: m.id,
      name: m.name,
      category: m.category,
      unit: m.unit,
      hasFixedOffset: 'fixedOffset' in m && m.fixedOffset != null,
      critical: m.critical,
      stage1: m.stage1 ? { multiplier: m.stage1.multiplier, clampMax: m.stage1.clampMax } : undefined,
      stage2: m.stage2 ? { multiplier: m.stage2.multiplier, clampMax: m.stage2.clampMax } : undefined,
      stage3: m.stage3 ? { multiplier: m.stage3.multiplier, clampMax: m.stage3.clampMax } : undefined,
    })),
  }
}

async function searchMaps(input: Record<string, unknown>) {
  const pattern = String(input.namePattern ?? '').trim().toLowerCase()
  const family = input.family ? String(input.family).trim() : undefined
  const limit = clamp(Number(input.limit ?? 8), 1, 25)
  if (!pattern) return { error: 'namePattern required' }

  const lib = await loadMapMultiplierLibrary()
  const all = [
    ...Array.from(lib.byFamilyName.values()),
    ...Array.from(lib.byName.values()),
  ]
  const filtered = all
    .filter(e => e.name.toLowerCase().includes(pattern))
    .filter(e => !family || e.family === family || e.family === '*')
    .slice(0, limit)
    .map((e: MapMultiplierEntry) => ({
      name: e.name,
      family: e.family,
      stage1: e.stage1 ? { median: round3(e.stage1.median), n: e.stage1.n, p25: round3(e.stage1.p25), p75: round3(e.stage1.p75) } : null,
      stage2: e.stage2 ? { median: round3(e.stage2.median), n: e.stage2.n, p25: round3(e.stage2.p25), p75: round3(e.stage2.p75) } : null,
      stage3: e.stage3 ? { median: round3(e.stage3.median), n: e.stage3.n, p25: round3(e.stage3.p25), p75: round3(e.stage3.p75) } : null,
    }))

  return { count: filtered.length, matches: filtered }
}

function listRecipeVariants(
  input: Record<string, unknown>,
  recipeManifest: RecipeManifestEntry[] | null,
) {
  if (!recipeManifest) return { error: 'Recipe manifest not loaded yet' }
  const query = input.query ? String(input.query).trim().toLowerCase() : ''
  const stageFilter = input.stage != null ? Number(input.stage) : null
  const limit = clamp(Number(input.limit ?? 20), 1, 50)

  const filtered = recipeManifest
    .filter(r => !query || r.partNumber.toLowerCase().includes(query))
    .filter(r => stageFilter === null || r.stage === stageFilter)
    .slice(0, limit)
    .map(r => ({
      partNumber: r.partNumber,
      swNumber: r.swNumber,
      stage: r.stage,
      sourceTunedFile: r.sourceTunedFile,
    }))

  return {
    count: filtered.length,
    totalInLibrary: recipeManifest.length,
    matches: filtered,
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  if (!isFinite(v)) return lo
  return Math.min(Math.max(v, lo), hi)
}
function round3(n: number): number { return Math.round(n * 1000) / 1000 }
