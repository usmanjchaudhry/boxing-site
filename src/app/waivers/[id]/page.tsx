export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'
import LegalDocument from '@/components/waiver/LegalDocument'
import PrintButton from './PrintButton'

export const metadata: Metadata = {
  title: 'Signed Waiver | La Familia Showtime Boxing Club',
  description: 'Signed copy of a La Familia Showtime Boxing Club waiver.',
  robots: { index: false, follow: false },
}

const METHOD_LABEL: Record<string, string> = {
  account_holder: 'Signed by the account holder while logged in to their account',
  in_person_handoff: 'Signed in person on the account holder\'s device',
  email_link: 'Signed through an emailed link',
}

export default async function SignedWaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = getServiceClient()
  const { data: waiver } = await db
    .from('waivers')
    .select(`
      id, participant_id, signature_date, signature_svg, is_valid, expiry_date, kind,
      signer_name, signer_email, signer_relationship, signing_method,
      participant_name, participant_dob, participant_age, body_hash, ip_address, user_agent,
      acknowledgments, initials,
      template:waiver_templates(name, title, version, body_text, effective_date)
    `)
    .eq('id', id)
    .maybeSingle()
  if (!waiver) notFound()

  // Access: staff, or anyone in the participant's household
  const staff = await getStaffProfile('staff')
  if (!staff) {
    const { data: me } = await db.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
    if (!me) notFound()
    let allowed = me.id === waiver.participant_id
    if (!allowed) {
      const { data: mine } = await db.from('household_members').select('household_id').eq('profile_id', me.id)
      const { data: theirs } = await db.from('household_members').select('household_id').eq('profile_id', waiver.participant_id)
      const myIds = new Set((mine ?? []).map(r => r.household_id))
      allowed = (theirs ?? []).some(r => myIds.has(r.household_id))
    }
    if (!allowed) notFound()
  }

  const template = (Array.isArray(waiver.template) ? waiver.template[0] : waiver.template) as
    { name: string | null; title: string | null; version: string | null; body_text: string; effective_date: string | null } | null
  const { data: participant } = await db.from('profiles').select('first_name, last_name').eq('id', waiver.participant_id).maybeSingle()
  const participantName = waiver.participant_name || `${participant?.first_name ?? ''} ${participant?.last_name ?? ''}`.trim()
  const signedAt = new Date(waiver.signature_date).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'long' })
  const isNewFormat = !!waiver.body_hash
  const backHref = staff ? '/admin' : '/dashboard'

  const rows: [string, string | null | undefined][] = [
    ['Participant', participantName],
    ['Participant date of birth', waiver.participant_dob],
    ['Age when signed', waiver.participant_age != null ? String(waiver.participant_age) : null],
    ['Signed by', waiver.signer_name],
    ['Relationship', waiver.signer_relationship],
    ['Signer email', waiver.signer_email],
    ['How it was signed', waiver.signing_method ? METHOD_LABEL[waiver.signing_method] ?? waiver.signing_method : null],
    ['Signed at', `${signedAt}`],
    ['Valid until', waiver.expiry_date ? new Date(waiver.expiry_date).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'long' }) : 'Until the document is updated'],
    ['Status', waiver.is_valid ? 'Valid' : 'Revoked'],
    ['Document version', template?.version ? `${template.version}${template.effective_date ? ` (effective ${template.effective_date})` : ''}` : null],
    ['Document fingerprint (SHA-256)', waiver.body_hash],
    ['IP address', waiver.ip_address],
    ['Device', waiver.user_agent],
  ]

  return (
    <main className="min-h-screen bg-black text-white print:bg-white print:text-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="print:hidden flex items-center justify-between gap-3 mb-6">
          <Link href={backHref} className="text-sm font-semibold text-zinc-400 hover:text-white">← Back</Link>
          <PrintButton />
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-8 print:border-0 print:bg-white print:p-0">
          <p className="text-xs font-bold uppercase tracking-wider text-red-500">Signed copy</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black">{template?.title || template?.name || 'Waiver'}</h1>
          {!waiver.is_valid && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">This waiver has been revoked.</p>
          )}

          <div className="mt-6 print:text-black">
            {isNewFormat ? (
              <LegalDocument body={template?.body_text ?? ''} initials={(waiver.initials as Record<string, string>) ?? {}} readOnly hideTitle />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{template?.body_text}</p>
            )}
          </div>

          <section className="mt-8 border-t border-white/10 pt-6">
            <h2 className="text-lg font-extrabold mb-4">Signature record</h2>
            {waiver.signature_svg?.startsWith('data:image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={waiver.signature_svg} alt={`Signature of ${waiver.signer_name ?? participantName}`} className="h-28 rounded-xl bg-white p-2 object-contain mb-5" />
            ) : null}
            <dl className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="text-zinc-200 break-all print:text-black">{v}</dd>
                </div>
              ))}
            </dl>
            {waiver.acknowledgments && Object.keys(waiver.acknowledgments as object).length > 0 && (
              <div className="mt-5 text-sm">
                <p className="text-zinc-500 mb-1">Confirmations</p>
                <ul className="list-disc pl-5 text-zinc-300 print:text-black">
                  {Object.entries(waiver.acknowledgments as Record<string, boolean | string>).map(([k, v]) => (
                    <li key={k}>{k.replace(/_/g, ' ')}: {v === true ? 'Yes' : String(v)}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
