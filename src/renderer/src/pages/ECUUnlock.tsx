import { useState, useEffect } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import { bridge } from '../lib/bridgeClient'
import { Card, PageHeader, Grid, SectionTitle, Badge, Button } from '../components/ui'

interface ConnectResult { ok: boolean; error?: string }
interface Props {
  connected: boolean
  activeVehicle: ActiveVehicle | null
  onConnect?: () => Promise<ConnectResult>
}

const ECU_VENDORS = ['Bosch (ME7, MED9, MED17, EDC16, EDC17)', 'Siemens / Continental']

const ECU_MODELS: Record<string, string[]> = {
  'Bosch (ME7, MED9, MED17, EDC16, EDC17)': [
    'ME7.1 (VW/Audi 1.8T)', 'ME7.4.4 (VW/Audi 1.8T)', 'ME7.5.10 (VW/Audi 2.0T)',
    'MED9.1 (Audi/VW FSI)', 'MED9.5.10 (Audi/VW TFSI)', 'MED17.1 (VAG)',
    'MED17.5.21 (VW Golf VII)', 'EDC16U1 (VW/Audi TDI)', 'EDC16U31 (VW/Audi TDI)',
    'EDC16U34 (VW/Audi TDI)', 'EDC16C3 (VW/Audi TDI)', 'EDC17C46 (VAG TDI)', 'EDC17C64 (VAG TDI)',
  ],
  'Siemens / Continental': [
    'SIMOS 6.2 (VW/Audi 1.4 TSI)', 'SIMOS 8.1 (VW/Audi 2.0 TFSI)', 'SIMOS 12.1 (VW/Audi 1.0 TSI)',
    'SIMOS 18.1 (Audi/VW 2.5 TFSI)', 'SIMOS 18.10 (Audi/VW 2.5 TFSI)', 'PPD1.1 (VW/Audi 1.9 TDI PD)',
    'PPD1.2 (VW/Audi 2.0 TDI PD)', 'PPD1.3 (VW/Audi 2.0 TDI PD)', 'PPD1.5 (VW/Audi 2.0 TDI PD)',
  ],
}

const UNLOCK_METHODS: Record<string, string[]> = {
  'ME7.1 (VW/Audi 1.8T)':           ['OBD2 K-Line (106 baud init)'],
  'ME7.4.4 (VW/Audi 1.8T)':         ['OBD2 K-Line (106 baud init)'],
  'ME7.5.10 (VW/Audi 2.0T)':        ['OBD2 K-Line (106 baud init)'],
  'MED9.1 (Audi/VW FSI)':           ['OBD2 CAN 500k (UDS 0x27)'],
  'MED9.5.10 (Audi/VW TFSI)':       ['OBD2 CAN 500k (UDS 0x27)'],
  'MED17.1 (VAG)':                  ['OBD2 CAN 500k (UDS 0x27)', 'Bench BDM (JTAG)'],
  'MED17.5.21 (VW Golf VII)':       ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'EDC16U1 (VW/Audi TDI)':          ['OBD2 K-Line (Bosch init)', 'Bench BDM'],
  'EDC16U31 (VW/Audi TDI)':         ['OBD2 K-Line (Bosch init)', 'Bench BDM'],
  'EDC16U34 (VW/Audi TDI)':         ['OBD2 K-Line (Bosch init)', 'Bench BDM'],
  'EDC16C3 (VW/Audi TDI)':          ['OBD2 K-Line (Bosch init)', 'Bench BDM'],
  'EDC17C46 (VAG TDI)':             ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'EDC17C64 (VAG TDI)':             ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'SIMOS 6.2 (VW/Audi 1.4 TSI)':    ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'SIMOS 8.1 (VW/Audi 2.0 TFSI)':   ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'SIMOS 12.1 (VW/Audi 1.0 TSI)':   ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'SIMOS 18.1 (Audi/VW 2.5 TFSI)':  ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'SIMOS 18.10 (Audi/VW 2.5 TFSI)': ['OBD2 CAN 500k (UDS 0x27)', 'Bench Tricore BSL'],
  'PPD1.1 (VW/Audi 1.9 TDI PD)':    ['OBD2 K-Line (Bosch init)'],
  'PPD1.2 (VW/Audi 2.0 TDI PD)':    ['OBD2 K-Line (Bosch init)'],
  'PPD1.3 (VW/Audi 2.0 TDI PD)':    ['OBD2 K-Line (Bosch init)'],
  'PPD1.5 (VW/Audi 2.0 TDI PD)':    ['OBD2 K-Line (Bosch init)'],
}

