import { useState, useEffect } from 'react'

// ─── Driver definitions ───────────────────────────────────────────────────────

interface DriverDef {
  id: string
  label: string
  description: string
  devices: string[]
  bundledFile: string | null   // filename in resources/drivers/ — null = download only
  vidPid: string | null        // USB VID:PID to check device presence
  driverKeyword: string        // keyword for Win32_PnPSignedDriver check
  downloadUrl: string | null   // fallback URL if not bundled
}

const DRIVERS: DriverDef[] = [
  {
    id: 'kessv2',
    label: 'KessV2 USB Driver',
    description: 'Required for KessV2 clone and genuine units to be recognised by Windows. Without this the device shows as "Unknown USB Device".',
    devices: ['KessV2 (genuine)', 'KessV2 clone', 'Alientech KessV2'],
    bundledFile: 'kessv2_driver.exe',
    vidPid: 'VID_0BF8',
    driverKeyword: 'USBDEVICEDRV',
    downloadUrl: null,
  },
  {
    id: 'scanmatik',
    label: 'Scanmatik Software & USB Driver (v2.21.22)',
    description: 'Installs the Scanmatik software, SmUsb USB driver and smj2534.dll J2534 PassThru interface. Works with genuine and clone SM2 Pro / SM3 Pro units including PCMTuner clones. Required for DCTuning to communicate with your device.',
    devices: ['SM2 Pro (genuine)', 'SM2 Pro clone', 'SM3 Pro (genuine)', 'SM3 Pro clone', 'KT200 Plus', 'KTflash adapter'],
    bundledFile: 'scanmatik_setup.exe',
    vidPid: 'VID_20A2&PID_0001',
    driverKeyword: 'SmUsb',
    downloadUrl: null,
  },
  {
    id: 'ch340',
    label: 'CH340 / CH341 USB Driver',
    description: 'Required for ELM327 clone adapters (USB version) and many Chinese OBD2 cables that use the CH340/CH341 USB chip.',
    devices: ['ELM327 USB clone', 'GODIAG GD101 (USB)', 'Dialink (USB)', 'Generic OBD2 USB cable', 'Arduino clones'],
    bundledFile: null,
    vidPid: 'VID_1A86&PID_7523',
    driverKeyword: 'CH340',
    downloadUrl: 'https://www.wch-ic.com/downloads/ch341ser_exe.html',
  },
  {
    id: 'ftdi',
    label: 'FTDI USB Driver',
    description: 'Required for genuine FTDI-chip based adapters. Usually auto-installed by Windows Update but manual install is needed on fresh machines.',
    devices: ['Tactrix Openport 2.0', 'Mongoose Pro', 'Genuine ELM327 FTDI', 'Many J2534 adapters'],
    bundledFile: null,
    vidPid: 'VID_0403',
    driverKeyword: 'FTDI',
    downloadUrl: 'https://ftdichip.com/drivers/vcp-drivers/',
  },
  {
    id: 'vcredist',
    label: 'Visual C++ Redistributable',
    description: 'Required runtime libraries for J2534 device DLLs including smj2534.dll (Scanmatik) and KESS software. Install both x86 and x64.',
    devices: ['All J2534 devices', 'KessV2', 'Scanmatik SM2/SM3', 'KT200', 'Most device DLLs'],
    bundledFile: null,
    vidPid: null,
    driverKeyword: 'VisualCRuntime',
    downloadUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
  },
]

// ─── Status type ──────────────────────────────────────────────────────────────

type DriverStatus = 'unknown' | 'checking' | 'installed' | 'not-installed' | 'device-ok' | 'installing' | 'error'

