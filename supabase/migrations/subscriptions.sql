-- Subscription plans
create table if not exists public.subscription_plans (
  id text primary key,  -- 'starter', 'pro', 'agency'
  name text not null,
  price_monthly integer not null,  -- in cents (€49 = 4900)
  price_yearly integer not null,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  features jsonb default '[]',
  max_seats integer default 1,
  created_at timestamptz default now()
);

-- User subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  plan_id text references subscription_plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'inactive',  -- active, inactive, trialing, canceled, past_due
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  billing_interval text default 'monthly',  -- monthly, yearly
  seats_used integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table subscriptions enable row level security;
create policy "Users can view own subscription" on subscriptions for select using (auth.uid() = user_id);

-- Seed plans
insert into subscription_plans (id, name, price_monthly, price_yearly, features, max_seats) values
  ('starter', 'Starter', 4900, 47040, '["Remap Builder (A2L + DRT support)", "VIN Decoder", "Device Library", "5 remaps per month", "Email support"]', 1),
  ('pro', 'Pro', 9900, 95040, '["Everything in Starter", "Unlimited remaps", "80,000+ file library access", "50,000 DRT definitions", "Smart Match & Tuning Tool", "Priority support"]', 1),
  ('agency', 'Agency', 19900, 191040, '["Everything in Pro", "5 team seats", "White-label option", "API access", "Dedicated support"]', 5)
on conflict (id) do nothing;
