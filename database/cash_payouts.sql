-- Cash going OUT of the drawer (e.g. paying a coach in cash, buying supplies).
-- Shown as negative amounts in the admin Cash Payments tab and subtracted
-- from cash income on the Reports tab (cash in / cash out / net cash).
--
-- Kept separate from cash_payments on purpose: cash_payments rows are tied to a
-- membership (subscription + household) and the check-in scanner reads them,
-- whereas a payout is not tied to any member.
--
-- Run once in the Supabase SQL editor (dev and production). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.cash_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_name TEXT NOT NULL CHECK (length(trim(payee_name)) > 0), -- who was paid (free text)
  category TEXT NOT NULL DEFAULT 'coach' CHECK (category IN ('coach', 'other')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),          -- stored positive; shown as minus
  payout_date DATE NOT NULL,
  notes TEXT,                                                      -- reason, e.g. "Saturday classes"
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),        -- which admin recorded it
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_payouts_date ON public.cash_payouts(payout_date);

-- RLS on with no policies: only the service role (admin API routes) can read/write.
ALTER TABLE public.cash_payouts ENABLE ROW LEVEL SECURITY;

