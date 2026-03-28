// src/renderer/src/lib/drtParser.ts
// ECM Titanium .drt driver file parser
// Format: binary file using 0xBB as field delimiter, 0x84+0xBB as record separator
//
// Record structure:
//   DRIVER HEADER:  driverName | f1 | f2 | CODE | cols | rows | flag | flag
//   DETAIL records: 1 | axisDesc | valDesc | nAddrs | addrList | chkOff | f1 | f2
//   MAP CODE:       CODE | cols | rows | f1 | f2  (secondary map types)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DRTMapDef {
  code: string
  name: string
  description: string
  category: 'boost' | 'fuel' | 'ignition' | 'torque' | 'limiter' | 'egr' | 'dpf' | 'other'
  cols: number
  rows: number
  address: number
  allAddresses: number[]
  axisAddress: number
  axisDataType: 'uint8' | 'uint16' | 'int8' | 'int16' | 'float32'
  dataType: 'uint8' | 'uint16' | 'int8' | 'int16' | 'float32'
}

export interface DRTParseResult {
  driverName: string
  maxAddress: number
  maps: DRTMapDef[]
  totalMaps: number
  totalCurves: number
  warnings: string[]
}

// ─── Map code catalogue ───────────────────────────────────────────────────────

interface CodeInfo { name: string; desc: string; category: DRTMapDef['category'] }

