import { useState } from 'react'
import VehicleStrip from '../components/VehicleStrip'
import type { ActiveVehicle } from '../lib/vehicleContext'
import type { EcuFileState } from '../App'

interface DeleteOption { id: string; label: string; desc: string; benefit?: string; dtcs?: string[] }

const SECTIONS: { title: string; color: string; options: DeleteOption[] }[] = [
  {
    title: 'DPF (Diesel Particulate Filter) Delete',
    color: 'var(--accent)',
    options: [
      { id: 'dpf_regen',   label: 'Disable DPF Regeneration Cycles',          desc: 'Disables active regeneration, removes soot loading parameters',                benefit: 'Reduced exhaust temps, improved fuel economy, eliminates regen issues',   dtcs: ['P2002','P2003','P2452','P2453'] },
      { id: 'dpf_sensor',  label: 'Disable DPF Differential Pressure Sensor', desc: 'Eliminates DPF pressure monitoring and related fault codes',                   dtcs: ['P2452','P2453','P2454','P2455'] },
      { id: 'dpf_temp',    label: 'Disable DPF Temperature Sensors',           desc: 'Disables exhaust temperature monitoring for DPF system',                       dtcs: ['P0544','P0545','P0546','P0547'] },
    ]
  },
  {
    title: 'EGR (Exhaust Gas Recirculation) Delete',
    color: 'var(--accent)',
    options: [
      { id: 'egr_valve',   label: 'Disable EGR Valve Operation',              desc: 'Keeps EGR valve closed, removes EGR flow from combustion',                     benefit: 'Lower intake temps, cleaner intake, improved throttle response',          dtcs: ['P0400','P0401','P0402','P0403','P0404'] },
      { id: 'egr_cooler',  label: 'Disable EGR Cooler Monitoring',            desc: 'Disables EGR cooler efficiency and temperature monitoring',                     dtcs: ['P0406','P0407','P0408'] },
      { id: 'egr_dtcs',    label: 'Delete All EGR DTCs',                      desc: 'Removes codes: P0401–P0408, prevents CEL for missing EGR hardware',            dtcs: ['P0401','P0402','P0403','P0404','P0405','P0406','P0407','P0408'] },
    ]
  },
  {
    title: 'DEF / SCR (AdBlue / Selective Catalytic Reduction) Delete',
    color: 'var(--accent)',
    options: [
      { id: 'def_inject',  label: 'Disable DEF Injection System',             desc: 'Stops AdBlue/DEF fluid injection, removes DEF tank monitoring',                benefit: 'No more DEF refills, removes derate conditions',                          dtcs: ['P20EE','P2047','P2048','P2049','P204B'] },
      { id: 'scr_monitor', label: 'Disable SCR Catalyst Efficiency Monitor',  desc: 'Disables NOx sensor readings and catalyst efficiency checks',                  dtcs: ['P2200','P2201','P229F','P22A0'] },
      { id: 'def_derate',  label: 'Disable Speed Derate for Low DEF',         desc: 'Prevents limp mode / 5mph derate when DEF level is low or quality poor',       dtcs: ['P20C4','P20C5','P20C6'] },
    ]
  },
  {
    title: 'Additional Emissions Options',
    color: '#888',
    options: [
      { id: 'cat_monitor', label: 'Disable Catalytic Converter Monitor',      desc: 'Removes O2 sensor catalyst efficiency DTCs (petrol)',                          dtcs: ['P0420','P0430'] },
      { id: 'sai',         label: 'Disable Secondary Air Injection (SAI)',    desc: 'Removes SAI pump operation and monitoring (petrol vehicles)',                  dtcs: ['P0410','P0411','P0412','P0413'] },
      { id: 'evap',        label: 'Disable EVAP System Monitoring',           desc: 'Disables fuel tank leak detection and purge valve monitoring',                  dtcs: ['P0440','P0441','P0442','P0455','P0456'] },
      { id: 'speed_lim',   label: 'Remove Speed Limiter',                     desc: 'Removes factory top speed limiter — for track/competition use only',           benefit: 'No speed cut at factory vmax (usually 250 km/h)' },
    ]
  }
]

interface Props {
  activeVehicle: ActiveVehicle | null
  ecuFile?: EcuFileState | null
  setPage?: (page: string) => void
}

