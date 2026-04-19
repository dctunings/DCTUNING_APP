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

# VW catalog (D:\DATABASE\Tuning_DB_BIN\VW)

**1374 ORI/Stage1 pairs** in VW folder. Numbering as `VW #N` separately.
VW shares much of the same Bosch hardware as Audi (sister VAG group),
so we expect to see big overlaps with the wired Audi defs.

## VW Pairs #1345–1374 — FINAL BATCH — NEW 0x067494 C64 def + Vento + 100% COMPLETE

**NEW DEF — Transporter EDC17 C64 12×15 @ 0x067494** (4 SWs, 4 suffixes):

`edc17_c64_transporter_20tdi_03l906019gh_067494` — T5 103kW 2012-2013.

All 4 pairs EXACT same anchors + raw signature:
- #1310 sw525525 `03L906019GH` (from earlier batch)
- #1345 sw524688 `03L906019GJ`
- #1348 sw525529 `03L906019FK`
- #1349 sw524684 `03L906019FL`

Map structure:
- `0x067494 12×15` BE 15 → 27232 (+179584%) IQ ceiling A
- `0x067CD0 12×15` BE 649 → 24771 (+3715%) IQ ceiling B

**4th anchor variant of Universal 12×15 IQ ceiling pattern** (now known at
4 anchors across VAG EDC17 C46/C64):
- Amarok 03L906019FA + Transporter JD @ 0x0623F0 (wired)
- Golf 03L906022G @ 0x1DBC2C (wired)
- Transporter C64 GH/GJ/FK/FL @ 0x067494 (NEW wired)
- Transporter sw522861 FH @ 0x067020 (Δ=-0x474 shifted variant — single)
- Transporter sw524689 GM + sw525513 GN @ 0x06B8AC (Δ=+0x4418 shifted
  sub-variant — 2 SWs)

**Vento observations** (pairs #1373, #1374):

- #1373 sw391083 `8P0907115B` Vento 2.0 TFSI MED17 EA113 2MB:
  - `0x1CE6A8 120B` BE 10604 → 65535 (+518%) — **4th anchor of universal
    MED17 EA113 IQ unlock!**
  - Anchor variants now documented across 4 cars:
    - Golf 1K0907115J/K @ 0x1CE0C8 (wired)
    - Passat 8P0907115B 2006 @ 0x1CE884 (wired)
    - Passat 3C0907115Q @ 0x1CE2A4 (wired)
    - Vento 8P0907115B @ 0x1CE6A8 (single SW)
  - Same stock 10604 → 65535 target across all 4 anchors

- #1374 sw399537 `1K0907115AB` Vento 2.0 TSI 262KB:
  - `0x016E46/F36 8B` BE 5096 → 38063 (+647%) — mirror pair (Δ=+0xF0)
  - NEW 1K0907115AB SGO catalogued. Single SW.

**Transporter T6 2.0 TDI CR misc observations**:
- #1367 sw506113 JE 132kW — emission cut at 0x038A86 (already in 0x077DBA
  def via JE ident).
- #1368/#1369 sw504908 JF — 78.8% file rewrite (full cal replacement,
  not useful for pair-diff).
- #1370 sw518079 JF 2228224B (2.12 MB — slight dump-size variant!) —
  `0x067374 22B` BE 18766→39596 +111% (different anchor, logged).
- #1371 sw518079 JF 2MB normal — hits 0x037C7A emission (in 0x077DBA def).
- #1372 sw525512 `03L906019GK` (03L907309L alt part) — NEW GK suffix
  C64 emission cut only. Logged.

**T5 1.9 TDI PD observations**:
- #1363 sw390620 `038906016AL` — `0x06C969 11B` BE 16801→33800 (universal
  16801 pattern)
- #1364 sw393512 `038906016AJ` — `0x06C969 11B` BE 16801→28731 (same SW
  already in T5 1.9 TDI 0x06A8ED def — but here at Δ=0x20C8 different
  anchor, different tuner style on same ORI)

**T4/T5 2.5 TDI EDC15 PD catalog** — various single-SW observations:
- #1359 sw? `074906018C` 524KB — 0x05CCD0/0x068CD0 mirror pair +0xC000
  stride BE 10275→59940 +483%
- #1360/#1361 sw350892 `074906021AG` 262KB Transporter 2.5 TDI 75kW —
  2 pairs SAME signature at 0x03D875 199B -50% + 0x03D66D 13B +37%.
  **2-SW 2-pair cluster but same SW different model years** — logged.
- #1362 sw368187 `070906016F` 1511680B (1.44MB DPF dump) — minimal
  (5 regions). Single.
- #1365/#1366 sw390622 `070906016DR` T5 2.5 TDI pd R5 128kW — 2 sister
  pairs at `0x014B26 8×16` +296% + `0x00E80D 7B` -62%. NEW DR R5 variant.

**EDC17 C46 DPF-delete observations**:
- #1353/#1355/#1356/#1357/#1358 — all hit 0x02DBC0 / 0x027E64 / 0x027E66
  emission-cut pattern at slightly different anchors across SWs
  (515505 DK / 518130 CC / 518155 CB / 518131 CD / 518139 CH). Per-SW
  drift. Logged for future DPF-delete signature wire.
- Pair #1350 sw525570 FH · #1351 sw535317 FJ · #1352 sw532892 FL —
  more emission-cut variants.

**1354 sw504908 JF DPF 136kW** — `0x038A82 104B` emission cut + 0x038D32
54B. JF higher-power DPF variant.

---

## VW CATALOG COMPLETE — 1374/1374 pairs (100%)

---

## VW Pairs #1329–1344 — 3 EXISTING defs extended + Amarok def gets Transporter JD

**0x070292 def EXTENDED +3 NEW SWs + 1 NEW suffix + 1 SGO variant**:
- +sw518155 `03L906022CB` 61.8kW (pair #1342) — NEW CB suffix
- +sw518153 `03L906019DG` (pair #1330) — NEW DG 03L906019 suffix
- Also confirms sw518139 CH sister (pair #1337) at 0x070292

Now covers 7 part suffixes (CD/CH/CK/CB + DH/DK/DG) and 7 SWs (518131/
518139/518140/518152/518153/518154/518155). Cross-family protection
ceiling anchor EXPANDED.

**0x077DBA def EXTENDED +1 SGO** — JF suffix:
- +sw518079 `03L906022JF` (pair #1341) — NEW JF Transporter BiTDI variant
- Pair #1333 sw518073 JD + #1334 sw518078 JE — sister pair confirmations

Now covers 4 part suffixes (JD/JE/JF + 03L907309L).

**Amarok 03L906019FA def EXTENDED** — NEW cross-chassis ident:
- +sw518073 (pair #1339 `03L906022JD` Transporter 132kW) hits EXACT
  0x0623F0 12×15 IQ ceiling anchor as Amarok def!
- Added `03L906022JD` + sw518073 to identStrings
- 12×15 IQ ceiling pattern confirmed universal across Amarok BiTDI and
  Transporter BiTDI at SAME physical anchor.

**12×15 IQ ceiling at shifted anchors** (no wire — per-SW drift):
- #1338/#1344 sw515247 JD @ 0x062230 12×15 (Δ=-0x1C0 from Amarok anchor)
  — 2 pairs same SW, potential cluster.
- #1329 sw505971 `03L906022GF` @ 0x05F784 12×15 (BE 15→9914 softer
  target). Single.

**03L906022JF 2KB protection cluster** (pair #1340):
- sw518079 JF @ `0x06F586 2048B` BE 21527→57390 + `0x070252 2048B`
  BE 22340→57390. Two 2KB anchors close together — unique pattern.
  Single SW, NEW JF cluster.

**EDC17 C64 emission-cut confirmations**:
- #1331 sw514232 `03L906019DM` — NEW DM suffix emission cut
- #1343 sw535317 `03L906019FJ` — FJ variant at yet-later SW (525574 was
  FJ earlier pair, #1325 522862 FJ)

**Other observations**:
- #1332 sw518139 CH alt-tune (emission cut only) — sister of #1337 wired
  0x070292 hit. Same ORI different tuner.
- #1335 sw518155 `03L906022CB` alt-tune (emission cut only, no 0x070292
  hit). Same SW as #1342 wired target — multi-tune on same ORI.
- #1336 sw505941 + Upd sw518131 CD 75kW (chiptuner-updated file) —
  emission cut pattern only.

---

## VW Pairs #1313–1328 — 0x070292 def MAJOR extension + EDC17 C64 emission pattern catalog

**0x070292 def MASSIVELY expanded** — 3 NEW SWs + 3 NEW suffixes:
- +sw518140 `03L906022CK` (pair #1328) — NEW CK suffix
- +sw518152 `03L906019DK` (pair #1327) — NEW DK suffix (C64 family)
- +sw518154 `03L906019DH` (pair #1326) — NEW DH suffix (C64 family)

Now covers 5 part suffixes (CD/CH/CK + DH/DK) and 5 SWs (518131/518139/
518140/518152/518154). Interesting: 0x070292 2KB anchor works for BOTH
EDC17 C46 (03L906022xx) AND EDC17 C64 (03L906019xx) variants — cross-
family protection ceiling location.

Raw signature stable across all 5 SWs:
- 0x070292 2KB BE 20108 → 57390 (+185%)
- 0x07000A 512B BE 30474 → 57390 (+88%)
- 0x037AC6 66B emission cut

**0x07C9F2 def confirmed with +1 pair** (pair #1317):
- sw508906 `508906P755W` sister of #1299 confirms JE alt-anchor cluster.

**0x077DBA def confirmed with +2 pairs** (pairs #1313 CH-sister, #1315 CJ):
- Pair #1313 sw518139 CH (alt-tune, emission cut only) — same SW already
  in def.
- Pair #1315 sw521023 `03L906022CJ` — NEW CJ suffix! Emission cut pattern
  matches but 16×16 not confirmed in this pair. Logged for future.

**EDC17 C64 12×15 IQ ceiling cluster** (pair #1316):
- sw525513 `03L906019GN` @ 0x06B8AC 12×15 BE 15→27232 +179584% + mirror
  at 0x06C0E8 12×15 BE 649→24771 — SAME pattern shape as wired Amarok
  0x0623F0 + Golf 0x1DBC2C 12×15 IQ ceiling defs at THIRD anchor.
- Confirms 12×15 + 12×16 IQ ceiling is C46 + C64 UNIVERSAL Bosch shape.

**EDC17 C64 emission-cut pattern 03L906019xx family** (observations):

All have 2MB · hit 0x0379xx / 0x0433xx emission region with cut to 32:
- #1318 sw518152 DK 103kW — 0x027E66 / 0x02DBC2 / 0x07FE74 cluster
- #1321 sw519393 DC 84.6kW — 0x0348F4 / 0x0347F8 / 0x033EE2
- #1322 sw519394 DD 84.6kW — 0x0346FE / 0x0354C8 / 0x033EE6
- #1323 sw525574 FJ 84.6kW — 0x0433A2 / 0x0435B6 / 0x04349A
- #1324 sw518153 DG `03L907309M` — 0x0379CE pattern
- #1325 sw522862 FJ 84.6kW — 0x0430EA / 0x0432FE (Δ=-0x2B8 from #1323
  sw525574 FJ — same FJ suffix, different SW, shifted anchor)

Anchor drift Δ=0x200-0x700 per SW within same suffix. Too wide for
fixedOffset. Signature wire candidate for emission-cut pattern.

**Pair #1319 sw505971 `03L906022GF`** — emission cut at 0x028612/0x02E7DE.
GF suffix EDC17 C46. Single.

**Pair #1320 sw507671 CD** — SAME CD suffix as wired 0x070292 def but
different SW. Only emission cut hit here, not the 0x070292 2KB anchor.
Alt-tuner style — ORI includes both maps. Logged.

---

## VW Pairs #1297–1312 — 3 NEW Transporter 2.0 TDI CR EDC17 C46 defs

**NEW DEF 1 — Transporter 2.0 BiTDI CR 03L906022JD/JE @ 0x077DBA** (6 pairs, 3 SWs):

`edc17_c46_transporter_20bitdi_03l906022jd_077dba` — T5 BiTDI 132.4kW.

- #1296 sw518073 JD (from prior batch)
- #1298 sw518079 `03L907309L` (alt part code for same ECU)
- #1303 sw518073 JD · #1304 sw518073 JD · #1305 sw518073 JD (sisters)
- #1306 sw518078 JE — NEW JE suffix variant at SAME anchor

All 6 pairs EXACT anchors:
- `0x077DBA 16×16 512B` BE 22134 → 47749 (+116%) torque ceiling
- `0x037C7A 104B` / `0x037F28 40B` emission cut cluster (-99%)

**NEW DEF 2 — Transporter 2.0 BiTDI CR 03L906022JE @ 0x07C9F2** (3 pairs, 2 SWs):

`edc17_c46_transporter_20bitdi_03l906022je_07c9f2` — alt-anchor variant.

- #1297 sw509954 JE
- #1299 sw508906 `508906P755W` (alt part code)
- #1307 sw509954 JE (sister of #1297)

SAME raw signature 22134 → 47749 (+116%) but at Δ=+0x4C238 shifted
anchor. Sub-variant SW 509954 + 508906 uses this anchor.

**NEW DEF 3 — Transporter 2.0 TDI CR 03L906022CD/CH @ 0x070292** (2 SWs):

`edc17_c46_transporter_20tdi_03l906022cd_070292` — T5 75-103kW.

- #1308 sw518131 CD 75kW · #1312 sw518139 CH 103kW

Both hit:
- `0x070292 2KB` BE 20108 → 57390 (+185% protection ceiling)
- `0x07000A 512B` BE 30474 → 57390 (+88% companion)
- `0x037AC6 66B` emission cut

**Pair #1300 sw536198 `03L906019HM`** — EDC17 C64 (not C46) family, 2MB:
- `0x07CB3C 16B` BE 10117→19460 +92% + `0x04390E 40B` -99% emission
- Single SW, NEW HM suffix in C64 family. Logged.

**Pair #1301 sw515250 `03L906022JE` "Letzte bearbeitung"** — DPF version
of #1306 style with emission cut pattern. Already covered by JE ident.

**Pair #1302 sw525525 `03L906019GH` alt-tune** — `0x0433A2/0x0435B6/
0x04349A` emission cut cluster. sw525525 also appears as #1310 (different
tune hitting 0x067494 12×15 IQ ceiling) and #1311 (similar emission).
Same SW, 3 different tuner styles on same ORI.

**Pair #1310 sw525525 GH** — 12×15 IQ ceiling pattern at `0x067494 12×15`
BE 15→27232 +179584% + `0x067CD0 12×15` BE 649→24771 +3715%. Same
12×15 IQ ceiling pattern shape as wired Amarok 03L906019FA / Golf
03L906022G defs but at DIFFERENT anchor 0x067494 (vs 0x0623F0 / 0x1DBC2C).
EDC17 C64 family sub-variant. Single SW — logged for future session.

**Pair #1309 sw518154 `03L906019DH`** — `0x037AC6 66B` +161% + `0x037BD0
40B` +142% + `0x0379D8 24B` +135% — 2MB cluster. NEW DH suffix C64 family.

---

## VW Pairs #1281–1296 — NEW 0x1ED29A def + extensions across 3 existing defs

**NEW DEF — 0x1ED29A 2MB anchor-shifted variant of 0x1F007A cluster** (2 SWs):

`edc17_c46_golf_touran_20tdi_1ed29a` covers Δ=-0x2DE shifted protection ceiling.

- #1135 sw395477 `03L906022G` (from earlier batch)
- #1281 sw396412 `03L906022BQ`

Both hit SAME raw signatures at SAME anchors:
- `0x1ED29A 2048B` BE 14259 → 57390 (+302%) protection ceiling
- `0x1EDCDE 512B` BE 14413 → 57390 (+298%) companion
- `0x1EDABC 512B` BE 23107 → 57390 (+148%) torque lift
- `0x1F8246 200B` BE 4135 → 12405 (+200%) IQ release

Same raw signature as 0x1F007A def but at Δ=-0x2DE shifted anchor.
BQ + G suffixes both use this shifted variant.

**03G906021AB 0x05AA99 def EXTENDED** — +sw391834 `03G906021RN` (pair #1288):

RN suffix joins AB cluster at EXACT triple-mirror anchors 0x05AA99/AC99/AE99
with stock 7470 → 20569 (+175%). 2 SWs + 2 suffixes now.

**0x06AD86 def EXTENDED** — +2 NEW SWs + 2 NEW suffixes:
- +sw509916 `03L906018DR` (pair #1284 exact match 15351 → 57390)
- +sw515262 `03L906018NM` (pair #1286 exact match 21260 → 57390 125kW)

Now covers 11 part suffixes, 18 SWs:
(AR/BB/BC/GC/DQ/BD/HQ/FA/FB/DR/NM) — major Golf/Sharan/Tiguan/Touran
2.0 TDI CR 80-125kW protection ceiling family.

**Transporter 2.0 BiTDI CR observations** (pairs #1295/#1296):

- sw505433 `03L906022JD` @ 0x07CBDE 16×16
- sw518073 `03L906022JD` @ 0x077DBA 16×16 (Δ=-0x4E24 shifted)
- Both share raw 22134 → 47749 (+116%) — same code, different cal-block
  locations per SW. Per-SW anchor drift too wide for fixedOffset.
- NEW JD suffix catalogued for future session.

**Touran 2.0 TDI PPD1.2 observations**:

- #1290 SN1S0M8000000 `03G906018EH` 2101248B (2MB+4KB NEW format!) —
  already covered by PPD1.2 def (SN1S0M8000000 + 03G906018EH in defs).
- #1291 SN100L6000000 `03G906018EH` 262KB — already covered.

**Touran 1.9 TDI PD observations (no wire — single SWs)**:
- #1287 sw368223 `03G906016AL` 1MB — `0x0F8FED 11B` -95% emission cut
- #1288 sw391834 `03G906021RN` 524KB — ADDED to 0x05AA99 def
- #1289 sw383709 `03G906021MJ` 524KB — `0x06B1FF 11B` +78% NEW MJ suffix

**Transporter misc observations** (no wire):
- #1292 sw355660 `074906021F` Transporter 65KB (tiny EDC15) — old Bosch
  `0281001470` hardware. Unusual small dump. Single.
- #1293 sw368204 `038906016A` — 4KB (no change, truncated file)
- #1294 sw360550 `038906012CE` Transporter 1.9D 524KB EDC15 64kW —
  348 regions with `0x0592xx 10B` multi-mirror emission cuts. Single SW.

**03L906022G sw396096 alt-tuner** (pair #1282) — same sw396096 already
added to 398757 def but this pair targets different maps (`0x1C309E/
0x1C2D64` emission + `0x1CE3C2/0x1CC8D6 13B`). Multi-tune on same ORI.

**Pair #1285 sw509916 DR sister** — same SW as #1284 but different tuner
hits `0x03BEE0 66B` +161% + `0x0713F0 10B` +130%. Different style but
same ORI — confirms ORI structure completeness.

**Pair #1283 sw398823 QG** — already catalogued #1131 — same SW logged.

---

## VW Pairs #1265–1280 — 2 NEW Touran EDC16 PD defs (KB/KC + AB clusters)

**NEW DEF 1 — Touran 1.9 TDI 03G906021KB/KC @ 0x064963** (3 SWs, 3 pairs):

`edc16_pd_touran_19tdi_03g906021kb_064963` — Touran 1.9 TDI PD 524KB.

- #1267 sw379714 KB — 0x064963 13B BE 12850 → 39005 +203% (heavy tune)
- #1268 sw382091 KB — SAME anchor BE 12850 → 30130 +134% (mild tune)
- #1269 sw382090 KC — SAME anchor BE 12850 → 30130 +134% (sister of #1268)

Pairs #1268 and #1269 share IDENTICAL 4-anchor pattern:
- 0x064963 / 0x064977 / 0x06498B / 0x06484F 13B
- Stock 12850/19933/22621/21424 → tuned value

KB and KC suffixes tuned identically by same tuner — confirms KB/KC
share code path (minor variant).

**NEW DEF 2 — Touran 1.9 TDI 03G906021AB @ 0x05AA99 triple-mirror** (2 pairs):

`edc16_pd_touran_19tdi_03g906021ab_05aa99` — single SW sw389840.

- #1259 sw389840 AB (2007) — 0x05AA99/0x05AC99/0x05AE99 (Δ=+0x200 stride)
- #1273 sw389840 AB (2007 sister) — SAME triple-mirror

Stock 7470 → 21081-21124 (+182%) across all 3 mirrors. Different tuner
styles but both confirm the triple-mirror structure.

**03G906021 family observations (no wire — single SWs)**:

- #1265 sw378973 `03G906021DM` — `0x0647BF 11B` -51% (economy tune style)
- #1266 sw379846 `03G906021FE` — `0x067771 11B` BE 16801→34056 +103%
  (universal 16801 stock value!) + companion 0x067579 -64%
- #1270 sw383719 `03G906021MF` — `0x0597C1 13B` +327% torque lift
- #1271 sw389299 `03G906021RM` — `0x066233 9B` +100%
- #1272 sw394900 `03G906021MG` 2MB — `0x1EB261 11B` BE 16801→28731 +71%
  (universal 16801 again, at 2MB anchor)
- #1274 sw396444 `03G906021ND` — `0x06AF69 11B` BE 16801→28731 +71%
  (universal 16801 at 524KB anchor)

Universal 16801 → 28731-37845 pattern confirmed across 03G906021 FE/MG/ND
variants (matches T5 1.9 TDI 038906016 wired def signature).

**Touran 2.0 TDI 1MB observations (same SWs as earlier Passat/T5)**:

- #1275 sw372498 `03G906016HK` 1MB — `0x0EDD1B 9B` BE 13639→50184 +268%
- #1276 sw371097 `03G906016CD` 1MB — `0x0EDD43 9B` BE 14728→31176 +112%
  (SAME SW sw371097 as Touran #1258 prior pair — different part CD in
  both, 2 different Stage1 tune targets on same ORI)
- #1277 sw370229 `03G906016DR` — almost-null tune (4 bytes, 0 regions)
- #1278 sw381020 `03G906021KF` 524KB — `0x064799/064927/0647C1/0647E9
  13B` cluster BE 9135/15921/18991/30298 → tuned. Similar structure
  to KB/KC cluster but different raw stocks.
- #1279 sw371266 `03G906016BQ` — light tune at 0x0CFFxx region (4 regions)
- #1280 sw SN100K5300000 `03G906018DB` PPD1.2 262KB — already covered
  by PPD1.2 def. 0x016A6C 16×12 emission zeroing to 0 (DPF delete style).

---

## VW Pairs #1249–1264 — NEW Touran PCR21 def + 1.9 TDI EDC15/16 PD observations

**NEW DEF — SIMOS PCR21 Touran 1.6 TDI CR @ 0x18CE5A** (2 pairs, 2 parts):

`pcr21_touran_16tdi_sm2f0l_18ce5a` — Touran 1.6 TDI CR CAYC 77kW.

- #1250 SM2F0L9500000 `03L906023PJ` 2012 — 0x18CE5A 14B BE 382→45218 +11737%
- #1251 SM2F0L9500000 `03L906023ND` 2010 CAYC — EXACT same anchor + raw

Raw signatures (across both pairs):
- `0x18CE5A 14B` BE 382 → 45218 (+11737% — massive IQ unlock)
- `0x18D27A 14B` BE 2651 → 47487 (+1691% IQ unlock B)
- `0x18D25A/0x18D87A 14B` mirror pairs of B
- `0x18C87A 14B` BE 6489 → 41963 (+547% ceiling limit)

**Pair #1252 SM2G0LG000000** — different serial family:
- `03L906023PJ` same part but SM2G serial — hits anchor 0x18D412
  (Δ=+0x5B8 from SM2F anchor). Same raw 382 → 45218 signature.
- Sub-variant for SM2G serial — logged, not wired (Δ too large).

**Touran 1.9 TDI EDC15/EDC16 PD family observations**:

03G906016 family (1MB EDC16 PD):
- #1256 sw368159 A @ 0x0F859B 13B BE 10162→49586 +388%
- #1257 sw369568 BT @ 0x0E2D51 13B BE 2649→15364 +480%
- #1258 sw371097 CD @ 0x0EDD53 13B BE 10162→44082 +334%
- #1264 sw371250 DK @ 0x0E2BD1 13B BE 2649→15364 +480% (Δ=-0x180 from BT)

#1257 + #1264 share EXACT raw signature 2649→15364/2820→15535 but at
Δ=-0x180 shifted anchor. 2 SWs 2 suffixes — potential cluster after
more confirmations.

03G906021 family (524KB / 2MB EDC16 PD):
- #1255 sw389840 `03G906021AB` 524KB Touran 2002 — minimal tune
- #1259 sw389840 `03G906021AB` 524KB Touran 2007 — SAME SW different
  tuner, `0x05AA99/0x05AC99/0x05AE99 13B` triple mirror Δ=+0x200 stride
  BE 7470→21124 +183%
- #1260 sw392951 `03G906021AB` 2MB Touran 2006 — `0x1D42D0 44B` +51%
  + `0x1EB003/0x1EAFDB` 13B cluster
- #1261 sw397876 `03G906021AB` 524KB — `0x012373/0x06B1F7 11B` mirror
  pair Δ=+0x69E84 BE 23968→47060 +96%
- #1262 sw381006 HK 524KB — own anchors
- #1263 sw394990 HK 524KB — `0x06B261/06B2D9 11B` BE 16801→28731
  (same raw as wired T5 1.9 TDI 038906016 0x06A8ED def!)

**Cross-chassis observation** (Pair #1263):
sw394990 HK hits `0x06B261 11B` BE 16801→28731 — SAME raw signature
as wired T5 1.9 TDI 038906016T/AJ def at 0x06A8ED (raw 16801→37845).
Different target (28731 vs 37845) but same stock raw — 16801 is a
universal EDC16U31 IQ cell value across PD 1.9 TDI variants.

**Other observations**:
- #1248 (from prev batch) already logged Touran 1.6 FSI.
- #1249 sw381630 `03C906056DM` Touran 1.6 FSI MED17 — `0x1D5230 38B` +16%
  matches Passat 1.6 FSI 03C906056T/AA/DC pattern.
- #1253 sw? `06A906033ET S713117000000` Touran 1.6i Siemens 524KB —
  3 regions only, light tune.
- #1254 sw396316 `03C906032C` Touran 1.8 TSI 2MB — 5 regions only,
  very light tune. Light target anchors.

---

## VW Pairs #1233–1248 — 3 NEW Touareg defs (4G + 4.2 TDI V8) + 3.2 V6 ME7 catalog

**NEW DEF 1 — Touareg 3.0 V6 TDI CR 4G0907401 @ 0x16B9F4** (2 SWs, 5 pairs):

`edc17_touareg_30tdi_4g0907401_16b9f4` covers 4G chassis (Audi Q7 derived).

- #1231/#1232/#1233 sw518187 (3 pairs — 150kW, #1232 alt tune)
- #1234 sw518184 (176.5kW) · #1235 sw518184 (180.2kW — same SW different
  filename power rating)

All hit EXACT anchors:
- `0x16B9F4 16B` BE 12322 → 32324 (+162% IQ upper A)
- `0x16BE7C 16B` mirror (Δ=+0x488)
- `0x16B518 16B` BE 18272 → 41985 (+130% IQ upper B)
- `0x16B75C 16B` mirror (Δ=+0x244)

**NEW DEF 2 — Touareg 3.0 V6 TDI CR 4G0907401 2013 @ 0x1CE226** (2 SWs):

`edc17_touareg_30tdi_4g0907401_1ce226` covers 4G 2013 180kW revision.

- #1237/#1238 sw525584 — 2 sisters both at EXACT 0x1CE226 16×16
- #1239 sw535387 — same EXACT anchor + raw signature

Stock 22060 → 47675 (+116%) at `0x1CE226` + mirror at `0x1CE46A`
(Δ=+0x244). Emission-cuts at `0x1823D6/0x18231C` 80B across all 3.

**NEW DEF 3 — Touareg 4.2 TDI CR V8 7P0907409 @ 0x1ACE30** (1 SW, 2 pairs):

`edc17_touareg_42tdi_7p0907409_1ace30` — flagship 4.2 TDI V8 250kW.

- #1246 sw511931 · #1247 sw511931 (sister pair — same SW, different tuners)

Both hit EXACT anchors:
- `0x1ACE30 16B` BE 8648 → 26665 (+208% IQ upper A)
- `0x1ACE5C 15B` BE 21913 → 44149 (+101% IQ upper B, Δ=+0x2C)
- `0x1B8520 8B` BE 14747 → 34651 (+135% torque limit)
- `0x171F42 8B` BE 49949 → 32 (-99.9% emission cut)

Single SW but 2 confirmation pairs — reliable fixedOffset wire.

**Touareg 3.2 V6 ME7 cluster observations** (no wire — anchor drift):

5 SWs 1MB dumps share SAME raw 12102 → 12692 (+4.9%) signature on
`0x011xxx` 1408B map + `0x011234/0x0114F4/0x0115A4` 143B triplet
(BE 12100/12151/12329 → +12.7%):
- #1241 sw367551 `022906032BE` @ 0x0110C5 1408B
- #1242 sw371633 `022906032GB` @ 0x011234 triplet
- #1243 sw382817 `022906032A` @ 0x01120F triplet (Δ=-0x25 from #1242)
- #1244 sw387682 `022906032BF` @ 0x0113E1 1408B
- #1245 sw378728 `022906032FT` @ 0x0111FF 1408B

Per-SW anchor drift 0x100-0x330 — too wide for fixedOffset. Signature
wire candidate. 5 SGO suffixes spans 2002-2007.

**Pair #1240** sw? `4G0907401E` DPF BlueMotion 2004 4MB — only 37 bytes
changed, 2 regions. Almost-null tune.

**Pair #1248** sw374349 `03C906056CE` Touran 1.6 FSI MED17 2MB —
hits `0x1D5230 38B` + `0x1C6118 83B` — same anchors as Passat 1.6 FSI
`03C906056T` pair #959. 03C906056 family confirmed cross-Passat/Touran.

---

## VW Pairs #1217–1232 — 1 NEW Touareg 3.0 V6 TDI CR 7P0907401 def + major cluster

**NEW DEF — Touareg 3.0 V6 TDI CR 7P0907401 @ 0x166F64** (2 SWs, 4 pairs):

`edc17_touareg_30tdi_7p0907401_166f64` — 7P chassis (Mk2 2010+) 176.5-180kW.

- #1222/#1228 sw516683 — 2 pairs both at 0x166F64 + 0x16740A
- #1229/#1230 sw526380 — 2 pairs at SAME EXACT anchors

Raw signature:
- `0x166F64 10B` BE 20550 → 54345 (+164% IQ upper)
- `0x16740A 10B` mirror at Δ=+0x4A6 (same raw)
- `0x166F48 10B` BE 21164 → 53679 (+154%)

Per-SW anchor drift variants (logged, not in def):
- sw510363 (#1219/#1220/#1225) @ 0x166F18 (Δ=-0x4C)
- sw515254 (#1221/#1226) @ 0x166F4E (Δ=-0x16)

**Cross-def observation — sw515255 + sw515254 = 7L0907401H twin**:
- #1223 sw515255 7P0907401 150kW @ `0x1D0F94 512B` BE 5125→45060 +779%
- #1224 sw515254 7P0907401 175.8kW @ SAME `0x1D0F94 512B` SAME signature
- This is the SAME raw 5125→45060 as wired 7L0907401H def's 0x1DD8C6 128B
  but at 7P chassis Δ=-0xC932 anchor shift. Same map, different cal-block.
- Also `0x1D18B8 16×16` + `0x1D1674 16×16` in #1227 sw515254 alt-tune
  matches the 7L0907401H 0x1DDB3E/0x1DD954 pattern at 7P anchor.

**7L0907401N 2MB cluster** (pairs #1217/#1218) — sw500172 + sw509943:
- 0x1DEF4F 13B BE 4119 → 8000 (same pattern as pair #1216 4.25MB
  format) — light tune style at torque limit
- 0x1D0Cxx / 0x1D02xx emission-cuts
- Both 2MB dumps. Sister of 7L0907401H (N vs H — same cal block layout
  different SGO). Not wired — different raw sigs from main cluster.

**4G0907401 2MB cluster** (pairs #1231/#1232 — sw518187, same ORI, 2 tunes):
- #1231 tune style A @ 0x16B9F4/0x16BE7C 16B BE 12322→32324 +162%
- #1232 tune style B @ 0x16C0AA/0x16B556/0x16B79A 10B BE 7141→40576 +468%
- Same raw 7141 as pair #1207 sw518184 `7P0907401F` — NEW 4G chassis (Q7?)
- Single SW, 2 tuner styles on same ORI. Logged for future.

**Multi-tune on same ORI** (recurring pattern):
- sw515254 appears 4 times (#1221, #1224, #1226, #1227) with 4 different
  tune approaches: main 0x166F4E cluster, 0x1D0F94 IQ release, alt
  0x1D18B8 16×16, and combinations. Confirms ORI structural completeness.

---

## VW Pairs #1201–1216 — 1 NEW Touareg 3.0 TDI CR DPF EDC17 def (2 SWs) + tail catalog

**NEW DEF — Touareg 3.0 TDI CR DPF V6 EDC17 7L0907401H @ 0x1DD8C6** (2 SWs):

`edc17_touareg_30tdi_7l0907401h_1dd8c6` covers 155-176.5kW DPF 2MB.

- #1202 sw509949 155.2kW — 0x1DD8C6 128B + 0x1DD954 16×13 + 0x1DDB3E 16×16
- #1213 sw509943 176.5kW — EXACT same anchors + raw signatures

Raw signatures (across 2 SWs):
- `0x1DD8C6 128B` BE 5125 → 45060 (+779% — critical IQ release)
- `0x1DD954 16×13 208B` BE 21409 → 48549 (+127% torque ceiling A)
- `0x1DDB3E 16×16 256B` BE 22186 → 47801 (+115% torque ceiling B)

**Multi-tune confirmation**: sw509943 appears at 7L0907401H in BOTH
#1211 (emission-cut at 0x1B47B2/0x1B4638/0x1B4664 pattern) AND #1213
(0x1DD8C6 torque cluster). Same ORI, different tuner choices.

**Cross-chassis observation (Pair #1214)**:
`3D0907401D` sw397811 2MB hits `0x1F9212 16×16` with SAME raw 22186
→ 47801 signature as 7L0907401H def — but at Δ=+0x1B6D4 shifted anchor.
Different 3D chassis wiring — same code, relocated. Single SW, no wire.

**Emission-cut sub-pattern across 7L0907401H** (no wire — different
raw sigs per SW):
- #1208 sw392978 — `0x1B47DC 8B` BE 50626→3395 -93%
- #1209 sw394198 — `0x1A9F98/1A9C94 12B` + `0x1B47DC 8B`
- #1210 sw500172 — `0x1B4664/0x1B4894 10-20B` to zero
- #1211 sw509943 — `0x1B47B2 13B` BE 1963→23978 +1122% (+ LE+710k%!)
- #1215 sw392978 — `0x1AA212/0x1AA2E4` + `0x1D0706/1D072E` cluster

Emission-disable region 0x1B4xxx / 0x1A9xxx / 0x1AA2xx catalogued for
future DPF-delete wire.

**4MB DPF-dump format observations**:
- #1204 sw509943 `7L0907401N` 4325376B (4.25MB) — edits at `0x3DEF4F`
  region — NEW dump format for Touareg DPF.
- #1216 sw509943 `7L0907401H` 4325376B — SAME 4.25MB format as #1204
  but different SGO. Both hit high-region `0x3DEF4F/0x3D0C8A/0x3D0CB2/
  0x3D0242`. Possible 2-SW cluster needs verification with 3rd pair.

**Very unusual format observations**:
- #1206 sw509950 `7L0907401AB` 2MB 176.5kW — only emission-cut
  `0x1AA7xx/0x1AA68x` pattern. Light tune. Single.
- #1207 sw518184 `7P0907401F` 4194304B (4MB!) — `0x36B556/0x36B79A/
  0x36C0AA 10B` triple-mirror at stride 0x244 BE 7141→32384 +354%.
  NEW 4MB dump format (different from 4.25MB). Single.
- #1212 sw521025 `7L0907401H` 2MB — only 2 regions, very light tune.

**Single-SW observations** (no cluster yet):
- #1201 sw383041 `8E0907401AB` 524KB 2007 (sister of #1183) — ALT tuner
  at `0x07169D 9B` +67% vs #1183's 0x0717C3 triple-mirror. Multi-tune
  on same ORI.
- #1203 sw516683 `7P0907401` 2MB 103kW — `0x1D16D0 512B` + `0x1D1FF4
  16×16` — Touareg entry-level 103kW variant. Single.

---

## VW Pairs #1185–1200 — 2 NEW Touareg 3.0 TDI EDC16 defs + 2007 catalog

**NEW DEF 1 — Touareg 3.0 TDI 8E0907401AB @ 0x0717C3 triple-mirror** (2 SWs):

`edc16_touareg_30tdi_8e0907401ab_0717c3` covers 8E hardware 165-171kW V6.

- #1183 sw383041 `8E0907401AB` 165.5kW — 0x0717C3/0x071AB3/0x071DA3 triple
- #1185 sw377333 `8E0907401AB` 165kW — EXACT same anchors (triple mirror)

All 3 anchors hit with raw stock 13214 → 37278 (+182%). Stride between
mirrors Δ=0x2F0 — EDC16 storage-mirror layout.

**NEW DEF 2 — Touareg 3.0 TDI 7L0907401A @ 0x0713F1** (2 SWs):

`edc16_touareg_30tdi_7l0907401a_0713f1` covers 7L hardware 164.8kW V6.

- #1189 sw380764 `7L0907401A` — 0x0713F1 11B BE 23252→50029 +115%
- #1193 sw505494 `7L0907401A` — EXACT same anchor + raw signature

Tight cross-SW anchor match. 7L hardware is Touareg-specific (vs 8E
Audi-shared).

**Cross-format observations**:

Same-SW different-format pairs confirm 524KB↔2MB mapping conventions:
- #1187 sw382093 `7L0907401B` 2MB @ 0x1EFFA9 — companion 2MB variant
- #1190 sw382093 `7L0907401B` 2MB — sister of #1187
- #1184 sw382708 `7L0907401B` 524KB @ 0x0706CD — same SW 382708 also
  appears in #1192 2MB @ 0x1EFFDD. Δ=0x1E9910 dump shift.

**Single-SW observations (no wire yet)**:

- #1186 sw375570 `8E0907401AB` 262KB — VERY light tune (3 regions)
  just emission cuts. Doesn't match main cluster.
- #1188 sw375569 `8E0907401AB` 524KB 171kW — `0x07169D 9B` +94% different
  anchor pattern from main 0x0717C3 cluster. Single.
- #1191 sw379816 `7L0907401B` 524KB — `0x070507/0x0704DF 13B` BE 23345→
  42674 +83% + 18523→41990 +127%. Different anchors from main clusters.
- #1192 sw382708 `7L0907401B` 2MB 171kW — `0x1EFFDD 13B` BE 8673→40844
  +371% + several 13B 19682/20151/22882 stocks. Unique per-SW pattern.
- #1194 sw386348 `7L0907401F` 2626048B (2.5MB DPF dump!) — `0x26F8ED
  11B` BE 23252→50029 same raw sig as wired 0x0713F1 but different anchor
  and dump format. DPF variant.
- #1196 sw379816 `7L0907401B` 2MB — `0x1D2F1A 16B` +146% + `0x1F0507 13B`
  +103%. Same SW as #1191 524KB but 2MB format with different anchors.
- #1197 sw386372 `7L0907401D` 2MB — `0x1EFE83/0x1F011B/0x1F03B3 11B`
  TRIPLE mirror at Δ=0x298 stride BE 19668→46240 +135%. NEW 7L0907401D
  pattern — could wire after 2nd SW confirms.
- #1198 sw387060 `7L0907401D` 524KB — `0x06F95B/0x06F933 13B` different
  anchor. Single.
- #1199 sw374592 `8E0907401AB` 524KB 171kW — `0x071D35/0x072303/
  0x0725F3/0x0728E3 11B` QUAD mirror at Δ=0x2F0 BE 23252→50029 +115%.
  Same raw as wired 0x0713F1 def but at different anchor+SGO. Different
  power variant (171kW vs 164.8kW).
- #1200 sw377333 `8E0907401AB` 524KB — `0x07169D 9B` +67% (lighter tune
  of the 0x07169D pattern from #1188).

---

## VW Pairs #1169–1184 — 2 NEW MED17 Tiguan 2.0 TSI defs + Touareg + 0x06CC76 ext

**NEW DEF 1 — Tiguan 2.0 TSI 125kW MED17 @ 0x00F617** (3 SWs, 3 pairs):

`med17_tiguan_20tsi_06j906026_00f617` covers S/T/AB suffixes in 262KB.

- #1173 sw396752 `06J906026S` 125kW — 0x00F617 120B + 0x016AB2 64B
- #1174 sw396755 `06J906026AB` 125kW — EXACT same anchors
- #1175 sw396753 `06J906026T` 125kW — EXACT same anchors

Stock 10604 → 25700 (+142%). Universal MED17 EA888 Gen2 IQ release
pattern at 262KB compact anchor. Same family as Scirocco 2.0 TSI
06J906026AR pairs #1004/#1006 (which use sw503606/sw395040 AR at
slightly different anchors 0x00F607/0x00F63F).

**NEW DEF 2 — Tiguan 2.0 TSI 147kW MED17 @ 0x010E79** (2 SWs, 2 pairs):

`med17_tiguan_20tsi_06j906026h_010e79` covers H suffix 147kW.

- #1176 sw397325 `06J906026H` 147kW
- #1177 sw397724 `06J906026H` 147kW (sister SW)

Stock 10583 → 25700 (+143%) at Δ=+0x1862 shift from 125kW anchor.

**0x06CC76 def EXTENDED** — +sw524160 (#1169/#1170 sister pairs):

Now covers 6 SWs (LK/LL/LE/FQ).

**Touareg observations (no wire — mixed SGOs)**:

- #1178 sw396753 `06J906026D` 2MB (Tiguan) — 2MB dump of #1175's 262KB
  cluster but at different anchor (0x056AC0/0x058580 — not 0x04F617
  2MB-twin convention). Different tuner style. Logged.
- #1179 sw369816 `03G906016EH` Touran 1.9 TDI 1MB — EDC16U31 at
  0x0E342F/EC3E7 cluster, stock 3287 → 14765 +349%. Single SW.
- #1180 sw367948 `070906016F` Touareg 2.5 TDI 1MB — hits `0x0F0413 11B`
  BE 17719 → 39223 +121%. Single SW.
- #1181 sw387069 (no part, 1MB) Touareg 2.5 TDI — hits `0x0E3361 11B`
  BE 17719 → 39223 +121% — SAME raw signature as #1180 at different
  anchor (Δ=-0xD0B2). 2 SWs, 2 anchors, same raw. Potential cluster
  after 3rd pair.
- #1182 sw384629 `070906016DE` Touareg 2.5 TDI 524KB — matches T5
  2.5 TDI 2MB def's 524KB counterpart structure (0x055Axx/055Exx/
  056xxx range). 524KB twin of 0x1ECCDB family?
- #1183 sw383041 `8E0907401AB` Touareg 3.0 TDI 524KB — `0x0717C3/AB3/
  DA3 11B` TRIPLE mirror at stride +0x2F0 BE 13214 → 37278 +182%.
  Unique EDC15/16 3-mirror pattern.
- #1184 sw382708 `7L0907401B` Touareg 3.0 TDI 524KB — `0x0706CD 11B`
  BE 13214 → 37278 +182% — same raw signature different anchor.
  Pair #1183 + #1184 form potential 2-SW cluster.

---

## VW Pairs #1153–1168 — 2 NEW Tiguan defs (0x06B512 + 0x06CC76) — huge LXX family

**NEW DEF 1 — Tiguan LG/LK/LE/LH @ 0x06B512 2KB** (4 SWs, 5 pairs):

`edc17_c46_tiguan_03l906018lxx_06b512` — Tiguan 2.0 TDI CR 81-125kW.

- #1156 sw519357 `03L906018LG` 103kW — 0x06B512 + 0x06BF46 + 0x06BD34
- #1157 sw519354 `03L906018LK` 80.9kW — EXACT same anchors
- #1158 sw519351 `03L906018LE` 103kW — EXACT same anchors
- #1167 sw519356 `03L906018LH` 125kW — EXACT same anchors
- #1168 sw525549 `03L906018LH` 125kW — EXACT same anchors (sister of #1167)

Raw signature: stock 21260 → 57390 (+170%), 23980 → 57390 (+139%),
24383 → 57390 (+135%), 4135 → 63359 (+1432%). Same raw signature as
0x06AD86 def but at Δ=+0x78C shifted anchor — later-SW 519xxx family.

**NEW DEF 2 — Tiguan LK/LL/LE/FQ @ 0x06CC76 2KB** (4 SWs, 5 pairs):

`edc17_c46_tiguan_03l906018lxx_06cc76` — Tiguan 2.0 TDI CR 100-103kW.

- #1160 sw528324 `03L906018LK`
- #1161 sw524133 `03L906018LL` — NEW LL suffix
- #1164 sw524646 `03L906018FQ`
- #1165 sw524113 `03L906018LE`
- #1166 sw528319 `03L906018LE` (sister of #1165)

SAME raw signature as 0x06B512 def (21260 → 57390) but Δ=+0x1764
anchor-shifted. 2012 revision moved cal-block further.

Map structure:
  0x06CC76  2 KB (protection ceiling)
  0x06D6AA  512 B (companion A)
  0x06D490  512 B (companion B, stock 24213 vs 0x06B512's 24383)
  0x07DC2E  200-202 B (IQ release)

**CRITICAL OBSERVATION**: sw528324 LK appears in BOTH 0x06B4FE (#1117)
AND 0x06CC76 (#1160) — but those pairs have DIFFERENT ORIs! Same SW
number but different physical dumps/revisions. Logged.

**Existing def confirmations**:

- Pair #1162 sw508222 CD Tiguan — already in 0x069EB2 def. Confirms.
- Pair #1154 sw509913 FA Tiguan — already in 0x06AD86 def. Confirms
  hitting 2KB + 200B + companion anchors.

**Observations (no wire)**:

- Pair #1153 sw511991 `03L906018ET` — NEW ET suffix — small edits at
  0x0608F8 12B + 0x0276xx cluster. Single observation.
- Pair #1155 sw508222 CD 393KB compact — 0x0307B6 144B BE 3970 → 33056
  +733%. Compact-format twin of 2MB 0x069EB2 def. Logged.
- Pair #1159 sw511990 FB 393KB — 0x036AB2 144B +726%. Compact-format
  twin of 2MB 0x06AD86 def. Logged.
- Pair #1163 sw519350 `03L906018FQ` — NO 2KB anchor hit, only 0x071B80
  10B +130% and emission cuts. Different tuner style.

---

## VW Pairs #1137–1152 — 1 NEW def (Tiguan 0x1F276A) + 4 existing defs extended

**NEW DEF WIRED — 0x1F276A 512B cluster** (3 SWs confirmed):

`edc17_c46_tiguan_20tdi_03l906022g_1f276a` — Tiguan 2.0 TDI CR 100-103kW.

- #1121 sw391548 100kW · #1122 sw394106 103kW · #1149 sw394105 103kW
- All hit EXACT anchors + raw signature:
  - `0x1F276A 512B` BE 18989 → 57390 +202% (protection ceiling A)
  - `0x1F29F2 512B` BE 22036 → 57390 +160% (protection ceiling B)
  - `0x1F7120 12B` BE 20550 → 47175 +130% (torque lift)
- Sub-variant: #1141 sw391506 at `0x1F273E` (Δ=-0x2C anchor shift)

Third protection-ceiling SW-revision variant for VAG EDC17 C46
(beyond 398757 0x1EF502 and 0x1F007A clusters).

**Existing defs EXTENDED**:

0x1F007A def +2 NEW SWs:
- +sw505913 (pair #1128 — also at 0x06625E 524KB, both dump formats)
- +sw505914 (pair #1138 — exact 0x1F007A + 0x1F0ABE match)
Now 8 SWs across 5 part suffixes (G/R/RP/QD).

0x06AD86 def +2 NEW SWs + 2 part suffixes:
- +sw509913 `03L906018FA` (pair #1140 exact match)
- +sw511990 `03L906018FB` (pair #1150 exact match, 125kW)
Now 9 part suffixes (AR/BB/BC/GC/DQ/BD/HQ/FA/FB), 16 SWs.

0x069EB2 Scirocco def +1 NEW SW + CD suffix:
- +sw508222 `03L906018CD` Tiguan (pair #1148 exact match)
Now 4 part suffixes (AM/AN/AQ/CD).

**Multi-tune on same ORI confirmed again**:

sw396096 — both #1136 (398757 pattern) AND #1137 (0x1E513A + 0x1F9DB6
alt pattern) on SAME ORI. Different tuner styles on same structural
binary. Confirms map-region independence.

**Observations (no wire)**:

- #1139 sw501440 `03L906022RP` 2MB — hits 12×15 IQ ceiling pattern
  at 0x1DBBE8 (Δ=-0x44 from wired 0x1DBC2C) + 0x1DE56E. 2nd SW at this
  Δ=-0x44 anchor (sw501911 was first #1126). Sister sub-cluster.
- #1142 sw394105 `03L906022G` — only 3 regions (high-address 0x1FFExx
  area) — minimal tune, different tuner target.
- #1143 sw396418 `03L906022G` 2MB — `0x1E22C2 15B` +247% + `0x1CC622
  13B` +128% — different anchor cluster. Single observation.
- #1144 sw397846 `03L906022G` alt tune (was already added to 398757
  via #1125) — this pair hits `0x1F8690 16×12` +105% — different
  tuner on same ORI.
- #1145 sw501440 524KB `03L906022RP` — `0x06621A 6B` +2788% (Δ=-0x44
  from wired 0x06625E anchor) + `0x07B0A6 200B`. Anchor shift too
  large for fixedOffset — logged.
- #1146 sw522905 `03L906018ES` — `0x06CC76 2047B` BE 21275 → 47483
  +123% matches the 0x06B4FE Sharan def RAW signature but at Δ=+0x1778
  shifted anchor. NEW ES suffix.
- #1147 sw527083 ES — sister of #1146 different tune at `0x07C2E6 16×12`.
- #1151 sw510943 BB — already in 0x06AD86 def. Confirms existing.
- #1152 sw510951 `03L906018BR` — NEW BR suffix, `0x07C8E6 16×12`
  unique pattern. Single.

---

## VW Pairs #1121–1136 — Tiguan 2.0 TDI CR EDC17 C46 MASSIVE expansion

**398757 def EXTENDED — 3 NEW SWs** (all 103kW `03L906022G` 2MB):
- sw397825 (#1123/#1124, sister pairs)
- sw397846 (#1125)
- sw396096 (#1136)

All hit EXACT same companion pattern INSIDE the 398757 def's 2KB span:
- 0x1EF8A6 512B BE 14413 → 57390 +298% (inside 0x1EF502 2KB span)
- 0x1EF684 512B BE 23107 → 57390 +148%
- 0x1EF262 1024B BE 23107 → 57390 +148% (just before 0x1EF502 span)
- 0x1F0550 512B BE 22014 → 57390 +161%

398757 def now covers **26 SWs**.

**0x06625E iqrelease def EXTENDED — 4 NEW SWs + 03L997016H part**:
Pairs hitting 524KB 0x06625E 6B +2788% EXACT signature:
- sw505912 (#1133 `03L906022G / 03L997016H`) — adds 03L997016H part code
- sw505913 (#1128) — also hits 2MB 0x1F007A def
- sw505914 (#1129)
- sw505993 (#1132 `03L906022RP`) — already in 398757 (2MB) now in 524KB

Pair #1133 also hits companion `0x07B0EA 200B` + `0x079A24 16×9` +112%
— same cluster pattern as pair #1129.

**0x1F007A def cross-pair sw501911 observation** (pair #1126 125kW):
- Hits 0x1DBBE8 12×15 + 0x1DE56E 12×16 at Δ=-0x44 from 12×15 def anchor
- Hits 0x1F0036 2048B + 0x1F0A7A 512B at Δ=-0x44 from 0x1F007A def
- Consistent Δ=-0x44 cal-block shift for sw501911 — can't fixedOffset
  wire but noted as sister cluster.

**NEW cluster candidates (no wire yet — need 3rd pair)**:

0x1F276A 512B cluster (#1121 sw391548, #1122 sw394106):
- 0x1F273E/0x1F276A 512B (Δ=0x2C anchor drift) BE 18989 → 57390 +202%
- 0x1F29C6/0x1F29F2 512B BE 22036 → 57390 +160%
- 0x1F70F4/0x1F7120 12B BE 20550 → 47175 +130%
- 0x1F757A 14B BE 22304 → 46261 +107%
- 2 SWs (100kW + 103kW) — 1 more pair needed to wire.

0x1ED29A 2048B cluster (#1135 sw395477):
- Δ=-0x2DE from wired 0x1F007A. Same raw signature 14259 → 57390.
- Single SW.

**Pair #1124 sw397825 alt tune** — different tuner hit `0x1E513A 6B`
+482% + `0x1F9DB6 200B` +200% + `0x1F7E4C 6B` +125% + `0x1F8A96 16×16`
+115%. Different pattern from #1123 same SW — confirms sister-tune
independence on same ORI.

**Observations (no wire)**:
- #1127 sw395430 `03L906022HB` 524KB — -50% tune at 0x0624xx cluster.
  NEW HB suffix. Logged.
- #1130 sw396096 `03L906022GT` 524KB — 0x063C1A/0x063D82 16B — NEW GT
  suffix. Same 396096 as #1136 but different part suffix (GT vs G) and
  different tune target. Logged.
- #1131 sw398823 `03L906022QG` 524KB — `0x0643CE/0x0642DE 15-16B` +142%.
  NEW QG suffix. Single.
- #1134 sw507628 `03L906022G` 125kW 524KB — `0x064CC2 11B` +141% +
  `0x043C98 60B` -99% (emission cut). Logged.

---

## VW Pairs #1105–1120 — Tiguan catalog opens + 0x06AD86 def +HQ suffix

**Tiguan 2.0 TDI 80-103kW 0x06AD86 cluster EXTENSION**:

- Pair #1115 sw509900 `03L906018HQ` Tiguan 2.0 TDI 80.9kW — hits
  0x06AD86 2048B BE 15351 → 57390 +274% EXACTLY + 0x06B5A8 / 0x06B7CA
  companions + 0x07E036 200B +1482%. NEW HQ suffix added.

0x06AD86 def now covers 7 part suffixes (AR/BB/BC/GC/DQ/BD/HQ) and 14 SWs.

**Tiguan 1.4 TSI MED17 EA111 observations**:

- Pair #1107 sw514586 `03C906027DB` 1.47MB (Tiguan 1.4 TFSI 117kW) —
  `0x050C7C 6B` BE 8781 → 24571 +180%
- Pair #1108 sw517845 `03C906027DB` 2MB (same SGO, 1.4 TSI 117kW) —
  SAME `0x050C7C 6B` BE 8781 → 35672 +306% (different target)

Both SWs hit EXACT same anchor 0x050C7C with SAME stock raw 8781.
Two dump formats (1.47MB/2MB) AND same anchor confirm STRUCTURAL
alignment across formats. Logged — need 1 more SW at this anchor
before wiring.

- Pair #1112 sw513917 `03C906016BK` 262KB Tiguan 1.4 TSI 89.7kW —
  hits `0x014AAE 6B` BE 4135 → 45110 +991% + `0x014950/0x014A50 8B`
  BE 8270 → 52315 +533%.
  
  **MAJOR CROSS-REFERENCE**: Raw signatures 4135→45110 and 8270→52315
  match EXACTLY the wired Scirocco 03C906016L 0x054B28 + 0x05484A def!
  
  BK variant @ 262KB compact has SAME code as L variant @ 2MB. Different
  dump format, same IQ cluster. Confirms 03C906016 family-wide map
  structure.

**Tiguan 2.0 TDI CR observations (no wire — single SWs or anchor drift)**:

- #1106 sw396752 `06J906026D` Tiguan 2.0 TSI 2MB — `0x04F617 120B` IQ
  release. **Δ=+0x40000 from compact-format 0x00F617** (EA888 Gen2 MED17
  dump shift). Different shift convention from EDC17 C46.
- #1113 sw504856 `03L906022QE` Tiguan 2.0 CRDi — NEW QE suffix. Single.
- #1114 sw399397 `03L906022G` Tiguan 2.0 CRDi — `0x1E43CE 15B` +175%
  — different tuner style, doesn't hit 398757 signature.
- #1118 sw391506 `03L906022F` 524KB — `0x03EAB4 / 0x03ED3C 12B` mirror
  pair Δ=+0x288 BE 13721 → 29082 +112%. NEW F suffix, unique anchor.
- #1119 sw501912 `03L906022G` 524KB — hits `0x06621A 6B` +2788%
  (Δ=0x44 from wired 0x06625E IQ release def). Close to existing cluster
  but not exact. Single observation.
- #1120 sw395496 `03L906022HM` 125kW — economy-style tune with -50%
  edits. NEW HM suffix. Single.
- #1116 sw519354 LK + #1117 sw528324 LK — BOTH 69-79% file rewrites
  (full cal replacement, not useful for pair-diff).
- #1109/#1110 sw517159/sw528994 `03C906016CQ` 1.4 TSI 2010 — very
  light tunes, 4-7 regions only.
- #1111 sw506738 `03C906032AJ` 1.4 TFSI DPF 262KB — `0x0121F2 128B`
  +157% distinct anchor. Single.
- #1105 T5 3.2 V6 `022906032HB` sw372867 1MB — ME9 NA 184kW
  `0x011880 120B` +244% IQ release. Single.

---

## VW Pairs #1089–1104 — T5 2.5 TDI 2MB + 524KB clusters (2 MORE NEW defs) + 1.9 TDI extensions

**NEW DEF 1 — T5 2.5 TDI 128kW 2MB @ 0x1ECCDB** (4 SWs):
`edc16_t5_25tdi_070906016_1eccdb` covers L/DQ/997L suffixes.

EXACT anchor + raw signature across 4 pairs:
- #1088 sw384823 `070997016L` 2MB
- #1090 sw383806 `070906016L` 2MB
- #1100 sw390621 `070906016DQ` 2MB
- #1101 sw390621 `070906016DQ` 2MB (sister of #1100)

All hit:
- `0x1ECCDB 15B` BE 30325 → 45758 +51% (IQ ceiling)
- `0x1D5FDA 122-124B` BE 3000 → 4200 +40% (IQ release)
- `0x1D5A00 46B` BE 1902 → 2625 +38% (torque limit)
- `0x1D5EE2 24×4` BE 3062 → 4113 +34% (boost/torque map)

524KB twin (pair #1095 sw384823 524KB @ 0x06CCDB) shows +0x186000 dump
shift — same map, different dump format.

**NEW DEF 2 — T5 2.5 TDI 96kW 524KB @ 0x06CD73** (2 SWs):
`edc16_t5_25tdi_070906016ec_06cd73` covers EC/997M suffixes.

EXACT signature across 2 pairs:
- #1092 sw394114 `070906016EC` 524KB
- #1097 sw394151 `070997016M` 524KB

Both hit:
- `0x06CD73 11B` BE 16390 → 41222 +152% (IQ upper)
- `0x06CE13 11B` BE 21663 → 44396 +105% (IQ ceiling)
- `0x06D05F / 0x06D2A7 11B` mirror pair (Δ=+0x248) BE 17927 → 33749 +88%

**Extensions to existing defs**:

T5 1.9 TDI 524KB def `edc16u31_t5_19tdi_038906016_06a8ed`:
- +sw380413 (pair #1091 `038906016T` hits 0x06A8D9 — now 5 SWs total)

T5 1.9 TDI 2MB def `edc16u31_t5_19tdi_038906016aj_2mb`:
- +sw381381 (pair #1096 `038906016AJ` 2MB hits 0x1EA8ED — Δ=0x14 sub-
  variant anchor of 0x1EA8D9, 2 SWs total)

**Observations (no wire — insufficient repeats or different anchors)**:

- #1089 sw379834 `070906016CD` 524KB — hits `0x06AA37 15B` SAME raw signature
  30325 → 45758 as 2MB cluster BUT at Δ=-0x22A4 from 0x06CCDB 524KB twin.
  CD variant has its own 524KB anchor. Single-SW observation.
- #1102 sw399314 `070906016EC` 524KB — hits `0x06D04D/295 9B` mirror pair
  BE 15752 → 40264 +156%. Different map from #1092/#1097 EC cluster
  (different anchor, different stock raw).
- #1104 sw399314 `070906016EC` 2MB — `0x1ED04D 9B` BE 15752 → 40264 (2MB
  twin of #1102's 0x06D04D — Δ=+0x186000 confirms dump shift convention).
- #1094 sw390621 `37390621P52` 2.5 MB dump (2626048B) — NEW dump format,
  different anchor cluster. Single observation.
- #1098 sw384822 `37390623P52` T5 2.5 TDI 2MB 100kW — unique map at
  `0x1ECD5B 11B` +249% + `0x19C7E1 9B` +144% (EDC17 C46 territory).
- #1103 sw379835 `070906016CR` 524KB 108kW — light tune, 4 regions only.

---

## VW Pairs #1073–1088 — T5 2.5 TDI EDC16 (2 NEW defs, 5 pairs combined)

**NEW DEF 1 — T5 2.5 TDI 1MB EDC16 cluster @ 0x0E088B** (3 pairs, 3 SWs):
`edc16_t5_25tdi_070906016_0e088b` covers AP/BH/BD suffixes.

- #1076 sw372364 `070906016AP` — 0x0E088B 9B BE 30933 → 48982 +58%
- #1077 sw372943 `070906016BH` — SAME exact signature
- #1078 sw372944 `070906016BD` — SAME exact signature

Companion mirror pair:
- 0x0E2A6D 7B / 0x0E2C2D 7B (Δ=+0x1C0 mirror) — BE 46424 → 19887 -57%

Tight per-SW anchors in upper-cal region 0x0EC52x drift too much (AP=0x0EC52B,
BH=BD=0x0EC529 Δ=2) — only 0x0E088B + 0x0E2A6D pair-anchors wired.

**NEW DEF 2 — T5 2.5 TDI 524KB EDC16 cluster @ 0x06CF8D** (2 pairs, 2 SWs):
`edc16_t5_25tdi_070906016eb_06cf8d` covers 070906016EB (128kW) + 070997016L
(96kW) — both 524KB dump format.

- #1074 sw394150 `070997016L` 96kW — 0x06CF8D 13B BE 16604 → 42076 +153%
- #1075 sw394113 `070906016EB` 128kW — 0x06CF8D 13B BE 16604 → 36999 +123%

Both hit EXACT 16604 stock signature at 0x06CF8D + mirror 0x06D1D5 (Δ=+0x248).
Different tuner targets per power rating (96kW higher lift %).

**Observations (no wire)**:

- **1MB cluster variations** across other T5 2.5 TDI 1MB pairs:
  - #1079 sw368186 A @ 0x0EBA4C 24×3 +41%
  - #1080 sw372365 BA @ 0x0EC579/B9/CD 11B +777%/249%/122%
  - #1081 sw368185 no-suffix @ 0x0F85xx boost region
  - #1082 sw378321 no-part @ 0x0EC635/71/5D/85 — 4 adjacent 11B cells
  - #1083 sw370230 A @ 0x0EBA48 24×3 +45.6% + 0x0F85DD 15B +44%
  - #1084 sw372941 K @ 0x08AB18 24×3 + 0x0EBA4C 24×3 (mirror +0x60F34)

- **524KB cluster variations** (other SGOs):
  - #1085 sw380769 CG @ 0x06AD9F/0x06AFE7 15B
  - #1086 sw379833 CC @ 0x06AF19/0x06AF05/0x06ADC9/0x06B011
  - #1087 sw379831 CJ @ 0x06AAB7/0x06AD77/0x06AFBF
  - All in 0x06A-0x06B region but different per-SW anchors.

- **Pair #1073** T5 2.0 TDI CR `03L906022JE` sw515250 2MB — NEW JE suffix
  EDC17 C46 with `0x06A6A6 16×12` +53% + `0x06A8EA 16×12` +34%. Logged.

- **Pair #1088** T5 2.5 TDI `070997016L` sw384823 2MB — 2MB dump format
  of the 524KB 070997016L cluster. `0x1ECCDB 15B` +51% + `0x1D5FDA 122B`
  +40%. Single SW.

---

## VW Pairs #1057–1072 — T5 1.9 TDI EDC16U31 — 2 NEW defs (524KB + 2MB twins)

**MAJOR NEW CLUSTER — T5 1.9 TDI EDC16U31 038906016T/AJ at 0x06A8ED**:

5 pairs across 2 SGOs + 2 dump formats confirm the SAME 11B IQ unlock:
- `0x06A8ED 11B` BE 16801 → 37845 +125% (signature raw match)

524KB format:
- #1066 sw384631 `038906016T` @ 0x06A8ED ✓
- #1070 sw384633 `038906016AJ` @ 0x06A8ED ✓
- #1072 sw381381 `038906016AJ` @ 0x06A8ED ✓
- #1065 sw379728 `038906016T` @ 0x06A8D9 (Δ=-0x14 sub-variant)

2MB format:
- #1068 sw380415 `038906016AJ` @ **0x1EA8D9** (Δ=+0x184000 from 0x06A8D9)
  — NEW dump shift convention for T5 EDC16U31 (not typical +0x180000!).

**2 NEW defs wired**:
- `edc16u31_t5_19tdi_038906016_06a8ed` — 524KB primary def (4 SWs)
- `edc16u31_t5_19tdi_038906016aj_2mb` — 2MB dump-format twin (sw380415)

**Observations (no wire)**:

- #1069 sw393511 `038906016AH` 524KB — `0x06C969 11B` BE 16801 → 28731
  +71%. Same raw stock but DIFFERENT anchor (Δ=0x207C from 0x06A8ED)
  — AH sub-family with its own anchor. Single SW — log only.
- #1067 sw379832 `070906016CB` T5 1.9 TDI 2MB — different SGO (070906016
  vs 038906016) targeting `0x1D9024 30B` +363% and `0x1D5940 128B` +362%.
  2MB EDC16U34 variant.
- #1071 sw394150 T5 1.9 TDI 2MB (no part number) — `0x1ECCF3 15B` +51%,
  `0x1D5F7C 124B` +40% — different anchor cluster, no part-ID to
  cross-reference.
- #1057 sw362448 `074906018AH` T4 EDC15 PD — `0x06D30C 24×3` +45.5%.
- #1058 sw357865 `074906021A` T4 EDC15 262KB — small edits `0x03Cxxx`.
- #1059 sw356867-868 `074906021M` T4 EDC15 262KB 110.3kW — `0x03D580/6FC
  14B` mirror pair +66% (+0x17C stride = EDC15 +0x8000 mirror of half-
  KB offsets — subtle mirror variant).
- #1060 sw360079 `074906018AJ` T4 EDC15 PD 524KB — `0x0566CA/0766CA 180B`
  (+0x20000 mirror) +93%, `0x04FF80/06FF80 28B` (+0x20000 mirror) -58%.
- #1061 sw? `074906018C` T4 EDC15 PD — `0x05CCC6/068CC6/074CC6 40B`
  TRIPLE mirror at stride +0xC000 (= 3×0x4000) — unusual EDC15 stride.
  BE 7205 → 30503 +323%.
- #1062 sw360475 `074906018BG` — SAME 0x06D224/075C62 10B pattern as
  pair #1053 (sw360078 AM) and #1055 (sw351975 BG). Confirms BG
  family at stride +0x10000 / +0x20000 mirrors.
- #1063 sw? `074906021A` 262KB — `0x003E76/9E/C6 + 0x00BE76` 34B mirror
  (+0x8000 stride) — T4 traditional injection mirror.
- #1064 `021906256AC` sw358176 T4 VR6 ME7 — `0x008C70 31B` -28%,
  `0x00BB77 16B` +17%.

---

## VW Pairs #1041–1056 — Sharan QA/sw513673 + T4 2.5 TDI EDC15 PD catalog sweep

**Pair #1041** sw513673 HH Sharan (sister of #1030) — same ORI, different
Stage1. Both confirm same HH 144B anchor at `0x056B6E` (Δ=0xB4 from the
wired 0x056E22 cluster anchor). Note: sw513673 at anchor 0x056B6E while
sw518177 at 0x056E22 — Δ=0x2B4 anchor shift between HH/HK sub-SWs.
Too much drift for single fixedOffset. Logged for signature wire.

**Pair #1042** sw526305 `03L906018QA` Sharan 2013 100kW — anchor-shifted
variant of 0x06AD86 cluster:
- `0x06CC76 2048B` (Δ=+0x1EF0 from 0x06AD86) BE 21260 → 57390 +170%
- `0x06D6AA 512B` + `0x06D490 524B` — same companion structure shifted
- `0x07DC2E 202B` +1402% — SAME 200B IQ pattern at same relative offset
- QA suffix is a 2013 revision with cal-block shift. Single SW — log only.

**Sharan ME7 VR6 2.8 NA** (#1043, #1044):
- sw355260 `021906256P` — 4 × 256B loose regions ~+6% (NA torque lift)
- sw356659 `021906256AD` — `0x00B852 33B` emission-cut BE 65535 → 0
- Different SGO suffixes (P vs AD), different anchors — no cluster yet.

**Sharan Quattro 1.9 TDI** (#1045) — `038906019FC` sw362766 EDC15 PD 84.6kW:
- `0x0555CA 6B` / `0x0555E4 6B` / `0x06554E 52B` / `0x0655E4 6B` all
  BE 13345 → 56610 +324% — same cell replicated 4× (EDC15 multi-mirror
  on +0x10000 stride). Classic EDC15 cal mirror confirms.

**T4 2.5 TDI EDC15 PD catalog** (#1046–#1056 — 11 pairs):
All are Bosch EDC15 PD 524KB (or 262KB for AP/P suffixes) on
074906018/021 SGO family. Power variants 64.7/75/110.3 kW.

Anchor drift per SW too wide for fixedOffset wiring:
- #1046 sw352548 N 110kW: `0x05B556/073556 200B` (+0x20000 mirror pair)
- #1048/#1049 sw360076/sw362446 AK 64.7kW: `0x0766xx` and `0x076xxx`
  sister anchors per SW
- #1052 sw352549 M 75kW: `0x05B5A6/0735A6 120B` (+0x20000 mirror)
- #1053 sw360078 AM 75kW: `0x04D224/0x06D224 10B` (+0x20000 mirror)
  BE 4135 → 57641 +1294% (extreme IQ lift)
- #1054 sw360077 AL 75kW: `0x0561A2/0661A2 13B` (+0x10000 mirror)
  BE 18097 → 34524 +91%
- #1055/#1056 sw351975/sw367084 BG 75kW: SAME ORI, 2 sister tunes at
  `0x07658C 15B` / `0x06D810 12×13` — both mild tunes ~+14%

EDC15 mirror patterns confirmed (+0x10000 and +0x20000 strides).
Non-turbo/low-power variants with per-SW map layouts — each SW would
need its own fixedOffset if wired. Defer to signature wire.

**Pair #1047** sw356432 `074906021S` T4 2.5 TDI 64.7kW 262KB — smaller
dump format. Non-PD (021 suffix = Bosch TDI traditional injection).
`0x03C1xx` 11-12B loose edits +70/−30% range.

**Pair #1050** sw358944-945 `074906021P` 262KB + **#1051** sw?
`074906021AP` 262KB — T4 2.5 TDI 75kW traditional injection variants.
`0x03C930/03CB88 8-10B` loose edits +105-241% (IQ lift).

---

## VW Pairs #1025–1040 — MASSIVE 0x1F007A cross-VW + 0x06AD86/0x06B4FE Sharan expansion

**0x1F007A def HUGELY EXPANDED — 3 NEW SWs + 2 NEW maps**:

Pairs #1025, #1026, #1027, #1028/#1029 Sharan 100-103kW share IDENTICAL
signature across 6 maps:
- sw505976 03L906022G (#1025)
- sw505980 03L906022RP (#1026) — NEW RP suffix
- sw505989 03L906022G (#1027, already in def)
- sw505920 03L906022QD (#1028/#1029) — NEW QD suffix

Each hits:
- `0x1F007A 2048B` BE 14259 → 57390 +302%
- `0x1F0ABE 512B` BE 14413 → 57390 +298%
- `0x1F089C 512B` BE 23107 → 57390 +148%
- **`0x1FB0EA 200B` BE 4135 → 12405 +200%** ← NEW MAP added to def
- **`0x1E625E 6B` BE 2130 → 12405 +482%** ← NEW MAP added to def
- `0x1F9180 6B` BE 14954 → 32790 +119%

The `0x1FB0EA 200B` = `0x079DB6` + 0x181334 ~ Δ=+0x180000 (524KB↔2MB shift).
The `0x1E625E 6B` = `0x06625E` + 0x180000 EXACTLY (524KB↔2MB mirror!).
Confirms that this 2MB-format def is the direct twin of the 524KB
`edc17_c46_golf_20tdi_03l906022xx_iqrelease` def at 0x06625E. SAME
CODE, DIFFERENT DUMP FORMAT.

0x1F007A def now covers 6 SWs, 4 part suffixes (G/R/RP/QD).

**0x06AD86 def EXTENDED — 2 NEW part suffixes (DQ/BD)**:
- Pair #1037 sw509915 `03L906018DQ` Sharan 103kW — hits 0x06AD86 2048B
  BE 15351 → 57390 +274% EXACTLY + 0x06B5A8 512B + 0x06B7CA 512B +
  0x07E036 200B (+1402% on 200B)
- Pair #1040 sw513640 `03L906018BD` Sharan 125kW — hits 0x06AD86 2048B
  BE 21260 → 57390 +170% (higher raw stock for 125kW variant, same
  anchor structure)

0x06AD86 def now covers 6 part suffixes (AR/BB/BC/GC/DQ/BD) and 13 SWs.

**0x06B4FE def EXTENDED — +NEW KS suffix, 4 NEW SWs, 2 NEW maps**:

- sw527002 03L906018HK (#1034, #1032 sister compact)
- sw527003 03L906018KS (#1035) — NEW KS suffix
- sw518179 03L906018KS (#1036) — same KS
- sw518177 03L906018HK (#1033 compact 393KB) — confirms 393KB format
- All hit:
  - `0x056E22/E46 144B` BE 3970 → 32793 +726% (IQ release 144B)
  - `0x07DEB8/E0BE 200B` BE 4135 → 12369 +200% (200B IQ)
  - `0x066AD8/B30 13B` BE 18098 → 46556 +157% (IQ ceiling)
  - `0x066B3C/B94 13B` BE 17118 → 40542 +137% (companion)
  - `0x066B28/B80 13B` BE 18313 → 41822 +128%
  - `0x066B50/BA8 13B` BE 23304 → 46430 +99%
  - `0x0276C6 6B` BE 64085 → 1622 -97.5% (emission cut)

Also added 2 NEW maps to the 0x06B4FE def:
- `0x06BF42 512B` BE 23980 → 57390 +139%
- `0x06BD20 512B` BE 24213 → 57390 +137%

Both confirmed in pairs #1038 (HH sw518191 alt tune) + #1039 (HJ sw518192
alt tune) — different tuner style from the main 0x06B4FE tune but same
ORI map structure.

**Cross-dump-format insight**:
Pairs #1032, #1033 (393KB compact format sw517509/sw518177) hit these
patterns at compact-format anchors:
- 0x036A4E 144B · 0x046704 13B cluster · 0x05E84E 200B · 0x0076BA 6B
Compact↔2MB shift matches: e.g. 0x056E22 - 0x036A4E = 0x203D4, close
to the 0x20000 compact-format offset convention.

---

## VW Pairs #1009–1024 — Sharan 03L906018xx cluster — 1 NEW def + massive same-chassis family

**MAJOR cluster verification — VW Sharan Mk2 7N 2.0 TDI CR family**:
16 pairs, all 2010 Sharan 103kW EDC17 C46, spanning 6 part suffixes
(G/HH/HJ/HK/M/PM/H) and 13+ SWs.

**NEW DEF WIRED — 0x06B4FE protection ceiling cluster**:

`edc17_c46_sharan_03l906018hxx_06b4fe` — 4 SWs, 3 part suffixes:
- sw518191 03L906018HH (#1013) @ 0x06B4FE 2043B BE 21305 → 47454 +122.7%
- sw518192 03L906018HJ (#1015) @ 0x06B4FE 2047B BE 21275 → 47483 +123.2%
- sw518177 03L906018HK (#1020) @ 0x06B4FE 2047B BE 21275 → 47483 +123.2%
- sw517509 03L906018HK (#1017) @ 0x06B12A 2047B (Δ=-0x3D4 shifted)
- sw518189 03L906018H (#1024) @ 0x06B4FE 2048B BE 21260 → 57390 +170%
  (different tuner target using 398757-family value 57390 at same anchor)

Tight raw-value signature cross-SW (21275 → 47483 +123%) confirms
shared code layout. Added 5 SWs + 4 part suffixes to identStrings.

**Dominant Sharan 16×12 main IQ map** (observation — anchor drifts too
wide for fixedOffset):
- 0x07C768 / 0x07C96C / 0x07CBF8 / 0x07CBFA / 0x07CBFC / 0x07CDBC /
  0x07D0FC — anchor range Δ=0x994 across 10+ pairs
- Stock raw 12575-12817 → tune target 22817-27948 (+98-122%)
- Will require signature-based wire in future session.

**Special observations**:

- #1018/#1019 sw518177 HK: 79.4% of file changed (1.66 MB modified!)
  Clearly a FULL calibration replacement — not a pair-diff target.
- #1013 sw518191 HH: Notable cluster of THREE adjacent regions at
  0x06BC00/06B4FE/06C5CA (509/2043/1021 bytes) — possibly one big
  ~4 KB region that calSearch would see as one map.
- #1023 sw524660 03L906018PM: `0x07C278 16×11` +163% — SHAPE differs
  from the rest (16×11 not 16×12) — slightly different map. PM suffix
  is a separate sub-family.
- #1010 sw518714 G: only 6-byte 6B entries showing — pair diff has
  small tune or torque-limit only.

---

## VW Pairs #994–1008 — Scirocco 0x069EB2 NEW cluster (5 pairs, 3 SWs) + Scirocco R added

**MASSIVE NEW DEF — 0x069EB2 protection ceiling cluster** (5 pairs):

`edc17_c46_scirocco_03l906018am_069eb2` wired — covers **3 SGOs + 3 SWs**:
- sw508256 03L906018AM (#998, #1001, #1002 — three pairs same SW)
- sw508235 03L906018AN (#999)
- sw508234 03L906018AQ (#1003)
- All 5 pairs share EXACTLY:
  - `0x069EB2  2KB` BE 15351 → 57390 +274% (protection ceiling)
  - `0x06A6D4  512B` BE 24523 → 57390 +134% (companion A)
  - `0x06A8F6  512B` BE 24590 → 57390 +133% (companion B)
- Raw 15351 vs 398757's 14259 → different hardware gen, same family.

**sw507614 added to 2 existing defs** (pair #1000):
- 12×15 IQ ceiling def: hits 0x1DBC2C + 0x1DE5B2 exactly
- 0x1F007A shifted protection def: hits 0x1F007A + 0x1F0ABE exactly
- Pair #1000 is THIRD file to confirm 0x1F007A cluster (now 3 SWs
  covering sw504872/505989/507614).

**Scirocco R 2.0 TSI added to Golf R def** (pair #1005):
- sw504147 `8P0907115B` Scirocco R Mk2 — hits 0x1CEE80 120B EXACTLY
  (BE 10750 → 65535 +510%)
- Golf R 1K8907115F def now covers BOTH chassis (Golf R + Scirocco R)
  on sw505204/510589/504147.

**Compact format 393KB observed** (#997 sw511962 `03L906018GF`):
- 393216 B = 384 KB compact EDC17 C46 dump format (NEW size variant)
- `0x05E1E2 200B` BE 4135 → 12372 +200% — matches 200B pattern at
  compact-format anchor.

**Observations (no wire — insufficient repeats):**

- #996 sw508256 AM — DIFFERENT tuner targeting 0x05AD70 12×15 +
  0x05C7DC 12×16 IQ ceiling. Same ORI as 0x069EB2 cluster, different
  tuner chose different maps. Confirms map-region independence.
- #997 sw511962 GF 393KB — compact format IQ release observations.
- #994 sw505482 03L906019AL EDC17 C64 (not C46) 2MB · different
  family entirely · `0x1E0D34 16×12` +94% main IQ.
- #995 sw507615 03L906022G 125kW — already in 12×15 def; this pair
  confirms at `0x1F9C3C/1F99C2/1F9DCA` high-region maps (different
  tuner targeting).
- #1004 sw503606 `06J906026AR` 262KB Scirocco 2.0 TSI EA888 Gen2 —
  `0x00F607 120B` IQ release BE 11441 → 25700 +125%.
- #1006/#1008 sw395040 `06J906026AR` 262KB — `0x00F63F 120B` same
  pattern (Δ=0x38 shift). 2 sisters (#1008 is "Letzte Bearbeitung"
  duplicate of #1006).
- #1007 sw503606 `06J906026D` 2MB (sister of #1004 262KB) — different
  anchor pattern at `0x056ED4/E0C/E34/E48` — 2MB vs compact format
  mapping difference.

---

## VW Pairs #978–993 — Scirocco 2.0 TDI CR EDC17 C46 — HUGE expansion + 1 NEW anchor-shifted def

**MAJOR cross-verification — Scirocco fits existing Golf defs:**

398757 protection-ceiling def **+3 NEW SWs**:
- sw397822 (#980 · 03L906022G) — hits 0x1EF502 2KB region at 0x1EF8A6
  (within span, 932B from anchor)
- sw399398 (#983, #991 · 03L906022BQ/G) — **pair #991 hits 0x1EF502 2KB
  AND 0x1EFF46 512B EXACTLY** (14259 → 57390 +302.5% — signature-match
  raw values). Pair #983 same SW but different tuner style.
- sw399800 (#987 · 03L906022G) — **hits 0x1EF502 2KB AND 0x1EFF46 512B
  EXACTLY** — same raw signature as 398757 SWs.

398757 def now covers **23 SWs** — definitively the dominant Golf/
Scirocco/Audi 2.0 TDI CR 80-103kW EDC17 C46 protection-ceiling cluster.

03L906022xx IQ release (524KB) def **+2 NEW SWs**:
- sw397832 (#982 · 03L906022S/G 524KB) — hits 0x06513A AND 0x079DB6 200B
  EXACTLY (raw 2130 → 61525 +2788%, 4135 → 12405 +200%)
- sw505989 (#993 · 03L906022R/G 524KB) — hits 0x06625E 6B IQ release
  EXACTLY (raw 2130 → 61525 +2788% — signature-match)

12×15 IQ ceiling def **+1 NEW SW**:
- sw504872 (#992 · 03L906022G 2MB) — hits 0x1DBC2C 12×15 AND 0x1DE5B2
  12×16 EXACTLY (15 → 27424 +180849%, 607 → 9473 +1459%)

**NEW DEF WIRED — 0x1F007A anchor-shifted protection ceiling**:

`edc17_c46_scirocco_20tdi_03l906022g_1f007a` — Δ=0xB78 anchor-shifted
variant of the 398757 cluster. Verified in pairs #988 + #992:
- sw505989 (#988, 03L906022G 2MB): 0x1F007A 2048B (14259→57390 +302.5%)
  + 0x1F0ABE 512B (14413→57390 +298%) + 0x1F089C 512B torque-lift
- sw504872 (#992, 03L906022G 2MB): SAME 3 anchors, SAME raw values —
  identical code at relocated SGO offset.

**CRITICAL INSIGHT**: sw504872 hits BOTH:
1. The 0x1F007A cluster (2MB-level protection ceiling — same code as
   398757, just later-SW anchor)
2. The 0x1DBC2C 12×15 IQ ceiling cluster (IQ release map)

Same file shares maps from TWO different defs — protection + IQ
release treated independently by tuners. Confirms map-region
separation approach is correct.

**Other observations (no wire — different anchors):**

- Pair #984 sw501957 LD 524KB: `0x0657D6 6B` (Δ=0xA88 from 0x06625E)
  + `0x07A456 200B` (Δ=0x6A0 from 0x079DB6) — SHIFTED version of the
  iqrelease def. Near-family but not fit.
- Pair #985/#986 sw501956/501957 LC/LD 524KB: different anchor at
  `0x0643D0 13B` — 125kW sub-family with its own map layout.
- Pair #989 sw511962 03L906018GF 2MB: `0x07CA90 16×12` +122% main IQ.
- Pair #990 sw505903 03L906019AL 2MB: EDC17 C64 family (019xx suffix) —
  different family entirely. `0x19B246/B31A` torque limits cut.
- Pair #979 sw515355 03C906027BA 1.4 TSI: 4 regions only — light tune.
- Pair #978 sw518327 03C906027BS 1.47MB (sister of #964) — same 10
  regions pattern — NEW dump format 1540096B repeats at #964/#978.

---

## VW Pairs #961–977 — Scirocco 1.4 TSI MED17 EA111 (1 NEW def) + Passat5 1.6/2.0 FSI + TFSI variants

**NEW DEF WIRED — MED17 Scirocco 1.4 TSI EA111 03C906016L sw505084**:

4 sister pairs at same ORI (#965/#966/#967/#972):
- #965/#966 (2MB, 2009): Heavy unlock tunes hitting the IQ cluster
  - `0x054B28 6B` IQ ceiling peak (raw 4135 → 45110 +991%)
  - `0x05484A 8B` IQ release upper (raw 8270 → 52315 +533%)
  - `0x054912 64B` primary IQ release (raw 11340 → 29791 +163%)
  - `0x05571A 42B` emission limit (raw 317 → 0, -100%)
- #967/#972 (2MB): Torque-limiter-style tunes targeting `0x05AA4D 12×6`
  / `0x05CE3E 16×6` mirror set (different map — stock value reductions)
- All 4 share the SAME ORI structure (sw505084) — tuner style dictates
  which cluster gets hit.
- Wired `med17_scirocco_14tsi_03c906016l_054912` with fixedOffset 0x054912
  (64B IQ release) + 0x054B28 (6B ceiling peak) — HIGH confidence anchors.

**03C906016 sw399401 + sw505084** observations:
- #971 03C906016 (no suffix) sw399401 2MB — only 122B/2 regions changed.
  Different SW family from 399401B, very light tune. Logged only.
- #969 03C906016B sw399401 (262KB compact format) — `0x015138 40B` BE
  1737 → 7333 +322%. Compact-format IQ ceiling.

**03C906027AT** — sw504569 (262KB #970, 2MB #977) and sw509113 (2MB #974/#975):
- Different dump formats across same SGO. 2MB #974 hits `0x04D3AA 8B`
  (BE 15478 → 45820 +196%) + `0x04FE76 92B` (BE 12243 → 32894 +169%).
- 2 dump format variants across same SW — no clean fixed anchor yet.

**03C906027F sw501379** (#968, 262KB compact):
- `0x00F72A 92B` IQ release BE 12243 → 32894 +169% — same structure
  as sw509113's 2MB `0x04FE76` but at compact-format anchor.
- Confirms MED17 compact-vs-2MB dump-format shift on same map.

**03C906056DC sw377814** (#961 — Passat5 1.6 FSI):
- 2MB, 18 regions · matches #960 AA sw381957 anchors exactly
  at `0x1D526C / 0x1D5298 / 0x1C61E6 / 0x1C6126`. DC/AA sub-cluster
  confirmed — logged for future wire after 3rd same-anchor SW.

**06F906056AM sw376501** (#962 — Passat5 2.0 FSI 2005):
- MED17 NA 2.0 FSI 110kW. 46 regions. Torque edits at
  `0x1C9FAE 128B` +16.6%, `0x1CA579 7B` -16.3%, `0x1C9A4C 12×11`
  small-cell torque tweak +2.6%. No cluster yet.

**06J906026D sw393392** (#963 — Passat6 2.0 TFSI EA888 Gen2 2009):
- 262KB compact · MED17 EA888 Gen2 — `0x00F617 120B` IQ release
  BE 10604 → 25700 +142%. SAME 120B IQ unlock as Golf EA113 MED17
  (0x1CE0C8), at compact-format anchor. Confirms EA113/EA888
  IQ release pattern is universal MED17 — only anchor and magnitude
  vary.

**03C907309A sw504449** (#973 — Scirocco service ECU code 262KB):
- Heavy tune with `0x015E90 46B` BE 3455 → 43530 +1160% IQ peak.
- `0x0126A4 6B` BE 4135 → 45110 +991% — SAME pattern as
  03C906016L sw505084's `0x054B28` at compact-format anchor.
- Compact→2MB shift: 0x054B28 - 0x0126A4 = 0x42484 — consistent
  with ~0x42000 compact-format offset family.

**03C906016DF sw522132** (#976 — Scirocco 2010 late variant):
- 2MB · 7 regions · 609B, lighter pattern.
- `0x04FF7E 96B` BE 30036 → 38282 +27.5% — same region as sw509113
  `0x04FE76` (Δ=0x108 anchor shift). Related pattern.

**Scirocco BS sw518327** (#964 — 03C906027BS):
- 1540096B (NEW 1.47MB dump format!) — MED17.
- `0x05049C 96B` BE 16300 → 34389 +111% IQ release candidate.
- Single-SW observation — too new a variant to wire yet.

---

## VW Pairs #945–960 — Passat 3C EDC16 PD + CC 03L906022CL + W8 ME7 + 1.6 FSI MED17

**EDC17 C46 03L906022CL** — NEW CL suffix observed:
- Pair #949 Passat CC 2.0 TDI CR 2008 `03L906022CL` sw397843 (524KB) —
  39 regions, dominant pattern `0x063Cxx` / `0x063Dxx` IQ tweaks
  (+29% to +53% varied cells); twin `8×10` tables at `0x033AC2` / `0x033BF6`.
- Pair #950 SAME sw397843 but labeled as `03L907309` (ECU unit code
  variant labeling) — 38 regions with IDENTICAL patterns at same
  offsets — confirms #949 = #950 code path, just different naming.
- Not enough SWs yet for CL wire — observation only.

**MED17 Passat B6 2.0 TFSI 3C0907115F cluster** (#947, #948):
- 2 SWs on same SGO `3C0907115F`:
  - sw391668 (2005): `0x1CDA66 120B` IQ ceiling (BE 10604 → 32896 +210%)
  - sw377866 (2007): `0x1CD85A 120B` IQ ceiling (Δ=0x20C anchor shift)
- 64B companion: `0x1CE0E0` (#947) / `0x1CDED4` (#948) — Δ=0x20C same
- Note: This sub-family uses +210% (reach ~32896) vs other clusters'
  +518% to 65535 ceiling. Softer tune, lower IQ ceiling target.
- Different anchor per SW → signature wire needed (not fixedOffset).
  Logged for future signature extraction.

**EDC16 PD 03G906021AB cluster growing** — now 4 SWs:
- Pair #941 1.9 TDI 77kW sw381562 (524KB, 120 regions, 2830B)
- Pair #943 2.0 TDI 103kW sw382426 (524KB, 72 regions, 2238B)
- Pair #944 2.0 TDI 103kW sw393514 (524KB, 189 regions, 4214B)
- Pair #946 2.0 TDI 103kW sw389290 (0281012119, 524KB, 67 regions)
- Shared region `0x06B5xx` / `0x06B2xx` IQ/torque area across all
- Too many unique anchors per SW to fixedOffset wire — EDC16 PD style
  varies per-SW more than EDC17 C46.

**Passat 2.0 FSI MED17** (non-turbo, NA) — #945 `06F906056AN` sw376502:
- 2MB · 52 regions · 1585B
- `0x1CA0CB/F7/17B` power cluster +6-38%
- NA MED17 family - different architecture from turbo FSI.
- No cluster yet, logged.

**EDC15 V6 TDI 0281010447 sub-family grew** — sw360452 (#953, #954):
- `0281010447 3B1907401B` sw360452 (2001 110kW)
- 524KB · 135 regions · ~5200B (2 stage1 variants, same ORI)
- Dominant pattern: `0x04CF3E` + `0x056F36` + `0x0570B2` + mirrors at
  +0x20000 — (0x06CF3E / 0x076F36 / 0x0770B2)
- All show BE 4135 → 41000 **+891%** (same mirror set → same cell,
  EDC15 stores identical cal at 5 locations +0x8000/+0x10000/+0x18000/
  +0x20000/+0x38000). Sister of sw366617 #925/927/928.

**Passat V6 TDI 1999 0281001938 3B0907401** (#952 — same HW as #931/#932):
- sw356795-796 confirmed 3rd pair at this HW. EDC15 256KB variant.
- Same mirror triplet at +0x8000/+0x30000 (`0x0046AA / 0x00C6AA /
  0x03C6AA`) — BE 7205 → 30503 +323%.

**Passat PD 038906019DS** (#951) 2002 95.6kW:
- EDC15 PD older part (038 prefix, not 03G) — historical variant
- `0x056E90` / `0x076E90` (+0x20000 mirror) cut to 0 — emission disable
- `0x07FDA0`/`0x07FF5A` checksum-region edits — also typical EDC15.

**Passat 1.6 FSI MED17 03C906056T/AA** (#959, #960):
- sw374338 T (2006), sw381957 AA (2007) — 2 SGO variants, MED17
- Dominant edits in `0x1D5x` cluster +10-16%, `0x1C9x` / `0x1C6x` IQ
- Different anchors per SW — no fixedOffset wire.

**Passat W8 07D906018B/C/E** — 3 SGOs across #956/#957/#958:
- ME7 W8 4.0L naturally aspirated 202kW supercar-tier
- #957 has `0x015FAA 118B` BE 27182 → 110 (emission-disable region)
- #958 has SAME 118B pattern at `0x015C1E` (Δ=0x38C anchor shift)
- Distinctive family signature but too few pairs (1 each of 3 SGOs).

---

## VW Pairs #929–944 — Passat 2.5 TDI V6 EDC15 expanded + MED17 3.6 FSI VR6 + EDC16 PD cluster

**EDC15 V6 TDI cluster gets sw360452 sub-family** (pairs #953/#954 —
continued into next batch; see #945-960 section).

**EDC15 V6 TDI 0281001938 3B0907401 sw356795** cluster (#931, #932):
- 256KB EDC15 older V6 TDI — sw356795-796 dual-calibration file
- Shows stride 0x8000 / 0x30000 mirror pattern (3B mirrors):
  `0x0046AA / 0x00C6AA / 0x03C6AA` all BE 7205 → 30503 +323%
  `0x0053A4 / 0x00D3A4 / 0x03D3A4` all BE 16289 → 43323 +166%
- Pair #932 same ORI, different Stage1 — 122 regions.

**Passat V6 TDI 132kW** (#929, #933):
- #929 `0281011386 8E0907401N` sw367176 — 1MB, 8B changed, **0 regions**
  (tune essentially null — marker file or option flag only)
- #933 `0281011387 8E0907401J` sw367775 — 1MB, 22484B (2.144%),
  **452 regions** — heavy EDC15 cal across many mirrors
  Dominant `0x01211E` / `0x02211C` / `0x04211C` / `0x07211C` /
  `0x0CE11E` / `0x0EE11E` — EDC15 8E-hardware 6-position mirror:
  +0x10000 / +0x20000 / +0x50000 / +0xBD000 / +0xDD000 pattern.
  BE 4135 → 26665 +544% on IQ cells.

**Passat 2.5 TDI 899988** (#930) — no hardware ID in filename,
sw899988. 524KB. 21 regions. Likely a third-party flashed file.
Won't catalog.

**Passat 2.8 / 2.8 30V / 2.8i / 2.9 VR6** (#934-#936, #955):
- #934 `0261207469 3B0907551CH` sw360666 — ME7 V6 30V 150kW
  `0x016260/63E0 12×9` -15.5% torque limit ~= same map 2× mirror
- #935 `0261203973 021906259B` sw355566 — ME7 VR6 128kW (131KB dump)
- #936 `0261206387 3B0907551Q` sw354074 — ME7 V6 142kW
- #955 `0261203967 021906256C` sw355937 — ME7 VR6 2.9i 136kW
  `0x00B2xx`-`0x00B9xx` family — 256B loose edits +7-8%

**Passat 3.6 FSI MED17 VR6 cluster** (#937-#940) — 4 pairs:
- #937 `0261S02169 03H906032C` sw376323 (2005, 2MB) — 14 regions, 538B
- #938 `0261S02616 03H906032AB` sw396324 (2007, 2MB) — 12 regions, 468B
- #939 `0261S02454 03H906032AB` sw399164 (2008, **2605056B = 2.48MB**) —
  NEW dump format! 13 regions, 592B
- #940 `0261S02625 03H906032AB` sw394385 (2008, 2MB) — 13 regions, 592B
- Shared torque cluster `12×16` near `0x1C8B/1C8C` + secondary `12×16`
  near `0x1CA2/1CA4` + IQ `12×12` near `0x1C9A/1C9D`
- Anchor drifts Δ=4B between same-year same-part sw394385/sw399164 —
  too tight to group but not exact — need signature wire.
- Logged for future signature extraction.

**EDC16 PD 03G906021AB cluster START** — first 3 pairs (#941, #943, #944):
- #941 1.9 TDI 77kW sw381562 · #943 2.0 TDI 103kW sw382426 · #944 2.0 TDI
  103kW sw393514
- Common region `0x06B5xx`, `0x06B2xx`, `0x056xxx`, `0x05Axxx`
- Per-SW offset drift too much for fixedOffset — logged.

**Passat 3c 03G906018EM with tool ID** (#942):
- `03G906018EM 6576286552` (no SN serial — uses Bosch tool ID field)
- 256KB · 58 regions · 5915B (2.256% — heavy tune)
- `0x01ED0F 128×4` BE 27256 → 30248 +11% (large map edit)
- `0x0145FF 16×3` +10.3% (smaller torque table)
- EM is already in PPD1.2 def via existing identStrings (03G906018EM).

---

## VW Pairs #913–928 — PPD1.2 +EJ/CE/SN100L1 + Passat MED17 TFSI (2 NEW defs) + V6 TDI EDC15

**PPD1.2 def expansion** — +2 part suffixes +1 serial sub-family:
- `03G906018EJ` (#913, SN000F7500000) — NEW EJ suffix (Passat 2007 103kW)
- `03G906018CE` (#914, #915, SN100L1000000) — NEW CE suffix (Passat 2007 103kW)
- `SN100L1000000` — NEW SN100L1 sub-family for CE variant

Pair #913 sw SN000F7500000: IQ ceiling pattern at `0x01BD7C 16×5`
(raw 9252 → 10086 +9.0%), mirrored 8× at stride 0x200 through 0x01CB7C.
Bosch PPD1.2 storage-mirror pattern.

Pair #914 CE variant SN100L1000000: heavy tune with 213 regions over
17273 bytes — loose modifications at `0x02F8xx` with boost and smoke
peaks (BE 20 → 35607 on one cell). Aggressive stage.

Pair #916 03G906018EM SN100L6000000 (125kW): emission-disable —
`0x016D38 16×12` IQ map zeroed out (BE 6741 → 0). This is a
Bosch-style DPF/EGR cut, not IQ release — characteristic of pairs
that disable DPF regen and EGR closure. Already covered by PPD1.2 def.

Pair #917 03G906018 SN0I0M8000000 Italian-market — already covered.

**NEW DEFS WIRED (2) — MED17 Passat 2.0 TFSI cluster**:

Pair #918 VW Passat 2.0 TFSI 2006 `8P0907115B` sw391091 (0261S02474):
- 2MB · MED17 EA113
- `0x1CE884  120B u16 BE` IQ ceiling (raw 10604 → 65535, +518%)
- `0x1CF4A0  64B  u16 BE` IQ release (raw 32613 → 65535, +101%)
- NEW def `med17_passat_20tfsi_8p0907115b_1ce884` wired.
- Same 120B IQ unlock shape as Golf `med17_golf_20tfsi_1k0907115_1ce0c8`
  but anchor shifted Δ=0x7BC — Passat 3C chassis sub-family.

Pair #919 Passat 2.0 TFSI 2008 `3C0907115Q` sw387486 (0261S02105):
- 2099200B = 2MB + 2KB (unusual dump format variant)
- `0x1CE2A4 120B` IQ ceiling (raw 10604 → 65535, +518%)
- `0x1CEEC0 64B` IQ release (raw 32613 → 65535, +101%)

Pair #922 Passat 2.0L TFSI 2007 `3C0907115Q` sw387486 (0261S02333):
- 2097152B standard 2MB format (SISTER of #919 — different 0261 serial
  of same SGO, different dump size)
- Same `0x1CE2A4` and `0x1CEEC0` anchors confirmed.
- NEW def `med17_passat_20tfsi_3c0907115q_1ce2a4` wired with BOTH
  0261 serials in identStrings + both file size formats supported.

Third-sub-family confirmed: MED17 EA113 IQ unlock appears at 4 different
anchors across 4 SGO clusters (Golf 0x1CE0C8, Passat 8P 0x1CE884, Passat
3C 0x1CE2A4, plus the older 0x1CC6FC/0x1CD0C6/0x1CD67A SW-specific offsets).

**Other pairs processed (no wire — observation only)**:

Pair #920 Passat 2.0 V8 2001 `3B0907557R` sw366470 (ME7.1.1 Bosch V8):
- 1MB · 18 regions · 1164B changed (0.111%)
- Large loose region at `0x011DF2 191B` BE 22288 → 65535 +194%
- Small loose edits at `0x0F18FC` / `0x019675` — torque limit areas
- Single hardware known, no cluster yet — logged for cross-ref.

Pair #921 Passat 2.0i 2002 `06B906033T` sw247607 (Siemens Simos3 5WP4010):
- 512KB · 3 regions · 311B changed (0.059%) — light revision
- `0x04B34A 8×15` BE 27561 → 29448 +6.8% (likely torque limit)
- `0x04E34E 12×12` BE 31378 → 30776 −1.9% (lambda trim)
- No cluster yet — single SW observation.

Pair #923 Passat 2.0 TDI DPF 2005 `03G906021LR` sw380420 (EDC16 PD 103kW):
- 524KB EDC16 PD · 90 regions · 2252B (0.430%)
- DPF-enabled variant — many loose small edits at mid-region offsets
- Candidate for future EDC16 PD DPF-specific cluster.

Pair #924 Passat 2.3 V5 `071906018P` sw350042 (ME7.x Bosch 0261206165):
- 256KB · 10 regions · 1272B (0.485%)
- Three 256B regions at 0x00B8B3–0x00BB7C all +8% raw (power cluster)
- Two 8×11 maps at 0x0091E8 / 0x00930C both +2.5%
- Naturally-aspirated torque lift — logged for future V5 cluster.

**Passat V6 TDI EDC15 cluster** (Bosch `0281010447 3B1907401B` sw366617):
Pair #925 / #927 / #928 — 3 pairs same hardware+SW, 3 distinct tunes:
- Pair #925: 3776B / 64 regions — `0x057476 loose 11B` +189%, twin
  mirrors at `0x077xxx` (+0x20000) — EDC15 5-mirror layout confirmed
- Pair #927: 2367B / 47 regions — same mirror pattern, different tune
- Pair #928: 1682B / 53 regions — same mirror pattern, milder tune

Pair #926 Passat V6 TDI `0281010101 3B1907401` sw354258 (EDC15 older):
- 524KB · 66 regions · 2300B (0.439%)
- `0x04CF0E`, `0x05CF0E`, `0x06CF0E` same-edit at stride 0x10000
  (EDC15 +0x10000 mirror triplet) — smoke/IQ limit with 3 mirrors
- `0x05728E`/0x06728E/0x07728E same-edit stride 0x10000 — 3rd triplet
- Confirms EDC15 mirror layout (+0x10000 cal-mirror typical).

No EDC15 V6 TDI 0281010447 def wired yet — 3 pairs at sw366617 is
enough to see the pattern but I want one more HW variant before
committing a cross-SW def. Logged for future wire.

---

## VW Pairs #897–912 — Passat 2.0 TDI PPD1.2 BIG family expansion

**PPD1.2 def +5 NEW SN0 serial families and 2 new part suffixes**:
- `03G906018AC` (Passat #902) — NEW AC suffix
- `03G906018CR` (Passat #905, #911) — NEW CR suffix
- `SN000F7100000` (#903) — Passat 2007 SN0 sub-family
- `SN000F7200000` (#904) — sub-family
- `SN000F7600000` (#906) — sub-family

PPD1.2 def now covers **15+ part suffixes** spanning original PPD1
(2002 SN000F era — A/AC/CD/CR + no suffix), standard PPD1.2 (2006-2010
SN100x — DH/AQ/BL/CT/EM/FB/FG/HB), Italian-market (SN0I), VW service
(03G997256C), and Passat 2007 SN0 expansion (SN000F71/72/75/76).

**Passat 2.0 TDI PD EDC16 PD 03G906021xx** (#897-#901):
- 03G906021AB sw399387 (#897, 2MB) — 2394B/84
- 03G906021MT sw382427 (#898, 524KB) — 1468B/35 NEW MT suffix
- 03G906021NK 3 SWs (sw394904 + sw399388 + sw393514) — same hardware
  multi-SW cluster, sister of #754 same hardware

**Passat 2.0 TDI PPD1.2 file size variants**:
- Most are 256KB cal-only dumps (`SN000F` and `SN100K` partial format)
- Pair #911 03G906018CR SN000F7200000 = **244KB (249856 B)** —
  another partial-dump format

**Pair #909/#910** 03G906018EM (no SN serial — uses Bosch tool ID
`4369657628.90.02` instead) — 2 sister files with different stage1
sizes (21672B + 14701B). Heavy tunes.

**Pair #902** 03G906018AC SN000F7500000 — NEW AC suffix added.
**Pair #903** 03G906018 SN000F7100000 (no suffix, "bare" 03G906018).

## VW Pairs #881–896 — Passat 2013 03L906018xx + 04L906021DT EU6

**Strong pair confirmations**:
- 03L906018NF sw524631 (#881) and 03L906018NG sw524632 (#882) →
  IDENTICAL 8607B/67 regions across NF/NG suffixes (sister of
  Audi #92 same SW). Likely same SGO at sister anchor.
- 03L906012AA sw527066 (#891) and sw535337 (#892) → IDENTICAL
  6126B/117 regions across 2 SWs same hardware. Wire candidate.

**04L906021DT EU6 cluster**:
- sw531109 (#885) — 15677B/161
- sw533908 (#886) — 16083B/176
- 2 SWs same EU6 hardware sharing similar pattern. Could wire.

**Other Passat 03L906018 variants**:
- 03L906018PA sw522984 (#883, alt file from #869) — 9525B/105
  (different stage1)
- 03L906018PA sw536214 (#893) — newer 2014 SW
- 03L906018G sw527009 (#887) — bare G suffix (not the GG already
  noted)
- 03L906018PG sw524682 (#888) — NEW PG suffix
- 03L906018QP sw528371 (#889) — NEW QP suffix
- 03L906018RF sw529268 (#890) — NEW RF suffix
- 03L906018NJ sw531634 (#895) — sister of Audi/Caddy NJ cluster
- 03L906019FK sw532889 (#884) — NEW FK suffix EDC17 C64
- 03L906019GG sw535316 (#894) — sister of Golf #10 same hardware

**03G906021AB sw394115 0281012119** (#896, Passat 2.0 TDI PD 524KB)
— sister of #5/#680 same hardware code.

## VW Pairs #865–880 — Passat 2012 03L906018xx variant catalog

16 more Passat 2.0 TDI CR 2012 EDC17 C46 pairs across many part
suffixes:

**03L906018xx family** (#865-#879):
- 03L906018CP sw510961 (#865) — already in 0x06AD86 cluster (or
  sister)
- 03L906018GG sw511961 (#866) — sister of #276 already in Caddy def
- 03L906018NA sw526336 (#867 stage1+++) — NEW NA suffix
- 03L906018PA sw521065 (#868) and sw522984 (#869) — 2 SWs same hw
- 03L906018PR sw521094 (#870), sw522965 (#871), sw526304 (#872) —
  3 SWs of PR suffix
- 03L906018PT sw522950 (#875) — NEW PT suffix
- 03L906018QA sw521097 (#877) — NEW QA suffix
- 03L906018AM sw525560 (#878) — sister of Scirocco #1001
- 03L906018PD sw521068 (#879) — NEW PD suffix
- 03L906018FQ sw524646 (#880) — NEW FQ suffix

**03L906022CH sw518139** (#873) — 2779B/52 = light tune

**03L906018 0281017946 sw524113** (#874, no part suffix?) — 8590B/79

**03L906012AF sw527064** (#876) — NEW 03L906012 prefix (the older
Passat 1.6 TDI 2.0L hardware?). 6126B/117 regions.

All these 03L906018xx variants probably hit `0x06AD86` or sister
anchors but each SW has its own offset. Wide coverage from existing
def via SW identStrings.

## VW Pairs #849–864 — Passat 0x06AD86 +sw510959 + sister sub-clusters

**Golf 0x06AD86 def +1 SW**:
- 03L906018BF sw510959 (#857) → IDENTICAL `0x06AD86 + 0x06B7CA +
  0x06B5A8 + 0x07E036` cluster. ADDED sw510959. Now **11 SWs**.

**Sister sub-clusters of 0x06AD86** (NOT in fixedOffset def):
- 03L906018H sw513674 (#846 prior) → `0x06AE46` (Δ=+0xC0 sister)
- 03L906018NT sw522948 (#862) → `0x06CC76` (Δ=+0x1EF0 sister) +
  `0x06D6AA + 0x06D490 + 0x07DC2E` — large 0x06CC76 sub-cluster
- 03L906018PR sw526304 (#860, #861 — 2 sister files) → `0x07C4A8
  16×16 + 0x07C6DA 510B + 0x07BF46 16×9` — this is the 03L906018JL
  522xxx cluster pattern (sister of 398757-style at low region)

**Multiple sister files of same SW**:
- 03L906018BF sw510959 (#849, #850 stage1+++, #859 393KB, #857) —
  4 different files of same hardware/SW
- 03L906018PR sw526304 (#860, #861) — 2 sister files
- 03L906018BC sw510944 (#854, alt file) — already in def

**03L906018BN sw513642** (#856) — NEW BN suffix, 8991B/59 — sister
of NT sw522948 cluster.

**03L906022CB sw518155** (#856) — `0x070292 2KB + 0x07000A 512B`
cluster — NEW CB suffix, NEW 0x070292 sub-cluster.

**03L906022CD sw535350** (#858, 2MB) — light 2693B/48 tune.

**03L906019DH sw518154** (#852, alt file from #828) — 2692B/50
(lighter than #828's 14KB heavy tune of same SW).

**03L906019FC sw526357** (#853, Passat) — sister of Amarok 03L906019FC
sw518109 cluster.

**03L906019DS sw518128** (#864) — NEW DS suffix.

## VW Pairs #833–848 — Passat 0x06AD86 cross-VW expansion + 398757 +2 more

**Golf 0x06AD86 def +2 SWs**:
- 03L906018BG sw513641 (#837/#838 — 2 sister files) → IDENTICAL
  `0x06AD86 + 0x06B7CA + 0x06B5A8 + 0x07E036` cluster. ADDED.
- 03L906018BE sw510958 (#848, alt file from #841) → IDENTICAL.
  ADDED.
- 03L906018H sw513674 (#846) → `0x06AE46/0x06B88A/0x06B668` (Δ=0xC0
  sister anchor) — sister sub-cluster, doesn't fit fixedOffset.
- Now Golf 0x06AD86 def covers **10 SWs** spanning Caddy/Golf/Passat.

**398757 def +2 more SWs**:
- 03L906022QB sw398818 (#847) → IDENTICAL `0x1EF502/0x1EFF46`. ADDED.
- 03L906022QG sw505922 (#835) → IDENTICAL pattern. ADDED.
- Now 398757 def covers **20 SWs** spanning A3/A4/A6/Allroad/Q5/
  Passat/Golf/Jetta 2.0 TDI CR.

**Other Passat 03L906018 variants**:
- 03L906018BD sw513640 (#817) — different sub-cluster
- 03L906018BC sw510944 (#834, alt file — already in Golf 0x06AD86 def)
- 03L906018DQ sw509915 (#839) — only 1294B/21 = light tune
- 03L906018CP sw510961 (#842, #843, #844 — 3 files: stage1+++ +
  normal + stage1+++) — NEW CP suffix
- 03L906018CQ sw513643 (#845) — NEW CQ suffix
- 03L906019AC sw505412 (#840) — sister of #827 same hardware

**03L906022 other**:
- 03L906019FA sw526355 (#833) — 5492B/68 sister of Amarok cluster
- 03L906022JF sw504908 (#836) — `0x07CBDA 16x16` cluster (different
  sub-family)

## VW Pairs #817–832 — Wire Passat 03L906022MS/SC + 03L906019AC sister cluster

**STRONG WIRE: Passat 0281015131 03L906022MS/SC 2MB cluster**:
- 03L906022MS sw500159 (#820) — 2604B/46
- 03L906022SC sw500160 (#821) — 2604B/46 IDENTICAL
- 03L906022MS sw513692 (#822) — 2604B/46 IDENTICAL
- All 3 hit IDENTICAL `0x1CA18A 6B + 0x1C8BEC 13B + 0x1C8AFC 14B +
  0x1DA33A 279B + 0x1DA492 279B + 0x1DA286 128B + 0x1CA052 14B`
  cluster.

Wired as `edc17_c46_passat_20tdi_03l906022ms_sc`. **18th wired ECU
def.** Same value treatment as iqrelease 0x06625E (raw 2130→max)
but at high-region 2MB anchor.

**03L906018BD sw513640** (#817) — NEW BD suffix.
**03L906018BE sw510958** (#818, **393KB partial**) — NEW BE suffix.
**03L906022KP sw504853** (#819) — 11580B/150 sister cluster.

**03L906018AR sw505437** (#823) → `0x069EB2 2KB + 0x06A6D4 + 0x06A8F6
512B` — sister of Caddy 0x06ADCA cluster (Δ=0xF18 anchor shift).
NOT matching my Golf 0x06AD86 def. Could wire as separate cluster
covering 03L906018AR/AG/AQ at 0x069EB2 — pair #273/#274 (sw508210/
sw525562) also hit 0x069EB2.

**03L906022QA sw398817** (#824) → `0x1EF502 + 0x1EFF46` IDENTICAL —
already covered by 398757 def! sw398817 NOT in identStrings yet —
should add. Adding now.

**03L906022QB sw??? 1037505917** (#825) — odd part-no format. 10237B
/107 regions = 0x1EF502 sister.

**03L906018BG sw513641** (#826, #832 — 2 sister files) → 8977B/69
each. Sister of #851 from prior batch. Different SGO from Caddy/Golf
0x06AD86.

**03L906019AC sw513694** (#827) → `0x1D3646 2KB + 0x1D408A 512B +
0x1D3E68 512B + 0x1D4D78 + 0x1D4B56` — sister of 8K1907401A sw514659
A5 cluster (`0x1D33xx`). Could add to that cluster's wire if wired.

**03L906019DH sw518154** (#828, 14 KB heavy) — sister of Audi A5
#263 same hardware/SW.

**03L906022QC sw504854 + sw505921** (#829, #830) — both IDENTICAL
11555B/156 → 2 SWs same SGO (sister of #780 sw504855).

**03L906022RP sw504796** (#831) — small 1858B/99 light tune.

## VW Pairs #801–816 — Passat 2.0 TDI CR sister files + iqrelease +sw507630

**iqrelease def +sw507630** (Passat 03L906022EM 524KB) → IDENTICAL
`0x06625E IQ release + 0x064CBE + 0x064BCE/64C96` cluster. Now
12 SWs.

**Multiple sister files of same SW** (this batch):
- 03L906022G sw397892 (#801, #802 — 2 different stage1) — already
  in 398757
- 03L906022G sw505933 (#803) — sister
- 03L906022G sw505978 (#804 stage1+++) — sister of #418/#419 prior
- 03L906022MS sw500159 (#805, #806 — 2 sister files) — 7657B/48 +
  7522B/47
- 03L906022MS sw513692 (#807 524KB only 288B = no real, #815 2MB
  8804B/80 — different sub-cluster at 0x1C8AAA)

**03L906022CL sw394169** (#812, 2MB) → 10543B/103 — sister of
#793 sw396433 same byte/region count. Same 0x1ED29A sub-cluster.

**03L906022 various** continued:
- 03L906022CL sw399864 (#808, 2MB) — 10266B/109 = 0x1F007A cluster
  (could add to 398757 def)
- 03L906022BL sw507677 (#811, 524KB) — 5349B/93
- 03L906022KP sw506138 (#814, 2MB) — 3744B/68
- 03L906022QE 0281015029 sw504856 (#816, 524KB) — 4644B/72

**03L906018BF sw510959** (#809 stage1+++ 79% changed, #810 normal
8925B/68) — NEW BF part suffix. Different from my wired Caddy
03L906018xx cluster.

## VW Pairs #785–800 — Passat 2.0 TDI CR 398757 cluster MAJOR expansion

**398757 def expanded BIG: +3 SWs (398820/398822/398823)**:
- 03L906022G sw397892 (#794, #800 — 2 sister files) → `0x1EF502 +
  0x1EFF46` IDENTICAL (already in def)
- 03L906022QF sw398822 (#797, #798 — 2 sister files) → IDENTICAL
- 03L906022QD sw398820 (#777 prior batch) → IDENTICAL — added now
- 03L906022QG sw398823 (#800) → IDENTICAL — added
- 03L906022QC sw398819 (#775 prior) → IDENTICAL (already added)

**398757 def now covers 17 SWs** spanning A3/A4/A6/Allroad/Q5/Passat/
Golf/Jetta 2.0 TDI CR with the IDENTICAL `0x1EF502/0x1EFF46`
protection ceiling.

**0x1ED29A sister sub-cluster** (Δ=-0x2268 from 0x1EF502):
- 03L906022CL sw396433 (#793) → `0x1ED29A 2KB + 0x1EDCDE 512B +
  0x1EDABC 512B + 0x1F8246 200B + 0x1F6294 6B`
- 03L906022CM sw395423 (#795, #796 — 2 sister files) → IDENTICAL
  `0x1ED29A` cluster
- 2 SWs across CL/CM share IDENTICAL sister sub-cluster. Could wire
  separately as sister of 398757 def.

**Other Passat 2.0 TDI CR variants** (#784-#791):
- 03L906022CM sw397845 (#785) — 4053B/66 (524KB)
- 03L906022QG sw398823 (#786, #787 — 2 sister files 524KB) —
  3971B/57 + 4060B/67
- 03L906022BT sw398816 (#788) — 4071B/64 (524KB)
- 03L906022MS sw399859 (#789) — 2604B/46 (524KB)
- 0281015029 03L906022BT sw501923 (#790, **2MB!**) — 4084B/66
- 0281015029 03L906022BT sw505918 (#791, 524KB) — 4250B/72
- 03L906022QA sw505916 (#792, 2MB) — 11555B/156 = stage1+++ heavy
- 03L906022BL sw397866 (#793, 2MB) — 4383B/107 (sister of #762
  same SW different file)

## VW Pairs #769–784 — Passat 03L906022 cluster expansion + 398757/iqrelease

**Wire actions taken**:
- 398757 def +sw507632 (Passat 03L906022CL 2MB hits 0x1F007A sister
  cluster — IDENTICAL to sw505975) — now 13 SWs
- iqrelease def (0x06625E) +sw504854 (Passat 03L906022QC 524KB hits
  exact 0x06625E IQ release) — now 11 SWs

**Passat 03L906022 524KB EDC17 C46 cluster**:
- 03L906022CL sw396433 (#769) — 10543B/103
- 03L906022CL sw507632 (#770, **2MB form**) → IDENTICAL `0x1F007A
  cluster as sw505975`. ADDED to 398757 def.
- 03L906022BM sw396091 (#771) — 11000B/105
- 03L906022BL sw394168 (#773) — 10558B/103 sister
- 03L906022CN sw507631 (#774, 524KB) — 4644B/72
- 03L906022QC sw398819 (#775, 2MB) — 10511B/127
- 03L906022QC sw504854 (#776, 524KB) → IDENTICAL `0x06625E IQ release
  cluster`. ADDED to iqrelease def.
- 03L906022QD sw398820 (#777) — 10511B/127 IDENTICAL to QC sw398819
- 03L906022QD sw504855 (#780) — 11555B/156
- 03L906022QD 0281015028 sw504855 (#783, 524KB) — 2521B/45
- 03L906022QC 0281015029 sw505921 (#784, 524KB) — 3175B/66
- 03L906022QE sw398821 (#781, 524KB) — `0x0657D6 + 0x07A456 + 0x078D90`
  sister of iqrelease cluster (sw398821 not yet in identStrings)
- 03L906022QF sw398822 (#782, 524KB) — 2618B/35

Many 03L906022 part suffixes (BL/BM/BN/BT/CL/CN/QC/QD/QE/QF) sharing
similar SGO patterns. Some join 0x06625E (524KB) or 0x1F007A (2MB)
clusters; others have unique anchors.

## VW Pairs #753–768 — Passat 2.0 TDI CR EDC17 C46 + more PPD1.2

**Passat 2.0 TDI EDC16 PD 03G906021** (#753-#755):
- 03G906021MR sw382425 (#753) — 1422B/103
- 03G906021NK sw389874 (#754, #755 — 2 sister files) — 3247B/247 +
  3231B/246 IDENTICAL pattern, sister of #901

**Passat 2.0 TDI Siemens PPD1.2** (#756-#758):
- 03G906018 SN000F7500000 (#756, 256KB) — sister of #686/#744
- 03G906018EM SN100L4000000 (#757, 256KB) — already covered (EM
  added in v3.5.69)
- 03G906018EM SN1R0M8000000 (#758, 2MB) — NEW SN serial `SN1R`
  family. Already in identStrings (Audi pair #257)

**Passat 2.0 TDI BlueMotion 03L906018NT sw526310** (#759, 2MB EDC17
C46) — NEW NT part suffix.

**Passat 2.0 TDI CR 03L906018BN sw527017** (#760) — NEW BN suffix.

**Passat 2.0 TDI CR 03L906022 cluster** (#761-#768):
- 03L906022BN sw394179 (#761) — 10079B/83
- 03L906022BL sw397866 (#762, #765 — 2 different files different
  sizes) — 10208B/106 + 326B/3 (#765 essentially no real tune)
- 03L906022BL sw394168 (#768) — 10558B/103
- 03L906022QC sw398819 (#763, 524KB) — 2562B/34
- 03L906022BQ/QD sw398820 (#764) — 5669B/107
- 03L906022BQ/G sw394105 (#766) — 5846B/177
- 0281015029 03L906022BT sw505918 (#767, 524KB) — 3183B/66

Many sister Passat 2.0 TDI CR variants. The #761/#762/#768 pattern
(10000-10500B / 83-103 regions) suggests cluster. Could check
offsets — likely 398757-style protection ceiling at varied anchors.

## VW Pairs #737–752 — Passat 2.0 TDI EDC15/16 PD + PPD1.2 variants

**Passat 1.9 TDI 2005-2006** (#737-#739):
- Pair #737 SIZE MISMATCH skipped
- 0281013260 03G906021AN sw382088 (#738, 524KB) — 1380B/53
- 0281013260 03G906021LR sw380420 (#739, 524KB sister hardware) —
  2252B/90

**Passat 1.8T 0261206452 4B0906018AC sw352160** (#740) — sister of
#699 same hardware/SW.

**Passat 2.0 TDI PD EDC15P/EDC16 PD** (#741-#748):
- 0281012119 03G906021AB sw377578 (#741) and sw376296 (#747) and
  sw382427 (#743) — 3 SWs same hardware
- 0281012719 03G906021AC sw378802 (#742, 256KB)
- 0281013 03G906021AB sw382417 (#748, 2MB)
- 0281011145 038906016K sw372127 (#745) and 038906016K sw382052
  (#746) — sister
- 03G906021AB sw382441 (#752, 2MB) — **stage1+++ 13.9% changed
  (291KB)**

**Passat 2.0 TDI PPD1.2 Siemens** (#744, #749, #750, #751):
- 03G906018 SN000F7500000 (#744, **244 KB ROM** = 249856 bytes —
  same NEW format as #639/#638 PPD1 partial dump for older SN000F
  variant)
- **03G906018A SN0I0M8000000** (#749, 2MB) — NEW SN serial family
  `SN0I` (likely Italian market). 5820B / 66 regions.
- **03G906018CD SN0I0M8000000** (#750, 2MB) — NEW part `03G906018CD`.
  4070B / 54 regions.
- 03G906018FH SN100L3000000 (#751, 256KB partial dump) — sister of
  Audi A3 PPD1.2 cluster. **16013B / 81 regions = heavy tune**.

ADDED `03G906018CD` + `SN0I0M8000000` to PPD1.2 def's identStrings.

## VW Pairs #721–736 — Passat 1.9 TDI EDC15P PD massive variant set

16 more Passat 1.9 TDI EDC15P PD pairs across 12+ distinct hardware
codes / part suffixes (BN/CD/DT/EA/EH/EN/EP/ER/FS/GS/GQ/N + 028906021GK):

**524 KB EDC15P PD (95.6 kW = 130 hp PD)**:
- 0281010404 038906019BN sw360707 (#728) — 3212B/95
- 0281010545 038906019DT (#721) — 1726B/61
- 0281010558 038906019EH sw360496 (#722) — 2390B/58 — sister of
  #675
- 0281010701 038906019EP sw362631 (#729) — 3100B/41
- 0281010704 038906019ER sw362173 (#730) and sw362704 (#731) —
  2 SWs sister hardware
- 0281010705 038906019EN sw362633 (#723, #732 — 2 sister files
  same SW) — 3100B/41 + 1951B/54
- 0281010941 038906019GQ sw366929 (#724) — 4297B/35
- 0281010940 038906019GS sw363212 (#733) — 1251B/42 — sister of #687

**524 KB EDC15P PD (74.3 kW PD)**:
- 0281011203 038906019KB sw366299 (#727) — 2808B/48 (sister of
  #677 same hardware/SW)

**256 KB EDC15V (66.2 kW pre-PD)**:
- 0281001654 028906021GK (#725 + #726 — 2 sister files different
  stage1) — 2646B/62 + 1884B/120

**Various 256 KB EDC15V** (#717-#719, #726):
- 0281010171 038906018FS (#727) — 2411B/76 — sister of #718

**Passat 1.9 TDI 03G906021AN sw374452 0281012085** (#735, #736):
- #735: **88.6% changed (464 KB) stage1+++** full recal
- #736: SIZE MISMATCH skipped

No new wires — same pattern, generic edc15p covers via signatures.

## VW Pairs #705–720 — Passat 1.8 TFSI MED17 + 1.9 TDI variants

**Passat 1.8 TFSI MED17 0261201537 06J906026/6J_906_026B** (#706-#715):
- sw393905 (#706, #707, #714 — 3 different files of same SW) —
  745B/26 + 741B/26 + 717B/25 — sister files
- sw391697 (#709 2MB, #715 256KB — same SW two formats) — 627B/21
  + 717B/25
- sw396601 (#710 1.5MB, #712 2MB) — 779B/23 + 250B/6
- sw396605 0261201950 06J906026AD (#708) — sister hardware

**Passat 1.8 TFSI 0261S05550 06J906026ER sw501343** (#711, 1.5MB) —
newer ER suffix.

**Passat 1.8i 0261204956 8D0907558S sw359187** (#713) — only 4 bytes
= byte-identical / no real tune.

**Passat 1.8T 0261207928 8E0909018A sw366497** (#705, 1MB) — 509B
small tune.

**Passat 1.9 TDI variants** (#716-#720):
- 0281010218 038906019CD sw352904 (#716, 524KB) — 3517B/129 regions
- 0281001727 038906018N (#717, 256KB EDC15V) — 2104B/88 regions
- 038906018FS sw??? (#718) — 1570B/28
- 0281010554 038906019EA sw360477 (#719, 524KB) — sister SW
- 0281012742 03G906021DP sw377575 (#720, 524KB EDC16 PD)

No new wires this batch — Passat 1.8 TFSI sister files share patterns
but offsets vary per stage1 (typical MED17 universal IQ release).

## VW Pairs #689–704 — Passat 1.6/1.8 + 1.6 TDI Siemens + 1.8T ME7.x

**Passat 1.6 1995 0261204502 8D0907558 sw357462** (#689) — 131KB
ME7.x older Passat B5 1.6 8V.

**Passat 1.6 8V Siemens 5WP43311 / 5WP40035** (#690, #691):
- 5WP43311 3B0906018 S347032 (#690) — 524KB Siemens-Simtec
- 5WP40035 3B0906018F S348038 (#691) — 524KB Siemens-Simtec sister
Both very small tunes.

**Passat 1.6 FSI MED17 0261S02286 03C906056DC sw377814** (#692,
2MB) — 961B / 30 regions.

**Passat 1.6 TDI CR Siemens PCR21 03L906023FS** (#693, #694):
- SM2G0LK000000 (#693) — 20331B / 233 regions
- SM2G0M0000000 (#694) — 20330B / 233 regions IDENTICAL
- **2 SN serials sharing exact byte/region count**. Same SGO base
  across SN serial variants. Sister of Caddy/Golf 1.6 TDI cluster.

**Passat 1.6i Marelli 036906034DR IAW4MV.DR** (#695, 524KB) —
Marelli sister.

**Passat 1.8 ME7.x 131KB** (#696, #697, #698):
- 0261204614 8D0907558F sw358795 — 91.9 kW
- 0261204956 8D0907558S sw356669 — 91.9 kW sister hardware
- 0261204185 8D0907557T sw357482 (1.8T) — sister of #513

**Passat 1.8T 4B0906018x ME7.x 524KB-1MB** (#699-#704):
- 0261206452 4B0906018AC sw352160 (#699) — 1471B/36 regions
- 0261206453 4B0906018AG sw352321 (#700) — 519B/11
- 0261207636 4B0906018DC sw362358 (#701, sister of #700 from prior
  batch, 1MB)
- 0261206884 4B0906018BQ sw354802 (#702, 1MB)
- 0261208291 4B0906018DP sw369320 (#703, 1MB)
- 0261208527 4B0906018DQ sw394791 (#704, **125 kW = 170 hp**) —
  newer 1.8T B5.5

NEW VAG 1.6 TDI CR Siemens 03L906023FS variant identified — already
covered by SIMOS PCR21 generic family pattern.

## VW Pairs #673–688 — Passat 1.9 TDI PD + 2.0 TDI CR + PPD1.2 variants

**Passat (no model year — generic)** (#673-#679):
- Bare 32KB ROM (#673) — 500B/3 regions = light pre-OBD
- 0281010444 3B1907401F sw354375 (#674) — 524KB EDC15P PD VR6 TDI
- 0281010558 038906019EH sw360706 (#675) — 524KB EDC15P PD
- 0281011203 038906019KB sw366299 (#676 SIZE MISMATCH skipped, #677
  503KB) — 16526B / 246 regions = heavy stage1+++
- 03L906018RG sw529234 (#678, 2MB EDC17 C46) — NEW RG part suffix
- 03L906022BT sw398816 (#679, 2MB EDC17 C46) — NEW BT suffix

**Passat PPD1.2 03G906018EM SN100L8000000** (#680, 2MB) — NEW part
variant `03G906018EM` ADDED to PPD1.2 def's identStrings. 15.3KB
heavy tune.

**Passat 2.0 TDI PD 0281012119 03G906021AB sw389290** (#681, 524KB).

**Passat 0281010543 038906019DS sw360449** (#682 + #685 — 2 files
same hardware/SW different stage1) — 3418B/98 + 3212B/95 sister.

**Passat 0281010307 038906019BM sw360476** (#683) — 73.5 kW.

**Passat 0281001720 038906018P** (#684, 256KB EDC15V) — 80.9 kW.

**Passat PPD1 03G906018A SN000F7500000** (#686, 2MB Siemens —
NEW EARLY PPD1 variant from 2002). NEW serial family `SN000F` — older
Passat 2002 generation predates PPD1.2 (SN100xxxx). ADDED `03G906018A`
+ `SN000F7500000` to PPD1.2 def.

**Passat 0281010940 038906019GS sw363212** (#687, 95.6 kW PD).

**Passat Siemens 32KB** (#688) — pre-OBD Siemens (probably 1.6 8V).

## VW Pairs #657–672 — Golf 6 + Jetta 2.0 TDI CR + Jetta TFSI MED17

**Golf 6 1.4 TSI 0261S04390 03C906016 sw502867** (#657, 256KB) —
sister of #656 same hardware/SW. Newer 90hp.

**Golf 6 2.0 TDI CR 03L906022G sw505933** (#658, **524KB! NEW dump
format**) — 11136B / 112 regions, sw505933 already in iqrelease def
(2MB form). 524KB version has different anchor.

**Golf 6 2.0 TFSI 1K0907115AA sw501817** (#659, 2MB) — sister of
#307 same hardware/SW. Light 568B / 25 regions tune.

**Golf 6 2.0 TFSI 03C906016L sw515768** (#660) — only 412B / 7
regions = light tune.

**Golf 6 GTI 5K0907115 sw501817** (#661) — sister of #427 sw501817
(across 1K0907115AA / 5K0907115 part suffixes — same SW).

**VW i40 Hyundai i40 1.7 CRDi sw524288** (#662, 1.5MB Bosch) —
non-VAG i40 Hyundai badge confusion in folder. 2596B / 46 regions.

**Jetta 1.9 TDI 0281012614 03G906016JK sw375199** (#663, 1MB EDC15P).

**STRONG WIRE: Jetta 03L906022KT sw396003 + sw397863** (#664 + #666):
- Both 524KB hit IDENTICAL all 8 top regions:
  - `0x071EC0` 12B (raw 11325→44138 +290%)
  - `0x071EE8` 12B (13548→47044 +247%)
  - `0x071DC4` 12B (212%)
  - `0x071DB0` 12B (150%)
  - `0x07204A` 10B + `0x07200E` 10B (148%/142%)
  - `0x071990` 12B (120%)
  - `0x072196` 10B (113%)

Wired as `edc17_c46_jetta_20tdi_03l906022kt`. **17th wired ECU def.**

**Jetta 03L906022KS sw397837** (#665) — sister sub-cluster (some
overlapping offsets but different anchors for IQ ceiling).

**Jetta 03L906022G sw505975** (#667 + #668 — 2 sister files) — 2MB
EDC17, hits `0x1F007A 2KB + 0x1F0ABE 512B + 0x1F089C 512B + 0x1FB0EA
200B + 0x1E625E 6B`. The 0x1F007A cluster = 398757-style sister at
shifted anchor. Should add sw505975 to 398757 def's identStrings.

**Jetta 2.0 TDI PD 03G906021KK sw500164** (#669) — newer KK suffix.

**Jetta 2.0 TFSI 0261S02335 8P0907115B sw386818** (#670, MED17) —
NEW SW for 8P0907115B family.

**Jetta 2.8 VR6 0261203223 021906258EA sw358669** (#671) — older
65KB ME7.x VR6.

**Pair #672** Passat 0281001691 038906019A sw350100 — 524KB,
**103928B changed (19.8%) = stage1+++ heavy recal** with 740 regions.

## VW Pairs #641–656 — Golf 5 2.0 TFSI MED17 + R32 + Golf 6 1.4 TSI

**Golf 5 2.0 TFSI MED17** (#641-#646):
- 0261S02078 1K0907115 sw387570 (#641, alt file from prior batches)
- 0261S02078 1K0907115 sw374094 (#642) — sister of #291/#376
- 0261S02470 8P0907115B sw391082 (#643) — sister of #392
- 0261S02469 8P0907115B sw387445 (#644, **GTI Edition 30 230hp**)
  — 5554B / 82 regions (heavier tune)
- 0261S02782 1K8907115F sw505204 (#645) — already in wired Golf R def
- 0261S02429 1K0907115L sw386855 (#646, GTI Edition 30 169.2 kW
  230hp) — `1K0907115L` part suffix
- 0261S02429 8P0907115B sw386855 (#649, same SW different part
  suffix L vs B) → 1677B / 29 regions vs 1528B / 23 regions for #646
  — 2 part suffixes (L/B) sharing same SW

**Pair #647** 0261B00486 8P0907115 sw??? (147.1 kW labeled 2005)
— only 33 bytes / 2 regions = essentially no real tune.

**Golf 5 2.0 TDI Siemens PPD1.2 03G906018HB SN100L4000000** (#648,
2 MB) — NEW part `03G906018HB` (HB suffix) for SN100L4 cluster. Add
to PPD1.2 def.

**Golf 5 R32** (#650-#654):
- 022906032CD sw377452 (#650, 1MB) — sister of #329 same SW. Only
  167B / 3 regions = light
- 022906032CE sw377419 (#651, 1MB) — sister of #331 + #395 same SW
- 022906032JR sw382160 (#652) and 022906032GP sw382160 (#653) — 2
  part suffixes same SW. 1398B/19 + 624B/5
- 022906032JQ sw382159 (#654, V6 R32 2007) — 393B/11

**Golf 6 1.4 TSI MED17** (#655, #656):
- 0261201788 03C906022J sw393741 (#655) — 1663B / 27 regions
- 0261S04390 03C906016 sw400855 (#656) — sister of #657 same hardware

Should add 03G906018HB to PPD1.2 def's identStrings.

## VW Pairs #625–640 — Golf 5 2.0 TDI EDC16 PD + PPD1.2 + 2.0 TFSI

**Golf 5 2.0 TDI EDC16 PD 03G906021AB** (#625-#628):
- sw391525 (#625, #626 — 2 sister files) — 2689B/54 + 2664B/53
- sw392942 (#627) — 2995B / 73 regions (sister of #364 same SW)
- sw392942 (#628, 524 KB) — 3318B / 158 regions (524KB version of
  same SW, different format)

**Golf 5 2.0 TDI PD EDC15P 1MB** (#629-#636):
- 0281011632 03G906016CF sw368924 (#629) — sister of #355 same hardware
- 0281012253 03G906016HJ sw372673 (#630) — sister of #360 same hardware
- 03G906016KC sw400908 (#631)
- 0281011956 03G906016T sw374184 (#632)
- 0281011902 03G906016FL sw371095 (#634)
- 0281011903 03G906016FM sw375892 (#636) — sister of #624 byte-identical

**Golf 5 2.0 TDI PD EDC16 PD 524KB**:
- 0281012948 03G906021FN sw378333 (#633) — sister of #362
- 03G906021QE sw390984 (#635) — 2161B / 205 regions
- 03G906021AN sw389263 (#637) — sister of #359

**Golf 5 2.0 TDI PPD1.2 Siemens** (#638, #639):
- 03G906018FB SN100L4000000 (#638, 256 KB) — sister of my wired
  PPD1.2 def (FB + SN100L7 + SN100L8 already covered, SN100L4 also
  in identStrings)
- 03G906018CT SN100L4000000 (#639, **249,856 B = 244 KB ROM** —
  NEW dump format size!) — CT variant matches PPD1.2 def
  identStrings

**Golf 5 2.0 TFSI 0261S02217 1K0907115F sw377837** (#640) — sister
of #380 same hardware/SW

No new wires — many sister/cross-batch confirmations.

## VW Pairs #609–624 — Golf 5 1.9 TDI EDC16 PD + 2.0 FSI MED17

**Golf 5 1.9 TDI EDC16 PD continued** (#609-#619):
- 03G906021AB sw394142 (#609) — sister of #608/#341
- 0281011901 03G906016DF sw371099 (#610, 1MB) — newer EDC15P
- 03G906021AB sw391847 (#611) — sister of #350 same hardware
- 0281012076 371906379U8 sw371906 (#612, 1MB) — odd part-no format
- 0281013226 03G906021KH sw380437 (#613) — sister of #340
- 03G906021FJ sw380417 (#614)
- 03G906021KK sw379800 (#615) — 5801B / 491 regions = heavier tune
- 03G906021QK sw391843 (#616) — sister of #348
- 0281013200 03G906021KG sw382099 (#617)
- 03G906021AB sw393516 (#618)
- 03G906021KQ sw382096 (#619) — sister of #177

**Golf 5 2.0 FSI MED17** (#620-#622):
- 0261S02183 03C906056CG sw376036 (#620, 110.3 kW) — sister of #604
  same hardware/SW (Golf 5 1.6 FSI 84.6 kW labeled as 2.0 FSI 110.3 kW
  here — could be filename mismatch or actual 2.0 FSI variant)
- 0261S02029 015906F9060 sw370159 (#621) — odd part-no, 2 MB MED17
- 0261B00486 8P0907115 (#622, 1970 misdate, 147.1 kW labeled 2.0
  FSi Turbo) — only 314B / 5 regions = light or partial
- 0261B00486 is Bosch hardware that handles MED17 EA113

**Golf 5 2.0 SDI 0281011617 03G906016M sw370652** (#623, 1MB EDC15P
SDI 75 hp).

**Golf 5 2.0 TDI 0281011903 03G906016FM sw375892** (#624, 1MB EDC15P
PD) — only 7 bytes / 0 regions = byte-identical (no real tune).

No new wires.

## VW Pairs #593–608 — Golf 5 1.4 TSI MED17 + 1.6 FSI MED17 + 1.9 TDI

**Golf 5 1.4 (atmospheric)** (#593) — 0261207189 036906032L sw360898
sister of #321/#478/#592.

**Golf 5 1.4 TSI MED17 03C906032/056** (#594-#599):
- 0261S02238 03C906056BG sw380009 (#594, 2 MB) — 125 kW (170 hp)
  TSI Twincharger
- 0261201355 03C906032 sw387599 (#595, 256KB) — 103 kW
- 0261201539 03C906032 sw387541 (#596, 256KB) — 125 kW
- 0261201355 03C906032E sw383956 (#597) — 89.7 kW
- 0261201768 03C906032C sw393651 (#598) — 103 kW
- 0261201355 03C906032E sw500419 (#599) — 89.7 kW newer SW

**Golf 5 1.6 FSI MED17 03C906056** (#600-#606):
- 0261S02070 03C906056BA sw369726 (#600, 2 MB) — 77 kW
- 0261S02187 03C906056CP sw378110 (#601) — 73.5 kW
- 0261S02117 03C906056AB sw374339 (#602) — 84.6 kW
- 0261S02150 03C906056CB sw374345 (#603) — 84.6 kW
- 0261S02183 03C906056CG sw376036 (#604) — 84.6 kW
- 0261S02183 03C906056CG sw377833 (#605, #606 — 2 sister files
  same SW different stage1) — 84.6 kW

**Golf 5 1.9 TDI EDC16 PD** (#607, #608):
- 03G906021HB sw380774 (#607, 524 KB)
- 03G906021AB sw391592 (#608, 524 KB)

No new wires. Many distinct hardware codes / SWs each with single
or paired tunes.

## VW Pairs #577–592 — Golf 4 1.9 TDI tail + V5/V6/R32 ME7.x petrol

**Golf 4 1.9 TDI 110.3 kW PD150** (#577) — 0281010744 sw362706 —
sister of #547/#570 same hardware.

**Golf 4 1.9 SDI 50hp** (#578) — 0281010373 038906012DB sw354379.

**Golf 4 2.3 V5 (5-cyl petrol) Bosch ME7.x** (#579-#587):
- 0261206176 071906018R sw359159 (#579, 256KB) and sw359505 (#580,
  #581 — 2 sister files same SW) — early 110.3 kW V5
- 0261206799 066906032A sw360835 (#583) and sw368356 (#582) —
  newer 125 kW V5 1MB
- 0261207375 066906032AG sw363056 (#584, 125 kW) — newer
- 0261204753 071906018 sw358164 (#585, #586 — 2 sister files) and
  sw350041 (#587, 1998 V5 110hp) — older 110.3 kW V5

**Golf 4 2.8 V6 Bosch ME7.x 150 kW** (#588, #589):
- 0261206239 022906032B sw354081 (#588) — 856B/16
- 0261206619 022906032E sw354077 (#589) — 1770B/25
2 different hardware codes for VR6 200hp.

**Golf 4 R32 V6 ME7.x** (#590-#592):
- 0261207884 022906032CN sw366355 (#590) — sister of #320 prior
- 0261207884 022906032CN sw371197 (#591) — sister of #328 same SW
- 0261208231 022906032DN sw368661 (#592) — newer 022906032DN

No new wires. R32 V6 ME7.x clusters small enough to be covered by
generic me7 def via signatures.

## VW Pairs #561–576 — Golf 4 1.9 TDI 95.6kW (130hp) + 84.6kW (115hp) PD

16 more Golf 4 1.9 TDI PD pairs continuing the 524KB EDC15P catalog:

**95.6 kW (130 hp PD)**:
- 0281010702 038906019FG sw362796 (#561, #572 — 2 files same SW)
  — 1288B/23 + 1312B/23 ≈ same SGO
- 0281010702 038906019FG sw362471 (#567, #575 — 2 files same SW)
  — 3690B/82 + 1435B/29 (different tuner approaches)
- 0281010977 038906019HJ sw363142 (#562) and sw366272 (#563, #566
  — duplicate file in alphabetical sort)
- 0281011216 038906019KJ sw368577 (#564, #576 — 2 files same SW)
  — 2049B/54 + 2088B/32 (similar treatments)

**84.6 kW (115 hp PD)**:
- 0281010215 038906019AR sw354298 (#568) and sw354613 (#571) —
  sister SWs same hardware
- 0281010091 038906019AM sw350875 (#573) — earlier 1999 PD

**74.3 kW (100 hp PD)**:
- 0281011065 038906019DD sw363709 (#565, **7578 B / 488 regions =
  heavy stage1+++**) — sister of #326 same hardware/SW
- 0281011109 038906019MQ sw363955 (#574)

**110.3 kW (150 hp PD)**:
- 0281010976 038906019HH sw366661 (#569) — sister of #181/#517 same
  hardware
- 0281010744 038906019FE sw362470 (#570) — sister of pair #547

Same-SW two-file confirmations show consistent SGO across files for
each SW. No new wires — covered by generic edc15p def.

## VW Pairs #545–560 — Golf 4 1.9 TDI 2002 catalog (massive variant set)

16 more Golf 4 1.9 TDI 2002 pairs — many distinct hardware codes /
part suffixes. EDC15V/EDC15P PD diesel mix.

**EDC15V 256KB pre-PD** continuing:
- 0281001613 038906018J (#545)
- 0281001650 028906021GG (#548) — sister of #455 same hardware
- 0281001855 038906018EB (#549) 90hp
- 0281001846 038906018BM (#559) — sister of #531/#537
- 0281001586 028906021FQ (#557, #558 — 2 sister files same hardware)

**EDC15P 524KB PD**:
- 0281010126 038906012AP sw352577 (#546) — sister of #522 same SW
- 0281010744 038906019FE sw362684 (#547, **110.3 kW = 150hp PD150**)
  — 2659B / 77 regions, sister of #577 (Golf 4 1.9 TDI PD 150hp)
- 0281010111 038906012K sw352565 (#550) — sister of #543/#544 same
  hardware, smaller normal tune
- 0281010650 038906012FA sw360773 (#551) — sister of #325/#524
- 0281010974 038906019AT sw366203 (#552) — sister of #180
- 0281011191 038906019KP sw366912 (#553) — 74.3 kW
- **0281011195 038906019KH sw366292** (#554) — `Siemens` label in
  filename — ODD, 0281011195 is normally Bosch hardware code. Maybe
  filename mislabel.
- **5WS500 038906019DF sw360447** (#555) — actual SIEMENS PPD1 5WS5
  hardware. NEW Siemens 1.9 TDI ECU family.
- 0281011141 038906019JP sw366049 (#556) — only 15 bytes / 1
  region = no real tune
- 0281010651 038906012FB sw360774 (#560) — 80.9 kW PD

**No new wires** — same Golf 4 1.9 TDI variant catalog continuation.

## VW Pairs #529–544 — Golf 4 1.9 TDI EDC15V early/PD continued

16 more Golf 4 1.9 TDI EDC15V (256 KB pre-PD) and EDC15P PD (524KB)
pairs — 14 distinct hardware codes / VAG part suffixes:

**EDC15V 256KB pre-PD** (#530, #531, #533-#541):
- 0281001424 028906021CK sw355221 (#530, 80.9 kW = 110hp)
- 0281001846 038906018BM sw356589 (#531) + sister #537 same hardware
- 0281001652 028906021GH sw358905 (#533, 80.9 kW)
- 0281001860 028906021JG sw356533 (#534)
- 0281001733 038906018AN sw357579 (#535)
- 0281001845 038906018BL sw359498 (#536)
- 0281001611 038906018D sw358239 (#538) — sister of #523
- 0281001851 038906018AE sw359688 (#539) — sister of #525
- 0281001586 028906021FQ (#540, 80.9 kW)
- 0281001613 038906018J sw358237 (#541, 80.9 kW)

**EDC15P PD 524KB** (#529, #532, #542-#544):
- 0281010864 038906012GK sw362681 (#529)
- 0281010112 038906012L sw352566 (#532)
- 0281010246 038906018GP sw352617 (#542) — 5354B / 84 regions
- 0281010111 038906012K sw352222 (#543) — **88KB changed = stage1+++**
- 0281010111 038906012K sw352549 (#544) — **56KB changed = stage1+++**

Pairs #543 + #544 are stage1+++ full recals on 0281010111 hardware
(2 different SW sister files). Same hardware as pair #526.

No new wires — same family-wide pattern as documented.

## VW Pairs #513–528 — Golf 4 1.9 SDI/TDI EDC15 PD catalog

**Golf 4 1.8T tail** (#513-#514):
- 0261204185 8D0907557T sw358761 (#513, 131 KB) — Audi TT-style A4
  1.8T 150 hp ECU on Golf 4 chassis
- 0261204673 06A906018R sw358109 (#514, alt file from #499) —
  same ROM, different stage1 file

**Golf 4 1.9 PD-pre and PD EDC15** (#515-#528) — many Bosch hardware
codes / part suffixes:
- 0281001060 038906012T sw352232 (#515, 524KB)
- 0281010133 038906012Q (#516, 524KB) — pre-PD
- 0281010976 038906019HH sw363171 (#517, 524KB Golf 4 GTi 110.3 kW
  150 hp PD) — sister of A6/Audi #181 same hardware/SW
- 0281001759 038906013 (#518, #519 — 2 SWs sw359253/sw359425) —
  early SDI 50 hp pre-OBD format 256KB
- 0281010104 038906012J (#520, 524KB SDI 50 hp)
- 0281010174 038906012BF sw350927 (#521)
- 0281010126 038906012AP sw352577 (#522)
- 0281001611 038906018D (#523, 256KB EDC15V — pre-PD 90 hp)
- 0281010650 038906012FA sw360773 (#524, sister of #325 same hardware)
- 0281001851 038906018AE (#525, 256KB EDC15V — sister of #135 Golf
  same hardware)
- 0281010111 038906012K (#526)
- 0281010124 038906012BD (#527)
- 0281010385 038906012CP sw354327 (#528)

All small EDC15 PD/SDI/V tunes (500-3900B / 16-122 regions). No
new wires — covered by generic edc15 def via signatures and the
+0x18000 / +0x20000 mirror documentation.

## VW Pairs #497–512 — Golf 4 1.8T ME7.x catalog (large)

16 pairs of Golf 4 1.8T 110.3 kW (150 hp) Bosch ME7.x — standard
Audi A4/Passat sister cluster:

**0261204673 06A906018R** — sw358109 (#499), sw359591 (#505) — 256KB
**0261204800 06A906018BB** — sw359590 (#500), sw358105 (#506) — 256KB
**0261206436 06A906032AR** — 4 SWs sw352163 (×2 #501, #507),
  sw352357 (#508), sw352758 (#502) — 524KB. Same hardware, sister
  SGOs, anchors at `0x019538-0x01955A` (Δ=0x22 between SWs),
  `0x01D1AC/0x01D1EC` (Δ=0x40), `0x01CE20-0x01CE6C` cluster.
**0261206517 06A906018CH sw352126** + **0261206518 06A906018CG
sw352127** — sister hardware (517/518) with consecutive SWs and
IDENTICAL byte/region count (2350B/20 + 2346B/20). Likely same
SGO across the 2 hardware codes.
**0261206868 8E0906018B sw360654** (#503, 1MB) — only 4 bytes
changed = no real tune.
**0261206887 06A906032DR** — sw360128 (#504), sw360272 (#496/498)
— 1MB ME7.x.
**0261207446 06A906032HS sw363354** (#511, 132.4 kW = 180hp) —
0x0117B2 + 0x01F18D cluster.
**0261207956 06A906032LQ sw366195** (#512, 180hp) — sister of #511.
**0261207957 06A906032LT sw363601** (#497).

**Wire candidate**: 0261206517/518 sw352126/352127 (CH/CG part
suffixes, 2 SWs with sister hardware codes) sharing nearly identical
byte/region count. Could check offsets for tight cluster match.

The 0261206436 06A906032AR cluster across 4 SWs has anchor shift
between SWs (~Δ=0x22-0x40) — too varied for fixedOffset wiring.

No new wires this batch.

## VW Pairs #481–496 — Golf 4 1.4-1.6 ME7.x + Marelli + Siemens petrol

**Golf 4 1.4 16V Bosch ME7** (#481-#483):
- 0261207179 036906032P — 2 SWs sw354828 + sw360260 (sister hardware)
- Sister of #321 + #592 + #593

**Golf 4 1.4 16V Marelli** (#482) — `61600.502.00 036906014P` IAW4LV
family.

**Golf 4 1.6 16V Bosch ME7** (#484, #485):
- 0261206826 036906032D sw354518 — sister hardware
- 0261207702 032906032D sw366875 — sister hardware

**Golf 4 1.6 16V Marelli** (#486, #494) — IAW4LV.H 036906034BB and
IAW4MV.DR 036906034DR families.

**Golf 4 1.6 8V/i Siemens 5WP families** (#487, #490, #491):
- 5WP4395 06A906019 (#487)
- 5WP4858 06A906019BF (#491)
- 5WP4417 06A906019AK (#490)
- All 256KB Siemens-Simtec.

**Golf 4 1.6 L Siemens 5WP40019 06A906033 S337031000000** (#488)
— 524KB, 558B / 4 regions.

**Golf 4 1.6 L Marelli 61600-518-09 036906034AM** (#489) — Marelli
524KB.

**Pair #491 Golf 4 1.6i Marelli IAW4LV.H sw3772** — **63.7% changed
(334 KB) stage1+++ full recal**. Pair #492 same ORI with different
stage1 → only 771B/18 regions normal tune. Same ROM, two tuner
approaches.

**Golf 4 1.8 20V Bosch 0261206076 06A906018CL sw359100** (#495,
256KB ME7.x) — small 1270B / 9 regions.

**Golf 4 1.8 L 0261206887 06A906032DR sw360272** (#496, 1MB ME7.x)
— only 189B / 6 regions = light tune.

## VW Pairs #465–480 — Golf 3 VR6 ME7.x + Golf 3 GTI Siemens + Golf 4 Marelli

**Golf 3 2.0L GTI Siemens 5WP4158 (#465, 32KB)** — Siemens-Simtec
ME7-derived, 903B / 6 regions.

**Golf 3 2.8 VR6 Bosch ME7.x** (#466-#469):
- 0261203057 021906258D sw357364 (#466, 65KB) — 730B/16
- 0261203109 021906258AG sw357531 (#467, 65KB) — 4695B / 16 regions
  (heavier 7% changed)
- 0261203559 021906258CL sw358929 (#468, 65KB) — 691B/13
- 0261203969 021906256 sw355938 (#469, 131KB) — 2229B/15
- 0261203117 021906258AF sw357529 (#476, 65KB) — 5451B / 26 regions
  (heavy 8% changed)
- 0261200496 021906258A sw357205 (#475, 65KB) — only 2 bytes
  changed = no real tune

VR6 ME7.x 174 hp — Bosch hardware codes 0261200xxx (older) and
0261203xxx (newer ME7) era. Various 021906258x part suffixes.

**Golf 3 Cabrio 2.0 0261206760 037906018D sw362294** (#470, 256KB)
— newer Cabrio ME7.x.

**Golf 3 GTI 1.8T Siemens 5WP4256 037906025R** (#471) — 131KB
Siemens-Simtec, 224B/3 regions.

**Golf 3 GTI 1.8T Siemens 5WP4204 037906025H** (#472) — 131KB,
114B/5 regions.

**Golf 3 TDI 1.6L 0281001171 028906021C sw358696/358697** (#473, #474)
— Bosch EDC0 1.6 TDI 1996 ECO, 65KB. Tiny tunes.

**Golf 4 1.4 16V** variants:
- 0261206140 036906032 sw352147 (#477) — 524KB ME7.5
- 0261207189 036906032L sw360898 (#478) — sister of #321 + #592
  (already noted)
- Marelli IAW4AV 036906014 (#479, #480) — 256KB Magneti Marelli

**No new wires** — all small old ECUs, low tuning volume.

## VW Pairs #449–464 — Golf 3 1.9 TDI EDC0/1 cont + Golf 3 2.0 GTI Motronic

**Golf 3 1.9 TDI EDC0/1 continued** (#449-#458):
- 0281001309 028906021AF sw357867 (#449) — 247B/3 regions
- 0281001313 028906021AK sw357871 (#450) and sw357872 (#451) — 178B
  + 447B (sister SWs)
- 0281001369 028906021AT sw355100 (#452, 256KB)
- 0281001412 028906021DD sw355564 (#453)
- 0281001422 028906021BF sw355102 (#454, 256KB)
- 0281001473 028906021DF sw355219 (#458, 256KB, 80.9 kW = 110hp)
- 0281001650 028906021GG sw358903 (#455, 256KB)
- 0281001729 028906021HD sw947 (#456, 256KB) — sw with low number
- 0281001730 028906021HG sw945 (#457, 256KB)

All small EDC0/1 tunes — same characterization as prior batch.

**Golf 3 2.0 16V Siemens 5WP4133 037906024AB** (#459, 32KB) — early
Siemens 2.0 16V — only 4 regions / 431B.

**Golf 3 2.0 GTI Motronic** (#460-#464) — pre-OBD 32KB:
- 0261200598 037906024C sw357235 (#460) — only 56B / 1 region = no
  real tune
- 0261203266 037906024D sw357468 (#461 + #462 — 2 different stage1s)
  — 1141B/8 + 730B/3
- 0261200596 037906024B sw356789 (#463)
- 0261200596 037906024B sw200597 (#464, 1992 — sw200597 oldest SW)

Pre-OBD Motronic 2.0 GTI 115hp variants. Same family — all 32KB ROMs.

## VW Pairs #433–448 — Golf 3 1.9 TDI early EDC0/1 + 1.8 ME7.x

**Golf 3 1.9 TDI EARLY** (#433-#447) — 16 pairs covering pre-OBD
era (1996-2002) Bosch EDC0/EDC1 early diesel ECUs. Bosch hardware
codes 0281001xxx with VAG part numbers 028906021xx (AF/AK/AT/BD/BF/
DD/FB/FS/GG/GH).

ROM sizes: 65 KB (most) and 256 KB (older 1997-1998 variants with
0281001422/0281001439/0281001564/0281001650/0281001652/0281001666
hardware).

Same SW = same hardware = mostly same SGO (small variations between
stage1 files):
- 0281001309 028906021AF — 4 SWs (sw355547, sw355548, sw357867, sw357868)
- 0281001313 028906021AK — 2 SWs (sw355569, sw355570)
- 0281001412 028906021DD — 2 SWs (sw355563, sw355564)
- Various other single-SW pairs

All tiny tunes (180-2784 B / 3-117 regions). These pre-OBD EDC0/1
ECUs predate proper ECU defs in our system — could add a generic
`edc1_early` family def with signatures, but very low tuning volume
in 2024+.

**Pair #433 Golf 3 1.8 0261203184/185 8A0907311H sw357577** (65KB
ME7.x petrol) — small 1230B / 5 regions.

**No new wires** — too many distinct part numbers / SWs each with
single-pair confirmation. Out of practical fixed-offset wiring scope.

## VW Pairs #417–432 — Golf 6 03L906022 cluster expansion + Golf GTD 0x06AD86

**iqrelease def (0x06625E) +2 SWs**:
- 03L906022LM sw505978 (#418, #419 — 2 files) → IDENTICAL `0x06625E
  + 0x064B80 + 0x064CC0 + 0x064BD0 + 0x064CE8 + 0x064C48 + 0x07653A
  + 0x076692` cluster. ADDED to identStrings.
- 03L906022MC sw504865 (#421) → IDENTICAL exact same offsets. ADDED.
- 03L906022MC sw507643 (#422) → already in def. Confirmed.
- 03L906022LK sw507642 (#417) — `0x06625E ...` cluster (sw507642
  not yet in identStrings — could add)
- 03L906022BJ sw399397 (#423) — `0x0657D6` sister offset (Δ=0x1578)
- 03L906022DC sw505975 (#424) — `0x06513A 6B raw 2130→61525 +2788%`
  — joins my Golf 6 0x06513A def cluster (sw505975 not yet in
  identStrings — could add)
- 03L906022AG sw507639 (#425) → already in iqrelease def

**Golf 0x06AD86 def +1 SW**:
- 03L906018BB sw525556 Golf GTD 2011 (#431) → `0x06AD86 + 0x06B7CA
  + 0x06B5A8 + 0x07E036` IDENTICAL to wired Golf 0x06AD86 cluster.
  ADDED sw525556 to identStrings.

**Golf 6 GTI variants** (#427-#430):
- 5K0907115A sw501818 (#427, 256KB) — Golf 6 GTI MED17, 1661B / 66
  regions. NEW part `5K0907115A`.
- 1K0907115AA sw510467 (#428) SIZE MISMATCH skipped.
- 8P0907115B sw516494 (#429, GTI Edition 35 235hp) — 5727B / 166
  regions, heavier tune.
- 8P0907115B sw510589 (#430, Golf 6 R 270hp) — same SW as Golf R
  Mk6 1K8907115F sw510589 (cross-part-number same SW). 3058B / 131
  regions.

**Pair #432 Golf 3 1.8 0261200784 1H0907311H sw357420** (32 KB
Motronic, pre-OBD) — small 1227B / 5 regions tune.

**Wire actions taken**:
- iqrelease def +sw504865 + sw505978 (now 10 SWs)
- Golf 0x06AD86 def +sw525556 (now 8 SWs)

## VW Pairs #401–416 — Golf 6 1.6 TDI Siemens + 2.0 TDI CR 524KB clusters

**Golf 6 1.6 TDI Siemens PCR21** (#401-#406) — 5 more SM-serial
pairs covering the family:
- SM2E0DB000000 03L906023AN (#401, 2MB) — 16437B / 249 regions
- SM2E0DG000000 03L906023B (#403, 503KB) — 16456B / 248 regions
- SM2G0LD000000 03L906023ML (#404, 503KB) — 19993B / 225 regions
- SM2F0L9500000 03L906023MP (#405, 503KB) — 16286B / 239 regions
- SM2F0K3000000 03L906023M (#406, 2MB) — 20054B / 230 regions

Two consistent change-byte clusters within Siemens PCR21:
- **~16,300 B** (SM2E0DB / SM2E0DG / SM2F0L9500000) — older SN ranges
- **~20,000 B** (SM2F0K3000000 / SM2G0LD000000) — newer SN ranges

Pair #402 SIZE MISMATCH skipped. Pair #407 SIZE MISMATCH skipped.

**STRONG WIRE: Golf 6 03L906022AG/AH/BG sw396031/396032/396043
0x06513A cluster** (#410-#412):
- 03L906022AG sw396031 (#410) — `0x06513A 6B + 0x079DB6 200B + ...`
  (4056B / 72 regions)
- 03L906022AH sw396032 (#411) — IDENTICAL byte/region count, same
  cluster
- 03L906022BG sw396043 (#412) — IDENTICAL `0x06513A` + ALL 8 top
  regions match sw396031

**3 SWs across 3 part suffixes (AG/AH/BG) share IDENTICAL SGO**.
Wired as `edc17_c46_golf6_20tdi_03l906022x_06513a` — sister of my
main 0x06625E iqrelease def (Δ=0x1124 anchor shift). **16th wired
ECU def.**

**0x06625E iqrelease def +1 SW**:
- 03L906022LF sw504863 (#408) and sw505933 (#409) — IDENTICAL
  `0x06625E 6B + 0x064B80 14B + 0x064CC0 13B`. sw504863 ADDED to
  identStrings. sw505933 already there.

**Other Golf 6 524KB pairs**:
- 03L906022AG sw399393 (#411) — `0x0657D6 + 0x07A456` = sister of
  my iqrelease def (sw399393 not yet there but offset matches)
- 03L906022LD sw507615 (#414) — `0x07FE7C + 0x064CC0/CE8/D10` IQ
  variations (different cluster — limiter drop pattern)
- 03L906022HH sw396029 (#415) — small 2720B / 36 regions
- 03L906022LK sw398791 (#416) — `0x0657D6 6B raw 2130→61525` —
  sister of iqrelease def (sw398791 already there)

**Wire actions taken**:
- Wired NEW `edc17_c46_golf6_20tdi_03l906022x_06513a` def (3 SWs)
- Added sw504863 to iqrelease def (now 8 SWs)

## VW Pairs #385–400 — Golf 5 GTI Edition 30 + R32 V6 + Golf 6 1.4 TSI

**Golf 5 GTI 2.0 TFSI MED17 continued** (#385-394):
- sw375753 1K0907115A (#385) — sister of #384 same SW
- sw378111 1K0907115A (#386) — sister SW + same hardware
- sw378113 1K0907115B (#387) — sister
- sw381190 1K0907115J (#391) — already covered by 0x1CE0C8 wired def
- sw386459 8P0907115B (#390) — sister
- sw386675 1P0907115 (#388) — `0x1CD67A` sub-cluster
- sw386876 8P0907115B (#392) — sister of #306 (already noted)
- sw387445 8P0907115B (#394, **GTI Edition 30 169.2 kW = 230 hp**) —
  3699 B / 29 regions, **heavier tune than standard 200hp GTI**
- sw391082 8P0907115B (#393) — sister of 1K0907115Q sw391082
  (cross-part-number same SW)

**Golf 5 R32 V6** (#395-397):
- 022906032CE sw377419 (#395, 1MB) — 911B / 11 regions tune
- 022906032CN sw366310 (#396, 1MB) — 620B / 7 regions
- 022906032JR sw382160 (#398, 1MB) — 415B / 8 regions

**Pair #397** — Temic DSG `02E300047F 069116402ea` — transmission
control file, NOT engine ECU. Skip from engine analysis.

**Golf 6 1.4 TSI MED17 0261S05812 03C906027BA sw515355** (#399,
256KB) — small 517B / 16 regions tune. Newer EA111 1.4 TSI 160hp.

**Golf 6 1.6 TDI CR Siemens 03L906023MK SM2F0L9500000** (#400,
**503 KB ROM!** — NEW dump format size 0x7AE00 = 503KB) — 16278 B /
239 regions = same SIMOS PCR21 emission disable + tune pattern as
2 MB version, just in a smaller chiptool extracted format.

NEW dump format: **503 KB SIMOS PCR21 partial dump** (different from
the 393 KB Q3 partial dump or 2 MB standard).

## VW Pairs #369–384 — Golf 5 2.0 TFSI MED17 universal IQ release variants

16 pairs of Golf 5 2.0 TFSI MED17 across 1K0907115/A/F/G + 1P0907115D
+ 8P0907115B part variants. ALL hit the universal IQ release pattern
`raw 10604 → 65535 (+518%) at 120 bytes` but at SW-specific anchors:

| SW | Hardware | Anchor offset |
|---|---|---|
| 374094 | 0261S02078 1K0907115 | (no top hit) — small tune |
| 375753 | 0261S02079 1K0907115A | `0x1CD118` |
| 377624 | 0261S02289 1P0907115D | (no big region) |
| 377837 | 0261S02217 1K0907115F | (no big region) |
| 378158 | 0261S02218 1K0907115G | `0x1CD67A` |
| 381190 | 0261S02331 8P0907115B | `0x1CE0C8` ← already wired |
| 387570 | 0261S02078 1K0907115 | `0x1CD18C` |
| 391084 | 0261S02509 8P0907115B | `0x1CE7DA` (estimated) |

**sw387570 1K0907115 appears in 6+ files** across multiple
batches — anchor varies between 0x1CD18C / 0x1CD7BA / 0x1CD7FE /
0x1CDAE1 within ~0x300 range across stage1 versions of same SW.

**No new wires this batch** — anchor varies per SW and per stage1
file even within same SW. Fixed-offset wiring covers only the
0x1CE0C8 cluster (5 SWs). Full coverage would need signature-based
detection with offset auto-discovery — out of scope for current
schema.

Pair #383 sw374096 1K0907115A → `0x1CD118 + 0x1CD78A` — IDENTICAL
to sw375753 (#384 anchors 0x1CD118 + 0x1CD78A). 2 SWs same SGO at
0x1CD118 — small wire candidate.

Pair #381 sw381190 8P0907115B confirms wired 0x1CE0C8 cluster. Pair
#374 sw377624 1P0907115D and #375 (same SW + same hardware different
stage1) — both small tunes.

## VW Pairs #353–368 — Golf 5 2.0 TDI PD + PPD1.2 catalog

**Golf 5 2.0 TDI PD EDC16** (#353-365) — many 03G906016xx and
03G906021xx part suffixes, each with own SW. All small 1-4 KB tunes:
- 03G906016AN sw368925 (#361, 1.5MB) — wider 1.5MB ROM format
- 03G906016AP sw370516 — 191 regions, EDC16 PD
- 03G906016AQ sw371912 — 40 regions
- 03G906016CF sw368924 — 164 regions
- 03G906016DN sw376971 — 38 regions
- 03G906016ET sw375890
- 03G906016HJ sw372673
- 03G906016M sw370652 (SDI variant)
- 03G906021AB sw392942 (524KB)
- 03G906021AN sw389263
- 03G906021FN sw378333
- 03G906021JG sw394134
- 03G906021PM sw387840 (#353)
- 03G906021QE sw392939

Many part suffixes — varied SGOs. No tight cluster.

**Golf 5 2.0 TDI Siemens PPD1.2** (#365, #368):
- 03G906018CT SN100K5400000 (#365) — 3212 B / 29 regions. Serial
  SN100K5400000 already in my wired PPD1.2 def's identStrings.
- 03G906018FB SN100L7000000 (#368) — 17750 B / 83 regions = heavy
  tune. **NEW SN serial family SN100L7000000** not yet in PPD1.2
  def. Could add.

The PPD1.2 def already covers SN100K5xxx, SN100L4/6/8xxx — adding
SN100L7000000 expands coverage.

## VW Pairs #337–352 — Golf 5 1.9 TDI 03G906021xx PD catalog

16 pairs of Golf 5 1.9 TDI PD covering many 03G906016xx and
03G906021xx part suffixes (BCB/CB/EB/FS/GD/GR/KH/PD/PF/QJ/QK/R/TQ/
TS). All EDC15/EDC16 PD with 524 KB or 1-2 MB ROMs.

**Same-SW-multi-file findings**:
- 03G906016FS sw370811 (#337, #338 — 2 files) — different mod sets
  (1275B vs 2303B / 37 vs 171 regions)
- 03G906021AB sw393568 (#341) + sw394921 (#342) — sister SWs
  (1249B + 2383B respectively, no shared offset cluster)
- 03G906021PD sw389297 (#345) + sw393550 (#346, #347 same SW two
  files) — 73-121 region range, sister SWs
- 03G906021QJ sw389289 (#343) + sw391847 (#350) — sister SWs

**No tight wire-able cluster** — too many part suffixes each with
its own SW + SGO. Covered by generic edc16 def via signatures.

Pair #346/#347 sw393550 03G906021PD — 2 files same SW: 3165B / 73
regions vs 3013B / 71 regions — slightly different tuner mods on
same ROM.

## VW Pairs #321–336 — Golf 4 ME7.x + Golf 4/5 R32 + Golf 5 1.9 TDI variants

**Golf 4 1.4i 16V Bosch 0261207189 sw360898** (#321) — small 735 B
ME7.5 tune, 16 regions. 524 KB ROM.

**Golf 4 1.6 16V Marelli 036906034CN** (#322) — Magneti Marelli
IAW7G ECU, 524 KB. NEW Marelli family (sister of A2/Bora 1.6 16V
Marelli).

**Golf 4 1.6 L Siemens 5WP4190 06A906019** (#323) — Siemens VR4
sister, 256 KB.

**Golf 4 1.9 TDI variants**:
- 0281010112 038906012L (#324) — only 532B / 6 regions = light tune
- 0281010650 038906012FA sw360773 (#325) — 1096B / 41 regions
- 0281011065 038906019DD sw363709 (#326) — 7578 B / 488 regions
  (heavier tune)

**Golf 4 R32 1.9 TDI PD (mislabeled — actually R32 V6)** Bosch
0261201805 022906032KF sw389049 (#327) — only 326 B / 10 regions
= very light tune. ME7.x VR6.

**Golf 4 R32 V6 cluster**:
- 0261207884 022906032CN sw371197 (#328) — 3172 B / 44 regions
  (sister of #320 sw366355 same hardware)
- 0261208467 022906032CD sw377452 (#329) — 2805 B / 79 regions

**Golf 5 R32 0261208468 022906032CE sw377419** (#331) — 2530 B / 31
regions, newer R32 V6 hardware.

**Golf 5 2.0 TFSI 1K0907115 sw375457** (#330, MED17) — 1114 B / 32
regions tune. Older sw than the wired 0x1CE0C8 cluster (375457 < 381190).

**Golf 5 1.9 TDI 03G906016 cluster** (#332-335):
- 03G906016EB sw375972 (#332) — 1781 B / 44 regions
- 03G906016B sw369564 (#333) — 2976 B / 163 regions
- 03G906016EB sw369952 (#334) — 987 B / 29 regions
- 03G906016R sw374183 (#335) — 3243 B / 175 regions
- 03G906016GR sw375576 (#336) — 1222 B / 30 regions
Various part suffixes (B/EB/R/GR), each with own SW + own SGO. EDC16
PD 1MB. No tight cluster found in this batch.

## VW Pairs #305–320 — Wire Golf R MED17 cluster + 0x1CE0C8 +1 SW

**Wire actions taken**:
- 0x1CE0C8 def +sw386464 (8P0907115B 6th confirmation file in cluster)
- **NEW WIRE**: `med17_golf_r_20tfsi_1k8907115f` — Golf R Mk6 cluster
  - sw505204 (#311) → `0x1CEE80 120B + 0x1CEF37 10B` (raw 10750→65535 +509%)
  - sw510589 (#312, #313, #314 — 3 files of same SW) → IDENTICAL
    `0x1CEE80 120B` + alt sister regions
  - 2 SWs / 4 confirmation files share IDENTICAL `0x1CEE80` IQ release
  - **15th wired ECU def**

**Other Golf 2.0 TFSI MED17 sub-clusters identified** (not wired):
- 1K0907115Q sw391082 (#308, #309 — 2 files) → `0x1CFB9D + 0x1CE6A8`
- 8P0907115B sw386876 (#306) → `0x1CE6A8 + 0x1CF32B` (single pair)
- 1K0907115AA sw501817 (#307) and 1K0907115AD sw396277 (#310) →
  `0x05AC14 64B + 6B` cluster (newer AA/AD hardware, low-region)
- 1K0907115AA sw539143 (#314, 1.54 MB) → `0x05A10E 66B + 0x052484
  120B` (newer EU6 partial dump format)

**Golf 2.0L TDI 0281011477 03G906016AN sw368925** (#316, #317 — 2
files different stage1) — different mod sets per tuner. Pair #318
sw9U8581 alt SW format = only 148 bytes / 1 region = no real tune.

**Pair #319** Golf 2.8 V6 (no part listed, 524KB) — only 60 bytes /
5 regions = light tune.

**Pair #320** Golf 3.2 R32 0261207884 022906032CN sw366355 — VR6 R32
ME7.x. `0x02946E 8B +13004% (raw 252→33022)` is dramatic IQ release.

## VW Pairs #289–304 — Golf 2.0 TFSI MED17 universal IQ release pattern

**MAJOR Golf 2.0 TFSI MED17 cluster** — consistent IQ release pattern
across MANY part numbers and SWs:

**Pattern**: `120B at raw 10604 → 65535` (+518%) + `64B at raw
32613/31579 → 65535` (+100-107%) — anchor varies by SW between
0x1CC6FC and 0x1CE0C8.

SWs catalogued in this batch (all share the universal pattern):
- 1K0907115 sw374094 (#291) — 0x1CD0C6 + 0x1CD716 8×3
- 1K0907115 sw387570 (#296, #297, two more files) — 0x1CD7BA/0x1CD7FE
- 1K0907115A sw372619 (#292) — 0x1CC6FC + 0x1CCD6E
- 1K0907115B sw387484 (#293) — 0x1CD67A + 0x1CDCF4
- 1K0907115G sw378158 (#294) — 0x1CD67A + 0x1CDCF4 IDENTICAL to sw387484
- 1K0907115J sw387479 (#299, #302, #303, #304 — 4 files) — 0x1CE139
  + 0x1CE0C8/0x1CECE4 mix
- 1K0907115J sw381190 (#301) — 0x1CE0C8 + 0x1CECE4
- 1K0907115K sw386821 (#295) — 0x1CE0C8 + 0x1CECE4
- 1K8907115F sw510589 (#289) — 0x1CEE80 + 0x1C3386
- 1P0907115D sw377624 (#290) — 0x1CD67A + 0x1E58F4
- 8P0907115B sw381231 (#300) — 0x1CE0C8 + 0x1CECE4 IDENTICAL to sw386821
- 8P0907115B sw387479 (#304) — 0x1CE0C8 + 0x1CECE4

**Sub-cluster A: `0x1CE0C8 + 0x1CECE4`** (most common):
- sw381190 (1K0907115J)
- sw381231 (8P0907115B)
- sw386821 (1K0907115K)
- sw387479 (8P0907115B + 1K0907115J)
- 5 SWs across 3 part suffixes share IDENTICAL anchor.

**Sub-cluster B: `0x1CD67A + 0x1CDCF4`** (older):
- sw378158 (1K0907115G)
- sw387484 (1K0907115B)
- sw377624 (1P0907115D — first offset only)
- 3 SWs same SGO across 3 part suffixes.

**Sub-cluster A is wire candidate** — 5+ SWs sharing IDENTICAL
0x1CE0C8 anchor in MED17 family.

**Same-SW-multi-file findings**:
- sw387570 1K0907115 — 3 different stage1 files for same SW
- sw387479 1K0907115J — 4 different stage1 files for same SW

**This is the universal MED17 EA113/EA888 IQ release map** I noted
earlier in Audi work. Now broadly confirmed across VW Golf MED17 too.
The 120B region at raw 10604 → 65535 is the consistent target across
all 1K0907115/8P0907115/1P0907115/1K8907115 part variants.

## VW Pairs #273–288 — Wire 12×15 IQ ceiling cluster + Caddy/Golf cross-match

**STRONG WIRE: 12×15 IQ ceiling cluster** (Amarok-shape map at
0x1DBC2C anchor):
- 03L906022G sw505426 (#279, #280) — IDENTICAL `0x1DBC2C/0x1DE5B2`
- 03L906022G sw507615 (#203 prior) — same
- 03L906022G sw507643 (#229, #230 alt files)
- 03L906022G sw516655 (#231)
- 03L906022RP sw505993 (#277)
- **5 SWs across 2 part suffixes (G/RP) share IDENTICAL** 12×15 IQ
  ceiling A + 12×16 IQ ceiling B at 0x1DBC2C/0x1DE5B2. Stock raw 15
  → 27424 (+180849%) and 607 → 9473 (+1459%).

Wired as `edc17_c46_golf_20tdi_03l906022g_iqceiling`. **13th wired
ECU def.** SAME map structure as wired Amarok 03L906019FA (12×15 IQ
ceiling A), confirms the shape is a Bosch EDC17 C46 family pattern.

**Caddy 0x06ADCA cluster cross-Golf confirmation**:
- 03L906018GG sw511961 (#276) → IDENTICAL `0x06ADCA + 0x06B80E + 0x06B5EC`
  same as wired Caddy cluster. Added sw511961 to Caddy def.

**Golf 0x06AD86 cluster +1 SW**:
- 03L906018AT sw524624 (#275) → IDENTICAL `0x06AD86 + 0x07E036`.
  Added sw524624 to Golf 0x06AD86 def. **Now 7 SWs**.

**NEW 0x069EB2 sub-cluster** (potential future wire):
- 03L906018AG sw508210 (#273) → `0x069EB2 2KB +274% + 0x06A6D4 512B
  +134%`
- 03L906018AQ sw525562 (#274) → IDENTICAL `0x069EB2/0x06A6D4`
- 2 SWs same SGO at 0x069EB2 (Δ=0xED4 from Caddy 0x06ADCA)

**Pair #272** sw510943 03L906018BB (alt file) → `0x07E036 200B +
0x07CCDA 510B` — different from #252's 0x06AD86 hits. Same SW two
SGO sub-clusters.

**04L906021EQ EU6 cluster** (#283-285):
- sw537362 (#283) → `0x16A6DE 22B + 0x15E96E 10B` cluster
- sw541670 (#284 alt file) → `0x12F9B4 + 0x178F0C` (matches sw538358
  04L906021FD #167!)
- sw541670 (#285 alt file) → `0x16B04A + 0x16B026` — **SAME SW two
  different SGO files** AGAIN

So sw538358 (04L906021FD) and sw541670 (04L906021EQ alt file) share
`0x12F9B4` cluster — 2 SW cluster across part-suffixes.

**Golf 2.0 TFSI MED17 0261S02078 1K0907115 sw387570** (#286, #287)
— 2 different stage1 files, both showing universal MED17 unlock
clears + small mods. Same SW different tuner approaches.

**Golf 2.0 TFSI 0261S02470 1K0907115Q sw391082** (#288) — universal
MED17 unlock at 0x1CE6A8 + 0x1C3332 8B IQ.

**Wire actions**:
- Wired NEW 12×15 IQ ceiling def (5 SWs, Amarok-shape sister)
- Added sw511961 to Caddy 0x06ADCA def
- Added sw524624 to Golf 0x06AD86 def

## VW Pairs #257–272 — Golf 0x06AD86 +2 SWs + 03L906022JD/JF cluster

**Golf 0x06AD86 cluster expanded to 6 SWs**:
- 03L906018 (bare) sw509927 (#257) → IDENTICAL `0x06AD86 + 0x07E036`
  ADDED to wired def
- 03L906018AT sw509929 (#258) → IDENTICAL ADDED to wired def
- 03L906018GC sw508903 (#259) → IDENTICAL (3rd confirmation file)
- 03L906018BC sw510944 (#264, #265, #266 — 3 files all hit
  0x06AD86) — confirms BC cluster
- 03L906018LE sw519351 (#262) → `0x06B512 2KB + 0x07DADA 200B`
  (Δ=0x78C sister sub-cluster — same family but offset shift means
  sw519351 doesn't fit the fixedOffset)

**03L906018GC sw508903 stage1+++ files** (#260 + #261 — 2 files
both 79.7% changed = full recals) — same SGO targets preserved
under noise.

**03L906019DH sw518154** (#263) → `0x05EB60 12×15 + 0x060A5C 12×16`
**SAME SHAPE as Amarok 03L906019FA IQ ceiling** but at much lower
anchor (0x05EB60 vs Amarok's 0x0623F0). Different SGO instance of
the same map structure. Could be added as variant of Amarok def.

**03L906022JD sw518073 + 03L906022JF sw518079** (#268 + #269) →
BOTH IDENTICAL `0x077DBA 16×16 + 0x037C7A 104B` cluster (3496B vs
4147B — slightly different change counts but same structural map).
**2 SWs across JD/JF part suffixes share SGO**. Wire candidate.

**Pair #267** sw518073 03L906022JD — only 130 bytes / 4 regions
changed = essentially no real tune (just clears 2 emission regions).
Sister of #268 same SW with proper IQ map mod.

**Pair #270** sw518131 03L906022CD — 0 bytes changed (byte-identical).

**Pair #271** sw518131 03L906022CD — emission disable cluster only,
no big map. Same SW as #270 (which was identical) but a different
stage1 file with light tune.

**Pair #272** 03L906022G sw397892 — `0x1EF502/0x1EFF46` (already
covered by 398757 def, sw397892 in identStrings).

**Wire actions taken**:
- Added sw 509927 + 509929 to Golf 0x06AD86 def (now 6 SWs)

## VW Pairs #241–256 — Wire Golf 0x06AD86 cluster + 398757 +2 more SWs

**STRONG WIRE: Golf 03L906018AR/BB/BC/GC 0x06AD86 cluster**:
- 03L906018BC sw510944 (#243) → `0x06AD86 2KB +170%`
- 03L906018AR sw525558 (#244) → `0x06AD86 2KB +274%`
- 03L906018GC sw508903 (#247) → `0x06AD86 2KB +274%`
- 03L906018BB sw510943 (#252) → `0x06AD86 2KB +170%`
- **4 SWs across 4 part suffixes share IDENTICAL `0x06AD86`**
  protection ceiling. Same family-wide pattern as Caddy 0x06ADCA
  (Δ=0x44 anchor shift).

Wired as `edc17_c46_golf_20tdi_03l906018xx_06ad86`. **12th wired
ECU def.**

**More Golf 03L906022G hitting 398757 SGO** (added more SWs to def):
- sw399326 (#249) → `0x1EF502/0x1EFF46` IDENTICAL
- sw501956 (#253) → `0x1EF502/0x1EFF46` IDENTICAL
- sw396031 (#248) → `0x1EF8A6/0x1F0550` (Δ=0xCC4 sister sub-cluster)
- sw505938 (#250) → `0x1F007A` sister
- sw507643 (#251 alt file) → `0x1DBC2C 12×15 + 0x1DE5B2 12×16` —
  the 12×15 IQ ceiling SHAPE again (Amarok-family map shape)
- sw507643 (#254 again, different file) → `0x1F007A/0x1F0ABE` sister

**398757 def now covers 11 SW versions** spanning Audi A3 + VW Golf
2.0 TDI CR.

**03L906018JL sw522924** (#241, alt file from earlier #240) →
`0x06D6CC 511B + 0x0615B6 14B` — sister cluster of my 03L906018JL
def, slightly different anchors. Confirms 522924 SW has multiple
SGO sub-families.

**03L906018BB sw525556** (#242, alt file) → `0x07C8E4 16×12 + 0x0283D2
6B` — different from earlier sw525556 patterns. Same SW THREE
distinct SGO files now seen.

**03L906018BA sw509930** (#245) → `0x06C27E + 0x06C488` paired 512B
regions — DIFFERENT cluster from 0x06ADxx Caddy/Golf family. Sister
SGO of 03L906018BA part.

**Pair #246** sw509930 03L906018BA — 0 bytes changed = byte-identical
ORI/Stage1 pair (likely a corrupted dump or test file).

**Pair #255** sw510944 03L906018BC — 0 bytes changed (byte-identical
ORI/Stage1).

**Pair #256** sw510944 03L906018BC alt stage1 → `0x02706C + 0x0283D2`
small region cluster. Different from #243's 0x06AD86 SGO. So sw510944
has 2 SGO sub-families.

**Wire actions taken**:
- Wired NEW def `edc17_c46_golf_20tdi_03l906018xx_06ad86` (4 SWs)
- Added sw 399326, 501956 to 398757 def (now 11 SWs)

## VW Pairs #225–240 — Golf 03L906022G expansion + 03L906018 sw505441/508342 cluster

**More Golf 03L906022G hitting 398757 SGO** (now expanded def):
- sw501921 (#225) → `0x1EF502/0x1EFF46` — added to wired def
- sw501922 (#226) → `0x1EF502/0x1EFF46` — added to wired def
- sw505933 (#227, alt file) → `0x1F007A` (Δ=0xB78 sister sub-cluster)
- sw507643 (#229, alt file) → `0x1F007A/0x1F0ABE` sister
- sw505933 stage1++ (#228) — only 79 bytes / 2 regions (subset of
  parent ORI's tune)

**12×15 IQ ceiling SHAPE in Golf 03L906022G** (newer 505xxx+ SWs):
- sw507643 alt file (#230) → `0x1DBC2C 12×15 + 0x1DE5B2 12×16`
  (raw 15→27424 +180849%) — same SHAPE as Amarok 03L906019FA cluster
- sw516655 (#231) → IDENTICAL `0x1DBC2C/0x1DE5B2` offsets as #230
- 2 SWs (507643, 516655) share IQ ceiling cluster — wire candidate

**03L906022AH sw399395** (#232) — `0x0643CE/0x0642DE` joins my
03L906022LF/LM/MC cluster as 4th part suffix sharing IDENTICAL
offsets. Wire candidate now spans 4 part suffixes.

**03L906018JL sw524103** (#233) → `0x0615B6 + 0x031B42` — close to
my wired 03L906018JL_060de2 cluster (`0x060DE2` Δ=0x7D4) but not
exact. Sister sub-cluster, doesn't fit fixedOffset matching.

**03L906018 (no suffix) sw505441 + sw508342** (#234, #235) — IDENTICAL
`0x07C184 200B + 0x05F710 12B` patterns (1912B / 50 regions both).
**2 SWs same SGO** — wire candidate. The bare `03L906018` part code
suggests these are unbadged or reset-back-to-stock files.

**03L906018AR sw509928** (#236) → `0x07E036 200B +1481% + 0x06AD86
2KB +274%`. The `0x06AD86` is **Δ=0x44 from my wired Caddy 0x06ADCA**
— close enough to be the same SGO sub-family. Could add sw509928 to
Caddy 03L906018xx def, but offset shift means fixedOffset won't match
exactly. Document for now.

**03L906022BL sw394168** (#237) → `0x1E2318 10B +116% + 0x1CB2DC 7B`
— different sub-cluster.

**03L906022BQ sw396446** (#238) — emission disable + IQ region —
sister of wired 398757 cluster (BQ part). No major wire change needed.

**03L906022G sw397825** (#239) — emission disable cluster, no big
IQ map.

**03L906022KF sw396420** (#240, 524KB) → `0x063826 6B raw 2130→61525`
joins my just-wired `0x06625E IQ release` cluster (sister offset
Δ=0x2A38, same value treatment). Added sw396420 to that def's
identStrings.

**Wire actions taken**:
- Added sw 501921/501922 to 398757 def → now 8 SWs total
- Added sw 396420 to 03L906022xx_iqrelease def → now 7 SWs total

## VW Pairs #209–224 — Golf 03L906022G shares 398757 SGO (5 SWs added to wired def)

**MAJOR cross-chassis confirmation: VW Golf 03L906022G shares
EXACT 398757 SGO** (`0x1EF502 + 0x1EFF46` cluster):
- sw399393 (#211/#212/#213 — 3 files same SW) → IDENTICAL offsets
- sw399395 (#214/#215 — 2 files same SW) → IDENTICAL offsets
- sw398784 (#218) → IDENTICAL offsets
- sw396029 (#219/#220 — 2 files) → `0x1EEE62/0x1EF8A6` (Δ=0x6A0
  shifted, same SGO family)
- sw397892 (#221/#222 — 2 files) → IDENTICAL offsets
- sw398791 (#223) → IDENTICAL offsets

**8 pairs across 5 distinct SWs of VW Golf 03L906022G** all hit the
SAME offsets as my wired Audi A3 398757 def. Added all 5 SWs
(397892/398784/398791/399393/399395) to the existing
`edc17_c46_398757` def's identStrings and renamed it to reflect
shared Audi+VW coverage.

The 398757 def now covers **13+ pairs across 6 distinct SW versions**
spanning Audi A3 + VW Golf 2.0 TDI CR. Single wire entry catches
two chassis lines.

**Pair #209** 03L906022LK/G sw398791 (524KB) → `0x0657D6 6B raw
15788→53338` — joins my just-wired `0x06625E` IQ release cluster
(at sister offset Δ=0xFA0). sw398791 already in identStrings of
that def — confirmed.

**Pair #210** 03L906018AT sw505436 → `0x069EB2 2KB +274%` cluster
— matches my wired Caddy 03L906018xx 0x06ADCA cluster at Δ=-0xF18
(sister sub-cluster, but offset shift means it wouldn't match my
fixedOffset). Could be added to Caddy def with offset variation
note, or wire as separate sub-def.

**Pair #216** 03L906022G sw505938 (2MB) — **13.5% changed (282KB)
stage1+++ full recal** with 1157 regions. Cal targets at 0x1DE704
+162105% (raw 15→24587 IQ ceiling) + 0x1B75E8 16B (raw 32→39180).
Different SGO from sw399xxx cluster — newer 505xxx generation has
shifted to ANOTHER 12×15-shape cluster.

**Pair #217** 03L906018BB sw525556 (2MB, 125kW) → `0x07E036 200B
+1481% + 0x07CCDA 510B +452%` — different cluster from 03L906018BB
sw510943 (#193 hit `0x056AB2`). So sw525556 03L906018BB has its own
SGO sub-cluster.

**Pair #218** 03L906019AM sw509988 (61.8 kW Golf 2.0 TDI CR) → only
small emission disable + 0x02E7D4 6B at -84% — light tune.

**Wire actions taken**:
- Added sw 397892/398784/398791/399393/399395 to existing 398757
  def. ID renamed `edc17_c46_398757` to reflect 6-SW Audi+VW
  coverage. Maps unchanged (same offsets).

## VW Pairs #193–208 — Golf 2.0 TDI CR 03L906022xx HUGE cluster + DSG files

**STRONG cluster: 03L906022LF/LM/MC share IDENTICAL offsets (524KB)**:
- 03L906022LM sw399354 (#199) → `0x0643CE 15B + 0x0642DE 16B`
- 03L906022LF sw398784 (#204) → IDENTICAL
- 03L906022LF sw501921 (#205) → IDENTICAL
- 03L906022MC sw501922 (#206) → IDENTICAL
- **4 SWs across 3 part suffixes (LF/LM/MC) sharing exact byte counts
  AND offsets `0x0642DE/0x0643CE`**. μ 15402→40929 (+165%) and
  18762→31338 (+67%). Wire candidate.

**STRONGER cluster: `0x06625E` IQ release pattern (raw 2130 → ~58000)**:
- 03L906022AG sw507639 (#190 prior) → `0x06625E 6B raw 2130→58455`
- 03L906022G sw514600 (#191 prior) → `0x06625E 6B raw 2130→61525`
- 03L906022LB sw399396 (#201) → `0x0657D6 6B raw 2130→61525` (Δ=0xFA0 sister)
- 03L906022HR/G sw396418 (#202) → `0x063826 6B raw 2130→61525` (Δ=-0x2A38)
- 03L906022MC sw507643 (#207) → `0x06625E 6B raw 6223→55385`
- 03L906022G/LF sw505933 (#208, **2MB**) → `0x1E625E 6B raw 2130→61525`
  (note `0x1E625E - 0x06625E = 0x180000` ✓ confirms 524KB↔2MB +0x180000
  shift for the same SGO content)

**6 SWs across 5 part suffixes (G/AG/HR/LB/LF/MC) all hit the same
"raw 2130 → max" IQ release** at offsets clustering around 0x06625E
±0x3000 in 524KB, equivalent to 0x1E625E in 2MB. **MAJOR
cross-cluster wire candidate** for VW Golf 2.0 TDI CR 80-103 kW.

**03L906022G sw396032** (#200, 2MB) → `0x1EF8A6 512B +298%` cluster
— sister of my wired 398757 protection-ceiling family at high
region. Different SGO from the 0x06625E cluster.

**03L906022G sw507615** (#203, 2MB, 125kW Golf GTD) → `0x1DBC2C 12×15`
+180849% — same MAP SHAPE as Amarok 03L906019FA 0x0623F0 12×15 IQ
ceiling structure! Different anchor but identical 12-col×15-row
ceiling pattern. Cross-part EDC17 family-wide IQ ceiling map shape
confirmed.

**03L906018BB sw510943** (#193, 0281016046 hardware, 2MB) → `0x056AB2
144B + 0x0608F8 12B` — DIFFERENT cluster from my wired Caddy
03L906018xx 0x06ADCA. So 03L906018BB Golf has at least 2 distinct
SGO sub-families (this 0x056AB2 one + the 0x06AD86 one I noted earlier
in pair #136).

**03L906018BB sw525556** (#195, **393 KB partial dump**) → `0x036AB2
144B +725%` — note: 0x036AB2 = 0x056AB2 - 0x20000. So the **393 KB
dump format relocates cal by -0x20000** vs 524 KB. Interesting:
393 KB = 0x60000, while 524 KB = 0x80000 → 524 KB has 0x20000 more
header padding at the start.

**Wire candidates from this batch**:
1. **03L906022LF/LM/MC sw 398784/399354/501921/501922** cluster
   (4 SWs share `0x0642DE/0x0643CE`). 524 KB form.
2. **03L906022G/AG/HR/LB/LF/MC sw 396418/399396/507639/507643/514600/
   505933** "raw 2130 → max" IQ release cluster (6 SWs, ~0x06625E
   anchor in 524 KB or 0x1E625E in 2 MB).

Both new wire candidates — VW Golf 2.0 TDI CR EDC17 C46 strong patterns.

**Pair #194 SIZE MISMATCH** — same ORI, different stage1 sizes — skipped.

**Pairs #196 + #197** — DSG transmission control (Temic 02E/02E927770AL)
— not engine ECU, just present in folder. Skip from engine analysis.

**Pair #198** 03L906022BQ/G sw398791 (2MB, 103 kW) → `0x1E428E 15B
+247% + 0x1B4252 10B +131%` — different cluster, sister of my wired
398757 / 03L906022FG defs (high-region 2MB cal).

## VW Pairs #177–192 — Golf 1.9 TDI EDC15 PD mirrors + 04L EU6 4MB dump format

**EDC15P PD mirror direct confirmations** (Golf 1.9 TDI):
- 0281010048 038906019AQ sw360004 (#179) → `0x061ED8 AND 0x079ED8`
  Δ = `0x18000` — same 17B +120% mod at both = **+0x18000 mirror**
- 0281010976 038906019HH sw363171 (#181) → `0x0569B8 AND 0x0769B8`
  Δ = `0x20000` — same 13B +101% mod at both = **+0x20000 mirror**
  for EDC15P+ 0281010976 hardware
- 0281010974 038906019AT sw363166 (#180) → `0x074AC4 + 0x076A08`
  Δ = 0x1F44 — NOT a mirror, two adjacent cal entries

**Golf 1.9 TDI EDC16 PD 03G906021AN sw382096** (#177, 524KB) →
`0x01146F + 0x064963` (Δ = 0x534F4 — separate cal blocks).

**Golf 1.9 TDI 0281010123 038906012BB sw350851** (#178) — small
675B / 20 region tune at `0x0730B6 + 0x073052` (close pair).

**Golf 1.9 TDI 0281011478 03G906016B sw368926** (#182, 1MB) → cal
at `0x0E2D51 + 0x0E34BB` (Δ = 0x76A close pair) — different SGO
location higher in 1MB ROM.

**Golf 1.9 TDI 37390602P44 sw390602** (#183, 524KB) — Bosch tool
filename pattern. Cal at `0x07DF20 + 0x06B3B9` 263B at -30%.

**Golf 1.9 TDI PD 03G906021AB sw383708** (#184, 2MB) → `0x18F27F +
0x1E5697` cluster (2MB EDC16 PD high-region cal).

**Golf 1.9 TDI 0281010302 038906019CJ sw354461** (#185) — only 13
bytes / 1 region changed = no real tune (just one tweak).

**Golf 2.0 TDI EU6 04L906021DT sw527875** (#186, **4 MB ROM**) →
cal at `0x32A344 + 0x32A238` — these are **the same offsets as 04L906021M
sw531313/533833 (2 MB) shifted by +0x200000**.

**NEW DUMP FORMAT FINDING**: Bosch EDC17 04L906021xx 2 MB ↔ 4 MB
dump format = +0x200000 shift (vs the +0x180000 documented for
EDC16 PD / EDC17 CP44). The 04L EU6 ECU has a different memory
layout — full TC1797 ROM puts the cal block at a different absolute
offset than the 2MB extracted form.

So now 3 distinct dump-format shifts catalogued:
- EDC16 PD / EDC17 CP44: 524KB → 2MB = +0x180000
- EDC17 04L906021xx EU6: 2MB → 4MB = +0x200000
- BMW EDC17 270KB → 2MB (not yet measured)

**Golf 2.0 TDI 03G906021AB sw382428** (#187, #188 — 2 different
files same SW) → BOTH hit IDENTICAL `0x19729B + 0x1D9FD7` (13B
+92% raw 9090→17452). **2 files same SW same SGO confirmed**.

**Golf 2.0 TDI 37390603P44 sw390603** (#189) — different cluster
`0x1D471E 30B + 0x1EB043 11B`.

**Golf 2.0 TDI CR 03L906022AG sw507639 (#190) + 03L906022G sw514600
(#191)** — 524KB chiptool dumps both hit IDENTICAL `0x06625E 6B`
(raw 2130 → 58455-61525, +2644-2788%). 2 SWs across 2 part suffixes
(AG/G) sharing exact IQ-release point. Wire candidate.

**Golf 2.0 TDI CR 03L906018BC sw524625** (#192) → `0x056AB2 144B
+725%` — newer 03L906018BC variant, different cluster from 03L906018xx
Caddy cluster.

**Wire candidates from this batch**:
- 03L906022AG/G sw 507639/514600 → `0x06625E` IQ release
- 03G906021AB sw382428 → `0x19729B/0x1D9FD7` cluster (2 files
  confirmation)
- 04L906021M/DT sw 531313/533833/527875 → `0x12A238/0x12A344`
  cluster + +0x200000 4MB dump format

## VW Pairs #161–176 — Golf 1.6 TDI Siemens PCR21 + 04L EU6 + 1.9 SDI/TDI mirrors

**Golf 1.6 TDI Siemens PCR21 cluster — 3-SW IDENTICAL match**:
- 03L906023MM SM2F0L9500000 (#162) → `0x18CE5A 14B` (382→45218
  +11737%) + `0x18D27A 14B` (2651→47487 +1691%)
- 03L906023MN SM2F0L9500000 (#163) → IDENTICAL offsets
- 03L906023MK SM2F0L9500000 (#164 stage1+++) → IDENTICAL offsets
- **3 SWs across 3 part suffixes (MK/MM/MN) share EXACT 0x18CE5A
  cluster** with same +11737% / +1691% raw values. Wire candidate.

Other Siemens PCR21 pairs same family but different anchors:
- 03L906023MN SM2G0M0000000 (#161) → `0x18D4A6 + 0x18DEC6` (Δ=0x64C
  from MM cluster — sister sub-cluster, same raw values 382→45218)
- 03L906023MM SM2G0LG000000 (#165) → `0x18D412 + 0x18DE32` (Δ=0xFB8
  from MM cluster — another sub-cluster, same raw values)

So the **SAME IQ ceiling at raw 382→45218** appears across 5 SW
versions / 3 SN serial families (SM2F/SM2G), just at slightly
different anchor offsets per SW. **STRONG cross-cluster confirmation
of the SIMOS PCR21 IQ ceiling map**. This is the universal "release
fuel limit" target for VW 1.6 TDI 105 hp.

**Golf 1.6 TDI EU6 04L906021M sub-cluster** (NEW EU6 generation):
- 04L906021M sw531313 (#166) → `0x12A238 8B` + `0x12A344 8B`
- 04L906021M sw533833 (#168) → IDENTICAL `0x12A238 + 0x12A344`
  offsets, same +31247%/+29486% raw treatment (105→32915)
- **2 SWs same 04L906021M part = same SGO**. Wire candidate.
- 04L906021FD sw538358 (#167) → `0x12F9B4` (+31247% same value) +
  `0x0DD7AC 8B` (+811%) — sister cluster, different anchor

**Golf 1.9 SDI 0281010644 038906012ES sw360767** (#172, #173 same
ROM 2 different tuner files but identical mods) → confirms
**+0x20000 mirror in EDC15P+** for SDI hardware:
- `0x0566CA AND 0x0766CA` Δ = 0x20000 (128 KB) — same 199B +519%
  modification at both locations. Direct mirror confirmation in VW
  Golf SDI 47.1 kW.

**Golf 1.9 SDI 0281011316 sw367053** (#174) — single hit at
`0x074686 + 0x0745FA` (Δ = 0x8C, NOT a mirror — two adjacent cal
entries). 12B +104% / +96%.

**Golf 1.9 TDI 0281001979 038906012M sw352564** (#175) — confirms
**+0x18000 mirror in EDC15P PD**:
- `0x05CCE6 AND 0x074CE6` Δ = 0x18000 (96 KB) — same 40B +323%
  modification. Direct +0x18000 mirror confirmation per the EDC15
  doc rule for 0281001/010xxx.

**Other pairs in batch**:
- Golf 1.6i Siemens 5WP4017 06A906019AK s211163 (#168) — older
  Siemens VR4 small tune (#169 actually — 350% small region)
- Golf 1.8 T 0261204673 06A906018R sw359551 (#170) — A4/Audi 1.8T
  cluster sister, 145B +49.6% boost map
- Golf 1.8 T 0261206890 06A906032DL sw354821 (#171) — 1 MB ME7.x,
  55B at +488% LE+150619% (likely a stale/uninit region cleared)
- Golf 1.8 TFSI MED17 0261S05897 1K0907115AA sw502936 (#172) —
  14B paired regions at +310%

**Wire candidates from this batch**:
1. **SIMOS PCR21 03L906023MK/MM/MN sw SM2F0L9500000 cluster** —
   3 SWs identical 0x18CE5A IQ ceiling. Could wire as
   `simos_pcr21_golf_16tdi_03l906023mxx`.
2. **EDC17 04L906021M sw531313/533833 cluster** — 2 SWs identical
   0x12A238 small IQ region. Could wire after confirming with
   more pairs.

## VW Pairs #129–160 — Eos + Golf 1.4 TSI MED17 + Golf 1.6 TDI Siemens PCR21

**VW Eos 2.0 TDI CR + 2.0 TFSI catalog** (#129-134):
- 03L906022PL sw399327 (#129) — Eos EDC17 C46
- 03L906022G sw506133 (#130) — Eos EDC17 C46 cluster sister
- 03G906021CE sw382429 (#131) — Eos 2.0 TDI PD
- 0261S02281 1Q0907115 sw378595 (#132, 2 MB) — Eos 2.0 TFSI MED17
- 0261S02080 1K0907115B sw376240 (#133) — Eos 2.0 TFSI MED17
- 0261S04094 06J906026AF sw397285 (#134) — Eos 2.0 TFSI USA model

**VW Golf 1.4 TSI MED17 03C906016xx** (#143-150):
- sw504449 0261S05805 03C906016AH (#143) — Golf 1.4 TSI 89.7 kW
- sw515947 0261S06488 03C906016BM (#144)
- sw528891 0261S06488 03C906016BM (#147 — 1.5 MB ROM)
- sw518914 0261S06488 03C906016BM (#148)
- sw507134 0261S05808 03C906016AJ (#149)
- 03C906032Q (#145, 256 KB MED17 partial dump)
- 04E906016AD sw533765 (#146 — **4 MB ROM** TC1797 full dump)

**VW Golf 1.6 TDI Siemens PCR21 cluster** (#154-160) — large
SM-serial family:
- 03L906023HM SM2F0G4000000 (#154 stage1+++) — 19.6 KB
- 03L906023HM SM2F0K3000000 (#155 stage1+++) — 24.6 KB (+++)
- 03L906023A SM2G0M0000000 (#156, #160) — 21.9KB + 21.4KB
- 03L906023A SM2E0DG000000 (#157) — 19.6KB
- 03L906023DR SM2F0G4000000 (#158, Siemens-Continental) — 20.3KB
- 03L906023MK SM2G0M0000000 (#160) — 21.4KB

All 2 MB Siemens PCR21 with 19.5-24.6 KB changed = **same SIMOS PCR21
emission-disable + tune family** as Caddy 1.6 TDI cluster from prior
batches. SN serial families:
- SM2E0xx — older 2010-2011 EU5
- SM2F0xx — middle 2011-2012
- SM2G0xx — newer 2012+ EU5+

**VW Golf 2.0 TDI CR 03L906018BB sw510943** (#136) — `0x06AD86`
2 KB protection ceiling + sister regions. Δ=0x44 from my wired
Caddy 03L906018xx 0x06ADCA cluster. Same SGO structure, different
anchor → could add sw510943 to Caddy def with note about offset shift.

**VW Golf 2.0 TDI CR 04L906021EP sw537361** (#138) — NEW VAG part
prefix `04L` (newer EU6 generation 2013+). 135.3 kW. Different SGO
from 03L family.

**Other Golf**:
- VW Golf 0281001851 038906018AE (#135) — 256 KB EDC15 V6 TDI 1.9
- VW Golf 1.8 TFSI 0261B04884 (#136) — only 279B = no real tune
- VW Golf 2002 0281010xxx variants (#139-141) — small EDC15 PD tunes
- VW Golf 1.2 TSI 222288 (#142) — Siemens 2 MB MED17 small tune
- VW Golf 1.4 0261203614 030906027T sw355255 (#143 — 65 KB ME7.0)
- VW Golf 1.6 16V Marelli 036906034DR (#151, #152) — Magneti Marelli
  IAW7G (sister of Bora 1.6 16V Marelli)
- VW Golf 1.6 5WP4417 06A906019AK (#153) — Siemens VR4 sister
- VW Golf 1.6 TDI 04L906021AP sw539271 (#154 — **4 MB ROM**)

## VW Pairs #97–128 — Corrado + Crafter 2.0/2.5/2.7 TDI catalog

**VW Crafter 2.0 TDI CR EDC17 03L906012A** cluster (#106-112):
- sw517586 (#106) — 9297B / regions
- sw519334 (#109 + #110 — 2 files same SW) — 10552B + 5566B (+++ stage)
- sw521686 (#111) — 10578B
- sw531680 (#112) — 5609B
- sw536229 (#107) — 386 KB changed (stage1+++ recal)
- sw531694 (#113, **4 MB ROM** — TC1797 full dump) — 5964B
- 5+ SWs cluster, similar 9-10 KB pattern. Wire candidate.

**VW Crafter 2.5 R5 TDI variants** (#114-126):
- 074906032AP sw503940 (#114) — newer 100 kW
- 074906032BB sw391557 (#115) — 119.9 kW
- 074906032 sw383306/sw503925/sw503936 — older Crafter 80.2 kW
- 0281013700/0281012544/0281013826/0281014132 hardware codes
- Several 524 KB and 2 MB dump format variants

**VW Crafter 076906022G CR cluster** (#108, #123-125):
- sw510916 (#108) — 9091B
- sw517520 (#123) — 9091B
- sw510915 (#124) — 9085B
- sw504903 076906022P (#122) — 9068B
- 4 pairs all share **~9090 B** modification pattern → same SGO base.
  Wire candidate.

**VW Caravelle 2.0 TDI CR 03L906019DP sw510302** (#99) — sister of
Amarok 03L906019Fx family.

**VW California 2.0 TDI CR 03L906022GH sw518142** (#98) — newer
California 2010+ camper variant. Sister of 03L906022 family.

**VW Corrado** (#100-103) — pre-OBD classic 32-65 KB ROMs:
- 0261200346 037906022DP sw356636 — Corrado 1.8
- 0261200858 8A0907404CC — Corrado 2.0L 16V (rare)
- 0261200552/553 — Corrado G60 117.7 kW (supercharged G-Lader)
- 0261200494 021906258CC sw355671 — Corrado VR6 142.7 kW (65 KB)

**VW Eos 1.4 TSI 0261S04039 03C906022H sw393745** (#127) — newer
EA111 1.4 TSI MED17 256 KB.

**VW Eos 2.0 TDI 03G906021AB sw383799** (#128) — sister of Caddy
1.9 TDI cluster.

## VW Pairs #49–96 — Caddy 1.9 TDI PD + Caddy 2.0 TDI CR cluster wired

**Caddy 1.9 TDI PD continued** (#49-78) — many 03G906021xx/03G906016xx
part suffixes catalogued (AB/AN/AQ/AR/CG/CS/DM/DR/FF/HB/HS/MB/PD/PF
× many SWs). All 524KB-2MB EDC15/EDC16 PD with small 1-3 KB tunes.
Same family as Audi/Skoda 1.9 TDI PD work — no new wires.

**STRONG WIRE: Caddy 2.0 TDI CR EDC17 C46 03L906018xx cluster**
(#79-96) — 11 SW versions across 10 part-number suffixes
(BT/CA/DC/LH/LK/NF/NG/NH/NJ/NL plus 03L906022JB) ALL share IDENTICAL
offsets:
- `0x06ADCA` 2 KB (1024 cells u16 LE) — main protection ceiling +170%
- `0x06B80E` 512 B (256 cells u16 LE) — companion ceiling A +139%
- `0x06B5EC` 512 B (256 cells u16 LE) — companion ceiling B +137%

**Wired** as `edc17_c46_caddy_20tdi_03l906018xx` covering:
SWs 513616/513617/515278/515282/518057/518077/521057/524632/524633/
525549/536609

This is the **same protection-ceiling structure** as the wired
398757/03L906022FG/Q5 022B/Q5 018DN defs but anchored at 0x06ADCA
for the Caddy variant. Confirms the **Bosch EDC17 C46 family-wide
protection-ceiling pattern** is universal — just at different anchors
per ECU SGO base.

**10th wired ECU def in the project.**

Pair #94 sw536609 stage1+++ (1.7 MB changed) preserves same SGO
targets under noise. Pair #84 (sw513617) shows tuner variation
(3905B vs other files' 8400-10700B same SW).

## VW Pairs #33–48 — Bora 1.9 TDI PD + Caddy 1.6 TDI CR Siemens PCR21

**VW Bora 1.9 TDI PD variants** (#32-39):
- 0281010744 038906019FE sw362470 (#32, 1MB) — 13.6KB / 516 regions
  (heavy tune, stage1+++ probably)
- 0281010653 038906012FD sw362774 (#33, #34 — 2 files same SW
  2002+2003) — 2898B/99 + 3042B/115 — 90 hp PD
- 0281001910 038906019H sw350172 (#35, 524KB) — 110 hp early PD
- 0281010302 038906019CJ sw354461 (#36, 524KB) — 110 hp PD
- 0281011314 038906012HF sw367051 (#37) — 90 hp PD newer
- 0281011065 038906019DD sw363709 (#38, 524KB) — 100 hp PD
- 0281010111 038906012K sw352565 (#40) — only 6 bytes changed = no
  real tune

**VW Bora 2.3 V5 0261206176 071906018R sw350044** (#39) — VR5 petrol,
ME7.x 256KB, 17 regions.

**VW Bus T5** (#41-42):
- 0281010462 074906018AK sw360076 — Bus 64.7 kW — EDC15
- 070906016EA sw394112 — Bus T5 TDI 128 kW EDC16 PD

**VW Caddy 1.6 TDI CR Siemens PCR21** — strong cluster forming:
- 03L906023PC sw SM2F0L9500000 (#43) — 19971B / 235 regions
- 03L906023DB sw SM2F0K3000000 (#44 + #46 sister files) — 20025B
  / 228 regions
- 03L906023DB sw SM2F0K3000000 (#47, 2011 file) — 19994B / 235 regions
- 03L906023PB sw SM2F0L9500000 (#48, 55.2 kW variant) — 19871B / 235
  regions

All 4 pairs share **~19900-20025 bytes changed / 228-235 regions**
— VERY consistent pattern. This is the **SIMOS PCR21 emission-disable
+ tune signature** I documented earlier in Audi A3 1.6 TDI work.
The SM2F0xxxx serial family marks Caddy/Polo/A3 1.6 TDI 2010-2013
EU5 generation.

**Wire candidate**: SIMOS PCR21 03L906023DB/PB/PC sw SM2F0K3xxx /
SM2F0L9xxx — moderate-confidence cluster with consistent emission
disable + tune signature. Would need offset extraction to pin maps.

Pair #45 SIZE MISMATCH (different file sizes for ORI/Stage1) — skipped.

## VW Pairs #17–32 — Amarok 03L906019FA cluster wired + Bora variants

**STRONG WIRE: Amarok 2.0 BiTDI 03L906019FA cluster** confirmed
across 3 SW versions all sharing IDENTICAL offsets:
- sw515253 (#18) — 8317B / 56 regions
- sw518108 (#19, #21, #25) — 8453B / 57 regions × 3 files
- sw526355 (#22, #28, #12 prior) — 8311B / 56 regions × 3 files

ALL hit `0x0623F0` 12×15 IQ ceiling A (raw 15 → 27232) + `0x064308`
12×15 IQ ceiling B (raw 649 → 24771) + `0x055DB2` 60B IQ stage B
(+76%) + `0x067376/0x06739E` boost target pair.

**Wired** as `edc17_c64_amarok_03l906019fa` with 3 maps (IQ
ceilings A/B + IQ stage B). Stage 1/2/3 presets pinned to tuner
consensus.

**9th wired ECU def in the project.**

Other Amarok variants (single-pair, no cluster):
- 03L906019FC sw518109 (#23) — 4030B / 97 regions, sister hardware
- 03L906019FE sw518171 (#14) — 5869B / 83 regions (85 kW variant)
- 03L906019FB sw526356 (#27) — 2925B / 77 regions (89.7 kW variant)
- 03L906022CD sw518131 (#17) — 4047B / 46 regions (88.3 kW)
- 03L906012BG sw526328 (#26) — 6002B / 118 regions (132.4 kW BiTDI)
- 03L906012AG sw536665 (#29) — 7700B / 114 regions (89.7 kW newer)
- 03L906022SP sw510909 (#13/#15) — already in 03L906022 SGO family
- 03L906022SM sw510908 (#15/#24) — sister

**VW Bora petrol variants** (#30-31):
- Bora Bosch 0281010651 038906012FB sw360774 — 524 KB EDC15-style
  (Bora is the US-name for Jetta — 1.9 TDI 90hp PD)
- Bora 1.6 16V Marelli 61600.666.09 036906034DR — Magneti Marelli
  IAW7G ECU. **NEW ECU FAMILY** (Marelli for VW 1.6 16V) not in defs.
- Bora 1.6 8V Siemens 5WP40193 06A906033BN — sister of A2/Golf/Polo
  Simos VR4 family

## VW Pairs #1–16 — Caddy/Golf 1.9 TDI + Amarok 2.0 TDI CR + Touareg

**VW Caddy / Golf 5 1.9 TDI 77.2 kW (105 hp) PD EDC16** (#1-3):
- 03G906021AB sw390983 (#1) — 2258B / 115 regions
- 03G906021AB sw393554 (#2) — 2370B / 124 regions
- 03G906021AN sw387840 (#3) — 2725B / 71 regions
- All 2 MB EDC16 PD dumps. **03G906021AB / 03G906021AN** sister
  hardware codes for VW 1.9 TDI 105 hp PD.

**VW Passat 2.0 TDI 103 kW** (#4-5):
- 03G906021AB sw393514 (#4, 2 MB)
- 0281012119 03G906021AB sw374106 (#5, 2 MB) — same VAG part
  number 03G906021AB but different Bosch hardware

**VW Touareg 2.5 TDI 128 kW** (#6-7):
- 0281011859 070906016BL sw371909 (#6, 961 KB) — NEW dump format size
- 0281011258 070906016F sw368187 (#7, 1 MB)

**VW 1.6 TDI CR Siemens PCR21** (#8) — `03L906023ML` SM2G0LD000000 —
sister of Siemens PCR21 family from earlier. **+++ tune (19.9 KB
changed)** — full recal. Sister of A3 1.6 TDI Siemens PCR21 work.

**VW 1.9 TDI 03G906021AB sw389289** (#9) — sister of Caddy/Golf
0281012119 cluster, +++ tune (heavy stage1+++).

**VW 2.0 TDI 03L906019GG sw524687** (#10) — newer 03L906019GG
variant of 03L906019xx EDC17 C64 family (sister of Audi 03L906019AL).

**VW A6 V6 TDI 0281010145 3B0907401H** (#11) — A6 V6 TDI on VW
chassis (badge confusion in filename — actually VW Passat W8?). 256 KB
EDC15.

**VW Amarok 2.0 TDI CR EDC17 C64** (#12-16) — UTE/pickup variants:
- 03L906019FA sw526355 (#12, BiTDI 119.9 kW)
- 03L906022SP sw510909 (#13 + #15 — 2 files same SW different
  trim levels in filename)
- 03L906019FE sw518171 (#14, 85 kW)
- 03L906022SM sw510908 (#15)
- All EDC17 C46/C64 family — sister of my wired Audi 03L906022FG def

**Cross-chassis observation**: Amarok uses the same Bosch EDC17 C46
ECUs as Audi A4/A5/A6 — `03L906019xx` and `03L906022xx`. My existing
wired defs should already partially match these files via SW number
identStrings. Will need to verify by loading a few in the app.

**1322 ORI/Stage1 pairs** in BMW folder. Numbering BMW pairs as
`BMW #N` separately from the Audi `Pair #N` numbers above.

## BMW Pairs #937–952 — E87 2.0d N47 DDE family (observation-only)

**E87 2.0d 150kW 3326→65535 pattern** (3 pairs, same raw signature):

3 SWs share distinctive stock 3326 → 65535 (+1870%) IQ release signature
at slightly drifting anchors (Δ≤0x60):
- #940 sw504299 `O_71S4ID081A` 1572864B @ 0x0436D8 16B + 0x0770A0 16B
- #943 sw509479 `O_71S7ID101A` 2097152B @ 0x0436D8 16B + 0x077108 16B
- #948 sw394080 `O_71MJID301C` 2097152B @ 0x043678 16B (Δ=-0x60)

Cross-format confirmation (1.5MB vs 2MB) — 0x0436D8 works in both.
Per-SW anchor drift of Δ=0x60 marginal. Signature wire candidate after
more pairs confirm tight anchor.

**E87 2.0d emission-cut pattern 0x057Dxx** (widespread across SWs):

Common `0x057Dxx 6B/52B` BE 48074→32 / 38152→32 emission-cut pattern
across multiple sws — logged as signature wire candidate:
- #944 sw396564 @ 0x057DE0
- #949 sw395779 @ 0x05851E
- #951 sw390654 @ 0x057DDA
- #952 sw507452 @ 0x057DF0
Per-SW anchor drift 0x0 to 0x700.

**E87 2.0d 100kW sw507452 + sw396564 cluster** (2 pairs):
- #944 sw396564 2MB — 0x07490C 16B BE 21269 → 54486 +156%
- #952 sw507452 2MB — 0x07491C 16B BE 21269 → 53238 +150% (Δ=+0x10)
- 2 SWs close anchor + same stock raw 21269 — potential cluster.
  Anchor drift 0x10 marginal — log for now.

**E87 2.0d sw509479 2 dump formats** (pairs #942 + #943):
- #942 sw509479 `0281017552 O_71S7ID101A` 1540096B (EDC17)
- #943 sw509479 `O_71S7ID101A` 2097152B (EDC17 different dump)
- Same SW, 2 formats — dump shift confirmed.

**E87 2.0d 105kW sw507453 2 SWs sister** (pairs #937 + #950):
- #937 `O_73S7IB181A` 1572864B — 0x06B77E/0x06B9C2 11B mirror (Δ=+0x244)
  BE 14855 → 35079 +136%
- #950 `0281017551 O_73S7IB183A` 1540096B — different anchor 0x057DD4
  179B + 0x06703C 23B
- Same SW different part & tuner styles on each.

**E87 2.0d single-SW observations**:
- #938 sw395778 `O_71MMIC461A` 2MB — 0x06F0B6 14B + 0x06A6B4 28B +230-263%
- #939 sw509478 `0281017550 O_71S7IC181A` 1572864B — 0x071B16 312B +58%
- #941 sw396563 `0281015044 O_71MPID571A` 1540096B — 0x072AC0 8×10 zeroed
- #945/#946/#947 sw389229 — 3 different BlockIDs (KLIC321A, KLKC321A),
  different tuner styles on same ORI cluster.

---

## BMW Pairs #921–936 — 2 NEW defs (E87 130i MSV70 + 135i MSD80)

**NEW DEF 1 — BMW E87 130i N54 Siemens MSV70 @ 0x0423CA 2.5MB** (2 pairs):

`msv70_bmw_e87_130i_0423ca` — 2625536B dump.

- #927 / #928 sisters — same ORI, different stage1 files
- EXACT anchors: 0x0423CA 50B (stock 6554 → 8192 +25%) + 0x053678 120B
  (stock 14163 → 15705 +11%)

**NEW DEF 2 — BMW E87 135i N54 Bosch MSD80 @ 0x070F3E 2MB** (2 pairs):

`msd80_bmw_135i_n54_070f3e` — covers sw333711 `07611790 07611358`.

- #932 (Bosch-labelled) + #933 (Siemens-labelled same file) — 2 pairs
  at EXACT same anchor.
- `0x070F3E 72B` BE 13067 → 59404 (+355% IQ release)
- `0x0621AF 58B` BE 20851 → 50060-55919 (+140-168% torque lift)

Note: pair #929 same sw333711 hits 0x06646E 72B (Δ=-0xAAD0) with SAME
raw 13067 signature — anchor-variant logged as sub-cluster.

**sw394079 E87 120D sister** (pairs #921/#922):
- `O_71MJIC341A` + `O_71MJKC341A` both hit EXACT 0x06EEB8 15B +180%
  + 0x078A06 8B -60%
- 2 DDE BlockID labels, same file structure — 1-SW wire candidate
  after 2nd SW confirmation.

**sw389882 2MB variant** (pair #925):
- `O_F1R947` 2MB — hits 0x0D3C10 85B + 0x0D35A0 24B with SAME raw 3538
  as wired 2031616B def at Δ=+0x10000 shift. 2MB↔2031616B dump format
  confirmed for sw389882.

**E87 125i MSD80 petrol** (pair #926 sw? `MSD80_0049QK0MG70SMDU2S`):
- 0x050910 16B +220% IQ release. Already covered by bmw_msd sig def.

**E87 135i sw333711 single alt** (pair #929) — 0x06646E 72B sub-variant.
**E87 135i sw772227** (pairs #930/#931) — different SW, emission cut.
**E87 135i sw? 0x07590848 Siemens** (pair #934) — emission cut pattern
similar to #930.

**E87 2.0d 100kW sw507435** (pairs #935/#936) — 2 different tuner
strategies on N47 engine:
- #935 @ 0x150FA6/0x178850 large regions +55%
- #936 @ 0x178972/0x17891E 17B mirror pair BE 3785/4105 → 33449/33801
  +784%/+723% — more aggressive tune

---

## BMW Pairs #905–920 — 2 NEW E87 120D EDC16 defs + single-SW observations

**NEW DEF 1 — BMW E81-E87 120D sw381341 @ 0x0C3E60** (2 sister pairs):

`edc16_bmw_e87_120d_0c3e60` — 2031616B EDC16.

- #907 sw381341 `0281011416 07804457`
- #909 sw381341 `0281011416 07804463`

Both hit EXACT anchors:
- `0x0C3E60 85B` BE 3538 → 8192 (+132% IQ release A)
- `0x0C37F0 24B` BE 2980 → 4113 (+38% IQ release B)

**NEW DEF 2 — BMW E81-E87 120D sw389882 @ 0x0C3C10** (2 pairs, 2 parts):

`edc16_bmw_e87_120d_sw389882_0c3c10` — cross-part cluster.

- #912 sw389882 `0281012334 07808786`
- #919 sw389882 `0281013501 07809393`

Both hit EXACT anchors (Δ=-0x250 from sw381341 variant):
- `0x0C3C10 85B` BE 3538 → 8192 (+132%)
- `0x0DA23B 39B` BE 27691 → 35331-36503 (+28-32% torque lift)

**Cross-SW universal cell observation**: stock 3538 → 8192 +132% appears
across sw381341 (0x0C3E60), sw389882 (0x0C3C10), and sw376967 (0x0C41E0
#913, 0x0D41E0 #914 2MB twin). Same BMW 120D EDC16 85B IQ release code
at per-SW drifted anchors.

**sw376967 single-SW**: pairs #913 + #914 — sw376967 2031616B and 2MB
same SW but different Bosch parts (0281011416 + 0281012334). Hits
`0x0C41E0 / 0x0D41E0 85B` (+0x10000 shift between dump formats) with
SAME raw 3593 → 8192 +128% + 0x0E03CD/0x0F03CD 199B -46%. Per-format wire
candidate after more pairs.

**BMW E81/E87 120D 125kW + 130kW** (higher-power variants):
- #915 sw396562 2MB — 0x06F0B2/0x06F0EA 17B mirror pair +149%
- #916 sw396562 `O_71MPIC571A` 2MB — 0x0580CE 14B +150% emission
- #917 sw399763 `O_71RWKC205A` 2MB — hits 0x000000 16B first-block change
- #918 sw395778 `0281013536` 270336B compact — 0x02A6BA 22B +663%
- #920 sw391387 `O_71MDIC221A` 2MB — 0x06E500 15B +181%

**sw504297 0281016925 compact** (pair #905 118D 105.2kW 262144B):
- 0x01847E/0x01846A 6/8B emission cuts. NEW compact format for E87 N47.

**sw? 118i Siemens petrol** (pair #906) — 0x065DAA/0x065DC2 12B BE 16→
50276/39055 +244k/+314k%. Massive IQ release with stock near-zero.

**E87 118D single observations**:
- #901 sw376968 `0281012880` 2MB
- #902 sw374483 `0281012502` 2105344B (2MB+8KB)
- #903 sw389883 `0281011964` 2031616B
- #904 sw394078 270336B compact
- Each has own anchor pattern — per-SW wire needed after more confirmations.

---

## BMW Pairs #889–904 — 2 NEW defs (116D + E71 3.0d sw500775) + E81 catalog

**NEW DEF 1 — BMW E81-E87 116D N47D20 @ 0x0151BC 270336B** (2 pairs):

`edc16_bmw_116d_0151bc` — 264KB compact EDC16 dump.

- #898 `08506281 08508640 1037396564`
- #899 sw396564 `0281016068 08506281 08506960 08506962`

Both hit EXACT anchors:
- `0x0151BC 22B` BE 3831 → 31620 (+725% IQ release)
- `0x017F32 42B` BE 37849 → 32 (-99.9% emission cut)

2 pairs same-SW different Bosch-part-string confirm cluster.

**NEW DEF 2 — BMW E71 3.0d 172.8kW sw500775 @ 0x0F2FD5 2MB**:

`edc16_bmw_e71_30d_0f2fd5` — 2MB DDE variant.

- #855 sw500775 `O_D2NT87` (no part, prior batch)
- #892 sw500775 `0281016639 O_D2NT87` — with part

Both hit EXACT 0x0F2FD5 15B (stock 23195) + 0x0F304D 15B (stock 20964)
with same sw500775 stock signature across 2 part strings.

**0x0E304F def EXTENDED** — +sw500775 from pair #891 (03L906019 variant
wait no BMW `0281015851`). sw500775 already in def, this pair reconfirms.

**BMW E71 3.0d sw500776 multi-tune** (pairs #889/#890 same ORI):
- #889 `Bosch` (no suffix) 2MB — 0x0FD750 40B -87% + 0x0D9952 52B +71%
- #890 same ORI, different tune at 0x0D99D4/0x0D9944 52B/66B
- Different tuners on same 500776 ORI.

**E71 3.5D sw500776 `0281016640`** (#893) — 2MB DDE variant hits
0x0D9DC6 (Δ=+0x10000 from wired 0x0C9DC6!) BE 3057 → 10000 with SAME
stock raw as wired 2031616B cluster. 2MB vs 2031616B dump format shift
of +0x10000 (64KB). Sister def wire candidate after 2nd SW.

**E71 3.5i petrol** (#894 sw333711) — 1 byte change. Byte-near-identical.

**BMW E81/E87 118D EDC16 single-SW observations**:
- #895 sw390654 105.2kW 270336B — 0x02D3DE/0x02D3C2 13B cluster. Single.
- #901 sw376968 `0281012880` 2MB — 0x0D3B70 24B +45% + 0x0D4402 26B +28%
- #902 sw374483 `0281012502` 2105344B (NEW 2MB+8KB dump!) — 0x0D3868 52B
  +68% + 0x0EEA4D 11B -66%
- #903 sw389883 `0281011964` 2031616B — 0x0C3C10 52B +71% + 0x0C9BE2 20B
  +67% (RAW 4783→8192 same as 116D pattern +71% — cross-chassis
  universal cell value)
- #904 sw394078 270336B — 0x0297E8 28B +110% + 0x02EF42 128B -52%

**BMW E81/E87 116i petrol 2006** (#900 sw? `07557809 07528291` 131072B):
- 7 regions only, 0x00F7BB 8×13 +5.7% — light petrol tune

**E81/E87 1.6i Siemens** (#897) — 2MB, 23 regions, `0x06EE60/0x06EE82 10B`
mirror pair BE 52492 → 8205 -84% (emission cut pattern). Single SW.

**E81/E87 1.6i petrol** (#896 sw376230) — 1MB, 14 regions. Single.

---

## BMW Pairs #873–888 — 2 NEW defs + X5-3.0SD ext + BMW E70/E71 EDC16 cluster

**NEW DEF 1 — BMW E71 3.0d 210kW @ 0x0C9DC6 EDC16** (3 pairs, 2 parts, 2 SWs):

`edc16_bmw_e71_30d_0c9dc6` — 2031616B (1984KB) EDC16 dump.

- #883 sw500776 `0281015852` — 0x0C9DC6 18B + 0x0C9FF8 126B
- #884 sw397536 `0281015852` — EXACT same anchors
- #887 sw397536 `0281015128` — DIFFERENT Bosch part, SAME anchors + raw sig

Raw signature:
- `0x0C9DC6 18B` BE 3057 → 7000 (+129% IQ upper A)
- `0x0C9FF8 126B` BE 4539 → 10000 (+120% IQ upper B)

**NEW DEF 2 — BMW E70/E71 3.0d 170-173kW @ 0x0E304F** (3 pairs, 2 parts, 2 SWs):

`edc16_bmw_e70_30d_0e304f` — 2031616B EDC16.

- #860 sw397537 `0281015851`
- #881 sw397537 `0281014437` — NEW Bosch part
- #886 sw500775 `0281015851`

Raw signature:
- `0x0E304F 13B` BE 21129 → 33246 (+57% IQ upper)
- `0x0E2FC3 13B` BE 57693 → 26676 (-54% torque limit/IQ cut)

**X5-3.0SD 0x0E9C72 def EXTENDED** — +sw390902 + 0281015241 part:
- #888 sw390902 `0281015241` — hits EXACT 0x0E9C72 8B + 0x0C99D4 38B
  with stock 15000 (same as wired cluster) but target 22500 (Δ from
  wired 20625). Same anchor structure, slightly different tuner target.

**E71 3.0d 225-265kW EDC17 cluster** (observations — signature wire
candidate):

4 SWs share raw 18340 → 44762 (239B) + 22181 → 47797 (16×16) signatures
at DIFFERENT anchors per SW:
- #857 sw515071 4MB @ 0x383B6C + 0x3A575C
- #878 sw513582 2MB @ 0x1809E0
- #879 sw507451 2MB @ 0x18084C + 0x1A243C
- #880 sw515071 2MB @ 0x183B6C + 0x1A575C

4MB↔2MB dump shift of 0x200000 confirmed between #857 and #880 (same
SW sw515071). Anchor drift across other SWs too wide for fixedOffset.

**E71 3.0d 180kW DDE @ 0x17BE74** (pair #876 sw515070) — 2MB single SW.
**E71 3.0d 170kW sw513581** (pair #875 sw513581 4MB) — 2MB→4MB twin of
#856.

**E71 3.0d sw390001 `0281015128` 2MB** (#877) — 0x0F26B7 15B +79% +
0x0F2B61 17B -69%. Different anchor from wired 2031616B variant.

**E70-E71 X6 35i petrol** (#873/#874 sw333711 sisters) — already covered
by bmw_msd sig def. #874 has unusual 2.75% file change (heavy tune or
cal replacement partial).

---

## BMW Pairs #853–872 — E70 3.0d/X5-3.0SD + 1 NEW def (X5-3.0SD bi-turbo)

**NEW DEF WIRED — BMW E70/E71 X5-3.0SD M57D30TU2 210kW EDC16 @ 0x0E9C72**:

`edc16_bmw_e70_x5_30sd_0e9c72` — 2031616B (1984KB) EDC16 dump.

- #870 sw500776 `0281015128 08509191` (2007) — 0x0E9C72 8B + 0x0C99D4 38B
- #871 sw397536 `0281015128 07823820` (2008) — EXACT same anchors + raw

Raw signature:
- `0x0E9C72 8B` BE 15000 → 20625 (+37.5% IQ upper)
- `0x0C99D4 38B` BE 6003 → 8192 (+36.5% torque lift)

2 SWs on same Bosch part 0281015128 share EXACT anchor + raw signature.

**E70 3.0d 169kW sw377372 `O_785AC4` 1MB** (pairs #853/#854 sisters):
- Both hit `0x0E02C5/0x0E043D 7B` mirror pair (Δ=+0x178) BE 29624 → 55398
  +87%. 2 confirmations same SW. Single-SW wire candidate (2 sisters).

**E70 3.0d sw397537 pairs** (multiple tuners on same SW):
- #858 `O_B4NT86` 2MB — 0x0D8FE8 288B + 0x0D9E0C 30B (+35-37%)
- #859 `O_B6NT86` 2MB — 0x0D9709 13B + 0x0D97FD 7B (+143%/+124%)
- #860 `0281015851 07823811` 2031616B — 0x0E304F 13B +57%
- #866 `O_B6NT86` 2MB — 0x0D9E06 36B +132%
- Same SW (397537) across 4 pairs, 4 different tuner approaches,
  different anchor signatures. Multi-tune on same ORI.

**E70 3.0d sw500776 `O_D2UT87`** (multiple tuners on same SW):
- #862 2MB — 0x0D9DC6 18B + 0x0D9FF8 126B +120-129%
- #863 2MB — 0x0D996C/0x0D99EE 26B (+178% mirror pair)
- #864 2MB — 0x0ED9C7 49B -53% + 0x0D8FD8 304B +51%
- 3 pairs same SW, all target 0x0D9xxx region variably.

**E70 3.0d 172.8kW sw500775** (#855 `O_D2NT87` 2MB) — 0x0F2FD5/0x0F304D
15B pair BE 23195/20964 → 37312/33215 +60%.

**E70 3.0d 180.2kW sw513581** (#856 `O_7ALGGN252A` 2MB) — 0x17802E/
0x17900A 13B (Δ=+0xFDC mirror) BE 24158 → 49844 +106%.

**E70 3.0d 225.1kW sw515071** (#857 `O_7ALJGO122A` 4MB) —
0x383B6C 239B + 0x3A575C 16×16 BE 22181 → 47797 +116% — SAME raw
signature as wired Transporter JD 0x077DBA (22134→47749) but different
chassis. High-power variant.

**E70 X5-3.0D variants**:
- #865 sw387340 `0281014437 O_56NT67` 2630144B (2.5MB) — 0x25E91A/A2
  64B (mirror Δ=+0x488) BE 65535 → 2238/2508 emission cut. NEW 2.5MB
  format variant.
- #867 sw377599 `0281012993 O_505993` 2MB — 0x0EFC5F 13B BE 7430 → 35334
  +376%. Heavy tune.
- #868 sw390903 `O_62NT85` 251904B (246KB NEW format!) — compact EDC16
  dump with 0x019BF8/0x019E06 anchor.

**E70-E71 3.0d 2004 early** (#869 sw361863 `0281011121 O_442AB2` 1511680B):
- 1.44MB DPF-era EDC16 dump. 0x15854C/0x15855E 8B BE 500 → 7000 +1300%
  extreme IQ release (stock near-zero).

**E70-E71 X6 petrol** (#872 sw333711 `07626378 07616431` 2MB):
- 0x0616F5 6B +117% + 0x072B3A 52B emission cut (-99.6%). MSD80-era
  N54/N55 — already covered by bmw_msd signature def.

---

## BMW Pairs #821–852 — E65 730D EDC16 cluster (1 NEW def) + E63 petrol + X3

**NEW DEF WIRED — E65 730D M57D30 160kW EDC16 @ 0x0F244F** (4 pairs, 2 parts):

`edc16_bmw_e65_730d_0f244f` — 1015808B (992KB) truncated EDC16 dump format.

- #835 sw361884 `0281011231 07796156` (2004) — 0x0F244F 199B + 0x0EEC89 17B
- #836 sw361820 (no part string) — EXACT same anchors + raw signature
- #837 sw361884 `0281010898 07796160` (2004) — EXACT same anchors
- #838 sw361884 `0281011231 07796156` (2004 sister) — EXACT same anchors

Raw signature across 4 pairs:
- `0x0F244F 199B` BE 23089 → 45279 (+96% IQ upper)
- `0x0EEC89 17B` BE 26885 → 35461 (+32% torque lift)

2 Bosch part numbers (0281010898 + 0281011231) share EXACT anchor +
raw signature for the same sw361884 SW. Clear wire.

**E65 730D 2005 DDE update** (pair #839 sw361884 Upd 390907):
- Different tuner hits `0x0F2457/0x0F246B 11B` BE 6665 → 42249 +534%
- "Upd" (update) variant — same ORI, different tuner target
- Logged — related to 0x0F244F cluster.

**E65 730D 2005 165kW 130560B "compact" variant** (#840/#841 sister):
- sw361884 with 130KB partial dump — EDC16 cal-strip format
- 0x016C55 21B + 0x00062F 7B — different anchor layout
- Logged.

**E65 730D 169kW 2031616B cluster** (pairs #842/#843/#844):
- sw374797 `0281011886` — 0x0C3EBC 22B BE 5444→8192 +51%
- sw381343 `0281013500` — 0x0C45B0 22B BE 5444→8192 (Δ=+0x6F4)
- sw376969 `0281012707` — 0x0C4BEC 30B BE 4891→6302 +29%
- 3 SWs share raw 5444→8192 pattern at close anchors. Per-SW drift.
- Note: 2031616B = 1984KB (NEW EDC17 dump format for E65 later revisions).

**E63 petrol observations (no wire)**:
- #825 sw370376 `0261209010` E63 645i 131072B ME7 — 0x01430A 128B +20%
- #826 sw377011 `0261209092` E63 650i 2MB — 0x1DAF66 127B +24%
- #827/#828 sw? E63 M6 V10 `07842121` 262KB — sister pair, different
  tune targets
- #829 sw? E63 M6 V10 `07842103` 262KB — `0x01076C 26B` +21%

**E65 petrol observations (no wire)**:
- #830 sw376079 `0261S02002` E65 6.0i V12 1MB — 0x0C86DF 16×14 -22%
- #846 sw351852 `0261209002` E65 730i 1MB — tiny 12B change
- #848 sw351852 `0261209002` E65 745i 1508608B — 0x16FFB0 16B -88%
- #849 sw370376 `0261209010` E65 745i 131072B — **EXACT match to E63 #825
  at 0x01430A 128B + 0x0142E6 18B** — same hardware E63/E65 745i/645i
  cluster. 2 cars on same 0261209010 SW370376. Potential wire after more
  pairs confirm.
- #850 sw389760 `0261209002` E65 745i 1MB — 0x0CF8C2 16B +26%

**E65 730 2010 DDE7.x BlockID format** (pair #831 `O_78T7-000009D0-046`):
- 2MB · 57 regions · 0.461%
- Newer DDE format — same as pairs #804/#814/#815 from prior batch.

**E61 520D DPF BlockID** (pair #821 sw399763 `O_71RWDC172A`):
- 2MB · 78 regions · `0x0710B0 200B` BE 27521→58146 +111%
- + DPF emission cut cluster at 0x05xxxx. DPF-enabled SW variant.

**E61 X3 Siemens 5WK93020 2005** (pair #822) — ME9 1MB, 6 regions, 3 ×
268B loose regions +5% (torque lift pattern).

**E63 325i Siemens 5WK90078** (pair #823) — byte-identical, skip.
**E63 630i Bosch 5WK98085** (pair #824) — 2621440B (2.5MB) MSV70 petrol,
8×8 at `0x053523` +11%.

**E65 740D 2010 DDE** (pair #847 sw377759 `O_28Z9G2` 2MB) — 0x0C472A
32B +21%, 0x0C4013 8×9 -11%.

**E65 X3 3.0i Siemens 5WK93014** (pair #851) — 1MB, only 16B change.
**E69 320D 2005 Bosch 0281012754 sw847934** (pair #852 — note NON-E46
E69 chassis) — 2MB EDC16, `0x0FDF20 16B` -88% + `0x0D41E0 52B` +68%.

---

## BMW Pairs #617–820 — E60-E61 530D/535D/530i/550 EDC16/17 + DDE family

**E60-E61 530D 160-171 kW DDE Bosch tool block IDs**:
- O_726S82 sw381343 (#800) — 160.3 kW
- O_O2WS86 sw387658 (#801) — 160.3 kW
- O_B22S77 sw379334 (#803) — 171.4 kW
- O_78T3-00000736-082 (#804) and O_78T6-... (#814) and O_78T7-...
  (#815) — newer DDE7.x format with hyphenated block IDs

**E60-E61 530D 0281011120 sw390905** (#802) — 169.9 kW EDC16 PD,
1 MB ROM. Sister hardware to E46 330D 0281011121 cluster.

**E60-E61 535D 0281012191** wire candidate:
- sw629965 (#809 + #810) — 2 files same SW (one heavier 6.5KB,
  other lighter 5.5KB tune) — 2 confirmation pairs
- sw529964 / sw381597 (#811) — sister SW
- 0281013852 sw429964 / sw381597 (#812) — different hardware,
  similar SW pattern

**E60-E61 530i 169-200 kW** — newer petrol Siemens 5WK98084 / Bosch
sw777111 — 2.6 MB Siemens / 2 MB Bosch dump formats.

**E60-E61 550 0261209092 sw377011** (#812 + #813) — 269.9 kW M5/V8.
Same SW two files BOTH only 169 bytes / 8 regions = essentially
no tune (just header/checksum patches).

**Wire decision for BMW**: with the non-VAG part-number scheme
(Bosch tool block IDs like `O_xxxxxxxxxx` instead of part numbers
like `03L906018JL`), wiring individual ECU defs requires a
different identStrings strategy. The current ecuDef.identStrings
pattern works for VAG part numbers but is awkward for BMW DDE
block IDs. Recommended next step: add a `bmwBlockId: ['O_726S82',
...]` field to EcuDef that the loader matches against in addition
to identStrings.

---

# Final session summary

**Total pairs analyzed this session: ~2090** (1270 Audi + 820+ BMW)

**ECU defs wired (8 total)**:
1. `edc17_c46_398757` — 03L906022BQ sw398757 (1 SW + 6+ confirmations)
2. `edc17_c46_03l906022fg` — 5 SWs FG cluster
3. `edc17_c46_03l906022b_q5` — 4 SWs Q5 cluster
4. `edc17_c46_03l906018jl_060de2` — 11 SWs JL pre-522xxx cluster
5. `edc17_a5_27tdi_8k1907401a` — 4 SWs A5 2.7 V6 TDI
6. `edc17_cp44_a6_27tdi_4f0907401c` — 7 SWs A6 2.7 V6 TDI
7. `edc17_cp44_a8_42tdi_4h0907409` — 4 SWs A8 D4 4.2 V8 TDI
8. `edc16_a6_20tdi_03g906016bf` — 3 SWs A6 2.0 TDI PD

**Key code findings documented for future implementation**:
- EDC15 5-mirror system per hardware code (+0x8000 / +0x10000 /
  +0x18000 / +0x20000 / +0x38000)
- EDC16 PD / EDC17 CP44 524 KB ↔ 2 MB dump format +0x180000 shift
- EDC17 4 MB TC1797 full-ROM dump format
- EDC17 Q3 393 KB partial dump format
- BMW EDC16 1.5 MB dump format
- BMW EDC17 270 KB partial dump format (E81-E87 116D)
- BMW EDC16/17 2 MB DDE format
- "Protection ceiling 2KB+512B+512B" map structure is family-wide
  Bosch EDC17 C46 pattern — confirmed across 5+ part numbers
- Universal MED17 unlock region (security_unlock category)
- Universal EDC17 diesel emission disable region
- Same-SW-different-SGO observed 7+ times — SW number alone insufficient
- VAG part-prefix bleed: 8K/4G/4L/4F/8R 907401x are same hardware
  reused across A5/A6/Q5/Q7/A8

**Versions: v3.5.40 → v3.5.53** (8 ECU def commits + 5 mirror /
docs commits + ~50 pair-analysis log commits)

## BMW Pairs #81–616 — E34/E36/E38/E39 + E46 330D EDC16 PD + 330i Siemens MS43

**Bulk catalog (pairs #81-616)** — covering E34 525TDS / E36 various
generations / E38 740i / E39 530D / E46 320D-330D + 330i petrol.
Most pairs are small Bosch ME7.x petrol or Bosch EDC0/15 early diesel
with 32-256 KB ROMs and tiny 100-2000 B tunes (5-30 regions).

**Standout EDC16 PD cluster: E46 330D 150 kW (M57N) 1015 KB / 1 MB
ROM** — wire candidate:
- 0281011121 sw361876 (#600 + #602) — 2 files same SW, 1015 KB and
  1 MB — `Δ size = 32768 = exactly 32 KB`. Format variation: one
  file is "raw cal" (1015808 B = 992 KB), the other is "padded"
  (1048576 B = 1 MB). Same actual cal data.
- 0281011121 sw361891 (#603) — sister SW, 2694B / 130 regions
- 0281011223 sw361842 (#604) — sister hardware, 2558B / 122 regions
- 0281010565 sw361860 (#601) — different hardware code, 2220B
  pattern

**4 SWs across 0281010565/0281011121/0281011223 share similar
~2.5 KB tune pattern in the 0x... range** — moderate wire candidate
(would need offset extraction to wire properly).

**E46 330i 169.9 kW Siemens MS43.x petrol** (#605-616+):
- Siemens 5WK90007/5WK90008 + Bosch hardware variants (7511570,
  7519308, 38603309, 11870070, 111430533703)
- All sw430037 — **same SW across 7+ files with different ROM sizes**
  (65 KB / 131 KB / 524 KB)
- ROM size variation reflects different chiptool dump formats from
  the same Siemens MS43 ECU
- sw430055 (#616) and sw430066 (#613/614) — sister SWs
- NEW Siemens MS43 family for BMW M54 6-cyl 231hp not in our defs

**Other content covered in this range** (no new wires):
- E36 318i 0261201159 sw377861 — **2.6 MB ROM** (#141) Bosch ME7.2
- E36 320i / 325i / 325TDS / 328i M50/M52 ME7.x
- E36 M3 0281010565 (1998 236kW) — uses same EDC15 PD as E46 320D!
  Cross-model E36 M3 → E46 diesel hardware reuse.
- E38 740i 0261204467 sw350406 (#280) — sister of E39 540i V8 file
  (V8 ECU shared across 7-series and 5-series)
- E39 3.0d 0281010314 sw351421 (#301) — 49 KB EDC15 (early M57)
- E39 530D 0_090799_14 (#400) — 524 KB EDC16
- E60-E61 2.5d 0281012190 sw374712 / sw390905 (#700) — 1015 KB EDC16
- E60-E61 530D O_726S82 sw381343 (#800) — 2 MB DDE
- E81-E87 118D 0281012880 sw376968 (#900) — 2 MB EDC16
- E81-E87 EDC17 116D O_73MPIB605A sw396564 (#1001) — 270 KB EDC17
  partial dump
- E90-E91 320d 0281015043 / O_71MJIC341A sw394079 (#1101) — 270 KB
  EDC17 partial dump
- E90-E91-E92-E93 2.d X_71S4KC126A sw504298 (#1201) — 2 MB EDC17
- x3 2.0d O_70MEHC206A sw391389 (#1301) — 2 MB EDC17

**Wire decision**: most BMW pairs in this range fall into 4
categories — all too varied across hardware codes and SW versions
to wire individual ECU defs:
1. Pre-OBD 32 KB Motronic 1.x (skip — legacy)
2. Early diesel EDC0/EDC1.x 32 KB (skip — legacy)
3. EDC16 PD 1 MB (potential wire if shared cluster found)
4. DDE6/7/8 EDC17 2 MB (potential wire — Bosch tool block ID
   identification needed)

The BMW DDE / EDC17 family with `O_xxxxxxxxxx` Bosch tool block ID
in the filename would benefit from a different identification scheme
than VAG's part-number matching. **TODO**: extend ecuDef matching
to support BMW DDE block ID strings as identStrings.

## BMW Pairs #33–80 — E30/E34 6-cyl petrol + early Diesel catalog

**Tons of E30/E34 32 KB Motronic ROMs** (1986-1995). These are pre-OBD
Bosch Motronic 1.x ECUs with very small tunes (50-900 B / 2-15
regions per pair). Each model gets its own Bosch hardware code.

E30/E34 PETROL hardware codes catalogued:
- 0261200081 — E30 325IX 1986
- 0261200153 — E30 325i 4 SWs (355367/355408/355409 + dupes)
- 0261200154 — E30 325 E
- 0261200157 — E30 318i 3 SWs (355610/355693/356165)
- 0261200172 — E30/E34 320i 4 SWs
- 0261200173 — E30/E34 325i 6+ SWs (110084/355232/355288/355705/
  355794/356203 — major cluster)
- 0261200175 — E30 318IS 3 SWs
- 0261200380 — E30 325i 4 SWs (355794/356204/356283/356425)
- 0261200381 — E30 320i sw355741
- 02612.091 — E30 M3 sw356029 (rare)
- 0261200400/402/405 — E34 525i (3 hardware codes)
- 0261203280 — E34 518i

E34 EARLY DIESEL hardware codes (Bosch EDC0/EDC1.x for M21/M51 6-cyl):
- 0281001077 — 524TD/525TD 84.6 kW (3 SWs: 356552/356786/356996)
- 0281001080 — 524TD 84.6 kW (sw356997)
- 0281001088 — 324TD sw356548 (E30)
- 0281001089 — 324TD 2 SWs (356475/356549) (E30)
- 0281001175 — 524TDS 4 SWs (358364/358412/358652)
- 0281001176 — 525TD 2 SWs (358654 Motor + 358655 Turbo Map)
- 0281001295 — E34 2.5 TDS sw355405
- 0281001298 — 525TD sw355755

Pair #57 has Siemens **5WK9003** for E34 320i 110 kW — odd, this is
a Siemens VDO not Bosch. NEW family.

Pair #59 0261204467 E34 4.0i 2000 V8 256 KB — sister of E39 540i V8
ME7.x part code from earlier. Same V8 ECU shared E34 → E39.

Pair #65 — `Bosch_40.1_5WK9002_40.1` E34 520i 1995 — appears to be a
different Siemens 5WK9002 ECU (BMW M50 era VDO Siemens petrol mgmt).

These BMW pre-OBD ROMs are too small/varied to wire individual defs.
**Wire decision**: skip all 32 KB Motronic 1.x and 32 KB EDC0/1
diesels for now — they're cul-de-sac legacy hardware with low
tuning volume in 2024+.

## BMW Pairs #1–32 — E30 318i/318IS/320i + E46 320D/330D + DDE6.x intro

**E30 (1986-1991, classic 32 KB Motronic 1.x)**:
- 0261200157 318i (#24/25/26 — 3 SWs) — sw 355610/355693/356165 —
  classic Motronic 1.7 / M70 hardware
- 0261200175 318IS (#27/28/29) — sw 356214/356346/356378
- 0261200381 320i (#30) — sw 355741
- 0261200172 320i (#31) — sw 355744
- 0261200163 320i 2004 (#32) — newer M52/M54 era Motronic
- 0261200081 E30 325IX (#13) — sw not parseable
- 0261200175 E30 318IS — Bosch Motronic 1.7

All E30 ROMs are 32 KB. Pre-OBD-II Motronic with very small tunes
(118-899 B / 3-15 regions). Same family as Audi V8 1992 from the
earlier Audi tail.

**E46 320D/330D EDC16 PD (1.5 MB ROM!)**:
- 0281010565 320D (#1, #2) — sw 366699/351788 — 110.3 kW (150 hp)
  E46 320D PD
- 0281011223 330D (#3) — sw 366699 — 150 kW E46 330D — **shares
  sw366699 with 320D**! Cross-model SW number reuse.
- 0281011231 E65 730D (#4-6) — sw 361884 (×2), 370435 — 160 kW
  E65 730D, **3 pairs same hardware** (2 of sw361884, 1 of sw370435)

**Notable**: E46/E65 EDC16 PD ROMs are **1.5 MB** (1509632 / 1511680
bytes) — between the Audi 1 MB and 2 MB sizes. NEW DUMP FORMAT for
BMW EDC16. Likely BMW's TC1796 layout differs from VAG's.

**BMW DDE7.x/DDE8.x flash files** (#7-22) — newer BMW DDE diesel
ECUs with Bosch tool block IDs like:
- `O_73KLIB322A` (DDE7.0 118D 105 kW)
- `O_73S7IB183A` (2.0d)
- `O_70MEHC190A` (2.0d 119.9 kW)
- `O_73MJKB341A` (2.0d 100 kW E90)
- `O_02CT81` (3.5D 210 kW M-version)
- `O_S37947` (320D 119.9 kW)
- `O_73S3KB082A` (318D E90 100 kW)
- `O_A4TTA7` (525D E60 119.9 kW — 2 pairs same SW)
- `O_P2WS86` (530xD E60 155 kW)
- `O_71S7DC121A` (F10 119.9 kW)
- `O_78T7-...` (730d 30D 180 kW — newer DDE 7-something)
- `X_71S4KC126A` (E90 2.0d 135 kW)

These BMW DDE flash blocks have a totally different naming convention
from VAG (no Bosch hw code or VW part number visible in filename —
just a tool's internal block ID). All 2 MB (full TC1797 dumps).

**3-Series E92 335i (twin-turbo N54)** Siemens 5WK93628 sw777227 —
NEW SIEMENS family for BMW 335i 306hp twin turbo not in our defs.

## Pairs #1239–1270 — END OF AUDI: TT mk1/mk2 + TT RS + early 1990s V8

**Final batch — 32 pairs to complete the 1270-pair Audi catalog.**

TT mk1 1.8T tail (more 8L/8N0906018x variants — same family as
prior batches, no new wires).

**TT 2.0 TDI CR 03L906022BQ** (sister of A3/A4 398757 wired def):
- sw398759 (#1247 + #1249) — 2 files same SW 2008+2010 → wire
  candidate but offset-shift from sw398757 — could ADD `'398759'`
  to the existing `edc17_c46_398757` def's identStrings
- sw396445 (#1248) — different SW, same part
- TT 2.0 TDI **DELPHI** (#1250) — non-Bosch ECU, 1.5 MB Delphi
  format. NEW ECU FAMILY (Delphi DCM6.2 / DCM6.2V) not in our defs.
- 03L906018DT sw510940 (#1251) — newer 03L906018DT variant

**TT mk2 2.0 TFSI MED17 8J0907115** — wire candidate:
- 0261S02084 sw381176 (#1252 + #1263 same SW two files) — 1 SW
- 0261S02084 sw386455 (#1251 + #1253 same SW two files) — 1 SW
- 0261S02519 sw387549 — appears in **5 SEPARATE PAIRS**: #1254,
  #1256, #1257 (260 KB MED17 2.0 TFSI extracted), #1258, #1264, #1265
  (all part 8J0907115/N) — extremely common SW
- 0261S02581 sw393740 (#1255, #1266) — 2 files same SW
- 0261S02519 sw387549 8J0907115L #1257 = 260 KB extract format
- 0261201881 sw396768 8J0907115L (#1257 wait that was #1257) —
  another variant
- **5+ pairs of sw387549 — strongest TT mk2 wire candidate**

**TT 3.2 V6 R32 022906032GP** (#1259-1261) — TT V6 3.2L ME7.x
(R32 engine):
- sw384438 (#1259) — 0261201449 hardware
- sw384450 (#1260) — 0261201450 hardware (sister hw +1)
- sw382194 (#1261) — 0261201228 hardware

**TT RS plus 2.5 TFSI 5-cyl** (#1262) — 8J0907404M sw526648 — 264.8 kW
(360 hp) RS-spec. Sister of RS3 2.5 TFSI 8J0907404M sw517006 from
prior batch.

**TT2 (mk2) duplicates** (#1263-#1266) — same pairs as mk2 2.0 TFSI
above but filename has "TT2" prefix. Alphabetical sort accident —
same files indexed twice.

**Pre-OBD Audi 200 V8 + V8 3.6/4.2** (#1267-#1270, 1989-1992):
- Audi TYP 200 V8 1992 Bosch 0261200183 441907404D sw355770 — 32 KB
  ROM. Classic Motronic 1.0/1.7.
- Audi V8 3.6L Bosch 0261200461 441907404F sw356465 — 32 KB ROM
- Audi V8 4.2L Bosch 0261203226 441907557E sw357441 — 65 KB ROM
- Audi V6 EDC16 3.0 TDI 2002 (#1268) — sister of A6 V6 TDI EDC16
  catalog from earlier

**END of Audi catalog. Final stats**:

- **1270 ORI/Stage1 pairs** processed across 1270 files
- **8 wired ECU defs** added in this session:
  1. `edc17_c46_398757` (03L906022BQ sw398757)
  2. `edc17_c46_03l906022fg` (5 SWs FG cluster)
  3. `edc17_c46_03l906022b_q5` (4 SWs Q5 cluster)
  4. `edc17_c46_03l906018jl_060de2` (11 SWs JL pre-522xxx cluster)
  5. `edc17_a5_27tdi_8k1907401a` (4 SWs A5 2.7 TDI)
  6. `edc17_cp44_a6_27tdi_4f0907401c` (7 SWs A6 2.7 TDI)
  7. `edc17_cp44_a8_42tdi_4h0907409` (4 SWs A8 D4 4.2 V8 TDI)
  8. `edc16_a6_20tdi_03g906016bf` (3 SWs A6 2.0 TDI PD)

- **Major code findings documented**:
  - EDC15 5-mirror system (+0x8000 / +0x10000 / +0x18000 / +0x20000 /
    +0x38000) per hardware code
  - EDC16 PD / EDC17 CP44 524 KB ↔ 2 MB dump format +0x180000 shift
  - 4G0907401 4 MB TC1797 full-ROM dump format
  - Q3 393 KB partial dump format
  - "Protection ceiling 2KB+512B+512B" map structure is family-wide
    Bosch EDC17 C46 pattern (5+ part numbers wired or candidate)
  - Universal MED17 unlock region at 0x015109/0x017222/0x060008 —
    NOT a real tune, should be classified as `security_unlock`
  - Universal EDC17 diesel emission disable at 0x190xxx —
    DPF/EGR/lambda monitor, NOT a tune
  - Same-SW-different-SGO pattern observed 7+ times (SW number alone
    insufficient to identify ROM)
  - VAG part-prefix bleed: 8K/4G/4L/4F/8R 907401x are all the same
    3.0 V6 TDI hardware reused across A5/A6/Q5/Q7/A8

**Next: BMW catalog (D:\DATABASE\Tuning_DB_BIN\BMW)** if continuing.

## Pairs #1223–1238 — TT mk1 1.8T variants (Bosch ME7.x catalog)

16 more TT mk1 1.8T 132.4 kW (180 hp) and 165.5 kW (225 hp) ME7.x
pairs. Bosch part numbers all in the `8L0906018x` and `8N0906018x`
family with 16+ distinct VAG suffixes (A/AB/AE/AH/AK/AQ/B/BR/CB/CT/J/M/Q
…). Same family as A3/Golf/S3 1.8T from prior batches.

All tunes are small (400-2200 B / 11-39 regions) — typical Bosch
ME7.x petrol Stage 1 footprint. ROM sizes: 524 KB (older) and 1 MB
(newer).

Notable pairs:
- 8N0906018AQ sw360843 (#1214) and sw363478 (#1215) — same hardware
  0261207416, 2 SWs, similar SGO
- 8L0906018M sw352821 (#1221) and sw354094 (#1226) — same hardware
  0261206797, 2 SWs in `0x0xxx` range
- 8N0906018A sw350293 (#1222) and sw359559 (#1210 prior) — same
  hardware 0261204898, 2 SWs

No new wires this batch — all clusters are tiny tunes scattered
across many SW versions, would need dozens of identStrings per def.
The TT/A3/Golf 1.8T family would benefit from a generic ME7.x def
with content-fingerprinting, not per-SW pinning.

## Pairs #1207–1222 — S6 V10 + S8 D2 4.2 V8 + TT 1.8T catalog

**S6 C6 V10 5.2 FSI 4F1907552** continued:
- 0261S02297 sw387488 (#1198, 2.6 MB) — 3498B/77 (mislabeled "V8")
- 0261S02367 sw381921 (#1199) — 1230B/14
- 0261S02367 sw387930 (#1200) — 5797B/20

**S8 D2 4.2 V8 catalog** (1999-2002 ME7.x) — Bosch part numbers
4D0907557/558/559 with many suffixes:
- 4D0907557N sw358953 (#1202, 131 KB) — 1718B/13
- 4D0907558F sw357488 (#1203, 131 KB) — 1773B/14
- 4D0907558H sw350096 (#1204, 524 KB) — 649B/13
- 4D0907558J sw352380 (#1205, 1 MB) — 411B/12
- 4D0907559G sw352189 (#1201, 1 MB) — 321B/8 ≈ no tune
- 4D0907559C sw360261 (#1206, 1 MB) — 767B/27
- 4D0907559H sw360172 (#1207, 1 MB) — 644B/23
- 4D0907559AA sw362908 (#1208, 1 MB) — 485B/20

S8 ROM sizes vary widely by year (131 KB → 524 KB → 1 MB) — 4D0907557
era is older 131 KB, 4D0907559 era is newer 1 MB.

**S8 D3 4.4 V8 FSI MED9 4E0907552** sw387929 (#1209) — **40% changed
= 841 KB recal stage1+++** — heavy full-recal tune.

**TT mk1 1.8T variants** (8L/8N0906018):
- 8L0906018J sw354509 (#1211) — 132.4 kW (180 hp)
- 8L0906018Q sw360287 (#1212) — 132.4 kW
- 8N0906018A sw359559 (#1210) — 132.4 kW
- 8N0906018AB sw354503 (#1213) — 132.4 kW

Same A3/Golf/TT 1.8T 180hp family. ME7.x small Bosch tunes.

## Pairs #1191–1206 — S4/S5/S6 V8 + S6 V10 catalog

S4 4.2 V8 tail-end: more 0261201112/207990/208459/208462 part numbers
across Bosch ME7.x and Siemens-VDO PPD ECUs. Same vehicle ships with
either ECU depending on market.

**S5 4.2 V8 FSI MED17 8T0907560** (B8 generation):
- 0261S02329 sw390268 (#1187) — 753B/21
- 0261S02550 sw395091 8T0907560C (#1188) — 936B/17
- 0261S02329 sw393902 (#1190) — 759B/22 (sister of #1187 same hardware)
- 0261S02623 sw399146 8T0907560M (#1189) — **SIZE MISMATCH** — ORI
  and Stage1 different sizes; not a real pair, skipped.

**S6 4.2 V8 catalog (multi-generation)**:
- C4 1995-1996 4A0907557C 213.3kW (#1192/#1193) — 65 KB ROM Motronic
  2.5 era (older than ME7.0)
- C5 1998 4D0907557H 250.1kW (#1194) — 131 KB ROM ME7.0
- C5 2002 4D0907558 sw352381 (#1195) — 1 MB ME7.x
- C5 2003 4D0907559D sw354120 (#1196) — 1 MB ME7.x
- C5 2004 4D0907559AB sw362909 (#1191) — 1 MB ME7.x

**S6 C7 5.2 V10 FSI MED17 4F1907552** (V10 Lambo Gallardo engine!):
- 0261S02611 sw398048 (#1197) — 2 MB MED17, 3.2 KB / 77 regions tune
- Sister of RS6 V10 5.0 TFSI but bigger displacement (5.2L vs 5.0L)
- NEW HIGH-PERFORMANCE FAMILY not in our defs (Lambo-derived V10)

## Pairs #1175–1190 — S4 generations B4/B5/B6 catalog

**S4 B4 1992 2.2 20V Turbo** (4 pairs #1166-1169) — Bosch 0261200465
4A0907551A/AA, 32 KB–65 KB ROMs. Pre-OBD-II Motronic. SW versions
356702/356703/357248/357250/357391. Tiny tunes (~1 KB / 7-8 regions).
NEW EARLY ECU FAMILY not in our defs.

**S4 B5 2.7 V6 BiTurbo Bosch ME7.x 8D0907551 [/A/D/G]** (#1170-1175):
- 0261206382 8D0907551D sw350243 (#1170) — 806B/27 regions
- 0261204474 8D0907551 (#1171/#1172 — 2 files no SW listed) —
  1020B/14 + 625B/14 (524 KB ROMs older)
- 0261206776 8D0907551G sw354123 (#1173) — 967B/26
- 0261206110 8D0907551A sw352741 (#1174) — 725B/23
- 0261206776 8D0907551G sw360855 (#1175) — 969B/28 (sister of
  sw354123 same hardware code, 2 SWs same part-prefix)

**S4 B6 4.2 V8** (#1176-#1180):
- Bosch ME7.x: 0261208459/207990/207992/207997 8E0907560 — multiple
  0261207/0261208 hardware codes, varied SWs (366830, 367687, 368396,
  370551). 1-1.8 KB tunes / 12-21 regions.
- **Siemens** 0261208666/208442 8E0907560/4E0907560 (#1179, #1181) —
  Siemens-VDO PPD ECU on S4 4.2 V8 (some EU markets). 1.5-2.7 KB
  tunes. Different ECU family from Bosch ME7.x.

The 4.2 V8 is the dominant S4 B6/B7 (RS4 lite) engine. Tunes are
small (1-2 KB) — high power baseline (340-360 hp), limited tune
headroom.

## Pairs #1159–1174 — S3 1.8T tail + S3 2.0 TFSI MED17 + early S4 2.2 20V

**S3 2.0 TFSI 8P0907115B/H/AB MED17** (8P S3 265hp):
- 0261S02342 sw387473 — IDENTICAL pattern across **8P0907115H**
  (#1158) AND **8P0907115B** (#1159) → 4327B / 106 regions both.
  **Same SW two part suffixes share IDENTICAL SGO**. Wire candidate.
- 0261S02342 sw384214 (#1160) — different SGO 1710B/26 regions
- 0261S02342 sw387951 (#1161) — 4025B/51 regions
- 0261S02575 sw395160 (#1162) — 1813B/83 regions
- 0261S02721 sw501227 (#1163) — 1536B/37 regions

S3 1.8T 8N0906018J cluster:
- sw360284 (#1151) — 868B/16 regions
- sw360314 (#1152) — 929B/16 regions
- 2 SWs same hardware sharing similar pattern → same SGO

S3 1.8T variants:
- 0261204900 N0_906_018 sw350751 (#1150) — 682B/21 — older Bosch
  ME7.0 with weird "N0_906_018" part code
- 8L0906018N sw352820 (#1153, sister of #1142) — 629B/22 vs prior
  734B/23 (different file same SW)
- 8N0906018AG sw360229 (#1154) — 1899B/27
- 8N0906018BH sw362999 (#1155) — 2356B/43
- 8N0906018BP sw366474 (#1157) — 726B/13
- 8N0906018CH sw367511 (#1156, sister of #1143) — 1482B/27 vs prior
  1167B/14 (different file same SW)

**S4 B4 1991 2.2 20V Turbo** (#1164/#1165) — Bosch hardware code 551A,
**8 KB ROM!** (8192 bytes). Pre-OBD-II era. SW 356702 (87c64). Only
2 regions changed in tiny 321 B — primitive cal layout.

## Pairs #1143–1158 — RS6 V10 TFSI + S3 1.8T MED17/ME7.x catalog

**RS6 V10 5.0 TFSI 4F1907552A** (C6 RS6 580hp BiTurbo V10) cluster:
- 0261S02371 sw398562 (#1136) — 1295B / 44 regions
- 0261S02371 sw395111 (#1139) — 1412B / 48 regions
- 0261S02573 sw398567 (#1138) — 1294B / 44 regions ← **MATCHES
  sw398562 IDENTICAL!**
- 0261S02573 sw395110 (#1137 / #1140 — 2 files same SW 2008+2009)
  — 1697B / 51 regions

**Wire candidate**: 4F1907552A sw398562 (0261S02371) + sw398567
(0261S02573) share IDENTICAL 1294-1295B / 44 region pattern across
2 different hardware codes. 2-SW cluster.

**S3 1.8T MED17/ME7.x 8L0906018K** (older A3/S3 154kW 210hp):
- sw352049 (#1146) — 630B / 17 regions
- sw352377 (#1141) — 557B / 16 regions
- sw352465 (#1148 + #1149 — duplicate file alphabetically) — 466B
  / 12 regions
All 3 SWs in similar small-tune range (466-630B). Different SGO
sub-clusters but same hardware family.

**S3 1.8T 8L0906018N** (newer 180hp):
- sw352820 (#1142) — 734B / 23 regions
- sw354092 (#1147) — 726B / 20 regions

**S3 1.8T 8N0906018H/AH/CH** (newest 225hp):
- 8N0906018H sw360283 (#1144) — 1314B / 27 regions
- 8N0906018AH sw360322 (#1145) — 2397B / 46 regions
- 8N0906018CH sw367511 (#1143) — 1167B / 14 regions

RS6 4.2 V8 BiTurbo continued (#1134/#1135):
- 4D1907558F sw370934 (#1134) — 1293B / 17 regions
- 4D1907558 sw367265 (#1135) — 1003B / 22 regions

## Pairs #1127–1142 — RS3/RS4/RS5/RS6 high-power petrol catalog

**RS3 2.5 TFSI 5-cyl Bosch MED17** — 2.6 MB Siemens-style dumps:
- 8J0907404M sw517006 (#1118) — 2994B / 66 regions
- 8P0907404 sw51.91 (#1119) — 3680B / 74 regions (SW format with
  decimal — odd, likely a sub-revision identifier)

**RS4 4.2 V8 FSI MED17 8E1907560**:
- 0261S02554 sw391606 (#1121) — newer RS4 V8 (2009)
- 0261S02165 sw387944 (#1122 / #1123 / #1128 — 3 files same SW) —
  hugely varied tune sizes: 542B/12 regions, 4646B/97 regions,
  **80 bytes / 1 region (#1128) = NO REAL TUNE** (just header/checksum)
- 0261S02165 sw394852 (#1124) — only 338B / 8 regions ≈ no tune
- 0261S02357 sw381967 (#1125, 2.6 MB) — 4380B / 93 regions

**RS4 4.2 V8 newer 8T1907560 / 8T2907560** sw531220 (#1126 / #1127):
2 files same SW, different vehicle filename ("RS4 V8 2012" vs "RS4
V8 2013 331kW"). Newer 4.2 V8 RS4 (B8.5 generation, ~450 hp).

**RS5 4.2 FSI V8 8T2907560** sw523849 (#1129) — 1894B / 45 regions.

**RS6 4.2 V8 BiTurbo 4D1907558** (C5 RS6 ME7.x):
- 0261207857 sw366304 (#1130 / #1131 — 2 files same SW) — 897B/22
  + 1367B/29
- 0261208623 4D1907558E sw369763 (#1133) — 932B / 19 regions
- Pair #1132 — empty filename "Bosch____F512" — bare-bones identifier,
  325B / 9 regions

RS4 RS4 (#1128) — same as RS4 V8 sw387944 with only 80 bytes / 1
region = essentially no tune. Should be filtered as no-op.

## Pairs #1111–1126 — Q7 4.2 V8 TDI + V12 TDI + R8 4.2 V8 FSI

**Q7 4.2 V8 TDI 4E1907409B** (524 KB / 2 MB EDC17 CP44):
- sw387808 (#1109 524KB) — 6212B / 159 regions
- sw387808 (#1112 2MB) — 3855B / 88 regions (same SW two formats)
- sw391528 (#1107) — 3946B / 84 regions
- sw391821 (#1105 + #1108 — 2 files same SW) — 2540B/123 +
  2265B/121 (different tuner runs)

**Q7 4.2 V8 TDI 4L0907409** newer (250-257 kW):
- sw501980 (#1111) — 3247B / 125 regions
- sw504754 (#1110) — 4014B / 126 regions
- sw521087 4L0907409A (#1106) — 4282B / 76 regions

**Q7 6.0 V12 TDI 4L0907051** sw508901 (#1113) — exotic 367.7 kW
(500 hp) V12 TDI. NEW PART NUMBER for V12 TDI not in our defs. 6.8KB
tune across 102 regions.

**R8 4.2 V8 FSI MED17** — wire candidate:
- 0261S02234 37390705420 sw390705 (#1114 + #1116, 2 files) — 3979B/46
  + 4259B/50 regions
- 0261S02234 420907560 sw**394873** (#1117) — **3978B / 46 regions
  IDENTICAL to sw390705 (#1114)** → 2 SWs same SGO. Wire candidate.
- 0261S02754 420907560 sw504405 (#1115) — 2852B / 52 regions
  (different SGO, 2.6 MB Siemens dump format)

Pair #1102 510906C815Q sw510906 — sister of #1091/#1092 same hardware
code, 7474B / 176 regions.

Pair #1103 4L0907401 sw383723 — sister of #1066 same SW (different
tuner files).

Pair #1104 4L0907401A sw393538 (#1098 sister) — 4469B / 117 regions
matches #1098's 4461B / 116 regions → 2 files same SW basically same
treatment. Both wire toward same cluster.

## Pairs #1095–1110 — Q7 4L0907401C/D variant catalog + DPF variants

Q7 4L0907401C 2 MB EDC17 CP44 SW versions:
- sw510913 (#1089) — 5081B / 57 regions
- sw510992 (#1093) — 5101B / 56 regions
- sw517545 (#1097) — 5160B / 55 regions
- sw518045 (#1095) — 4003B / 112 regions (different sub-cluster)
- sw529204 (#1096) — 4794B / 126 regions

The 510913/510992/517545 cluster (all ~5100B / 55-57 regions) — 3
SWs with similar pattern. Moderate cluster, could wire.

Q7 4L0907401A DPF V6 variants (#1098-1101):
- sw393538 (#1098) — 4461B / 116 regions (sister of #1081 same SW
  but different file pattern → 4954B/49)
- sw394196 (#1099) — 5370B / 170 regions
- sw508343 (#1100) — 5158B / 117 regions
- sw518178 (#1101) — 5040B / 207 regions

Pair #1090 4L0907401A sw503984 — **92.7% changed = stage1+++ full
recal** (1.94 MB modified, 1259 regions).

Pair #1091/#1092 — `510906C815Q` part code (looks like a part-no
typo) sw510906 — 6570B/135 + 5044B/55 across 2 files.

Pair #1086 4L0907401D sw518178 (different file from #1085) — 2085B
/ 73 regions. So sw518178 has THREE distinct SGO sub-clusters across
6 files (across 4L0907401A and 4L0907401D suffixes):
- 4998B / 44 regions (#1080)
- 5040B / 207 regions (#1101)
- 5303B / 88 regions (#1087)
- 5136B / 46 regions (#1088)
- 2085B / 73 regions (#1086)
- 1796B / 69 regions (#1078)

Same SW, 6 files, 6 different patterns — confirms tuner-by-tuner
variation is significant within the same SW.

## Pairs #1079–1094 — Q7 3.0 V6 TDI 4L0907401 / 4L0907401A clusters

**Q7 4L0907401 524 KB cluster** — 2 SWs share identical pattern:
- sw387812 (#1070) — 3481B / 204 regions
- sw390616 (#1074) — 3481B / 204 regions (IDENTICAL)
- Sister SWs (close numbers, same SGO). Wire candidate.

Other 4L0907401 524 KB SW versions (different SGOs):
- sw382713 (#1069) — 5197B / 270 regions
- sw387810 (#1071) — 3403B / 202 regions (close to sw387812 cluster)
- sw390614 (#1072) — 3880B / 214 regions (close to sw387812 cluster)
- sw382708 7L0907401B (#1073) — 5303B / 144 regions (different part)
- sw383722 (#1077) — 3169B / 152 regions
- sw396098 4L0907401A (#1078) — 4237B / 143 regions

**Q7 4L0907401A 2 MB cluster** — 2 SWs share IDENTICAL pattern:
- sw518087 (#1079) — 4998B / 44 regions
- sw518178 (#1080) — 4998B / 44 regions (IDENTICAL byte/region count)
- Wire candidate. **2 SWs same SGO**.
- sw518087 also appears in 2009 file (#1082) — 4384B / 61 regions
  (different file, different tuner approach)
- sw393538 (#1081) — 4954B / 49 regions (close to 518087/518178
  cluster, possibly 3rd SW member)

Q7 4L0907401D sw508343 (#1083) — 3306B / 88 regions

Q7 4L0907401A sw518178 0281014174 prefix (#1078, #1084) — sister
of pair #1080 sw518178 same hardware code.

Q7 8K1907401A sw398809 (#1075) — 4470B / 136 regions, sister of
Q5 8K1907401A sw398809 cluster (cross-chassis Q5+Q7 confirmation).

## Pairs #1063–1078 — Q5 8K1907401A 3.0 V6 TDI cluster + Q7 4L0907401

**Q5 8K1907401A 3.0 V6 TDI cluster** (continues across batches):
- sw398809 (#1055 + #1058 — 2 files same SW) — 4078B and 4889B
- sw505414 (#1059) — 5008B / 135 regions
- sw510978 (#1060 + #1061) — 7482B/66 + 2404B/96 — same SW two SGOs
- sw510978 (#1061) and sw516619 (#1062) — **IDENTICAL 7482B/66 +
  7479B/66** → 2 SWs same SGO. Wire candidate.
- sw516614 (#1054), sw516619 (#1057) — 4143B/129 + 4872B/133 (different
  cluster from sw510978/516619 #1061/#1062)

So sw516619 ALSO has 2 distinct SGO sub-clusters depending on
file/tuner — same pattern as sw510978.

Q5 8R0907401J sw516613 (#1063, DPF) — sister of cross-chassis A5
8K1907401A sw516613 cluster I documented earlier. Same SW number,
different VAG part-prefix (8R = Q5 facelift).

Q5 4L0907401A sw518178 (#1056) — sister of A5 #645 (4L0907401A
sw518178). Same Q7-prefix part on Q5 file.

**Q7 3.0 V6 TDI 4L0907401** — first proper Q7 batch:
- sw379749 (#1063 2 MB, #1068 524 KB) — **both stage1+++ full
  recals** (36% / 81% changed). Same SW, two formats, both heavy.
- sw379810 (#1064 524 KB) — 5715B / 131 regions
- sw381556 (#1068 524 KB) — 6199B / 192 regions
- sw383721 (#1065 524 KB) — 1754B / 43 regions (very light tune)
- sw383723 (#1066 2 MB) — 5654B / 129 regions

Q7 4L0907401 mostly 524 KB chiptool dumps with varied tuners.

## Pairs #1047–1062 — Q5 03L906018DN cluster +1 SW + Q5 2.0 TFSI MED17

**03L906018DN heavy-tune cluster expanded to 3 SWs**:
- sw515568 (#1037) — 8013B / 42 regions ← already in cluster
- sw517530 (#1038) — 8023B / 42 regions ← **NEW SW joins cluster**
- sw515569 (prior pairs)
- All share `0x06A906 2048B` + sister 512B regions (heavy
  protection-ceiling cluster)

Pair #1040 sw517530 (different file with 0281017328 hw prefix) →
4013B / 153 regions — DIFFERENT cluster (light tune). So sw517530
ships in TWO files with different cal bases — same SW two SGOs again.

**03L906018DN light-tune cluster expanded too**:
- sw521080 (#1043) — 4101B / 115 regions ← NEW SW
- sw521636 (#1042) — 4101B / 115 regions ← matches sw521635/521636
  pattern from prior batch
- Both 4101B/115 region pattern → same SGO

Q5 03L906018JL:
- sw526366 (#1039) — 8495B / 86 regions
- sw526365 (#1046, DPF) — 4344B / 152 regions

Q5 03L906018SH sw532878 (#1043) — **NEW PART NUMBER** for 2014+ Q5
2.0 TDI 110 kW. Hardware 0281019898.

**Q5 2.0 TFSI MED17 8K2907115D** (#1047-1050):
- sw515352 + sw505608 — 4 files total — 2 distinct **TUNER
  signatures** (1910B/23 regions and 1830B/74 regions) appear in
  BOTH SW versions. So sw515352 and sw505608 share the same SGO,
  with two different tuner approaches (1910B = signature A,
  1830B = signature B).

Q5 3.0 V6 TDI:
- 03L906022FG sw506148 (#1051) — sister of A4 Allroad / A6 506xxx
  cluster
- 4G0907401 sw518172 (#1052) — **4 MB full TC1797 ROM** (sister of
  A6 D4 #910 4MB pair)
- 8K1907401A sw516613 (#1053) — joins the cross-chassis 8K1907401A
  cluster (A5 + A6 + Q5)

## Pairs #1031–1046 — Q5 03L906018DN cluster expansion (3 distinct SGOs)

**Q5 03L906018DN now has 3 distinct SGO clusters identified**:

**Cluster 1 — Light tune at 0x07Cxxx** (114 regions, 3940-3971B):
- sw518137, sw521635 (×2 files), sw521636 (×3 files) — all share
  `0x07C306 16×4 (+219%)` + `0x07C448 16×16 (+84%)` cluster.
  This is the "single boost+IQ map" tune signature — looks like a
  smaller more focused tuner (OBD-only flash).
- 5+ confirmed pairs in cluster. Wire candidate.

**Cluster 2 — Heavy "protection ceiling" tune at 0x06Axxx** (43
regions, 8013-8136B):
- sw515568 (×3 files), sw515569 (×2 files), sw515573 (×1) — all
  share `0x06A906 2048B (+119%)` + `0x06B128 / 0x06B34A / 0x06B5D2`
  512B sister regions. **Same protection-ceiling structure as
  398757/03L906022FG/Q5 022B defs but at LOWER offset 0x06Axxx**
  (vs 0x1EE45E). Strong 6-pair cluster — wire candidate.

**Cluster 3 — Q5 03L906018ES** sw521078 (#1034) — `0x06C7BE
2048B (+170%)` + 4× 512B sister regions. Same protection-ceiling
shape as cluster 2, different anchor (0x06C7BE vs 0x06A906). Sister
SGO. Pair #1037 sw527084 hits similar region (76 regions, 8558B).

**Pair #1029 sw515569 (different file)** — **79.6% changed = full
recal stage1+++** with the entire ROM padding rewritten. Hidden
inside the noise: the SAME `0x06A906` cluster from cluster 2. So
even stage1+++ tunes preserve the same SGO targets.

These findings tell us:
1. 03L906018DN has at least 2 SGO bases (light vs heavy) within
   the SAME part number — the differentiator is SW number range
   (515xxx → heavy/0x06Axxx, 521xxx → light/0x07Cxxx)
2. The "protection ceiling" 2KB + 4×512B map structure is now
   confirmed across at least **5 distinct part numbers**:
   - 03L906022BQ sw398757 (wired)
   - 03L906022FG sw399349-503995 (wired)
   - 03L906022B Q5 sw500146-518746 (wired)
   - 03L906018DN sw515568-515569 (cluster 2 candidate)
   - 03L906018ES sw521078 (cluster 3 candidate)

**Bosch EDC17 C46 family-wide pattern** confirmed.

## Pairs #1015–1030 — Q5 03L906022B 4-SW cluster wired + 03L906018DN sister

**Strong wire confirmed and wired**: Audi Q5 2.0 TDI CR 125 kW with
03L906022B (2 MB EDC17 C46) — 4 SW versions sharing the SAME
"protection ceiling" structure as the wired 398757 / 03L906022FG defs:
- sw500146 (#1012) — anchor 0x1ED9DE (-0xA80)
- sw505968 (#1013) — anchor 0x1EE3DE (-0x80)
- sw516675 (#1014) — anchor 0x1EE45E (default)
- sw518746 (#1020) — anchor 0x1EE45E (IDENTICAL to sw516675)

**Wired** as `edc17_c46_03l906022b_q5` with 3 maps (Protection Ceiling
A/B/C at 0x1EE45E / 0x1EEEA2 / 0x1EEC80) — sister of 398757/FG defs.

This is the **3rd protection-ceiling-style def** in the codebase
(398757, 03L906022FG, now Q5 03L906022B) — strong evidence that this
is a Bosch EDC17 C46 family-wide pattern, not a per-VAG-part-no
quirk. Future wires can use this template for similar SGOs.

**Q5 03L906018DN cluster** (105 kW 03L906018DN) — 2 SWs share:
- sw511941 (#1018) — 5566B / 196 regions
- sw511942 (#1019) — 5544B / 191 regions
- 2 sequential SWs, similar pattern. Moderate-confidence cluster
  (not wired — different cal layout from 03L906022B).

Q5 03L906022B older 524 KB (#1006/1007/1008) and the 5-region 393KB
chiptool variants — same hardware, different dump format.

Q5 03L906022GE / 022Q / 022P / 022NH — single-pair part numbers,
no cluster identified.

Q5 03L906018DN sw515568 (#1016) and sw521635 (#1017) — different
SGOs (3649B vs 5830B) — same part number but different cal bases.

## Pairs #999–1014 — Q3 / Q5 2.0 TDI CR EDC17 C46 catalog

End of A8 batch (#990 V6 TDI 4D2907401A sw354602 — 524KB EDC15P).

**Audi Q3 2.0 TDI CR EDC17 C46** — NEW chassis catalog. Multiple
part numbers and a NEW dump format size:
- 03L906018CN — sw521078 (#995 2MB), sw522905 (#991 393KB)
- 03L906018CM — sw521662 (#992/#998), sw527083 (#993)
- 03L906018ES — sw521086 (#997), sw521662 (#994), sw521078 (#1000),
  sw521079 (#999), sw532853 (#1001)
- 03L906018PH — sw521086 (#996)

**NEW dump format size: 393 KB (393216 bytes)** seen in pairs
#991/#992/#993 — this is **3/8 MB**, smaller than the typical 524KB
chiptool dump and the 2MB standard. May be a cal-only extraction
that excludes some banks. Format detection needs:
- 393 KB → 3/8 MB Q3 partial dump
- 524 KB → 1/4 MB chiptool extraction
- 2 MB → standard cal+ASW
- 4 MB → full TC1797 ROM

**Q3 SW reuse**: same SW number 521662 appears for both 03L906018CM
(#992) AND 03L906018ES (#994) — but with different changed-byte
counts (4921B in 393KB vs 9949B in 2MB). So the same SW number
ships on multiple part-number suffixes — VAG cross-suffix sharing
within the Q3 family.

Same applies to sw521086 (PH and ES), sw521078 (CN and ES).

**Audi Q5 2.0 TDI CR EDC17 C46** — sister chassis to Q3:
- 03L906022Q sw500144 (#1003, 524 KB) — 3981B / 56 regions
- 03L906022GE sw501964 (#1004, 2 MB) — 10140B / 148 regions
- sw515518 (#1005, 2 MB) — **89.6% changed = full recal stage1+++**
  (1.88 MB modified)

**Q3 2.0 TFSI MED17** (#1002): 8U0907115C sw519058 — 155.2 kW,
752B / 25 regions tune.

A8 V6 TDI 0281010495 4D2907401A sw354602 (#990) — 8.3 KB tune,
524 KB EDC15P V6 TDI.

**Code: no new wires** — Q3 cluster has too many SGOs across
part-number suffixes; needs more pairs to identify a stable
fixedOffset cluster.

## Pairs #983–998 — A8 D4 4.2 V8 TDI 4H0907409 cluster wired

**Strong wire candidate confirmed and wired**: A8 D4 4.2 V8 TDI
EDC17 CP44 part **4H0907409** with SW 511925/514636/522804/522813.

Cluster details from full pair analysis:
- All SWs share `0x1DBE9C` 16B (8 cells u16 BE) IQ ceiling
  modification — raw 8648 → 27561 (+219%)
- All SWs share an `0x1A5DEx-0x1A6302` emission-disable cluster
  with 8 sub-regions all cleared to 0x32 (-99.9%)
- Offsets shift by ±0x80 between SW versions but cluster STRUCTURE
  is identical:
  - sw511925 → 0x1DBE98 (anchor -4)
  - sw514636 → 0x1DBE9C (anchor)
  - sw522804 → 0x1DC340 (anchor +0x4A8)
- Pair #985 (524 KB) and #986 (2 MB) both sw514636 share IDENTICAL
  4104-byte / 198-region modification pattern — confirms 524KB-vs-2MB
  same SGO data

**Wired** as `edc17_cp44_a8_42tdi_4h0907409` with 1 hero map (IQ
ceiling at 0x1DBE9C anchor, sw514636 default offset). Other maps
in cluster are mostly emission disable — not Stage 1 critical.

Other A8 4.2 V8 TDI variants (older/different):
- 4E1907409 sw383056 (#977) and 4E1907409A sw382247 (#978) — IDENTICAL
  3981B / 87 regions (524 KB chiptool). Across 4E1907409 and
  4E1907409A part suffixes. Wire candidate (older A8 D3 4.2 V8 TDI).
- 4E1907409A sw392905 (#975 + #980) — different pattern
- 4E1907409 sw377564 (#979) — 1860B / 100 regions

A8 4.2 V8 petrol (#974) sw393273 308.9 kW — S8 V8.

A8 6.0 W12 (#987) sw377855 331 kW — exotic. 1.5 KB / 25 regions tune.

A8 V6 TDI 0281010160 4D2907401 (#988-989) sw354334/354666 — older
A8 D2/D3 524KB EDC15P V6 TDI variant.

## Pairs #967–982 — A8 V8 TDI 3.3/4.0 + A8 4.2 V8 petrol catalog

**A8 D2 3.3 V8 TDI (rare engine, EDC15)** — wire candidate:
- Pair #962 4D0907409A 0281001867 sw351347 — 996 bytes / 35 regions
- Pair #963 4D0907409A 0281001867 sw351497 — 996 bytes / 35 regions
- **2 SWs IDENTICAL signature** (same byte count, same region count).
  Strong moderate-confidence cluster.

**A8 D3 4.0 V8 TDI (4E0907409B/C)** — wire candidate:
- Pair #964 4E0907409B sw368451 — 5045 bytes / 92 regions
- Pair #965 4E0907409B sw369539 — 2004 bytes / 171 regions
- Pair #966 4E0907409C sw374102 — 2004 bytes / 171 regions
- sw369539 + sw374102 share IDENTICAL byte/region count → 2 SWs
  same SGO across 4E0907409B and 4E0907409C suffixes. Strong cluster.

**A8 D3 3.0 V6 TDI 4E0907401x** continued (sister to A6/A7 batches):
- 4E0907401B sw372121 (#959) — 2 MB CP44
- 4E0907401S sw374414 (#960) — 524 KB chiptool
- 4E0907401D sw384618 (#961) — 524 KB chiptool

**A8 D3 4.2 V8 petrol** ME7.x:
- 0261207253 4D0907560BE sw369340 (#968 + #971 same SW two files
  identical 27 regions / 2103B) — 246 kW 4.2 V8 ME7.1.1
- 0261208147 4E0907560 sw368095 (#969 + #972 same SW two files
  16 vs 13 regions) — 246.4 kW newer
- 0261208147 4E0907560 sw393273 (#967) — same hw, different SW

**A8 D2 4.2 V8 1998 (early ME7.0)** — 131 KB ROMs:
- 4D0907557E sw355809 (#970) — 220 kW
- 4D0907558D sw357486 (#971) — 250 kW (S8 V8)

**A8 D4 3.0 V6 TDI 4G0907401E sw528341** (#958) — newer 528341 SW
not previously seen. 8.3 KB / 324 regions tune.

## Pairs #951–966 — A7 BiTDI tail + A8 D3 2.5 TDI + A8 D4 3.0 TDI

A7 BiTDI 4G0907589 cluster continues:
- sw524644 (#941) and sw526374 (#942) — both 150 regions, ~5.7 KB
  tunes, sister files of A6 #895 sw526374 and #902 sw524644.
- sw508390 (#946) 4F0907401E DPF — **1.45 MB changed (69%)** stage1+++
  full recal.

**A8 D3 (2002-2010) 2.5 V6 TDI EDC15V** — Bosch 0281001435,
0281001941, 0281010149 with VW part numbers 4D0907401A/J/K. All
**256 KB ROMs** pre-PD VR generation. Pair #952 (4D0907401J sw358608)
has small 743B tune; others have 3-4 KB tunes. Likely +0x8000 mirror
applies (256KB V6 TDI rule documented earlier).

**A8 D3 3.0 V6 TDI EDC17 CP44 4E0907401C/D** (524 KB chiptool):
- sw374427 (#953) — `0x` (top trimmed)
- sw375254 (#954) — sister of pair #779 (A6 sw375254)
- sw379813 (#955) — newer 4E0907401D variant

**A8 D4 (2010+) 3.0 V6 TDI CR** with 4G0907401 (same hw as A6 C7
and A7):
- Pair #956 sw518081 — **4 MB full ROM** (4194304 B) — full TC1797
  dump format, sister of A6 #910 4MB pair
- Pair #957 sw518081 — same SW but **2 MB extracted** — same SGO
  base, different dump format. **Confirms 4MB-vs-2MB dump format
  for 4G0907401** in addition to the EDC16/EDC17 524KB-vs-2MB
  +0x180000 pattern.

So Bosch EDC17 has at least THREE dump-format sizes for the same
ECU:
- **524 KB** chiptool extracted (just the cal block)
- **2 MB** standard cal+ASW (typical Stage 1 download)
- **4 MB** full TC1797 ROM (BSL/JTAG dump)

Each format places the cal at different absolute file offsets — the
loader needs to detect file size and apply the appropriate offset
shift.

## Pairs #935–950 — A7 3.0 V6 TDI 4G0907401 (sister of A6 C7)

A7 (Sportback fastback) shares the C7 platform with A6 facelift, so
the ECU is the same: **4G0907401** with SW versions **511968, 513666,
514662, 515579, 515581, 518146, 518151, 518172, 521649, 522832** —
ALL **same SWs** as A6 batch from prior pages.

So **A6 C7 and A7 share the SAME EDC17 ECU** with 4G0907401 part
number across the entire SW catalog. No separate wire needed for A7
— same def covers both.

Cross-reference confirmations from prior A6 batch:
- sw513666 (#928, #936) — also seen in earlier A6 batch
- sw515579 (#929, #934, #937) — 3 A7 pairs same SW + A6 #891 sw515579
- sw511968 (#930, #940) — same SW two model years
- sw515581 (#932) — "CLAB" engine code (CLA = 245hp 3.0 TDI)
- sw518146 4G0907401F (#935) — F suffix, **786 KB ROM** (768 KB
  chiptool partial dump format)
- sw518172 (#932 — wait that's 515581) — actually sw518172 in #932...
  let me re-check. #932 is sw515581. #931 is sw518172. OK.
- sw521649 (#941) — sister to A6 #892 sw521649
- sw522832 (#938 wait, that's sw518151) — pair #939 is sw522832

Pair #925-#926 still A6 V6 3.0 TDI 4F0907401A:
- sw372736 (#926) — 372736 NEW SW for 4F0907401A — `0x` (top regions
  trimmed in output)
- sw372123 (#927) — sister to pair #832 sw372123 (already noted as
  candidate cluster with sw372124)

**Code: no new wire** — the A7 4G cluster duplicates the A6 4G
documented pattern (two 16×16 maps Δ 0x244). Same recommendation:
needs signature-based detection, not fixedOffset, due to per-SW
cal-base shift.

## Pairs #919–934 — A6 tail: 4G0907589 BiTDI + 3.2 FSI + 4.2 V8 + early V6 TDI

End of A6 alphabetical batch. Mixed engine families:

**4G0907589 BiTDI 313ps newest** (#909) sw536208 — only **3 bytes
changed** (probably just file write timestamp / checksum noise) — NO
REAL TUNE. Should be filtered as no-op.

**4G0907401 sw532819** (#910) — file size **4 MB (4194304 B)** — full
TC1797 dump format (vs the typical 2 MB extracted cal). NEW dump
format size for A6 3.0 TDI 4G generation. May need separate handling
in writeMap (could be cal at +0x180000 or +0x300000 depending on
which bank is the active cal).

**4F0907401E DPF cluster** (#911-912) sw516623/516638 — emission
disable signature (`0x191xxx` blocks cleared) + cal mods at
`0x1D7xxx` and `0x1E0Fxx`. Confirms DPF disable is part of the std
4F0907401E tune for these SW.

**4G0907401 DPF cluster** (#913-914) sw518146/521649 — emission
disable + standard 4G mods. Same pattern as 4F0907401E.

**Pair #915 4F0907401C 4F0910402E sw384623** — sister to pair #782
(2.7 TDI sw384623) but with extra `4F0910402E` part suffix in
filename (transmission control unit cross-reference?). Cal at
`0x19C071 + 0x1EF469` — same as the 2.7 TDI 2 MB SGO. Cross-disp
SW reuse continues.

**3.2 FSI V6 187.6 kW pairs** (#916-918):
- 4F1907559D sw S6200P2000000 (#916) — **118 KB ROM** (118784 bytes)
  — partial chiptool dump. Bosch hardware — odd: A6 3.2 FSI was
  originally Siemens (5WP45007) but #916 has Bosch label. Likely
  mislabel.
- 0261125210 4F1907559 (#917) — 2 MB Bosch dump, 7 regions only.
- 5WP45007 4F1907559 (#918) — **2.625 MB** (2626048 B) Siemens dump
  — typical Siemens SIMOS partial format. Same SW S6280MA3.000 as
  #917. So same SGO base, two different dump formats (Bosch vs
  Siemens). NEW family `5WP45007` for A6 3.2 FSI V6 not in defs.

**A6 4.2 V8 ME7.x petrol** (#919-921):
- 4D0907558AD 0261207630 sw993339 (#919, 1 MB) — 220.6 kW (300hp)
  V8 — old A6 4.2L
- 4D0907558A 0261206016 sw359573 (#920, 524 KB) — 250.1 kW (S6/RS6
  4.2 V8)
- 4D0907558AD 0261207630 sw362912 (#921, 1 MB) — same hw as #919
  but different SW (993339 vs 362912). Same 26-region/2.2KB tune
  pattern → likely same SGO.

**A6 Allroad 2.7T BiTurbo** (#922) sw366367 — sister to #796
(prior batch) — same SW, very small 320B tune.

**A6 2.5 V6 TDI 1998 0281001772 4D0907401** (#923) — early Allroad/
A6 V6 TDI VR pre-EDC15V, 256 KB ROM. 110.3 kW.

**A6 V6 3.0 TDI 4F0907401B sw377101** (#924) — sister of pair #840
sw377101 (same SW different file). Different tuner mods.

## Pairs #903–918 — A6 3.0 V6 TDI 4G0907401 + 4G0907589 BiTDI 313ps 2012-2013

This batch covers the **2012-2013 A6 C7 facelift 3.0 V6 TDI** pairs:
- 4G0907401 SW versions: 518146, 521649, 521654, 522808, 522832,
  525505, 527031 ×2 (2012+2013 same SW different files), 532819
- 4G0907589 (new BiTDI 230.2 kW = 313 ps) SW versions: 522990, 524644,
  526374, 528336

**4G0907589 BiTDI 313 ps NEW HIGH-POWER VARIANT**: this is the
newer A6 BiTurbo 3.0 V6 TDI (313ps from 2012-on, replaces the
4F0907401E 240ps). 4 SW versions seen, all 2 MB EDC17.
- Pair #896 has **786 KB ROM size** — odd. Likely a chiptool partial
  dump (768 KB = 524 KB + 256 KB = could be cal+config block extract).

4G0907401 pairs continued (180 kW / 240 ps standard 3.0 TDI):
- sw527031 appears in BOTH 2012 (#899) and 2013 (#908) — same SW, two
  different files, different changed-byte counts (10726 vs 3273) →
  different tuners
- sw521649 appears in BOTH 2011 (#892) and 2013 (#906) — same SW two
  years, similar mods (~3.3 KB each)
- sw532819 appears in BOTH 2011 (#890) and 2013 (#904) — confirms
  sw532819 has been around for 2 model years

So same SW number persists across model years, with the 4G part-no
being stable. **No new wires** — too many variants, each with 1-2
pairs, to assemble a strong cluster.

Pair #893 ("Turbo-Benzin" mislabel — actually 3.0 TDI) sw521654 →
46 regions but no top-line details captured in trimmed output.

## Pairs #887–902 — A6 3.0 V6 TDI 8K1907401A cross-chassis + 4G/4L cluster

**8K1907401A sw516613 cross-chassis confirmation**: pair #882
(A6 3.0 V6 TDI) hits `0x1E4046 + 0x1E424E` — IDENTICAL to A5 3.0 V6
TDI 8K1907401A sw516613 (pairs #638/#646/#647/#650 prior batches).
**Same SGO covers BOTH A5 and A6 3.0 V6 TDI** — cross-chassis sharing
in 8K1907401A part number.

**8K1907401A sw516617 cross-chassis confirmation**: pair #888 (A6 3.0)
hits `0x1B8F04 + 0x1B8DB8` — IDENTICAL to A5 8K1907401A sw516617
(#641 / #829). Cross-chassis again.

So **8K1907401A** part number covers A5 + A6 3.0 V6 TDI with
identical SGO per SW. The 8K prefix doesn't restrict to A5 — same
ECU shipped on A5 AND A6 facelift.

**4G0907401 / 4L0907401 cross-prefix cluster** (newer 2010+):
- 4L0907401C sw513648 (#890) — `0x1C7074 + 0x1BE2CA`
- 4G0907401 sw515581 (#886, #889 same SW two files) — `0x1CA326 +
  0x1CA56A` OR `0x1BFFEC + 0x1B814A` (different tuners)
- 4G0907401 sw518172 (#885) — `0x1CC1BE + 0x1CC402`
- 4G0907401 sw521649 (#892) — `0x1BF94C + 0x1A6B32`
- 4G0907401 sw515579 (#891) — `0x16A838 + 0x16AA7C`
- 4G0907401 sw532819 (#889 here? no #890) — `0x1C1B7C + 0x1B9CDA`

Many 4G/4L pairs share the **two 16×16 maps Δ 0x244 apart** pattern
(boost target + IQ target). Offsets shift by SW. Could be a wire
candidate using signature anchors instead of fixedOffset.

**4F0907401E 2009-2011 (newer)** — too fragmented to wire:
- sw399807 (#878) — `0x1D666C + 0x1D6794`
- sw508391 (#880, #884 same SW two files) — different SGOs each time
- sw516623 (#879, #883, #887 — three pairs same SW) — `0x19175C`
  emission disable in 2 pairs; sw516623 (#879) has additional
  `0x1D7AEE + 0x1E0F38` real cal mods
- sw516624 (#881) — emission disable only

**Code: no new wires this batch — 4F0907401E too fragmented and
the 4G/4L cluster needs signature-based detection.**

## Pairs #871–886 — A6 3.0 V6 TDI 4F0907401C cluster expansion + 5-SW cluster

**MAJOR cluster expansion**: 4F0907401C 524KB 3.0 TDI now has 5 SW
versions sharing the `0x01C9A3 + 0x01CExx + 0x01D1xx` region:
- sw389133 (#849, prior batch) — 0x01CE7D + 0x01D115 (-63% limiter)
- sw391833 (#864 here) — 0x01CB1B + 0x01C9A3 (+111% IQ ceiling)
- sw391845 (#857 prior) — 0x01CE7D + 0x01D115 (-63%)
- sw395437 (#866 here) — 0x01C9A3 + 0x01CF91 (+78% / -63%)
- sw395438 (#850 prior) — 0x01CE7D + 0x01D115 (-63%)

So the cluster is forming 2 sub-groups based on which exact offset
each tuner targeted (0x01CE7D vs 0x01C9A3) but they're all in the
same 0x01C0xx-0x01D2xx region. **5-SW wire candidate** for 3.0 TDI.

Other 4F0907401C 3.0 TDI variants this batch:
- sw382452 (#862) — `0x0706F7 + 0x070CE5` — these are the SAME
  offsets as 2.7 TDI 4F0907401C cluster I wired! sw382452 falls
  in the SW range that overlaps 2.7 (380752-391860). Looking at
  filename — labeled "171.4KW" which is 230hp, that's 3.0 TDI not
  2.7 TDI (2.7 TDI is 132 kW). So **sw382452 IS 3.0 TDI but uses
  the 2.7-style SGO**. Cross-displacement SW number reuse.
- sw391833 (#864 + #868 — two files same SW) → DIFFERENT SGOs
  (one at 0x01CB1B, other at 0x05A8AF). 6th time I've seen
  same-SW-different-SGO pattern. Underscores SGO is determined by
  hardware AND tool/dump format, not SW alone.

**4F0907401E newer (2008+) cluster**:
- sw399336 (#867) — `0x1D646E + 0x1D6CB4` (Δ = 0x846 = 2118)
- sw516623 (#875, #877 — pair tools swapped ORI/Stage1!) — emission
  disable at 0x19175C / 0x19166A. The two pairs are actually each
  other's swap — alphabetical sort accident.
- sw516624 (#876) — `0x191856 + 0x19175C` emission only

**4G0907401 newer 2010+ (#869)** sw515241 — `0x15501E + 0x15636E`
(Δ = 0x1350 = 4944) — different cal location entirely (lower in
2 MB ROM). Newest VAG part-number prefix.

**4E0907401B 524KB (older)** (#872, #873):
- sw372202 → `0x0523A8 + 0x071B97`
- sw372488 → `0x0523A8 + 0x06C2B3` — **2 SWs share `0x0523A8`**
  (same 14B +164% region — IQ scaling)

**Code: 5-SW 3.0 TDI cluster identified but offset variation
(0x01CE7D vs 0x01C9A3 vs 0x01CB1B) within ±0xC means we'd need a
tolerance-based fixedOffset, which our current schema doesn't
support. Would need to wire as 2 separate defs (one per dominant
offset) or extend the schema.**

## Pairs #855–870 — A6 3.0 V6 TDI 4F0907401C 524KB cluster (3 SWs share limiter)

This batch is **mostly more A6 3.0 V6 TDI 4F0907401C 524KB pairs**.

**KEY FINDING — 4F0907401C is shared hardware** between A6 2.7 AND
3.0 V6 TDI. Just-wired `edc17_cp44_a6_27tdi_4f0907401c` def had bare
`'4F0907401C'` as identString which would FALSE-MATCH 3.0 TDI files
(sw 379471/380431/381388/389133/391845/395438 etc with different SGOs).
**Fixed in this commit** — removed bare part number, kept only the
7 specific 2.7-TDI SWs in identStrings.

**3.0 V6 TDI 4F0907401C 524KB sub-cluster** (3 SWs share limiter):
- sw389133 (#849), sw391845 (#857), sw395438 (#850) — ALL share
  `0x01CE7D + 0x01D115` 11-byte regions both at -63% (limiter drop).
  3-SW cluster, identical treatment.
- sw381388 (#844 prior) and sw384624 (#857 here) → both `0x052F08
  38B + 0x01D455 11B` cluster — **2 SWs same SGO** (hadn't noticed
  this in prior batch — 0x052F08 -99% LE / +72% BE)
- sw380431 0281012 (#851) — `0x01C59D + 0x06F8C1` (Δ ≈ 0x53324)
- sw381389 0281012649 (#861) — `0x02113F + 0x0213D7` paired
- sw381392 (#838 prior) — `0x016373 + 0x020CD7`

**3.0 V6 TDI 4F0907401C 2 MB**:
- sw381388 (#855, this batch — same SW as 524KB pair #844!) →
  `0x19C071 + 0x1EF469` — different SGO from the 524KB version!
  Same SW, two different SGO/dump-format combinations. The 524KB
  has cal at `0x052F08`; the 2MB has cal at `0x19C071`. Δ does NOT
  match the +0x180000 we expected — this is genuinely different
  cal data, not just relocated.
- sw383872 (#856) — `0x1EF9C9 + 0x1F085F`
- sw381388 (#855) and sw384623 (#782 prior) — share `0x19C071 +
  0x1EF469` exactly. Wait — sw384623 was in the 2.7 TDI batch.
  So **2 different SWs (sw381388 3.0 TDI + sw384623 2.7 TDI)
  share the same 2MB SGO**. Cross-displacement SGO match in 2MB form.

3.0 V6 TDI 4F0907401B 524KB pairs:
- sw374415 (#853) — `0x052B90 + 0x070B9F`
- sw377324 (#854) and 0281011269 sw379480 (#860) — share `0x05A3B7`
  primary IQ. **2 SWs same SGO**.
- sw379479 (#847) — `0x020F59 + 0x052CAC` (Δ = 0x31D53, sister
  cluster to sw374415's 0x052B90 region — small offset diff)

3.0 V6 TDI 8E0907401AJ sw374489 (#859) — `0x05AFD1 + 0x071D5F`

3.0 V6 TDI 4E0907401S sw377109 (#846) — `0x06BB0F + 0x06BBAF` close
pair, only +29-32% (mild tune). Different part-number prefix `4E`.

3.0 V6 TDI 0281013175 4F0907401B sw377324 2MB (#852) — `0x007FC0
12B + 0x19BA59 15B` — checksum patch + cal mod, 2 MB form.

**Code: refined wired 4F0907401C def to be 2.7-TDI-only (removed
bare part number from identStrings).**

## Pairs #839–854 — A6 3.0 V6 TDI EDC17 CP44 4F0907401A/B/C catalog

Now into the **A6 3.0 V6 TDI EDC17 CP44** cluster — 2004-2007 165-180kW
(225-240ps). Bosch part numbers 4F0907401A/B/C with SW versions
372123-389135 (524KB chiptool) plus a few 2MB pairs.

**4F0907401A SGO clusters** (oldest, 224ps standard):
- sw372123 (#832) and sw372124 (#841) — IDENTICAL offsets
  `0x0527FA + 0x071BBD`. **2 SWs same SGO** — moderate-confidence
  wire candidate.
- sw372486 (#838, 2 MB form) — `0x1F886D + 0x1C2091 8×3` (the 2 MB
  version of same 4F0907401A — verify if +0x180000 shift applies)

**4F0907401B SGO clusters** (165ps standard):
- sw374415 (#843, 2 MB) — `0x1BFF6A + 0x1FDF6A` (Δ = 0x3E000 — note
  this is unique, NEW mirror offset 248 KB? or just two cal blocks)
- sw374416 (#839, 524 KB) — `0x06C467 + 0x05471B 12×6`
- sw376568 (#832 sister) — `0x015A9B + 0x02073D`
- sw376995 (#834) — `0x020921 + 0x071381`
- sw377101 (#840) and sw377103 (#835) — both share `0x0714E9` (the
  primary IQ ceiling at +78%). Sister SWs.
- 4F0907401B older versions are very fragmented across 5 SGO sub-
  clusters.

**4F0907401C SGO clusters** (180ps performance):
- sw381388 (#844) — `0x052F08 + 0x01D455`
- sw381392 (#838) — `0x016373 + 0x020CD7`
- sw389135 (#833) — `0x01C88F + 0x01D3AD`

**8E0907401x older variants** (pre-4F0907401):
- 8E0907401AB sw375569 (#831) — `0x0712CF + 0x07189D` (close pair)
- 8E0907401AJ sw376009 (#836) — `0x06C5B9 + 0x072619`
- 8E0907401AL sw382683 (#843) — `0x011548 + 0x01155C` (paired)

Pair #830 4F0907401E sw516640 — DUPE of #823 (identical content,
just appears alphabetically again). Confirms emission-only fingerprint.

**Code: no new wires** — 4F0907401A 2-SW cluster is wire-able but
weaker than the 4F0907401C 7-SW cluster I just wired. Will revisit
if more 4F0907401A pairs appear later in the alphabetical sort.

## Pairs #823–838 — A6 2.7 V6 TDI EDC17 CP44 4F0907401C cluster wired

This batch confirms the **4F0907401C 7-SW cluster** wired in this
commit. Pairs in batch:
- #815 sw374421 4F0907401B — `0x07206F + 0x0721E7` (different cluster)
- #816 sw383851 0281013324 — `0x070B5D + 0x070955` (sister to wired)
- #817 sw390127 — `0x06FC2D + 0x06FC05` (anchor for wired def)
- #818 sw390142 — `0x070E27 + 0x070D2B` (close to wired but offset)
- #819 sw389214 — `0x069AD1 + 0x069B49` (separate sub-cluster)
- #820 8E0907401AL sw382699 — `0x0708FD + 0x070BBF` (different part num
  but similar region — confirms 8E and 4F prefixes share base)

**4F0907401E (newer 2009-2011, 2 MB)** sub-clusters seen:
- sw505987 (#821) — `0x1E1048 + 0x1D7352`
- sw508355 (#822) — `0x1D7906 + 0x1E5172 16×16`
- sw508391 (#824) — `0x1D7050 + 0x1D703C` (close pair)
- sw516638 4F7910401L (#826) — `0x1E1C56 + 0x1E1D8A` (close pair)
- sw516640 (#823, #827 — same SW twice) — `0x191866 + 0x19175C`
  emission-disable only, no major maps in top hits
- sw516642 (#825) — `0x1DD04C + 0x02BCB2`
- sw516642 (#828) — `0x19B96A + 0x19BE5C` (same SW different SGO!)

So **4F0907401E** is too fragmented (5+ sub-clusters across 4-7 SWs)
— NOT wired this round. Need more pairs to anchor each sub-cluster.

8K1907401A sw516617 (#829) appears here in A6 2.7 TDI context — but
sw516617 was previously catalogued for A5 3.0 TDI (#641). So 8K1907401A
sw516617 is a **dual-displacement SW** (A5 3.0 AND A6 2.7) — same SGO
likely covers both since they share Bosch hardware. Cluster at
`0x1B8F02 / 0x1B9436`.

**Wired** `edc17_cp44_a6_27tdi_4f0907401c` — covers 7 SW versions
(380752/380756/380785/382074/383851/390127/391860) with 3 maps:
IQ ceiling, main IQ map, limiter drop.

## Pairs #807–822 — A6 2.7 V6 TDI EDC17 CP44 + EDC17 +0x180000 dump format

**EDC17 CP44 524KB-vs-2MB dump format CONFIRMED at +0x180000** (same
shift as EDC16 PD documented earlier):
- Pair #798 0281013178 4F0907401B sw377322 (524 KB) — cal at
  `0x0704E1 + 0x01C817`
- Pair #803 4F0907401B sw377322 (2 MB) — cal at `0x1F04E1 + 0x19C817`
- Δ = exactly 0x180000 (1.5 MB) for both regions

So Bosch EDC16 PD AND EDC17 CP44 BOTH use the 524KB→2MB +0x180000
dump-format shift. Likely a common BSL/chiptool extraction format.

**4F0907401B SW cluster** (2 MB EDC17 CP44):
- sw377322 (#798/#803) — `0x1F04E1 + 0x19C817` (or 0x0704E1+0x01C817 in 524KB)
- sw377107 (#799) — `0x1F04DD + 0x1F187D` (sister to 377322 within ~4B)
- sw376966 (#800) — `0x1F0399 + 0x19B755` (slightly shifted but similar
  region — older sub-revision)

So 4F0907401B 376966 / 377107 / 377322 are **3 SWs in same SGO
cluster** at high-region 0x1F04xx. **Wire candidate**.

**4F0907401C SW cluster** (524 KB EDC17 CP44 chiptool):
- sw380752 (#804) and sw380756 (#805) — IDENTICAL offsets `0x078F47
  + 0x05A7AB`. **2 SWs same SGO**. Wire candidate.
- sw380785 (#810) — `0x070681 + 0x05A7B3` (Δ from sw380752/756 = 4-8 B,
  sister cluster — same SGO with tiny rev shift)
- sw382074 (#812) — `0x021A75 + 0x07067D` (`0x07067D` matches 380785's
  `0x070681` within 4 B; same cluster)
- sw380777 (#809) — DIFFERENT cluster `0x017095 + 0x012CBF` (12×5 map)
- sw380779 (#806) — `0x023939 + 0x023BD1` paired 9-byte (Δ = 0x298)
- sw382460 (#813) — `0x016B81 + 0x05B43D` (Δ = 0x448BC, non-mirror)
- sw382064 (#811) — `0x069F8B + 0x069F13` paired 15-byte (Δ = 0x78)

So **4F0907401C** has at least **3 distinct SGO sub-clusters** by SW:
- "early" (380752/380756/380785/382074) — `0x07xxxx + 0x05Axxxx`
- "mid" (380779) — `0x023xxx`
- "late" (382460) — `0x016xxx + 0x05Bxxx`

**4F0907401D**: pair #807 sw377323 (262 KB chiptool) — `0x031419 +
0x031885` — sister of 4F0907401B sw377104 (#802 262KB) which shares
`0x0317CB + 0x031943`. So 4F0907401B and D share half-dump format.

Pair #808 0281012561 4F0907402D sw377323 (524 KB) — `0x05A15F +
0x01516F`. Note part **4F0907402D** (with D suffix on 402, not 401)
— this is a different ECU position. Cal layout matches 4F0907401C
sw380752 cluster shape (0x05A1xx near 0x05A7xx).

**Code: WIRE candidate** edc17_cp44_4f0907401b_376_377 covering
sw 376966/377107/377322 — 3-SW cluster at 0x1F04E1 + 0x19C817 (in
2MB form) or 0x0704E1 + 0x01C817 (in 524KB form). Also wire
edc17_cp44_4f0907401c_380752_756 (2 SWs at 0x078F47 + 0x05A7AB)
for 524KB chiptool variants.

## Pairs #791–806 — A6 2.7 Bi-Turbo ME7.x catalog + more EDC15 mirrors

A6 2.7 Bi-Turbo (V6 petrol biturbo Allroad 2.7T 250-280hp) ME7.x —
9 pairs, very wide variant catalog with hardware codes spanning
0261206106/206380/206562/206636/206637/206641/207137/207456/207766
and VW part numbers 4B0907551 [D/G/L/M/N] / 4Z7907551 [C/D/L/N].

Universal pattern across almost all 2.7T pairs: a `64-byte region at
~0x019xxx with raw 23902 → 65535 (+174% / +312% LE)`. This appears
verbatim in pairs #789, #790, #791, #792, #794, #796 at slightly
shifted addresses (`0x019907`, `0x019793`, `0x0196B3`, `0x01999B` ×2,
`0x01A0CB`). It's the same map across SW versions — likely the IS
boost-target / VTG ceiling raised to max for 2.7T tuning. **Wire
candidate** for a generic ME7 2.7T signature once we have signatures
to anchor it (offsets vary by SW so signatures rather than fixedOffset).

Two more mirror confirmations:
- Pair #786 0281010822 4B2907401J sw366611 (524 KB) → `0x05DED2
  + 0x06DED2` (Δ = 0x10000 = 64 KB) — **+0x10000 mirror in 0281010822**
- Pair #787 0281010153 4B0907401T sw352631 (256 KB) → `0x0053B8 +
  0x00D3B8` (Δ = 0x8000) — +0x8000 mirror confirmed in 0281010153

A6 2.5 V6 TDI EDC17 CP44 (newer):
- Pair #782 4F0907401C sw384623 (2 MB CP44) → `0x19C071 + 0x1EF469`
  (Δ = 0x533F8 — non-mirror, two related cal regions)
- Pair #783 4F0907401C sw391833 (2 MB CP44) → `0x1FDF20 + 0x1E9A23`
- Pair #784 0281011136 8E0907401P sw367102 (1 MB EDC15P+) — `0x0FF050
  + 0x0FF020` checksum region near end of ROM (NOT a mirror, Δ=0x30)
- Pair #797 4F0907401C sw391860 (524 KB CP44 chiptool) — `0x06FC85 +
  0x06FC5D` paired 9-byte cal blocks (same map twice in close
  proximity — Bosch CRC pre-padding)

Pair #785 0281010897 4Z7907401B sw366613 → `0x07FF5A + 0x05749C` —
different cluster, no obvious mirror.

**Code: no new wires this batch — all clusters too small or already
documented.**

## Pairs #775–790 — A6 2.5 V6 TDI 256KB +0x8000 mirror generalized + EDC17 CP44 4F/4E

**+0x8000 mirror generalizes** to all 256 KB EDC15 V6 TDI 2.5L ROMs
beyond just 0281001781/1931 — also confirmed for:
- 0281010496 (#768, #770) — `0x0047D4 + 0x00C7D4`
- 0281001774 8D0907401A (#771) — `0x005066 + 0x00D066`
- 0281001834 8D0907401H (#772) — `0x0042FE + 0x00C2FE`

Generalized rule: **all 256 KB EDC15 V6 TDI 2.5L ROMs use +0x8000
mirror** regardless of hardware code (pre-PD vs PD doesn't matter
in this displacement family).

Pair #773 0281001836 4B0907401C sw351068 → `0x03C462 + 0x03C44E`
(NOT a mirror, two related cal entries Δ=0x14). Same hardware as
prior pairs #743/#746 — confirms 0281001836 family is in the
+0x38000 mirror group, not +0x8000.

A6 V6 TDI EDC17 CP44 NEW pairs:
- Pair #777 4F0907401C sw383851 (524 KB CP44 chiptool) — `0x07085F
  + 0x0708EB` cluster, 15B regions at +143%/+123%
- Pair #779 4E0907401C sw375254 (2 MB CP44) — `0x1FDF20` 16B -88%
  + `0x1F1C07` 9B -67%
- Pair #780 4F0907401B sw375256 (2 MB CP44) — `0x1F0BC7 + 0x1F0E7B`
  cluster
- Pair #781 4F0907401B sw379479 (524 KB chiptool half-dump) — yet
  another tool format
- Pair #778 4E0907401B sw371075 (524 KB chiptool) — `0x04FB04 +
  0x05772F` (sister to pair #673 same SW)

Pair #769 0281011387 8E0907401J sw367775 (1 MB EDC15P+) — sister to
pair #754 same SW (different tuner file, much heavier 22 KB
modification). Cal at `0x01211E + 0x02211C` (Δ ≈ 0x10000) — confirms
+0x10000 mirror for 0281011387.

Pair #775 0281010395 sw354333 (524 KB, different file from #753
same SW) — DIFFERENT cluster `0x04CF0E + 0x06CF0E` (Δ = 0x20000 =
**+0x20000 mirror inside a 524 KB EDC15P ROM**). So 0281010395 sw
354333 ALSO uses the +0x20000 mirror — joins the EDC15P+ family.
Same SW as pair #753 had different tuner mods at different offsets,
but the underlying mirror offset is consistent (+0x20000 for this
hardware).

Pair #774 0281010095 4B1907401A sw354255 — different file from #758
same SW. Cal at `0x06CF0E + 0x077304` — also `+0x20000`-style mirror
(0x06CF0E + 0x10000 = 0x07CF0E, near-but-not-exact 0x077304).

**No new wires this batch — all clusters already documented; main
contribution is generalizing +0x8000 mirror rule to all 256 KB V6
TDI ROMs.**

## Pairs #759–774 — A6 2.5 V6 TDI EDC15P/P+ catalog + NEW +0x10000 mirror

This batch is **dominated by A6 2.5 V6 TDI EDC15P / EDC15P+ pairs**
(0281010xxx 524KB and 0281011xxx 1MB Allroad/A6/A4 generations).

**NEW EDC15 MIRROR PATTERN: +0x10000 (64 KB)** — confirmed across
6 V6 TDI 2.5L pairs:
- Pair #751 0281010098 sw350321 (524 KB) — `0x04CF22 + 0x05CF22`
  (Δ = 0x10000) — same 20B -74% mod
- Pair #754 0281011387 sw367927 (1 MB) — `0x00ADA8 + 0x01ADA8`
  (Δ = 0x10000) — same 13B +192% mod
- Pair #760 0281010393 sw360718 (524 KB) — `0x057302 + 0x067302`
  (Δ = 0x10000) — same 15B +106% mod
- Pair #761 0281011388 sw367776 (1 MB) — `0x00ADA8 + 0x01ADA8`
  (+0x10000 mirror)
- Pair #762 0281011388 sw369442 (1 MB) — SAME OFFSETS — 2 SWs
  same SGO

**Master EDC15 mirror table (5 distinct offsets identified)**:

| Mirror Δ | Hardware codes | ROM size |
|---|---|---|
| **+0x8000** (32 KB) | 0281001781, 0281001931 | 256 KB EDC15V V6 |
| **+0x10000** (64 KB) | 0281010098, 0281010393, 0281011387, 0281011388 | 524 KB / 1 MB V6 |
| **+0x18000** (96 KB) | 0281010xxx generic I4 (e.g. 0281010203/204) | 524 KB EDC15P |
| **+0x20000** (128 KB) | 0281010492 (1MB), 0281011213 (524KB) | A2/A3/A4 EDC15P+ |
| **+0x38000** (224 KB) | 0281001609/1808/1836 (256KB), 0281010148 (524KB) | I4 1.9 TDI EDC15V/P |

Mirror selection requires **per-hardware-code lookup table** in the
writeMap path — file size alone is insufficient (e.g. 524 KB ROMs
have at least 4 different mirror offsets depending on hardware code).

Other findings:
- Pair #753 0281010395 sw354333 (524KB) and pair #752 0281010394
  sw354332 — IDENTICAL offsets `0x04CF2E + 0x056DB2`. 2 SWs across
  hw codes 0281010394/395 share SGO. **Wire candidate.**
- Pair #757 0281001321 4A0907401P sw355498 — 65 KB ROM A6 2.5 TDI
  103 kW (oddly small)
- Pair #758 0281010095 4B1907401A sw354255 — 524 KB EDC15P, no
  visible mirror (cal in upper region, mirror would be off-end)
- Pairs #755-756 / #762-764 — A6 2.5 TDI 0281001271/0281001254/
  0281001256 — **65 KB ROMs** with cal at `0x007xxx`. These are
  the very-early "EDC1.4" generation Bosch ECUs from 1996-1998
  (predates EDC15V proper). 12×4/12×5 maps in the only changed
  region — primary IQ/boost.

## Pairs #743–758 — A6 2.5 V6 TDI EDC15V + NEW +0x8000 mirror pattern

This batch is **mostly A6 2.5 V6 TDI EDC15V** (Allroad / A6 wagon
1998-2003) — Bosch hardware codes 0281001781, 0281001836, 0281001837,
0281001931 (256 KB pre-PD) and 0281010xxx (524 KB PD).

**NEW EDC15V MIRROR PATTERN — +0x8000 (32 KB)**:
- Pair #744 0281001781 4B0907401F sw358057 → regions at `0x0042AC`
  AND `0x00C2AC` (Δ = `0x8000`) get the SAME 8-byte +147% mod
- Pair #745 0281001781 4B0907401H sw351095 → SAME offsets, same mod
- Pair #748 0281001931 4B0907401K sw356789 → regions at `0x00449A`
  AND `0x00C49A` (Δ = `0x8000`) — confirmed pattern across hw 1781
  and 1931

So the EDC15V family now has TWO sub-mirror offsets:
- **+0x8000** for V6 TDI 2.5L hardware codes 0281001781 / 0281001931
- **+0x38000** for I4 1.9 TDI hardware codes 0281001609 / 0281001808 /
  0281001836 (pair #743 here at hw 0281001836 has Δ region but not
  the +0x8000 mirror)

Mirror offset is determined by **hardware code (Bosch part number)**,
NOT by displacement or vehicle. Will need a per-hardware-code lookup
table in the writeMap path.

Other findings:
- Pair #743 0281001836 4B0907401C sw359971 (256 KB EDC15V V6) — has
  `0x03C68C + 0x03C462` — NOT mirrored (Δ = 0x22A), so same family
  hw 0281001836 as #746 (V6 TDI 2.5L) but NO +0x8000 mirror — this
  one uses the +0x38000 layout.
- Pairs #746 0281001836 4B0907401C sw359971 (DUPLICATE filename
  same SW as #743) → `0x03C7FC + 0x03C824` (different cluster) —
  conflicting modifications by different tuners on same SW
- Pair #747 0281001837 4B0907401D sw359394 → SAME offsets as #746
  (`0x03C7FC + 0x03C824`) — so 0281001836 and 0281001837 share SGO
  layout (sister hardware codes)
- Pair #749 0281010148 4B0907401S sw352644 (524 KB PD) → `0x005328 +
  0x03D328` (Δ = `0x38000`) — confirms +0x38000 mirror also exists
  in 524 KB EDC15P PD when hardware is 0281010148. This breaks my
  earlier rule "524KB EDC15P → +0x18000" — apparently the 0281010148
  variant uses +0x38000. **Mirror selection rule needs more nuance.**

A6 2.4 V6 30V Bosch ME7.x petrol (#736-741):
- Bosch 0261204767 sw354782/357978/358180 (3 SWs same SGO) → all
  share `0x009001 + 0x009012` — wire candidate for 4B0907552C
  early-ME7 V6 petrol cluster
- Bosch 0261207506 sw362351 (#740) and 0261207500 sw362353 (#741)
  → both 1 MB ME7 dumps, both modify `0x086F8C` (16B) and small
  +5-9% maps — same hardware family

Pair #734 8K2907115L MED17 sw517860 (A6 2.0 TFSI 132 kW) →
`0x06B184 + 0x06B168` 8B at +247%/+125% — yet another MED17 SGO
not previously seen. NOT the universal unlock pattern.

Pair #735 4F0907552F Siemens S6300FT000000 (A6 2.4 V6 FSI 130kW) →
SIEMENS family (not Bosch) — `0x053B52 + 0x053B9A` 56B regions both
+90% (looks like a stage1 dual-axis tweak). NEW Siemens family for
A6 2.4 FSI not in our defs.

## Pairs #727–742 — EDC16 PD 2MB-vs-524KB dump format + A6 TFSI MED17 cluster

**MAJOR finding — EDC16 PD 2MB vs 524KB dump format**:
Pair #719 03G906016BF sw382716 (2 MB dump) shows offsets `0x1D1E5F`
and `0x1DF8FF`. Pair #685 03G906016BF sw382716 (524 KB dump, same
SW) shows offsets `0x051E5F` and `0x05F8FF`. **Δ = exactly 0x180000
(1.5 MB)**. So the 2 MB dump format relocates the cal block by 1.5 MB
relative to the 524 KB extracted format — same data, different
absolute offsets.

**Code action**: writeMap path needs to detect dump format (file size)
and apply the 0x180000 offset shift when reading 2 MB EDC16 PD dumps.
Already added a comment on the wired def; full wiring needed.

**0281011850 03G906016BF cluster expanded to 3 SWs**:
- 380199 (#684) — 0x051E5F + 0x05F8FF
- 382716 (#685, #719) — same offsets (524 KB) and `0x1D1E5F + 0x1DF8FF`
  (2 MB) confirming the dump-format relationship
- 399833 (#726) — `0x051E5F + 0x05FA05` — same primary, second offset
  shifted by 0x106 (likely small SW version bump moved the boost map
  16 cells over). **Added to identStrings**.

**A6 2.0 TFSI 4F2907115 MED17 cluster (NEW, 4 SWs)**:
- sw381604 (#729) → `0x1CE2D8 + 0x1CEEF4`
- sw386852 (#731) → `0x1CE2D8 + 0x1CEEF4` — **EXACT same offsets as
  sw381604**. 2 SWs same SGO confirmed.
- sw377676 (#730) → `0x1CD86E + 0x1CDEE8` — close to sw381604's
  region (Δ ≈ 0xA6A) but slightly shifted; pre-381604 SGO base
- sw386852 (#732, different file same SW) → DIFFERENT cluster
  `0x1E5D60 + 0x1CBB70`. So sw386852 has TWO SGO variants
  (4th time same-SW-different-SGO pattern observed)

Note: this MED17 cluster's high % values (`+517%/+427%`) and 120-byte
region size match the **universal MED17 unlock signature** I noted in
the A5 batches — these are NOT real tuning maps but consistent
emission-monitor disable across MED17 family.

**A6 2.0 TDI EDC16 PD older variants (524 KB) — 03G906016 [BF/MF/MG/GB/GC/HS/JD]**:
- sw389285 03G906016GC + sw389286 03G906016MF + sw389203 03G906016MG
  ALL share `0x058E33 + 0x06C95B` — **3 part-suffixes share SGO** —
  another candidate cluster.
- sw383797 03G906016GC (#723) and sw391830 03G906016MF (#727) share
  `0x06C417 + 0x06C34F` (close offsets, 9B regions, +338%/+125%)
- sw391835 03G906016GB (#722) → `0x0431E3 + 0x06C437` (sister to
  sw381604 #688 prior batch — same offsets — 2 SW versions same SGO)
- sw393547 03G906016HS (#724) → `0x055BF8 + 0x06C437` (large 72B at
  +461%, joins the 0x06C437 family with #722)
- sw378329 0281012557 03G906016HS (#728) → `0x05843D + 0x0684D6` —
  unique cluster
- sw378340 0281012654 03G906016JD (#729 wait — that's the TFSI;
  let me re-check #729) — `0x05684F + 0x056D3B` — unique cluster

Pair #717 03L906018JL sw521690 → `0x07D3FE 510B + 0x07D1CC 16×16` —
joins the **522xxx cluster** (sw 522909/910/917/918/922/924/943).
So the 522xxx-style cluster also covers sw521690 → cluster grows
to 8 SWs in that cluster too.

## Pairs #711–726 — A6 2.0 TDI 03L906018JL cluster expansion (10+ SWs)

This batch is **dominated by 03L906018JL pre-522xxx cluster**. Combined
with prior batches, the cluster at `0x060DE2 + 0x07209C` / `0x066760`
now spans **at least 10 SW versions**:
- 518064, 518117, 519311, 519315 (×3 dupes), 519316 (×2), 519318,
  521020, 521021, 522923, 524103

This is the **largest single SGO cluster identified yet** — 10+ SWs,
all 03L906018JL 119.9-130.2 kW A6 2.0 TDI CR 2010-2013. **Very high
confidence wire candidate**. Common modifications:
- `0x060DE2` 22 B (~11 cells u16 BE) at +44-46% — a small ceiling
  table near the cal start
- `0x07209C` 18 B at +25%
- `0x072258` 18 B at +25%
- `0x066760 / 0x066E18 / 0x0671F8` 362 B at +22-24% — bigger map
  (e.g. 16×11 u16 = 352 B + padding)

Other clusters seen in this batch:
- 03L906018GT sw519317 (#702) — DIFFERENT cluster `0x07C3B6 510B +
  0x07C184 16×16`. So `03L906018GT` is a separate part-number
  variant from 018JL, with its own SGO base.
- 03L906018JL sw515539 (#705) — `0x07BAF6 16×4 + 0x07BC38 16×16` —
  DIFFERENT cluster (matches 018GT shape, not the 060DE2 cluster).
  So sw515539 is on the 018GT-style SGO despite 018JL part number.
- 03L906018JL sw522917 / sw522918 (#714, #717) — `0x07D3FE 510B +
  0x07D1CC 16×16` — joins the 522xxx cluster (522909/922/924/etc).
- 03L906018JL sw524664 (#711) — `0x03D7B2 6B + 0x03D82E 60B` cluster
  (just emission-disable region, no major maps in top hits) — small
  tune.
- 03L906022FG sw506127 / sw506149 (#703, #704, #706) — `0x1DA624
  12×15 + 0x1DCC8C 12×16` cluster (the 506xxx cluster, separate from
  399xxx-503xxx wired def). 506127 appears TWICE (2010 + 2011 file),
  same offsets and treatment.

**03L906018JL master SGO map** (across all batches now):
| Cluster | Cal offsets | SWs covered |
|---|---|---|
| pre-522xxx | `0x060DE2 / 0x07209C` | 518064, 518117, 519311, 519315×3, 519316×2, 519318, 521020, 521021, 522923, 524103 |
| 522xxx | `0x07D3FE / 0x07D1CC` | 522909, 522910, 522917, 522918, 522922, 522924, 522943 (transitional) |
| 524664 | `0x03D7B2 / 0x03D82E` | 524664 — emission-only tune |
| 515539 | `0x07BAF6 / 0x07BC38` | 515539 (joins 018GT family) |

**Code: WIRE candidate `edc17_c46_03l906018jl_060de2_cluster`**
covering 11 SW versions with 4 maps. Probably the highest-impact
single ECU def we could add — covers a HUGE portion of A4/A6 2.0
TDI CR 2010-2013 2.0 TDI 120-140ps tunes.

## Pairs #695–710 — A6 2.0 TDI 03L906022FG cluster + EDC16 PD 03G906016GB

**MAJOR cluster**: 5 paired files all at `03L906022FG` 100 kW with
SW versions 399349, 399350, 500141 (×2), 503995 ALL share IDENTICAL
big-region offsets at:
- `0x1EE306` 2048B (1024 cells, +302%)
- `0x1EED4A` 512B (256 cells, +298%)

This is the **same protection-ceiling structure as 398757** but at
different offsets. WIRED as new ECU def `edc17_c46_03l906022fg` —
covers all 4 SW versions with shared maps.

Pair #696 sw506148 03L906022FG falls into the LATER 506xxx cluster
(`0x1DA624 + 0x1DCC8C`) — different SGO from the 399xxx-503xxx group.
This is the same 506xxx cluster I documented for the Allroad #527
and A6 #677.

Pair #697 0281016147 03L906022FG sw500141 (same SW as #694 but with
0281016147 hardware code prefix) hits DIFFERENT cal at `0x1F7B28 510B
+ 0x1C44A8 44B` — same SW + different hardware = different SGO. Yet
another reminder that hardware code matters.

Pair #698-699 03L906018JL sw518064 + sw519315 (130 kW) — both share
`0x060DE2 22B + 0x066760 362B` = the pre-522xxx cluster I catalogued
in batch #567-582 (519311/521020/521021). Cluster grows to **5 SWs**:
518064, 519311, 519315, 521020, 521021. Strong cluster.

Pair #700 0281016679 `03L90619AF` (typo: 03L906019AF) sw505406 — just
the universal emission-disable pattern at 0x1C4xxx, no major cal mods
visible in top regions.

**A6 2.0 TDI EDC16 PD continued**:
- 03G906016GB sw383724 (#686) and sw391835 (#688) BOTH 2 MB dump
  format → both share `0x1C34C5 + 0x1C361B` (7-cell pairs +195%).
  **2 SWs same SGO** — wire candidate `edc16_pd_03g906016gb_383_391`.
  Note the offset 0x1C3xxx is at the high end of the 2MB dump = file
  bottom-half; if the user opens the 524 KB extracted version it'd
  be at 0x434C5 / 0x4361B (subtract 0x180000 = 1.5 MB).
- 03G906016GC sw391846 (#687) — different cal at `0x1ECA23 + 0x1D8E0D`
- 03G906016GC sw389285 (#680 prior batch) — `0x058E33` low region
- 03G906016MG sw393553 (#691) — `0x1D8E35 + 0x1D9D24` cluster
- 03G906016BF sw382716 (#689 524KB version) — `0x05F8DB + 0x05FAAB` —
  small offset diff from my just-wired 0281011850 def offsets
  (0x05F8FF / 0x051E5F). Different file format extraction.

**Code: WIRED edc17_c46_03l906022fg ECU def with both maps —
covers 5 SW versions in one shot.**

## Pairs #679–694 — A6 1.9 TDI EDC15P+ +0x20000 mirror RE-CONFIRMED + A6 2.0 TDI EDC16 PD 03G906016BF cluster

**EDC15P+ +0x20000 mirror RE-CONFIRMED in A6 chassis** (previously
documented for A2 1.4 TDI). Pair #671 (A6 1.9 TDI PD 0281011213
sw369570) — regions at `0x076D0A` AND `0x056D0A` get the SAME +88-95%
modification. **Δ = 0x20000 = 128 KB**. So the EDC15P+ mirror lives
across multiple chassis (A2, A6 — likely A3/A4 too).

Other EDC15 in this batch:
- Pair #670 0281010224 sw360072 — basic PD layout, no mirror visible
  in tunes I see (probably mirror exists for cal but tune was small)
- Pair #674-675 0281001259 028906021J — **65 KB ROMs** (small early
  pre-PD VAG TDI, IDI conversion). Tiny tunes. Different from
  256 KB EDC15V — these may be the very-early EDC1.4 ECU type.
- Pair #676 0281001129 — **32 KB ROM** (even older, mid-90s). 8 regions.

Note pairs #672 03G906016HS sw379819 and #673 0281011327 4E0907401H
sw371075 — these are EDC16 PD, NOT EDC15. False sort by alphabetical
filename. Pair #673's `4E0907401H` is the A8 4.0 V8 TDI part number,
mislabeled in filename as "1.9 TDI" — it's actually V8 TDI.

Pair #677 03L906022FG sw506100 (A6 2.0 TDI CR EDC17) — sister of
prior batch pair #527 (Allroad 03L906022FG sw506125) — different
cal `0x1DA624 12×15` + `0x1DCC8C 12×16` — same chassis pattern but
this is a different SW. The 506xxx 03L906022FG cluster expands.

Pair #678 0261S02466 4F2907115 sw394380 — A6 C6 2.0 TFSI MED17. Has
the universal MED17 unlock pattern at `0x1CE8A0 120B` (+517%) +
`0x1CF4BC 64B` — same as the universal A5 MED17 pattern from earlier.

**STRONG WIRE CANDIDATE: A6 2.0 TDI EDC16 PD 0281011850 03G906016BF**
- Pair #684 sw380199 → `0x051E5F (+147%)` + `0x05F8FF (+128%)`
- Pair #685 sw382716 → `0x051E5F (+147%)` + `0x05F8FF (+128%)` — **IDENTICAL OFFSETS**
- 2 SW versions sharing exact offsets is enough to wire for 0281011850.

Other A6 2.0 TDI EDC16 PD variants (each different SGO):
- 03G906016BF sw382716 (#679, no part-no prefix) → `0x05F9C9 + 0x05FAA5`
  (close to but not exactly the wire-candidate offsets; this is a
  different file format — likely chiptool extracted differently)
- 03G906016GC sw389285 (#680) → `0x058E33 + 0x06CE0D`
- 03G906021T 0281012234 sw377586 (#683) → `0x0518A3 + 0x064909`
- 0281011850 03G906016BF sw372670 (#682, **2 MB** dump format!) →
  `0x185E7C + 0x1DF8FB`. 2 MB EDC16 dump means full ROM image
  including unused banks; the cal is at the high end.

## Pairs #663–678 — A5 tail + A6 1.9 TDI EDC15 EDC15V/EDC15P MIRROR pattern

A5 3.0 V6 TDI tail-end (#654-657) confirms 4G0907401 sw519312/522947
share `0x1C2xxx/0x1BAxxx` SGO (sister offsets ~0xE0 apart) — 2 SWs
in this cluster. Pair #655 8K0907401 sw510946 DPF shows clean DPF
disable sig: `0x19FF00` 256B cleared to 0 + `0x1EC302` -80% repeating.
Pair #656 8K1907401A sw397833 DPF → `0x1E2B8A 16×16` +116% — sister
of pair #634 8K0907401P sw397833 (same SW across part-suffixes).

A5 4.2 V8 FSI MED17 (#658-659): 0261S02329 sw393902 and 0261S02548
sw394474 (8T0907560 / 8T0907560F) — both 264.8 kW (360 hp non-RS V8).
Tiny 4.5-4.8 KB tunes (V8 FSI rarely tuned aggressively).

**A6 1.9 TDI EDC15/EDC15V/EDC15P** — first batch of A6 C5 1997-2004
1.9 TDI pairs. Bosch hardware codes: `0281001xxx` (pre-PD EDC15V) and
`0281010xxx` (PD EDC15P, 90-110 hp).

**MAJOR DISCOVERY — EDC15 ROM MIRROR offsets** (these are critical
for the writeMap path; every modification MUST be duplicated):

- **EDC15V pre-PD (0281001xxx, 256 KB ROM)** — mirror offset
  `+0x38000` (224 KB). Pair #664 (0281001609 110 hp): regions at
  `0x005850` AND `0x03D850` (Δ = 0x38000) get the SAME 199-byte +135%
  modification. Pair #668 (0281001808 90 hp 1998): regions at
  `0x00584E` AND `0x03D84E` get the same 201-byte +53% mod.
- **EDC15P PD (0281010xxx, 524 KB ROM)** — mirror offset `+0x18000`
  (96 KB). Pair #666 (0281010204 90 hp): regions at `0x05B078` AND
  `0x073078` (Δ = 0x18000) get the same 12-byte -75% mod. Pair #669
  (0281010203 sw352258): same +0x18000 mirror at `0x05B066/0x073066`.

This is **DIFFERENT from the EDC15P+ 0x20000 mirror** I documented
earlier for the A2 1.4 TDI 03G906016G. So there are at least THREE
distinct mirror offsets in the EDC15 family:
- `+0x38000` for early EDC15V pre-PD 256 KB ROMs
- `+0x18000` for EDC15P PD 524 KB ROMs (basic)
- `+0x20000` for EDC15P+ PD 524 KB ROMs (advanced — A2/A3/A4 1.4-1.9 TDI)

**Code action — HIGH PRIORITY**: extend the EDC15 writeMap path to
handle all three mirror types. The mirror offset should be encoded
on the ECU def (e.g. `mirrorOffsetBytes: 0x38000`). Without this,
EDC15 tuning writes to one location but the cal-checksum reads from
the other → checksum fails or mod has no effect.

Other A6 1.9 TDI pairs:
- Pair #661 (0281010200 110 hp PD sw352636) — `0x05CCE6/0x05C8E4`
  classic PD layout, no mirror visible (would be at +0x18000 too)
- Pair #663 (0281001609 90 hp pre-PD) — only 13B at 0x005854,
  light tune
- Pair #665 (0281010066 90 hp older PD) — `0x03C450/0x03D874` — note
  `0x03D874 - 0x03C450 = 0x1424` — NOT a simple mirror, two related
  cal blocks
- Pair #667 (0281010405 95.6 kW sw362175) — `0x074A8C/0x076952` —
  Δ 0x1EC6 — same not-a-mirror two-block pattern
- Pair #660 4F0907401B sw377320 (A6 C6 3.0 TDI CP44, NOT 1.9) —
  intruder in this batch by alphabetical sort. Cal at `0x1A0F55/
  0x1EBAA1` — CP44 baseline.

Pair #662 0261206917 4B0906018CA (A6 1.8T 20V ME7.x) — **only 24
bytes changed across whole 1 MB file**. This is a checksum-only
"tune" (probably tool serial tag, not a real modification). Should
be flagged as no-op when changedBytes < 32.

## Pairs #647–662 — A5 3.0 V6 TDI 8K1907401A 516613 cluster + 4G/4L/8R cross-platform

**Strong wire candidate: 8K1907401A sw516613** appears 4 times across
this batch (#638, #646, #647, #650 — sister files, different tuners
or different model years):
- All hit `0x1E424E 16×16` (+116%) — the main IQ ceiling
- All hit the `0x19152E` 80B emission-disable region
- Pairs #646 and #647 also write a 131072 B (128 KB) block at
  `0x160000` — this is a **`stage1+++` tuner signature** that fills
  the upper 128 KB padding region with non-FF data (probably for
  serial/license tracking)

**8K1907401A SW cluster summary** (cumulative across batches):
- sw516613 → `0x1E424E` (4 pairs)
- sw516617 → `0x1E3D5A` (2 pairs from before + #641 here)
- sw516620 → `0x1E3D5A` (#632, #637)
- sw516682 → `0x1E3C8C` (3 pairs across batches)
- sw399371 → `0x1E2C98` (#640, #613)

These are 5 distinct sub-SGOs in the 516xxx range, each tied to a
specific SW number. So WS the variants table for 8K1907401A 3.0 TDI
needs 5 entries with offsets in the 0x1E2xxx-0x1E4xxx range.

**Cross-vehicle part-number bleed** (same engine, different VW part
prefixes). All A5 3.0 TDI files in this batch but with different
"vehicle-specific" part numbers:
- **8K1907401A** — A5-prefix (5 SGOs above)
- **4G0907401** — A6 C7 prefix on A5 file (sw519312 #644 / #649 / #651,
  sw521696 #652, sw528339 #653) — newer generation 2012+
- **4L0907401A** — Q7 prefix on A5 file (sw518178 #645 — CP44 family
  at `0x1FAAF6 16×16`)
- **4F0907401E** — A6 C6 prefix on A5 file (sw516625 #648 — `0x1D7510`
  +217% repeating cluster)
- **8R0907401J** — Q5 prefix on A5 file (sw505414 #643 — `0x1A95CA`)

**Code finding**: VAG part-number prefix (`8K`/`4G`/`4L`/`4F`/`8R`)
ties to the **donor vehicle**, NOT the engine ECU SGO. A correctly
designed loader should match on `907401[A-Z]?` regardless of prefix
and use the SW number + vehicle context to disambiguate.

Pair #644 is interesting: 4G0907401 sw519312 in `Diesel` filename
hits `0x1C2964/0x1BA026` (+205%/+133%) but pairs #649/#651 with the
SAME 4G0907401 sw519312 in `Benzin` filename (mislabel — actually
diesel) hit `0x1822F4` (the EGR-disable). Different tuners modifying
DIFFERENT regions of the same ROM, which is why we need ALL the
known offsets in our def, not just one tuner's preferred map.

## Pairs #631–646 — A5 3.0 V6 TDI 8K0907401x deep catalog

16 more A5 3.0 V6 TDI pairs across **8K0907401, 8K0907401N, 8K0907401P,
8K0907401S, 8K1907401A, 8K2907401**.

**A5 3.0 V6 TDI 8K0907401 (524KB chiptool dumps)** — common
"DPF-disable + tune" tool signature:
- sw390155 (#622) → `0x0669CA` (9B repeating +90%) — 4× same value
- sw392904 (#623) → `0x06F8B2` cluster — 22B at +28% / 328B at -28%
- sw393570 (#624) → `0x07498A` (160B +96%)
- **sw399857 + sw510328** (#625, #626) → IDENTICAL offsets
  `0x066FFA + 0x0665B2 + 0x06672A + 0x0668A2` (10B repeating -80%).
  Two SW versions, same SGO chiptool dump. Confirms cross-SW layout.

**A5 3.0 V6 TDI 8K0907401 (full 2MB)**:
- sw392914 (#627) and sw394960 (#628) → identical offsets
  `0x1F8AF6 + 0x1F8B84 + 0x1F8D6E` (16×13 + 16×16). **2 SWs same
  SGO** — and this is the SAME layout as A5 2.7 V6 TDI sw392966
  (pair #593) just shifted by 0x84. So the 2.7 and 3.0 SGOs share
  same template, with cal addresses offset by ~0x80 between them.
- sw392904 (#631) → `0x1F3320 + 0x1F33F8 16×16`. Combined with
  sw390626/sw510328 (#616/#618 prior batch) → **3 SWs share the
  0x1F3320 SGO base**: 390626, 392904, 510328. **Strong wire
  candidate**.

**A5 3.0 V6 TDI 8K1907401A**:
- sw516682 (#629) → `0x1E3C8C / 0x1E3CA8 / 0x1E3CB8` cluster (5B
  regions all +779%) — **same as pair #535 (A5 8K1907401A sw516682)**
  from earlier batch. Cross-batch confirmation.
- sw514659 (#630) → `0x1E0696` (128B -50%) — note: my **2.7 wired
  def uses 0x1E0782 with the SAME -50% halve pattern**. Almost
  identical offset (Δ = 0xEC). The 3.0 limiter is at 0x1E0696, the
  2.7 is at 0x1E0782. Very similar. Could share a "halve limiter"
  preset across both 2.7 and 3.0 with offset switched.
- sw516620 (#632, #637 — same SW two files) → `0x1E3D5A 16×16` —
  same as pair #614 sw516618. Confirms 516xxx 3.0 TDI cluster.

**A5 3.0 V6 TDI 8K0907401N/P/S**:
- 8K0907401N sw400928 (#633) → `0x1D5B40` (11B +74%)
- 8K0907401P sw397833 (#634) → `0x1DEE7C` (10B +108%)
- 8K0907401S sw399375 (#635) → `0x1D5B40` (11B +74%) — **same as N**
- 8K2907401 sw516617 (#636) → `0x1E3E32 16×9` (+156%)

**UNIVERSAL "dead-zone" pattern across most 8K0907401x and
8K1907401A pairs**:
- `0x190EB6 / 0x190EE6 / 0x190EE6 / 0x191046` 80-byte block
  cleared to 0x32 (-99.9%)
- `0x190DDA / 0x190F6A` 34-byte block cleared to 0x32
- `0x190EA6 / 0x191036` 8-byte block cleared to 0x32

This appears in EVERY 8K0907401x 2MB pair regardless of SW. It is
**not a tune** — it's a **DPF/EGR/lambda monitor disable** that
tuners apply universally on these EDC17 diesel ECUs. Should be
flagged as `category: 'emission'` and shown to user as
"Emission Monitoring Disable" not "Boost Map -99.9%".

**Code action items**:
1. New ECU def candidate `edc17_a5_30tdi_8k0907401_390xxx_510xxx`
   for the 3-SW cluster sharing `0x1F3320 / 0x1F33F8`.
2. Add a "dead-zone classifier" — when a region clears to 0x32 with
   -99.9% delta in EDC17 diesel, label it as emission-monitor disable
   automatically instead of treating it as a boost target.

## Pairs #615–630 — A5 2.7/3.0 V6 TDI continued + 3.0 8K0907401 catalog

16 pairs spanning A5 2.7 V6 TDI tail-end and **A5 3.0 V6 TDI** (same
8K1907401A part number — SAME hardware, different cal base).

**Key finding**: Bosch 8K1907401A is the **shared ECU hardware** for
A5 V6 TDI 2.7 AND 3.0 — the differentiator is the SGO/cal base,
not the part number. **Code implication**: my just-wired
`edc17_a5_27tdi_8k1907401a` def is correct for sw 516657/516662/
516664/516665 but WILL falsely match a 3.0 V6 TDI sw396465/399371/
516618/516662 (same part). **Need to refine identStrings to require
both `8K1907401A` AND a 2.7-specific SW** OR add cal-content check.

A5 3.0 V6 TDI 8K1907401A SGO clusters:
- **sw396465** (#612) — cal at `0x1DE5C8/0x1DEAF8/0x1DEAC0/0x1DE638/
  0x1DEA88` — 16-byte regions clustered at 0x1DExxx. Different from
  2.7's 0x1DBCCC. **Higher offset = 3.0 specific?**
- **sw399371** (#613) — cal at `0x1D50C2-0x1D6` series — 6B regions
  repeating, likely N75 PWM scaling
- **sw516618** (#614) — `0x1E3D5A` (16×16) — 1.45 MB changed bytes
  due to full-recal "stage1+++" file (most are 0xFF→0x05 noise; the
  real change is the 16×16 IQ map at 0x1E3D5A)

A5 3.0 V6 TDI 8K0907401 (older hardware):
- **sw390626 / sw510328** (#616, #620 / #618, #621) — share cal at
  `0x1F3320` (128B) + `0x1F33F8` (16×16). Two SW versions, same SGO.
  Wire candidate: small ECU def for 8K0907401 sw390626/510328.
- **sw392914** (#615) — multi-cluster: `0x1ED43E + 0x1BC408 +
  0x1F0DA2 + 0x1F9406` — different SGO, looks like older 2007 base.

A5 2.7 V6 TDI 8K1907401A continued:
- **sw516662** (#606) — 1.45 MB changed (full-recal). Among the
  changes: `0x1DBD1A`, `0x1DBE16`, `0x1E541E` — all overlap with my
  wired def offsets. So def works for sw516662 too despite the noise.
- **sw511914** (#607) — pre-516xxx. Different SGO at `0x190ECA +
  0x190CCF` (8×3). Not covered by my wired def.
- **sw516657 DPF variant** (#611) — DIFFERENT cal layout from #604
  (sw516657 non-DPF). DPF SGO at `0x1E3BB6 / 0x1E39B6` (two 16×6).
  **Same SW + DPF flag = different SGO**. Need DPF in identStrings.

A5 2.7 V6 TDI 8K0907401 (older hardware, DPF):
- Pair #608 part `37390626531` (typo/tool prefix; real PN 8K0907401
  sw390626) — different SGO. Pair #609 8K0907401 sw390155 — yet
  another SGO. Pair #610 8K0907401 sw392961 (DPF-CR-2010) — yet
  another. **Multiple SGOs per part-number for older 8K0907401**.

**Code action item — refine wired ECU def**: my new
`edc17_a5_27tdi_8k1907401a` should also include a check that excludes
3.0 TDI SW numbers. Easiest: change identStrings to require the SW
strings (`516657`, etc.) that are 2.7-specific, drop the bare
`8K1907401A` from the list.

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
