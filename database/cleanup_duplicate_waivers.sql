-- Delete all duplicate waivers, keeping only the most recent one per participant+template combo
DELETE FROM public.waivers
WHERE id NOT IN (
  SELECT DISTINCT ON (participant_id, waiver_template_id) id
  FROM public.waivers
  ORDER BY participant_id, waiver_template_id, signature_date DESC NULLS LAST
);

-- Add a unique constraint so this can never happen again
ALTER TABLE public.waivers
  DROP CONSTRAINT IF EXISTS unique_active_waiver_per_participant;

ALTER TABLE public.waivers
  ADD CONSTRAINT unique_active_waiver_per_participant
  UNIQUE (participant_id, waiver_template_id);