export default function EmissionsDelete({ activeVehicle, ecuFile, setPage }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  const toggle = (id: string) => { setChecked(c => ({ ...c, [id]: !c[id] })); setGenerated(false) }
  const selectedCount = Object.values(checked).filter(Boolean).length
  const selectedOptions = SECTIONS.flatMap(s => s.options).filter(o => checked[o.id])
  const allDtcs = [...new Set(selectedOptions.flatMap(o => o.dtcs ?? []))]

  const generate = () => {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
      downloadConfig()
    }, 800)
  }

  const downloadConfig = () => {
    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════════╗',
      '║            DCTuning Ireland — Emissions Delete Config        ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      `Generated:     ${new Date().toLocaleString('en-IE')}`,
    ]

    if (ecuFile) {
      lines.push(`ECU File:      ${ecuFile.fileName}`)
      if (ecuFile.detected) {
        lines.push(`ECU Detected:  ${ecuFile.detected.def.name} (${ecuFile.detected.def.family})`)
      }
    }
    if (activeVehicle) {
      lines.push(`Vehicle:       ${activeVehicle.make} ${activeVehicle.model}`)
      if (activeVehicle.engine_code) lines.push(`Engine Code:   ${activeVehicle.engine_code}`)
    }

    lines.push('')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('SELECTED OPTIONS')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    for (const section of SECTIONS) {
      const opts = section.options.filter(o => checked[o.id])
      if (!opts.length) continue
      lines.push('')
      lines.push(`[ ${section.title} ]`)
      for (const o of opts) {
        lines.push(`  ✓ ${o.label}`)
        lines.push(`    ${o.desc}`)
        if (o.benefit) lines.push(`    → ${o.benefit}`)
        if (o.dtcs?.length) lines.push(`    DTCs suppressed: ${o.dtcs.join(', ')}`)
      }
    }

    lines.push('')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('DTCs SUPPRESSED BY THIS CONFIGURATION')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('')
    if (allDtcs.length) {
      lines.push(allDtcs.join('  '))
    } else {
      lines.push('None')
    }

    lines.push('')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('NEXT STEPS')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('')
    lines.push('1. Load your ECU binary in Remap Builder')
    lines.push('2. Load the matching A2L/DRT definition file')
    lines.push('3. Locate the relevant maps (EGR/DPF flags, sensor limits)')
    lines.push('4. Apply modifications using the Performance map editor')
    lines.push('5. Export modified binary and write to ECU via J2534 PassThru')
    lines.push('')
    lines.push('⚠  FOR OFF-ROAD / COMPETITION USE ONLY')
    lines.push('   Emissions modifications may violate EU Reg 715/2007 on public roads.')
    lines.push('')
    lines.push('DCTuning Ireland | app.dctuning.ie | dctunings@gmail.com')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `emissions_delete_config_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>
        <h1>Emissions Delete Tuning</h1>
      </div>

      <VehicleStrip vehicle={activeVehicle} />

      <div className="banner banner-danger" style={{ marginBottom: 20 }}>
        <strong>⚠ FOR OFF-ROAD / COMPETITION USE ONLY</strong>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Emissions modifications may violate EU Regulation 715/2007 and the Road Traffic Act when used on public roads in Ireland. By using these features you accept full responsibility.
        </div>
      </div>

      {/* ECU File status */}
      {ecuFile ? (
        <div className="banner banner-info" style={{ marginBottom: 16 }}>
          ✓ ECU file loaded: <strong>{ecuFile.fileName}</strong>
          {ecuFile.detected && <span style={{ marginLeft: 8, opacity: 0.8 }}>— {ecuFile.detected.def.name}</span>}
        </div>
      ) : (
        <div className="banner banner-warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>No ECU file loaded. Load your ECU binary in Remap Builder first for a targeted config.</span>
          {setPage && (
            <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }} onClick={() => setPage('remap')}>
              Open Remap Builder →
            </button>
          )}
        </div>
      )}

      {SECTIONS.map(section => (
        <div className="card" style={{ marginBottom: 16 }} key={section.title}>
          <div style={{ fontWeight: 700, color: section.color, marginBottom: 16, fontSize: 14 }}>
            {section.title}
          </div>
          {section.options.map(opt => (
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
                {opt.dtcs && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'monospace' }}>Suppresses: {opt.dtcs.join(' · ')}</div>}
              </div>
            </label>
          ))}
        </div>
      ))}

      {/* Generate */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Generate Configuration File</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {selectedCount === 0
            ? 'Select options above to generate a config'
            : `${selectedCount} option${selectedCount !== 1 ? 's' : ''} selected · ${allDtcs.length} DTC${allDtcs.length !== 1 ? 's' : ''} suppressed`}
        </div>

        {generated && (
          <div className="banner banner-info" style={{ marginBottom: 12 }}>
            ✓ Config downloaded — take it to Remap Builder to apply the binary changes
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={generate}
            disabled={selectedCount === 0 || generating}
            style={{ flex: 1 }}
          >
            {generating ? '⏳ Generating...' : '⬇ DOWNLOAD CONFIG'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { setChecked({}); setGenerated(false) }}
            disabled={selectedCount === 0}
          >
            ↩ Reset
          </button>
        </div>
      </div>
    </div>
  )
}
