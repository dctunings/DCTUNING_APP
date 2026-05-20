import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FleetVehicle, FleetSummary, CreateVehicleInput, ServiceRecord } from '../lib/fleet'
import {
  getAllVehicles,
  searchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getFleetSummary,
  exportFleetToCSV,
  addServiceRecord,
  getServiceHistory,
} from '../lib/fleet'

// ── SVG Icons ─────────────────────────────────────────────────────
const Icons = {
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  car: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>,
  wrench: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  cloud: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>,
  cloudOff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22.61 16.95A5 5 0 0018 10h-1.26a8 8 0 00-11.62-5.28M2 2l20 20"/><path d="M8.58 8.58A8 8 0 009 20h9a5 5 0 001.7-.3"/></svg>,
}

// ── Status Helpers ────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  healthy:  { label: 'Healthy',  color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  dot: '#4ade80' },
  warning:  { label: 'Warning',  color: '#facc15', bg: 'rgba(250,204,21,0.1)',  dot: '#facc15' },
  error:    { label: 'Error',    color: '#f87171', bg: 'rgba(248,113,113,0.1)',  dot: '#f87171' },
  offline:  { label: 'Offline',  color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  dot: '#9ca3af' },
}

// ── Main Component ────────────────────────────────────────────────
export default function FleetDashboard() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [summary, setSummary] = useState<FleetSummary | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'odometer' | 'lastService'>('name')
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'syncing'>('syncing')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null)
  const [detailVehicle, setDetailVehicle] = useState<FleetVehicle | null>(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [serviceVehicle, setServiceVehicle] = useState<FleetVehicle | null>(null)

  // Load data
  const loadData = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const all = await getAllVehicles()
      setVehicles(all)
      const s = await getFleetSummary()
      setSummary(s)
      setSyncStatus('online')
    } catch (e) {
      console.error('Fleet load error:', e)
      setSyncStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered & sorted vehicles
  const filteredVehicles = useMemo(() => {
    let result = searchQuery.trim()
      ? vehicles.filter(v =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.vin.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.ownerName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [...vehicles]

    if (statusFilter !== 'all') {
      result = result.filter(v => v.status === statusFilter)
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name)
        case 'status': return a.status.localeCompare(b.status)
        case 'odometer': return b.odometer - a.odometer
        case 'lastService': return (b.lastServiceDate || '').localeCompare(a.lastServiceDate || '')
        default: return 0
      }
    })
    return result
  }, [vehicles, searchQuery, statusFilter, sortBy])

  // Handlers
  const handleAdd = async (data: CreateVehicleInput) => {
    try {
      setSyncStatus('syncing')
      await createVehicle(data)
      await loadData()
      setShowAddModal(false)
    } catch (e) {
      alert('Error adding vehicle: ' + (e as Error).message)
      setSyncStatus('offline')
    }
  }

  const handleUpdate = async (id: string, data: Partial<CreateVehicleInput>) => {
    try {
      setSyncStatus('syncing')
      await updateVehicle(id, data)
      await loadData()
      setEditingVehicle(null)
    } catch (e) {
      alert('Error updating vehicle: ' + (e as Error).message)
      setSyncStatus('offline')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vehicle permanently?')) return
    try {
      setSyncStatus('syncing')
      await deleteVehicle(id)
      await loadData()
    } catch (e) {
      alert('Error deleting vehicle: ' + (e as Error).message)
      setSyncStatus('offline')
    }
  }

  const handleExportCSV = () => {
    const csv = exportFleetToCSV(filteredVehicles)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fleet-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddService = async (vehicleId: string, record: Omit<ServiceRecord, 'id'>) => {
    try {
      setSyncStatus('syncing')
      await addServiceRecord(vehicleId, record)
      await loadData()
      setShowServiceModal(false)
      setServiceVehicle(null)
    } catch (e) {
      alert('Error adding service record: ' + (e as Error).message)
      setSyncStatus('offline')
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading fleet data...</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🚗 Fleet Dashboard</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Manage your customer vehicle fleet
            {syncStatus === 'online' && <span style={{ color: '#4ade80', marginLeft: 8 }}>● Cloud synced</span>}
            {syncStatus === 'offline' && <span style={{ color: '#f87171', marginLeft: 8 }}>● Offline (local only)</span>}
            {syncStatus === 'syncing' && <span style={{ color: '#facc15', marginLeft: 8 }}>● Syncing...</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExportCSV} style={btnStyle('secondary')}>
            {Icons.download} Export CSV
          </button>
          <button onClick={() => setShowAddModal(true)} style={btnStyle('primary')}>
            {Icons.plus} Add Vehicle
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Total Vehicles" value={summary.totalVehicles} color="#60a5fa" />
          <SummaryCard label="Healthy" value={summary.healthyCount} color="#4ade80" />
          <SummaryCard label="Warning" value={summary.warningCount} color="#facc15" />
          <SummaryCard label="Error" value={summary.errorCount} color="#f87171" />
          <SummaryCard label="Offline" value={summary.offlineCount} color="#9ca3af" />
          <SummaryCard label="Service Due" value={summary.serviceDueCount} color="#f97316" />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '8px 14px', borderRadius: 8, flex: 1, minWidth: 200 }}>
          {Icons.search}
          <input
            type="text"
            placeholder="Search by name, make, model, VIN, plate, owner..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 13, width: '100%' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="offline">Offline</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={selectStyle}>
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
          <option value="odometer">Sort: Odometer</option>
          <option value="lastService">Sort: Last Service</option>
        </select>
      </div>

      {/* Vehicle List */}
      {filteredVehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚗</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No vehicles found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add a vehicle to get started</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredVehicles.map(v => {
            const cfg = statusConfig[v.status] || statusConfig.offline
            return (
              <div
                key={v.id}
                onClick={() => setDetailVehicle(v)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto auto',
                  alignItems: 'center',
                  gap: 16,
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  borderLeft: `3px solid ${cfg.dot}`,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                <div style={{ color: 'var(--muted)' }}>{Icons.car}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {v.year} {v.make} {v.model} · VIN: {v.vin.slice(0, 17)} {v.licensePlate ? `· Plate: ${v.licensePlate}` : ''}
                  </div>
                  {v.ownerName && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      👤 {v.ownerName} {v.ownerPhone} {v.ownerEmail}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.odometer.toLocaleString()} km</div>
                <div style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color }}>
                  {cfg.label}
                </div>
                <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setServiceVehicle(v); setShowServiceModal(true) }} style={iconBtnStyle} title="Add Service Record">{Icons.wrench}</button>
                  <button onClick={() => setEditingVehicle(v)} style={iconBtnStyle} title="Edit">{Icons.edit}</button>
                  <button onClick={() => handleDelete(v.id)} style={iconBtnStyle} title="Delete">{Icons.trash}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddModal && (
        <VehicleModal
          title="Add Vehicle"
          onSave={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Vehicle Modal */}
      {editingVehicle && (
        <VehicleModal
          title="Edit Vehicle"
          vehicle={editingVehicle}
          onSave={(data) => handleUpdate(editingVehicle.id, data)}
          onClose={() => setEditingVehicle(null)}
        />
      )}

      {/* Vehicle Detail Modal */}
      {detailVehicle && (
        <DetailModal
          vehicle={detailVehicle}
          onClose={() => setDetailVehicle(null)}
          onEdit={() => { setDetailVehicle(null); setEditingVehicle(detailVehicle) }}
          onAddService={() => { setServiceVehicle(detailVehicle); setShowServiceModal(true) }}
        />
      )}

      {/* Service Record Modal */}
      {showServiceModal && serviceVehicle && (
        <ServiceModal
          vehicle={serviceVehicle}
          onSave={(record) => handleAddService(serviceVehicle.id, record)}
          onClose={() => { setShowServiceModal(false); setServiceVehicle(null) }}
        />
      )}
    </div>
  )
}

// ── Sub-Components ────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 16, textAlign: 'center', borderTop: `2px solid ${color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function VehicleModal({ title, vehicle, onSave, onClose }: {
  title: string
  vehicle?: FleetVehicle
  onSave: (data: CreateVehicleInput) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<CreateVehicleInput>({
    name: vehicle?.name || '',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year || new Date().getFullYear(),
    vin: vehicle?.vin || '',
    licensePlate: vehicle?.licensePlate || '',
    odometer: vehicle?.odometer || 0,
    ecuFamily: vehicle?.ecuFamily || '',
    ownerName: vehicle?.ownerName || '',
    ownerPhone: vehicle?.ownerPhone || '',
    ownerEmail: vehicle?.ownerEmail || '',
    notes: vehicle?.notes || '',
  })

  const update = (field: keyof CreateVehicleInput, value: any) => setForm(f => ({ ...f, [field]: value }))

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Vehicle Name" value={form.name} onChange={v => update('name', v)} placeholder="e.g. Shop Demo A4" />
        <Field label="VIN" value={form.vin} onChange={v => update('vin', v)} placeholder="WAUZZZ..." />
        <Field label="Make" value={form.make} onChange={v => update('make', v)} placeholder="Audi" />
        <Field label="Model" value={form.model} onChange={v => update('model', v)} placeholder="A4 B9" />
        <Field label="Year" value={String(form.year)} onChange={v => update('year', parseInt(v) || 0)} type="number" />
        <Field label="License Plate" value={form.licensePlate} onChange={v => update('licensePlate', v)} placeholder="ABC-123" />
        <Field label="Odometer (km)" value={String(form.odometer)} onChange={v => update('odometer', parseInt(v) || 0)} type="number" />
        <Field label="ECU Family" value={form.ecuFamily} onChange={v => update('ecuFamily', v)} placeholder="ME17.5" />
        <Field label="Owner Name" value={form.ownerName} onChange={v => update('ownerName', v)} placeholder="John Doe" />
        <Field label="Owner Phone" value={form.ownerPhone} onChange={v => update('ownerPhone', v)} placeholder="+1 234 567 8900" />
        <Field label="Owner Email" value={form.ownerEmail} onChange={v => update('ownerEmail', v)} placeholder="john@example.com" />
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            rows={3}
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 10, color: 'inherit', fontSize: 13, fontFamily: 'inherit', marginTop: 4, resize: 'vertical' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle('secondary')}>Cancel</button>
        <button onClick={() => {
          if (!form.name || !form.make || !form.model || !form.vin) {
            alert('Name, Make, Model, and VIN are required')
            return
          }
          onSave(form)
        }} style={btnStyle('primary')}>Save Vehicle</button>
      </div>
    </Modal>
  )
}

