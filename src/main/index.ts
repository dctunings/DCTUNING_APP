import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import {
  obdConnect,
  obdDisconnect,
  obdIsConnected,
  obdReadVoltage,
  obdReadDTCs,
  obdClearDTCs,
  obdReadPID,
  obdReadAllLivePIDs,
  scanJ2534Devices,
} from './obdManager'

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
  ipcMain.handle('save-ecu-file', async (_, { defaultName }) => {
    const result = await dialog.showSaveDialog({
      title: 'Save ECU File',
      defaultPath: defaultName,
      filters: [{ name: 'ECU Files', extensions: ['bin', 'hex'] }]
    })
    return result.canceled ? null : result.filePath
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
