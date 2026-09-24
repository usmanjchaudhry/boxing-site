-- 1. Update Profiles to cascade delete when auth.users is deleted
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_auth_user_id_fkey,
  ADD CONSTRAINT profiles_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Update Households to cascade delete when the primary member Profile is deleted
ALTER TABLE public.households
  DROP CONSTRAINT IF EXISTS households_primary_member_id_fkey,
  ADD CONSTRAINT households_primary_member_id_fkey
    FOREIGN KEY (primary_member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. Update Household Members to cascade delete when the Household is deleted
ALTER TABLE public.household_members
  DROP CONSTRAINT IF EXISTS household_members_household_id_fkey,
  ADD CONSTRAINT household_members_household_id_fkey
    FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

-- 4. Update Household Members to cascade delete when the Profile is deleted
ALTER TABLE public.household_members
  DROP CONSTRAINT IF EXISTS household_members_profile_id_fkey,
  ADD CONSTRAINT household_members_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. Update Relationships (Guardian) to cascade
ALTER TABLE public.relationships
  DROP CONSTRAINT IF EXISTS relationships_guardian_id_fkey,
  ADD CONSTRAINT relationships_guardian_id_fkey
    FOREIGN KEY (guardian_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 6. Update Relationships (Minor) to cascade
ALTER TABLE public.relationships
  DROP CONSTRAINT IF EXISTS relationships_minor_id_fkey,
  ADD CONSTRAINT relationships_minor_id_fkey
    FOREIGN KEY (minor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 7. Update Waivers (Participant) to cascade
ALTER TABLE public.waivers
  DROP CONSTRAINT IF EXISTS waivers_participant_id_fkey,
  ADD CONSTRAINT waivers_participant_id_fkey
    FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 8. Update Waivers (Signed By) to cascade
ALTER TABLE public.waivers
  DROP CONSTRAINT IF EXISTS waivers_signed_by_id_fkey,
  ADD CONSTRAINT waivers_signed_by_id_fkey
    FOREIGN KEY (signed_by_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
