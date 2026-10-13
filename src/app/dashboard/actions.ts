'use server'

import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { dobError } from '@/utils/dob'
import { getServiceClient } from '@/utils/auth/staff'
import { SITE } from '@/utils/site'
import {
  ageOn,
  gymToday,
  clientIp,
  newToken,
  recordSignatures,
  requestOrigin,
  type ParticipantInput,
  type SignerRelationship,
  type SigningMethod,
} from '@/utils/waivers'
import { sendSignedCopyEmail, sendSigningLinkEmail } from '@/utils/waiver-email'
import type { ActionResult, SignPayload } from '@/components/waiver/WaiverFlow'

const LINK_VALID_DAYS = 7
const MAX_LINKS_PER_DAY = 5

/**
 * The signed-in user's profile and everyone in their household.
 * Service-role reads, scoped to the caller's own household.
 */
async function householdContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = getServiceClient()
  const { data: me } = await db
    .from('profiles')
    .select('id, first_name, last_name, date_of_birth')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return null

  const { data: hm } = await db.from('household_members').select('household_id').eq('profile_id', me.id).maybeSingle()
  let members: ParticipantInput[] = [me]
  if (hm) {
    const { data: rows } = await db
      .from('household_members')
      .select('profile:profiles(id, first_name, last_name, date_of_birth)')
      .eq('household_id', hm.household_id)
    members = (rows ?? []).map(r => (Array.isArray(r.profile) ? r.profile[0] : r.profile) as ParticipantInput).filter(Boolean)
  }
  return { user, me: me as ParticipantInput, members, db }
}

const fullName = (p: ParticipantInput) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()

// 1. SIGN WAIVERS (liability + photo/video release) for one household member
export async function signWaivers(payload: SignPayload): Promise<ActionResult> {
  try {
    const ctx = await householdContext()
    if (!ctx) return { ok: false, error: 'Please sign in again.' }
    const { user, me, members, db } = ctx

    const participant = members.find(m => m.id === payload.participantId)
    if (!participant) return { ok: false, error: 'That person is not in your household.' }

    const today = gymToday()
    const participantIsMinor = ageOn(participant.date_of_birth, today) < 18
    const accountHolderIsMinor = ageOn(me.date_of_birth, today) < 18
    const isSelf = participant.id === me.id

    // Who is legally signing, and how (recorded on the waiver)
    let relationship: SignerRelationship
    let method: SigningMethod
    let signedById: string | null
    let signerEmail: string | null = null

    if (!participantIsMinor) {
      // Adults always sign for themselves
      relationship = 'Self'
      if (isSelf) {
        method = 'account_holder'
        signedById = me.id
        signerEmail = user.email ?? null
      } else {
        method = 'in_person_handoff'
        signedById = participant.id
      }
    } else {
      if (payload.relationship !== 'Parent' && payload.relationship !== 'Legal Guardian') {
        return { ok: false, error: 'Choose whether you are the parent or legal guardian.' }
      }
      relationship = payload.relationship
      if (!accountHolderIsMinor && !payload.handoff) {
        method = 'account_holder'
        signedById = me.id
        signerEmail = user.email ?? null
      } else {
        // A parent or guardian signing on the account holder's device
        method = 'in_person_handoff'
        signedById = null
      }
    }

    const h = await headers()
    const { ids, templates } = await recordSignatures(db, {
      participant,
      signedById,
      signerName: payload.signerName,
      signerEmail,
      relationship,
      method,
      documents: payload.documents,
      ipAddress: clientIp(h),
      userAgent: h.get('user-agent'),
    })

    if (user.email) {
      const origin = requestOrigin(h, SITE.url)
      await sendSignedCopyEmail({
        to: user.email,
        participantName: fullName(participant),
        signerName: payload.signerName.trim(),
        signedAt: new Date(),
        documents: templates.map(t => ({ template: t, initials: payload.documents.find(d => d.templateId === t.id)?.initials ?? {} })),
        viewUrls: ids.map(id => `${origin}/waivers/${id}`),
      })
    }

    revalidatePath('/dashboard')
    return { ok: true }
  } catch (e) {
    console.error('[waivers] signWaivers failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the waiver. Please try again.' }
  }
}

// 2. EMAIL A SIGNING LINK (another adult in the household, or a parent for a minor account holder)
export async function sendWaiverLink(participantId: string, email: string): Promise<ActionResult> {
  try {
    const ctx = await householdContext()
    if (!ctx) return { ok: false, error: 'Please sign in again.' }
    const { me, members, db } = ctx

    const participant = members.find(m => m.id === participantId)
    if (!participant) return { ok: false, error: 'That person is not in your household.' }

    const today = gymToday()
    const participantIsMinor = ageOn(participant.date_of_birth, today) < 18
    const accountHolderIsMinor = ageOn(me.date_of_birth, today) < 18
    if (!participantIsMinor && participant.id === me.id) return { ok: false, error: 'You can sign your own waiver right here.' }
    if (participantIsMinor && !accountHolderIsMinor) return { ok: false, error: `As ${participant.first_name}'s parent or guardian, you can sign right here.` }

    const to = (email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 200) return { ok: false, error: 'Enter a valid email address.' }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await db
      .from('waiver_sign_requests')
      .select('id', { count: 'exact', head: true })
      .eq('participant_id', participant.id)
      .gte('created_at', since)
    if ((count ?? 0) >= MAX_LINKS_PER_DAY) return { ok: false, error: 'Too many links sent today. Try again tomorrow.' }

    const { token, tokenHash } = newToken()
    const { error } = await db.from('waiver_sign_requests').insert({
      token_hash: tokenHash,
      participant_id: participant.id,
      requested_by_id: me.id,
      email: to,
      expires_at: new Date(Date.now() + LINK_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (error) {
      console.error('[waivers] Could not create signing link:', error)
      return { ok: false, error: 'Could not create the link. Please try again.' }
    }

    const h = await headers()
    await sendSigningLinkEmail({
      to,
      participantName: fullName(participant),
      isMinor: participantIsMinor,
      link: `${requestOrigin(h, SITE.url)}/waiver/sign/${token}`,
      requestedBy: fullName(me) || 'A La Familia member',
    })

    return { ok: true, message: `Link sent to ${to}. It works for ${LINK_VALID_DAYS} days.` }
  } catch (e) {
    console.error('[waivers] sendWaiverLink failed:', e)
    return { ok: false, error: 'Could not send the link. Please try again.' }
  }
}

// 3. ADD DEPENDENT TO HOUSEHOLD
export async function addDependent(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not logged in")

  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const dob = formData.get('dob') as string

  const dobProblem = dobError(dob)
  if (dobProblem) throw new Error(dobProblem)

  // A single, atomic, transactional RPC call to Postgres!
  const { data: childId, error } = await supabase.rpc('add_dependent_to_household', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_dob: dob
  })

  if (error) {
    console.error("RPC Transaction Failed:", error)
    throw new Error("Failed to add family member to the database.")
  }

  // Refresh page to trigger Gatekeeper!
  revalidatePath('/dashboard')
}
