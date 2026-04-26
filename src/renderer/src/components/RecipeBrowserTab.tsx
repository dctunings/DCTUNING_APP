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

const PAGE_SIZE = 80

// Try to extract a vehicle hint from the original tuner filename + parent folder.
// Filenames look like: "Audi_A4_1.8T__Benzin___96.4KWKW_Bosch_0261207939_..."
// Folder names like:   "Golf 7 2.0 TFSI Stage 1 Sw SC800H6300000 Hw 5G0906259E"
// Folder is preferred when present because it usually has cleaner vehicle naming.
function vehicleHint(sourceTunedFile: string, sourceFolder?: string): string {
  // Folder first — usually has the cleanest vehicle description
  if (sourceFolder && sourceFolder.length > 3 && !/^[0-9a-f]{8,}$/i.test(sourceFolder)) {
    // Strip tuner-internal prefixes like "[B&C Consulting]"
    const cleaned = sourceFolder.replace(/^\[[^\]]*\]\s*/, '').trim()
    if (cleaned) return cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned
  }
  if (!sourceTunedFile) return ''
  const cleaned = sourceTunedFile
    .replace(/^[a-zA-Z]+_/, '')
    .replace(/\.(Stage[0-9]+\+?\+?\+?|bin|ori|mod)$/i, '')
  const tokens = cleaned.split('_').filter(t => t.trim() && !/^\d+\.\d+$/.test(t))
  if (tokens.length === 0) return ''
  return tokens.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim()
}

interface PartGroup {
  partNumber: string
  variants: RecipeManifestEntry[]   // all entries with this partNumber
  swNumbers: Set<string>            // distinct SW numbers under this part
  stages: Set<number>               // {1,2,3}
  vehicleHint: string               // best-effort string from filenames
}

export default function RecipeBrowserTab() {
  const [manifest, setManifest] = useState<RecipeManifestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<StageFilter>('all')
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
        g = { partNumber: key, variants: [], swNumbers: new Set(), stages: new Set(), vehicleHint: '' }
        map.set(key, g)
      }
      g.variants.push(entry)
      if (entry.swNumber) g.swNumbers.add(entry.swNumber)
      g.stages.add(entry.stage)
      // Pick the best vehicle hint we can find across all variants of this part.
      // Folder-based hints win over filename-based ones.
      if (entry.sourceFolder || entry.sourceTunedFile) {
        const candidate = vehicleHint(entry.sourceTunedFile, entry.sourceFolder)
        if (candidate && (!g.vehicleHint || (entry.sourceFolder && !g.vehicleHint.match(/^\w+ \w+/)))) {
          g.vehicleHint = candidate
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber))
  }, [manifest])

  // Apply search + stage filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter(g => {
      if (stage !== 'all' && !g.stages.has(stage)) return false
      if (!q) return true
      if (g.partNumber.toLowerCase().includes(q)) return true
      if (g.vehicleHint.toLowerCase().includes(q)) return true
      for (const sw of g.swNumbers) if (sw.toLowerCase().includes(q)) return true
      for (const v of g.variants) {
        if (v.sourceTunedFile?.toLowerCase().includes(q)) return true
        if (v.sourceFolder?.toLowerCase().includes(q)) return true   // v3.16: search folder context
      }
      return false
    })
  }, [groups, search, stage])

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
