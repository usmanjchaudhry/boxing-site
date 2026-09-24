-- 1. Enable RLS on dependent tables
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to read their own household members
DROP POLICY IF EXISTS "Users can view own household members" ON public.household_members;
CREATE POLICY "Users can view own household members"
  ON public.household_members FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members 
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
  );

-- 3. Allow users to INSERT child profiles (bypassing the need for an auth_user_id)
-- Note: We only allow inserting a profile if auth_user_id is NULL (which means it's a child/dependent)
DROP POLICY IF EXISTS "Users can insert child profiles" ON public.profiles;
CREATE POLICY "Users can insert child profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (auth_user_id IS NULL);

-- 4. Allow users to add members to their own household
DROP POLICY IF EXISTS "Users can insert into own household" ON public.household_members;
CREATE POLICY "Users can insert into own household"
  ON public.household_members FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.household_members 
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
  );

-- 5. Allow users to create relationships where they are the guardian
DROP POLICY IF EXISTS "Users can insert relationships" ON public.relationships;
CREATE POLICY "Users can insert relationships"
  ON public.relationships FOR INSERT
  WITH CHECK (
    guardian_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );
