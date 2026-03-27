import { useState } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'

interface DeleteOption { id: string; label: string; desc: string; benefit?: string }

const SECTIONS: { title: string; color: string; options: DeleteOption[] }[] = [
  {
    title: 'DPF (Diesel Particulate Filter) Delete',
    color: 'var(--accent)',
    options: [
      { id: 'dpf_regen',   label: 'Remove DPF Regeneration Cycles',        desc: 'Disables active regeneration, removes soot loading parameters',          benefit: 'Reduced exhaust temps, improved fuel economy, eliminates regen issues' },
      { id: 'dpf_sensor',  label: 'Remove DPF Differential Pressure Sensor',desc: 'Eliminates DPF pressure monitoring and related fault codes' },
      { id: 'dpf_temp',    label: 'Remove DPF Temperature Sensors',         desc: 'Disables exhaust temperature monitoring for DPF system' },
    ]
  },
  {
    title: 'EGR (Exhaust Gas Recirculation) Delete',
    color: 'var(--accent)',
    options: [
      { id: 'egr_valve',  label: 'Disable EGR Valve Operation',          desc: 'Keeps EGR valve closed, removes EGR flow from combustion', benefit: 'Lower intake temps, cleaner intake, improved throttle response' },
      { id: 'egr_cooler', label: 'Remove EGR Cooler Monitoring',         desc: 'Disables EGR cooler efficiency and temperature monitoring' },
      { id: 'egr_dtcs',   label: 'Delete EGR-Related DTCs',              desc: 'Removes codes: P0401, P0402, P0403, P0404, P0405, P0406, P0407, P0408' },
    ]
  },
  {
    title: 'DEF/SCR (Selective Catalytic Reduction) Delete',
    color: 'var(--accent)',
    options: [
      { id: 'def_inject',  label: 'Disable DEF Injection System',         desc: 'Stops AdBlue/DEF fluid injection, removes DEF tank monitoring',  benefit: 'No more DEF refills, removes derate conditions' },
      { id: 'scr_monitor', label: 'Remove SCR Catalyst Efficiency Monitoring', desc: 'Disables NOx sensor readings and catalyst efficiency checks' },
      { id: 'def_derate',  label: 'Remove Speed Derate for Low DEF',      desc: 'Prevents limp mode / 5mph derate when DEF level is low or quality poor' },
    ]
  },
  {
    title: 'Additional Options',
    color: '#888',
    options: [
      { id: 'cat_monitor', label: 'Disable Catalytic Converter Efficiency Monitor', desc: 'Removes O2 sensor catalyst efficiency DTCs (P0420, P0430)' },
      { id: 'sai',         label: 'Disable Secondary Air Injection (SAI)',          desc: 'Removes SAI pump operation and monitoring (petrol vehicles)' },
      { id: 'evap',        label: 'Remove Evaporative Emissions (EVAP) Monitoring', desc: 'Disables fuel tank leak detection and purge valve monitoring' },
      { id: 'speed_lim',   label: 'Remove Speed Limiter',                           desc: 'Removes factory top speed limiter (use with caution)' },
    ]
  }
]

export default function EmissionsDelete({ activeVehicle }: { activeVehicle: ActiveVehicle | null }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }))
  const selectedCount = Object.values(checked).filter(Boolean).length

  const generate = () => {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
    }, 1500)
  }

  const allOptions = SECTIONS.flatMap((s) => s.options)
  const saveConfig = () => {
    const config = { timestamp: new Date().toISOString(), options: checked }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'emissions_config.json'
    a.click()
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>
        <h1>Emissions Delete Tuning</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div className="banner banner-danger" style={{ marginBottom: 20 }}>
        <strong>⚠ FOR OFF-ROAD / COMPETITION USE ONLY — Check local laws before use</strong>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Emissions system modifications may violate EU Regulation 715/2007 and the Road Traffic Act when used on public roads in Ireland.
          These options are provided for off-road and competition vehicles only.
          By using these features, you accept full responsibility for compliance with all applicable laws.
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div className="card" style={{ marginBottom: 16 }} key={section.title}>
          <div style={{ fontWeight: 700, color: section.color, marginBottom: 16, fontSize: 14 }}>
            {section.title}
          </div>
          {section.options.map((opt) => (
            <label key={opt.id} className="checkbox-row" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!checked[opt.id]}
                onChange={() => toggle(opt.id)}
                style={{ width: 16, height: 16, minWidth: 16, marginTop: 2, accentColor: 'var(--accent)' }}
              />
              <div className="checkbox-label">
                <strong>{opt.label}</strong>
                <span>{opt.desc}</span>
                {opt.benefit && <div className="checkbox-benefit">✓ {opt.benefit}</div>}
              </div>
            </label>
          ))}
        </div>
      ))}

      {/* Generate */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Generate Tune File</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          {selectedCount} option{selectedCount !== 1 ? 's' : ''} selected
        </div>

        {generated && (
          <div className="banner banner-info" style={{ marginBottom: 12 }}>
            ✓ Tune configuration generated — ready to write via ECU Cloning
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={generate} disabled={selectedCount === 0 || generating} style={{ flex: 1 }}>
            {generating ? '⏳ Generating...' : '⚡ GENERATE DELETE TUNE'}
          </button>
          <button className="btn btn-secondary" onClick={saveConfig} disabled={selectedCount === 0}>
            💾 SAVE CONFIG
          </button>
          <button className="btn btn-ghost" onClick={() => setChecked({})}>
            ↩ Reset
          </button>
        </div>
      </div>
    </div>
  )
}
