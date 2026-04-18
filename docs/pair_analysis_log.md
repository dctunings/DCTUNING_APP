# Pair-by-pair ORI/Stage1 analysis log

Running notes from analysing real ORI/Stage1 pairs one at a time to build
per-variant offset coverage. Entries list what I actually found, what
was code-changed, and what was left as a placeholder for future pairs.

## Pair #1 — PPD1.2 · 03G906018DH SN100L8000000 (Audi A3 BKD 140ps, 2006)
- ORI: `Audi_A3_2.0_TDI_2006_..._03G906018DH_SN100L8000000_BC52.ori`
- Stage1: `Audi_A3_2.0_TDI_2006_..._03G906018DH_SN100L8000000_8DE3_Stage1.bin`
- 15,625 bytes changed (heavy Stage 1 tune — boost + fuel + monitoring disable).
- **Code: v3.5.29** — 5 `ppd1_*` mapDefs populated with real `fixedOffset`:
  - `ppd1_fuel_quantity` (MENZK) 0x07BBB3 · 14×8 · 1/250 mg/st
  - `ppd1_boost_target` (LADSOLL) 0x06126E · 3×16 · 1/12.06 hPa
  - `ppd1_torque_limit` (MDFAW) 0x07B954 · 5×8 · (raw-32768)/32 Nm
  - `ppd1_torque_monitor` (NEW) 0x05C7FA · 1×2688 · Nm (pinned to 707 Nm)
  - `ppd1_egr` 0x056D40 · 12×16 · 1/655.36 %
- Scaling constants cross-verified against jazdw/ppd-maps (GPL).

