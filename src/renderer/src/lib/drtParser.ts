// src/renderer/src/lib/drtParser.ts
// ECM Titanium .drt driver file parser
// Format: binary file using 0xBB as field delimiter, 0x84 as record separator

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DRTMapDef {
  code: string          // ECM Titanium type code: 'IP', 'IT', 'BS', etc.
  name: string          // human-readable name
  description: string   // longer description
  category: 'boost' | 'fuel' | 'ignition' | 'torque' | 'limiter' | 'egr' | 'dpf' | 'other'
  cols: number          // X-axis point count
  rows: number          // Y-axis point count (1 = curve, >1 = map)
  address: number       // primary file offset (hex string parsed to number)
  allAddresses: number[] // all addresses (some maps have 2 calibration banks)
  axisAddress: number   // X-axis data offset (0 if inline/no separate axis)
  axisDataType: 'uint8' | 'uint16' | 'int8' | 'int16' | 'float32'
  dataType: 'uint8' | 'uint16' | 'int8' | 'int16' | 'float32'
}

export interface DRTParseResult {
  driverName: string      // filename (without extension)
  maxAddress: number      // max supported file size
  maps: DRTMapDef[]
  totalMaps: number       // rows > 1
  totalCurves: number     // rows === 1
  warnings: string[]
}

// ─── ECM Titanium map code catalogue ─────────────────────────────────────────
// Maps each 2-letter ECM Titanium code to a human name, description, and category

interface CodeInfo { name: string; desc: string; category: DRTMapDef['category'] }

const CODE_CATALOGUE: Record<string, CodeInfo> = {
  // Fuel / Injection (I-prefix)
  IE: { name: 'Injection Enable',         desc: 'Injection enable/quantity map',          category: 'fuel' },
  IP: { name: 'Injection Pressure',       desc: 'Injection pressure vs RPM/load',         category: 'fuel' },
  IT: { name: 'Injection Timing',         desc: 'Injection timing advance',               category: 'ignition' },
  IU: { name: 'Pilot Injection 1',        desc: 'Pre-injection quantity map',             category: 'fuel' },
  IV: { name: 'Pilot Injection 2',        desc: 'Second pilot injection quantity',        category: 'fuel' },
  IA: { name: 'Injection Advance',        desc: 'Injection advance correction',           category: 'fuel' },
  IS: { name: 'Injection Start',          desc: 'Start of injection timing',              category: 'ignition' },
  IM: { name: 'Injection Main',           desc: 'Main injection quantity map',            category: 'fuel' },
  IQ: { name: 'Injection Quantity',       desc: 'Injection quantity target map',          category: 'fuel' },
  IC: { name: 'Injection Correction',     desc: 'Injection correction factor',            category: 'fuel' },
  // Boost (B-prefix)
  BS: { name: 'Boost Setpoint',           desc: 'Boost pressure target vs RPM/load',      category: 'boost' },
  BT: { name: 'Boost Target',             desc: 'Maximum boost target map',               category: 'boost' },
  BL: { name: 'Boost Limit',             desc: 'Boost pressure upper limit',             category: 'boost' },
  BM: { name: 'Boost Map',               desc: 'Boost pressure control map',             category: 'boost' },
  BP: { name: 'Boost Pressure',          desc: 'Boost pressure regulation',              category: 'boost' },
  WG: { name: 'Wastegate Duty',          desc: 'Wastegate solenoid duty cycle',          category: 'boost' },
  // Torque (T-prefix)
  TB: { name: 'Torque Base',             desc: 'Base torque map',                        category: 'torque' },
  TQ: { name: 'Torque Target',           desc: 'Torque target map',                      category: 'torque' },
  TP: { name: 'Torque Protection',       desc: 'Torque protection limit',                category: 'torque' },
  TM: { name: 'Torque Max',             desc: 'Maximum torque limit map',               category: 'torque' },
  TL: { name: 'Torque Limit',           desc: 'Torque limitation map',                  category: 'torque' },
  // Limiters (L-prefix)
  L0: { name: 'Load Limit 0',           desc: 'Engine load limit (bank 0)',             category: 'limiter' },
  L8: { name: 'Load Limit 8',           desc: 'Engine load limit (bank 8)',             category: 'limiter' },
  LI: { name: 'Load Index',             desc: 'Load index limit map',                   category: 'limiter' },
  LD: { name: 'Load Demand',            desc: 'Load demand vs pedal position',          category: 'limiter' },
  LM: { name: 'Load Maximum',           desc: 'Maximum load limit',                     category: 'limiter' },
  // Air/Accelerator (A-prefix)
  AM: { name: 'Air Mass',               desc: 'Air mass flow vs RPM/throttle',          category: 'fuel' },
  AP: { name: 'Accelerator Pedal',      desc: 'Pedal position to throttle demand',      category: 'other' },
  AX: { name: 'Axis Table',             desc: 'Reference axis data table',              category: 'other' },
  AL: { name: 'Air/Lambda',             desc: 'Lambda/air mixture map',                 category: 'fuel' },
  AF: { name: 'Air/Fuel Ratio',         desc: 'Target air/fuel ratio map',              category: 'fuel' },
  // Ignition (Z-prefix)
  ZW: { name: 'Ignition Timing',        desc: 'Zündwinkel — ignition advance map',      category: 'ignition' },
  ZA: { name: 'Ignition Advance',       desc: 'Ignition advance correction',            category: 'ignition' },
  ZK: { name: 'Knock Ignition',         desc: 'Knock-retard ignition correction',       category: 'ignition' },
  // EGR (E-prefix)
  EG: { name: 'EGR Rate',              desc: 'Exhaust gas recirculation rate map',      category: 'egr' },
  EV: { name: 'EGR Valve',             desc: 'EGR valve duty cycle map',               category: 'egr' },
  // DPF (D-prefix)
  DP: { name: 'DPF Regen',             desc: 'Diesel particulate filter regen map',     category: 'dpf' },
  DT: { name: 'DPF Threshold',         desc: 'DPF regeneration threshold',             category: 'dpf' },
  // Misc
  LA: { name: 'Lambda Map',            desc: 'Lambda sensor target map',               category: 'other' },
  SP: { name: 'Speed Limit',           desc: 'Vehicle speed limiter map',              category: 'limiter' },
  NM: { name: 'RPM Limit',             desc: 'RPM rev limiter map',                    category: 'limiter' },
  KF: { name: 'Map (KF)',              desc: 'Kennfeld calibration map',               category: 'other' },
}

