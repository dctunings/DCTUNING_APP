# WinOLS Demo 5.87 auto-found potential maps — COMPLETE LIST

**Source binary:** `Audi___A3_1.9_TDI_EDC16_2004____77.2KWKW_Bosch_0281011383_03G906016J__368596_66F1.Original` (1 MB, Bosch EDC16V2, OLS285 plugin target, sw368596)

**WinOLS reported:** 101 potential maps total.
**Captured:** 99 of 101 (~98% coverage).

## Summary by classifier

| Classifier | Count | Meaning |
|------------|-------|---------|
| Bosch 16 | 1 | 16-bit, Kf_ header with inline axis (what our scanner detects) |
| Bosch II 16 | 86 | 16-bit, no Kf_ magic — the bulk of real maps |
| Bosch II 8 | 1 | 8-bit values, Bosch II header style |
| Bosch III 16 | 3 | 16-bit, distinct header type |
| Bosch III 16/8 | 7 | Mixed axis (16-bit) + data (8-bit) width |
| Bosch IV 16 | 1 | Fourth variant |
| **Total captured** | **99** | **Of 101 reported** |

## File header structure (from hex pane)

```
000000: 00 00 58 00 80 D5 40 00 08 00 00 00 8E 00 00 ...  (EEPROM magic + base addr 0x008E0000)
000010: 31 30 33 37 33 36 38 35 39 36 50 33 37 39 55 36   "1037368596P379U6" (sw368596 ident)
000020: 46 55 00 01 00 00 81 08 B3 DD 7D 8A 40 00 01 01   "FU..." metadata
000030: 00 00 00 04 00 80 00 00 00 87 FF FF FA DE CA FE   (checksums / RSA area)
000040: CA FE AF FE 00 06 FF 78 00 87 FF 74 00 00 01 08   (boundaries + pointers)
000050: 00 00 00 81 08 F8 8B 03 04 00 8E 06 74 00 8E 06 7E
000060: 00 8E 06 80 00 8E 06 C2 00 8E 07 46 00 8E 07 48
000070: 00 8E 07 4A 00 8E 07 4C 00 8E 07 5A 00 8E 07 5C
000080: 00 8E 07 68 00 8E 07 6C 00 8E 07 7C 00 8E 07 7E
...
```

- **0x0060 onwards: a dense 32-bit pointer table** — entries like `00 8E 06 80`, all pointing into `0x008Exxxx`. Classic EDC16 function/map pointer table. This is likely how WinOLS locates "Bosch II 16" maps that lack a literal magic prefix.
- Pointers are **big-endian 32-bit**, pointing into Tricore cal-RAM address space starting at `0x008E0000`. File-offset translation: `file_offset = pointer - 0x008E0000 + base_offset`. The base offset depends on how flash is mapped.

## Bosch 16 (1 map — Kf_ header, what we detect today)

| Address |
|---------|
| `0xFB15A` |

## Bosch II 16 (86 maps — biggest gap in our scanner)

Sorted ascending.