const CODE_CATALOGUE: Record<string, CodeInfo> = {
  IE: { name: 'Injection Enable',      desc: 'Injection enable/quantity map',        category: 'fuel' },
  IP: { name: 'Injection Pressure',    desc: 'Injection pressure vs RPM/load',       category: 'fuel' },
  IT: { name: 'Injection Timing',      desc: 'Injection timing advance',             category: 'ignition' },
  IU: { name: 'Pilot Injection 1',     desc: 'Pre-injection quantity map',           category: 'fuel' },
  IV: { name: 'Pilot Injection 2',     desc: 'Second pilot injection quantity',      category: 'fuel' },
  IA: { name: 'Injection Advance',     desc: 'Injection advance correction',         category: 'fuel' },
  IS: { name: 'Injection Start',       desc: 'Start of injection timing',            category: 'ignition' },
  IM: { name: 'Injection Main',        desc: 'Main injection quantity map',          category: 'fuel' },
  IQ: { name: 'Injection Quantity',    desc: 'Injection quantity target map',        category: 'fuel' },
  IC: { name: 'Injection Correction',  desc: 'Injection correction factor',         category: 'fuel' },
  AS: { name: 'Air Setpoint',          desc: 'Air setpoint map',                     category: 'fuel' },
  BS: { name: 'Boost Setpoint',        desc: 'Boost pressure target vs RPM/load',   category: 'boost' },
  BT: { name: 'Boost Target',          desc: 'Maximum boost target map',             category: 'boost' },
  BL: { name: 'Boost Limit',           desc: 'Boost pressure upper limit',           category: 'boost' },
  BM: { name: 'Boost Map',             desc: 'Boost pressure control map',           category: 'boost' },
  BP: { name: 'Boost Pressure',        desc: 'Boost pressure regulation',            category: 'boost' },
  WG: { name: 'Wastegate Duty',        desc: 'Wastegate solenoid duty cycle',        category: 'boost' },
  CB: { name: 'Correction Base',       desc: 'Base correction map',                  category: 'fuel' },
  TB: { name: 'Torque Base',           desc: 'Base torque map',                      category: 'torque' },
  TQ: { name: 'Torque Target',         desc: 'Torque target map',                    category: 'torque' },
  TP: { name: 'Torque Protection',     desc: 'Torque protection limit',              category: 'torque' },
  TM: { name: 'Torque Max',            desc: 'Maximum torque limit map',             category: 'torque' },
  TL: { name: 'Torque Limit',          desc: 'Torque limitation map',                category: 'torque' },
  L0: { name: 'Load Limit 0',          desc: 'Engine load limit (bank 0)',           category: 'limiter' },
  L8: { name: 'Load Limit 8',          desc: 'Engine load limit (bank 8)',           category: 'limiter' },
  LI: { name: 'Load Index',            desc: 'Load index limit map',                 category: 'limiter' },
  LD: { name: 'Load Demand',           desc: 'Load demand vs pedal position',        category: 'limiter' },
  LM: { name: 'Load Maximum',          desc: 'Maximum load limit',                   category: 'limiter' },
  AM: { name: 'Air Mass',              desc: 'Air mass flow vs RPM/throttle',        category: 'fuel' },
  AP: { name: 'Accelerator Pedal',     desc: 'Pedal position to throttle demand',    category: 'other' },
  AL: { name: 'Air/Lambda',            desc: 'Lambda/air mixture map',               category: 'fuel' },
  AF: { name: 'Air/Fuel Ratio',        desc: 'Target air/fuel ratio map',            category: 'fuel' },
  ZW: { name: 'Ignition Timing',       desc: 'Zündwinkel — ignition advance map',    category: 'ignition' },
  ZA: { name: 'Ignition Advance',      desc: 'Ignition advance correction',          category: 'ignition' },
  ZK: { name: 'Knock Ignition',        desc: 'Knock-retard ignition correction',     category: 'ignition' },
  EG: { name: 'EGR Rate',              desc: 'Exhaust gas recirculation rate map',   category: 'egr' },
  EV: { name: 'EGR Valve',             desc: 'EGR valve duty cycle map',             category: 'egr' },
  DP: { name: 'DPF Regen',             desc: 'Diesel particulate filter regen map',  category: 'dpf' },
  DT: { name: 'DPF Threshold',         desc: 'DPF regeneration threshold',           category: 'dpf' },
  LA: { name: 'Lambda Map',            desc: 'Lambda sensor target map',             category: 'other' },
  SP: { name: 'Speed Limit',           desc: 'Vehicle speed limiter map',            category: 'limiter' },
  NM: { name: 'RPM Limit',             desc: 'RPM rev limiter map',                  category: 'limiter' },
  KF: { name: 'Map (KF)',              desc: 'Kennfeld calibration map',             category: 'other' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferDataType(desc: string): DRTMapDef['dataType'] {
  switch (desc.charAt(0).toUpperCase()) {
    case 'G': case 'B': return 'uint8'
    case 'W': case 'C': return 'uint16'
    case 'S':           return 'int8'
    case 'I':           return 'int16'
    case 'F':           return 'float32'
    default:            return 'uint16'
  }
}

function isMapCode(s: string): boolean {
  return !!s && s.length >= 2 && s.length <= 4 && /^[A-Z][A-Z0-9]{1,3}$/.test(s)
}

function parseAddressList(s: string): number[] {
  return s.split(',')
    .map(a => parseInt(a.trim(), 16))
    .filter(a => !isNaN(a) && a > 0x1000)
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseDRT(buffer: ArrayBuffer, driverName = 'unknown'): DRTParseResult {
  const bytes = new Uint8Array(buffer)
  const warnings: string[] = []

  const MARKER = 0x84
  const DELIM  = 0xBB

  // Split buffer into records at each [0x84, 0xBB] boundary
  const chunks: string[] = []
  let current: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === MARKER && i + 1 < bytes.length && bytes[i + 1] === DELIM) {
      chunks.push(String.fromCharCode(...current))
      current = []
      i++
    } else {
      current.push(bytes[i])
    }
  }
  if (current.length > 0) chunks.push(String.fromCharCode(...current))

  const maps: DRTMapDef[] = []
  let currentCode: string | null = null
  let currentCols = 0
  let currentRows = 0
  let headerParsed = false
  let parsedDriverName = driverName

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].replace(/\x00/g, '')
    const parts = text.split(String.fromCharCode(DELIM)).map(p => p.trim())
    const first = parts[0] ?? ''

    if (!first) continue

    // ── DRIVER HEADER ──────────────────────────────────────────────────────
    // First non-empty chunk with underscore in first token = driver header
    // Format: driverName | f1 | f2 | CODE | cols | rows [| flags...]
    if (!headerParsed && first.includes('_') && first.length >= 4) {
      parsedDriverName = first
      headerParsed = true

      if (parts.length >= 6 && isMapCode(parts[3])) {
        const cols = parseInt(parts[4])
        const rows = parseInt(parts[5])
        if (!isNaN(cols) && cols > 0) {
          currentCode = parts[3]
          currentCols = cols
          currentRows = Math.max(1, isNaN(rows) ? 1 : rows)
        }
      }
      continue
    }

    // ── MAP CODE HEADER ───────────────────────────────────────────────────
    // A new map type within the same DRT
    // Format: CODE | cols | rows [| flags...]
    if (headerParsed && isMapCode(first) && parts.length >= 3 && first !== 'STD') {
      const cols = parseInt(parts[1])
      const rows = parseInt(parts[2])
      if (!isNaN(cols) && cols > 0) {
        currentCode = first
        currentCols = cols
        currentRows = Math.max(1, isNaN(rows) ? 1 : rows)
        continue
      }
    }

    // ── DETAIL RECORD ─────────────────────────────────────────────────────
    // Format: 1 | axisDesc | valDesc | nAddrs | addrList | chkOff | f1 | f2
    // The address list is always at index 4
    if (currentCode && headerParsed && parts.length >= 5) {
      const addrField = parts[4]
      // Must be hex addresses, possibly comma-separated
      if (/^[0-9A-Fa-f]{4,8}(,[0-9A-Fa-f]{4,8})*$/.test(addrField)) {
        const allAddresses = parseAddressList(addrField)
        if (allAddresses.length > 0) {
          const address = allAddresses[0]

          // Extract axis descriptor (index 1) to get axisAddress and axisDataType
          const axisDesc = parts[1] ?? ''
          const axisDescParts = axisDesc.split(',')
          const axisAddress = axisDescParts.length >= 4
            ? (parseInt(axisDescParts[3], 16) || 0)
            : 0
          const axisDataType = axisDescParts.length >= 1
            ? inferDataType(axisDescParts[0])
            : 'uint8'

          // Extract value descriptor (index 2)
          const valDesc = parts[2] ?? ''
          const dataType = valDesc ? inferDataType(valDesc) : 'uint16'

          const info: CodeInfo = CODE_CATALOGUE[currentCode] ?? {
            name: `Map ${currentCode}`,
            desc: `ECM Titanium map type ${currentCode}`,
            category: 'other',
          }

          maps.push({
            code: currentCode,
            name: info.name,
            description: info.desc,
            category: info.category,
            cols: currentCols,
            rows: currentRows,
            address,
            allAddresses,
            axisAddress,
            axisDataType,
            dataType,
          })
        }
      }
    }
  }

  if (!headerParsed) {
    warnings.push('DRT header not found — file may be corrupt or unsupported version')
  }
  if (maps.length === 0) {
    warnings.push('No maps extracted — check file format compatibility')
  }

  // Deduplicate by primary address
  const seen = new Set<number>()
  const uniqueMaps = maps.filter(m => {
    if (seen.has(m.address)) return false
    seen.add(m.address)
    return true
  })

  const maxAddress = uniqueMaps.reduce((mx, m) => Math.max(mx, ...m.allAddresses), 0)

  return {
    driverName: parsedDriverName,
    maxAddress,
    maps: uniqueMaps,
    totalMaps: uniqueMaps.filter(m => m.rows > 1).length,
    totalCurves: uniqueMaps.filter(m => m.rows === 1).length,
    warnings,
  }
}

