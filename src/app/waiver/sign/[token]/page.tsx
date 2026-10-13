export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { getServiceClient } from '@/utils/auth/staff'
import { getWaiverStatuses, sha256, toPendingDocuments, type ParticipantInput } from '@/utils/waivers'
import WaiverFlow from '@/components/waiver/WaiverFlow'
import { signViaLink } from './actions'

export const metadata: Metadata = {
  title: 'Sign Your Waiver',
  description: 'Read and sign the La Familia Showtime Boxing Club waiver and photo/video release.',
  robots: { index: false, follow: false },
}

export default async function SignWaiverLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = getServiceClient()

  const { data: request } = await db
    .from('waiver_sign_requests')
    .select('id, participant_id, email, expires_at, used_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()

  if (!request) {
    return <Message title="Link not found" body="This signing link isn't valid. Ask the member who sent it to send a new one from their dashboard." />
  }
  if (request.used_at) {
    return <Message title="Already signed" body="This link was already used to sign the waiver. A copy was emailed to the address it was sent to." ok />
  }
  if (new Date(request.expires_at) < new Date()) {
    return <Message title="Link expired" body="Signing links work for 7 days. Ask the member who sent it to send a new one from their dashboard." />
  }

  const { data: participant } = await db
    .from('profiles')
    .select('id, first_name, last_name, date_of_birth')
    .eq('id', request.participant_id)
    .maybeSingle()
  if (!participant) {
    return <Message title="Member not found" body="We couldn't find the member this link is for. Please contact the gym." />
  }

  let status
  try {
    status = (await getWaiverStatuses(db, [participant as ParticipantInput])).get(participant.id)
  } catch (e) {
    console.error('[waivers] link page status failed:', e)
    return <Message title="Something went wrong" body="We couldn't load the waiver right now. Please try again in a few minutes." />
  }
  if (!status || status.complete) {
    return <Message title="Nothing to sign" body={`${participant.first_name}'s waiver is already up to date. You're all set.`} ok />
  }

  const name = `${participant.first_name ?? ''} ${participant.last_name ?? ''}`.trim()

  return (
    <div className="min-h-screen bg-black">
      <WaiverFlow
        mode="link"
        participants={[{
          participantId: participant.id,
          name,
          firstName: participant.first_name ?? 'This member',
          isMinor: status.isMinor,
          isSelf: !status.isMinor,
          docs: toPendingDocuments(status),
        }]}
        dismissKey={request.id}
        signAction={signViaLink.bind(null, token)}
      />
    </div>
  )
}

function Message({ title, body, ok = false }: { title: string; body: string; ok?: boolean }) {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-zinc-950 p-8 text-center">
        <div className={`mx-auto mb-5 h-14 w-14 rounded-full flex items-center justify-center text-2xl ${ok ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {ok ? '✓' : '!'}
        </div>
        <h1 className="text-2xl font-black mb-2">{title}</h1>
        <p className="text-sm text-zinc-400">{body}</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-red-400 hover:text-red-300">
          La Familia Showtime Boxing Club
        </Link>
      </div>
    </main>
  )
}
