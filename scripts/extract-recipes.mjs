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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOTS = [
  'D:/DATABASE/Tuning_DB_BIN/Audi',
  'D:/DATABASE/Tuning_DB_BIN/VW',
  'D:/DATABASE/Tuning_DB_BIN/Seat',
  'D:/DATABASE/Tuning_DB_BIN/Skoda',
  'D:/DATABASE/Tuning_DB_BIN/BMW',
  'D:/DATABASE/Tuning_DB_BIN/Mercedes Benz',
  'D:/DATABASE/Tuning_DB_BIN/Ford',
  'D:/DATABASE/Tuning_DB_BIN/Opel',
  'D:/DATABASE/Tuning_DB_BIN/Volvo',
  'D:/DATABASE/Tuning_DB_BIN/Porsche',
  'D:/DATABASE/Tuning_DB_BIN/Mini',
  'D:/DATABASE/Tuning_DB_BIN/Land Rover',
  'D:/DATABASE/Tuning_DB_BIN/Jaguar',
  'D:/DATABASE/Tuning_DB_BIN/Peugeot',
  'D:/DATABASE/Tuning_DB_BIN/Renault',
  'D:/DATABASE/Tuning_DB_BIN/Citroen',
  'D:/DATABASE/Tuning_DB_BIN/Fiat',
  'D:/DATABASE/Tuning_DB_BIN/Alfa',
  'D:/DATABASE/Tuning_DB_BIN/Nissan',
  'D:/DATABASE/Tuning_DB_BIN/Toyota',
  'D:/DATABASE/Tuning_DB_BIN/Honda',
  'D:/DATABASE/Tuning_DB_BIN/Mazda',
  'D:/DATABASE/Tuning_DB_BIN/MAZDA',
  'D:/DATABASE/Tuning_DB_BIN/Hyundai',
  'D:/DATABASE/Tuning_DB_BIN/Kia',
  'D:/DATABASE/Tuning_DB_BIN/Mitsubishi',
  'D:/DATABASE/Tuning_DB_BIN/Subaru',
]
const OUT_ROOT = 'C:/temp/recipes';

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

// ───── Main: group files, find pairs, extract recipes ──────────────────────
// Group by (partNumber + swNumber) as the variant identifier
const groups = new Map(); // key → { originals: [], tunes: [{ path, stage }] }
let skippedSizeMismatch = 0;
for (const root of ROOTS) {
  let files;
  try { files = fs.readdirSync(root); } catch { continue; }
  for (const name of files) {
    const full = path.join(root, name);
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size < 100000) continue; // skip tiny files
  } catch { continue; }
  const info = parseFilename(name);
  if (!info.partNumber) continue; // need a part number to be useful
  const key = `${info.partNumber}__${info.swNumber || 'unknown'}`;
  let g = groups.get(key);
  if (!g) { g = { originals: [], tunes: [] }; groups.set(key, g); }
    if (info.stage === 0) g.originals.push(full);
    else g.tunes.push({ path: full, stage: info.stage });
  }
}

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
