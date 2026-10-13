-- ═══════════════════════════════════════════════════════════════════════════
-- WAIVER v3 MIGRATION — liability waiver + minor addendum + media release
--
-- Run this in the Supabase SQL editor. Run on DEV first, then on PRODUCTION
-- *before* deploying the matching code to production.
--
-- ADDITIVE ONLY: adds columns, one new table, indexes, and a trigger.
-- No existing rows are deleted or rewritten. Old waivers stay on file.
-- SAFE TO RE-RUN.
--
-- The waiver TEXT itself is not seeded here. It lives in
-- src/legal/waiver-documents.ts (so the lawyer can redline one file), and the
-- app creates the matching waiver_templates row the first time it's needed.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. waiver_templates: document type, audience, integrity hash ──────────
ALTER TABLE public.waiver_templates ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.waiver_templates ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE public.waiver_templates ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.waiver_templates ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE public.waiver_templates ADD COLUMN IF NOT EXISTS body_hash TEXT;

-- Existing (pre-v3) templates were all liability waivers for everyone
UPDATE public.waiver_templates SET kind = 'liability' WHERE kind IS NULL;
UPDATE public.waiver_templates SET audience = 'all' WHERE audience IS NULL;

ALTER TABLE public.waiver_templates ALTER COLUMN kind SET DEFAULT 'liability';
ALTER TABLE public.waiver_templates ALTER COLUMN audience SET DEFAULT 'all';

DO $$ BEGIN
  ALTER TABLE public.waiver_templates
    ADD CONSTRAINT waiver_templates_kind_check CHECK (kind IN ('liability', 'media'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.waiver_templates
    ADD CONSTRAINT waiver_templates_audience_check CHECK (audience IN ('adult', 'minor', 'all'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One row per document version (lets the app create templates idempotently).
-- Old templates may share a version string, so only enforce it where a hash exists.
CREATE UNIQUE INDEX IF NOT EXISTS idx_waiver_templates_kind_audience_version
  ON public.waiver_templates (kind, audience, version)
  WHERE body_hash IS NOT NULL;


-- ── 2. waivers: e-signature evidence (who, what exact text, when, how) ────
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signer_name TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signer_email TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signer_relationship TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signing_method TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS participant_name TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS participant_dob DATE;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS participant_age INTEGER;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS body_hash TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS acknowledgments JSONB;
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS initials JSONB;

-- signature_svg already exists on most databases; make sure it does here too
ALTER TABLE public.waivers ADD COLUMN IF NOT EXISTS signature_svg TEXT;

-- A parent/guardian signing through an emailed link may not have a profile,
-- so signed_by_id can be empty. signer_name / signer_email identify them.
ALTER TABLE public.waivers ALTER COLUMN signed_by_id DROP NOT NULL;

-- Existing signed waivers were liability waivers
UPDATE public.waivers SET kind = 'liability' WHERE kind IS NULL;

DO $$ BEGIN
  ALTER TABLE public.waivers
    ADD CONSTRAINT waivers_signer_relationship_check
    CHECK (signer_relationship IS NULL OR signer_relationship IN ('Self', 'Parent', 'Legal Guardian'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.waivers
    ADD CONSTRAINT waivers_signing_method_check
    CHECK (signing_method IS NULL OR signing_method IN ('account_holder', 'in_person_handoff', 'email_link'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_waivers_participant_template
  ON public.waivers (participant_id, waiver_template_id);


-- ── 3. Signed waivers can't be edited ─────────────────────────────────────
-- Once signed, the record is evidence. The only allowed change is turning
-- is_valid off (e.g. an admin voids a waiver signed by mistake).
-- Deletes are NOT blocked: deleting a member's account still cascades.
CREATE OR REPLACE FUNCTION public.prevent_waiver_edits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'is_valid') IS DISTINCT FROM (to_jsonb(OLD) - 'is_valid') THEN
    RAISE EXCEPTION 'Signed waivers cannot be edited. Only is_valid may change.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waivers_immutable ON public.waivers;
CREATE TRIGGER waivers_immutable
  BEFORE UPDATE ON public.waivers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_waiver_edits();


-- ── 4. waiver_sign_requests: emailed signing links ────────────────────────
-- Only the server (service role) touches this table. The raw token is only
-- ever in the email; we store its SHA-256 hash.
CREATE TABLE IF NOT EXISTS public.waiver_sign_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  participant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waiver_sign_requests_participant
  ON public.waiver_sign_requests (participant_id);

ALTER TABLE public.waiver_sign_requests ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: members can't read or write it directly.


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Existing members will be asked to sign the new waiver the next time
-- they open the app, and the scanner will show "Waiver Required" until they do.
-- ═══════════════════════════════════════════════════════════════════════════
