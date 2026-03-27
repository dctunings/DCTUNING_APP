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
import Home from './pages/Home'
import RemapBuilder from './pages/RemapBuilder'
import PricingPage from './pages/PricingPage'
import AccountPage from './pages/AccountPage'
import SubscriptionGate from './components/SubscriptionGate'
import WebLanding from './pages/WebLanding'
import LoginScreen from './components/LoginScreen'
import WebOnlyBanner, { isWebMode } from './components/WebOnlyBanner'
import type { ActiveVehicle } from './lib/vehicleContext'
import { useAuth } from './lib/useAuth'
import { useSubscription } from './lib/useSubscription'
import './styles/app.css'

export type Page =
  | 'home'
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
  | 'remap'
  | 'pricing'
  | 'account'

// Pages that require a live OBD2/J2534 hardware connection
const OBD2_PAGES: Page[] = ['scanner', 'voltage', 'j2534', 'cloning', 'unlock']

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [manufacturer, setManufacturer] = useState<string>('')
  const [vehicle, setVehicle] = useState<string>('')
  const [connected, setConnected] = useState(false)
  const [activeVehicle, setActiveVehicle] = useState<ActiveVehicle | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { user, loading: authLoading, signIn, signUp } = useAuth()

  const {
    subscription,
    plans,
    loading: subLoading,
    isActive,
    isPro,
    isAgency,
    daysRemaining,
    refresh: refreshSub,
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
    switch (page) {
      case 'home':         return <Home />
      case 'dashboard':    return <Dashboard setPage={setPage} connected={connected} activeVehicle={activeVehicle} />
      case 'vin':          return <VINDecoder onVehicleSelect={handleVehicleSelect} activeVehicle={activeVehicle} setPage={setPage} />
      case 'scanner':      return <ECUScanner connected={connected} activeVehicle={activeVehicle} />
      case 'voltage':      return <VoltageMeter connected={connected} />
      case 'wiring':       return <WiringDiagrams activeVehicle={activeVehicle} />
      case 'tunes':        return <TuneManager activeVehicle={activeVehicle} />
      case 'cloning':      return <ECUCloning connected={connected} activeVehicle={activeVehicle} />
      case 'performance':  return <Performance activeVehicle={activeVehicle} />
      case 'emissions':    return <EmissionsDelete activeVehicle={activeVehicle} />
      case 'j2534':        return <J2534PassThru connected={connected} setConnected={setConnected} activeVehicle={activeVehicle} />
      case 'unlock':       return <ECUUnlock connected={connected} activeVehicle={activeVehicle} />
      case 'devices':      return <DeviceLibrary />
      case 'remap':        return <RemapBuilder />
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
            {isWebMode() && OBD2_PAGES.includes(page) && <WebOnlyBanner />}
            {renderPage()}
          </SubscriptionGate>
        </div>
      </div>
    </div>
  )
}
