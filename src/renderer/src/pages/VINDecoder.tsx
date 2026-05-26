import { useState } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle, Button, Input } from '../components/ui'

interface Props {
  setPage: (page: string) => void
}

interface DecodedVehicle {
  id: string
  vin: string
  make: string
  model: string
  year: number
  engine: string
  transmission: string
  trim: string
  created_at: string
}

export default function VINDecoder({ setPage }: Props) {
  const [vin, setVin] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DecodedVehicle | null>(null)
  const [error, setError] = useState('')

  const decodeVin = async () => {
    if (!vin || vin.length !== 17) {
      setError('Please enter a valid 17-character VIN')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`)
      const data = await res.json()
      const info = data.Results?.[0]
      if (!info || !info.Make) {
        setError('Could not decode VIN')
        return
      }
      const vehicle: DecodedVehicle = {
        id: crypto.randomUUID(),
        vin: vin.toUpperCase(),
        make: info.Make,
        model: info.Model || '',
        year: parseInt(info.ModelYear) || new Date().getFullYear(),
        engine: info.DisplacementL ? `${info.DisplacementL}L ${info.EngineConfiguration || ''} ${info.FuelTypePrimary || ''}` : '',
        transmission: info.TransmissionStyle || '',
        trim: info.Trim || '',
        created_at: new Date().toISOString(),
      }
      setResult(vehicle)
      // Save to fleet
      const fleet = JSON.parse(localStorage.getItem('fleet_vehicles') || '[]')
      localStorage.setItem('fleet_vehicles', JSON.stringify([vehicle, ...fleet]))
    } catch (e) {
      setError('Failed to decode VIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader
        title="VIN Decoder"
        subtitle="Decode any 17-character VIN to reveal vehicle details"
        icon="🔢"
      />

      <Grid cols={3} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="VIN Length" value="17" unit="chars" icon="📏" color="#00aec8" />
        <StatCard label="Data Source" value="NHTSA" unit="USA" icon="🇺🇸" color="#10b981" />
        <StatCard label="Fleet Saved" value={JSON.parse(localStorage.getItem('fleet_vehicles') || '[]').length} unit="vehicles" icon="🚗" color="#f59e0b" />
      </Grid>

      <SectionTitle>Decode VIN</SectionTitle>
      <Card style={{ marginBottom: 24 }}>
        <Grid cols={1} gap={12}>
          <Input
            label="Vehicle Identification Number"
            placeholder="e.g. WAUZZZ8K9DA123456"
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            maxLength={17}
            error={error}
          />
          <div>
            <Button onClick={decodeVin} disabled={loading}>
              {loading ? 'Decoding...' : '🔍 Decode VIN'}
            </Button>
          </div>
        </Grid>
      </Card>

      {result && (
        <>
          <SectionTitle>Vehicle Details</SectionTitle>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
              }}>
                🚗
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#eee' }}>
                  {result.year} {result.make} {result.model}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  {result.trim && `${result.trim} · `}{result.vin}
                </div>
              </div>
              <Button variant="secondary" onClick={() => { setResult(null); setVin(''); setError(''); }} style={{ marginLeft: 'auto' }}>
                Clear
              </Button>
            </div>

            <Grid cols={2} gap={12}>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Engine</div>
                <div style={{ fontSize: 14, color: '#eee', fontWeight: 500 }}>{result.engine || 'Unknown'}</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Transmission</div>
                <div style={{ fontSize: 14, color: '#eee', fontWeight: 500 }}>{result.transmission || 'Unknown'}</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Year</div>
                <div style={{ fontSize: 14, color: '#eee', fontWeight: 500 }}>{result.year}</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>VIN</div>
                <div style={{ fontSize: 14, color: '#eee', fontWeight: 500, fontFamily: 'monospace' }}>{result.vin}</div>
              </Card>
            </Grid>

            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <div style={{ fontSize: 12, color: '#10b981' }}>✓ Vehicle saved to your fleet</div>
            </div>
          </Card>
        </>
      )}

    </div>
  )
}
