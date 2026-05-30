import { useState } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Badge } from '../components/ui'

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

const PCMTUNER_CABLE = [
  { wire: 'Red × 2',       color: '#ef4444', label: 'VECU',       func: 'ECU 12V power supply', modes: ['Bench', 'Boot', 'Tricore'] },
  { wire: 'Black × 2',     color: '#333333', label: 'GND',        func: 'ECU ground', modes: ['Bench', 'Boot', 'Tricore'] },
  { wire: 'White',          color: '#e5e5e5', label: 'CAN H',      func: 'CAN bus High (ISO 15765)', modes: ['OBD', 'Bench'] },
  { wire: 'Green',          color: '#22c55e', label: 'CAN L',      func: 'CAN bus Low (ISO 15765)', modes: ['OBD', 'Bench'] },
  { wire: 'Yellow',         color: '#eab308', label: 'K-LINE',     func: 'ISO 9141 diagnostic (ME7, EDC16)', modes: ['OBD', 'Bench'] },
  { wire: 'Purple',         color: '#a855f7', label: 'VPP',        func: 'Programming voltage', modes: ['Boot'] },
  { wire: 'Grey (croc)',    color: '#9ca3af', label: 'BOOT',       func: 'Bootstrap loader pin — activates BSL mode', modes: ['Boot'] },
  { wire: 'Blue (croc)',    color: '#3b82f6', label: 'CNF1',       func: 'Configuration pin — sets Tricore debug mode', modes: ['Boot', 'Tricore'] },
  { wire: 'White S1',       color: '#e5e5e5', label: 'S1 / GPT0',  func: 'Tricore BDM data line 0', modes: ['Tricore'] },
  { wire: 'Yellow S2',      color: '#eab308', label: 'S2 / GPT1',  func: 'Tricore BDM data line 1', modes: ['Tricore'] },
]

const MODE_COLORS: Record<string, string> = {
  OBD: '#00aec8',
  Bench: '#f59e0b',
  Boot: '#a855f7',
  Tricore: '#22c55e',
}

const PROTOCOL_COLORS: Record<string, string> = {
  PWR: '#ef4444',
  CAN: '#22c55e',
  DIAG: '#3b82f6',
  OUT: '#f59e0b',
  IN: '#8b5cf6',
}

