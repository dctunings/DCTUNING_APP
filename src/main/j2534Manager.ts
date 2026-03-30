/**
 * j2534Manager.ts
 * Comprehensive J2534 device manager for Windows.
 *
 * Architecture: Most J2534 DLLs (especially PCMTuner/Scanmatik clones) are 32-bit.
 * A 64-bit Electron/Node.js process cannot load 32-bit DLLs directly.
 * Solution: Spawn 32-bit PowerShell (SysWOW64) with inline C# PInvoke as a bridge.
 *
 * Supported devices via registry scan:
 *   - PCMTuner / Scanmatik 2 clone  → "Scanmatik - SM2 USB" / sm2j2534.dll
 *   - Original Scanmatik 2 PRO      → same DLL path
 *   - CarDAQ-Plus 3 (Drew Technologies)
 *   - J2534-USB (Mongoose / Bosch)
 *   - OpenPort 2.0 (Tactrix)
 *   - MagicMotorSport Flex
 *   - Autel / Launch / iCarsoft devices
 *   - Any other PassThruSupport.04.04 compliant device
 */

import { execSync, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface J2534Device {
  name: string
  dll: string
  vendor: string
  is64bit: boolean
  exists: boolean
  known: KnownDeviceInfo | null
}

interface KnownDeviceInfo {
  brand: string
  model: string
  category: 'professional' | 'prosumer' | 'clone' | 'budget'
  protocols: string[]
  maxBaudRate: number
  canFlash: boolean
  isClone: boolean
  driverNote: string
  setupTip: string
}

export interface J2534ConnectResult {
  ok: boolean
  deviceId?: number
  channelId?: number
  info?: string
  error?: string
}

export interface J2534OBD2Result {
  ok: boolean
  codes?: string[]
  raw?: string
  error?: string
}

export interface J2534LiveData {
  ok: boolean
  pids?: Record<string, { name: string; value: number; unit: string }>
  error?: string
}

// ─── Known Device Fingerprints ────────────────────────────────────────────────
// Match against DLL filename (case-insensitive) and/or registry key name

const KNOWN_DEVICES: Array<{ match: RegExp; info: KnownDeviceInfo }> = [
  {
    match: /sm2j2534|scanmatik.*sm2|sm2.*scanmatik/i,
    info: {
      brand: 'Scanmatik',
      model: 'Scanmatik 2 PRO / PCMTuner Clone',
      category: 'prosumer',
      protocols: ['CAN', 'ISO15765', 'K-Line ISO9141', 'KWP2000', 'J1850'],
      maxBaudRate: 1000000,
      canFlash: true,
      isClone: false,
      driverNote:
        'Requires Scanmatik driver v2.21.21 or v2.21.22 for clone hardware. Newer versions may detect/block clones.',
      setupTip:
        'PCMTuner clones appear as "Scanmatik - SM2 USB" in Device Manager. Install Scanmatik 2 PRO driver v2.21.21.',
    },
  },
  {
    match: /pcmtuner|pcm.tuner/i,
    info: {
      brand: 'PCMTuner',
      model: 'PCMTuner (Scanmatik 2 Clone)',
      category: 'clone',
      protocols: ['CAN', 'ISO15765', 'K-Line ISO9141', 'KWP2000'],
      maxBaudRate: 500000,
      canFlash: true,
      isClone: true,
      driverNote:
        'Use Scanmatik driver v2.21.21 — do NOT use official PCMTuner software (requires paid activation).',
      setupTip:
        'Install Scanmatik 2 PRO v2.21.21 drivers. Use PCMFlash 1.2.7 (no activation needed with this driver combo).',
    },
  },
  {
    match: /cardaqplus|cardaqm|drewtech|cardaq/i,
    info: {
      brand: 'Drew Technologies',
      model: 'CarDAQ-Plus 3',
      category: 'professional',
      protocols: ['CAN', 'ISO15765', 'K-Line', 'KWP2000', 'J1850PWM', 'J1850VPW', 'CAN-FD'],
      maxBaudRate: 2000000,
      canFlash: true,
      isClone: false,
      driverNote:
        'Professional grade. Supports CAN-FD (2020+ vehicles). Genuine hardware recommended for ECU flashing.',
      setupTip: 'Install CarDAQ driver from Drew Technologies. Registered under DT_J2534.',
    },
  },
  {
    match: /j2534.*usb|mongoose|moose/i,
    info: {
      brand: 'Bosch / Mongoose',
      model: 'J2534-USB (Mongoose)',
      category: 'professional',
      protocols: ['CAN', 'ISO15765', 'K-Line ISO9141', 'KWP2000', 'J1850PWM', 'J1850VPW'],
      maxBaudRate: 500000,
      canFlash: true,
      isClone: false,
      driverNote: 'Widely supported. Used by many OEM diagnostic suites.',
      setupTip: 'Install Mongoose J2534 driver. Compatible with most OEM software.',
    },
  },
  {
    match: /openport|tactrix/i,
    info: {
      brand: 'Tactrix',
      model: 'OpenPort 2.0',
      category: 'prosumer',
      protocols: ['CAN', 'ISO15765', 'ISO14230', 'ISO9141'],
      maxBaudRate: 500000,
      canFlash: true,
      isClone: false,
      driverNote:
        'Popular for Subaru/Mitsubishi/Toyota tuning (EcuFlash, EcuEdit). Open-source firmware.',
      setupTip: 'Install Tactrix driver. Works with EcuFlash, EcuEdit, and RomRaider.',
    },
  },
  {
    match: /flex.*j2534|mms.*j2534|magicmotorsport/i,
    info: {
      brand: 'MagicMotorSport',
      model: 'Flex',
      category: 'professional',
      protocols: ['CAN', 'ISO15765', 'K-Line', 'KWP2000', 'SENT', 'CAN-FD'],
      maxBaudRate: 2000000,
      canFlash: true,
      isClone: false,
      driverNote:
        'Professional bench/OBD flashing tool. Requires MagicMotorSport subscription for most ECUs.',
      setupTip:
        'Install Flex driver. Supports BOOT mode and JTAG for advanced ECU unlock.',
    },
  },
  {
    match: /autel/i,
    info: {
      brand: 'Autel',
      model: 'Autel J2534 Adapter',
      category: 'budget',
      protocols: ['CAN', 'ISO15765', 'K-Line', 'KWP2000'],
      maxBaudRate: 500000,
      canFlash: false,
      isClone: false,
      driverNote: 'Primarily for diagnostics. Limited reflash support.',
      setupTip: 'Install Autel driver from device CD or autel.com.',
    },
  },
  {
    match: /launch/i,
    info: {
      brand: 'Launch',
      model: 'Launch J2534 Interface',
      category: 'budget',
      protocols: ['CAN', 'ISO15765', 'K-Line', 'KWP2000'],
      maxBaudRate: 500000,
      canFlash: false,
      isClone: false,
      driverNote: 'Diagnostics focused. Basic J2534 compliance.',
      setupTip: 'Install Launch driver. Compatible with most generic OBD2 software.',
    },
  },
  {
    match: /byteshooter|bflash/i,
    info: {
      brand: 'ByteShooter',
      model: 'BFlash J2534',
      category: 'prosumer',
      protocols: ['CAN', 'ISO15765', 'K-Line', 'KWP2000'],
      maxBaudRate: 1000000,
      canFlash: true,
      isClone: false,
      driverNote:
        'Used with BFlash software for Bosch/Siemens/Continental ECUs.',
      setupTip: 'Install BFlash driver package from byteshooter.de.',
    },
  },
  {
    match: /kess|ktag|alientech/i,
    info: {
      brand: 'Alientech',
      model: 'KESS3 / K-TAG',
      category: 'professional',
      protocols: ['CAN', 'ISO15765', 'K-Line', 'KWP2000', 'JTAG', 'BDM', 'Nexus'],
      maxBaudRate: 1000000,
      canFlash: true,
      isClone: false,
      driverNote:
        'Professional tool with subscription. Supports 5000+ ECUs via OBD, Bench, Boot.',
      setupTip:
        'Install KESS3 software from Alientech. Requires subscription for full access.',
    },
  },
]

// ─── Registry Scanner ─────────────────────────────────────────────────────────

export function scanJ2534Devices(): J2534Device[] {
  const devices: J2534Device[] = []
  if (process.platform !== 'win32') return devices

  // Both registry hives: native (64-bit) and WOW6432Node (32-bit app registrations)
  const regPaths = [
    'HKLM\\SOFTWARE\\PassThruSupport.04.04',
    'HKLM\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04',
  ]

  const seen = new Set<string>() // deduplicate by DLL path

  for (const regPath of regPaths) {
    const is64bit = !regPath.includes('WOW6432Node')
    try {
      const output = execSync(`reg query "${regPath}" /s`, {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      })

      const sections = output.split(/\r?\n(?=HKEY)/i)

      for (const section of sections) {
        const lines = section
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
        if (!lines.length) continue

        // First line is the registry key path → device name is the last segment
        const keyLine = lines[0]
        if (!keyLine.toUpperCase().startsWith('HKEY')) continue
        const deviceName = keyLine.split('\\').pop()?.trim() || ''
        if (!deviceName || deviceName.toUpperCase().startsWith('PASSTHRU')) continue

        let dll = ''
        let vendor = ''

        for (const line of lines.slice(1)) {
          // Format: "    ValueName    REG_SZ    Value"
          const parts = line.split(/\s{2,}/)
          if (parts.length < 3) continue
          const valueName = parts[0].trim()
          const value = parts[parts.length - 1].trim()

          if (/functionlibrary/i.test(valueName)) dll = value
          else if (/vendor/i.test(valueName)) vendor = value
        }

        if (!dll) continue

        // Normalise path separators and deduplicate
        const dllNorm = dll.toLowerCase()
        if (seen.has(dllNorm)) continue
        seen.add(dllNorm)

        // Check if DLL file exists on disk
        const exists = safeFileExists(dll)

        // Fingerprint against known devices
        const known = identifyDevice(deviceName, dll) ?? null

        devices.push({ name: deviceName, dll, vendor, is64bit, exists, known })
      }
    } catch {
      // Registry path not found — no J2534 devices installed under this path
    }
  }

  return devices
}

function safeFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function identifyDevice(name: string, dll: string): KnownDeviceInfo | undefined {
  const searchStr = `${name} ${path.basename(dll)}`
  for (const entry of KNOWN_DEVICES) {
    if (entry.match.test(searchStr)) {
      return entry.info
    }
  }
  return undefined
}

// ─── J2534 DLL bridge via 32-bit PowerShell ───────────────────────────────────
//
// Most J2534 DLLs are 32-bit. A 64-bit Node.js/Electron process cannot load
// them directly. We spawn 32-bit PowerShell (SysWOW64) with inline C# PInvoke
// to call the DLL functions. Commands are sent via stdin/stdout as JSON.
//
// Bridge lifecycle: one persistent child process per connected device.

interface BridgeState {
  deviceId: number
  channelId: number
  dllPath: string
  process: import('child_process').ChildProcess | null
  buffer: string
  pendingResolves: Array<(data: string) => void>
}

let bridge: BridgeState | null = null

const PS32 = process.env.SystemRoot
  ? path.join(
      process.env.SystemRoot,
      'SysWOW64',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  : 'powershell.exe'

// Inline C# script that the bridge PowerShell runs.
// It reads JSON commands from stdin and writes JSON results to stdout.
const BRIDGE_CS_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class J2534 {

    [StructLayout(LayoutKind.Sequential, Pack=1)]
    public struct PASSTHRU_MSG {
        public uint ProtocolID;
        public uint RxStatus;
        public uint TxFlags;
        public uint Timestamp;
        public uint DataSize;
        public uint ExtraDataIndex;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst=4128)]
        public byte[] Data;
        public PASSTHRU_MSG(uint protocol) {
            ProtocolID = protocol; RxStatus = 0; TxFlags = 0;
            Timestamp = 0; DataSize = 0; ExtraDataIndex = 0;
            Data = new byte[4128];
        }
    }

    [DllImport("DLLPATH", EntryPoint="PassThruOpen")]
    public static extern int Open([MarshalAs(UnmanagedType.LPStr)] string pName, out uint pDeviceID);
    [DllImport("DLLPATH", EntryPoint="PassThruClose")]
    public static extern int Close(uint DeviceID);
    [DllImport("DLLPATH", EntryPoint="PassThruConnect")]
    public static extern int Connect(uint DeviceID, uint ProtocolID, uint Flags, uint BaudRate, out uint pChannelID);
    [DllImport("DLLPATH", EntryPoint="PassThruDisconnect")]
    public static extern int Disconnect(uint ChannelID);
    [DllImport("DLLPATH", EntryPoint="PassThruReadMsgs")]
    public static extern int ReadMsgs(uint ChannelID, [In, Out] PASSTHRU_MSG[] pMsg, ref uint pNumMsgs, uint Timeout);
    [DllImport("DLLPATH", EntryPoint="PassThruWriteMsgs")]
    public static extern int WriteMsgs(uint ChannelID, [In] PASSTHRU_MSG[] pMsg, ref uint pNumMsgs, uint Timeout);
    [DllImport("DLLPATH", EntryPoint="PassThruStartMsgFilter")]
    public static extern int StartMsgFilter(uint ChannelID, uint FilterType, ref PASSTHRU_MSG pMaskMsg, ref PASSTHRU_MSG pPatternMsg, ref PASSTHRU_MSG pFlowMsg, out uint pFilterID);
    [DllImport("DLLPATH", EntryPoint="PassThruStopMsgFilter")]
    public static extern int StopMsgFilter(uint ChannelID, uint FilterID);
    [DllImport("DLLPATH", EntryPoint="PassThruReadVersion")]
    public static extern int ReadVersion(uint DeviceID, StringBuilder pFirmware, StringBuilder pDll, StringBuilder pApi);
    [DllImport("DLLPATH", EntryPoint="PassThruGetLastError")]
    public static extern int GetLastError(StringBuilder pError);

    public static string LastError() {
        var sb = new StringBuilder(128);
        GetLastError(sb);
        return sb.ToString();
    }
}
"@

