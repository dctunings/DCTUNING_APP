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

  // ─── VAG signature scanner ────────────────────────────────────────────────
  // Scans a loaded binary against the per-family DAMOS signature catalog (152K sigs across 7 families).
  // Returns the detected ECU family + named map matches with offsets and dimensions.
  vagScanSignatures: (buffer: ArrayBuffer | number[], forceFamily?: string) =>
    ipcRenderer.invoke('vag-scan-signatures', buffer, forceFamily),
  vagCatalogStats: () => ipcRenderer.invoke('vag-catalog-stats'),

  // ─── Recipe library (v3.12.0) ────────────────────────────────────────────
  // Recipe = byte-level delta extracted from an ORI → real-tuner Stage1 pair.
  // Manifest indexes recipes by (partNumber, swNumber, oriHash). Individual
  // recipes are fetched on-demand when the user applies one. Web version uses
  // static-served /recipes/* files; these IPC handlers are desktop equivalent.
  loadRecipeManifest: () => ipcRenderer.invoke('load-recipe-manifest'),
  loadRecipe: (relativePath: string) => ipcRenderer.invoke('load-recipe', relativePath),
  // v3.13.0 map-name multiplier library (Tier 2 of unified Stage Engine)
  loadMapMultipliers: () => ipcRenderer.invoke('load-map-multipliers'),

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

  // ─── AI copilot (v3.14 Phase B.2) ────────────────────────────────────────
  // Thin IPC shims. Renderer can ask the LLM, manage the API key, but never
  // sees the key itself — it lives encrypted in main via safeStorage.
  ai: {
    // Note: content can be a string (simple text) or an array of content blocks
    // (for tool-use turns). Renderer builds the blocks; main just proxies.
    ask: (params: {
      messages: { role: 'user' | 'assistant'; content: unknown }[]
      system?: string
      model?: string
      maxTokens?: number
      tools?: { name: string; description: string; input_schema: Record<string, unknown> }[]
    }) => ipcRenderer.invoke('ai-ask', params),
    hasKey: () => ipcRenderer.invoke('ai-has-key'),
    setKey: (key: string) => ipcRenderer.invoke('ai-set-key', key),
    clearKey: () => ipcRenderer.invoke('ai-clear-key'),
  },

  // ─── Memory store (scanner fingerprint DB) ───────────────────────────────
  // Local SQLite DB of confirmed map fingerprints. Scanner queries it on every
  // load so confirmed maps auto-identify on future binaries. Default location
  // is %APPDATA%/DCTuning/memory.db; user can relocate via `memoryRelocate`
  // to point at a OneDrive / Google Drive folder for free sync.
  memory: {
    status: () => ipcRenderer.invoke('memory-status'),
    relocate: (newPath: string) => ipcRenderer.invoke('memory-relocate', newPath),
    find: (sigHex: string, rows?: number, cols?: number) =>
      ipcRenderer.invoke('memory-find', sigHex, rows, cols),
    save: (entry: unknown) => ipcRenderer.invoke('memory-save', entry),
    markSeen: (id: string) => ipcRenderer.invoke('memory-mark-seen', id),
    remove: (id: string) => ipcRenderer.invoke('memory-delete', id),
    list: (opts?: { limit?: number; offset?: number; ecuFamily?: string; search?: string }) =>
      ipcRenderer.invoke('memory-list', opts),
    exportAll: () => ipcRenderer.invoke('memory-export'),
    importAll: (entries: unknown[]) => ipcRenderer.invoke('memory-import', entries),
    browsePath: () => ipcRenderer.invoke('memory-browse-path'),
  },
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
