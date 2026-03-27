import { useState } from 'react'
import { decodeVIN, type VINResult } from '../lib/nhtsa'
import { supabase } from '../lib/supabase'
import type { ActiveVehicle } from '../lib/vehicleContext'
import type { Page } from '../App'

interface Props {
  onVehicleSelect: (v: ActiveVehicle) => void
  activeVehicle: ActiveVehicle | null
  setPage: (p: Page) => void
}

export default function VINDecoder({ onVehicleSelect, activeVehicle, setPage }: Props) {
  const [vin, setVin] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VINResult | null>(null)
  const [dbMatches, setDbMatches] = useState<ActiveVehicle[]>([])
  const [error, setError] = useState('')
  const [selectedRow, setSelectedRow] = useState<ActiveVehicle | null>(null)

  const decode = async () => {
    const v = vin.trim().toUpperCase()
    if (v.length !== 17) { setError('VIN must be exactly 17 characters'); return }
    setError('')
    setLoading(true)
    setResult(null)
    setDbMatches([])
    setSelectedRow(null)

    const res = await decodeVIN(v)
    if (!res) { setError('Failed to decode VIN — check your connection'); setLoading(false); return }
    if (res.errorCode !== '0' && res.errorCode !== '') {
      // Some VINs return error code 0 with valid data, only block on actual decode failures
      if (!res.make && !res.model) {
        setError(`Could not decode VIN: ${res.errorText}`)
        setLoading(false)
        return
      }
    }
    setResult(res)

    // Match against Supabase vehicle database
    if (res.make) {
      let query = supabase.from('vehicle_database').select('*')
        .ilike('make', res.make) // exact case-insensitive make match

      // If we got a model from our WMI lookup, filter by it too
      // Strip parentheses content for DB matching e.g. "Golf (Mk5/6)" → "Golf"
      if (res.model) {
        const cleanModel = res.model.replace(/\s*\(.*\)/, '').trim()
        query = query.ilike('model', `%${cleanModel}%`)
      }

      // Also filter by year if we have it — within a reasonable window
      if (res.year) {
        const yr = parseInt(res.year)
        if (!isNaN(yr)) {
          query = query.lte('year_from', yr + 1).gte('year_to', yr - 1)
        }
      }

      const { data } = await query.order('year_from').limit(30)

      if (data && data.length > 0) {
        const withVin = data.map((row: any) => ({ ...row, vin: v, year: res.year }))
        setDbMatches(withVin)
      } else if (res.model) {
        // Fallback: search by make only if model+year gave nothing
        const { data: fallback } = await supabase
          .from('vehicle_database')
          .select('*')
          .ilike('make', res.make)
          .order('year_from')
          .limit(30)
        if (fallback && fallback.length > 0) {
          const withVin = fallback.map((row: any) => ({ ...row, vin: v, year: res.year }))
          setDbMatches(withVin)
        }
      }
    }

    setLoading(false)
  }

  const handleUseVehicle = (row: ActiveVehicle) => {
    setSelectedRow(row)
    onVehicleSelect(row)
  }

  const fields = result ? [
    { label: 'Make',              value: result.make || '—' },
    { label: 'Model',             value: result.model || '—' },
    { label: 'Year',              value: result.year || '—' },
    { label: 'Engine',            value: result.engineDisplacement ? `${result.engineDisplacement}L` : '—' },
    { label: 'Fuel Type',         value: result.fuelType || '—' },
    { label: 'Body Class',        value: result.bodyClass || '—' },
    { label: 'Drive Type',        value: result.driveType || '—' },
    { label: 'Transmission',      value: result.transmissionStyle || '—' },
    { label: 'Cylinders',         value: result.engineCylinders || '—' },
    { label: 'Plant Country',     value: result.plantCountry || '—' },
    { label: 'WMI Code',          value: result.wmi || '—' },
    { label: 'Origin',            value: result.isEuropean ? '🇪🇺 European VIN' : '🌍 Other' },
  ] : []

  return (
    <div>
      <div className="page-header">
        <div className="page-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
        <h1>VIN Decoder</h1>
      </div>

      {/* Active vehicle indicator */}
      {activeVehicle && (
        <div className="banner banner-info" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            ✓ Active vehicle: <strong>{activeVehicle.make} {activeVehicle.model} {activeVehicle.variant}</strong>
            &nbsp;— <span style={{ fontFamily: 'monospace' }}>{activeVehicle.ecu}</span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setPage('scanner')}>
              → Scan ECU
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setPage('cloning')}>
              → Clone ECU
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setPage('unlock')}>
              → Unlock ECU
            </button>
          </div>
        </div>
      )}

      {/* VIN input */}
      <div className="card" style={{ marginBottom: 20 }}>
        <label>Enter VIN (17 characters)</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <input
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            placeholder="e.g. WVWZZZ1JZXW000001"
            maxLength={17}
            style={{ fontFamily: 'monospace', fontSize: 15, letterSpacing: 2, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && decode()}
          />
          <button className="btn btn-primary" onClick={decode} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? '⏳ Decoding...' : '🔍 Decode VIN'}
          </button>
        </div>
        {vin.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: vin.length === 17 ? 'var(--success)' : 'var(--warning)' }}>
            {vin.length}/17 characters
          </div>
        )}
        {error && <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>⚠ {error}</div>}
      </div>

      {result && (
        <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>
          {/* NHTSA result */}
          <div className="card card-accent">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <strong style={{ fontSize: 15 }}>
                {result.year} {result.make} {result.model}
              </strong>
              <span className="badge badge-success">Decoded ✓</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              {fields.map((f) => (
                <div key={f.label}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
              VIN: {vin}
            </div>
          </div>

          {/* DB matches */}
          <div>
            {dbMatches.length > 0 ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                  ✓ {dbMatches.length} match{dbMatches.length !== 1 ? 'es' : ''} in DCTuning Vehicle Database
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                  {dbMatches.map((row, i) => (
                    <div
                      key={i}
                      className="card"
                      style={{
                        borderColor: selectedRow?.variant === row.variant ? 'var(--accent)' : 'var(--border)',
                        background: selectedRow?.variant === row.variant ? 'var(--accent-dim)' : 'var(--bg-card)',
                        cursor: 'pointer',
                        padding: '12px 14px',
                      }}
                      onClick={() => handleUseVehicle(row)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{row.variant}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {row.engine_code} · {row.ecu}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                            {row.year_from}–{row.year_to} · {row.fuel_type}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{row.ps} PS</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.kw} kW</div>
                          {selectedRow?.variant === row.variant && (
                            <span className="badge badge-accent" style={{ marginTop: 4, display: 'block' }}>Active ✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                  Click a row to set as active vehicle — ECU info auto-fills across all tools
                </div>
              </>
            ) : (
              <div className="card" style={{ padding: 30, textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔎</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No matches found in DCTuning database for {result.make} {result.model}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  Add this vehicle to the database via Supabase
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