function DetailModal({ vehicle, onClose, onEdit, onAddService }: {
  vehicle: FleetVehicle
  onClose: () => void
  onEdit: () => void
  onAddService: () => void
}) {
  const [history, setHistory] = useState<ServiceRecord[]>([])
  const cfg = statusConfig[vehicle.status] || statusConfig.offline

  useEffect(() => {
    getServiceHistory(vehicle.id).then(setHistory)
  }, [vehicle.id])

  return (
    <Modal title={vehicle.name} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <InfoRow label="Make" value={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
        <InfoRow label="VIN" value={vehicle.vin} />
        <InfoRow label="License Plate" value={vehicle.licensePlate || '-'} />
        <InfoRow label="Odometer" value={`${vehicle.odometer.toLocaleString()} km`} />
        <InfoRow label="ECU Family" value={vehicle.ecuFamily || '-'} />
        <InfoRow label="Status" value={<span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>} />
        <InfoRow label="Owner" value={vehicle.ownerName || '-'} />
        <InfoRow label="Contact" value={vehicle.ownerPhone || vehicle.ownerEmail || '-'} />
      </div>

      {vehicle.notes && (
        <div style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
          <strong style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>Notes</strong>
          <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{vehicle.notes}</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>🔧 Service History ({history.length})</h4>
        <button onClick={onAddService} style={btnStyle('secondary')}>{Icons.plus} Add Service</button>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>No service records yet</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {history.map(h => (
            <div key={h.id} style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{h.description}</strong>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{h.date.slice(0,10)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                {h.odometer > 0 && `${h.odometer.toLocaleString()} km · `}
                {h.performedBy || 'Unknown'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle('secondary')}>Close</button>
        <button onClick={onEdit} style={btnStyle('primary')}>{Icons.edit} Edit Vehicle</button>
      </div>
    </Modal>
  )
}

function ServiceModal({ vehicle, onSave, onClose }: {
  vehicle: FleetVehicle
  onSave: (record: Omit<ServiceRecord, 'id'>) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [odometer, setOdometer] = useState(String(vehicle.odometer))
  const [performedBy, setPerformedBy] = useState('')

  return (
    <Modal title={`Add Service Record — ${vehicle.name}`} onClose={onClose}>
      <Field label="Date" value={date} onChange={setDate} type="date" />
      <div style={{ marginTop: 12 }}>
        <Field label="Description" value={description} onChange={setDescription} placeholder="e.g. Oil change, Stage 1 tune installed" />
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Odometer (km)" value={odometer} onChange={setOdometer} type="number" />
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Performed By" value={performedBy} onChange={setPerformedBy} placeholder="Technician name" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle('secondary')}>Cancel</button>
        <button onClick={() => {
          if (!description) { alert('Description is required'); return }
          onSave({ date, description, odometer: parseInt(odometer) || 0, performedBy })
        }} style={btnStyle('primary')}>Add Record</button>
      </div>
    </Modal>
  )
}

// ── UI Helpers ────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a2e', borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '90vh',
        overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>{Icons.close}</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '10px 12px', color: 'inherit', fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary') {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
  } as React.CSSProperties
  if (variant === 'primary') {
    return { ...base, background: 'var(--accent)', color: '#000' }
  }
  return { ...base, background: 'rgba(255,255,255,0.08)', color: 'inherit', border: '1px solid rgba(255,255,255,0.1)' }
}

const iconBtnStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: 'none',
  background: 'rgba(255,255,255,0.06)', color: 'var(--muted)',
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '8px 12px', color: 'inherit', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}