$deviceId = 0
$channelId = 0
$filterId  = 0
$connected = $false

# Force stdout to auto-flush so Node.js subprocess receives each response immediately
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput())
$stdout.AutoFlush = $true
[Console]::SetOut($stdout)

while ($true) {
    $line = [Console]::ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if (!$line) { continue }

    try {
        $cmd = $line | ConvertFrom-Json
        $action = $cmd.action

        if ($action -eq "open") {
            $did = [uint32]0
            $ret = [J2534]::Open($null, [ref]$did)
            if ($ret -eq 0) {
                $deviceId = $did
                $connected = $false
                $fw = New-Object System.Text.StringBuilder 64
                $dv = New-Object System.Text.StringBuilder 64
                $av = New-Object System.Text.StringBuilder 64
                [J2534]::ReadVersion($did, $fw, $dv, $av) | Out-Null
                @{ ok=$true; deviceId=[int]$did; fw=$fw.ToString(); dllVer=$dv.ToString(); api=$av.ToString() } | ConvertTo-Json -Compress
            } else {
                @{ ok=$false; error="PassThruOpen returned $ret -- $([J2534]::LastError())" } | ConvertTo-Json -Compress
            }
        }
        elseif ($action -eq "connect") {
            $proto  = [uint32]$cmd.protocol
            $baud   = [uint32]$cmd.baud
            $flags  = [uint32]0
            $chId   = [uint32]0
            $ret = [J2534]::Connect($deviceId, $proto, $flags, $baud, [ref]$chId)
            if ($ret -eq 0) {
                $channelId = $chId

                if ($proto -eq 6) {
                    $mask    = [J2534+PASSTHRU_MSG]::new($proto)
                    $pattern = [J2534+PASSTHRU_MSG]::new($proto)
                    $flow    = [J2534+PASSTHRU_MSG]::new($proto)

                    $mask.Data[0]=0; $mask.Data[1]=0; $mask.Data[2]=0x07; $mask.Data[3]=0xFF; $mask.DataSize=4
                    $pattern.Data[0]=0; $pattern.Data[1]=0; $pattern.Data[2]=0x07; $pattern.Data[3]=0xE8; $pattern.DataSize=4
                    $flow.Data[0]=0; $flow.Data[1]=0; $flow.Data[2]=0x07; $flow.Data[3]=0xE0; $flow.DataSize=4

                    $fid = [uint32]0
                    [J2534]::StartMsgFilter($chId, 3, [ref]$mask, [ref]$pattern, [ref]$flow, [ref]$fid) | Out-Null
                    $filterId = $fid
                }
                $connected = $true
                @{ ok=$true; channelId=[int]$chId } | ConvertTo-Json -Compress
            } else {
                @{ ok=$false; error="PassThruConnect returned $ret -- $([J2534]::LastError())" } | ConvertTo-Json -Compress
            }
        }
        elseif ($action -eq "sendobd2") {
            if (!$connected) { @{ ok=$false; error="Not connected" } | ConvertTo-Json -Compress; continue }
            $proto   = [uint32]$cmd.protocol
            $txBytes = [byte[]]$cmd.data
            $timeout = if ($cmd.timeout) { [uint32]$cmd.timeout } else { [uint32]2000 }

            $txMsg = [J2534+PASSTHRU_MSG]::new($proto)
            $txMsg.TxFlags = if ($proto -eq 6) { 0x40 } else { 0 }
            for ($i = 0; $i -lt $txBytes.Length; $i++) { $txMsg.Data[$i] = $txBytes[$i] }
            $txMsg.DataSize = $txBytes.Length
            $txCount = [uint32]1
            $wret = [J2534]::WriteMsgs($channelId, @($txMsg), [ref]$txCount, $timeout)
            if ($wret -ne 0) {
                @{ ok=$false; error="WriteMsgs returned $wret -- $([J2534]::LastError())" } | ConvertTo-Json -Compress
                continue
            }

            $responses = @()
            $deadline = (Get-Date).AddMilliseconds($timeout)
            while ((Get-Date) -lt $deadline) {
                $rxMsg = [J2534+PASSTHRU_MSG]::new($proto)
                $rxMsgs = @($rxMsg)
                $rxCount = [uint32]1
                $rret = [J2534]::ReadMsgs($channelId, $rxMsgs, [ref]$rxCount, 100)
                if ($rret -eq 0 -and $rxCount -gt 0) {
                    $rxData = $rxMsgs[0]
                    if ($rxData.DataSize -gt 0) {
                        $hexStr = -join ($rxData.Data[0..($rxData.DataSize-1)] | ForEach-Object { $_.ToString("X2") })
                        $responses += $hexStr
                        $firstByte = $rxData.Data[0]
                        if ($proto -eq 6 -and $rxData.DataSize -ge 4) { $firstByte = $rxData.Data[4] }
                        if ($firstByte -ge 0x40 -and $firstByte -le 0x7F) { break }
                    }
                }
            }
            @{ ok=$true; responses=$responses } | ConvertTo-Json -Compress
        }
        elseif ($action -eq "close") {
            if ($channelId -ne 0) {
                if ($filterId -ne 0) { [J2534]::StopMsgFilter($channelId, $filterId) | Out-Null }
                [J2534]::Disconnect($channelId) | Out-Null
                $channelId = 0
            }
            if ($deviceId -ne 0) {
                [J2534]::Close($deviceId) | Out-Null
                $deviceId = 0
            }
            $connected = $false
            @{ ok=$true } | ConvertTo-Json -Compress
        }
        elseif ($action -eq "uds") {
            # Generic UDS request - handles ISO15765 multi-frame automatically
            if (!$connected) { @{ ok=$false; error="Not connected" } | ConvertTo-Json -Compress; continue }
            $proto   = [uint32]$cmd.protocol
            $udsData = [byte[]]$cmd.data   # raw UDS service bytes (e.g. [0x22, 0xF1, 0x90])
            $timeout = if ($cmd.timeout) { [uint32]$cmd.timeout } else { [uint32]3000 }

            # Build CAN frame: 4-byte CAN ID header + UDS data (for ISO15765)
            $txMsg = [J2534+PASSTHRU_MSG]::new($proto)
            if ($proto -eq 6) {
                # ISO15765: CAN ID 0x7DF (functional), then length byte, then UDS data
                $txMsg.TxFlags = 0x40  # ISO15765_FRAME_PAD
                $txMsg.Data[0]=0; $txMsg.Data[1]=0; $txMsg.Data[2]=0x07; $txMsg.Data[3]=0xDF
                $txMsg.Data[4] = [byte]$udsData.Length
                for ($i=0; $i -lt $udsData.Length; $i++) { $txMsg.Data[5+$i] = $udsData[$i] }
                $txMsg.DataSize = 4 + 1 + $udsData.Length
            } else {
                for ($i=0; $i -lt $udsData.Length; $i++) { $txMsg.Data[$i] = $udsData[$i] }
                $txMsg.DataSize = $udsData.Length
            }

            $txCount = [uint32]1
            $wret = [J2534]::WriteMsgs($channelId, @($txMsg), [ref]$txCount, $timeout)
            if ($wret -ne 0) {
                @{ ok=$false; error="UDS WriteMsgs error $wret -- $([J2534]::LastError())" } | ConvertTo-Json -Compress
                continue
            }

            # Collect all response frames (handle multi-frame ISO15765)
            $allData = New-Object System.Collections.Generic.List[byte]
            $deadline = (Get-Date).AddMilliseconds($timeout)
            $gotPositive = $false

            while ((Get-Date) -lt $deadline) {
                $rxMsg = [J2534+PASSTHRU_MSG]::new($proto)
                $rxArr = @($rxMsg)
                $rxCount = [uint32]1
                $rret = [J2534]::ReadMsgs($channelId, $rxArr, [ref]$rxCount, 100)
                if ($rret -eq 0 -and $rxCount -gt 0 -and $rxArr[0].DataSize -gt 0) {
                    $rx = $rxArr[0]
                    $dataStart = if ($proto -eq 6) { 4 } else { 0 }  # skip CAN ID bytes
                    if ($rx.DataSize -le $dataStart) { continue }

                    $frameType = if ($proto -eq 6) { ($rx.Data[$dataStart] -shr 4) -band 0x0F } else { 0 }

                    if ($proto -ne 6 -or $frameType -eq 0) {
                        # Single frame
                        $udsLen = if ($proto -eq 6) { $rx.Data[$dataStart] -band 0x0F } else { $rx.DataSize }
                        $udsStart = $dataStart + 1
                        for ($i=0; $i -lt $udsLen -and ($udsStart+$i) -lt $rx.DataSize; $i++) {
                            $allData.Add($rx.Data[$udsStart+$i])
                        }
                        $gotPositive = $true
                        break
                    } elseif ($frameType -eq 1) {
                        # First frame of multi-frame
                        $udsLen = (($rx.Data[$dataStart] -band 0x0F) -shl 8) -bor $rx.Data[$dataStart+1]
                        $udsStart = $dataStart + 2
                        for ($i=0; $i -lt ($rx.DataSize - $udsStart); $i++) {
                            $allData.Add($rx.Data[$udsStart+$i])
                        }
                        # Send flow control (FC) frame: CAN ID 0x7E0, 0x30 0x00 0x00
                        $fcMsg = [J2534+PASSTHRU_MSG]::new($proto)
                        $fcMsg.TxFlags = 0x40
                        $fcMsg.Data[0]=0; $fcMsg.Data[1]=0; $fcMsg.Data[2]=0x07; $fcMsg.Data[3]=0xE0
                        $fcMsg.Data[4]=0x30; $fcMsg.Data[5]=0x00; $fcMsg.Data[6]=0x00
                        $fcMsg.DataSize = 7
                        $fcCount = [uint32]1
                        [J2534]::WriteMsgs($channelId, @($fcMsg), [ref]$fcCount, 1000) | Out-Null
                        if ($allData.Count -ge $udsLen) { $gotPositive=$true; break }
                    } elseif ($frameType -eq 2) {
                        # Consecutive frame
                        $udsStart = $dataStart + 1
                        for ($i=0; $i -lt ($rx.DataSize - $udsStart); $i++) {
                            $allData.Add($rx.Data[$udsStart+$i])
                        }
                        if ($allData.Count -ge $udsLen) { $gotPositive=$true; break }
                    }
                }
            }

            if ($gotPositive -or $allData.Count -gt 0) {
                $hexStr = -join ($allData.ToArray() | ForEach-Object { $_.ToString("X2") })
                @{ ok=$true; hex=$hexStr; bytes=@($allData.ToArray() | ForEach-Object { [int]$_ }) } | ConvertTo-Json -Compress
            } else {
                @{ ok=$false; error="UDS timeout — no response from ECU" } | ConvertTo-Json -Compress
            }
        }
        elseif ($action -eq "readmem") {
            # UDS ReadMemoryByAddress (0x23) for one chunk
            if (!$connected) { @{ ok=$false; error="Not connected" } | ConvertTo-Json -Compress; continue }
            $proto    = [uint32]$cmd.protocol
            $addr     = [uint32]$cmd.address
            $length   = [uint32]$cmd.length

            # Build UDS 0x23 request: addressAndLengthFormatIdentifier, address bytes, size bytes
            # Use 3-byte address (0x14 = address 3 bytes, length 1 byte)
            $addrB0 = [byte](($addr -shr 16) -band 0xFF)
            $addrB1 = [byte](($addr -shr 8)  -band 0xFF)
            $addrB2 = [byte]($addr -band 0xFF)
            $lenB   = [byte]($length -band 0xFF)
            $udsData = [byte[]](0x23, 0x14, $addrB0, $addrB1, $addrB2, $lenB)

            $txMsg = [J2534+PASSTHRU_MSG]::new($proto)
            if ($proto -eq 6) {
                $txMsg.TxFlags = 0x40
                $txMsg.Data[0]=0; $txMsg.Data[1]=0; $txMsg.Data[2]=0x07; $txMsg.Data[3]=0xDF
                $txMsg.Data[4] = [byte]$udsData.Length
                for ($i=0; $i -lt $udsData.Length; $i++) { $txMsg.Data[5+$i] = $udsData[$i] }
                $txMsg.DataSize = 4 + 1 + $udsData.Length
            } else {
                for ($i=0; $i -lt $udsData.Length; $i++) { $txMsg.Data[$i] = $udsData[$i] }
                $txMsg.DataSize = $udsData.Length
            }

            $txCount = [uint32]1
            $wret = [J2534]::WriteMsgs($channelId, @($txMsg), [ref]$txCount, 3000)
            if ($wret -ne 0) {
                @{ ok=$false; error="ReadMem WriteMsgs error $wret" } | ConvertTo-Json -Compress
                continue
            }

            # Collect response (same multi-frame handling)
            $allData = New-Object System.Collections.Generic.List[byte]
            $deadline = (Get-Date).AddMilliseconds(5000)
            $udsLen = 0
            $gotData = $false

            while ((Get-Date) -lt $deadline) {
                $rxMsg = [J2534+PASSTHRU_MSG]::new($proto)
                $rxArr = @($rxMsg)
                $rxCount = [uint32]1
                $rret = [J2534]::ReadMsgs($channelId, $rxArr, [ref]$rxCount, 200)
                if ($rret -eq 0 -and $rxCount -gt 0 -and $rxArr[0].DataSize -gt 0) {
                    $rx = $rxArr[0]
                    $ds = if ($proto -eq 6) { 4 } else { 0 }
                    if ($rx.DataSize -le $ds) { continue }
                    $frameType = if ($proto -eq 6) { ($rx.Data[$ds] -shr 4) -band 0x0F } else { 0 }

                    if ($proto -ne 6 -or $frameType -eq 0) {
                        $udsStart = $ds + 1
                        for ($i=0; $i -lt ($rx.DataSize-$udsStart); $i++) { $allData.Add($rx.Data[$udsStart+$i]) }
                        $gotData = $true; break
                    } elseif ($frameType -eq 1) {
                        $udsLen = (($rx.Data[$ds] -band 0x0F) -shl 8) -bor $rx.Data[$ds+1]
                        $udsStart = $ds + 2
                        for ($i=0; $i -lt ($rx.DataSize-$udsStart); $i++) { $allData.Add($rx.Data[$udsStart+$i]) }
                        # Flow control
                        $fcMsg = [J2534+PASSTHRU_MSG]::new($proto)
                        $fcMsg.TxFlags=0x40; $fcMsg.Data[0]=0; $fcMsg.Data[1]=0; $fcMsg.Data[2]=0x07; $fcMsg.Data[3]=0xE0
                        $fcMsg.Data[4]=0x30; $fcMsg.Data[5]=0x00; $fcMsg.Data[6]=0x00; $fcMsg.DataSize=7
                        $fcCount=[uint32]1; [J2534]::WriteMsgs($channelId, @($fcMsg), [ref]$fcCount, 1000)|Out-Null
                        if ($allData.Count -ge $udsLen) { $gotData=$true; break }
                    } elseif ($frameType -eq 2) {
                        $udsStart = $ds + 1
                        for ($i=0; $i -lt ($rx.DataSize-$udsStart); $i++) { $allData.Add($rx.Data[$udsStart+$i]) }
                        if ($udsLen -gt 0 -and $allData.Count -ge $udsLen) { $gotData=$true; break }
                    }
                }
            }

            # Check for positive response 0x63 (response to 0x23)
            if ($allData.Count -gt 0 -and $allData[0] -eq 0x63) {
                $dataBytes = $allData.GetRange(1, $allData.Count-1).ToArray()
                $hexStr = -join ($dataBytes | ForEach-Object { $_.ToString("X2") })
                @{ ok=$true; hex=$hexStr; count=$dataBytes.Length } | ConvertTo-Json -Compress
            } elseif ($allData.Count -gt 0 -and $allData[0] -eq 0x7F) {
                $nrc = if ($allData.Count -gt 2) { $allData[2].ToString("X2") } else { "??" }
                @{ ok=$false; error="Negative response NRC 0x$nrc (service not supported or security access required)" } | ConvertTo-Json -Compress
            } else {
                @{ ok=$false; error="ReadMemoryByAddress: no valid response (received $($allData.Count) bytes)" } | ConvertTo-Json -Compress
            }
        }
        elseif ($action -eq "ping") {
            @{ ok=$true; pong=$true } | ConvertTo-Json -Compress
        }
        else {
            @{ ok=$false; error="Unknown action: $action" } | ConvertTo-Json -Compress
        }
    } catch {
        @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress
    }
}
`

// ─── Bridge process management ────────────────────────────────────────────────

function buildBridgeScript(dllPath: string): string {
  return BRIDGE_CS_SCRIPT.replace(/DLLPATH/g, dllPath.replace(/\\/g, '\\\\'))
}

export async function j2534Open(dllPath: string): Promise<J2534ConnectResult> {
  try {
    // Close existing bridge if any
    await j2534Close()

    const script = buildBridgeScript(dllPath)

    // Write bridge script to a temp .ps1 file so PowerShell runs it via -File.
    // Using -Command - mixes the script with our JSON commands on the same stdin stream.
    // -File keeps stdin exclusively for JSON IPC commands.
    const os = await import('os')
    const tmpScript = path.join(os.tmpdir(), 'dctuning_j2534_bridge.ps1')
    fs.writeFileSync(tmpScript, script, 'utf8')

    const proc = spawn(PS32, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    bridge = {
      deviceId: 0,
      channelId: 0,
      dllPath,
      process: proc,
      buffer: '',
      pendingResolves: [],
    }

    // Wire stdout to line reader
    proc.stdout!.on('data', (chunk: Buffer) => {
      if (!bridge) return
      bridge.buffer += chunk.toString()
      const lines = bridge.buffer.split('\n')
      bridge.buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const resolve = bridge.pendingResolves.shift()
        if (resolve) resolve(trimmed)
      }
    })

    proc.stderr!.on('data', (d: Buffer) => {
      const msg = d.toString()
      if (!/warning|deprecated/i.test(msg)) {
        console.error('[J2534Bridge stderr]', msg.slice(0, 200))
      }
    })

    proc.on('exit', () => {
      if (bridge?.pendingResolves) {
        const err = JSON.stringify({ ok: false, error: 'Bridge process exited' })
        bridge.pendingResolves.forEach((r) => r(err))
      }
      bridge = null
      try { fs.unlinkSync(tmpScript) } catch { /* ignore */ }
    })

    // Send open command — allow 25s for Add-Type compilation + PassThruOpen
    const result = await sendBridgeCommand({ action: 'open' }, 25000)
    const parsed = JSON.parse(result)
    if (parsed.ok) {
      bridge.deviceId = parsed.deviceId
      return {
        ok: true,
        deviceId: parsed.deviceId,
        info: `FW: ${parsed.fw || 'n/a'} | DLL: ${parsed.dllVer || 'n/a'} | API: ${parsed.api || 'n/a'}`,
      }
    } else {
      await j2534Close()
      return { ok: false, error: parsed.error }
    }
  } catch (err: unknown) {
    await j2534Close()
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534Connect(
  protocol: number,
  baudRate: number
): Promise<J2534ConnectResult> {
  if (!bridge) return { ok: false, error: 'Device not opened. Call j2534Open first.' }
  try {
    const result = await sendBridgeCommand(
      { action: 'connect', protocol, baud: baudRate },
      8000
    )
    const parsed = JSON.parse(result)
    if (parsed.ok) {
      bridge.channelId = parsed.channelId
      return { ok: true, channelId: parsed.channelId }
    }
    return { ok: false, error: parsed.error }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534SendOBD2(
  protocol: number,
  dataBytes: number[],
  timeout = 2000
): Promise<{ ok: boolean; responses?: string[]; error?: string }> {
  if (!bridge) return { ok: false, error: 'Not connected' }
  try {
    const result = await sendBridgeCommand(
      { action: 'sendobd2', protocol, data: dataBytes, timeout },
      timeout + 2000
    )
    return JSON.parse(result)
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534ReadDTCs(protocol = 6): Promise<J2534OBD2Result> {
  // OBD2 Mode 03 request: [0x03] for K-Line, [0x00,0x00,0x07,0xDF,0x03] for ISO15765
  const data =
    protocol === 6 ? [0x00, 0x00, 0x07, 0xdf, 0x03] : [0x03]

  const result = await j2534SendOBD2(protocol, data, 3000)
  if (!result.ok) return { ok: false, error: result.error }

  const codes: string[] = []
  const DTC_PREFIX = ['P', 'C', 'B', 'U']

  for (const hexStr of result.responses ?? []) {
    // Strip CAN header for ISO15765 (first 4 bytes = CAN ID + length)
    const offset = protocol === 6 ? 8 : 0
    const clean = hexStr.slice(offset).replace(/^43/, '')
    for (let i = 0; i + 3 < clean.length; i += 4) {
      const b1 = parseInt(clean.slice(i, i + 2), 16)
      const b2 = parseInt(clean.slice(i + 2, i + 4), 16)
      if (b1 === 0 && b2 === 0) continue
      const prefix = DTC_PREFIX[(b1 >> 6) & 0x03]
      const d1 = (b1 >> 4) & 0x03
      const d2 = b1 & 0x0f
      const d3 = (b2 >> 4) & 0x0f
      const d4 = b2 & 0x0f
      codes.push(
        `${prefix}${d1}${d2.toString(16).toUpperCase()}${d3
          .toString(16)
          .toUpperCase()}${d4.toString(16).toUpperCase()}`
      )
    }
  }

  return { ok: true, codes, raw: result.responses?.join(' | ') ?? '' }
}

export async function j2534ClearDTCs(
  protocol = 6
): Promise<{ ok: boolean; error?: string }> {
  const data =
    protocol === 6 ? [0x00, 0x00, 0x07, 0xdf, 0x04] : [0x04]
  const result = await j2534SendOBD2(protocol, data, 3000)
  return { ok: result.ok, error: result.error }
}

const OBD2_PIDS: Array<{
  pid: number[]
  name: string
  unit: string
  decode: (r: string) => number
}> = [
  {
    pid: [0x01, 0x0c],
    name: 'Engine RPM',
    unit: 'rpm',
    decode: (r) => {
      const [a, b] = hexPair(r)
      return (a * 256 + b) / 4
    },
  },
  {
    pid: [0x01, 0x0d],
    name: 'Vehicle Speed',
    unit: 'km/h',
    decode: (r) => hexByte(r, 0),
  },
  {
    pid: [0x01, 0x05],
    name: 'Coolant Temp',
    unit: '°C',
    decode: (r) => hexByte(r, 0) - 40,
  },
  {
    pid: [0x01, 0x0f],
    name: 'Intake Air Temp',
    unit: '°C',
    decode: (r) => hexByte(r, 0) - 40,
  },
  {
    pid: [0x01, 0x04],
    name: 'Engine Load',
    unit: '%',
    decode: (r) => Math.round((hexByte(r, 0) * 100) / 255),
  },
  {
    pid: [0x01, 0x0b],
    name: 'Intake MAP',
    unit: 'kPa',
    decode: (r) => hexByte(r, 0),
  },
  {
    pid: [0x01, 0x11],
    name: 'Throttle Position',
    unit: '%',
    decode: (r) => Math.round((hexByte(r, 0) * 100) / 255),
  },
  {
    pid: [0x01, 0x2f],
    name: 'Fuel Level',
    unit: '%',
    decode: (r) => Math.round((hexByte(r, 0) * 100) / 255),
  },
]

function hexByte(hexStr: string, idx: number): number {
  const dataPart = hexStr.slice(4 * 2 + 4)
  return parseInt(dataPart.slice(idx * 2, idx * 2 + 2), 16) || 0
}

function hexPair(hexStr: string): [number, number] {
  const dataPart = hexStr.slice(4 * 2 + 4)
  return [parseInt(dataPart.slice(0, 2), 16) || 0, parseInt(dataPart.slice(2, 4), 16) || 0]
}

export async function j2534ReadLivePIDs(protocol = 6): Promise<J2534LiveData> {
  if (!bridge) return { ok: false, error: 'Not connected' }
  const results: Record<string, { name: string; value: number; unit: string }> = {}

  for (const def of OBD2_PIDS) {
    try {
      const canId = [0x00, 0x00, 0x07, 0xdf]
      const data = protocol === 6 ? [...canId, ...def.pid] : def.pid
      const result = await j2534SendOBD2(protocol, data, 1000)
      if (result.ok && result.responses && result.responses.length > 0) {
        const value = def.decode(result.responses[0])
        if (!isNaN(value)) {
          const key = def.pid
            .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
            .join('')
          results[key] = { name: def.name, value, unit: def.unit }
        }
      }
    } catch {
      // skip unsupported PID
    }
  }

  return { ok: true, pids: results }
}

export async function j2534Close(): Promise<void> {
  if (!bridge) return
  try {
    await sendBridgeCommand({ action: 'close' }, 3000)
  } catch {
    // ignore
  }
  try {
    bridge.process?.kill()
  } catch {
    // ignore
  }
  bridge = null
}

export function j2534IsConnected(): boolean {
  return bridge !== null && bridge.channelId !== 0
}

export function j2534IsOpen(): boolean {
  return bridge !== null && bridge.deviceId !== 0
}

// ─── Bridge helper ────────────────────────────────────────────────────────────

function sendBridgeCommand(
  cmd: Record<string, unknown>,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!bridge?.process) {
      reject(new Error('Bridge process not running'))
      return
    }
    const timer = setTimeout(() => {
      const idx = bridge!.pendingResolves.indexOf(resolve)
      if (idx !== -1) bridge!.pendingResolves.splice(idx, 1)
      reject(
        new Error(
          `J2534 bridge command timeout (${timeout}ms): ${JSON.stringify(cmd)}`
        )
      )
    }, timeout)

    bridge.pendingResolves.push((data: string) => {
      clearTimeout(timer)
      resolve(data)
    })

    bridge.process!.stdin!.write(JSON.stringify(cmd) + '\n')
  })
}

// ─── UDS / ECU identification ────────────────────────────────────────────────

export interface ECUIdentification {
  vin?: string
  ecuSerial?: string
  swVersion?: string
  hwVersion?: string
  partNumber?: string
  supplierName?: string
  systemName?: string
  raw: Record<string, string>
}

/** Read standard UDS identification DIDs (no security access required). */
export async function j2534ReadECUID(protocol = 6): Promise<{ ok: boolean; id?: ECUIdentification; error?: string }> {
  if (!bridge) return { ok: false, error: 'Not connected' }

  const DIDs: Array<{ did: [number, number]; name: keyof ECUIdentification | string }> = [
    { did: [0xF1, 0x90], name: 'vin' },
    { did: [0xF1, 0x8C], name: 'ecuSerial' },
    { did: [0xF1, 0x97], name: 'swVersion' },
    { did: [0xF1, 0x93], name: 'hwVersion' },
    { did: [0xF1, 0x87], name: 'partNumber' },
    { did: [0xF1, 0x8A], name: 'supplierName' },
    { did: [0xF2, 0x00], name: 'systemName' },
  ]

  const id: ECUIdentification = { raw: {} }

  for (const { did, name } of DIDs) {
    try {
      // Enter extended session first
      await sendBridgeCommand({ action: 'uds', protocol, data: [0x10, 0x03], timeout: 2000 }, 5000)

      const udsData = [0x22, ...did]
      const result = await sendBridgeCommand({ action: 'uds', protocol, data: udsData, timeout: 2000 }, 5000)
      const parsed = JSON.parse(result)

      if (parsed.ok && parsed.hex) {
        const hex: string = parsed.hex
        // Positive response starts with 62 + DID (2 bytes) = skip 6 hex chars
        const dataHex = hex.startsWith('62') ? hex.slice(6) : hex
        // Try to decode as ASCII
        let decoded = ''
        for (let i = 0; i + 1 < dataHex.length; i += 2) {
          const byte = parseInt(dataHex.slice(i, i + 2), 16)
          decoded += byte >= 0x20 && byte < 0x7F ? String.fromCharCode(byte) : ''
        }
        decoded = decoded.trim()
        if (decoded) {
          ;(id as Record<string, unknown>)[name as string] = decoded
          id.raw[name as string] = dataHex
        }
      }
    } catch { /* skip unsupported DID */ }
  }

  return { ok: true, id }
}

// ─── ECU Memory Read ─────────────────────────────────────────────────────────

export interface ECUReadResult {
  ok: boolean
  data?: Uint8Array
  bytesRead?: number
  error?: string
}

/** Read ECU flash memory via UDS ReadMemoryByAddress (0x23).
 *  Reads in chunks and calls onProgress(pct 0-100, message). */
export async function j2534ReadECUFlash(
  startAddr: number,
  totalLength: number,
  chunkSize: number,
  onProgress: (pct: number, msg: string) => void,
  protocol = 6,
  ecuId = ''
): Promise<ECUReadResult> {
  if (!bridge) return { ok: false, error: 'Not connected' }

  try {
    // Enter extended diagnostic session
    onProgress(0, 'Entering extended diagnostic session...')
    const sessResult = await sendBridgeCommand(
      { action: 'uds', protocol, data: [0x10, 0x03], timeout: 3000 },
      6000
    )
    const sessData = JSON.parse(sessResult)
    if (!sessData.ok && !sessData.hex?.startsWith('50')) {
      // Session response might not be needed — continue anyway
    }

    const outputBuffer = new Uint8Array(totalLength)
    let offset = 0

    while (offset < totalLength) {
      const thisChunk = Math.min(chunkSize, totalLength - offset)
      const addr = startAddr + offset
      const pct = Math.round((offset / totalLength) * 100)
      onProgress(pct, `Reading 0x${addr.toString(16).toUpperCase().padStart(6, '0')} — ${thisChunk} bytes (${pct}%)`)

      const result = await sendBridgeCommand(
        { action: 'readmem', protocol, address: addr, length: thisChunk },
        8000
      )
      const parsed = JSON.parse(result)

      if (!parsed.ok) {
        return { ok: false, error: `Read failed at 0x${addr.toString(16).toUpperCase()}: ${parsed.error}` }
      }

      // Parse hex string into bytes
      const hex: string = parsed.hex || ''
      for (let i = 0; i < hex.length - 1 && offset + i / 2 < totalLength; i += 2) {
        outputBuffer[offset + i / 2] = parseInt(hex.slice(i, i + 2), 16)
      }
      offset += thisChunk
    }

    onProgress(100, `Read complete — ${totalLength} bytes read`)
    return { ok: true, data: outputBuffer, bytesRead: totalLength }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── ECU Flash Write ─────────────────────────────────────────────────────────

export interface ECUWriteResult {
  ok: boolean
  bytesWritten?: number
  error?: string
}

/** Write binary data to ECU via UDS flash programming sequence.
 *  NOTE: Requires security access (seed/key) which is ECU-specific.
 *  This implements the standard UDS flow; the security algorithm must be
 *  implemented per ECU. A "bypass" mode is provided for ECUs that allow
 *  unsecured download (bench/bootloader mode). */
export async function j2534WriteECUFlash(
  data: Uint8Array,
  startAddr: number,
  chunkSize: number,
  onProgress: (pct: number, msg: string) => void,
  protocol = 6,
  ecuId = ''
): Promise<ECUWriteResult> {
  if (!bridge) return { ok: false, error: 'Not connected' }

  try {
    // Step 1: Enter programming session
    onProgress(2, 'Entering ECU programming session (0x10 0x02)...')
    const progSess = await sendBridgeCommand(
      { action: 'uds', protocol, data: [0x10, 0x02], timeout: 3000 },
      6000
    )
    const progData = JSON.parse(progSess)
    if (!progData.ok) {
      return { ok: false, error: `Programming session denied: ${progData.error}. ECU may need security bypass or bench mode.` }
    }

    // Step 2: Security Access — Level 01 (request seed)
    onProgress(5, 'Requesting security seed (0x27 0x01)...')
    const seedResult = await sendBridgeCommand(
      { action: 'uds', protocol, data: [0x27, 0x01], timeout: 3000 },
      6000
    )
    const seedData = JSON.parse(seedResult)
    if (!seedData.ok) {
      return { ok: false, error: `Security access seed request failed: ${seedData.error}` }
    }

    // Parse seed from response (starts with 67 01 <seed bytes>)
    const seedHex: string = seedData.hex || ''
    const seedBytes: number[] = []
    for (let i = 4; i < seedHex.length - 1; i += 2) {
      seedBytes.push(parseInt(seedHex.slice(i, i + 2), 16))
    }

    // Check if seed is all zeros (ECU already unlocked / bypass mode)
    const isUnlocked = seedBytes.every((b) => b === 0)

    if (!isUnlocked) {
      // Calculate the security key using our ECU-specific algorithm
      if (!ecuId) {
        return {
          ok: false,
          error: `ECU requires security access. Seed: ${seedBytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}. No ECU definition selected — select the ECU type and try again.`
        }
      }

      const { calculateKey } = await import('./ecuSeedKey')
      const keyResult = calculateKey(ecuId, seedBytes, protocol === 6 ? 1 : 1)

      if (!keyResult.ok || !keyResult.key) {
        return {
          ok: false,
          error: `Security key calculation failed for ${ecuId}: ${keyResult.error}. Seed was: ${seedBytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}`
        }
      }

      onProgress(8, `Sending security key: ${keyResult.key.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}`)

      // Send key response (0x27 0x02 + key bytes)
      const keyResponse = await sendBridgeCommand(
        { action: 'uds', protocol, data: [0x27, 0x02, ...keyResult.key], timeout: 3000 },
        6000
      )
      const keyData = JSON.parse(keyResponse)
      if (!keyData.ok || !keyData.hex?.startsWith('6702')) {
        return {
          ok: false,
          error: `Security access denied. Key rejected. Seed: ${seedBytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')} | Key sent: ${keyResult.key.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}. The ECU's algorithm may differ from our database — try a different ECU definition.`
        }
      }

      onProgress(10, 'Security access granted')
    }

    // Step 3: RequestDownload (0x34) — tell ECU we're about to write
    onProgress(10, 'Initiating download request (0x34)...')
    const totalLen = data.length
    const addrBytes = [
      (startAddr >> 16) & 0xFF,
      (startAddr >> 8) & 0xFF,
      startAddr & 0xFF,
    ]
    const lenBytes = [
      (totalLen >> 16) & 0xFF,
      (totalLen >> 8) & 0xFF,
      totalLen & 0xFF,
    ]
    const dlRequest = await sendBridgeCommand(
      { action: 'uds', protocol, data: [0x34, 0x00, 0x44, ...addrBytes, ...lenBytes], timeout: 5000 },
      8000
    )
    const dlData = JSON.parse(dlRequest)
    if (!dlData.ok) {
      return { ok: false, error: `RequestDownload failed: ${dlData.error}` }
    }

    // Parse max block size from response (74 <lengthFormatId> <maxBlockSize bytes>)
    const dlHex: string = dlData.hex || ''
    let maxBlock = chunkSize
    if (dlHex.startsWith('74')) {
      const blockLenBytes = parseInt(dlHex.slice(2, 4), 16) >> 4
      let bs = 0
      for (let i = 0; i < blockLenBytes; i++) {
        bs = (bs << 8) | parseInt(dlHex.slice(4 + i * 2, 6 + i * 2), 16)
      }
      if (bs > 0) maxBlock = Math.min(bs - 2, chunkSize) // -2 for service + seq byte overhead
    }

    // Step 4: TransferData (0x36) — send data blocks
    let offset = 0
    let blockSeq = 1
    while (offset < totalLen) {
      const thisChunk = Math.min(maxBlock, totalLen - offset)
      const pct = 10 + Math.round((offset / totalLen) * 85)
      onProgress(pct, `Writing block ${blockSeq} @ 0x${(startAddr + offset).toString(16).toUpperCase()} (${pct}%)`)

      const chunk = Array.from(data.slice(offset, offset + thisChunk))
      const tdResult = await sendBridgeCommand(
        { action: 'uds', protocol, data: [0x36, blockSeq & 0xFF, ...chunk], timeout: 10000 },
        15000
      )
      const tdData = JSON.parse(tdResult)
      if (!tdData.ok) {
        return { ok: false, error: `TransferData failed at block ${blockSeq}: ${tdData.error}` }
      }

      offset += thisChunk
      blockSeq++
    }

    // Step 5: RequestTransferExit (0x37)
    onProgress(97, 'Finalising transfer (0x37)...')
    await sendBridgeCommand({ action: 'uds', protocol, data: [0x37], timeout: 5000 }, 8000)

    // Step 6: ECUReset (0x11 0x01) — soft reset
    onProgress(99, 'Resetting ECU (0x11 0x01)...')
    await sendBridgeCommand({ action: 'uds', protocol, data: [0x11, 0x01], timeout: 3000 }, 6000)

    onProgress(100, `Write complete — ${totalLen} bytes written`)
    return { ok: true, bytesWritten: totalLen }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