// Known codes that are axis/header records, not actual data maps
const SKIP_CODES = new Set(['AX', 'STD0_100', '2', ''])

// ─── Data type detection ──────────────────────────────────────────────────────

function inferDataType(desc: string): DRTMapDef['dataType'] {
  const first = desc.charAt(0).toUpperCase()
  switch (first) {
    case 'G': return 'uint8'   // G = unsigned byte
    case 'B': return 'uint8'   // B = byte
    case 'W': return 'uint16'  // W = word
    case 'C': return 'uint16'  // C = calibrated word
    case 'S': return 'int8'    // S = signed byte
    case 'I': return 'int16'   // I = signed word
    case 'F': return 'float32' // F = float
    default:  return 'uint16'  // default to uint16
  }
}

// ─── Address parser ───────────────────────────────────────────────────────────

function parseHexAddr(s: string): number {
  const cleaned = s.trim().replace(/[^0-9A-Fa-f]/g, '')
  if (!cleaned) return 0
  return parseInt(cleaned, 16)
}

function parseAddrList(s: string): number[] {
  return s.split(',').map(a => parseHexAddr(a)).filter(a => a > 0)
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseDRT(buffer: ArrayBuffer, driverName = 'unknown'): DRTParseResult {
  const bytes = new Uint8Array(buffer)
  const warnings: string[] = []
  const maps: DRTMapDef[] = []

  const DELIM = 0xBB   // field separator
  const MARKER = 0x84  // record separator

  // Split the buffer into chunks separated by [MARKER, DELIM] sequences
  // Each chunk is the bytes between two marker pairs
  const chunks: string[] = []
  let current: number[] = []

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === MARKER && i + 1 < bytes.length && bytes[i + 1] === DELIM) {
      // Found [0x84, 0xBB] — end current chunk, start new one
      chunks.push(String.fromCharCode(...current))
      current = []
      i++ // skip the 0xBB
    } else {
      current.push(bytes[i])
    }
  }
  if (current.length > 0) {
    chunks.push(String.fromCharCode(...current))
  }

  // Parse the header (usually chunks[1] or [2])
  let maxAddress = 0
  let headerFound = false

  for (let i = 0; i < Math.min(chunks.length, 5); i++) {
    if (chunks[i].includes('STD0_100') || chunks[i].includes('STD')) {
      const parts = chunks[i].split(String.fromCharCode(DELIM))
      const addrStr = parts.find(p => /^[0-9A-Fa-f]{6,8}$/.test(p.trim()))
      if (addrStr) maxAddress = parseHexAddr(addrStr)
      headerFound = true
      break
    }
  }

  if (!headerFound) {
    warnings.push('DRT header not found — file may be corrupt or unsupported version')
  }

  // Process chunks in pairs: [entry-header, entry-detail]
  // Entry-header chunk: "CODE\xBBcols\xBBrows\xBBf1\xBBf2\xBB"
  // Entry-detail chunk: "nAxes\xBBaxisDesc\xBBvalDesc\xBBnAddrs\xBBaddrList\xBBchkOff\xBBf3\xBBf4"
  //
  // Strategy: scan all chunks for ones whose first token is a known map code
  // The NEXT chunk should contain the address info

  for (let i = 0; i < chunks.length - 1; i++) {
    const headerParts = chunks[i].split(String.fromCharCode(DELIM)).map(s => s.trim())
    const code = headerParts[0]

    if (!code || SKIP_CODES.has(code) || code.length > 4 || !/^[A-Z0-9_]+$/.test(code)) {
      continue
    }

    const colsRaw = parseInt(headerParts[1] ?? '0')
    const rowsRaw = parseInt(headerParts[2] ?? '0')

    if (isNaN(colsRaw) || isNaN(rowsRaw) || colsRaw <= 0 || rowsRaw < 0) {
      continue
    }

    // cols and rows in ECM Titanium: sometimes cols=cols, rows=rows
    // Some single-row maps have rows=0 meaning it's a 1D curve
    const cols = colsRaw
    const rows = rowsRaw === 0 ? 1 : rowsRaw

    // Parse the detail chunk (next chunk)
    const detailParts = chunks[i + 1].split(String.fromCharCode(DELIM)).map(s => s.trim())

    // Find address list in detail parts
    // Typically: [nAxes, axisDesc, valDesc, nAddrs, addrList, chkOff, f3, f4]
    // Or sometimes: [axisDesc, valDesc, nAddrs, addrList, ...]
    let addrList: number[] = []
    let axisDesc = ''
    let valDesc = ''
    let axisAddress = 0

    for (let j = 0; j < detailParts.length; j++) {
      const part = detailParts[j]
      // Axis descriptor: looks like "G,4,0,00928F" or "G,J,0,000000"
      if (!axisDesc && /^[A-Z],[0-9A-ZJ],\d+,[0-9A-Fa-f]{6}$/.test(part)) {
        axisDesc = part
        const axisAddrStr = part.split(',')[3]
        axisAddress = parseHexAddr(axisAddrStr)
        continue
      }
      // Value descriptor: looks like "C,C,0,000000"
      if (!valDesc && /^[A-Z],[A-Z0-9],\d+,[0-9A-Fa-f]{6}$/.test(part)) {
        valDesc = part
        continue
      }
      // Address list: "008FF2" or "008C3A,008C52"
      if (/^[0-9A-Fa-f]{4,8}(,[0-9A-Fa-f]{4,8})*$/.test(part) && part !== '000000') {
        addrList = parseAddrList(part)
      }
    }

    if (addrList.length === 0) {
      // Try harder: look for any hex string that looks like an address
      for (const part of detailParts) {
        if (/^[0-9A-Fa-f]{4,6}$/.test(part.trim()) && part.trim() !== '000000') {
          const addr = parseHexAddr(part.trim())
          if (addr > 0x1000) { // reasonable minimum offset
            addrList = [addr]
            break
          }
        }
      }
    }

    if (addrList.length === 0) continue // no address found, skip

    const primaryAddr = addrList[0]

    // Look up code info
    const info: CodeInfo = CODE_CATALOGUE[code] ?? {
      name: `Map ${code}`,
      desc: `ECM Titanium map type ${code}`,
      category: 'other',
    }

    // Determine data types from descriptors
    const dataType = valDesc ? inferDataType(valDesc) : 'uint16'
    const axisDataType = axisDesc ? inferDataType(axisDesc) : 'uint8'

    maps.push({
      code,
      name: info.name,
      description: info.desc,
      category: info.category,
      cols,
      rows,
      address: primaryAddr,
      allAddresses: addrList,
      axisAddress,
      axisDataType,
      dataType,
    })
  }

  // Deduplicate by address (keep first occurrence)
  const seen = new Set<number>()
  const uniqueMaps = maps.filter(m => {
    if (seen.has(m.address)) return false
    seen.add(m.address)
    return true
  })

  return {
    driverName,
    maxAddress,
    maps: uniqueMaps,
    totalMaps: uniqueMaps.filter(m => m.rows > 1).length,
    totalCurves: uniqueMaps.filter(m => m.rows === 1).length,
    warnings,
  }
}

