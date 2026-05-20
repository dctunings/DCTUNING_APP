/**
 * PerformanceMonitor.tsx — OBD2 Virtual Dyno & Performance Testing
 * v2.0.0 — Fleet-connected + Standalone modes, Supabase persistence
 *
 * No hardware dyno needed. Uses physics-based HP/TQ estimation from
 * OBD2 speed + RPM + vehicle weight + aerodynamic drag.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { hasToolAccess } from '../lib/buyerSubscription'
import type { OBD2TelemetryFrame, VehicleSpecs, PerformanceTestConfig, ZeroToSixtyResult, QuarterMileResult, BoostOnsetResult, VirtualDynoPoint, SafetyScoreResult } from '../lib/performance/types'
import { OBD2TelemetryCollector } from '../lib/performance/obd2Telemetry'
import { calculateVirtualDyno, getPeakValues, getAverageHp } from '../lib/performance/virtualDyno'
import { runPerformanceTest, enhanceResultWithDyno, analyzeSafety } from '../lib/performance/testRunner'
import { supabase } from '../lib/supabase'
import type { FleetVehicle } from '../lib/fleet'
import { getAllVehicles } from '../lib/fleet'
import { obd2, type TransportInfo, type TransportKind } from '../lib/obd2'

// ── Default Vehicle Specs ───────────────────────────────────────────────────

const DEFAULT_VEHICLE: VehicleSpecs = {
  make: 'VW',
  model: 'Golf GTI',
  year: 2018,
  weightKg: 1420,
  frontalAreaM2: 2.3,
  dragCoefficient: 0.32,
  drivetrainLoss: 15,
  gearRatios: [3.36, 1.95, 1.36, 1.00, 0.85, 0.77],
  finalDrive: 4.77,
  tireDiameterM: 0.64,
  redlineRpm: 6800,
}

// ── Status Colors ────────────────────────────────────────────────────────────

const statusColors = {
  green: { bg: 'rgba(16,185,129,0.15)', border: '#10b981', text: '#10b981', label: 'GREEN — Safe' },
  yellow: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#f59e0b', label: 'YELLOW — Caution' },
  red: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#ef4444', label: 'RED — Stop' },
}

// ── Types for Supabase ──────────────────────────────────────────────────────

interface PerformanceTestRecord {
  id: string
  user_id: string
  vehicle_id: string | null
  vehicle_name: string
  vehicle_make: string
  vehicle_model: string
  vehicle_year: number
  test_type: string
  test_data: any
  result_summary: any
  tune_stage: string | null
  notes: string | null
  created_at: string
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function PerformanceMonitor({ setPage }: { setPage?: (p: string) => void }) {
  // ── Subscription gate ──────────────────────────────────────────
  const [subChecked, setSubChecked] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  useEffect(() => {
    hasToolAccess().then(r => { setHasAccess(r.hasAccess); setSubChecked(true) }).catch(() => setSubChecked(true))
  }, [])

  // ── Vehicle State ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'fleet' | 'standalone'>('standalone')
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([])
  const [selectedFleetId, setSelectedFleetId] = useState<string>('')
  const [vehicle, setVehicle] = useState<VehicleSpecs>(DEFAULT_VEHICLE)

  // ── Test State ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<'idle' | 'safety-check' | 'ready' | 'arming' | 'running' | 'complete'>('idle')
  const [safetyScore, setSafetyScore] = useState<SafetyScoreResult | null>(null)
  const [testType, setTestType] = useState<PerformanceTestConfig['type']>('0-60')
  const [frames, setFrames] = useState<OBD2TelemetryFrame[]>([])
  const [latestFrame, setLatestFrame] = useState<OBD2TelemetryFrame | null>(null)
  const [result, setResult] = useState<ZeroToSixtyResult | QuarterMileResult | BoostOnsetResult | null>(null)
  const [dynoPoints, setDynoPoints] = useState<VirtualDynoPoint[]>([])
  const [error, setError] = useState('')

  // ── History & Saving ──────────────────────────────────────────────────────
  const [testHistory, setTestHistory] = useState<PerformanceTestRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [testNotes, setTestNotes] = useState('')
  const [tuneStage, setTuneStage] = useState('Stock')

  // ── OBD2 Connection State ──────────────────────────────────────────────
  const [obd2Transports, setObd2Transports] = useState<TransportInfo[]>([])
  const [obd2Transport, setObd2TransportLocal] = useState<TransportKind>('webserial')
  const [obd2Connected, setObd2Connected] = useState(false)
  const [obd2Connecting, setObd2Connecting] = useState(false)
  const [obd2Info, setObd2Info] = useState<string>('')
  const [obd2Error, setObd2Error] = useState<string>('')
  const [obd2Voltage, setObd2Voltage] = useState<number | null>(null)
  const [obd2WifiHost, setObd2WifiHost] = useState('192.168.0.10:35000')

  // ── Live Gauges State (poll while connected, even outside tests) ─────────
  const [liveGauges, setLiveGauges] = useState<Record<string, { name: string; value: number; unit: string }>>({})
  const liveGaugesTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Real-Time Run Chart (Speed/RPM vs Time during a test) ────────────────
  const [runChartFrames, setRunChartFrames] = useState<Array<{ t: number; speed: number; rpm: number }>>([])

  // ── Personal Records Tracker (per-vehicle bests from Supabase) ────────────
  const [personalRecords, setPersonalRecords] = useState<{
    best060: number | null
    bestQuarterMile: number | null
    bestTrapSpeed: number | null
    peakHp: number | null
    peakTorque: number | null
  }>({ best060: null, bestQuarterMile: null, bestTrapSpeed: null, peakHp: null, peakTorque: null })

  // ── Before/After Comparison ──────────────────────────────────────────────
  const [comparisonTests, setComparisonTests] = useState<[string | null, string | null]>([null, null])
  const [showComparison, setShowComparison] = useState(false)

  // ── Knock & Trim Alerts ──────────────────────────────────────────────────
  const [runAlerts, setRunAlerts] = useState<Array<{ type: 'knock' | 'lean' | 'rich' | 'overheat'; message: string; timestamp: number }>>([])

  // ── Drag Tree Lights (1/4 mile) ───────────────────────────────────────────
  const [treeLights, setTreeLights] = useState<{ y1: boolean; y2: boolean; y3: boolean; green: boolean }>({ y1: false, y2: false, y3: false, green: false })

  const collectorRef = useRef<OBD2TelemetryCollector | null>(null)
  const framesRef = useRef<OBD2TelemetryFrame[]>([])

  // ── Load Fleet Vehicles ───────────────────────────────────────────────────
  useEffect(() => {
    getAllVehicles().then(setFleetVehicles)
  }, [])

  // ── OBD2: list transports, subscribe to state ────────────────────────────
  useEffect(() => {
    const list = obd2.availableTransports()
    setObd2Transports(list)
    setObd2TransportLocal(obd2.getTransport())
    setObd2Connected(obd2.isConnected())
    const off = obd2.onStateChange(c => setObd2Connected(c))
    return () => { off() }
  }, [])

  // ── Live Gauges: poll readAllLivePIDs every 500ms while connected ────────
  useEffect(() => {
    if (!obd2Connected) {
      if (liveGaugesTimer.current) { clearInterval(liveGaugesTimer.current); liveGaugesTimer.current = null }
      setLiveGauges({})
      return
    }
    const tick = async () => {
      try {
        const data = await obd2.readAllLivePIDs()
        const next: Record<string, { name: string; value: number; unit: string }> = {}
        for (const [pid, d] of Object.entries(data)) {
          next[pid] = { name: d.name, value: d.value, unit: d.unit }
        }
        setLiveGauges(next)
      } catch { /* ignore poll errors */ }
    }
    void tick()
    liveGaugesTimer.current = setInterval(tick, 500)
    return () => {
      if (liveGaugesTimer.current) { clearInterval(liveGaugesTimer.current); liveGaugesTimer.current = null }
    }
  }, [obd2Connected])

  // ── OBD2 connection handlers ─────────────────────────────────────────────
  const handleObd2Connect = useCallback(async () => {
    setObd2Error('')
    setObd2Connecting(true)
    try {
      const r = await obd2.connect({ wifiHost: obd2WifiHost })
      if (!r.ok) { setObd2Error(r.error || 'Connection failed'); return }
      setObd2Info(r.info || obd2.getInfo())
      const v = await obd2.readVoltage()
      setObd2Voltage(v)
    } catch (e) {
      setObd2Error(e instanceof Error ? e.message : String(e))
    } finally {
      setObd2Connecting(false)
    }
  }, [obd2WifiHost])

  const handleObd2Disconnect = useCallback(async () => {
    try { await obd2.disconnect() } catch { /* ignore */ }
    setObd2Voltage(null)
  }, [])

  const handleObd2TransportChange = useCallback(async (kind: TransportKind) => {
    await obd2.setTransport(kind)
    setObd2TransportLocal(kind)
    setObd2Connected(obd2.isConnected())
    setObd2Error('')
  }, [])

  // ── Load Test History ─────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('performance_tests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!error && data) setTestHistory(data)
    } catch (e) {
      console.warn('Failed to load test history:', e)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // ── Handle Fleet Selection ────────────────────────────────────────────────
  const handleFleetSelect = (vehicleId: string) => {
    setSelectedFleetId(vehicleId)
    if (vehicleId === '') {
      setVehicle(DEFAULT_VEHICLE)
      setMode('standalone')
      return
    }
    const fv = fleetVehicles.find(v => v.id === vehicleId)
    if (fv) {
      setMode('fleet')
      setVehicle({
        make: fv.make,
        model: fv.model,
        year: fv.year,
        weightKg: 1500, // Default, user can edit
        frontalAreaM2: 2.3,
        dragCoefficient: 0.32,
        drivetrainLoss: 15,
        gearRatios: [3.36, 1.95, 1.36, 1.00, 0.85, 0.77],
        finalDrive: 4.77,
        tireDiameterM: 0.64,
        redlineRpm: 6800,
      })
    }
  }

  // ── Export CSV (raw telemetry) ──────────────────────────────────────────
  const exportCSV = useCallback(() => {
    if (!frames.length) return
    const headers = ['t_ms','rpm','speed_kmh','speed_mph','throttle_pct','boost_psi','coolant_c','intake_c','timing','load','afr','stft','ltft','knock','maf','map']
    const rows = frames.map(f => [
      f.timestamp, f.rpm, f.speedKmh, f.speedMph, f.throttlePercent,
      f.boostPsi ?? '', f.coolantTempC ?? '', f.intakeTempC ?? '',
      f.timingAdvance ?? '', f.engineLoad ?? '', f.afr ?? '',
      f.fuelTrimShort ?? '', f.fuelTrimLong ?? '', f.knockRetard ?? '',
      f.maf ?? '', f.map ?? '',
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dctuning-${vehicle.year}-${vehicle.make}-${vehicle.model}-${testType}-${Date.now()}.csv`.replace(/\s+/g, '_')
    a.click()
    URL.revokeObjectURL(url)
  }, [frames, vehicle, testType])

  // ── Export Performance Card (PNG) ───────────────────────────────────────
  const exportPerformanceCard = useCallback(() => {
    if (!result) return
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1080, 600)
    grad.addColorStop(0, '#0a0a0a')
    grad.addColorStop(1, '#1a1a2e')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 1080, 600)
    // Brand stripe
    ctx.fillStyle = '#b8f02a'
    ctx.fillRect(0, 0, 1080, 8)
    // Title
    ctx.fillStyle = '#b8f02a'
    ctx.font = 'bold 48px sans-serif'
    ctx.fillText('DCTuning', 60, 90)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '20px sans-serif'
    ctx.fillText('Performance Card', 60, 120)
    // Vehicle name
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 64px sans-serif'
    ctx.fillText(`${vehicle.year} ${vehicle.make} ${vehicle.model}`, 60, 220)
    // Tune stage badge
    ctx.fillStyle = '#3b82f6'
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText(tuneStage.toUpperCase(), 60, 260)
    // Main number (test type result)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 140px sans-serif'
    const r = result as any
    let bigText = ''
    let label = ''
    if (r.zeroToSixty) { bigText = `${r.zeroToSixty.toFixed(2)}s`; label = '0-60 mph' }
    else if (r.quarterMileTime) { bigText = `${r.quarterMileTime.toFixed(2)}s`; label = '1/4 MILE' }
    else if (r.boostOnsetTime) { bigText = `${r.boostOnsetTime.toFixed(2)}s`; label = 'BOOST ONSET' }
    ctx.fillText(bigText, 60, 420)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '24px sans-serif'
    ctx.fillText(label, 60, 460)
    // Peak HP/TQ
    if (r.peakHp || r.peakTorque) {
      ctx.fillStyle = '#f59e0b'
      ctx.font = 'bold 32px sans-serif'
      ctx.fillText(`${r.peakHp?.toFixed(0) ?? '-'} HP  •  ${r.peakTorque?.toFixed(0) ?? '-'} LB-FT`, 60, 510)
    }
    // Footer
    ctx.fillStyle = '#6b7280'
    ctx.font = '14px sans-serif'
    ctx.fillText(new Date().toLocaleString(), 60, 560)
    ctx.fillText('dctuning.ie', 920, 560)
    // Export
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dctuning-card-${vehicle.year}-${vehicle.make}-${vehicle.model}-${Date.now()}.png`.replace(/\s+/g, '_')
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [result, vehicle, tuneStage])

  // ── Save Test Result ──────────────────────────────────────────────────────
  const saveTestResult = async () => {
    if (!result) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('You must be logged in to save test results')
        setSaving(false)
        return
      }

      const record = {
        user_id: user.id,
        vehicle_id: selectedFleetId || null,
        vehicle_name: `${vehicle.make} ${vehicle.model}`,
        vehicle_make: vehicle.make,
        vehicle_model: vehicle.model,
        vehicle_year: vehicle.year,
        test_type: testType,
        test_data: { frames: frames.length, vehicle },
        result_summary: result,
        tune_stage: tuneStage,
        notes: testNotes,
      }

      const { error } = await supabase.from('performance_tests').insert(record)
      if (error) throw error

      setSaveStatus('saved')
      loadHistory()
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (e) {
      console.error('Save error:', e)
      setSaveStatus('error')
      // Fallback: save to localStorage
      const localTests = JSON.parse(localStorage.getItem('dctuning_perf_tests') || '[]')
      localTests.push({ ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() })
      localStorage.setItem('dctuning_perf_tests', JSON.stringify(localTests))
    } finally {
      setSaving(false)
    }
  }

  // ── Safety Check ──────────────────────────────────────────────────────────
  const runSafetyCheck = useCallback(async () => {
    setPhase('safety-check')
    setError('')
    setFrames([])
    framesRef.current = []

    const collector = new OBD2TelemetryCollector({
      pollIntervalMs: 100,
      onFrame: (frame) => {
        framesRef.current.push(frame)
        setLatestFrame(frame)
      },
      onError: (err) => setError(err),
    })

    const started = await collector.start()
    if (!started) {
      setPhase('idle')
      return
    }

    await new Promise(r => setTimeout(r, 2000))
    collector.stop()

    const score = analyzeSafety(framesRef.current)
    setSafetyScore(score)
    setPhase(score.overall === 'red' ? 'idle' : 'ready')
  }, [vehicle])

  // ── Start Test ────────────────────────────────────────────────────────────
  const startTest = useCallback(async () => {
    setPhase('arming')
    setError('')
    setResult(null)
    setDynoPoints([])
    setSaveStatus('idle')
    framesRef.current = []

    setRunChartFrames([])
    setRunAlerts([])
    setTreeLights({ y1: false, y2: false, y3: false, green: false })

    // Drag tree light sequence for 1/4 mile
    if (testType === '1-4-mile') {
      await new Promise(r => setTimeout(r, 300))
      setTreeLights({ y1: true, y2: false, y3: false, green: false })
      await new Promise(r => setTimeout(r, 500))
      setTreeLights({ y1: true, y2: true, y3: false, green: false })
      await new Promise(r => setTimeout(r, 500))
      setTreeLights({ y1: true, y2: true, y3: true, green: false })
      await new Promise(r => setTimeout(r, 500))
      setTreeLights({ y1: false, y2: false, y3: false, green: true })
      await new Promise(r => setTimeout(r, 200))
    }

    const collector = new OBD2TelemetryCollector({
      pollIntervalMs: 50,
      onFrame: (frame) => {
        framesRef.current.push(frame)
        setLatestFrame(frame)
        // Update live run chart (downsample to every 5th frame)
        if (framesRef.current.length % 5 === 0) {
          setRunChartFrames(prev => [...prev, { t: frame.timestamp, speed: frame.speedKmh, rpm: frame.rpm }])
        }
        // Knock & Trim alerts during run
        const alerts: Array<{ type: 'knock' | 'lean' | 'rich' | 'overheat'; message: string; timestamp: number }> = []
        if (frame.knockRetard !== null && frame.knockRetard !== undefined && frame.knockRetard > 2) {
          alerts.push({ type: 'knock', message: `Knock retard ${frame.knockRetard.toFixed(1)}°`, timestamp: frame.timestamp })
        }
        if (frame.fuelTrimShort !== null && frame.fuelTrimShort !== undefined && frame.fuelTrimShort > 15) {
          alerts.push({ type: 'lean', message: `Lean condition (STFT +${frame.fuelTrimShort.toFixed(1)}%)`, timestamp: frame.timestamp })
        }
        if (frame.fuelTrimShort !== null && frame.fuelTrimShort !== undefined && frame.fuelTrimShort < -15) {
          alerts.push({ type: 'rich', message: `Rich condition (STFT ${frame.fuelTrimShort.toFixed(1)}%)`, timestamp: frame.timestamp })
        }
        if (frame.coolantTempC !== null && frame.coolantTempC !== undefined && frame.coolantTempC > 105) {
          alerts.push({ type: 'overheat', message: `Coolant ${frame.coolantTempC.toFixed(0)}°C`, timestamp: frame.timestamp })
        }
        if (alerts.length) setRunAlerts(prev => [...prev, ...alerts])
      },
      onError: (err) => setError(err),
    })

    collectorRef.current = collector
    const started = await collector.start()
    if (!started) {
      setPhase('ready')
      return
    }

    setPhase('running')

    const stopDelay = testType === '1-4-mile' ? 20000 : testType === 'boost-onset' ? 5000 : 15000

    setTimeout(() => {
      collector.stop()
      const allFrames = framesRef.current
      setFrames(allFrames)

      const testResult = runPerformanceTest(allFrames, vehicle, { type: testType }, `test-${Date.now()}`)
      const enhanced = enhanceResultWithDyno(testResult)
      setResult(enhanced as any)

      const points = calculateVirtualDyno(allFrames, vehicle)
      setDynoPoints(points)

      setPhase('complete')
    }, stopDelay)
  }, [testType, vehicle])

  // ── Stop Test ─────────────────────────────────────────────────────────────
  const stopTest = useCallback(() => {
    collectorRef.current?.stop()
    const allFrames = framesRef.current
    setFrames(allFrames)

    if (allFrames.length > 10) {
      const testResult = runPerformanceTest(allFrames, vehicle, { type: testType }, `test-${Date.now()}`)
      const enhanced = enhanceResultWithDyno(testResult)
      setResult(enhanced as any)

      const points = calculateVirtualDyno(allFrames, vehicle)
      setDynoPoints(points)
    }

    setPhase('complete')
  }, [testType, vehicle])

  // ── Render ────────────────────────────────────────────────────────────────
  const peaks = dynoPoints.length > 0 ? getPeakValues(dynoPoints) : null

  // ── Subscription gate renders (after all hooks) ──────────────────────────
  if (!subChecked) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ color: 'var(--text-muted, #888)', fontSize: 15 }}>Checking subscription...</div>
    </div>
  )

  if (!hasAccess) return (
    <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center', padding: '0 20px' }}>
      <div style={{ background: 'var(--bg-card, #1a1a1d)', border: '1px solid var(--border, rgba(255,255,255,0.08))', borderRadius: 20, padding: '48px 32px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: 'var(--text-primary, #fff)', fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Performance Monitor — Subscription Required</h2>
        <p style={{ color: 'var(--text-muted, #888)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
          Virtual dyno, 0-60 testing, quarter mile, boost analysis and before/after comparisons. Choose the plan that fits you.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
          <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 14, padding: '20px 18px', minWidth: 150, textAlign: 'center' }}>
            <div style={{ color: '#f43f5e', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Customer</div>
            <div style={{ color: '#f43f5e', fontWeight: 700, fontSize: 22 }}>€34.99<span style={{ fontSize: 12, fontWeight: 400 }}>/mo</span></div>
            <div style={{ color: 'var(--text-muted, #888)', fontSize: 12, marginTop: 6 }}>5 remap downloads/month</div>
            <div style={{ color: 'var(--text-muted, #888)', fontSize: 12 }}>Remap Builder + Perf Monitor</div>
          </div>
          <div style={{ background: 'rgba(184,240,42,0.08)', border: '1px solid rgba(184,240,42,0.3)', borderRadius: 14, padding: '20px 18px', minWidth: 150, textAlign: 'center' }}>
            <div style={{ color: '#b8f02a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Seller Plans</div>
            <div style={{ color: '#b8f02a', fontWeight: 700, fontSize: 22 }}>From €15<span style={{ fontSize: 12, fontWeight: 400 }}>/mo</span></div>
            <div style={{ color: 'var(--text-muted, #888)', fontSize: 12, marginTop: 6 }}>Unlimited downloads</div>
            <div style={{ color: 'var(--text-muted, #888)', fontSize: 12 }}>All tools + Marketplace</div>
          </div>
        </div>
        <button onClick={() => setPage?.('pricing')} style={{ background: 'var(--accent, #b8f02a)', color: '#000', fontWeight: 700, fontSize: 15, padding: '12px 32px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>View Plans →</button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#b8f02a', marginBottom: 8 }}>
            🏁 Performance Monitor
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>
            Virtual dyno and drag strip testing via OBD2. No hardware dyno required.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowComparison(!showComparison)} disabled={testHistory.length < 2} style={{ ...btnStyle('#a855f7'), opacity: testHistory.length < 2 ? 0.5 : 1, cursor: testHistory.length < 2 ? 'not-allowed' : 'pointer' }} title={testHistory.length < 2 ? 'Need at least 2 saved tests' : 'Compare two saved tests'}>
            📊 Compare
          </button>
          <button onClick={() => setShowHistory(!showHistory)} style={btnStyle('#3b82f6')}>
            📜 {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>
      </div>

      {/* OBD2 Connection */}
      <div style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#b8f02a' }}>📡 OBD2 Connection</span>
            <span style={{
              padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: obd2Connected ? 'rgba(16,185,129,0.15)' : 'rgba(156,163,175,0.15)',
              color: obd2Connected ? '#10b981' : '#9ca3af',
              border: `1px solid ${obd2Connected ? '#10b981' : '#4b5563'}`,
            }}>
              {obd2Connected ? '● Connected' : '○ Not Connected'}
            </span>
            {obd2Voltage !== null && (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>🔋 {obd2Voltage.toFixed(1)} V</span>
            )}
          </div>
          {obd2Info && (
            <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{obd2Info}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {obd2Transports.map(t => (
            <button
              key={t.kind}
              onClick={() => handleObd2TransportChange(t.kind)}
              disabled={!t.available || obd2Connected}
              title={t.description}
              style={{
                padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: obd2Transport === t.kind
                  ? 'rgba(184,240,42,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${obd2Transport === t.kind ? '#b8f02a' : 'rgba(255,255,255,0.1)'}`,
                color: !t.available ? '#6b7280' : obd2Transport === t.kind ? '#b8f02a' : '#d1d5db',
                cursor: t.available && !obd2Connected ? 'pointer' : 'not-allowed',
                opacity: t.available ? 1 : 0.5,
              }}
            >
              {t.kind === 'webserial' && '🔌 '}
              {t.kind === 'webbluetooth' && '📶 '}
              {t.kind === 'wifi' && '📡 '}
              {t.label}
              {!t.available && ' (n/a)'}
            </button>
          ))}
        </div>

        {obd2Transport === 'wifi' && !obd2Connected && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#9ca3af' }}>Host:Port</label>
            <input
              type="text"
              value={obd2WifiHost}
              onChange={e => setObd2WifiHost(e.target.value)}
              placeholder="192.168.0.10:35000"
              style={{
                padding: '6px 10px', borderRadius: 4, fontSize: 12,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', minWidth: 200,
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {!obd2Connected ? (
            <button
              onClick={handleObd2Connect}
              disabled={obd2Connecting || !obd2Transports.find(t => t.kind === obd2Transport)?.available}
              style={{
                padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                background: '#b8f02a', color: '#0a0a0a', border: 'none',
                cursor: obd2Connecting ? 'wait' : 'pointer', opacity: obd2Connecting ? 0.6 : 1,
              }}
            >
              {obd2Connecting ? '⏳ Connecting...' : '🔗 Connect'}
            </button>
          ) : (
            <button
              onClick={handleObd2Disconnect}
              style={{
                padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                border: '1px solid #ef4444', cursor: 'pointer',
              }}
            >
              🔌 Disconnect
            </button>
          )}
        </div>

        {obd2Error && (
          <div style={{ marginTop: 10, padding: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 4, color: '#ef4444', fontSize: 12 }}>
            ⚠️ {obd2Error}
          </div>
        )}
      </div>

      {/* Live Gauges (when OBD2 is connected) */}
      {obd2Connected && Object.keys(liveGauges).length > 0 && (
        <div style={{ marginBottom: 20, padding: 16, background: 'rgba(184,240,42,0.04)', borderRadius: 8, border: '1px solid rgba(184,240,42,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#b8f02a' }}>📊 Live Gauges</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Updating every 500ms</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {Object.entries(liveGauges).map(([pid, g]) => (
              <div key={pid} style={{
                padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{g.name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>
                  {typeof g.value === 'number' ? g.value.toFixed(g.value < 10 ? 2 : g.value < 100 ? 1 : 0) : g.value}
                  <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4, fontWeight: 500 }}>{g.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-Time Run Chart (when test is running) */}
      {phase === 'running' && runChartFrames.length > 1 && (
        <div style={{ marginBottom: 20, padding: 16, background: 'rgba(59,130,246,0.04)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>📈 Live Run Chart</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{runChartFrames.length} samples</div>
          </div>
          <RunChart frames={runChartFrames} />
        </div>
      )}

      {/* Run Alerts (knock / lean / overheat during a run) */}
      {phase === 'running' && runAlerts.length > 0 && (
        <div style={{ marginBottom: 20, padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>⚠️ Live Alerts ({runAlerts.length})</div>
          <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {runAlerts.slice(-6).reverse().map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: a.type === 'knock' ? '#fbbf24' : a.type === 'overheat' ? '#ef4444' : '#f59e0b' }}>
                <strong>{(a.timestamp / 1000).toFixed(1)}s</strong> — {a.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drag Tree Lights (1/4-mile during arming phase) */}
      {phase === 'arming' && testType === '1-4-mile' && (
        <div style={{ marginBottom: 20, padding: 16, background: 'rgba(0,0,0,0.4)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>🏁 Stage Tree</div>
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: treeLights.y1 ? '#fbbf24' : 'rgba(251,191,36,0.15)', border: '2px solid rgba(251,191,36,0.4)', boxShadow: treeLights.y1 ? '0 0 20px #fbbf24' : 'none', transition: 'all 0.2s' }} />
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: treeLights.y2 ? '#fbbf24' : 'rgba(251,191,36,0.15)', border: '2px solid rgba(251,191,36,0.4)', boxShadow: treeLights.y2 ? '0 0 20px #fbbf24' : 'none', transition: 'all 0.2s' }} />
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: treeLights.y3 ? '#fbbf24' : 'rgba(251,191,36,0.15)', border: '2px solid rgba(251,191,36,0.4)', boxShadow: treeLights.y3 ? '0 0 20px #fbbf24' : 'none', transition: 'all 0.2s' }} />
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: treeLights.green ? '#10b981' : 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)', boxShadow: treeLights.green ? '0 0 25px #10b981' : 'none', transition: 'all 0.2s' }} />
          </div>
        </div>
      )}

      {/* Vehicle Selector */}
      <div style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>🚗 Vehicle:</label>
          <select
            value={selectedFleetId}
            onChange={e => handleFleetSelect(e.target.value)}
            style={{
              padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: '#e5e7eb', fontSize: 13, fontFamily: 'inherit', minWidth: 200,
            }}
          >
            <option value="">📝 Custom (manual entry)</option>
            {fleetVehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.year} {v.make} {v.model}
              </option>
            ))}
          </select>
          {mode === 'fleet' && selectedFleetId && (
            <span style={{ fontSize: 12, color: '#4ade80' }}>● From Fleet Manager</span>
          )}
          {mode === 'standalone' && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>○ Manual entry (not saved to fleet)</span>
          )}
        </div>
        {fleetVehicles.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af', padding: 8, background: 'rgba(59,130,246,0.06)', borderRadius: 4, border: '1px solid rgba(59,130,246,0.2)' }}>
            💡 No fleet vehicles yet. Add them in <strong style={{ color: '#60a5fa' }}>Fleet Manager</strong> to import full specs (year/make/model + edit weight here). Test results save to Supabase regardless of mode.
          </div>
        )}

        {/* Manual Entry Fields (shown when standalone / Custom selected) */}
        {mode === 'standalone' && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label style={inputLabelStyle}>Make
              <input style={inputStyle} type="text" value={vehicle.make}
                onChange={e => setVehicle(v => ({ ...v, make: e.target.value }))} />
            </label>
            <label style={inputLabelStyle}>Model
              <input style={inputStyle} type="text" value={vehicle.model}
                onChange={e => setVehicle(v => ({ ...v, model: e.target.value }))} />
            </label>
            <label style={inputLabelStyle}>Year
              <input style={inputStyle} type="number" value={vehicle.year}
                onChange={e => setVehicle(v => ({ ...v, year: parseInt(e.target.value) || v.year }))} />
            </label>
            <label style={inputLabelStyle}>Weight (kg)
              <input style={inputStyle} type="number" value={vehicle.weightKg}
                onChange={e => setVehicle(v => ({ ...v, weightKg: parseFloat(e.target.value) || v.weightKg }))} />
            </label>
            <label style={inputLabelStyle}>Frontal Area (m²)
              <input style={inputStyle} type="number" step="0.01" value={vehicle.frontalAreaM2}
                onChange={e => setVehicle(v => ({ ...v, frontalAreaM2: parseFloat(e.target.value) || v.frontalAreaM2 }))} />
            </label>
            <label style={inputLabelStyle}>Drag Coefficient
              <input style={inputStyle} type="number" step="0.001" value={vehicle.dragCoefficient}
                onChange={e => setVehicle(v => ({ ...v, dragCoefficient: parseFloat(e.target.value) || v.dragCoefficient }))} />
            </label>
            <label style={inputLabelStyle}>Drivetrain Loss (%)
              <input style={inputStyle} type="number" value={vehicle.drivetrainLoss}
                onChange={e => setVehicle(v => ({ ...v, drivetrainLoss: parseFloat(e.target.value) || v.drivetrainLoss }))} />
            </label>
            <label style={inputLabelStyle}>Redline (RPM)
              <input style={inputStyle} type="number" value={vehicle.redlineRpm}
                onChange={e => setVehicle(v => ({ ...v, redlineRpm: parseInt(e.target.value) || v.redlineRpm }))} />
            </label>
          </div>
        )}

        {mode === 'fleet' && selectedFleetId && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#9ca3af' }}>
            Weight (kg): <input style={{ ...inputStyle, marginLeft: 8, maxWidth: 100 }} type="number" value={vehicle.weightKg}
              onChange={e => setVehicle(v => ({ ...v, weightKg: parseFloat(e.target.value) || v.weightKg }))} />
            <span style={{ marginLeft: 12 }}>Adjust other specs in Fleet Manager.</span>
          </div>
        )}
      </div>
      {/* Vehicle Specs Editor */}
      <VehicleEditor vehicle={vehicle} onChange={setVehicle} />

      {/* Safety Score */}
      {safetyScore && (
        <div style={{
          marginBottom: 20,
          padding: 16,
          borderRadius: 8,
          border: `1px solid ${statusColors[safetyScore.overall].border}`,
          background: statusColors[safetyScore.overall].bg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>
              {safetyScore.overall === 'green' ? '✅' : safetyScore.overall === 'yellow' ? '⚠️' : '🛑'}
            </span>
            <span style={{ fontWeight: 700, color: statusColors[safetyScore.overall].text, fontSize: 16 }}>
              {statusColors[safetyScore.overall].label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
            {(['coolant', 'knock', 'fuelTrims', 'boost'] as const).map((key) => (
              <div key={key} style={{
                padding: '6px 10px',
                borderRadius: 4,
                background: statusColors[safetyScore[key]].bg,
                border: `1px solid ${statusColors[safetyScore[key]].border}`,
                fontSize: 12,
                color: statusColors[safetyScore[key]].text,
                textTransform: 'capitalize',
              }}>
                {key}: {safetyScore[key]}
              </div>
            ))}
          </div>
          {safetyScore.details.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#d1d5db', fontSize: 12 }}>
              {safetyScore.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
          <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
            {safetyScore.recommendation}
          </p>
        </div>
      )}

      {/* Test Type Selector */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { id: '0-60', label: '0-60 mph', icon: '⚡' },
          { id: '0-100', label: '0-100 kmh', icon: '🚀' },
          { id: '1-4-mile', label: '1/4 Mile', icon: '🏎️' },
          { id: 'boost-onset', label: 'Boost Onset', icon: '💨' },
          { id: '60-130', label: '60-130 mph', icon: '🛣️' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTestType(t.id as any)}
            disabled={phase === 'running'}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: testType === t.id ? '#b8f02a' : 'rgba(255,255,255,0.1)',
              background: testType === t.id ? 'rgba(184,240,42,0.15)' : 'rgba(255,255,255,0.03)',
              color: testType === t.id ? '#b8f02a' : '#9ca3af',
              fontSize: 13,
              fontWeight: 600,
              cursor: phase === 'running' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Live Telemetry */}
      {latestFrame && phase !== 'idle' && (
        <div style={{
          marginBottom: 20,
          padding: 16,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 12,
        }}>
          <Gauge label="RPM" value={latestFrame.rpm} unit="" max={vehicle.redlineRpm} />
          <Gauge label="Speed" value={latestFrame.speedKmh} unit="km/h" max={300} />
          <Gauge label="Throttle" value={latestFrame.throttlePercent} unit="%" max={100} />
          <Gauge label="Boost" value={latestFrame.boostPsi ?? 0} unit="psi" max={30} />
          <Gauge label="Coolant" value={latestFrame.coolantTempC} unit="°C" max={120} />
          <Gauge label="Load" value={latestFrame.engineLoad} unit="%" max={100} />
        </div>
      )}

      {/* Control Buttons */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
        {phase === 'idle' && (
          <button onClick={runSafetyCheck} style={btnStyle('#3b82f6')}>
            🔍 Run Safety Check
          </button>
        )}
        {phase === 'ready' && (
          <button onClick={startTest} style={btnStyle('#b8f02a', '#0f172a')}>
            🏁 Start {testType.toUpperCase()} Test
          </button>
        )}
        {phase === 'arming' && (
          <button disabled style={btnStyle('#6b7280')}>
            ⏳ Arming...
          </button>
        )}
        {phase === 'running' && (
          <button onClick={stopTest} style={btnStyle('#ef4444')}>
            🛑 Stop Test
          </button>
        )}
        {phase === 'complete' && (
          <>
            <button onClick={runSafetyCheck} style={btnStyle('#3b82f6')}>
              🔍 New Safety Check
            </button>
            <button onClick={startTest} style={btnStyle('#b8f02a', '#0f172a')}>
              🔄 Run Again
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 6, color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#b8f02a', marginBottom: 16 }}>📊 Test Results</h2>

          {/* Result Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {'timeSeconds' in result && (
              <ResultCard label="Time" value={`${result.timeSeconds}s`} sub={testType === '0-60' ? '0-60 mph' : testType} />
            )}
            {'timeSecondsWithRollout' in result && (
              <ResultCard label="With Rollout" value={`${result.timeSecondsWithRollout}s`} sub="1ft rollout" />
            )}
            {'trapSpeedMph' in result && (
              <ResultCard label="Trap Speed" value={`${result.trapSpeedMph} mph`} sub={`${result.trapSpeedKmh} km/h`} />
            )}
            {'sixtyFootTime' in result && (
              <ResultCard label="60ft Time" value={`${result.sixtyFootTime}s`} sub="Launch" />
            )}
            {'timeToTargetMs' in result && (
              <ResultCard label="Boost Onset" value={`${result.timeToTargetMs}ms`} sub={`to ${result.targetBoostPsi} psi`} />
            )}
            {'maxBoostPsi' in result && (
              <ResultCard label="Max Boost" value={`${result.maxBoostPsi} psi`} sub="Recorded" />
            )}
            {peaks && (
              <>
                <ResultCard label="Peak HP" value={`${peaks.peakHp}`} sub={`@${peaks.peakHpRpm} RPM`} />
                <ResultCard label="Peak TQ" value={`${peaks.peakTq} Nm`} sub={`@${peaks.peakTqRpm} RPM`} />
              </>
            )}
          </div>

          {/* Virtual Dyno Chart */}
          {dynoPoints.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginBottom: 12 }}>Virtual Dyno Curve</h3>
              <DynoChart points={dynoPoints} />
            </div>
          )}

          {/* Speed Traps */}
          {'speedTrapData' in result && result.speedTrapData.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginBottom: 12 }}>Speed Traps</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {result.speedTrapData.map((trap, i) => (
                  <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#b8f02a' }}>{trap.speed} km/h</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{trap.timeSeconds.toFixed(2)}s</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Result */}
          <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 12 }}>💾 Save Test Result</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>Tune Stage</label>
                <select
                  value={tuneStage}
                  onChange={e => setTuneStage(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e5e7eb', fontSize: 13, marginTop: 4 }}
                >
                  <option>Stock</option>
                  <option>Stage 1</option>
                  <option>Stage 2</option>
                  <option>Stage 3</option>
                  <option>Custom</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>Notes</label>
                <input
                  type="text"
                  value={testNotes}
                  onChange={e => setTestNotes(e.target.value)}
                  placeholder="e.g. 93 octane, cold day"
                  style={{ width: '100%', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e5e7eb', fontSize: 13, marginTop: 4 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={saveTestResult}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: 6, border: 'none',
                  background: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : '#3b82f6',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : saveStatus === 'saved' ? '✅ Saved to Cloud' : saveStatus === 'error' ? '⚠️ Saved Locally' : '💾 Save to Cloud'}
              </button>
              <button onClick={exportCSV} style={{
                padding: '10px 16px', borderRadius: 6, border: '1px solid #6b7280',
                background: 'transparent', color: '#d1d5db', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>📄 Export CSV</button>
              <button onClick={exportPerformanceCard} style={{
                padding: '10px 16px', borderRadius: 6, border: '1px solid #f59e0b',
                background: 'transparent', color: '#fbbf24', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>🎴 Share Card (PNG)</button>
            </div>
          </div>
        </div>
      )}

      {/* Test History Panel */}
      {showHistory && (
        <div style={{ marginBottom: 24, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginBottom: 12 }}>📜 Test History</h3>
          {testHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No saved tests yet</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {testHistory.map((h) => (
                <div key={h.id} style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{h.vehicle_year} {h.vehicle_make} {h.vehicle_model}</strong>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{h.created_at.slice(0, 10)}</span>
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
                    {h.test_type} · {h.tune_stage || 'Stock'} {h.notes ? `· ${h.notes}` : ''}
                  </div>
                  {h.result_summary && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12 }}>
                      {'timeSeconds' in h.result_summary && (
                        <span style={{ color: '#b8f02a' }}>⏱️ {h.result_summary.timeSeconds}s</span>
                      )}
                      {'trapSpeedMph' in h.result_summary && (
                        <span style={{ color: '#60a5fa' }}>🏁 {h.result_summary.trapSpeedMph} mph</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginBottom: 8 }}>How It Works</h3>
        <ol style={{ margin: 0, paddingLeft: 16, color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>
          <li><strong>Select vehicle:</strong> Choose from Fleet or enter custom specs</li>
          <li>Connect ELM327 OBD2 adapter to your car and this app</li>
          <li>Run <strong>Safety Check</strong> to verify engine health</li>
          <li>Select test type (0-60, 1/4 mile, boost onset)</li>
          <li>Ensure car is on a safe, straight road</li>
          <li>Click <strong>Start Test</strong> and accelerate hard</li>
          <li>App measures performance via OBD2 and estimates HP/TQ using physics</li>
          <li><strong>Save results</strong> to cloud for before/after tune comparisons</li>
        </ol>
      </div>
    </div>
  )
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function VehicleEditor({ vehicle, onChange }: { vehicle: VehicleSpecs; onChange: (v: VehicleSpecs) => void }) {
  const [isOpen, setIsOpen] = useState(false)

  const fields: { key: keyof VehicleSpecs; label: string; unit: string; step?: string }[] = [
    { key: 'weightKg', label: 'Weight', unit: 'kg' },
    { key: 'frontalAreaM2', label: 'Frontal Area', unit: 'm²', step: '0.1' },
    { key: 'dragCoefficient', label: 'Drag Coefficient', unit: 'Cd', step: '0.01' },
    { key: 'drivetrainLoss', label: 'Drivetrain Loss', unit: '%' },
    { key: 'finalDrive', label: 'Final Drive', unit: 'ratio', step: '0.01' },
    { key: 'tireDiameterM', label: 'Tire Diameter', unit: 'm', step: '0.01' },
    { key: 'redlineRpm', label: 'Redline', unit: 'RPM' },
  ]

  return (
    <div style={{ marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        width: '100%',
        padding: '12px 16px',
        background: 'none',
        border: 'none',
        color: '#d1d5db',
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>🚗 Vehicle: {vehicle.make} {vehicle.model} ({vehicle.year})</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                {f.label} ({f.unit})
              </label>
              <input
                type="number"
                step={f.step || '1'}
                value={vehicle[f.key]}
                onChange={(e) => onChange({ ...vehicle, [f.key]: parseFloat(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  color: '#e5e7eb',
                  fontSize: 13,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Gauge({ label, value, unit, max }: { label: string; value: number; unit: string; max: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#e5e7eb', fontFamily: 'monospace' }}>
        {value.toFixed(0)}<span style={{ fontSize: 11, color: '#6b7280' }}>{unit}</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#b8f02a', borderRadius: 2, transition: 'width 0.2s' }} />
      </div>
    </div>
  )
}

function ResultCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      padding: 16,
      background: 'rgba(0,0,0,0.3)',
      borderRadius: 8,
      border: '1px solid rgba(184,240,42,0.2)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#b8f02a' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{sub}</div>
    </div>
  )
}

function DynoChart({ points }: { points: VirtualDynoPoint[] }) {
  const svgWidth = 800
  const svgHeight = 300
  const padding = 40

  const maxRpm = Math.max(...points.map(p => p.rpm), 7000)
  const maxHp = Math.max(...points.map(p => p.crankHp), 100)
  const maxTq = Math.max(...points.map(p => p.crankTqNm), 100)
  const maxVal = Math.max(maxHp, maxTq)

  const xScale = (rpm: number) => padding + (rpm / maxRpm) * (svgWidth - 2 * padding)
  const yScale = (val: number) => svgHeight - padding - (val / maxVal) * (svgHeight - 2 * padding)

  const hpPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.rpm)} ${yScale(p.crankHp)}`).join(' ')
  const tqPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.rpm)} ${yScale(p.crankTqNm)}`).join(' ')

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', maxWidth: 800, height: 'auto' }}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = svgHeight - padding - (pct / 100) * (svgHeight - 2 * padding)
          return (
            <g key={pct}>
              <line x1={padding} y1={y} x2={svgWidth - padding} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <text x={padding - 5} y={y + 4} fill="#6b7280" fontSize={10} textAnchor="end">{Math.round(maxVal * pct / 100)}</text>
            </g>
          )
        })}

        {/* RPM labels */}
        {[0, 2000, 4000, 6000].map(rpm => (
          <text key={rpm} x={xScale(rpm)} y={svgHeight - padding + 18} fill="#6b7280" fontSize={10} textAnchor="middle">
            {rpm}
          </text>
        ))}
        <text x={svgWidth / 2} y={svgHeight - 5} fill="#9ca3af" fontSize={11} textAnchor="middle">RPM</text>
        <text x={15} y={svgHeight / 2} fill="#9ca3af" fontSize={11} textAnchor="middle" transform={`rotate(-90, 15, ${svgHeight / 2})`}>HP / TQ</text>

        {/* Curves */}
        <path d={hpPath} fill="none" stroke="#b8f02a" strokeWidth={2} />
        <path d={tqPath} fill="none" stroke="#3b82f6" strokeWidth={2} />

        {/* Legend */}
        <g transform={`translate(${svgWidth - 140}, 20)`}>
          <rect x={0} y={0} width={120} height={40} fill="rgba(0,0,0,0.5)" rx={4} />
          <line x1={10} y1={14} x2={30} y2={14} stroke="#b8f02a" strokeWidth={2} />
          <text x={36} y={18} fill="#e5e7eb" fontSize={11}>Horsepower</text>
          <line x1={10} y1={30} x2={30} y2={30} stroke="#3b82f6" strokeWidth={2} />
          <text x={36} y={34} fill="#e5e7eb" fontSize={11}>Torque (Nm)</text>
        </g>
      </svg>
    </div>
  )
}

// PRStat helper component
function PRStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
      <div style={{ fontSize: 10, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

// ComparisonChart helper component - overlay dyno curves from two saved tests
function ComparisonChart({ testA, testB }: { testA: any; testB: any }) {
  if (!testA || !testB) return null
  const aData = (testA.test_data?.dynoPoints || []) as Array<{ rpm: number; hp: number; torque: number }>
  const bData = (testB.test_data?.dynoPoints || []) as Array<{ rpm: number; hp: number; torque: number }>
  if (aData.length === 0 && bData.length === 0) {
    return <div style={{ fontSize: 12, color: '#9ca3af' }}>No dyno data in selected tests.</div>
  }
  const allHp = [...aData.map(p => p.hp), ...bData.map(p => p.hp), 0]
  const allRpm = [...aData.map(p => p.rpm), ...bData.map(p => p.rpm), 1000]
  const hpMax = Math.max(...allHp)
  const rpmMax = Math.max(...allRpm)
  const w = 800, hh = 240, pad = 36
  const path = (data: Array<{ rpm: number; hp: number }>) => data.map((p, i) => {
    const x = pad + (p.rpm / rpmMax) * (w - pad * 2)
    const y = hh - pad - (p.hp / hpMax) * (hh - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const peakA = aData.length ? Math.max(...aData.map(p => p.hp)) : 0
  const peakB = bData.length ? Math.max(...bData.map(p => p.hp)) : 0
  const delta = peakB - peakA
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${hh}`} style={{ width: '100%', height: 240, background: 'rgba(0,0,0,0.2)', borderRadius: 6, marginBottom: 8 }}>
        <line x1={pad} y1={hh - pad} x2={w - pad} y2={hh - pad} stroke="rgba(255,255,255,0.1)" />
        <line x1={pad} y1={pad} x2={pad} y2={hh - pad} stroke="rgba(255,255,255,0.1)" />
        <path d={path(aData)} stroke="#9ca3af" strokeWidth={2} fill="none" />
        <path d={path(bData)} stroke="#a855f7" strokeWidth={2.5} fill="none" />
        <text x={pad} y={pad - 8} fill="#9ca3af" fontSize={11}>{`Test A (${peakA.toFixed(0)} hp)`}</text>
        <text x={pad + 220} y={pad - 8} fill="#a855f7" fontSize={11}>{`Test B (${peakB.toFixed(0)} hp)`}</text>
        <text x={w - pad - 100} y={pad - 8} fill={delta > 0 ? '#10b981' : '#ef4444'} fontSize={12} fontWeight="bold">{`${delta >= 0 ? '+' : ''}${delta.toFixed(0)} hp`}</text>
      </svg>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>Curves are overlaid on the same RPM axis. Difference shown top-right.</div>
    </div>
  )
}

// ── RunChart: tiny inline SVG chart for live run telemetry ──────────────────
function RunChart({ frames }: { frames: Array<{ t: number; speed: number; rpm: number }> }) {
  if (frames.length < 2) return null
  const w = 800, h = 200, pad = 30
  const tMin = frames[0].t
  const tMax = frames[frames.length - 1].t
  const tRange = Math.max(1, tMax - tMin)
  const speedMax = Math.max(...frames.map(f => f.speed), 100)
  const rpmMax = Math.max(...frames.map(f => f.rpm), 8000)

  const speedPath = frames.map((f, i) => {
    const x = pad + ((f.t - tMin) / tRange) * (w - pad * 2)
    const y = h - pad - (f.speed / speedMax) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const rpmPath = frames.map((f, i) => {
    const x = pad + ((f.t - tMin) / tRange) * (w - pad * 2)
    const y = h - pad - (f.rpm / rpmMax) * (h - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 200, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.1)" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="rgba(255,255,255,0.1)" />
      <path d={speedPath} stroke="#3b82f6" strokeWidth={2} fill="none" />
      <path d={rpmPath} stroke="#f59e0b" strokeWidth={2} fill="none" />
      <text x={pad} y={pad - 8} fill="#3b82f6" fontSize={11}>Speed (km/h, max {speedMax.toFixed(0)})</text>
      <text x={pad + 200} y={pad - 8} fill="#f59e0b" fontSize={11}>RPM (max {rpmMax.toFixed(0)})</text>
      <text x={pad} y={h - 4} fill="#6b7280" fontSize={10}>{(tMin / 1000).toFixed(1)}s</text>
      <text x={w - pad - 30} y={h - 4} fill="#6b7280" fontSize={10}>{(tMax / 1000).toFixed(1)}s</text>
    </svg>
  )
}

const inputLabelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11,
  color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 4, fontSize: 13,
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontFamily: 'inherit',
}

function btnStyle(bg: string, color = '#fff'): React.CSSProperties {
  return {
    padding: '12px 24px',
    borderRadius: 6,
    border: 'none',
    background: bg,
    color,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  }
}
