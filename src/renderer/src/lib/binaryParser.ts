import type { EcuDef, MapDef, DataType } from './ecuDefinitions'
import { ECU_DEFINITIONS } from './ecuDefinitions'
import type { A2LMapDef } from './a2lParser'

export interface DetectedEcu {
  def: EcuDef
  confidence: number     // 0–1
  matchedStrings: string[]
  fileSize: number
}

export interface ExtractedMap {
  mapDef: MapDef
  data: number[][]      // physical values (after factor/offset applied)
  rawData: number[][]   // raw integer values as stored in binary
  offset: number        // byte offset where map was found (-1 = not found)
  found: boolean
}

// ─── ECU Detection ────────────────────────────────────────────────────────────
export function detectEcu(buffer: ArrayBuffer): DetectedEcu | null {
  const bytes = new Uint8Array(buffer)

  // Build three search strings from the full binary:
  // 1. ascii_spaced    — non-printable → space  (standard string matching with separators)
  // 2. ascii_compact   — non-printable → ''     (catches null-padded strings: "EDC17\x00C46")
  // 3. ascii_nounderscore — underscores removed  (Bosch embeds "EDC17_CP20" but identStrings use "EDC17CP20")
  const ascii_spaced       = Array.from(bytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ' ').join('')
  const ascii_compact      = Array.from(bytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '' ).join('')
  const ascii_nounderscore = Array.from(bytes).map(b => b === 95 ? '' : b >= 32 && b < 127 ? String.fromCharCode(b) : '').join('')

  let best: DetectedEcu | null = null
  let bestScore = 0

  for (const def of ECU_DEFINITIONS) {
    const matched: string[] = []
    for (const s of def.identStrings) {
      if (s.length < 4) continue  // ignore any string too short to be meaningful
      if (ascii_spaced.includes(s) || ascii_compact.includes(s) || ascii_nounderscore.includes(s)) matched.push(s)
    }
    // Also check file size range
    const sizeOk = buffer.byteLength >= def.fileSizeRange[0] && buffer.byteLength <= def.fileSizeRange[1]
    // Require at least one ident string match — size alone is not sufficient
    if (matched.length === 0) continue

    // Length-weighted scoring: longer strings are more specific and count for more.
    // "EDC17CP20" (9 chars) outweighs "EDC16" (5 chars) — prevents a binary that
    // contains both EDC16 and EDC17 strings from resolving to the wrong family.
    const qualifiedStrings = def.identStrings.filter(s => s.length >= 4)
    const matchedWeight  = matched.reduce((sum, s) => sum + s.length, 0)
    const totalWeight    = qualifiedStrings.reduce((sum, s) => sum + s.length, 0)
    const stringScore    = totalWeight > 0 ? matchedWeight / totalWeight : 0
    const score = stringScore * 0.7 + (sizeOk ? 0.3 : 0)
    if (score > bestScore) {
      bestScore = score
      best = { def, confidence: score, matchedStrings: matched, fileSize: buffer.byteLength }
    }
  }

  return bestScore > 0.15 ? best : null
}

// ─── Filename-based ECU detection fallback ────────────────────────────────────
// Used when binary content detection fails (encrypted/proprietary/tool-format files).
// Parses the filename for ECU family keywords and returns a low-confidence match.
// Keyword list covers common naming conventions from WinOLS, ECM Titanium, KESS, CMD etc.
export function detectEcuFromFilename(filename: string): DetectedEcu | null {
  const lower = filename.toLowerCase()

  // Map of filename keywords → ECU definition id (ordered most-specific first)
  const filenameRules: Array<[string[], string]> = [
    [['edc17cp20','cp20'],            'edc17'],
    [['edc17cp14','cp14'],            'edc17'],
    [['edc17c46','c46'],              'edc17'],
    [['edc17c41','c41'],              'edc17'],
    [['edc17cp','edc17c','edc17u'],   'edc17'],
    [['edc17'],                       'edc17'],
    [['edc16c34','c34'],              'edc16'],
    [['edc16c8','c8'],                'edc16'],
    [['edc16cp','edc16c','edc16u'],   'edc16'],
    [['edc16'],                       'edc16'],
    [['edc15c','edc15p','edc15'],     'edc15'],
    [['med17.5','med175'],            'med17'],
    [['med17.9','med179'],            'med17'],
    [['med17'],                       'med17'],
    [['me7.5','me75','me7'],          'me7'],
    [['me9.0','me90','me9'],          'me9'],
    [['simos18','sim18'],             'simos18'],
    [['simos11','sim11'],             'continental_simos11'],
    [['simos10','sim10'],             'simos10'],
    [['msd80','msd85','msd87'],       'bmw_msd'],
    [['ppd1.1','ppd1.2','ppd1.3','ppd1.5','ppd1'], 'vag_ppd1'],
    [['dcm3.5','dcm35'],              'dcm35'],
    [['dcm3.7','dcm37'],              'delphi_mt86'],
    [['dcm6.1','dcm61'],              'dcm61'],
    [['dcm6.2','dcm62'],              'vag_dcm62'],
    [['crd2.1','crd2'],               'delphi_crd2'],
    [['crd3.1','crd3'],               'delphi_crd3'],
    [['sid208'],                      'sid208'],
    [['sid807'],                      'sid807'],
    [['sid310','sid305','sid307'],    'sid310'],
    [['ems3120','ems312'],            'ems3120'],
    [['pcr2.1','pcr21'],              'pcr21'],
    [['mjd6','mjd8','mj8'],           'marelli_mjd'],
    [['iaw4','iaw5','iaw6','iaw7'],   'marelli_iaw'],
    [['mt80'],                        'delphi_mt80'],
    [['mevd17'],                      'bmw_mevd17'],
    [['mg1cs','mg1c'],                'mg1'],
    [['sim2k'],                       'sim2k'],
  ]

  for (const [keywords, defId] of filenameRules) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const def = ECU_DEFINITIONS.find(d => d.id === defId)
        if (def) {
          return {
            def,
            confidence: 0.35,   // low confidence — filename hint only
            matchedStrings: [kw],
            fileSize: 0,
          }
        }
      }
    }
  }
  return null
}

