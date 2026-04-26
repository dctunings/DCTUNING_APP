import { useState, useEffect, useRef } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { useAuth } from '../lib/useAuth'
import LoginScreen from '../components/LoginScreen'
import RecipeBrowserTab from '../components/RecipeBrowserTab'

interface TuneManagerProps {
  activeVehicle: ActiveVehicle | null
  // v3.16: lift watched files into Remap Builder so the AutoTuner workflow
  // is one click. Customer's tool drops file in folder → Watch Folder picks
  // it up → "Tune" button → Remap Builder loads it → apply Stage 1 → done.
  onOpenInRemap?: (fileName: string, buffer: ArrayBuffer) => void
}

export default function TuneManager({ activeVehicle, onOpenInRemap }: TuneManagerProps) {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth()
  const [search, setSearch] = useState('')
  // v3.16: tab union narrowed to the live tabs only.
  //   'watch'   — Watch Folder for AutoTuner-style integrations (default flow)
  //   'local'   — one-off file uploads
  //   'library' — Recipe Browser (3,138-recipe catalog, see RecipeBrowserTab)
  const [tab, setTab] = useState<'local' | 'watch' | 'library'>('watch')
  const [localFiles, setLocalFiles] = useState<{ name: string; size: number; path: string }[]>([])
  // Watch folder state
  const [watchFolder, setWatchFolder] = useState<string | null>(null)
  const [watchedFiles, setWatchedFiles] = useState<{ name: string; path: string; size: number; mtime: string }[]>([])
  const [watching, setWatching] = useState(false)
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Browser File System Access API handle (when not in Electron)
  const watchFolderHandleRef = useRef<any>(null)
  // Hex inspector state
  const [hexInspect, setHexInspect] = useState<{ name: string; bytes: number[]; size: number } | null>(null)
  const [hexInspecting, setHexInspecting] = useState<string | null>(null) // path currently loading

  const ECU_EXTS = new Set(['bin', 'hex', 'ori', 'sgo', 'damos', 'kp', 'frf', 'mot', 'srec'])

  const openLocalFile = async () => {
    const electronApi = (window as any).api

    if (electronApi?.openEcuFile) {
      // ── Electron desktop path ──────────────────────────────────────────────
      const result = await electronApi.openEcuFile()
      if (result) {
        setLocalFiles((f) => [...f, result])
        setTab('local')
      }
    } else {
      // ── Browser fallback — hidden file input ───────────────────────────────
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.bin,.hex,.ori,.sgo,.damos,.kp,.frf,.mot,.srec'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        setLocalFiles((f) => [...f, { name: file.name, size: file.size, path: file.name }])
        setTab('local')
      }
      input.click()
    }
  }

  // Browser: scan directory handle for ECU files
  const scanDirHandle = async (handle: any): Promise<{ name: string; path: string; size: number; mtime: string }[]> => {
    const results: { name: string; path: string; size: number; mtime: string }[] = []
    for await (const [name, fh] of handle.entries()) {
      if (fh.kind !== 'file') continue
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (!ECU_EXTS.has(ext)) continue
      try {
        const file: File = await fh.getFile()
        results.push({ name, path: name, size: file.size, mtime: new Date(file.lastModified).toISOString() })
      } catch { /* skip locked files */ }
    }
    return results.sort((a, b) => b.mtime.localeCompare(a.mtime))
  }

  const pickWatchFolder = async () => {
    const electronApi = (window as any).api

    if (electronApi?.selectWatchFolder) {
      // ── Electron path ──────────────────────────────────────────────────────
      const folder = await electronApi.selectWatchFolder()
      if (!folder) return
      watchFolderHandleRef.current = null
      setWatchFolder(folder)
      setWatching(true)
      await refreshWatchedFiles(folder)
    } else if ('showDirectoryPicker' in window) {
      // ── Browser File System Access API (Chrome/Edge/Brave) ─────────────────
      try {
        const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
        watchFolderHandleRef.current = handle
        setWatchFolder(handle.name)
        setWatching(true)
        const files = await scanDirHandle(handle)
        setWatchedFiles(files)
      } catch {
        // User cancelled picker — no-op
      }
    } else {
      alert('Watch Folder requires the DCTuning desktop app or a modern Chromium-based browser (Chrome / Edge / Brave).')
    }
  }

  const refreshWatchedFiles = async (folder?: string) => {
    // Browser handle path
    if (watchFolderHandleRef.current) {
      const files = await scanDirHandle(watchFolderHandleRef.current)
      setWatchedFiles(files)
      return
    }
    // Electron path
    const target = folder ?? watchFolder
    if (!target) return
    const electronApi = (window as any).api
    const files = electronApi?.scanFolderForBins ? await electronApi.scanFolderForBins(target) : []
    setWatchedFiles(files)
  }

  const clearWatchFolder = () => {
    if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
    watchFolderHandleRef.current = null
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

  const formatSize = (bytes: number) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
        <div style={{ flex: 1 }}>
          <h1>Tune Manager</h1>
        </div>
        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          {(['watch', 'local', 'library'] as const).map((t) => (
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
              {t === 'local'
                ? `Local (${localFiles.length})`
                : t === 'library'
                ? 'Recipe Library'
                : <>
                    Watch Folder ({watchedFiles.length})
                    {watching && <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--accent)', marginLeft: 6, verticalAlign: 'middle',
                      boxShadow: '0 0 6px var(--accent)',
                      animation: 'pulse 1.6s ease-in-out infinite',
                    }} />}
                  </>
              }
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files..."
          style={{ flex: 1, minWidth: 120, height: 34 }}
        />

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

      <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>
        {/* File list */}
        <div>
          {tab === 'library' && <RecipeBrowserTab />}

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
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11 }}
                        disabled={hexInspecting === f.path}
                        onClick={async () => {
                          const api = (window as any).api
                          setHexInspecting(f.path)
                          try {
                            // Desktop path — IPC reads first N bytes from disk by path
                            if (api?.readFileBytes) {
                              const res = await api.readFileBytes(f.path, 1024)
                              if (res?.ok) {
                                setHexInspect({ name: f.name, bytes: res.bytes, size: res.size })
                              }
                              return
                            }
                            // Web path — re-resolve the File from the watch folder handle
                            // (plain HTML file picker doesn't give us a re-readable handle,
                            //  but File System Access API directory handles do)
                            const dirHandle = watchFolderHandleRef.current
                            if (!dirHandle) return
                            try {
                              const fh = await dirHandle.getFileHandle(f.name)
                              const file = await fh.getFile()
                              const buf = await file.slice(0, 1024).arrayBuffer()
                              const bytes = Array.from(new Uint8Array(buf))
                              setHexInspect({ name: f.name, bytes, size: file.size })
                            } catch {
                              // File no longer in folder, or permission lapsed
                            }
                          } finally {
                            setHexInspecting(null)
                          }
                        }}
                      >
                        {hexInspecting === f.path ? '…' : 'Inspect'}
                      </button>
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
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 16px' }}>
                    Point to the output folder of your tuning tool. DCTuning scans it every 3 seconds and shows any
                    new .bin / .hex / .ori / .sgo / .damos files instantly.
                  </div>
                  {/* Tool folder path hints */}
                  <div style={{ maxWidth: 460, margin: '0 auto 20px', textAlign: 'left' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Common tool output folders:
                    </div>
                    {[
                      { tool: 'Autotuner Tool',       path: 'C:\\Autotuner\\Files' },
                      { tool: 'KESS3 / KSuite 3',     path: 'C:\\MyFiles\\Kess3' },
                      { tool: 'K-TAG / KSuite 2',     path: 'C:\\MyFiles\\Ktag' },
                      { tool: 'Flex (Magic Motorsp.)', path: '%AppData%\\MagicMM\\FlexSuite' },
                      { tool: 'CMDFlash',              path: 'C:\\CMDFlash\\Backup' },
                      { tool: 'BFlash',                path: 'C:\\BFlash\\Files' },
                      { tool: 'PCMTuner (Scanmatik)',  path: 'C:\\PCMTuner\\Files' },
                      { tool: 'KT200 / KT200 Plus',   path: 'C:\\KT200\\USER' },
                      { tool: 'Autoflasher',           path: 'C:\\Autoflasher\\Files' },
                    ].map(({ tool, path }) => (
                      <div key={tool} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 160, flexShrink: 0 }}>{tool}</span>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--accent)', opacity: 0.8, wordBreak: 'break-all' }}>{path}</span>
                      </div>
                    ))}
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
                                onClick={async () => {
                                  // Load the file content + ship to Remap Builder.
                                  // Web-mode uses File System Access API to re-resolve;
                                  // Electron uses readFileBytes via IPC.
                                  if (!onOpenInRemap) return
                                  const api = (window as any).api
                                  let buf: ArrayBuffer | null = null
                                  if (api?.readFileBytes) {
                                    const r = await api.readFileBytes(f.path, f.size)
                                    if (r?.ok) buf = new Uint8Array(r.bytes).buffer
                                  } else {
                                    const dirHandle = watchFolderHandleRef.current
                                    if (dirHandle) {
                                      try {
                                        const fh = await dirHandle.getFileHandle(f.name)
                                        const file = await fh.getFile()
                                        buf = await file.arrayBuffer()
                                      } catch { /* permission lapsed */ }
                                    }
                                  }
                                  if (buf) onOpenInRemap(f.name, buf)
                                }}
                              >
                                🚀 Tune in Remap Builder
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 11 }}
                                disabled={hexInspecting === f.path}
                                onClick={async () => {
                                  const api = (window as any).api
                                  if (!api?.readFileBytes) return
                                  setHexInspecting(f.path)
                                  const res = await api.readFileBytes(f.path, 1024)
                                  setHexInspecting(null)
                                  if (res?.ok) {
                                    setHexInspect({ name: f.name, bytes: res.bytes, size: res.size })
                                  }
                                }}
                              >
                                {hexInspecting === f.path ? '…' : 'Inspect Hex'}
                              </button>
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

        {/* Detail panel — placeholder for future hex viewer / file actions */}
        <div className="card" style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 32 }}>📁</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {tab === 'library' ? 'Browse the recipe catalog' :
             tab === 'watch'   ? 'Watch Folder auto-imports new tune files' :
                                 'Open a local .bin / .hex file using the button above'}
          </div>
        </div>
      </div>

      {/* ── HEX INSPECTOR MODAL ─────────────────────────────────────────────── */}
      {hexInspect && (() => {
        const { name, bytes, size } = hexInspect
        const bytesPerRow = 16
        const rows: number[][] = []
        for (let i = 0; i < bytes.length; i += bytesPerRow) {
          rows.push(bytes.slice(i, i + bytesPerRow))
        }
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
            onClick={() => setHexInspect(null)}
          >
            <div
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, width: '100%', maxWidth: 780,
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {(size / 1024).toFixed(1)} KB total · showing first {bytes.length} bytes
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setHexInspect(null)}>✕ Close</button>
              </div>

              {/* Hex grid */}
              <div style={{ overflowY: 'auto', padding: '14px 18px' }}>
                {/* Column headers */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.2)', minWidth: 72 }}>Offset</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.2)', flex: 1 }}>
                    {Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.2)', minWidth: 24, marginLeft: 12 }}>ASCII</span>
                </div>

                {rows.map((row, rowIdx) => {
                  const baseOffset = rowIdx * bytesPerRow
                  const hexCells = row.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
                  const ascii = row.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('')
                  return (
                    <div key={rowIdx} style={{ display: 'flex', gap: 0, lineHeight: '1.85', fontFamily: 'monospace', fontSize: 12 }}>
                      <span style={{ color: 'rgba(255,255,255,.25)', minWidth: 72, flexShrink: 0 }}>
                        {('0x' + baseOffset.toString(16).toUpperCase().padStart(6, '0'))}
                      </span>
                      <span style={{ color: 'var(--text-primary)', flex: 1, wordSpacing: 2 }}>{hexCells}</span>
                      <span style={{ color: 'rgba(255,255,255,.35)', marginLeft: 12, minWidth: 18, letterSpacing: 1 }}>{ascii}</span>
                    </div>
                  )
                })}

                {size > bytes.length && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,.04)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    … {((size - bytes.length) / 1024).toFixed(1)} KB more not shown (file is {(size / 1024).toFixed(1)} KB total)
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
