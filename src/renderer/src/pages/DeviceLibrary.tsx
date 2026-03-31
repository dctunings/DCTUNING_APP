import { useState, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tier = 'hobby' | 'budget' | 'semi-pro' | 'professional' | 'dealer' | 'diagnostics'
type Cap  = 'flashRead' | 'flashWrite' | 'clone' | 'eeprom' | 'checksum' | 'dtc' | 'liveData' | 'immo' | 'coding'
type Conn = 'obd2' | 'bench' | 'boot' | 'bdm' | 'jtag' | 'tricore'
// How this device integrates with the DCTuning desktop app
type AppCompat =
  | 'direct-obd'    // App connects via serial port (ELM327 AT commands) — DTC + live data
  | 'direct-j2534'  // App detects device in Windows J2534 registry — J2534 PassThru page
  | 'files-only'    // Use device's own software to read/write ECU; load binary into Tune Manager
  | 'diagnostics'   // Live data + DTC only; no flash capability

interface Device {
  id: string
  name: string
  manufacturer: string
  tier: Tier
  priceMin: number
  priceMax: number
  iface: string[]
  j2534: boolean
  discontinued: boolean
  connections: Partial<Record<Conn, boolean>>
  caps: Partial<Record<Cap, boolean | 'auto' | 'manual' | 'unreliable'>>
  ecuFamilies: string[]
  vehicles: string[]
  software: string[]
  notes: string
  appCompat: AppCompat
  appCompatNote: string
  recommended?: string[]  // use-case tags
}

// ─── Device data ──────────────────────────────────────────────────────────────
const DEVICES: Device[] = [
  {
    id: 'kess3',
    name: 'KESS3',
    manufacturer: 'Alientech',
    tier: 'professional',
    priceMin: 1800, priceMax: 2400,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: false, immo: true },
    ecuFamilies: [
      'Bosch ME7 / ME7.5 (VAG/BMW petrol)',
      'Bosch ME9 / MED9 (VAG FSI)',
      'Bosch MED17 / MED17.7 (VAG/BMW petrol)',
      'Bosch MG1 (VAG/BMW post-2018)',
      'Bosch EDC15 (VAG/BMW diesel pre-2006)',
      'Bosch EDC16 (VAG/BMW/Merc diesel)',
      'Bosch EDC17 / EDC17CP (VAG/BMW/Mercedes/JLR diesel)',
      'Continental SIMOS 10/18 (VAG petrol)',
      'Siemens SIM2K (VAG petrol)',
      'Siemens PCR2.1 (VAG TDI)',
      'Siemens SID208 / SID310 (Volvo/Ford diesel)',
      'Siemens SID807EVO (PSA diesel)',
      'Delphi DCM3.5 / DCM6.1 / DCM6.2 (Renault/Nissan/PSA)',
      'Marelli MJD6 / MJD8 / MT86 (Fiat/Alfa/Jeep)',
      'Denso SH705x / SkyActiv (Toyota/Mazda)',
      'Honda PGM-FI / EMS S7',
      'Mitsubishi MH82x diesel',
      'Subaru Denso',
      'Ford T-PROT / Power Stroke',
      'Valeo EMS3120 (Renault/Nissan petrol)',
      'ZF 8HP / DSG DQ200/250/500 (TCU)',
      'Nissan ME7 / Bosch ME9.7',
      'Hitachi SH7 (Nissan/Mitsubishi)',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Ford', 'Renault', 'PSA', 'Fiat', 'Alfa', 'Jeep', 'Volvo', 'Jaguar/Land Rover', 'Subaru', 'Toyota', 'Mazda', 'Honda', 'Nissan', 'Mitsubishi', 'Hyundai/Kia'],
    software: ['KESS3 Suite', 'ECM Titanium', 'WinOLS (files)', 'Swiftec (files)'],
    notes: 'All-in-one successor to KessV2 and K-TAG. Combines OBD and bench/boot/BDM in one device. Token system for OBD reads. Master license required for slave distribution. Widest coverage of any single Alientech device.',
    appCompat: 'files-only',
    appCompatNote: 'Use KESS3 Suite to read the ECU binary. Load the .bin into DCTuning Tune Manager for analysis and modification, then write back via KESS3 Suite. The Remap Builder will auto-detect the ECU family from the binary.',
    recommended: ['All makes general workshop', 'VAG specialist', 'Best all-round investment'],
  },
  {
    id: 'ktag',
    name: 'K-TAG',
    manufacturer: 'Alientech',
    tier: 'professional',
    priceMin: 1400, priceMax: 2000,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { bench: true, boot: true, bdm: true, jtag: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: false, immo: true },
    ecuFamilies: [
      'Bosch ME7 / ME7.5 (VAG/BMW bench)',
      'Bosch MED17 / MED17.7 (VAG/BMW bench/BDM)',
      'Bosch MG1 (VAG/BMW bench — Tricore BSL)',
      'Bosch EDC16 / EDC17 (VAG/BMW bench)',
      'Bosch EDC17CP (JLR bench)',
      'Continental SIMOS 10/18 (VAG bench)',
      'Siemens SIM2K (VAG bench)',
      'Siemens PCR2.1 (VAG bench)',
      'Siemens SID208 / SID310 (Volvo/Ford bench)',
      'Delphi DCM3.5 / DCM6.1 / DCM6.2 (bench)',
      'Marelli MJD6 / MJD8 / MT86 (bench)',
      'Denso SH705x / SH72xx (bench)',
      'Mitsubishi MH82x / MH Diesel (bench)',
      'Ford T-PROT / Power Stroke (bench)',
      'ZF 8HP / Getrag DCT (TCU bench)',
      'NXP MPC5xx / Infineon Tricore (direct)',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Ford', 'Fiat', 'Alfa', 'Porsche', 'Lamborghini', 'Jaguar/Land Rover', 'Volvo', 'Toyota', 'Nissan'],
    software: ['K-TAG Suite', 'KESS3 Suite', 'WinOLS (files)', 'Swiftec (files)'],
    notes: 'Bench/boot/BDM/JTAG specialist — no OBD port. Best-in-class for ECU-off bench work with 600+ cable adapters. Typically paired with KESS3 (OBD) for full workshop coverage.',
    appCompat: 'files-only',
    appCompatNote: 'Use K-TAG / KESS3 Suite for bench read/write. Import the resulting .bin into DCTuning Tune Manager. Remap Builder detects the ECU family automatically.',
    recommended: ['Bench specialist', 'Locked ECU bypass', 'Pair with KESS3'],
  },
  {
    id: 'flex',
    name: 'Flex',
    manufacturer: 'Magic Motorsport',
    tier: 'professional',
    priceMin: 2000, priceMax: 2800,
    iface: ['USB', 'WiFi'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, jtag: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: true, immo: true },
    ecuFamilies: [
      'Bosch ME7 / ME7.5 / ME9 / MED9',
      'Bosch MED17 / MED17.7 / MEDC17',
      'Bosch MG1 (Tricore BSL)',
      'Bosch EDC15 / EDC16 / EDC17 / EDC17CP (JLR)',
      'Continental SIMOS 7 / 10 / 18',
      'Siemens SIM2K / PCR2.1',
      'Siemens SID208 / SID807EVO / SID310',
      'Delphi DCM3.5 / DCM6.1 / DCM6.2',
      'Marelli MJD6 / MJD8 / MT86',
      'Valeo EMS3120 / EMS S7',
      'Denso SH705x / SH72xx / SkyActiv',
      'Honda PGM-FI',
      'Mitsubishi MH82x / MH Diesel',
      'Subaru Denso',
      'Ford T-PROT / Power Stroke',
      'Nissan ME7 / Bosch ME9.7',
      'ZF 8HP / DSG DQ200/250/500 (TCU)',
      'Mercedes CRD3 diesel',
      'Jeep/FCA EDC17',
      'PSA DCM6.2',
      'Renault DC4',
      'NXP MPC5xx / Infineon Tricore (direct)',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Ford', 'Renault', 'PSA', 'Fiat', 'Alfa', 'Jeep', 'Volvo', 'Jaguar/Land Rover', 'Subaru', 'Toyota', 'Mazda', 'Honda', 'Nissan', 'Mitsubishi', 'Hyundai/Kia'],
    software: ['Flex Suite', 'WinOLS (files)', 'Swiftec (files)', 'ECM Titanium (files)'],
    notes: 'Widest single-device coverage on the market. Modular license system — buy brand/protocol packs as needed. Built-in WiFi for cable-free placement. Best choice for post-2018 ARM/Tricore ECUs. Covers all families in DCTuning Remap Builder.',
    appCompat: 'files-only',
    appCompatNote: 'Use Flex Suite to read/write the ECU. Load the .bin into DCTuning Tune Manager — Remap Builder will auto-detect from all 36 supported ECU families.',
    recommended: ['All makes general workshop', 'Best all-in-one choice', 'Post-2018 ECU specialist'],
  },
  {
    id: 'autotuner',
    name: 'Autotuner Tool',
    manufacturer: 'Autotuner',
    tier: 'professional',
    priceMin: 1500, priceMax: 2200,
    iface: ['USB', 'WiFi'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: true },
    ecuFamilies: [
      'Bosch ME7 / MED17 / MG1 (VAG/BMW)',
      'Bosch EDC16 / EDC17 (VAG/BMW)',
      'Continental SIMOS 10/18 (VAG)',
      'Siemens SIM2K / PCR2.1 (VAG)',
      'Siemens SID208 / SID807EVO (Volvo/PSA)',
      'Delphi DCM3.5 / DCM6.1 / DCM6.2',
      'Valeo EMS3120 (Renault/Nissan)',
      'Marelli MJD6 / MJD8 (Fiat/Alfa)',
      'Denso SH705x (Toyota)',
      'ZF 8HP TCU (BMW/VAG)',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Ford', 'Renault', 'PSA', 'Fiat', 'Alfa', 'Volvo'],
    software: ['Autotuner Suite', 'WinOLS (files)', 'Swiftec (files)'],
    notes: 'Best-in-class for French market ECUs (Renault/PSA Valeo/Sagem/Delphi). Built-in WiFi. Cloud file processing available. Slave/master hierarchy for resellers.',
    appCompat: 'files-only',
    appCompatNote: 'Use Autotuner Suite to read/write ECU. Import .bin into DCTuning Tune Manager — Remap Builder auto-detects the ECU family.',
    recommended: ['French/PSA specialist', 'Renault specialist', 'Valeo/Sagem expert'],
  },
  {
    id: 'newgenius',
    name: 'New Genius',
    manufacturer: 'Dimsport',
    tier: 'professional',
    priceMin: 1600, priceMax: 2500,
    iface: ['USB', 'WiFi'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: true, immo: true },
    ecuFamilies: [
      'Bosch ME7 / ME7.5 (VAG/BMW petrol)',
      'Bosch MED17 / MEDC17 (VAG/BMW)',
      'Bosch MG1 (VAG/BMW post-2018)',
      'Bosch EDC15 / EDC16 / EDC17 (VAG/BMW/Merc)',
      'Continental SIMOS 10/18 (VAG)',
      'Siemens SIM2K / PCR2.1 (VAG)',
      'Siemens SID208 / SID807EVO (Volvo/PSA)',
      'Delphi DCM3.5 / DCM6.1 / DCM6.2 (Renault/PSA)',
      'Valeo EMS3120 / EMS S7 (Renault)',
      'Marelli MJD6 / MJD8 / MT86 (Fiat/Alfa/Jeep)',
      'Denso SH705x / SkyActiv (Toyota/Mazda)',
      'ZF 8HP / DSG (TCU)',
      'Mercedes CRD3 diesel',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Ford', 'Renault', 'PSA', 'Fiat', 'Alfa', 'Jeep', 'Volvo', 'Toyota', 'Mazda'],
    software: ['New Genius Suite (Race EVO)', 'WinOLS (files)', 'Swiftec (files)'],
    notes: 'Italian-made professional tool widely used across Europe. Very popular in Ireland and UK workshops. Single device for OBD and bench — modular slave/master licence system similar to KESS3. Excellent Fiat/Alfa/Marelli and French brand coverage. WiFi built-in.',
    appCompat: 'files-only',
    appCompatNote: 'Use New Genius Race EVO software to read/write the ECU. Import the .bin into DCTuning Tune Manager — Remap Builder auto-detects the ECU family.',
    recommended: ['All makes EU workshop', 'Fiat/Alfa/Marelli specialist', 'French brands (Renault/PSA)'],
  },
  {
    id: 'cmdflashstation',
    name: 'FlashStation',
    manufacturer: 'CMD',
    tier: 'dealer',
    priceMin: 2500, priceMax: 3500,
    iface: ['USB', 'Ethernet'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: true, coding: true },
    ecuFamilies: ['Bosch MED17 / MEDC17 / MG1 (BMW/VAG)', 'Bosch EDC16 / EDC17 (BMW/VAG/Merc)', 'Continental SIMOS 10/18 (VAG)', 'Delphi DCM6.1 / DCM6.2', 'Siemens PCR2.1 (VAG TDI)', 'Marelli MJD8 / MT86 (Fiat/Alfa)', 'Bosch DDE / DME (BMW — deep coverage N/B series)'],
    vehicles: ['BMW', 'VAG', 'Mercedes', 'Ford', 'Renault', 'PSA', 'Fiat', 'Opel'],
    software: ['CMD FlashStation SW', 'OEM software via J2534 (BMW ISTA, ODIS, Ford IDS)'],
    notes: 'Professional standalone bench flasher — operates without a laptop during read/write. Very strong BMW DDE/DME coverage. Communicates via its own proprietary CMDFlash protocol — does NOT register a J2534 DLL in Windows despite its professional tier.',
    appCompat: 'files-only',
    appCompatNote: 'Use CMD FlashStation Suite to read/write the ECU. Import the resulting .bin into DCTuning Tune Manager. Not detectable via J2534 PassThru scanner.',
    recommended: ['BMW specialist', 'Dealer / OEM reprogramming'],
  },
  {
    id: 'cmdflash',
    name: 'CMDFlash',
    manufacturer: 'CMD',
    tier: 'professional',
    priceMin: 1200, priceMax: 1800,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: true },
    ecuFamilies: ['Bosch MED17 / MEDC17 (BMW/VAG)', 'Bosch MG1 (BMW/VAG)', 'Bosch EDC17 (BMW/VAG/Merc)', 'Continental SIMOS 10/18 (VAG)', 'Delphi DCM6.1 / DCM6.2', 'Marelli MJD8 / MT86'],
    vehicles: ['BMW', 'VAG', 'Mercedes', 'Ford', 'Opel'],
    software: ['CMDFlash Suite'],
    notes: 'USB laptop-based version of CMD. Same deep BMW coverage as FlashStation at lower cost. No J2534 on this model.',
    appCompat: 'files-only',
    appCompatNote: 'Use CMDFlash Suite for bench read/write. Import .bin into DCTuning Tune Manager.',
    recommended: ['BMW specialist'],
  },
  {
    id: 'bflash',
    name: 'BFlash',
    manufacturer: 'BFlash',
    tier: 'professional',
    priceMin: 1500, priceMax: 2000,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, bdm: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: false },
    ecuFamilies: ['Bosch MSD80/81/85/87 (BMW N43/N45/N47/N54/N55/N57)', 'Bosch MEVD17.2 / MG1 (BMW B47/B48/B58/S55/S58)', 'Bosch MEDC17 / MED17 (VAG/BMW)', 'Bosch EDC17 (BMW/VAG diesel)', 'Continental SIMOS 18 (VAG)'],
    vehicles: ['BMW', 'VAG', 'Mercedes'],
    software: ['BFlash Suite', 'WinOLS (files)'],
    notes: 'German-engineered, niche but highly respected for BMW. Extremely deep BMW DME/DDE coverage (N43/N45/N47/N54/N55/N57/B47/B48/B58/S55/S58). Narrower than Flex but more reliable for BMW edge cases.',
    appCompat: 'files-only',
    appCompatNote: 'Use BFlash Suite for read/write. Import resulting binary into DCTuning Tune Manager for map editing.',
    recommended: ['BMW specialist'],
  },
  {
    id: 'pcmflash',
    name: 'PCMFlash',
    manufacturer: 'PCMFlash',
    tier: 'semi-pro',
    priceMin: 300, priceMax: 500,
    iface: ['USB (via any J2534 adapter)'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, eeprom: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: [
      'Denso SH705x — Toyota, Subaru (OBD flash)',
      'Denso SH72xx — Nissan, Toyota (OBD flash)',
      'Mitsubishi Electric SH7 — Mitsubishi, Proton',
      'Delphi/Delco E38/E40/E67/E78 — GM LS2/LS3/LS7/LY6 (OBD)',
      'Continental SIMTEC 75/76 — Opel/Vauxhall (OBD)',
      'Bosch ME7.9.7 — Honda K/R-series (OBD)',
      'Visteon EEC-V — Ford legacy (OBD)',
      'Bosch EDC16 — select VAG/BMW (OBD, limited protocols)',
      'Siemens SID — select Volvo/Ford (OBD)',
    ],
    vehicles: ['Toyota', 'Subaru', 'Honda', 'Nissan', 'Mitsubishi', 'GM/Opel', 'Ford (legacy)', 'Volvo (select)'],
    software: ['PCMFlash v1.27+'],
    notes: 'As of v1.27, PCMFlash is a full J2534 application — it works with any J2534-compliant adapter registered in Windows (Tactrix Openport 2.0, SM2 Pro, CarDAQ-Plus 3, CMD FlashStation, or PCMTuner). No longer tied to a single piece of hardware. Best value for Japanese platforms (Toyota/Subaru/Honda) and GM/Opel OBD flashing. OBD only — no bench or boot capability.',
    appCompat: 'files-only',
    appCompatNote: 'PCMFlash v1.27 reads and writes the ECU via your J2534 adapter. Once done, import the .bin into DCTuning Tune Manager for map editing, then write back via PCMFlash.',
    recommended: ['Toyota/Subaru OBD flash', 'GM/Opel OBD flash', 'Honda K-series', 'Best value J2534 flash software'],
  },
  {
    id: 'tactrix',
    name: 'Openport 2.0',
    manufacturer: 'Tactrix',
    tier: 'semi-pro',
    priceMin: 150, priceMax: 200,
    iface: ['USB'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: ['Denso SH705x (Subaru/Toyota)', 'Denso SH72xx', 'Bosch ME7.9.7 (Honda)', 'Mitsubishi Electric'],
    vehicles: ['Subaru', 'Toyota', 'Honda', 'Mitsubishi'],
    software: ['PCMFlash v1.27', 'ECUFlash (open source)', 'RomRaider (open source)', 'EcuTek ProECU', 'Cobb Accessport (development)', 'Any J2534 app'],
    notes: 'Industry standard J2534 device for Subaru/Toyota/Honda. Full J2534-1 compliant. Open source software ecosystem. Cannot do bench/boot — OBD only. Best J2534 hardware choice.',
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers in Windows J2534 registry — appears in DCTuning J2534 PassThru device scanner. App can use it for OBD2 diagnostics. Flash ops require PCMFlash / ECUFlash software.',
    recommended: ['Subaru/Toyota specialist', 'Open source tuning'],
  },
  {
    id: 'ecutek',
    name: 'ProECU',
    manufacturer: 'EcuTek',
    tier: 'professional',
    priceMin: 400, priceMax: 800,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'auto', dtc: true, liveData: true },
    ecuFamilies: ['Denso SH705x (Subaru EJ/FA/FB)', 'Denso SH72xx (Nissan)', 'Bosch ME7.9.7 (Honda)', 'Keihin (Honda)'],
    vehicles: ['Subaru', 'Nissan', 'Honda', 'Toyota', 'Mitsubishi'],
    software: ['EcuTek ProECU', 'RaceROM (Subaru)'],
    notes: 'Deep but narrow. Best-in-class Subaru specialist with RaceROM custom feature injection. License-per-vehicle-brand model. OBD only — no bench capability.',
    appCompat: 'files-only',
    appCompatNote: 'Use EcuTek ProECU software for read/write. Import ECU binary into DCTuning Tune Manager for map analysis.',
    recommended: ['Subaru specialist', 'Nissan specialist'],
  },
  {
    id: 'hptuners',
    name: 'MPVI3',
    manufacturer: 'HP Tuners',
    tier: 'professional',
    priceMin: 500, priceMax: 800,
    iface: ['USB', 'Bluetooth'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'auto', dtc: true, liveData: true },
    ecuFamilies: ['GM E38/E40/E67/E78/E92 (LS/LT)', 'Ford PCM (Coyote/EcoBoost/Powerstroke)', 'Chrysler NGC/GPEC', 'GM Duramax (LML/L5P)'],
    vehicles: ['GM/Chevrolet', 'Ford (North America)', 'Dodge/Chrysler/Jeep'],
    software: ['HP Tuners VCM Suite'],
    notes: 'Dominant in North American muscle car / truck tuning. Credit system per VIN. Not suitable for European vehicles. Bluetooth logging module available.',
    appCompat: 'files-only',
    appCompatNote: 'Use HP Tuners VCM Suite for read/write. Import .hpt or extracted binary into DCTuning Tune Manager for analysis.',
    recommended: ['GM LS/LT specialist', 'Ford Coyote/EcoBoost specialist'],
  },
  {
    id: 'obdlink',
    name: 'OBDLink MX+',
    manufacturer: 'ScanTool.net',
    tier: 'diagnostics',
    priceMin: 80, priceMax: 160,
    iface: ['Bluetooth', 'USB (EX model)'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: false, flashWrite: false, clone: false, checksum: false, dtc: true, liveData: true },
    ecuFamilies: ['All OBD2-compliant ECUs'],
    vehicles: ['All makes (1996+ USA, 2001+ EU diesel, 2003+ EU petrol)'],
    software: ['OBDLink app', 'OBD Fusion', 'ForScan (Ford)', 'BimmerCode (BMW)', 'Torque Pro', 'Any ELM327 app'],
    notes: 'Best-in-class diagnostics — NOT a tuning tool. STN2120 chip much faster than ELM327. Supports Ford MS-CAN and GM SW-CAN (rare). Perfect for live data logging and DTC reading.',
    appCompat: 'direct-obd',
    appCompatNote: 'Connects via Bluetooth to DCTuning ECU Scanner and Voltage Meter pages. Full DTC read/clear, all live PIDs. ELM327-compatible so it works out of the box.',
    recommended: ['Diagnostics / fault reading', 'Data logging'],
  },
  {
    id: 'cardaqplus',
    name: 'CarDAQ-Plus 3',
    manufacturer: 'Opus IVS (Drew Technologies)',
    tier: 'dealer',
    priceMin: 800, priceMax: 1500,
    iface: ['USB', 'Ethernet'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: false, dtc: true, liveData: true, coding: true },
    ecuFamilies: ['All OEM ECUs via OEM software'],
    vehicles: ['All makes with OEM software subscription'],
    software: ['BMW ISTA/P', 'VW/Audi ODIS', 'Ford IDS/FDRS', 'GM GDS2/TIS2Web', 'Mercedes Xentry/DAS', 'Any J2534 software'],
    notes: 'Industry-standard J2534 device for independent reprogramming shops. Used with OEM dealer software portals. Full J2534-1 and J2534-2 compliant. Widest OEM software compatibility.',
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers in Windows J2534 registry — detectable in DCTuning J2534 PassThru scanner. App can use it for OBD2 diagnostics. OEM reprogramming requires separate OEM software portals.',
    recommended: ['OEM reprogramming', 'Independent dealer workshop'],
  },
  {
    id: 'fgtech',
    name: 'Galletto 4 Master',
    manufacturer: 'FGTech',
    tier: 'budget',
    priceMin: 80, priceMax: 200,
    iface: ['USB'],
    j2534: false,
    discontinued: true,
    connections: { obd2: true, bench: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'unreliable', dtc: true },
    ecuFamilies: ['Bosch EDC15 (pre-2008)', 'Bosch EDC16 (pre-2010)', 'Siemens PPD1.x (older VAG)', 'Marelli IAW older'],
    vehicles: ['VAG (pre-2012)', 'BMW (pre-2010)', 'Fiat (older)'],
    software: ['FGTech Galletto Software'],
    notes: '⚠ WARNING: High counterfeit rate — most units on eBay/AliExpress are clones. Clone units have unreliable checksum correction and high brick risk. Only useful for pre-2008 ECUs via OBD. Real units have authentication chip. NOT recommended for production use.',
    appCompat: 'files-only',
    appCompatNote: 'Use FGTech software to read ECU binary. Import into DCTuning Tune Manager. Not recommended for customer vehicles.',
    recommended: [],
  },
  {
    id: 'mpps',
    name: 'MPPS V21',
    manufacturer: 'MPPS',
    tier: 'hobby',
    priceMin: 30, priceMax: 80,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'unreliable', dtc: true },
    ecuFamilies: ['Bosch EDC15 (pre-2006 only)'],
    vehicles: ['VAG (pre-2006 only)'],
    software: ['MPPS Software (pirated)'],
    notes: '⚠ WARNING: Almost all units are counterfeits. Extremely high ECU brick rate on anything post-2008. Checksum correction unreliable on clones. For experimentation on scrap ECUs only — never use on customer vehicles.',
    appCompat: 'files-only',
    appCompatNote: 'Produces a raw .bin file. Can be imported into Tune Manager — but do NOT use on customer ECUs.',
    recommended: [],
  },
  {
    id: 'elm327',
    name: 'ELM327 (Generic)',
    manufacturer: 'Various clone manufacturers',
    tier: 'hobby',
    priceMin: 5, priceMax: 30,
    iface: ['USB', 'Bluetooth', 'WiFi'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: false, flashWrite: false, clone: false, checksum: false, dtc: true, liveData: true },
    ecuFamilies: ['OBD2 diagnostics only'],
    vehicles: ['All OBD2 vehicles (diagnostics only)'],
    software: ['Torque', 'OBD Fusion', 'Any ELM327 app'],
    notes: '⚠ WARNING: NEVER use for ECU flashing. Many clones falsely advertise tuning capability — this is dangerous and will brick ECUs. Genuine ELM327 chips are rare in cheap adapters — most are fake v2.1 chips. Diagnostics only. Use OBDLink MX+ instead.',
    appCompat: 'direct-obd',
    appCompatNote: 'Connects via serial/Bluetooth to DCTuning ECU Scanner and Voltage Meter. Diagnostics only — DTC read/clear and live PIDs. No flash capability.',
    recommended: [],
  },
  // ── New devices ─────────────────────────────────────────────────────────────
  {
    id: 'kessv2',
    name: 'KessV2 (incl. clones)',
    manufacturer: 'Alientech / Clone market',
    tier: 'semi-pro',
    priceMin: 30, priceMax: 600,
    iface: ['USB'],
    j2534: false,
    discontinued: true,
    connections: { obd2: true, bench: true, boot: true },
    caps: { flashRead: true, flashWrite: true, clone: false, eeprom: true, checksum: 'auto', dtc: true, liveData: false, immo: true },
    ecuFamilies: [
      'Bosch ME7 / ME7.5 (VAG/BMW petrol — OBD)',
      'Bosch ME9 / MED9 (VAG FSI — OBD)',
      'Bosch MED17 (VAG/BMW — OBD & Boot)',
      'Bosch EDC15 (VAG/BMW diesel pre-2006 — OBD)',
      'Bosch EDC16 (VAG/BMW/Merc — OBD)',
      'Bosch EDC17 (VAG/BMW — OBD & Boot, limited)',
      'Continental SIMOS 7–12 (VAG — OBD)',
      'Siemens SIM2K (VAG — OBD)',
      'Siemens PCR2.1 (VAG TDI — OBD)',
      'Delphi DCM3.5 / DCM6.2 (Renault/Nissan — OBD)',
      'Marelli MJD6 / MJD8 (Fiat/Alfa — OBD)',
      'Denso SH705x (Toyota/Subaru — OBD)',
      'Bosch DDE / DME (BMW — OBD)',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Ford', 'Renault', 'PSA', 'Fiat', 'Alfa', 'Volvo', 'Subaru', 'Toyota'],
    software: ['Alientech ECM Suite (discontinued)', 'KessV2 Manager (discontinued)', 'WinOLS (file editing)'],
    notes: `Predecessor to KESS3 — officially discontinued by Alientech in 2022. No new protocol updates from Alientech.\n\n✅ CLONES & DCTuning APP: KessV2 clones are very common (most units on eBay/AliExpress are clones). The good news — DCTuning only needs the .bin file the device produces. If your KessV2 (genuine OR clone) can successfully READ the ECU binary, that file will work perfectly in DCTuning Tune Manager and Remap Builder. The clone risk is on the WRITE step — clone checksum correction can be unreliable on EDC17/MED17, which can brick ECUs. Use a professional tool for the write-back on customer vehicles.\n\nGenuine units have Alientech authentication and serial number — verify at alientech.it if unsure.`,
    appCompat: 'files-only',
    appCompatNote: '✅ Works with DCTuning — genuine and clone units. Use KessV2 Manager / ECM Suite to read the ECU. Import the .bin into Tune Manager. Remap Builder auto-detects ME7, EDC15, EDC16, EDC17, MED17, SIMOS, PCR2.1 and more. For write-back on customer ECUs, use a professional tool with reliable checksum correction.',
    recommended: ['Already owned — works fine for reads', 'Upgrade to KESS3 for new installs'],
  },
  {
    id: 'foxflash',
    name: 'Foxflash',
    manufacturer: 'Foxflash',
    tier: 'semi-pro',
    priceMin: 280, priceMax: 450,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: false, immo: true },
    ecuFamilies: [
      'Bosch MED17 / MEDC17 (VAG/BMW — OBD & bench)',
      'Bosch MG1 (VAG/BMW — Tricore BSL)',
      'Bosch EDC16 / EDC17 (VAG/BMW — OBD & bench)',
      'Continental SIMOS 10/18 (VAG — OBD & bench)',
      'Siemens PCR2.1 (VAG TDI — OBD)',
      'Delphi DCM3.5 / DCM6.2 (Renault/Nissan)',
      'Marelli MJD6 / MJD8 / MT86 (Fiat/Alfa)',
      'Denso SH705x (Toyota/Subaru)',
      'ZF 8HP / DSG DQ200/250 (TCU)',
      'Bosch ME7 / ME9 (VAG/BMW petrol)',
    ],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Fiat', 'Alfa', 'Renault', 'Nissan', 'Toyota', 'Subaru'],
    software: ['Foxflash Software (Windows)'],
    notes: 'Relatively new Chinese device that has gained a strong reputation for VAG/BMW bench work. Genuine Tricore BSL support (unlike many budget tools that claim it). Good checksum auto-correction on supported ECUs. Not a clone of another device — its own ecosystem. TCU coverage (ZF 8HP, DSG) is a standout at this price point. Growing ECU coverage with regular software updates.',
    appCompat: 'files-only',
    appCompatNote: 'Use Foxflash software to read the ECU binary (OBD or bench). Import the .bin into DCTuning Tune Manager — Remap Builder auto-detects MED17, EDC17, SIMOS18, MG1 and other supported families.',
    recommended: ['Budget VAG/BMW bench work', 'TCU flashing (ZF 8HP / DSG)', 'MG1 Tricore BSL'],
  },
  {
    id: 'renolink',
    name: 'Renolink OBD2',
    manufacturer: 'Renolink',
    tier: 'budget',
    priceMin: 25, priceMax: 60,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, eeprom: false, checksum: 'manual', dtc: true, liveData: false, immo: true },
    ecuFamilies: [
      'Valeo EMS3120 / EMS3132 (Renault/Nissan petrol)',
      'Siemens SID310 / SID305 (Renault diesel)',
      'Delphi DCM3.5 (Renault diesel)',
      'Renault Renix / UCH (older models)',
    ],
    vehicles: ['Renault', 'Dacia', 'Nissan (Renault platform)'],
    software: ['Renolink Software (Windows freeware)'],
    notes: 'Cheap and narrow — Renault/Dacia specialist only. Best known for UCH (under-dash module) programming and key/immo reset on Renault. Flash read/write on Valeo EMS3120 (Clio/Megane/Laguna petrol) and Siemens SID (diesel). Freeware software. Useful budget tool if you work on a lot of Renaults.',
    appCompat: 'files-only',
    appCompatNote: 'Use Renolink software to read the ECU binary. Import into DCTuning Tune Manager — Remap Builder detects Valeo EMS3120, Siemens SID310, and Delphi DCM3.5 families automatically.',
    recommended: ['Renault/Dacia specialist', 'Budget Renault immo/UCH tool'],
  },
  {
    id: 'pcmtuner',
    name: 'PCMTuner',
    manufacturer: 'PCMTuner',
    tier: 'semi-pro',
    priceMin: 180, priceMax: 300,
    iface: ['USB'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, eeprom: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: [
      'Denso SH705x — Toyota, Subaru (OBD flash)',
      'Denso SH72xx — Nissan, Toyota (OBD flash)',
      'Mitsubishi Electric SH7 — Mitsubishi, Proton',
      'Delphi/Delco E38/E40/E67/E78 — GM LS2/LS3/LS7/LY6 (OBD)',
      'Continental SIMTEC 75/76 — Opel/Vauxhall (OBD)',
      'Bosch ME7.9.7 — Honda K/R-series (OBD)',
      'Visteon EEC-V — Ford legacy (OBD)',
      'Bosch EDC16 — select VAG/BMW (OBD, limited protocols)',
      'Siemens SID — select Volvo/Ford (OBD)',
    ],
    vehicles: ['Toyota', 'Subaru', 'Honda', 'Nissan', 'Mitsubishi', 'GM/Opel', 'Ford (legacy)', 'Volvo (select)'],
    software: ['PCMFlash v1.27 (included licence)'],
    notes: 'PCMTuner is the proprietary USB dongle that comes bundled with a PCMFlash v1.27 licence. PCMFlash v1.27 is now a J2534 application, so PCMTuner also ships with a J2534 DLL that registers in Windows — meaning it works as a J2534 adapter for PCMFlash alongside any other J2534 software. Identical ECU read/write coverage to using PCMFlash with a Tactrix Openport 2.0 or SM2 Pro. OBD2 only — no bench or boot capability.',
    appCompat: 'direct-j2534',
    appCompatNote: 'PCMTuner registers its J2534 DLL in Windows — detectable in DCTuning J2534 PassThru scanner. App uses it for OBD2 diagnostics. For ECU flash read/write, use PCMFlash v1.27 (included), then import the .bin into DCTuning Tune Manager.',
    recommended: ['Toyota/Subaru OBD flash', 'GM/Opel OBD flash', 'All-in-one PCMFlash bundle'],
  },
  {
    id: 'kt200',
    name: 'KT200',
    manufacturer: 'KT200',
    tier: 'semi-pro',
    priceMin: 300, priceMax: 600,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: false, immo: true },
    ecuFamilies: ['Bosch EDC16 / EDC17 (VAG/BMW/Merc)', 'Bosch MED17 (VAG petrol)', 'Continental SIMOS 8–12 (VAG)', 'Siemens PCR2.1 (VAG TDI)', 'Marelli MJD6 / MJD8 (Fiat/Alfa)', 'Delphi DCM3.5 (Renault/Nissan)', 'Denso SH705x (Toyota)'],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Fiat', 'Renault', 'Toyota'],
    software: ['KT200 Software (Windows)'],
    notes: 'Chinese budget bench tool — not a clone of another device, its own legitimate product. Good coverage for common Bosch EDC17/MED17 ECUs via OBD and bench. No Tricore BSL (see KT200 II). Checksum auto-correct works reliably for supported ECUs. Avoid unbranded resellers — buy from official KT200 distributors only.',
    appCompat: 'files-only',
    appCompatNote: 'Use KT200 software to read the ECU binary. Import the .bin into DCTuning Tune Manager for map editing and analysis.',
    recommended: ['Budget VAG bench work', 'Bosch EDC17/MED17 specialist'],
  },
  {
    id: 'kt200ii',
    name: 'KT200 II',
    manufacturer: 'KT200',
    tier: 'semi-pro',
    priceMin: 450, priceMax: 750,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true, bench: true, boot: true, tricore: true },
    caps: { flashRead: true, flashWrite: true, clone: true, eeprom: true, checksum: 'auto', dtc: true, liveData: false, immo: true },
    ecuFamilies: ['Bosch EDC16 / EDC17 (VAG/BMW/Merc)', 'Bosch MED17 / MEDC17 (VAG)', 'Bosch MG1 (VAG/BMW — Tricore BSL)', 'Continental SIMOS 8–18 (VAG)', 'Siemens PCR2.1 (VAG TDI)', 'Marelli MJD6 / MJD8 / MT86 (Fiat/Alfa)', 'Delphi DCM3.5 / DCM6.2 (Renault)', 'Denso SH705x / SH72xx (Toyota/Nissan)', 'ZF 8HP TCU (BMW/VAG)', 'Getrag/DSG DCT250 TCU'],
    vehicles: ['VAG', 'BMW', 'Mercedes', 'Fiat', 'Renault', 'Volvo', 'Toyota'],
    software: ['KT200 II Software (Windows)'],
    notes: 'Updated version of KT200 with added Infineon Tricore BSL support for locked Bosch MED17/EDC17. Expanded TCU coverage (ZF 8HP, Getrag). Better post-2015 VAG coverage than original KT200. Still a budget-tier device — professional shops use Flex or KESS3 for edge cases and reliability.',
    appCompat: 'files-only',
    appCompatNote: 'Use KT200 II software to read the ECU binary. Import the .bin into DCTuning Tune Manager for editing.',
    recommended: ['Budget VAG/BMW bench work', 'Locked ECU bypass (Tricore BSL)'],
  },
  {
    id: 'mppsv22',
    name: 'MPPS V22',
    manufacturer: 'MPPS',
    tier: 'hobby',
    priceMin: 40, priceMax: 100,
    iface: ['USB'],
    j2534: false,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'unreliable', dtc: true },
    ecuFamilies: ['Bosch EDC15 (pre-2006)', 'Bosch EDC16 (pre-2010, limited)', 'Bosch EDC17 (select OBD protocols, very limited)', 'Siemens PPD1.x (older VAG)'],
    vehicles: ['VAG (pre-2010 primarily)', 'BMW (pre-2008)'],
    software: ['MPPS V22 Software (widely pirated)'],
    notes: '⚠ WARNING: V22 adds marginal EDC17 OBD support over V21 but the same core risks apply — nearly all V22 units are counterfeit. Checksum correction is unreliable on clones. Higher ECU brick rate than genuine professional tools. The claimed wider coverage is mostly marketing. For scrap ECU practice only — never use on customer vehicles.',
    appCompat: 'files-only',
    appCompatNote: 'Produces a raw .bin file if the read succeeds. Can be imported into Tune Manager — but NOT recommended for customer ECUs due to high brick risk.',
    recommended: [],
  },
  {
    id: 'sm2pro',
    name: 'SM2 Pro (Scanmatik 2 Pro)',
    manufacturer: 'Scanmatik',
    tier: 'semi-pro',
    priceMin: 80, priceMax: 130,
    iface: ['USB', 'Bluetooth'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: [
      'Denso SH705x — Toyota, Subaru (OBD flash via PCMFlash)',
      'Denso SH72xx — Nissan, Toyota (OBD flash via PCMFlash)',
      'Mitsubishi Electric SH7 — Mitsubishi, Proton',
      'Delphi/Delco E38/E40/E67/E78 — GM LS2/LS3/LS7/LY6 (OBD)',
      'Continental SIMTEC 75/76 — Opel/Vauxhall (OBD)',
      'Bosch ME7.9.7 — Honda K/R-series (OBD)',
      'Visteon EEC-V — Ford legacy (OBD)',
      'All OBD2-compliant ECUs for diagnostics (any make)',
      'K-Line ECUs — ISO 9141-2 / ISO 14230 KWP2000',
    ],
    vehicles: ['Toyota', 'Subaru', 'Honda', 'Nissan', 'Mitsubishi', 'GM/Opel', 'Ford (legacy)', 'All makes (diagnostics)'],
    software: ['PCMFlash v1.27 (flash read/write)', 'WinFlash', 'DiagSoft', 'Any J2534-compliant application'],
    notes: 'Full J2534-1 compliant pass-thru adapter — acts as the hardware transport for PCMFlash, giving it identical ECU flash coverage to a Tactrix Openport 2.0 at a lower price. Reads and writes ECUs on Toyota, Subaru, Honda, GM/Opel, Nissan, Mitsubishi via PCMFlash over OBD2. No bench/boot capability — OBD-only. Supports CAN (ISO 15765), K-Line (ISO 9141/14230), J1850 PWM/VPW. USB and Bluetooth versions available. Widely trusted in the Eastern European tuning community. Register its DLL in Windows once and it works with any J2534 software.',
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers its J2534 DLL in Windows — appears in DCTuning J2534 PassThru scanner automatically. App uses it for OBD2 diagnostics (DTC, live PIDs, voltage). For ECU flash read/write, pair with PCMFlash — then import the binary into DCTuning Tune Manager.',
    recommended: ['Toyota/Subaru OBD flash', 'GM/Opel OBD flash', 'Budget Tactrix alternative', 'Diagnostics on any make'],
  },
  {
    id: 'sm3pro',
    name: 'SM3 Pro (Scanmatik 3 Pro)',
    manufacturer: 'Scanmatik',
    tier: 'semi-pro',
    priceMin: 100, priceMax: 160,
    iface: ['USB', 'Bluetooth'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: [
      'Denso SH705x — Toyota, Subaru (via PCMFlash OBD)',
      'Denso SH72xx — Nissan, Toyota (via PCMFlash OBD)',
      'Mitsubishi Electric SH7 — Mitsubishi, Proton',
      'Delphi/Delco E38/E40/E67/E78 — GM LS/LT (OBD)',
      'Continental SIMTEC 75/76 — Opel/Vauxhall (OBD)',
      'Bosch ME7.9.7 — Honda K/R-series (OBD)',
      'Visteon EEC-V — Ford legacy (OBD)',
      'All OBD2-compliant ECUs — diagnostics (any make)',
      'K-Line ECUs — ISO 9141-2 / ISO 14230 (KWP2000)',
    ],
    vehicles: ['Toyota', 'Subaru', 'Honda', 'Nissan', 'Mitsubishi', 'GM/Opel', 'Ford (legacy)', 'All makes (diagnostics)'],
    software: ['PCMFlash v1.27 (flash read/write)', 'Any J2534 application (ODIS, ISTA, IDS, GDS2, Techstream, Forscan, Clip, Diagbox)'],
    notes: 'Upgraded successor to SM2 Pro — adds CAN FD and DoIP (UDS over Ethernet) support alongside the full SM2 Pro J2534/RP1210 stack. Best budget J2534 adapter for CAN FD vehicles (post-2020). Full J2534-1 and J2534-2 compliant. Works with PCMFlash, BitBox, Combiloader, MDFlasher, and all major OEM software portals. USB and Bluetooth versions.',
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers its SM3 J2534 DLL in Windows — auto-detected in DCTuning J2534 PassThru scanner. Full OBD2 diagnostics (DTC, live PIDs, voltage) direct in the app. For ECU flash read/write, use PCMFlash v1.27 with this adapter, then import the .bin into Tune Manager.',
    recommended: ['Toyota/Subaru OBD flash', 'GM/Opel OBD flash', 'Best budget J2534 hardware', 'CAN FD / post-2020 vehicles'],
  },
  {
    id: 'fordvcm2',
    name: 'VCM II (genuine + clone)',
    manufacturer: 'Ford / Rotunda (clones: various)',
    tier: 'semi-pro',
    priceMin: 25, priceMax: 400,
    iface: ['USB', 'Bluetooth (genuine)'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true, coding: true },
    ecuFamilies: [
      'Ford T-PROT ECUs (Focus/Fiesta/Mondeo/Transit — OBD flash via IDS/FDRS)',
      'Ford Power Stroke diesel (OBD flash)',
      'Mazda — shared Ford platform ECUs',
      'Ford EcoBoost petrol ECUs',
      'Ford/Mazda Denso — via PCMFlash OBD',
    ],
    vehicles: ['Ford (all models 1996–present)', 'Mazda (Ford-platform models)', 'Lincoln', 'Mercury'],
    software: ['Ford IDS (reprogramming)', 'Ford FDRS (newer models)', 'ForScan (diagnostics)', 'PCMFlash v1.27 (tuning flash)', 'Any J2534 software'],
    notes: `Ford's OEM diagnostic and reprogramming interface — registers a J2534 DLL in Windows making it compatible with any J2534 software including PCMFlash.\n\n✅ CLONES: VCM II clones (€25–80 on AliExpress/eBay) are extremely common and most work well with Ford IDS, FDRS, ForScan, and PCMFlash for OBD read/write on Ford ECUs. The clone risk is on complex OEM reprogramming sessions — for tuning flash reads via PCMFlash, clones are generally reliable. Avoid for warranty/dealer-level work. Look for clones with the MFC chipset for best compatibility.`,
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers a J2534 DLL in Windows — auto-detected in DCTuning J2534 PassThru scanner. App uses it for Ford/Mazda OBD2 diagnostics (DTC, live PIDs). For ECU flash: use PCMFlash v1.27 with this adapter for Ford T-PROT and Power Stroke modules, then import .bin into Tune Manager.',
    recommended: ['Ford specialist', 'Ford/Mazda OBD flash', 'Budget Ford IDS setup (clone)'],
  },
  {
    id: 'mongoose',
    name: 'Mongoose Pro',
    manufacturer: 'Opus IVS',
    tier: 'semi-pro',
    priceMin: 150, priceMax: 280,
    iface: ['USB'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true, coding: true },
    ecuFamilies: [
      'All OEM ECUs via OEM software (any make)',
      'Delphi/Delco E38/E40/E67/E78 — GM (via PCMFlash)',
      'Denso SH705x — Toyota/Subaru (via PCMFlash)',
      'Ford T-PROT — Ford/Mazda (via IDS/FDRS)',
    ],
    vehicles: ['All makes with OEM software subscription', 'GM', 'Ford', 'Toyota', 'Chrysler/FCA'],
    software: ['Ford IDS / FDRS', 'GM GDS2 / TIS2Web', 'Chrysler wiTECH', 'Toyota Techstream', 'PCMFlash v1.27', 'Any J2534 software'],
    notes: 'Professional J2534 pass-thru from Opus IVS (same maker as CarDAQ-Plus 3). Same vendor as CarDAQ but at a lower price — narrower protocol support (J2534-1 only vs J2534-1+2 on CarDAQ). Widely used by independent shops for Ford, GM, Chrysler OEM reprogramming. PCMFlash tested and supported. Good alternative to CarDAQ for shops that don\'t need the full J2534-2 spec.',
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers Opus IVS J2534 DLL in Windows — auto-detected in DCTuning J2534 PassThru scanner. Full OBD2 diagnostics in the app. For ECU flash read/write, use PCMFlash v1.27 or OEM software, then import .bin into Tune Manager.',
    recommended: ['Ford/GM OBD reprogramming', 'Independent OEM repair shop', 'PCMFlash adapter'],
  },
  {
    id: 'dialink',
    name: 'Dialink J2534',
    manufacturer: 'Dialink',
    tier: 'budget',
    priceMin: 55, priceMax: 85,
    iface: ['USB'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: [
      'Denso SH705x — Toyota, Subaru (PCMFlash)',
      'Denso SH72xx — Nissan, Toyota (PCMFlash)',
      'Mitsubishi Electric SH7 (PCMFlash)',
      'Delphi/Delco E38/E40/E67/E78 — GM (PCMFlash)',
      'Continental SIMTEC 75/76 — Opel/Vauxhall (PCMFlash)',
      'Bosch ME7.9.7 — Honda (PCMFlash)',
      'Visteon EEC-V — Ford legacy (PCMFlash)',
      'All OBD2 ECUs — diagnostics',
    ],
    vehicles: ['Toyota', 'Subaru', 'Honda', 'Nissan', 'Mitsubishi', 'GM/Opel', 'Ford (legacy)', 'All makes (diagnostics)'],
    software: ['PCMFlash v1.27', 'ForScan', 'Techstream', 'Any J2534 app'],
    notes: 'Budget STM32F105-based EU J2534 adapter with excellent PCMFlash test results — reads all 41 PCMFlash OBD modules reliably. Full J2534-1 compliant, installs DLL under PassThruSupport.04.04. Very popular in EU tuning community as a low-cost Tactrix/SM2 alternative for OBD-only flash operations. OBD only — no bench or boot.',
    appCompat: 'direct-j2534',
    appCompatNote: 'Registers Dialink J2534 DLL in Windows — auto-detected in DCTuning J2534 PassThru scanner. App uses it for full OBD2 diagnostics. For ECU flash, use PCMFlash v1.27 with this adapter, then import .bin into Tune Manager.',
    recommended: ['Budget PCMFlash adapter', 'Toyota/Subaru OBD flash', 'EU budget J2534'],
  },
  {
    id: 'godiag',
    name: 'GODIAG GD101 / VNCI J2534',
    manufacturer: 'GODIAG',
    tier: 'hobby',
    priceMin: 35, priceMax: 65,
    iface: ['USB', 'Bluetooth'],
    j2534: true,
    discontinued: false,
    connections: { obd2: true },
    caps: { flashRead: true, flashWrite: true, clone: false, checksum: 'manual', dtc: true, liveData: true },
    ecuFamilies: [
      'Denso SH705x — Toyota/Subaru (PCMFlash OBD)',
      'Denso SH72xx — Nissan/Toyota (PCMFlash OBD)',
      'All OBD2 ECUs — diagnostics',
    ],
    vehicles: ['Toyota', 'Subaru', 'Nissan', 'Honda', 'GM/Opel', 'All makes (diagnostics)'],
    software: ['PCMFlash v1.27', 'Honda HDS', 'Toyota Techstream', 'ForScan', 'VAG ODIS (basic)', 'Any ELM327 app (ELM327 mode)', 'Any J2534 app (J2534 mode)'],
    notes: 'Dual-mode device switchable between J2534 PassThru and ELM327 AT-command mode. In J2534 mode it registers a DLL and works with PCMFlash, Techstream, HDS, Forscan, ODIS. In ELM327 mode it acts as a standard OBD2 scanner for Torque, OBD Fusion etc. Budget option — works well for PCMFlash Toyota/Subaru OBD flash. OBD only, no bench/boot. Not recommended for complex OEM reprogramming.',
    appCompat: 'direct-j2534',
    appCompatNote: 'In J2534 mode: registers DLL in Windows, auto-detected in DCTuning J2534 PassThru scanner for OBD2 diagnostics. In ELM327 mode (switch on device): connects directly to DCTuning ECU Scanner via Bluetooth as a standard OBD adapter. Dual-purpose — one device for both app functions.',
    recommended: ['Budget dual J2534 + ELM327', 'Toyota/Subaru PCMFlash on a budget'],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TIER_LABEL: Record<Tier, string> = {
  hobby: 'Hobby', budget: 'Budget', 'semi-pro': 'Semi-Pro',
  professional: 'Professional', dealer: 'Dealer / OEM', diagnostics: 'Diagnostics Only',
}
const TIER_COLOR: Record<Tier, string> = {
  hobby:         'var(--text-muted)',
  budget:        '#f59e0b',
  'semi-pro':    '#60a5fa',
  professional:  'var(--accent)',
  dealer:        '#a78bfa',
  diagnostics:   'var(--success)',
}

const CAP_LABELS: Partial<Record<Cap, string>> = {
  flashRead:  'Flash Read', flashWrite: 'Flash Write', clone: 'Clone',
  eeprom:     'EEPROM', checksum:  'Checksum',
  dtc:        'DTC Read/Clear', liveData: 'Live Data',
  immo:       'Immobilizer', coding: 'ECU Coding',
}

const CONN_LABELS: Record<Conn, string> = {
  obd2: 'OBD2', bench: 'Bench', boot: 'Boot/BSL', bdm: 'BDM', jtag: 'JTAG', tricore: 'Tricore',
}
const CONN_COLOR: Record<Conn, string> = {
  obd2: '#60a5fa', bench: 'var(--accent)', boot: '#f59e0b',
  bdm: '#f97316', jtag: '#c084fc', tricore: '#fb7185',
}

const COMPAT_LABEL: Record<AppCompat, string> = {
  'direct-obd':   'Direct — OBD2',
  'direct-j2534': 'Direct — J2534',
  'files-only':   'File Import Only',
  'diagnostics':  'Diagnostics Only',
}
const COMPAT_COLOR: Record<AppCompat, string> = {
  'direct-obd':   'var(--accent)',
  'direct-j2534': '#a78bfa',
  'files-only':   '#60a5fa',
  'diagnostics':  'var(--success)',
}
const COMPAT_BG: Record<AppCompat, string> = {
  'direct-obd':   'rgba(0,174,200,0.10)',
  'direct-j2534': 'rgba(167,139,250,0.10)',
  'files-only':   'rgba(96,165,250,0.10)',
  'diagnostics':  'rgba(34,197,94,0.10)',
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DeviceLibrary() {
  const [search, setSearch]     = useState('')
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all')
  const [connFilter, setConnFilter] = useState<Conn | 'all'>('all')
  const [selected, setSelected] = useState<Device | null>(null)
  const [tab, setTab]           = useState<'devices' | 'protocols' | 'matrix'>('devices')

  const filtered = useMemo(() => {
    return DEVICES.filter((d) => {
      if (tierFilter !== 'all' && d.tier !== tierFilter) return false
      if (connFilter !== 'all' && !d.connections[connFilter]) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          d.name.toLowerCase().includes(q) ||
          d.manufacturer.toLowerCase().includes(q) ||
          d.ecuFamilies.some((e) => e.toLowerCase().includes(q)) ||
          d.vehicles.some((v) => v.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [search, tierFilter, connFilter])

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/>
            <rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>
          </svg>
        </div>
        <div>
          <h1>Device Library</h1>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {filtered.length} of {DEVICES.length} devices
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
        {(['devices', 'protocols', 'matrix'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', background: tab === t ? 'var(--accent-dim)' : 'transparent',
            border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 12,
            marginBottom: -1, textTransform: 'capitalize',
          }}>
            {t === 'devices' ? 'Hardware Devices' : t === 'protocols' ? 'Protocol Reference' : 'ECU Coverage Matrix'}
          </button>
        ))}
      </div>

      {/* ── DEVICES TAB ──────────────────────────────────────────── */}
      {tab === 'devices' && (
        <div style={{ marginTop: 16 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices, ECU families, vehicles..."
              style={{ flex: 1, minWidth: 200 }}
            />
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as any)} style={{ width: 160 }}>
              <option value="all">All Tiers</option>
              {(Object.entries(TIER_LABEL) as [Tier, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={connFilter} onChange={(e) => setConnFilter(e.target.value as any)} style={{ width: 160 }}>
              <option value="all">All Connections</option>
              {(Object.entries(CONN_LABELS) as [Conn, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Grid + Detail panel */}
          <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 16, alignItems: 'start' }}>
            {/* Device cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((d) => (
                <div
                  key={d.id}
                  className="card"
                  onClick={() => setSelected(selected?.id === d.id ? null : d)}
                  style={{
                    cursor: 'pointer', padding: '14px 16px',
                    borderColor: selected?.id === d.id ? 'var(--accent)' : d.discontinued ? 'rgba(255,68,68,0.2)' : 'var(--border)',
                    transition: 'border-color 0.12s',
                    opacity: d.tier === 'hobby' ? 0.8 : 1,
                  }}
                  onMouseEnter={(e) => { if (selected?.id !== d.id) e.currentTarget.style.borderColor = 'var(--border-mid)' }}
                  onMouseLeave={(e) => { if (selected?.id !== d.id) e.currentTarget.style.borderColor = d.discontinued ? 'rgba(255,68,68,0.2)' : 'var(--border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Left: name + maker */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{d.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.manufacturer}</span>
                        {d.discontinued && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-dim)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Discontinued
                          </span>
                        )}
                        {(d.tier === 'hobby' || d.tier === 'budget') && d.id !== 'tactrix' && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase' }}>
                            ⚠ Risk
                          </span>
                        )}
                      </div>

                      {/* Connection method badges */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {(Object.entries(d.connections) as [Conn, boolean][]).filter(([, v]) => v).map(([k]) => (
                          <span key={k} style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                            background: `${CONN_COLOR[k]}18`,
                            border: `1px solid ${CONN_COLOR[k]}44`,
                            color: CONN_COLOR[k],
                          }}>
                            {CONN_LABELS[k]}
                          </span>
                        ))}
                        {d.j2534 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}>
                            J2534
                          </span>
                        )}
                        {/* App integration badge */}
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: COMPAT_BG[d.appCompat],
                          border: `1px solid ${COMPAT_COLOR[d.appCompat]}44`,
                          color: COMPAT_COLOR[d.appCompat],
                          marginLeft: 2,
                        }}>
                          ⬡ {COMPAT_LABEL[d.appCompat]}
                        </span>
                      </div>

                      {/* Capability dots */}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {(Object.entries(CAP_LABELS) as [Cap, string][]).map(([k, label]) => {
                          const val = d.caps[k]
                          const on = !!val && val !== false
                          return (
                            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: on ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: on ? 1 : 0.35 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: on ? (val === 'unreliable' ? 'var(--warning)' : 'var(--accent)') : 'var(--text-muted)', flexShrink: 0 }} />
                              {label}
                              {val === 'auto' && <span style={{ fontSize: 9, color: 'var(--accent)' }}>auto</span>}
                              {val === 'unreliable' && <span style={{ fontSize: 9, color: 'var(--warning)' }}>⚠</span>}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    {/* Right: tier + price */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: TIER_COLOR[d.tier], marginBottom: 4 }}>
                        {TIER_LABEL[d.tier]}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        €{d.priceMin.toLocaleString()}–{d.priceMax.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {d.iface.join(' · ')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 10, opacity: 0.3 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                  <div style={{ fontWeight: 700 }}>No devices match</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Try adjusting your filters</div>
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="card card-accent" style={{ position: 'sticky', top: 0, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{selected.manufacturer}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>

                {/* Tier + price */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TIER_COLOR[selected.tier] }}>{TIER_LABEL[selected.tier]}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>€{selected.priceMin.toLocaleString()} – €{selected.priceMax.toLocaleString()}</span>
                </div>

                <div className="divider" />

                {/* Connection methods */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>Connection Methods</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(Object.entries(CONN_LABELS) as [Conn, string][]).map(([k, label]) => {
                      const on = selected.connections[k]
                      return (
                        <span key={k} style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                          background: on ? `${CONN_COLOR[k]}18` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${on ? `${CONN_COLOR[k]}44` : 'var(--border)'}`,
                          color: on ? CONN_COLOR[k] : 'var(--text-muted)',
                          opacity: on ? 1 : 0.4,
                        }}>{label}</span>
                      )
                    })}
                    {selected.j2534 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}>J2534</span>}
                  </div>
                </div>

                {/* Capabilities */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>Capabilities</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(Object.entries(CAP_LABELS) as [Cap, string][]).map(([k, label]) => {
                      const val = selected.caps[k]
                      const on = !!val && val !== false
                      return (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: on ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: on ? 1 : 0.4 }}>{label}</span>
                          <span style={{ color: on ? (val === 'unreliable' ? 'var(--warning)' : val === 'auto' ? 'var(--accent)' : 'var(--success)') : 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}>
                            {!on ? '—' : val === 'auto' ? 'Auto' : val === 'unreliable' ? '⚠ Unreliable' : val === 'manual' ? 'Manual' : '✓'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ECU families */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>ECU Families</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {selected.ecuFamilies.slice(0, 8).map((e) => (
                      <span key={e} style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>· {e}</span>
                    ))}
                    {selected.ecuFamilies.length > 8 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+ {selected.ecuFamilies.length - 8} more</span>}
                  </div>
                </div>

                {/* Vehicles */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>Vehicle Coverage</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {selected.vehicles.map((v) => (
                      <span key={v} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Software */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>Software</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {selected.software.map((s) => <span key={s} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {s}</span>)}
                  </div>
                </div>

                <div className="divider" />

                {/* App Integration */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>DCTuning App Integration</label>
                  <div style={{
                    background: COMPAT_BG[selected.appCompat],
                    border: `1px solid ${COMPAT_COLOR[selected.appCompat]}33`,
                    borderRadius: 8, padding: '10px 12px',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: COMPAT_COLOR[selected.appCompat], marginBottom: 5 }}>
                      {COMPAT_LABEL[selected.appCompat]}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {selected.appCompatNote}
                    </div>
                  </div>
                </div>

                <div className="divider" />

                {/* Notes */}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                  {selected.notes}
                </div>

                {selected.recommended && selected.recommended.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', marginBottom: 6 }}>Best For</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {selected.recommended.map((r) => (
                        <span key={r} style={{ fontSize: 11, color: 'var(--accent)' }}>✓ {r}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROTOCOLS TAB ────────────────────────────────────────── */}
      {tab === 'protocols' && (
        <div style={{ marginTop: 16 }}>
          <div className="grid-2" style={{ gap: 16 }}>

            <div className="card">
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 14, fontSize: 13 }}>OBD2 Protocols</div>
              <table className="data-table">
                <thead><tr><th>Protocol</th><th>Standard</th><th>Speed</th><th>Used For</th></tr></thead>
                <tbody>
                  {[
                    ['ISO 15765-4 (CAN)', 'ISO', '250k / 500k bps', '2008+ all makes'],
                    ['ISO 14230 (KWP2000)', 'ISO', '10.4 kbps', 'K-Line diagnostics + older flash'],
                    ['ISO 9141-2', 'ISO', '10.4 kbps', 'K-Line legacy OBD'],
                    ['SAE J1850 PWM', 'SAE', '41.6 kbps', 'Ford pre-2008'],
                    ['SAE J1850 VPW', 'SAE', '10.4 kbps', 'GM pre-2008'],
                    ['SAE J2534-1', 'SAE', 'Multi', 'J2534 pass-thru (OEM SW)'],
                    ['SAE J2534-2', 'SAE', 'Multi', 'Enhanced J2534 protocols'],
                  ].map(([p, s, sp, u]) => (
                    <tr key={p}><td style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 11 }}>{p}</td><td>{s}</td><td>{sp}</td><td>{u}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, color: '#f97316', marginBottom: 14, fontSize: 13 }}>Bench / Boot Protocols</div>
              <table className="data-table">
                <thead><tr><th>Protocol</th><th>CPU Family</th><th>Method</th><th>ECU Examples</th></tr></thead>
                <tbody>
                  {[
                    ['Tricore BSL', 'Infineon TC179x', 'Boot pins (BOOT0 + BRKP)', 'Bosch MED17 / EDC17'],
                    ['BDM', 'Motorola MPC5xx', 'Debug pins (DSCK/DSDI/DSDO)', 'Bosch ME7 / EDC16'],
                    ['JTAG', 'IEEE 1149.1', 'Boundary scan pins', 'Various (limited)'],
                    ['SH7 BSL', 'Renesas SH705x', 'Boot mode UART pins', 'Denso / Marelli MJD'],
                    ['ARM SWD', 'ARM Cortex', 'SWD debug interface', 'Post-2018 ECUs'],
                    ['SPI Direct', 'Any', 'SPI flash chip direct read', 'External flash ECUs'],
                    ['EEPROM Direct', 'Any', 'I2C/SPI to EEPROM chip', 'Immobilizer data'],
                  ].map(([p, c, m, e]) => (
                    <tr key={p}><td style={{ fontFamily: 'monospace', color: '#f97316', fontSize: 11 }}>{p}</td><td>{c}</td><td>{m}</td><td>{e}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, fontSize: 13 }}>Why Bench Read is Needed</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: 10 }}>Modern ECUs (post-2012) increasingly <strong style={{ color: 'var(--text-primary)' }}>block OBD flash read</strong> — the ECU will accept a write but refuses to return the current calibration. This is called a <strong style={{ color: 'var(--accent)' }}>locked</strong> or <strong style={{ color: 'var(--accent)' }}>protected</strong> ECU.</p>
                <p style={{ marginBottom: 10 }}>To read the full flash on these ECUs you must physically remove the ECU and access it via:</p>
                <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--border)', marginBottom: 10 }}>
                  <div>· <strong style={{ color: '#fb7185' }}>Tricore BSL</strong> — Bosch MED17/EDC17 (most VAG/BMW diesels)</div>
                  <div>· <strong style={{ color: '#f97316' }}>BDM</strong> — Bosch ME7/EDC16 (older VAG/BMW)</div>
                  <div>· <strong style={{ color: '#f59e0b' }}>SH7 BSL</strong> — Denso/Marelli (Japanese, Italian cars)</div>
                </div>
                <p style={{ color: 'var(--text-muted)' }}>Without bench capability, you cannot safely tune a locked ECU — you're flying blind without the current base map.</p>
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 14, fontSize: 13 }}>Connection Method Decision Guide</div>
              {[
                { q: 'Vehicle is pre-2012, ECU unlocked?', a: 'OBD2 read/write will work on most tools', color: 'var(--success)' },
                { q: 'Vehicle is post-2012 VAG (VW/Audi/SEAT/Skoda)?', a: 'Tricore BSL required — ECU must come out', color: '#fb7185' },
                { q: 'BMW diesel/petrol post-2010?', a: 'Tricore BSL or BDM depending on model year', color: '#fb7185' },
                { q: 'Toyota / Subaru / Honda?', a: 'SH7 BSL bench OR OBD via PCMFlash/EcuTek', color: '#f59e0b' },
                { q: 'ECU is already tuned, original file lost?', a: 'Bench read required regardless of ECU age', color: '#f97316' },
                { q: 'Cloning a replacement ECU?', a: 'Bench read of old + bench write to new required', color: '#60a5fa' },
              ].map(({ q, a, color }) => (
                <div key={q} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{q}</div>
                  <div style={{ fontSize: 11, color, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>→</span>{a}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ECU COVERAGE MATRIX TAB ──────────────────────────────── */}
      {tab === 'matrix' && (
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ overflowX: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>ECU Family × Device Coverage Matrix</div>
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>ECU Family</th>
                  {['KESS3', 'K-TAG', 'Flex', 'Autotuner', 'CMD', 'BFlash', 'PCMFlash', 'Openport'].map((d) => (
                    <th key={d} style={{ textAlign: 'center', width: 80 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Bosch ME7.x',      vals: [1,1,1,1,1,0,1,0] },
                  { name: 'Bosch MED17',       vals: [1,1,1,1,1,1,0,0] },
                  { name: 'Bosch EDC16',       vals: [1,1,1,1,1,0,1,0] },
                  { name: 'Bosch EDC17',       vals: [1,1,1,1,1,1,0,0] },
                  { name: 'Bosch MEDC17',      vals: [1,1,1,1,1,1,0,0] },
                  { name: 'Bosch DDE (BMW)',   vals: [1,1,1,1,1,1,0,0] },
                  { name: 'Continental SIMOS', vals: [1,1,1,1,1,1,0,0] },
                  { name: 'Siemens SIM2K',     vals: [1,1,1,1,1,0,0,0] },
                  { name: 'Siemens PCR2.1',    vals: [1,1,1,1,1,0,0,0] },
                  { name: 'Delphi DCM3/6',     vals: [1,1,1,1,1,0,0,0] },
                  { name: 'Marelli MJD6/8',    vals: [1,1,1,1,1,0,0,0] },
                  { name: 'Denso SH705x',      vals: [1,1,1,1,0,0,1,1] },
                  { name: 'Denso SH72xx',      vals: [1,1,1,0,0,0,1,1] },
                  { name: 'Mitsubishi SH7',    vals: [0,0,1,0,0,0,1,1] },
                  { name: 'NXP MPC5xx (BDM)',  vals: [1,1,1,1,1,1,0,0] },
                  { name: 'ZF/DSG TCU',        vals: [1,1,1,1,1,0,0,0] },
                  { name: 'GM E38/E40/E78',    vals: [0,0,0,0,0,0,1,0] },
                  { name: 'Ford PCM (EcoBoost)',vals:[0,0,0,0,0,0,1,0] },
                  { name: 'Valeo (PSA/Renault)',vals:[1,0,1,1,0,0,0,0] },
                ].map(({ name, vals }) => (
                  <tr key={name}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{name}</td>
                    {vals.map((v, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        {v === 1
                          ? <span style={{ color: 'var(--accent)', fontSize: 14, lineHeight: 1 }}>✓</span>
                          : <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 12 }}>—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="banner banner-info" style={{ marginTop: 14 }}>
            ✓ = Supported (OBD, bench or boot depending on ECU type) · — = Not supported by this device
          </div>
        </div>
      )}
    </div>
  )
}
