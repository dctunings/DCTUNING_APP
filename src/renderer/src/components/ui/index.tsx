// Shared UI components for consistent styling across all pages
// Matches the visual style of FleetDashboard, PerformanceMonitor, and Marketplace

import React from 'react'

// ── Card ────────────────────────────────────────────────────────────────────
export const Card: React.FC<{
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}> = ({ children, style, className, onClick }) => (
  <div
    className={className}
    onClick={onClick}
    style={{
      background: 'linear-gradient(145deg, rgba(30,30,35,0.9) 0%, rgba(20,20,25,0.95) 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: 20,
      transition: 'all 0.2s ease',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}
    onMouseEnter={onClick ? (e) => {
      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,174,200,0.3)'
      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
    } : undefined}
    onMouseLeave={onClick ? (e) => {
      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'
      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
    } : undefined}
  >
    {children}
  </div>
)

// ── PageHeader ──────────────────────────────────────────────────────────────
export const PageHeader: React.FC<{
  title: string
  subtitle?: string
  icon?: React.ReactNode
  action?: React.ReactNode
}> = ({ title, subtitle, icon, action }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && <span style={{ color: '#00aec8', fontSize: 22 }}>{icon}</span>}
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', margin: 0 }}>
          {title}
        </h1>
      </div>
      {action}
    </div>
    {subtitle && (
      <p style={{ margin: 0, color: '#888', fontSize: 13 }}>{subtitle}</p>
    )}
  </div>
)

// ── SectionTitle ────────────────────────────────────────────────────────────
export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1.2px',
    color: '#666',
    marginBottom: 12,
    marginTop: 4,
  }}>
    {children}
  </div>
)

// ── Badge ───────────────────────────────────────────────────────────────────
export const Badge: React.FC<{
  children: React.ReactNode
  color?: string
  bg?: string
}> = ({ children, color = '#00aec8', bg = 'rgba(0,174,200,0.12)' }) => (
  <span style={{
    fontSize: 10,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 6,
    background: bg,
    color: color,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  }}>
    {children}
  </span>
)

// ── StatCard ────────────────────────────────────────────────────────────────
export const StatCard: React.FC<{
  label: string
  value: string | number
  unit?: string
  icon?: React.ReactNode
  color?: string
}> = ({ label, value, unit, icon, color = '#00aec8' }) => (
  <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
    {icon && (
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color,
        fontSize: 18,
        flexShrink: 0,
      }}>
        {icon}
      </div>
    )}
    <div>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#eee', lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 13, color: '#888', marginLeft: 4, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  </Card>
)

// ── Grid ────────────────────────────────────────────────────────────────────
export const Grid: React.FC<{
  children: React.ReactNode
  cols?: number
  gap?: number
  style?: React.CSSProperties
}> = ({ children, cols = 3, gap = 14, style }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap,
    ...style,
  }}>
    {children}
  </div>
)

// ── InfoRow ─────────────────────────────────────────────────────────────────
export const InfoRow: React.FC<{
  label: string
  value: React.ReactNode
  highlight?: boolean
}> = ({ label, value, highlight }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }}>
    <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
    <span style={{
      fontSize: 13,
      fontWeight: highlight ? 600 : 400,
      color: highlight ? '#00aec8' : '#ccc',
      textAlign: 'right',
    }}>
      {value}
    </span>
  </div>
)

// ── Button ──────────────────────────────────────────────────────────────────
export const Button: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  style?: React.CSSProperties
}> = ({ children, onClick, variant = 'primary', disabled, style }) => {
  const variants = {
    primary: {
      background: 'linear-gradient(135deg, #00cce0 0%, #00aec8 100%)',
      color: '#000',
    },
    secondary: {
      background: 'rgba(255,255,255,0.08)',
      color: '#ccc',
      border: '1px solid rgba(255,255,255,0.1)',
    },
    danger: {
      background: 'rgba(239,68,68,0.15)',
      color: '#ef4444',
      border: '1px solid rgba(239,68,68,0.2)',
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 18px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        ...variants[variant],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.target as HTMLElement).style.opacity = '0.85'
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.target as HTMLElement).style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{
  icon?: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
}> = ({ icon, title, subtitle, action }) => (
  <div style={{
    textAlign: 'center',
    padding: '60px 20px',
    color: '#666',
  }}>
    {icon && <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>{icon}</div>}
    <div style={{ fontSize: 16, fontWeight: 600, color: '#aaa', marginBottom: 6 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>{subtitle}</div>}
    {action}
  </div>
)

// ── LoadingSpinner ──────────────────────────────────────────────────────────
export const LoadingSpinner: React.FC<{ text?: string }> = ({ text }) => (
  <div style={{ textAlign: 'center', padding: 40 }}>
    <div style={{
      width: 28,
      height: 28,
      border: '2px solid rgba(0,174,200,0.15)',
      borderTopColor: '#00aec8',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      margin: '0 auto 12px',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    {text && <span style={{ fontSize: 13, color: '#666' }}>{text}</span>}
  </div>
)

// ── Input ───────────────────────────────────────────────────────────────────
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
}> = ({ label, error, style, ...props }) => (
  <div style={{ marginBottom: 12 }}>
    {label && (
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
    )}
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        borderRadius: 8,
        border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
        background: 'rgba(0,0,0,0.3)',
        color: '#eee',
        fontSize: 14,
        outline: 'none',
        transition: 'border-color 0.15s',
        boxSizing: 'border-box',
        ...style,
      }}
      onFocus={(e) => {
        e.target.style.borderColor = error ? 'rgba(239,68,68,0.6)' : 'rgba(0,174,200,0.4)'
      }}
      onBlur={(e) => {
        e.target.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'
      }}
    />
    {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{error}</div>}
  </div>
)