interface DriverState {
  status: DriverStatus
  deviceName?: string
  error?: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverSetupPage() {
  const [states, setStates] = useState<Record<string, DriverState>>(() =>
    Object.fromEntries(DRIVERS.map(d => [d.id, { status: 'unknown' }]))
  )
  const [bundled, setBundled] = useState<{ file: string; size: number }[]>([])

  const ipc = (window as any).electron?.ipcRenderer

  useEffect(() => {
    // List bundled drivers
    ipc?.invoke('driver-list-bundled').then((files: any[]) => {
      if (files) setBundled(files)
    })
    // Auto-check all on load
    DRIVERS.forEach(d => checkDriver(d))
  }, [])

  const setDriverState = (id: string, state: Partial<DriverState>) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...state } }))
  }

  const checkDriver = async (driver: DriverDef) => {
    if (!ipc) return
    setDriverState(driver.id, { status: 'checking' })

    // Check device presence first
    if (driver.vidPid) {
      const res = await ipc.invoke('driver-check-device', driver.vidPid)
      if (res?.present) {
        setDriverState(driver.id, { status: 'device-ok', deviceName: res.name })
        return
      }
    }

    // Check driver installation
    const res = await ipc.invoke('driver-check-installed', driver.driverKeyword)
    setDriverState(driver.id, { status: res?.installed ? 'installed' : 'not-installed' })
  }

  const installDriver = async (driver: DriverDef) => {
    if (!ipc || !driver.bundledFile) return
    setDriverState(driver.id, { status: 'installing' })
    const res = await ipc.invoke('driver-install', driver.bundledFile)
    if (res?.ok) {
      // Re-check after install
      await checkDriver(driver)
    } else {
      setDriverState(driver.id, { status: 'error', error: res?.error || 'Install failed' })
    }
  }

  const openUrl = (url: string) => {
    ipc?.invoke('open-external', url) || window.open(url, '_blank')
  }

  const statusDot = (status: DriverStatus) => {
    const colors: Record<DriverStatus, string> = {
      unknown:       'rgba(255,255,255,.2)',
      checking:      '#f59e0b',
      installed:     'var(--accent)',
      'not-installed': '#ef4444',
      'device-ok':   'var(--accent)',
      installing:    '#f59e0b',
      error:         '#ef4444',
    }
    return (
      <span style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: colors[status], flexShrink: 0,
        boxShadow: (status === 'installed' || status === 'device-ok')
          ? '0 0 6px var(--accent)' : undefined,
      }} />
    )
  }

  const statusLabel = (s: DriverState) => {
    switch (s.status) {
      case 'unknown':       return 'Not checked'
      case 'checking':      return 'Checking...'
      case 'installed':     return 'Driver installed'
      case 'device-ok':     return s.deviceName ? `Device found: ${s.deviceName}` : 'Device detected ✓'
      case 'not-installed': return 'Not installed'
      case 'installing':    return 'Installing...'
      case 'error':         return `Error: ${s.error}`
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1>Driver Setup</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Install USB device drivers for KessV2, Scanmatik SM2/SM3, ELM327 and all J2534 tools
          </p>
        </div>
        <button
          className="btn btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => DRIVERS.forEach(d => checkDriver(d))}
        >
          ↻ Check All
        </button>
      </div>

      {/* Bundled files info */}
      {bundled.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(0,174,200,.06)', borderColor: 'rgba(0,174,200,.2)' }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>
            ✓ {bundled.length} driver installer{bundled.length > 1 ? 's' : ''} bundled in this app
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {bundled.map(f => (
              <span key={f.file} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                {f.file} <span style={{ opacity: .5 }}>({Math.round(f.size / 1024)} KB)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DRIVERS.map(driver => {
          const state = states[driver.id]
          const isBundled = bundled.some(b => b.file === driver.bundledFile)
          const isOk = state.status === 'installed' || state.status === 'device-ok'
          const isBusy = state.status === 'checking' || state.status === 'installing'

          return (
            <div
              key={driver.id}
              className="card"
              style={{
                padding: '14px 16px',
                borderColor: isOk ? 'rgba(0,174,200,.3)' : state.status === 'error' ? 'rgba(239,68,68,.3)' : 'var(--border)',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>

                {/* Status dot */}
                <div style={{ marginTop: 4 }}>
                  {statusDot(state.status)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{driver.label}</span>
                    {isBundled && (
                      <span style={{ fontSize: 10, background: 'rgba(0,174,200,.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                        BUNDLED
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {driver.description}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {driver.devices.map(d => (
                      <span key={d} style={{ fontSize: 11, background: 'var(--bg-hover)', color: 'var(--text-muted)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        {d}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isOk ? 'var(--accent)' : state.status === 'error' ? '#ef4444' : 'var(--text-muted)' }}>
                    {isBusy && (
                      <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    )}
                    {statusLabel(state)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => checkDriver(driver)}
                    disabled={isBusy}
                    style={{ fontSize: 12 }}
                  >
                    Check
                  </button>

                  {isBundled && !isOk && (
                    <button
                      className="btn btn-sm"
                      style={{ background: 'var(--accent)', color: '#000', fontWeight: 600, fontSize: 12 }}
                      onClick={() => installDriver(driver)}
                      disabled={isBusy}
                    >
                      {state.status === 'installing' ? 'Installing…' : '⬇ Install'}
                    </button>
                  )}

                  {!isBundled && driver.downloadUrl && (
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 12 }}
                      onClick={() => openUrl(driver.downloadUrl!)}
                    >
                      Download ↗
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Info box */}
      <div className="card" style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(245,158,11,.05)', borderColor: 'rgba(245,158,11,.2)' }}>
        <div style={{ fontSize: 12, color: 'rgba(245,158,11,.9)', fontWeight: 600, marginBottom: 4 }}>
          ⚠ After installing a driver
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Unplug and re-plug your device after any driver install. Click <strong>Check</strong> to verify.
          If a device still shows as unknown after installing, try a different USB port or restart Windows.
        </div>
      </div>
    </div>
  )
}
