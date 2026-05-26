import { useEffect, useState } from 'react'
import { Card, PageHeader, Grid, StatCard, SectionTitle } from '../components/ui'

interface Props {
  setPage: (page: string) => void
  connected: boolean
}

export default function Dashboard({ setPage, connected }: Props) {
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
        subtitle="Welcome to DCTuning"
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