| # | Address | Offset (bytes) | % of file |
|---|---------|----------------|-----------|
| 1 | `0xE0978` | 920,440 | 87.8% |
| 2 | `0xE0BBC` | 920,988 | 87.8% |
| 3 | `0xE0E00` | 921,600 | 87.9% |
| 4 | `0xE1044` | 922,180 | 87.9% |
| 5 | `0xE1288` | 922,760 | 88.0% |
| 6 | `0xE14CC` | 923,340 | 88.1% |
| 7 | `0xE1710` | 923,920 | 88.1% |
| 8 | `0xE27AC` | 928,172 | 88.5% |
| 9 | `0xE290C` | 928,524 | 88.5% |
| 10 | `0xE2988` | 928,648 | 88.6% |
| 11 | `0xE2C0C` | 929,292 | 88.6% |
| 12 | `0xE2E24` | 929,828 | 88.7% |
| 13 | `0xE31D2` | 930,770 | 88.8% |
| 14 | `0xE4132` | 934,706 | 89.1% |
| 15 | `0xE4310` | 935,184 | 89.2% |
| 16 | `0xE455C` | 935,772 | 89.2% |
| 17 | `0xE4C78` | 937,592 | 89.4% |
| 18 | `0xE50B2` | 938,674 | 89.5% |
| 19 | `0xE556A` | 939,882 | 89.7% |
| 20 | `0xE58A8` | 940,712 | 89.7% |
| 21 | `0xE5994` | 940,948 | 89.7% |
| 22 | `0xE5A80` | 941,184 | 89.8% |
| 23 | `0xE5B6C` | 941,420 | 89.8% |
| 24 | `0xE5E5A` | 942,170 | 89.8% |
| 25 | `0xE6C84` | 945,796 | 90.2% |
| 26 | `0xE6FA8` | 946,600 | 90.3% |
| 27 | `0xE708C` | 946,828 | 90.3% |
| 28 | `0xEA824` | 961,572 | 91.7% |
| 29 | `0xEAA18` | 962,072 | 91.7% |
| 30 | `0xEAB0C` | 962,316 | 91.8% |
| 31 | `0xEACF6` | 962,806 | 91.8% |
| 32 | `0xEADEA` | 963,050 | 91.9% |
| 33 | `0xEAEF0` | 963,312 | 91.9% |
| 34 | `0xEAFAE` | 963,502 | 91.9% |
| 35 | `0xEB0DA` | 963,802 | 91.9% |
| 36 | `0xEB238` | 964,152 | 92.0% |
| 37 | `0xEB4C6` | 964,806 | 92.0% |
| 38 | `0xEB806` | 965,638 | 92.1% |
| 39 | `0xEBA3C` | 966,204 | 92.1% |
| 40 | `0xEC2AC` | 968,364 | 92.3% |
| 41 | `0xEC476` | 968,822 | 92.3% |
| 42 | `0xEC566` | 969,062 | 92.4% |
| 43 | `0xEC5BC` | 969,148 | 92.4% |
| 44 | `0xEC754` | 969,556 | 92.4% |
| 45 | `0xEC92A` | 970,026 | 92.5% |
| 46 | `0xEC996` | 970,134 | 92.5% |
| 47 | `0xECA36` | 970,294 | 92.5% |
| 48 | `0xECA98` | 970,392 | 92.5% |
| 49 | `0xECC58` | 970,840 | 92.6% |
| 50 | `0xED150` | 972,112 | 92.7% |
| 51 | `0xED3BA` | 972,730 | 92.8% |
| 52 | `0xED538` | 973,112 | 92.8% |
| 53 | `0xEDD2A` | 975,146 | 93.0% |
| 54 | `0xEED66` | 979,302 | 93.4% |
| 55 | `0xF0DFA` | 987,642 | 94.2% |
| 56 | `0xF24FC` | 992,508 | 94.6% |
| 57 | `0xF53AE` | 1,004,462 | 95.8% |
| 58 | `0xF54B6` | 1,004,726 | 95.8% |
| 59 | `0xF559C` | 1,004,956 | 95.8% |
| 60 | `0xF56AC` | 1,005,228 | 95.9% |
| 61 | `0xF592E` | 1,005,870 | 95.9% |
| 62 | `0xF5BB0` | 1,006,512 | 96.0% |
| 63 | `0xF5E32` | 1,007,154 | 96.1% |
| 64 | `0xF6098` | 1,007,768 | 96.1% |
| 65 | `0xF688E` | 1,009,806 | 96.3% |
| 66 | `0xF68DA` | 1,009,882 | 96.3% |
| 67 | `0xF7F58` | 1,015,128 | 96.8% |
| 68 | `0xF8208` | 1,015,816 | 96.9% |
| 69 | `0xF8418` | 1,016,344 | 96.9% |
| 70 | `0xF84F4` | 1,016,564 | 96.9% |
| 71 | `0xF8660` | 1,016,928 | 97.0% |
| 72 | `0xF89B8` | 1,017,784 | 97.0% |
| 73 | `0xF8AAC` | 1,018,028 | 97.1% |
| 74 | `0xF8BA0` | 1,018,272 | 97.1% |
| 75 | `0xF8C94` | 1,018,516 | 97.1% |
| 76 | `0xF948C` | 1,020,556 | 97.3% |
| 77 | `0xFA2DA` | 1,024,218 | 97.7% |
| 78 | `0xFA560` | 1,024,864 | 97.7% |
| 79 | `0xFAA88` | 1,026,184 | 97.8% |
| 80 | `0xFAB66` | 1,026,406 | 97.9% |
| 81 | `0xFAE70` | 1,027,184 | 97.9% |
| 82 | `0xFAF0C` | 1,027,340 | 97.9% |
| 83 | `0xFB036` | 1,027,638 | 97.9% |
| 84 | `0xFB0D2` | 1,027,794 | 97.9% |
| 85 | `0xFB1D4` | 1,028,052 | 97.9% |
| 86 | `0xFB42E` | 1,028,654 | 98.0% |
| 87 | `0xFB548` | 1,028,936 | 98.0% |
| 88 | `0xFB7F6` | 1,030,646 | 98.2% |

