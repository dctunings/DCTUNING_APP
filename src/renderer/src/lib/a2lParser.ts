// src/renderer/src/lib/a2lParser.ts
// A2L (ASAP2) file parser for ECU calibration definitions

export interface A2LAxis {
  inputVariable: string
  conversionMethod: string
  size: number
  lowerLimit: number
  upperLimit: number
}

export interface A2LCharacteristic {
  name: string
  description: string
  type: 'VALUE' | 'CURVE' | 'MAP'
  address: number
  recordLayout: string
  conversionMethod: string
  lowerLimit: number
  upperLimit: number
  axes: A2LAxis[]
}

export interface A2LCompuMethod {
  name: string
  conversionType: string
  factor: number
  physicalOffset: number
}

export interface A2LParseResult {
  ecuName: string
  characteristics: A2LCharacteristic[]
  compuMethods: Map<string, A2LCompuMethod>
  totalMaps: number
  totalCurves: number
  totalValues: number
  warnings: string[]
}

export interface A2LMapDef {
  name: string
  description: string
  category: 'boost' | 'fuel' | 'torque' | 'ignition' | 'egr' | 'dpf' | 'limiter' | 'other'
  address: number
  fileOffset: number
  rows: number
  cols: number
  dataType: 'uint8' | 'int8' | 'uint16' | 'int16' | 'float32'
  le: boolean            // endianness — false = big-endian (ME7/EDC15/SID), true = little-endian (TriCore)
  factor: number
  physicalOffset: number
  min: number
  max: number
  axisX: { size: number; min: number; max: number; label: string }
  axisY?: { size: number; min: number; max: number; label: string }
}

export const ECU_BASE_ADDRESSES: Record<string, number> = {
  'MED17': 0x80000000,
  'EDC17': 0x80000000,
  'SIMOS18': 0x80000000,
  'SIMOS19': 0x80000000,
  'ME7': 0x00000000,
  'ME9': 0x80000000,
  'MED9': 0x80000000,
  'EDC16': 0x00000000,  // MPC5565 PowerPC — flash is 0-based (0x00000000–0x001FFFFF)
  'EDC15': 0x00000000,
  'MEVD17': 0x80000000,
}

// Extract all /begin TAG ... /end TAG blocks
function extractBlocks(content: string, tag: string): string[] {
  const blocks: string[] = []
  const beginTag = `/begin ${tag}`
  const endTag = `/end ${tag}`
  let pos = 0
  while (pos < content.length) {
    const start = content.indexOf(beginTag, pos)
    if (start === -1) break
    const end = content.indexOf(endTag, start)
    if (end === -1) break
    blocks.push(content.slice(start + beginTag.length, end).trim())
    pos = end + endTag.length
  }
  return blocks
}

// Tokenise a block (handles quoted strings as single tokens)
// BUG FIX E2: regex now matches // line comments so they are consumed and skipped,
// preventing the comment text from being parsed as data tokens (address shift bug).
function tokenise(block: string): string[] {
  const tokens: string[] = []
  const re = /"[^"]*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[^\s]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const t = m[0]
    if (t.startsWith('/*') || t.startsWith('//')) continue // skip block and line comments
    tokens.push(t)
  }
  return tokens
}

function parseAxisDescr(block: string): A2LAxis {
  const tokens = tokenise(block)
  // tokens[0] = axis type (STD_AXIS / COM_AXIS / FIX_AXIS)
  const inputVariable = tokens[1] ?? ''
  const conversionMethod = tokens[2] ?? ''
  const size = parseInt(tokens[3] ?? '0', 10)
  const lowerLimit = parseFloat(tokens[4] ?? '0')
  const upperLimit = parseFloat(tokens[5] ?? '0')
  return { inputVariable, conversionMethod, size, lowerLimit, upperLimit }
}

