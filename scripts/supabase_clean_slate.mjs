#!/usr/bin/env node
/**
 * supabase_clean_slate.mjs — v3.15.3 Phase 3 companion
 * ────────────────────────────────────────────────────
 * Finishes the Supabase clean-slate started via MCP migrations:
 *   1. Deletes 5 retired buckets (tune-files / library-files / tune-library /
 *      tunes / remap-files) and all their contents.
 *   2. Removes the 18,998 DRT orphan files from `definition-files` (their
 *      indexed rows in `definitions_index` were already dropped via SQL).
 *   3. Uploads all local recipes (`resources/recipes/`) to the new `recipes`
 *      bucket so web BYOK users can fetch Tier 1 reproductions.
 *
 * Requires SERVICE ROLE key (not anon) — bucket delete + insert need admin rights.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   node scripts/supabase_clean_slate.mjs [--dry-run]
 *
 * Flags:
 *   --dry-run      preview only, no writes/deletes (DEFAULT if DRY_RUN env missing)
 *   --execute      actually perform the operations
 *   --skip-drop    skip bucket drops (if already done via dashboard)
 *   --skip-drt     skip DRT file cleanup
 *   --skip-upload  skip recipes upload
 */

import { createClient } from '@supabase/supabase-js'
import { readdir, readFile, stat } from 'fs/promises'
import { join, dirname, resolve, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const RECIPES_DIR = join(REPO_ROOT, 'resources', 'recipes')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const argv = process.argv.slice(2)
const EXECUTE    = argv.includes('--execute')
const SKIP_DROP  = argv.includes('--skip-drop')
const SKIP_DRT   = argv.includes('--skip-drt')
const SKIP_UPLOAD = argv.includes('--skip-upload')
const DRY_RUN    = !EXECUTE

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('✗ Missing env vars.')
  console.error('  Required:')
  console.error('    SUPABASE_URL          (e.g. https://xxx.supabase.co)')
  console.error('    SUPABASE_SERVICE_KEY  (Supabase dashboard → Project Settings → API → service_role key)')
  console.error('  WARNING: service_role key bypasses RLS. Never commit it.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log('━'.repeat(66))
console.log(`DCTuning Supabase clean-slate — ${DRY_RUN ? 'DRY RUN' : '⚠  EXECUTE MODE'}`)
console.log('━'.repeat(66))

// ─── 1. Drop 5 retired buckets ────────────────────────────────────────────
const BUCKETS_TO_DROP = ['tune-files', 'library-files', 'tune-library', 'tunes', 'remap-files']

async function dropBucket(name) {
  // Step 1: empty the bucket using storage API remove() in pages of 1000.
  console.log(`\n• ${name}`)
  let totalRemoved = 0
  let more = true
  let page = 0

  while (more) {
    const { data: files, error: listErr } = await supabase.storage
      .from(name)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (listErr) {
      console.error(`    list error: ${listErr.message}`)
      return
    }
    if (!files || files.length === 0) { more = false; break }

    // list returns only top-level. For recursive listing we need to walk
    // — but for 5-bucket cleanup, the simpler approach is just use the
    // management API delete-bucket endpoint, which recursively wipes.
    // However that endpoint requires a PAT (personal access token), not
    // service role. So we fall back to Supabase JS's .remove() per path.
    //
    // For top-level files (no slashes), .remove() works directly.
    // For deep paths we need to walk the prefix tree.
    const paths = await walkPaths(name, '')
    if (paths.length === 0) { more = false; break }

    console.log(`    removing ${paths.length} objects in batches of 1000…`)
    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000)
      if (DRY_RUN) {
        totalRemoved += batch.length
        continue
      }
      const { error: rmErr } = await supabase.storage.from(name).remove(batch)
      if (rmErr) console.error(`    remove batch ${i}: ${rmErr.message}`)
      else totalRemoved += batch.length
    }
    page++
    more = false  // walkPaths returned all; no next page
  }

  console.log(`    ${DRY_RUN ? 'would remove' : 'removed'} ${totalRemoved} objects`)

  // Step 2: drop the bucket itself
  if (!DRY_RUN) {
    const { error } = await supabase.storage.deleteBucket(name)
    if (error) console.error(`    deleteBucket: ${error.message}`)
    else console.log(`    ✓ bucket '${name}' deleted`)
  } else {
    console.log(`    would delete bucket '${name}'`)
  }
}

