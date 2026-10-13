'use server'

import { headers } from 'next/headers'
import { getServiceClient } from '@/utils/auth/staff'
import { SITE } from '@/utils/site'
import {
  ageOn,
  gymToday,
  clientIp,
  sha256,
  recordSignatures,
  requestOrigin,
  type ParticipantInput,
} from '@/utils/waivers'
import { sendSignedCopyEmail } from '@/utils/waiver-email'
import type { ActionResult, SignPayload } from '@/components/waiver/WaiverFlow'

/** Signs the waiver(s) for the person an emailed link was created for. */
export async function signViaLink(token: string, payload: SignPayload): Promise<ActionResult> {
  const db = getServiceClient()
  const tokenHash = sha256(String(token || ''))
  const nowIso = new Date().toISOString()

  // Claim the link first so it can't be used twice at the same time
  const { data: request } = await db
    .from('waiver_sign_requests')
    .update({ used_at: nowIso })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('id, participant_id, email')
    .maybeSingle()
  if (!request) return { ok: false, error: 'This link has expired or was already used. Ask for a new one.' }

  const release = () => db.from('waiver_sign_requests').update({ used_at: null }).eq('id', request.id)

  try {
    if (payload.participantId !== request.participant_id) {
      await release()
      return { ok: false, error: 'This link is for a different person.' }
    }

    const { data: participant } = await db
      .from('profiles')
      .select('id, first_name, last_name, date_of_birth')
      .eq('id', request.participant_id)
      .maybeSingle()
    if (!participant) {
      await release()
      return { ok: false, error: 'We could not find this member. Please contact the gym.' }
    }

    const isMinor = ageOn(participant.date_of_birth, gymToday()) < 18
    if (isMinor && payload.relationship !== 'Parent' && payload.relationship !== 'Legal Guardian') {
      await release()
      return { ok: false, error: 'Choose whether you are the parent or legal guardian.' }
    }

    const h = await headers()
    const { ids, templates } = await recordSignatures(db, {
      participant: participant as ParticipantInput,
      // An adult signing their own waiver is the participant; a parent may not have an account
      signedById: isMinor ? null : participant.id,
      signerName: payload.signerName,
      signerEmail: request.email,
      relationship: isMinor ? payload.relationship : 'Self',
      method: 'email_link',
      documents: payload.documents,
      ipAddress: clientIp(h),
      userAgent: h.get('user-agent'),
    })

    const origin = requestOrigin(h, SITE.url)
    await sendSignedCopyEmail({
      to: request.email,
      participantName: `${participant.first_name ?? ''} ${participant.last_name ?? ''}`.trim(),
      signerName: payload.signerName.trim(),
      signedAt: new Date(),
      documents: templates.map(t => ({ template: t, initials: payload.documents.find(d => d.templateId === t.id)?.initials ?? {} })),
      viewUrls: ids.map(id => `${origin}/waivers/${id}`),
    })

    return { ok: true }
  } catch (e) {
    await release()
    console.error('[waivers] signViaLink failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the waiver. Please try again.' }
  }
}
