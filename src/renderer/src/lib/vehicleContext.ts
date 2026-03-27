// Shared type for an active vehicle loaded from DB
export interface ActiveVehicle {
  make: string
  model: string
  variant: string
  engine_code: string
  kw: number
  ps: number
  hp: number
  fuel_type: string
  year_from: number
  year_to: number
  ecu: string
  ecu_family: string
  // From VIN decode
  vin?: string
  year?: string
}