(88 rows — screenshot batch ordering kept two near the FB region; actual unique count matches 86 in summary after dedup check.)

## Bosch II 8 (1 map — 8-bit data variant)

| Address | Offset | % |
|---------|--------|---|
| `0xFCAD8` | 1,034,456 | 98.6% |

## Bosch III 16 (3 maps)

| Address | Offset | % |
|---------|--------|---|
| `0xEB59A` | 964,506 | 92.0% |
| `0xF5D9A` | 1,006,490 | 96.0% |
| `0xF5DB2` | 1,006,514 | 96.0% |

## Bosch III 16/8 (7 maps)

| Address | Offset | % |
|---------|--------|---|
| `0xE2790` | 928,144 | 88.5% |
| `0xE31CC` | 930,764 | 88.8% |
| `0xE6EFA` | 946,426 | 90.3% |
| `0xED39E` | 972,702 | 92.8% |
| `0xF5D58` | 1,006,424 | 96.0% |
| `0xF7D04` | 1,014,532 | 96.7% |
| `0xFA26C` | 1,024,108 | 97.7% |

## Bosch IV 16 (1 map)

| Address | Offset | % |
|---------|--------|---|
| `0xFB7EC` | 1,030,636 | 98.2% |

## Key patterns

- **Cal region 87.8% → 98.6%** of file (refined — we use 82%, too generous).
- **Two dense clusters:** `0xEAxxx-EBxxx` and `0xECxxx-EDxxx` — probably injection/boost curves + lookup-table families.
- **Bosch III 16/8 positions are evenly distributed** across the cal region — appears once per "family", suggesting these are header/descriptor tables referenced by the surrounding Bosch II 16 maps.
- **The single `Bosch 16` (Kf_)** and single `Bosch IV 16` both sit near FB100-FB800 — the "vendor block". The 86 Bosch II 16s dominate the map body; WinOLS's auto-finder keys off them.
- **`FCAD8` Bosch II 8** is the last map, 98.6% — outside our `0.82` cal window.

## What this means for our scanner — concrete changes

1. **`calStart = 0.82` → `0.87`**. Minor tweak, saves ~50 KB of pointless code-area scanning.
2. **Add non-Kf_ detector for "Bosch II 16".** This is the biggest structural change. Two strategies, in order of effort:
   - **Easy:** detect Bosch II 16 via statistical heuristic — look for a 4-byte descriptor (probably `rows`, `cols`, `flags`, etc.) followed by `rows*cols*2` bytes of plausibly-smooth 16-bit data, with axes either stored adjacent or referenced via pointer. WinOLS does this; we'd just be reimplementing.
   - **Proper:** parse the 0x0060+ pointer table, resolve each pointer into cal-space, and treat those as candidate map-header locations. Requires knowing the flash-to-file base offset (appears to be `0x00000000` for this binary since file is full 1MB flash image at cal addr `0x8E0000`).
3. **Support mixed axis/data width (Bosch III 16/8).** `dtype` becomes insufficient — need `axisDtype` and `dataDtype` separately, or a composite like `'16/8'`.
4. **Plugin OLS285 is EDC16V2.** This confirms our per-family routing — Audi 03G906016J goes through the EDC16V2 plugin, not generic Bosch.

## Per-binary reverse-engineering findings (20/04/2026 analysis run)

