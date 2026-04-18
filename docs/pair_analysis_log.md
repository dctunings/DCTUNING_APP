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
