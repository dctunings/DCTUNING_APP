// Fleet Management System for DCTuning
// Supabase-backed with localStorage offline cache

import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────
export interface ServiceRecord {
  id: string
  date: string
  description: string
  odometer: number
  performedBy: string
}

export interface FleetVehicle {
  id: string
  name: string
  make: string
  model: string
  year: number
  vin: string
  licensePlate: string
  odometer: number
  lastServiceDate: string
  status: 'healthy' | 'warning' | 'error' | 'offline'
  currentTuneId: string | null
  ecuFamily: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  notes: string
  serviceHistory: ServiceRecord[]
  createdAt: string
  updatedAt: string
  userId?: string
}

export interface FleetSummary {
  totalVehicles: number
  healthyCount: number
  warningCount: number
  errorCount: number
  offlineCount: number
  totalMileage: number
  avgMileage: number
  serviceDueCount: number
}

export interface CreateVehicleInput {
  name: string
  make: string
  model: string
  year: number
  vin: string
  licensePlate?: string
  odometer?: number
  ecuFamily?: string
  ownerName?: string
  ownerPhone?: string
  ownerEmail?: string
  notes?: string
}

// ── Offline Cache Keys ────────────────────────────────────────────
const CACHE_VEHICLES = 'dctuning_fleet_vehicles'
const CACHE_SERVICES = 'dctuning_fleet_services'
const CACHE_TIMESTAMP = 'dctuning_fleet_cached_at'
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// ── Cache Helpers ─────────────────────────────────────────────────
function cacheLoadVehicles(): FleetVehicle[] {
  try {
    const raw = localStorage.getItem(CACHE_VEHICLES)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function cacheSaveVehicles(vehicles: FleetVehicle[]) {
  localStorage.setItem(CACHE_VEHICLES, JSON.stringify(vehicles))
  localStorage.setItem(CACHE_TIMESTAMP, Date.now().toString())
}

function cacheLoadServices(): Record<string, ServiceRecord[]> {
  try {
    const raw = localStorage.getItem(CACHE_SERVICES)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function cacheSaveServices(services: Record<string, ServiceRecord[]>) {
  localStorage.setItem(CACHE_SERVICES, JSON.stringify(services))
}

function isCacheFresh(): boolean {
  const ts = localStorage.getItem(CACHE_TIMESTAMP)
  if (!ts) return false
  return Date.now() - parseInt(ts) < CACHE_DURATION_MS
}

// ── Supabase Helpers ──────────────────────────────────────────────
async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

function handleError(label: string, err: any): never {
  console.error(`[Fleet] ${label}:`, err)
  throw new Error(`${label}: ${err?.message || String(err)}`)
}

// ── CRUD Operations ───────────────────────────────────────────────
export async function createVehicle(input: CreateVehicleInput): Promise<FleetVehicle> {
  const userId = await getCurrentUserId()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const vehicle: FleetVehicle = {
    id,
    name: input.name,
    make: input.make,
    model: input.model,
    year: input.year,
    vin: input.vin,
    licensePlate: input.licensePlate || '',
    odometer: input.odometer || 0,
    lastServiceDate: now,
    status: 'offline',
    currentTuneId: null,
    ecuFamily: input.ecuFamily || '',
    ownerName: input.ownerName || '',
    ownerPhone: input.ownerPhone || '',
    ownerEmail: input.ownerEmail || '',
    notes: input.notes || '',
    serviceHistory: [],
    createdAt: now,
    updatedAt: now,
    userId: userId || undefined,
  }

  // Try Supabase first
  try {
    const { error } = await supabase.from('fleet_vehicles').insert({
      id: vehicle.id,
      user_id: userId,
      name: vehicle.name,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      license_plate: vehicle.licensePlate,
      odometer: vehicle.odometer,
      last_service_date: vehicle.lastServiceDate,
      status: vehicle.status,
      current_tune_id: vehicle.currentTuneId,
      ecu_family: vehicle.ecuFamily,
      owner_name: vehicle.ownerName,
      owner_phone: vehicle.ownerPhone,
      owner_email: vehicle.ownerEmail,
      notes: vehicle.notes,
      created_at: vehicle.createdAt,
      updated_at: vehicle.updatedAt,
    })
    if (error) throw error
  } catch (e) {
    // Offline fallback: cache locally, will sync later
    console.warn('[Fleet] Supabase unavailable, caching locally:', e)
  }

  // Always update local cache
  const cached = cacheLoadVehicles()
  cached.push(vehicle)
  cacheSaveVehicles(cached)

  return vehicle
}

export async function getVehicleById(id: string): Promise<FleetVehicle | null> {
  // Try Supabase first
  try {
    const { data, error } = await supabase.from('fleet_vehicles').select('*').eq('id', id).single()
    if (!error && data) return dbRowToVehicle(data)
  } catch { /* offline */ }

  // Fallback to cache
  return cacheLoadVehicles().find(v => v.id === id) || null
}

export async function getAllVehicles(): Promise<FleetVehicle[]> {
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('fleet_vehicles')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) throw error

    if (data) {
      const vehicles = data.map(dbRowToVehicle)
      // Also fetch service history
      const { data: servicesData } = await supabase.from('fleet_service_history').select('*')
      const services: Record<string, ServiceRecord[]> = {}
      if (servicesData) {
        for (const s of servicesData) {
          if (!services[s.vehicle_id]) services[s.vehicle_id] = []
          services[s.vehicle_id].push(dbRowToService(s))
        }
      }
      const withHistory = vehicles.map(v => ({
        ...v,
        serviceHistory: services[v.id] || []
      }))
      cacheSaveVehicles(withHistory)
      cacheSaveServices(services)
      return withHistory
    }
  } catch (e) {
    console.warn('[Fleet] Supabase unavailable, using cache:', e)
  }

  // Fallback to cache
  return cacheLoadVehicles()
}

export async function searchVehicles(query: string): Promise<FleetVehicle[]> {
  const all = await getAllVehicles()
  const q = query.toLowerCase()
  return all.filter(v =>
    v.name.toLowerCase().includes(q) ||
    v.make.toLowerCase().includes(q) ||
    v.model.toLowerCase().includes(q) ||
    v.vin.toLowerCase().includes(q) ||
    v.licensePlate.toLowerCase().includes(q) ||
    v.ownerName.toLowerCase().includes(q)
  )
}

export async function updateVehicle(
  id: string,
  updates: Partial<CreateVehicleInput> & { status?: FleetVehicle['status']; odometer?: number; lastServiceDate?: string; currentTuneId?: string | null }
): Promise<FleetVehicle | null> {
  const now = new Date().toISOString()

  // Update Supabase
  try {
    const dbUpdates: any = { updated_at: now }
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.make !== undefined) dbUpdates.make = updates.make
    if (updates.model !== undefined) dbUpdates.model = updates.model
    if (updates.year !== undefined) dbUpdates.year = updates.year
    if (updates.vin !== undefined) dbUpdates.vin = updates.vin
    if (updates.licensePlate !== undefined) dbUpdates.license_plate = updates.licensePlate
    if (updates.odometer !== undefined) dbUpdates.odometer = updates.odometer
    if (updates.lastServiceDate !== undefined) dbUpdates.last_service_date = updates.lastServiceDate
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.currentTuneId !== undefined) dbUpdates.current_tune_id = updates.currentTuneId
    if (updates.ecuFamily !== undefined) dbUpdates.ecu_family = updates.ecuFamily
    if (updates.ownerName !== undefined) dbUpdates.owner_name = updates.ownerName
    if (updates.ownerPhone !== undefined) dbUpdates.owner_phone = updates.ownerPhone
    if (updates.ownerEmail !== undefined) dbUpdates.owner_email = updates.ownerEmail
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes

    const { error } = await supabase.from('fleet_vehicles').update(dbUpdates).eq('id', id)
    if (error) throw error
  } catch (e) {
    console.warn('[Fleet] Supabase update failed, cache only:', e)
  }

  // Update cache
  const cached = cacheLoadVehicles()
  const idx = cached.findIndex(v => v.id === id)
  if (idx === -1) return null

  cached[idx] = { ...cached[idx], ...updates, updatedAt: now }
  cacheSaveVehicles(cached)
  return cached[idx]
}

