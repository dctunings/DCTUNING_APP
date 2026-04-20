# WinOLS 5.74 Cheatsheet — actionable reference for DCTuning

Source: `WinOLS_HelpEn_5.74.txt` (10,659 lines, official EVC WinOLS 5.74 manual, Feb 2025).
Section numbers below refer to the manual's own numbering.

---

## 1. Map-finding algorithms (how WinOLS finds maps without an A2L)

WinOLS runs an **automatic background search** that fills a `potential maps` folder in the project tree. Results are reviewed in the sidebar or stepped through with hotkey **F** (next) / **Shift+F** (previous). Double-clicking a potential map tag promotes it to a registered map.

Relevant sections and how each finder works:

**Automatic map-finder — Part II §2.2 (lines 695-716) + §10.3.5 (lines 7693-7718, 7852-7873)**
- Runs on project open, triggered once (not re-run after save/reopen).
- Uses two complementary engines, configurable at `F12 > Automatically > Map search`:
  1. **Vendor-specific format detectors** — enabled via the ECU `producer` field in project properties (Bosch, Denso, etc.). An incorrect/empty producer silently reduces detection count (§4.7 line 2933). Bosch detection produces maps with a **Signature ID** (see §9.7) that ties them to axis-description profiles.
  2. **Statistical map recognition** — judges data "by its look". Finds maps without vendor headers, slower, rarely recovers axes.
- Filter knobs: accept/reject maps of 1 value, mostly-1-value, or 2 alternating values (default: reject, to reduce false positives).
- Map axis profiles get auto-collected in parallel (`ols_sp.cfg`) — these let a later project reuse the name/unit/factor/offset when it sees the same axis signature.

**Text-mode manual finder — §2.3 (lines 717-791)**
Workflow a tuner actually does: pick bit-width (8/16) and byte order (HiLo=Motorola, LoHi=Intel — auto-detected from producer), scroll, then adjust **Columns** (hotkeys M/W) so inter-row "jumps" all line up in the same column → that column width is the map's row length. Then shift origin left/right (Ctrl+Left/Ctrl+Right) until the map starts at col 0. Select, press **K** = Selection→Map. Unimportant regions (program code, empty/filler) render pale.

**2D-mode manual finder — §2.4 (lines 793-834)**
Same idea as text mode but with 2D pixel view. Vertical lines mark line-breaks. Use `Ctrl+MouseWheel` to change zoom. Drag the left/right selection edge to snap to line-breaks.

**Typing finder — §2.5 (lines 838-847)**
Press **K** anywhere in the hexdump with no selection → opens `Properties: Window` where you type start address, rows, cols, bit-width directly.

**Vertical-map finder — §2.6 (lines 848-873)**
For Denso-style maps where each row starts with its Y-axis value (axis interleaved with data). Either:
- Manually set `line skip bytes = 2` (WORD) and `byte skip to Y-axis = 2*columns`, OR
- Select only the map data rectangle (not axis) and press K, OR
- Set producer=Denso and let auto-search handle it.

**Support map selection assistant — §2.3 end (lines 779-791)**
`View > Support map selection` — given a rough user selection, automatically tries all column counts and origin shifts and picks the best fit. Highly relevant to our RemapBuilder UX.

---

## 2. Axis detection heuristics

**Map properties dialog — §5.25 (lines 4962-5128)**
Fields WinOLS stores per axis:
- Start address + rows/columns + bit-width + byte-order (HiLo/LoHi)
- `Skip bytes` — for ECUs that only use every Nth byte for axis
- `Data source` for axis: enumeration (0..N), values-from-eprom (with arithmetic: additive/subtractive/indexed-alternating), or externally entered
- `=>Axis-Addr.` helper button auto-repositions axis addresses when you resize the map if the axes sit immediately before the map data

**Calculate factor and offset wizard — §5.25.1 (lines 5134-5207)**
Reverse-engineers factor/offset from 5 sources:
1. Given formula type 1: `VAL = (N * factor) + offset`
2. Given formula type 2: reciprocal, e.g. `VAL = 100/(0.00001 * N)`
3. Flexible formula: user types `(input+3)*10` or picks a template with up to 4 params
4. Example value pairs: enter 2 display↔eprom pairs (3 for reciprocal) → solves the linear system
5. **Corner values**: pick 2-3 cells with distinct values from the map itself, type their display values → WinOLS reads the raw bytes and solves.

"Swap input/output" flips the direction if the source formula is display→eprom. WinOLS warns when the formula is mathematically untranslatable to its factor/offset scheme.

