import { useState } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Badge } from '../components/ui'

interface Props {
  activeVehicle: ActiveVehicle | null
}

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
  { pin: 'D4',  func: 'TPS / APP',           type: 'IN',   note: 'Throttle / accelerator pedal position' },
  { pin: 'E1',  func: 'MAP / Boost Sensor',  type: 'IN',   note: 'Manifold absolute pressure' },
  { pin: 'E2',  func: 'IAT Sensor',          type: 'IN',   note: 'Intake air temperature' },
  { pin: 'E3',  func: 'ECT Sensor',          type: 'IN',   note: 'Engine coolant temperature' },
  { pin: 'E4',  func: 'O2 Sensor (Bank 1)',  type: 'IN',   note: 'Upstream lambda / wideband' },
  { pin: 'F1',  func: 'Ignition Coil 1',     type: 'OUT',  note: 'Spark coil A output' },
  { pin: 'F2',  func: 'Ignition Coil 2',     type: 'OUT',  note: 'Spark coil B output' },
  { pin: 'F3',  func: 'Ignition Coil 3',     type: 'OUT',  note: 'Spark coil C output' },
  { pin: 'F4',  func: 'Ignition Coil 4',     type: 'OUT',  note: 'Spark coil D output' },
]

const PROTOCOL_COLORS: Record<string, string> = {
  PWR: '#ef4444',
  CAN: '#22c55e',
  DIAG: '#3b82f6',
  OUT: '#f59e0b',
  IN: '#8b5cf6',
}

export default function WiringDiagrams({ activeVehicle }: Props) {
  const [tab, setTab] = useState<'obd2' | 'me7' | 'can'>('obd2')

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader
        title="Wiring Diagrams"
        subtitle={activeVehicle ? `${activeVehicle.year} ${activeVehicle.make} ${activeVehicle.model}` : 'OBD2, ECU pinouts & CAN bus reference'}
        icon="🔌"
      />

      <Grid cols={3} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="OBD2 Pins" value="16" icon="🔢" color="#00aec8" />
        <StatCard label="CAN Nodes" value={CAN_BUS_NODES.length} icon="🌐" color="#10b981" />
        <StatCard label="ME7 Pins" value={ME7_PINS.length} icon="⚡" color="#f59e0b" />
      </Grid>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['obd2', 'OBD2 Port'],
          ['can', 'CAN Bus'],
          ['me7', 'ME7 ECU'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as 'obd2' | 'me7' | 'can')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: tab === key ? 'linear-gradient(135deg, #00cce0 0%, #00aec8 100%)' : 'rgba(255,255,255,0.06)',
              color: tab === key ? '#000' : '#888',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'obd2' && (
        <>
          <SectionTitle>OBD2 16-Pin Layout</SectionTitle>
          <Grid cols={2} gap={10}>
            {OBD2_PINS.map((p) => (
              <Card key={p.pin} style={{ padding: 14, borderLeft: `3px solid ${p.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: p.color + '20',
                    color: p.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {p.pin}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#eee' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{p.func}</div>
                  </div>
                </div>
              </Card>
            ))}
          </Grid>
        </>
      )}

      {tab === 'can' && (
        <>
          <SectionTitle>CAN Bus Network Topology</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CAN_BUS_NODES.map((node, i) => (
              <Card key={i} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(34,197,94,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}>
                    🌐
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#eee' }}>{node.node}</div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      CAN-H: <span style={{ color: '#22c55e' }}>{node.canH}</span> · CAN-L: <span style={{ color: '#22c55e' }}>{node.canL}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>{node.speed}</div>
                    <Badge color="#22c55e" bg="rgba(34,197,94,0.12)">{node.proto}</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'me7' && (
        <>
          <SectionTitle>Bosch ME7 ECU Pinout (121-pin)</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {['PWR', 'CAN', 'DIAG', 'OUT', 'IN'].map(type => (
              <span key={type} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PROTOCOL_COLORS[type] }} />
                <span style={{ color: '#888' }}>{type}</span>
              </span>
            ))}
          </div>
          <Grid cols={2} gap={10}>
            {ME7_PINS.map((p) => (
              <Card key={p.pin} style={{ padding: 12, borderLeft: `3px solid ${PROTOCOL_COLORS[p.type] || '#888'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: (PROTOCOL_COLORS[p.type] || '#888') + '18',
                    color: PROTOCOL_COLORS[p.type] || '#888',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {p.pin}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#eee' }}>{p.func}</div>
                    <div style={{ fontSize: 10, color: '#666' }}>{p.note}</div>
                  </div>
                  <Badge color={PROTOCOL_COLORS[p.type] || '#888'} bg={(PROTOCOL_COLORS[p.type] || '#888') + '15'}>
                    {p.type}
                  </Badge>
                </div>
              </Card>
            ))}
          </Grid>
        </>
      )}
    </div>
  )
}
