import { useEffect, useState } from 'react'
import type { Vehicle } from '../lib/useVehicle'
import { Card, PageHeader, Grid, StatCard, SectionTitle } from '../components/ui'

interface Props {
  setPage: (page: string) => void
  connected: boolean
  activeVehicle: Vehicle | null
}

export default function Dashboard({ setPage, connected, activeVehicle }: Props) {
  const [stats, setStats] = useState({ tunes: 0, recipes: 0, scans: 0, vehicles: 0 })

  useEffect(() => {
    // Load stats from localStorage
    const recipes = JSON.parse(localStorage.getItem('dctuning_recipes') || '[]')
    const scans = parseInt(localStorage.getItem('scan_count') || '0')
    const vehicles = JSON.parse(localStorage.getItem('fleet_vehicles') || '[]')
    setStats({
      tunes: recipes.length,
      recipes: recipes.length,
      scans,
      vehicles: vehicles.length,
    })
  }, [])

  const quickActions = [
    { label: 'ECU Scanner', icon: '🔍', page: 'scanner', color: '#00aec8' },
    { label: 'VIN Decoder', icon: '🔢', page: 'vin', color: '#10b981' },
    { label: 'Tune Manager', icon: '📁', page: 'tunes', color: '#f59e0b' },
    { label: 'Remap Builder', icon: '🔧', page: 'remap', color: '#8b5cf6' },
    { label: 'Fleet', icon: '🚗', page: 'fleet', color: '#ec4899' },
    { label: 'Marketplace', icon: '🏪', page: 'marketplace', color: '#f97316' },
  ]

  return (
    <div style={{ padding: '0 4px' }}>
      <PageHeader
        title="Dashboard"
        subtitle={activeVehicle ? `${activeVehicle.year} ${activeVehicle.make} ${activeVehicle.model}` : 'Welcome to DCTuning'}
      />

      {/* Stats Row */}
      <Grid cols={4} gap={12} style={{ marginBottom: 24 }}>
        <StatCard label="Saved Tunes" value={stats.tunes} icon="📁" color="#00aec8" />
        <StatCard label="Recipes" value={stats.recipes} icon="📋" color="#10b981" />
        <StatCard label="Scans" value={stats.scans} icon="🔍" color="#f59e0b" />
        <StatCard label="Fleet Vehicles" value={stats.vehicles} icon="🚗" color="#ec4899" />
      </Grid>

      {/* Quick Actions */}
      <SectionTitle>Quick Actions</SectionTitle>
      <Grid cols={3} gap={12} style={{ marginBottom: 24 }}>
        {quickActions.map((action) => (
          <Card
            key={action.page}
            onClick={() => setPage(action.page)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 18,
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `${action.color}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}>
              {action.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#eee' }}>{action.label}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Click to open</div>
            </div>
          </Card>
        ))}
      </Grid>

      {/* Active Vehicle */}
      {activeVehicle && (
        <>
          <SectionTitle>Active Vehicle</SectionTitle>
          <Card style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #00cce0 0%, #00aec8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
              }}>
                🚗
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#eee' }}>
                  {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  {activeVehicle.vin || 'No VIN'} · {activeVehicle.engine || 'Unknown engine'}
                </div>
              </div>
              <div style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: connected ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: connected ? '#10b981' : '#ef4444',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}>
                {connected ? 'Connected' : 'Offline'}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Recent Activity */}
      <SectionTitle>Recent Activity</SectionTitle>
      <Card>
        <div style={{ textAlign: 'center', padding: '30px 20px', color: '#555' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 14, color: '#666' }}>Activity feed coming soon</div>
          <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>
            Scan, tune, and manage vehicles to see activity here
          </div>
        </div>
      </Card>
    </div>
  )
}
