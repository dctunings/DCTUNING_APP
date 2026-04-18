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

## Batch #1 — all 1,264 Audi pairs (after manual pair #7)

Instead of one-at-a-time from here on, ran every `*.Original` + `*.Stage1`
pair in `D:\DATABASE\Tuning_DB_BIN\Audi\` through the same diff + cluster
pipeline in a single pass. Outputs in this `docs/` folder:

- `enumerate_audi_pairs.js` — scans folder, pairs files by prefix+size
- `batch_analyze_pairs.js` — diff + cluster + per-variant aggregation
- `audi_findings.md` — human-readable report (885 variants, top 5 per family)
- `audi_variant_fingerprints.json` — structured data for app consumption
  (62 variants with ≥3 pairs and ≥2 consistent offsets)

Results (37 s runtime):
- 1,264 pairs analysed, 6 skipped (size mismatch), 0 failed.
- 885 unique variants identified by (family, partNumber, swVersion).
- 76 variants with ≥3 pairs — cross-verified offset data.
- 16 variants with ≥5 pairs — high-confidence fingerprints.

Highest-pair-count variants (and how many STRONG consistent offsets each has):
- 15× PPD1.2 03G906018AQ (offsets didn't align — variants span 4 SW serials;
  need per-serial keying)
- 13× SIMOS_PCR21 (1.6 TDI CR) — same problem, mixed SW gens
- 10× EDC15 — same
-  7× EDC17 C46 sw398757 (03L906022BQ) — 12 strong offsets
-  7× Audi A5 3.0 TDI CR EDC17 sw516613 — 10 strong offsets (16×16 boost +116%)
-  6× EDC17 C46 sw396484 — 10 strong offsets
-  6× Audi 3.0 TDI CR sw516617 — 10 strong offsets (16×16 boost +117%)
-  6× Audi 3.0 TDI CR sw518178 — 10 strong offsets
-  6× Audi 3.0 TDI CR sw516623 — 10 strong offsets
-  5× EDC17 CP44 03L906018DN sw515568 (Audi Q5) — 10 strong offsets
-  5× MED17 TT2 2.0 TFSI sw387549 — 10 strong offsets

Clear cross-variant patterns visible:
- **Audi 3.0 TDI CR (EDC17 CP44)** — sw 516613/516617/518178/516623 all
  share: a 16×16 boost map that tuners DOUBLE (+115-117%), and a
  "0x19xxxx / 0x1B9xxx / 0x1C7xxx" monitoring-disable block (-99% = zeroed).
  These offsets shift slightly between SW versions but the MAP IDENTITIES
  are the same.
- **VAG 2.0 TDI CR (EDC17 C46) sw398757** — "0x1EF5xx / 0x1EFF4x / 0x1FA4xx"
  big-change region + "0x1C3xxx / 0x1CExxx" monitor disable.

Lesson for variant keying: the SW version (6-digit) is THE discriminator on
Bosch binaries, but my current variant key also needs the part number since
some SW version numbers repeat across engine codes. For Siemens/Continental
PPD binaries the SN*/SM* serial is the discriminator, not VAG part number.

## Summary after 7 manual pairs + 1,264 batch pairs

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
