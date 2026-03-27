import type { ActiveVehicle } from '../lib/vehicleContext'

interface Props { vehicle: ActiveVehicle | null }

export default function VehicleStrip({ vehicle }: Props) {
  if (!vehicle) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      background: 'rgba(184,240,42,0.06)',
      border: '1px solid rgba(184,240,42,0.16)',
      borderRadius: 8,
      padding: '0 14px',
      marginBottom: 20,
      height: 38,
      overflow: 'hidden',
    }}>
      {/* Make + Model */}
      <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
        {vehicle.make} {vehicle.model}
      </span>

      <Dot />

      {/* Variant */}
      <span style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
        {vehicle.variant}
      </span>

      {vehicle.engine_code && <><Dot /><span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{vehicle.engine_code}</span></>}

      <Dot />

      {/* ECU */}
      <span style={{
        background: 'rgba(184,240,42,0.10)', border: '1px solid rgba(184,240,42,0.22)',
        borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700,
        color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap',
      }}>
        {vehicle.ecu}
      </span>

      {vehicle.year_from && <><Dot /><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{vehicle.year_from}–{vehicle.year_to ?? '—'}</span></>}

      {/* Power — push to right */}
      <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
        {vehicle.ps} PS
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 5 }}>{vehicle.kw} kW</span>
      </span>
    </div>
  )
}

function Dot() {
  return <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 10px' }} />
}
