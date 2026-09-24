-- 1. Drop the old policies on household_members that secretly queried profiles
DROP POLICY IF EXISTS "Users can view own household members" ON public.household_members;
DROP POLICY IF EXISTS "Users can insert into own household" ON public.household_members;

-- 2. Create clean policies that use the new owner_auth_id column (zero recursion)
CREATE POLICY "Users can view own household members"
  ON public.household_members FOR SELECT
  USING (
    household_id IN (SELECT id FROM public.households WHERE owner_auth_id = auth.uid())
  );

CREATE POLICY "Users can insert into own household"
  ON public.household_members FOR INSERT
  WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_auth_id = auth.uid())
  );

-- 3. Also fix relationships policy just to be safe
DROP POLICY IF EXISTS "Users can insert relationships" ON public.relationships;
CREATE POLICY "Users can insert relationships"
  ON public.relationships FOR INSERT
  WITH CHECK (
    guardian_id IN (
      SELECT primary_member_id FROM public.households WHERE owner_auth_id = auth.uid()
    )
  );
