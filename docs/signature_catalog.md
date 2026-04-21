# DAMOS Signature Catalog — How It Was Built

**Date:** 2026-04-21
**Version shipped:** v3.11.0
**Status:** Live in Remap Builder, 152,119 signatures across 7 VAG families

## The problem we solved

Before this work, the Remap Builder could find maps in a binary via the Kf_ axis
scanner — but only as **generic offsets** like `Kf_0x18718a`. No names, no
descriptions, no dimensions you could trust.

Goal: for any VAG binary the user loads, automatically identify maps by their
**real DAMOS names** (like `AccPed_trqEng0_MAP`, `InjCrv_phiMI1APSCor1EOM1_MAP`)
with correct dimensions and German/English descriptions from the factory A2L.

## The core idea

DAMOS map data is **portable across binaries of the same ECU family**. An
`AccPed_trqEng0_MAP` in one EDC16 Golf has the same 24-byte table data as the
same map in another EDC16 Passat — even though the file offsets differ. So:

1. From ORI+A2L pairs we extract each map's **24-byte signature** (the actual
   table bytes at the address the A2L points to)
2. We keep signatures that appear **≥2 times across pairs** (filters out
   variant-specific junk)
3. To identify maps in an unknown binary, scan every 2-byte-aligned offset
   looking for those signatures. Hits = known named maps at known offsets.

Field-validated on 21 held-out binaries: **86% found real maps.**

## What file types were used (and what wasn't)

| Format | Used? | Parser | Notes |
|---|---|---|---|
| **A2L** (ASAP2) | ✅ Primary | regex over `/begin CHARACTERISTIC ... /end CHARACTERISTIC` with `AXIS_DESCR` sub-blocks for dimensions | Every pair needs an A2L — that's where map names + addresses + dims come from |
| **Intel HEX** (.hex) | ✅ Required for 97% of pairs | `C:/temp/ihex.js` — custom parser | Record types 00/01/02/04 supported. Handles Tricore (base 0x80000000), C167 (base 0x800000), scattered segments. **1,100 of 1,142 VAG pairs are HEX** |
| **Raw .bin / .ori** | ✅ As-is | No parser needed | 42 of 1,142 pairs (mostly ME7/MED9 petrol) |
| **.kp** (WinOLS MapPack) | ◯ Cross-reference only | Previous session's harvester (not this round) | Used to tag catalog entries with `inKpHarvest: true` flag so we know which maps tuners actually care about. NOT used as signature source. |
| **.ols** (WinOLS Project) | ❌ Skipped | Would need binary parser | Could be a future expansion — each .ols contains a binary + map labels + edits. Would unlock more training data, especially for SIMOS18 which is currently a gap |
| **SREC** (.s19) | ❌ Skipped | Would need a parser | Extremely rare in VAG dumps, not worth the effort until a user hits one |

## The pipeline (all scripts in `C:/temp/`)

Run in this order to rebuild from scratch:

### 1. `find_pairs.js` — discover ORI+A2L pairs on disk
- Walks D:\ recursively, collects all .bin/.ori/.hex (≥256KB) and .a2l (≥100KB) files
- Pairs them: same folder → 1:1 pairing, else longest-common-substring stem match
- VAG filter regex: `(03[CDGL]|04[LE]|06[ABCDEF])\d{6}|8[EKPTUV]...|VAG|VW|Audi|Skoda|Seat`
- Output: `C:/temp/ori_a2l_pairs.json` — found **1,142 VAG pairs**

### 2. `ihex.js` — Intel HEX parser module
- Parses records, tracks `upperLinear` (type 04) and `upperSegment` (type 02)
- Returns `{ image: Buffer, base: number, size: number }` = flat memory image
- Critical bug-fix: used `upperLinear * 0x10000` not `upperLinear << 16` to avoid i32 sign issues on 0x80000000+ Tricore addresses
- Safety cap at 32 MB (flags `oversize: true`)

