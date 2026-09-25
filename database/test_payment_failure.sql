-- STEP 1: Simulate a payment failure (set to Past_Due)
-- Run this, then test check-in → should be DENIED with "Payment Due"
UPDATE public.subscriptions
SET status = 'Past_Due'
WHERE household_id = '3b211b0a-9819-419e-8f23-11f0c167eca3';

-- STEP 2: After testing, restore back to Active
-- UPDATE public.subscriptions
-- SET status = 'Active'
-- WHERE household_id = '3b211b0a-9819-419e-8f23-11f0c167eca3';
