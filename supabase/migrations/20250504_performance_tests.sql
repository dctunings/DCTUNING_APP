-- Performance Test Results Table for DCTuning
-- Stores all dyno, 0-60, quarter-mile, and boost test results

CREATE TABLE IF NOT EXISTS public.performance_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  vehicle_name TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  test_type TEXT NOT NULL CHECK (test_type IN ('0-60', 'quarter-mile', 'dyno-pull', 'boost-analysis', 'roll-race')),
  test_data JSONB NOT NULL,
  result_summary JSONB,
  weather_conditions JSONB,
  tune_stage TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_perf_tests_user ON public.performance_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_perf_tests_vehicle ON public.performance_tests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_perf_tests_type ON public.performance_tests(test_type);
CREATE INDEX IF NOT EXISTS idx_perf_tests_created ON public.performance_tests(created_at DESC);

-- Row Level Security
ALTER TABLE public.performance_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own performance tests"
  ON public.performance_tests
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
