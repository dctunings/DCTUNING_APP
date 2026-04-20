# CaracalTech training PDFs — practical tuning nuggets

Six PDFs downloaded from CaracalTech's CDN and extracted.

| File | Pages | Topic |
|------|-------|-------|
| `winols_part1.pdf` | 4 | WinOLS install + initial config + opening a file |
| `winols_part3.pdf` | 7 | Engine torque theory + Optimal Engine Torque table |
| `winols_part4_torque.pdf` | 12 | Finding Optimum Torque + Torque Request (Driver Wish) + Torque Limiters |
| `winols_part5_ignition.pdf` | 6 | Ignition system theory + knock + spark advance retard logic |
| `spark_advance.pdf` | 9 | Basic Spark Advance + Optimum Spark Advance tables with concrete data |
| `caracaltech_untitled.pdf` | 7 | **Map Pack (`.kp`) workflow** + table edit + file compare |

Part 2 and Part 6 are not publicly indexed — likely in their paid course.

---

## BIGGEST FIND — The Map Pack (`.kp`) format

WinOLS has a native importable/exportable format called a **Map Pack** (file extension `.kp`). A `.kp` file contains:
- **Map name** (e.g. "Optimal Spark Advance (deg BTDC) #5")
- **File address** where the map starts
- **Dimensions** (rows × cols)
- **Factor + offset** for the table values, X axis, Y axis
- **Unit labels** (e.g. "deg BTDC", "%", "Nm", "RPM")

Workflow:
1. Open any binary for that ECU family.
2. Drag-drop the `.kp` onto WinOLS, or Project → Import/Export → Import Map Pack.
3. WinOLS auto-labels all the maps in the binary using the pack.

**Why this matters for us:**

A `.kp` Map Pack is essentially the **exact file format for our Step 3 rule engine** — named, typed, dimensioned map definitions tied to ECU families. If we can read `.kp` files, we get instant access to thousands of pre-built ECU-specific map catalogs from CaracalTech and others. We skip reinventing the rule format.

**Action item:** reverse-engineer the `.kp` file binary format. It's ASCII-mostly based on the screenshots (visible strings like "Optimal Spark Advance (deg BTDC) #5" at fixed offsets).

---

## Concrete Bosch factor / dimension table

This is what we've been missing — real published factors for common Bosch maps.

### Bosch ME7 family (Audi TT example)

| Map | Rows × Cols | Table factor | Y axis factor | X axis factor | Y axis | X axis | Value unit |
|-----|-------------|--------------|---------------|---------------|--------|--------|------------|
| Optimum Engine Torque | 16 × 11 | *(not stated)* | 0.25 (raw→RPM) | 0.023408 (raw→%) | Engine RPM (400-6520) | Air filling % (5-160) | % of Nm |
| Torque Request (Driver Wish) "take-off" | 16 × 12 | **0.003052** | 0.001526 (raw→%) | 0.25 (raw→RPM) | Pedal % (0-100) | Engine RPM (600-6000) | % of Nm (0-100) |
| Torque Request "reverse gear" | 16 × 12 | 0.003052 | 0.001526 | 0.25 | Pedal % | Engine RPM | % of Nm |
| Basic Spark Advance | 16 × 12 | **0.75** | *(RPM raw)* | *(load raw)* | Engine RPM (500-6500) | Load (0-182) | deg BTDC (0-44) |
| Optimum Spark Advance | 16 × 12 | **0.75** | *(RPM raw)* | *(load raw)* | Engine RPM (500-6500) | Load (0-180) | deg BTDC (13-65) |

### Bosch MED17.7.3 (Mercedes C43 AMG 367hp example)

24 (!) "Optimal Spark Advance" tables in one binary, addresses stride 0x200 apart:

| Address | Map | Dims |
|---------|-----|------|
| 0x452F6 | Optimal Spark Advance #5 | 16 × 16 |
| 0x4534F6 | #6 | 16 × 16 |
| 0x4536F6 | #7 | 16 × 16 |
| 0x4538F6 | #8 | 16 × 16 |
| 0x453AF6 | #9 | 16 × 16 |
| ... (+14 more) | #10..#24 | 16 × 16 |

Stride = 0x200 bytes between headers, 16×16×2 = 512 bytes. Confirms **uint16 data**, back-to-back storage.

Plus scalar/vector support tables:
- 0x4A33A — Lower limit for low pass filtered boost control (1×1)
- 0x4A35C — Delta pressure limit under overcharging error (1×1)
- 0x4A68A — Characteristic widening error threshold (1×8)
- 0x404F24 — Torque monitoring (%) #7 (scalar 1×16)
- 0x4051AB — Torque monitoring (%) #8 (scalar 1×16)

---

## Torque-based ECU architecture (the 5-step chain)

This is the key mental model for identifying which maps matter in a modern torque-based ECU:

1. **Pedal position + RPM** → `Driver Wish / Torque Request` table → outputs **torque demand in Nm**
2. **Torque demand** → `Optimum Engine Torque` model → outputs required **air load**
3. **Air load** → air-mass model → outputs required **air mass**
4. **Air mass** → manifold-pressure model → outputs required **boost pressure**
5. **Boost pressure** → turbocharger model → outputs **turbine speed + wastegate** target

