# SIMOS 18.1 EA888 — extracted data from Continental Funktionsrahmen

**Source:** `Simos18 Funktionsrahmen.pdf` (220 MB)
**Project:** VW SIMOS 18.1 EA888 (Audi)
**Software Version:** SC8L50Y0
**Date:** 2014-11-10
**Document Key:** 10213413 SPE 000 DE
**Publisher:** Continental AG

## Files in this folder

- **`names.json`** — 34,590 unique DAMOS-style identifier names extracted via regex from the FR text. Sorted alphabetically.
- **`analysis.json`** — Per-prefix counts and usefulness assessment.

## What this is

A Continental **Funktionsrahmen** (functional framework) for the VW SIMOS 18.1
EA888 ECU. It's the internal software specification — describes every software
function with variable names, algorithms, and dependencies. Think "source code
documentation for the engine controller firmware."

## What the extract gave us

Running `pdftotext` against the 220 MB PDF produced 3.2 MB of clean text.
A regex over that captured 34,590 unique SIMOS-style identifiers:

| Prefix | Count | Meaning |
|---|---|---|
| `LV_` | 7,651 | Logic Value (flags / status bits) |
| `NC_` | 5,580 | Numeric Constant |
| `IP_` | 2,973 | Input variable |
| `LC_` | 2,219 | Logic Condition |
| `LDP_` | 2,074 | Load Point / Lambda Probe related |
| `CTR_` | 1,312 | Counter |
| `STATE_` | 1,052 | State variable |
| `LF_` | 878 | Logic Flag |
| `FAC_` | 849 | Correction Factor (potentially tunable) |
| `TQ_` | 403 | Torque (tunable) |
| `PRS_` | 279 | Pressure (tunable) |
| `MAF_` | 238 | Mass Air Flow (tunable) |
| `LAMB_` | 219 | Lambda (tunable) |
| `MFF_` | 189 | Mass Fuel Flow (tunable) |
| `IGA_` | 140 | Ignition Angle (tunable) |
| `CAM_` | 135 | Cam timing (tunable) |
| ... | | |

Plus ~19 German Bosch `KF*` (kennfeld/2D map) names and 23 `KL*` (kennlinie/1D
curve) names mentioned in text.

## What this IS good for

1. **Vocabulary dictionary** — when we eventually get SIMOS18 A2L files, we can
   cross-reference found names against this list to:
   - Validate that they look like real SIMOS18 identifiers
   - Reject junk/corrupt labels
   - Estimate coverage ("our A2L covers 12% of FR-documented variables")

2. **Descriptions** — the FR has English/German descriptions for each variable.
   When we match a scanner hit to an FR name, we can enrich the output with a
   human-readable description.

3. **Gap tracking** — once we have signatures, we can measure which SIMOS18
   functions are covered vs missing.

## What this is NOT good for

1. **Direct signature source** — the FR contains no binary content. We cannot
   extract 24-byte signatures from it. It's algorithm documentation, not data.

2. **Address lookup** — no memory addresses in the FR (those live in the A2L).

3. **Standalone SIMOS18 scanner** — without signatures, we can't identify maps
   in an unknown SIMOS18 binary. We need pairs.

## What we need to actually cover SIMOS18 in the scanner

At least one of:
- **SIMOS18 ORI+A2L pairs** — ideally 3-5+ for signature portability filtering
  (maps seen in ≥2 pairs survive the dedup step)
- **SIMOS18 .ols files** — WinOLS project files that contain the binary + user-
  labeled maps. Would require a `.ols` parser (not yet written).
- **Known SIMOS18 signatures from public tuning databases** (WinOLS map packs,
  etc.)

**Why we have zero SIMOS18 training data right now:** The `find_pairs.js` script
walked D: drive and found binary+A2L pairs. It did NOT find any SIMOS18 pair
whose A2L parsed to actual CHARACTERISTIC addresses that resolved against the
binary. The 5-7 SIMOS folders on disk seem to have binary-only files or A2Ls
where the addressing convention isn't one of our 5 candidate bases
(0x0, 0x800000, 0x80000000, 0xA0000000, 0xBF000000).

## Next steps for SIMOS18 unlock

In priority order:

1. **Find real SIMOS18 A2L files.** Search `damos-2020`, `damos-2021-2022`, or
   purchase a SIMOS18 DAMOS pack. Even one good A2L is enough to start.
2. **Write a .ols parser.** `C:/temp/vag_ols_kp_list.json` from a prior session
   listed hundreds of .ols files. A parser could extract each one's binary +
   map labels. This would likely unlock both SIMOS18 AND boost EDC16/17 pair
   count significantly.
3. **Extend detectBase() candidates.** Maybe SIMOS18 uses a non-standard base.
   Print histogram of first few A2L addresses vs binary size and find the
   actual base empirically.
4. **Cross-ref with names.json.** When any of the above succeeds, validate
   extracted names against this FR vocabulary before writing them to the
   catalog — rejecting anything that doesn't match the SIMOS naming pattern.

## Regenerating from the PDF

```bash
# 1. Convert PDF to text (takes ~2 min)
pdftotext "Simos18 Funktionsrahmen.pdf" simos18_fr_clean.txt

# 2. Extract identifiers
node -e "
  const fs = require('fs');
  const text = fs.readFileSync('simos18_fr_clean.txt', 'utf8');
  const re = /\b[A-Z][A-Z0-9]{1,4}_[A-Z][A-Z0-9_]{3,80}\b/g;
  const names = new Set();
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[0]);
  fs.writeFileSync('names.json', JSON.stringify([...names].sort()));
"
```
