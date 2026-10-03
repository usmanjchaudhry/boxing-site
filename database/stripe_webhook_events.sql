-- Stripe webhook idempotency: each Stripe event is processed at most once.
-- Run in BOTH Supabase branches (dev and main) via SQL Editor.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    TEXT PRIMARY KEY,          -- Stripe event id (evt_...)
  type        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only the service role (the webhook) touches this table. RLS on + no policies = no client access.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
