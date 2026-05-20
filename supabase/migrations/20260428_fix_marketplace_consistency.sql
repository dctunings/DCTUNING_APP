-- ─────────────────────────────────────────────────────────────────────────
-- Marketplace consistency + security fixes — v3.16.0
--
-- Damo audit Apr 28 2026: schema didn't match what the code expected, RLS
-- was too permissive (anyone could mint a "completed" purchase or activate
-- their own seller subscription without paying), and USD/EUR were mixed.
-- This is the consolidation pass.
--
-- Idempotent — safe to run on a partially-applied database. Uses
-- IF EXISTS / IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout.
-- ─────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── profiles + is_admin ─────────────────────────────────────────────────
-- The marketplace needs an admin gate for moderation. We also use this for
-- the "is the current user staff" checks the client code does.
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  is_admin   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Bootstrap Damo as admin (idempotent — only updates if user already exists)
DO $$
DECLARE damo_id UUID;
BEGIN
  SELECT id INTO damo_id FROM auth.users WHERE email = 'dctunings@gmail.com' LIMIT 1;
  IF damo_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, is_admin) VALUES (damo_id, true)
    ON CONFLICT (id) DO UPDATE SET is_admin = true;
  END IF;
END $$;

-- ── seller_profiles: add missing storefront fields ──────────────────────
-- sellerStore.ts assumed business_name / slug / logo_url / phone /
-- specialties — none of which existed. Add them so the storefront page
-- can actually populate.
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS slug          TEXT,
  ADD COLUMN IF NOT EXISTS logo_url      TEXT,
  ADD COLUMN IF NOT EXISTS phone         TEXT,
  ADD COLUMN IF NOT EXISTS specialties   TEXT[];

-- Slug must be unique so /seller/<slug> resolves to one seller.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seller_profiles_slug_unique'
  ) THEN
    ALTER TABLE public.seller_profiles
      ADD CONSTRAINT seller_profiles_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- Backfill slug from display_name where missing
UPDATE public.seller_profiles
SET slug = LOWER(REGEXP_REPLACE(COALESCE(display_name, business_name, 'seller-' || SUBSTRING(id::text, 1, 8)), '[^a-z0-9]+', '-', 'gi'))
WHERE slug IS NULL OR slug = '';

-- ── tune_listings: drop USD column (everything is EUR) ──────────────────
-- price_eur is the canonical price field. price_usd was a deprecated
-- holdover.
ALTER TABLE public.tune_listings DROP COLUMN IF EXISTS price_usd;
ALTER TABLE public.tune_listings DROP COLUMN IF EXISTS currency;

-- Ensure price_eur exists and is NOT NULL (it was added by a later
-- migration in some envs but typed as nullable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tune_listings' AND column_name = 'price_eur'
  ) THEN
    ALTER TABLE public.tune_listings ADD COLUMN price_eur DECIMAL(10,2) NOT NULL DEFAULT 0;
  ELSE
    ALTER TABLE public.tune_listings ALTER COLUMN price_eur SET DEFAULT 0;
    UPDATE public.tune_listings SET price_eur = 0 WHERE price_eur IS NULL;
    ALTER TABLE public.tune_listings ALTER COLUMN price_eur SET NOT NULL;
  END IF;
END $$;

-- tune_file_path replaces tune_file_url — we don't store a public URL,
-- just the bucket path, and an edge function mints signed URLs at
-- download time so the file isn't grabable from a leaked URL.
ALTER TABLE public.tune_listings
  ADD COLUMN IF NOT EXISTS tune_file_path TEXT;
-- Backfill tune_file_path from tune_file_url where present.
UPDATE public.tune_listings
SET tune_file_path = REGEXP_REPLACE(tune_file_url, '^.*/tune-files/', '')
WHERE tune_file_path IS NULL AND tune_file_url IS NOT NULL;

-- ── Missing tables the client code referenced ───────────────────────────
-- buyer_tool_subscriptions — €34.99/mo for Remap Builder + Performance
-- Monitor access. Referenced from buyerSubscription.ts.
CREATE TABLE IF NOT EXISTS public.buyer_tool_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status                   TEXT DEFAULT 'inactive'
                             CHECK (status IN ('active','canceled','past_due','inactive','trialing')),
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  monthly_download_limit   INTEGER DEFAULT 5,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buyer_tool_sub_user ON public.buyer_tool_subscriptions(user_id);
ALTER TABLE public.buyer_tool_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self view buyer tool sub" ON public.buyer_tool_subscriptions;
CREATE POLICY "Self view buyer tool sub" ON public.buyer_tool_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT / UPDATE happens ONLY through the Stripe webhook (service role
-- bypasses RLS) — clients cannot self-activate.

