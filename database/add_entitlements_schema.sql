-- 1. Add daily check-in limit to membership plans
ALTER TABLE public.membership_plans
ADD COLUMN IF NOT EXISTS max_daily_checkins INTEGER DEFAULT NULL; 
-- NULL means unlimited check-ins for the household. 
-- Set to 2 if only 2 members of the family can check in on any given calendar day.

-- 2. Create the passes table (Entitlements Ledger)
CREATE TABLE IF NOT EXISTS public.passes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES public.profiles(id) NOT NULL,
  receipt_line_item_id UUID REFERENCES public.receipt_line_items(id), -- Nullable: allows free/VIP passes
  pass_type TEXT CHECK (pass_type IN ('Day Pass', 'Guest Pass', 'Class Pass', 'VIP Pass')),
  status TEXT DEFAULT 'Available' CHECK (status IN ('Available', 'Consumed', 'Expired', 'Revoked')),
  expires_at TIMESTAMPTZ, -- Nullable: allows passes that never expire
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add Row Level Security (RLS) to passes
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

-- Users can only view their own passes
CREATE POLICY "Users can view their own passes" 
ON public.passes 
FOR SELECT 
USING (profile_id IN (
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
));

-- 4. Update gym_checkins to link to passes
ALTER TABLE public.gym_checkins
ADD COLUMN IF NOT EXISTS pass_id UUID REFERENCES public.passes(id);

-- 5. Create an index to make finding available passes lightning fast during check-in
CREATE INDEX IF NOT EXISTS idx_passes_profile_status ON public.passes(profile_id, status);
