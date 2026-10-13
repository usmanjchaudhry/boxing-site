import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WAIVER_DOCUMENTS,
  EFFECTIVE_DATE,
  MINOR_WAIVER_VALID_DAYS,
  requiredDocuments,
  initialKeys,
  type WaiverDocument,
  type WaiverKind,
  type WaiverAudience,
} from '@/legal/waiver-documents'
import { DEFAULT_TIMEZONE, localDateString, addDays } from '@/utils/timezone'
import { nameMatches } from '@/utils/name-match'

export { nameMatches }

/**
 * Waiver service (server-only).
 *
 * The waiver text lives in src/legal/waiver-documents.ts. This module makes
 * sure each document version has a matching waiver_templates row, works out
 * who still needs to sign what, and records signatures with the evidence a
 * California court would look for (exact text hash, typed name, IP, device,
 * timestamp, initials, acknowledgments).
 */

export type MissingReason = 'missing' | 'outdated' | 'expired' | 'now_adult'
export type SignerRelationship = 'Self' | 'Parent' | 'Legal Guardian'
export type SigningMethod = 'account_holder' | 'in_person_handoff' | 'email_link'

export interface CurrentTemplate {
  id: string
  hash: string
  doc: WaiverDocument
}

export interface ParticipantInput {
  id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
}

export interface WaiverStatus {
  participantId: string
  age: number
  isMinor: boolean
  complete: boolean
  missing: { template: CurrentTemplate; reason: MissingReason }[]
  /** Current, valid waiver ids by kind (for "view signed copy" links). */
  signedIds: Partial<Record<WaiverKind, string>>
}

/** What the signing screen needs for one document. Safe to send to the browser. */
export interface PendingDocument {
  templateId: string
  hash: string
  kind: WaiverKind
  audience: WaiverAudience
  title: string
  shortName: string
  body: string
  reason: MissingReason
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: sha256(token) }
}

const key = (kind: string, audience: string) => `${kind}:${audience}`

// ── Templates ────────────────────────────────────────────────────────────

let templatesPromise: Promise<Map<string, CurrentTemplate>> | null = null

/**
 * Ensures every current document has a waiver_templates row and returns them.
 * Older templates are switched off (never deleted) so signed history stays intact.
 * Cached per server process; the database is only written the first time.
 */
export function getCurrentTemplates(db: SupabaseClient): Promise<Map<string, CurrentTemplate>> {
  if (!templatesPromise) {
    templatesPromise = loadTemplates(db).catch(err => {
      templatesPromise = null
      throw err
    })
  }
  return templatesPromise
}

async function loadTemplates(db: SupabaseClient): Promise<Map<string, CurrentTemplate>> {
  const result = new Map<string, CurrentTemplate>()

  for (const doc of WAIVER_DOCUMENTS) {
    const hash = sha256(doc.body)
    const existing = await findTemplate(db, doc)

    if (existing) {
      if (existing.body_hash !== hash) {
        throw new Error(
          `Waiver text for "${doc.shortName}" changed but DOCUMENT_VERSION is still ${doc.version}. ` +
          'Bump DOCUMENT_VERSION in src/legal/waiver-documents.ts so members re-sign the new text.'
        )
      }
      result.set(key(doc.kind, doc.audience), { id: existing.id, hash, doc })
      continue
    }

    const { data: inserted, error } = await db
      .from('waiver_templates')
      .insert({
        name: doc.title,
        title: doc.title,
        version: doc.version,
        body_text: doc.body,
        kind: doc.kind,
        audience: doc.audience,
        effective_date: EFFECTIVE_DATE,
        body_hash: hash,
        is_active: true,
      })
      .select('id')
      .single()

    if (error) {
      // Another server instance may have just created it
      const raced = await findTemplate(db, doc)
      if (!raced) throw new Error(`Could not create waiver template "${doc.shortName}": ${error.message}`)
      result.set(key(doc.kind, doc.audience), { id: raced.id, hash, doc })
    } else {
      result.set(key(doc.kind, doc.audience), { id: inserted.id, hash, doc })
    }
  }

  const currentIds = [...result.values()].map(t => t.id)
  const { error: deactivateErr } = await db
    .from('waiver_templates')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('id', 'in', `(${currentIds.join(',')})`)
  if (deactivateErr) console.error('[waivers] Could not deactivate old templates:', deactivateErr.message)

  return result
}

