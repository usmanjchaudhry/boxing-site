-- Weekly visit limit for membership plans (e.g. "Twice a Week Membership").
--
-- max_weekly_checkins = how many DIFFERENT DAYS each person on the plan may
-- check in per calendar week (Monday to Sunday, gym time). Scanning again on a
-- day they already came in doesn't use another visit. NULL = no weekly limit
-- (every existing plan).
--
-- Safe to run more than once. Run it in the Supabase SQL editor on BOTH the dev
-- and the production project. The site keeps working before it's run; the
-- weekly limit just isn't enforced until it is.

ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS max_weekly_checkins INTEGER;

ALTER TABLE public.membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_max_weekly_checkins_check;

ALTER TABLE public.membership_plans
  ADD CONSTRAINT membership_plans_max_weekly_checkins_check
  CHECK (max_weekly_checkins IS NULL OR max_weekly_checkins BETWEEN 1 AND 7);

COMMENT ON COLUMN public.membership_plans.max_weekly_checkins IS
  'Days per calendar week (Mon-Sun, gym time) each person may check in. NULL = unlimited.';

-- Make PostgREST (the Supabase API) see the new column right away
NOTIFY pgrst, 'reload schema';
