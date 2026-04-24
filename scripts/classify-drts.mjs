/**
 * classify-drts.mjs
 *
 * ⚠️  COMPLETED ONE-SHOT — DO NOT RE-RUN ON PRODUCTION.
 * This script finished its task (classifying ~300+ NULL-family DRT files) in v3.15.
 * Re-running would re-download and re-upsert rows that are already correct and could
 * thrash the rate limiter. Kept in source tree for audit/reproducibility only.
 * If you genuinely need to re-run, first verify which rows are still NULL with:
 *   SELECT COUNT(*) FROM definitions_index WHERE ecu_family IS NULL;
 *
 * One-time background indexer — classifies all NULL-family DRT files in Supabase
 * by downloading each file, parsing its map codes and address range, and updating
 * the definitions_index table with the correct ECU family.
 *
 * Handles: cars, motorcycles, trucks, marine, agricultural, and foreign brands.
 *
 * Usage:
 *   node scripts/classify-drts.mjs
 *   node scripts/classify-drts.mjs --dry-run     (print results, no DB write)
 *   node scripts/classify-drts.mjs --limit 200   (process first 200 only)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://eqfmeavkefflwmzihqkd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxZm1lYXZrZWZmbHdtemlocWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjQzMjksImV4cCI6MjA4OTEwMDMyOX0.1F1v2KOm30s-o2lRmy5ZuNf3B1Cm8FTx8FpHWLANrIE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT   = (() => {
  const idx = process.argv.indexOf('--limit')
  return idx !== -1 ? parseInt(process.argv[idx + 1]) : Infinity
})()
const BATCH_SIZE    = 30   // files per parallel download batch
const UPDATE_BATCH  = 100  // rows per single DB update call

// ─── Filename-prefix brand table ─────────────────────────────────────────────
// Covers bikes, trucks, marine, foreign brands, and models ECM Titanium names by vehicle.
// When the file content can't determine ECU family, these give a meaningful brand label
// that at least makes the file findable by make/model search.
const PREFIX_BRAND = {
  // Renault / Dacia
  CLIO: 'Renault', REN: 'Renault', R27: 'Renault', R20: 'Renault', R36: 'Renault',
  // Alfa Romeo (by model)
  A005: 'Alfa Romeo', A017: 'Alfa Romeo', A018: 'Alfa Romeo',
  A129: 'Alfa Romeo', A140: 'Alfa Romeo', A145: 'Alfa Romeo',
  A164: 'Alfa Romeo', A256: 'Alfa Romeo', A401: 'Alfa Romeo',
  A548: 'Alfa Romeo',
  A13:  'Alfa Romeo', A14:  'Alfa Romeo', A16:  'Alfa Romeo',
  A17:  'Alfa Romeo', A18:  'Alfa Romeo', A20:  'Alfa Romeo',
  // Fiat / Lancia
  FIE: 'Fiat', FDC: 'Fiat', LXXX: 'Lancia',
  // Maserati / Ferrari (Marelli)
  MAS: 'Maserati',
  // Subaru (Denso)
  WRX: 'Subaru',
  // Opel / Vauxhall
  VEC: 'Opel', AST: 'Opel', X18: 'Opel', X20: 'Opel', O16: 'Opel',
  // Mercedes (additional models)
  SLK: 'Mercedes', CLK: 'Mercedes', KOMP: 'Mercedes',
  // Volvo (models)
  V90: 'Volvo', C70: 'Volvo', VOL: 'Volvo',
  // Saab
  S95: 'Saab', S14: 'Saab',
  // Land Rover
  LRS: 'Land Rover',
  // Iveco (trucks/vans)
  IVE: 'Iveco',
  // Peugeot 607
  607: 'Peugeot',
  // Honda
  H16: 'Honda', H20: 'Honda', H660: 'Honda', H669: 'Honda',
  // Hyundai / Kia
  K12: 'Hyundai', K13: 'Hyundai', K14: 'Hyundai', K29: 'Hyundai',
  // Jaguar / Land Rover
  J16: 'Jaguar', J20: 'Jaguar', J27: 'Jaguar',
  // SIMOS additional
  SIM: 'SIMOS',
  // BMW additional models
  B14: 'BMW', B50: 'BMW', B120: 'BMW', B175: 'BMW',
  B183: 'BMW', B314: 'BMW', B373: 'BMW',
  // Continental / Temic
  T12: 'Continental', T14: 'Continental', T15: 'Continental',
  T18: 'Continental', T25: 'Continental', T29: 'Continental',
  CON: 'Continental', AST2: 'Continental',
  // Delphi diesel additional
  D12: 'Delphi', D20: 'Delphi', D24: 'Delphi', D27: 'Delphi',
  // Marelli additional
  M027: 'Marelli', M40: 'Marelli', M220: 'Marelli', M22: 'Marelli',
  MX5:  'Mazda',   MZ6:  'Mazda',
  // Ford additional
  F10: 'Ford', F15: 'Ford', F54: 'Ford',
  F263: 'Ford', F487: 'Ford', F701: 'Ford',
  FXXX: 'Ford',
  // PSA-specific codes (Peugeot/Citroën numeric codes)
  P306: 'Peugeot', P332: 'Peugeot', P696: 'Peugeot',
  P872: 'Peugeot', P942: 'Peugeot', P32: 'Peugeot',
  P18: 'Petrol',
  // Generic unknowns → Other
  IXXX: 'Other', RXXX: 'Other', DXXX: 'Other', WXXX: 'Other',
  QXXX: 'Other', ECO: 'Other', ATE: 'Other', DSV: 'Other',
  LRS2: 'Other', PRE: 'Other', LAT: 'Other', VOT5: 'Other',
  ACT: 'Other', MST: 'Other', E20: 'Other', E40: 'Other',
  U10: 'Other', Z16: 'Other', Q855: 'Other', V16: 'Other',
  V18: 'Other', V20: 'Other', V286: 'Other',
  L13: 'Other', L14: 'Other', L20: 'Other',
  S006: 'Other', S95x: 'Other',
  I105: 'Other', I774: 'Other',
  F263x: 'Other', C70x: 'Other', C11: 'EDC15',
  '220': 'Other', KOMP2: 'Mercedes',
}

// ─── DRT binary parser (port from drtParser.ts) ───────────────────────────────
function parseDRT(buffer) {
  const bytes = new Uint8Array(buffer)
  const MARKER = 0x84
  const DELIM  = 0xBB

  // Split into records at 0x84 0xBB boundary
  const chunks = []
  let current = []
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

  const maps = []
  let currentCode = null
  let headerParsed = false
  let driverName = ''

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].replace(/\x00/g, '')
    const parts = text.split(String.fromCharCode(DELIM)).map(p => p.trim())
    const first = parts[0] ?? ''
    if (!first) continue

    if (!headerParsed && first.includes('_') && first.length >= 4) {
      driverName = first
      headerParsed = true
      if (parts.length >= 6 && isMapCode(parts[3])) {
        currentCode = parts[3]
      }
      continue
    }
    if (headerParsed && isMapCode(first) && parts.length >= 3) {
      currentCode = first
      continue
    }
    if (currentCode && headerParsed && parts.length >= 5) {
      const addrField = parts[4]
      if (/^[0-9A-Fa-f]{4,8}(,[0-9A-Fa-f]{4,8})*$/.test(addrField)) {
        const addrs = addrField.split(',').map(a => parseInt(a.trim(), 16)).filter(a => !isNaN(a) && a > 0)
        if (addrs.length > 0) {
          maps.push({ code: currentCode, addresses: addrs })
        }
      }
    }
  }

  return { driverName, maps }
}

function isMapCode(s) {
  return !!s && s.length >= 2 && s.length <= 4 && /^[A-Z][A-Z0-9]{1,3}$/.test(s)
}

// ─── ECU family classifier ────────────────────────────────────────────────────
// Uses map codes + address range + file size to determine ECU family.
// Returns null when genuinely unknown (no bad fallback).
function classifyFromDRT(parsed, filenamePrefix) {
  const { maps, driverName } = parsed
  const codes = new Set(maps.map(m => m.code))

  // Max address tells us the memory map → distinguishes TriCore (>0x80000000)
  // from Motorola 68K / ST10 (<0x01000000)
  let maxAddr = 0
  for (const m of maps) {
    for (const a of m.addresses) {
      if (a > maxAddr) maxAddr = a
    }
  }
  const isTriCore = maxAddr > 0x80000000   // Bosch EDC16/17, MED17, SIMOS
  const isOldArch = maxAddr > 0 && maxAddr < 0x01000000  // ME7/EDC15/older

  // ── Driver name keyword check (fastest) ─────────────────────────────────
  const nameUp = driverName.toUpperCase()
  if (nameUp.includes('EDC17'))                       return 'EDC17'
  if (nameUp.includes('EDC16'))                       return 'EDC16'
  if (nameUp.includes('EDC15'))                       return 'EDC15'
  if (nameUp.includes('MED17') || nameUp.includes('MED9')) return 'MED17'
  if (nameUp.includes('ME7'))                         return 'ME7'
  if (nameUp.includes('ME9'))                         return 'ME9'
  if (nameUp.includes('SIMOS18') || nameUp.includes('SIM18')) return 'SIMOS18'
  if (nameUp.includes('SIMOS19') || nameUp.includes('SIM19')) return 'SIMOS19'
  if (nameUp.includes('SIMOS'))                       return 'SIMOS'
  if (nameUp.includes('DELPHI') || nameUp.includes('DCM')) return 'Delphi'
  if (nameUp.includes('MARELLI') || nameUp.includes('IAW')) return 'Marelli'

  // ── Map code analysis ────────────────────────────────────────────────────
  const hasIT = codes.has('IT')   // injection timing
  const hasIP = codes.has('IP')   // injection pressure (rail)
  const hasIU = codes.has('IU')   // pilot injection 1
  const hasIV = codes.has('IV')   // pilot injection 2
  const hasZW = codes.has('ZW')   // ignition timing (petrol)
  const hasAM = codes.has('AM')   // air mass (petrol)
  const hasZK = codes.has('ZK')   // knock correction (petrol)
  const hasBS = codes.has('BS')   // boost setpoint
  const hasBM = codes.has('BM')   // boost map
  const hasIE = codes.has('IE')   // injection enable (old diesel)
  const hasAS = codes.has('AS')   // air setpoint
  const hasLA = codes.has('LA')   // lambda map
  const hasAF = codes.has('AF')   // air/fuel ratio

  // Petrol ECU (ignition timing present)
  if (hasZW) {
    if (hasAM || hasZK || hasAF || hasLA) {
      // Direct injection or modern petrol → MED17 range
      if (isTriCore) return 'MED17'
      if (isOldArch) return 'ME7'
      // No address info — guess from code combination
      if (hasZK && hasAM) return 'MED17'
      return 'ME7'   // ZW alone with older style = ME7
    }
    // ZW only → older Motronic or ME7
    if (isTriCore) return 'ME9'
    return 'ME7'
  }

  // Diesel ECU with common rail
  if (hasIT) {
    if (hasIP && hasIU && hasIV) {
      // Multiple pilot injections → EDC15 (oldest) or EDC16 variant
      if (isTriCore) return 'EDC16'
      return 'EDC15'
    }
    if (hasIP && hasIU) {
      if (isTriCore) return 'EDC17'
      return 'EDC16'
    }
    if (hasIP) {
      if (isTriCore) return 'EDC17'
      return 'EDC16'
    }
    if (hasIU) {
      // Timing + pilot but no pressure → EDC16 variant
      return isTriCore ? 'EDC17' : 'EDC16'
    }
    // Injection timing alone
    if (isTriCore) return 'EDC17'
    return 'EDC16'
  }

  // Old diesel without timing code
  if (hasIP && hasIU && hasIV) return 'EDC15'
  if (hasIP && hasIE) return 'EDC15'
  if (hasAS && hasIE) return 'EDC15'

  // Boost present without diesel injection → could be petrol turbo or marine
  if (hasBS || hasBM) {
    if (isTriCore) return 'EDC17'
    return 'EDC16'
  }

  // ── Filename prefix brand override ───────────────────────────────────────
  const brand = PREFIX_BRAND[filenamePrefix]
  if (brand) return brand

  // ── Address range last resort ────────────────────────────────────────────
  if (isTriCore)  return 'TriCore'   // Bosch/Continental TriCore but type unclear
  if (isOldArch)  return 'ME7'       // Old architecture — likely petrol
  if (maps.length > 0) return 'Other' // Has maps but can't classify

  return null  // Truly empty/corrupt file — leave NULL
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 DCTuning DRT Background Classifier`)
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`)
  console.log(`   Limit: ${LIMIT === Infinity ? 'all' : LIMIT} files\n`)

  // Fetch all NULL-family DRT records
  console.log('📋 Fetching unclassified DRT records from Supabase...')
  let allRecords = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('definitions_index')
      .select('id, filename, storage_path')
      .eq('file_type', 'drt')
      .is('ecu_family', null)
      .not('filename', 'ilike', '._%')
      .order('filename')
      .range(offset, offset + 999)
    if (error) { console.error('DB fetch error:', error); break }
    if (!data || data.length === 0) break
    allRecords = allRecords.concat(data)
    offset += data.length
    if (data.length < 1000) break
  }

  const totalToProcess = Math.min(allRecords.length, LIMIT)
  const records = allRecords.slice(0, totalToProcess)
  console.log(`   Found ${allRecords.length} unclassified DRTs. Processing ${totalToProcess}.\n`)

  const stats = {}
  const updates = []   // { id, ecu_family }
  let processed = 0
  let errors = 0

  // Process in batches
  for (let b = 0; b < records.length; b += BATCH_SIZE) {
    const batch = records.slice(b, b + BATCH_SIZE)

    const results = await Promise.allSettled(batch.map(async (rec) => {
      try {
        // Download the DRT file
        const { data: blob, error: dlErr } = await supabase.storage
          .from('definition-files')
          .download(rec.storage_path)
        if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed')

        const buffer = await blob.arrayBuffer()
        const parsed = parseDRT(buffer)

        // Extract filename prefix (part before first underscore)
        const prefix = rec.filename.split('_')[0]

        const family = classifyFromDRT(parsed, prefix)
        return { id: rec.id, filename: rec.filename, family }
      } catch (e) {
        return { id: rec.id, filename: rec.filename, family: null, error: e.message }
      }
    }))

    for (const r of results) {
      processed++
      if (r.status === 'fulfilled') {
        const { id, filename, family, error: recErr } = r.value
        if (recErr) {
          errors++
          process.stdout.write(`✗ ${filename}: ${recErr}\n`)
        } else if (family) {
          stats[family] = (stats[family] ?? 0) + 1
          updates.push({ id, ecu_family: family })
          if (processed % 50 === 0) {
            process.stdout.write(`  [${processed}/${totalToProcess}] latest: ${filename} → ${family}\n`)
          }
        } else {
          stats['(null - empty file)'] = (stats['(null - empty file)'] ?? 0) + 1
        }
      }
    }

    // Flush updates to DB every UPDATE_BATCH records
    if (!DRY_RUN && updates.length >= UPDATE_BATCH) {
      await flushUpdates(updates)
      updates.length = 0
    }
  }

  // Final flush
  if (!DRY_RUN && updates.length > 0) {
    await flushUpdates(updates)
  }

  // Summary
  console.log('\n' + '─'.repeat(60))
  console.log(`✅ Done. Processed ${processed} files, ${errors} errors.\n`)
  console.log('Classification breakdown:')
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1])
  for (const [family, count] of sorted) {
    console.log(`  ${String(count).padStart(5)}  ${family}`)
  }
  console.log()

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN — no changes written to database.')
    console.log('   Run without --dry-run to apply.\n')
  }
}

async function flushUpdates(updates) {
  // Supabase doesn't support bulk upsert by id in one query with different values,
  // so we group by family and do one UPDATE per family (fast, minimal round trips)
  const byFamily = {}
  for (const u of updates) {
    if (!byFamily[u.ecu_family]) byFamily[u.ecu_family] = []
    byFamily[u.ecu_family].push(u.id)
  }
  for (const [family, ids] of Object.entries(byFamily)) {
    const { error } = await supabase
      .from('definitions_index')
      .update({ ecu_family: family })
      .in('id', ids)
    if (error) console.error(`  Update error for family ${family}:`, error.message)
    else process.stdout.write(`  💾 Saved ${ids.length} × ${family}\n`)
  }
}

main().catch(console.error)
