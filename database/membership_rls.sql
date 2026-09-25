-- Membership plans are public info — anyone logged in can see them
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active plans" ON public.membership_plans;
CREATE POLICY "Anyone can view active plans"
  ON public.membership_plans FOR SELECT
  USING (is_active = true);

-- Subscriptions: household members can view their own household's subscription
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household members can view subscription" ON public.subscriptions;
CREATE POLICY "Household members can view subscription"
  ON public.subscriptions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE profile_id IN (
        SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
      )
    )
  );