-- remap_downloads — usage log for buyer download quota.
CREATE TABLE IF NOT EXISTS public.remap_downloads (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name     TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_remap_downloads_user_date
  ON public.remap_downloads(user_id, downloaded_at DESC);

ALTER TABLE public.remap_downloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Self view downloads" ON public.remap_downloads;
CREATE POLICY "Self view downloads" ON public.remap_downloads
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Self insert downloads" ON public.remap_downloads;
CREATE POLICY "Self insert downloads" ON public.remap_downloads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- tune_files — buyer's library of purchased tunes (referenced from the
-- Stripe webhook, where it gets a row inserted on payment success).
CREATE TABLE IF NOT EXISTS public.tune_files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_name  TEXT,
  file_type     TEXT,
  file_name     TEXT,
  storage_path  TEXT,
  seller_name   TEXT,
  seller_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  listing_id    UUID REFERENCES public.tune_listings(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tune_files_user ON public.tune_files(user_id);

ALTER TABLE public.tune_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Self view tune files" ON public.tune_files;
CREATE POLICY "Self view tune files" ON public.tune_files
  FOR SELECT USING (auth.uid() = user_id);
-- Webhook (service role) inserts rows.

-- ── tune_purchases: lock down the "anyone can mint a completed purchase" ──
-- The previous policy was `WITH CHECK (true)`. Drop it. Only the edge
-- function (running as service role) can insert purchase records.
DROP POLICY IF EXISTS "System can create purchases" ON public.tune_purchases;

-- Buyers and sellers still see their own rows.
DROP POLICY IF EXISTS "Buyers can view their purchases" ON public.tune_purchases;
CREATE POLICY "Buyers can view their purchases" ON public.tune_purchases
  FOR SELECT USING (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Sellers can view their sales" ON public.tune_purchases;
CREATE POLICY "Sellers can view their sales" ON public.tune_purchases
  FOR SELECT USING (auth.uid() = seller_id);

-- ── seller_subscriptions: lock down "anyone can self-activate" ──
-- The previous policy was FOR ALL which let users INSERT/UPDATE themselves
-- into an active subscription. Restrict to SELECT only — the Stripe
-- webhook (service role) writes.
DROP POLICY IF EXISTS "Users can view their own seller subscription"
  ON public.seller_subscriptions;
CREATE POLICY "Self view seller subscription" ON public.seller_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ── tune_listings: admin moderation policy ──
-- The previous moderateListing function had no way to actually update
-- pending listings (RLS only let sellers edit their own). Add an admin
-- override policy keyed on profiles.is_admin.
DROP POLICY IF EXISTS "Admins can moderate listings" ON public.tune_listings;
CREATE POLICY "Admins can moderate listings" ON public.tune_listings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admins can also SELECT pending/rejected listings (sellers see their own
-- pending, but a moderator needs to see ALL pending across the platform).
DROP POLICY IF EXISTS "Admins can view all listings" ON public.tune_listings;
CREATE POLICY "Admins can view all listings" ON public.tune_listings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ── tune-files Storage bucket: make PRIVATE ─────────────────────────────
-- The bucket was public so any URL leak gave away the tune file forever.
-- Set to private; downloads now go through a signed-URL edge function
-- that checks for a completed purchase first.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tune-files', 'tune-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage RLS: nobody reads the bucket directly. Edge function uses
-- service role to mint signed URLs.
DROP POLICY IF EXISTS "Public read tune files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload tune files" ON storage.objects;

-- Sellers can upload their own files (path must be tunes/<user_id>/...)
DROP POLICY IF EXISTS "Sellers upload their own tune files" ON storage.objects;
CREATE POLICY "Sellers upload their own tune files" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'tune-files'
    AND (storage.foldername(name))[1] = 'tunes'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Sellers can DELETE their own files (cleanup, replace)
DROP POLICY IF EXISTS "Sellers delete their own tune files" ON storage.objects;
CREATE POLICY "Sellers delete their own tune files" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'tune-files'
    AND (storage.foldername(name))[1] = 'tunes'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── Increment purchase_count RPC (referenced from marketplace.ts) ───────
-- Currently the client tries to call this RPC but it might not exist on
-- all envs. Create it. Safe to run repeatedly.
CREATE OR REPLACE FUNCTION public.increment_purchase_count(listing_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.tune_listings
  SET purchase_count = purchase_count + 1
  WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Done ────────────────────────────────────────────────────────────────
-- After applying:
--   1. Re-deploy edge functions (Stripe webhook needs column name fixes)
--   2. Build + push the renderer (sellerStore consolidation, EUR-only)
