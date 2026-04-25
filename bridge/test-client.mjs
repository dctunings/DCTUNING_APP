import { WebSocket } from 'ws'

const ws = new WebSocket('ws://127.0.0.1:8765', {
  headers: { Origin: 'https://app.dctuning.ie' },
})

const pending = new Map()
let nextId = 1

function send(action, params) {
  const id = `req-${nextId++}`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, action, params }))
  })
}

ws.on('open', async () => {
  console.log('▶ Connected to bridge\n')

  console.log('─ ping ─────────────────────')
  console.log(JSON.stringify(await send('ping'), null, 2))

  console.log('\n─ scan-devices ─────────────')
  try {
    const devices = await send('scan-devices')
    console.log(`Found ${devices.length} J2534 device(s) in Windows registry:`)
    for (const d of devices) {
      console.log(`  • ${d.name}`)
      console.log(`    DLL:    ${d.dll}`)
      console.log(`    Vendor: ${d.vendor || '(none)'}`)
      console.log(`    Exists: ${d.exists ? 'YES' : 'NO (missing)'}`)
      console.log(`    Match:  ${d.known ? `${d.known.brand} ${d.known.model}` : '(unknown)'}`)
      console.log()
    }
  } catch (e) {
    console.error('  Error:', e.message)
  }

  ws.close()
})

ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString())
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  if (m.ok) p.resolve(m.data)
  else p.reject(new Error(m.error))
})

ws.on('error', (e) => console.error('WS error:', e.message))
ws.on('close', () => process.exit(0))