function parseCharacteristic(block: string): A2LCharacteristic | null {
  try {
    // Extract axis descr blocks first, then remove them from block for cleaner parsing
    const axisBlocks = extractBlocks(block, 'AXIS_DESCR')
    const axes = axisBlocks.map(parseAxisDescr)

    // Remove nested blocks for cleaner tokenisation of header
    const cleanBlock = block.replace(/\/begin AXIS_DESCR[\s\S]*?\/end AXIS_DESCR/g, '')
    const tokens = tokenise(cleanBlock)

    // tokens: [name, "description", type, 0xAddress, recordLayout, maxDiff, convMethod, lower, upper, ...]
    let i = 0
    const name = tokens[i++] ?? ''
    const description = (tokens[i++] ?? '').replace(/^"|"$/g, '')
    const typeStr = tokens[i++] ?? ''
    if (typeStr !== 'VALUE' && typeStr !== 'CURVE' && typeStr !== 'MAP') return null
    const type = typeStr as 'VALUE' | 'CURVE' | 'MAP'
    const addrStr = tokens[i++] ?? '0'
    // BUG FIX B3: A2L addresses may be decimal (older Delphi/Marelli/non-Bosch tools)
    // or hex with 0x prefix (Bosch, Continental, standard ASAP2).
    // Always parsing as base-16 silently mangles decimal addresses (e.g. 134217728 → 0x8000000 is
    // coincidentally correct, but 135790616 → wrong). Check for the 0x prefix first.
    const address = /^0x/i.test(addrStr)
      ? parseInt(addrStr, 16)
      : parseInt(addrStr, 10)
    if (isNaN(address) || address === 0) return null
    const recordLayout = tokens[i++] ?? ''
    i++ // skip maxDiff
    const conversionMethod = tokens[i++] ?? ''
    const lowerLimit = parseFloat(tokens[i++] ?? '0')
    const upperLimit = parseFloat(tokens[i++] ?? '0')

    return { name, description, type, address, recordLayout, conversionMethod, lowerLimit, upperLimit, axes }
  } catch {
    return null
  }
}

function parseCompuMethod(block: string): A2LCompuMethod | null {
  try {
    const tokens = tokenise(block)
    const name = tokens[0] ?? ''
    // Find COEFFS
    const coeffIdx = tokens.indexOf('COEFFS')
    let factor = 1
    let physicalOffset = 0
    if (coeffIdx !== -1 && tokens[coeffIdx + 6] !== undefined) {
      // COEFFS a b c d e f  -> physical = (b*raw + c) / f
      const b = parseFloat(tokens[coeffIdx + 2])
      const c = parseFloat(tokens[coeffIdx + 3])
      const f = parseFloat(tokens[coeffIdx + 6])
      if (!isNaN(b) && !isNaN(f) && f !== 0) {
        factor = b / f
        physicalOffset = c / f
      }
    }
    // Fallback: try LINEAR coeffs: COEFFS_LINEAR a b -> physical = a*raw + b
    const linIdx = tokens.indexOf('COEFFS_LINEAR')
    if (linIdx !== -1) {
      factor = parseFloat(tokens[linIdx + 1])
      physicalOffset = parseFloat(tokens[linIdx + 2])
    }
    const conversionType = tokens[3] ?? 'RAT_FUNC'
    return { name, conversionType, factor: isNaN(factor) ? 1 : factor, physicalOffset: isNaN(physicalOffset) ? 0 : physicalOffset }
  } catch {
    return null
  }
}

// Decode factor from common Bosch conversion method name patterns
// e.g. nmot_uw_q0p25 -> 0.25, rel_uw_q0p0234 -> 0.0234, zw_sb_q0p75 -> 0.75
function decodeFactorFromName(name: string): number {
  const qMatch = name.match(/q(\d+)p(\d+)/)
  if (qMatch) {
    return parseFloat(`${qMatch[1]}.${qMatch[2]}`)
  }
  const bMatch = name.match(/b(\d+)/)
  if (bMatch) {
    return 1 / parseFloat(bMatch[1])
  }
  return 1
}

