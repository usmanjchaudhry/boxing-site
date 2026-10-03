-- ═══════════════════════════════════════════════════════════════════════════
-- LA FAMILIA SHOWTIME BOXING CLUB
-- Complete Database Setup Script (Run-Once)
--
-- This script sets up ALL functions, triggers, RLS policies, indexes,
-- and seed data needed for a fresh Supabase branch.
--
-- SAFE TO RE-RUN: Uses DROP IF EXISTS / IF NOT EXISTS everywhere.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 1: SCHEMA ADDITIONS (columns, constraints, indexes)
-- Tables already exist from the Supabase branch. This adds any columns
-- or constraints that were added AFTER the initial schema.
-- ─────────────────────────────────────────────────────────────────────────

-- Denormalized owner_auth_id on households (avoids RLS recursion)
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS owner_auth_id UUID;

-- Stripe subscription tracking
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Unique constraint on household_id for upsert support (one sub per household)
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_household_unique;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_household_unique UNIQUE (household_id);

-- Payment method on subscriptions (stripe, cash, comp)
-- Note: This may fail if column already exists with the constraint.
-- That's OK — the column already exists from the schema.
DO $$ BEGIN
  ALTER TABLE public.subscriptions
    ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'stripe'
    CHECK (payment_method IN ('stripe', 'cash', 'comp'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Role column on profiles
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'staff', 'admin'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Signature SVG on waivers
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signature_svg TEXT;

-- Daily check-in limit on plans
ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS max_daily_checkins INTEGER DEFAULT NULL;

-- Pass link on gym_checkins
ALTER TABLE public.gym_checkins
  ADD COLUMN IF NOT EXISTS pass_id UUID REFERENCES public.passes(id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_passes_profile_status ON public.passes(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_payments_household ON public.cash_payments(household_id);
CREATE INDEX IF NOT EXISTS idx_cash_payments_date ON public.cash_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_method ON public.subscriptions(payment_method);


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 2: CASCADE DELETES
-- When a user is deleted from auth.users, everything cascades cleanly.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_auth_user_id_fkey,
  ADD CONSTRAINT profiles_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.households
  DROP CONSTRAINT IF EXISTS households_primary_member_id_fkey,
  ADD CONSTRAINT households_primary_member_id_fkey
    FOREIGN KEY (primary_member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.household_members
  DROP CONSTRAINT IF EXISTS household_members_household_id_fkey,
  ADD CONSTRAINT household_members_household_id_fkey
    FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE public.household_members
  DROP CONSTRAINT IF EXISTS household_members_profile_id_fkey,
  ADD CONSTRAINT household_members_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.relationships
  DROP CONSTRAINT IF EXISTS relationships_guardian_id_fkey,
  ADD CONSTRAINT relationships_guardian_id_fkey
    FOREIGN KEY (guardian_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.relationships
  DROP CONSTRAINT IF EXISTS relationships_minor_id_fkey,
  ADD CONSTRAINT relationships_minor_id_fkey
    FOREIGN KEY (minor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.waivers
  DROP CONSTRAINT IF EXISTS waivers_participant_id_fkey,
  ADD CONSTRAINT waivers_participant_id_fkey
    FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.waivers
  DROP CONSTRAINT IF EXISTS waivers_signed_by_id_fkey,
  ADD CONSTRAINT waivers_signed_by_id_fkey
    FOREIGN KEY (signed_by_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 3: FUNCTIONS
-- Helper functions used by RLS policies and the signup trigger.
-- ─────────────────────────────────────────────────────────────────────────

-- 3a. Helper: get the current user's profile_id without triggering RLS recursion
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

-- 3b. Signup trigger: auto-creates profile + household + household_member
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_profile_id UUID;
  new_household_id UUID;
BEGIN
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

  INSERT INTO public.households (primary_member_id, owner_auth_id)
  VALUES (new_profile_id, new.id)
  RETURNING id INTO new_household_id;

  INSERT INTO public.household_members (household_id, profile_id, role)
  VALUES (new_household_id, new_profile_id, 'Primary');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3c. RPC: Add a dependent child to the caller's household
CREATE OR REPLACE FUNCTION add_dependent_to_household(
  p_first_name TEXT,
  p_last_name TEXT,
  p_dob DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_profile_id UUID;
  v_household_id UUID;
  v_child_profile_id UUID;
BEGIN
  SELECT id INTO v_parent_profile_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_parent_profile_id IS NULL THEN
    RAISE EXCEPTION 'Parent profile not found or user is not logged in.';
  END IF;

  SELECT household_id INTO v_household_id
  FROM public.household_members
  WHERE profile_id = v_parent_profile_id
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Parent does not belong to a household.';
  END IF;

  INSERT INTO public.profiles (first_name, last_name, date_of_birth)
  VALUES (p_first_name, p_last_name, p_dob)
  RETURNING id INTO v_child_profile_id;

  INSERT INTO public.household_members (household_id, profile_id, role)
  VALUES (v_household_id, v_child_profile_id, 'Dependent');

  INSERT INTO public.relationships (guardian_id, minor_id, relationship_type)
  VALUES (v_parent_profile_id, v_child_profile_id, 'Parent');

  RETURN v_child_profile_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 4: ROW LEVEL SECURITY (RLS)
-- The definitive, battle-tested policies. All old/conflicting policies
-- are dropped first to avoid duplicates.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Enable RLS on all tables ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiver_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_payments ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view household members profiles" ON public.profiles;
DROP POLICY IF EXISTS "Unified profile read access" ON public.profiles;
DROP POLICY IF EXISTS "Unbreakable profile read access" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert child profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Read: own profile + anyone in your household
CREATE POLICY "Unbreakable profile read access"
  ON public.profiles FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR
    id IN (
      SELECT profile_id FROM public.household_members WHERE household_id IN (
        SELECT id FROM public.households WHERE owner_auth_id = auth.uid()
      )
    )
  );

-- Update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth_user_id = auth.uid());

-- Insert child profiles (no auth_user_id = dependents)
CREATE POLICY "Users can insert child profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (auth_user_id IS NULL);

-- ── HOUSEHOLDS ──
DROP POLICY IF EXISTS "Users can view own household" ON public.households;
DROP POLICY IF EXISTS "Users can update own household" ON public.households;
DROP POLICY IF EXISTS "Users can insert household" ON public.households;

CREATE POLICY "Users can view own household"
  ON public.households FOR SELECT
  USING (owner_auth_id = auth.uid());

CREATE POLICY "Users can update own household"
  ON public.households FOR UPDATE
  USING (owner_auth_id = auth.uid());

-- ── HOUSEHOLD MEMBERS ──
DROP POLICY IF EXISTS "Users can view own household members" ON public.household_members;
DROP POLICY IF EXISTS "Users can insert into own household" ON public.household_members;
DROP POLICY IF EXISTS "Users can delete household members" ON public.household_members;

CREATE POLICY "Users can view own household members"
  ON public.household_members FOR SELECT
  USING (
    household_id IN (SELECT id FROM public.households WHERE owner_auth_id = auth.uid())
  );

CREATE POLICY "Users can insert into own household"
  ON public.household_members FOR INSERT
  WITH CHECK (
    household_id IN (SELECT id FROM public.households WHERE owner_auth_id = auth.uid())
  );

CREATE POLICY "Users can delete household members"
  ON public.household_members FOR DELETE
  USING (
    household_id IN (SELECT id FROM public.households WHERE owner_auth_id = auth.uid())
  );

-- ── RELATIONSHIPS ──
DROP POLICY IF EXISTS "Users can insert relationships" ON public.relationships;
DROP POLICY IF EXISTS "Users can read own relationships" ON public.relationships;

CREATE POLICY "Users can insert relationships"
  ON public.relationships FOR INSERT
  WITH CHECK (
    guardian_id IN (
      SELECT primary_member_id FROM public.households WHERE owner_auth_id = auth.uid()
    )
  );

CREATE POLICY "Users can read own relationships"
  ON public.relationships FOR SELECT
  USING (
    guardian_id IN (
      SELECT primary_member_id FROM public.households WHERE owner_auth_id = auth.uid()
    )
  );

-- ── MEMBERSHIP PLANS (public read for active plans) ──
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.membership_plans;
DROP POLICY IF EXISTS "Anyone can read active plans" ON public.membership_plans;

CREATE POLICY "Anyone can view active plans"
  ON public.membership_plans FOR SELECT
  USING (is_active = true);

-- ── SUBSCRIPTIONS ──
DROP POLICY IF EXISTS "Household members can view subscription" ON public.subscriptions;

CREATE POLICY "Household members can view subscription"
  ON public.subscriptions FOR SELECT
  USING (
    household_id IN (
      SELECT id FROM public.households WHERE owner_auth_id = auth.uid()
    )
  );

-- ── WAIVER TEMPLATES (public read for active) ──
DROP POLICY IF EXISTS "Anyone can read active templates" ON public.waiver_templates;

CREATE POLICY "Anyone can read active templates"
  ON public.waiver_templates FOR SELECT
  USING (is_active = true);

-- ── WAIVERS ──
DROP POLICY IF EXISTS "Users can insert own waivers" ON public.waivers;
DROP POLICY IF EXISTS "Users can view own waivers" ON public.waivers;

CREATE POLICY "Users can insert own waivers"
  ON public.waivers FOR INSERT
  WITH CHECK (
    signed_by_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own waivers"
  ON public.waivers FOR SELECT
  USING (
    signed_by_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
    OR
    participant_id IN (
      SELECT profile_id FROM public.household_members WHERE household_id IN (
        SELECT id FROM public.households WHERE owner_auth_id = auth.uid()
      )
    )
  );

-- ── PRODUCTS (public read for active) ──
DROP POLICY IF EXISTS "Anyone can read active products" ON public.products;

CREATE POLICY "Anyone can read active products"
  ON public.products FOR SELECT
  USING (is_active = true);

-- ── PRODUCT VARIANTS (public read) ──
DROP POLICY IF EXISTS "Anyone can read variants" ON public.product_variants;

CREATE POLICY "Anyone can read variants"
  ON public.product_variants FOR SELECT
  USING (true);

-- ── GYM CHECKINS ──
DROP POLICY IF EXISTS "Users can read own checkins" ON public.gym_checkins;

CREATE POLICY "Users can read own checkins"
  ON public.gym_checkins FOR SELECT
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- ── PASSES ──
DROP POLICY IF EXISTS "Users can view their own passes" ON public.passes;
DROP POLICY IF EXISTS "Users can read own passes" ON public.passes;

CREATE POLICY "Users can view their own passes"
  ON public.passes FOR SELECT
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- ── FACILITIES (public read) ──
DROP POLICY IF EXISTS "Anyone can read facilities" ON public.facilities;

CREATE POLICY "Anyone can read facilities"
  ON public.facilities FOR SELECT
  USING (true);

-- ── ADDRESSES ──
DROP POLICY IF EXISTS "Users can manage own addresses" ON public.addresses;

CREATE POLICY "Users can manage own addresses"
  ON public.addresses FOR ALL
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- ── CLASS SCHEDULES (public read) ──
DROP POLICY IF EXISTS "Anyone can read schedules" ON public.class_schedules;

CREATE POLICY "Anyone can read schedules"
  ON public.class_schedules FOR SELECT
  USING (true);

-- ── CLASS BOOKINGS ──
DROP POLICY IF EXISTS "Users can read own bookings" ON public.class_bookings;

CREATE POLICY "Users can read own bookings"
  ON public.class_bookings FOR SELECT
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- ── PAYMENT RECEIPTS ──
DROP POLICY IF EXISTS "Users can read own receipts" ON public.payment_receipts;

CREATE POLICY "Users can read own receipts"
  ON public.payment_receipts FOR SELECT
  USING (
    paid_by_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- ── RECEIPT LINE ITEMS ──
DROP POLICY IF EXISTS "Users can read own line items" ON public.receipt_line_items;

CREATE POLICY "Users can read own line items"
  ON public.receipt_line_items FOR SELECT
  USING (
    receipt_id IN (
      SELECT id FROM public.payment_receipts
      WHERE paid_by_profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
  );

-- ── CASH PAYMENTS (admin only via service role, no user policies needed) ──
-- No user-facing policies. Admin access uses SUPABASE_SERVICE_ROLE_KEY.


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 5: SEED DATA
-- Default facility and waiver templates.
-- Membership plans and products are seeded by the Node.js migration script.
-- ─────────────────────────────────────────────────────────────────────────

-- Default facility
INSERT INTO public.facilities (name, address, timezone)
VALUES ('La Familia Showtime Boxing Club', '18323 Sherman Way, Reseda, CA 91335', 'America/Los_Angeles')
ON CONFLICT DO NOTHING;

-- Waiver templates
INSERT INTO public.waiver_templates (name, body_text, version, is_active)
VALUES (
  'Adult Liability Waiver',
  'By signing this waiver, I acknowledge and accept the risks associated with participating in boxing and fitness activities at La Familia Showtime Boxing Club. I release the gym, its owners, coaches, and staff from any liability for injuries sustained during training, classes, or use of equipment.',
  '1.0',
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.waiver_templates (name, body_text, version, is_active)
VALUES (
  'Minor Liability Waiver',
  'As the parent or legal guardian of the minor named below, I acknowledge and accept the risks associated with my child participating in boxing and fitness activities at La Familia Showtime Boxing Club. I release the gym, its owners, coaches, and staff from any liability for injuries sustained during training, classes, or use of equipment.',
  '1.0',
  true
) ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE! Your database is fully configured.
--
-- Next steps:
-- 1. Run the Node.js script (scripts/migrate-plans.mjs) to create
--    Stripe products and seed membership_plans + products tables.
-- 2. Set your account as admin:
--    UPDATE public.profiles SET role = 'admin' WHERE email = 'usmanjc98@gmail.com';
-- ═══════════════════════════════════════════════════════════════════════════
