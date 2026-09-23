-- 1. FACILITIES (Multi-location support for a single brand)
CREATE TABLE facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- e.g., "Downtown Branch", "Westside Location"
  address TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. PROFILES (Every single person, adult or child, gets a profile)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID REFERENCES auth.users(id), -- Only adults/app users will have this
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT, 
  phone TEXT,
  date_of_birth DATE NOT NULL,
  -- is_minor is dynamically calculated by your backend (or a View), since age changes every day!
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. HOUSEHOLDS / ACCOUNTS (The billing entity)
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  primary_member_id UUID REFERENCES profiles(id) NOT NULL, -- The person paying
  stripe_customer_id TEXT, -- Link to Stripe or payment processor
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 4. ADDRESSES (For shipping merchandise online)
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id),
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 5. HOUSEHOLD MEMBERS (Links people to the billing account)
CREATE TABLE household_members (
  household_id UUID REFERENCES households(id),
  profile_id UUID REFERENCES profiles(id),
  role TEXT CHECK (role IN ('Primary', 'Spouse', 'Dependent')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (household_id, profile_id)
);

-- 6. RELATIONSHIPS (Crucial for waivers: Who is legally responsible for who?)
CREATE TABLE relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guardian_id UUID REFERENCES profiles(id) NOT NULL,
  minor_id UUID REFERENCES profiles(id) NOT NULL,
  relationship_type TEXT CHECK (relationship_type IN ('Parent', 'Legal Guardian', 'Temporary Guardian')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(guardian_id, minor_id)
);

-- 7. MEMBERSHIP PLANS (What you sell)
CREATE TABLE membership_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- e.g., "Family Monthly", "Individual Annual"
  description TEXT,
  price_cents INTEGER NOT NULL,
  billing_interval TEXT CHECK (billing_interval IN ('month', 'year')),
  max_dependents INTEGER DEFAULT 0,
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 8. SUBSCRIPTIONS (Links a Household to a Plan)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) NOT NULL,
  plan_id UUID REFERENCES membership_plans(id) NOT NULL,
  status TEXT CHECK (status IN ('Active', 'Frozen', 'Cancelled', 'Past_Due')),
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. WAIVER TEMPLATES (Enterprise Waiver Management)
CREATE TABLE waiver_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  body_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 10. WAIVERS (The signed legal documents)
CREATE TABLE waivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID REFERENCES profiles(id) NOT NULL, -- Who is climbing?
  signed_by_id UUID REFERENCES profiles(id) NOT NULL, -- Who signed it? (Parent if minor)
  waiver_template_id UUID REFERENCES waiver_templates(id) NOT NULL,
  signature_date TIMESTAMPTZ DEFAULT NOW(),
  expiry_date TIMESTAMPTZ, -- Usually 1 year, or null for lifetime
  is_valid BOOLEAN DEFAULT TRUE,
  pdf_url TEXT, -- Link to the actual signed document in Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PRODUCTS (Retail tracking)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- e.g., "Boulderdash Logo T-Shirt"
  sku TEXT, -- Generic SKU
  price_cents INTEGER NOT NULL,
  category TEXT CHECK (category IN ('Retail', 'Food/Drink', 'Rental', 'DayPass')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 12. PRODUCT VARIANTS (For sizes, colors, and inventory tracking)
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id),
  size TEXT,  -- e.g., 'S', 'M', 'L'
  color TEXT, 
  stock_quantity INTEGER DEFAULT 0,
  sku TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 13. PAYMENT RECEIPTS (The Financial Ledger)
CREATE TABLE payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID REFERENCES facilities(id), -- Which location got the money?
  paid_by_profile_id UUID REFERENCES profiles(id), -- If a person swiped their card at the desk or paid cash
  household_id UUID REFERENCES households(id), -- If this was an automatic monthly billing charge
  subscription_id UUID REFERENCES subscriptions(id), -- NULL if it was a one-off purchase
  description TEXT,
  
  -- Enterprise Financials
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  amount_cents INTEGER NOT NULL, -- Total amount
  currency TEXT DEFAULT 'USD',
  
  status TEXT CHECK (status IN ('Pending', 'Succeeded', 'Failed', 'Refunded')),
  order_status TEXT DEFAULT 'Fulfilled' CHECK (order_status IN ('Pending', 'Shipped', 'Ready for Pickup', 'Fulfilled')),
  shipping_address_id UUID REFERENCES addresses(id),
  tracking_number TEXT,
  
  payment_method TEXT DEFAULT 'card' CHECK (payment_method IN ('cash', 'card', 'stripe_auto', 'other')),
  amount_tendered_cents INTEGER, -- Used when payment_method is 'cash'
  change_given_cents INTEGER,    -- Used when payment_method is 'cash'
  
  -- Enterprise Payment Tracking
  stripe_payment_intent_id TEXT, 
  stripe_transaction_id TEXT,
  idempotency_key TEXT UNIQUE, -- Prevent double charges
  
  created_by_user_id UUID REFERENCES auth.users(id), -- Which front desk employee rang them up?
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 14. RECEIPT LINE ITEMS (What exactly did they buy?)
CREATE TABLE receipt_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID REFERENCES payment_receipts(id) NOT NULL,
  product_id UUID REFERENCES products(id), 
  variant_id UUID REFERENCES product_variants(id), -- For specific size/color
  subscription_id UUID REFERENCES subscriptions(id), 
  quantity INTEGER DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  discount_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  total_price_cents INTEGER NOT NULL
);

-- 15. GYM CHECKINS (Who is walking through the door?)
CREATE TABLE gym_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) NOT NULL, -- Who walked through the door? (Adult or Kid)
  facility_id UUID REFERENCES facilities(id) NOT NULL, -- Which location did they enter?
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  checkin_method TEXT DEFAULT 'qr_scanner' CHECK (checkin_method IN ('qr_scanner', 'front_desk_manual', 'kiosk')),
  status_flag TEXT CHECK (status_flag IN ('Success', 'Waiver Expired', 'Payment Due', 'No Active Pass'))
);

-- 16. CLASS SCHEDULES (The timetable of classes)
CREATE TABLE class_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID REFERENCES facilities(id) NOT NULL,
  name TEXT NOT NULL, -- e.g., "Intro to Top Rope"
  instructor_profile_id UUID REFERENCES profiles(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 10,
  price_cents INTEGER DEFAULT 0, -- 0 if included in membership
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 17. CLASS BOOKINGS (Who is attending?)
CREATE TABLE class_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID REFERENCES class_schedules(id) NOT NULL,
  profile_id UUID REFERENCES profiles(id) NOT NULL,
  status TEXT CHECK (status IN ('Booked', 'Waitlisted', 'Cancelled', 'Attended')),
  payment_receipt_id UUID REFERENCES payment_receipts(id), -- If a drop-in fee was paid
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(schedule_id, profile_id) -- A person can only book the same class once
);