// ─── Signature search ─────────────────────────────────────────────────────────
function findSignature(bytes: Uint8Array, sig: number[]): number {
  outer: for (let i = 0; i <= bytes.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) continue outer
    }
    return i + sig.length  // return position AFTER the signature
  }
  return -1
}

// ─── Read value from buffer ───────────────────────────────────────────────────
function readVal(view: DataView, offset: number, dtype: DataType, le: boolean): number {
  switch (dtype) {
    case 'uint8':   return view.getUint8(offset)
    case 'int8':    return view.getInt8(offset)
    case 'uint16':  return view.getUint16(offset, le)
    case 'int16':   return view.getInt16(offset, le)
    case 'float32': return view.getFloat32(offset, le)
    default:        return view.getUint8(offset)
  }
}

function dtypeSize(dtype: DataType): number {
  switch (dtype) {
    case 'uint8': case 'int8':    return 1
    case 'uint16': case 'int16':  return 2
    case 'float32':               return 4
    default:                       return 1
  }
}

// ─── Extract a single map ─────────────────────────────────────────────────────
export function extractMap(buffer: ArrayBuffer, mapDef: MapDef): ExtractedMap {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const elSize = dtypeSize(mapDef.dtype)
  const needed = mapDef.rows * mapDef.cols * elSize

  const readAt = (pos: number) => {
    if (pos < 0 || pos + needed > buffer.byteLength) return null
    const raw: number[][] = []
    const phys: number[][] = []
    for (let r = 0; r < mapDef.rows; r++) {
      raw.push([])
      phys.push([])
      for (let c = 0; c < mapDef.cols; c++) {
        const rawVal = readVal(view, pos + (r * mapDef.cols + c) * elSize, mapDef.dtype, mapDef.le)
        raw[r].push(rawVal)
        phys[r].push(rawVal * mapDef.factor + mapDef.offsetVal)
      }
    }
    return { raw, phys }
  }

  // Try each signature
  for (const sig of mapDef.signatures) {
    let pos = findSignature(bytes, sig)
    if (pos === -1) continue
    pos += mapDef.sigOffset
    const result = readAt(pos)
    if (!result) continue
    return { mapDef, data: result.phys, rawData: result.raw, offset: pos, found: true }
  }

  // Fallback: use fixedOffset if provided (known variant-specific location)
  if (mapDef.fixedOffset !== undefined && mapDef.fixedOffset >= 0) {
    const result = readAt(mapDef.fixedOffset)
    if (result) {
      return { mapDef, data: result.phys, rawData: result.raw, offset: mapDef.fixedOffset, found: true }
    }
  }

  // Not found — return zeroed placeholder
  const empty = Array.from({ length: mapDef.rows }, () => Array(mapDef.cols).fill(0))
  return { mapDef, data: empty, rawData: empty, offset: -1, found: false }
}

// ─── Extract all maps for an ECU ─────────────────────────────────────────────
export function extractAllMaps(buffer: ArrayBuffer, ecuDef: EcuDef): ExtractedMap[] {
  return ecuDef.maps.map(m => extractMap(buffer, m))
}

// ─── Write value to buffer ────────────────────────────────────────────────────
function writeVal(view: DataView, offset: number, value: number, dtype: DataType, le: boolean): void {
  const clamped = Math.round(value)
  switch (dtype) {
    case 'uint8':   view.setUint8(offset, Math.max(0, Math.min(255, clamped))); break
    case 'int8':    view.setInt8(offset, Math.max(-128, Math.min(127, clamped))); break
    case 'uint16':  view.setUint16(offset, Math.max(0, Math.min(65535, clamped)), le); break
    case 'int16':   view.setInt16(offset, Math.max(-32768, Math.min(32767, clamped)), le); break
    case 'float32': view.setFloat32(offset, value, le); break
  }
}

