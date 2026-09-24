-- We enabled RLS on households but never gave you permission to read your own household!
DROP POLICY IF EXISTS "Users can view own household" ON public.households;
CREATE POLICY "Users can view own household"
  ON public.households FOR SELECT
  USING (owner_auth_id = auth.uid());