async function walkPaths(bucket, prefix) {
  // Recursive walker using storage .list() with pagination.
  const all = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) { console.error(`    walk ${prefix}: ${error.message}`); break }
    if (!data || data.length === 0) break
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null || entry.metadata === null) {
        // folder — recurse
        const sub = await walkPaths(bucket, full)
        all.push(...sub)
      } else {
        all.push(full)
      }
    }
    if (data.length < 1000) break
    offset += data.length
  }
  return all
}

// ─── 2. DRT orphan cleanup in definition-files ────────────────────────────
async function cleanupDrtOrphans() {
  console.log('\n━ DRT orphan cleanup in definition-files ━'.padEnd(66, '━'))
  const paths = (await walkPaths('definition-files', '')).filter(p => /\.drt$/i.test(p))
  console.log(`  found ${paths.length} .drt files`)
  if (paths.length === 0) return

  let removed = 0
  for (let i = 0; i < paths.length; i += 1000) {
    const batch = paths.slice(i, i + 1000)
    if (DRY_RUN) { removed += batch.length; continue }
    const { error } = await supabase.storage.from('definition-files').remove(batch)
    if (error) console.error(`  batch ${i}: ${error.message}`)
    else removed += batch.length
    process.stdout.write(`\r  ${DRY_RUN ? 'would remove' : 'removed'} ${removed}/${paths.length}`)
  }
  console.log()
}

// ─── 3. Recipes upload ────────────────────────────────────────────────────
async function uploadRecipes() {
  console.log('\n━ Uploading recipes to recipes bucket ━'.padEnd(66, '━'))
  try { await stat(RECIPES_DIR) }
  catch { console.error(`  ✗ ${RECIPES_DIR} not found — nothing to upload`); return }

  // Walk local folder
  const files = []
  async function walk(dir, rel = '') {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(full, r)
      else if (e.isFile() && e.name.endsWith('.json')) files.push({ full, rel: r })
    }
  }
  await walk(RECIPES_DIR)
  console.log(`  ${files.length} recipe files found locally`)

  let uploaded = 0
  let skipped = 0
  let failed = 0
  for (const { full, rel } of files) {
    if (DRY_RUN) { uploaded++; continue }
    const data = await readFile(full)
    const { error } = await supabase.storage
      .from('recipes')
      .upload(rel, data, { contentType: 'application/json', upsert: true })
    if (error) {
      if (error.message.includes('already exists')) skipped++
      else { console.error(`  ✗ ${rel}: ${error.message}`); failed++ }
    } else uploaded++
    if ((uploaded + skipped + failed) % 50 === 0) {
      process.stdout.write(`\r  ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`)
    }
  }
  console.log()
  console.log(`  ${DRY_RUN ? 'would upload' : 'uploaded'} ${uploaded}, skipped ${skipped}, failed ${failed}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────
;(async () => {
  if (!SKIP_DROP) {
    console.log('\n━ Dropping 5 retired buckets ━'.padEnd(66, '━'))
    for (const b of BUCKETS_TO_DROP) await dropBucket(b)
  } else console.log('\n(skip-drop)')

  if (!SKIP_DRT) await cleanupDrtOrphans()
  else console.log('\n(skip-drt)')

  if (!SKIP_UPLOAD) await uploadRecipes()
  else console.log('\n(skip-upload)')

  console.log('\n━'.repeat(66))
  if (DRY_RUN) {
    console.log('DRY RUN complete. Nothing was changed.')
    console.log('Review the output above, then re-run with --execute to perform the operations.')
  } else {
    console.log('✓ Done.')
  }
})().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