**Number-to-Text — §5.25.2 (lines 5208+)**
Per-map enum table: `0=Off`, `1=On // tooltip`, `10..19=Range // With Colors #ff0000 #0000ff`, `*=Undefined`. Imported from XDF files as QuickFixes.

**Axis description profiles — §9.7 (lines 6952-7017)**
Each profile has a **signature** auto-derived from Bosch map structure. When WinOLS sees the same signature in a new project, it auto-fills axis name/unit/factor/offset. Groups link map+X+Y under one signature ID whose last digit is F/0/1/2. Exportable to a file (per-customer libraries). **This is equivalent to our DNA vector DB concept.**

**Map Database (.mapdb) — §11.6 (lines 8541-8805)**
Rule-engine for naming/labeling newly-found maps from shape alone. Rules contain ECU-level rule-group conditions + per-rule conditions (size, map values, axis values, extreme-value position in one of 9 regions: corners/edges/interior) + hexdump search-text. "Create from preview selection" generates the rule from example maps. Rules apply automatically during every map search. **This is essentially WinOLS's fingerprint DB, and close to what we should build on top of Supabase.**

---

## 3. Checksum correction

**Checksums dialog — §5.21 (lines 4697-4874), hotkey F2**

What WinOLS auto-corrects:
- Plug-in families sold separately (one module per ECU family). Modules self-identify: each checksum plugin decides whether it can handle the current file.
- **"Search checksum online"** — compresses the project and uploads it to EVC's server, returns which module you'd need. Free, no commitment.
- Manual checksums for the rest.

Per-checksum entity stored in the project:
- `Algorithm` — which plug-in / formula
- `Address area` — the range being summed
- `Data bit width` — 8 or 16
- `Data organisation` — for 16-bit, HiLo/LoHi
- `Correct to` — single address for normal, **address range** for Fullbyte
- `Automatic correction` checkbox — live re-sum on any change in the area

**Fullbyte Checksums (line 4827)** — an additive sum computed in a wider register than the data (8-bit data → 16-bit register; 16-bit data → 32-bit). Carries aren't dropped, so a +300 increase must be compensated by a -300 in the target range (not just -44 like naive 8-bit). That's why Fullbyte needs a **target range**, not a target address.

**Manual default** is a plain additive sum — you just pick an address range and a "correct-to" address after it; WinOLS adjusts the correct-to bytes to keep the sum constant.

**Sync Blocks — §5.21.3** — not a checksum per se, but uses the same dialog. Two byte ranges kept bit-identical; any edit in one is mirrored in the other. Generated by the Parallel Maps feature (§9.8) to keep duplicated Bosch maps in sync.

Rules that bit us in the past:
- Automatic modules **require the unmodified original** loaded as project original (§2.12, §5.21). Without it, recognition or calc will fail silently.
- The correct-to address/range may not lie inside the checksummed area but must lie within the ECU's computation range (line 4843).

---

## 4. A2L / DAMOS / KP import

**Damos & A2L Import — §4.12.12 (lines 3883-3969), hotkey Ctrl+D**
Separate licensed module (not in main program). Drag a `.dam` or `.a2l` file onto a project window to launch.

Workflow:
1. Pick the DAM/A2L file.
2. WinOLS parses into internal format. Warnings/errors are expected and usually ignorable.
3. Declare whether the current project "belongs" to the file (exact binary match) or is just similar.
   - If belongs: enter **address offset** between A2L absolute addresses and WinOLS addresses. Auto-detect first (relies on file structure); if that fails, use the displayed valid-range hint and try hex round numbers.
   - If not belongs: limited import (mostly 1D/2D), heuristic — verify results.
4. Filter by dimension, constant-value flag, name substring. Select per-map. Options: import name-only, id-only, or both; import folder hierarchy too.

Fields imported per map: name, description, unit, **id** (A2L characteristic identifier → stored in map `Id` field used for future matching), rows/cols, start address, bit-width, data organisation, factor/offset.

**Autodiscover for A2L files — §10.3.4 (lines 7631-7635)**
Configurable path with wildcards. WinOLS extracts an ID from the hexdump and scans all A2L files in that folder for that ID.

**KP (Map Pack) import/export — §4.12.8–4.12.9 (lines 3766-3809), hotkey Shift+Alt+I / Shift+Alt+E**
Structure-only (no hexdump values). Small files, easy to share. Import supports **two offsets** (subtract old, add new, e.g. move from 0x7000 → 0x400000 with offset2=0x7000, offset1=0x400000). UI shows a scaled bitmap with blue markers where maps will land; you can drag or use "Automatically" to find an offset.