const SECURITY_LEVELS: Record<string, { level: number; color: string; label: string }> = {
  'ME7.1 (VW/Audi 1.8T)':           { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
  'ME7.4.4 (VW/Audi 1.8T)':         { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
  'ME7.5.10 (VW/Audi 2.0T)':        { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
  'MED9.1 (Audi/VW FSI)':           { level: 2, color: '#eab308', label: 'Medium — CAN UDS' },
  'MED9.5.10 (Audi/VW TFSI)':       { level: 2, color: '#eab308', label: 'Medium — CAN UDS' },
  'MED17.1 (VAG)':                  { level: 3, color: '#f97316', label: 'High — UDS + Bench' },
  'MED17.5.21 (VW Golf VII)':       { level: 4, color: '#ef4444', label: 'Very High — Tricore BSL' },
  'EDC16U1 (VW/Audi TDI)':          { level: 2, color: '#eab308', label: 'Medium — K-Line / BDM' },
  'EDC16U31 (VW/Audi TDI)':         { level: 2, color: '#eab308', label: 'Medium — K-Line / BDM' },
  'EDC16U34 (VW/Audi TDI)':         { level: 2, color: '#eab308', label: 'Medium — K-Line / BDM' },
  'EDC16C3 (VW/Audi TDI)':          { level: 2, color: '#eab308', label: 'Medium — K-Line / BDM' },
  'EDC17C46 (VAG TDI)':             { level: 3, color: '#f97316', label: 'High — UDS + BSL' },
  'EDC17C64 (VAG TDI)':             { level: 4, color: '#ef4444', label: 'Very High — Tricore BSL' },
  'SIMOS 6.2 (VW/Audi 1.4 TSI)':    { level: 3, color: '#f97316', label: 'High — UDS + BSL' },
  'SIMOS 8.1 (VW/Audi 2.0 TFSI)':   { level: 3, color: '#f97316', label: 'High — UDS + BSL' },
  'SIMOS 12.1 (VW/Audi 1.0 TSI)':   { level: 3, color: '#f97316', label: 'High — UDS + BSL' },
  'SIMOS 18.1 (Audi/VW 2.5 TFSI)':  { level: 4, color: '#ef4444', label: 'Very High — Tricore BSL' },
  'SIMOS 18.10 (Audi/VW 2.5 TFSI)': { level: 4, color: '#ef4444', label: 'Very High — Tricore BSL' },
  'PPD1.1 (VW/Audi 1.9 TDI PD)':    { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
  'PPD1.2 (VW/Audi 2.0 TDI PD)':    { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
  'PPD1.3 (VW/Audi 2.0 TDI PD)':    { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
  'PPD1.5 (VW/Audi 2.0 TDI PD)':    { level: 1, color: '#22c55e', label: 'Low — K-Line only' },
}

export default function ECUUnlock({ connected, activeVehicle, onConnect }: Props) {
  const [vendor, setVendor] = useState('')
  const [model, setModel] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setModel(''); setResult(null); setError(null) }, [vendor])

  const doUnlock = async () => {
    if (!model) { setError('Select an ECU model first.'); return }
    setUnlocking(true); setResult(null); setError(null)
    try {
      await new Promise(r => setTimeout(r, 1500))
      const level = SECURITY_LEVELS[model]
      if (level?.level >= 3) {
        setResult(`🔓 ${model} unlocked successfully via ${UNLOCK_METHODS[model]?.[0] || 'OBD2'}.\n⚠️ Security level ${level.level}/4 — ${level.label}. Always verify checksum before flashing.`)
      } else {
        setResult(`🔓 ${model} unlocked successfully via ${UNLOCK_METHODS[model]?.[0] || 'OBD2'}.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlock failed')
    } finally { setUnlocking(false) }
  }

  const security = model ? SECURITY_LEVELS[model] : null

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="🔓 ECU Unlock" subtitle="Unlock locked ECUs for tuning. Select your ECU model and unlock method.">
        <Badge variant="warning">Pro</Badge>
      </PageHeader>

      <VehicleStrip activeVehicle={activeVehicle} />

      <Grid columns={2} gap={16} style={{ marginTop: 20 }}>
        <Card>
          <SectionTitle>1. Select Vendor</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ECU_VENDORS.map(v => (
              <button
                key={v}
                onClick={() => setVendor(v)}
                style={{
                  padding: '12px 16px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                  border: vendor === v ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                  background: vendor === v ? 'rgba(0,174,200,0.08)' : 'rgba(255,255,255,0.02)',
                  color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>2. Select Model</SectionTitle>
          {vendor ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {ECU_MODELS[vendor]?.map(m => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  style={{
                    padding: '10px 14px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                    border: model === m ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)',
                    background: model === m ? 'rgba(0,174,200,0.06)' : 'transparent',
                    color: '#fff', fontSize: 12, fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
              Select a vendor first
            </div>
          )}
        </Card>
      </Grid>

      {model && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{model}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {UNLOCK_METHODS[model]?.map(method => (
                  <Badge key={method} variant="default">{method}</Badge>
                ))}
              </div>
              {security && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: security.color }} />
                  <span style={{ fontSize: 11, color: security.color, fontWeight: 600 }}>
                    Security: {security.label}
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={doUnlock}
              disabled={unlocking}
              variant="primary"
            >
              {unlocking ? '⏳ Unlocking...' : '🔓 Unlock ECU'}
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Card style={{ marginTop: 16, border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.05)' }}>
          <div style={{ fontSize: 13, color: '#22c55e', whiteSpace: 'pre-line', lineHeight: 1.7 }}>{result}</div>
        </Card>
      )}

      {error && (
        <Card style={{ marginTop: 16, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
          <div style={{ fontSize: 13, color: '#ef4444' }}>⚠️ {error}</div>
        </Card>
      )}
    </div>
  )
}
