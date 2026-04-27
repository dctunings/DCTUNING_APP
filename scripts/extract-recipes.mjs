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

// v3.12.1+v3.14.1+v3.14.3+v3.16.0: all of Damo's pair sources.
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
  // v3.16.0 (Apr 26 2026) — discovered via folder audit; these were never
  // scanned despite living right next to the other configured roots.
  // Together they account for almost all of Damo's modern Golf 7 / GTI / R /
  // Audi A3 8V era content (5G0906*, 8V0906*, 06K906*, 04E906*).
  'D:/last tuner files',                                        // 16,345 files — modern Golf 7 / Simos18 / GTI heaven
  'D:/tuning files',                                            //    830 files — assorted pair archives
  'D:/remap DVD3',                                              //     13 files — small but VAG content
]
// Files under this size aren't ECU binaries worth recipe-ing (need at least 64KB
// for a meaningful tune). Also caps at 12 MB to skip .ols/.zip/.odx archives.
const MIN_SIZE = 64 * 1024
const MAX_SIZE = 12 * 1024 * 1024
// Skip these file extensions outright — not raw ECU binaries.
// .frf = Flash Robot File (wrapped binary with header — VAG OEM format).
// .ols = WinOLS project file (proprietary container, not raw bytes).
// .set = WinOLS metadata (companion file). .dlcnt = download counter.
const SKIP_EXT = new Set(['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar',
                           '.7z', '.odx', '.pdx', '.a2l', '.dll', '.exe', '.xml', '.json',
                           '.png', '.jpg', '.jpeg', '.gif', '.msi', '.lnk', '.ini', '.cfg',
                           '.frf', '.ols', '.set', '.dlcnt'])
// Output straight into the app's resources folder — no intermediate staging.
// .gitignore keeps per-partnumber subdirs out of git (manifest.json is committed).
const OUT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', 'resources', 'recipes')

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

// v3.16: Extract (partNumber, swNumber) from BINARY CONTENT. VAG ECUs store
// the part number + SW number as ASCII text in the calibration region —
// usually within the first 1 MB of the firmware image. We do a fast string
// scan and pick the most frequent / longest match.
//
// This catches files that filename parsing misses entirely:
//   • License-plate-named:    "EW732YX.ORI", "245cv-opf-t756.ori"
//   • Hash-named:             "2df66a6193eeaa950ea255d59b52997a.tun-...mod"
//   • Tuner-internal:         "JOB12345.bin", "Step2_Dpf_Off.Bc"
//   • Folder-context only:    "OBD UDS_5G0906259.bin" inside a Golf 7 folder
//
// Scan up to 3 MB of the binary. The 1 MB cap missed Simos18 (cal region at
// 2 MB), but scanning the entire 4 MB binary is wasteful when the metadata
// strings are clustered around the 2 MB mark. 3 MB covers Simos18 with a
// margin and keeps per-file cost down — important when ~30K files need
// content scanning across the whole archive.
const SCAN_LIMIT = 3 * 1024 * 1024;

// SHAPE-FIRST priority order. The previous frequency-only ranking was getting
// fooled by garbage like "SPNLLMLKKLLMM" (all-letter repeat pattern, 7
// occurrences) beating the real "SC800F9000000" (3 occurrences). We now
// classify candidates by SHAPE first — anything that looks like a real VAG
// chassis-coded part number wins over generic legacy regex matches like
// "000000111SC".
//
// Priority for part numbers (highest → lowest):
//   1. Modern chassis with explicit 906 (5G0906259, 8V0906259B, …)
//   2. Legacy with explicit 906 (03G906018DH, 04L906021M, …)
//   3. Bosch (0261207939)
//   4. Siemens (5WS40060I-T)
//   5. Generic legacy regex match (last resort — most prone to coincidences)
//
// For SW numbers we require ≥1 digit because all-letter strings of the right
// shape are repeating patterns, not real software identifiers.
function classifyPart(v) {
  if (/^[1-9][A-Z0-9][0-9]906\d{3}/.test(v)) return 1   // modern chassis 906
  if (/^0[0-9][0-9A-Z][0-9]906\d{3}/.test(v)) return 2  // legacy 906
  if (/^02[6-8]\d{7}$/.test(v)) return 3                // Bosch
  if (/^5WS\d{5}/.test(v)) return 4                     // Siemens
  return 5                                              // generic legacy
}