### 3. `extract_signatures_v4.js` — harvest signatures
- For each of 1,142 pairs:
  1. Read A2L, parse CHARACTERISTIC blocks (name + address + dims + type)
  2. Read binary — if starts with `:` → Intel HEX parse via `ihex.js`, else raw buffer
  3. **Base-address detection**: try offsets {0, 0x800000, 0x80000000, 0xA0000000, hexBase} and pick the one where most A2L addresses land within the image bounds
  4. For each map: `sig = image[addr-base .. addr-base+24]`
  5. Append one JSONL line per sig to `C:/temp/sigs_<FAMILY>.jsonl`
- Family classifier: regex match on dir/filename for `edc16/edc17/me7/med9/med17/simos/ppd1/mg1` — defaults to `OTHER` if no match
- Key implementation detail: **synchronous `fs.appendFileSync` per pair** — earlier versions used `WriteStream.write()` which buffered in memory until OOM. Writing per-pair in one sync call keeps memory bounded at ~150 MB.
- Runtime: ~10 minutes for all 1,142 pairs. Output: ~10 GB JSONL across 7 families (EDC17 alone is 4 GB)
- Stats: 1,126 pairs processed, 16 skipped (bad A2L/base/HEX format). **21,022,668 total signatures extracted**

### 4. `build_family_catalogs_v2.js` — portable filter
- Reads each `sigs_<FAMILY>.jsonl` via streaming `readline` (don't JSON.parse into a giant array)
- For each map name, find the most-common 24-byte signature across pairs
- Keep if: `bestCount ≥ 2` AND sig has ≥4 unique bytes AND not all-0/all-FF/repeated-byte
- Output: `C:/temp/catalog_<FAMILY>.json` (per-family) + `C:/temp/vag_catalog_all_families.json` (combined 40 MB)
- Final sizes:

| Family | Pairs | Catalog entries |
|---|---|---|
| EDC17 | 758 | **43,386** |
| MED17 | 27 | 39,131 |
| OTHER | 32 | 23,794 |
| MED9 | 44 | 15,635 |
| EDC16 | 157 | 15,410 |
| ME7 | 103 | 13,830 |
| PPD1 | 5 | 933 |
| **Total** | **1,126** | **152,119** |

### 5. `compact_catalog.js` — shrink for shipping
- Converts verbose catalog JSONs into compact form:
  - `sigHex` (48 char) → base64 (32 char) — 33% smaller
  - Short keys: `name` → `n`, `sigHex` → `s`, `rows` → `r`, `cols` → `c`, `type[0]` → `t`, `desc` → `d`, `portable` → `p` (0/1)
  - Drop unused: `family`, `confirmedInBinaries`, `totalPairsObserved`, `inKpHarvest`
- Result: **40.7 MB → 20.3 MB** (50% reduction)
- Output: `C:/temp/vagcat_<family>.json` (lowercase family names)

### 6. `scan_binary.js` — standalone CLI scanner (optional)
- CLI tool: `node scan_binary.js <file.bin|file.hex> [--limit=N] [--json]`
- Builds first-8-byte-prefix bucket over the combined catalog
- Scans binary at every 2-byte offset, looks up candidates, verifies full 24-byte sig
- Detects family by hit count
- Great for batch-testing binaries outside the Electron app

### 7. `run_scanner_tests.js` — validation harness
- Runs `scan_binary.js` on 21 held-out binaries across 7 families
- Results:

| Family | Detection | Avg MAPs found |
|---|---|---|
| EDC17 | 3/3 ✅ | 691 |
| EDC16 | 3/3 ✅ | 304 |
| MED17 | 3/3 ✅ | 50 |
| ME7 | 3/3 ✅ | 64 |
| PPD1 | 3/3 ✅ | 16 |
| MED9 | 0/3 ❌ label | 42 (maps found, labeled "OTHER") |
| SIMOS | 0/3 ❌ | 4 (no SIMOS training data) |

## How the Electron app uses it

### Files

```
dctuning-desktop/
├── resources/vag-signatures/          ← 20 MB of compact catalog JSONs
│   ├── vagcat_edc16.json                 (shipped as extraResources in electron-builder)
│   ├── vagcat_edc17.json
│   ├── vagcat_me7.json
│   ├── vagcat_med9.json
│   ├── vagcat_med17.json
│   ├── vagcat_other.json
│   └── vagcat_ppd1.json
├── src/main/
│   ├── index.ts                       ← IPC handlers: vag-scan-signatures, vag-catalog-stats
│   └── vagSignatureScanner.ts         ← scanner logic (lazy-loads per family)
├── src/preload/index.ts                ← window.api.vagScanSignatures(buffer)
└── src/renderer/src/pages/
    └── RemapBuilder.tsx                ← auto-scan on file load + green DAMOS panel UI
```

### Runtime flow

1. User loads a binary (.bin/.hex/.ori) in Remap Builder
2. Renderer calls `window.api.vagScanSignatures(Array.from(Uint8Array(buf)))`
3. Main process receives buffer via IPC, runs `scanSignatures(buf)`:
   - On first call per family, lazy-loads that family's catalog from `resources/vag-signatures/`
   - Builds prefix bucket (first 8 bytes hex → list of entries)
   - Walks buffer in 2-byte steps, looks up prefix, verifies full sig
   - Tallies hits per family, picks top-scoring family as the detected one
   - Returns `{ detectedFamily, familyScores, totalMaps, byType, matches[] }`
4. Renderer stores result in `sigScanResult` state
5. Green panel appears in UI: **"🏷️ DAMOS SIGNATURE SCANNER"** with family badge, MAP/CURVE/ALL filter tabs, and the matches list (sorted by offset)

### Path resolution for bundled catalogs

`src/main/vagSignatureScanner.ts` tries 3 paths in order:
```
1. process.resourcesPath / vag-signatures / <file>     (packaged Electron)
2. __dirname/../../resources/vag-signatures/<file>     (dev mode)
3. __dirname/../../../resources/vag-signatures/<file>  (fallback)
```

## Known gaps & future work

### MED9 mis-labeled as "OTHER"
- Maps ARE being found (42 avg per binary), just filed under wrong family
- Root cause: our training classifier matched on folder/filename. Some MED9 binaries sit in generic folders (no "MED9" in path) → got classified OTHER → their sigs live in catalog_OTHER.json
- **Fix:** during extraction, read a few bytes of the binary or A2L header to detect family instead of relying on path regex. Or do a post-processing pass that moves duplicate sigs from OTHER to MED9.

### SIMOS has zero training data
- SIMOS18 (Tricore) and PCR2.1 (Siemens) are both labeled SIMOS in our classifier but we had no SIMOS pairs in `ori_a2l_pairs.json` that made it past base-detection
- **Partial asset:** We extracted the Continental Funktionsrahmen for VW SIMOS 18.1 EA888 (220 MB PDF → 3.2 MB text). Saved 34,590 SIMOS18 DAMOS-style identifiers at `docs/simos18/names.json` for use as a validation dictionary once we have actual A2L+bin pairs. See `docs/simos18/README.md` for full assessment. **FR alone is not enough — no binary signatures in it.**
- **Fix:** Do a targeted SIMOS-only harvest — find SIMOS A2Ls specifically, fix whatever's making their pairs fail base-detection (likely Tricore with non-standard base). Or write a .ols parser to extract from WinOLS projects.

### .ols files ignored
- Lots of .ols files on D: drive — WinOLS project files containing binary + labels
- **Fix:** Write a .ols parser (length-prefixed DAMOS blocks). This would likely double our training data, especially for families with thin coverage

### No "edit" flow yet from signature results
- UI shows the detected maps but user can't click one to open it in the map editor
- **Fix:** Add "Edit" button per match that converts `{name, offset, rows, cols, type}` into an `ExtractedMap` and feeds into the existing map editor. Similar pattern to how Kf_ scanner candidates become editable.

### Single-pass scan is slow for big binaries
- 4 MB Tricore binary at 2-byte step = 2 million Map lookups
- Current ~1-3 seconds per scan is OK, but could be faster with:
  - Coarser step (4-byte aligned for most maps)
  - Skip regions that are all 0xFF (erased flash) or all 0x00

## Rebuilding from scratch

```bash
# 1. Find pairs (takes 5-10 min, scans D: drive)
node C:/temp/find_pairs.js

# 2. Extract signatures (takes ~10 min, writes ~10 GB JSONL)
node C:/temp/extract_signatures_v4.js > C:/temp/extract_v4_run.log 2>&1

# 3. Build per-family catalogs (takes ~2 min)
node --max-old-space-size=6144 C:/temp/build_family_catalogs_v2.js

# 4. Compact for shipping
node C:/temp/compact_catalog.js

# 5. Copy to app resources
cp C:/temp/vagcat_*.json dctuning-desktop/resources/vag-signatures/

# 6. Build + push
cd dctuning-desktop && npm run build && git add . && git commit && git push
```

## Testing a binary from the CLI

```bash
# Full combined scan
node C:/temp/scan_binary.js "C:\path\to\binary.bin"

# Limit output, JSON format
node C:/temp/scan_binary.js "file.hex" --limit=20 --json > result.json
```

Example output for an Audi A4 EDC17C46:

```
=== VAG ECU Signature Scan ===
File:           audi A4 2000 tdi 177cv bosch edc17c46 dsg.ori
Size:           2.00 MB
Detected:       EDC17  (8,870 sig hits)
Other families: MED17=414  OTHER=101

Maps identified (EDC17 catalog): 3,474
By type:        MAP=773  CURVE=536  VAL_BLK=135  VALUE=2030

-- Tunable MAPs (2D tables) — first 8:
  @0x0272b2  InjCrv_phiMI1APSCor1EOM1_MAP    8x8   "Winkelkorrekturfeld der MI1"
  @0x0272b2  InjCrv_phiPoI1APSCorEOM1_MAP    8x8   "Post Injection 1 angle correction"
  ...
```

## Artifact inventory in `C:/temp/`

| File | Purpose | Size |
|---|---|---|
| `ori_a2l_pairs.json` | All 1,142 pair paths | ~400 KB |
| `ihex.js` | Intel HEX parser module | 2 KB |
| `extract_signatures_v4.js` | Signature extraction (v4 is the working one) | 5 KB |
| `sigs_EDC17.jsonl` | Raw EDC17 sigs | 4.1 GB |
| `sigs_EDC16.jsonl` | Raw EDC16 sigs | 389 MB |
| `sigs_<others>.jsonl` | Per-family JSONL | 3-100 MB each |
| `build_family_catalogs_v2.js` | Portable-filter to per-family catalogs | 3 KB |
| `catalog_<FAMILY>.json` | Verbose per-family catalogs | 0.3-12 MB |
| `vag_catalog_all_families.json` | Combined verbose catalog | 40.7 MB |
| `compact_catalog.js` | Shrinks catalogs for app bundling | 1 KB |
| `vagcat_<family>.json` | Compact catalogs (shipped with app) | 0.1-6 MB |
| `scan_binary.js` | Standalone CLI scanner | 4 KB |
| `run_scanner_tests.js` | Validation harness | 2 KB |
| `scanner_test_results.json` | Validation run results | 5 KB |

## Key commits

- `0c0e8ea` — v3.11.0 integration (this release)

## Testing checklist

- [x] Golf 389289 EDC16 → 8,458 maps
- [x] Audi A4 EDC17C46 → 3,474 maps
- [x] Audi Q3 2019 EDC17C74 → 670 maps
- [x] Audi A4 1.8T ME7.5 → 679 maps
- [x] Audi A3 1.4 MED17.5 → 559 maps
- [x] PPD1.2 03G906018DN → 21 maps
- [ ] Install v3.11.0 on the workstation, verify UI panel appears
- [ ] Load a real customer binary in Remap Builder, confirm DAMOS names show up
- [ ] (Future) SIMOS18 coverage once training data added