function inferDataType(recordLayout: string, conversionMethod: string): 'uint8' | 'int8' | 'uint16' | 'int16' | 'float32' {
  const s = (recordLayout + ' ' + conversionMethod).toLowerCase()
  if (s.includes('float32') || s.includes('float')) return 'float32'
  if (s.includes('sbyte') || s.includes('_sbyte')) return 'int8'
  if (s.includes('ubyte') || s.includes('_ubyte') || s.includes('u8') || s.includes('wub') || s.includes('wu8')) return 'uint8'
  if (s.includes('sword') || s.includes('_sw') || s.includes('ws16') || s.includes('wsw') || s.includes('s16')) return 'int16'
  if (s.includes('uword') || s.includes('_uw') || s.includes('wu16') || s.includes('wuw') || s.includes('u16')) return 'uint16'
  if (s.includes('_ub') || s.includes('wub') || s.includes('kwu') || s.includes('ku8')) return 'uint8'
  if (s.includes('wsb') || s.includes('ssty') || (s.includes('sb') && !s.includes('usb'))) return 'int8'
  return 'uint16'
}

function categoriseMap(name: string, desc: string): A2LMapDef['category'] {
  const s = (name + ' ' + desc).toLowerCase()
  if (/lade|boost|ldr|ldsol|ladedruck|aufladedruck|pressol|turb/.test(s)) return 'boost'
  if (/kfzw|zundwink|z.ndwink|ignit|zuend/.test(s)) return 'ignition'
  if (/agr|egr/.test(s)) return 'egr'
  if (/dpf|russ|partikel|regen/.test(s)) return 'dpf'
  if (/nmax|vmax|begr|limit|sperrung|abschalt|abregel/.test(s)) return 'limiter'
  if (/mom|drehmom|torq|mxmomi|mxmotor|drehm/.test(s)) return 'torque'
  if (/kfmirl|kfped|einspritz|menge|fuel|kraftstoff|dmll|injection|fuell/.test(s)) return 'fuel'
  return 'other'
}

function axisLabel(variable: string, min: number, max: number): string {
  const v = variable.toLowerCase()
  if (v.includes('nmot') || v.includes('rpm') || v.includes('ngas')) return `${min}–${max} RPM`
  if (v.includes('rl') || v.includes('rel') || v.includes('load') || v.includes('mil') || v.includes('pede')) return `${min}–${max}% Load`
  if (v.includes('temp') || v.includes('tmot') || v.includes('tatm')) return `${min}–${max} °C`
  if (v.includes('bfzg') || v.includes('speed') || v.includes('vfzg')) return `${min}–${max} km/h`
  return `${min}–${max}`
}

export function parseA2L(content: string): A2LParseResult {
  const warnings: string[] = []

  // Truncate very large files for performance
  const MAX_PARSE = 40_000_000 // 40MB chars
  let parseContent = content
  if (content.length > MAX_PARSE) {
    parseContent = content.slice(0, MAX_PARSE)
    warnings.push(`File truncated to 40MB for performance (${(content.length / 1_000_000).toFixed(1)}MB total)`)
  }

  // Extract ECU name from PROJECT — prefer the quoted description over the bare identifier
  // because many Bosch A2Ls use a short code as the identifier (e.g. "X447") while
  // the description holds the useful family string (e.g. "EDC16U34").
  // Also check the MODULE name as a third fallback.
  const projMatch = parseContent.match(/\/begin PROJECT\s+(\S+)\s+"([^"]*)"/)
  const projId    = projMatch ? projMatch[1] : ''
  const projDesc  = projMatch ? projMatch[2] : ''
  const modMatch  = parseContent.match(/\/begin MODULE\s+(\S+)/)
  const modName   = modMatch ? modMatch[1] : ''
  // Build a combined name string so guessEcuFamily can search it
  const ecuName = [projDesc, projId, modName].filter(Boolean).join(' ') || 'Unknown'

  // Parse COMPU_METHODs
  const compuMethods = new Map<string, A2LCompuMethod>()
  const compuBlocks = extractBlocks(parseContent, 'COMPU_METHOD')
  for (const b of compuBlocks) {
    const cm = parseCompuMethod(b)
    if (cm) compuMethods.set(cm.name, cm)
  }

  // Parse CHARACTERISTICs
  const characteristics: A2LCharacteristic[] = []
  const charBlocks = extractBlocks(parseContent, 'CHARACTERISTIC')
  let totalMaps = 0, totalCurves = 0, totalValues = 0

  for (const b of charBlocks) {
    const ch = parseCharacteristic(b)
    if (!ch) continue
    characteristics.push(ch)
    if (ch.type === 'MAP') totalMaps++
    else if (ch.type === 'CURVE') totalCurves++
    else totalValues++
  }

  return { ecuName, characteristics, compuMethods, totalMaps, totalCurves, totalValues, warnings }
}

