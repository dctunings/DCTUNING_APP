/**
 * RecipeBrowserTab.tsx — browse the recipe library that the Stage Engine
 * uses for Tier 1 (bit-exact) tuning.
 *
 * Replaces the old Library tab implementation that queried Supabase tables
 * referencing wiped buckets (gone in v3.15.3). New source is the recipe
 * manifest loaded via recipeEngine.loadManifest() — same data the Apply
 * Stage flow uses, ~3,138 recipes across ~2,247 part numbers.
 *
 * Customer use cases:
 *   • Search for their ECU part number → see if there's a recipe
 *   • Browse what tunes the system has → pre-purchase confidence
 *   • Filter by stage → "do you have Stage 2 for X?"
 */

import { useEffect, useMemo, useState } from 'react'
import { loadManifest, type RecipeManifestEntry } from '../lib/recipeEngine'

type StageFilter = 'all' | 1 | 2 | 3
type MakeFilter = 'all' | 'VW' | 'Audi' | 'Seat' | 'Skoda' | 'Porsche' | 'Bosch' | 'Siemens' | 'Other'

const PAGE_SIZE = 80

// VAG part-number → vehicle family lookup. VAG part numbers encode the
// chassis/family in the prefix, so even when the sourceFolder gives no
// useful hint we can label the row with something readable. Covers the
// most common modern (5G/8V/06K/04L) and legacy (03G/03L/038) families.
//
// Returns a tuple [make, family] where make is one of VW/Audi/Seat/Skoda/
// Porsche/Bosch/Siemens/Other, and family is the vehicle/engine description.
function inferFromPartNumber(pn: string): { make: string; family: string } {
  if (!pn) return { make: 'Other', family: '' }
  const p = pn.toUpperCase()

  // Modern chassis prefixes (XXX906...) — VAG MQB / PQ35+ era
  const chassisMap: Record<string, { make: string; family: string }> = {
    '5G0': { make: 'VW',    family: 'Golf 7 / GTI / R (MQB)' },
    '5G1': { make: 'VW',    family: 'Golf 7 (MQB)' },
    '5G6': { make: 'VW',    family: 'Golf 7 SW (MQB)' },
    '5K0': { make: 'VW',    family: 'Golf 6' },
    '5N0': { make: 'VW',    family: 'Tiguan' },
    '5N1': { make: 'VW',    family: 'Tiguan' },
    '5C0': { make: 'VW',    family: 'Beetle 5C' },
    '5C1': { make: 'VW',    family: 'Beetle 5C' },
    '5Q0': { make: 'VW',    family: 'Golf SW MQB' },
    '5T0': { make: 'VW',    family: 'Touran II MQB' },
    '6R0': { make: 'VW',    family: 'Polo 6R' },
    '6C0': { make: 'VW',    family: 'Polo 6C' },
    '7N0': { make: 'VW',    family: 'Sharan / Alhambra' },
    '7P0': { make: 'VW',    family: 'Touareg II 7P' },
    '7L0': { make: 'VW',    family: 'Touareg I 7L' },
    '3C0': { make: 'VW',    family: 'Passat B6 / B7' },
    '3D0': { make: 'VW',    family: 'Phaeton 3D' },
    '3B0': { make: 'VW',    family: 'Passat B5' },
    '1K0': { make: 'VW',    family: 'Golf 5 / Jetta' },
    '1Z0': { make: 'Skoda', family: 'Octavia 2 / Yeti' },
    '1Z1': { make: 'Skoda', family: 'Octavia 2 / Yeti' },
    '5E0': { make: 'Skoda', family: 'Octavia 3 / RS' },
    '8V0': { make: 'Audi',  family: 'A3 8V / S3 / RS3' },
    '8V1': { make: 'Audi',  family: 'A3 8V / S3' },
    '8X0': { make: 'Audi',  family: 'A1 8X' },
    '8U0': { make: 'Audi',  family: 'Q3 8U' },
    '8E0': { make: 'Audi',  family: 'A4 B6 / B7' },
    '8H0': { make: 'Audi',  family: 'A4 B6 Cabrio' },
    '8K0': { make: 'Audi',  family: 'A4 B8 / S4' },
    '8R0': { make: 'Audi',  family: 'Q5 8R' },
    '8L0': { make: 'Audi',  family: 'A3 8L' },
    '8L1': { make: 'Audi',  family: 'A3 8L' },
    '8N0': { make: 'Audi',  family: 'TT 8N' },
    '8P0': { make: 'Audi',  family: 'A3 8P' },
    '8T0': { make: 'Audi',  family: 'A5 8T' },
    '8W0': { make: 'Audi',  family: 'A4 B9' },
    '8S0': { make: 'Audi',  family: 'TT MK3' },
    '8D0': { make: 'Audi',  family: 'A4 B5' },
    '8D1': { make: 'Audi',  family: 'A4 B5' },
    '4F0': { make: 'Audi',  family: 'A6 C6 / S6' },
    '4G0': { make: 'Audi',  family: 'A6 C7 / A7' },
    '4M0': { make: 'Audi',  family: 'Q7 4M' },
    '4H0': { make: 'Audi',  family: 'A8 4H' },
    '4E0': { make: 'Audi',  family: 'A8 D3' },
    '4D0': { make: 'Audi',  family: 'A8 D2' },
    '4B0': { make: 'Audi',  family: 'A6 C5' },
    '4S0': { make: 'Audi',  family: 'R8 V10' },
  }

  // First try: explicit modern chassis match (XXX906...)
  const chassisPrefix = p.slice(0, 3)
  if (/^[0-9A-Z]{3}906/.test(p) && chassisMap[chassisPrefix]) {
    return chassisMap[chassisPrefix]
  }

  // Legacy VAG engine ECU families (0XX906... or just 0XX...).
  // The middle digit + 906 marks the engine family.
  const legacyFamilyMap: Record<string, { make: string; family: string }> = {
    '03L': { make: 'VW',    family: '2.0 TDI CR EA189 (Golf 6 / Passat B7)' },
    '03G': { make: 'VW',    family: 'TDI 1.9/2.0 PD' },
    '038': { make: 'VW',    family: 'TDI 1.9 PD ME7 / EDC15' },
    '028': { make: 'VW',    family: 'TDI 1.9 SDI / PD early' },
    '04L': { make: 'VW',    family: '2.0 TDI EA288 (Golf 7 / Passat B8)' },
    '04E': { make: 'VW',    family: '1.4 TFSI EA211 / 1.6 TDI' },
    '06A': { make: 'VW',    family: '1.8T 20V early FSI' },
    '06J': { make: 'VW',    family: '2.0 TFSI EA888' },
    '06K': { make: 'VW',    family: '2.0 TFSI EA888 Mk3' },
    '06H': { make: 'Audi',  family: '2.0 TFSI EA888 (Audi)' },
    '06F': { make: 'VW',    family: '2.0 TFSI / FSI early' },
    '03C': { make: 'VW',    family: '1.4 TSI EA111 (Touran / Golf 6)' },
    '03F': { make: 'VW',    family: '1.2 TSI Siemens (Polo / Fabia / Ibiza)' },
    '022': { make: 'VW',    family: 'V8 4.5L (Touareg / Q7 / Cayenne)' },
    '021': { make: 'VW',    family: 'V8 / V12 / W12' },
    '070': { make: 'VW',    family: '2.5L TDI V6 (Touareg)' },
    '074': { make: 'VW',    family: '2.5L TDI V6' },
    '037': { make: 'VW',    family: 'Mk2/Mk3 era 1.6/1.8/2.0' },
    '036': { make: 'VW',    family: 'Polo / Lupo 1.4/1.6 16V' },
    '030': { make: 'VW',    family: 'Polo 1.0 / 1.4' },
    '045': { make: 'VW',    family: '1.4 TDI 3-cyl (Polo / Fabia / Ibiza)' },
    '047': { make: 'VW',    family: '1.4 TDI / 1.7 SDI' },
    '048': { make: 'VW',    family: '1.4 TDI 3-cyl (Polo TDI)' },
    '050': { make: 'Audi',  family: 'V8 / V10 (RS-era)' },
  }
  const legacyPrefix = p.slice(0, 3)
  if (legacyFamilyMap[legacyPrefix]) return legacyFamilyMap[legacyPrefix]

  // Bosch ECU part numbers (10-digit 0xx1xxxxxx). Make is unknown without
  // the SW number — used by VAG, BMW, Mercedes, PSA, etc. Mark as Bosch.
  if (/^02[6-8]\d{7}$/.test(p)) {
    // 0261 = ME / MED petrol, 0281 = EDC diesel — useful split
    if (p.startsWith('0261')) return { make: 'Bosch', family: 'ME/MED petrol ECU' }
    if (p.startsWith('0281')) return { make: 'Bosch', family: 'EDC diesel ECU' }
    return { make: 'Bosch', family: 'ECU' }
  }
  if (/^5WS/.test(p)) return { make: 'Siemens', family: 'PCR / SID diesel ECU' }

  return { make: 'Other', family: '' }
}

