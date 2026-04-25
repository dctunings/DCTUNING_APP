import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './pages/Dashboard'
import VINDecoder from './pages/VINDecoder'
import ECUScanner from './pages/ECUScanner'
import VoltageMeter from './pages/VoltageMeter'
import TuneManager from './pages/TuneManager'
import ECUCloning from './pages/ECUCloning'
import Performance from './pages/Performance'
import EmissionsDelete from './pages/EmissionsDelete'
import J2534PassThru from './pages/J2534PassThru'
import ECUUnlock from './pages/ECUUnlock'
import WiringDiagrams from './pages/WiringDiagrams'
import DeviceLibrary from './pages/DeviceLibrary'
import DriverSetupPage from './pages/DriverSetupPage'
import RemapBuilder from './pages/RemapBuilder'
import ECUFlashManager from './pages/ECUFlashManager'
import PricingPage from './pages/PricingPage'
import AccountPage from './pages/AccountPage'
import SubscriptionGate from './components/SubscriptionGate'
import WebLanding from './pages/WebLanding'
import LoginScreen from './components/LoginScreen'
import WebOnlyBanner, { isWebMode } from './components/WebOnlyBanner'
import AIChatSidebar, { type ChatContext } from './components/AIChatSidebar'
import { bridge } from './lib/bridgeClient'
import type { ActiveVehicle } from './lib/vehicleContext'
import { useAuth } from './lib/useAuth'
import { useSubscription } from './lib/useSubscription'
import type { A2LMapDef } from './lib/a2lParser'
import type { DetectedEcu } from './lib/binaryParser'
import type { ClassificationResult } from './lib/mapClassifier'

export interface EcuFileState {
  fileName: string
  fileBuffer: ArrayBuffer
  detected: DetectedEcu | null
  a2lMaps: A2LMapDef[]
  scanResult?: ClassificationResult | null
  extractedMaps?: import('./lib/binaryParser').ExtractedMap[]  // Maps found via signatures (from Remap Builder)
}
import './styles/app.css'

export type Page =
  | 'dashboard'
  | 'vin'
  | 'scanner'
  | 'voltage'
  | 'wiring'
  | 'tunes'
  | 'cloning'
  | 'performance'
  | 'emissions'
  | 'j2534'
  | 'unlock'
  | 'devices'
  | 'driversetup'
  | 'remap'
  | 'ecuflash'
  | 'pricing'
  | 'account'

// Pages that require a J2534 PassThru DLL bridge (Windows desktop only).
// scanner/voltage/j2534 work in web via Web Serial API (ELM327 over USB), so
// they're NOT gated. Only the J2534-DLL-bridge features (ECU read/write/unlock
// via PassThru) genuinely require the desktop app.
const J2534_DLL_PAGES: Page[] = ['cloning', 'unlock', 'ecuflash']

// Pages that require at least the Pro plan
const PRO_ONLY_PAGES: Page[] = ['tunes', 'j2534', 'unlock', 'cloning', 'emissions', 'ecuflash']