**Import maps from another .ols — §4.12.10**
Copies map definitions only, requires the maps to be at exactly the same addresses as the source project.

**Import changes — §4.12.11 (lines 3820-3882), hotkey Ctrl+Alt+I**
The heavy one — transfers maps *and* values even if maps moved to other addresses. Tolerance setting for partial-match recognition. Changes can be transferred as difference (safer) or absolute. Also handles changes-outside-of-maps. Auto-skips checksum / patch-tag blocks since 5.72.37.

**CSV / JSON map list — §4.12.6, §4.12.7**
Export all maps to CSV/JSON → edit in Excel → re-import. Re-import matches by address or id; if all columns were exported, it also *creates* missing maps. Addresses in CSV are always relative to project start, decimal.

---

## 5. Signature-based search

**SignHexdump — §5.9 (lines 4355-4405)**
Steganographic branding, not for identification. Silently modifies map cell values by amounts too small to matter functionally. Stores hidden company text. NOREAD flag makes the file unimportable except to WinOLS registered to your customer number. Unsuited: small maps, maps with skip-bytes, float maps.

**Find similar projects — §4.9 (lines 3305-3332), hotkey Ctrl+Alt+O**
Scans all projects of the current client and ranks them:
- Bold = same `software`, `ECU-Nr Prod`, or `ECU-Nr ECU`
- "Very similar" threshold adjustable in combobox
- Plus hardware/data-area partial matches
- Scope: current client folder only (plus opted-in resellers)

Input for ranking comes from project-property strings + per-hardware-element binary similarity. Does *not* require maps to be identified.

**Find duplicate objects — §4.10**
Scans client for projects containing the exact same version twice, offers to merge. Comparison condition configurable (name only vs name+hexdump).

**Find similar maps — §9.9, hotkey Ctrl+Alt+K** and **Parallel maps — §9.8, Ctrl+Alt+P**
Scans *within* the current project for maps with the same shape/content as the active map (useful for the N copies of the same limiter map). Sync-blocks can be created to keep them bit-equal going forward.

**Hashing — §9.19 (line 7226)**
"Online solutions" upload SHA hashes of the hexdump + selected ECU properties to the reseller's server — the smaller-privacy tier. Relevant pattern: hash-based remote lookup before full upload.

---

## 6. Project / version / client model

Three-layer hierarchy:
- **Client — §3.10 (lines 1916-1953), Ctrl+H**. Just a named folder on disk configured at `F12 > Paths > Clients`. Switching clients (hat icon) changes what `Open`, `Find similar`, `Update all` scan. Projects opened before the switch keep their old client but *use* the new client for similarity search. Special clients: Deleted, CorruptFiles, ForeignFiles, ResellerUpload, reseller-caches.
- **Project — §4.7 (lines 2893-3032), Ctrl+Alt+Enter**. One file, many versions. Holds *Client* (customer) + *Vehicle* (producer/chassis/model/year/VIN) + *ECU* (elements, producer, software size, read-hardware, project-type: complete/partial-mapdata/partial-fulllength) + 5 user-defined fields + reseller metadata + write-protection flags. Ini files (`WinOLS ini files — line 3063`) drag-and-drop populate all these fields. See `lines 3075-3175` for the full ini schema (ClientName/Number, Vehicle*, Ecu*, Engine*, OutputPS/KW, ResellerCredits, etc.).
- **Version — §4.8 (line 130)**. One binary dump inside the project. Original + N versions. Status flags: *in development*, *finished*, *finished+master*, *ready for reseller*, *AutoUpdate*, *AutoImport*, *AutoUpdateAndExport*. Versions carry their own credits, comment, hidden signatures.

**AutoUpdate / AutoImport — §2.13 (lines 1108-1231)**
- **AutoUpdate**: combines N source-versions inside the same project into a composite target-version. Target-version name encodes the recipe: `Stage1+FeatureX+OptionAlpha`. Leading `+` preserves outside-of-maps changes. Maps are overwritten whole-map when source differs.
- **AutoImport**: pulls source-versions from *other* projects. Target gets `AutoImport` status; matching is by auto-detected offset + similarity. Configurable via project-comment directives: `@auto min_similarity 90%`, `@auto check_property ECU.ECUProd, ECU.ECUStg`, `@auto transfer_tolerance 10%`, `@auto transfer_maps no`, `@auto transfer_mode absolute`, `@auto transfer_unchanged no`, `@auto transfer_outsidemaps yes`.