// Per-make badge palette — distinct enough that a row's brand is readable at
// a glance without reading the badge text. VAG core makes get the warm
// accent palette; Bosch/Siemens/Other are cooler/neutral so they recede.
function makeBadgeColor(make: string): { bg: string; fg: string } {
  switch (make) {
    case 'VW':       return { bg: 'rgba(0,174,200,0.12)',   fg: '#00aec8' }
    case 'Audi':     return { bg: 'rgba(255,69,0,0.10)',     fg: '#ff7a3d' }
    case 'Seat':     return { bg: 'rgba(255,149,0,0.10)',    fg: '#ff9500' }
    case 'Skoda':    return { bg: 'rgba(184,240,42,0.12)',   fg: '#b8f02a' }
    case 'Porsche':  return { bg: 'rgba(255,200,0,0.10)',    fg: '#ffc800' }
    case 'Bosch':    return { bg: 'rgba(180,180,180,0.10)',  fg: '#a0a0a0' }
    case 'Siemens':  return { bg: 'rgba(120,160,200,0.10)',  fg: '#7aa0c8' }
    default:         return { bg: 'rgba(120,120,120,0.08)',  fg: '#909090' }
  }
}

// Single-word brand folders ("VW", "Audi", "Seat", "BMW", etc.) are the parent
// brand subdirectory under Tuning_DB_BIN. They confirm the make but don't
// describe the vehicle — the filename usually carries far richer info
// ("CaddyVW_Golf5_1.9_TDI_..."), so prefer the filename in that case.
const BARE_BRAND_FOLDERS = new Set([
  'vw', 'audi', 'seat', 'skoda', 'bmw', 'porsche', 'ford', 'opel', 'volvo',
  'renault', 'peugeot', 'citroen', 'alfa', 'fiat', 'kia', 'hyundai', 'honda',
  'toyota', 'nissan', 'mazda', 'mitsubishi', 'mercedes benz', 'mercedes',
  'land rover', 'jaguar', 'mini', 'lancia', 'dacia', 'jeep', 'iveco',
  'scania', 'suzuki', 'smart',
])

