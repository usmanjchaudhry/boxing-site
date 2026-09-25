-- Add payment_method to subscriptions so we can distinguish Stripe vs Cash
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'stripe'
CHECK (payment_method IN ('stripe', 'cash', 'comp'));

-- Cash payments audit log
CREATE TABLE IF NOT EXISTS public.cash_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id), -- which admin recorded it
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_cash_payments_household ON public.cash_payments(household_id);
CREATE INDEX IF NOT EXISTS idx_cash_payments_date ON public.cash_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_method ON public.subscriptions(payment_method);

-- RLS: Only admins/staff can see cash payments (via service role key, no RLS needed)
ALTER TABLE public.cash_payments ENABLE ROW LEVEL SECURITY;