**Sessions — §3.14 (lines 2048-2067)**
10 named snapshots of "which projects/windows are open". Shift to rename, Ctrl to copy.

**Elements — §3.8, §4.7 end**
Multi-element projects (e.g. flash + EEPROM + DF in one BDM dump). Hardware elements vs Virtual elements. Virtual elements are synthesised by OLS1xxx importers / checksums. `<All elements>` view presents the concatenated address space.

---

## 7. Key file formats

- **`.ols`** — WinOLS project file. Binary. Contains all versions, maps, comments, checksums, project properties, hidden signatures.
- **`.olsx`** — Encrypted variant with project-rights, password, customer-number binding (§4.1.1 line 2483).
- **`.dat`** — older "OLS" format, still readable (line 3443).
- **`.kp`** — KP Map Pack. Map definitions only, no hexdump values. Portable, tiny, offset-adjustable on import (§4.12.8-4.12.9).
- **`.mapdb`** — Map Database (§11.6). Rule sets for auto-labelling by shape. Must live under WinOLS config dir. Shareable, rights-restrictable.
- **`.winolsscript`** — Script file (§9.20). Structure + value changes as a portable patch. Self-applicability detection.
- **`.lua` / `.luax`** — LUA scripts via OLS540 plugin. Encryptable.
- **`.ini` / `.ifo`** — project-properties import format (§4.7.3 lines 3063-3175). Drag-and-drop applies to open project.
- **`.mapdb` + `ols_sp.cfg`** — axis description profile store, in WinOLS config directory.
- Intel Hex (`.hex`, `.paf`, `.daf`) and Motorola S-record (`.s19`) — supported with address offset + mimic-format-on-export option (§4.1.1).
- BdmToGo / BslToGo — re-flash-ready export with up to 3 security-check areas (e.g. VIN match) to prevent cross-vehicle programming.
- `.ObdVisualizer`, `.csv` — OBD log replay for the Visualizer (§11.3.1).

**Config files** in the WinOLS Application Data dir:
- `ols.cfg` — full configuration
- `ols2.cfg` — partial backup
- `ols_sp.cfg` — axis description profiles
- `ols_tb.cfg` — toolbars
- `ols_wsp.cfg` — workspace (open projects/windows)
- `ols.v###.cfg` — per-legacy-version config for side-by-side WinOLS installs

---

## 8. Other notable features