async function findTemplate(db: SupabaseClient, doc: WaiverDocument) {
  const { data, error } = await db
    .from('waiver_templates')
    .select('id, body_hash')
    .eq('kind', doc.kind)
    .eq('audience', doc.audience)
    .eq('version', doc.version)
    .not('body_hash', 'is', null)
    .maybeSingle()
  if (error) throw new Error(`Could not read waiver templates (has database/waiver_v3_migration.sql been run?): ${error.message}`)
  return data
}

// ── Age ──────────────────────────────────────────────────────────────────

/** Whole years old on `todayIso`. Unknown DOB counts as an adult. */
export function ageOn(dob: string | null, todayIso: string): number {
  if (!dob) return 99
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  let age = ty - y
  if (tm < m || (tm === m && td < d)) age--
  return age
}

export function gymToday(timeZone = DEFAULT_TIMEZONE): string {
  return localDateString(new Date(), timeZone)
}

// ── Status ───────────────────────────────────────────────────────────────

/** Who still needs to sign what. One query for any number of participants. */
export async function getWaiverStatuses(
  db: SupabaseClient,
  participants: ParticipantInput[],
  timeZone = DEFAULT_TIMEZONE
): Promise<Map<string, WaiverStatus>> {
  const templates = await getCurrentTemplates(db)
  const today = gymToday(timeZone)
  const statuses = new Map<string, WaiverStatus>()
  if (participants.length === 0) return statuses

  const { data: rows, error } = await db
    .from('waivers')
    .select('id, participant_id, waiver_template_id, kind, expiry_date, participant_age, signature_date')
    .in('participant_id', participants.map(p => p.id))
    .eq('is_valid', true)
    .order('signature_date', { ascending: false })
  if (error) throw new Error(`Could not read waivers: ${error.message}`)

  for (const p of participants) {
    const age = ageOn(p.date_of_birth, today)
    const mine = (rows ?? []).filter(r => r.participant_id === p.id)
    const status: WaiverStatus = { participantId: p.id, age, isMinor: age < 18, complete: true, missing: [], signedIds: {} }

    for (const doc of requiredDocuments(age)) {
      const template = templates.get(key(doc.kind, doc.audience))!
      const signed = mine.filter(r => r.waiver_template_id === template.id)
      const current = signed.find(r => !r.expiry_date || r.expiry_date.slice(0, 10) > today)

      if (current) {
        status.signedIds[doc.kind] = current.id
        continue
      }

      let reason: MissingReason = 'missing'
      if (signed.length > 0) reason = 'expired'
      else if (doc.kind === 'liability' && !status.isMinor && mine.some(r => r.kind === 'liability' && r.participant_age != null && r.participant_age < 18)) reason = 'now_adult'
      else if (mine.some(r => (r.kind ?? 'liability') === doc.kind)) reason = 'outdated'

      status.complete = false
      status.missing.push({ template, reason })
    }
    statuses.set(p.id, status)
  }
  return statuses
}

export function toPendingDocuments(status: WaiverStatus): PendingDocument[] {
  return status.missing.map(({ template, reason }) => ({
    templateId: template.id,
    hash: template.hash,
    kind: template.doc.kind,
    audience: template.doc.audience,
    title: template.doc.title,
    shortName: template.doc.shortName,
    body: template.doc.body,
    reason,
  }))
}

/** Scanner message for a member who can't get in because of their waiver. */
export function waiverDenialMessage(status: WaiverStatus): string {
  const reasons = new Set(status.missing.map(m => m.reason))
  if (reasons.has('now_adult')) return 'They turned 18. They need to sign the adult waiver themselves in the app.'
  if (reasons.has('expired')) return 'Their yearly youth waiver expired. A parent or guardian needs to re-sign it in the app.'
  if (reasons.has('outdated')) return 'Our waiver was updated. They need to sign the new version in the app.'
  return 'No signed waiver on file. Ask the member (or their parent) to sign it in the app.'
}

// ── Signing ──────────────────────────────────────────────────────────────

export interface SignedDocumentInput {
  templateId: string
  hash: string
  initials: Record<string, string>
  acknowledgments: Record<string, boolean | string>
  signature: string
}

export interface SignatureRequest {
  participant: ParticipantInput
  signedById: string | null
  signerName: string
  signerEmail: string | null
  relationship: SignerRelationship
  method: SigningMethod
  documents: SignedDocumentInput[]
  ipAddress: string | null
  userAgent: string | null
  timeZone?: string
}