function isDescriptiveFolder(folder: string | undefined): boolean {
  if (!folder) return false
  const trimmed = folder.replace(/^\[[^\]]*\]\s*/, '').trim()
  if (trimmed.length < 4) return false
  if (BARE_BRAND_FOLDERS.has(trimmed.toLowerCase())) return false
  if (/^[0-9a-f]{8,}$/i.test(trimmed)) return false   // hex hash
  return true
}

// Try to extract a vehicle hint from the original tuner filename + parent folder.
// Falls back to partNumber-based inference when the folder/file is uninformative.
function vehicleHint(partNumber: string, sourceTunedFile: string, sourceFolder?: string): string {
  // 1. DESCRIPTIVE folder first ("Golf 7 2.0 TFSI Stage 1 ...")
  if (isDescriptiveFolder(sourceFolder)) {
    const cleaned = sourceFolder!.replace(/^\[[^\]]*\]\s*/, '').trim()
    return cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned
  }
  // 2. Filename — works for the VW Volkswagen archive and Tuning_DB_BIN
  //    (CaddyVW_Golf5_1.9_TDI_..._03G906021AB_390983_3ED4.Original)
  if (sourceTunedFile) {
    const cleaned = sourceTunedFile
      .replace(/^[a-zA-Z]+_/, '')
      .replace(/\.(Stage[0-9]+\+?\+?\+?|bin|ori|mod)$/i, '')
    // Drop separator runs, drop pure-numeric/decimal/hex chunks (those are
    // part numbers, SW IDs, hex hashes — not vehicle words).
    const tokens = cleaned.split(/[_\s]+/)
      .map(t => t.replace(/^_+|_+$/g, ''))
      .filter(t => t.length > 0)
      .filter(t => !/^\d+\.\d+$/.test(t))     // 1.9, 2.0
      .filter(t => !/^[0-9A-F]{4,}$/i.test(t)) // hex hashes / part-number-ish
      .filter(t => !/^[A-Z]{1,3}[0-9]{6,}$/.test(t)) // SW codes
    if (tokens.length > 0) {
      return tokens.slice(0, 4).join(' ').replace(/\s+/g, ' ').trim()
    }
  }
  // 3. Bare brand folder ("VW", "Audi") — at least confirm the brand
  if (sourceFolder && sourceFolder.length >= 2) {
    return sourceFolder
  }
  // 4. Last resort — partNumber inference
  const inferred = inferFromPartNumber(partNumber)
  return inferred.family
}

