-- 1. Add the missing signature_svg column to the waivers table to store the raw signature
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signature_svg TEXT;

-- 2. Update the waivers INSERT policy to safely use the plpgsql helper function
DROP POLICY IF EXISTS "Users can insert own waivers" ON public.waivers;
CREATE POLICY "Users can insert own waivers"
  ON public.waivers FOR INSERT
  WITH CHECK (
    signed_by_id = get_my_profile_id()
  );
