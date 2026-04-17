# ECU Map Study — FULL D: Drive ORI/Stage1 Diff Analysis

**Method:** Walked EVERY folder on D: drive recursively (32,174 dirs, 55,636 candidate files),
paired `.Original` with `.Stage1` by filename prefix, byte-diffed each pair, found Kf_ headers
for modified regions, grouped identical 12-byte signatures across files to identify the SAME
map across different tunes.

**Output:** One JSON per ECU family in this directory. `_*full.json` = full-study results.

## Dataset

- **32,174** directories walked
- **55,636** candidate ORI/Stage binary files found
- **14,931** complete ORI+Stage1 pairs
- **14,314** processed (617 skipped — size mismatch or unreadable)
- **~7,300** pairs assigned an ECU family; **7,639** UNKNOWN (need better family detection)

## Family coverage (full D: drive)

| Family | Pairs | Verified sigs (≥3 files) | File |
|---|---|---|---|
| **UNKNOWN** | 7,639 | 169 | — needs family detection improvement |
| **EDC17 generic** | 2,558 | 210 | `edc17_gen_full.json` |
| **EDC17 C46** | 1,127 | 30 | `edc17_c46_full.json` |
| **ME7** | 789 | 9 | `me7_full.json` |
| **EDC16 Cx** | 441 | 28 | `edc16_cx_full.json` |
| **EDC16 generic** | 411 | 32 | `edc16_gen_full.json` |
| **EDC17 CP14** | 293 | 3 | `edc17_cp14_full.json` |
| **MED17.5** | 281 | 12 | `med17_5_full.json` |
| **Marelli** | 152 | 0 | (non-Kf_ format) |
| **EDC17 Cx** | 147 | 29 | `edc17_cx_full.json` |
| **EDC16 C34** | 135 | 2 | `edc16_c34_full.json` |
| **EDC16 C39** | 132 | 14 | `edc16_c39_full.json` |
| **MED17** | 53 | 3 | `med17_full.json` |
| **EDC17 PSA** | 32 | 7 | `edc17_psa_full.json` |
| **EDC17 CP44** | 9 | 5 | `edc17_cp44_full.json` |
| **EDC17 CP20** | 8 | 2 | `edc17_cp20_full.json` |
| **EDC16 U34** | 20 | 1 | `edc16_u34_full.json` |
| **EDC16 C8** | 29 | 0 | (non-matching data format) |
| **ME9** | 27 | 0 | (non-matching data format) |
| **EDC15** | 13 | 0 | (0xEA38 format — Kf_ scanner incompatible) |
| **EDC17 C64** | 9 | 0 | |
| **EDC7** | 5 | 0 | |
| Others (BMW, SID, MEVD) | ~4 | ~1 | |

**Known gaps:**
- **7,639 UNKNOWN pairs** — need broader family detection (SID, Continental, Marelli with different ident strings)
- **EDC15 (13 pairs found, 828 in earlier scan)** — numbers vary because EDC15 often lacks standard ident strings, and Kf_ scanner doesn't fit its 0xEA38 layout
- **DCM6.2 / DCM6.1** — no matches found across all D: drive (no VW 1.6 TDI/2.0 TDI CR binaries on this drive)
- **MG1** — no matches (no Focus RS/ST EcoBoost binaries on this drive)
- **SIMOS** — only 1-25 found; encrypted format

## Total sigs verified across identifiable families: ~400

Raw data per family in the `*_full.json` files. Each entry has:
```
{ sigHex, sigBytes, rows, cols, xAxis, yAxis, le,
  occurrences, occurrencePct, avgPctChange, medianPctChange, sampleFiles }
```

## Top-level insights

### EDC17 C46 (1,127 pairs)
Most common modifications:
- **8×14 with Y=82-8192** — sig `0e 00 08 00 00 00 20 03 b0 04 40 06` — **175+ files, +16% avg** — IQ or fuel duration map
- **10×16 N75 family** (Y=500-975) — multiple variants, 100+ files each
- **Rail pressure 12×12** — +74% avg change when modified

### EDC17 generic (2,558 pairs)
Same N75 and IQ patterns as C46 plus variants from CP14, CP20, C41, C64 etc.

### ME7 (789 pairs)
Classic petrol tune target: **LDRXN boost ceiling 8×8** with Y=3200-26120. +130-177% avg change. Tuners DOUBLE the ceiling value.

### EDC16 (543 pairs across Cx/GEN/C34/C39/U34)
- **10×4 BE ceiling** — 9+ files, +50% avg — small but high-signal
- **10×16 BE N75 duty** — multiple files — petrol-like tune pattern
- **10×10 BE rail/fuel @ 1250-4500 RPM** — +12% avg

## Next steps

1. **Investigate 7,639 UNKNOWN pairs** — improve family regex (SID, Continental, Denso, other Siemens)
2. **Turn verified sigs into ecuDefinitions.ts updates** — start with EDC17 N75 family and IQ 8×14 (high confidence, 100+ real-file backing each)
3. **Handle EDC15 properly** — port the 0xEA38-marker scanner from binaryParser.ts into the study script
4. **Find DCM6.2 / MG1 / SIMOS source binaries** for those families to complete coverage
