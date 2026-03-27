import { useState } from 'react'

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
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64,
            background: 'var(--accent)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 24, color: '#000',
            margin: '0 auto 16px',
          }}>
            DC
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>DCTuning Desktop</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </div>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: 28 }}>
          {mode === 'signup' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Damien Clancy"
                autoComplete="name"
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: 6, fontSize: 13, color: '#ffaaaa' }}>
              ⚠ {error}
            </div>
          )}

          {success && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--success-dim)', border: '1px solid var(--success)', borderRadius: 6, fontSize: 13, color: 'var(--success)' }}>
              ✓ {success}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', height: 42, fontSize: 14 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '⏳ Please wait...' : mode === 'login' ? '→ Sign In' : '→ Create Account'}
          </button>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            {mode === 'login' ? (
              <>
                No account?{' '}
                <span
                  onClick={() => { setMode('signup'); setError('') }}
                  style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Create one
                </span>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <span
                  onClick={() => { setMode('login'); setError('') }}
                  style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Sign in
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          DCTuning Ireland · Secure login via Supabase Auth
        </div>
      </div>
    </div>
  )
}
