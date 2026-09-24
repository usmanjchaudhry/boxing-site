-- 1. Add owner_auth_id to households to avoid querying profiles in RLS policies
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS owner_auth_id UUID;

-- 2. Backfill the data for existing households
UPDATE public.households h
SET owner_auth_id = p.auth_user_id
FROM public.profiles p
WHERE h.primary_member_id = p.id;

-- 3. Drop all the buggy policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view household members profiles" ON public.profiles;
DROP POLICY IF EXISTS "Unified profile read access" ON public.profiles;

-- 4. Create the ultimate, un-loopable policy
CREATE POLICY "Unbreakable profile read access"
  ON public.profiles FOR SELECT
  USING (
    -- You can read your own profile
    auth_user_id = auth.uid()
    OR
    -- You can read anyone's profile if they belong to a household YOU own
    id IN (
      SELECT profile_id FROM public.household_members WHERE household_id IN (
        SELECT id FROM public.households WHERE owner_auth_id = auth.uid()
      )
    )
  );
