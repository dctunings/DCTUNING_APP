-- ─────────────────────────────────────────────────────────────────────────
-- Tighten remaining RLS + lock down SECURITY DEFINER functions
-- Applied to live DB on Apr 28 2026 — addresses pre-existing advisors
-- found during the marketplace audit that weren't part of the marketplace
-- fix itself.
-- ─────────────────────────────────────────────────────────────────────────

-- vehicle_database (7,234 rows) had RLS disabled — fully open. Enable with
-- a SELECT-only public policy. Service role bypasses RLS for seeding/updates.
ALTER TABLE public.vehicle_database ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read vehicles" ON public.vehicle_database;
CREATE POLICY "Public read vehicles" ON public.vehicle_database
  FOR SELECT USING (true);

-- definitions_index INSERT: was open to anon, now requires login.
DROP POLICY IF EXISTS "anon can insert definitions_index" ON public.definitions_index;
DROP POLICY IF EXISTS "Authenticated insert definitions_index" ON public.definitions_index;
CREATE POLICY "Authenticated insert definitions_index" ON public.definitions_index
  FOR INSERT TO authenticated WITH CHECK (true);

-- remap_orders: guest-checkout pattern (no user_id, uses customer_email).
-- SELECT/UPDATE locked to service role. INSERT stays open (Stripe checkout
-- is the friction layer).
DROP POLICY IF EXISTS "remap_orders_update" ON public.remap_orders;
DROP POLICY IF EXISTS "remap_orders_select" ON public.remap_orders;

-- recipes bucket: drop the broad public LIST policy (objects still
-- accessible via URL, just not enumerable).
DROP POLICY IF EXISTS "recipes_public_read" ON storage.objects;

-- discover_training_pairs: revoke anon, fix search_path.
REVOKE ALL ON FUNCTION public.discover_training_pairs(integer) FROM PUBLIC, anon;
ALTER FUNCTION public.discover_training_pairs(integer) SET search_path = public, pg_temp;

-- Fix remaining mutable search_path functions for security.
ALTER FUNCTION public.get_vehicle_makes() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_vehicle_models(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.match_map_dna(vector, text, double precision, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.relabel_by_dna(double precision, integer) SET search_path = public, pg_temp;

-- increment_purchase_count is invoked from edge functions (service role)
-- only — lock client-side RPC access.
REVOKE EXECUTE ON FUNCTION public.increment_purchase_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_purchase_count(uuid) TO service_role;
