/**
 * scanmatikWebSerial.ts — v3.16.0 WIP
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct Web Serial driver for Scanmatik 2 / PCMTuner (clone) hardware. Lets
 * the web app at app.dctuning.ie talk to the device WITHOUT going through the
 * J2534 DLL — bypasses the entire desktop-app dependency for ECU read/write/
 * unlock/cloning operations.
 *
 *   ┌─ Old path (desktop-only) ────────────────────────────────────────────┐
 *   │ Renderer → IPC → 32-bit PowerShell → C# PInvoke → sm2j2534.dll       │
 *   │ → FTDI USB driver → Scanmatik hardware                               │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 *   ┌─ New path (this file — works in browser) ────────────────────────────┐
 *   │ Renderer → Web Serial API → FTDI virtual COM port → Scanmatik hw     │
 *   │              ↑                                                       │
 *   │     Scanmatik binary protocol implemented directly in JS             │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Prerequisite: User installs Scanmatik driver v2.21.21/22 (creates the FTDI
 * virtual COM port). Same install used by the desktop app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two layers:
 *   1. Scanmatik wire protocol  (binary frames over the FTDI virtual COM port)
 *      → device-specific, proprietary, partially documented in tuning forums
 *      → TODO sections below need USB-captured byte sequences from the desktop
 *        path (which works) to be filled in
 *   2. UDS / ISO 15765-2  (standard ISO 14229 diagnostic services)
 *      → fully implemented in this file
 *      → once layer 1 can send/receive raw CAN frames, layer 2 just works
 *
 * Iteration model: connect via Web Serial → enable rxLog → run the same
 * operation through the desktop DLL path with USB sniffer (Wireshark+USBPcap)
 * → diff captured bytes against this file's protocol commands → fill TODOs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  HARDWARE FINGERPRINTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scanmatik 2 / PCMTuner clones use FTDI USB-to-serial chips.
 *   - Scanmatik 2 PRO       — FT232RL  (VID 0x0403, PID 0x6001)
 *   - PCMTuner clones       — FT2232H  (VID 0x0403, PID 0x6010 or 0x6011)
 *   - Some Scanmatik clones — FT4232H  (VID 0x0403, PID 0x6011)
 *
 * Other J2534 devices are NOT supported by this driver. CarDAQ-Plus, OpenPort,
 * Mongoose, MagicMotorSport Flex all use different protocols and would each
 * need their own scanXxxWebSerial.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types matching the existing j2534Manager IPC surface ───────────────────

export interface ConnectResult {
  ok: boolean
  info?: string          // free-form device info string (firmware version, etc.)
  error?: string
}

export interface UDSResult {
  ok: boolean
  data?: number[]        // response payload (without service ID echo)
  serviceId?: number     // the positive-response service ID (request + 0x40)
  nrcCode?: number       // negative response code if !ok
  raw?: string           // hex string of the full response (for debugging)
  error?: string
}

export interface ECUIdentification {
  partNumber?: string    // F1 87 — VW spare part number
  swVersion?: string     // F1 89
  hwVersion?: string     // F1 91
  vin?: string           // F1 90
  systemName?: string    // F1 97
  ecuPart?: string       // F1 87 alias
  flashSize?: number     // bytes (computed from address ranges)
  securityLevel?: number // last successfully unlocked level (0 = locked)
  raw?: Record<string, string>  // all raw DIDs we read, hex-encoded
}

// J2534 protocol IDs (matching the desktop manager)
export const PROTOCOL = {
  J1850VPW:  1,
  J1850PWM:  2,
  ISO9141:   3,
  ISO14230:  4,
  CAN:       5,
  ISO15765:  6,  // most common for modern UDS
  SCI_A_ENGINE: 7,
} as const
export type ProtocolId = typeof PROTOCOL[keyof typeof PROTOCOL]

// ── Frame helpers ──────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array | number[]): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b)
  return Array.from(arr).map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}
function hexToBytes(s: string): number[] {
  return s.replace(/\s+/g, '').match(/.{2}/g)?.map(h => parseInt(h, 16)) ?? []
}

// CRC-8 placeholder — Scanmatik 2 uses a specific polynomial/init pair that
// must be confirmed against captured frames. Common candidates:
//   - CRC-8/MAXIM   (0x31, init 0x00)
//   - CRC-8/CCITT   (0x07, init 0x00)
//   - Sum-byte XOR  (no polynomial, just XOR of all bytes)
// TODO[scanmatik-protocol]: confirm against capture
function crc8(bytes: number[]): number {
  // Provisional: sum-byte XOR (works as a placeholder; real protocol may differ)
  let c = 0
  for (const b of bytes) c ^= b
  return c & 0xff
}

// ── Scanmatik wire protocol (LAYER 1 — proprietary, partially TODO) ────────
// Frame format inferred from public reverse-engineering work (PCMFlash/openecu
// community). All multi-byte values are big-endian.
//
//     ┌──────┬──────────┬──────┬──────────┬──────┐
//     │ STX  │  LEN(2)  │ CMD  │ DATA[..] │ CRC  │
//     │ 0x02 │  hi  lo  │      │          │      │
//     └──────┴──────────┴──────┴──────────┴──────┘
//
// LEN counts CMD + DATA bytes (not STX or CRC). CRC algorithm TODO above.

const STX = 0x02

const CMD = {
  // TODO[scanmatik-protocol]: verify all command codes against USB capture.
  // The values below are INFERRED from public PCMFlash docs and may be wrong
  // — DO NOT ship without capture verification.
  PING:           0x00,  // device-alive heartbeat
  GET_VERSION:    0x01,  // returns firmware string
  OPEN:           0x10,  // initialise device (J2534 PassThruOpen equivalent)
  CLOSE:          0x11,  // J2534 PassThruClose
  CONFIG_CHANNEL: 0x20,  // PassThruConnect — protocol/baud
  CLOSE_CHANNEL:  0x21,  // PassThruDisconnect
  SET_FILTER:     0x22,  // PassThruStartMsgFilter
  SEND_FRAME:     0x30,  // PassThruWriteMsgs (single CAN frame)
  RECV_FRAME:     0x31,  // poll/read — returns next pending RX frame
  // … many more — flash mode entry, voltage measure, etc.
} as const

function buildFrame(cmd: number, data: number[] = []): Uint8Array {
  const len = 1 + data.length
  const body = [(len >> 8) & 0xff, len & 0xff, cmd, ...data]
  const crc = crc8([cmd, ...data])
  return new Uint8Array([STX, ...body, crc])
}

// ── ISO 15765-2 (CAN-TP) framing — LAYER 2, fully implemented ──────────────
// Splits a UDS payload into CAN frames (single, first, consecutive) and
// reassembles responses. Standard ISO spec, no Scanmatik-specific bits.

interface CanFrame { id: number; data: Uint8Array }

function buildIsoTpFrames(canId: number, payload: Uint8Array): CanFrame[] {
  if (payload.length <= 7) {
    // Single Frame: [0x0n][..7 bytes..] padded to 8
    const data = new Uint8Array(8).fill(0xcc)
    data[0] = (0x00 << 4) | payload.length
    data.set(payload, 1)
    return [{ id: canId, data }]
  }
  // First Frame: [0x1L][LL][..6 bytes..]  L = length high nibble, LL = low byte
  // Consecutive: [0x2N][..7 bytes..]      N = sequence (1, 2, ... 0xF, 0, 1...)
  const frames: CanFrame[] = []
  const ff = new Uint8Array(8).fill(0xcc)
  ff[0] = (0x10) | ((payload.length >> 8) & 0x0f)
  ff[1] = payload.length & 0xff
  ff.set(payload.slice(0, 6), 2)
  frames.push({ id: canId, data: ff })
  let pos = 6
  let seq = 1
  while (pos < payload.length) {
    const chunk = payload.slice(pos, pos + 7)
    const cf = new Uint8Array(8).fill(0xcc)
    cf[0] = 0x20 | (seq & 0x0f)
    cf.set(chunk, 1)
    frames.push({ id: canId, data: cf })
    pos += 7
    seq = (seq + 1) & 0xff
  }
  return frames
}

function reassembleIsoTp(frames: CanFrame[]): Uint8Array | null {
  if (frames.length === 0) return null
  const first = frames[0]
  const pci = first.data[0] >> 4
  if (pci === 0x0) {
    // Single frame
    const len = first.data[0] & 0x0f
    return first.data.slice(1, 1 + len)
  }
  if (pci !== 0x1) return null  // expected first frame
  const total = ((first.data[0] & 0x0f) << 8) | first.data[1]
  const out = new Uint8Array(total)
  out.set(first.data.slice(2, 8), 0)
  let pos = 6
  let seq = 1
  for (let i = 1; i < frames.length && pos < total; i++) {
    const f = frames[i]
    if ((f.data[0] >> 4) !== 0x2) continue
    const fseq = f.data[0] & 0x0f
    if (fseq !== (seq & 0x0f)) continue  // out-of-sequence — protocol error
    const remaining = total - pos
    const take = Math.min(7, remaining)
    out.set(f.data.slice(1, 1 + take), pos)
    pos += take
    seq = (seq + 1) & 0xff
  }
  return out
}

// UDS Negative Response Codes (subset; full table in ISO 14229)
export const NRC: Record<number, string> = {
  0x10: 'generalReject',
  0x11: 'serviceNotSupported',
  0x12: 'subFunctionNotSupported',
  0x13: 'incorrectMessageLengthOrInvalidFormat',
  0x22: 'conditionsNotCorrect',
  0x24: 'requestSequenceError',
  0x31: 'requestOutOfRange',
  0x33: 'securityAccessDenied',
  0x35: 'invalidKey',
  0x36: 'exceededNumberOfAttempts',
  0x37: 'requiredTimeDelayNotExpired',
  0x70: 'uploadDownloadNotAccepted',
  0x71: 'transferDataSuspended',
  0x72: 'generalProgrammingFailure',
  0x73: 'wrongBlockSequenceCounter',
  0x78: 'requestCorrectlyReceivedResponsePending',
  0x7e: 'subFunctionNotSupportedInActiveSession',
  0x7f: 'serviceNotSupportedInActiveSession',
}

// ── Driver class ───────────────────────────────────────────────────────────

class ScanmatikDriver {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private rxBuffer: number[] = []
  private _info = ''
  private _portLabel = ''

  // Diagnostic logger — when enabled, every TX/RX byte is captured. Lets us
  // verify our wire-format guesses against the desktop-app USB capture.
  private logEnabled = false
  private log: { dir: 'TX' | 'RX'; bytes: number[]; ts: number }[] = []

  // Channel state (after configChannel)
  private channelProtocol: ProtocolId | null = null
  private channelTxId = 0x7e0   // ECU request CAN ID (default for engine)
  private channelRxId = 0x7e8   // ECU response CAN ID

  enableLog(on: boolean) { this.logEnabled = on; if (on) this.log = [] }
  getLog() { return this.log.slice() }
  clearLog() { this.log = [] }

  isConnected(): boolean { return this.port !== null && this.writer !== null }
  getInfo(): string { return this._info }
  getPortLabel(): string { return this._portLabel }
  getChannelProtocol(): ProtocolId | null { return this.channelProtocol }

  // ── Web Serial port management ───────────────────────────────────────────

  async connect(baudRate = 115200): Promise<ConnectResult> {
    try {
      if (!('serial' in navigator)) {
        return { ok: false, error: 'Web Serial API not supported. Use Chrome, Edge or Brave.' }
      }
      // No filter — show ALL serial ports. Scanmatik clones use a variety of USB
      // chips (FTDI 0x0403, CH340 0x1A86, CP2102 0x10C4 — varies by manufacturer).
      // We identify which chip after connect by reading port.getInfo().
      this.port = await (navigator as unknown as { serial: { requestPort: (opts?: { filters?: { usbVendorId: number }[] }) => Promise<SerialPort> } })
        .serial.requestPort()
      if (!this.port) return { ok: false, error: 'No port selected.' }

      await this.port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' })
      this.writer = this.port.writable!.getWriter()
      this.reader = this.port.readable!.getReader()

      // Identify the device — TODO[scanmatik-protocol]: confirm response format
      try {
        const ver = await this._sendCmd(CMD.GET_VERSION, [], 1000)
        this._info = ver.ok ? `Scanmatik (fw ${bytesToHex(ver.data ?? [])})` : 'Scanmatik 2 / PCMTuner (unverified)'
      } catch {
        this._info = 'Scanmatik 2 / PCMTuner (unresponsive — protocol bytes need calibration)'
      }

      // Port label from USB info — identify the USB-serial chip
      try {
        const info = await (this.port as { getInfo(): Promise<{ usbVendorId?: number; usbProductId?: number }> }).getInfo()
        if (info.usbVendorId !== undefined) {
          const vid = info.usbVendorId.toString(16).padStart(4, '0').toUpperCase()
          const pid = info.usbProductId?.toString(16).padStart(4, '0').toUpperCase() ?? '????'
          const chip =
            info.usbVendorId === 0x0403 ? 'FTDI' :
            info.usbVendorId === 0x1a86 ? 'WCH (CH340/CH341)' :
            info.usbVendorId === 0x10c4 ? 'Silicon Labs (CP210x)' :
            info.usbVendorId === 0x067b ? 'Prolific (PL2303)' :
            'Unknown'
          this._portLabel = `${chip} VID:${vid} PID:${pid}`
        } else {
          this._portLabel = 'Web Serial Port (no USB info)'
        }
      } catch { this._portLabel = 'Web Serial Port' }

      // Background reader pump — fills rxBuffer as bytes arrive
      void this._pumpReader()

      return { ok: true, info: this._info }
    } catch (err: unknown) {
      await this._cleanup()
      const msg = err instanceof Error ? err.message : String(err)
      if (/no port selected|cancelled/i.test(msg)) return { ok: false, error: 'Port selection cancelled.' }
      return { ok: false, error: msg }
    }
  }

  async disconnect(): Promise<void> {
    if (this.channelProtocol !== null) {
      try { await this._sendCmd(CMD.CLOSE_CHANNEL, [], 500) } catch { /* ignore */ }
      this.channelProtocol = null
    }
    try { await this._sendCmd(CMD.CLOSE, [], 500) } catch { /* ignore */ }
    await this._cleanup()
  }

  private async _cleanup(): Promise<void> {
    try { this.reader?.releaseLock() } catch { /* */ }
    try { this.writer?.releaseLock() } catch { /* */ }
    try { await this.port?.close() } catch { /* */ }
    this.port = null
    this.reader = null
    this.writer = null
    this.rxBuffer = []
    this._info = ''
    this._portLabel = ''
    this.channelProtocol = null
  }

  private async _pumpReader(): Promise<void> {
    while (this.reader && this.port) {
      try {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value && value.length > 0) {
          this.rxBuffer.push(...value)
          if (this.logEnabled) this.log.push({ dir: 'RX', bytes: Array.from(value), ts: Date.now() })
        }
      } catch {
        break
      }
    }
  }

  private async _writeRaw(bytes: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Port not open')
    await this.writer.write(bytes)
    if (this.logEnabled) this.log.push({ dir: 'TX', bytes: Array.from(bytes), ts: Date.now() })
  }

  // Send a Scanmatik command frame and wait for the device's response frame.
  // TODO[scanmatik-protocol]: response framing is currently best-guess
  // (assumes [STX][LEN][CMD][DATA][CRC] echo with same CMD code). Fix once
  // capture verifies the actual response shape.
  private async _sendCmd(cmd: number, data: number[], timeoutMs: number): Promise<UDSResult> {
    const frame = buildFrame(cmd, data)
    await this._writeRaw(frame)

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const parsed = this._tryConsumeResponseFrame()
      if (parsed) {
        if (parsed.cmd === cmd) {
          return { ok: true, data: parsed.data, raw: bytesToHex(parsed.data) }
        }
        // Different cmd — protocol drift. Keep buffering more.
      }
      await new Promise(r => setTimeout(r, 10))
    }
    return { ok: false, error: `Timeout waiting for response to cmd 0x${cmd.toString(16)}` }
  }

  private _tryConsumeResponseFrame(): { cmd: number; data: number[] } | null {
    while (this.rxBuffer.length > 0 && this.rxBuffer[0] !== STX) {
      this.rxBuffer.shift()  // skip until STX
    }
    if (this.rxBuffer.length < 5) return null  // need at least STX+LEN(2)+CMD+CRC
    const len = (this.rxBuffer[1] << 8) | this.rxBuffer[2]  // CMD+DATA bytes
    if (this.rxBuffer.length < 4 + len) return null
    const cmd = this.rxBuffer[3]
    const data = this.rxBuffer.slice(4, 4 + len - 1)  // -1 because LEN includes CMD
    const crcByte = this.rxBuffer[3 + len]
    // TODO[scanmatik-protocol]: verify CRC
    void crcByte
    this.rxBuffer.splice(0, 4 + len)  // consume STX+LEN+CMD+DATA+CRC
    return { cmd, data }
  }

  // ── J2534-equivalent API ─────────────────────────────────────────────────

  /**
   * Configure a CAN/ISO15765 channel. Mirrors PassThruConnect.
   *
   * For ISO15765 the txId and rxId default to 0x7E0 / 0x7E8 (engine ECU).
   * Pass {txId, rxId} for transmission/body/instrument-cluster ECUs.
   */
  async configChannel(opts: {
    protocol: ProtocolId
    baud: number
    txId?: number
    rxId?: number
  }): Promise<UDSResult> {
    if (!this.isConnected()) return { ok: false, error: 'Not connected' }
    this.channelProtocol = opts.protocol
    this.channelTxId = opts.txId ?? 0x7e0
    this.channelRxId = opts.rxId ?? 0x7e8

    // TODO[scanmatik-protocol]: build the actual CONFIG_CHANNEL payload from
    // capture. Likely format (best guess):
    //   [protocol][baud_be32][flags_be32][txId_be4][rxId_be4]
    const baudBytes = [
      (opts.baud >>> 24) & 0xff,
      (opts.baud >>> 16) & 0xff,
      (opts.baud >>> 8) & 0xff,
      opts.baud & 0xff,
    ]
    const payload = [opts.protocol, ...baudBytes, 0, 0, 0, 0]
    return this._sendCmd(CMD.CONFIG_CHANNEL, payload, 2000)
  }

  /**
   * Send a single raw CAN frame and collect any response frames within timeout.
   * Higher layers (sendUDS) build on this.
   */
  async sendCanFrame(frame: CanFrame, timeoutMs = 1000): Promise<{ ok: boolean; rx: CanFrame[]; error?: string }> {
    if (this.channelProtocol === null) return { ok: false, rx: [], error: 'Channel not configured' }
    // TODO[scanmatik-protocol]: construct SEND_FRAME payload. Best guess:
    //   [canId_be4][dlc][..8 data bytes..]
    const idBytes = [(frame.id >>> 24) & 0xff, (frame.id >>> 16) & 0xff, (frame.id >>> 8) & 0xff, frame.id & 0xff]
    const payload = [...idBytes, frame.data.length, ...Array.from(frame.data)]
    const sendRes = await this._sendCmd(CMD.SEND_FRAME, payload, timeoutMs)
    if (!sendRes.ok) return { ok: false, rx: [], error: sendRes.error }
    // Collect RX frames until timeout
    const rx: CanFrame[] = []
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const r = await this._sendCmd(CMD.RECV_FRAME, [], 100)
      if (!r.ok) break
      if (!r.data || r.data.length < 5) break  // empty (no pending RX)
      const id = (r.data[0] << 24) | (r.data[1] << 16) | (r.data[2] << 8) | r.data[3]
      const dlc = r.data[4]
      rx.push({ id, data: new Uint8Array(r.data.slice(5, 5 + dlc)) })
      if (rx.length >= 32) break  // safety cap
    }
    return { ok: true, rx }
  }

  // ── UDS / ISO 14229 services (LAYER 2 — standard, fully implemented) ─────

  /**
   * Send a UDS request. Handles ISO 15765-2 segmentation automatically for
   * payloads larger than 7 bytes. Waits for the positive response or NRC.
   *
   * @param request  UDS service bytes — e.g. [0x22, 0xF1, 0x90] for VIN read
   * @param timeoutMs total deadline including 0x78 ResponsePending extensions
   */
  async sendUDS(request: number[], timeoutMs = 3000): Promise<UDSResult> {
    if (this.channelProtocol === null) return { ok: false, error: 'Channel not configured' }
    const payload = new Uint8Array(request)

    // Send request frames
    const txFrames = buildIsoTpFrames(this.channelTxId, payload)
    const rxAccum: CanFrame[] = []
    const deadline = Date.now() + timeoutMs
    for (const f of txFrames) {
      const remaining = Math.max(50, deadline - Date.now())
      const r = await this.sendCanFrame(f, remaining)
      if (!r.ok) return { ok: false, error: r.error || 'CAN send failed' }
      rxAccum.push(...r.rx)
    }

    // Receive response — handle 0x78 ResponsePending by extending the deadline
    while (Date.now() < deadline) {
      const responseFrames = rxAccum.filter(f => f.id === this.channelRxId)
      if (responseFrames.length > 0) {
        const reassembled = reassembleIsoTp(responseFrames)
        if (reassembled && reassembled.length > 0) {
          const sid = reassembled[0]
          // Negative response: 0x7F [requestSid] [NRC]
          if (sid === 0x7f && reassembled.length >= 3) {
            const nrc = reassembled[2]
            // 0x78 = ResponsePending — keep waiting, don't abort
            if (nrc === 0x78) {
              rxAccum.length = 0  // discard pending frames, wait for next response
              await new Promise(r => setTimeout(r, 50))
              const more = await this.sendCanFrame({ id: this.channelTxId, data: new Uint8Array(8).fill(0xcc) }, 100).catch(() => null)
              if (more?.rx) rxAccum.push(...more.rx)
              continue
            }
            return {
              ok: false,
              nrcCode: nrc,
              error: `Negative response: 0x${nrc.toString(16)} (${NRC[nrc] || 'unknown'})`,
              raw: bytesToHex(reassembled),
            }
          }
          // Positive response: SID = request[0] + 0x40
          const expectedPositive = request[0] + 0x40
          if (sid === expectedPositive) {
            return {
              ok: true,
              serviceId: sid,
              data: Array.from(reassembled.slice(1)),
              raw: bytesToHex(reassembled),
            }
          }
          // Unrelated response — wait for the right one
        }
      }
      await new Promise(r => setTimeout(r, 20))
      const more = await this.sendCanFrame({ id: this.channelTxId, data: new Uint8Array(8).fill(0xcc) }, 100).catch(() => null)
      if (more?.rx) rxAccum.push(...more.rx)
    }
    return { ok: false, error: 'UDS response timeout' }
  }

  /** ReadDataByIdentifier — UDS service 0x22. */
  async readDID(did: number, timeoutMs = 1000): Promise<UDSResult> {
    return this.sendUDS([0x22, (did >> 8) & 0xff, did & 0xff], timeoutMs)
  }

  /** DiagnosticSessionControl — UDS service 0x10. */
  async startDiagnosticSession(sessionType: number): Promise<UDSResult> {
    return this.sendUDS([0x10, sessionType], 2000)
  }

  /**
   * SecurityAccess (UDS 0x27). Two-step: requestSeed → device returns seed →
   * caller computes key → sendKey → device returns OK or NRC.
   *
   * @param level         security level (1 = standard, 3 = boot, etc.)
   * @param computeKey    function the caller provides — takes the seed,
   *                      returns the key. ECU-specific algorithm.
   */
  async securityAccess(
    level: number,
    computeKey: (seed: number[]) => number[]
  ): Promise<UDSResult> {
    const seedRes = await this.sendUDS([0x27, level], 2000)
    if (!seedRes.ok || !seedRes.data) return seedRes
    const seed = seedRes.data  // bytes after the SubFunction echo
    const key = computeKey(seed)
    return this.sendUDS([0x27, level + 1, ...key], 2000)
  }

  /**
   * Read ECU identification (combined VW/Audi DID set). Returns parsed object.
   */
  async readECUIdentification(): Promise<{ ok: boolean; id?: ECUIdentification; error?: string }> {
    if (this.channelProtocol === null) return { ok: false, error: 'Channel not configured' }
    // Standard VW DIDs
    const dids = {
      partNumber: 0xf187,  // ASCII 11-12 chars
      swVersion:  0xf189,
      hwVersion:  0xf191,
      vin:        0xf190,
      systemName: 0xf197,
    }
    const id: ECUIdentification = { raw: {} }
    for (const [field, did] of Object.entries(dids)) {
      const r = await this.readDID(did, 500)
      if (r.ok && r.data && r.data.length >= 2) {
        // Strip the 2-byte DID echo at start
        const payload = r.data.slice(2)
        const ascii = Array.from(payload)
          .filter(b => b >= 0x20 && b <= 0x7e)
          .map(b => String.fromCharCode(b))
          .join('')
        ;(id as Record<string, unknown>)[field] = ascii.trim()
        id.raw![field] = bytesToHex(payload)
      }
    }
    id.ecuPart = id.partNumber
    return { ok: true, id }
  }

  /**
   * Read flash memory via UDS 0x23 (ReadMemoryByAddress) chunked.
   * Reports progress via callback.
   *
   * @param startAddr  start address in ECU flash space
   * @param totalLen   total bytes to read
   * @param chunkSize  bytes per UDS request (typical 256-1024 depending on ECU)
   * @param onProgress (bytesRead, totalLen) => void
   */
  async readFlash(
    startAddr: number,
    totalLen: number,
    chunkSize = 512,
    onProgress?: (bytesRead: number, total: number) => void
  ): Promise<{ ok: boolean; data?: Uint8Array; error?: string }> {
    const out = new Uint8Array(totalLen)
    let pos = 0
    while (pos < totalLen) {
      const len = Math.min(chunkSize, totalLen - pos)
      const addr = startAddr + pos
      // 0x23 ReadMemoryByAddress with address-format-byte 0x44 (4-byte addr, 4-byte size)
      const req = [
        0x23, 0x44,
        (addr >>> 24) & 0xff, (addr >>> 16) & 0xff, (addr >>> 8) & 0xff, addr & 0xff,
        (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
      ]
      const r = await this.sendUDS(req, 5000)
      if (!r.ok || !r.data) return { ok: false, error: r.error || 'Read failed' }
      out.set(r.data, pos)
      pos += len
      onProgress?.(pos, totalLen)
    }
    return { ok: true, data: out }
  }

  // Note: writeFlash via 0x34/0x36/0x37 (RequestDownload/TransferData/RequestTransferExit)
  // is intentionally NOT implemented yet — wiring this without verified
  // SecurityAccess is unsafe (could brick an ECU). Add only after the read
  // path is confirmed working against capture, and test exclusively against
  // a bench ECU on first run.
}

// Singleton — pages share one driver instance like the elm327 module does.
export const scanmatik = new ScanmatikDriver()
export type { ScanmatikDriver }