**Each step has its own table**. Changing just one without the ones above/below leaves the ECU fighting itself (e.g. raising torque request without raising Optimum Torque causes fuel consumption to go up with no power gain).

For tuning Stage 1 this means you MUST touch:
- Driver Wish
- Optimum Engine Torque  
- Target Cylinder Filling (air model)
- Boost target
- Torque limiters (often 3-5 of these per ECU)
- Fuel / injection (duration, rail pressure)
- Ignition (timing advance, knock correction)

---

## Spark advance behaviour laws (for detection rules)

- Values **increase with RPM** (more advance needed at higher RPM)
- Values **decrease with load** (less advance needed at high load, avoid knock)
- **Basic Spark Advance** table values are LOWER than **Optimum Spark Advance** table values at every cell
- ECU rides between Base and Optimum; knock sensor can retard BELOW Base, never above Optimum
- Typical range: 0-60° BTDC for petrol ECUs, with factor 0.75
- **4 Basic + 4 Optimum tables** is standard (different operating conditions)
- MED17.7.3 can have 24 Optimum variants (cylinder-specific or condition-specific)

**Detection rule (for our engine):**
> If 16×16 or 16×12 map with uint16 values, factor 0.75 yields 0-65 range, values rise along axis 1 and fall along axis 2 → candidate spark advance map.

---

## Torque request (Driver Wish) behaviour laws

- **Y axis: pedal position %** (0-100), factor 0.001526 for ME7
- **X axis: engine RPM**, factor 0.25 (= 4× scaling)
- **Table: % of Nm** (0-100), factor 0.003052
- Values rise monotonically with pedal AND with RPM
- Near 100% pedal, table plateaus at 100% across most of RPM range
- Usually 2 variants per ECU (take-off + reverse gear)

**Detection rule:**
> If 16×12 map with uint16 values, factor ~0.003 yields 0-100 range, monotonic-ascending with both axes, plateauing at 100 → candidate Driver Wish map.

---

## Optimum Engine Torque behaviour laws

- **Y axis: engine RPM** (400-6500 typical), factor 0.25
- **X axis: cylinder air filling %** (5-160 typical), factor 0.023408
- **Table: % of Nm** (peak ~95-100 at max load × mid-RPM)
- Values rise with load, peak at mid-to-high RPM, flat-ish plateau
- Typical pattern: value at (low RPM, low load) ≈ 2; value at (high RPM, high load) ≈ 95

**Detection rule:**
> If 16×11 map with uint16, factor-agnostic shape = monotonic ascending on both axes with plateau ≥90 in upper-right corner → candidate Optimum Torque map.

---

## WinOLS user-workflow cheat sheet

| Action | Key / menu |
|--------|-----------|
| Open config | F12 |
| Toggle hex ↔ decimal | 255 (button) |
| Search next table | F |
| Search previous table | Shift+F |
| Mark selection as table | K |
| Highlight differences | N (after Connect Window) |
| Undo cell to original | F11 |
| Increase selection | Shift + |
| Decrease selection | Shift - |
| Save remap | Ctrl+E (full version only) |
| Compare files | Selection → Connect window |

Critical demo limitations:
- No export
- No checksum correction
- No Map Pack creation (can only consume, not create)

---

## What this means for our WinOLS plan

**Step 1 (698-ECU catalog)** — still the first win. Now we know what to populate: each ECU's map pack `.kp` URL/availability + plugin DLL + checksum style.

**Step 2 (plugin-family routing)** — we now have concrete factors per Bosch sub-family (ME7 vs MED17 differ in Driver Wish factor, dimensions etc).

**Step 3 (Map Database rule engine)** — **biggest upgrade:** we can read `.kp` files directly as our rule format. This cuts weeks of rule-spec work. Implementation:
1. Reverse-engineer `.kp` binary format.
2. Build `.kp` reader in `src/main/mapPack.ts`.
3. Ship with 20-30 popular `.kp` files bundled (ME7, MED17, EDC15, EDC16, EDC17).
4. Let users drop extra `.kp` packs into a config dir.

**Step 4 (20 missing features)** — Compare-two-files with N-key highlighting, Change Relative/Absolute edits, and F11 undo-to-original are all basic UI ops we should have. Plus: scalar (1×1) and vector (1×N) map support, which we currently don't handle (we assume 2D).

---

## Next concrete action

Either:
- **(a)** Start Step 1 of the plan: wire the 698-ECU catalog so the app auto-detects ECU family. Uses `docs/winols/ecus_full_5.x.json`. Small, visible change.
- **(b)** Reverse-engineer one `.kp` file first, to confirm it's parseable. Would let us skip our own rule format entirely.

(a) is safer and smaller. (b) is higher-leverage but riskier if `.kp` turns out to be encrypted/proprietary.

Sources:
- https://caracaltech.com/articles/article/64a140be21556593a53a37e3 (WinOLS Training index)
- https://caracaltech.com/articles/article/637c6d1a7569f8e42eab6dfd (EDC 15/16/17 guide)
- PDFs cached locally in this folder.
