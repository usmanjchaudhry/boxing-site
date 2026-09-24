-- 1. Create a function that automatically creates the Profile and Household
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_profile_id UUID;
  new_household_id UUID;
BEGIN
  -- Create their profile using the extra data we send from the signup form
  INSERT INTO public.profiles (auth_user_id, email, first_name, last_name, phone, date_of_birth)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', 'Unknown'),
    COALESCE(new.raw_user_meta_data->>'last_name', 'Unknown'),
    new.raw_user_meta_data->>'phone',
    (NULLIF(new.raw_user_meta_data->>'date_of_birth', ''))::DATE
  )
  RETURNING id INTO new_profile_id;

  -- Create their Household / Wallet automatically
  INSERT INTO public.households (primary_member_id, owner_auth_id)
  VALUES (new_profile_id, new.id)
  RETURNING id INTO new_household_id;

  -- Link them into the household members table as the Primary
  INSERT INTO public.household_members (household_id, profile_id, role)
  VALUES (new_household_id, new_profile_id, 'Primary');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to the auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
