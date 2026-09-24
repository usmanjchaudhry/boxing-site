-- Add stripe_subscription_id to subscriptions table for webhook tracking
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add a unique constraint on household_id so upsert works cleanly
-- (one active subscription per household)
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_household_unique;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_household_unique UNIQUE (household_id);

-- Seed a default facility for check-ins
INSERT INTO public.facilities (name, address, timezone)
VALUES ('Main Gym', '123 Boxing Lane, City, ST 12345', 'America/Los_Angeles')
ON CONFLICT DO NOTHING;