// BUG FIX D1 (part 1): derive endianness from ECU family so validateA2LMapsInBinary
// reads bytes in the correct order.
// Big-endian ECUs: Motorola 68K (ME7), SH-series (EDC15), NEC (SID*), PowerPC (EDC16 MPC5565).
// Little-endian ECUs: TriCore (EDC17, MED17, SIMOS, ME9, MEVD17) and x86.
// NOTE: EDC16 uses MPC5565 (PowerPC) which is big-endian — NOT TriCore.
const BIG_ENDIAN_FAMILIES = new Set(['ME7', 'EDC15', 'EDC16', 'SID208', 'SID807', 'SID310'])

export function extractMapsFromA2L(result: A2LParseResult, baseAddress: number): A2LMapDef[] {
  const maps: A2LMapDef[] = []

  // Determine endianness for this A2L file
  const family = guessEcuFamily(result)
  const isLE = !BIG_ENDIAN_FAMILIES.has(family)  // default LE for unknown / TriCore families

  for (const ch of result.characteristics) {
    if (ch.type === 'VALUE') continue

    const fileOffset = ch.address - baseAddress
    if (fileOffset < 0) continue // address below base -- likely not a file offset

    // Get scaling from COMPU_METHOD
    let factor = 1
    let physicalOffset = 0
    const cm = result.compuMethods.get(ch.conversionMethod)
    if (cm) {
      factor = cm.factor
      physicalOffset = cm.physicalOffset
    } else {
      factor = decodeFactorFromName(ch.conversionMethod)
    }

    const dataType = inferDataType(ch.recordLayout, ch.conversionMethod)
    const category = categoriseMap(ch.name, ch.description)

    let rows = 1
    let cols = 1
    let axisX = { size: 1, min: 0, max: 0, label: '' }
    let axisY: A2LMapDef['axisY'] = undefined

    if (ch.type === 'CURVE' && ch.axes.length >= 1) {
      const ax = ch.axes[0]
      cols = ax.size
      axisX = { size: ax.size, min: ax.lowerLimit, max: ax.upperLimit, label: axisLabel(ax.inputVariable, ax.lowerLimit, ax.upperLimit) }
    } else if (ch.type === 'MAP' && ch.axes.length >= 2) {
      const ax0 = ch.axes[0]
      const ax1 = ch.axes[1]
      cols = ax0.size
      rows = ax1.size
      axisX = { size: ax0.size, min: ax0.lowerLimit, max: ax0.upperLimit, label: axisLabel(ax0.inputVariable, ax0.lowerLimit, ax0.upperLimit) }
      axisY = { size: ax1.size, min: ax1.lowerLimit, max: ax1.upperLimit, label: axisLabel(ax1.inputVariable, ax1.lowerLimit, ax1.upperLimit) }
    }

    if (cols === 0 || rows === 0) continue

    maps.push({
      name: ch.name,
      description: ch.description,
      category,
      address: ch.address,
      fileOffset,
      rows,
      cols,
      dataType,
      le: isLE,
      factor,
      physicalOffset,
      min: ch.lowerLimit,
      max: ch.upperLimit,
      axisX,
      axisY,
    })
  }

  // Sort: tuning-relevant categories first
  const catOrder = ['boost', 'torque', 'fuel', 'ignition', 'egr', 'dpf', 'limiter', 'other']
  maps.sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category))

  return maps
}

