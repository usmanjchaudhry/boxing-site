-- 1. Drop the helper function policy
DROP POLICY IF EXISTS "Users can insert own waivers" ON public.waivers;

-- 2. Create the exact matching policy using a direct subquery
CREATE POLICY "Users can insert own waivers"
  ON public.waivers FOR INSERT
  WITH CHECK (
    signed_by_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

-- 3. Just to be completely sure, let's fix the SELECT policy as well
DROP POLICY IF EXISTS "Users can view own waivers" ON public.waivers;
CREATE POLICY "Users can view own waivers"
  ON public.waivers FOR SELECT
  USING (
    signed_by_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
    OR
    participant_id IN (
      SELECT profile_id FROM public.household_members WHERE household_id IN (
        SELECT id FROM public.households WHERE owner_auth_id = auth.uid()
      )
    )
  );