- **Overview dialog — §11.4 (lines 8478-8508), hotkey O**. Classifies the project into: program code / empty / map data / differences / simulator-accessed bytes. The "pale unimportant data" colouring in hexdump is derived from this. Also feeds the scrollbar heatmap. Runs in background on open. **Our scanner already produces similar signal — we could expose it the same way.**
- **Preview — §2.9 / §11.5 (hotkey P)**. Live 3D preview that opens automatically during selection if selection ≤32 cols wide. Includes guidance on reading wrong-columns vs wrong-origin patterns visually.
- **Simulator — §3.20, §6.7**. Loads the ECU's actual calc code and records which memory addresses are accessed during simulated runs. Accesses become a column in the Overview. This is *the* ground-truth for "is this byte really used?". We have nothing like it.
- **LUA plugin (OLS540)**. Full scripting over project/map/version APIs. Includes `projectImport`, `set_map_property`, programmatic search. Encrypted `.luax` distribution.
- **Command line dialog — §11.7 (lines 8806-8900), Ctrl+Enter**. Textual operator: `+5`, `+10%`, `=20`, `:80000` (jump abs), `:+1000` (jump rel), `100..1FF` (select range), `AFI_MULT_MN` (open map by ID), `map[torque].col[rpm]=4`, `lua:...`, `filename.ols` to open. Lockable slots for frequently-used commands.
- **QuickFix — §5.10 (lines 4409-4446), Shift+Q**. Version-independent toggle groups. Create from a small selection (max 200 cells) with a Number-to-Text state table → a one-click on/off that any version can apply. Also imported from XDF `XDFPATCH` blocks.
- **Solutions — §9.19 (lines 7205-7238), F7**. Reseller-hosted patches — classic (offline script) or online (upload to reseller server, they respond with the patched version/maps). Billed via reseller credits.
- **Visualizer — §11.3 (lines 8380-8459)**. Live OBD data overlay on a map window. UCM100 hardware, also replays `.ObdVisualizer`/`.csv` logs.
- **Search dialog templates & triggers — §9.x (lines 6742-6800)**. Search values with `Alternative/Slashes`, `>greater / <smaller` range ops, strictly monotonic filter (handy for axes), template files with nested comments, cross-linked triggers between search-template and replace-template via `->name` / `<-name`.
- **Parallel maps / sync blocks — §9.8**. Propagates edits between shape-identical duplicates automatically.
- **Mass export, Excel export/import of project list — §4.2 (lines 2618-2635)**. Edit project metadata in Excel, reimport.
- **Update all projects — §4.11 (lines 3358-3407)**. Bulk: search checksums (incl. "Quicktest" mode that doesn't block with questions), recognize vehicle data, normalise spelling, re-run map search, check script applicability. Version-management rules: rename, sort, combine, set credits.
- **Clone project properties — §4.11.1**. "For the 20 projects matching my current ECU ID, copy over any property that is consistent across them". Powerful catalog-builder.
- **Signature-ID field on maps — line 5017**. Per-map opaque ID generated by the potential-map search. Used as the key in axis description profiles.
- **"Finished project" / non-developer mode — §3.16**. Projects flagged `finished` become read-only for non-developer users. Useful for workshop installs.

---

## What we're missing — actionable list

Concrete gaps between DCTuning and WinOLS, ordered by user impact:

1. **Background potential-map search** with a dedicated tree branch in the UI, hotkey-driven F/Shift+F navigation, and click-to-promote to registered map. We have the scanner; we don't have the UX. **This is the single highest-impact gap.**
2. **Statistical map recognition** — detect maps by *shape* in the absence of vendor signatures. Our Kf_ scanner covers vendor-specific; add a heuristic pass for the rest.
3. **Map Database rule engine (.mapdb equivalent)** — ECU-group conditions + per-rule shape/extreme-position/hexdump-text conditions + "create from selection" wizard. This is exactly the layer between our DNA DB (content hash) and a name. Ours should probably be a Supabase table + client-side evaluator.
4. **Axis description profile auto-collection** — when a user names an axis in project A, persist the signature→(name,unit,factor,offset) mapping and auto-apply in project B. The plumbing is close to what our auto-trainer does; we need the apply side.
5. **Calculate factor/offset wizard** — the corner-values mode in particular (user clicks 2-3 map cells, types display values, we solve). Low effort, big UX win.
6. **Checksum "Search online" fallback** — pattern: compress/hash project, ask a server which family applies, return module name. Useful even if we don't license the plugins — tells the user what *kind* of checksum they're up against.
7. **Fullbyte checksum distinction** — support range-target vs address-target in our checksum engine. We likely already handle simple additive; Fullbyte needs the wider register and a target *range*.
8. **Sync blocks** — bit-mirror memory ranges across parallel maps. Almost free once we have parallel-map detection.
9. **Overview classifier + scrollbar heatmap** — classify bytes into program-code / empty / map-data / diff. The scanner produces pieces of this; surface it.
10. **Import/export CSV & JSON map list** — round-trip editing in Excel. The JSON side dovetails with our existing parser infrastructure.
11. **KP offset UI** — when importing a mappack to a differently-located project, show the scaled bitmap + click-to-try-offset interaction. Our KP parser exists; the offset finder UX does not.
12. **Script applicability detection** — per-script "can this be applied to the current project?" check (block/map signature hashing + property constraints). Opens a plug-in ecosystem.
13. **Parallel maps detector + dialog** — one-click identify-and-sync duplicate maps within an ECU. Common case for VAG limiters and Bosch group files.
14. **Project comment `@auto ...` directive parser** — we don't need full AutoUpdate yet, but the directive format is a good spec for our own auto-apply rules.
15. **Multi-element project support** — many BDM dumps have flash+EEPROM+DF concatenated. Need `<All elements>` virtual addressing and per-element checksum scoping.
16. **Signatures on output files (SignHexdump)** — small, low-risk steganographic branding so a reseller can identify their own files in the wild.
17. **Command-line interpreter** — `:address`, `=value`, `+10%`, `map[id].col[x]=y`, `lua:...`. Power-user accelerant.
18. **QuickFix concept** — selection → on/off toggle, persisted at project level, applies in any version. Maps cleanly onto our RemapBuilder idea of "stages".
19. **Find duplicate objects** — useful during library cleanup and when a bench-flashing workflow creates dupes.
20. **Axis `Data source` modes** — we support table/enum; WinOLS also supports *value-from-eprom-with-arithmetic* and *indexed-alternating-index-and-value*. Needed for some Denso and legacy EDC16 formats.
