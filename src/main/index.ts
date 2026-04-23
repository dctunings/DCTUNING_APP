import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import { spawn } from 'child_process'

// NOTE: previously here was a block that auto-relaunched the app as Administrator on
// every startup (net session check → PowerShell Start-Process -Verb RunAs → app.quit()).
// That block is what caused the 'runs twice' install/launch experience — every launch
// of DCTuning killed the fresh process and spawned a new admin instance via UAC.
// Removed in v3.5.20. App now runs at the privilege it was launched with. For J2534
// hardware operations that need admin, user right-clicks DCTuning shortcut → Run as
// administrator. Remap builder (offline file editing) works without admin.
import {
  obdConnect,
  obdDisconnect,
  obdIsConnected,
  obdReadVoltage,
  obdReadDTCs,
  obdClearDTCs,
  obdReadPID,
  obdReadAllLivePIDs,
} from './obdManager'
import { memoryStore } from './memoryStore'
import type { FingerprintEntry } from './memoryStore'
import {
  scanJ2534Devices,
  j2534Open,
  j2534Connect,
  j2534Close,
  j2534IsOpen,
  j2534IsConnected,
  j2534ReadDTCs,
  j2534ClearDTCs,
  j2534ReadLivePIDs,
  j2534ReadECUID,
  j2534ReadECUFlash,
  j2534WriteECUFlash,
  type ECUIdentification,
} from './j2534Manager'
import { scanSignatures, getCatalogStats } from './vagSignatureScanner'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    backgroundColor: '#0a0a0a',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'DCTuning'
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('ie.dctuning.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: Open file dialog for ECU files
  ipcMain.handle('open-ecu-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select ECU File',
      filters: [{ name: 'ECU Files', extensions: ['bin', 'hex', 'ori', 'sgo', 'damos', 'kp', 'frf'] }],
      properties: ['openFile']
    })
    if (result.canceled) return null
    const filePath = result.filePaths[0]
    const data = fs.readFileSync(filePath)
    // Return buffer as number array for IPC transfer.
    // For 4MB files this is ~32MB heap but it works reliably across Electron IPC.
    return {
      path: filePath,
      name: filePath.split(/[\\/]/).pop(),
      size: (data as Buffer).length,
      buffer: Array.from(data as unknown as Uint8Array),
    }
  })

  // IPC: Pick a watch folder
  ipcMain.handle('select-watch-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Tool Output Folder to Watch',
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // IPC: Scan a folder for ECU binary files
  // Recognises output from KESS3, K-TAG, Flex, Autotuner, CMDFlash, BFlash, PCMFlash, KT200 etc.
  const ECU_EXTENSIONS = new Set(['bin', 'hex', 'ori', 'sgo', 'damos', 'kp', 'frf', 'mot', 'srec'])
  ipcMain.handle('scan-folder-for-bins', async (_, folderPath: string) => {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true })
      return entries
        .filter((e) => {
          if (!e.isFile()) return false
          const ext = e.name.split('.').pop()?.toLowerCase() ?? ''
          return ECU_EXTENSIONS.has(ext)
        })
        .map((e) => {
          const fullPath = `${folderPath}\\${e.name}`
          let size = 0
          let mtime = ''
          try {
            const stat = fs.statSync(fullPath)
            size = stat.size
            mtime = stat.mtime.toISOString()
          } catch { /* ignore */ }
          return { name: e.name, path: fullPath, size, mtime }
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime)) // newest first
    } catch {
      return []
    }
  })

  // IPC: Save file dialog
  ipcMain.handle('save-ecu-file', async (_, { defaultName, buffer }: { defaultName: string; buffer: number[] }) => {
    const ext = defaultName.split('.').pop()?.toLowerCase() || 'bin'
    const result = await dialog.showSaveDialog({
      title: 'Save ECU File',
      defaultPath: defaultName,
      filters: [
        { name: 'ECU Files', extensions: ['bin', 'ori', 'hex', 'map', 'damos', 'kp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePath) return { ok: false }
    fs.writeFileSync(result.filePath, Buffer.from(buffer))
    return { ok: true, filePath: result.filePath }
  })

  // IPC: List serial ports
  ipcMain.handle('list-serial-ports', async () => {
    try {
      const { SerialPort } = await import('serialport')
      const ports = await SerialPort.list()
      return ports
    } catch {
      return []
    }
  })

  // ─── OBD2 / ELM327 IPC handlers ──────────────────────────────────────────
  ipcMain.handle('obd-connect', async (_, portPath: string) => {
    return obdConnect(portPath)
  })

  ipcMain.handle('obd-disconnect', () => {
    obdDisconnect()
    return { ok: true }
  })

  ipcMain.handle('obd-is-connected', () => {
    return obdIsConnected()
  })

  ipcMain.handle('obd-read-voltage', async () => {
    return obdReadVoltage()
  })

  ipcMain.handle('obd-read-dtcs', async () => {
    return obdReadDTCs()
  })

  ipcMain.handle('obd-clear-dtcs', async () => {
    return obdClearDTCs()
  })

  ipcMain.handle('obd-read-pid', async (_, pid: string) => {
    return obdReadPID(pid)
  })

  ipcMain.handle('obd-read-all-pids', async () => {
    return obdReadAllLivePIDs()
  })

  ipcMain.handle('scan-j2534', () => {
    return scanJ2534Devices()
  })

  // ─── J2534 DLL bridge IPC handlers ───────────────────────────────────────
  ipcMain.handle('j2534-open', async (_, dllPath: string) => j2534Open(dllPath))
  ipcMain.handle('j2534-connect', async (_, protocol: number, baud: number) => j2534Connect(protocol, baud))
  ipcMain.handle('j2534-close', async () => { await j2534Close(); return { ok: true } })
  ipcMain.handle('j2534-is-open', () => j2534IsOpen())
  ipcMain.handle('j2534-is-connected', () => j2534IsConnected())
  ipcMain.handle('j2534-read-dtcs', async (_, protocol: number) => j2534ReadDTCs(protocol))
  ipcMain.handle('j2534-clear-dtcs', async (_, protocol: number) => j2534ClearDTCs(protocol))
  ipcMain.handle('j2534-read-live-pids', async (_, protocol: number) => j2534ReadLivePIDs(protocol))

  // ECU identification (UDS DIDs — no security access required)
  ipcMain.handle('j2534-read-ecu-id', async () => j2534ReadECUID())

  // ECU flash read with progress streaming
  ipcMain.handle('j2534-read-ecu-flash', async (event, startAddr: number, totalLength: number, chunkSize: number, protocol: number) => {
    return j2534ReadECUFlash(
      startAddr,
      totalLength,
      chunkSize,
      (pct, msg) => event.sender.send('j2534-progress', { pct, msg }),
      protocol
    )
  })

  // ECU flash write with progress streaming — data arrives as number array (Uint8Array not IPC-serialisable)
  ipcMain.handle('j2534-write-ecu-flash', async (event, dataArr: number[], startAddr: number, chunkSize: number, protocol: number, ecuId: string) => {
    const data = new Uint8Array(dataArr)
    return j2534WriteECUFlash(
      data,
      startAddr,
      chunkSize,
      (pct, msg) => event.sender.send('j2534-progress', { pct, msg }),
      protocol,
      ecuId
    )
  })

  // Seed/key calculator - standalone (for testing/debugging)
  ipcMain.handle('j2534-calc-key', async (_, ecuId: string, seedHex: string) => {
    const { calculateKey } = await import('./ecuSeedKey')
    const seedBytes = seedHex.replace(/\s+/g, '').match(/.{2}/g)?.map(h => parseInt(h, 16)) ?? []
    return calculateKey(ecuId, seedBytes)
  })

  ipcMain.handle('j2534-get-ecu-definitions', async () => {
    const { ECU_FLASH_DEFINITIONS } = await import('./ecuSeedKey')
    return ECU_FLASH_DEFINITIONS
  })

  // ─── Driver setup IPC ────────────────────────────────────────────────────────

  // Returns path to a bundled driver file in resources/drivers/
  const driverPath = (filename: string): string =>
    is.dev
      ? join(__dirname, '../../resources/drivers', filename)
      : join(process.resourcesPath, 'drivers', filename)

  // Check if a USB device is present by VID/PID using PowerShell
  ipcMain.handle('driver-check-device', async (_, vidPid: string) => {
    try {
      const result = execSync(
        `powershell -NoProfile -Command "Get-PnpDevice | Where-Object { $_.InstanceId -like '*${vidPid}*' -and $_.Status -eq 'OK' } | Select-Object -First 1 FriendlyName,Status | ConvertTo-Json"`,
        { windowsHide: true, encoding: 'utf8', timeout: 5000 }
      ).trim()
      if (!result || result === 'null') return { present: false }
      const parsed = JSON.parse(result)
      return { present: true, name: parsed?.FriendlyName || vidPid }
    } catch {
      return { present: false }
    }
  })

  // Check if a driver INF is present in the Windows Driver Store
  ipcMain.handle('driver-check-installed', async (_, driverName: string) => {
    try {
      const result = execSync(
        `powershell -NoProfile -Command "Get-WmiObject Win32_PnPSignedDriver | Where-Object { $_.DeviceName -like '*${driverName}*' -or $_.InfName -like '*${driverName}*' } | Select-Object -First 1 DeviceName | ConvertTo-Json"`,
        { windowsHide: true, encoding: 'utf8', timeout: 8000 }
      ).trim()
      return { installed: !!(result && result !== 'null') }
    } catch {
      return { installed: false }
    }
  })

  // Run a bundled driver installer — returns { ok, error }
  ipcMain.handle('driver-install', async (_, driverFile: string) => {
    const exePath = driverPath(driverFile)
    if (!fs.existsSync(exePath)) {
      return { ok: false, error: `Driver file not found: ${driverFile}` }
    }
    return new Promise((resolve) => {
      const proc = spawn(exePath, [], { windowsHide: false, detached: false })
      proc.on('close', (code) => {
        resolve({ ok: code === 0, code })
      })
      proc.on('error', (err) => {
        resolve({ ok: false, error: err.message })
      })
    })
  })

  // VAG signature scanner — finds DAMOS-named maps in a loaded binary by matching
  // against per-family signature catalogs bundled in resources/vag-signatures/.
  // Returns the detected ECU family + list of identified maps with offsets, dims, and names.
  ipcMain.handle('vag-scan-signatures', async (_, buffer: ArrayBuffer | number[], forceFamily?: string) => {
    try {
      const buf = Array.isArray(buffer) ? Buffer.from(buffer) : Buffer.from(buffer)
      const fam = (forceFamily && typeof forceFamily === 'string') ? forceFamily : undefined
      // @ts-expect-error — runtime-checked family string
      const result = scanSignatures(buf, fam)
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  ipcMain.handle('vag-catalog-stats', () => {
    try {
      return { ok: true, stats: getCatalogStats() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // v3.12.0: Recipe library — serves the 389KB manifest (of ~2,231 tune recipes)
  // and individual recipe JSON files from resources/recipes/. Web version does the
  // equivalent via HTTP fetch from static-served /recipes/manifest.json.
  const resolveRecipePath = (rel = ''): string => {
    const candidates = [
      join(process.resourcesPath || '', 'recipes', rel),
      join(__dirname, '..', '..', 'resources', 'recipes', rel),
      join(__dirname, '..', '..', '..', 'resources', 'recipes', rel),
    ]
    for (const p of candidates) if (fs.existsSync(p)) return p
    return candidates[candidates.length - 1]
  }
  ipcMain.handle('load-recipe-manifest', async () => {
    try {
      const p = resolveRecipePath('manifest.json')
      if (!fs.existsSync(p)) return { ok: true, manifest: [] }
      const manifest = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ok: true, manifest }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  // v3.13.0: Map-name multiplier library — learned-from-corpus Stage N multipliers
  // keyed by DAMOS map name. Tier 2 of the Stage Engine when no exact recipe exists.
  ipcMain.handle('load-map-multipliers', async () => {
    try {
      const candidates = [
        join(process.resourcesPath || '', 'map-multipliers.json'),
        join(__dirname, '..', '..', 'resources', 'map-multipliers.json'),
        join(__dirname, '..', '..', '..', 'resources', 'map-multipliers.json'),
      ]
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const entries = JSON.parse(fs.readFileSync(p, 'utf8'))
          return { ok: true, entries }
        }
      }
      return { ok: true, entries: [] }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  ipcMain.handle('load-recipe', async (_, relativePath: string) => {
    try {
      // Basic path-traversal guard — only allow paths inside the recipes/ folder
      if (typeof relativePath !== 'string' || relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        return { ok: false, error: 'invalid recipe path' }
      }
      const p = resolveRecipePath(relativePath)
      if (!fs.existsSync(p)) return { ok: false, error: 'recipe not found' }
      const recipe = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ok: true, recipe }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Open a URL in the system default browser
  ipcMain.handle('open-external', async (_, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false }
  })

  // Read first N bytes of a file — used by Tune Manager hex inspector
  ipcMain.handle('read-file-bytes', async (_, filePath: string, maxBytes: number) => {
    try {
      const stat = fs.statSync(filePath)
      const readLen = Math.min(maxBytes, stat.size)
      const buf = Buffer.alloc(readLen)
      const fd = fs.openSync(filePath, 'r')
      fs.readSync(fd, buf, 0, readLen, 0)
      fs.closeSync(fd)
      return { ok: true, bytes: Array.from(buf), size: stat.size }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // List which bundled drivers are available on disk
  ipcMain.handle('driver-list-bundled', async () => {
    const driversDir = is.dev
      ? join(__dirname, '../../resources/drivers')
      : join(process.resourcesPath, 'drivers')
    try {
      return fs.readdirSync(driversDir).map((f) => ({
        file: f,
        path: join(driversDir, f),
        size: fs.statSync(join(driversDir, f)).size,
      }))
    } catch {
      return []
    }
  })

  // ─── Memory store (scanner fingerprint DB) ─────────────────────────────────
  // Lazy-open at the default path on first call. User can relocate via
  // 'memory-relocate' (points the DB at a OneDrive / Google Drive folder for
  // free multi-device sync + backup without any cloud code on our side).
  try { memoryStore.init() } catch (e) { console.error('memory-store init failed', e) }

  ipcMain.handle('memory-status', async () => {
    try { return { ok: true, ...memoryStore.status(), defaultPath: memoryStore.defaultPath() } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('memory-relocate', async (_, newPath: string) => {
    try { return { ok: true, ...memoryStore.init(newPath) } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('memory-find', async (_, sigHex: string, rows?: number, cols?: number) => {
    try { return { ok: true, entries: memoryStore.find(sigHex, rows, cols) } }
    catch (e: any) { return { ok: false, error: e.message, entries: [] } }
  })
  ipcMain.handle('memory-save', async (_, entry: FingerprintEntry) => {
    try { return { ok: true, entry: memoryStore.save(entry) } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('memory-mark-seen', async (_, id: string) => {
    try { memoryStore.markSeen(id); return { ok: true } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('memory-delete', async (_, id: string) => {
    try { return { ok: true, deleted: memoryStore.deleteById(id) } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('memory-list', async (_, opts) => {
    try { return { ok: true, ...memoryStore.list(opts ?? {}) } }
    catch (e: any) { return { ok: false, error: e.message, entries: [], total: 0 } }
  })
  ipcMain.handle('memory-export', async () => {
    try { return { ok: true, entries: memoryStore.exportAll() } }
    catch (e: any) { return { ok: false, error: e.message, entries: [] } }
  })
  ipcMain.handle('memory-import', async (_, entries: FingerprintEntry[]) => {
    try { return { ok: true, ...memoryStore.importAll(entries) } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('memory-browse-path', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose folder for memory.db (e.g. a OneDrive or Google Drive folder to enable sync)',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
    return { ok: true, path: join(result.filePaths[0], 'memory.db') }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
