import { useState } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

// ─── Pin data ─────────────────────────────────────────────────────────────────

const OBD2_PINS = [
  { pin: 1,  name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use (often J1850+ bus / PWM)' },
  { pin: 2,  name: 'J1850 Bus+',                  color: '#f59e0b', func: 'SAE J1850 PWM/VPW bus positive' },
  { pin: 3,  name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use' },
  { pin: 4,  name: 'Chassis Ground',               color: '#1e1e1e', func: 'Body / chassis earth' },
  { pin: 5,  name: 'Signal Ground',                color: '#1e1e1e', func: 'ECU signal reference ground' },
  { pin: 6,  name: 'CAN High (J-2284)',            color: '#22c55e', func: 'ISO 15765-4 CAN High (500kbps)' },
  { pin: 7,  name: 'ISO 9141-2 K-Line',            color: '#3b82f6', func: 'K-Line serial data (ISO 9141 / KWP2000)' },
  { pin: 8,  name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use' },
  { pin: 9,  name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use (often CAN2 High)' },
  { pin: 10, name: 'J1850 Bus−',                  color: '#f59e0b', func: 'SAE J1850 PWM bus negative' },
  { pin: 11, name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use (often CAN2 Low)' },
  { pin: 12, name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use' },
  { pin: 13, name: 'Manufacturer Discretionary',  color: '#888',    func: 'OEM use' },
  { pin: 14, name: 'CAN Low (J-2284)',             color: '#22c55e', func: 'ISO 15765-4 CAN Low (500kbps)' },
  { pin: 15, name: 'ISO 9141-2 L-Line',            color: '#3b82f6', func: 'L-Line serial data (ISO 9141 init)' },
  { pin: 16, name: 'Battery Power (Vbatt)',         color: '#ef4444', func: '12V constant battery supply (fused)' },
]

const CAN_BUS_NODES = [
  { node: 'ECU (Engine)',       canH: 'Pin 6 (OBD)',  canL: 'Pin 14 (OBD)', speed: '500 kbps', proto: 'ISO 15765-4' },
  { node: 'ABS / ESP Module',  canH: 'Green wire',   canL: 'Green/White',  speed: '500 kbps', proto: 'ISO 15765-4' },
  { node: 'Instrument Cluster', canH: 'Green wire',  canL: 'Green/White',  speed: '500 kbps', proto: 'ISO 15765-4' },
  { node: 'Gearbox TCU',        canH: 'Green wire',  canL: 'Green/White',  speed: '500 kbps', proto: 'ISO 15765-4' },
  { node: 'Body Control (BCM)', canH: 'Yellow wire', canL: 'Yellow/White', speed: '125 kbps', proto: 'Body CAN' },
  { node: 'Airbag SRS',         canH: 'Yellow wire', canL: 'Yellow/White', speed: '125 kbps', proto: 'Body CAN' },
]

const ME7_PINS = [
  { pin: 'A1',  func: 'Ground',              type: 'PWR', note: 'ECU chassis ground' },
  { pin: 'A2',  func: 'Ground',              type: 'PWR', note: 'ECU chassis ground' },
  { pin: 'A3',  func: '+12V KL30',           type: 'PWR', note: 'Battery permanent supply' },
  { pin: 'A4',  func: '+12V KL30',           type: 'PWR', note: 'Battery permanent supply' },
  { pin: 'A5',  func: '+12V KL15',           type: 'PWR', note: 'Ignition switched supply' },
  { pin: 'B1',  func: 'K-Line (Diag)',       type: 'DIAG', note: 'ISO 9141 diagnostic line' },
  { pin: 'B2',  func: 'CAN High',            type: 'CAN',  note: 'High-speed CAN bus H' },
  { pin: 'B3',  func: 'CAN Low',             type: 'CAN',  note: 'High-speed CAN bus L' },
  { pin: 'C1',  func: 'Injector 1',          type: 'OUT',  note: 'Cylinder 1 injector drive (low-side)' },
  { pin: 'C2',  func: 'Injector 2',          type: 'OUT',  note: 'Cylinder 2 injector drive' },
  { pin: 'C3',  func: 'Injector 3',          type: 'OUT',  note: 'Cylinder 3 injector drive' },
  { pin: 'C4',  func: 'Injector 4',          type: 'OUT',  note: 'Cylinder 4 injector drive' },
  { pin: 'D1',  func: 'Crank Sensor +',      type: 'IN',   note: 'CKP speed/position sensor positive' },
  { pin: 'D2',  func: 'Crank Sensor −',      type: 'IN',   note: 'CKP speed/position sensor negative' },
  { pin: 'D3',  func: 'Cam Sensor',          type: 'IN',   note: 'Camshaft position sensor' },
  { pin: 'D4',  func: 'MAP Sensor',          type: 'IN',   note: 'Manifold absolute pressure' },
  { pin: 'E1',  func: 'Throttle Position',   type: 'IN',   note: 'TPS signal 0-5V' },
  { pin: 'E2',  func: 'Coolant Temp (NTC)',  type: 'IN',   note: 'Coolant temperature sensor' },
  { pin: 'E3',  func: 'Intake Air Temp',     type: 'IN',   note: 'IAT sensor signal' },
  { pin: 'E4',  func: 'O2 Sensor (Pre-cat)', type: 'IN',   note: 'Lambda wideband / narrowband front' },
]

const EDC17_PINS = [
  { pin: 'X1/1', func: 'Ground',              type: 'PWR',  note: 'Main ECU ground' },
  { pin: 'X1/2', func: '+12V KL30',           type: 'PWR',  note: 'Battery constant supply' },
  { pin: 'X1/3', func: '+12V KL15',           type: 'PWR',  note: 'Ignition supply' },
  { pin: 'X1/4', func: 'CAN High (Powertrain)', type: 'CAN', note: 'PT-CAN High 500kbps' },
  { pin: 'X1/5', func: 'CAN Low (Powertrain)',  type: 'CAN', note: 'PT-CAN Low 500kbps' },
  { pin: 'X1/6', func: 'K-Line',              type: 'DIAG', note: 'ISO 9141-2 K-Line diagnostic' },
  { pin: 'X2/1', func: 'Rail Pressure Sensor', type: 'IN',  note: 'Common rail pressure 0-5V' },
  { pin: 'X2/2', func: 'Boost Pressure Sensor', type: 'IN', note: 'Turbo boost / MAP 0-5V' },
  { pin: 'X2/3', func: 'Air Mass Meter (MAF)', type: 'IN',  note: 'HFM air mass flow signal' },
  { pin: 'X2/4', func: 'Coolant Temp',         type: 'IN',  note: 'NTC coolant temperature' },
  { pin: 'X2/5', func: 'Fuel Temp Sensor',     type: 'IN',  note: 'Fuel temperature NTC' },
  { pin: 'X3/1', func: 'Injector 1 High',      type: 'OUT', note: 'Cyl 1 piezo/solenoid high-side' },
  { pin: 'X3/2', func: 'Injector 1 Low',       type: 'OUT', note: 'Cyl 1 injector low-side' },
  { pin: 'X3/3', func: 'Injector 2 High',      type: 'OUT', note: 'Cyl 2 piezo/solenoid high-side' },
  { pin: 'X3/4', func: 'Injector 2 Low',       type: 'OUT', note: 'Cyl 2 injector low-side' },
  { pin: 'X4/1', func: 'EGR Valve Control',    type: 'OUT', note: 'EGR actuator PWM output' },
  { pin: 'X4/2', func: 'Turbo VNT/Wastegate',  type: 'OUT', note: 'Boost control solenoid PWM' },
  { pin: 'X4/3', func: 'Glow Plug Relay',      type: 'OUT', note: 'Glow plug control output' },
]

const J2534_WIRING = [
  { pin: '1', func: 'CAN High',    color: '#22c55e', note: 'Connect to OBD2 Pin 6' },
  { pin: '2', func: 'CAN Low',     color: '#22c55e', note: 'Connect to OBD2 Pin 14' },
  { pin: '3', func: 'K-Line',      color: '#3b82f6', note: 'Connect to OBD2 Pin 7' },
  { pin: '4', func: 'L-Line',      color: '#3b82f6', note: 'Connect to OBD2 Pin 15' },
  { pin: '5', func: 'GND',         color: '#888',    note: 'Connect to OBD2 Pin 4 & 5' },
  { pin: '6', func: '+12V Vbatt',  color: '#ef4444', note: 'Connect to OBD2 Pin 16' },
  { pin: '7', func: 'J1850 Bus+',  color: '#f59e0b', note: 'Connect to OBD2 Pin 2 (if needed)' },
  { pin: '8', func: 'J1850 Bus−',  color: '#f59e0b', note: 'Connect to OBD2 Pin 10 (if needed)' },
]

const TYPE_COLORS: Record<string, string> = {
  PWR:  '#ef4444',
  CAN:  '#22c55e',
  IN:   '#3b82f6',
  OUT:  '#f59e0b',
  DIAG: '#a855f7',
}

const DIAGRAMS = [
  { id: 'obd2-pinout',   label: 'OBD2 Port Pinout',         category: 'OBD2',    desc: '16-pin ALDL/OBD2 connector (SAE J1962)' },
  { id: 'can-bus',       label: 'CAN Bus Nodes & Pinout',    category: 'CAN',     desc: 'ISO 15765-4 CAN bus topology' },
  { id: 'bosch-me7',     label: 'Bosch ME7 Connector',       category: 'Bosch',   desc: 'ME7.x petrol ECU pin reference (VAG/BMW)' },
  { id: 'bosch-edc17',   label: 'Bosch EDC17 Connector',     category: 'Bosch',   desc: 'EDC17 diesel ECU pin reference (VAG/BMW/Ford)' },
  { id: 'j2534-wiring',  label: 'J2534 Device Wiring',       category: 'J2534',   desc: 'PassThru interface OBD2 cable wiring' },
]

function OBD2Diagram() {
  // Visual 16-pin connector layout — top row pins 1-8, bottom row 9-16
  const top = OBD2_PINS.slice(0, 8)
  const bot = OBD2_PINS.slice(8, 16)
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--accent)' }}>SAE J1962 — 16-Pin OBD2 Connector</div>
      {/* Connector visual */}
      <div style={{ background: '#1a1a2e', border: '3px solid #444', borderRadius: 8, padding: 16, marginBottom: 20, display: 'inline-block', minWidth: '100%' }}>
        <div style={{ fontSize: 10, color: '#666', marginBottom: 6, textAlign: 'center' }}>FEMALE (vehicle side, viewed from front)</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {top.map(p => (
            <div key={p.pin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: 9, color: '#888' }}>{p.pin}</div>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: p.color, border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={p.name} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {bot.map(p => (
            <div key={p.pin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: p.color, border: '2px solid #333' }} title={p.name} />
              <div style={{ fontSize: 9, color: '#888' }}>{p.pin}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pin table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {['Pin', 'Name', 'Function'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OBD2_PINS.map(p => (
              <tr key={p.pin} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block', border: '1px solid #333', flexShrink: 0 }} />
                    {p.pin}
                  </span>
                </td>
                <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text-primary)', fontSize: 11 }}>{p.name}</td>
                <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{p.func}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CANDiagram() {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--accent)' }}>CAN Bus Topology — ISO 15765-4</div>

      {/* Visual bus line */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8, overflowX: 'auto', paddingBottom: 8 }}>
          {CAN_BUS_NODES.slice(0,4).map((n, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'center' }}>
                <div>{n.node}</div>
                <div style={{ color: '#22c55e', fontFamily: 'monospace', marginTop: 2 }}>{n.speed}</div>
              </div>
              {i < 3 && <div style={{ width: 30, height: 2, background: '#22c55e', flexShrink: 0 }} />}
            </div>
          ))}
          <div style={{ width: 20, height: 2, background: '#22c55e', flexShrink: 0 }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} title="120Ω termination" />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>← 120Ω terminator at each end of the bus →</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['Node', 'CAN High', 'CAN Low', 'Speed', 'Protocol'].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAN_BUS_NODES.map((n, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text-primary)', fontSize: 11 }}>{n.node}</td>
              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#22c55e', fontSize: 11 }}>{n.canH}</td>
              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#22c55e', fontSize: 11 }}>{n.canL}</td>
              <td style={{ padding: '7px 10px', fontWeight: 600, fontSize: 11 }}>{n.speed}</td>
              <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{n.proto}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>CAN voltage levels:</strong> CANH = 2.5–3.5V, CANL = 1.5–2.5V (recessive), CANH = 3.5–5V, CANL = 0–1.5V (dominant). Differential ~2V. Measure between CANH and CANL for ~2.5V idle (no traffic).
      </div>
    </div>
  )
}

function PinTable({ pins }: { pins: { pin: string; func: string; type: string; note: string }[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--bg-secondary)' }}>
          {['Pin', 'Type', 'Function', 'Notes'].map(h => (
            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pins.map((p, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{p.pin}</td>
            <td style={{ padding: '7px 10px' }}>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: `${TYPE_COLORS[p.type] ?? '#888'}22`, color: TYPE_COLORS[p.type] ?? '#888', border: `1px solid ${TYPE_COLORS[p.type] ?? '#888'}44` }}>
                {p.type}
              </span>
            </td>
            <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text-primary)', fontSize: 11 }}>{p.func}</td>
            <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{p.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function J2534Diagram() {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--accent)' }}>J2534 PassThru — OBD2 Cable Wiring</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        Standard wiring between J2534 PassThru device and the vehicle's OBD2 port. Devices include KESS3, K-TAG, Tactrix Openport, J2534-1 USB adapters.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {['J2534 Pin', 'Signal', 'OBD2 Pin', 'Notes'].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {J2534_WIRING.map(p => (
            <tr key={p.pin} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{p.pin}</td>
              <td style={{ padding: '7px 10px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block', border: '1px solid #333', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 11 }}>{p.func}</span>
                </span>
              </td>
              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: 'var(--accent)' }}>Pin {p.pin === '5' ? '4 & 5' : p.pin === '7' ? '2' : p.pin === '8' ? '10' : p.pin}</td>
              <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function WiringDiagrams({ activeVehicle }: { activeVehicle: ActiveVehicle | null }) {
  const [selected, setSelected] = useState<string>('obd2-pinout')
  const [search, setSearch] = useState('')

  const filtered = DIAGRAMS.filter(
    d => d.label.toLowerCase().includes(search.toLowerCase()) ||
         d.category.toLowerCase().includes(search.toLowerCase())
  )
  const categories = [...new Set(DIAGRAMS.map(d => d.category))]

  const renderDiagram = () => {
    switch (selected) {
      case 'obd2-pinout':  return <OBD2Diagram />
      case 'can-bus':      return <CANDiagram />
      case 'bosch-me7':    return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--accent)' }}>Bosch ME7.x — ECU Pin Reference (Petrol)</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Used in: VW Golf/Bora 1.8T, Audi TT/A3 1.8T, Seat Leon/Cupra, Skoda Octavia vRS (1998–2006)</div>
          <PinTable pins={ME7_PINS} />
        </div>
      )
      case 'bosch-edc17':  return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--accent)' }}>Bosch EDC17 — ECU Pin Reference (Diesel)</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Used in: VW/Audi TDI 2.0 CR (2008+), BMW 320d/520d, Ford Focus/Mondeo TDCi, Seat/Skoda diesel (EDC17C46/C64/C74)</div>
          <PinTable pins={EDC17_PINS} />
        </div>
      )
      case 'j2534-wiring': return <J2534Diagram />
      default: return null
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
          </svg>
        </div>
        <h1>Wiring Diagrams</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div className="grid-2" style={{ gap: 20 }}>
        {/* List */}
        <div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search diagrams..."
            style={{ width: '100%', marginBottom: 12 }}
          />
          {categories.map(cat => {
            const items = filtered.filter(d => d.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  {cat}
                </div>
                {items.map(d => (
                  <div
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                      background: selected === d.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                      border: `1px solid ${selected === d.id ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: selected === d.id ? 700 : 400, color: selected === d.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      🔌 {d.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{d.desc}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* Diagram viewer */}
        <div className="card" style={{ minHeight: 400 }}>
          {renderDiagram()}
        </div>
      </div>
    </div>
  )
}
