import { useState, useCallback, useRef, useEffect } from 'react'
import { ECU_DEFINITIONS, ADDONS } from '../lib/ecuDefinitions'
import type { EcuDef } from '../lib/ecuDefinitions'
import { detectEcu, detectEcuFromFilename, extractAllMaps, extractMap, validateA2LMapsInBinary, syntheticMapDefFromA2L, syntheticMapDefFromDRT } from '../lib/binaryParser'
import type { DetectedEcu, ExtractedMap, A2LValidationResult } from '../lib/binaryParser'
import { buildRemap, buildFilename } from '../lib/remapEngine'
import type { Stage, AddonId, RemapResult } from '../lib/remapEngine'
import { verifyChecksum, correctChecksum, correctBlockChecksums } from '../lib/checksumEngine'
import type { BlockCorrectionResult } from '../lib/checksumEngine'
import { parseA2L, extractMapsFromA2L, detectBaseAddress } from '../lib/a2lParser'
import type { A2LParseResult, A2LMapDef } from '../lib/a2lParser'
import { parseDRT, convertDRTMaps, guessEcuFamilyFromDRT } from '../lib/drtParser'
import type { DRTParseResult, DRTConvertedMap } from '../lib/drtParser'
import { supabase } from '../lib/supabase'
import type { EcuFileState } from '../App'

interface DefinitionEntry {
  id: string
  filename: string
  file_type: 'a2l' | 'drt'
  driver_name: string | null
  ecu_family: string | null
  make: string | null
  model: string | null
  storage_path: string
  map_count: number
  curve_count: number
}

// ─── Multi-candidate base address search ────────────────────────────────────
// When the binary is available, try multiple base address candidates and return
// the one that produces the most 'valid' A2L map validations.
// Handles: ME7/ME9 A2Ls mis-guessed as MED17, tool-format header offsets,
// non-standard ECU variants, and any A2L whose family isn't in the lookup table.
function pickBestBaseAddress(buffer: ArrayBuffer, result: A2LParseResult): number {
  const preferred = detectBaseAddress(result)
  const addrs = result.characteristics
    .filter(c => c.type !== 'VALUE')
    .map(c => c.address)
    .filter(a => a > 0)
  const minAddr = addrs.length > 0 ? Math.min(...addrs) : preferred
  const derivedBase = minAddr & 0xFFFF0000

  const candidates = [...new Set([preferred, 0x80000000, 0x00000000, 0x80800000, derivedBase])]

  let bestBase = preferred
  let bestScore = -1
  for (const base of candidates) {
    const maps = extractMapsFromA2L(result, base)
    if (maps.length === 0) continue
    const validation = validateA2LMapsInBinary(buffer, maps)
    const validCount = validation.filter(v => v.status === 'valid').length
    const score = validCount / Math.max(validation.length, 1)
    if (score > bestScore) { bestScore = score; bestBase = base }
  }
  return bestBase
}

// ─── Calibration proximity helper ─────────────────────────────────────────────
// Given a filename like "7L0907401F_0040_387060_P397.a2l" and a target number
// like 387808, extracts all 5-9 digit numbers from the filename and returns
// the closest one with its delta so the tuner can spot the best match at a glance.
function closestCalNum(filename: string, targetStr: string): { num: number; delta: number } | null {
  const target = parseInt(targetStr, 10)
  if (isNaN(target) || target === 0) return null
  const matches = [...filename.matchAll(/(?<!\d)(\d{5,9})(?!\d)/g)].map(m => parseInt(m[1], 10))
  if (matches.length === 0) return null
  let best = matches[0]
  let bestDelta = Math.abs(best - target)
  for (const n of matches) {
    const d = Math.abs(n - target)
    if (d < bestDelta) { best = n; bestDelta = d }
  }
  return { num: best, delta: bestDelta }
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}
function heatColor(pct: number): string {
  const stops: [number, string][] = [
    [0.00, '#0a1628'],
    [0.15, '#0d3b7a'],
    [0.30, '#0077b6'],
    [0.45, '#00b4a0'],
    [0.60, '#90ce00'],
    [0.72, '#e8c000'],
    [0.84, '#f07000'],
    [1.00, '#e02020'],
  ]
  const p = Math.max(0, Math.min(1, pct))
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (p <= t1) {
      return lerpColor(c0, c1, (p - t0) / (t1 - t0))
    }
  }
  return stops[stops.length - 1][1]
}

