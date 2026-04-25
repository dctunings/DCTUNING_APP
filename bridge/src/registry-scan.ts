/**
 * registry-scan.ts — Find installed J2534 devices via Windows Registry
 *
 * Extracted from dctuning-desktop/src/main/j2534Manager.ts. Logic is identical;
 * we just removed the Electron-specific imports so it works in a plain Node
 * service.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { J2534Device, KnownDeviceInfo } from './types'

// ── Known device fingerprints ──────────────────────────────────────────────
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
      driverNote: 'Requires Scanmatik driver v2.21.21 or v2.21.22 for clone hardware.',
      setupTip: 'PCMTuner clones appear as "Scanmatik - SM2 USB" in Device Manager.',
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
      driverNote: 'Use Scanmatik driver v2.21.21 — do NOT use official PCMTuner software.',
      setupTip: 'Install Scanmatik 2 PRO v2.21.21 drivers.',
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
      driverNote: 'Professional grade. Supports CAN-FD (2020+ vehicles).',
      setupTip: 'Install CarDAQ driver from Drew Technologies.',
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
      driverNote: 'Popular for Subaru/Mitsubishi/Toyota tuning. Open-source firmware.',
      setupTip: 'Install Tactrix driver.',
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
      setupTip: 'Install Mongoose J2534 driver.',
    },
  },
]

function safeFileExists(filePath: string): boolean {
  try { return fs.existsSync(filePath) } catch { return false }
}

function identifyDevice(name: string, dll: string): KnownDeviceInfo | null {
  const searchStr = `${name} ${path.basename(dll)}`
  for (const entry of KNOWN_DEVICES) {
    if (entry.match.test(searchStr)) return entry.info
  }
  return null
}

/**
 * Scan Windows registry for installed J2534 devices.
 *
 * Reads HKLM\SOFTWARE\PassThruSupport.04.04 (and WOW6432Node mirror for
 * 32-bit-registered DLLs). Returns one entry per unique DLL path.
 */
export function scanJ2534Devices(): J2534Device[] {
  const devices: J2534Device[] = []
  if (process.platform !== 'win32') return devices

  const regPaths = [
    'HKLM\\SOFTWARE\\PassThruSupport.04.04',
    'HKLM\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04',
  ]
  const seen = new Set<string>()

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
        const lines = section.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        if (!lines.length) continue
        const keyLine = lines[0]
        if (!keyLine.toUpperCase().startsWith('HKEY')) continue
        const deviceName = keyLine.split('\\').pop()?.trim() || ''
        if (!deviceName || deviceName.toUpperCase().startsWith('PASSTHRU')) continue

        let dll = ''
        let vendor = ''
        for (const line of lines.slice(1)) {
          const parts = line.split(/\s{2,}/)
          if (parts.length < 3) continue
          const valueName = parts[0].trim()
          const value = parts[parts.length - 1].trim()
          if (/functionlibrary/i.test(valueName)) dll = value
          else if (/vendor/i.test(valueName)) vendor = value
        }

        if (!dll) continue
        const dllNorm = dll.toLowerCase()
        if (seen.has(dllNorm)) continue
        seen.add(dllNorm)

        devices.push({
          name: deviceName,
          dll,
          vendor,
          is64bit,
          exists: safeFileExists(dll),
          known: identifyDevice(deviceName, dll),
        })
      }
    } catch {
      // Registry path missing — no devices registered there
    }
  }

  return devices
}