## Pair #2 — PPD1.2 · 03G906018AQ SN100L6000000 (Audi A4 BKD 140ps, 2007)
- Only 2,744 bytes changed — lighter Stage 1 (boost+fuel, no monitoring disable).
- **Code: v3.5.30** — documented AQ offsets in comment block (not wired).
- LADSOLL at 0x06126E CONFIRMED shared between DH and AQ variants.
- MENZK, MDFAW, T-monitor, EGR offsets are variant-specific (0 changes at DH's offsets).
- New AQ-specific finding: per-gear torque limit at 0x04AD3A (28B, ~367→423 Nm).

## Pair #3 — PPD1.2 · 03G906018DH Stage 2 vs ORI (same binary as Pair #1)
- Stage2 touched 71 clusters, 3 were Stage-2-only (not modified by Stage 1).
- **Code: v3.5.31** — 2 new mapDefs:
  - `ppd1_iq_extended` 0x070575 · 96×16 · 1/250 mg/st · Stage 2+ only
  - `ppd1_overboost_ceiling` 0x07C27C · 1×256 · Nm · Stage 2+ only

## Pair #4 — EDC17 C46 · 03L906022BQ sw396412 (Audi A3 2.0 TDI CR 140ps, 2007)
- 512KB stripped cal, LE Kf_ format. 2,706 bytes changed.
- **Code: v3.5.32** — confirmation note on `edc17_rail_pressure` (factor 0.1 bar verified: raw 8200 → 1040 bar ✓).
- Existing edc17 Kf_ signatures already cover the rail pressure, boost target, and overboost regions in this variant — no new `fixedOffset` needed.
- Top modifications:
  - 0x416BC 24×4 +31 % — overboost cut (2439→3193 mbar)
  - 0x3AA12 / 0x3DD6E / 0x3DDD4 / 0x3AA78 rail pressure (820→1040 bar)
  - 9× boost-target tables at 0x622xx (+5-6 %)
  - 4× identical 8×9 boost tables at 0x32880/329B4/32AE8/32C1C (+4.6 %)
  - 5× 16×11 torque tables at 0x68xxx (+3.4 %)

## Pair #5 — ME7.5 · 0261204897 / 4B0906018K (Audi A4 1.8T AWT 150ps, 2002)
- **SKIPPED** — 512KB binary, zero DAMOS symbols found. Stripped calibration
  without the ASCII symbol section. 864 bytes changed, but without name
  anchors I cannot positively ID the maps from diff alone.
- Would need an A2L or a non-stripped variant of the same software to
  make progress.

## Pair #6 — ME7.5 · 0261207215 / 4B0906018CG (Audi A4 1.8T CG, 2003)
- **SKIPPED** — 1MB binary, also stripped (zero symbols). 1,233 bytes
  changed. Same constraint as Pair #5.

## Pair #7 — EDC16U34 PD · 0281011364 / 03G906016G (Audi A3 2.0 TDI PD 140ps, 2004)
- 1.5MB binary, stripped (zero symbols). 2,393 bytes changed.
- **Code: no change** — findings recorded here for future cross-reference.
- Interesting patterns (raw u16 BE):
  - 4× regions at 0x14DF08–0x14DF84 ALL +45 %, values 3000-3500 → 4500-5000
    (suggests one scaled parameter across 4 storage locations; possibly
    per-gear LSMK or an MXMOM group)
  - 7× 6-byte regions at 0x1508B4 → 0x15098C all +10.6 % (per-gear/mode factor)
  - 0x143C5A loose 340B +80 %, 4437 → 8000 (fuel-qty style, μ 44→80 mg/st)
  - 0x15C3xx / 0x15C4xx / 0x15B7xx — small per-condition limit tables
- Without symbols, confident naming requires cross-reference against a
  second EDC16 PD pair with the same software gen, or an A2L.

## Pairs #599–614 — A5 2.7 V6 TDI EDC17 8K0907401 / 8K1907401A

16 pairs of A5 2.7 V6 TDI — Bosch part numbers `8K0907401` (early
2007-08) and `8K1907401A` (2009+). All EDC17, mostly 2 MB, one 524 KB
chiptool half-dump (#600).

**8K0907401 SGO clusters identified**:
- `0x1F8972 / 0x1F8A00 / 0x1F8BEA` cluster — SW **392966** (#593, #596)
- `0x1F8AF6 / 0x1F8B84 / 0x1F8D6E` cluster — SW **393599** (#594) +
  `0x1F8AF6 + 0x1CF02E series` SW **394958** (#595, #598)
- `0x1F8B5E / 0x1F8BEC / 0x1F8DD6` cluster — SW **510327** (#592)
- `0x1F0DC2 + 0x1EB5B2 series` cluster — SW **392961** "CR" variant
  (#597, #601) — 5 sequential 10B regions at 0x1EB5B2-0x1EBB90 look
  like an N75 / boost-pressure stage limiter table.
- `0x1EBB52 + 0x1C67D0 series` cluster — SW **392961** non-"CR"
  variant (#591) — yes, **same SW 392961 has TWO distinct SGOs**
  depending on the "CR" label in the filename. So even the file
  metadata distinguishes ROM revisions where SW number doesn't.

**8K1907401A SGO confirmed shared** across consecutive SW versions
**516657 / 516662 / 516664 / 516665** (#601-#604): all hit
`0x1DBCCC` (12B +200% — primary IQ ceiling), `0x1DBC18` (12B +50%),
`0x1E0782` (128B -50% — limiter ceiling halved), `0x1DBE10` (12B
-46%), `0x1E541E` (6B). This 4-pair shared-SGO confirmation is the
**cleanest variant cluster yet** — would be a high-confidence
candidate for a single `edc17_8k1907401a_516xxx` ECU def with
fixedOffset entries for these 5 maps.

**Code-actionable** (high-conf):
- New ECU def `edc17_a5_27tdi_8k1907401a` with maps at
  - `0x1DBCCC` 12 cells (probably 6×2 IQ ceiling, +200%)
  - `0x1DBC18` 12 cells (sister IQ stage)
  - `0x1E0782` 128 B (likely 32×u16 = 16×4 N75/torque limit)
  - `0x1DBE10` 12 cells (N75 minimum)
  - `0x1E541E` 6 B (point limit / one-shot ceiling)
- identStrings: `'8K1907401A'` + SW range 516657-516665

Pair #604 has Bosch hardware code `0281014394` — note `0281014xxx`
is EDC17 family, NOT EDC16 (my pair.js family detector incorrectly
groups it). Fix in pair.js — minor analysis-tool bug, no app impact.

Also visible from this batch — same `0x1E0782` 128B "halve the
limit ceiling" tweak appears in 4 separate 8K1907401A files. This
is the fingerprint of a known tuning preset (likely a popular paid
tool's ceiling-cut signature).

## Pairs #583–598 — A5 2.0 TFSI MED17 8K2907115x catalog

16 pairs, mostly **A5 2.0 TFSI MED17** at part numbers 8K2907115 with
suffixes A/D/L/P/Q/R/S. Sizes mixed: 256 KB (smaller dump format) and
2 MB (full).

Pairs #573-574 still 03L906018JL TDI tail-end: SW **522923 / 524103**
both share the `0x0615D6` cluster (sister to 521020/521021/519311 from
prior batch — 130 kW pre-522xxx generation). So the `0x061486-0x0615D6`
cluster spans SW 519311 → 524103 — wide SW range, same SGO base.

**MED17 cross-part-number SGO match — important**:
- 8K2907115**D** sw514910 (pair #589) and 8K2907115**L** sw512972
  (pair #588) → **identical** offsets: 0x05570C/0x055682, 0x05E29E,
  0x06EC08, 0x06ECFC, 0x06EB14. Same SGO, two different VW part
  number suffixes. Suffix only changes order code / variant code —
  not the ROM map layout.
- 8K2907115L sw502740 (pair #582) and 8K2907115L sw502740 (pair #583,
  same part + SW, different file) → **different SGO** (one at 0x05CEA8
  cluster, one at 0x06030C/0x062EA0 cluster). **Same SW two SGOs again
  — third time pattern**. Confirms SGO ≠ SW.

**MED17 universal "always-changed" regions** (likely security/unlock,
NOT actual tune content) — appear in nearly every MED17 pair regardless
of SW:
- 256 KB dumps: `0x015109 / 0x015FB1 / 0x017222` 120-byte block
  (+99-118%) — top of cal section, MED17 immobilizer/comp area
- 2 MB dumps: `0x060008 / 0x0604A2` 64-byte block — same region, just
  shifted by the 2 MB layout offset
- These should NOT be treated as "boost target +118%" maps. They are
  consistent across `397259, 399256, 502880, 506775, 512972, 514910,
  398607` and many others — too universal to be a real tune.

**Other findings this batch**:
- 8K2907115Q sw399256 has both 256 KB pair (#579, 40 regions) and
  2 MB pair (#580, 6 regions) — same SW, two **different dump
  formats**. The 256 KB is just the 2 MB cal section extracted.
- 8K2907115S sw502740 (pair #583) — yet another part-suffix sharing
  the same SW. **VAG part suffix is mostly a hardware revision marker,
  not a software identity.**
- 8K2907115A sw397259 (pair #577) and 8K2907115P sw398607 (pair #537
  prior batch) → both early SW (3xxxxx series), 256 KB dumps, similar
  MED17 layout. Likely shared base SGO.

**Code: candidate `med17_2_0_tfsi_8K2907115` ECU def with universal
maps + SW-cohort variants table. Mark `0x015109/0x017222 (256KB)` and
`0x060008/0x0604A2 (2MB)` regions as `category: 'security_unlock'` so
the diff UI doesn't flag them as boost target.**

## Pairs #567–582 — A5 2.0 TDI CR EDC17 03L906019AL/JL SGO clusters

16 pairs all 03L906019AL or 03L906018JL — 2MB EDC17 C46/C64. This
batch lets us cluster the SW numbers into SGO families because
multiple SW versions share the SAME big-region offsets:

**03L906019AL clusters now confirmed**:
- **`0x1C1414` cluster** (12×15 mainmap @ +73977%/LE+46% raw → boost
  scaling) — SW **515287, 518002, 518003**. All 100-119.9 kW models.
  Pair #558 (sw518002) and #564 (sw518002 again, different file) and
  #563 (sw518002 dupe? — same offsets) all match.
- **`0x1E14A0` cluster** (510B + 16×9 mainmap) — SW **515516, 517565**.
  All 125 kW models (including pair #565 confirms #545 from prior batch).
- **`0x1D1CE2` cluster** (2KB + 4×512B) — SW **517561** (hardware-B
  variant of same SW as `0x1E12EE` cluster — same SW two SGOs
  reconfirmed; this is the second time this happens).
- **`0x1E0E54` cluster** — SW 502340/502357 (from prior batch).

**03L906018JL clusters now confirmed**:
- **`0x07D3FE` cluster** (510B + 16×16 + 16×9 — same as 398757 we
  already wired) — SW **522909, 522924, 522922**. All 105-130 kW
  newest 2012-13 generation. Pair #569 also has this with prefix
  `0281018128` Bosch hw revision.
- **`0x061486` cluster** (22B + 362B at 0x066E18) — SW **519311,
  521021, 521020**. 130 kW pre-522xxx generation. Different cal
  region entirely from 522xxx — this is the OLDER C46 generation.
- **`0x058B66 + 0x07D40E` cluster** — SW **522943** (different from
  522909 by 34 — but uses the older 0x058xxx low-region layout WITH
  newer high-region 0x07Dxxx layout — TRANSITIONAL SGO).

Pair #559 03L906022B sw516684 (sister of pair #535 A5 8K1907401A
sw516682 — note the **2-digit SW difference** is critical) hits
`0x1EE45E` (2KB) + `0x1EEEA2` + `0x1EEC80` — same as 03L906022FG
sw506125 / sw506148 from prior batch (`0x1EE4F2` etc — within 200B).
**So 03L906022B sw516684 SHARES the 03L906022FG SGO** despite
different part number. **Code implication**: SGO base may correlate
with model-year cohort across different VAG part numbers.

**Code: building the variants-table mental model is paying off** —
6 distinct SGO clusters identified across ~30 pairs, each with 2-5
SW versions. A loader that uses cal-region content-fingerprint
instead of SW-string match would correctly identify all of them.

## Pairs #550–566 — A5 2.0 TDI CR EDC17 C64 SGO catalog

15 pairs, **all** A5 2.0 TDI CR generation. All 2MB EDC17 except #542
(03L906022MK 524KB — odd half-dump from a chiptool). Bosch part numbers
seen: **03L906022MK, 03L906022B, 03L906019AL, 03L906022TN, 03L906022NP**.

Discovery: **03L906019AL sw 505482 has TWO distinct cal layouts**:
- Pair #543 (file from older tuner): cal block at `0x034A16` (LOW)
- Pair #556 (file from newer tuner): cal block at `0x1D1726` (HIGH,
  same as `edc17_c46_398757` we wired earlier — `0x1D1726` 2KB +
  `0x1D216A` 512B + `0x1D1F48` 512B + `0x1D2E58` 512B + `0x1D2C36` 512B)

This means same Bosch SW number can have two different SGO bases
shipped on different model years/markets. **Code implication**: don't
trust SW number as a single key — need to combine SW + ASCII fingerprint
(e.g. internal version string + checksum location).

03L906019AL sub-families catalogued:
- 502340 / 502357 → cal `0x1E0E54` (510B) + `0x1E0D04` (16×9)
- 504770 → cal `0x1C0E90` (12×15) + `0x1C2D1C` (12×16) + `0x1C5DAC` etc
  (note: different LOWER region — earlier sub-family)
- 505482 (SGO-low variant) → cal `0x034A16` (144B) + `0x058B5E` (34B)
- 505482 (SGO-high variant) → cal `0x1D1726` 2KB + 4× 512B (matches 398757)
- 515516 → cal `0x1E14A0` (510B) + `0x1E1350` (16×9)
- 516648 → cal `0x1A6616/0x18BCA0/0x1D3414/0x1D20E2` (different layout
  again — 4 distinct big regions)
- 517561 → cal `0x1E12EE` (16×12)

03L906022B sub-families:
- 392984 → cal `0x1F9D56` (16×28) + `0x1CD360` series (5× +120%)
- 396468 → cal `0x1F627C` (510B) + `0x1F6100` (16×10) + huge
  `0x1ECxx` cluster
- 396472 / 400951 / 500118 → cal `0x1CAFC4` + `0x1CBA38` (~9×85%)
  + `0x1F23C4` (10B) + `0x1C3xxx` peripheral block — same SGO family
- 396482 → cal `0x1EB880` (16×14) + `0x1CB210-260` 5× 12B blocks

03L906022TN sw504910 (pair #544) → cal `0x1E0EE4` (510B) + `0x1E0D36`
(16×12) — almost identical to 03L906019AL sw502340 layout. Likely
shared base.

03L906022MK sw516684 (pair #542 524KB chiptool dump) → cal `0x044022`
+ `0x0748E2`/`0x074A3A` (2× 239B mirrored). Half-dump means full file
offsets are 0x044022 + 0x180000 in real ROM = 0x1C4022. Doesn't change
the underlying map structure — same C46 family.

**Code: same conclusion as before** — variants table needed; do not
spawn a EcuDef per SW. Consider using cal-region offset detection at
load time (find the 510-byte high-pct region, classify by its file
position) as a fallback identification.

## Pairs #533–549 — A4 V8/V6 TDI 8D + Allroad 2.0 TDI CR + A5 1.8 TFSI

- Pair #533 · A4 4.2 V8 RS4 0261S02165 8E1907560 sw379578 — **2MB
  MED17 RS4 308kW (420hp)**, sister of pair #530 (RS4 0261S02205).
  Only 13 regions, 6.2KB tune. Big ones at 0x1E33E0 / 0x1C2190
  (limiter ceilings) and 0x1CA7D0 = **5760-byte loose region** which
  is the main fuel/torque axis recal. Same ECU def family as 0261S02205.
- Pairs #534-535 · **A4 V6 TDI 0281001838 8D0907401C** — 256KB EDC15
  V6 TDI 110.3kW (150hp). RARE V6 EDC15 (most A4 V6 went straight to
  EDC16). Two pairs same exact ROM, different SW serial decode (one
  blank, one 359337-338). **Identical offsets**: 0x03C4F0/0x03C7FC/
  0x03C824 +60-110% (LSMK-style boost), 0x03EE2C +55% (LDRXN). Cal
  region at top-quarter of 256KB ROM. **NEW ECU family candidate** —
  C167 16-bit V6 EDC15 not in ecuDefinitions.ts.
- Pair #536 · A5 8K1907401A sw516682 — same SW as pair #522 (3.0 V6
  TDI DPF). Filename strips engine but offsets at 0x1E3C8C / 0x1E3D5A
  are classic V6 TDI EDC17 C46. Likely identical ROM to pair #522.
- Pair #537 · A5 MED17 2.0 TFSI 8K2907115P sw398607 — 256KB MED17.
  Real maps at 0x021042 12×11 (+4.6% — boost target?), 0x011988 144B
  +28.5%, 0x01601D 120B +118% (cyl-fill / charger). **Wire as variant
  of MED17 2.0 TFSI** under existing `med17_2_0_tfsi` if dims match.
- Pairs #538-540 · A5 1.8 TFSI 8T0907115A sw394367 — 3 pairs ALL same
  SW. #538 256KB / #539 2MB / #540 256KB. Same offsets across the two
  256KB pairs at 0x01C6F4 + 0x019xxx. #539 (2MB) is a different dump
  format entirely (full SGO with multiple banks). **Wire 8T0907115A
  sw394367** as a variant: 0x01C68C 80B +216% (turbo air-mass), 0x01C6F4
  8B +223% (LDRXN ceiling), bunch of 0x019x 6-8B regions = limiter table.
- Pair #541 · A5 1.8 TFSI 8K1907115 sw509715 — different part number,
  different cal layout. 1.5MB intermediate dump. Maps at 0x053043
  +137% (likely IQ ceiling), 0x05B364 +27% (limiter).
- Pair #542 · (next batch — A5 2.0 TDI CR coming up)

**Cross-pair confirmation**: pair #528 (Allroad 03L906022BQ sw397899)
shows the same big-change offsets `0x1EF502` and `0x1EFF46` as our
already-wired `edc17_c46_398757` ECU def. So 03L906022BQ sw397899
shares the same map layout — likely the same SGO base. Could add
identString for `'03L906022BQ'` to that ECU def.

**Cross-pair confirmation 2**: pairs #527 + #529 (Allroad 03L906022FG
sw506125 and sw506148) **both** hit `0x1EE4F2` (2KB) + `0x1EEF36` (512B)
+ `0x1EED14` (512B) — same layout, different SW. NEW variant candidate
`edc17_c46_506xxx_FG` for the 03L906022FG family.

**Cross-pair confirmation 3**: pairs #530 + #531 (Allroad 03L906018ES
sw522905 + 03L906018DN sw513687) hit completely DIFFERENT offsets in
the LOWER cal region (0x06CC76 / 0x06AD6A). These are the NEWER 2012-13
C46 variants where Bosch moved cal blocks lower in the ROM. Separate
variant candidate.

**Code: no immediate change** — too many variant candidates piling up.
Plan an `edc17_c46_variants` table with `[sw, partno, mainBoostOffset,
mainIQOffset, ...]` rows that the loader matches against, instead of
spawning dozens of EcuDefs.

## Pairs #518–532 — A4 3.0 TDI DPF + 3.2 FSI Siemens + 4.2 V8

- Pairs #518-520 · A4 3.0 V6 TDI CR 2013 more 03L906018JL SW 522910 /
  522924 ×2. Classic CP44 Stage 1 depth.
- Pair #521 · A4 3.0 V6 TDI CR DPF 8E0907401AL sw382432 — pre-CP44.
- Pair #522 · A4 3.0 V6 TDI CR DPF 8K1907401A sw516682 — **1,448,495 B
  changed (69%)** full recal.
- Pair #523 · A4 3.0 V6 TDI CR DPF 8K1907401A sw502378 5.6KB.
- Pair #524 · "SuperMappack" Audi A4 3.0 — 1.6MB weird size, **only
  6 bytes changed** — mappack checksum-only tweak, not a real tune.
- Pair #525 · A4 3.0 V6 FSI **petrol** (not TDI) Bosch 0261207473 —
  A4 3.0 V6 FSI 218ps petrol 1MB ME7.x. 1,373 B.
- Pair #526 · A4 3.0 V6 TDI early 0281013616 4F0907401C — EDC15P+/
  EDC16 V6 TDI non-CR generation.
- Pair #527 · A4 3.0i 240ps petrol 0261207839 1MB ME7.x 2.7KB.
- Pairs #528-529 · **A4 3.2 FSI V6 SIEMENS** 2MB. 5WP4514 prefix,
  8E0907559A/J part numbers, S6200L3R00000 / S6200P3000000 serials.
  This is the **Siemens/Continental SIMOS 7-series** for 3.2 FSI.
  Tiny ~500 B tunes (FSI V6 rarely tuned meaningfully).
  NEW ECU family — `5WP4514` + Siemens 3.2 FSI not in ecuDefs.
- Pair #530 · A4 4.2 V8 FSI Bosch 0261S02205 2MB MED17 308kW (420hp —
  **RS4 V8**). 1.7KB light tune.
- Pairs #531-532 · A4 4.2 V8 petrol 2006 Bosch 0261207994/208684 1MB
  ME7.x 253kW (344hp). Audi A4 S4 V8. 1.5-1.8KB tunes.

**Code gap**: Siemens 3.2 FSI (5WP4514 / S6200* serials) is another
family not yet in ecuDefinitions.ts. Low tuning volume so low priority.

**Code: no change**.

## Pairs #503–517 — A4 3.0 V6 TDI CR EDC17 CP44 catalog

15 more pairs — mostly A4 3.0 V6 TDI CR 2008-2012 EDC17 CP44
variants (176.5kW / 240ps).

Part numbers in this chunk: 8K0907401E/F/P, 8K1907401A (most common),
4G0907401 (newer gen). Plus crossover hits to A4 2.0 TDI CR already
catalogued (03L906018ES sw521079, 03L906018JL sw522942, 03L906019AL
sw517566, 03L906022BQ sw398756, 03L906022B sw396469, 03L906022FG
sw506127).

SW bases for 3.0 V6 TDI CR: 397833, 397836, 399371, 501408, 502378,
507647, 516617, 516620, 528339.

Tunes 3.7-15.1KB typical.

**Outliers**:
- Pair #510 · 03L906022B sw396469 — 1,546,425 B (73.7%) full recal.
- Pair #516 · 03L906019AL sw517566 — 249,401 B (11.9%) heavy recal.

**Confirming earlier finding**: 8K1907401A sw 516617 matched Pair #515
(4,763 B) — this SW was in the v3.5.34 batch-analysis data as a
high-pair-count variant. Candidate for per-SW code wiring when
prioritising V6 TDI CR coverage.

**Code: no change**.

## Pairs #488–502 — A4 2.7 TDI CR DPF + 3.0 V6 TDI EDC17 CP44 early

- Pairs #488-490 · A4 2.7 V6 TDI CR DPF 2010 2MB EDC17 CP44 139.7kW.
  8K0907401 / 8K1907401A. SW 392966 / 394958 / 504886. 4.3-6.5KB.
- Pair #491 · A4 2.7 V6 TDI 512KB stripped cal EDC17 8K0907401 sw394958.
- Pairs #492-494 · **A4 3.0 V6 TDI 2004-2005 pre-CR** 512KB EDC15/EDC16P+.
  8E0907401AJ (150kW / 204ps) — older 3.0 TDI before CP44. SW 374488,
  374417, 383300.
- Pairs #495-499 · A4 3.0 V6 TDI 2006 EDC16P+ cal variants.
  8E0907401AJ/AL various SW (376566, 378837, 379709, 383300, 383301).
  5.4-7.9KB tunes.
- Pairs #500-501 · A4 3.0 V6 TDI 2008 **2MB EDC17 CP44** —
  4E0907401C sw377109 / 8E0907401AJ sw377112. 1.2KB light tunes.
  These are early EDC17 CP44 before the 2010+ SW families.
- Pair #502 · A4 3.0 V6 TDI CR 2004 2MB 8E0907401AJ sw374488 —
  **413,585 B changed (19.7%)** — outlier large recal.

**Code: no change**. 3.0 V6 TDI now seen across CP44 SW families
516613/516617/518178/516623 (earlier batch) + 377109/377112 (this
batch) — these would be prime candidates for a variant def.

## Pairs #473–487 — A4 2.6 V6 petrol + 2.7 V6 TDI EDC17 CP44

- Pair #473 · A4 2.5 TDI VP 2004 1MB Bosch 0281011386 / 8E0907401N —
  9,619 B moderate tune, EDC15P+.
- Pairs #474-475 · **Audi A4 2.6 V6 petrol 1995-1996** — 65KB / 32KB
  Bosch+Hella "5DA007193" numbers. These are Audi's OLDEST ECUs
  (ABC/AAH engine codes, Motronic M2.4 / M2.8, pre-ME7). Out of
  scope for our current ECU defs — too old to meaningfully tune.
- Pairs #476-478 · **A4 2.7 V6 TDI 2006-2007** (pre-CR, VP?) —
  8E0907401AL 512KB EDC15P+/EDC16 PD. SW 380781, 391560, 383855.
- Pair #479 · A4 2.7 V6 TDI CR 2009 2MB EDC17 CP44 139.7kW (190ps).
  `8K1907401K` sw516657 — 2,735 B / 0.13%. **EDC17 CP44 V6 TDI CR**
  — same family as 3.0 TDI CR we already have in log.
- Pair #480 · A4 2.7 V6 TDI (mislabeled TFSI in name) 2MB 384614 sw
  — **639,213 B changed (30.5%)** — full recal outlier.
- Pair #481 · A4 2.7 V6 TDI CR 2007 pre-CP44 512KB 8E0907401AL sw379733.
- Pair #482 · A4 2.7 V6 TDI CR 2008 8K1907401A sw516665 — CP44, 5.7KB.
- Pair #483 · A4 2.7 V6 TDI CR 2008 CP44 sw516657 **134,263 B (6.4%)**
  — heavy tune or partial recal.
- Pair #484 · A4 2.7 V6 TDI CR 2008 CP44 sw516664 5.7KB.
- Pair #485 · A4 2.7 V6 TDI CR 2008 CP44 sw399319 3.5KB.
- Pair #486 · A4 2.7 V6 TDI CR 2009 8K1907401F CP44 sw392964 512KB 2.5KB.
- Pair #487 · A4 2.7 V6 TDI CR 2011 CP44 sw514634 5.7KB.

**Family observation**: The EDC17 CP44 2.7 V6 TDI CR variants
(`8K1907401*`) have **SW versions 516657 / 516664 / 516665** all
showing 5.7KB tunes with similar pattern. Same engine family as
3.0 TDI CR. Candidates for a shared EDC17 CP44 V6 TDI variant def
once we wire more code.

**Code: no change**.

## Pairs #458–472 — A4 2.5 V6 TDI EDC15P+ catalog

15 pairs of Audi A4 2.5 V6 TDI (AFB/AKE/BAU/BCZ engines, 150-180ps).

Part numbers: 0281010146/158/492/493/823/825, 0281011255/388/435/444,
0281012142 — ALL Bosch EDC15P+ family (0281010-0281012 prefixes,
covered by v3.5.37 edc15 identStrings).

VW parts: 8D0907401P, 3B0907401G, 8E0907401 (various suffixes C/D/H/M/
S/T/AF). Audi A4 V6 TDI 2.5 specific.

Sizes: 256KB cal-only, 512KB stripped, 1MB full.

Tunes vary widely — 720 B to 24,200 B. The 2005 120kW 0281011444 pair
#468 has **24,233 B changed** which is very heavy for EDC15 (maybe
full recal rather than delta Stage 1).

**Code: no change** — EDC15 signature detection + existing maps handle
these. If we dedicate a V6 TDI variant later, these SW/part lists will
be the basis.

## Pairs #443–457 — A4 2.0 TFSI newer + 2.4 V6 ME7 + 2.5 V6 TDI EDC15V

- Pairs #443-444 · A4 2.0 TFSI 2008-2009 on 8K/8P 907115* parts (later
  Audi A4 B8 MED17.1.6). SW 398177 / 396770.
- Pair #445 · A4 2.0 TFSI 2009 8K2907115L sw506775 2MB 1,061 B light.
- Pairs #446-448 · A4 2.0 TFSI 256KB cal dumps (8K2907115 P/A/N)
  2,000-2,500 B. Standard EA888 Gen2 Stage 1 depth.
- Pair #449 · 2.0 TSI 2009 SIZE MISMATCH — skipped.
- Pairs #450-454 · **A4 2.4 V6 FSI / ME7.x** 1MB Bosch 0261208038/039/122
  with 8E0909052/552* parts. Small ~1KB tunes. New ECU family — A4
  2.4 V6 "ASN" engine petrol on Bosch ME7.1 style (before ME9).
- Pairs #455-456 · **A4 2.5 V6 TDI / EDC15V** 256KB files (0281001834
  — EDC15V prefix I added in v3.5.37). Classic 2.5 V6 TDI AFB/AKE/BAU
  110-132kW.
- Pair #457 · A4 2.5 V6 TDI 180ps 0281010823 / 8E0907401D 512KB EDC15
  sw363778 2,680 B — EDC15 PD variant on 2.5 TDI.

**Code: no change** — all family-detected via existing me7/edc15
defs, plus the 0261208038-122 variants would benefit from a note
("A4 2.4 V6 FSI ASN ME7.1") in me7 def comment.

## Pairs #428–442 — A4 2.0 TFSI 2005-2008 MED17 200/220ps SW catalog

15 more A4 2.0 TFSI 2MB MED17 pairs (147-162kW / 200-220ps).

New SW bases: 372543, 374394, 377605, 377617, 381979, 383978, 386454,
386835, 386863, 387400, 387401, 387403 (×2), 389075, 390728.

New Bosch prefixes: 0261S02144, 0261S02145 (×4), 0261S02223, 0261S02224,
0261S02458, 0261S02463, 0261S02521.

All use 8E0907115C/D VW part numbers (Audi A4 B7 2.0 TFSI).

Tunes are uniformly small (500-2200 B) — typical light MED17 1.6
Stage 1 (boost + fuel only). Pair #433 is 61 B near-no-op.

Pair #442 has an odd "73890758E19" embedded — looks like concatenated
filename; tuner probably inserted part# wrong.

**Code: no change** — covered by generic med17 def.

## Pairs #413–427 — A4 2.0 TDI ppd (PPD1.2) mixed SN serials + A4 2.0 TFSI

- Pair #413 · 03G906018AQ SN1S0M8000000 2MB heavy tune 5,419 B.
- Pairs #414-416 · AQ 256KB cal-dumps various SN (SN100L8, SN100L6, SN100L4).
- Pair #417 · **NEW part 03G997256C** with SN100L4000000 — this is a
  service-replacement ECU part number (03G997 prefix = VAG replacement
  label for PPD1.2). Same map layout as the DH/AQ part numbers it
  replaces. Should add to vag_ppd1 identStrings.
- Pair #418 · AQ SN1R0M8000000 2MB 13,980 B.
- Pair #419 · AQ SN100L8000000 2MB 17,642 B (heavy).
- Pair #420 · AQ SN100L8000000 2MB **247 B** light — the same pair
  I analysed originally as Pair #2 (v3.5.30 docs).
- Pairs #421-423 · Various PPD1.2 AQ + DH 256KB cal dumps.
- Pair #424 · AQ SN100L6000000 2MB 2,744 B light.
- Pairs #425-428 · **A4 2.0 TFSI 2002-2005 2MB MED17** — 0261S02096,
  0261S02211, 0261S02210, 0261S02362 with 8E0907115C/D part numbers.
  First 2.0 TFSI on MED17 in the Audi A4 series (147kW / 200ps).
  Tunes 1,000-6,600 B.

**CODE CHANGE**: Add `03G997256C` to vag_ppd1 identStrings — service
replacement part number that shares PPD1.2 cal layout.

## Pairs #398–412 — A4 2.0 TDI PD 2005-2008 EDC16 PD SW catalog

15 more A4 2.0 TDI PD 103hp EDC16 PD pairs (512KB + 2MB mix).

New SW bases: 378330, 380416, 381377, 383294, 383711, 389287, 389844,
390981, 390982, 391501 (×2), 391502, 391503, 393546.

VW part numbers: 03G906016CL (×4), 03G906016GN (×2), 03G906016JD,
03G906016JE, 03G906016KM (×2), 03G906016KN (×2), 03G906016LQ (×2),
03G906016MH.

Tunes consistent 800-3,300 B for 512KB stripped, 2,100-2,500 B for
2MB. Typical light EDC16 PD Stage 1 profile.

Plus Pair #407 · A4 2.0 TDI PD 2007 Siemens 03G906018AQ SN100L6000000
16,179 B / — AQ heavy tune consistent with earlier AQ pairs (all ~15-16KB).

**Code: no change** — EDC16 PD generic catchall works.

## Pairs #383–397 — A4 2.0 TDI CR 2014 + DPF variants + EDC16 PD

15 more pairs:
- Pairs #383-386 · A4 2.0 TDI CR 2014 03L906018JL — SW 522944,
  1037517561, 532876, 524104. Tunes 3.3-10.6 KB.
- Pair #387 · A4 2.0 TDI CR DPF 03L906018JL sw 522824 — DPF variant.
- Pairs #388-391 · A4 2.0 TDI CR DPF variants — 03L906022B sw400963 /
  sw505497, 03L906018JR sw515572, 03L906019AL sw517566.
- Pair #392 · Audi A4 2.0 TDI CR DPF 2012 — ONLY 33 bytes changed /
  2 regions = near-no-op or checksum-only update.
- Pairs #393-397 · A4 2.0 TDI PD 2004-2005 512KB/2MB EDC16 PD variants
  — 03G906016FP, 03G906016CL, 03G906016GN (×2), 03G906016LQ.

**Code: no change**. Running total: 397 of 1,270 (31.3%).

## Pairs #368–382 — A4 2.0 TDI CR 2012-2014 EDC17 C46/C64 continued

15 more A4 2.0 TDI CR 2012-2014 pairs. Predominantly 03L906018JL
(now the most common VW part# across this library). SW bases:
515516, 516684, 518002, 518005, 519317, 521650, 522909, 522924 (×2),
522942, 526365, 528366, 528367, 532876, + long Bosch IDs
1037522944 / 1037524103.

Tunes 3,800-11,900 B. 03L906018JL now seen across 20+ SW versions —
strongest candidate for a per-variant family-code entry to catch
multiple SW bases with one def.

**Code: no change** — deferred. Continuing to catalogue.

## Pairs #353–367 — A4 2.0 TDI CR 2011-2012 EDC17 C46/C64

15 more A4 2.0 TDI CR pairs. Part numbers: 03L906019AL, 03L906018DN,
03L906018JL, 03L906022NP, 03L906022RM. SW bases: 502340, 505903 (×2),
515516, 515572 (×3), 517518, 517561, 517566, 518003, 522922, 522924,
522942 (×2). Tunes 2,300-10,500 B.

03L906018DN sw515572 showing up on multiple 100kW variants — stable
pattern. 03L906018JL SW 522922 / 522924 / 522942 (3 consecutive SW
versions) all 8,500-9,500 B tunes — same tuning depth, different SW.

**Code: no change**. Another set of consistent SW versions to
consider for per-variant code wiring later.

## Pairs #338–352 — A4 2.0 TDI CR 2010 EDC17 C46/C64 more SWs

15 more pairs. New SW bases this batch: 500116, 515572, 515518, 518002,
518004, 397899, 515287, 516684, and 1037517518 (long Bosch numeric ID).
New part number 03L906018JR seen. 03L906018DN also appears (the Q5
2010 2.0 TDI 03L906018DN sw515568 from earlier batch data).

**Outlier**: Pair #346 (03L906019AL sw518002) — 1,538,233 B changed
(73.3%) — another full recal by the same tuner who did pair #305/308.

**Code: no change**. The C64 03L906019AL catalog now has 15+ SW
versions documented — solid target for future per-variant code
wiring if/when we prioritise 2010-2011 A4/A5/Q5 2.0 TDI CR owners.

## Pairs #323–337 — A4 2.0 TDI CR 2009-2010 EDC17 C46/C64 continued

15 more A4 2.0 TDI CR pairs. SW bases in this chunk:
500118 / 500119 / 500121 / 500141 / 500141 / 504744 / 396472 /
396484 / 502340 / 515287 / 517566 / 521650 / 521651 / 517561.

Mix of 512KB stripped cal and 2MB full binaries. New part number
03L906022JN. Tunes 1,800-10,400 B typical. Consistent EDC17 C46
Stage 1 depth.

SIZE MISMATCH skip: pair #336 (03L906022NN sw505476).

**Code: no change** — existing defs cover these. 03L906019AL
C64 variant now seen across 10+ pairs (502340/515287/517566 etc.)
reinforcing the candidacy for a dedicated per-variant def later.

## Pairs #308–322 — A4 2.0 TDI CR 2008-2009 EDC17 C46 more SW bases

15 more A4 2.0 TDI CR EDC17 C46. New SW bases: 400967, 399350, 500141,
500115, 500121, 500122, 500123, 500153, 517561. Mix of 512KB stripped
cal and 2MB full binaries. Tunes 1,800-10,600 B typical Stage 1.

New VW part numbers seen: 03L906022SB/FG, 03L906022ML, 03L906022NN,
03L906022MG. All variants of the same 2.0 TDI CR 140ps engine (some
88/100/105/125kW output-specific).

**Outlier**: Pair #308 (sw 396468) — 1,546,744 B changed (73.8%) —
full recal, match to earlier pair #305 pattern (same tuner/shop).

**Code: no change** — EDC17 C46 generic signature detection covers
all of these.

## Pairs #293–307 — A4 2.0 TDI CR 2008 EDC17 C46 SW catalogue

15 more 2MB / 512KB Audi A4 2.0 TDI CR 2008 EDC17 C46 pairs. Primary
variants:
- 03L906022B (no suffix) with SW 392984/396468/396469/396470/396472/
  396483/396484/398757/503995/505924/505962/519399 — 10-13 SW bases.
- 03L906022JM sw396470
- 03L906022JP/03L906022B sw396469
- 03L906022MA/03L906022BQ sw398757
- 03L906022FG sw503995

Tunes typically 5-11KB, consistent EDC17 C46 Stage 1 depth.

**Outlier**: Pair #305 (03L906022B sw396484) — 1,547,404 B changed
(73.8%) — full recal, not a Stage 1 delta. Skip for cross-reference.

**Code: no change** — all within existing edc17 / edc17_c46_398757
territory. SW 396483 / 396468 / 396469 / 396470 / 396472 / 505924 /
505962 / 519399 could potentially each get a per-SW def similar to
v3.5.35 if we commit to the extra code volume. Not wiring speculatively.

## Pairs #278–292 — A4 2.0 TDI CR EDC17 C64 03L906019AL catalogue

15 more pairs, mostly Audi A4 2.0 TDI CR EDC17 C64 variants with
03L906019AL VW part number (the 2010-2012 generation). SW versions:

502350, 505477, 505952, 515516, 516641, 517565, 517566 (×2),
518751, 518752, 522896 + 03L906018AG sw 508208, 03L906018LD sw 522896,
03L906022DL sw 396483, and two more 03L906022B sw 396484 variants.

Tunes 2,000-10,000 B / 60-200 regions. Stable C64 behavior across SW.

**Code: no change** — covered by existing edc17 detection logic.
Notable: 03L906019AL SW 502350 / 505952 / 515516 / 516641 / 517565
/ 517566 could be a good set for a future EDC17 C64 per-variant
code entry (similar to v3.5.35's edc17_c46_398757) once we decide
on consensus Stage 1 offsets for this SW family.

## Pairs #263–277 — A4 2.0 TDI PD/CR + EDC17 C46/C64 continued

- Pair #263 · A4 2.0 TDI 2006 2MB EDC16 PD 03G906016LR sw386343, 3,576 B.
- Pairs #264-265 · 512KB EDC16 PD 03G906016KN/KP (2007).
- Pair #266 · A4 2.0 TDI 125kW Siemens (NO part#) SN100L4000000 2MB
  PPD1.2 — 15,986 B / 62 regs. Part number missing from filename but
  SN100L4000000 identifies as DH family.
- Pairs #267-268 · A4 2.0 TDI 2007 PPD1.2 03G906018AQ — 250KB partial
  and 2MB full. SN1R0M8 serial 15,508 B heavy tune.
- Pair #269 · 2MB EDC16 PD 03G906016GN sw383292 — only 515 B tune.
- Pair #270 · 512KB EDC16 PD 03G906021AB sw393514 2,682 B.
- Pair #271 · A4 2.0 TDI 125kW PPD1.2 03G906018AQ SN100L4000000
  16,159 B — consistent AQ heavy pattern.
- Pairs #272-273 · A4 2.0 TDI CR 2008 512KB EDC17 C46 — 03L906022B
  sw396484, 03L906022KC/B sw396477. 3-5K bytes.
- Pair #274 · A4 2.0 TDI CR 2009 512KB EDC17 C46 03L906022DL sw518751.
- Pairs #275-276 · A4 2.0 TDI CR 2010 2MB EDC17 C64 03L906019AL —
  SW 504773 / 505903. ~6KB tunes / 180-200 regs. Same C64 family as
  pairs 84 & 235 in earlier logs.
- Pair #277 · A4 2.0 TDI CR 2010 2MB EDC17 C46 03L906022B sw396472.

**Code: no change** — these all fall under our existing `edc15`,
`edc16`, `edc17` (+ variant), and `vag_ppd1` (already wired).

## Pairs #248–262 — more A4 2.0 TDI PD + 3 new PPD1.2 SN serials

15 more pairs:

- Pair #248 · A4 2.0 TDI 125kW PPD1.2 03G906018AQ **SN100K5400000**
  — new SN100K5 variant of AQ. 15,483 B heavy tune.
- Pair #249 · same AQ SN100L6000000 — 249856 B partial cal dump.
- Pair #250 · A4 2.0 TDI PD 103hp 03G906016MF sw391830 2MB EDC16 PD.
- Pair #251 · 512KB EDC16 PD 03G906016GC sw380439 2,852 B / 199.
- Pair #252 · 2MB EDC16 PD 03G906016JD sw378340 1,755 B.
- Pair #253 · 2MB EDC16 PD 03G906016KM sw386351 1,954 B.
- Pair #254 · 2MB EDC16 PD 03G906016KN sw389287 1,954 B —
  IDENTICAL bytes-changed and region count to #253 — same tuner
  applying same pattern to different SW binaries.
- Pair #255 · A4 2.0 TDI PPD1.2 AQ **SN100L6000000** sw — the
  heaviest AQ tune I've seen: 14,177 B / 131 regs.
- Pairs #256-258 · **THREE** PPD1.2 AQ with NEW SN serials —
  SN1S0M8000000 (101,271 B / 101 regs — 4.8%),
  SN1R0M8000000 (100,641 B / 91 regs — 4.8%),
  SN1R0M8000000 (102,921 B / 88 regs — 4.9%).
  These three look like **full recals**, not Stage 1 diffs.
- Pairs #259-262 · 512KB EDC16 PD A4 2.0 TDI 2006 variants —
  03G906016FP sw389839, 03G906016KN sw391503 (2 copies), sw380410.

**CODE CHANGE**: Add `SN1R0M8000000`, `SN1S0M8000000`, `SN100K5400000`
to vag_ppd1 identStrings. These are three more PPD1.2 AQ SW serial
generations seen in this batch.

**Outlier note**: Pairs #256-258 had 4.8% changed (~100 KB) which is
way beyond a typical Stage 1 (<1%). These are probably full recal
swaps (replaced the whole cal block with a performance cal), not
delta tunes. Treat as reference only.

## Pairs #233–247 — A4 1.9/2.0 TDI PD continued + first PPD1.2 FG variant

15 more Audi A4 TDI pairs:

- Pair #233 · A4 1.9 TDI PD 2006 512KB EDC16 PD 03G906016GD sw392909.
- Pair #234 · A4 1.9 TDI PD 2008 **2.5MB** file (2626048 B, unusual —
  probably full ECU dump including code section) 03G906016GD sw392909
  6,147 B / 301 regions.
- Pair #235 · A4 2.0 TDI 88.3kW 2010 **03L906019AL sw517566** 2MB —
  EDC17 C64 (same variant seen in earlier batch — multiple pairs).
- Pairs #236-237 · A4 2.0 8V 2001 1MB ME7.5 non-turbo petrol (8E0907557).
- Pairs #238-239 · A4 2.0 TDI 103hp 2MB EDC16 PD 03G906016JE / 03G906016KN.
- Pair #240 · A4 2.0 TDI 103hp 2002 EDC16 PD 03G906016FQ sw382419.
- Pair #241 · A4 2.0 TDI 103hp 2002 EDC16 PD 03G906021AN sw390138.
- Pair #242 · **NEW PPD1.2 variant** — A4 2.0 TDI 125kW Siemens
  03G906018DH SN100K5300000 (already in our identStrings). 3,200 B.
- Pair #243 · **NEW PPD1.2 part number** — 03G906018FG SN100L3000000.
  11,358 B / 84 regs. Different part number from DH/AQ. Need to
  add FG to vag_ppd1 identStrings.
- Pairs #244-247 · More A4 2.0 TDI 103hp 2004 EDC16 PD variants —
  03G906016KN / 03G906016GN / 03G906016FP / 03G906016KN (again).

**CODE CHANGE**: Add `03G906018FG` to vag_ppd1 identStrings — new
PPD1.2 variant seen for the first time. Offset behaviour TBD but
detection should recognise it. Also add `SN100L3000000`.

## Pairs #218–232 — A4 1.9 TDI EDC15 + EDC16 PD continued

15 more Audi A4 1.9 TDI pairs, mostly 512KB EDC15 and 2MB EDC16 PD:

- Pairs #218-225 · 512KB EDC15 2001-2002 1.9 TDI 85/100/130hp —
  0281010302/304/729/669/669 variants. 700-3500 B light-moderate Stage 1.
- Pairs #226-228 · 512KB EDC15 2003 1.9 TDI 130hp — 0281011036/142/222.
- Pair #229 · 2004 1.9 TDI 100hp EDC15 0281010813 2590 B / 36.
- Pair #230 · **2MB EDC16 PD** 2004 A4 1.9 TDI 103hp 0281012127
  / 03G906016FE 1,075 B / 27.
- Pair #231 · 2MB EDC16 PD 2005 A4 1.9 TDI 115hp 03G906016HA 2,026 B.
- Pair #232 · 2MB EDC16 PD A4 1.9 TDI PD 03G906016GD 6,428 B / **303
  regions** — heavy tune (unusual for 1.9 TDI PD).
- Pair #232 alt · 512KB 2002 A4 1.9 TDI PD 131hp 0281010729.

**Code: no change** — EDC15 + EDC16 PD signature detection handles
these via existing `edc15` / `edc16` defs.

## Pairs #203–217 — Audi A4 1.9 TDI EDC15 / EDC15P+ catalogue

Classic Audi A4 1.9 TDI 90/110/130hp + pre-PD non-turbo variants:

- Pair #203 · A4 1.8T 2003 1MB ME7.5 (dup of 194) — same tune.
- Pairs #204-207 · A4 1.9 TDI **256KB EDC15V** (0281001xxx Bosch part
  numbers) — pre-PD variants, 1.9 TDI 90hp (AFN/AHU/AHH/1Z engine
  codes). 700-3200 B / 50-165 regs. Family hint missed these —
  0281001xxx should map to `EDC15V` not "?" in my regex. TODO.
- Pair #208 · 038906012AJ 524288 B EDC15 (66kW / 90hp 2000) 1,127 B.
- Pair #209 · 038906019GG 524288 B 74kW / 100hp 1.9 TDI AKN 4,103 B.
- Pair #210 · 03G906016JA 524288 B 85kW / 115hp (NEW: 03G906016JA
  part) — EDC16 PD 512KB. 3,336 B / 154 regs.
- Pair #211 · 038906019CG 524288 B 96kW / 130hp 1.9 TDI 1,306 B.
- Pair #212 · 038906019LJ 524288 B 96kW / 131hp 2,313 B.
- Pairs #213-214 · Two more 256KB EDC15V A4 1.9 TDI 90hp 1998.
- Pairs #215-217 · A4 1.9 TDI 80kW / 110hp 2000-2001 512KB EDC15.

**Code change opportunity**: EDC15V 256KB detection — filename
regex `0281001xxx` should classify as EDC15V (pre-PD non-unit-injector
variant used on 1998-2001 A4/A6 1.9 TDI 90/110hp). Our `edc15`
identStrings already include `0281010`-`0281013` but not `0281001`.
Adding it would improve detection for these older pairs. Logging
for a follow-up commit.

## Pairs #188–202 — A4 1.8T/1.8 TFSI ME7.5 + MED17 catalogue continued

More A4 1.8T ME7.5 1MB + A4 1.8 TFSI 256KB/2MB MED17.1.1 variants:

- Pairs #188–192 · A4 1.8 T 2004-2005 ME7.5 1MB (0261208228 family),
  SW versions 368069 / (various). 1200-3000 B.
- Pairs #193–197 · A4 1.8 TFSI 256KB cal dumps (EA888 Gen1) —
  0261201672 / 8K1907115D / 8K1907115H etc. SW 389460, 398628, 398674,
  398138, 394389. 248-2931 B light-to-moderate tunes.
- Pair #198 · A4 1.8 TFSI 256KB size-mismatch — skipped.
- Pairs #199–202 · A4 1.8 TFSI 2MB full binaries. SW 503660, 503655,
  502174, 523728 — MED17.1.1 newer-gen binaries. 222-1686 B tunes.
- Pair #203 · A4 1.8i 1999 524288 B ME7 (pre-turbo) 0261204873.
- Pair #204 · A4 1.8T 2002 524288 B (same 4B0906018K / 0261204897 as
  my pair #5 original) — 864 B / 20 regs. Different tune of same file.

**Code: no change** — me7/med17 defs cover these.

## Pairs #173–187 — 15 more Audi A4 1.8T ME7.5 1MB SW variants

All 1MB ME7.5 Audi A4 1.8T (150/180/225ps). Bosch 0261206xxx /
0261207xxx / 0261208xxx part numbers with 8E0909018* VW part.
Tunes are consistently small (300-2500 B / 15-65 regions), matching
typical ME7.5 Stage 1 profile (boost + fuel raise, maybe timing).
Family detection works via existing `me7` ECU def — no per-variant
entry needed. Notable: Pair #182 is a NEAR-NO-OP (34 B / 1 region)
— effectively stock.

SW versions in this chunk: 368075, 352051, 354008, 366494, 355966,
360990, 369307, 366871, 369011, 363466, 369013, 352051 (dup),
363497, 366883, 368075 (dup).

**Code: no change** — ME7 existing def covers this territory.

## Pairs #158–172 — A4 1.8 20V NA + A4 1.8T ME7.5 1MB petrol catalogue

More Audi A4 early petrol pairs:

- Pairs #158–166 · 9 more 128KB and 512KB Audi A4 1.8 20V NA petrol
  variants on Bosch ME7.0-7.5 (various 0261203xxx-0261206xxx + Bosch
  524288 B ME7.5). Tiny to moderate tunes (300-2000 B).
- Pair #167 · A4 1.8 20V 524288 B (512KB) 0261204873 sw 350722 —
  third variant of this SW (pairs #159 and #167 both), same tune.
- Pair #168 · 1.8 20V 131072 B 0261204183 sw 357479 917 B / 12 regs.
- Pair #169 · Audi A4 1.8 T 1MB Bosch (no SW in filename) — only
  56 bytes / 4 regions. Near-no-op tune.
- Pairs #170–173 · A4 1.8 T 1MB ME7.5 variants — 0261207779
  (sw 363467), 0261207934 (366381), 0261208228 (369311), 0261208230
  (369307) — all with 8E0909018 VW part family. 833-1741 B / 47-65
  regs. Classic 150/180ps 1.8T ME7.5 Stage 1 profiles.
- Pair #174 · A4 1.8 T 132.4kW (180ps) 0261206790 / 8L0906018Q
  sw 360287 1MB — **547,636 B changed (52%)** — FULL RE-CAL / not
  a Stage 1 diff. Tuner swapped the whole cal block.

**Code: deferred**. The ME7.5 1MB 1.8T 150/180ps variants (pairs
170-173) are our existing `me7` def territory — signature-based
detection should already catch these. No per-variant work needed.

## Pairs #143–157 — Audi A4 1.8 TFSI 256KB + ME7.1 128KB 1.6/1.8 NA petrol

- Pairs #143–145 · A4 1.8 TFSI 256KB cal dumps — 0261201961 / 8K1907115D
  (398674), 8K1907115C (503660) — all ~900 B light Stage 1 tunes.
  EA888 Gen1 1.8 TFSI on Bosch MED17.1.1.
- Pairs #146–147 · A4 2.0 TFSI "USA Stage1ell" 2009 (155.2kW / 211hp)
  — 8K2907115D (397281) and 8K2907115P (500889). 256KB cal dumps,
  moderate ~2000 B tunes. Probably MED17.1.6.
- Pair #148 · A4 1.4 TSI 2010 · 03C906016S sw 505087 (256KB).
  1,782 B / 26 — duplicate of pair #33's full-file analysis at a
  different binary form. Same Stage 1 pattern.
- Pair #149 · **Audi A4 1.6 8V 1998 · 0261203555 / 3B0907557B sw 17043
  128KB** — first 128KB ME7.0/ME7.1 seen. 617 B / 5 regs, tiny tune
  on naturally-aspirated 1.6. Not a high-value tuning target.
- Pairs #150–157 · 9 more 128KB Audi A4 1.6/1.8 ME7 NA petrol variants
  (0261203xxx / 0261204xxx Bosch part numbers, 8D0907557* VW part).
  All 128KB, small 500-2200 B tunes. ME7.0/ME7.1 NA petrol calibrations.
  NOT a realistic tuning target — NA 1.6/1.8 doesn't gain much from
  software. Common modifications seen: ignition timing adjust, rev
  limit, speed limiter.
- Pair #158 · Siemens 5WP4422 / 8E0906018AM S34C039000000 (2005 A4 1.6
  petrol) 512KB. Only 306 B / 3 regs. Siemens Simos 8.1 probably.

**Code: deferred**. Note: the 128KB ME7.0/ME7.1 NA petrol binaries
here are essentially legacy — Bosch ME7 was superseded. Low priority
for per-variant code entries. Our `me7` generic def should catch
these via signature detection.

## Pairs #128–142 — more MED17 2.0 TFSI 200ps + first V6 3.2 FSI ME9.1

- Pair #128 · MED17 0261S02517 / 8P0907115B sw 387458 (2005) 2MB,
  2,707 B / 48 regs. Duplicate SW # from earlier pair #120 but
  different file hash.
- Pair #129 · MED17 0261S02041 / 8P0907115 sw 387577 (2006) 2MB,
  1,044 B / **only 3 regs** — very light/surgical tune.
- Pair #130 · MED17 0261S02079 / 1K0907115A sw 387568 (2006) 2MB —
  NEW part number 1K0907115A (VW Golf Mk5 crossover part). 1,378 B.
- Pair #131 · MED17 0261S02340 / 8P0907115B sw 380990 (2006) 1,302 B.
- Pair #132 · MED17 0261S02470 / 1K0907115Q sw 391082 (2007) 2,667 B.
- Pair #133 · MED17 0261S02517 / 8P0907115T sw 387458 (2007) 1,952 B —
  sw 387458 now confirmed across 3 pairs (#120, #128, #133). Stable.
- Pair #134 · MED17 0261S04240 / 8P0907115Q sw 396770 (2008) 1,403 B —
  new Bosch prefix 0261S04 (MED17.5.25 family).
- Pair #135 · MED17 0261S04240 / 8P0907115AE sw 396770 (2009) 256KB
  cal-dump — same bytes-changed count (1,403) as full-file pair #134.
  This confirms the 256KB is the same tune, just cal-only dump.
- Pair #136 · 0261S05898 / 8P0907115Q sw 502774 — SIZE MISMATCH, skipped.
- Pairs #137–141 · **Audi A3 3.2 V6 FSI / ME9.1** — 0261208088,
  0261208792, 0261208793, 0261201260, 0261201522 (all 022906032*
  part numbers). 1MB ME9.1 VR6 petrol files. 400-1,400 B tiny tunes
  (V6 FSI rarely gets heavily tuned). NEW family identified — **ME9.1
  is not in our ecuDefinitions.ts yet**. Family hint detection needs
  update to catch `022906032*` + `0261208xxx`.
- Pair #142 · Bosch 0261201672 / 1P0907115A sw 389460 (A4 1.8 TFSI
  2008) 256KB cal-dump, 939 B / 10 regs. Simos or Bosch EA888
  1.8 TFSI — newer part number family.

**Code: deferred**. NEW ACTIONABLE: add ME9.1 (Audi V6 3.2 FSI)
ECU def with identStrings matching 022906032*, 0261208088/792/793,
0261201260/522. Our ecuDefinitions.ts has `me9` for Ford 2.5T but
not VAG ME9.1 for the 3.2 VR6 FSI. Small gap. TODO.

## Pairs #113–127 — EDC16 PD A3 2.0 TDI + MED17 A3 2.0 TFSI 200ps

15 more pairs:

- Pair #113 · 03G906021JH sw 389852 (PD 2006) 512KB, 4,780 B / **509
  regions** — unusually high region count (many small edits).
- Pair #114 · 03G906021LG sw 382725 (PD 2006) 512KB, 3,062 B / 129.
- Pair #115 · 03G906021JH sw 382415 (PD 2006) 512KB, 1,155 B / 43.
- Pair #116 · 03G906021AB sw 386324 (PD 2006) 512KB, 2,634 B / 68.
- Pair #117 · 03G906021JH sw 392913 (PD 2007) 512KB, 3,651 B / 99.
- Pair #118 · 03G906018DH SN100K5400000 (256KB ppd cal-only) —
  2,202 B / 44. ANOTHER DH SW serial variant (SN100K vs SN100L).
- Pair #119 · 03G906018DH SN100L4000000 alt — 15,773 B / 75 (heavy tune
  of the same cal-dump as pair #51; different tuner, much more modified).
- Pairs #120–127 · MED17 A3 2.0 TFSI 200ps (0261S02xxx / 0261B00xxx
  with 8P0907115* part number). Multiple SW versions — 387579 / 381186
  / 387577 / 381206 / 376224 / 391088 / 387458. All 2MB MED17.
  Light-to-medium tunes (269-2707 B changed). Pair #124 (sw = empty,
  0261B00486) is the lightest at 269 B / 4 regions — tuner barely
  touched it (maybe speed-limiter only). All of these are variants
  of our existing `med17` ECU def's territory.

**Code: deferred**. Notable: 03G906018DH now confirmed on **3 SW
serial families** — SN100L8 (pair 1), SN100L4 (pair 51), SN100K5
(pair 118) — all share the DH torque-monitor map. Our identStrings
for vag_ppd1 already caught SN100L8 and SN100L4; should add
'SN100K5400000' too.

## Pairs #98–112 — 2013-2015 EDC17 CR newer parts + EDC16 PD 2.0 TDI catalogue

15 more pairs covering newer EDC17 C46/C64 variants and the older
EDC16 PD 2.0 TDI 140ps family:

- Pair #98 · 03L906018JL sw 518063 (2013 119.9kW) 2MB, 6,524 B / 46.
- Pair #99 · 03L906018ES sw 527081 (2013 130.2kW) 2MB, 4,973 B / 154
  — new part number 03L906018ES. Higher region count than usual.
- Pair #100 · 03L906018JL sw 522918 (2013 130.2kW) 2MB, 6,417 B / 48.
- Pair #101 · 03L906018JL sw 521650 (2013 88.3kW) 2MB, **141 B / 2**
  — tiny tune (only 2 regions modified). Unusually light Stage 1.
- Pair #102 · 04L906021ER sw 541673 (2014 135kW) **4 MB SIZE MISMATCH**
  — ORI and Stage1 are different sizes. Skipped.
- Pair #103 · 04L906021DS sw 543608 (2015 110.3kW) 4 MB, 10,111 B /
  122. Another 4 MB EDC17 C64 variant.
- Pair #104 · 03G906021AB sw 382417 (2.0 TDI PD) 2MB, 4,272 B / 273.
  **EDC16 PD 2MB** — larger than usual 512KB/1MB. Possibly EDC16CP34.
- Pair #105 · 03G906016BA sw 371953 (2.0 TDI PD 2004) 1MB, 1,624 B / 49.
- Pair #106 · 03G906016DT sw 370570 (PD 2004) 1MB, 1,441 B / 65.
- Pair #107 · 03G906016DR sw 390996 (PD 2004) 1MB, 1,422 B / 44 —
  identical bytes-changed count to pair #109 (different SW, same tune).
- Pair #108 · 03G906016G sw 370435 (PD 2004) **1.5 MB** (1,511,680 B)
  — non-standard size. Cal + part of code dumped. 2,393 B / 46.
- Pair #109 · 03G906016AT sw 369901 (PD 2004) 1MB, 2,527 B / 162.
- Pair #110 · 03G906016G sw 377215 (PD 2005) 1MB, 1,422 B / 44.
- Pair #111 · 03G906021GN sw 378960 (PD 2005) 512KB, 2,285 B / 180.
- Pair #112 · 03G906021AB sw 382663 (PD 2006) 512KB, 1,889 B / 96.

**Code: deferred**. The EDC16 PD 1MB family shows very consistent
light-Stage-1 tune sizes (~1,400-2,500 B) across many variants —
pattern is stable, suggests 03G906016* with 1MB size = Bosch EDC16
PD variant with consistent tuning targets. Could be a candidate for
a single dedicated ECU def with dimension-based map detection (no
fixedOffset — rely on the scanner's Kf_ detection since these are
stripped).

## Pairs #83–97 — more EDC17 C46 A3 2.0 TDI CR 2010-2013 variants

Fifteen more pairs of the same A3 2.0 TDI CR family, mostly 2MB
Bosch EDC17 C46. Brief per-pair entries:

- Pair #83 · 03L906022BQ sw 398757 (2010 alt) 10,726 B / 97 regs.
- Pair #84 · 03L906019AL sw 517565 (2010 125kW) 2MB EDC17 C64-era,
  6,586 B / 64 — different 2.0 TDI CR variant, higher output 170ps.
- Pair #85 · 03L906018AG sw 508211 (2011 100kW) 5,484 B / 53 — light.
- Pair #86 · 03L906018AG sw 516679 (2011 100kW) 5,483 B / 56.
- Pair #87 · 03L906018AG sw 507685 (2011 103kW) 5,737 B / 55.
- Pair #88 · 03L906018AG sw 510938 (2011) 8,854 B / 72.
- Pair #89 · 03L906018AG sw 516676 (2011 105kW) 8,680 B / 116.
- Pair #90 · 03L906018AG sw 510939 (2011 125kW) 8,990 B / 73.
- Pair #91 · 03L906018AG sw 516679 (2011 99kW) 8,680 B / 116 —
  identical pattern to pair #89 despite power difference in filename.
- Pair #92 · 03L906018AH sw 516677 (2012 cal-dump 384KB) 2,568 B / 65.
- Pair #93 · 03L906018JL sw 521653 (2012 100kW) 8,592 B / 91 — new
  part number 03L906018JL (vs AG/AH earlier).
- Pair #94 · 03L906018AG sw 516680 (2012) **1,670,390 B changed**
  (79.7 % of file) — this is a FULL RE-CAL, not a Stage 1 diff.
  The "Stage1" label is misleading; the file is a different binary
  altogether. Marking to skip in future cross-reference.
- Pair #95 · 03L906018JL sw 522943 (2012 130kW) 6,413 B / 48 —
  higher-output JL.
- Pair #96 · 04L906021AS sw 547592 (2013 110kW) 4 MB EDC17 C64 next
  gen — different file size (4 MB vs 2 MB). First 4 MB EDC17 C64 seen.
- Pair #97 · Bosch 1037531110 sw 531110 (2013 110kW) 16,240 B / 178 —
  very heavy tune, different part number format (1037*).
**Code: deferred** — the repeat SW version hits (398757, 507685,
508211, 516679, 516680) build confidence in our v3.5.35 wiring of
sw 398757. Other SW versions could get the same treatment when we
dedicate per-variant entries. Pair #94 is an outlier (full recal).

## Pairs #68–82 — EDC17 C46 Audi A3 2.0 TDI CR 140ps SW catalogue

Fifteen consecutive pairs, all 140ps 2.0 TDI CR on 03L906018/022
family with various SW versions. Going through each briefly so the
SW catalogue is complete — full diff patterns are same as other
EDC17 C46 entries in this log:

- Pair #68 · 03L906022BQ sw 398757 (2009) 2MB, 10,376 B / 93 regs.
- Pair #69 · 03L906022LS + 22BQ sw 506169 (2009) 512KB, 4,570 B / 83.
- Pair #70 · 03L906022RA + 22BQ sw 398770 (2009) 512KB, 10,390 B / 93
  — high change % for a 512KB cal dump.
- Pair #71 · 03L906022BQ sw 398757 (2009 alt tuner) 2MB, 10,928 / 96.
- Pair #72 · 03L906018AG sw 508208 (2010) 2MB, 5,484 B / 53 regs —
  newer 03L906018 family (vs 03L906022).
- Pair #73 · 03L906022BQ sw 396412 (2010 tune) 2MB, 5,006 B / 110 —
  lighter than 2008 version of same SW.
- Pair #74 · 03L906022BQ sw 396413 (2010) 2MB, 5,248 B / 95 regs.
- Pair #75 · 03L906022BQ sw 398756 (2010) 2MB, 4,860 B / 117 regs —
  new SW: 398756 (prior: 398757).
- Pair #76 · 03L906022BQ sw 398757 (2010 another) 2MB, 5,292 B / 163.
- Pair #77 · 03L906022BQ sw 398770 (2010) 2MB, 10,376 B / 93 —
  duplicate of pair 63's tune.
- Pair #78 · 03L906022G sw 396031 (2010) 2MB, 3,163 B / 49 — small
  part number (03L906022G no suffix).
- Pair #79 · 03L906022G sw 397892 (2010) 2MB, 5,247 B / 103 regs.
- Pair #80 · 03L906022GA sw 501959 (2010) 2MB, 5,018 B / 90 regs —
  new part 03L906022GA.
- Pair #81 · 03L906018AG sw 507685 (2010) 2MB, 8,680 B / 116 regs.
- Pair #82 · 03L906018AG sw 508208 (2010 alt) 2MB, 9,269 B / 129.

Catalog of distinct 03L906018/022 SW versions seen in this A3 2.0 TDI
CR subsection:
  396031, 396412, 396413, 396470, 396483, 397819, 397892,
  398750, 398756, 398757, 398770, 501959, 506169, 506186,
  507685, 508208, 508343, 514277
= 18 distinct SW bases. Writing per-SW offsets in ecuDefinitions.ts
for even half of these is a serious code-volume commitment — easier
as data (variantFingerprints.json style) once we commit.

**Code: deferred** — logging only. These are ALL the same EDC17 C46
family Kf_ signature-detected in the live code path.

## Pair #67 — EDC17 C46 · 03L906022BQ sw 398750 (Audi A3 2.0 TDI CR, 2009)
- 2 MB. 10,376 B / 93 regions. Typical sw 398xxx heavy tune profile.
- **Code: deferred**.

## Pair #66 — EDC17 C46 · 03L906018AB sw 508208 (Audi A3 2.0 TDI CR, 2009)
- 384 KB stripped cal (unusual size — even smaller than 512KB).
- 2,180 B / 51 regions.
- `03L906018AB` is a different VW part number than the 03L906022xx
  family — possibly an intermediate engine code.
- **Code: deferred**.

## Pair #65 — EDC17 C46 · 03L906022B sw 396470 (Audi A3 2.0 TDI CR 143ps, 2008)
- 2 MB. 6,146 B / 120 regions. Moderate Stage 1.
- **Code: deferred**.

## Pair #64 — EDC17 C46 · 03L906022BQ sw 514277 (Audi A3 2.0 TDI CR, 2008)
- 2 MB. 10,413 B / 101 regions.
- sw 514277 = newer SW version of 03L906022BQ vs 396xxx generation.
- **Code: deferred**.

## Pair #63 — EDC17 C46 · 03L906022BQ sw 398757 (Audi A3 2.0 TDI CR, 2008)
- 2 MB. 10,651 B / 95 regions — third independent pair of sw 398757
  (pairs 48 and 55 in earlier batch data also hit this SW). Pattern
  and depth match. Very consistent Stage 1 across tuners for this SW.
- **Code: promising** — sw 398757 is a repeatable target.

## Pair #62 — EDC17 C46 · 03L906022BQ sw 396413 (Audi A3 2.0 TDI CR, 2008)
- 2 MB. 10,402 B / 87 regions.
- 396413 = increment of 396412 (pair 54) — same part number, newer
  sub-build.
- **Code: deferred**.

## Pair #61 — EDC17 C46 · 03L906022BQ sw 396412 (Audi A3 2.0 TDI CR, alt tuner #3)
- 2 MB. 10,949 B / 90 regions. **Third** tune of same 03L906022BQ
  sw 396412 base. Different tuner, different depth.
- **Code: deferred**.

## Pair #60 — EDC17 C46 · 03L906022B sw 396483 (Audi A3 2.0 TDI CR 100kW, 2008)
- 2 MB. 10,414 B / 109 regions. Short part number (03L906022B no
  suffix). 100 kW / 136hp variant (vs 140ps standard).
- **Code: deferred**.

## Pair #59 — EDC17 C46 · 03L906022BQ + 4L0907401A sw 508343 (Audi A3 2.0 TDI CR)
- 2 MB. 4,448 B / 190 regions. Filename includes **two part numbers**
  — 03L906022BQ + 4L0907401A — the engine code + Audi-specific
  hardware code. Different naming convention. Probably one of the
  newer 140ps CR variants.
- **Code: deferred**.

## Pair #58 — EDC17 C46 · 03L906022BQ + 03L906022EL sw 397819 (Audi A3 2.0 TDI CR, 2008)
- 2 MB. 11,327 B / 112 regions. Same dual-part-number filename style.
- **Code: deferred**.

## Pair #57 — EDC17 C46 · 03L906022BQ sw 394169 (Audi A3 2.0 TDI CR 140ps, 2008)
- 2 MB. 8,026 B / 107 regions. Heavy Stage 1.
- 0x1EDCDE / 0x1EE988 large 511B regions BE +168-232 % / LE +2 % =
  **BE clean, LE noise** — these are the classic EDC17 C46 big-
  change regions (same pattern as sw 398757 in pair 55).
- **Code: deferred**. Adds another EDC17 C46 SW data point. Pattern
  holds across 394169 / 396412 / 398757 / 506186.

## Pair #56 — EDC17 C46 · 03L906022DT sw 506186 (Audi A3 2.0 TDI CR 140ps, 2008)
- 512 KB stripped cal. 2,482 B / 36 regions. Light Stage 1.
- Different offset regime (0x064xxx) from the 2MB variants — because
  this is a stripped cal-only dump; the 0x064 lives inside the cal
  block that's excised from position 0x1E6000 in the full 2MB file.
- **Code: deferred**.

## Pair #55 — EDC17 C46 · 03L906022BQ sw 398757 (Audi A3 2.0 TDI CR, 2008)
- 2 MB. 10,651 B / 95 regions. Heavy tune (matches the sw 398757
  pattern seen in 7 other pairs in the earlier batch analysis).
- 0x1EF502 2,048 B **BE +302 %** / LE +33 % — the "raise dramatic"
  region seen across all sw 398757 tunes.
- 0x1EFF46 512 B BE +298 % — paired region.
- These are the big-change protection ceilings the whole sw 398757
  variant shares. The same offsets appeared in earlier batch data.
- **Code: promising** — sw 398757 now confirmed across multiple pairs
  with identical offset pattern. Candidate for a per-variant entry.

## Pair #54 — EDC16 PD · 03G906021AN sw 391819 (Audi A3 2.0 TDI CR 100kW, 2008)
- 2 MB "EDC16 PD" per filename (but 03G906021AN is actually EDC17 C46
  early or a rebadged 2.0 TDI CR — the "CR" tag means common-rail not
  pumpe-düse, despite the "PD" naming heuristic). Bosch part 0281017xxx.
- 3,939 B / 103 regions.
- 0x1DA969 / 0x1DAB69 7B BE +660 % / LE +39 % — flag-like bytes.
- **Code: deferred**. Family-hint regex needs tightening for 0281017.

## Pair #53 — EDC17 C46 · 03L906022BQ sw 396412 (alt Stage 1, same SW as #4)
- 512 KB stripped cal. 4,277 B / 79 regions — DIFFERENT tuner's
  Stage 1 for the same SW version as my originally-analysed pair #4.
- Top: 0x078246 200B BE+LE +200 % (both byte orders same = symmetric
  values around 32768), 16×9 at 0x076B38 BE +112.6 % LE −2.1 % (BE
  is the clean interpretation).
- **Code: deferred**. Same variant as #4 so offsets overlap but this
  tuner went heavier.

## Pair #52 — EDC17 C46 · 03L906022BQ sw 396412 (Audi A3 2.0 TDI CR "Turbo-Diesel" filename)
- 512 KB. 2,706 B / 39 regions.
- IDENTICAL to my previously-analysed pair #4 (same file, same tune).
  Duplicate entry in the library.
- **Code: no change** — already covered by pair #4.

## Pair #51 — PPD1.2 · 03G906018DH SN100L4000000 (Audi A3 2.0 TDI BKD, 2007)
- **256 KB stripped cal-only** dump. 13,664 B changed = 5.2 % (very
  high for a cal block — this is the whole cal being remapped).
- 5,376 B at 0x01C7F2 BE +118 % — same pattern as the 03G906018DH
  SN100L8000000 BC52 (my original pair #1): **the DH torque-monitor
  ceiling pinned at 55415 raw**. Just at the 256 KB cal-dump's
  internal offset (0x01C7F2), not the full-file 0x05C7FA.
  Conversion: full-file 0x05C7FA − 0x040000 (cal block start) = 0x01C7FA. Close
  to 0x01C7F2 — 8-byte offset difference probably alignment. So
  this IS the same torque monitor map as pair #1.
- **Code: finding** — confirms the 03G906018DH torque-monitor map is
  at cal-relative 0x01C7FA / full-file 0x05C7FA, consistent across
  the two SW serials SN100L4 and SN100L8. That offset now verified
  across 2 pairs.

## Pair #50 — EDC16 PD · 03G906016G sw 369819 (Audi A3 2.0 TDI 2004, 1MB)
- 1 MB EDC15P+/EDC16 PD. 2,487 B / 162 regions.
- 0x0E342F 13B BE +349 % / LE +8.5 %, 0x0EC3E7 9B BE +185 % / LE +11.9 %.
- Mixed byte-order clues again — LE consistent ~8-12 % on cluster cells
  but BE big on flag bytes. Same family as pairs 9-12.
- **Code: deferred**.

## Pair #49 — EDC16U34 PD · 03G906021AB sw 392913 (Audi A3 2.0 TDI 2004, 512KB)
- 512 KB EDC16U34 cal. 5,004 B / 205 regions — very heavy tune.
- Top: 0x06B675 / 0x06B661 9B BE +75-80 % / LE +7-10 %. Likely
  cluster of boost/IQ raise.
- **Code: deferred**.

## Pair #48 — EDC17 C64 · 04L906021N sw 531315 (Audi A3 1.6 TDI CR, 2014)
- 2 MB Bosch EDC17 C64. 10,333 B / 108 regions — heavy.
- 0x12A238 / 0x12A344 8B +31000-32000 % BE — near-zero flag bytes
  flipped on.
- **Code: deferred**. Another EDC17 C64 variant to track alongside
  pair 47's 04L906021AL.

## Pair #47 — EDC17 C64 · 04L906021AL sw 533836 (Audi A3 1.6 TDI CR, 2013, Bosch)
- 2 MB. **Bosch** now — not Siemens. This is the newer Bosch EDC17 C64
  replacement for SIMOS PCR21 on 1.6 TDI CR (2013+).
- 3,646 bytes / 72 regions. LE +3-4 % cluster across 0x156xxx range
  (many 9-10B regions showing consistent +3.0–3.5 % LE) = one
  parameter scaled across multiple cells.
- Classic Bosch tune profile, not the Siemens emission-off pattern.
- **Code: deferred**. Noting 04L906021AL as a new Bosch EDC17 C64
  variant not yet in our def.

## Pair #46 — SIMOS PCR21 · 03L906023PN SM2F0L9500000 (Audi A3 1.6 TDI CR 90ps, 2012)
- 2 MB. 19,975 B / 235 regions — heavier than #45 but same pattern.
- 14B flag blocks at 0x18CE5A / 0x18D25A / 0x18D85A / 0x18C87A etc.
- **Code: deferred**.

## Pair #45 — SIMOS PCR21 · 03L906023JK SM2F0K3000000 (Audi A3 1.6 TDI CR, 2011)
- 2 MB. 12,459 B / 141 regions. Same pattern. 14B flag blocks at
  0x18CCEE / 0x18D10E / 0x18D0EE etc. Offsets shifted from SM2F0G
  variants by ~0x400 bytes.
- **Code: deferred**.

## Pair #44 — SIMOS PCR21 · 03L906023JK SM2G0LK000000 (Audi A3 1.6 TDI CR, 2010)
- 2 MB. 17,757 B / 188 regions. **Offsets IDENTICAL to pair 42**
  (03L906023L + SM2G0LK000000). Confirms: third part number sharing
  the SM2G0LK000000 SW base. 03L906023JK + 03L906023L + 03L906023QC
  all share this SW and offsets.
- **Code: deferred**. If we ever wire SM2G0LK000000 offsets, it'll
  cover at least 3 part numbers.

## Pair #43 — SIMOS PCR21 · 03L906023JK SM2F0G4000000 (Audi A3 1.6 TDI CR, 2010)
- 2 MB. 12,480 B / 141 regions.
- Same 14B flag pattern but offsets at 0x18D60A / 0x18DA2A — shifted
  from SM2F0K3 and SM2G0LK serials. Confirms SW serial drives offset.
- **Code: deferred**.

## Pair #42 — SIMOS PCR21 · 03L906023L SM2G0LK000000 (Audi A3 1.6 TDI CR, 2009)
- 2 MB. 17,757 B / 188 regions — heavy emission-off Stage 1.
- SAME pattern as pair 27 (same SW serial SM2G0LK000000 on 03L906023QC).
  Offsets IDENTICAL — serial is the discriminator, not the part number.
  0x18D412 / 0x18CE32 / 0x18D832 / 0x18DE32 etc. all flag-byte flips.
- Confirms: **03L906023L + 03L906023QC with same SM2G0LK000000 SW
  share the same map layout**. Two part numbers, one SW base.
- **Code: deferred** — same story as pair 27.

## Pair #41 — SIMOS PCR21 · 03L906023LF SM2F0L9500000 (Audi A3 1.6 TDI CR, ?)
- 2 MB. 8,613 B / 23 regions.
- Different pattern from other 1.6 CR pairs — this tuner raised 8×112
  at 0x1CEF72 by +25 % and 1536B region at 0x1874C0 by +24 %.
  Larger bulk % raises, not just flag flips.
- Same SW serial as pair 39 (SM2F0L9500000) but on different part
  number 03L906023LF — offsets DIFFER from pair 39 (0x1CEF72 vs
  0x1BDADC) — so **part number also matters** even when SW serial
  matches. Earlier conclusion (pair 42) needs nuance.
- **Code: deferred**.

## Pair #40 — SIMOS PCR21 · 03L906023L SM2F0G4000000 (Audi A3 1.6 TDI CR, ?)
- 2 MB. 20,272 B / 109 regions — MEDIUM-heavy tune.
- Mix of +75 %/+55 % small table raises and −50 % reductions in the
  0x1D0xxx range (20-byte tables, value halvings). Consistent LE +6 %
  across many = one parameter scaled 6 % in LE + a second parameter
  zeroed/halved in BE.
- **Code: deferred**.

## Pair #39 — SIMOS PCR21 · 03L906023FL SM2F0L9500000 (Audi A3 1.6 TDI CR, ?)
- 2 MB. 9,131 B / 29 regions — moderate tune.
- 128×7 at 0x1CEF70 BE +10.5 % = sizeable boost-target-ish map raised.
- Big monitoring reductions: 0x1C34AA 6B −73 %, 0x1C3492 6B −62 %.
- 384B at 0x1BDADC +16 % = bulk region raised.
- **Code: deferred**.

## Pair #38 — SIMOS PCR21 · 03L906023A SM2E0DG000000 (Audi A3 1.6 TDI CR, ~2010)
- 2 MB. 8,335 B / 68 regions.
- Cluster of LE +5 % across 10+ cells at 0x1D5xxx range = one parameter
  scaled 5 % in LE alongside mixed BE changes.
- Several 14-18B regions with BE +129 % to +250 % = near-zero flag
  bytes flipped on (emission-off switches — **different location**
  from the 0x18Dxxx block seen in pair 25-27 because different SW
  serial family SM2E vs SM2G).
- **Code: deferred**.

## Pair #37 — MED17 · 0261S02187 / 03C906056CP sw 378110 (Audi A3 1.6 FSI 115ps, 2006)
- 2 MB MED17. Medium Stage 1: 2,253 bytes / 38 regions.
- 24×3 / 12×5 / 12×3 boost-ish tables at 0x1C6007 / 0x1C6013 /
  0x1C8BCB all BE +17-32 %. Cluster = primary boost target.
- 0x1D52C6 38B BE +15.8 % / LE −65.6 % = clear BE cleanness (LE
  nonsense) so **BE is correct byte order here**.
- **Code: deferred**.

## Pair #36 — MED17 · 0261S02057 / 03C906056AP sw 379130 (Audi A3 1.6 FSI 115ps)
- 2 MB MED17. Very light Stage 1: 257 bytes / 10 regions.
- Three 12×10 / 12×9 boost tables at 0x1C96C8 / 0x1C952E / 0x1C8A35
  all +1.6–3.2 % BE — boost slightly raised only.
- Similar part number family to pair 37 (03C906056AP vs 03C906056CP).
- **Code: deferred**.

## Pair #35 — ME7/Simos4 · 5WP40242 / 06A906033DT (Audi A3 1.6 8V 75kW, 2005)
- 512 KB Siemens/Bosch ME7 or Simos4 (5WP serial prefix = Siemens).
- 321 B / 3 regions — minimal tune.
- 12×16 at 0x079D92 BE +8.3 % — boost/load target raised.
- 8×15 at 0x07B640 BE +0.8 % — negligible.
- **Code: deferred**.

## Pair #34 — Siemens Simos4 · 5WP40344 / 06A906033GQ (Audi A3 1.6 Benzin 75kW, 2007)
- 512 KB. Very light: 346 B / 3 regions.
- 12×16 at 0x07A88A BE +10 % — boost/load target raised.
- 170B at 0x07BBCE BE −18.7 % — monitoring reduction.
- **Code: deferred**. Family detection needs improvement — these
  5WP40344 binaries are Siemens Simos 2.1/4 variants, currently
  mis-hinted as "Siemens-PPD?".

## Pair #33 — MED17.5.25 · 0261S04859 / 03C906016S sw 505087 (Audi A3 1.4 TFSI 125ps, 2010)
- 2 MB MED17.5. 1,304 bytes / 29 regions. Medium tune.
- 0x054B28 6B **BE +991 % / LE +40 %** — near-zero flag byte flipped.
- 0x05571A 42B **−100 %** (317→0) = threshold zeroed (monitor off).
- 0x05F39A 202B BE −93.6 % / LE +334.8 % = one byte order shows
  zero-out, the other shows jump-up = data is stored in a way where
  the byte meanings diverge sharply — **probably 4-byte aligned data
  that neither pure BE nor pure LE u16 fits**. These might be
  float32 or 32-bit int values. MED17.5 uses both.
- 16×6 at 0x05F476 BE −64 % LE +86 % — same 4-byte alignment issue.
- **Code: deferred**.

## Pair #32 — MED17.5.25 · 0261S04652 / 03C906016F sw 399977 (Audi A3 1.4 TFSI 122ps, 2008)
- 2 MB MED17.5. Light Stage 1: 330 bytes / 5 regions.
- 12×9 at 0x0543A0 BE +7.7 % — boost target (typical factor 0.001 bar
  in MED17 would give 3.3 bar → 3.6 bar).
- Two 12×16 tables at 0x05848E / 0x05849A +1.3 % — duplicated
  primary boost/torque map with small increase.
- 0x0547D6 22B LE +16 % — cluster of related values scaled up.
- **Code: deferred**. Note: 0261S04652 is a MED17.5.25 part number
  our def currently identifies only as generic MED17.

## Pair #31 — MED17 1.2 TFSI · 04E906016H sw 533205 (Audi A3 1.2 TFSI 105ps, later)
- 4 MB MED17 (probably MED17.5 or newer). Tiny edit: 212 B / 15 regions.
- STRONG signal: **LE consistent +10.9 %** across 7 × 12-byte regions
  at 0x2621xx (μ 19000-36000 raw → ×1.11). One parameter scaled up
  10.9 %, stored in 7 cells.
- 0x2628AC 28B LE +15.5 % — related block.
- No BE cleanness — LE is the correct byte order (TriCore MED17).
- **Code: deferred**. 04E906016H is VAG's newer 1.2 TFSI part number
  not yet in our ECU def list.

## Pair #30 — EDC15P+ · 0281012195 / 045906019CA sw 378836 (Audi A2 1.4 TDI, 2004)
- 512 KB EDC15P+ cal. 3,604 bytes / 78 regions — medium-heavy tune.
- SAME 0x20000 ROM/RAM MIRROR pattern as pairs 28 and 29. Every change
  is duplicated at offset+0x20000.
- Big BE -72 % to -92 % reductions on multiple 6-8B regions =
  flag bytes being zeroed (monitoring disables).
- 0x04D316 / 0x06D316 6B +78 % — a pair of small increases (same
  value in both mirror copies).
- **Code: deferred** — pattern now CONFIRMED across 3 A2 1.4 TDI
  EDC15P+ variants. edc15 def would benefit from an 0x20000 mirror
  flag so when we write Stage 1, we write to BOTH copies.

## Pair #29 — EDC15P+ · 0281011404 / 045906019BA sw 367361 (Audi A2 1.4 TDI, 2004)
- 512 KB EDC15P+. 1,546 bytes / 82 regions.
- Same 0x20000 mirror pattern — 0x056xxx paired with 0x076xxx.
- Cluster of BE -76 % to -86 % (6-9B regions) = flag bytes zeroed.
  Values going from 40000-59000 raw down to 7000-14000 = threshold
  lowered dramatically or toggled.
- **Code: deferred**.

## Pair #28 — EDC15P+ · 0281010220 / 045906019G sw 360497 (Audi A2 1.4 TDI 75ps)
- 512 KB EDC15P+ (1.4 TDI 75ps). 1,586 bytes / 74 regions.
- **IMPORTANT FINDING: 0x20000 ROM/RAM MIRROR**. Every modified
  region is DUPLICATED at offset + 0x20000 (e.g. 0x04D750 mirrors to
  0x06D750). The tuner modified BOTH copies. This is characteristic
  of EDC15P+ ECUs that keep a ROM master + RAM mirror at a fixed
  stride of 128 KB. If our code writes only to one copy, the ECU
  boots with inconsistent cal and derates.
- Top changes:
  - 0x04D750 / 0x06D750 40B BE +323 % (one pair of 40B regions).
  - 0x0572B4 / 0x0772B4 199B BE +75 % (large table raised).
  - 0x04C996 / 0x06C996 6B BE −55 % (threshold lowered).
- **Code: deferred**. But the mirror finding is meaningful — warrants
  a follow-up TODO to make the app handle 0x20000 mirror writes.

## Pair #27 — SIMOS PCR21 · 03L906023QC SM2G0LK000000 (Audi A1 1.6 TDI CR, 2012)
- 2 MB. 30,290 bytes / 259 regions — comparable to pair 26.
- Same 14-byte region pattern at 0x18D412 / 0x18CE32 / 0x18D832 etc.
  Offsets SHIFTED by ~0x44 bytes vs pair 25 (SM2G0LB → SM2G0LK SW ver).
- Confirms: SIMOS PCR21 1.6 TDI CR has a large block of switch bytes
  at 0x18C0xx–0x190Axx that tuners flip for DPF/EGR-off style mods.
  Offsets drift per SW version.
- **Code: deferred**. Would need dedicated SIMOS PCR21 1.6 TDI CR
  ECU def with per-SW-version switch block offsets.

## Pair #26 — SIMOS PCR21 · 03L906023KJ SM2G0LB000000 Stage1+++ (Audi A1 1.6 TDI CR)
- 2 MB. **32,392 bytes / 261 regions** — extreme tune (Stage1+++ label
  is correct — far more changes than the Stage1 pair 25 with same SW).
- Same 14B region pattern as pair 25, **same offsets** (SM2G0LB SW
  serial shared between 03L906023KG and 03L906023KJ part numbers).
- Adds dozens more 14B flag-byte flips beyond pair 25's set.
- **Code: deferred** — same family as pair 25.

## Pair #25 — SIMOS PCR21 · 03L906023KG SM2G0LB000000 (Audi A1 1.6 TDI CR 90ps, 2012)
- 2 MB. **17,791 bytes / 229 regions** — HEAVY Stage 1 (typical
  Euro-5 1.6 TDI CR "DPF-off / EGR-off" tune shape).
- Dozens of 14-byte regions at 0x18Dxxx / 0x18Exxx showing massive
  % increases (+100–11000 %) — but the raw values go from near-zero
  to near-max u16 (0x0000→0xFFFF range). These are **enabler/flag
  switch bytes for emission monitoring**; the tuner flipped them
  on/off to disable DPF regen, EGR, AdBlue checks etc.
- LE interpretation is effectively 0 % on these = the true "byte
  flip" is happening in BE. Consistent with the SIMOS PCR21 TriCore
  AURIX architecture.
- **Code: deferred**. These switch blocks are high-value for customer
  use (DPF-off is a common ask) but need dedicated ECU def + the
  scanner + a proper "emission-off" addon integration to be safe.
  Noting for a focused follow-up.

## Pair #24 — SIMOS PCR21 · 03L906023A SM2E0DB000000 (Audi A1 1.6 TDI CR 105ps, 2004)
- 1 MB cal-only SIMOS PCR21 (earlier SM2E serial than 2012 variants).
  512 bytes / 15 regions.
- 32×4 / 16×8 / 8×16 tables at 0x07E6AB / 0x07E6B3 / 0x07E6C3 ALL
  show the SAME +17.9 % BE change — this is the SAME data block read
  with 3 different dimension hypotheses by the stride clusterer. Real
  map is probably one of these — likely 16×8 (128 cells) or 32×4.
- 0x0CDE09 63B **BE -100%** (4699 → 0) = monitor threshold zeroed.
- 128×7 at 0x0CD6xx / 0x0CD686 BE +5 % = large slow-growth tune of a
  low-cell-value table (probably IQ or SOI table raw mg×100).
- **Code: deferred**.

## Pair #23 — MED17 1.4 TFSI · 03C906027CF sw 517923 (Audi A1 1.4 TFSI 185ps, 2012)
- 2 MB MED17, higher-output 1.4 TFSI (185ps not 122ps like 03C906016BG).
- 1,020 bytes / 18 regions.
- Top: 0x054784 8×5 BE +81.6 %, three 64×4 tables at 0x054514 /
  0x054524 / 0x054534 all BE ~+40–45 %. These four-table cluster
  is classic MED17 boost-target per-mode variants.
- 0x0503AF 23B BE +90 % / LE +83 % — protection ceiling raise.
- **Code: deferred**.

## Pair #22 — MED17.1.6 · 03C906016BG sw 522238 (Audi A1 1.4 TFSI)
- 2 MB MED17. Very light tune — 212 bytes / 4 regions.
- Top LE changes: 0x057DC0 24B +15.7 %, 0x057B54 12×15 +4.5 %.
- SW 522238 is a third version of the 03C906016BG MED17.1.6 engine
  (see pairs 19/20/21). Filename says "Turbo-Diesel" but it's petrol
  1.4 TFSI — a tuner mis-label.
- **Code: deferred**.

## Pair #21 — MED17.1.6 · 03C906016BG sw 512164 (alt Audi A1 1.4 TFSI tuner)
- Same variant as pair 19 but a DIFFERENT/lighter Stage 1 — 147 B / 4.
- Top LE changes: 0x0574DC 24B +10 %, 12×16 at 0x05725C +2.4 %,
  12×4 at 0x055A88 ~0 %, 12×5 at 0x055A7C ~0 %.
- Useful calibration note: same SW version, **different tuner = very
  different amount of change**. Supports the idea that per-variant
  fixedOffsets should describe WHERE maps are, not assume a specific
  tune style.
- **Code: deferred**.

## Pair #20 — MED17.1.6 · 03C906016BG sw 515491 (Audi A1 1.4 TFSI)
- 2 MB. Light tune — 120 B / 2 regions.
- 0x057D2C 24B LE +11.8 %, 12×16 at 0x057AAC LE +2.4 %.
- Tuner left almost everything stock — only touched 2 map regions.
- **Code: deferred**.

## Pair #19 — MED17.1.6 · 03C906016BG sw 512164 (Audi A1 1.4 TFSI 122ps, 2010)
- 2 MB MED17. 856 bytes / 18 regions.
- Mixed pattern — LE +7.8 % on 0x054478, BE +96 % on same offset;
  LE +75.6 % on 0x04FEF3 with BE +76.4 %. The cells where LE and BE
  give SAME % are single-value bytes (ambiguous byte order). For
  multi-cell tables the LE % is cleaner and consistent.
- 64×4 boost-target-size table at 0x0541F8 LE +6.4 %.
- 12×7 table at 0x05A4F9 LE −3.4 % (small reduction — possibly a
  partial EGR-reduction or overrun adjustment).
- **Code: deferred**.

## Pair #18 — SIMOS PCR · 03F906070GN SA300O1000000 · Stage1+++ (Audi A1 1.2 TFSI)
- Same file pair as #16 but labelled Stage1+++. Changes IDENTICAL to
  pair 16 (1,028 B, 26 regions, same offsets). The +++ suffix was
  marketing: no extra edits vs the Stage1 file of same SW serial.
- **Code: deferred**.

## Pair #17 — SIMOS PCR · 03F906070GN SA300O6000000 (Audi A1 1.2 TFSI)
- 2 MB Siemens SIMOS. 6,973 bytes / 47 regions — heavier tune than
  pairs 15/16 (probably a Stage2-grade edit labelled as Stage1).
- Includes writes into 0x000000 (4,032 bytes +102 %) — this is the
  **RSA/CRC header area** being rewritten. SIMOS signed-code bypass
  edits look like this.
- Also touches 0x020000 16B +356 % LE — another signature/flag block.
- Same map pattern as pairs 15/16 in 0x1E0Cxx – 0x1CF2xx range.
- **Code: deferred** — SIMOS PCR needs dedicated analysis (signed
  binaries; cal-only edits vs code edits behave very differently).

## Pair #16 — SIMOS PCR · 03F906070GN SA300O1000000 (Audi A1 1.2 TFSI)
- 2 MB Siemens. 1,028 bytes / 26 regions.
- Near-IDENTICAL change signature to Pair #15 but offsets shifted by
  ~0x100 bytes between the two SW serials (SA300M2 → SA300O1). Map
  locations move between SW versions; tuners' target list is stable.
- Consistent LE +48–52 % across 0x1E0071 / 0x1E00CC / 0x1E00EC =
  WGDC or load-target scaling up.
- **Code: deferred**.

## Pair #15 — SIMOS PCR · 03F906070CA SA300M2000000 (Audi A1 1.2 TFSI)
- 2 MB Siemens SIMOS PCR petrol. 982 bytes / 26 regions.
- LE shows cleaner % than BE → **LE storage confirmed** (SIMOS PCR
  is TriCore LE, matches our simos18 def conventions).
- Top LE changes: 0x1DFFCC +52 %, 0x1DFFEC +48 %, 0x1DFF71 +50 %,
  0x1E0468 −18 %. Cluster pattern = WG duty / boost limit raise.
- 0x1CCE26 / 0x1CCE3A / 0x1CEDF4 / 0x1CED54 show big −49 % to −60 %
  changes — monitoring thresholds being zeroed (common SIMOS disable).
- **Code: deferred** — SIMOS PCR 1.2 TFSI not yet in ecuDefinitions.ts
  as a dedicated entry; would need at minimum 2-3 pairs of the same
  SA300* serial to lock offsets. Pairs 16 and 17 provided exactly
  that (SA300O1, SA300O6) for the GN part number.

## Pair #14 — EDC17 CP44 · 4G0907401 sw 518146 (Audi 3.0 TDI CR 245ps)
- 2 MB EDC17 CP44 V6 TDI. 6,346 bytes / **212 regions** — HEAVY
  "Stage 1+++" tune. Far more modifications than a typical Stage 1.
- Pattern: dozens of 10B loose regions all showing +132–149 % BE with
  effectively 0 % LE → **BE storage** (expected for EDC17 CP44).
- Top families:
  - 0x16B3FE / 0x16B41A / 0x16B642 / 0x16B886 / 0x16BACA / 0x16BAE6
    / 0x16BF6E / 0x16C196 — 8 cell-by-cell 10B entries at distinct
    offsets, all scaling ~2.5× (16000→42000 raw range). Likely a
    torque monitor table being pinned high.
- **Code: deferred**. This variant (4G0907401 sw 518146) isn't yet
  in our ecuDefinitions.ts; offsets differ from the 3.0 TDI CR
  variants found in the earlier batch (516613/516617/518178). Need
  more 518146 pairs to build a proper per-variant entry.

## Pair #13 — MED17 2.0 TFSI · 0261S08699 / 8U0907115B sw 528730 (Audi 2.0 TFSI ~215ps)
- 2 MB MED17 petrol. 1,273 bytes / 39 regions. Stage1+++ filename.
- Consistent LE +3.4 % across 0x1E3424 / 0x1E3478 / 0x1E34B0 (18 B
  each) → cluster scaling of one parameter (torque/boost target).
- 0x1D66A0 120B shows +119 % BE / +107 % LE — a big protection
  ceiling region DOUBLED. Both byte orders give similar %s for
  constant-sized cells → could be either.
- 0x1DE004 8B BE −99 % — a small flag/threshold zeroed (monitor
  disable).
- **Code: deferred**. `8U0907115B` is a newer MED17.1.6 variant;
  our ecuDefinitions.ts has `med17` generic but no 0261S08 entry.

## Pair #12 — EDC15P+/EDC16 PD · 03G906016BQ sw 399895 (Audi A3 2.0 TDI, 2005)
- 1 MB stripped. 1,567 bytes changed / 48 regions.
- SAME pattern as Pairs #9–11: 0x0EDDxx cluster with consistent LE %
  scaling + 0x0DDDxx / 0x0DDExx BE +45-66 % torque-ish region.
- Top: 0x0DDE88 118B BE μ3000→5000 +67 %, 0x0DDDD2 122B BE +60 %
  (these decode cleanly as Nm/10 → 300→500 Nm torque ceiling raise).
- **Code: deferred** — same reason as #9-11.

## Pair #11 — EDC15P+/EDC16 PD · 03G906016G sw 368508 (Audi A3 2.0 TDI, 2004)
- 1 MB stripped. 1,206 bytes / 40 regions.
- Same pattern. Top: 0x0F855F 13B LE +8.4 %, 0x0EBA45 33B LE +41.8 %,
  0x0F8613 13B LE +6.1 %.
- **Code: deferred**.

## Pair #10 — EDC16 PD · 03G906016J sw 368596 (Audi A3 1.9 TDI EDC16, 2004)
- 1 MB stripped. 1,645 bytes / 38 regions.
- Filename explicitly says "EDC16" — confirms the 1MB 0281011xxx binaries
  in this library are EDC16 PD, not EDC15P+.
- Same LE +7 % cluster at 0x0F85xx plus other LE +9 % spikes at 0x0F552D.
- Suggests scaled IQ parameter across multiple cells (typical
  per-gear or per-temperature storage of the same multiplier-like value).
- **Code: deferred**.

## Pair #9 — EDC15P+/EDC16 PD · 03G906016CC sw 371093 (Audi A3 1.9 TDI 105ps, 2005)
- ORI: `Audi___A3_1.9_TDI_2005_..._0281011832_03G906016CC_371093_DB69.Original`
- Stage1: `..._371093_D98E.Stage1`
- 1 MB stripped. 1,216 bytes changed across 30 regions.
- **Important observation**: LE interpretation gives **consistent +7.5%** across
  6 regions at 0x0EDDxx while BE gives random % — this binary stores data
  little-endian (consistent with C167 EDC15P+ which is LE-native, unlike
  EDC16 PPC which is BE).
- Top LE changes (factor unknown, raw ints):
  - 6× 13B tables at 0x0EDD3F–0x0EDDA3 all +7.5% LE — one parameter
    scaled across 6 cells.
  - 0x0DDE80 126B +50% BE (3000→4500) — may be boost target mbar, would
    mean 3.0→4.5 bar which is unrealistic; more likely this is torque
    limit Nm/10 (300→450 Nm Stage 1 is typical for 1.9 TDI 105ps).
  - 0x0DDDCC 128B +47% BE — paired table to the above.
- **Code: no change**. Byte-order observation may inform EDC15P+ detection
  logic later but no per-variant offsets warrant code change on one pair.

## Pair #8 — EDC16U34 PD · 03G906021CS sw 376704 (Audi A3 1.9 TDI 105ps, 2004)
- ORI: `Audi___A3__1.9TDI__2004____77.2KWKW_Bosch_0281012608_03G906021CS_376704_7E9E.Original`
- Stage1: `..._376704_7312.Stage1`
- 512 KB stripped cal, 1,773 bytes changed across 75 regions.
- Top changes (raw BE u16):
  - 3× 34B at 0x051754 / 0x05172A / 0x05177E — all +60% (2200-2400 → 3500-3800 raw).
    Per-RPM-band IQ or smoke-limit cluster.
  - 0x0540B3 loose 11B +43% (32376 → 46355). Large raw value, likely a threshold.
  - 4× identical 7B at 0x056C41 / 0x056E01 / 0x056FC1 / 0x057181 — all −23.6%
    (all 49155 → 37550). Duplicate values = per-gear/cyl reduction of a single
    parameter (probably torque-drop-per-gear or EGR duty cut).
- **Code: no change** — no ASCII symbols to anchor names, no second
  03G906021CS pair yet to cross-verify. Logged for future cross-reference.

## Summary after 7 pairs

| Family | Pairs | Verified mapDefs code-changed |
|---|---|---|
| PPD1.2 | 3 | 7 (DH variant) |
| EDC17 C46 | 1 | existing sigs confirmed |
| ME7 | 2 | skipped (stripped) |
| EDC16 PD | 1 | noted (stripped) |

Lesson learned: **many 2004-2008 VAG binaries in this library are
stripped** (symbol section removed by whoever dumped them). For stripped
binaries we need either an A2L definition file or a second pair of the
same software version to triangulate map names. Pairs where the tune
obviously shifts a value by a consistent % across many storage slots
still give us confident map-shape data even without names.
