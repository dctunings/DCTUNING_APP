export function isWebMode(): boolean {
  return import.meta.env.VITE_WEB_MODE === 'true'
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
}

export default function WebOnlyBanner({ downloadUrl = 'https://github.com/dctunings/DCTUNING_APP/releases/latest' }: Props) {
  if (!isWebMode()) return null

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
          This feature requires the desktop app
        </div>
        <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.65)', lineHeight: 1.5 }}>
          Live OBD2 scanning needs a direct device connection
        </div>
      </div>

      {/* CTA */}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 14px',
          borderRadius: 7,
          background: 'transparent',
          border: '1px solid rgba(245,158,11,0.35)',
          color: '#f59e0b',
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
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
        Download Desktop App
      </a>
    </div>
  )
}
