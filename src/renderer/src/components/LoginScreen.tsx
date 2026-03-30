import { useState } from 'react'
import logoUrl from '../assets/logo.jpg'

interface Props {
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name: string) => Promise<string | null>
}

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
    setError('')
    setSuccess('')
    setLoading(true)

    const err = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password, name)

    if (err) {
      setError(err)
    } else if (mode === 'signup') {
      setSuccess('Account created — check your email to confirm, then log in.')
      setMode('login')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(0,174,200,0.08) 0%, #0a0a0a 60%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle background glow */}
      <div style={{
        position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 300,
        background: 'radial-gradient(ellipse, rgba(0,174,200,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Logo + Branding */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 110, height: 110,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '3px solid rgba(0,174,200,0.7)',
            boxShadow: '0 0 40px rgba(0,174,200,0.35), 0 0 80px rgba(0,174,200,0.12), inset 0 0 20px rgba(0,0,0,0.4)',
            margin: '0 auto 20px',
            background: '#000',
            flexShrink: 0,
          }}>
            <img
              src={logoUrl}
              alt="DCTuning"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>

          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', marginBottom: 4 }}>
            DCTuning Ireland
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase',
            color: '#00aec8', opacity: 0.8,
          }}>
            <span style={{ width: 18, height: 1, background: '#00aec8', display: 'inline-block', opacity: 0.5 }} />
            Professional ECU Tuning Suite
            <span style={{ width: 18, height: 1, background: '#00aec8', display: 'inline-block', opacity: 0.5 }} />
          </div>
        </div>

        {/* Form Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          padding: '32px 32px 28px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 22 }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </div>

          {mode === 'signup' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 7 }}>Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 7 }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 7 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
              ⚠ {error}
            </div>
          )}

          {success && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 8, fontSize: 13, color: '#86efac' }}>
              ✓ {success}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', height: 46, borderRadius: 10, border: 'none',
              background: loading ? 'rgba(0,174,200,0.4)' : 'linear-gradient(135deg, #00cce0, #0096b0)',
              color: '#000', fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.3px',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(0,174,200,0.4)',
              transition: 'all 0.2s',
            }}
          >
            {loading ? '⏳ Please wait...' : mode === 'login' ? '→  Sign In' : '→  Create Account'}
          </button>

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {mode === 'login' ? (
              <>
                No account?{' '}
                <span onClick={() => { setMode('signup'); setError('') }}
                  style={{ color: '#00aec8', cursor: 'pointer', fontWeight: 600 }}>
                  Create one
                </span>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <span onClick={() => { setMode('login'); setError('') }}
                  style={{ color: '#00aec8', cursor: 'pointer', fontWeight: 600 }}>
                  Sign in
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.5px' }}>
          DCTuning Ireland · Secure login via Supabase Auth
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '0 14px',
  color: '#fff',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}
