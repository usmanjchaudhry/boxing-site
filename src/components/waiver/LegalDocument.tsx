import { Fragment, type ReactNode } from 'react'
import { initialsValid } from '@/utils/name-match'

/**
 * Renders a waiver body (see src/legal/waiver-documents.ts for the format)
 * with real headings, lists and bold text. Clear, conspicuous formatting is
 * part of what makes a waiver enforceable in California.
 *
 * In signing mode, [[initial:key]] markers become initial boxes. In read-only
 * mode (signed copies) they show what the signer initialed.
 */
export default function LegalDocument({
  body,
  initials = {},
  onInitial,
  readOnly = false,
  hideTitle = false,
  guardian = false,
}: {
  body: string
  initials?: Record<string, string>
  onInitial?: (key: string, value: string) => void
  readOnly?: boolean
  hideTitle?: boolean
  /** A parent/guardian is signing for a minor: the initial boxes say so. */
  guardian?: boolean
}) {
  const blocks = body.replace(/\r\n/g, '\n').split(/\n\s*\n/)

  return (
    <div className="legal-doc text-[15px] leading-relaxed text-zinc-200 space-y-4">
      {blocks.map((block, i) => {
        const text = block.trim()
        if (!text) return null

        if (text.startsWith('# ')) {
          if (hideTitle) return null
          return <h2 key={i} className="text-xl sm:text-2xl font-black text-white leading-tight">{inline(text.slice(2))}</h2>
        }
        if (text.startsWith('## ')) {
          return <h3 key={i} className="pt-3 text-base sm:text-lg font-extrabold text-white border-t border-white/10">{inline(text.slice(3))}</h3>
        }

        const initialMatch = /^\[\[initial:([a-z_]+)\]\]$/.exec(text)
        if (initialMatch) {
          const k = initialMatch[1]
          const value = initials[k] ?? ''
          if (readOnly) {
            return (
              <p key={i} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm">
                <span className="text-zinc-400">Initialed:</span>
                <span className="font-bold text-white">{value || '—'}</span>
              </p>
            )
          }
          const done = initialsValid(value)
          const invalid = !done && value.trim().length > 0
          return (
            <label
              key={i}
              htmlFor={`initial-${k}`}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                done ? 'border-green-500/40 bg-green-500/10' : 'border-amber-500/50 bg-amber-500/10'
              }`}
            >
              <span className={`text-sm font-semibold ${done ? 'text-green-300' : 'text-amber-200'}`}>
                {done ? '✓ Initialed' : invalid ? 'Use letters for your initials (for example "JD")' : guardian ? 'Parent/guardian: initial here to confirm you read and agree to the section above' : 'Initial here to confirm you read and agree to the section above'}
              </span>
              <input
                id={`initial-${k}`}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={6}
                value={value}
                onChange={e => onInitial?.(k, e.target.value.toUpperCase())}
                placeholder="AB"
                aria-label={guardian ? 'Parent or guardian initials' : 'Your initials'}
                className="w-20 rounded-lg border border-white/20 bg-black/60 px-2 py-2 text-center text-base font-bold uppercase tracking-widest text-white outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>
          )
        }

        // A block can mix a lead-in line with bullet lines
        const lines = text.split('\n')
        const parts: ReactNode[] = []
        let bullets: string[] = []
        let para: string[] = []
        const flushBullets = () => {
          if (bullets.length) {
            parts.push(
              <ul key={`u${parts.length}`} className="list-disc pl-5 space-y-1.5 marker:text-red-500">
                {bullets.map((b, j) => <li key={j}>{inline(b)}</li>)}
              </ul>
            )
            bullets = []
          }
        }
        const flushPara = () => {
          if (para.length) {
            parts.push(<p key={`p${parts.length}`}>{inline(para.join(' '))}</p>)
            para = []
          }
        }
        for (const line of lines) {
          if (line.trim().startsWith('- ')) {
            flushPara()
            bullets.push(line.trim().slice(2))
          } else {
            flushBullets()
            para.push(line.trim())
          }
        }
        flushPara()
        flushBullets()
        return <Fragment key={i}>{parts}</Fragment>
      })}
    </div>
  )
}

/** **bold** → <strong>. Bold uppercase paragraphs are the "conspicuous" release language. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-extrabold text-white">{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>
  )
}
