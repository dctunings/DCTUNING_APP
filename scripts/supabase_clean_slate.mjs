#!/usr/bin/env node
/**
 * supabase_clean_slate.mjs — v3.15.3 Phase 3 companion (v2)
 * ─────────────────────────────────────────────────────────
 * v1 tried to walk each bucket recursively and remove paths in 1000-batches.
 * That blew the call stack on the 285K-file tune-files bucket and hit Gateway
 * timeouts on deeply-nested paths. v2 uses `emptyBucket()` which is a single
 * server-side call — Supabase does the iteration internally.
 *
 * Operations:
 *   1. emptyBucket + deleteBucket for 5 retired buckets
 *   2. DRT orphan cleanup in `definition-files` (query storage.objects via
 *      service-role schema access, then batch-remove)
 *   3. Upload recipes from `resources/recipes/` → `recipes` bucket
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   node scripts/supabase_clean_slate.mjs [--execute] [--skip-drop] [--skip-drt] [--skip-upload]
 *
 * Defaults to dry-run. Use --execute to actually do it.
 */

import { createClient } from '@supabase/supabase-js'
import { readdir, readFile, stat } from 'fs/promises'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const RECIPES_DIR = join(REPO_ROOT, 'resources', 'recipes')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const argv = process.argv.slice(2)
const EXECUTE      = argv.includes('--execute')
const SKIP_DROP    = argv.includes('--skip-drop')
const SKIP_DRT     = argv.includes('--skip-drt')
const SKIP_UPLOAD  = argv.includes('--skip-upload')
const DRY_RUN      = !EXECUTE

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('✗ Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Enable cross-schema access (storage.objects) via REST
  db: { schema: 'public' },
})

console.log('━'.repeat(66))
console.log(`DCTuning Supabase clean-slate v2 — ${DRY_RUN ? 'DRY RUN' : '⚠  EXECUTE MODE'}`)
console.log('━'.repeat(66))

// ─── Retry helper for transient 5xx errors ────────────────────────────────
async function withRetry(label, fn, maxAttempts = 5) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fn()
      if (res && res.error) {
        lastErr = res.error
        const transient = /gateway|timeout|unavailable|503|502|504/i.test(res.error.message || '')
        if (!transient) return res
        const wait = 1000 * Math.pow(2, attempt - 1)
        console.log(`    ${label}: ${res.error.message} — retrying in ${wait / 1000}s (${attempt}/${maxAttempts})`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      const wait = 1000 * Math.pow(2, attempt - 1)
      console.log(`    ${label}: ${e.message} — retrying in ${wait / 1000}s (${attempt}/${maxAttempts})`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
  return { error: lastErr }
}

// ─── 1. Drop 5 retired buckets ────────────────────────────────────────────
const BUCKETS_TO_DROP = ['tune-files', 'library-files', 'tune-library', 'tunes', 'remap-files']

async function dropBucket(name) {
  console.log(`\n• ${name}`)
  if (DRY_RUN) {
    console.log('    would empty + delete bucket')
    return
  }
  // emptyBucket returns quickly but the server-side op may take minutes for
  // a 100-GB bucket. Supabase handles it async — repeat call until reports empty.
  const tStart = Date.now()
  const { error: emptyErr } = await withRetry(
    `empty ${name}`,
    () => supabase.storage.emptyBucket(name),
    3,  // empty itself has internal pagination, no need for many retries
  )
  if (emptyErr) {
    console.error(`    ✗ empty failed: ${emptyErr.message}`)
    return
  }
  console.log(`    ✓ emptied (${((Date.now() - tStart) / 1000).toFixed(1)}s)`)

  const { error: delErr } = await withRetry(
    `delete ${name}`,
    () => supabase.storage.deleteBucket(name),
  )
  if (delErr) {
    console.error(`    ✗ delete failed: ${delErr.message}`)
    return
  }
  console.log(`    ✓ bucket '${name}' deleted`)
}

// ─── 2. DRT orphan cleanup ────────────────────────────────────────────────
// Service role can read storage.objects directly via the REST API when we
// pass schema: 'storage'. Query DRT paths, then batch-remove.
async function cleanupDrtOrphans() {
  console.log('\n━ DRT orphan cleanup in definition-files ━'.padEnd(66, '━'))

  // Query all DRT paths in batches of 1000 (Supabase REST default page size)
  const allPaths = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .schema('storage')
      .from('objects')
      .select('name')
      .eq('bucket_id', 'definition-files')
      .ilike('name', '%.drt')
      .range(from, from + pageSize - 1)
    if (error) {
      console.error(`  query page ${from}: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    allPaths.push(...data.map(r => r.name))
    process.stdout.write(`\r  querying… ${allPaths.length} paths`)
    if (data.length < pageSize) break
    from += pageSize
  }
  console.log(`\n  ${allPaths.length} .drt files to remove`)
  if (allPaths.length === 0) return

  if (DRY_RUN) { console.log('  would remove ' + allPaths.length + ' files'); return }

  let removed = 0, failed = 0
  for (let i = 0; i < allPaths.length; i += 1000) {
    const batch = allPaths.slice(i, i + 1000)
    const { error } = await withRetry(
      `remove batch ${i}`,
      () => supabase.storage.from('definition-files').remove(batch),
    )
    if (error) { console.error(`\n  batch ${i}: ${error.message}`); failed += batch.length }
    else removed += batch.length
    process.stdout.write(`\r  removed ${removed}/${allPaths.length} (${failed} failed)`)
  }
  console.log()
}

// ─── 3. Recipes upload ────────────────────────────────────────────────────
async function uploadRecipes() {
  console.log('\n━ Uploading recipes → recipes bucket ━'.padEnd(66, '━'))
  try { await stat(RECIPES_DIR) }
  catch { console.error(`  ✗ ${RECIPES_DIR} not found`); return }

  // Walk local folder iteratively (no recursion — stack-safe)
  const files = []
  const queue = [{ dir: RECIPES_DIR, rel: '' }]
  while (queue.length > 0) {
    const { dir, rel } = queue.shift()
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) queue.push({ dir: full, rel: r })
      else if (e.isFile() && e.name.endsWith('.json')) files.push({ full, rel: r })
    }
  }
  console.log(`  ${files.length} recipe .json files found locally`)
  if (files.length === 0) return

  if (DRY_RUN) { console.log(`  would upload ${files.length} files`); return }

  let uploaded = 0, skipped = 0, failed = 0
  // Concurrency-limited upload — 8 parallel saves API load
  const CONCURRENT = 8
  let cursor = 0
  const workers = Array.from({ length: CONCURRENT }, async () => {
    while (cursor < files.length) {
      const idx = cursor++
      const { full, rel } = files[idx]
      const data = await readFile(full)
      const { error } = await withRetry(
        `upload ${rel}`,
        () => supabase.storage.from('recipes').upload(rel, data, {
          contentType: 'application/json',
          upsert: true,
        }),
        3,
      )
      if (error) {
        if (/already exists/i.test(error.message)) skipped++
        else { console.error(`\n  ✗ ${rel}: ${error.message}`); failed++ }
      } else uploaded++
      if ((uploaded + skipped + failed) % 25 === 0) {
        process.stdout.write(`\r  ${uploaded} up, ${skipped} skip, ${failed} fail / ${files.length}`)
      }
    }
  })
  await Promise.all(workers)
  console.log(`\n  uploaded ${uploaded}, skipped ${skipped}, failed ${failed}`)
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

  console.log('\n' + '━'.repeat(66))
  console.log(DRY_RUN ? 'DRY RUN complete.' : '✓ Done.')
})().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
