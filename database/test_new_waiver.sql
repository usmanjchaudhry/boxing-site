-- 1. Deactivate the old waiver
UPDATE public.waiver_templates
SET is_active = false
WHERE is_active = true;

-- 2. Insert the brand new 2027 Liability Waiver
INSERT INTO public.waiver_templates (name, version, body_text, is_active)
VALUES (
  'TITLE Boxing Club Liability & Media Release',
  '2.0',
  'NEW VERSION 2.0 UPDATE: I understand that boxing and heavy bag workouts involve intense physical exertion. I hereby release TITLE Boxing and all instructors from any and all liability for injuries sustained during my participation. Furthermore, I agree that TITLE Boxing may use photographs or video of me for marketing purposes. By signing below, I acknowledge these updated terms.',
  true
);
