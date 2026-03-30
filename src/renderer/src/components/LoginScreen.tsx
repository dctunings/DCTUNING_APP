import { useState } from 'react'
import logoUrl from '../assets/logo.jpg'
import heroBg from '../../public/hero-big.jpg'

interface Props {
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name: string) => Promise<string | null>
}

const features = [
  { icon: '⚡', label: 'Stage 1 / 2 / 3 Remaps' },
  { icon: '🔌', label: 'J2534 PassThru & Live Data' },
  { icon: '📚', label: '39k+ Tune File Library' },
  { icon: '🔍', label: 'VIN Decoder & ECU Scanner' },
]

export default function LoginScreen({ signIn, signUp }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    if (!email || !password) { setError('Email and password required'); return }
    if (mode === 'signup' && !name) { setError('Name required'); return }
    setError(''); setSuccess(''); setLoading(true)
    const err = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password, name)
    if (err) { setError(err) }
    else if (mode === 'signup') { setSuccess('Account created — check your email to confirm.'); setMode('login') }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Manrope, sans-serif' }}>

      {/* ── LEFT PANEL — hero branding ────────────────────────── */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '48px 44px',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {/* Background car image */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          zIndex: 0,
        }} />
        {/* Dark gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 50%, rgba(0,0,0,.75) 100%)',
          zIndex: 1,
        }} />
        {/* Teal accent bar bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #00aec8, #00cce0, transparent)',
          zIndex: 3,
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              border: '2px solid rgba(0,174,200,.7)',
              boxShadow: '0 0 20px rgba(0,174,200,.4)',
            }}>
              <img src={logoUrl} alt="DC" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>DCTuning</div>
              <div style={{ fontSize: 11, color: '#00aec8', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Ireland</div>
            </div>
          </div>

          {/* Hero headline */}
          <h1 style={{
            fontSize: 'clamp(28px, 3.5vw, 46px)', fontWeight: 900,
            color: '#fff', lineHeight: 1.05, letterSpacing: '-1.5px',
            margin: '0 0 12px',
          }}>
            Professional<br />
            <span style={{ color: '#00cce0' }}>ECU Tuning</span><br />
            at your fingertips.
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', margin: '0 0 32px', lineHeight: 1.65, maxWidth: 340 }}>
            Stage remaps, live diagnostics, J2534 PassThru — everything you need in one desktop suite.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {features.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(0,174,200,.15)', border: '1px solid rgba(0,174,200,.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Version badge */}
          <div style={{ marginTop: 36, fontSize: 11, color: 'rgba(255,255,255,.25)', fontWeight: 600, letterSpacing: '0.5px' }}>
            DCTuning Desktop · v1.2.0 · Ireland
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ───────────────────────────────── */}
      <div style={{
        width: 420,
        flexShrink: 0,
        background: '#0d0d0d',
        borderLeft: '1px solid rgba(255,255,255,.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 36px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle top glow */}
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 300, height: 200,
          background: 'radial-gradient(ellipse, rgba(0,174,200,.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 340, position: 'relative' }}>
          {/* Logo on right panel */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 90, height: 90, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 16px',
              border: '2.5px solid rgba(0,174,200,.65)',
              boxShadow: '0 0 32px rgba(0,174,200,.3), 0 0 64px rgba(0,174,200,.1)',
              background: '#000',
            }}>
              <img src={logoUrl} alt="DCTuning" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', marginBottom: 3 }}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.38)', fontWeight: 500 }}>
              {mode === 'login' ? 'Sign in to your DCTuning account' : 'Get started with DCTuning Ireland'}
            </div>
          </div>

          {/* Inputs */}
          {mode === 'signup' && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>⚠ {error}</div>
          )}
          {success && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, fontSize: 13, color: '#86efac' }}>✓ {success}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', height: 46, borderRadius: 10, border: 'none',
              background: loading ? 'rgba(0,174,200,.35)' : 'linear-gradient(135deg,#00cce0,#008fab)',
              color: '#000', fontWeight: 800, fontSize: 14.5, cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.2px',
              boxShadow: loading ? 'none' : '0 4px 24px rgba(0,174,200,.45)',
              transition: 'all .2s',
            }}
          >
            {loading ? '⏳ Please wait...' : mode === 'login' ? '→  Sign In' : '→  Create Account'}
          </button>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.35)' }}>
            {mode === 'login' ? (
              <>No account?{' '}<span onClick={() => { setMode('signup'); setError('') }} style={{ color: '#00aec8', cursor: 'pointer', fontWeight: 700 }}>Create one free</span></>
            ) : (
              <>Already have an account?{' '}<span onClick={() => { setMode('login'); setError('') }} style={{ color: '#00aec8', cursor: 'pointer', fontWeight: 700 }}>Sign in</span></>
            )}
          </div>

          {/* Trial note */}
          <div style={{
            marginTop: 28, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(0,174,200,.07)', border: '1px solid rgba(0,174,200,.15)',
            textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5,
          }}>
            ⏱ Free trial included — try all Pro features for 1 hour after signing up
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 18, fontSize: 10.5, color: 'rgba(255,255,255,.15)', letterSpacing: '0.5px' }}>
          Secure login via Supabase Auth
        </div>
      </div>

      <style>{`
        input::placeholder { color: rgba(255,255,255,.22) !important; }
        input:focus { border-color: rgba(0,174,200,.55) !important; background: rgba(0,174,200,.05) !important; outline: none; }
      `}</style>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.8px', textTransform: 'uppercase',
  color: 'rgba(255,255,255,.4)', marginBottom: 7,
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44,
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 9, padding: '0 14px',
  color: '#fff', fontSize: 14, fontFamily: 'Manrope, sans-serif',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s, background .2s',
}

function focusIn(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = 'rgba(0,174,200,.55)'
  e.target.style.background = 'rgba(0,174,200,.05)'
}
function focusOut(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = 'rgba(255,255,255,.1)'
  e.target.style.background = 'rgba(255,255,255,.05)'
}
