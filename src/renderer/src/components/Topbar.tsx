import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props {
  manufacturer: string
  setManufacturer: (v: string) => void
  vehicle: string
  setVehicle: (v: string) => void
  connected: boolean
  activeVehicle: ActiveVehicle | null
  setActiveVehicle: (v: ActiveVehicle | null) => void
}

export default function Topbar({
  manufacturer, setManufacturer, vehicle, setVehicle,
  connected, activeVehicle, setActiveVehicle,
}: Props) {
  const [makes, setMakes]         = useState<string[]>([])
  const [vehicles, setVehicles]   = useState<string[]>([])
  const [dbVariants, setDbVariants] = useState<ActiveVehicle[]>([])

  useEffect(() => {
    supabase.rpc('get_vehicle_makes').then(({ data }) => {
      if (data) setMakes(data.map((r: any) => r.make))
    })
  }, [])

  useEffect(() => {
    if (!manufacturer) { setVehicles([]); setDbVariants([]); return }
    supabase.rpc('get_vehicle_models', { p_make: manufacturer }).then(({ data }) => {
      if (data) setVehicles(data.map((r: any) => r.model))
    })
  }, [manufacturer])

  useEffect(() => {
    if (!manufacturer || !vehicle) { setDbVariants([]); return }
    supabase.from('vehicle_database').select('*')
      .eq('make', manufacturer).eq('model', vehicle).order('year_from')
      .then(({ data }) => { if (data) setDbVariants(data as ActiveVehicle[]) })
  }, [manufacturer, vehicle])

  return (
    <div className="topbar">
      {/* Make */}
      <div className="topbar-field">
        <label>Make</label>
        <select value={manufacturer} onChange={(e) => { setManufacturer(e.target.value); setVehicle('') }}>
          <option value="">All Makes</option>
          {makes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Model */}
      <div className="topbar-field">
        <label>Model</label>
        <select value={vehicle} onChange={(e) => { setVehicle(e.target.value); setActiveVehicle(null) }} disabled={!manufacturer}>
          <option value="">Select model</option>
          {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* Variant */}
      {dbVariants.length > 0 && (
        <div className="topbar-field">
          <label>Variant</label>
          <select
            value={activeVehicle?.variant || ''}
            onChange={(e) => {
              const v = dbVariants.find((d) => d.variant === e.target.value)
              if (v) { setActiveVehicle(v) }
            }}
          >
            <option value="">Select variant</option>
            {dbVariants.map((v) => (
              <option key={v.variant} value={v.variant}>
                {v.variant} · {v.year_from}–{v.year_to}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="topbar-divider" />

      {/* Active ECU pill */}
      {activeVehicle && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(184,240,42,0.08)',
          border: '1px solid rgba(184,240,42,0.22)',
          borderRadius: 6, padding: '0 10px', height: 28,
          fontSize: 11, maxWidth: 300, overflow: 'hidden',
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
            {activeVehicle.ps} PS
          </span>
          <span style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>·</span>
          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeVehicle.ecu}
          </span>
          <button
            onClick={() => setActiveVehicle(null)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16, padding: '0', lineHeight: 1,
              display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 2,
            }}
          >×</button>
        </div>
      )}

      <div className="topbar-spacer" />

      {/* VIN */}
      {activeVehicle?.vin && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', letterSpacing: '0.3px' }}>
          {activeVehicle.vin}
        </div>
      )}

      {/* Connection status */}
      <div className={`topbar-status ${connected ? 'online' : 'offline'}`}>
        <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
        {connected ? 'Connected' : 'No Device'}
      </div>
    </div>
  )
}
