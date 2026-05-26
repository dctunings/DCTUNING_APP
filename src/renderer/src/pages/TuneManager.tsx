import { useState, useEffect, useCallback } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Badge } from '../components/ui'
import { supabase } from '../lib/supabase'

interface TuneFile {
  id: string
  vehicle_name: string
  vehicle_vin: string | null
  file_type: 'original' | 'stage1' | 'stage2' | 'stage3' | 'custom'
  file_name: string
  file_size: number
  storage_path: string
  notes: string | null
  seller_name: string | null
  created_at: string
}

interface FleetVehicle {
  id: string
  make: string
  model: string
  year: number
  vin: string | null
}

const FILE_TYPES = [
  { value: 'original', label: 'Original Backup', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  { value: 'stage1', label: 'Stage 1', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { value: 'stage2', label: 'Stage 2', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { value: 'stage3', label: 'Stage 3', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'custom', label: 'Custom Tune', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
]

const fmtSize = (b: number) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
const tInfo = (t: string) => FILE_TYPES.find(f => f.value === t) || FILE_TYPES[0]

const iS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: '#eee', fontSize: 14, outline: 'none' }
const lS: React.CSSProperties = { fontSize: 12, color: '#aaa', marginBottom: 4, display: 'block' }
const bS: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }

interface Props {
  onOpenInRemap?: (fileName: string, fileBuffer: ArrayBuffer) => void
}

export default function TuneManager({ onOpenInRemap }: Props = {}) {
  const [files, setFiles] = useState<TuneFile[]>([])
  const [fleet, setFleet] = useState<FleetVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUp, setShowUp] = useState(false)
  const [search, setSearch] = useState('')
  const [fType, setFType] = useState('all')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [upFile, setUpFile] = useState<File | null>(null)
  const [vName, setVName] = useState('')
  const [vVin, setVVin] = useState('')
  const [fT, setFT] = useState('original')
  const [notes, setNotes] = useState('')
  const [seller, setSeller] = useState('')

  const loadFiles = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error: e } = await supabase.from('tune_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (e) throw e
      setFiles(data || [])
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  const loadFleet = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('fleet_vehicles').select('id,make,model,year,vin').eq('user_id', user.id).order('make')
      setFleet(data || [])
    } catch (_) {}
  }, [])

  useEffect(() => { loadFiles(); loadFleet() }, [loadFiles, loadFleet])
  const reset = () => { setUpFile(null); setVName(''); setVVin(''); setFT('original'); setNotes(''); setSeller(''); setShowUp(false) }

  const handleUpload = async () => {
    if (!upFile || !vName.trim() || vName === '__manual') { setError('Select a file and enter vehicle name'); return }
    setUploading(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const ext = upFile.name.split('.').pop() || 'bin'
      const sp = `vault/${user.id}/${Date.now()}_${fT}.${ext}`
      const { error: ue } = await supabase.storage.from('tune-files').upload(sp, upFile)
      if (ue) throw ue
      const { error: de } = await supabase.from('tune_files').insert({
        user_id: user.id, vehicle_name: vName.trim(), vehicle_vin: vVin.trim() || null,
        file_type: fT, file_name: upFile.name, file_size: upFile.size,
        storage_path: sp, notes: notes.trim() || null, seller_name: seller.trim() || null,
      })
      if (de) throw de
      setSuccess('File uploaded!'); reset(); setTimeout(() => setSuccess(''), 3000); loadFiles()
    } catch (e: any) { setError(e.message) } finally { setUploading(false) }
  }

  const handleDL = async (f: TuneFile) => {
    try {
      const { data, error: e } = await supabase.storage.from('tune-files').download(f.storage_path)
      if (e) throw e
      const u = URL.createObjectURL(data)
      const a = document.createElement('a'); a.href = u; a.download = f.file_name; a.click()
      URL.revokeObjectURL(u)
    } catch (e: any) { setError(e.message) }
  }

  const handleDel = async (f: TuneFile) => {
    if (!confirm('Delete ' + f.file_name + '?')) return
    try {
      await supabase.storage.from('tune-files').remove([f.storage_path])
      await supabase.from('tune_files').delete().eq('id', f.id)
      loadFiles()
    } catch (e: any) { setError(e.message) }
  }

  const filtered = files.filter(f => {
    if (fType !== 'all' && f.file_type !== fType) return false
    if (!search) return true
    const q = search.toLowerCase()
    return f.vehicle_name.toLowerCase().includes(q) || f.file_name.toLowerCase().includes(q) || (f.vehicle_vin || '').toLowerCase().includes(q) || (f.seller_name || '').toLowerCase().includes(q)
  })
  const vehs = [...new Set(files.map(f => f.vehicle_name))]

  if (loading) return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Tune File Vault" subtitle="Loading your files..." icon="" />
    </div>
  )

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader title="Tune File Vault" subtitle="Store and manage your original and tuned ECU files securely in the cloud" icon="" />
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
          {error}
          <span onClick={() => setError('')} style={{ float: 'right', cursor: 'pointer' }}>X</span>
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#34d399', fontSize: 13 }}>
          {success}
        </div>
      )}

      <Grid cols={4} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="Total Files" value={files.length} icon="" color="#00aec8" />
        <StatCard label="Originals" value={files.filter(f => f.file_type === 'original').length} icon="" color="#6b7280" />
        <StatCard label="Tuned Files" value={files.filter(f => f.file_type !== 'original').length} icon="" color="#10b981" />
        <StatCard label="Vehicles" value={vehs.length} icon="" color="#f59e0b" />
      </Grid>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search by vehicle, file, VIN or seller..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...iS, flex: 1, minWidth: 200 }} />
        <select value={fType} onChange={e => setFType(e.target.value)} style={{ ...iS, width: 'auto', minWidth: 140 }}>
          <option value="all">All Types</option>
          {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={() => setShowUp(!showUp)} style={{ ...bS, background: showUp ? '#374151' : '#00aec8', color: '#fff' }}>
          {showUp ? 'Cancel' : 'Upload File'}
        </button>
      </div>

      {showUp && (
        <Card style={{ marginBottom: 20, padding: 20 }}>
          <SectionTitle>Upload ECU File</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
            <div>
              <label style={lS}>Vehicle *</label>
              {fleet.length > 0 && (
                <select value={vName} onChange={e => {
                  const val = e.target.value
                  setVName(val)
                  const v = fleet.find(fv => `${fv.year} ${fv.make} ${fv.model}` === val)
                  if (v && v.vin) setVVin(v.vin)
                }} style={iS}>
                  <option value="">Select from fleet...</option>
                  {fleet.map(v => (
                    <option key={v.id} value={`${v.year} ${v.make} ${v.model}`}>{v.year} {v.make} {v.model}</option>
                  ))}
                  <option value="__manual">Enter manually...</option>
                </select>
              )}
              {(vName === '__manual' || fleet.length === 0) && (
                <input type="text" placeholder="e.g. 2019 VW Golf GTI"
                  value={vName === '__manual' ? '' : vName}
                  onChange={e => setVName(e.target.value)}
                  style={{ ...iS, marginTop: fleet.length > 0 ? 8 : 0 }} />
              )}
            </div>
            <div>
              <label style={lS}>VIN (optional)</label>
              <input type="text" placeholder="Vehicle VIN" value={vVin} onChange={e => setVVin(e.target.value)} style={iS} />
            </div>
            <div>
              <label style={lS}>File Type *</label>
              <select value={fT} onChange={e => setFT(e.target.value)} style={iS}>
                {FILE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lS}>Seller / Tuner (optional)</label>
              <input type="text" placeholder="Who tuned this?" value={seller} onChange={e => setSeller(e.target.value)} style={iS} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lS}>Notes (optional)</label>
              <input type="text" placeholder="e.g. Stage 1 95RON, DPF delete" value={notes} onChange={e => setNotes(e.target.value)} style={iS} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lS}>ECU File *</label>
              <input type="file" onChange={e => setUpFile(e.target.files?.[0] || null)} style={{ ...iS, padding: 8 }} />
              {upFile && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{upFile.name} ({fmtSize(upFile.size)})</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button onClick={handleUpload} disabled={uploading}
              style={{ ...bS, background: '#10b981', color: '#fff', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading...' : 'Upload to Vault'}
            </button>
            <button onClick={reset} style={{ ...bS, background: '#374151', color: '#ccc' }}>Cancel</button>
          </div>
        </Card>
      )}

      {vehs.length > 0 && filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {vehs.filter(v => filtered.some(f => f.vehicle_name === v)).map(vehicle => (
            <div key={vehicle}>
              <SectionTitle>{vehicle}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.filter(f => f.vehicle_name === vehicle).map(file => {
                  const info = tInfo(file.file_type)
                  return (
                    <Card key={file.id} style={{ padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: info.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: info.color, flexShrink: 0 }}>
                          {info.label.charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#eee' }}>{file.file_name}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                            {fmtSize(file.file_size)} &middot; {fmtDate(file.created_at)}
                            {file.vehicle_vin && <span> &middot; VIN: {file.vehicle_vin}</span>}
                            {file.seller_name && <span> &middot; Tuner: {file.seller_name}</span>}
                          </div>
                          {file.notes && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{file.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <Badge color={info.color} bg={info.bg}>{info.label}</Badge>
                          <button onClick={() => handleDL(file)}
                            style={{ ...bS, background: 'rgba(0,174,200,0.12)', color: '#00aec8', padding: '6px 12px', fontSize: 11 }}>
                            Download
                          </button>
                          <button onClick={() => handleDel(file)}
                            style={{ ...bS, background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '6px 12px', fontSize: 11 }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>Vault</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#ccc', marginBottom: 8 }}>
              {search || fType !== 'all' ? 'No files match your search' : 'Your vault is empty'}
            </div>
            <div style={{ fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto' }}>
              Upload your original ECU backup and tuned files here. They are stored securely in the cloud and only you can access them.
            </div>
            {!showUp && (
              <button onClick={() => setShowUp(true)}
                style={{ ...bS, background: '#00aec8', color: '#fff', marginTop: 16 }}>
                Upload Your First File
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