export default function WiringDiagrams() {
  const [tab, setTab] = useState<'obd2' | 'me7' | 'can' | 'pcmtuner'>('obd2')

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader
        title="Wiring Diagrams"
        subtitle="OBD2, ECU pinouts & CAN bus reference"
        icon="🔌"
      />

      <Grid cols={4} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="OBD2 Pins" value="16" icon="🔢" color="#00aec8" />
        <StatCard label="CAN Nodes" value={CAN_BUS_NODES.length} icon="🌐" color="#10b981" />
        <StatCard label="ME7 Pins" value={ME7_PINS.length} icon="⚡" color="#f59e0b" />
        <StatCard label="PCMTuner Wires" value={PCMTUNER_CABLE.length} icon="🔌" color="#a855f7" />
      </Grid>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['obd2', 'OBD2 Port'],
          ['can', 'CAN Bus'],
          ['me7', 'ME7 ECU'],
          ['pcmtuner', 'PCMTuner Cable'],
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

      {tab === 'pcmtuner' && (
        <>
          <SectionTitle>PCMTuner / Scanmatik Bench Cable Pinout</SectionTitle>

          {/* Mode legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {Object.entries(MODE_COLORS).map(([mode, col]) => (
              <span key={mode} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
                <span style={{ color: '#888' }}>{mode}</span>
              </span>
            ))}
          </div>

          {/* Wire cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {PCMTUNER_CABLE.map((w) => (
              <Card key={w.wire} style={{ padding: 14, borderLeft: `3px solid ${w.color === '#333333' ? '#666' : w.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: w.color,
                    border: (w.color === '#333333' || w.color === '#e5e5e5') ? '1px solid rgba(255,255,255,0.25)' : 'none',
                    flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 110, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#eee' }}>{w.wire}</div>
                  </div>
                  <div style={{ minWidth: 80, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace', color: w.color === '#333333' ? '#aaa' : w.color === '#e5e5e5' ? '#ccc' : w.color }}>
                      {w.label}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: '#999' }}>{w.func}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {w.modes.map(m => (
                      <Badge key={m} color={MODE_COLORS[m]} bg={MODE_COLORS[m] + '18'}>
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Connection guides */}
          <SectionTitle>Connection Guide by Mode</SectionTitle>
          <Grid cols={2} gap={12}>
            <Card style={{ padding: 16, borderTop: `3px solid ${MODE_COLORS.Bench}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: MODE_COLORS.Bench }}>Bench Mode</div>
              <div style={{ fontSize: 12, color: '#999', lineHeight: 1.7, marginBottom: 10 }}>
                ECU removed from car, powered on bench. Uses standard OBD protocol (CAN or K-Line) over the cable — no case opening needed.
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                {[
                  { c: '#ef4444', t: 'Red × 2 (VECU) → ECU 12V supply pins' },
                  { c: '#666',    t: 'Black × 2 (GND) → ECU ground pins' },
                  { c: '#e5e5e5', t: 'White (CAN H) → ECU CAN High' },
                  { c: '#22c55e', t: 'Green (CAN L) → ECU CAN Low' },
                  { c: '#eab308', t: 'Yellow (K-LINE) → K-Line (ME7/EDC16 only)' },
                ].map(r => (
                  <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, border: r.c === '#666' ? '1px solid #999' : 'none', flexShrink: 0 }} />
                    <span style={{ color: '#bbb' }}>{r.t}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ padding: 16, borderTop: `3px solid ${MODE_COLORS.Boot}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: MODE_COLORS.Boot }}>Boot Mode</div>
              <div style={{ fontSize: 12, color: '#999', lineHeight: 1.7, marginBottom: 10 }}>
                ECU case opened. BOOT + CNF1 croc clips connect to pads on the ECU board to activate the bootstrap loader. Full flash + IMMO access.
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                {[
                  { c: '#ef4444', t: 'Red × 2 (VECU) → ECU 12V supply pins' },
                  { c: '#666',    t: 'Black × 2 (GND) → ECU ground pins' },
                  { c: '#9ca3af', t: 'Grey croc (BOOT) → Boot pad on ECU board' },
                  { c: '#3b82f6', t: 'Blue croc (CNF1) → Config pad on ECU board' },
                  { c: '#a855f7', t: 'Purple (VPP) → Programming voltage pin' },
                ].map(r => (
                  <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, border: r.c === '#666' ? '1px solid #999' : 'none', flexShrink: 0 }} />
                    <span style={{ color: '#bbb' }}>{r.t}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ padding: 16, borderTop: `3px solid ${MODE_COLORS.Tricore}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: MODE_COLORS.Tricore }}>Tricore BDM Mode</div>
              <div style={{ fontSize: 12, color: '#999', lineHeight: 1.7, marginBottom: 10 }}>
                Direct debug access to the Tricore processor via BDM pins. Bypasses all security. Best method for full ECU clone — reads everything including IMMO and EEPROM.
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                {[
                  { c: '#ef4444', t: 'Red × 2 (VECU) → ECU 12V supply' },
                  { c: '#666',    t: 'Black × 2 (GND) → ECU ground' },
                  { c: '#3b82f6', t: 'Blue croc (CNF1) → Config pad on board' },
                  { c: '#e5e5e5', t: 'White S1 (GPT0) → Tricore BDM data 0' },
                  { c: '#eab308', t: 'Yellow S2 (GPT1) → Tricore BDM data 1' },
                ].map(r => (
                  <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.c, border: (r.c === '#666' || r.c === '#e5e5e5') ? '1px solid #999' : 'none', flexShrink: 0 }} />
                    <span style={{ color: '#bbb' }}>{r.t}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ padding: 16, borderTop: '3px solid #ef4444' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: '#ef4444' }}>Safety</div>
              <div style={{ fontSize: 12, color: '#999', lineHeight: 1.8 }}>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#ef4444' }}>Power supply:</strong> Use a stable 13.2–13.8V bench PSU. Never a car battery charger — voltage spikes brick ECUs.</div>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#ef4444' }}>Polarity:</strong> Double-check Red (VECU) and Black (GND) before powering on. Reverse polarity = dead ECU.</div>
                <div style={{ marginBottom: 6 }}><strong style={{ color: '#ef4444' }}>Never interrupt:</strong> Once a write/flash starts, do not disconnect power or cable. Wait for completion.</div>
                <div><strong style={{ color: '#ef4444' }}>Croc clips:</strong> BOOT and CNF1 clips must make solid contact with the board pads. Loose clips = failed flash.</div>
              </div>
            </Card>
          </Grid>
        </>
      )}
    </div>
  )
}