const MAX_SIGNATURE_BYTES = 400_000

export function requiredAcknowledgments(doc: WaiverDocument): string[] {
  const acks = ['read', 'rights', 'esign']
  if (doc.kind === 'liability' && doc.audience === 'minor') acks.push('concussion_reviewed', 'minor_ack_name')
  return acks
}

/**
 * Validates and saves one participant's signatures. Throws an Error with a
 * member-friendly message when anything is off. Returns the new waiver ids.
 */
export async function recordSignatures(db: SupabaseClient, req: SignatureRequest): Promise<{ ids: string[]; templates: CurrentTemplate[] }> {
  const timeZone = req.timeZone ?? DEFAULT_TIMEZONE
  const today = gymToday(timeZone)
  const age = ageOn(req.participant.date_of_birth, today)
  const isMinor = age < 18
  const participantName = `${req.participant.first_name ?? ''} ${req.participant.last_name ?? ''}`.trim()

  const signerName = (req.signerName || '').trim().replace(/\s+/g, ' ')
  if (signerName.length < 3 || !signerName.includes(' ')) throw new Error('Type your full legal name (first and last).')
  if (signerName.length > 120) throw new Error('That name is too long.')

  if (isMinor) {
    if (req.relationship === 'Self') throw new Error(`${participantName} is under 18, so a parent or legal guardian must sign.`)
  } else {
    if (req.relationship !== 'Self') throw new Error(`${participantName} is 18 or older and must sign for themselves.`)
    if (!nameMatches(signerName, req.participant.first_name, req.participant.last_name)) {
      throw new Error(`The typed name must match ${participantName}, the person this waiver is for.`)
    }
  }

  const templates = await getCurrentTemplates(db)
  const required = requiredDocuments(age).map(d => templates.get(key(d.kind, d.audience))!)
  if (req.documents.length === 0) throw new Error('Nothing to sign.')

  const rows = req.documents.map(input => {
    const template = required.find(t => t.id === input.templateId)
    if (!template || template.hash !== input.hash) {
      throw new Error('This waiver was just updated. Please reload the page and sign the latest version.')
    }

    for (const k of initialKeys(template.doc.body)) {
      const v = (input.initials?.[k] ?? '').trim()
      if (!/^[A-Za-z][A-Za-z.\- ]{0,5}$/.test(v)) throw new Error(`Please initial every marked section of the ${template.doc.shortName}.`)
    }

    for (const ack of requiredAcknowledgments(template.doc)) {
      const v = input.acknowledgments?.[ack]
      const ok = ack === 'minor_ack_name' ? typeof v === 'string' && v.trim().length >= 2 : v === true
      if (!ok) throw new Error(`Please complete every confirmation on the ${template.doc.shortName}.`)
    }

    if (typeof input.signature !== 'string' || !input.signature.startsWith('data:image/png;base64,') || input.signature.length > MAX_SIGNATURE_BYTES) {
      throw new Error('Please draw your signature again.')
    }

    const expiry = template.doc.kind === 'liability' && isMinor ? addDays(today, MINOR_WAIVER_VALID_DAYS) : null

    return {
      participant_id: req.participant.id,
      signed_by_id: req.signedById,
      waiver_template_id: template.id,
      signature_svg: input.signature,
      is_valid: true,
      kind: template.doc.kind,
      signer_name: signerName,
      signer_email: req.signerEmail,
      signer_relationship: req.relationship,
      signing_method: req.method,
      participant_name: participantName,
      participant_dob: req.participant.date_of_birth,
      participant_age: age === 99 ? null : age,
      body_hash: template.hash,
      ip_address: req.ipAddress,
      user_agent: req.userAgent?.slice(0, 500) ?? null,
      acknowledgments: input.acknowledgments,
      initials: input.initials,
      expiry_date: expiry,
    }
  })

  const { data, error } = await db.from('waivers').insert(rows).select('id, waiver_template_id')
  if (error) {
    console.error('[waivers] Failed to save signatures:', error)
    throw new Error('We could not save your signature. Please try again.')
  }

  const ids = (data ?? []).map(r => r.id)
  const signedTemplates = (data ?? []).map(r => required.find(t => t.id === r.waiver_template_id)!)
  return { ids, templates: signedTemplates }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(h: Headers): string | null {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')
}

/** Origin of the current request, so emailed links point at the same site (dev or prod). */
export function requestOrigin(h: Headers, fallback: string): string {
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return fallback
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}
