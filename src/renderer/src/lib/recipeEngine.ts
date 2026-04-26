// Recipe-based tuning engine.
//
// Core idea: tuning by example, not by inference. For every (ECU variant, stage)
// pair where we have a proven tuner-produced Stage N file, we've pre-computed the
// byte-level delta from ORI. Storing that delta as a "recipe" lets us reproduce
// the tune BIT-EXACTLY on any new ORI of the same variant.
//
// This is how pro tuners (WinOLS, ECM Titanium, Swiftec, SpeedWeaver wizards)
// have worked for decades. Extracting the tune as bytes means we reproduce a
// known-good file perfectly — no category inference, no multiplier guessing,
// no runaway-change safety nets needed. The recipe IS the tune.

// ─── Manifest entry ──────────────────────────────────────────────────────────
// One row per recipe. Loaded once at app start (~400 KB of JSON). Indexed by
// partNumber + swNumber at lookup time.
export interface RecipeManifestEntry {
  partNumber: string                 // e.g. '03G906018DH'
  swNumber: string                   // e.g. 'SN100L8000000'
  stage: number                      // 1, 2, 3 (sometimes 0 if no tune detected)
  oriHash: string                    // SHA-256 of the source ORI file (hex)
  oriSize: number                    // byte size of source ORI
  regions: number                    // count of modified regions (metadata)
  totalBytesChanged: number          // total bytes differing from ORI (metadata)
  path: string                       // relative path to the full recipe file: e.g. '03G906018DH/SN100L8000000_stage1.json'
  sourceTunedFile: string            // original filename of the tuner's Stage file
}

// ─── Full recipe (loaded on-demand when applying) ────────────────────────────
export interface RecipeRegion {
  offset: number       // byte offset into ORI
  size: number         // number of bytes
  bytesHex: string     // hex-encoded replacement bytes (size * 2 chars)
}

export interface Recipe {
  schemaVersion: 1
  sourcePartNumber: string
  sourceSwNumber: string
  sourceOriFile: string
  sourceTunedFile: string
  sourceOriHash: string
  sourceOriSize: number
  stage: number
  regions: RecipeRegion[]
  totalBytesChanged: number
  generatedAt: string
}

