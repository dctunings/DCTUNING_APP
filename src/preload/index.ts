import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // ─── File I/O ─────────────────────────────────────────────────────────────
  openEcuFile: () => ipcRenderer.invoke('open-ecu-file'),
  saveEcuFile: (opts: { defaultName: string }) => ipcRenderer.invoke('save-ecu-file', opts),
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports'),

  // ─── OBD2 / ELM327 ────────────────────────────────────────────────────────
  obdConnect: (portPath: string) => ipcRenderer.invoke('obd-connect', portPath),
  obdDisconnect: () => ipcRenderer.invoke('obd-disconnect'),
  obdIsConnected: () => ipcRenderer.invoke('obd-is-connected'),
  obdReadVoltage: () => ipcRenderer.invoke('obd-read-voltage'),
  obdReadDTCs: () => ipcRenderer.invoke('obd-read-dtcs'),
  obdClearDTCs: () => ipcRenderer.invoke('obd-clear-dtcs'),
  obdReadPID: (pid: string) => ipcRenderer.invoke('obd-read-pid', pid),
  obdReadAllPIDs: () => ipcRenderer.invoke('obd-read-all-pids'),

  // ─── J2534 ────────────────────────────────────────────────────────────────
  scanJ2534: () => ipcRenderer.invoke('scan-j2534'),

  // ─── Watch Folder (tool integration) ─────────────────────────────────────
  selectWatchFolder: () => ipcRenderer.invoke('select-watch-folder'),
  scanFolderForBins: (folderPath: string) => ipcRenderer.invoke('scan-folder-for-bins', folderPath),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
