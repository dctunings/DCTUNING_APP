import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import { execSync, spawnSync, spawn } from 'child_process'

// Re-launch as Administrator if not already elevated (required for J2534/SmUsb access)
if (process.platform === 'win32' && !is.dev) {
  try {
    execSync('net session', { windowsHide: true, stdio: 'ignore' })
  } catch {
    // Not admin — re-launch elevated via PowerShell
    const exePath = process.execPath
    spawnSync('powershell.exe', [
      '-WindowStyle', 'Hidden',
      '-Command',
      `Start-Process -FilePath "${exePath}" -Verb RunAs`
    ], { windowsHide: true })
    app.quit()
  }
}
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
    title: 'DCTuning Desktop v1.0'
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
    return { path: filePath, name: filePath.split(/[\\/]/).pop(), size: data.length }
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

  // Open a URL in the system default browser
  ipcMain.handle('open-external', async (_, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false }
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
