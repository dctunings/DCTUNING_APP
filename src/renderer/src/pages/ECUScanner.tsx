import { useState, useEffect, useRef } from 'react'
import { elm327 } from '../lib/elm327WebSerial'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Button, Badge } from '../components/ui'

interface Props { connected: boolean }

interface DTCCode {
  code: string
  description: string
  status: 'active' | 'pending' | 'stored'
}

interface LivePID {
  pid: string
  name: string
  value: number
  unit: string
}

// Basic DTC lookup for common codes
const DTC_DB: Record<string, string> = {
  P0001: 'Fuel Volume Regulator Control Circuit Open',
  P0002: 'Fuel Volume Regulator Control Circuit Range/Performance',
  P0016: 'Crankshaft Position - Camshaft Position Correlation (Bank 1 Sensor A)',
  P0087: 'Fuel Rail/System Pressure Too Low',
  P0088: 'Fuel Rail/System Pressure Too High',
  P0097: 'Intake Air Temp Sensor 2 Circuit Low',
  P0099: 'Intake Air Temp Sensor 2 Circuit Intermittent/Erratic',
  P0100: 'Mass or Volume Air Flow Circuit Malfunction',
  P0101: 'Mass Air Flow Circuit Range/Performance',
  P0102: 'Mass Air Flow Circuit Low Input',
  P0103: 'Mass Air Flow Circuit High Input',
  P0105: 'Manifold Absolute Pressure Circuit Malfunction',
  P0106: 'MAP Circuit Range/Performance',
  P0107: 'MAP Circuit Low Input',
  P0108: 'MAP Circuit High Input',
  P0110: 'Intake Air Temperature Circuit Malfunction',
  P0111: 'Intake Air Temperature Circuit Range/Performance',
  P0112: 'Intake Air Temperature Circuit Low Input',
  P0113: 'Intake Air Temperature Circuit High Input',
  P0115: 'Engine Coolant Temperature Circuit Malfunction',
  P0116: 'Engine Coolant Temperature Circuit Range/Performance',
  P0117: 'Engine Coolant Temperature Circuit Low Input',
  P0118: 'Engine Coolant Temperature Circuit High Input',
  P0120: 'Throttle/Pedal Position Sensor A Circuit Malfunction',
  P0121: 'Throttle Position Sensor Range/Performance',
  P0122: 'Throttle Position Sensor Low Input',
  P0123: 'Throttle Position Sensor High Input',
  P0128: 'Coolant Temperature Below Thermostat Regulating Temperature',
  P0130: 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 1)',
  P0131: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)',
  P0132: 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 1)',
  P0133: 'O2 Sensor Circuit Slow Response (Bank 1 Sensor 1)',
  P0135: 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 1)',
  P0140: 'O2 Sensor Circuit No Activity (Bank 1 Sensor 2)',
  P0171: 'System Too Lean (Bank 1)',
  P0172: 'System Too Rich (Bank 1)',
  P0174: 'System Too Lean (Bank 2)',
  P0175: 'System Too Rich (Bank 2)',
  P0190: 'Fuel Rail Pressure Sensor Circuit Malfunction',
  P0200: 'Injector Circuit Malfunction',
  P0201: 'Injector Circuit Malfunction — Cylinder 1',
  P0202: 'Injector Circuit Malfunction — Cylinder 2',
  P0203: 'Injector Circuit Malfunction — Cylinder 3',
  P0204: 'Injector Circuit Malfunction — Cylinder 4',
  P0230: 'Fuel Pump Primary Circuit Malfunction',
  P0243: 'Turbocharger Wastegate Solenoid A Malfunction',
  P0300: 'Random/Multiple Cylinder Misfire Detected',
  P0301: 'Cylinder 1 Misfire Detected',
  P0302: 'Cylinder 2 Misfire Detected',
  P0303: 'Cylinder 3 Misfire Detected',
  P0304: 'Cylinder 4 Misfire Detected',
  P0305: 'Cylinder 5 Misfire Detected',
  P0306: 'Cylinder 6 Misfire Detected',
  P0325: 'Knock Sensor Circuit Malfunction',
  P0335: 'Crankshaft Position Sensor A Circuit Malfunction',
  P0340: 'Camshaft Position Sensor A Circuit Malfunction (Bank 1)',
  P0380: 'Glow Plug/Heater Circuit A Malfunction',
  P0381: 'Glow Plug/Heater Indicator Circuit Malfunction',
  P0400: 'Exhaust Gas Recirculation Flow Malfunction',
  P0401: 'Exhaust Gas Recirculation Flow Insufficient',
  P0403: 'Exhaust Gas Recirculation Control Circuit Malfunction',
  P0420: 'Catalyst System Efficiency Below Threshold (Bank 1)',
  P0440: 'Evaporative Emission Control System Malfunction',
  P0442: 'Evaporative Emission System Leak Detected (small leak)',
  P0470: 'Exhaust Pressure Sensor Malfunction',
  P0480: 'Cooling Fan 1 Control Circuit Malfunction',
  P0481: 'Cooling Fan 2 Control Circuit Malfunction',
  P0500: 'Vehicle Speed Sensor Malfunction',
  P0505: 'Idle Air Control System Malfunction',
  P0562: 'System Voltage Low',
  P0563: 'System Voltage High',
  P0600: 'Serial Communication Link Malfunction',
  P0601: 'Internal Control Module Memory Check Sum Error',
  P0602: 'Control Module Programming Error',
  P0603: 'Internal Control Module Keep Alive Memory Error',
  P0604: 'Internal Control Module RAM Error',
  P0605: 'Internal Control Module ROM Error',
  P0606: 'ECM/PCM Processor Fault',
  P0607: 'Control Module Performance',
  P0700: 'Transmission Control System Malfunction',
  P0705: 'Transmission Range Sensor Circuit Malfunction',
  P0725: 'Engine Speed Input Circuit Malfunction',
  P0730: 'Incorrect Gear Ratio',
  P0740: 'Torque Converter Clutch Circuit Malfunction',
  P0750: 'Shift Solenoid A Malfunction',
  P0760: 'Shift Solenoid C Malfunction',
  P0800: 'Transfer Case Control System (MIL Request)',
  P0810: 'Clutch Position Control Error',
  P0840: 'Transmission Fluid Pressure Sensor/Switch A Circuit',
  P0850: 'Park/Neutral Switch Input Circuit',
  P0860: 'Gear Shift Module Communication Circuit',
  P0890: 'Traction Control System (MIL Request)',
  P0A00: 'Motor Electronics Coolant Temperature Sensor Circuit',
  P0A01: 'Motor Electronics Coolant Temperature Sensor Circuit Range/Performance',
  P0A02: 'Motor Electronics Coolant Temperature Sensor Circuit Low',
  P0A03: 'Motor Electronics Coolant Temperature Sensor Circuit High',
  P0A04: 'Motor Electronics Coolant Temperature Sensor Circuit Intermittent',
  P0A05: 'Motor Electronics Coolant Pump Control Circuit/Open',
  P0A06: 'Motor Electronics Coolant Pump Control Circuit Low',
  P0A07: 'Motor Electronics Coolant Pump Control Circuit High',
  P0A08: 'DC/DC Converter Status Circuit',
  P0A09: 'DC/DC Converter Status Circuit Low Input',
  P0A0A: 'High Voltage System Interlock Circuit',
  P0A0B: 'High Voltage System Interlock Circuit Performance',
  P0A0C: 'High Voltage System Interlock Circuit Low',
  P0A0D: 'High Voltage System Interlock Circuit High',
  P0A0E: 'High Voltage System Interlock Circuit Intermittent/Erratic',
  P0A0F: 'Battery Energy Control Module',
  P0A10: 'Battery Energy Control Module Internal Performance',
  P0A11: 'Drive Motor A Controller Internal Performance',
  P0A12: 'Drive Motor B Controller Internal Performance',
  P0A13: 'Generator Controller Internal Performance',
  P0A14: 'Engine Mount Control Circuit/Open',
  P0A15: 'Engine Mount Control Circuit Low',
  P0A16: 'Engine Mount Control Circuit High',
  P0A17: 'Motor Torque Sensor Circuit',
  P0A18: 'Motor Torque Sensor Circuit Range/Performance',
  P0A19: 'Motor Torque Sensor Circuit Low',
  P0A1A: 'Motor Torque Sensor Circuit High',
  P0A1B: 'Drive Motor A Current',
  P0A1C: 'Drive Motor A Current Range/Performance',
  P0A1D: 'Drive Motor A Current Low',
  P0A1E: 'Drive Motor A Current High',
  P0A1F: 'Drive Motor A Current Intermittent',
  P0A20: 'Drive Motor B Current',
  P0A21: 'Drive Motor B Current Range/Performance',
  P0A22: 'Drive Motor B Current Low',
  P0A23: 'Drive Motor B Current High',
  P0A24: 'Drive Motor B Current Intermittent',
  P0A25: 'Generator Current',
  P0A26: 'Generator Current Range/Performance',
  P0A27: 'Generator Current Low',
  P0A28: 'Generator Current High',
  P0A29: 'Generator Current Intermittent',
  P0A2A: 'Battery Pack Current Sensor Circuit',
  P0A2B: 'Battery Pack Current Sensor Circuit Range/Performance',
  P0A2C: 'Battery Pack Current Sensor Circuit Low',
  P0A2D: 'Battery Pack Current Sensor Circuit High',
  P0A2E: 'Battery Pack Current Sensor Circuit Intermittent/Erratic',
  P0A2F: 'Battery Pack Temperature Sensor Circuit',
  P0A30: 'Battery Pack Temperature Sensor Circuit Range/Performance',
  P0A31: 'Battery Pack Temperature Sensor Circuit Low',
  P0A32: 'Battery Pack Temperature Sensor Circuit High',
  P0A33: 'Battery Pack Temperature Sensor Circuit Intermittent/Erratic',
  P0A34: 'High Voltage Battery Temperature Sensor 1 Circuit',
  P0A35: 'High Voltage Battery Temperature Sensor 1 Circuit Range/Performance',
  P0A36: 'High Voltage Battery Temperature Sensor 1 Circuit Low',
  P0A37: 'High Voltage Battery Temperature Sensor 1 Circuit High',
  P0A38: 'High Voltage Battery Temperature Sensor 1 Circuit Intermittent/Erratic',
  P0A39: 'High Voltage Battery Temperature Sensor 2 Circuit',
  P0A3A: 'High Voltage Battery Temperature Sensor 2 Circuit Range/Performance',
  P0A3B: 'High Voltage Battery Temperature Sensor 2 Circuit Low',
  P0A3C: 'High Voltage Battery Temperature Sensor 2 Circuit High',
  P0A3D: 'High Voltage Battery Temperature Sensor 2 Circuit Intermittent/Erratic',
  P0A3E: 'High Voltage Battery Temperature Sensor 3 Circuit',
  P0A3F: 'High Voltage Battery Temperature Sensor 3 Circuit Range/Performance',
  P0A40: 'High Voltage Battery Temperature Sensor 3 Circuit Low',
  P0A41: 'High Voltage Battery Temperature Sensor 3 Circuit High',
  P0A42: 'High Voltage Battery Temperature Sensor 3 Circuit Intermittent/Erratic',
  P0A43: 'High Voltage Battery Temperature Sensor 4 Circuit',
  P0A44: 'High Voltage Battery Temperature Sensor 4 Circuit Range/Performance',
  P0A45: 'High Voltage Battery Temperature Sensor 4 Circuit Low',
  P0A46: 'High Voltage Battery Temperature Sensor 4 Circuit High',
  P0A47: 'High Voltage Battery Temperature Sensor 4 Circuit Intermittent/Erratic',
  P0A48: 'Battery Pack Cell Voltage 1 Circuit',
  P0A49: 'Battery Pack Cell Voltage 1 Circuit Range/Performance',
  P0A4A: 'Battery Pack Cell Voltage 1 Circuit Low',
  P0A4B: 'Battery Pack Cell Voltage 1 Circuit High',
  P0A4C: 'Battery Pack Cell Voltage 1 Circuit Intermittent/Erratic',
  P0A4D: 'Battery Pack Cell Voltage 2 Circuit',
  P0A4E: 'Battery Pack Cell Voltage 2 Circuit Range/Performance',
  P0A4F: 'Battery Pack Cell Voltage 2 Circuit Low',
  P0A50: 'Battery Pack Cell Voltage 2 Circuit High',
  P0A51: 'Battery Pack Cell Voltage 2 Circuit Intermittent/Erratic',
  P0A52: 'Battery Pack Cell Voltage 3 Circuit',
  P0A53: 'Battery Pack Cell Voltage 3 Circuit Range/Performance',
  P0A54: 'Battery Pack Cell Voltage 3 Circuit Low',
  P0A55: 'Battery Pack Cell Voltage 3 Circuit High',
  P0A56: 'Battery Pack Cell Voltage 3 Circuit Intermittent/Erratic',
  P0A57: 'Battery Pack Cell Voltage 4 Circuit',
  P0A58: 'Battery Pack Cell Voltage 4 Circuit Range/Performance',
  P0A59: 'Battery Pack Cell Voltage 4 Circuit Low',
  P0A5A: 'Battery Pack Cell Voltage 4 Circuit High',
  P0A5B: 'Battery Pack Cell Voltage 4 Circuit Intermittent/Erratic',
  P0A5C: 'Battery Pack Cell Voltage 5 Circuit',
  P0A5D: 'Battery Pack Cell Voltage 5 Circuit Range/Performance',
  P0A5E: 'Battery Pack Cell Voltage 5 Circuit Low',
  P0A5F: 'Battery Pack Cell Voltage 5 Circuit High',
  P0A60: 'Battery Pack Cell Voltage 5 Circuit Intermittent/Erratic',
  P0A61: 'Battery Pack Cell Voltage 6 Circuit',
  P0A62: 'Battery Pack Cell Voltage 6 Circuit Range/Performance',
  P0A63: 'Battery Pack Cell Voltage 6 Circuit Low',
  P0A64: 'Battery Pack Cell Voltage 6 Circuit High',
  P0A65: 'Battery Pack Cell Voltage 6 Circuit Intermittent/Erratic',
  P0A66: 'Battery Pack Cell Voltage 7 Circuit',
  P0A67: 'Battery Pack Cell Voltage 7 Circuit Range/Performance',
  P0A68: 'Battery Pack Cell Voltage 7 Circuit Low',
  P0A69: 'Battery Pack Cell Voltage 7 Circuit High',
  P0A6A: 'Battery Pack Cell Voltage 7 Circuit Intermittent/Erratic',
  P0A6B: 'Battery Pack Cell Voltage 8 Circuit',
  P0A6C: 'Battery Pack Cell Voltage 8 Circuit Range/Performance',
  P0A6D: 'Battery Pack Cell Voltage 8 Circuit Low',
  P0A6E: 'Battery Pack Cell Voltage 8 Circuit High',
  P0A6F: 'Battery Pack Cell Voltage 8 Circuit Intermittent/Erratic',
  P0A70: 'Battery Pack Cell Voltage 9 Circuit',
  P0A71: 'Battery Pack Cell Voltage 9 Circuit Range/Performance',
  P0A72: 'Battery Pack Cell Voltage 9 Circuit Low',
  P0A73: 'Battery Pack Cell Voltage 9 Circuit High',
  P0A74: 'Battery Pack Cell Voltage 9 Circuit Intermittent/Erratic',
  P0A75: 'Battery Pack Cell Voltage 10 Circuit',
  P0A76: 'Battery Pack Cell Voltage 10 Circuit Range/Performance',
  P0A77: 'Battery Pack Cell Voltage 10 Circuit Low',
  P0A78: 'Battery Pack Cell Voltage 10 Circuit High',
  P0A79: 'Battery Pack Cell Voltage 10 Circuit Intermittent/Erratic',
  P0A7A: 'Battery Pack Cell Voltage 11 Circuit',
  P0A7B: 'Battery Pack Cell Voltage 11 Circuit Range/Performance',
  P0A7C: 'Battery Pack Cell Voltage 11 Circuit Low',
  P0A7D: 'Battery Pack Cell Voltage 11 Circuit High',
  P0A7E: 'Battery Pack Cell Voltage 11 Circuit Intermittent/Erratic',
  P0A7F: 'Battery Pack Cell Voltage 12 Circuit',
  P0A80: 'Battery Pack Cell Voltage 12 Circuit Range/Performance',
  P0A81: 'Battery Pack Cell Voltage 12 Circuit Low',
  P0A82: 'Battery Pack Cell Voltage 12 Circuit High',
  P0A83: 'Battery Pack Cell Voltage 12 Circuit Intermittent/Erratic',
  P0A84: 'Battery Pack Cell Voltage 13 Circuit',
  P0A85: 'Battery Pack Cell Voltage 13 Circuit Range/Performance',
  P0A86: 'Battery Pack Cell Voltage 13 Circuit Low',
  P0A87: 'Battery Pack Cell Voltage 13 Circuit High',
  P0A88: 'Battery Pack Cell Voltage 13 Circuit Intermittent/Erratic',
  P0A89: 'Battery Pack Cell Voltage 14 Circuit',
  P0A8A: 'Battery Pack Cell Voltage 14 Circuit Range/Performance',
  P0A8B: 'Battery Pack Cell Voltage 14 Circuit Low',
  P0A8C: 'Battery Pack Cell Voltage 14 Circuit High',
  P0A8D: 'Battery Pack Cell Voltage 14 Circuit Intermittent/Erratic',
  P0A8E: 'Battery Pack Cell Voltage 15 Circuit',
  P0A8F: 'Battery Pack Cell Voltage 15 Circuit Range/Performance',
  P0A90: 'Battery Pack Cell Voltage 15 Circuit Low',
  P0A91: 'Battery Pack Cell Voltage 15 Circuit High',
  P0A92: 'Battery Pack Cell Voltage 15 Circuit Intermittent/Erratic',
  P0A93: 'Battery Pack Cell Voltage 16 Circuit',
  P0A94: 'Battery Pack Cell Voltage 16 Circuit Range/Performance',
  P0A95: 'Battery Pack Cell Voltage 16 Circuit Low',
  P0A96: 'Battery Pack Cell Voltage 16 Circuit High',
  P0A97: 'Battery Pack Cell Voltage 16 Circuit Intermittent/Erratic',
  P0A98: 'Battery Pack Cell Voltage 17 Circuit',
  P0A99: 'Battery Pack Cell Voltage 17 Circuit Range/Performance',
  P0A9A: 'Battery Pack Cell Voltage 17 Circuit Low',
  P0A9B: 'Battery Pack Cell Voltage 17 Circuit High',
  P0A9C: 'Battery Pack Cell Voltage 17 Circuit Intermittent/Erratic',
  P0A9D: 'Battery Pack Cell Voltage 18 Circuit',
  P0A9E: 'Battery Pack Cell Voltage 18 Circuit Range/Performance',
  P0A9F: 'Battery Pack Cell Voltage 18 Circuit Low',
  P0AA0: 'Battery Pack Cell Voltage 18 Circuit High',
  P0AA1: 'Battery Pack Cell Voltage 18 Circuit Intermittent/Erratic',
  P0AA2: 'Battery Pack Cell Voltage 19 Circuit',
  P0AA3: 'Battery Pack Cell Voltage 19 Circuit Range/Performance',
  P0AA4: 'Battery Pack Cell Voltage 19 Circuit Low',
  P0AA5: 'Battery Pack Cell Voltage 19 Circuit High',
  P0AA6: 'Battery Pack Cell Voltage 19 Circuit Intermittent/Erratic',
  P0AA7: 'Battery Pack Cell Voltage 20 Circuit',
  P0AA8: 'Battery Pack Cell Voltage 20 Circuit Range/Performance',
  P0AA9: 'Battery Pack Cell Voltage 20 Circuit Low',
  P0AAA: 'Battery Pack Cell Voltage 20 Circuit High',
  P0AAB: 'Battery Pack Cell Voltage 20 Circuit Intermittent/Erratic',
  P0AAC: 'Battery Pack Cell Voltage 21 Circuit',
  P0AAD: 'Battery Pack Cell Voltage 21 Circuit Range/Performance',
  P0AAE: 'Battery Pack Cell Voltage 21 Circuit Low',
  P0AAF: 'Battery Pack Cell Voltage 21 Circuit High',
  P0AB0: 'Battery Pack Cell Voltage 21 Circuit Intermittent/Erratic',
  P0AB1: 'Battery Pack Cell Voltage 22 Circuit',
  P0AB2: 'Battery Pack Cell Voltage 22 Circuit Range/Performance',
  P0AB3: 'Battery Pack Cell Voltage 22 Circuit Low',
  P0AB4: 'Battery Pack Cell Voltage 22 Circuit High',
  P0AB5: 'Battery Pack Cell Voltage 22 Circuit Intermittent/Erratic',
  P0AB6: 'Battery Pack Cell Voltage 23 Circuit',
  P0AB7: 'Battery Pack Cell Voltage 23 Circuit Range/Performance',
  P0AB8: 'Battery Pack Cell Voltage 23 Circuit Low',
  P0AB9: 'Battery Pack Cell Voltage 23 Circuit High',
  P0ABA: 'Battery Pack Cell Voltage 23 Circuit Intermittent/Erratic',
  P0ABB: 'Battery Pack Cell Voltage 24 Circuit',
  P0ABC: 'Battery Pack Cell Voltage 24 Circuit Range/Performance',
  P0ABD: 'Battery Pack Cell Voltage 24 Circuit Low',
  P0ABE: 'Battery Pack Cell Voltage 24 Circuit High',
  P0ABF: 'Battery Pack Cell Voltage 24 Circuit Intermittent/Erratic',
  P0AC0: 'Battery Pack Cell Voltage 25 Circuit',
  P0AC1: 'Battery Pack Cell Voltage 25 Circuit Range/Performance',
  P0AC2: 'Battery Pack Cell Voltage 25 Circuit Low',
  P0AC3: 'Battery Pack Cell Voltage 25 Circuit High',
  P0AC4: 'Battery Pack Cell Voltage 25 Circuit Intermittent/Erratic',
  P0AC5: 'Battery Pack Cell Voltage 26 Circuit',
  P0AC6: 'Battery Pack Cell Voltage 26 Circuit Range/Performance',
  P0AC7: 'Battery Pack Cell Voltage 26 Circuit Low',
  P0AC8: 'Battery Pack Cell Voltage 26 Circuit High',
  P0AC9: 'Battery Pack Cell Voltage 26 Circuit Intermittent/Erratic',
  P0ACA: 'Battery Pack Cell Voltage 27 Circuit',
  P0ACB: 'Battery Pack Cell Voltage 27 Circuit Range/Performance',
  P0ACC: 'Battery Pack Cell Voltage 27 Circuit Low',
  P0ACD: 'Battery Pack Cell Voltage 27 Circuit High',
  P0ACE: 'Battery Pack Cell Voltage 27 Circuit Intermittent/Erratic',
  P0ACF: 'Battery Pack Cell Voltage 28 Circuit',
  P0AD0: 'Battery Pack Cell Voltage 28 Circuit Range/Performance',
  P0AD1: 'Battery Pack Cell Voltage 28 Circuit Low',
  P0AD2: 'Battery Pack Cell Voltage 28 Circuit High',
  P0AD3: 'Battery Pack Cell Voltage 28 Circuit Intermittent/Erratic',
  P0AD4: 'Battery Pack Cell Voltage 29 Circuit',
  P0AD5: 'Battery Pack Cell Voltage 29 Circuit Range/Performance',
  P0AD6: 'Battery Pack Cell Voltage 29 Circuit Low',
  P0AD7: 'Battery Pack Cell Voltage 29 Circuit High',
  P0AD8: 'Battery Pack Cell Voltage 29 Circuit Intermittent/Erratic',
  P0AD9: 'Battery Pack Cell Voltage 30 Circuit',
  P0ADA: 'Battery Pack Cell Voltage 30 Circuit Range/Performance',
  P0ADB: 'Battery Pack Cell Voltage 30 Circuit Low',
  P0ADC: 'Battery Pack Cell Voltage 30 Circuit High',
  P0ADD: 'Battery Pack Cell Voltage 30 Circuit Intermittent/Erratic',
  P0ADE: 'Battery Pack Cell Voltage 31 Circuit',
  P0ADF: 'Battery Pack Cell Voltage 31 Circuit Range/Performance',
  P0AE0: 'Battery Pack Cell Voltage 31 Circuit Low',
  P0AE1: 'Battery Pack Cell Voltage 31 Circuit High',
  P0AE2: 'Battery Pack Cell Voltage 31 Circuit Intermittent/Erratic',
  P0AE3: 'Battery Pack Cell Voltage 32 Circuit',
  P0AE4: 'Battery Pack Cell Voltage 32 Circuit Range/Performance',
  P0AE5: 'Battery Pack Cell Voltage 32 Circuit Low',
  P0AE6: 'Battery Pack Cell Voltage 32 Circuit High',
  P0AE7: 'Battery Pack Cell Voltage 32 Circuit Intermittent/Erratic',
  P0AE8: 'Battery Pack Cell Voltage 33 Circuit',
  P0AE9: 'Battery Pack Cell Voltage 33 Circuit Range/Performance',
  P0AEA: 'Battery Pack Cell Voltage 33 Circuit Low',
  P0AEB: 'Battery Pack Cell Voltage 33 Circuit High',
  P0AEC: 'Battery Pack Cell Voltage 33 Circuit Intermittent/Erratic',
  P0AED: 'Battery Pack Cell Voltage 34 Circuit',
  P0AEE: 'Battery Pack Cell Voltage 34 Circuit Range/Performance',
  P0AEF: 'Battery Pack Cell Voltage 34 Circuit Low',
  P0AF0: 'Battery Pack Cell Voltage 34 Circuit High',
  P0AF1: 'Battery Pack Cell Voltage 34 Circuit Intermittent/Erratic',
  P0AF2: 'Battery Pack Cell Voltage 35 Circuit',
  P0AF3: 'Battery Pack Cell Voltage 35 Circuit Range/Performance',
  P0AF4: 'Battery Pack Cell Voltage 35 Circuit Low',
  P0AF5: 'Battery Pack Cell Voltage 35 Circuit High',
  P0AF6: 'Battery Pack Cell Voltage 35 Circuit Intermittent/Erratic',
  P0AF7: 'Battery Pack Cell Voltage 36 Circuit',
  P0AF8: 'Battery Pack Cell Voltage 36 Circuit Range/Performance',
  P0AF9: 'Battery Pack Cell Voltage 36 Circuit Low',
  P0AFA: 'Battery Pack Cell Voltage 36 Circuit High',
  P0AFB: 'Battery Pack Cell Voltage 36 Circuit Intermittent/Erratic',
  P0AFC: 'Battery Pack Cell Voltage 37 Circuit',
  P0AFD: 'Battery Pack Cell Voltage 37 Circuit Range/Performance',
  P0AFE: 'Battery Pack Cell Voltage 37 Circuit Low',
  P0AFF: 'Battery Pack Cell Voltage 37 Circuit High',
}

function describeDTC(code: string): string {
  return DTC_DB[code] || 'Unknown diagnostic trouble code — consult manufacturer documentation'
}

function classifyDTC(code: string): 'active' | 'pending' | 'stored' {
  const pendingPrefixes = ['P0', 'P2', 'P3']
  if (pendingPrefixes.some(p => code.startsWith(p))) {
    const num = parseInt(code.slice(1, 4), 10)
    if (num >= 400 && num < 500) return 'pending'
  }
  return 'active'
}

export default function ECUScanner({ connected }: Props) {
  const [scanning, setScanning] = useState(false)
  const [dtcs, setDtcs] = useState<DTCCode[]>([])
  const [rawResponse, setRawResponse] = useState('')
  const [scanComplete, setScanComplete] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [tab, setTab] = useState<'dtc' | 'live'>('dtc')
  const [livePIDs, setLivePIDs] = useState<LivePID[]>([])
  const [livePolling, setLivePolling] = useState(false)
  const [scanError, setScanError] = useState('')
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const startScan = async () => {
    setScanning(true)
    setScanComplete(false)
    setScanError('')
    setDtcs([])
    setRawResponse('')
    try {
      if (!connected || !elm327) {
        setScanError('OBD2 not connected. Connect an ELM327 adapter or J2534 device first.')
        setScanning(false)
        return
      }
      const result: any = await elm327.readDTCs()
      const parsed: DTCCode[] = (result?.codes || []).map((code: string) => ({
        code,
        description: describeDTC(code),
        status: classifyDTC(code),
      }))
      setDtcs(parsed)
      setScanComplete(true)
    } catch (e: any) {
      setScanError(e?.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const clearCodes = async () => {
    if (!dtcs.length) return
    setClearing(true)
    try {
      if (connected && elm327) {
        await elm327.clearDTCs()
      }
      await new Promise(r => setTimeout(r, 1500))
      setDtcs([])
      setScanComplete(false)
      setRawResponse('')
    } catch (e: any) {
      setScanError(e?.message || 'Clear failed')
    } finally {
      setClearing(false)
    }
  }

  const pollLivePIDs = async () => {
    try {
      if (!connected || !elm327) {
        setLivePolling(false)
        return
      }
      const result: any = await elm327.readLiveData()
      const pids: LivePID[] = Object.entries(result).map(([pid, data]) => ({
        pid,
        name: getPIDName(pid),
        value: (data as any).value,
        unit: (data as any).unit,
      }))
      setLivePIDs(pids)
    } catch (e) {
      console.error('Live PID poll failed', e)
    }
  }

  useEffect(() => {
    if (livePolling) {
      liveTimer.current = setInterval(pollLivePIDs, 1000)
      pollLivePIDs()
    } else if (liveTimer.current) {
      clearInterval(liveTimer.current)
      liveTimer.current = null
    }
    return () => { if (liveTimer.current) clearInterval(liveTimer.current) }
  }, [livePolling])

  const barColor = (pid: string, value: number) => {
    if (pid === '05' || pid === '0F') return value > 110 ? '#ef4444' : value > 95 ? '#f59e0b' : '#10b981'
    if (pid === '0C') return value > 6500 ? '#ef4444' : '#00aec8'
    return '#00aec8'
  }

  const getPIDName = (pid: string) => {
    const names: Record<string, string> = {
      '0C': 'Engine RPM', '0D': 'Vehicle Speed', '05': 'Coolant Temp',
      '0F': 'Intake Air Temp', '11': 'Throttle Position', '10': 'MAF Rate',
      '33': 'Absolute Pressure', '2F': 'Fuel Level', '46': 'Ambient Temp',
    }
    return names[pid] || `PID ${pid}`
  }

  const activeCount = dtcs.filter(d => d.status === 'active').length
  const pendingCount = dtcs.filter(d => d.status === 'pending').length

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader
        title="ECU Scanner"
        subtitle="Read & clear diagnostic trouble codes"
        icon="🔍"
      />

      <Grid cols={4} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="Status" value={connected ? 'Connected' : 'Offline'} icon="🔌" color={connected ? '#10b981' : '#ef4444'} />
        <StatCard label="Codes Found" value={dtcs.length} icon="⚠️" color={dtcs.length > 0 ? '#ef4444' : '#10b981'} />
        <StatCard label="Active" value={activeCount} icon="🔴" color="#ef4444" />
        <StatCard label="Pending" value={pendingCount} icon="🟡" color="#f59e0b" />
      </Grid>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['dtc', 'DTC Codes'],
          ['live', 'Live Data'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as 'dtc' | 'live')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: tab === key ? 'linear-gradient(135deg, #00cce0 0%, #00aec8 100%)' : 'rgba(255,255,255,0.06)',
              color: tab === key ? '#000' : '#888',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dtc' && (
        <>
          <SectionTitle>Controls</SectionTitle>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <Button onClick={startScan} disabled={scanning || clearing}>
              {scanning ? '🔍 Scanning...' : '🔍 Scan for Codes'}
            </Button>
            <Button variant="secondary" onClick={clearCodes} disabled={!dtcs.length || clearing || scanning}>
              {clearing ? '🧹 Clearing...' : '🧹 Clear Codes'}
            </Button>
          </div>

          {scanError && (
            <Card style={{ marginBottom: 16, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <div style={{ color: '#ef4444', fontSize: 13 }}>❌ {scanError}</div>
            </Card>
          )}

          {dtcs.length > 0 ? (
            <>
              <SectionTitle>Diagnostic Trouble Codes</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dtcs.map((dtc, i) => (
                  <Card key={i} style={{
                    borderLeft: `3px solid ${{
                      active: '#ef4444',
                      pending: '#f59e0b',
                      stored: '#6b7280'
                    }[dtc.status]}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        fontSize: 20,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        color: {
                          active: '#ef4444',
                          pending: '#f59e0b',
                          stored: '#6b7280'
                        }[dtc.status],
                        minWidth: 70,
                      }}>
                        {dtc.code}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#ccc' }}>{dtc.description}</div>
                        <div style={{ marginTop: 4 }}>
                          <Badge color={{
                            active: '#ef4444',
                            pending: '#f59e0b',
                            stored: '#6b7280'
                          }[dtc.status]} bg={{
                            active: 'rgba(239,68,68,0.12)',
                            pending: 'rgba(245,158,11,0.12)',
                            stored: 'rgba(107,114,128,0.12)'
                          }[dtc.status]}>
                            {dtc.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          ) : scanComplete ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>No codes found</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Your ECU is clear</div>
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🔍</div>
                <div style={{ fontSize: 14, color: '#888' }}>Click Scan to read diagnostic codes</div>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'live' && (
        <>
          <SectionTitle>Controls</SectionTitle>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <Button onClick={() => setLivePolling(!livePolling)} variant={livePolling ? 'danger' : 'primary'}>
              {livePolling ? '⏹ Stop Live Data' : '▶ Start Live Data'}
            </Button>
          </div>

          {livePIDs.length > 0 ? (
            <Grid cols={2} gap={12}>
              {livePIDs.map((pid, i) => (
                <Card key={i} style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                    {pid.name}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: barColor(pid.pid, pid.value), lineHeight: 1 }}>
                    {pid.value}
                    <span style={{ fontSize: 14, color: '#888', marginLeft: 4, fontWeight: 500 }}>{pid.unit}</span>
                  </div>
                  <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (pid.value / (pid.pid === '0C' ? 7000 : pid.pid === '0D' ? 200 : pid.pid === '05' ? 130 : 100)) * 100)}%`,
                      height: '100%',
                      background: barColor(pid.pid, pid.value),
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📊</div>
                <div style={{ fontSize: 14, color: '#888' }}>Start live data to monitor PIDs</div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