export async function deleteVehicle(id: string): Promise<boolean> {
  // Delete from Supabase
  try {
    await supabase.from('fleet_service_history').delete().eq('vehicle_id', id)
    const { error } = await supabase.from('fleet_vehicles').delete().eq('id', id)
    if (error) throw error
  } catch (e) {
    console.warn('[Fleet] Supabase delete failed:', e)
  }

  // Delete from cache
  const cached = cacheLoadVehicles()
  const filtered = cached.filter(v => v.id !== id)
  if (filtered.length === cached.length) return false
  cacheSaveVehicles(filtered)

  const services = cacheLoadServices()
  delete services[id]
  cacheSaveServices(services)
  return true
}

export async function addServiceRecord(vehicleId: string, record: Omit<ServiceRecord, 'id'>): Promise<ServiceRecord> {
  const id = crypto.randomUUID()
  const newRecord: ServiceRecord = { id, ...record }

  // Insert to Supabase
  try {
    const { error } = await supabase.from('fleet_service_history').insert({
      id: newRecord.id,
      vehicle_id: vehicleId,
      date: newRecord.date,
      description: newRecord.description,
      odometer: newRecord.odometer,
      performed_by: newRecord.performedBy,
    })
    if (error) throw error

    await supabase.from('fleet_vehicles')
      .update({ last_service_date: record.date, updated_at: new Date().toISOString() })
      .eq('id', vehicleId)
  } catch (e) {
    console.warn('[Fleet] Supabase service record failed, cache only:', e)
  }

  // Update cache
  const services = cacheLoadServices()
  if (!services[vehicleId]) services[vehicleId] = []
  services[vehicleId].push(newRecord)
  cacheSaveServices(services)

  // Update vehicle last service date in cache
  const cached = cacheLoadVehicles()
  const idx = cached.findIndex(v => v.id === vehicleId)
  if (idx !== -1) {
    cached[idx].lastServiceDate = record.date
    cached[idx].updatedAt = new Date().toISOString()
    cacheSaveVehicles(cached)
  }

  return newRecord
}

