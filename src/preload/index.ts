import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { readFileSync } from 'fs'

const api = {
  // ─── File I/O ─────────────────────────────────────────────────────────────
  openEcuFile: () => ipcRenderer.invoke('open-ecu-file'),
  // Read a file directly in the preload context — bypasses IPC serialization.
  // Returns ArrayBuffer which transfers to renderer without copying.
  // This handles 4MB+ files that would choke the IPC JSON serialization.
  readFileDirect: (filePath: string): ArrayBuffer => {
    const data = readFileSync(filePath)
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  },
  saveEcuFile: (opts: { defaultName: string; buffer: number[] }) => ipcRenderer.invoke('save-ecu-file', opts),
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

  // ─── J2534 registry scan ─────────────────────────────────────────────────
  scanJ2534: () => ipcRenderer.invoke('scan-j2534'),

  // ─── J2534 DLL bridge ────────────────────────────────────────────────────
  j2534Open: (dllPath: string) => ipcRenderer.invoke('j2534-open', dllPath),
  j2534Connect: (protocol: number, baud: number) => ipcRenderer.invoke('j2534-connect', protocol, baud),
  j2534Close: () => ipcRenderer.invoke('j2534-close'),
  j2534IsOpen: () => ipcRenderer.invoke('j2534-is-open'),
  j2534IsConnected: () => ipcRenderer.invoke('j2534-is-connected'),
  j2534ReadDTCs: (protocol: number) => ipcRenderer.invoke('j2534-read-dtcs', protocol),
  j2534ClearDTCs: (protocol: number) => ipcRenderer.invoke('j2534-clear-dtcs', protocol),
  j2534ReadLivePIDs: (protocol: number) => ipcRenderer.invoke('j2534-read-live-pids', protocol),
  j2534ReadECUID: () => ipcRenderer.invoke('j2534-read-ecu-id'),
  j2534ReadECUFlash: (startAddr: number, totalLen: number, chunkSize: number, protocol: number) =>
    ipcRenderer.invoke('j2534-read-ecu-flash', startAddr, totalLen, chunkSize, protocol),
  j2534WriteECUFlash: (dataArr: number[], startAddr: number, chunkSize: number, protocol: number, ecuId: string) =>
    ipcRenderer.invoke('j2534-write-ecu-flash', dataArr, startAddr, chunkSize, protocol, ecuId),
  j2534CalcKey: (ecuId: string, seedHex: string) => ipcRenderer.invoke('j2534-calc-key', ecuId, seedHex),
  j2534GetECUDefinitions: () => ipcRenderer.invoke('j2534-get-ecu-definitions'),
  onJ2534Progress: (cb: (data: { pct: number; msg: string }) => void) => {
    ipcRenderer.on('j2534-progress', (_event, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('j2534-progress')
  },

  // ─── Watch Folder (tool integration) ─────────────────────────────────────
  selectWatchFolder: () => ipcRenderer.invoke('select-watch-folder'),
  scanFolderForBins: (folderPath: string) => ipcRenderer.invoke('scan-folder-for-bins', folderPath),

  // ─── File Utilities ───────────────────────────────────────────────────────
  readFileBytes: (filePath: string, maxBytes: number) => ipcRenderer.invoke('read-file-bytes', filePath, maxBytes),
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
