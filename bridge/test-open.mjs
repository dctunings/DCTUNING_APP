// test-open.mjs — try opening the Scanmatik DLL via the bridge.
// Safe even without a vehicle connected: PassThruOpen just initialises the
// J2534 interface; it doesn't try to talk to a car.

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

  // 1. Find the Scanmatik DLL via registry
  console.log('─ scan-devices ─────────────────')
  const devices = await send('scan-devices')
  const scanmatik = devices.find(d => d.exists && /scanmatik/i.test(d.name + d.dll))
  if (!scanmatik) {
    console.error('  ✗ No Scanmatik DLL found on disk')
    ws.close()
    return
  }
  console.log(`  Target: ${scanmatik.name}`)
  console.log(`  DLL:    ${scanmatik.dll}`)
  console.log(`  64-bit: ${scanmatik.is64bit}`)
  console.log()

  // 2. Try to open
  console.log('─ j2534-open ──────────────────')
  console.log('  Spawning j2534helper.exe → PInvoke PassThruOpen...')
  const openStart = Date.now()
  try {
    const result = await send('j2534-open', { dllPath: scanmatik.dll })
    console.log(`  Took ${Date.now() - openStart}ms`)
    console.log(`  ${JSON.stringify(result, null, 2)}`)
  } catch (e) {
    console.error(`  ✗ Open failed (${Date.now() - openStart}ms): ${e.message}`)
  }

  // 3. Always try to close cleanly even if open failed (it's a no-op then)
  console.log('\n─ j2534-close ─────────────────')
  try {
    const result = await send('j2534-close')
    console.log(`  ${JSON.stringify(result)}`)
  } catch (e) {
    console.error(`  ✗ Close error: ${e.message}`)
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
