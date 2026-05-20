-- Seller Subscription Plans for DCTuning Marketplace
-- Sales limits per tier

DROP TABLE IF EXISTS public.seller_subscriptions;
DROP TABLE IF EXISTS public.seller_subscription_plans;

CREATE TABLE public.seller_subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_fee_eur DECIMAL(10,2) NOT NULL,
  platform_fee_percent DECIMAL(5,2) NOT NULL,
  max_sales INTEGER DEFAULT NULL,
  features JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.seller_subscription_plans (id, name, monthly_fee_eur, platform_fee_percent, max_sales, features)
VALUES 
  ('starter', 'Starter', 15.00, 20.00, 25, '["fleet", "obd2", "performance_monitor", "basic_listing"]'),
  ('pro', 'Pro', 29.00, 12.00, 50, '["fleet", "obd2", "performance_monitor", "analytics"]'),
  ('enterprise', 'Enterprise', 49.00, 8.00, NULL, '["fleet", "obd2", "performance_monitor", "analytics", "priority_support", "api_access"]');

-- Seller Subscriptions (tracks who is subscribed)
CREATE TABLE public.seller_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.seller_subscription_plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_seller_subs_user ON public.seller_subscriptions(user_id);

ALTER TABLE public.seller_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own seller subscription"
  ON public.seller_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