function ProUpgradeWall({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: 16, textAlign: 'center', padding: '40px 24px',
    }}>
      <div style={{ fontSize: 52, marginBottom: 4 }}>🔒</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>Pro Plan Required</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', maxWidth: 400, lineHeight: 1.7 }}>
        This feature is available on the <strong style={{ color: '#00aec8' }}>Pro</strong> and{' '}
        <strong style={{ color: '#a855f7' }}>Agency</strong> plans.
        Upgrade to unlock the full ECU toolkit.
      </div>
      <button
        onClick={() => setPage('pricing')}
        style={{
          marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
          background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 14,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        View Plans &amp; Upgrade →
      </button>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [manufacturer, setManufacturer] = useState<string>('')
  const [vehicle, setVehicle] = useState<string>('')
  const [connected, setConnected] = useState(false)
  const [activeVehicle, setActiveVehicle] = useState<ActiveVehicle | null>(null)
  const [ecuFile, setEcuFile] = useState<EcuFileState | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  // v3.14 Phase B: AI chat sidebar state. The panel is global so it follows the
  // user across pages — context is assembled from the currently-loaded ECU file
  // and the last tune applied in RemapBuilder.
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [lastTuneSummary, setLastTuneSummary] =
    useState<import('./pages/RemapBuilder').RemapTuneSummary | null>(null)
  // Phase B.3 / B.6 — pending quick-prompt or custom-prompt action. Set when a
  // child component (RemapBuilder tile, Zone Editor) asks the chat to run a
  // prompt; the chat consumes + clears it on open.
  const [pendingAIAction, setPendingAIAction] =
    useState<'explain' | 'warnings' | 'safety' | { prompt: string } | null>(null)

  // v3.16.0 — Local J2534 bridge detection. Probes localhost:8765 on mount;
  // when present, the desktop-required banner switches off and the J2534 pages
  // can use the bridge for hardware access.
  const [bridgeStatus, setBridgeStatus] = useState<'unknown' | 'present' | 'absent' | 'connected'>('unknown')
  useEffect(() => {
    if (!isWebMode()) { setBridgeStatus('absent'); return }
    let cancelled = false
    bridge.probe().then(async (present) => {
      if (cancelled) return
      if (!present) { setBridgeStatus('absent'); return }
      setBridgeStatus('present')
      const ok = await bridge.connect()
      if (!cancelled) setBridgeStatus(ok ? 'connected' : 'present')
    })
    const unsub = bridge.onStateChange((connected) => {
      if (cancelled) return
      setBridgeStatus(connected ? 'connected' : 'present')
    })
    return () => { cancelled = true; unsub() }
  }, [])

  const aiContext: ChatContext = {
    fileName: ecuFile?.fileName,
    ecuDef: null,  // TODO: lift ecuDef from RemapBuilder on Phase B.4
    stage: lastTuneSummary?.stage ?? null,
    tier: lastTuneSummary?.tier ?? null,
    mapsModified: lastTuneSummary?.mapsModified,
    remapSummary: lastTuneSummary ? {
      boostChangePct: lastTuneSummary.boostChangePct,
      fuelChangePct: lastTuneSummary.fuelChangePct,
      torqueChangePct: lastTuneSummary.torqueChangePct,
      perMap: lastTuneSummary.perMap,
      validationWarnings: lastTuneSummary.validationWarnings,
      sourceDescription: lastTuneSummary.sourceDescription,
    } : undefined,
  }

  const handleAskAI = (action: 'explain' | 'warnings' | 'safety') => {
    setPendingAIAction(action)
    setAiChatOpen(true)
  }
  // Phase B.6 — custom prompt path used by the Zone Editor "Ask AI" button
  const handleAskAICustom = (prompt: string) => {
    setPendingAIAction({ prompt })
    setAiChatOpen(true)
  }
  const { user, loading: authLoading, signIn, signUp, signOut, resetPassword } = useAuth()

  const {
    subscription,
    plans,
    loading: subLoading,
    isActive,
    isPro,
    isAgency,
    daysRemaining,
    isTrialActive,
    trialMinutesLeft,
    trialExpired,
    createCheckoutSession,
    openCustomerPortal,
  } = useSubscription(user)

  // Called by VINDecoder when user picks a vehicle from DB matches
  const handleVehicleSelect = (v: ActiveVehicle) => {
    setActiveVehicle(v)
    setManufacturer(v.make)
    setVehicle(v.model)
  }

  const renderPage = () => {
    // Gate Pro-only pages — isPro is true during trial, false when trial expired or no sub
    if (PRO_ONLY_PAGES.includes(page) && !isPro) {
      return <ProUpgradeWall setPage={setPage} />
    }

    switch (page) {
      case 'dashboard':    return <Dashboard setPage={setPage} connected={connected} activeVehicle={activeVehicle} />
      case 'vin':          return <VINDecoder onVehicleSelect={handleVehicleSelect} activeVehicle={activeVehicle} setPage={setPage} />
      case 'scanner':      return <ECUScanner connected={connected} activeVehicle={activeVehicle} />
      case 'voltage':      return <VoltageMeter connected={connected} />
      case 'wiring':       return <WiringDiagrams activeVehicle={activeVehicle} />
      case 'tunes':        return <TuneManager activeVehicle={activeVehicle} />
      case 'cloning':      return <ECUCloning connected={connected} activeVehicle={activeVehicle} />
      case 'performance':  return <Performance activeVehicle={activeVehicle} ecuFile={ecuFile} setPage={setPage} />
      case 'emissions':    return <EmissionsDelete activeVehicle={activeVehicle} ecuFile={ecuFile} setPage={setPage} />
      case 'j2534':        return <J2534PassThru connected={connected} setConnected={setConnected} activeVehicle={activeVehicle} />
      case 'unlock':       return <ECUUnlock connected={connected} activeVehicle={activeVehicle} />
      case 'devices':      return <DeviceLibrary />
      case 'driversetup':  return <DriverSetupPage />
      case 'remap':        return <RemapBuilder onEcuLoaded={setEcuFile} onTuneApplied={setLastTuneSummary} onAskAI={handleAskAI} onAskAICustom={handleAskAICustom} />
      case 'ecuflash':     return <ECUFlashManager connected={connected} activeVehicle={activeVehicle} />
      case 'pricing':
        return (
          <PricingPage
            user={user}
            onBack={() => setPage('dashboard')}
            plans={plans}
            subscription={subscription}
            isActive={isActive}
            createCheckoutSession={createCheckoutSession}
            openCustomerPortal={openCustomerPortal}
          />
        )
      case 'account':
        return (
          <AccountPage
            user={user}
            subscription={subscription}
            plans={plans}
            onUpgrade={() => setPage('pricing')}
            openCustomerPortal={openCustomerPortal}
            daysRemaining={daysRemaining}
          />
        )
      default:             return <Dashboard setPage={setPage} connected={connected} activeVehicle={activeVehicle} />
    }
  }

  // ── Web mode: show landing page for unauthenticated visitors ──────────────
  if (isWebMode() && !user && !authLoading) {
    // Enable scroll on html/body for landing page
    document.documentElement.classList.add('landing-mode')

    if (showAuthModal) {
      document.documentElement.classList.remove('landing-mode')
      return (
        <LoginScreen
          signIn={async (email, password) => {
            const err = await signIn(email, password)
            if (!err) setShowAuthModal(false)
            return err
          }}
          signUp={signUp}
          resetPassword={resetPassword}
        />
      )
    }
    return (
      <WebLanding
        onSignIn={() => setShowAuthModal(true)}
        onSignUp={() => setShowAuthModal(true)}
      />
    )
  }

  // Remove landing mode when app is running
  document.documentElement.classList.remove('landing-mode')

  // Desktop: always show login screen if not authenticated
  if (!isWebMode() && !user && !authLoading) {
    return (
      <LoginScreen
        signIn={signIn}
        signUp={signUp}
        resetPassword={resetPassword}
      />
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        currentPage={page}
        setPage={setPage}
        user={user}
        subscription={subscription}
        isActive={isActive}
        isPro={isPro}
        isAgency={isAgency}
        daysRemaining={daysRemaining}
        onSignOut={signOut}
        onSignIn={() => setShowAuthModal(true)}
      />
      <div className="app-main">
        <Topbar
          manufacturer={manufacturer}
          setManufacturer={(m) => { setManufacturer(m); setVehicle(''); setActiveVehicle(null) }}
          vehicle={vehicle}
          setVehicle={setVehicle}
          connected={connected}
          activeVehicle={activeVehicle}
          setActiveVehicle={setActiveVehicle}
        />
        {isTrialActive && trialMinutesLeft !== null && (
          <div className="trial-banner">
            <span className="trial-banner-icon">⏱</span>
            <span className="trial-banner-text">
              Free trial active —{' '}
              <span className="trial-banner-time">
                {trialMinutesLeft >= 60
                  ? `${Math.floor(trialMinutesLeft / 60)}h ${trialMinutesLeft % 60}m`
                  : `${trialMinutesLeft} min`}
              </span>
              {' '}remaining. All Pro features unlocked.
            </span>
            <button className="trial-banner-btn" onClick={() => setPage('pricing')}>
              Upgrade Now →
            </button>
          </div>
        )}
        {trialExpired && (
          <div className="trial-expired-banner">
            <span className="trial-banner-icon">🔒</span>
            <span className="trial-banner-text">
              Your free trial has expired. Subscribe to continue using Pro features.
            </span>
            <button className="trial-expired-btn" onClick={() => setPage('pricing')}>
              View Plans →
            </button>
          </div>
        )}
        <div className="app-content" style={{ padding: page === 'pricing' ? 0 : undefined }}>
          <SubscriptionGate
            user={user}
            setPage={setPage}
            loading={subLoading}
            isActive={isActive}
            subscription={subscription}
            plans={plans}
            daysRemaining={daysRemaining}
            createCheckoutSession={createCheckoutSession}
            openCustomerPortal={openCustomerPortal}
          >
            {isWebMode() && J2534_DLL_PAGES.includes(page) && bridgeStatus !== 'connected' && (
              <WebOnlyBanner bridgeStatus={bridgeStatus} />
            )}
            {isWebMode() && bridgeStatus === 'connected' && J2534_DLL_PAGES.includes(page) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', marginBottom: 16,
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 8, fontSize: 13,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                <span style={{ color: '#86efac', fontWeight: 700 }}>Local Bridge Connected</span>
                <span style={{ color: 'rgba(134,239,172,0.65)' }}>
                  · J2534 hardware accessible · ws://127.0.0.1:8765
                </span>
              </div>
            )}
            {renderPage()}
          </SubscriptionGate>
        </div>
      </div>

      {/* v3.14 Phase B.1 — AI Copilot. Floating trigger + right-docked panel. */}
      {!aiChatOpen && (
        <button
          onClick={() => setAiChatOpen(true)}
          aria-label="Open AI tuning copilot"
          style={{
            position: 'fixed', right: 18, bottom: 18, zIndex: 999,
            width: 54, height: 54, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00aec8, #7c3aed)',
            color: '#000', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
            fontSize: 14, fontWeight: 900, letterSpacing: 0.5,
          }}
        >AI</button>
      )}
      <AIChatSidebar
        open={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        context={aiContext}
        pendingAction={pendingAIAction}
        onActionConsumed={() => setPendingAIAction(null)}
      />
    </div>
  )
}
