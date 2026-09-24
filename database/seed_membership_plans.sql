-- Seed 4 membership plans into the database.
-- stripe_price_id will be populated AFTER we create Products in Stripe via the setup script.

INSERT INTO public.membership_plans (name, description, price_cents, billing_interval, max_dependents, stripe_price_id, is_active)
VALUES
  ('Basic Individual', 'Monthly membership for one person. Full gym access.', 2999, 'month', 0, NULL, true),
  ('Basic Family', 'Monthly membership covering up to 4 household members. Full gym access for the whole family.', 4999, 'month', 3, NULL, true),
  ('Premium Individual', 'Monthly membership for one person. Full gym access + unlimited classes.', 4999, 'month', 0, NULL, true),
  ('Premium Family', 'Monthly membership covering up to 6 household members. Full gym access + unlimited classes for the whole family.', 7999, 'month', 5, NULL, true)
ON CONFLICT DO NOTHING;
