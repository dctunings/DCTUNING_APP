// Recipe extractor: walks pair folders, groups ORI + Stage1/2 pairs, generates tune recipes.
// Output: C:/temp/recipes/<partNumber>/<variantId>_stage<N>.json
//
// Recipe format:
//   {
//     schemaVersion: 1,
//     sourcePartNumber: "03G906018DH",
//     sourceSwNumber: "SN100L8000000",
//     sourceOriFile: "..._BC52.ori",
//     sourceTunedFile: "..._8DE3_Stage1.bin",
//     sourceOriHash: "sha256:...",      ← used to verify match on new ORI files
//     sourceOriSize: 2097152,
//     stage: 1,
//     regions: [{ offset, size, bytesHex }, ...],  ← the actual tune delta
//     totalBytesChanged: 15625,
//     generatedAt: ISO-8601 timestamp
//   }

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// v3.12.1: walk ALL of Damo's pair sources recursively. Earlier version only hit
// one brand folder under Tuning_DB_BIN — missed D:/audi-package, DAMOS packs,
// ECU Dumps and EEPROMs, VW tuning collection, 2017.2019 archive, and the
// Desktop-side DATABASE copy. This covers every source documented in memory.
const ROOTS = [
  'D:/DATABASE/Tuning_DB_BIN',                                 // recurses into all 35 brand subfolders
  'D:/audi-package',                                           // Audi-focused pairs + DAMOS
  'D:/DAMOS 2020',                                             // older DAMOS packs with bundled pairs
  'D:/DAMOS-2021-2022',                                        // newer DAMOS packs (A2L + pairs)
  'D:/ECU Dumps and EEPROMs',                                  // scattered ECU dumps
  'D:/ECU maps',                                               // tuner-share pair collections
  'D:/Vw VOLKSWAGEN  ECU Map Tuning Files Stage 1 + Stage 2  Remap Files Collection TESTED',
  'D:/2017.2019',                                              // 2017-2019 pair archive
  'C:/Users/damoc/Desktop/DATABASE/Tuning_DB_BIN',             // Desktop copy (if present)
]
// Files under this size aren't ECU binaries worth recipe-ing (need at least 64KB
// for a meaningful tune). Also caps at 12 MB to skip .ols/.zip/.odx archives.
const MIN_SIZE = 64 * 1024
const MAX_SIZE = 12 * 1024 * 1024
// Skip these file extensions outright — not ECU binaries
const SKIP_EXT = new Set(['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar',
                           '.7z', '.odx', '.pdx', '.a2l', '.dll', '.exe', '.xml', '.json',
                           '.png', '.jpg', '.jpeg', '.gif', '.msi', '.lnk', '.ini', '.cfg'])
// Output straight into the app's resources folder — no intermediate staging.
// .gitignore keeps per-partnumber subdirs out of git (manifest.json is committed).
const OUT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', 'resources', 'recipes')

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

// Extract (partNumber, swNumber) identifier from filename. Returns null if cannot identify.
function parseFilename(name) {
  const base = path.basename(name);
  // Part number patterns (VW/Audi): 3 digits + 1 letter + 6 digits + 1-2 letters
  const partMatch = base.match(/(0[0-9][0-9A-Z][0-9]{6}[A-Z]{1,3})/);
  // SW number patterns: SN/SA/SM/SG + version + '000000'
  const swMatch = base.match(/(S[NAMG][0-9A-Z]{3}[0-9A-Z]{8})/);
  // Stage detection: .Stage1, .Stage1+++, .Stage2, _Stage1, _Stage1.bin
  let stage = 0;
  if (/(?:^|[\._])Stage\s?3/i.test(base)) stage = 3;
  else if (/(?:^|[\._])Stage\s?2/i.test(base)) stage = 2;
  else if (/(?:^|[\._])Stage\s?1/i.test(base)) stage = 1;
  else if (/(?:^|[\._])(Original|\.ori|_ori)/i.test(base) || base.toLowerCase().endsWith('.ori')) stage = 0;
  return {
    partNumber: partMatch ? partMatch[1] : null,
    swNumber: swMatch ? swMatch[1] : null,
    stage,
    base,
  };
}

// Cluster diff bytes into regions (gaps ≤8 bytes belong to same region)
function diffToRegions(ori, tuned) {
  const diffs = [];
  for (let i = 0; i < ori.length; i++) if (ori[i] !== tuned[i]) diffs.push(i);
  if (!diffs.length) return [];
  const regions = [];
  let s = diffs[0], e = diffs[0];
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i] - e <= 8) e = diffs[i];
    else { regions.push({ start: s, end: e }); s = e = diffs[i]; }
  }
  regions.push({ start: s, end: e });
  return regions;
}

