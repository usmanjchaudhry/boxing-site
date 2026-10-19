'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileSignature, Loader2, Mail, ShieldAlert, Smartphone, X } from 'lucide-react'
import LegalDocument from '@/components/waiver/LegalDocument'
import SignaturePad from '@/components/waiver/SignaturePad'
import type { PendingDocument, SignedDocumentInput } from '@/utils/waivers'
import { nameMatches, initialsValid } from '@/utils/name-match'

export interface PendingParticipant {
  participantId: string
  name: string
  firstName: string
  isMinor: boolean
  isSelf: boolean
  docs: PendingDocument[]
}

export type Relationship = 'Self' | 'Parent' | 'Legal Guardian'

export interface SignPayload {
  participantId: string
  signerName: string
  relationship: Relationship
  handoff: boolean
  documents: SignedDocumentInput[]
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

type Who =
  | 'self'            // adult signing their own waiver
  | 'guardian'        // adult account holder signing for a child in their household
  | 'adult-handoff'   // another adult must sign personally
  | 'minor-handoff'   // account holder is a minor; a parent must sign
  | 'link-adult'      // emailed link, adult signing for themselves
  | 'link-guardian'   // emailed link, parent signing for a child

const REASON_TEXT: Record<PendingDocument['reason'], string> = {
  missing: '',
  outdated: 'Our waiver was updated, so it needs to be signed again.',
  expired: 'Youth waivers must be re-signed every year.',
  now_adult: 'You turned 18, so you need to sign the adult waiver yourself.',
}

/**
 * Waiver signing popup. Walks through each person who still needs to sign,
 * and each document they need (liability waiver, then photo/video release).
 */
export default function WaiverFlow({
  mode,
  participants,
  accountHolderIsMinor = false,
  forceParticipantId = null,
  dismissKey,
  signAction,
  sendLinkAction,
}: {
  mode: 'dashboard' | 'link'
  participants: PendingParticipant[]
  accountHolderIsMinor?: boolean
  forceParticipantId?: string | null
  dismissKey: string
  signAction: (payload: SignPayload) => Promise<ActionResult>
  sendLinkAction?: (participantId: string, email: string) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [localSkips, setLocalSkips] = useState<string[]>([])
  const [doneIds, setDoneIds] = useState<string[]>([])
  const [finished, setFinished] = useState<string | null>(null)

  const whoFor = (p: PendingParticipant): Who => {
    if (mode === 'link') return p.isMinor ? 'link-guardian' : 'link-adult'
    if (p.isSelf && !p.isMinor) return 'self'
    if (p.isMinor && !accountHolderIsMinor) return 'guardian'
    if (!p.isMinor) return 'adult-handoff'
    return 'minor-handoff'
  }
  const canSkip = (p: PendingParticipant) => mode === 'dashboard' && (whoFor(p) === 'adult-handoff' || whoFor(p) === 'minor-handoff')

  // "Not now" choices last for this browser session only.
  // null on the server and during hydration, so nothing pops up until we know.
  const skipKey = (id: string) => `waiver-skip:${dismissKey}:${id}`
  const storedSkips = useSyncExternalStore(
    noopSubscribe,
    () => participants.filter(p => sessionStorage.getItem(skipKey(p.participantId))).map(p => p.participantId).join(','),
    () => null
  )
  const dismissed = useMemo(
    () => (storedSkips === null ? null : [...storedSkips.split(',').filter(Boolean), ...localSkips]),
    [storedSkips, localSkips]
  )

  const queue = useMemo(() => {
    if (dismissed === null) return []
    const list = participants.filter(p =>
      !doneIds.includes(p.participantId) &&
      (p.participantId === forceParticipantId || !canSkip(p) || !dismissed.includes(p.participantId))
    )
    return list.sort((a, b) => (a.participantId === forceParticipantId ? -1 : b.participantId === forceParticipantId ? 1 : 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, dismissed, doneIds, forceParticipantId])

  const skip = (p: PendingParticipant) => {
    sessionStorage.setItem(skipKey(p.participantId), '1')
    setLocalSkips(s => [...s, p.participantId])
    if (forceParticipantId === p.participantId) router.replace('/dashboard')
  }

  const onSigned = (p: PendingParticipant) => {
    const remaining = queue.filter(q => q.participantId !== p.participantId)
    setDoneIds(d => [...d, p.participantId])
    if (mode === 'link') {
      setFinished(p.name)
    } else if (remaining.length === 0) {
      router.replace('/dashboard')
      router.refresh()
    }
  }

  if (finished) {
    return (
      <Overlay>
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">All set!</h2>
          <p className="text-zinc-400 text-sm">The waiver for <span className="text-white font-semibold">{finished}</span> is signed. A copy was emailed to you. You can close this page.</p>
        </div>
      </Overlay>
    )
  }

  const current = queue[0]
  if (!current) return null

  return (
    <ParticipantSigner
      key={current.participantId}
      participant={current}
      who={whoFor(current)}
      skippable={canSkip(current)}
      queueLength={queue.length}
      onSkip={() => skip(current)}
      onSigned={() => onSigned(current)}
      signAction={signAction}
      sendLinkAction={sendLinkAction}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────

interface DocState {
  initials: Record<string, string>
  acks: Record<string, boolean>
  reachedEnd: boolean
}

function ParticipantSigner({
  participant: p,
  who,
  skippable,
  queueLength,
  onSkip,
  onSigned,
  signAction,
  sendLinkAction,
}: {
  participant: PendingParticipant
  who: Who
  skippable: boolean
  queueLength: number
  onSkip: () => void
  onSigned: () => void
  signAction: (payload: SignPayload) => Promise<ActionResult>
  sendLinkAction?: (participantId: string, email: string) => Promise<ActionResult>
}) {
  const handoff = who === 'adult-handoff' || who === 'minor-handoff'
  const forMinor = p.isMinor
  const [stage, setStage] = useState<'intro' | 'docs'>(handoff ? 'intro' : 'docs')
  const [docIndex, setDocIndex] = useState(0)
  const [docState, setDocState] = useState<DocState[]>(() => p.docs.map(() => ({ initials: {}, acks: {}, reachedEnd: false })))
  const [signerName, setSignerName] = useState('')
  const [relationship, setRelationship] = useState<Relationship | ''>(forMinor ? '' : 'Self')
  const [minorAckName, setMinorAckName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const doc = p.docs[docIndex]
  const state = docState[docIndex]
  const isFirst = docIndex === 0
  const isLast = docIndex === p.docs.length - 1
  const initialKeys = useMemo(() => [...doc.body.matchAll(/\[\[initial:([a-z_]+)\]\]/g)].map(m => m[1]), [doc.body])
  const initialsDone = initialKeys.filter(k => initialsValid(state.initials[k])).length
  const initialsInvalid = initialKeys.filter(k => (state.initials[k] ?? '').trim() && !initialsValid(state.initials[k])).length
  const isMinorLiability = doc.kind === 'liability' && doc.audience === 'minor'

  const ackList = useMemo(() => {
    const subject = forMinor ? `${p.firstName}` : 'I'
    const list: { key: string; label: string }[] = [
      { key: 'read', label: 'I have read and understand this entire document.' },
      doc.kind === 'liability'
        ? { key: 'rights', label: forMinor
            ? `I understand I am giving up legal rights for ${p.firstName} and myself, including the right to sue for ordinary negligence.`
            : 'I understand I am giving up legal rights, including the right to sue for ordinary negligence.' }
        : { key: 'rights', label: forMinor
            ? `I understand photos and videos of ${p.firstName} may be taken and used as described above.`
            : 'I understand photos and videos of me may be taken and used as described above.' },
    ]
    if (isMinorLiability) list.push({ key: 'concussion_reviewed', label: `I reviewed the concussion and sudden cardiac arrest information with ${p.firstName}.` })
    list.push({ key: 'esign', label: 'I agree to sign electronically, and my electronic signature is legally binding.' })
    void subject
    return list
  }, [doc.kind, forMinor, isMinorLiability, p.firstName])

  // Confirmations unlock once the signer has scrolled to the end of the document
  useEffect(() => {
    const el = endRef.current
    if (!el || state.reachedEnd) return
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setDocState(s => s.map((d, i) => (i === docIndex ? { ...d, reachedEnd: true } : d)))
      }
    }, { root: scrollRef.current, threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [docIndex, state.reachedEnd, stage])

  const update = (patch: Partial<DocState>) => setDocState(s => s.map((d, i) => (i === docIndex ? { ...d, ...patch } : d)))

  const nameComplete = signerName.trim().length >= 3 && signerName.trim().includes(' ')
  // Adults sign for themselves, so the name must match the member (the server checks this too)
  const nameMismatch = !forMinor && nameComplete && !nameMatches(signerName, p.name, null)
  const nameOk = nameComplete && !nameMismatch
  // What's still missing, so a disabled button never leaves someone guessing
  const uncheckedCount = ackList.filter(a => !state.acks[a.key]).length
  const todo = [
    !state.reachedEnd && 'scroll to the end',
    initialsInvalid > 0 && `fix ${initialsInvalid} initial${initialsInvalid === 1 ? '' : 's'} (use letters, e.g. "JD")`,
    initialsDone + initialsInvalid < initialKeys.length && `initial ${initialKeys.length - initialsDone - initialsInvalid} more section${initialKeys.length - initialsDone - initialsInvalid === 1 ? '' : 's'}`,
    uncheckedCount > 0 && `check ${uncheckedCount} more box${uncheckedCount === 1 ? '' : 'es'}`,
    isMinorLiability && minorAckName.trim().length < 2 && `have ${p.firstName} type their name`,
    forMinor && relationship === '' && 'choose Parent or Legal Guardian',
    !nameOk && 'type your full legal name',
    !signature && 'draw your signature',
  ].filter(Boolean) as string[]
  const ready = todo.length === 0

  const back = () => {
    setError(null)
    setDocIndex(i => Math.max(0, i - 1))
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const next = async () => {
    setError(null)
    if (!isLast) {
      setDocIndex(i => i + 1)
      scrollRef.current?.scrollTo({ top: 0 })
      return
    }
    setSubmitting(true)
    try {
      const result = await signAction({
        participantId: p.participantId,
        signerName: signerName.trim(),
        relationship: relationship as Relationship,
        handoff,
        documents: p.docs.map((d, i) => ({
          templateId: d.templateId,
          hash: d.hash,
          initials: docState[i].initials,
          acknowledgments: {
            ...docState[i].acks,
            ...(d.kind === 'liability' && d.audience === 'minor' ? { minor_ack_name: minorAckName.trim() } : {}),
          },
          signature: signature!,
        })),
      })
      if (!result.ok) {
        setError(result.error)
        setSubmitting(false)
        return
      }
      onSigned()
    } catch {
      setError('Something went wrong. Check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (stage === 'intro') {
    return (
      <Overlay onClose={skippable ? onSkip : undefined}>
        <HandoffIntro
          participant={p}
          minorAccount={who === 'minor-handoff'}
          skippable={skippable}
          onContinue={() => setStage('docs')}
          onSkip={onSkip}
          sendLinkAction={sendLinkAction}
        />
      </Overlay>
    )
  }

  const signerLabel =
    who === 'self' || who === 'link-adult' ? 'Your full legal name'
    : who === 'adult-handoff' ? `${p.firstName}, type your full legal name`
    : 'Parent or guardian: your full legal name'

  return (
    <Overlay onClose={skippable ? onSkip : undefined}>
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-white/10 bg-black/60 flex-shrink-0">
        <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-wider">
          <FileSignature className="w-4 h-4" />
          Document {docIndex + 1} of {p.docs.length}{queueLength > 1 ? ` · ${queueLength} people to sign` : ''}
        </div>
        <h2 className="mt-1 text-lg sm:text-2xl font-black text-white leading-tight">{doc.shortName}</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          For <span className="text-white font-semibold">{p.name}</span>
          {forMinor && <span className="ml-2 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-300 align-middle">UNDER 18 · PARENT/GUARDIAN SIGNS</span>}
        </p>
        {REASON_TEXT[doc.reason] && <p className="mt-2 text-xs text-amber-300">{REASON_TEXT[doc.reason]}</p>}
      </div>

      {/* Document + signing form (one scroll area, works on phones) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-4 sm:p-6">
          <LegalDocument
            body={doc.body}
            initials={state.initials}
            onInitial={(k, v) => update({ initials: { ...state.initials, [k]: v } })}
          />
          <div ref={endRef} className="h-1" />
        </div>

        <div className="p-4 sm:p-6 border-t border-white/10 bg-zinc-900/80 space-y-5">
          {!state.reachedEnd && (
            <p className="flex items-center gap-2 text-sm text-amber-300">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" /> Scroll through the whole document to continue.
            </p>
          )}

          {initialKeys.length > 0 && (
            <p className={`text-xs font-semibold ${initialsDone === initialKeys.length ? 'text-green-400' : 'text-zinc-400'}`}>
              Initials: {initialsDone} of {initialKeys.length}
            </p>
          )}

          <fieldset disabled={!state.reachedEnd} className="space-y-3 disabled:opacity-40">
            {ackList.map(a => (
              <label key={a.key} htmlFor={`ack-${docIndex}-${a.key}`} className="flex items-start gap-3 cursor-pointer">
                <input
                  id={`ack-${docIndex}-${a.key}`}
                  type="checkbox"
                  checked={!!state.acks[a.key]}
                  onChange={e => update({ acks: { ...state.acks, [a.key]: e.target.checked } })}
                  className="mt-0.5 h-5 w-5 flex-shrink-0 accent-red-600"
                />
                <span className="text-sm text-zinc-200">{a.label}</span>
              </label>
            ))}

            {isMinorLiability && (
              <div>
                <label htmlFor="minor-ack-name" className="block text-sm font-semibold text-white mb-1.5">
                  {p.firstName}, type your name to confirm you got the concussion and cardiac information
                </label>
                <input
                  id="minor-ack-name"
                  type="text"
                  value={minorAckName}
                  onChange={e => setMinorAckName(e.target.value)}
                  placeholder={p.name}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="mt-1 text-[11px] text-zinc-500">A parent may type it for a young child.</p>
              </div>
            )}
          </fieldset>

          {isFirst ? (
            <fieldset disabled={!state.reachedEnd} className="space-y-4 disabled:opacity-40">
              {forMinor && (
                <div>
                  <span className="block text-sm font-semibold text-white mb-1.5">Your relationship to {p.firstName}</span>
                  <div className="flex gap-2">
                    {(['Parent', 'Legal Guardian'] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        id={`relationship-${r.replace(' ', '-').toLowerCase()}`}
                        onClick={() => setRelationship(r)}
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                          relationship === r ? 'border-red-500 bg-red-500/15 text-white' : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="signer-name" className="block text-sm font-semibold text-white mb-1.5">{signerLabel}</label>
                <input
                  id="signer-name"
                  type="text"
                  autoComplete="name"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  placeholder={forMinor ? 'First and last name' : p.name}
                  aria-invalid={nameMismatch}
                  aria-describedby={nameMismatch ? 'signer-name-hint' : undefined}
                  className={`w-full rounded-xl border bg-black/60 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-red-500 ${nameMismatch ? 'border-amber-500/70' : 'border-white/10'}`}
                />
                {nameMismatch && (
                  <p id="signer-name-hint" className="mt-1.5 text-xs font-medium text-amber-300">
                    This must be {p.name}&apos;s own legal name. Only {p.firstName} can sign their waiver.
                  </p>
                )}
              </div>

              <SignaturePad onChange={setSignature} initial={signature} />
            </fieldset>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs text-zinc-400 mb-2">Signing as <span className="text-white font-semibold">{signerName}</span>{relationship && relationship !== 'Self' ? ` (${relationship})` : ''} with the signature you drew:</p>
              {signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signature} alt="Your signature" className="h-20 rounded-lg bg-white object-contain" />
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300">{error}</p>
          )}

          {!ready && state.reachedEnd && (
            <p id="waiver-todo" className="text-xs text-zinc-400 sm:text-right">
              To continue: {todo.join(', ')}.
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pb-2">
            <div className="flex items-center gap-5">
              {!isFirst && (
                <button type="button" id="waiver-back" onClick={back} disabled={submitting} className="text-sm font-semibold text-zinc-300 hover:text-white disabled:opacity-40">
                  ← Back
                </button>
              )}
              {skippable && (
                <button type="button" id="waiver-not-now" onClick={onSkip} className="text-sm font-semibold text-zinc-400 hover:text-white">
                  Not now
                </button>
              )}
            </div>
            <button
              type="button"
              id={isLast ? 'waiver-submit' : 'waiver-next'}
              onClick={next}
              disabled={!ready || submitting}
              className={`flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold transition-all ${
                ready && !submitting
                  ? 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-[0_0_20px_-5px_rgba(220,38,38,0.6)]'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Saving…' : isLast ? (isFirst ? 'I Agree & Sign' : 'Adopt Signature & Sign') : `I Agree · Next: ${p.docs[docIndex + 1].shortName}`}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function HandoffIntro({
  participant: p,
  minorAccount,
  skippable,
  onContinue,
  onSkip,
  sendLinkAction,
}: {
  participant: PendingParticipant
  minorAccount: boolean
  skippable: boolean
  onContinue: () => void
  onSkip: () => void
  sendLinkAction?: (participantId: string, email: string) => Promise<ActionResult>
}) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sendLinkAction) return
    setSending(true)
    setResult(null)
    try {
      setResult(await sendLinkAction(p.participantId, email.trim()))
    } catch {
      setResult({ ok: false, error: 'Could not send the link. Try again.' })
    }
    setSending(false)
  }

  return (
    <div className="p-6 sm:p-8 overflow-y-auto">
      <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
        <FileSignature className="w-6 h-6 text-red-500" />
      </div>
      <h2 className="text-xl sm:text-2xl font-black text-white">
        {minorAccount ? `A parent or guardian needs to sign for ${p.firstName}` : `${p.firstName} needs to sign their own waiver`}
      </h2>
      <p className="mt-2 text-sm text-zinc-400">
        {minorAccount
          ? `${p.name} is under 18, so California law requires a parent or legal guardian to sign.`
          : `${p.name} is 18 or older. An adult has to sign their own waiver. Nobody else can sign it for them.`}
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          id="handoff-continue"
          onClick={onContinue}
          className="w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10 transition-colors"
        >
          <Smartphone className="w-6 h-6 text-red-500 flex-shrink-0" />
          <span>
            <span className="block font-bold text-white">{minorAccount ? 'My parent or guardian is here' : `I'm ${p.firstName}. Sign on this device`}</span>
            <span className="block text-xs text-zinc-400">{minorAccount ? 'Hand them this phone to read and sign.' : 'Hand them this phone to read and sign.'}</span>
          </span>
        </button>

        {sendLinkAction && (
          <form onSubmit={send} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <label htmlFor="handoff-email" className="flex items-center gap-3 mb-3">
              <Mail className="w-6 h-6 text-red-500 flex-shrink-0" />
              <span>
                <span className="block font-bold text-white">{minorAccount ? 'Email a parent or guardian a link' : `Email ${p.firstName} a link`}</span>
                <span className="block text-xs text-zinc-400">They can sign on their own phone. The link works for 7 days.</span>
              </span>
            </label>
            <div className="flex gap-2">
              <input
                id="handoff-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-base text-white outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                id="handoff-send"
                disabled={sending || !email.trim()}
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-zinc-200 disabled:opacity-50"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />} Send
              </button>
            </div>
            {result && (
              <p className={`mt-2 text-sm font-medium ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                {result.ok ? result.message : result.error}
              </p>
            )}
          </form>
        )}
      </div>

      {skippable && (
        <button type="button" id="handoff-not-now" onClick={onSkip} className="mt-6 text-sm font-semibold text-zinc-400 hover:text-white">
          {result?.ok ? 'Done' : 'Not now'}
        </button>
      )}
    </div>
  )
}

function noopSubscribe() {
  return () => {}
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-stretch sm:items-center justify-center sm:p-6">
      <div role="dialog" aria-modal="true" className="relative bg-zinc-950 sm:border border-white/10 sm:rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[92vh] overflow-hidden">
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 z-10 text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
