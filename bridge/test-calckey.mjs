// test-calckey.mjs — verify all bridge seed/key algorithms with correct IDs
import { WebSocket } from 'ws'
const ws = new WebSocket('ws://127.0.0.1:8765', { headers: { Origin: 'https://app.dctuning.ie' }})
const pending = new Map(); let nextId = 1
const send = (action, params) => new Promise((resolve, reject) => {
  const id = `req-${nextId++}`; pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, action, params }))
})
ws.on('open', async () => {
  console.log('▶ Calc-key algorithm validation\n')
  const cases = [
    { ecuId: 'bosch_me7_vag',         seedHex: '12 34',           label: 'ME7 (1.8T/2.0T)' },
    { ecuId: 'bosch_med9_vag',        seedHex: '1F 2E',           label: 'MED9 (FSI/TFSI)' },
    { ecuId: 'bosch_med17_vag',       seedHex: '01 02 03 04',     label: 'MED17 (Golf 5/6/7) 4-byte seed' },
    { ecuId: 'bosch_med17_vag',       seedHex: '12 34',           label: 'MED17 2-byte seed variant' },
    { ecuId: 'bosch_edc16_vag',       seedHex: 'FF EE',           label: 'EDC16 (TDI)' },
    { ecuId: 'bosch_edc17_vag',       seedHex: '12 34 56 78',     label: 'EDC17 (TDI common-rail)' },
    { ecuId: 'siemens_sid803',        seedHex: 'AB CD',           label: 'SID803 (PSA TDI)' },
    { ecuId: 'delphi_dcm35',          seedHex: '11 22',           label: 'Delphi DCM3.5' },
    { ecuId: 'marelli_mjd8',          seedHex: '33 44',           label: 'Marelli MJD8' },
    { ecuId: 'bosch_msd80_bmw',       seedHex: '55 66',           label: 'MSD80 (BMW N54)' },
    { ecuId: 'continental_ems3125',   seedHex: '77 88',           label: 'Continental EMS3125' },
  ]
  let ok = 0, fail = 0
  for (const c of cases) {
    process.stdout.write(`  ${c.label.padEnd(40)} `)
    try {
      const r = await send('j2534-calc-key', { ecuId: c.ecuId, seedHex: c.seedHex })
      if (r.ok && r.key && r.key.length > 0) {
        const hex = r.key.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
        console.log(`✓ key=${hex}`); ok++
      } else {
        console.log(`✗ ${r.error || 'no key'}`); fail++
      }
    } catch (e) { console.log(`✗ ${e.message}`); fail++ }
  }
  console.log(`\n  ${ok}/${cases.length} algorithms returned a key`)
  ws.close()
})
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString())
  const p = pending.get(m.id); if (!p) return
  pending.delete(m.id)
  if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error))
})
ws.on('close', () => process.exit(0))
