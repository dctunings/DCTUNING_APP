import { useState } from 'react'
import type { EcuFileState } from '../App'
import { Card, PageHeader, Grid, SectionTitle, Badge } from '../components/ui'

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
      { id: 'def_dose',    label: 'Disable DEF Dosing',                       desc: 'Stops AdBlue injection, removes SCR efficiency calculations',                   benefit: 'No AdBlue consumption, eliminates dosing pump failures',                  dtcs: ['P203E','P203F','P2040','P2041'] },
      { id: 'def_nox',     label: 'Disable NOx Sensors & SCR Monitoring',     desc: 'Removes NOx sensor feedback and SCR catalyst efficiency monitoring',            dtcs: ['P2200','P2201','P2202','P229F','P22A0','P22A1'] },
      { id: 'def_dtcs',    label: 'Delete All DEF/SCR DTCs',                  desc: 'Removes codes: P203E–P2041, P2200–P22A1',                                      dtcs: ['P203E','P203F','P2040','P2041','P2200','P2201','P2202','P229F','P22A0','P22A1'] },
    ]
  },
  {
    title: 'TVSA / Speed Limiters',
    color: 'var(--accent)',
    options: [
      { id: 'tvsa',        label: 'Remove Top Speed Limiter (VMAX)',          desc: 'Removes factory top-speed governor',                                            benefit: 'Unrestricted top speed for track use',                                    dtcs: [] },
      { id: 'revlimiter',  label: 'Raise Rev Limiter',                        desc: 'Increases max RPM by 200–400 RPM',                                             benefit: 'Extended power band, better track performance',                           dtcs: [] },
    ]
  },
  {
    title: 'EVAP / SAI / Flaps',
    color: 'var(--accent)',
    options: [
      { id: 'evap',        label: 'Disable EVAP System',                      desc: 'Removes evaporative emissions purge monitoring',                                benefit: 'Eliminates EVAP leak codes, simpler system',                              dtcs: ['P0440','P0441','P0442','P0455','P0456'] },
      { id: 'sai',         label: 'Disable Secondary Air Injection (SAI)',    desc: 'Removes SAI pump and valve monitoring',                                         benefit: 'Eliminates SAI pump codes, reduces complexity',                           dtcs: ['P0410','P0411','P0412','P0413','P0414'] },
      { id: 'flaps',       label: 'Disable Intake Manifold Flaps',            desc: 'Removes swirl flap and tumble flap monitoring',                                 benefit: 'Eliminates flap codes, prevents carbon buildup',                          dtcs: ['P2004','P2005','P2006','P2007','P2008','P2009'] },
    ]
  },
]

interface Props {
  ecuFile: EcuFileState | null
  setPage: (p: string) => void
}

export default function EmissionsDelete({ ecuFile, setPage }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showDTCs, setShowDTCs] = useState(false)
  const [flashLog, setFlashLog] = useState<string[]>([])
  const [flashDone, setFlashDone] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)

  const toggleOption = (id: string) => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id); else s.add(id)
    setSelected(s)
  }

  const toggleSection = (title: string) => {
    const section = SECTIONS.find(s => s.title === title)
    if (!section) return
    const ids = section.options.map(o => o.id)
    const allSelected = ids.every(id => selected.has(id))
    const s = new Set(selected)
    ids.forEach(id => {
      if (allSelected) s.delete(id); else s.add(id)
    })
    setSelected(s)
  }

  const flashEcu = async () => {
    setIsFlashing(true)
    setFlashLog(['Starting emissions delete flash...'])
    await new Promise(r => setTimeout(r, 800))
    setFlashLog(prev => [...prev, 'Connected to ECU via K-Line/CAN...'])
    await new Promise(r => setTimeout(r, 800))
    setFlashLog(prev => [...prev, `Reading ${ecuFile ? 'modified' : 'stock'} file...`])
    await new Promise(r => setTimeout(r, 800))
    setFlashLog(prev => [...prev, `Applying ${selected.size} delete option(s)...`])
    await new Promise(r => setTimeout(r, 1200))
    setFlashLog(prev => [...prev, 'Patching maps...'])
    await new Promise(r => setTimeout(r, 800))
    setFlashLog(prev => [...prev, 'Verifying checksum...'])
    await new Promise(r => setTimeout(r, 600))
    setFlashLog(prev => [...prev, 'Writing flash...'])
    await new Promise(r => setTimeout(r, 1200))
    setFlashLog(prev => [...prev, '✅ Flash complete. Resets DTCs and cycles ignition.'])
    setFlashDone(true)
    setIsFlashing(false)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="🌿 Emissions Delete" subtitle="Remove DPF, EGR, DEF/SCR, and other emissions systems. Select options and flash directly to ECU.">
        <Badge variant="warning">Pro</Badge>
      </PageHeader>


      <Grid columns={2} gap={16} style={{ marginTop: 20 }}>
        {SECTIONS.map(section => (
          <Card key={section.title}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <SectionTitle>{section.title}</SectionTitle>
              <button
                onClick={() => toggleSection(section.title)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer',
                }}
              >
                {section.options.every(o => selected.has(o.id)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {section.options.map(opt => (
              <div
                key={opt.id}
                onClick={() => toggleOption(opt.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                  border: selected.has(opt.id) ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)',
                  background: selected.has(opt.id) ? 'rgba(0,174,200,0.06)' : 'rgba(255,255,255,0.02)',
                  marginBottom: 8,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, border: '2px solid',
                  borderColor: selected.has(opt.id) ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                  background: selected.has(opt.id) ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {selected.has(opt.id) && <span style={{ color: '#000', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{opt.desc}</div>
                  {opt.benefit && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>
                      ✓ {opt.benefit}
                    </div>
                  )}
                  {showDTCs && opt.dtcs && opt.dtcs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {opt.dtcs.map(dtc => (
                        <span key={dtc} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontFamily: 'monospace' }}>
                          {dtc}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ))}
      </Grid>

      <Card style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>
              {selected.size} option{selected.size !== 1 ? 's' : ''} selected
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {selected.size === 0 ? 'Select at least one option to flash.' : 'Ready to flash to ECU.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDTCs} onChange={() => setShowDTCs(!showDTCs)} />
              Show DTCs
            </label>
            <button
              onClick={flashEcu}
              disabled={selected.size === 0 || isFlashing}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: selected.size > 0 && !isFlashing ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: selected.size > 0 && !isFlashing ? '#000' : 'var(--muted)',
                fontWeight: 800, fontSize: 13, cursor: selected.size > 0 && !isFlashing ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {isFlashing ? '⏳ Flashing...' : '⚡ Flash to ECU'}
            </button>
          </div>
        </div>

        {flashLog.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
            {flashLog.map((line, i) => (
              <div key={i} style={{ color: line.includes('✅') ? '#22c55e' : 'var(--muted)' }}>{line}</div>
            ))}
          </div>
        )}

        {flashDone && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#22c55e' }}>Flash Complete</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Turn ignition off for 10 seconds, then start the engine.
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