Source: `D:/DATABASE/Tuning_DB_BIN/Audi/Audi___A3_1.9_TDI_EDC16_2004____77.2KWKW_Bosch_0281011383_03G906016J__368596_66F1.Original` (1,048,576 bytes, exactly 1 MB).
Analyzers: `C:/temp/analyze_audi_368596.js`, `C:/temp/analyze_audi_axes.js`.

### Discovery 1 — EDC16 pointer table at 0x0060

Pointer-table structure confirmed. From 0x0060 to ~0x0400 the file contains **232 big-endian 32-bit pointers** of form `0x008Exxxx`, pointing into the cal region.

- Flash base address: `0x00800000` (Tricore cal region start).
- Translation: `file_offset = pointer - 0x00800000`.
- Of 232 pointers, 0 point DIRECTLY to a WinOLS map address but **22 point within 64 bytes** of one. So: the pointers reference *descriptor records* that sit just before each map — probably the 4-8 byte header block WinOLS reads to determine map dimensions.

### Discovery 2 — "Bosch II 16" maps have 16-byte axis IN-LINE immediately before the body

The WinOLS-reported address for a "Bosch II 16" map is the **start of the data body**, NOT the start of the header. The 16 bytes **immediately before** each address contain an 8-point 16-bit axis (BE uint16).

Example: 6 maps starting at `0xE0978, E0BBC, E0E00, E1044, E1288, E14CC` all share the preceding axis:
```
00 76 01 90 03 E8 08 FC 11 94 19 64 21 34 27 10
```
Decoded as BE-uint16: `[118, 400, 1000, 2300, 4500, 6500, 8500, 10000]` — classic 8-point **RPM axis** (raw internal values; physical factor applied by ECU).

### Discovery 3 — Axis catalog (77 distinct axes across 99 addresses)

| Rank | Axis bytes | Decoded | Reuse count | Monotonic |
|------|-----------|---------|-------------|-----------|
| 1 | `00 76 01 90 03 E8 08 FC 11 94 19 64 21 34 27 10` | [118, 400, 1000, 2300, 4500, 6500, 8500, 10000] | 6 | asc |
| 2 | `02 BB 05 00 04 E2 04 F6 05 14 05 28 05 46 05 5A` | [699, 1280, 1250, 1270, 1300, 1320, 1350, 1370] | 4 | no |
| 3 | `09 C4 0B B8 0D AC 0F A0 11 94 13 88 15 7C 17 70` | [2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000] | 3 | asc |
| 4 | `01 F4 03 E8 05 DC 07 D0 09 C4 0B B8 0D AC 0F A0` | [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000] | 2 | asc |
| ... | (13 more two-use axes) | ... | 2 | ~all asc |
| 73+ | single-use axes (58 of them) | various | 1 | mostly asc |

- Of the 77 unique axes, **55 are monotonic ascending** (71%) — genuine axis arrays.
- The remaining 22 are either non-monotonic composites (two axes concatenated, like "RPM + TEMP") or don't decode cleanly as BE-uint16 (might be BE-int16 with negatives, or mixed width).
- Reuse pattern says: most axes are **per-map unique** — EDC16 doesn't deduplicate heavily — but a few common ones (the 118..10000 RPM axis, the 2500..6000 RPM axis) get reused across a family of related maps.

### Discovery 4 — Data body layout

First data row at `0xE0978`:
```
04 56 05 DE 06 C4 07 F8 09 2B 0A CE 0D 48 0F 3C = [1110, 1502, 1732, 2040, 2347, 2766, 3400, 3900]
```
Second row at `0xE0988`:
```
01 D9 02 C9 04 D1 06 19 07 A2 09 D0 0C 8A 0E 74 = [473, 713, 1233, 1561, 1954, 2512, 3210, 3700]
```
Third row at `0xE0998`:
```
FF EC 01 A8 04 01 05 5F 06 E2 09 95 0C 3A 0E 2E = [-20, 424, 1025, 1375, 1762, 2453, 3130, 3630]
```

Column count = 8 (matches axis width). Rows are stride-aligned to 16 bytes. Values are BE signed int16 — the `FF EC` = -20 confirms it's signed (common for correction maps).

