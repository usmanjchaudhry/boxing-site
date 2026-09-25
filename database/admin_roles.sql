-- Add role column to profiles for admin access control
-- Roles: 'member' (default), 'staff' (check-in access), 'admin' (full access)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' 
CHECK (role IN ('member', 'staff', 'admin'));

-- Create an index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Set yourself as admin (replace with your auth_user_id)
UPDATE public.profiles 
SET role = 'admin' 
WHERE auth_user_id = '6d179e67-1518-4fff-b6cf-eefc6f11546c';
