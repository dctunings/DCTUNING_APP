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
