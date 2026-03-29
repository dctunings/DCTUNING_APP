import { useState, useCallback, useRef, useEffect } from 'react'
import { ECU_DEFINITIONS, ADDONS } from '../lib/ecuDefinitions'
import type { EcuDef } from '../lib/ecuDefinitions'
import { detectEcu, extractAllMaps } from '../lib/binaryParser'
import type { DetectedEcu, ExtractedMap } from '../lib/binaryParser'
import { buildRemap, buildFilename } from '../lib/remapEngine'
import type { Stage, AddonId, RemapResult } from '../lib/remapEngine'
import { verifyChecksum, correctChecksum } from '../lib/checksumEngine'
import { parseA2L, extractMapsFromA2L, guessEcuFamily, ECU_BASE_ADDRESSES } from '../lib/a2lParser'
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
function MiniHeatmap({ data, label }: { data: number[][], label: string }) {
  const PREVIEW_ROWS = 5
  const PREVIEW_COLS = 4
  const rows = data.slice(0, PREVIEW_ROWS)
  const allVals = rows.flatMap(r => r.slice(0, PREVIEW_COLS))
  const mn = Math.min(...allVals)
  const mx = Math.max(...allVals)
  const range = mx - mn || 1

  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PREVIEW_COLS}, 1fr)`, gap: 2 }}>
        {rows.map((row, r) =>
          row.slice(0, PREVIEW_COLS).map((val, c) => (
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
  const [showLibrary, setShowLibrary] = useState(false)
  const LIB_PAGE_SIZE = 50

  const selectedEcu: EcuDef | undefined = ECU_DEFINITIONS.find(e => e.id === selectedEcuId)

  // ─── File loading ─────────────────────────────────────────────────────────
  const processFile = useCallback((buf: ArrayBuffer, name: string) => {
    setLoadError('')
    setFileName(name)
    setFileSize(buf.byteLength)
    setFileBuffer(buf)

    // Hex preview of first 32 bytes
    const bytes = new Uint8Array(buf.slice(0, 32))
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    setHexPreview(hex)

    // Auto-detect ECU
    const det = detectEcu(buf)
    setDetected(det)
    if (det) {
      setSelectedEcuId(det.def.id)
    } else {
      setSelectedEcuId('')
    }
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
    const maps = extractAllMaps(fileBuffer, selectedEcu)
    setExtractedMaps(maps)
    setStep(3)
  }

  // ─── Step 3→4: build remap ────────────────────────────────────────────────
  const handleBuildRemap = () => {
    if (!fileBuffer || !selectedEcu || extractedMaps.length === 0) return
    const result = buildRemap(fileBuffer, selectedEcu, stage, addons, extractedMaps)
    // Auto-correct checksum
    const corrected = correctChecksum(result.modifiedBuffer, selectedEcu)
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
      console.error('Save error:', err)
    }
  }

  // ─── Addon toggle ─────────────────────────────────────────────────────────
  const toggleAddon = (id: AddonId) => {
    setAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  // ─── A2L load ─────────────────────────────────────────────────────────────
  const handleA2LLoad = async (file: File) => {
    try {
      const content = await file.text()
      const result = parseA2L(content)
      const family = guessEcuFamily(result)
      const baseAddr = ECU_BASE_ADDRESSES[family] ?? 0x80000000
      const maps = extractMapsFromA2L(result, baseAddr)
      setA2lResult(result)
      setA2lMaps(maps)
      setA2lFileName(file.name)
      // Clear any DRT if A2L loaded
      setDrtResult(null)
      setDrtMaps([])
      setDrtFileName('')
      // Share with Performance page
      if (fileBuffer) onEcuLoaded?.({ fileName, fileBuffer, detected, a2lMaps: maps, drtMaps: [] })
    } catch (e) {
      console.error('A2L parse error:', e)
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
      // Clear any A2L if DRT loaded
      setA2lResult(null)
      setA2lMaps([])
      setA2lFileName('')
      // Share with Performance page
      if (fileBuffer) onEcuLoaded?.({ fileName, fileBuffer, detected, a2lMaps: [], drtMaps: converted })
    } catch (e) {
      console.error('DRT parse error:', e)
    }
  }

  // ─── Library search ───────────────────────────────────────────────────────
  const searchLibrary = useCallback(async (query: string, page = 0) => {
    if (!query.trim()) { setLibResults([]); setLibTotal(0); return }
    setLibLoading(true)
    try {
      const { data, count } = await supabase
        .from('definitions_index')
        .select('*', { count: 'exact' })
        .or(`filename.ilike.%${query}%,ecu_family.ilike.%${query}%,make.ilike.%${query}%,model.ilike.%${query}%,driver_name.ilike.%${query}%`)
        .order('filename')
        .range(page * LIB_PAGE_SIZE, (page + 1) * LIB_PAGE_SIZE - 1)
      setLibResults((data ?? []) as DefinitionEntry[])
      setLibTotal(count ?? 0)
      setLibPage(page)
    } finally {
      setLibLoading(false)
    }
  }, [LIB_PAGE_SIZE])

  // Auto-search when ECU is detected
  useEffect(() => {
    if (detected && showLibrary) {
      const query = detected.def.family || detected.def.name
      setLibSearch(query)
      searchLibrary(query)
    }
  }, [detected, showLibrary, searchLibrary])

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
        const family = guessEcuFamily(result)
        const baseAddr = ECU_BASE_ADDRESSES[family] ?? 0x80000000
        const maps = extractMapsFromA2L(result, baseAddr)
        setA2lResult(result)
        setA2lMaps(maps)
        setA2lFileName(entry.filename)
        setDrtResult(null); setDrtMaps([]); setDrtFileName('')
      } else {
        const buf = await data.arrayBuffer()
        const result = parseDRT(buf, entry.driver_name ?? entry.filename)
        const converted = convertDRTMaps(result)
        setDrtResult(result)
        setDrtMaps(converted)
        setDrtFileName(entry.filename)
        setA2lResult(null); setA2lMaps([]); setA2lFileName('')
      }
      setShowLibrary(false)
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
        </div>
      )}
      {/* Library search panel */}
      {showLibrary && (
        <div style={{ marginTop: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flex: 1 }}>Search A2L / DRT Library</span>
            <button onClick={() => setShowLibrary(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={libSearch}
              onChange={e => setLibSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchLibrary(libSearch, 0)}
              placeholder="Search by ECU family, make, model, filename…"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={() => searchLibrary(libSearch, 0)}
              style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {libLoading ? '…' : 'Search'}
            </button>
          </div>

          {libLoadError && (
            <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
              ⚠ {libLoadError}
            </div>
          )}

          {libTotal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              <span>{libTotal.toLocaleString()} results</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {libPage > 0 && (
                  <button onClick={() => searchLibrary(libSearch, libPage - 1)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>← Prev</button>
                )}
                <span>Page {libPage + 1} of {Math.ceil(libTotal / LIB_PAGE_SIZE)}</span>
                {(libPage + 1) * LIB_PAGE_SIZE < libTotal && (
                  <button onClick={() => searchLibrary(libSearch, libPage + 1)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Next →</button>
                )}
              </div>
            </div>
          )}

          {libResults.length === 0 && !libLoading && libSearch && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No definitions found
            </div>
          )}
          {libResults.length === 0 && !libLoading && !libSearch && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              Search 4,400+ A2L files and 16,000+ DRT driver files
            </div>
          )}

          {libResults.map(entry => (
            <div
              key={entry.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid transparent' }}
            >
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: entry.file_type === 'a2l' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)', color: entry.file_type === 'a2l' ? '#22c55e' : '#3b82f6', flexShrink: 0 }}>
                {entry.file_type.toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.filename}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {[entry.ecu_family, entry.make, entry.model].filter(Boolean).join(' · ')}
                  {entry.map_count > 0 && ` · ${entry.map_count}M ${entry.curve_count}C`}
                </div>
              </div>
              <button
                onClick={() => loadDefinitionFromLibrary(entry)}
                disabled={libLoadingId === entry.id}
                style={{ fontSize: 10, fontWeight: 700, color: libLoadingId === entry.id ? 'var(--text-muted)' : 'var(--accent)', background: 'none', border: '1px solid', borderColor: libLoadingId === entry.id ? 'var(--border)' : 'rgba(0,174,200,0.3)', borderRadius: 5, padding: '3px 10px', cursor: libLoadingId === entry.id ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              >
                {libLoadingId === entry.id ? '⏳' : 'Load →'}
              </button>
            </div>
          ))}
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
              Optional: Drop definition file or search library
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 700 }}>
                .a2l — Bosch/ASAP2
              </span>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 700 }}>
                .drt — ECM Titanium
              </span>
              <span
                onClick={e => { e.stopPropagation(); setShowLibrary(v => !v) }}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,174,200,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,174,200,0.3)', fontWeight: 700, cursor: 'pointer' }}
              >
                🔍 Search Library
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
        <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: 12 }}>
          ECU not automatically detected — please select manually below.
        </div>
      )}

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
        <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 20 }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-secondary" onClick={() => setStep(0)}>Back</button>
        <button className="btn-primary" disabled={!selectedEcuId} onClick={() => setStep(2)}>
          Continue →
        </button>
      </div>
    </div>
  )

  const STAGE_INFO: Record<Stage, { power: string; boost: string; torque: string; desc: string; color: string }> = {
    1: { power: '+15–25%', boost: '+18%', torque: '+25%', desc: 'Safe bolt-on gains. Stock hardware, no turbo or intercooler upgrade required. Ideal for daily drivers.', color: '#3b82f6' },
    2: { power: '+25–40%', boost: '+30%', torque: '+40%', desc: 'Performance hardware upgrade required. Uprated intercooler, sports exhaust recommended. Significant power gains.', color: '#f59e0b' },
    3: { power: '+40–60%', boost: '+45%', torque: '+60%', desc: 'Track/motorsport build. Hybrid turbo, fuelling hardware, forged internals recommended. Maximum power output.', color: '#ef4444' },
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
            const compatible = !addon.compatEcus || addon.compatEcus.includes(selectedEcuId)
            return (
              <div
                key={addon.id}
                onClick={() => compatible && toggleAddon(addon.id as AddonId)}
                style={{
                  padding: '12px 14px', borderRadius: 8, cursor: compatible ? 'pointer' : 'not-allowed',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(0,174,200,0.06)' : 'var(--bg-card)',
                  opacity: compatible ? 1 : 0.4,
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
          {extractedMaps.filter(m => m.found).length} / {extractedMaps.length} maps found
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {extractedMaps.map(m => {
          if (!m.mapDef.showPreview && m.mapDef.category === 'emission') return null
          const params = m.mapDef[`stage${stage}` as 'stage1' | 'stage2' | 'stage3']
          const expectedPct = params.multiplier ? (params.multiplier - 1) * 100 : (params.addend ? 0 : 0)

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
                {a2lMaps.some(am => am.name === m.mapDef.name) && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>A2L</span>
                )}
                {drtMaps.some(dm => dm.category === m.mapDef.category) && !a2lMaps.some(am => am.name === m.mapDef.name) && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>DRT</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{m.mapDef.name}</span>
                {m.found ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {expectedPct > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', padding: '2px 7px', borderRadius: 4, background: 'rgba(0,174,200,0.1)' }}>
                        +{expectedPct.toFixed(0)}%
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Found</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {m.mapDef.critical && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      </svg>
                    )}
                    <span style={{ fontSize: 10, color: m.mapDef.critical ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                      {m.mapDef.critical ? 'Not Found (Critical)' : 'Not Found'}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                {m.mapDef.desc}
              </div>
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
                  <MiniHeatmap data={m.data} label="Before (stock)" />
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: 14 }}>→</div>
                  <MiniHeatmap
                    data={m.data.map(row => row.map(v => {
                      if (params.multiplier) return v * params.multiplier
                      if (params.addend) return v + params.addend
                      return v
                    }))}
                    label={`After (Stage ${stage})`}
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
    const cksm = verifyChecksum(remapResult.modifiedBuffer, selectedEcu)

    return (
      <div>
        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Maps Modified', value: summary.mapsModified, unit: '', color: 'var(--accent)' },
            { label: 'Boost Change', value: `+${summary.boostChangePct.toFixed(1)}`, unit: '%', color: '#3b82f6' },
            { label: 'Torque Change', value: `+${summary.torqueChangePct.toFixed(1)}`, unit: '%', color: '#f59e0b' },
            { label: 'Fuel Change', value: `+${summary.fuelChangePct.toFixed(1)}`, unit: '%', color: '#a855f7' },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: stat.color, marginBottom: 2 }}>
                {stat.value}{stat.unit}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Checksum status */}
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: cksm.valid ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${cksm.valid ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cksm.valid ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: cksm.valid ? '#22c55e' : '#f59e0b', marginBottom: 2 }}>
              Checksum {cksm.valid ? 'Valid — Auto-corrected' : 'Recalculated'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              Algorithm: {cksm.algo} · Offset: 0x{cksm.offset.toString(16).toUpperCase()}
            </div>
          </div>
        </div>

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
            onClick={() => { setStep(0); setFileName(''); setFileBuffer(null); setHexPreview(''); setDetected(null); setSelectedEcuId(''); setAddons([]); setStage(1); setExtractedMaps([]); setRemapResult(null) }}
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
            <span>MED17 · EDC17 · SIMOS18 · ME7</span>
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