export function guessEcuFamily(result: A2LParseResult): string {
  const nameUpper = result.ecuName.toUpperCase()
  if (nameUpper.includes('MED17') || nameUpper.includes('MED 17')) return 'MED17'
  if (nameUpper.includes('EDC17')) return 'EDC17'
  if (nameUpper.includes('SIMOS18') || nameUpper.includes('SIMOS 18')) return 'SIMOS18'
  if (nameUpper.includes('SIMOS19')) return 'SIMOS19'
  if (nameUpper.includes('ME7')) return 'ME7'
  if (nameUpper.includes('ME9') || nameUpper.includes('MED9')) return 'ME9'
  if (nameUpper.includes('EDC16')) return 'EDC16'
  if (nameUpper.includes('EDC15')) return 'EDC15'
  if (nameUpper.includes('MS43') || nameUpper.includes('MS45')) return 'ME7'

  // Score by characteristic names
  const names = new Set(result.characteristics.map(c => c.name))
  let med17Score = 0, edc17Score = 0, me7Score = 0
  if (names.has('KFMIRL')) med17Score += 3
  if (names.has('KFZW'))  { med17Score += 1; me7Score += 2 }  // shared, weighted toward ME7
  if (names.has('KFPED')) med17Score += 2
  if (names.has('KFLDRL')) edc17Score += 3
  // ME7-specific map names (Bosch Motronic ME7.x)
  if (names.has('LDRXN'))  me7Score += 3  // boost pressure setpoint — ME7 only
  if (names.has('KFTWUP')) me7Score += 2  // warm-up enrichment — ME7/ME9 only
  if (names.has('KFURL'))  me7Score += 2  // lambda control — ME7 specific name
  if (names.has('MLHFM'))  me7Score += 2  // HFM air mass characteristic — ME7
  if (names.has('CWKOS'))  me7Score += 2  // knock sensor config word — ME7
  if (names.has('KFNWN'))  me7Score += 2  // injector correction — ME7
  if (names.has('LDRPR'))  me7Score += 2  // boost pressure ref map — ME7
  if (names.has('KFZW2'))  me7Score += 2  // secondary ignition map — ME7.5
  if (names.has('KFMIOP')) me7Score += 2  // injection map — ME7

  if (me7Score > med17Score && me7Score > edc17Score) return 'ME7'
  if (edc17Score > med17Score) return 'EDC17'
  // Don't force-return MED17 — return empty string to signal "unknown"
  // so detectBaseAddress can derive from addresses instead
  if (med17Score > 0) return 'MED17'
  return ''
}

// ─── Auto-detect flash base address ───────────────────────────────────────────
// Preferred over the fixed ECU_BASE_ADDRESSES lookup when the ECU family is
// unknown or the A2L comes from a non-standard tool.
// Strategy: use the family lookup when available; otherwise derive the base
// from the minimum characteristic address (rounded to 64KB boundary).
export function detectBaseAddress(result: A2LParseResult): number {
  const family = guessEcuFamily(result)
  if (family && ECU_BASE_ADDRESSES[family] !== undefined) return ECU_BASE_ADDRESSES[family]

  // Derive from actual A2L addresses — the flash base is approximately the
  // minimum characteristic address, rounded down to a 64KB boundary.
  const addrs = result.characteristics
    .filter(c => c.type !== 'VALUE')
    .map(c => c.address)
    .filter(a => a > 0)
  if (addrs.length === 0) return 0x80000000  // safe fallback for Bosch TriCore

  const minAddr = Math.min(...addrs)
  const maxAddr = Math.max(...addrs)

  // Old-architecture ECUs (Motorola 68K / SH-series / PowerPC: ME7, EDC15, EDC16, MS4x, older Marelli)
  // have flash mapped at 0x00000000. Their A2L addresses are all below 16 MB.
  // TriCore ECUs (EDC17, MED17, SIMOS, ME9) use 0x80000000+ address space.
  // Rounding minAddr to a 64KB boundary gives the wrong result for old-arch ECUs
  // whose lowest map address may be e.g. 0x00018000 → rounds to 0x00010000 ≠ 0.
  if (maxAddr < 0x01000000) return 0x00000000  // old arch: base address is always 0
  return minAddr & 0xFFFF0000  // TriCore/new arch: round down to 64KB boundary
}