// ─── Mini heatmap grid ────────────────────────────────────────────────────────
function MiniHeatmap({ data, label, mapCategory }: { data: number[][], label: string, mapCategory?: string }) {
  const PREVIEW_ROWS = 5
  const PREVIEW_COLS = 4
  // Show mid-map region (60% down rows, 30% across cols) — avoids the low-load
  // corner (row 0 = idle/fuel-cut) which shows near-zero values and is misleading.
  const rowStart = Math.max(0, Math.floor(data.length * 0.6) - Math.floor(PREVIEW_ROWS / 2))
  const colStart = Math.max(0, Math.floor((data[0]?.length ?? 0) * 0.3))
  const rows = data.slice(rowStart, rowStart + PREVIEW_ROWS)
  const allVals = rows.flatMap(r => r.slice(colStart, colStart + PREVIEW_COLS))
  const allMapVals = data.flatMap(r => r)
  const mapMin = Math.min(...allMapVals)
  const mapMax = Math.max(...allMapVals)
  const mapRange = mapMax - mapMin
  // Positive-expected categories: boost, fuel, torque, limiter, emission values should be > 0.
  const positiveExpected = ['boost', 'fuel', 'torque', 'limiter', 'emission', 'smoke'].includes(mapCategory ?? '')
  // sampleAllNegative: sample cells all negative AND tightly clustered.
  // Catches wrong-address maps where a few edge bytes > 0 break the mapMax < 0 test
  // but the operating region is uniformly-negative (raw = 0, physicalOffset < 0).
  const sampleRange = allVals.length > 0 ? Math.max(...allVals) - Math.min(...allVals) : 0
  const sampleAllNegative = positiveExpected && allVals.length > 0 && allVals.every(v => v < 0) && sampleRange < 0.5
  // isUniform: flags wrong-address reads. For positive-expected maps, ANY flat signal is
  // suspicious — real boost/torque/fuel maps always vary across RPM×load axes. The old
  // condition (mapRange < 0.5 && mapMax < 0) missed two common failure modes:
  //   • All-zero bytes  → mapMax = 0 (not < 0): LDRXNZK pointing at zeroed region
  //   • All-0xFF bytes  → mapMax = 1536 (= 65535 × 0.023438): KFMIRL at erased flash
  // Dropping the mapMax < 0 guard catches both — if mapRange < 0.5 on a boost/torque map,
  // it's wrong regardless of whether the flat value is negative, zero, or some large constant.
  const isUniform = allMapVals.length > 4 && (
    positiveExpected
      ? mapRange < 0.5 || sampleAllNegative  // any flat read (zero, max, or negative) = wrong address
      : mapRange < 0.001                      // ignition/misc: strict check only
  )
  const mn = Math.min(...allVals)
  const mx = Math.max(...allVals)
  const range = mx - mn || 1

  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      {isUniform ? (
        <div style={{ fontSize: 9, color: '#f59e0b', padding: '4px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          ⚠ Uniform — definition may not match this binary. Try an A2L.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PREVIEW_COLS}, 1fr)`, gap: 2 }}>
          {rows.map((row, r) =>
            row.slice(colStart, colStart + PREVIEW_COLS).map((val, c) => (
              <div
                key={`${r}-${c}`}
                title={val.toFixed(3)}
                style={{
                  width: 22, height: 14, borderRadius: 2,
                  background: heatColor((val - mn) / range),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, color: 'rgba(255,255,255,0.6)', fontWeight: 700,
                }}
              >
                {val > 99 ? Math.round(val) : val.toFixed(1)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Category badge ───────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  boost:    '#00aec8',
  fuel:     '#3b82f6',
  torque:   '#f59e0b',
  ignition: '#a855f7',
  limiter:  '#ef4444',
  emission: '#6b7280',
  smoke:    '#f97316',
  misc:     '#64748b',
}

function CatBadge({ cat }: { cat: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
      background: `${CAT_COLORS[cat] ?? '#555'}22`,
      color: CAT_COLORS[cat] ?? '#aaa',
      border: `1px solid ${CAT_COLORS[cat] ?? '#555'}44`,
      textTransform: 'uppercase', letterSpacing: '0.6px',
    }}>
      {cat}
    </span>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = ['Load File', 'ECU Detected', 'Configure', 'Preview', 'Export']

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 12,
              background: i < current ? 'var(--accent)' : i === current ? 'var(--accent)' : 'var(--bg-card)',
              color: i <= current ? '#000' : 'var(--text-muted)',
              border: i > current ? '1px solid var(--border)' : 'none',
              boxShadow: i === current ? '0 0 0 3px rgba(0,174,200,0.2)' : 'none',
              transition: 'all 0.2s ease',
            }}>
              {i < current ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : i + 1}
            </div>
            <div style={{ fontSize: 10, fontWeight: i === current ? 700 : 500, color: i === current ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: '0 6px', marginBottom: 18,
              background: i < current ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s ease',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface RemapBuilderProps { onEcuLoaded?: (state: EcuFileState) => void }
export default function RemapBuilder({ onEcuLoaded }: RemapBuilderProps) {
  const [step, setStep] = useState(0)

  // Step 0 state
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)
  const [hexPreview, setHexPreview] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadError, setLoadError] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

  // Step 1 state
  const [detected, setDetected] = useState<DetectedEcu | null>(null)
  const [selectedEcuId, setSelectedEcuId] = useState('')

  // Step 2 state
  const [stage, setStage] = useState<Stage>(1)
  const [addons, setAddons] = useState<AddonId[]>([])

  // Step 3 state
  const [extractedMaps, setExtractedMaps] = useState<ExtractedMap[]>([])

  // Step 4 state
  const [remapResult, setRemapResult] = useState<RemapResult | null>(null)
  const [blockResult, setBlockResult] = useState<BlockCorrectionResult | null>(null)

  // A2L state
  const [a2lResult, setA2lResult] = useState<A2LParseResult | null>(null)
  const [a2lMaps, setA2lMaps] = useState<A2LMapDef[]>([])
  const [a2lFileName, setA2lFileName] = useState<string>('')

  // DRT state
  const [drtResult, setDrtResult] = useState<DRTParseResult | null>(null)
  const [drtMaps, setDrtMaps] = useState<DRTConvertedMap[]>([])
  const [drtFileName, setDrtFileName] = useState<string>('')

  // Library search state
  const [libSearch, setLibSearch] = useState('')
  const [libResults, setLibResults] = useState<DefinitionEntry[]>([])
  const [libTotal, setLibTotal] = useState(0)
  const [libPage, setLibPage] = useState(0)
  const [libLoading, setLibLoading] = useState(false)
  const [libLoadError, setLibLoadError] = useState('')
  const [libLoadingId, setLibLoadingId] = useState<string | null>(null)
  const [libFallbackNote, setLibFallbackNote] = useState('')
  const [libOriginalNum, setLibOriginalNum] = useState('')  // the numeric query before fallback
  const LIB_PAGE_SIZE = 25

  // A2L validation state
  const [a2lValidation, setA2lValidation] = useState<A2LValidationResult[]>([])
  const [showSigExport, setShowSigExport] = useState(false)
  const [sigExportText, setSigExportText] = useState('')
  const [a2lFallbackCount, setA2lFallbackCount] = useState(0)

  const selectedEcu: EcuDef | undefined = ECU_DEFINITIONS.find(e => e.id === selectedEcuId)

  // ─── File loading ─────────────────────────────────────────────────────────
  const processFile = useCallback((buf: ArrayBuffer, name: string) => {
    setLoadError('')
    // ── File size sanity check ──────────────────────────────────────────────
    if (buf.byteLength < 4096) {
      setLoadError(`File too small (${buf.byteLength} bytes) — this doesn't look like a valid ECU binary.`)
      return
    }
    if (buf.byteLength > 8 * 1024 * 1024) {
      setLoadError(`File too large (${(buf.byteLength / 1048576).toFixed(1)} MB) — ECU binaries are typically under 4 MB. Check for corruption or wrong file.`)
      return
    }
    setFileName(name)
    setFileSize(buf.byteLength)
    setFileBuffer(buf)

    // Hex preview of first 32 bytes
    const bytes = new Uint8Array(buf.slice(0, 32))
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    setHexPreview(hex)

    // Auto-detect ECU — binary first, filename fallback for encrypted/proprietary files
    const det = detectEcu(buf) ?? detectEcuFromFilename(name)
    setDetected(det)
    if (det) {
      setSelectedEcuId(det.def.id)
    } else {
      setSelectedEcuId('')
    }
    // Clear ALL previously loaded A2L/DRT state when a new binary is loaded.
    // Without this, a second binary load retains the first binary's A2L addresses
    // and writes map data at completely wrong offsets into the new binary.
    setA2lResult(null); setA2lMaps([]); setA2lFileName('')
    setDrtResult(null); setDrtMaps([]); setDrtFileName('')
    setA2lValidation([])
    setA2lFallbackCount(0)
    setShowSigExport(false)
    setSigExportText('')
    setLibSearch(''); setLibResults([]); setLibTotal(0); setLibPage(0)
    setLibFallbackNote(''); setLibOriginalNum(''); setLibLoadError('')
    setStep(1)
    // Share file state with Performance page (a2l/drt maps not loaded yet — updated later)
    onEcuLoaded?.({ fileName: name, fileBuffer: buf, detected: det, a2lMaps: [], drtMaps: [] })
  }, [onEcuLoaded])

  const handleFileOpen = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      if (api?.openEcuFile) {
        const result = await api.openEcuFile()
        if (result) processFile(result.buffer, result.name)
      } else {
        // Fallback: file input
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.bin,.hex,.ori,.ori2,.mod'
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => processFile(reader.result as ArrayBuffer, file.name)
          reader.readAsArrayBuffer(file)
        }
        input.click()
      }
    } catch (err) {
      setLoadError(String(err))
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => processFile(reader.result as ArrayBuffer, file.name)
    reader.readAsArrayBuffer(file)
  }, [processFile])

  // ─── Step 2→3: extract maps ───────────────────────────────────────────────
  const handleConfigureNext = () => {
    if (!fileBuffer || !selectedEcu) return
    let maps = extractAllMaps(fileBuffer, selectedEcu)

    // A2L fallback: for each map not found via binary signatures, try A2L-validated addresses.
    // Category bridge: A2L uses 'egr'/'dpf'; ecuDefinitions uses 'emission'.
    if (a2lValidation.length > 0) {
      const normCat = (c: string) => (c === 'egr' || c === 'dpf') ? 'emission' : c
      // Build sorted pool: valid first (by confidence desc), then uncertain.
      const validPool = a2lValidation.filter(v => v.status === 'valid').sort((a, b) => b.confidence - a.confidence)
      const uncertainPool = a2lValidation.filter(v => v.status === 'uncertain').sort((a, b) => b.confidence - a.confidence)
      const allPool = [...validPool, ...uncertainPool]
      // usedOffsets prevents two maps claiming the same binary address.
      // This was the root bug: bestByCategory stored ONE address per category so all
      // 3 fuel maps (Torque→IQ, IQ, Rail Pressure) got the same fallback address.
      const usedOffsets = new Set<number>()
      for (const em of maps) { if (em.found && em.offset >= 0) usedOffsets.add(em.offset) }
      let fallbackCount = 0
      maps = maps.map(em => {
        if (em.found) return em
        // Pass 1 — name-first: match by known DAMOS/A2L characteristic names (a2lNames field).
        // This is the most precise match: 'Qmain_MAP' → edc17_fuel_quantity, not just any fuel map.
        if (em.mapDef.a2lNames?.length) {
          for (const v of allPool) {
            if (usedOffsets.has(v.map.fileOffset)) continue
            if (em.mapDef.a2lNames.some(n => n.toLowerCase() === v.map.name.toLowerCase())) {
              const synthDef = syntheticMapDefFromA2L(v.map, em.mapDef)
              const result = extractMap(fileBuffer, synthDef)
              if (result.found) {
                usedOffsets.add(v.map.fileOffset)
                fallbackCount++
                return { ...result, source: 'a2l' as const }
              }
            }
          }
        }
        // Pass 2 — category fallback: any unused address in the same category.
        for (const v of allPool) {
          if (usedOffsets.has(v.map.fileOffset)) continue
          if (normCat(v.map.category) === em.mapDef.category) {
            const synthDef = syntheticMapDefFromA2L(v.map, em.mapDef)
            const result = extractMap(fileBuffer, synthDef)
            if (result.found) {
              usedOffsets.add(v.map.fileOffset)
              fallbackCount++
              return { ...result, source: 'a2l' as const }
            }
          }
        }
        return em
      })
      setA2lFallbackCount(fallbackCount)
    }

    // DRT fallback: DRT files provide direct file offsets (no signature needed).
    // Match DRT maps to unfound ecuDef maps by category + closest dimensions.
    // Category bridge: DRT 'egr'/'dpf' → ecuDef 'emission'
    if (drtMaps.length > 0) {
      const normCat = (c: string) => (c === 'egr' || c === 'dpf') ? 'emission' : c
      const drtUsedOffsets = new Set<number>()
      // Mark all addresses already claimed by signature or A2L matches
      for (const em of maps) { if (em.found && em.offset >= 0) drtUsedOffsets.add(em.offset) }
      let drtCount = 0
      maps = maps.map(em => {
        if (em.found) return em
        const candidates = drtMaps.filter(dm => normCat(dm.category) === em.mapDef.category)
        if (candidates.length === 0) return em
        // Sort by closest row×col dimensions so best-matching DRT map is tried first
        const sorted = [...candidates].sort((a, b) =>
          (Math.abs(a.rows - em.mapDef.rows) + Math.abs(a.cols - em.mapDef.cols)) -
          (Math.abs(b.rows - em.mapDef.rows) + Math.abs(b.cols - em.mapDef.cols))
        )
        for (const dm of sorted) {
          const synthDef = syntheticMapDefFromDRT(dm, em.mapDef)
          const result = extractMap(fileBuffer, synthDef)
          if (result.found && !drtUsedOffsets.has(result.offset)) {
            drtUsedOffsets.add(result.offset)
            drtCount++
            return { ...result, source: 'drt' as const }
          }
        }
        return em
      })
      setA2lFallbackCount(c => c + drtCount)
    }

    setExtractedMaps(maps)
    setStep(3)
  }

  // ─── Signature export ─────────────────────────────────────────────────────
  const handleExtractSignatures = () => {
    const valid = a2lValidation.filter(v => v.status === 'valid')
    if (valid.length === 0) {
      setSigExportText('// No maps validated yet. Load a binary first, then an A2L.')
      setShowSigExport(true)
      return
    }
    const lines: string[] = [
      `// Binary signatures extracted from: ${a2lFileName}`,
      `// Validated against: ${fileName}`,
      `// Paste into the relevant ECU entry in ecuDefinitions.ts → maps → signatures`,
      '',
    ]
    for (const v of valid) {
      const hexSig = v.signature
        .map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
        .join(', ')
      lines.push(`// ${v.map.name}  category: ${v.map.category}  confidence: ${(v.confidence * 100).toFixed(0)}%`)
      lines.push(`// file offset: 0x${v.map.fileOffset.toString(16).toUpperCase()}  ${v.map.rows}×${v.map.cols} ${v.map.dataType}`)
      lines.push(`signatures: [[${hexSig}]], sigOffset: 0,`)
      lines.push('')
    }
    setSigExportText(lines.join('\n'))
    setShowSigExport(true)
  }

  // ─── Step 3→4: build remap ────────────────────────────────────────────────
  const handleBuildRemap = () => {
    if (!fileBuffer || !selectedEcu || extractedMaps.length === 0) return
    const result = buildRemap(fileBuffer, selectedEcu, stage, addons, extractedMaps)
    // Step 1: correct header checksum (works for all ECU families)
    const corrected = correctChecksum(result.modifiedBuffer, selectedEcu)
    // Step 2: attempt block-level checksum correction (EDC17/EDC16/MED17/SIMOS)
    // correctBlockChecksums modifies the buffer in-place and returns a result report.
    const blockRes = correctBlockChecksums(corrected)
    setBlockResult(blockRes)
    setRemapResult({ ...result, modifiedBuffer: corrected })
    setStep(4)
  }

  // ─── Download ─────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!remapResult || !selectedEcu) return
    const outName = buildFilename(fileName, selectedEcu, stage, addons)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api
      if (api?.saveEcuFile) {
        await api.saveEcuFile(remapResult.modifiedBuffer, outName)
      } else {
        // Fallback: blob download
        const blob = new Blob([remapResult.modifiedBuffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = outName; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setLoadError(`Save failed: ${String(err)}`)
    }
  }

  // ─── Addon toggle ─────────────────────────────────────────────────────────
  // Mutually exclusive pairs: selecting one from a pair auto-deselects the other.
  const ADDON_MUTEX: Partial<Record<AddonId, AddonId>> = {
    popbang:  'popcorn',   // Pop & Bang ↔ Popcorn Limiter (can't have both)
    popcorn:  'popbang',
  }
  const toggleAddon = (id: AddonId) => {
    setAddons(prev => {
      if (prev.includes(id)) return prev.filter(a => a !== id)          // deselect
      const mutual = ADDON_MUTEX[id]
      const filtered = mutual ? prev.filter(a => a !== mutual) : prev   // drop the paired addon
      return [...filtered, id]
    })
  }

  // ─── A2L load ─────────────────────────────────────────────────────────────
  const handleA2LLoad = async (file: File) => {
    try {
      const content = await file.text()
      const result = parseA2L(content)
      // Auto-detect base address: binary-aware multi-candidate search when binary
      // is loaded, otherwise derive from A2L addresses (handles ME7, EDC15, etc.)
      const baseAddr = fileBuffer ? pickBestBaseAddress(fileBuffer, result) : detectBaseAddress(result)
      const maps = extractMapsFromA2L(result, baseAddr)
      setA2lResult(result)
      setA2lMaps(maps)
      setA2lFileName(file.name)
      // Clear any DRT if A2L loaded
      setDrtResult(null)
      setDrtMaps([])
      setDrtFileName('')
      // Validate A2L addresses against the loaded binary
      if (fileBuffer) {
        const validation = validateA2LMapsInBinary(fileBuffer, maps)
        setA2lValidation(validation)
        setShowSigExport(false)
      }
      // Share with Performance page
      if (fileBuffer) onEcuLoaded?.({ fileName, fileBuffer, detected, a2lMaps: maps, drtMaps: [] })
    } catch (e) {
      setLoadError(`A2L parse failed: ${String(e)}`)
    }
  }

  // ─── DRT load ─────────────────────────────────────────────────────────────
  const handleDRTLoad = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const driverName = file.name.replace(/\.drt$/i, '')
      const result = parseDRT(buf, driverName)
      const converted = convertDRTMaps(result)
      // Auto-detect ECU from DRT
      if (!selectedEcuId) {
        const family = guessEcuFamilyFromDRT(result)
        const match = ECU_DEFINITIONS.find(e => e.family === family || e.id.includes(family.toLowerCase()))
        if (match) setSelectedEcuId(match.id)
      }
      setDrtResult(result)
      setDrtMaps(converted)
      setDrtFileName(file.name)
      // Clear A2L definition — but KEEP a2lValidation so validated addresses
      // remain available as primary fallback (A2L addresses run before DRT fallback)
      setA2lResult(null)
      setA2lMaps([])
      setA2lFileName('')
      // Share with Performance page
      if (fileBuffer) onEcuLoaded?.({ fileName, fileBuffer, detected, a2lMaps: [], drtMaps: converted })
    } catch (e) {
      setLoadError(`DRT parse failed: ${String(e)}`)
    }
  }

  // ─── Library search ───────────────────────────────────────────────────────
  const searchLibrary = useCallback(async (query: string, page = 0): Promise<number> => {
    if (!query.trim()) { setLibResults([]); setLibTotal(0); setLibOriginalNum(''); return 0 }
    setLibLoading(true)
    setLibFallbackNote('')
    setLibOriginalNum('')
    try {
      const { data, count } = await supabase
        .from('definitions_index')
        .select('*', { count: 'exact' })
        .or(`filename.ilike.%${query}%,ecu_family.ilike.%${query}%,make.ilike.%${query}%,model.ilike.%${query}%,driver_name.ilike.%${query}%`)
        .not('filename', 'ilike', '._%')   // filter macOS resource fork artifacts
        .order('filename')
        .range(page * LIB_PAGE_SIZE, (page + 1) * LIB_PAGE_SIZE - 1)
      setLibResults((data ?? []) as DefinitionEntry[])
      setLibTotal(count ?? 0)
      setLibPage(page)
      return count ?? 0
    } finally {
      setLibLoading(false)
    }
  }, [LIB_PAGE_SIZE])

  // When ECU is detected, pre-fill library search; fall back to ECU family if part number finds nothing.
  // EDC15, ME7, ME9, MS43 embed DAMOS symbol tables so binary-only map extraction works.
  // All other ECUs (EDC16, EDC17, MED17, SIMOS, Delphi DCM/CRD, Marelli, SID, PPD1 etc.)
  // do NOT embed map addresses — an A2L or DRT definition file is required. Auto-open library.
  const SIG_SUPPORTED = ['edc15', 'me7', 'me9', 'me9_merc', 'bmw_ms43']
  useEffect(() => {
    if (!detected) return
    const family = detected.def.family || detected.def.name
    const needsDef = !SIG_SUPPORTED.includes(detected.def.id)
    void needsDef  // library panel in step 1 is always visible; no toggle needed
    const partMatch = fileName.match(/(?<!\d)(\d{5,9})(?!\d)/)
    if (partMatch) {
      const part = partMatch[1]
      setLibSearch(part)
      searchLibrary(part).then(cnt => {
        if (cnt === 0 && family) {
          setLibSearch(family)
          setLibOriginalNum(part)
          setLibFallbackNote(`No exact match for "${part}" — showing ${family} definitions sorted by closest calibration number`)
          searchLibrary(family)
        } else if (cnt > 0) {
          // Auto-load if exactly one result contains the part number in its filename
          supabase
            .from('definitions_index')
            .select('*')
            .or(`filename.ilike.%${part}%,ecu_family.ilike.%${part}%,make.ilike.%${part}%,model.ilike.%${part}%,driver_name.ilike.%${part}%`)
            .not('filename', 'ilike', '._%')
            .order('filename')
            .limit(20)
            .then(({ data }) => {
              if (!data) return
              const exactHits = data.filter(e =>
                e.filename.toLowerCase().replace(/[^a-z0-9]/g, '').includes(part.toLowerCase())
              )
              if (exactHits.length === 1) {
                loadDefinitionFromLibrary(exactHits[0] as DefinitionEntry)
              }
            })
        }
      })
    } else {
      setLibSearch(family)
      searchLibrary(family)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected, fileName])

  const loadDefinitionFromLibrary = async (entry: DefinitionEntry) => {
    setLibLoadingId(entry.id)
    setLibLoadError('')
    try {
      const { data, error } = await supabase.storage
        .from('definition-files')
        .download(entry.storage_path)
      if (error || !data) throw error ?? new Error('Download failed')

      if (entry.file_type === 'a2l') {
        const text = await data.text()
        const result = parseA2L(text)
        const baseAddr = fileBuffer ? pickBestBaseAddress(fileBuffer, result) : detectBaseAddress(result)
        const maps = extractMapsFromA2L(result, baseAddr)
        setA2lResult(result)
        setA2lMaps(maps)
        setA2lFileName(entry.filename)
        setDrtResult(null); setDrtMaps([]); setDrtFileName('')
        // Validate A2L addresses against the loaded binary
        if (fileBuffer) {
          const validation = validateA2LMapsInBinary(fileBuffer, maps)
          setA2lValidation(validation)
          setShowSigExport(false)
        }
      } else {
        const buf = await data.arrayBuffer()
        const result = parseDRT(buf, entry.driver_name ?? entry.filename)
        const converted = convertDRTMaps(result)
        setDrtResult(result)
        setDrtMaps(converted)
        setDrtFileName(entry.filename)
        // Keep a2lValidation so A2L-validated addresses remain as primary fallback
        setA2lResult(null); setA2lMaps([]); setA2lFileName('')
      }
      // If binary is already loaded, advance to step 1 automatically
      if (fileBuffer) setStep(1)
    } catch (e: any) {
      setLibLoadError(`Failed to load ${entry.filename}: ${e?.message ?? 'Unknown error'}`)
    } finally {
      setLibLoadingId(null)
    }
  }

  // ─── Render steps ─────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 12, padding: '48px 32px', textAlign: 'center',
          background: isDragOver ? 'rgba(0,174,200,0.05)' : 'var(--bg-card)',
          transition: 'all 0.15s ease', cursor: 'pointer',
        }}
        onClick={handleFileOpen}
      >
        <div style={{ marginBottom: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={isDragOver ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {isDragOver ? 'Drop ECU binary here' : 'Drag & drop ECU binary'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Supported: .bin .hex .ori .ori2 .mod
        </div>
        <button className="btn-primary" style={{ pointerEvents: 'none' }}>
          Browse File
        </button>
      </div>
      {loadError && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12 }}>
          {loadError}
        </div>
      )}
      {fileName && (
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{fileName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(fileSize / 1024).toFixed(0)} KB</span>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 6, wordBreak: 'break-all', letterSpacing: '0.5px' }}>
            {hexPreview}
          </div>
          <button
            className="btn-primary"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => setStep(1)}
          >
            Continue →
          </button>
        </div>
      )}
      {/* Definition file drop zone — A2L or DRT */}
      <div
        style={{
          marginTop: 16, border: '1px dashed var(--border)', borderRadius: 12,
          padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s ease',
          background: (a2lFileName || drtFileName) ? 'rgba(34,197,94,0.04)' : 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = (a2lFileName || drtFileName) ? 'rgba(34,197,94,0.4)' : 'var(--border)')}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
        onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        onDrop={e => {
          e.preventDefault()
          e.currentTarget.style.borderColor = 'var(--border)'
          const f = e.dataTransfer.files[0]
          if (!f) return
          const lower = f.name.toLowerCase()
          if (lower.endsWith('.a2l')) handleA2LLoad(f)
          else if (lower.endsWith('.drt')) handleDRTLoad(f)
        }}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.a2l,.A2L,.drt,.DRT'
          input.onchange = (ev) => {
            const f = (ev.target as HTMLInputElement).files?.[0]
            if (!f) return
            const lower = f.name.toLowerCase()
            if (lower.endsWith('.a2l')) handleA2LLoad(f)
            else if (lower.endsWith('.drt')) handleDRTLoad(f)
          }
          input.click()
        }}
      >
        {a2lFileName ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ✓ A2L Loaded
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {a2lFileName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {a2lResult?.totalMaps} MAPs · {a2lResult?.totalCurves} CURVEs · Manufacturer-accurate definitions
            </div>
            {a2lValidation.length > 0 && (() => {
              const vCount = a2lValidation.filter(v => v.status === 'valid').length
              const total = a2lValidation.length
              const pct = Math.round(vCount / total * 100)
              const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'
              const icon = pct >= 70 ? '✓' : pct >= 40 ? '⚠' : '✗'
              const label = pct >= 70 ? 'Good match' : pct >= 40 ? 'Partial match' : 'Poor match — wrong ECU variant?'
              return (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: `${color}15`, color, border: `1px solid ${color}40` }}>
                    {icon} {pct}% binary match
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{vCount}/{total} maps confirmed · {label}</span>
                </div>
              )
            })()}
          </div>
        ) : drtFileName ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ✓ DRT Loaded
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {drtFileName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {drtResult?.totalMaps} MAPs · {drtResult?.totalCurves} CURVEs · ECM Titanium driver
            </div>
            {drtResult?.warnings[0] && (
              <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>{drtResult.warnings[0]}</div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {SIG_SUPPORTED.includes(selectedEcuId || detected?.def.id || '')
                ? 'Optional: Drop definition file or search library'
                : '⚠ Required: Drop an A2L or DRT file, or load one from the library above'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 700 }}>
                .a2l — Bosch/ASAP2
              </span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 700 }}>
                .drt — ECM Titanium
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, opacity: 0.7 }}>
              Unlocks manufacturer-accurate map addresses &amp; scaling
            </div>
          </>
        )}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      {detected ? (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: 'rgba(0,174,200,0.06)', border: '1px solid rgba(0,174,200,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>ECU Detected</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {detected.matchedStrings.join(', ')}
            </span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{detected.def.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {detected.def.manufacturer} · {detected.def.family} · {(detected.fileSize / 1024).toFixed(0)} KB
          </div>
          {/* Confidence bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Detection confidence</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{(detected.confidence * 100).toFixed(0)}%</span>
            </div>
            <div style={{ height: 5, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${detected.confidence * 100}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Compatible vehicles: </span>
            {detected.def.vehicles.join(' · ')}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>ECU Not Recognised</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{(fileSize / 1024).toFixed(0)} KB</span>
          </div>
          {fileSize < 131072 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6 }}>This file is <strong style={{ color: '#f59e0b' }}>{(fileSize / 1024).toFixed(0)} KB</strong> — likely a pre-OBD ECU (pre-1996) or a partial calibration-only read.</div>
              <div>Pre-OBD ECUs (Digifant, Motronic 1.x/2.x, early K-Jetronic) are not supported for software remapping — they require hardware chip replacement. If this is a modern ECU, the file may be incomplete — re-read with your flashing tool.</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6 }}>No matching ECU definition found for this binary. This may be an unsupported variant or the binary may be encrypted.</div>
              <div>You can manually select the closest ECU family below, or contact DCTuning to add support for this file.</div>
            </div>
          )}
        </div>
      )}

      {/* ── A2L/DRT required banner ───────────────────────────────────────────
          EDC15, ME7, ME9, MS43 embed DAMOS symbol tables → signatures work.
          All other ECUs (EDC16, EDC17, MED17, SIMOS, Delphi, Marelli, SID,
          PPD1 etc.) do NOT embed map addresses — an A2L or DRT file with the
          exact memory map is the only way to locate calibration tables.
      */}
      {(() => {
        const ecuId = selectedEcuId || detected?.def.id || ''
        const sigSupported = ['edc15', 'me7', 'me9', 'me9_merc', 'bmw_ms43'].includes(ecuId)
        const needsBanner  = ecuId && !sigSupported && !a2lResult && !drtResult
        if (!needsBanner) return null
        return (
          <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', marginBottom: 5 }}>
                Definition File Required for Map Extraction
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>{detected?.def.name ?? ecuId}</strong> does not embed map addresses in the binary.
                Maps can only be located using an
                <strong style={{ color: 'var(--text-secondary)'}}> A2L</strong> or
                <strong style={{ color: 'var(--text-secondary)'}}> DRT</strong> definition file
                that contains the exact calibration memory layout.
              </div>
              <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, fontWeight: 700 }}>
                👇 Search the library below and load a matching A2L or DRT file to proceed.
              </div>
            </div>
          </div>
        )
      })()}

      {(a2lResult || drtResult) && (
        <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
              ✓ {a2lResult ? 'A2L' : 'DRT'} Definition Loaded
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
              {a2lResult ? 'ASAP2 / Bosch' : 'ECM Titanium'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {a2lResult
              ? `${a2lResult.totalMaps} MAPs · ${a2lResult.totalCurves} CURVEs · ${a2lResult.totalValues} scalar values`
              : `${drtResult!.totalMaps} MAPs · ${drtResult!.totalCurves} CURVEs · ${drtResult!.maps.length} total entries`
            }
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(['boost', 'torque', 'fuel', 'ignition'] as const).map(cat => {
              const count = a2lResult
                ? a2lMaps.filter(m => m.category === cat).length
                : drtMaps.filter(m => m.category === cat).length
              return count > 0 ? (
                <div key={cat} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{cat}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>{count} maps</span>
                </div>
              ) : null
            })}
          </div>
          {drtResult?.warnings[0] && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>{drtResult.warnings[0]}</div>
          )}
          {a2lResult?.warnings[0] && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>{a2lResult.warnings[0]}</div>
          )}

          {/* A2L address validation panel — only shown when A2L is the active definition */}
          {a2lValidation.length > 0 && a2lFileName && (() => {
            const vCount = a2lValidation.filter(v => v.status === 'valid').length
            const uCount = a2lValidation.filter(v => v.status === 'uncertain').length
            const iCount = a2lValidation.filter(v => v.status === 'invalid' || v.status === 'outofrange').length
            return (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Address Validation vs This Binary
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>✓ {vCount} valid</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>? {uCount} uncertain</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>✗ {iCount} mismatch</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/ {a2lValidation.length} total</span>
                </div>
                {vCount > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8, lineHeight: 1.5 }}>
                    {vCount} map address{vCount !== 1 ? 'es' : ''} confirmed in this binary — will be used automatically if binary signatures fail.
                  </div>
                )}
                {vCount === 0 && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>
                    ⚠ No addresses validated. This A2L may be for a different software version. Do not use for writing.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleExtractSignatures}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(184,240,42,0.3)', background: 'rgba(184,240,42,0.07)', color: '#b8f02a', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Export Signatures →
                  </button>
                </div>
                {showSigExport && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paste into ecuDefinitions.ts</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(sigExportText)}
                        style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Copy All
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={sigExportText}
                      style={{ width: '100%', minHeight: 140, background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#79c0ff', fontFamily: "'Courier New', monospace", fontSize: 11, padding: '8px', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={() => setShowSigExport(false)}
                      style={{ marginTop: 4, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        ECU Override
      </div>
      <select
        value={selectedEcuId}
        onChange={e => setSelectedEcuId(e.target.value)}
        style={{ width: '100%', marginBottom: 20 }}
      >
        <option value="">-- Select ECU family --</option>
        {ECU_DEFINITIONS.map(e => (
          <option key={e.id} value={e.id}>{e.name} — {e.family}</option>
        ))}
      </select>

      {selectedEcu && (
        <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Maps available for this ECU</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedEcu.maps.map(m => (
              <span key={m.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Library search panel — always visible at step 1 */}
      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'rgba(0,174,200,0.04)', border: '1px solid rgba(0,174,200,0.2)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          A2L / DRT Definition Library
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Search by ECU part number or family name for accurate map addresses
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={libSearch}
            onChange={e => setLibSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchLibrary(libSearch, 0)}
            placeholder="e.g. 387808, EDC16CP34, MED17..."
            style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => searchLibrary(libSearch, 0)}>
            Search
          </button>
        </div>
        {libFallbackNote && (
          <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.85)', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 5, padding: '5px 8px', marginBottom: 6 }}>
            ℹ {libFallbackNote}
          </div>
        )}
        {libLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Searching...</div>}
        {libResults.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{libTotal.toLocaleString()} result{libTotal !== 1 ? 's' : ''} — showing {libResults.length} (page {libPage + 1} of {Math.ceil(libTotal / LIB_PAGE_SIZE)})</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {libPage > 0 && <button onClick={() => searchLibrary(libSearch, libPage - 1)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>← Prev</button>}
                {(libPage + 1) * LIB_PAGE_SIZE < libTotal && <button onClick={() => searchLibrary(libSearch, libPage + 1)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Next →</button>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 340, overflowY: 'auto' }}>
              {[...libResults]
                .sort((a, b) => {
                  if (!libOriginalNum) return 0
                  const ca = closestCalNum(a.filename, libOriginalNum)
                  const cb = closestCalNum(b.filename, libOriginalNum)
                  return (ca?.delta ?? 999999) - (cb?.delta ?? 999999)
                })
                .map(entry => {
                const cal = libOriginalNum ? closestCalNum(entry.filename, libOriginalNum) : null
                return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: `1px solid ${cal && cal.delta < 2000 ? 'rgba(184,240,42,0.25)' : 'var(--border)'}` }}>
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {cal && (
                        <span style={{ fontSize: 11, fontWeight: 800, color: cal.delta < 2000 ? '#b8f02a' : cal.delta < 10000 ? '#f59e0b' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                          {cal.num.toLocaleString()}
                          <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 3 }}>
                            {cal.delta === 0 ? '✓ exact' : `±${cal.delta.toLocaleString()}`}
                          </span>
                        </span>
                      )}
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: entry.file_type === 'a2l' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)', color: entry.file_type === 'a2l' ? '#22c55e' : '#3b82f6', fontWeight: 700, flexShrink: 0 }}>
                        .{entry.file_type}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.filename}</div>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 10, padding: '3px 10px', flexShrink: 0, marginLeft: 8 }}
                    disabled={libLoadingId === entry.id}
                    onClick={() => loadDefinitionFromLibrary(entry)}
                  >
                    {libLoadingId === entry.id ? '⏳' : 'Load'}
                  </button>
                </div>
                )
              })}
            </div>
          </>
        )}
        {libLoadError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{libLoadError}</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setStep(0)}>Back</button>
        <button className="btn-primary" disabled={!selectedEcuId} onClick={() => setStep(2)}>
          Continue →
        </button>
      </div>
    </div>
  )

  const STAGE_INFO: Record<Stage, { power: string; boost: string; torque: string; desc: string; color: string }> = {
    1: { power: '+15–25%', boost: '+18%', torque: '+28%', desc: 'Safe bolt-on gains on stock hardware. Raises torque ceiling, fuel quantity, smoke limiter and boost target in step. No turbo or intercooler upgrade required. Ideal for daily drivers.', color: '#3b82f6' },
    2: { power: '+25–40%', boost: '+28%', torque: '+45%', desc: 'Performance build. Uprated intercooler and sports exhaust recommended. SOI advance added for combustion efficiency. Significant power gains with proper supporting hardware.', color: '#f59e0b' },
    3: { power: '+40–60%', boost: '+40%', torque: '+65%', desc: 'Track/motorsport build. Hybrid or upgraded turbo, forged internals and uprated fuelling hardware required. Full map chain raised to maximum safe limits.', color: '#ef4444' },
  }

  const renderStep2 = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Remap Stage
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {([1, 2, 3] as Stage[]).map(s => {
            const info = STAGE_INFO[s]
            const active = stage === s
            return (
              <div
                key={s}
                onClick={() => setStage(s)}
                style={{
                  padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${active ? info.color : 'var(--border)'}`,
                  background: active ? `${info.color}11` : 'var(--bg-card)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? info.color : 'var(--bg-primary)',
                    color: active ? '#000' : 'var(--text-muted)', fontWeight: 800, fontSize: 12,
                  }}>
                    {s}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: active ? info.color : 'var(--text-secondary)' }}>Stage {s}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: active ? info.color : 'var(--text-primary)', marginBottom: 2 }}>{info.power}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>power gain</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(0,174,200,0.1)', color: 'var(--accent)', fontWeight: 700 }}>
                    Boost {info.boost}
                  </span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>
                    Torq {info.torque}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{info.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Add-ons
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ADDONS.map(addon => {
            const active = addons.includes(addon.id as AddonId)
            // Check ECU compatibility
            const compatible = !addon.compatEcus || addon.compatEcus.some(c => selectedEcuId === c || selectedEcuId.startsWith(c + '_'))
            // Check mutual exclusion — dimmed (but still clickable to swap) when its paired addon is active
            const mutualId = ADDON_MUTEX[addon.id as AddonId]
            const mutuallyBlocked = !!mutualId && addons.includes(mutualId)
            const canInteract = compatible && !mutuallyBlocked || active
            return (
              <div
                key={addon.id}
                onClick={() => compatible && toggleAddon(addon.id as AddonId)}
                style={{
                  padding: '12px 14px', borderRadius: 8, cursor: compatible ? 'pointer' : 'not-allowed',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(0,174,200,0.06)' : 'var(--bg-card)',
                  opacity: compatible ? (mutuallyBlocked ? 0.35 : 1) : 0.4,
                  transition: 'all 0.12s ease',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                  background: active ? 'var(--accent)' : 'var(--bg-primary)',
                  border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>{addon.name}</span>
                    {!compatible && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700, padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(239,68,68,0.4)' }}>Incompatible ECU</span>}
                    {mutuallyBlocked && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700, padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)' }}>Select to swap</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>{addon.desc}</div>
                  {addon.warning && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#f59e0b' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      {addon.warning}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
        <button className="btn-primary" onClick={handleConfigureNext}>
          Preview Changes →
        </button>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div>
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{selectedEcu?.name}</strong> · Stage {stage}
        </span>
        {addons.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--accent)' }}>
            Addons: {addons.join(', ')}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {extractedMaps.filter(m => m.found && m.mapDef.showPreview).length} / {extractedMaps.filter(m => m.mapDef.showPreview).length} maps found
          {a2lFallbackCount > 0 && (
            <span style={{ marginLeft: 8, color: '#22c55e', fontWeight: 700 }}>
              ({a2lFallbackCount} via A2L/DRT ✓)
            </span>
          )}
        </span>
      </div>

      {/* A2L fallback diagnostic — shown when all maps fail */}
      {extractedMaps.length > 0 && extractedMaps.filter(m => m.found).length === 0 && a2lValidation.length > 0 && (() => {
        const vCount = a2lValidation.filter(v => v.status === 'valid').length
        const uCount = a2lValidation.filter(v => v.status === 'uncertain').length
        return (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f87171' }}>⚠ No maps found</strong> — binary signatures don't match this ECU variant and no A2L/DRT was loaded.{' '}
            {vCount === 0 && uCount === 0
              ? 'Load an A2L or DRT file from the library (go Back → ECU Detected) to locate maps by address.'
              : vCount === 0
                ? `A2L validation found only ${uCount} uncertain address${uCount !== 1 ? 'es' : ''} — the A2L may be for a different software version. Try loading a DRT file from the library instead.`
                : 'A2L fallback failed to read valid data at the validated addresses. Try a DRT file from the library.'}
          </div>
        )
      })()}

      {/* ── Map chain dependency warnings ─────────────────────────────────────
           EDC17 tune chain: Drivers Wish → Torque Limit → Torque→IQ → IQ →
           Smoke Limiter (parallel cap). Boost chain: N75 duty → Boost Target.
           If a downstream map is found but its upstream guard is missing, warn the tuner.
      */}
      {extractedMaps.length > 0 && (() => {
        // ── Generalised map chain warnings — works for any ECU family ──────────
        // Uses category-based checks so EDC16, MED17, SIMOS all get warnings too.
        const pfx = selectedEcu?.id ?? ''
        const foundId  = (id: string)  => extractedMaps.find(m => m.mapDef.id === id)?.found ?? false
        const hasCat   = (cat: string) => extractedMaps.some(m => m.mapDef.category === cat && m.found)
        const defExists = (id: string) => extractedMaps.some(m => m.mapDef.id === id)
        const warnings: { key: string; msg: string }[] = []

        // Smoke limiter: any diesel with fuel maps found but smoke category missing
        if (hasCat('fuel') && defExists(`${pfx}_smoke_limiter`) && !foundId(`${pfx}_smoke_limiter`)) {
          warnings.push({ key: 'smoke', msg: '⚠ Smoke Limiter not found — fuel quantity gains will be silently capped at low airflow. Load an A2L/DRT with LmbdSmkLow / Qsmk_MAP to unlock full IQ range.' })
        }
        // Torque→IQ bridge: needed on any ECU that has this map defined
        if (hasCat('fuel') && defExists(`${pfx}_torque_iq`) && !foundId(`${pfx}_torque_iq`)) {
          warnings.push({ key: 'trq2iq', msg: '⚠ Torque→IQ map not found — injector demand disconnected from driver torque request. Stage gains will be incomplete without this bridge map.' })
        }
        // Driver's Wish: if torque limit is found but pedal mapping is missing
        if (foundId(`${pfx}_torque_limit`) && defExists(`${pfx}_drivers_wish`) && !foundId(`${pfx}_drivers_wish`)) {
          warnings.push({ key: 'drvwsh', msg: "⚠ Driver's Wish map not found — pedal-to-torque conversion unchanged. Throttle response and peak torque demand will remain at stock values despite torque limit raise." })
        }
        // N75/boost chain: duty raised but ceiling unchanged
        if (extractedMaps.some(m => m.found && m.mapDef.id.includes('n75')) && !hasCat('boost')) {
          warnings.push({ key: 'boosttgt', msg: '⚠ Boost Target map not found — N75 duty cycle was raised but the boost ceiling (pBoostSet) is unchanged. Actual boost gain will be limited.' })
        }

        // ── ME7-specific map chain warnings ──────────────────────────────────
        // LDRXN raised but invisible sub-chain limiters not found
        if (foundId('me7_boost_map') && defExists('me7_kfldhbn') && !foundId('me7_kfldhbn')) {
          warnings.push({ key: 'me7kfldhbn', msg: '⚠ ME7 KFLDHBN (Max Boost Pressure Ratio) not found — raising LDRXN without KFLDHBN leaves an invisible load ceiling that overrides the boost target. Car will feel like it has a boost leak. Must be raised alongside LDRXN.' })
        }
        if (foundId('me7_boost_map') && defExists('me7_ldrxnzk') && !foundId('me7_ldrxnzk')) {
          warnings.push({ key: 'me7ldrxnzk', msg: '⚠ ME7 LDRXNZK (Knock Fallback Boost) not found — under sustained knock the ECU drops to the stock low-boost fallback instead of the tuned value. Appears as intermittent boost drop on hard pulls.' })
        }
        if (foundId('me7_boost_map') && defExists('me7_kfldrl') && !foundId('me7_kfldrl')) {
          warnings.push({ key: 'me7kfldrl', msg: '⚠ ME7 KFLDRL (Wastegate Pre-Control) not found — the ECU has no feed-forward WGDC correction for the raised boost target. Boost build will be slow and the I-regulator will saturate, causing overshoot. Load an A2L to locate KFLDRL.' })
        }
        if (foundId('me7_kfldrl') && defExists('me7_kfldimx') && !foundId('me7_kfldimx')) {
          warnings.push({ key: 'me7kfldimx', msg: '⚠ ME7 KFLDIMX (Boost PID I-Limit) not found — the integral regulator ceiling is unchanged, limiting how much the PID can correct above the stock pre-control. Boost will fall short of the new target under load.' })
        }
        // KFMIRL raised without KFMIOP — torque model inconsistency
        if (foundId('me7_kfmirl') && defExists('me7_kfmiop') && !foundId('me7_kfmiop')) {
          warnings.push({ key: 'me7kfmiop', msg: '⚠ ME7 KFMIOP (Load→Torque forward map) not found — KFMIRL was raised but KFMIOP was not. The ECU torque model is now internally inconsistent. Closed-loop torque monitoring may oscillate or limit power unexpectedly.' })
        }
        // MLHFM not calibrated — all downstream calcs wrong
        if (foundId('me7_mlhfm') && defExists('me7_kfkhfm') && !foundId('me7_kfkhfm')) {
          warnings.push({ key: 'me7kfkhfm', msg: '⚠ ME7 KFKHFM (MAF Correction) not found — if the MAF sensor reading has errors at this load/RPM, the ECU will not correct for them. Fuelling and load accuracy depends on MLHFM + KFKHFM both being calibrated.' })
        }
        // ── Addon conflict warnings ──────────────────────────────────────────
        // Note: Pop & Bang / Popcorn Limiter are mutually exclusive in the UI (toggleAddon enforces this).
        // Launch Control + Rev Limiter Raise can both be selected — warn since LC takes precedence on rev limit maps.
        if (addons.includes('launchcontrol') && addons.includes('revlimit')) {
          warnings.push({ key: 'lc_revlimit_conflict', msg: '⚠ Launch Control and Rev Limiter Raise both active — Launch Control overrides the rev limit map (sets 2-step RPM). Rev Limiter Raise will have no effect while Launch Control is active. Select one or the other.' })
        }

        if (warnings.length === 0) return null
        return (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warnings.map(w => (
              <div key={w.key} style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.25)', fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
                {w.msg}
              </div>
            ))}
          </div>
        )
      })()}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {extractedMaps.map(m => {
          // Hide any map where showPreview is false (N75, DPF/EGR emission maps, misc internal maps).
          // These are located and modified by the engine but don't need a heatmap card shown to the tuner.
          if (!m.mapDef.showPreview) return null
          // Effective params: addon override takes precedence over stage params —
          // matches remapEngine.ts getParams() exactly so badge and preview are accurate.
          let effectiveParams = m.mapDef[`stage${stage}` as 'stage1' | 'stage2' | 'stage3']
          for (const addonId of addons) {
            if (m.mapDef.addonOverrides?.[addonId]) {
              effectiveParams = m.mapDef.addonOverrides[addonId]
              break
            }
          }
          const params = effectiveParams
          // Badge: multiplier != 1 → show %; multiplier 0 with addend → show "SET"; addend-only → show physical delta
          const isSet = params.multiplier === 0 && params.addend !== undefined  // full replacement (e.g. popbang)
          const expectedPct = !isSet && params.multiplier !== undefined && params.multiplier !== 1
            ? (params.multiplier - 1) * 100
            : 0
          const expectedAddend = !isSet && params.multiplier === undefined && params.addend
            ? params.addend * m.mapDef.factor
            : 0

          return (
            <div
              key={m.mapDef.id}
              style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--bg-card)', border: `1px solid ${m.found ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CatBadge cat={m.mapDef.category} />
                {m.source === 'a2l' && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>A2L</span>
                )}
                {m.source === 'drt' && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>DRT</span>
                )}
                {m.source === 'fixedOffset' && (
                  <span title="Located by hardcoded offset — lower confidence than signature match" style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>OFFSET</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                  {m.mapDef.name}
                  {m.found && m.offset >= 0 && (
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.22)', fontFamily: 'monospace', marginLeft: 10 }}>
                      0x{m.offset.toString(16).toUpperCase().padStart(6, '0')}
                    </span>
                  )}
                </span>
                {m.found ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isSet && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#a855f7', padding: '2px 7px', borderRadius: 4, background: 'rgba(168,85,247,0.1)' }}>
                        SET {((params.addend ?? 0) * m.mapDef.factor + m.mapDef.offsetVal).toFixed(1)}{m.mapDef.unit ? m.mapDef.unit : ''}
                      </span>
                    )}
                    {!isSet && expectedPct > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', padding: '2px 7px', borderRadius: 4, background: 'rgba(0,174,200,0.1)' }}>
                        +{expectedPct.toFixed(0)}%
                      </span>
                    )}
                    {!isSet && expectedAddend !== 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', padding: '2px 7px', borderRadius: 4, background: 'rgba(0,174,200,0.1)' }}>
                        {expectedAddend > 0 ? '+' : ''}{expectedAddend.toFixed(1)}{m.mapDef.unit ? ` ${m.mapDef.unit}` : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Found</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {m.mapDef.critical && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                    )}
                    <span style={{ fontSize: 10, color: m.mapDef.critical ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                      {m.mapDef.critical ? 'Not Found (Critical)' : 'Not Found'}
                    </span>
                    {!a2lResult && !drtResult && (
                      <span style={{ fontSize: 9, color: 'rgba(0,174,200,0.65)', fontWeight: 700 }}>
                        → Load A2L/DRT
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                {m.mapDef.desc}
              </div>
              {m.found && (() => {
                const allVals = m.data.flatMap(r => r)
                if (allVals.length === 0) return null
                const mn = Math.min(...allVals)
                const mx = Math.max(...allVals)
                const unit = m.mapDef.unit ?? ''
                return (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.2px' }}>
                    {mn.toFixed(1)} – {mx.toFixed(1)}{unit ? ` ${unit}` : ''}
                  </div>
                )
              })()}
              {(() => {
                const a2lMap = a2lMaps.find(am => am.name === m.mapDef.name)
                return a2lMap ? (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7, marginBottom: m.found && m.mapDef.showPreview ? 6 : 0 }}>
                    {a2lMap.axisX.label}{a2lMap.axisY ? ` \u00d7 ${a2lMap.axisY.label}` : ''}
                  </div>
                ) : null
              })()}
              {m.found && m.mapDef.showPreview && (
                <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                  <MiniHeatmap data={m.data} label="Before (stock)" mapCategory={m.mapDef.category} />
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: 14 }}>→</div>
                  <MiniHeatmap
                    data={m.data.map((row, r) => row.map((v, c) => {
                      // Mirror remapEngine.ts applyParams exactly: operate in RAW space,
                      // then convert back to physical. This is critical for maps with non-zero
                      // offsetVal (KFZW, KFZWOP, KFZWMN, KFMIRL) where multiplying physical
                      // values directly gives wrong results (e.g. 15°×1.1 = 16.5° instead of 21.3°).
                      // Also handles multiplier=0 correctly (falsy check was broken before).
                      // lastNRows/lastNCols masking: cells outside the target zone keep physical value as-is.
                      const rowStart = params.lastNRows !== undefined ? Math.max(0, m.data.length - params.lastNRows) : 0
                      const colStart = params.lastNCols !== undefined ? Math.max(0, row.length - params.lastNCols) : 0
                      if (r < rowStart || c < colStart) return v
                      const f   = m.mapDef.factor   || 1
                      const off = m.mapDef.offsetVal ?? 0
                      const oldRaw = f !== 0 ? (v - off) / f : 0
                      let newRaw = params.multiplier !== undefined ? oldRaw * params.multiplier : oldRaw
                      if (params.addend   !== undefined) newRaw += params.addend
                      if (params.clampMax !== undefined) newRaw  = Math.min(newRaw, params.clampMax)
                      if (params.clampMin !== undefined) newRaw  = Math.max(newRaw, params.clampMin)
                      return newRaw * f + off
                    }))}
                    label={`After (Stage ${stage}${addons.length > 0 ? ' + addons' : ''})`}
                    mapCategory={m.mapDef.category}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setStep(2)}>Back</button>
        <button className="btn-primary" onClick={handleBuildRemap}>
          Build Remap →
        </button>
      </div>
    </div>
  )

  const renderStep4 = () => {
    if (!remapResult || !selectedEcu) return null
    const { summary } = remapResult
    // Verify on the OUTPUT buffer — correctChecksum was already applied in handleBuildRemap.
    // valid=true means the correction succeeded. valid=false only occurs for algo='none' (SIMOS18)
    // or an ECU whose checksum algo we don't handle — in that case warn the tuner.
    const cksm = verifyChecksum(remapResult.modifiedBuffer, selectedEcu)
    const checksumHandled = selectedEcu.checksumAlgo !== 'none' && selectedEcu.checksumAlgo !== 'unknown'

    return (
      <div>
        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Maps Modified', value: String(summary.mapsModified), unit: '', color: 'var(--accent)', zero: summary.mapsModified === 0 },
            { label: 'Boost Change', value: summary.boostChangePct > 0 ? `+${summary.boostChangePct.toFixed(1)}` : '–', unit: summary.boostChangePct > 0 ? '%' : '', color: '#3b82f6', zero: summary.boostChangePct === 0 },
            { label: 'Torque Change', value: summary.torqueChangePct > 0 ? `+${summary.torqueChangePct.toFixed(1)}` : '–', unit: summary.torqueChangePct > 0 ? '%' : '', color: '#f59e0b', zero: summary.torqueChangePct === 0 },
            { label: 'Fuel Change', value: summary.fuelChangePct > 0 ? `+${summary.fuelChangePct.toFixed(1)}` : '–', unit: summary.fuelChangePct > 0 ? '%' : '', color: '#a855f7', zero: summary.fuelChangePct === 0 },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center', opacity: stat.zero ? 0.45 : 1 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: stat.zero ? 'var(--text-muted)' : stat.color, marginBottom: 2 }}>
                {stat.value}{stat.unit}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Checksum status */}
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: !checksumHandled ? 'rgba(245,158,11,0.08)' : cksm.valid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${!checksumHandled ? 'rgba(245,158,11,0.25)' : cksm.valid ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: !checksumHandled ? '#f59e0b' : cksm.valid ? '#22c55e' : '#ef4444' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2,
              color: !checksumHandled ? '#f59e0b' : cksm.valid ? '#22c55e' : '#ef4444' }}>
              {!checksumHandled
                ? 'Checksum — Manual Correction Required'
                : cksm.valid
                  ? '✓ Checksum Corrected and Verified'
                  : '✗ Checksum Correction Failed — Do Not Flash'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              Algorithm: {cksm.algo} · Offset: 0x{cksm.offset.toString(16).toUpperCase()}
              {!checksumHandled && ' · Use WinOLS or your flashing tool to correct before writing to ECU'}
            </div>
          </div>
        </div>

        {/* Block-level checksum — show result or warning depending on whether auto-correction succeeded */}
        {['edc17', 'edc16', 'simos18', 'simos10', 'simos11', 'pcr21', 'med17'].includes(selectedEcu?.id ?? '') && (
          blockResult && blockResult.blocksFixed > 0 ? (
            // Block table was found and corrected automatically
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>✅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 3 }}>
                  Block Checksums Auto-Corrected — {blockResult.blocksFixed} segment{blockResult.blocksFixed > 1 ? 's' : ''} fixed
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  Block descriptor table found at 0x{blockResult.tableOffset.toString(16).toUpperCase()} · Algorithm: {blockResult.initMode === 'blockid' ? 'Bosch block-ID CRC32' : 'Standard CRC32'} · File is ready to flash.
                </div>
              </div>
            </div>
          ) : (
            // Block table not found — fall back to external tool warning
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', marginBottom: 3 }}>Block Checksums — Verify Before Flashing</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Block descriptor table not found automatically for this {selectedEcu?.name} variant.
                  Use <strong style={{ color: 'rgba(255,255,255,0.75)' }}>WinOLS</strong>, <strong style={{ color: 'rgba(255,255,255,0.75)' }}>BDM100</strong>, or
                  your flashing tool's built-in checksum correction before writing to the ECU.
                  Flashing without correct block checksums will cause the ECU to reject the calibration.
                </div>
              </div>
            </div>
          )
        )}

        {/* Maps modified warning */}
        {summary.mapsNotFound > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style={{ fontSize: 11.5, color: '#ef4444' }}>
              {summary.mapsNotFound} critical map(s) not found in binary. The file may still have been modified for located maps. Verify carefully before flashing.
            </span>
          </div>
        )}

        {/* Output file info */}
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--accent)', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Output file</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', marginBottom: 4 }}>
            {buildFilename(fileName, selectedEcu, stage, addons)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {(remapResult.modifiedBuffer.byteLength / 1024).toFixed(0)} KB · Stage {stage}
            {addons.length > 0 ? ' + ' + addons.join(', ') : ''}
          </div>
        </div>

        {/* Download button */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setStep(3)}>Back</button>
          <button
            className="btn-primary"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleDownload}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Modified Binary
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setStep(0); setFileName(''); setFileBuffer(null); setHexPreview(''); setLoadError('')
              setDetected(null); setSelectedEcuId(''); setAddons([]); setStage(1)
              setExtractedMaps([]); setRemapResult(null); setBlockResult(null)
              // Clear A2L / DRT definition state — old definition must not bleed into a new file
              setA2lResult(null); setA2lMaps([]); setA2lFileName('')
              setDrtResult(null); setDrtMaps([]); setDrtFileName('')
              setA2lValidation([]); setA2lFallbackCount(0); setShowSigExport(false); setSigExportText('')
              // Clear library search state
              setLibSearch(''); setLibResults([]); setLibTotal(0); setLibPage(0)
              setLibFallbackNote(''); setLibOriginalNum(''); setLibLoadError('')
            }}
          >
            New File
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            Remap Builder
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>AI-Assisted</span>
            <span>·</span>
            <span>Stage 1 / 2 / 3</span>
            <span>·</span>
            <span>{ECU_DEFINITIONS.map(e => e.family).join(' · ')}</span>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepBar current={step} />

      {/* Step content */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          {STEPS[step]}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          {[
            'Load an ECU binary file to begin. The system will automatically identify the ECU family.',
            'Confirm or override the detected ECU family before proceeding.',
            'Select your target stage and any optional add-ons.',
            'Review map changes before writing. Critical maps are highlighted.',
            'Your modified binary is ready. Download and flash with your preferred tool.',
          ][step]}
        </div>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>
    </div>
  )
}
