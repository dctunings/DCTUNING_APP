-- Tune Marketplace Schema for DCTuning
-- Enables buying, selling, and reviewing ECU tunes

-- ── Tune Listings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tune_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Tune Metadata
  title TEXT NOT NULL,
  description TEXT,
  ecu_family TEXT NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year_start INTEGER,
  vehicle_year_end INTEGER,
  engine_code TEXT,
  
  -- Tune Specs
  fuel_type TEXT CHECK (fuel_type IN ('petrol', 'diesel', 'e85', 'methanol')),
  power_gain_hp INTEGER DEFAULT 0,
  torque_gain_nm INTEGER DEFAULT 0,
  stage TEXT CHECK (stage IN ('stock', 'stage1', 'stage2', 'stage3', 'custom')),
  
  -- File/Content
  tune_file_url TEXT,
  tune_file_size INTEGER,
  checksum TEXT,
  
  -- Pricing
  price_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  is_free BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'rejected', 'removed')),
  moderation_notes TEXT,
  
  -- Stats
  download_count INTEGER DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(2,1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tune Purchases ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tune_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.tune_listings(id) ON DELETE CASCADE,
  
  -- Transaction
  price_paid DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  seller_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Payment
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'refunded', 'disputed')),
  stripe_payment_intent_id TEXT,
  
  -- Download
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tune Reviews ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tune_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES public.tune_listings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.tune_purchases(id) ON DELETE CASCADE,
  
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,
  
  -- Verified purchase only
  is_verified BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(listing_id, reviewer_id)
);

-- ── Seller Profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  website TEXT,
  location TEXT,
  
  -- Stripe Connect
  stripe_connect_account_id TEXT,
  stripe_connect_enabled BOOLEAN DEFAULT false,
  
  -- Stats
  total_sales INTEGER DEFAULT 0,
  total_earnings DECIMAL(12,2) DEFAULT 0,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verification_method TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tune_listings_seller ON public.tune_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_tune_listings_status ON public.tune_listings(status);
CREATE INDEX IF NOT EXISTS idx_tune_listings_ecu ON public.tune_listings(ecu_family);
CREATE INDEX IF NOT EXISTS idx_tune_listings_vehicle ON public.tune_listings(vehicle_make, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_tune_listings_price ON public.tune_listings(price_usd);
CREATE INDEX IF NOT EXISTS idx_tune_listings_created ON public.tune_listings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tune_purchases_buyer ON public.tune_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_tune_purchases_seller ON public.tune_purchases(seller_id);
CREATE INDEX IF NOT EXISTS idx_tune_purchases_listing ON public.tune_purchases(listing_id);

CREATE INDEX IF NOT EXISTS idx_tune_reviews_listing ON public.tune_reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_tune_reviews_reviewer ON public.tune_reviews(reviewer_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.tune_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tune_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tune_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;

-- Listings: Anyone can view active listings, sellers can manage their own
CREATE POLICY "Anyone can view active listings"
  ON public.tune_listings FOR SELECT
  USING (status = 'active');

CREATE POLICY "Sellers can manage their own listings"
  ON public.tune_listings FOR ALL
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- Purchases: Buyers and sellers can see their own transactions
CREATE POLICY "Buyers can view their purchases"
  ON public.tune_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers can view their sales"
  ON public.tune_purchases FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "System can create purchases"
  ON public.tune_purchases FOR INSERT
  WITH CHECK (true);

-- Reviews: Anyone can view, verified buyers can create
CREATE POLICY "Anyone can view reviews"
  ON public.tune_reviews FOR SELECT
  USING (true);

CREATE POLICY "Verified buyers can review"
  ON public.tune_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can edit their own reviews"
  ON public.tune_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

-- Seller Profiles: Anyone can view, owner can edit
CREATE POLICY "Anyone can view seller profiles"
  ON public.seller_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their own seller profile"
  ON public.seller_profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Functions ───────────────────────────────────────────────────────────────

-- Update listing average rating when review is added/modified
CREATE OR REPLACE FUNCTION public.update_listing_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tune_listings
  SET 
    avg_rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.tune_reviews WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id)),
    review_count = (SELECT COUNT(*) FROM public.tune_reviews WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id))
  WHERE id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_listing_rating_on_review ON public.tune_reviews;
CREATE TRIGGER update_listing_rating_on_review
  AFTER INSERT OR UPDATE OR DELETE ON public.tune_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_listing_rating();

-- Update seller stats when purchase is completed
CREATE OR REPLACE FUNCTION public.update_seller_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'completed' AND OLD.payment_status != 'completed' THEN
    UPDATE public.seller_profiles
    SET 
      total_sales = total_sales + 1,
      total_earnings = total_earnings + NEW.seller_earnings
    WHERE id = NEW.seller_id;
    
    UPDATE public.tune_listings
    SET purchase_count = purchase_count + 1
    WHERE id = NEW.listing_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_seller_stats_on_purchase ON public.tune_purchases;
CREATE TRIGGER update_seller_stats_on_purchase
  AFTER UPDATE ON public.tune_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_seller_stats();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tune_listings_timestamp ON public.tune_listings;
CREATE TRIGGER update_tune_listings_timestamp
  BEFORE UPDATE ON public.tune_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tune_reviews_timestamp ON public.tune_reviews;
CREATE TRIGGER update_tune_reviews_timestamp
  BEFORE UPDATE ON public.tune_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_seller_profiles_timestamp ON public.seller_profiles;
CREATE TRIGGER update_seller_profiles_timestamp
  BEFORE UPDATE ON public.seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
