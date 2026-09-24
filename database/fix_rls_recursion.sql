-- 1. Drop the old policies to completely clean the slate
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view household members profiles" ON public.profiles;

-- 2. Create a Pl/pgSQL function. (The previous one was LANGUAGE sql, which Postgres "inlines" and causes the loop to re-trigger. Pl/pgSQL forces Postgres to execute it as a separate transaction context).
CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN v_id;
END;
$$;

-- 3. Create one single, unified policy that handles everything without looping
CREATE POLICY "Unified profile read access"
  ON public.profiles FOR SELECT
  USING (
    -- You can read your own profile
    auth_user_id = auth.uid() 
    OR 
    -- Or you can read the profile of anyone in your household
    id IN (
      SELECT profile_id FROM public.household_members WHERE household_id IN (
        SELECT household_id FROM public.household_members WHERE profile_id = get_my_profile_id()
      )
    )
  );
