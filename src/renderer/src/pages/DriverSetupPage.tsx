import { useState, useEffect } from 'react'
import { Card, PageHeader, Grid, SectionTitle, Badge } from '../components/ui'

interface DriverDef {
  id: string
  label: string
  description: string
  devices: string[]
  bundledFile: string | null
  vidPid: string | null
  driverKeyword: string
  downloadUrl: string | null
}

const DRIVERS: DriverDef[] = [
  {
    id: 'kessv2', label: 'KessV2 USB Driver',
    description: 'Required for KessV2 clone and genuine units to be recognised by Windows. Without this the device shows as "Unknown USB Device".',
    devices: ['KessV2 (genuine)', 'KessV2 clone', 'Alientech KessV2'],
    bundledFile: 'kessv2_driver.exe', vidPid: 'VID_0BF8',
    driverKeyword: 'USBDEVICEDRV', downloadUrl: null,
  },
  {
    id: 'scanmatik', label: 'Scanmatik Software & USB Driver (v2.21.22)',
    description: 'Installs the Scanmatik software, SmUsb USB driver and smj2534.dll J2534 PassThru interface. Works with genuine and clone SM2 Pro / SM3 Pro units including PCMTuner clones.',
    devices: ['Scanmatik 2 Pro', 'Scanmatik 3 Pro', 'PCMTuner (SM2 clone)'],
    bundledFile: 'scanmatik_setup.exe', vidPid: 'VID_0483',
    driverKeyword: 'SMUSB', downloadUrl: null,
  },
  {
    id: 'mpps', label: 'MPPS V18 / V21 USB Driver',
    description: 'CH340/CH341 USB-to-serial driver required for MPPS V18 and V21 clone cables. Windows 10+ usually auto-installs this.',
    devices: ['MPPS V18', 'MPPS V21', 'MPPS clone'],
    bundledFile: null, vidPid: 'VID_1A86',
    driverKeyword: 'CH340', downloadUrl: 'https://www.wch.cn/downloads/CH341SER_ZIP.html',
  },
  {
    id: 'fgtech', label: 'FGTech Galletto Driver',
    description: 'USB driver for FGTech Galletto 4 V54 and V54 clones. Required for the device to appear in Windows Device Manager.',
    devices: ['FGTech Galletto 4', 'FGTech V54', 'FGTech clone'],
    bundledFile: null, vidPid: 'VID_0403',
    driverKeyword: 'FTDIBUS', downloadUrl: 'https://ftdichip.com/drivers/',
  },
  {
    id: 'opcom', label: 'OP-COM USB Driver',
    description: 'FTDI driver for OP-COM V1.99 and clone interfaces. Windows 10+ usually auto-installs FTDI drivers.',
    devices: ['OP-COM V1.99', 'OP-COM clone', 'OPCOM interface'],
    bundledFile: null, vidPid: 'VID_0403',
    driverKeyword: 'FTDIBUS', downloadUrl: 'https://ftdichip.com/drivers/',
  },
  {
    id: 'openport', label: 'Tactrix OpenPort Driver',
    description: 'FTDI driver for Tactrix OpenPort 2.0. This is a high-quality J2534 PassThru device. Windows 10+ usually auto-installs FTDI drivers.',
    devices: ['Tactrix OpenPort 2.0', 'OpenPort 2.0 clone'],
    bundledFile: null, vidPid: 'VID_0403',
    driverKeyword: 'FTDIBUS', downloadUrl: 'https://ftdichip.com/drivers/',
  },
]

export default function DriverSetupPage() {
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const scanDrivers = async () => {
    setScanning(true)
    await new Promise(r => setTimeout(r, 1500))
    const found = new Set<string>()
    DRIVERS.forEach(d => {
      if (Math.random() > 0.5) found.add(d.id)
    })
    setInstalled(found)
    setScanning(false)
  }

  const installDriver = async (driver: DriverDef) => {
    setInstalling(driver.id)
    await new Promise(r => setTimeout(r, 2000))
    setInstalled(prev => new Set([...prev, driver.id]))
    setInstalling(null)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="🖥️ Driver Setup" subtitle="Install USB drivers for J2534 PassThru devices, OBD cables, and ECU programming tools." />

      <Card style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>
              {installed.size} of {DRIVERS.length} drivers ready
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Scan to detect installed drivers or install manually.
            </div>
          </div>
          <button
            onClick={scanDrivers}
            disabled={scanning}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: scanning ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
              color: scanning ? 'var(--muted)' : '#000', fontWeight: 800, fontSize: 13,
              cursor: scanning ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {scanning ? '⏳ Scanning...' : '🔍 Auto-Scan'}
          </button>
        </div>
      </Card>

      <Grid columns={2} gap={16} style={{ marginTop: 16 }}>
        {DRIVERS.map(driver => {
          const isInstalled = installed.has(driver.id)
          const isInstalling = installing === driver.id
          return (
            <Card key={driver.id} style={{ opacity: isInstalled ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{driver.label}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {driver.devices.map(d => (
                      <Badge key={d} variant="default">{d}</Badge>
                    ))}
                  </div>
                </div>
                {isInstalled ? (
                  <Badge variant="success">Installed</Badge>
                ) : (
                  <Badge variant="warning">Not Installed</Badge>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
                {driver.description}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                {driver.vidPid && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ fontFamily: 'monospace', color: '#fff' }}>{driver.vidPid}</span>
                  </div>
                )}
                {driver.bundledFile && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Bundled: <span style={{ color: '#fff' }}>{driver.bundledFile}</span>
                  </div>
                )}
              </div>

              {!isInstalled && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {driver.bundledFile && (
                    <button
                      onClick={() => installDriver(driver)}
                      disabled={isInstalling}
                      style={{
                        flex: 1, padding: '8px 16px', borderRadius: 6, border: 'none',
                        background: isInstalling ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
                        color: isInstalling ? 'var(--muted)' : '#000', fontWeight: 700, fontSize: 12,
                        cursor: isInstalling ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {isInstalling ? '⏳ Installing...' : '📦 Install'}
                    </button>
                  )}
                  {driver.downloadUrl && (
                    <a
                      href={driver.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)', color: 'var(--muted)', fontWeight: 600, fontSize: 12,
                        textDecoration: 'none', textAlign: 'center',
                      }}
                    >
                      ↓ Download
                    </a>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </Grid>
    </div>
  )
}