// ─── A2L address validation ────────────────────────────────────────────────────
// Validates whether A2L map addresses point to real data in the binary by checking
// if sample physical values fall within the map's declared min/max range.
// This is the safety gate: only maps with status 'valid' should be written to.

export interface A2LValidationResult {
  map: A2LMapDef
  status: 'valid' | 'uncertain' | 'invalid' | 'outofrange'
  confidence: number      // 0–1, fraction of sample values within physical range
  sampleValues: number[]  // physical values sampled from the binary at this address
  signature: number[]     // up to 12 bytes immediately before the map in the binary
}

export function validateA2LMapsInBinary(
  buffer: ArrayBuffer,
  maps: A2LMapDef[]
): A2LValidationResult[] {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  return maps.map(map => {
    const dtype = map.dataType as DataType
    const elSize = dtypeSize(dtype)
    const totalBytes = map.rows * map.cols * elSize

    // Address out of file bounds
    if (map.fileOffset < 0 || map.fileOffset + totalBytes > buffer.byteLength) {
      return { map, status: 'outofrange', confidence: 0, sampleValues: [], signature: [] }
    }

    // Sample up to 16 values spread across the map
    const total = map.rows * map.cols
    const stride = Math.max(1, Math.floor(total / 16))
    const sampleValues: number[] = []
    for (let i = 0; i < total; i += stride) {
      const raw = readVal(view, map.fileOffset + i * elSize, dtype, true) // default LE
      sampleValues.push(raw * map.factor + map.physicalOffset)
    }

    // Detect erased flash (all 0xFF or 0xFFFF) or blank (all zero)
    const allFF = sampleValues.every(v => {
      const raw = map.factor !== 0 ? (v - map.physicalOffset) / map.factor : 0
      return Math.abs(raw - 255) < 2 || Math.abs(raw - 65535) < 2
    })
    const allZero = sampleValues.every(v => Math.abs(v) < 0.0001)

    // Fraction of samples within the declared physical range (±15% tolerance)
    const rangeSpan = map.max - map.min
    const tol = rangeSpan > 0 ? rangeSpan * 0.15 : Math.abs(map.max) * 0.15 + 1
    const inRangeCount = sampleValues.filter(
      v => v >= map.min - tol && v <= map.max + tol
    ).length
    const confidence = sampleValues.length > 0 ? inRangeCount / sampleValues.length : 0

    // Extract 12-byte signature immediately before the map
    const sigStart = Math.max(0, map.fileOffset - 12)
    const signature = Array.from(bytes.slice(sigStart, map.fileOffset))

    let status: A2LValidationResult['status']
    if (allFF || allZero)       status = 'uncertain'
    else if (confidence >= 0.70) status = 'valid'
    else if (confidence >= 0.35) status = 'uncertain'
    else                         status = 'invalid'

    return { map, status, confidence, sampleValues, signature }
  })
}

// ─── Build a MapDef from a validated A2L map ────────────────────────────────
// Creates a synthetic MapDef that uses the A2L's exact file offset (fixedOffset)
// instead of signature searching. Stage params and metadata are inherited from
// the matching ecuDefinitions MapDef so the remap engine still applies correctly.
export function syntheticMapDefFromA2L(a2lMap: A2LMapDef, baseDef: MapDef): MapDef {
  return {
    ...baseDef,
    rows:       a2lMap.rows,
    cols:       a2lMap.cols,
    dtype:      a2lMap.dataType as DataType,
    le:         true,  // Bosch/Continental ECUs are little-endian
    factor:     a2lMap.factor,
    offsetVal:  a2lMap.physicalOffset,
    signatures: [],    // skip signature search
    sigOffset:  0,
    fixedOffset: a2lMap.fileOffset,  // go directly to validated address
  }
}

// ─── Build a MapDef from a DRT map ──────────────────────────────────────────
// DRT files provide direct file offsets and dimensions but no scaling.
// Keep ecuDef scaling (factor/offsetVal/unit) — only take location and shape from DRT.
export function syntheticMapDefFromDRT(
  drtMap: { fileOffset: number; rows: number; cols: number; dataType: string },
  baseDef: MapDef
): MapDef {
  return {
    ...baseDef,                        // keep ecuDef factor, offsetVal, unit
    rows:        drtMap.rows,
    cols:        drtMap.cols,
    dtype:       drtMap.dataType as DataType,
    le:          true,
    signatures:  [],
    sigOffset:   0,
    fixedOffset: drtMap.fileOffset,    // DRT-supplied file offset
  }
}

// ─── Write map back into buffer ───────────────────────────────────────────────
export function writeMap(buffer: ArrayBuffer, extracted: ExtractedMap, newRaw: number[][]): ArrayBuffer {
  if (!extracted.found || extracted.offset < 0) return buffer
  const copy = buffer.slice(0)
  const view = new DataView(copy)
  const elSize = dtypeSize(extracted.mapDef.dtype)
  const { rows, cols, dtype, le } = extracted.mapDef
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const off = extracted.offset + (r * cols + c) * elSize
      writeVal(view, off, newRaw[r][c], dtype, le)
    }
  }
  return copy
}
