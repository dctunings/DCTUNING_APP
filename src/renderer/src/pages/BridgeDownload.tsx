/**
 * BridgeDownload.tsx — In-app landing page for downloading the Bridge installer.
 *
 * Customers on the web at app.dctuning.ie click "Download Bridge" from any of
 * the J2534 pages and land here. Replaces the previous flow that linked
 * directly to raw.githubusercontent.com (which just dumped a .exe with no
 * context). Now they get a real customer-facing install page.
 *
 * Direct URL: app.dctuning.ie + (in-app) → 'bridge-download' Page.
 */

import { useEffect, useState } from 'react'
import { bridge } from '../lib/bridgeClient'
import type { Page } from '../App'

interface Props {
  setPage: (p: Page) => void
}

const INSTALLER_VERSION = 'v0.2.0'
const INSTALLER_URL = 'https://raw.githubusercontent.com/dctunings/DCTUNING_APP/main/bridge/releases/DCTuningBridge_Setup_v0.2.0.exe'
const INSTALLER_SIZE = '26 MB'

export default function BridgeDownload({ setPage }: Props) {
  const [bridgeAlive, setBridgeAlive] = useState<'unknown' | 'present' | 'absent'>('unknown')

  useEffect(() => {
    let cancelled = false
    bridge.probe().then(present => {
      if (!cancelled) setBridgeAlive(present ? 'present' : 'absent')
    })
    const t = setInterval(() => {
      bridge.probe().then(present => {
        if (!cancelled) setBridgeAlive(present ? 'present' : 'absent')
      })
    }, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const handleDownload = () => {
    // Trigger download via temporary anchor
    const a = document.createElement('a')
    a.href = INSTALLER_URL
    a.download = `DCTuningBridge_Setup_${INSTALLER_VERSION}.exe`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 0 60px' }}>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center',
        padding: '40px 24px 32px',
        background: 'linear-gradient(135deg, rgba(0,174,200,0.08), rgba(124,58,237,0.06))',
        border: '1px solid rgba(0,174,200,0.25)',
        borderRadius: 16,
        marginBottom: 32,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.4, marginBottom: 12 }}>
          DCTUNING BRIDGE · {INSTALLER_VERSION.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 12px', color: '#fff', lineHeight: 1.2 }}>
          Use your J2534 hardware<br/>directly from the browser
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.6 }}>
          A small Windows service that lets <strong>app.dctuning.ie</strong> talk to your
          Scanmatik / Tactrix / MagicMotorSport / Mongoose / any J2534 PassThru device.
          Install once, runs in the background, no full desktop app required.
        </p>

        {bridgeAlive === 'present' ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 20px', borderRadius: 10,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
            <span style={{ color: '#86efac', fontWeight: 700, fontSize: 14 }}>
              Bridge already installed and running — you're all set
            </span>
            <button
              onClick={() => setPage('ecuflash')}
              style={{
                marginLeft: 14, padding: '7px 14px', borderRadius: 7, border: 'none',
                background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 12, cursor: 'pointer',
              }}
            >
              Open ECU Flash →
            </button>
          </div>
        ) : (
          <button
            onClick={handleDownload}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 28px', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: '#000',
              fontWeight: 900, fontSize: 16, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,174,200,0.35)',
              transition: 'transform 0.1s, box-shadow 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Setup.exe — {INSTALLER_SIZE}
          </button>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
          Windows 10 / 11 · Free · Required for ECU Cloning, Unlock, Flash from the browser
        </div>
      </div>

      {/* ── 3-step install ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 18px', color: '#fff' }}>
          Install in 60 seconds
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            {
              n: '1',
              title: 'Download',
              body: 'Click the big blue button above. Your browser saves DCTuningBridge_Setup_v0.2.0.exe to your Downloads folder.',
            },
            {
              n: '2',
              title: 'Run the installer',
              body: 'Double-click the downloaded .exe. Windows may show "Windows protected your PC" — click "More info → Run anyway". Click through the wizard with the defaults.',
            },
            {
              n: '3',
              title: 'You\'re done',
              body: 'The bridge starts running invisibly in the background. Reload this page — the green "Bridge Connected" pill appears on every J2534 page. Auto-starts every Windows login.',
            },
          ].map(s => (
            <div key={s.n} className="card" style={{ padding: 20 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0,174,200,0.15)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 16, marginBottom: 12,
              }}>{s.n}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── What is it / FAQ ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: '#fff' }}>
          What is the DCTuning Bridge?
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Browsers can't load Windows DLLs directly — that's a security boundary. So when you connect a J2534
          device like Scanmatik, the browser at app.dctuning.ie can't talk to it. The Bridge is a tiny background
          service that bridges the two: browser ↔ Bridge ↔ J2534 DLL ↔ your device.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
          You only need it for hardware operations — ECU Cloning, Unlock, Flash, Live PIDs over CAN. Tune Manager,
          Remap Builder, Performance, Emissions Delete, AI Copilot all work without it (file-based features).
        </p>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: '#fff' }}>
          Frequently asked
        </h3>
        {[
          { q: 'Why do I see "Windows protected your PC"?',
            a: 'Because the installer isn\'t code-signed yet. Click "More info → Run anyway". This goes away in v0.4.0 once the certificate purchase is complete. Your virus scanner won\'t flag it — only Windows SmartScreen.' },
          { q: 'Can I uninstall it later?',
            a: 'Yes, exactly like any Windows app. Settings → Apps → Installed apps → DCTuning Bridge → Uninstall. Cleanly removes everything.' },
          { q: 'Does it use bandwidth?',
            a: 'No — the bridge runs entirely on localhost (127.0.0.1:8765). No network traffic except what the browser already does to app.dctuning.ie.' },
          { q: 'What if I already have the desktop app?',
            a: 'You don\'t need the Bridge — the desktop app already includes everything it does. The Bridge is for customers who prefer the web app over installing the full Electron suite.' },
          { q: 'Why is it 26 MB?',
            a: 'Most of that is a bundled Node.js runtime (the bridge is built with Node SEA). v0.3.0 will be smaller once we strip unused Node modules.' },
        ].map((item, i) => (
          <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{item.q}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{item.a}</div>
          </div>
        ))}
      </div>

      {/* ── Footer note + alternate path ─────────────────────────────────── */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
        Advanced users:{' '}
        <a
          href="https://raw.githubusercontent.com/dctunings/DCTUNING_APP/main/bridge/releases/DCTuningBridge-v0.2.0-win-x64.zip"
          style={{ color: 'var(--accent)' }}
        >
          download bare ZIP
        </a>{' '}
        instead of the installer · Source code:{' '}
        <a
          href="https://github.com/dctunings/DCTUNING_APP/tree/main/bridge"
          target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}
        >
          GitHub
        </a>
      </div>
    </div>
  )
}
