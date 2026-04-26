export function isWebMode(): boolean {
  // Runtime detection: Electron exposes window.api via preload; plain browsers never have it
  return !(window as any).api
}

const DownloadIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
)

const ArrowDown = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

interface Props {
  downloadUrl?: string
  bridgeStatus?: 'unknown' | 'present' | 'absent' | 'connected'
  // When set, the CTA navigates to the in-app Bridge Download page (preferred
  // for web users — gives them context, install steps, FAQ before the download).
  // When omitted, falls back to the direct downloadUrl link.
  onClickDownload?: () => void
}

export default function WebOnlyBanner({
  downloadUrl = 'https://github.com/dctunings/DCTUNING_APP/releases/latest',
  bridgeStatus = 'unknown',
  onClickDownload,
}: Props) {
  if (!isWebMode()) return null

  const bridgeAbsent = bridgeStatus === 'absent' || bridgeStatus === 'unknown'
  // v0.2.0: NSIS installer. Customer downloads → wizard installs to Program Files,
  // adds Add/Remove Programs entry, optionally enables Windows auto-start, hides
  // the console window. Replaces the bare-ZIP approach used in v0.1.0.
  const bridgeDownloadUrl = 'https://raw.githubusercontent.com/dctunings/DCTUNING_APP/main/bridge/releases/DCTuningBridge_Setup_v0.2.1.exe'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '12px 16px',
      background: 'rgba(245,158,11,0.08)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 10,
      marginBottom: 20,
    }}>
      {/* Icon */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f59e0b',
        flexShrink: 0,
      }}>
        {DownloadIcon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>
          {bridgeAbsent
            ? 'Install DCTuning Bridge for J2534 hardware in browser'
            : 'DCTuning Bridge detected — connecting...'}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.65)', lineHeight: 1.5 }}>
          {bridgeAbsent
            ? 'Tiny ~30 MB local helper that lets the web app use your J2534 hardware (Scanmatik, Tactrix, etc.) — no full desktop app needed.'
            : 'The bridge service was found on localhost:8765. Establishing WebSocket connection to enable J2534 features.'}
        </div>
      </div>

      {/* CTA — prefer in-app navigation to the BridgeDownload landing page;
          fall back to the direct URL if the parent didn't pass an onClickDownload. */}
      {bridgeAbsent && onClickDownload ? (
        <button
          onClick={onClickDownload}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '7px 14px', borderRadius: 7,
            background: 'transparent',
            border: '1px solid rgba(245,158,11,0.35)',
            color: '#f59e0b', fontSize: 12, fontWeight: 700,
            whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.6)'
            e.currentTarget.style.background = 'rgba(245,158,11,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.35)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {ArrowDown}
          Download Bridge
        </button>
      ) : (
        <a
          href={bridgeAbsent ? bridgeDownloadUrl : downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '7px 14px', borderRadius: 7,
            background: 'transparent',
            border: '1px solid rgba(245,158,11,0.35)',
            color: '#f59e0b', fontSize: 12, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            fontFamily: 'Manrope, sans-serif',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.6)'
            e.currentTarget.style.background = 'rgba(245,158,11,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.35)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {ArrowDown}
          {bridgeAbsent ? 'Download Bridge' : 'Reconnecting…'}
        </a>
      )}
    </div>
  )
}
