import { useState, useEffect, useCallback, useRef } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { useAuth } from '../lib/useAuth'
import LoginScreen from '../components/LoginScreen'
import { supabase } from '../lib/supabase'

interface TuneRecord {
  id: string
  filename: string
  vehicle_make: string
  vehicle_model: string
  vehicle_variant: string
  engine_code: string
  ecu: string
  tune_type: string
  notes: string
  file_path: string
  file_size: number
  created_at: string
}

const TYPE_COLORS: Record<string, string> = {
  stage1:  'var(--accent)',
  stage2:  '#ff9500',
  stage3:  '#ff4500',
  dpf:     '#888',
  egr:     '#888',
  adblue:  '#888',
  custom:  '#88aaff',
  stock:   'var(--text-muted)',
}

const TYPE_LABELS: Record<string, string> = {
  stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3',
  dpf: 'DPF Delete', egr: 'EGR Delete', adblue: 'AdBlue Delete',
  custom: 'Custom', stock: 'Stock Backup',
}

export default function TuneManager({ activeVehicle }: { activeVehicle: ActiveVehicle | null }) {
  const { user, isAdmin, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const [tunes, setTunes] = useState<TuneRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<TuneRecord | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'cloud' | 'library' | 'local' | 'watch'>('library')
  const [localFiles, setLocalFiles] = useState<{ name: string; size: number; path: string }[]>([])
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Library state
  const [libResults, setLibResults] = useState<any[]>([])
  const [libLoading, setLibLoading] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [libMake, setLibMake] = useState('')
  const [libTotal, setLibTotal] = useState(0)
  const [libPage, setLibPage] = useState(0)
  const LIB_PAGE_SIZE = 50
  // Watch folder state
  const [watchFolder, setWatchFolder] = useState<string | null>(null)
  const [watchedFiles, setWatchedFiles] = useState<{ name: string; path: string; size: number; mtime: string }[]>([])
  const [watching, setWatching] = useState(false)
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTunes = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')

    // Try to fetch from tunes table
    const { data, error: dbError } = await supabase
      .from('tunes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (dbError) {
      // Table may not exist yet — show helpful message
      if (dbError.code === '42P01') {
        setError('tunes_table_missing')
      } else {
        setError(dbError.message)
      }
    } else {
      setTunes(data || [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (user) fetchTunes()
  }, [user, fetchTunes])

  const openLocalFile = async () => {
    const result = await (window as any).api?.openEcuFile()
    if (result) {
      setLocalFiles((f) => [...f, result])
      setTab('local')
    }
  }

  const pickWatchFolder = async () => {
    const api = (window as any).api
    const folder = api?.selectWatchFolder ? await api.selectWatchFolder() : null
    if (!folder) return
    setWatchFolder(folder)
    setWatching(true)
    await refreshWatchedFiles(folder)
  }

  const refreshWatchedFiles = async (folder?: string) => {
    const target = folder ?? watchFolder
    if (!target) return
    const api = (window as any).api
    const files = api?.scanFolderForBins ? await api.scanFolderForBins(target) : []
    setWatchedFiles(files)
  }

  const searchLibrary = useCallback(async (page = 0) => {
    setLibLoading(true)
    let query = supabase
      .from('library_entries')
      .select('id,vehicle_make,vehicle_model,vehicle_fuel,remap_type,original_file_name,original_file_path,original_file_size,ecu_type,storage_path,storage_uploaded', { count: 'exact' })
      .range(page * LIB_PAGE_SIZE, (page + 1) * LIB_PAGE_SIZE - 1)

    if (libMake) query = query.ilike('vehicle_make', `%${libMake}%`)
    if (libSearch) {
      query = query.or(
        `vehicle_make.ilike.%${libSearch}%,vehicle_model.ilike.%${libSearch}%,original_file_name.ilike.%${libSearch}%,remap_type.ilike.%${libSearch}%,ecu_type.ilike.%${libSearch}%`
      )
    }
    query = query.order('vehicle_make').order('vehicle_model')

    const { data, count, error } = await query
    if (!error) {
      setLibResults(data || [])
      setLibTotal(count || 0)
      setLibPage(page)
    }
    setLibLoading(false)
  }, [libSearch, libMake])

  useEffect(() => {
    if (tab === 'library') searchLibrary(0)
  }, [tab, libSearch, libMake])

  const clearWatchFolder = () => {
    if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
    setWatchFolder(null)
    setWatchedFiles([])
    setWatching(false)
  }

  // Poll watched folder every 3 seconds when active
  useEffect(() => {
    if (!watchFolder) return
    watchIntervalRef.current = setInterval(() => refreshWatchedFiles(), 3000)
    return () => { if (watchIntervalRef.current) clearInterval(watchIntervalRef.current) }
  }, [watchFolder])

  const downloadTune = async (tune: TuneRecord) => {
    if (!tune.file_path) return
    setDownloading(tune.id)
    try {
      const { data, error } = await supabase.storage
        .from('tunes')
        .download(tune.file_path)
      if (error) throw error
      const buffer = await data.arrayBuffer()
      const api = (window as any).api
      if (api?.saveEcuFile) {
        await api.saveEcuFile(buffer, tune.filename)
      } else {
        const blob = new Blob([buffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = tune.filename; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e: any) {
      alert(`Download failed: ${e.message}`)
    }
    setDownloading(null)
  }

  const downloadLibraryFile = async (entry: any) => {
    const storagePath = entry.storage_path || entry.original_file_name
    if (!storagePath) return
    setDownloading(entry.id)
    try {
      const { data, error } = await supabase.storage
        .from('tune-files')
        .download(storagePath)
      if (error) throw error
      const buffer = await data.arrayBuffer()
      const filename = entry.original_file_name || entry.storage_path
      const api = (window as any).api
      if (api?.saveEcuFile) {
        await api.saveEcuFile(buffer, filename)
      } else {
        const blob = new Blob([buffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e: any) {
      alert(`Download failed: ${e.message}`)
    }
    setDownloading(null)
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Auth loading
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 32 }}>⏳</div>
        <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return <LoginScreen signIn={signIn} signUp={signUp} />
  }

  // Admin badge shown in header

  const filteredCloud = tunes.filter((t) =>
    [t.filename, t.vehicle_make, t.vehicle_model, t.ecu, t.notes].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
        <div style={{ flex: 1 }}>
          <h1>Tune Manager</h1>
        </div>
        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAdmin && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: 'rgba(184,240,42,0.15)', color: 'var(--accent)', border: '1px solid rgba(184,240,42,0.3)', letterSpacing: '0.5px' }}>
              ADMIN
            </span>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{user.user_metadata?.full_name || user.email}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      {/* Tabs + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['library', 'cloud', 'local', 'watch'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '7px 16px',
                background: tab === t ? 'var(--accent-dim)' : 'var(--bg-card)',
                border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6,
                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'Manrope, sans-serif',
                position: 'relative' as const,
              }}
            >
              {t === 'library'
                ? `Library (${libTotal > 0 ? libTotal.toLocaleString() : '38k+'})`
                : t === 'cloud'
                ? `My Tunes (${tunes.length})`
                : t === 'local'
                ? `Local (${localFiles.length})`
                : <>
                    Watch Folder
                    {watching && <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--accent)', marginLeft: 6, verticalAlign: 'middle',
                      boxShadow: '0 0 6px var(--accent)',
                    }} />}
                  </>
              }
            </button>
          ))}
        </div>

        {tab === 'library' ? (
          <>
            <input
              value={libMake}
              onChange={(e) => setLibMake(e.target.value)}
              placeholder="Make (e.g. BMW)"
              style={{ width: 130, height: 34 }}
            />
            <input
              value={libSearch}
              onChange={(e) => setLibSearch(e.target.value)}
              placeholder="Model / filename / type..."
              style={{ flex: 1, minWidth: 120, height: 34 }}
            />
          </>
        ) : (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tunes..."
            style={{ flex: 1, minWidth: 120, height: 34 }}
          />
        )}

        {tab === 'cloud' && (
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={fetchTunes} disabled={loading}>
            Refresh
          </button>
        )}
        {tab === 'local' && (
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={openLocalFile}>
            Open File
          </button>
        )}
        {tab === 'watch' && !watchFolder && (
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={pickWatchFolder}>
            Set Watch Folder
          </button>
        )}
        {tab === 'watch' && watchFolder && (
          <>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => refreshWatchedFiles()}>
              Scan Now
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={clearWatchFolder}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Error states */}
      {error === 'tunes_table_missing' && (
        <div className="banner banner-warning" style={{ marginBottom: 16 }}>
          <strong>Tunes table not set up yet.</strong> Run the following SQL in your Supabase dashboard to create it:
          <pre style={{ marginTop: 10, fontSize: 11, background: '#1a1a1a', padding: 12, borderRadius: 6, overflowX: 'auto' }}>{`CREATE TABLE tunes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  vehicle_make text, vehicle_model text, vehicle_variant text,
  engine_code text, ecu text,
  tune_type text DEFAULT 'custom',
  notes text,
  file_path text,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tunes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own tunes" ON tunes FOR ALL USING (auth.uid() = user_id);`}</pre>
        </div>
      )}
      {error && error !== 'tunes_table_missing' && (
        <div className="banner banner-danger" style={{ marginBottom: 16 }}>⚠ {error}</div>
      )}

      <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>
        {/* File list */}
        <div>
          {tab === 'library' && (
            <>
              {/* Stats bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{libTotal.toLocaleString()} entries in library</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {libPage > 0 && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => searchLibrary(libPage - 1)}>← Prev</button>
                  )}
                  <span>Page {libPage + 1} of {Math.ceil(libTotal / LIB_PAGE_SIZE)}</span>
                  {(libPage + 1) * LIB_PAGE_SIZE < libTotal && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => searchLibrary(libPage + 1)}>Next →</button>
                  )}
                </div>
              </div>

              {libLoading && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  ⏳ Searching library...
                </div>
              )}

              {!libLoading && libResults.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>No results</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Try a different make or model</div>
                </div>
              )}

              {!libLoading && libResults.map((entry) => (
                <div key={entry.id} className="card" style={{ marginBottom: 6, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {entry.vehicle_make} {entry.vehicle_model}
                        {entry.vehicle_fuel && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}> · {entry.vehicle_fuel}</span>}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.original_file_name}
                      </div>
                      {entry.ecu_type && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{entry.ecu_type}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: 'var(--accent-dim)', color: 'var(--accent)',
                        border: '1px solid rgba(0,174,200,0.2)',
                        display: 'inline-block',
                      }}>
                        {entry.remap_type || 'Tune'}
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {entry.original_file_size ? `${Math.round(entry.original_file_size / 1024)} KB` : '—'}
                      </div>
                      {(entry.storage_uploaded || isAdmin) && (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 10, padding: '3px 10px', marginTop: 2 }}
                          onClick={() => downloadLibraryFile(entry)}
                          disabled={downloading === entry.id}
                        >
                          {downloading === entry.id ? '⏳' : '⬇ Download'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'cloud' && (
            <>
              {loading && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  ⏳ Loading tunes from Supabase...
                </div>
              )}

              {!loading && filteredCloud.length === 0 && !error && (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>No tunes found</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Tunes uploaded to your account will appear here
                  </div>
                </div>
              )}

              {filteredCloud.map((t) => (
                <div
                  key={t.id}
                  className="card"
                  onClick={() => setSelected(t)}
                  style={{
                    marginBottom: 8, cursor: 'pointer',
                    borderColor: selected?.id === t.id ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.filename}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {t.vehicle_make} {t.vehicle_model} {t.vehicle_variant}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {t.engine_code && <span style={{ fontFamily: 'monospace' }}>{t.engine_code} · </span>}
                        {t.ecu}
                      </div>
                      {t.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t.notes}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className="badge" style={{
                        background: 'var(--bg-secondary)',
                        color: TYPE_COLORS[t.tune_type] || 'var(--text-muted)',
                        border: `1px solid ${TYPE_COLORS[t.tune_type] || 'var(--border)'}`,
                        display: 'block', marginBottom: 6,
                      }}>
                        {TYPE_LABELS[t.tune_type] || t.tune_type}
                      </span>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatSize(t.file_size)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(t.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'local' && (
            <>
              {localFiles.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>No local files open</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Open a .bin or .hex file from your computer
                  </div>
                  <button className="btn btn-primary" onClick={openLocalFile}>Open File</button>
                </div>
              ) : (
                localFiles.map((f, i) => (
                  <div key={i} className="card" style={{ marginBottom: 8 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', marginBottom: 4 }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatSize(f.size)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }}>Write to ECU</button>
                      <button className="btn btn-secondary" style={{ fontSize: 11 }}>Inspect</button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── WATCH FOLDER TAB ─────────────────────────────── */}
          {tab === 'watch' && (
            <>
              {!watchFolder ? (
                <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 16 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Watch Folder — Auto Import</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 380, margin: '0 auto 20px' }}>
                    Point to the output folder of your tuning tool (KESS3, K-TAG, Flex, Autotuner, KT200, PCMFlash…).
                    DCTuning will scan it every 3 seconds and show any new .bin / .hex / .ori / .sgo files instantly.
                  </div>
                  <button className="btn btn-primary" onClick={pickWatchFolder}>Set Watch Folder</button>
                </div>
              ) : (
                <>
                  {/* Folder info bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: 'rgba(0,174,200,0.05)', border: '1px solid rgba(0,174,200,0.15)',
                    borderRadius: 10, marginBottom: 14, flexWrap: 'wrap',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {watchFolder}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {watchedFiles.length} file{watchedFiles.length !== 1 ? 's' : ''} · scanning every 3s
                    </span>
                  </div>

                  {/* Supported formats legend */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                    {['.bin', '.hex', '.ori', '.sgo', '.damos', '.kp', '.frf', '.mot', '.srec'].map((ext) => (
                      <span key={ext} style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', fontFamily: 'monospace',
                      }}>{ext}</span>
                    ))}
                  </div>

                  {watchedFiles.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        No ECU files found yet. Use your tuning tool to read an ECU — the file will appear here automatically.
                      </div>
                    </div>
                  ) : (
                    watchedFiles
                      .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
                      .map((f, i) => {
                        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
                        const isNew = Date.now() - new Date(f.mtime).getTime() < 60_000 // less than 1 min old
                        return (
                          <div key={i} className="card" style={{
                            marginBottom: 8,
                            borderColor: isNew ? 'rgba(0,174,200,0.3)' : 'var(--border)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{f.name}</span>
                                  {isNew && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,174,200,0.12)', border: '1px solid rgba(0,174,200,0.25)', color: 'var(--accent)', textTransform: 'uppercase' }}>
                                      New
                                    </span>
                                  )}
                                  <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    .{ext}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {f.path}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{formatSize(f.size)}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {new Date(f.mtime).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button
                                className="btn btn-primary"
                                style={{ flex: 1, fontSize: 11 }}
                                onClick={() => {
                                  setLocalFiles((prev) => {
                                    if (prev.some((lf) => lf.path === f.path)) return prev
                                    return [...prev, { name: f.name, size: f.size, path: f.path }]
                                  })
                                  setTab('local')
                                }}
                              >
                                Open in Local
                              </button>
                              <button className="btn btn-secondary" style={{ fontSize: 11 }}>Inspect Hex</button>
                            </div>
                          </div>
                        )
                      })
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selected && tab === 'cloud' ? (
          <div className="card card-accent" style={{ position: 'sticky', top: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>Tune Details</div>

            {[
              { label: 'Filename',  value: selected.filename,                     mono: true },
              { label: 'Vehicle',   value: `${selected.vehicle_make} ${selected.vehicle_model} ${selected.vehicle_variant}` },
              { label: 'Engine',    value: selected.engine_code || '—',            mono: true },
              { label: 'ECU',       value: selected.ecu || '—' },
              { label: 'Type',      value: TYPE_LABELS[selected.tune_type] || selected.tune_type },
              { label: 'Size',      value: formatSize(selected.file_size) },
              { label: 'Uploaded',  value: formatDate(selected.created_at) },
              { label: 'Notes',     value: selected.notes || '—' },
            ].map((f) => (
              <div key={f.label} style={{ marginBottom: 12 }}>
                <label>{f.label}</label>
                <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-primary)', fontFamily: f.mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
                  {f.value}
                </div>
              </div>
            ))}

            <div className="divider" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => downloadTune(selected)}
                disabled={!!downloading}
              >
                {downloading === selected.id ? '⏳ Downloading...' : '⬇ Download'}
              </button>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>✕</button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 32 }}>📁</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a tune to view details</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 200 }}>
              Or open a local .bin / .hex file using the button above
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
