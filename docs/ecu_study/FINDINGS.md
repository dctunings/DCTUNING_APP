# ECU Map Study — D Drive ORI/Stage1 Diff Analysis

**Method:** Scanned every `.Original` / `.Stage1` file pair across D:/ (6,963 total pairs).
For each pair, byte-diffed ORI vs Stage1, identified modified regions, found the Kf_ header
before each region, extracted map dimensions + axes, computed average % change per cell
across all files. Grouped by 12-byte Kf_ signature to identify the SAME map across files.

**Output:** One JSON file per ECU family in this directory.

## Family coverage

| Family | Pairs analyzed | Verified sigs | Notes |
|---|---|---|---|
| EDC17 C46 | 808 | 19 | C46 has many sub-variants (FJ/JL/AG/HR/BT etc) |
| EDC17 CP14 | 210 | 3 | Tunes mostly modify few maps heavily |
| EDC17 generic | 1,701 | 24 | Broad bucket — other CP variants |
| ME7 | 411 | 3 | Petrol VAG — LDRXN-type maps dominant |
| MED17 | 306 | 20 | Petrol, wider range of modified maps |
| EDC16 | 97 | 9 | Smaller sample but big-signal maps |
| EDC15 | 828 | 2 | Kf_ scanner doesn't fit EDC15's 0xEA38 format |
| SIMOS | 25 | 0 | Encrypted/non-Kf_ format |
| **TOTAL** | **~3,500** | **80** | |

**Not found** — regex mismatch or no samples:
- DCM6.2 / DCM6.1 / DCM7 — 0 matches in filename+content scan
- MG1CS / MG1CP — 0 matches (Ford EcoBoost binaries not on D:)

## Key findings per family

### EDC17 C46 (808 pairs)

| Dims | Sig first 12 bytes (hex) | Occurrence | Avg %Δ | Y range | Guess |
|---|---|---|---|---|---|
| 8×14 | 0e 00 08 00 00 00 20 03 b0 04 40 06 | 124 (15%) | +16.0% | 82-8192 | IQ/fuel |
| 10×16 | 10 00 0a 00 00 00 a4 06 d0 07 c4 09 | 86 (11%) | +6.5% | 500-975 | N75 duty |
| 10×16 | 10 00 0a 00 b0 04 d0 07 c4 09 b8 0b | 80 (10%) | +9.1% | 600-950 | N75 variant (already in defs) |
| 10×16 | 10 00 0a 00 40 06 60 09 b8 0b ac 0d | 44 (5%) | +8.5% | 500-960 | N75 variant |
| 8×16 | 10 00 08 00 00 00 20 03 b0 04 78 05 | 33 (4%) | +15.9% | 82-8192 | IQ variant |
| 8×16 | 10 00 08 00 00 00 ca 02 94 05 5e 08 | 25 (3%) | +16.6% | 82-8192 | Trq→IQ C46 (already in defs) |
| 12×12 | 0c 00 0c 00 b0 04 dc 05 08 07 d0 07 | 6 (1%) | **+74%** | 0-4000 | Rail pressure (already in defs) |

### EDC17 generic (1,701 pairs)

Same patterns as C46 plus:
| Dims | Sig first 12 bytes (hex) | Occurrence | Avg %Δ | Notes |
|---|---|---|---|---|
| 10×14 | 0e 00 0a 00 c8 00 90 01 58 02 20 03 | 303 (18%) | +2.2% | Minor tweak map |
| 10×16 | 10 00 0a 00 40 06 60 09 b8 0b ac 0d | 236 (14%) | +6.1% | N75 |
| 8×14 | 0e 00 08 00 00 00 20 03 b0 04 40 06 | 124 (7%) | +16% | IQ family |

### ME7 (411 pairs)

| Dims | Sig | Occurrence | Avg %Δ | Notes |
|---|---|---|---|---|
| 8×8 | 08 00 08 00 00 00 a4 00 48 01 3e 02 | 26 (6%) | **+177%** | LDRXN boost ceiling (ME7 classic) |
| 8×8 | 08 00 08 00 00 00 a0 00 40 01 40 02 | 17 (4%) | **+130%** | LDRXN variant |

### MED17 (306 pairs)

Many small maps (6-8 cells each). Avg changes 4-25%. Multiple variants.

### EDC16 (97 pairs)

| Dims | Sig | Occurrence | Avg %Δ | Notes |
|---|---|---|---|---|
| 10×4 BE | 00 04 00 0a 01 90 01 f4 02 58 02 bc | 9 (9%) | **+50%** | Small ceiling/boost-limit |
| 10×16 BE | 00 10 00 0a 00 00 02 bc 03 e8 04 e2 | 9 (9%) | +5.7% | N75 duty (Y=600-1050%) |
| 8×16 BE | 00 10 00 08 00 64 00 c8 01 2c 01 90 | 9 (9%) | +4.0% | Boost target or similar |
| 10×10 BE | 00 0a 00 0a 04 e2 05 dc 06 d6 07 d0 | 6 (6%) | +12.0% | Rail/fuel 1250-4500 RPM |

## Proposed ecuDefinitions.ts updates

### To add (NEW maps verified in study)
- **EDC17 N75 family** — sigs `0x00,0xa4,0x06`, `0x40,0x06,0x60,0x09` etc (up to 300+ files, 5-9% avg)
- **EDC17 IQ family (8×14)** — sig `0e 00 08 00 00 00 20 03 b0 04 40 06` (124 files, +16%)
- **EDC16 variants** — 10×4 +50%, 10×16 N75, 10×10 rail pressure
- **ME7 LDRXN family** — 8×8 sigs with Y=3200+ range

### To verify (existing defs, want to confirm)
- Rail pressure 12×12 @ 0x4B458 appears at +74% in C46 — confirms my factor/address
- Trq→IQ C46 16×8 appears — confirms my sig
- Boost target 16×10 appears in multiple variants

### Needs a different approach
- **EDC15**: Kf_ scanner doesn't work. Needs 0xEA38-marker study.
- **SIMOS**: Encrypted. Won't yield easy diff signatures.
- **DCM6.2**: 0 binaries on D: drive. Need to find source files.
- **MG1**: 0 Focus RS/ST files on D: drive.

## Data files

- `edc17_c46_deep.json` — 19 verified map sigs
- `edc17_cp14_deep.json` — 3 verified sigs
- `edc17_gen_deep.json` — 24 verified sigs
- `me7_deep.json` — 3 verified sigs (all high-%)
- `med17_deep.json` — 20 verified sigs
- `edc16_deep.json` — 9 verified sigs
- `edc15_deep.json` — 2 verified sigs (incomplete — different format)