function extractPartNumberFromBinary(buf) {
  const slice = buf.length > SCAN_LIMIT ? buf.subarray(0, SCAN_LIMIT) : buf;
  // Treat as Latin-1 — every byte is one character, ASCII range gives us the
  // identifier characters cleanly.
  const text = slice.toString('latin1');

  // Tally all candidates, regardless of shape.
  const candidates = new Map();
  const tally = (re) => {
    for (const m of text.matchAll(re)) {
      const v = m[1];
      candidates.set(v, (candidates.get(v) || 0) + 1);
    }
  };
  tally(/(0[0-9][0-9A-Z][0-9]{6}[A-Z]{1,3})/g);   // legacy VAG
  tally(/([1-9][A-Z0-9][0-9]906\d{3}[A-Z]{0,3})/g); // modern chassis VAG
  tally(/(02[6-8]\d{7})/g);                          // Bosch
  tally(/(5WS\d{5}[A-Z]?-?[A-Z]?)/g);                // Siemens

  let partNumber = null;
  if (candidates.size > 0) {
    // Sort: shape priority ASC (lower = better), then frequency DESC, then length DESC.
    // Single-occurrence still allowed for class 1-4 (906/Bosch/Siemens shapes are
    // hard to fake). Class 5 (generic legacy) requires ≥2 occurrences to weed out
    // regex coincidences.
    const sorted = [...candidates.entries()]
      .filter(([v, count]) => {
        const cls = classifyPart(v);
        if (cls <= 4) return true             // shape-rescued
        return count >= 2                     // generic class needs corroboration
      })
      .sort((a, b) => {
        const cA = classifyPart(a[0]);
        const cB = classifyPart(b[0]);
        if (cA !== cB) return cA - cB
        if (a[1] !== b[1]) return b[1] - a[1]
        return b[0].length - a[0].length
      });
    if (sorted.length > 0) partNumber = sorted[0][0];
  }

  // SW number — require ≥1 digit. Real VAG SWs (SC800F9000000, SN100L8000000,
  // SA300O1000000, etc.) always mix letters AND digits. All-letter matches like
  // "SPNLLMLKKLLMM" are repeating-character patterns inside the firmware that
  // happen to fit the regex shape but aren't real software identifiers.
  const swCandidates = new Map();
  for (const m of text.matchAll(/(S[A-Z][0-9A-Z]{3}[0-9A-Z]{8})/g)) {
    if (!/\d/.test(m[1])) continue            // skip all-letter garbage
    swCandidates.set(m[1], (swCandidates.get(m[1]) || 0) + 1);
  }
  let swNumber = null;
  if (swCandidates.size > 0) {
    // Prefer ≥2 occurrences when available (corroborated). Otherwise fall back
    // to single occurrence with digit (shape-rescued). Frequency tie-break.
    const corroborated = [...swCandidates.entries()].filter(([_, count]) => count >= 2)
    const pool = corroborated.length > 0 ? corroborated : [...swCandidates.entries()]
    pool.sort((a, b) => b[1] - a[1]);
    swNumber = pool[0][0];
  }
  return { partNumber, swNumber };
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
  // Part number priority: VW/Audi (legacy) → VW/Audi (modern chassis) → Bosch → Siemens.
  //
  // VW/Audi part numbers come in two formats:
  //   Legacy (engine ECU, "06K906026A"): starts with 0X then [0-9A-Z], 6 digits, 1-3 letters
  //   Modern chassis ("5G0906259H", "8V0906259B", "4F0906560CL"): platform code XXX
  //                  followed by '906' (engine ECU class) + 3 digits + 0-3 letters.
  //   Modern catches: 5G0/5G6 (Golf 7), 5K0 (Golf 6), 5N0 (Tiguan), 5Q0 (Golf 7 wagon),
  //                   8V0/8V (Audi A3 8V), 8R0 (Q5 8R), 4F/4G/4H/4M (Audi A6/A7/A8/Q7),
  //                   7L0/7P0 (Touareg), 7N0/7P0 (Sharan), 1Z0 (Octavia), 6R0 (Polo 6R)
  //                   etc. Generic match: any [1-9][A-Z0-9][0-9] prefix + 906 + 3 digits.
  const vwLegacy    = base.match(/(0[0-9][0-9A-Z][0-9]{6}[A-Z]{1,3})/);
  const vwModern    = base.match(/([1-9][A-Z0-9][0-9]906\d{3}[A-Z]{0,3})/);
  const boschMatch  = base.match(/(02[6-8]\d{7})/);
  const siemensMatch= base.match(/(5WS\d{5}[A-Z]?-?[A-Z]?)/);
  // 5WS Siemens override beats vwModern when both could match (5WS doesn't have 906)
  const partNumber  = vwLegacy?.[1] || vwModern?.[1] || boschMatch?.[1] || siemensMatch?.[1] || null;
  // SW number priority: S<letter>-prefixed → decimal 6-7 digit (excluding round-number false positives).
  // v3.16 broadened S[NAMG] → S[A-Z] to catch SC800* (Simos18 Golf 7 / GTI / R)
  // and other modern series. Length stays the same — 13 chars total.
  const snMatch = base.match(/(S[A-Z][0-9A-Z]{3}[0-9A-Z]{8})/);
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
  // Stage detection — broadened in v3.16 for modern tuner conventions:
  //   - "step1" / "_step1" / " step 1" — B&C Consulting / IE-style tuners
  //   - "stg1" / "stg2" / "stg3"        — short form, multiple tuners
  //   - "(Stage1)" with anchors ignored — bracket-wrapped stage
  //   - WinOLS .MOD extension           — historical, kept
  //   - "_OEM" / "OEM"                  — Original marker for newer tuner files
  let stage = 0;
  if (/(?:^|[\._\s\(])Stage\s?3|(?:^|[\._\s])(?:stg|step)\s?3/i.test(base)) stage = 3;
  else if (/(?:^|[\._\s\(])Stage\s?2|(?:^|[\._\s])(?:stg|step)\s?2/i.test(base)) stage = 2;
  else if (/(?:^|[\._\s\(])Stage\s?1|DCTuning[_-]Stage1|(?:^|[\._\s])(?:stg|step)\s?1|(?:[\s_])MOD(?:[\.\s_]|$)|\.MOD$/i.test(base)) stage = 1;
  else if (/(?:^|[\._\s])(Original|\.ori|_ori|_ORI_n|ORI_n|_OEM|\bOEM\b)/i.test(base) || base.toLowerCase().endsWith('.ori')) stage = 0;
  return { partNumber, swNumber, stage, base };
}

// ─── VAG-only + 2008+ filter (Damo's request) ────────────────────────────
// Damo wants the Recipe Library scoped to:
//   • Volkswagen Group makes only — VW, Audi, Seat, Skoda, Porsche
//     (no BMW/Mercedes/Peugeot/Renault/Ford/Opel/Volvo/etc.)
//   • Vehicle year ≥2008, EXCEPT the Mk4 Golf (1J0 chassis, 1997-2003) which
//     stays in for the legacy enthusiasts.
//
// We classify each candidate part number into ONE of:
//   ALLOW  — VAG, post-2008 (or Golf 4)
//   REJECT — VAG, pre-2008 chassis (drop)
//   DROP   — non-VAG (BMW, Mercedes, etc.) → drop
//   AMBIGUOUS — Bosch/Siemens — accept only if file is under a VAG context
//               folder (Audi, VW, Seat, Skoda, Porsche, audi-package, …)

// Modern VAG chassis prefixes (XXX906…) — 2008+ era. KEEP.
const POST2008_CHASSIS = new Set([
  '5G0','5G1','5G5','5G6',                  // Golf 7 (2012+)
  '5K0','5K1',                              // Golf 6 (2008-2012)
  '5T0','5T1',                              // Touran II (2015+)
  '5N0','5N1','5N5','5NA',                  // Tiguan I/II (2007+; we accept the late tail)
  '5C0','5C1',                              // Beetle 5C (2011+)
  '5Q0','5Q1','5QF',                        // Golf SW MQB / Tiguan MQB
  '5E0','5E1','5E5',                        // Skoda Octavia 3 (2013+)
  '5F0','5F1',                              // Seat Leon 5F (2012+)
  '5FA','5FB',                              // Seat
  '5JB','5J0','5J1',                        // Skoda Fabia / Roomster
  '5L0','5L1',                              // Skoda Roomster late
  '5J6','5J7',                              // Skoda Fabia II
  '5W0','5W1',                              // Skoda Karoq (2017+)
  '6R0','6R1','6RA','6R5',                  // Polo 6R (2009+)
  '6C0','6C1',                              // Polo 6C (2014+)
  '6F0','6F1',                              // Polo 6F (2017+)
  '7N0','7N1','7N5',                        // Sharan II (2010+)
  '7P0','7P5','7P6',                        // Touareg II (2010+)
  '7C0','7C1',                              // Crafter II
  '3C0','3C1','3C5',                        // Passat B6/B7 (2005+)
  '3D0',                                    // Phaeton late (we keep the partial overlap)
  '3Q0','3Q1','3Q5',                        // Passat B8 (2014+)
  '3G0','3G1','3G5',                        // Passat B8 facelift / Arteon
  '3CN','3G8','3GO',                        // newer Passat / Arteon
  '5NN','5N7',                              // Tiguan facelift
  '561','565','567',                        // Various
  '8K0','8K1','8K5','8K9',                  // Audi A4 B8 (2008+)
  '8R0','8R1','8R5',                        // Audi Q5 8R (2008+)
  '8X0','8X1','8X4','8XA',                  // Audi A1 8X (2010+)
  '8U0','8U1','8U5',                        // Audi Q3 8U (2011+)
  '8P0','8P1','8PA',                        // Audi A3 8P (2003-2013) — keep, post-Golf-4 era
  '8T0','8T1','8T3','8TA','8T5',            // Audi A5 8T (2007-2017) — keep
  '8V0','8V1','8VA','8V5','8V7',            // Audi A3 8V (2012+)
  '8W0','8W1','8W2','8W5','8W6',            // Audi A4 B9 (2016+)
  '8S0','8S1',                              // Audi TT MK3 (2014+)
  '8Y0','8Y1',                              // Audi A3 8Y (2020+)
  '4F0','4F2','4F5',                        // Audi A6 C6 (2004+) — keep
  '4G0','4G1','4G5','4G8','4GA',            // Audi A6 C7 (2011+)
  '4M0','4M1','4M5','4MA',                  // Audi Q7 4M (2015+)
  '4H0','4H1','4HA','4HE','4HF',            // Audi A8 4H (2010+)
  '4S0','4S1',                              // Audi R8 (2014+)
  '4N0','4N1',                              // Audi A8 D5 (2017+)
  '4K0','4K1','4KE','4KF','4KH',            // Audi A6 C8 (2018+)
  '4L0','4L1','4LB',                        // Audi Q7 4L (2006-2015) — partial keep
  'F4A','FYA','FYB',                        // newer
  '420','422','427','423',                  // Audi R8 / TT
  '8KH','83A','83B',                        // newer Audi
  '9A1','9PA','9PB','958','970','971','991','992',  // Porsche post-2008 chassis
  '95B',                                    // Porsche Macan
  '8J0','8J1','8J3','8J9',                  // Audi TT 8J (2006-2014) — keep
  '7L8',                                    // Touareg I late (2007+)
])

// Mk4 Golf chassis — 1997-2003. Damo's exception, keep these.
const GOLF4_CHASSIS = new Set(['1J0','1J1','1J2','1J3','1J5','1J6','1J7'])

// Pre-2008 VAG chassis to REJECT.
const PRE2008_CHASSIS = new Set([
  '8D0','8D1','8D2','8D3','8D5','8D9',      // Audi A4 B5 (1995-2001)
  '4B0','4B2','4B3','4B5','4B9',            // Audi A6 C5 (1997-2004)
  '4D0','4D1','4D2','4D5',                  // Audi A8 D2 (1994-2002)
  '4E0','4E1','4E2',                        // Audi A8 D3 (2002-2010, mostly pre-2008)
  '8L0','8L1','8L9',                        // Audi A3 8L (1996-2003)
  '8N0','8N1','8N3','8N7','8N8','8N9',      // Audi TT 8N (1998-2006)
  '8E0','8E1','8E2','8E5','8E9','8EC',      // Audi A4 B6/B7 (2001-2008)
  '8H0','8H1','8H2','8H5','8H7','8H9',      // Audi A4 B6 Cabrio
  '8Z0','8Z1','8Z9',                        // Audi A2 8Z (2000-2005)
  '443','447','4A0','4A2',                  // older Audi 100/A6 C4/C3
  '893','8A0','8B0','8C0','8C5',            // Audi 80/90 B3/B4
  '1H0','1H1','1H2','1H5','1H6','1H9',      // Golf 3 (1991-1997)
  '6N0','6N1','6N2','6N3','6N9',            // Polo 6N (1994-2002)
  '9N0','9N1','9N2','9N3','9N9',            // Polo 9N (2002-2009) — early pre-2008
  '3B0','3B1','3B2','3B3','3B5','3B6','3B9','3BG', // Passat B5 (1996-2005)
  '3A0','3A1','3A2','3A5','3A9',            // Passat B4
  '3Y0','3Y9',                              // older Passat
  '7M0','7M1','7M2','7M3','7M9',            // Sharan I (1995-2010, mostly pre-2008)
  '6E0','6E1','6E2','6E3','6E9',            // Lupo (1998-2005)
  '6X0','6X1','6X9',                        // Lupo / Arosa
  '1L0','1L1','1L2','1L9',                  // Vento
  '1E0','1E1','1E9','1F0','1F1',            // Caddy / older
  '2E0','2E1','2E9',                        // Caddy
  '1K0','1K1','1K2','1K5','1K9','1KE',      // Golf 5 (2003-2008) — borderline; keep MOST
  // Hmm, 1K0 Golf 5 is 2003-2008. Damo said "under 2008" so 2003-2007 is out.
  // But Mk5 GTI is iconic and most files in this codebase. Let me KEEP it.
  // (Removing 1K0 from this list — see MIXED_CHASSIS below)
])
// Remove Golf 5 from PRE2008 — keep as borderline (still very much in use).
for (const k of ['1K0','1K1','1K2','1K5','1K9','1KE']) PRE2008_CHASSIS.delete(k)
// Add Golf 5 to allowed
for (const k of ['1K0','1K1','1K2','1K5','1K9','1KE']) POST2008_CHASSIS.add(k)

// Pre-2008 engine ECU families to REJECT — these only appear on cars made
// before the Golf 4 era (1997+) or are exclusively early-era engines that
// Damo's spec rules out:
//   037 = Mk2/Mk3 era (1.6/1.8/2.0 8V/16V) — 1985-1997
//   028 = TDI 1.9 SDI / 1.9 PD early — 1991-2002 (Golf 3 / Passat B5 era)
//   036 = Polo / Lupo 1.4/1.6 16V — 1995-2002
//   047 = 1.4 TDI / 1.7 SDI 3-cyl very early — pre-2002
const PRE2008_ENGINE_FAMILIES = new Set(['037', '028', '036', '047'])

// Brand subfolders that we recognize as non-VAG. Used to drop Bosch/Siemens
// AMBIGUOUS parts that live under non-VAG brand directories.
const NONVAG_BRAND_FOLDERS = new Set([
  'bmw','mercedes benz','mercedes','peugeot','renault','citroen','ford','opel',
  'volvo','alfa','fiat','kia','hyundai','honda','toyota','nissan','mazda',
  'mitsubishi','land rover','jaguar','mini','lancia','dacia','jeep','iveco',
  'scania','suzuki','smart','daewoo','isuzu','ferrari','kawasaki',
])

// VAG brand folder hints — anything under these is VAG context.
const VAG_BRAND_FOLDERS = new Set([
  'vw','volkswagen','audi','seat','skoda','porsche','audi-package',
])

// Extract chassis prefix from a part number. Returns the leading 3 chars
// only when the part is a modern chassis-coded number (XXX906…). Otherwise
// returns null and the caller decides.
function chassisPrefix(pn) {
  if (!pn) return null
  if (/^[1-9A-Z][A-Z0-9][0-9]906\d{3}/.test(pn)) return pn.slice(0, 3).toUpperCase()
  return null
}

// Classify a part number for the VAG/year filter.
// Returns one of: 'ALLOW' | 'REJECT' | 'AMBIGUOUS' | 'DROP'
function classifyForFilter(pn) {
  if (!pn) return 'DROP'
  const p = pn.toUpperCase()

  // Chassis-coded VAG (modern)
  const cp = chassisPrefix(p)
  if (cp) {
    if (POST2008_CHASSIS.has(cp)) return 'ALLOW'
    if (GOLF4_CHASSIS.has(cp)) return 'ALLOW'
    if (PRE2008_CHASSIS.has(cp)) return 'REJECT'
    // Unknown chassis prefix with 906 marker — most likely VAG, keep as ALLOW
    // so we don't lose new chassis we haven't enumerated yet.
    return 'ALLOW'
  }

  // Legacy VAG engine ECU (0XX906xxx). The 3-char prefix identifies the engine
  // family. Reject explicitly pre-Golf-4 families (037/028/036/047).
  if (/^0[0-9][0-9A-Z]906\d{3}[A-Z]{0,3}$/.test(p)) {
    const engineFamily = p.slice(0, 3)
    if (PRE2008_ENGINE_FAMILIES.has(engineFamily)) return 'REJECT'
    return 'ALLOW'
  }

  // Bosch / Siemens generic — used by many makes. Defer to folder context.
  if (/^02[6-8]\d{7}$/.test(p)) return 'AMBIGUOUS'
  if (/^5WS\d{5}/.test(p)) return 'AMBIGUOUS'

  // Generic legacy regex match (0XX[A-Z0-9][0-9]{6}[A-Z]{1,3}). These are
  // uncertain — could be VAG or other. Defer to folder context.
  return 'AMBIGUOUS'
}

// Walk a path's ancestry and decide if it sits under a VAG context folder
// or under a non-VAG brand folder. Returns 'VAG' | 'NONVAG' | 'UNKNOWN'.
//
// Two passes per ancestor:
//   exact-match check against VAG_BRAND_FOLDERS / NONVAG_BRAND_FOLDERS, then
//   substring keyword check ("VOLKSWAGEN", "Vw", "Audi", brand words inside
//   long descriptive folder names like "Vw VOLKSWAGEN ECU Map Tuning Files").
const VAG_KEYWORDS = ['volkswagen', 'audi', ' vw', 'vw ', 'seat ', 'skoda',
                       'porsche', 'audi-package', 'golf', 'passat', 'polo',
                       'tiguan', 'touareg', 'octavia', 'fabia', 'leon',
                       'ibiza', 'cayenne', 'macan', 'panamera', 'a3 ', 'a4 ',
                       'a6 ', 'a8 ', 'q3 ', 'q5 ', 'q7 ', 's3 ', 'rs3', 'rs4',
                       'rs6', 'gti', 'tdi', 'tfsi', 'tsi', 'simos', 'edc17']
const NONVAG_KEYWORDS = ['bmw ', ' bmw', 'mercedes', 'peugeot', 'renault',
                          'citroen', 'ford ', ' ford', 'opel', 'volvo', 'alfa',
                          'fiat ', 'kia ', 'hyundai', 'honda', 'toyota',
                          'nissan', 'mazda', 'mitsubishi', 'land rover',
                          'jaguar', 'mini ', 'lancia', 'dacia', 'jeep',
                          'iveco', 'scania', 'suzuki', 'smart ', 'daewoo',
                          'isuzu', 'ferrari']
function folderBrandContext(filePath) {
  let dir = path.dirname(filePath)
  for (let i = 0; i < 8; i++) {
    const base = path.basename(dir)
    const lower = base.toLowerCase()
    // Exact match against the canonical brand-folder Sets (Tuning_DB_BIN
    // subdirs sit here unambiguously).
    if (VAG_BRAND_FOLDERS.has(lower)) return 'VAG'
    if (NONVAG_BRAND_FOLDERS.has(lower)) return 'NONVAG'
    // Substring match for descriptive folder names.
    // Surround with spaces so "vw " pattern doesn't trigger on "vwgolf" etc.
    const padded = ` ${lower} `
    for (const kw of VAG_KEYWORDS) if (padded.includes(kw)) return 'VAG'
    for (const kw of NONVAG_KEYWORDS) if (padded.includes(kw)) return 'NONVAG'
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return 'UNKNOWN'
}

// Sanity filter — drop part numbers that aren't real ECU identifiers.
// Damo screenshotted entries like `000000000PMS` and `000000111S` (immobilizer
// CAS modules from `5WP44xxx_CAS3A035` folders) — the binary scanner picks
// these up by accident from repeating-zero memory regions. They aren't
// engine-ECU recipes and pollute the catalog.
function isGarbagePartNumber(pn) {
  if (!pn) return true
  const p = pn.toUpperCase()
  if (/^0{4,}/.test(p)) return true             // starts with ≥4 zeros (placeholder)
  if (/^[A-Z]{4,}/.test(p)) return true         // all-letter prefix (sequential garbage)
  // Generic legacy regex match WITHOUT the 906 engine marker is suspicious —
  // real VAG legacy parts always have 906 (or are Bosch/Siemens). Drop.
  if (/^0[0-9][0-9A-Z][0-9]/.test(p) && !/906/.test(p) && !/^02[6-8]\d{7}$/.test(p)) {
    return true
  }
  return false
}

// Combined gate. Returns true if the file should be included in the manifest.
function shouldInclude(partNumber, filePath) {
  if (isGarbagePartNumber(partNumber)) return false
  const cls = classifyForFilter(partNumber)
  if (cls === 'ALLOW') return true
  if (cls === 'REJECT') return false
  if (cls === 'DROP') return false
  // AMBIGUOUS — check folder context
  const ctx = folderBrandContext(filePath)
  if (ctx === 'VAG') return true
  if (ctx === 'NONVAG') return false
  // UNKNOWN context — be conservative and DROP.
  return false
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

// Set of ROOT folder names — sourceFolder must NOT be one of these. Built
// from the configured ROOTS so adding a new root automatically updates the
// blacklist. We also include a few generic "container" names that appear as
// intermediate folders without vehicle info.
const ROOT_BASENAMES = new Set([
  ...ROOTS.map(r => path.basename(r).toLowerCase()),
  // Brand directories under Tuning_DB_BIN — these alone aren't vehicle hints.
  // We allow them as a fallback (better than empty) but prefer deeper folders.
])
const GENERIC_BASENAMES = new Set(['mod', 'tuning_db_bin', 'damos', 'damos_rar_extract',
                                    'new_vag_extract', 'from_hex_s19', 'from_archives',
                                    'ecu maps', 'ecu dumps and eeproms'])

// Pick the most informative folder name from the file path. Walks up the
// path looking for a directory whose basename is NOT a ROOT and NOT a known
// generic container. Returns "" if nothing useful found (UI hides the field).
function pickSourceFolder(tunedPath, oriPath) {
  const candidates = []
  for (const p of [tunedPath, oriPath]) {
    if (!p) continue
    let dir = path.dirname(p)
    // Walk up to 5 levels — the descriptive folder is usually the immediate
    // parent or one level up (e.g. /d/last tuner files/Golf 7/2000 GTI/file.bin
    // → "2000 GTI" beats "Golf 7" beats "last tuner files").
    for (let i = 0; i < 5; i++) {
      const base = path.basename(dir)
      if (!base) break
      const lower = base.toLowerCase()
      if (!ROOT_BASENAMES.has(lower) && !GENERIC_BASENAMES.has(lower)) {
        candidates.push(base)
        break  // take the first non-generic ancestor going up from the file
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return candidates[0] || ''
}

let skippedReadError = 0;
// v3.16: buildRecipe now takes resolvedPartNumber + resolvedSwNumber from the
// caller so binary-content-rescued IDs flow through. Previously buildRecipe
// re-ran parseFilename on the path, which returns null for the (license-plate
// / hash / job-id) named files we just rescued via binary scan. That null
// then crashed `path.join(OUT_ROOT, null)` at write time.
function buildRecipe(oriPath, tunedPath, stage, resolvedPartNumber, resolvedSwNumber) {
  // Wrap reads in try/catch — one bad file (path encoding, locked, deleted
  // between walk and read) should not kill the entire batch.
  let ori, tuned;
  try {
    ori = fs.readFileSync(oriPath);
    tuned = fs.readFileSync(tunedPath);
  } catch (e) {
    skippedReadError++;
    return null;
  }
  if (ori.length !== tuned.length) {
    skippedSizeMismatch++;
    return null;
  }
  const regions = diffToRegions(ori, tuned);
  const totalBytesChanged = regions.reduce((s, r) => s + (r.end - r.start + 1), 0);

  // Capture the parent folder name so the Recipe Library search picks up
  // vehicle context that's encoded in the folder structure rather than the
  // filename. e.g. "Golf 7 2.0 TFSI Stage 1 Sw SC800H6300000 Hw 5G0906259E
  // 300Hp DSG250 Simos18" — searching "Golf 7" should find this even though
  // the .bin filename inside has no "Golf 7" string.
  //
  // CRITICAL — skip ROOT folder names. When a file sits directly in one of the
  // configured ROOTs (e.g. /d/last tuner files/SOMEFILE.BIN), basename gives
  // "last tuner files" which is just the archive container, useless for
  // vehicle ID. Damo flagged 1,552 entries showing "last tuner files" and
  // 1,184 showing "audi-package" — that's 37% of the manifest with garbage
  // labels. Skip when the parent IS a ROOT.
  const sourceFolder = pickSourceFolder(tunedPath, oriPath)

  const recipe = {
    schemaVersion: 1,
    sourcePartNumber: resolvedPartNumber,    // resolved by caller (filename or binary scan)
    sourceSwNumber: resolvedSwNumber,        // resolved by caller
    sourceOriFile: path.basename(oriPath),
    sourceTunedFile: path.basename(tunedPath),
    sourceFolder,                                                        // NEW v3.16
    sourceOriHash: (() => { try { return sha256File(oriPath) } catch { return '' } })(),
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
let contentMatches = 0   // v3.16 — count files identified by binary content scan
let filterDropped = 0    // v3.16.1 — files dropped by VAG/year filter
let walkProgressLast = Date.now()

// Retry helper — Damo's D: drive transiently disappears mid-scan (USB sleep
// or filesystem hiccup). Try multiple times with growing delay because the
// drive can take 5-10 seconds to wake up after going idle.
function existsWithRetry(p) {
  if (fs.existsSync(p)) return true
  // Try up to 4 times: 2s, 4s, 6s, 8s waits. Total max wait 20s if the
  // drive is genuinely missing, but ~2-4s for a sleepy drive.
  for (let attempt = 1; attempt <= 4; attempt++) {
    const until = Date.now() + 2000 * attempt
    while (Date.now() < until) { /* spin */ }
    if (fs.existsSync(p)) {
      console.log(`    (woke ${p} after ${2 * attempt}s)`)
      return true
    }
  }
  return false
}

// Also wrap readdirSync with retry for the same reason — the walker hits
// thousands of directories and any one of them can transiently fail.
const _readdirSync = fs.readdirSync
function readdirSyncWithRetry(p, opts) {
  try { return _readdirSync(p, opts) }
  catch (e) {
    // Single 1-second retry — short because we're inside the walker hot path
    const until = Date.now() + 1000
    while (Date.now() < until) { /* spin */ }
    try { return _readdirSync(p, opts) } catch { throw e }
  }
}

for (const root of ROOTS) {
  if (!existsWithRetry(root)) {
    console.log(`  ⚠ skipping (not found): ${root}`)
    continue
  }
  const beforeFiles = filesVisited
  const beforeContent = contentMatches
  const startedAt = Date.now()
  console.log(`  → scanning ${root} ...`)
  walk(root, (full, name) => {
    // Progress beacon every ~2s so the user knows we're still alive on the
    // long sweeps (some roots have 16K+ files plus binary scans).
    const now = Date.now()
    if (now - walkProgressLast > 2000) {
      walkProgressLast = now
      const fps = Math.round((filesVisited - beforeFiles) / Math.max(1, (now - startedAt) / 1000))
      process.stdout.write(`\r    visited ${filesVisited} files (${fps}/s, ${contentMatches} content-rescued, ${groups.size} groups)`)
    }
    // Fast-path filter: skip by extension before stat
    const ext = path.extname(name).toLowerCase()
    if (SKIP_EXT.has(ext)) return
    let size
    try { size = fs.statSync(full).size } catch { return }
    if (size < MIN_SIZE || size > MAX_SIZE) return
    let info = parseFilename(name)

    // v3.16 — content-based identifier fallback. VAG ECUs embed part number
    // and SW number as ASCII strings in the calibration region. Scan when
    // EITHER field is missing from the filename (not just partNumber):
    //
    // CASE 1 — license-plate-named tune (no part-num in filename):
    //   "Golf 7 GTI stage 2.MOD"  →  binary scan finds 5G0906259 + SC800F9000000
    //
    // CASE 2 — part-num-named ORI (no SW in filename):
    //   "OBD UDS_5G0906259.bin"   →  filename gives 5G0906259 but no SW.
    //   Binary scan fills SC800F9000000 so the ORI key matches the tune key.
    //
    // Without case 2, ORIs and tunes that share a part number land in
    // different groups (5G0906259__unknown vs 5G0906259__SC800F9000000)
    // and never pair — that's why all the Simos18 / modern Golf 7 / GTI
    // material was orphaned.
    if (!info.partNumber || !info.swNumber) {
      let buf
      try { buf = fs.readFileSync(full) } catch { return }
      const fromContent = extractPartNumberFromBinary(buf)
      // partNumber: filename wins; binary fills only if missing
      const finalPart = info.partNumber || fromContent.partNumber
      if (!finalPart) return  // genuinely no identifier — skip
      const finalSW = info.swNumber || fromContent.swNumber
      const wasBinaryRescued = !info.partNumber && fromContent.partNumber
      info = { ...info, partNumber: finalPart, swNumber: finalSW }
      if (wasBinaryRescued) contentMatches++
    }

    // VAG-only + 2008+ filter (Damo's spec). Drops:
    //   • Non-VAG makes (BMW, Mercedes, Peugeot, …)
    //   • Pre-2008 Audi B5/B6/B7, A6 C5, A8 D2/D3, A3 8L, TT 8N, Polo 6N/9N
    //     (Mk4 Golf 1J0 stays in as the explicit exception)
    //   • Bosch/Siemens generic parts that aren't under a VAG-context folder
    if (!shouldInclude(info.partNumber, full)) {
      filterDropped++
      return
    }

    const key = `${info.partNumber}__${info.swNumber || 'unknown'}`
    let g = groups.get(key)
    if (!g) { g = { originals: [], tunes: [] }; groups.set(key, g) }
    if (info.stage === 0) g.originals.push(full)
    else g.tunes.push({ path: full, stage: info.stage })
  })
  const dur = ((Date.now() - startedAt) / 1000).toFixed(1)
  process.stdout.write(`\r    ${root}: ${filesVisited - beforeFiles} files, ${contentMatches - beforeContent} rescued, ${dur}s\n`)
}
console.log(`\nTotal files visited: ${filesVisited}, variant groups formed: ${groups.size}`)
console.log(`  ${contentMatches} files identified by binary content scan (filename had no part number)`)
console.log(`  ${filterDropped} files dropped by VAG/2008+ filter (non-VAG or pre-2008 chassis)`)

let pairsFound = 0, recipesWritten = 0, skippedNoPart = 0;
for (const [key, g] of groups) {
  if (g.originals.length === 0 || g.tunes.length === 0) continue;

  // Recover the resolved partNumber + swNumber from the group key. The walker
  // built keys as `${partNumber}__${swNumber || 'unknown'}`. partNumber is
  // always set (we returned early in the walker if neither filename nor
  // binary scan produced one), and swNumber may legitimately be 'unknown'.
  const sepIdx = key.indexOf('__');
  const resolvedPart = sepIdx > 0 ? key.slice(0, sepIdx) : key;
  const resolvedSwRaw = sepIdx > 0 ? key.slice(sepIdx + 2) : 'unknown';
  const resolvedSw = (resolvedSwRaw && resolvedSwRaw !== 'unknown') ? resolvedSwRaw : null;
  if (!resolvedPart) { skippedNoPart++; continue; }

  // v3.16 fix: when a group has multiple ORI candidates of different sizes
  // (e.g. .frf wrapper alongside raw .bin), pair each tune with the ORI
  // whose size matches. Previously we always picked originals[0], which
  // dropped any pair where the wrapper happened to be listed first —
  // that's how all the 5G0906259C / 8V0906* / 06K906* Golf 7 era pairs
  // were silently failing.
  const oriSizes = [];
  for (const oriPath of g.originals) {
    try { oriSizes.push({ path: oriPath, size: fs.statSync(oriPath).size }); }
    catch { /* skip */ }
  }
  if (oriSizes.length === 0) continue;

  for (const t of g.tunes) {
    pairsFound++;
    let tunedSize;
    try { tunedSize = fs.statSync(t.path).size; } catch { skippedSizeMismatch++; continue; }
    const matchingOri = oriSizes.find(o => o.size === tunedSize);
    if (!matchingOri) { skippedSizeMismatch++; continue; }
    const recipe = buildRecipe(matchingOri.path, t.path, t.stage, resolvedPart, resolvedSw);
    if (!recipe) continue;
    if (recipe.regions.length === 0) continue; // identical files, not a real pair

    const partDir = path.join(OUT_ROOT, recipe.sourcePartNumber);
    fs.mkdirSync(partDir, { recursive: true });
    // null SW → "unknown" stem so multiple null-SW recipes for the same part
    // don't overwrite each other (e.g. when several Golf 7 tunes share a
    // partNumber but the SW couldn't be extracted from filename or binary).
    const swStem = recipe.sourceSwNumber || `unknown_${path.basename(t.path).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 32)}`;
    const variantId = `${swStem}_stage${recipe.stage}`;
    const outPath = path.join(partDir, `${variantId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(recipe, null, 2));
    recipesWritten++;
    if (recipesWritten <= 5) {
      console.log(`  ✓ ${recipe.sourcePartNumber} ${recipe.sourceSwNumber || '(no-sw)'} Stage${recipe.stage} — ${recipe.regions.length} regions, ${recipe.totalBytesChanged}B changed`);
    }
  }
}
console.log(`\nDone. Pairs found: ${pairsFound}, recipes written: ${recipesWritten}, skipped (size mismatch): ${skippedSizeMismatch}, skipped (no part): ${skippedNoPart}`);
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
          sourceFolder: recipe.sourceFolder || '',  // v3.16: enables vehicle-name search ("Golf 7", "Audi A3", etc.)
        });
      } catch {}
    }
  }
}
walkRecipes(OUT_ROOT);
fs.writeFileSync(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${manifest.length} recipes, ${(JSON.stringify(manifest).length / 1024).toFixed(1)} KB`);