function buildRecipe(oriPath, tunedPath, stage) {
  const ori = fs.readFileSync(oriPath);
  const tuned = fs.readFileSync(tunedPath);
  if (ori.length !== tuned.length) {
    skippedSizeMismatch++;
    return null;
  }
  const regions = diffToRegions(ori, tuned);
  const totalBytesChanged = regions.reduce((s, r) => s + (r.end - r.start + 1), 0);
  const oriInfo = parseFilename(oriPath);
  const tunedInfo = parseFilename(tunedPath);

  const recipe = {
    schemaVersion: 1,
    sourcePartNumber: oriInfo.partNumber || tunedInfo.partNumber,
    sourceSwNumber: oriInfo.swNumber || tunedInfo.swNumber,
    sourceOriFile: path.basename(oriPath),
    sourceTunedFile: path.basename(tunedPath),
    sourceOriHash: sha256File(oriPath),
    sourceOriSize: ori.length,
    stage,
    regions: regions.map(r => ({
      offset: r.start,
      size: r.end - r.start + 1,
      bytesHex: tuned.slice(r.start, r.end + 1).toString('hex'),
    })),
    totalBytesChanged,
    generatedAt: new Date().toISOString(),
  };
  return recipe;
}

// ───── RECURSIVE walker — visits every file under every ROOT ─────────────
// Previous version was non-recursive so it missed pairs nested in subfolders.
// D:/audi-package and the DAMOS packs have pairs 3-5 levels deep.
let filesVisited = 0, filesSkipped = 0
function walk(dir, callback, depth = 0) {
  if (depth > 10) return // sanity cap against symlink loops
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    // Skip system/junk folders
    if (entry.name === 'System Volume Information' || entry.name.startsWith('$')
        || entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) {
        walk(full, callback, depth + 1)
      } else if (entry.isFile()) {
        filesVisited++
        callback(full, entry.name)
      }
    } catch { filesSkipped++ }
  }
}

// ───── Main: walk all roots, group files, find pairs, extract recipes ────
// Group by (partNumber + swNumber) as the variant identifier
const groups = new Map() // key → { originals: [], tunes: [{ path, stage }] }
let skippedSizeMismatch = 0

for (const root of ROOTS) {
  if (!fs.existsSync(root)) {
    console.log(`  ⚠ skipping (not found): ${root}`)
    continue
  }
  console.log(`  → scanning ${root} ...`)
  walk(root, (full, name) => {
    // Fast-path filter: skip by extension before stat
    const ext = path.extname(name).toLowerCase()
    if (SKIP_EXT.has(ext)) return
    let size
    try { size = fs.statSync(full).size } catch { return }
    if (size < MIN_SIZE || size > MAX_SIZE) return
    const info = parseFilename(name)
    if (!info.partNumber) return
    const key = `${info.partNumber}__${info.swNumber || 'unknown'}`
    let g = groups.get(key)
    if (!g) { g = { originals: [], tunes: [] }; groups.set(key, g) }
    if (info.stage === 0) g.originals.push(full)
    else g.tunes.push({ path: full, stage: info.stage })
  })
}
console.log(`\nTotal files visited: ${filesVisited}, variant groups formed: ${groups.size}`)

let pairsFound = 0, recipesWritten = 0;
for (const [key, g] of groups) {
  if (g.originals.length === 0 || g.tunes.length === 0) continue;
  // Pick the first original as reference (they should all be identical variants anyway)
  const oriPath = g.originals[0];
  for (const t of g.tunes) {
    pairsFound++;
    const recipe = buildRecipe(oriPath, t.path, t.stage);
    if (!recipe) continue;
    if (recipe.regions.length === 0) continue; // identical files, not a real pair

    const partDir = path.join(OUT_ROOT, recipe.sourcePartNumber);
    fs.mkdirSync(partDir, { recursive: true });
    const variantId = `${recipe.sourceSwNumber}_stage${recipe.stage}`;
    const outPath = path.join(partDir, `${variantId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(recipe, null, 2));
    recipesWritten++;
    if (recipesWritten <= 5) {
      console.log(`  ✓ ${recipe.sourcePartNumber} ${recipe.sourceSwNumber} Stage${recipe.stage} — ${recipe.regions.length} regions, ${recipe.totalBytesChanged}B changed`);
    }
  }
}
console.log(`\nDone. Pairs found: ${pairsFound}, recipes written: ${recipesWritten}, skipped (size mismatch): ${skippedSizeMismatch}`);
console.log(`Output: ${OUT_ROOT}`);

// Build manifest — small index file that maps ORI hash / (partNumber+sw) → recipe path
const manifest = [];
function walkRecipes(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkRecipes(full);
    else if (name.endsWith('.json') && name !== 'manifest.json') {
      try {
        const recipe = JSON.parse(fs.readFileSync(full, 'utf8'));
        manifest.push({
          partNumber: recipe.sourcePartNumber,
          swNumber: recipe.sourceSwNumber,
          stage: recipe.stage,
          oriHash: recipe.sourceOriHash,
          oriSize: recipe.sourceOriSize,
          regions: recipe.regions.length,
          totalBytesChanged: recipe.totalBytesChanged,
          path: path.relative(OUT_ROOT, full).replace(/\\/g, '/'),
          sourceTunedFile: recipe.sourceTunedFile,
        });
      } catch {}
    }
  }
}
walkRecipes(OUT_ROOT);
fs.writeFileSync(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${manifest.length} recipes, ${(JSON.stringify(manifest).length / 1024).toFixed(1)} KB`);
