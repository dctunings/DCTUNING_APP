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

// v3.12.1+v3.14.1+v3.14.3: all of Damo's pair sources + the Damos-Big-Archive
// + new Desktop/Damos + Desktop/ECU FILES TEST (added Apr 25 2026).
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
  'C:/Users/damoc/Desktop/Damos-Big-Archive',                  // v3.14.1 — added Apr 24 2026
  'D:/dctuning-scan/damos_rar_extract',                        // extracted contents of 2,305 RAR archives
  'C:/Users/damoc/Desktop/Damos',                              // v3.14.3 — multi-brand DAMOS; VAG subfolders only via VAG_PREFIX guard below
  'C:/Users/damoc/Desktop/ECU FILES TEST',                     // v3.14.3 — Damo's curated reference set (DCTuning_Stage1 pairs)
  'D:/dctuning-scan/new_vag_extract/from_hex_s19',             // v3.14.3 — converted HEX→BIN from new DAMOS folder
  'D:/dctuning-scan/new_vag_extract/from_archives',            // v3.14.3 — extracted ZIPs (mostly .dat reference data, will be ext-skipped)
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
// v3.14.3: extended to recognize Bosch part numbers (0261207939) and Siemens part
// numbers (5WS40060I-T) as fallbacks when no VW part-number is present, plus
// decimal SW numbers (363573, 389289) when no SN/SA/SM/SG-prefixed code appears.
// This unlocks pairing for files like "Audi A4 1.8T ME7.5 0261207939 363573 ORI_n.bin"
// + "..._DCTuning_Stage1.bin" which lack canonical VW identifiers.
const FALSE_DEC_SW = new Set(['100000', '200000', '300000', '400000', '500000', '600000',
                               '700000', '800000', '900000', '1000000', '2000000', '4000000']);
function parseFilename(name) {
  const base = path.basename(name);
  // Part number priority: VW/Audi → Bosch → Siemens
  const vwMatch     = base.match(/(0[0-9][0-9A-Z][0-9]{6}[A-Z]{1,3})/);
  const boschMatch  = base.match(/(02[6-8]\d{7})/);
  const siemensMatch= base.match(/(5WS\d{5}[A-Z]?-?[A-Z]?)/);
  const partNumber  = vwMatch?.[1] || boschMatch?.[1] || siemensMatch?.[1] || null;
  // SW number priority: SN/SA/SM/SG-prefixed → decimal 6-7 digit (excluding round-number false positives)
  const snMatch = base.match(/(S[NAMG][0-9A-Z]{3}[0-9A-Z]{8})/);
  let swNumber = snMatch?.[1] || null;
  if (!swNumber) {
    const decMatches = [...base.matchAll(/\b(\d{6,7})\b/g)].map(m => m[1])
                          .filter(d => !FALSE_DEC_SW.has(d) && !/^0(0|1)/.test(d))  // skip round-number ECU sizes + leading-zero false hits
                          .sort((a, b) => b.length - a.length);
    swNumber = decMatches[0] || null;
  }
  // Stage detection — extended with DCTuning_Stage1 / _ori_DCTuning / _ORI_n suffix patterns
  // and " MOD." / "_MOD" / WINOLS .MOD-extension patterns (regression-test caught
  // these were being mis-classified as ORI in v3.14.2 and earlier).
  let stage = 0;
  if (/(?:^|[\._])Stage\s?3/i.test(base)) stage = 3;
  else if (/(?:^|[\._])Stage\s?2/i.test(base)) stage = 2;
  else if (/(?:^|[\._\s])Stage\s?1|DCTuning[_-]Stage1|\bstg1\b|(?:[\s_])MOD(?:[\.\s_]|$)|\.MOD$/i.test(base)) stage = 1;
  else if (/(?:^|[\._\s])(Original|\.ori|_ori|_ORI_n|ORI_n)/i.test(base) || base.toLowerCase().endsWith('.ori')) stage = 0;
  return { partNumber, swNumber, stage, base };
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
