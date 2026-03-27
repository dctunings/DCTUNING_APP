import { useState } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

const DIAGRAMS = [
  { id: 'obd2-pinout',   label: 'OBD2 Port Pinout',        category: 'OBD2' },
  { id: 'can-bus',       label: 'CAN Bus Topology',         category: 'CAN' },
  { id: 'bosch-me7',     label: 'Bosch ME7 Connector',      category: 'Bosch' },
  { id: 'bosch-med17',   label: 'Bosch MED17 Pinout',       category: 'Bosch' },
  { id: 'bosch-edc17',   label: 'Bosch EDC17 Connector',    category: 'Bosch' },
  { id: 'siemens-simos', label: 'Siemens SiMos Pinout',     category: 'Siemens' },
  { id: 'delphi-dcm',    label: 'Delphi DCM Connector',     category: 'Delphi' },
  { id: 'j2534-wiring',  label: 'J2534 Device Wiring',      category: 'J2534' },
]

export default function WiringDiagrams({ activeVehicle }: { activeVehicle: ActiveVehicle | null }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = DIAGRAMS.filter(
    (d) =>
      d.label.toLowerCase().includes(search.toLowerCase()) ||
      d.category.toLowerCase().includes(search.toLowerCase())
  )

  const categories = [...new Set(DIAGRAMS.map((d) => d.category))]

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg></div>
        <h1>Wiring Diagrams</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div className="grid-2" style={{ gap: 20 }}>
        {/* List */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search diagrams..."
            />
          </div>

          {categories.map((cat) => {
            const items = filtered.filter((d) => d.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  {cat}
                </div>
                {items.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderRadius: 6,
                      fontSize: 13,
                      marginBottom: 4,
                      background: selected === d.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                      border: `1px solid ${selected === d.id ? 'var(--accent)' : 'var(--border)'}`,
                      color: selected === d.id ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: selected === d.id ? 600 : 400,
                    }}
                  >
                    🔌 {d.label}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* Viewer */}
        <div className="card" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          {!selected ? (
            <>
              <div style={{ fontSize: 40 }}>🔌</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a diagram to view</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {DIAGRAMS.find((d) => d.id === selected)?.label}
              </div>
              <div style={{
                width: '100%',
                height: 300,
                background: 'var(--bg-secondary)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 13
              }}>
                Diagram image will load here
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Add diagram images to /resources/diagrams/{selected}.png
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