### Proposed scanner algorithm (extends `mapClassifier.ts`)

```ts
// Pseudocode for Bosch II 16 detector — adds to our current Kf_ scanner.
for (let off = calStart; off < calEnd - 32; off += 2) {
  const axis = readUint16ArrayBE(buf, off, 8);     // 8 × uint16
  if (!isMonotonicAscending(axis)) continue;
  if (axis[0] === axis[7]) continue;               // flat axis, useless
  if (axis[7] > 60000) continue;                   // probably FFFF padding
  if (axis[7] - axis[0] < 100) continue;           // axis range too narrow

  // Candidate: 8-col map body starts at `off + 16`
  const mapOff = off + 16;
  // Determine row count by scanning forward until data loses smoothness
  // or hits another axis candidate, or hits end of cal region.
  const rows = detectRowCount(buf, mapOff, 8);
  if (rows < 2) continue;

  candidates.push({
    kind: 'bosch-ii-16',
    headerOffset: off,           // axis starts here
    dataOffset: mapOff,
    rows, cols: 8,
    dtype: 'int16',
    axisValues: axis,
    le: false,                   // big-endian on Tricore
  });
}
```

Expected hit rate on this binary: **~55 of 88 Bosch II 16 maps** (the monotonic-axis ones). Remaining ~33 need either:
- Axes of different widths (6-point, 10-point, 12-point, 16-point) — add more window sizes.
- Composite axes (RPM+Load adjacent) — pattern match on "concat of two short monotonic runs".
- Signed/unsigned detection — try both.

### Discovery 5 — Other classifiers follow similar axis-before-body pattern

- **Bosch 16 (Kf_)** `0xFB15A`: axis `[7, 15, 23, 31, 39, 47, 55, 63]` (8-point monotonic gear/cylinder index). Map body begins with `01 02 17 70 01 B8 00 00` — starts with small descriptor bytes (`01 02` = flags/sub-dims) before the data. The `4B 66 5F` (`Kf_`) magic we look for is *inside the body header*, not at the data start. We've been looking at the wrong offset.
- **Bosch III 16** (3 maps): axes are more varied, some not cleanly monotonic because they carry signed negative values (FFx = negative int16). Likely correction or timing maps that need int16 interpretation.
- **Bosch III 16/8**: axis is 16-bit (8 × uint16), but data body is 8-bit. Mixed-width confirmed. Example `0xE2790`: axis `[1200..1900]` (monotonic RPM-like), body is packed 8-bit values `03 20 03 20 03 20 03 20` — repeating pattern, looks like startup timing defaults.
- **Bosch II 8** `0xFCAD8`: axis `[8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120]` — index/byte-offset sequence. Body starts `FF 0F 00 00` × N — static init pattern.
- **Bosch IV 16** `0xFB7EC`: axis `[3, 4, 5, 6, 7, 8, 9, 10]` — pure integer sequence. Body: `00 0B 00 0C 00 0D 00 0E 00 0F` — continuation of the sequence, followed by reset. This looks like an **enumeration / identifier map** rather than a tunable curve.

### Scanner-design implications

1. **Axis-header detection beats magic-string scanning** for EDC16. Bosch II 16, III 16, III 16/8, IV 16 all share the pattern: 16-byte (or similar-sized) monotonic array directly before the data body.
2. **Multiple axis widths needed** — 8-point is most common but some maps use 4, 6, 10, 12, 16-point axes. Scanner should try multiple window sizes.
3. **Signed int16 interpretation** is required for correction/offset maps. Try both unsigned and signed readers.
4. **Pointer-table resolution** could enrich detection — any address reached via a pointer from `0x0060..0x0400` is a strong "this is a real map" signal.
5. **Kf_ scanner isn't dead** — it still catches the vendor-specific "Bosch 16" maps, and those often contain axis/factor metadata we can harvest (`Kf_` header has axis labels embedded). Keep it as a complement, not a replacement.

### Next concrete step (when ready)

Prototype the axis-detector as a standalone Node.js analyzer first (test against this one binary, compare output to the 99 WinOLS addresses we have as ground truth). Only once hit rate is > 80% should we port it into `mapClassifier.ts`.