// ─── Convert DRT maps to A2L-compatible format ────────────────────────────────

export interface DRTConvertedMap {
  name: string
  description: string
  category: DRTMapDef['category']
  address: number
  fileOffset: number
  rows: number
  cols: number
  dataType: DRTMapDef['dataType']
  factor: number
  physicalOffset: number
  min: number
  max: number
  axisX: { size: number; min: number; max: number; label: string }
  axisY: { size: number; min: number; max: number; label: string } | undefined
  source: 'DRT'
}

export function convertDRTMaps(result: DRTParseResult): DRTConvertedMap[] {
  return result.maps.map(m => ({
    name: `${m.code}_${m.address.toString(16).toUpperCase().padStart(6, '0')}`,
    description: `${m.name} (${m.code})`,
    category: m.category,
    address: m.address,
    fileOffset: m.address,
    rows: m.rows,
    cols: m.cols,
    dataType: m.dataType,
    factor: 1,
    physicalOffset: 0,
    min: 0,
    max: m.dataType === 'uint8' ? 255 : m.dataType === 'uint16' ? 65535 : 127,
    axisX: { size: m.cols, min: 0, max: 100, label: `${m.cols} pts` },
    axisY: m.rows > 1 ? { size: m.rows, min: 0, max: 100, label: `${m.rows} pts` } : undefined,
    source: 'DRT' as const,
  }))
}

// ─── Guess ECU family from DRT content ───────────────────────────────────────

export function guessEcuFamilyFromDRT(result: DRTParseResult): string {
  const name = result.driverName.toUpperCase()
  if (name.includes('MED17') || name.includes('MED9')) return 'MED17'
  if (name.includes('EDC17'))                          return 'EDC17'
  if (name.includes('EDC16'))                          return 'EDC16'
  if (name.includes('SIMOS') || name.includes('SIM18')) return 'SIMOS18'
  if (name.includes('ME7')   || name.includes('ME75'))  return 'ME7'
  if (name.includes('EDC15'))                          return 'EDC15'

  const codes = new Set(result.maps.map(m => m.code))
  if (codes.has('ZW') && codes.has('AM'))               return 'MED17'
  if (codes.has('IT') && codes.has('IP'))               return 'EDC17'
  if (codes.has('IT') && codes.has('IU'))               return 'EDC16'
  if (codes.has('IP') && codes.has('IU') && codes.has('IV')) return 'EDC15'

  return 'MED17'
}