interface PartGroup {
  partNumber: string
  variants: RecipeManifestEntry[]   // all entries with this partNumber
  swNumbers: Set<string>            // distinct SW numbers under this part
  stages: Set<number>               // {1,2,3}
  vehicleHint: string               // best-effort string from filenames
  make: string                      // 'VW', 'Audi', 'Seat', 'Skoda', 'Porsche', 'Bosch', 'Siemens', 'Other'
}

export default function RecipeBrowserTab() {
  const [manifest, setManifest] = useState<RecipeManifestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<StageFilter>('all')
  const [makeFilter, setMakeFilter] = useState<MakeFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadManifest()
      .then(m => { if (!cancelled) { setManifest(m); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Group all manifest entries by part number, collapsing variants
  const groups: PartGroup[] = useMemo(() => {
    const map = new Map<string, PartGroup>()
    for (const entry of manifest) {
      const key = entry.partNumber || '(unknown)'
      let g = map.get(key)
      if (!g) {
        const inferred = inferFromPartNumber(key)
        g = {
          partNumber: key, variants: [], swNumbers: new Set(), stages: new Set(),
          vehicleHint: '', make: inferred.make,
        }
        map.set(key, g)
      }
      g.variants.push(entry)
      if (entry.swNumber) g.swNumbers.add(entry.swNumber)
      g.stages.add(entry.stage)
      // Best vehicle hint: prefer folder, then filename, then partNumber inference.
      // Walk all variants and keep the most descriptive non-empty result.
      const candidate = vehicleHint(key, entry.sourceTunedFile, entry.sourceFolder)
      if (candidate) {
        // A descriptive folder-derived hint usually contains a vehicle word
        // ("Golf", "Audi", "Polo", year, etc.). Replace partNumber-inference
        // hints (without a vehicle word) when we find a folder/filename hit.
        const isStrongCurrent = /\b(Golf|Audi|VW|Polo|Passat|Tiguan|Cayenne|Touareg|Octavia|Fabia|Ibiza|Leon|TT|S3|RS|GTI|TFSI|TDI|TSI)\b/i.test(g.vehicleHint)
        const isStrongCandidate = /\b(Golf|Audi|VW|Polo|Passat|Tiguan|Cayenne|Touareg|Octavia|Fabia|Ibiza|Leon|TT|S3|RS|GTI|TFSI|TDI|TSI)\b/i.test(candidate)
        if (!g.vehicleHint || (isStrongCandidate && !isStrongCurrent)) {
          g.vehicleHint = candidate
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber))
  }, [manifest])

  // Apply search + stage + make filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter(g => {
      if (stage !== 'all' && !g.stages.has(stage)) return false
      if (makeFilter !== 'all' && g.make !== makeFilter) return false
      if (!q) return true
      if (g.partNumber.toLowerCase().includes(q)) return true
      if (g.vehicleHint.toLowerCase().includes(q)) return true
      for (const sw of g.swNumbers) if (sw.toLowerCase().includes(q)) return true
      for (const v of g.variants) {
        if (v.sourceTunedFile?.toLowerCase().includes(q)) return true
        if (v.sourceFolder?.toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [groups, search, stage, makeFilter])

  // Paginate the filtered list
  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  const toggleExpanded = (part: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(part)) next.delete(part)
      else next.add(part)
      return next
    })
  }

  const totalRecipes = manifest.length
  const totalParts = groups.length

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        ⏳ Loading recipe library...
      </div>
    )
  }

  if (manifest.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Recipe library not loaded</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          The recipe manifest could not be fetched.
          Try a hard refresh, or check that the bridge / build assets are deployed.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Stats + search + stage filter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          padding: '8px 14px', borderRadius: 8,
          background: 'rgba(0,174,200,0.08)', border: '1px solid rgba(0,174,200,0.25)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>Library:</span>
          <strong style={{ color: 'var(--accent)', fontSize: 14 }}>{totalRecipes.toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 6px' }}>recipes across</span>
          <strong style={{ color: 'var(--accent)', fontSize: 14 }}>{totalParts.toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>part numbers</span>
        </div>

        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search part number, SW, vehicle..."
          style={{ flex: 1, minWidth: 200, height: 34 }}
        />
      </div>

      {/* Make filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['all', 'VW', 'Audi', 'Seat', 'Skoda', 'Porsche', 'Bosch', 'Siemens', 'Other'] as const).map(mk => {
          const active = makeFilter === mk
          const count = mk === 'all'
            ? groups.length
            : groups.filter(g => g.make === mk).length
          if (count === 0 && mk !== 'all') return null
          return (
            <button
              key={mk}
              onClick={() => { setMakeFilter(mk); setPage(0) }}
              style={{
                padding: '5px 11px', borderRadius: 6,
                background: active ? 'rgba(184,240,42,0.18)' : 'var(--bg-card)',
                border: `1px solid ${active ? '#b8f02a' : 'var(--border)'}`,
                color: active ? '#b8f02a' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {mk === 'all' ? 'All Makes' : mk} ({count.toLocaleString()})
            </button>
          )
        })}
      </div>

      {/* Stage filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 1, 2, 3] as const).map(s => {
          const active = stage === s
          const colors: Record<string, string> = {
            all: 'var(--accent)', 1: '#00aec8', 2: '#ff9500', 3: '#ff4500',
          }
          const col = colors[String(s)]
          const label = s === 'all' ? 'All Stages' : `Stage ${s}`
          const count = s === 'all'
            ? totalRecipes
            : manifest.filter(m => m.stage === s).length
          return (
            <button
              key={s}
              onClick={() => { setStage(s); setPage(0) }}
              style={{
                padding: '6px 12px', borderRadius: 6,
                background: active ? `${col}25` : 'var(--bg-card)',
                border: `1px solid ${active ? col : 'var(--border)'}`,
                color: active ? col : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label} ({count.toLocaleString()})
            </button>
          )
        })}
      </div>

      {/* Filter result count */}
      {(search || stage !== 'all') && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {filtered.length.toLocaleString()} of {totalParts.toLocaleString()} part numbers match
          {search && ` "${search}"`}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No matches</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Try a different search term or clear filters.
          </div>
        </div>
      )}

      {/* Grouped recipe list */}
      {visible.map(g => {
        const isOpen = expanded.has(g.partNumber)
        const stageBadges = [1, 2, 3].filter(s => g.stages.has(s))
        return (
          <div key={g.partNumber} className="card" style={{ marginBottom: 8, padding: 0 }}>
            {/* Group header */}
            <div
              onClick={() => toggleExpanded(g.partNumber)}
              style={{
                padding: '12px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.6, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
              <span style={{
                fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--accent)',
                minWidth: 130,
              }}>
                {g.partNumber}
              </span>
              {/* Make badge — color-coded so a quick scan groups by brand */}
              {g.make && g.make !== 'Other' && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                  background: makeBadgeColor(g.make).bg,
                  color: makeBadgeColor(g.make).fg,
                  border: `1px solid ${makeBadgeColor(g.make).fg}40`,
                  whiteSpace: 'nowrap',
                }}>
                  {g.make}
                </span>
              )}
              {g.vehicleHint && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, minWidth: 120 }}>
                  {g.vehicleHint}
                </span>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                {stageBadges.map(s => {
                  const cols: Record<number, string> = { 1: '#00aec8', 2: '#ff9500', 3: '#ff4500' }
                  return (
                    <span key={s} style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                      background: `${cols[s]}20`, color: cols[s], border: `1px solid ${cols[s]}40`,
                    }}>
                      Stage {s}
                    </span>
                  )
                })}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {g.swNumbers.size > 0 ? `${g.swNumbers.size} SW · ` : ''}{g.variants.length} recipe{g.variants.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Expanded variants */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px 12px', background: 'rgba(0,0,0,0.15)' }}>
                <table style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>SW Number</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>Stage</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'right' }}>ORI Size</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'right' }}>Regions</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'right' }}>Bytes Δ</th>
                      <th style={{ padding: '4px 8px', fontWeight: 700 }}>ORI SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.variants.map(v => {
                      const cols: Record<number, string> = { 1: '#00aec8', 2: '#ff9500', 3: '#ff4500' }
                      return (
                        <tr key={v.path} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>
                            {v.swNumber || <span style={{ opacity: 0.4 }}>—</span>}
                          </td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ color: cols[v.stage] || 'var(--text-muted)', fontWeight: 700 }}>
                              {v.stage > 0 ? `Stage ${v.stage}` : 'Original'}
                            </span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                            {(v.oriSize / 1024).toFixed(0)} KB
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                            {v.regions}
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                            {v.totalBytesChanged}
                          </td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-muted)', fontSize: 10 }}>
                            {v.oriHash.slice(0, 16)}…
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {g.variants[0]?.sourceTunedFile && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, opacity: 0.65, wordBreak: 'break-all' }}>
                    Source: {g.variants[0].sourceTunedFile}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Load more */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setPage(p => p + 1)}
            style={{ fontSize: 12 }}
          >
            Show more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
