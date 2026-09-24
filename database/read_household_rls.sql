-- Allow users to read the profiles of ANYONE in their household (spouse, children, etc)
DROP POLICY IF EXISTS "Users can view household members profiles" ON public.profiles;
CREATE POLICY "Users can view household members profiles"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT profile_id FROM public.household_members WHERE household_id IN (
        SELECT household_id FROM public.household_members WHERE profile_id IN (
          SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
        )
      )
    )
  );
