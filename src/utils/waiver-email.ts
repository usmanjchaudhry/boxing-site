import { sendGymEmail } from '@/utils/email'
import type { CurrentTemplate } from '@/utils/waivers'

/**
 * Emails for the waiver system: the signing link, and a copy of what was
 * signed. California's e-signature law expects the signer to be able to keep
 * a copy, so the full text is included in the confirmation email.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Converts the simple waiver format to email-safe HTML. */
export function waiverBodyToHtml(body: string, initials: Record<string, string> = {}): string {
  const inline = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return body.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(block => {
    const text = block.trim()
    if (!text) return ''
    if (text.startsWith('# ')) return `<h2 style="color:#fff;font-size:18px;margin:16px 0 8px">${inline(text.slice(2))}</h2>`
    if (text.startsWith('## ')) return `<h3 style="color:#fff;font-size:15px;margin:16px 0 6px">${inline(text.slice(3))}</h3>`
    const m = /^\[\[initial:([a-z_]+)\]\]$/.exec(text)
    if (m) return `<p style="color:#aaa;font-size:12px;margin:4px 0 12px">Initialed: <strong style="color:#fff">${esc(initials[m[1]] ?? '')}</strong></p>`
    const lines = text.split('\n')
    let html = ''
    let list: string[] = []
    const flush = () => { if (list.length) { html += `<ul style="color:#ccc;font-size:13px;line-height:1.5;padding-left:18px">${list.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`; list = [] } }
    for (const line of lines) {
      if (line.trim().startsWith('- ')) list.push(line.trim().slice(2))
      else { flush(); html += `<p style="color:#ccc;font-size:13px;line-height:1.5;margin:0 0 10px">${inline(line.trim())}</p>` }
    }
    flush()
    return html
  }).join('')
}

export async function sendSigningLinkEmail(opts: { to: string; participantName: string; isMinor: boolean; link: string; requestedBy: string }) {
  const who = opts.isMinor
    ? `${esc(opts.requestedBy)} asked you, as a parent or guardian, to sign the La Familia Showtime Boxing Club waiver for <strong>${esc(opts.participantName)}</strong>.`
    : `${esc(opts.requestedBy)} added you to their household at La Familia Showtime Boxing Club. Before you can train, you need to sign your own waiver.`
  await sendGymEmail(
    opts.to,
    opts.isMinor ? `Please sign ${opts.participantName}'s waiver` : 'Please sign your gym waiver',
    `
      <p style="color:#ddd;font-size:14px;line-height:1.6">${who}</p>
      <p style="color:#ddd;font-size:14px;line-height:1.6">It takes about 3 minutes. The link works for 7 days.</p>
      <p style="margin:24px 0"><a href="${esc(opts.link)}" style="background:#dc2626;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Read &amp; sign the waiver</a></p>
      <p style="color:#777;font-size:12px">If you weren't expecting this, you can ignore it.</p>
    `
  )
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'production') {
    console.log(`[waivers] RESEND_API_KEY not set. Signing link for ${opts.to}: ${opts.link}`)
  }
}

export async function sendSignedCopyEmail(opts: {
  to: string
  participantName: string
  signerName: string
  signedAt: Date
  documents: { template: CurrentTemplate; initials: Record<string, string> }[]
  viewUrls?: string[]
}) {
  const when = opts.signedAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short' })
  const links = opts.viewUrls?.length
    ? `<p style="color:#ddd;font-size:14px">You can view or print the signed copy any time:</p><ul>${opts.viewUrls.map((u, i) => `<li><a href="${esc(u)}" style="color:#f87171">${esc(opts.documents[i]?.template.doc.shortName ?? 'Signed document')}</a></li>`).join('')}</ul>`
    : ''
  const docs = opts.documents.map(d => `
    <div style="border-top:1px solid #333;margin-top:24px;padding-top:8px">
      ${waiverBodyToHtml(d.template.doc.body, d.initials)}
      <p style="color:#888;font-size:12px">Version ${esc(d.template.doc.version)} · Document fingerprint (SHA-256): ${esc(d.template.hash)}</p>
    </div>`).join('')

  await sendGymEmail(
    opts.to,
    `Your signed waiver for ${opts.participantName}`,
    `
      <p style="color:#ddd;font-size:14px;line-height:1.6"><strong>${esc(opts.signerName)}</strong> signed the following for <strong>${esc(opts.participantName)}</strong> on ${esc(when)} (Pacific Time). Keep this email for your records.</p>
      ${links}
      ${docs}
    `
  )
}
