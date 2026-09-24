CREATE OR REPLACE FUNCTION add_dependent_to_household(
  p_first_name TEXT,
  p_last_name TEXT,
  p_dob DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Executes with admin privileges, safely bypassing RLS for this specific transaction
AS $$
DECLARE
  v_parent_profile_id UUID;
  v_household_id UUID;
  v_child_profile_id UUID;
BEGIN
  -- 1. Identify the caller (the logged-in parent) securely using Supabase's auth context
  SELECT id INTO v_parent_profile_id 
  FROM public.profiles 
  WHERE auth_user_id = auth.uid() 
  LIMIT 1;

  IF v_parent_profile_id IS NULL THEN
    RAISE EXCEPTION 'Parent profile not found or user is not logged in.';
  END IF;

  -- 2. Find the parent's household wallet
  SELECT household_id INTO v_household_id 
  FROM public.household_members 
  WHERE profile_id = v_parent_profile_id 
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Parent does not belong to a household.';
  END IF;

  -- 3. Insert the child profile and instantly capture their new ID
  INSERT INTO public.profiles (first_name, last_name, date_of_birth)
  VALUES (p_first_name, p_last_name, p_dob)
  RETURNING id INTO v_child_profile_id;

  -- 4. Attach the child to the household wallet
  INSERT INTO public.household_members (household_id, profile_id, role)
  VALUES (v_household_id, v_child_profile_id, 'Dependent');

  -- 5. Establish the Guardian/Minor legal relationship
  INSERT INTO public.relationships (guardian_id, minor_id, relationship_type)
  VALUES (v_parent_profile_id, v_child_profile_id, 'Parent');

  -- 6. Return the newly created child ID
  RETURN v_child_profile_id;
END;
$$;