export async function getServiceHistory(vehicleId: string): Promise<ServiceRecord[]> {
  // Try Supabase
  try {
    const { data, error } = await supabase
      .from('fleet_service_history')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('date', { ascending: false })

    if (!error && data) {
      const records = data.map(dbRowToService)
      const services = cacheLoadServices()
      services[vehicleId] = records
      cacheSaveServices(services)
      return records
    }
  } catch { /* offline */ }

  return cacheLoadServices()[vehicleId] || []
}

export async function getFleetSummary(): Promise<FleetSummary> {
  const vehicles = await getAllVehicles()

  const summary: FleetSummary = {
    totalVehicles: vehicles.length,
    healthyCount: 0,
    warningCount: 0,
    errorCount: 0,
    offlineCount: 0,
    totalMileage: 0,
    avgMileage: 0,
    serviceDueCount: 0,
  }

  let totalMileage = 0
  for (const v of vehicles) {
    if (v.status === 'healthy') summary.healthyCount++
    else if (v.status === 'warning') summary.warningCount++
    else if (v.status === 'error') summary.errorCount++
    else if (v.status === 'offline') summary.offlineCount++
    totalMileage += v.odometer || 0

    const lastService = v.lastServiceDate ? new Date(v.lastServiceDate) : new Date('2020-01-01')
    const daysSinceService = (Date.now() - lastService.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceService > 180) summary.serviceDueCount++
  }

  summary.totalMileage = totalMileage
  summary.avgMileage = vehicles.length > 0 ? Math.round(totalMileage / vehicles.length) : 0

  return summary
}

export function exportFleetToCSV(vehicles: FleetVehicle[]): string {
  const headers = ['ID', 'Name', 'Make', 'Model', 'Year', 'VIN', 'License Plate', 'Odometer', 'Status', 'ECU Family', 'Owner Name', 'Owner Phone', 'Owner Email', 'Last Service', 'Notes']
  const rows = vehicles.map(v => [
    v.id, v.name, v.make, v.model, v.year, v.vin, v.licensePlate, v.odometer, v.status,
    v.ecuFamily, v.ownerName, v.ownerPhone, v.ownerEmail, v.lastServiceDate, v.notes
  ])
  return [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────
function dbRowToVehicle(row: any): FleetVehicle {
  return {
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: row.year,
    vin: row.vin,
    licensePlate: row.license_plate || '',
    odometer: row.odometer || 0,
    lastServiceDate: row.last_service_date || '',
    status: row.status || 'offline',
    currentTuneId: row.current_tune_id || null,
    ecuFamily: row.ecu_family || '',
    ownerName: row.owner_name || '',
    ownerPhone: row.owner_phone || '',
    ownerEmail: row.owner_email || '',
    notes: row.notes || '',
    serviceHistory: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function dbRowToService(row: any): ServiceRecord {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    odometer: row.odometer || 0,
    performedBy: row.performed_by || '',
  }
}
