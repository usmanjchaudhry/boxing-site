-- 1. Enable RLS on core tables (just in case)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiver_templates ENABLE ROW LEVEL SECURITY;

-- 2. PROFILES: Users can read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = auth_user_id);

-- 3. WAIVER TEMPLATES: Anyone logged in can read active templates
DROP POLICY IF EXISTS "Anyone can view active waiver templates" ON public.waiver_templates;
CREATE POLICY "Anyone can view active waiver templates"
  ON public.waiver_templates FOR SELECT
  USING (is_active = true);

-- 4. WAIVERS: Users can view their own waivers
DROP POLICY IF EXISTS "Users can view own waivers" ON public.waivers;
CREATE POLICY "Users can view own waivers"
  ON public.waivers FOR SELECT
  USING (
    participant_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

-- 5. WAIVERS: Users can insert their own waivers
DROP POLICY IF EXISTS "Users can insert own waivers" ON public.waivers;
CREATE POLICY "Users can insert own waivers"
  ON public.waivers FOR INSERT
  WITH CHECK (
    participant_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );
