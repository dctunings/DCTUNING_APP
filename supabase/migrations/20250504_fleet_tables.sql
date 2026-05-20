-- Fleet Management Tables for DCTuning
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fleet Vehicles Table
CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  vin TEXT NOT NULL,
  license_plate TEXT,
  odometer INTEGER DEFAULT 0,
  last_service_date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'offline' CHECK (status IN ('healthy', 'warning', 'error', 'offline')),
  current_tune_id UUID,
  ecu_family TEXT,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fleet Service History Table
CREATE TABLE IF NOT EXISTS public.fleet_service_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  odometer INTEGER DEFAULT 0,
  performed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_user_id ON public.fleet_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_status ON public.fleet_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_updated ON public.fleet_vehicles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_service_vehicle ON public.fleet_service_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_service_date ON public.fleet_service_history(date DESC);

-- Row Level Security (RLS) - Users can only see their own vehicles
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_service_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own fleet vehicles
CREATE POLICY "Users can CRUD their own vehicles"
  ON public.fleet_vehicles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only access service history for their own vehicles
CREATE POLICY "Users can CRUD service history for their vehicles"
  ON public.fleet_service_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.fleet_vehicles
      WHERE fleet_vehicles.id = fleet_service_history.vehicle_id
      AND fleet_vehicles.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fleet_vehicles
      WHERE fleet_vehicles.id = fleet_service_history.vehicle_id
      AND fleet_vehicles.user_id = auth.uid()
    )
  );

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_fleet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_fleet_vehicles_updated_at ON public.fleet_vehicles;
CREATE TRIGGER update_fleet_vehicles_updated_at
  BEFORE UPDATE ON public.fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_fleet_updated_at();
