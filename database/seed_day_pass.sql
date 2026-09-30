-- 1. Set the daily check-in limits to match exactly what the UI says
UPDATE public.membership_plans SET max_daily_checkins = 1 WHERE name LIKE '%Individual%';
UPDATE public.membership_plans SET max_daily_checkins = 4 WHERE name = 'Basic Family';
UPDATE public.membership_plans SET max_daily_checkins = 6 WHERE name = 'Premium Family';

-- 2. Create the "Day Pass" product in your catalog so you can sell it
INSERT INTO public.products (name, price_cents, category, is_active)
VALUES ('Single Day Pass', 1500, 'DayPass', true)
ON CONFLICT DO NOTHING;

-- 3. (Optional Testing) 
-- Run this if you want to manually give a test user a Day Pass right now to test the scanner.
-- Replace the profile_id with an actual UUID from your profiles table.
/*
INSERT INTO public.passes (profile_id, pass_type, status)
VALUES ('REPLACE-WITH-PROFILE-ID', 'Day Pass', 'Available');
*/