// ─── Convert DRT maps to our A2LMapDef-compatible format ─────────────────────
// Returns objects that mirror A2LMapDef so RemapBuilder can treat them uniformly

export interface DRTConvertedMap {
  name: string
  description: string
  category: DRTMapDef['category']
  address: number
  fileOffset: number   // same as address for DRT (direct file offsets)
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
  return result.maps
    .filter(m => m.category !== 'other' || m.code === 'AM' || m.code === 'AP')
    .map(m => ({
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
  if (name.includes('EDC17')) return 'EDC17'
  if (name.includes('EDC16')) return 'EDC16'
  if (name.includes('SIMOS') || name.includes('SIM18')) return 'SIMOS18'
  if (name.includes('ME7') || name.includes('ME75')) return 'ME7'
  if (name.includes('EDC15')) return 'EDC15'

  // Infer from map code patterns
  const codes = new Set(result.maps.map(m => m.code))
  if (codes.has('ZW') && codes.has('AM')) return 'MED17'       // petrol indicators
  if (codes.has('IT') && codes.has('IP')) return 'EDC17'       // diesel indicators
  if (codes.has('IT') && codes.has('IU')) return 'EDC16'       // older diesel
  if (codes.has('IP') && codes.has('IU') && codes.has('IV')) return 'EDC15'

  return 'MED17' // default
}