// ─── SHA-256 of an ArrayBuffer (browser-compatible using SubtleCrypto) ───────
export async function sha256Buffer(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(hash)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

// ─── Extract part number + SW number from binary content ─────────────────────
// Fallback when ORI hash doesn't match any manifest (e.g. user has a file from a
// variant we've seen but slightly different content). We can still find matching
// recipes by part number — they might not be bit-exact compatible but are close.
export function extractIdentsFromBinary(buf: ArrayBuffer): { partNumber: string | null; swNumber: string | null } {
  const bytes = new Uint8Array(buf)
  // Scan the first 512KB as ASCII (most ECUs have idents in header region)
  const scanLen = Math.min(bytes.length, 512 * 1024)
  let ascii = ''
  for (let i = 0; i < scanLen; i++) {
    const b = bytes[i]
    ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : ' '
  }
  // VW/Audi part number pattern: 3 digits + 1 letter + 6 digits + 1-3 letters
  const partMatch = ascii.match(/(0[0-9][0-9A-Z][0-9]{6}[A-Z]{1,3})/)
  // SW number pattern: SN/SA/SM/SG + hex chars + 000000
  const swMatch = ascii.match(/(S[NAMG][0-9A-Z]{3}[0-9A-Z]{8})/)
  return {
    partNumber: partMatch ? partMatch[1] : null,
    swNumber: swMatch ? swMatch[1] : null,
  }
}

// ─── Find matching recipes for a given ORI ──────────────────────────────────
// Returns matches sorted best-first:
//   1. Exact hash match (bit-perfect variant match — apply produces bit-exact output)
//   2. Part number + SW number match (same variant, different hash — may still work)
//   3. Part number only match (same ECU, different SW — UI warns, user opt-in)
export interface RecipeMatch {
  entry: RecipeManifestEntry
  confidence: 'exact' | 'variant' | 'part-only'
  stage: number
}

export function findMatchingRecipes(
  manifest: RecipeManifestEntry[],
  oriHash: string,
  idents: { partNumber: string | null; swNumber: string | null },
  oriSize: number,
): RecipeMatch[] {
  const out: RecipeMatch[] = []
  const seen = new Set<string>() // dedupe by path

  // Pass 1: exact hash match
  for (const e of manifest) {
    if (e.oriHash === oriHash && e.oriSize === oriSize && !seen.has(e.path)) {
      out.push({ entry: e, confidence: 'exact', stage: e.stage })
      seen.add(e.path)
    }
  }
  // Pass 2: variant match (partNumber + swNumber)
  if (idents.partNumber && idents.swNumber) {
    for (const e of manifest) {
      if (seen.has(e.path)) continue
      if (e.partNumber === idents.partNumber && e.swNumber === idents.swNumber && e.oriSize === oriSize) {
        out.push({ entry: e, confidence: 'variant', stage: e.stage })
        seen.add(e.path)
      }
    }
  }
  // Pass 3: part number only
  if (idents.partNumber) {
    for (const e of manifest) {
      if (seen.has(e.path)) continue
      if (e.partNumber === idents.partNumber && e.oriSize === oriSize) {
        out.push({ entry: e, confidence: 'part-only', stage: e.stage })
        seen.add(e.path)
      }
    }
  }
  // Sort: exact > variant > part-only; within each, stage 1 before 2 before 3.
  // v3.15.2: add stable tie-break on (partNumber, swNumber, path) so identical inputs
  // ALWAYS produce identical outputs regardless of manifest JSON key order.
  const order: Record<RecipeMatch['confidence'], number> = { exact: 0, variant: 1, 'part-only': 2 }
  out.sort((a, b) => {
    if (order[a.confidence] !== order[b.confidence]) return order[a.confidence] - order[b.confidence]
    if (a.stage !== b.stage) return a.stage - b.stage
    const ka = `${a.entry.partNumber}|${a.entry.swNumber}|${a.entry.path}`
    const kb = `${b.entry.partNumber}|${b.entry.swNumber}|${b.entry.path}`
    return ka.localeCompare(kb)
  })
  return out
}

// ─── Apply a recipe to an ORI buffer ────────────────────────────────────────
// Returns a fresh ArrayBuffer with the tuner's Stage N transformation applied,
// plus any regions that were SKIPPED because they fell outside the buffer.
// When confidence === 'exact' AND skipped is empty, this produces bit-exact
// reproduction of the source tuner file. If regions were skipped the output
// is PARTIAL — caller MUST surface a warning before flashing.
//
// v3.15.2: previously this function silently `continue`'d on bad regions,
// producing a degraded tune with no caller feedback. Now the skipped list is
// returned so the UI can flag it.
export interface ApplyRecipeResult {
  buffer: ArrayBuffer
  skipped: RecipeRegion[]    // regions dropped because offset+size overran the buffer
}

export function applyRecipe(oriBuffer: ArrayBuffer, recipe: Recipe): ApplyRecipeResult {
  const out = oriBuffer.slice(0)
  const bytes = new Uint8Array(out)
  const skipped: RecipeRegion[] = []
  for (const region of recipe.regions) {
    if (region.offset < 0 || region.offset + region.size > bytes.length) {
      skipped.push(region)
      continue
    }
    // Decode hex → bytes, write at offset
    for (let i = 0; i < region.size; i++) {
      const byte = parseInt(region.bytesHex.substr(i * 2, 2), 16)
      if (!isNaN(byte)) bytes[region.offset + i] = byte
    }
  }
  return { buffer: out, skipped }
}

// ─── Fetch the recipe library manifest ──────────────────────────────────────
// Electron mode: loaded from resources/recipes/manifest.json via IPC.
// Web mode: fetched from /recipes/manifest.json (served as static asset).
let cachedManifest: RecipeManifestEntry[] | null = null
let manifestPromise: Promise<RecipeManifestEntry[]> | null = null

export async function loadManifest(): Promise<RecipeManifestEntry[]> {
  if (cachedManifest) return cachedManifest
  if (manifestPromise) return manifestPromise
  manifestPromise = (async () => {
    try {
      // Try Electron IPC first (desktop mode — reads from resources folder)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      if (api?.loadRecipeManifest) {
        const res = await api.loadRecipeManifest()
        if (res?.ok && Array.isArray(res.manifest)) {
          cachedManifest = res.manifest
          return res.manifest
        }
      }
      // Fall back to HTTP fetch (web mode — served as static asset).
      // cache: 'no-cache' forces revalidation against the server (using ETag /
      // If-Modified-Since), so when we ship a new manifest the browser picks
      // it up immediately. The previous 'force-cache' setting trapped users
      // on whichever manifest they got the first time they ever visited the
      // app — Damo saw 1,446 entries on a build that has 3,138.
      // Bust the bandwidth concern with the BUILD_ID query string — same JSON
      // re-served means the browser still gets a 304 Not Modified.
      const url = `./recipes/manifest.json?v=${__APP_VERSION__}`
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) return []
      const manifest = (await res.json()) as RecipeManifestEntry[]
      cachedManifest = manifest
      return manifest
    } catch {
      return []
    }
  })()
  return manifestPromise
}

// ─── Fetch a specific recipe by its relative path ───────────────────────────
// Desktop: IPC pulls from bundled resources/recipes/ (works offline, instant).
// Web (v3.15.4): Supabase Storage public bucket (single source of truth across
//   builds; no need to bundle 231 MB of JSON into every web deploy).
//
// Storage URL pattern:
//   {SUPABASE_URL}/storage/v1/object/public/recipes/{relativePath}
// The bucket is public-read (RLS policy "recipes_public_read"), so no auth
// header is needed — anyone with the URL can fetch.
const SUPABASE_RECIPES_BASE = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL || 'https://eqfmeavkefflwmzihqkd.supabase.co'
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/recipes`
})()

export async function loadRecipe(relativePath: string): Promise<Recipe | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).api
    if (api?.loadRecipe) {
      const res = await api.loadRecipe(relativePath)
      if (res?.ok && res.recipe) return res.recipe as Recipe
    }
    // Web fallback — Supabase Storage CDN
    const res = await fetch(`${SUPABASE_RECIPES_BASE}/${relativePath}`, { cache: 'force-cache' })
    if (!res.ok) return null
    return (await res.json()) as Recipe
  } catch {
    return null
  }
}
