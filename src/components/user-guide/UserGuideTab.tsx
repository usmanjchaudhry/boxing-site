'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen, Search, X, ChevronDown, ArrowRight, ExternalLink, Lightbulb, AlertTriangle, Info,
  Eye, EyeOff, Copy, Check, ShieldCheck, ScanLine, Snowflake, UserPlus, Users, KeyRound,
} from 'lucide-react'
import { tabsForRole, type AdminTab, type StaffRole } from '@/app/admin/admin-tabs'
import { classify, type CheckinTone } from '@/utils/checkin-feedback'
import type { GuideFacts } from '@/utils/user-guide-facts'
import { buildGuide, SCAN_RESULTS, type GuideBlock, type GuideLink, type GuideSection, type GuideStep } from './guide-content'

/**
 * Staff/admin User's Guide tab.
 *
 * Big tappable topics that open into numbered steps. On-screen words that
 * staff must tap are shown as button-style labels. Search finds a topic by
 * any word in it. Built for people who are not technical.
 */

interface Props {
  role: StaffRole
  facts: GuideFacts
  onNavigate: (tab: AdminTab) => void
}

/** Shortcuts for the most common jobs. */
const QUICK_TOPICS: { id: string; label: string; icon: typeof ScanLine }[] = [
  { id: 'check-in', label: 'Check someone in', icon: ScanLine },
  { id: 'sign-up', label: 'Sign up a customer', icon: UserPlus },
  { id: 'family', label: 'Family members', icon: Users },
  { id: 'freeze', label: 'Freeze a membership', icon: Snowflake },
  { id: 'legacy', label: 'Legacy plan (old gym)', icon: KeyRound },
]

export default function UserGuideTab({ role, facts, onNavigate }: Props) {
  const sections = useMemo(() => buildGuide(role, facts), [role, facts])
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return sections
    return sections.filter(s => {
      const haystack = searchableText(s)
      return words.every(w => haystack.includes(w))
    })
  }, [sections, query])

  const open = (id: string) => {
    setOpenId(id)
    setQuery('')
    // Wait for the section to render open, then bring it into view
    requestAnimationFrame(() =>
      document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }

  const toggle = (id: string) => (openId === id ? setOpenId(null) : open(id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-red-600/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
              <BookOpen className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">User&apos;s Guide</h2>
              <p className="mt-1 text-sm sm:text-base text-zinc-400">Step-by-step help for the front desk. Tap a topic to open it.</p>
            </div>
          </div>
          <span className={`inline-flex w-max items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
            role === 'admin' ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
          }`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Guides for {role === 'admin' ? 'Admins' : 'Staff'}
          </span>
        </div>

        {/* Search */}
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            id="guide-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="What do you need help with? Try “freeze” or “family”"
            aria-label="Search the guide"
            className="w-full rounded-2xl border border-white/10 bg-black/60 py-3.5 pl-12 pr-12 text-base text-white placeholder:text-zinc-600 outline-none transition focus:border-transparent focus:ring-2 focus:ring-red-500"
          />
          {query && (
            <button
              id="guide-search-clear"
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Quick topics */}
        {!query && (
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_TOPICS.filter(t => sections.some(s => s.id === t.id)).map(t => (
              <button
                key={t.id}
                id={`guide-quick-${t.id}`}
                type="button"
                onClick={() => open(t.id)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-zinc-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-white active:scale-95"
              >
                <t.icon className="h-4 w-4 text-red-400" />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Topics */}
      {visible.length === 0 ? (
        <div className="rounded-3xl border border-white/5 bg-zinc-950 p-10 text-center">
          <p className="text-lg font-bold">Nothing matches &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-sm text-zinc-500">Try a simpler word, like &ldquo;scan&rdquo;, &ldquo;pass&rdquo;, or &ldquo;waiver&rdquo;.</p>
          <button
            id="guide-empty-clear"
            type="button"
            onClick={() => setQuery('')}
            className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-zinc-200"
          >
            Show all topics
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(section => (
            <TopicCard
              key={section.id}
              section={section}
              // While searching, open every match so the answer is right there
              isOpen={openId === section.id || (query.length > 1 && visible.length <= 2)}
              onToggle={() => toggle(section.id)}
            >
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} role={role} facts={facts} onNavigate={onNavigate} />
              ))}
            </TopicCard>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * Topic card (accordion)
 * ──────────────────────────────────────────────────────────── */
function TopicCard({ section, isOpen, onToggle, children }: {
  section: GuideSection
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const Icon = section.icon
  return (
    <section
      id={`guide-${section.id}`}
      className={`scroll-mt-24 overflow-hidden rounded-3xl border transition-colors ${
        isOpen ? 'border-white/15 bg-zinc-950' : 'border-white/5 bg-zinc-950 hover:border-white/10'
      }`}
    >
      <h3>
        <button
          id={`guide-toggle-${section.id}`}
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`guide-body-${section.id}`}
          className="flex w-full items-center gap-4 p-5 sm:p-6 text-left"
        >
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-colors ${
            isOpen ? 'border-red-500/40 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/5 text-zinc-300'
          }`}>
            <Icon className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base sm:text-lg font-bold text-white">{section.title}</span>
              {section.adminOnly && (
                <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  Admin only
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-sm text-zinc-500">{section.summary}</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-white' : ''}`} />
        </button>
      </h3>

      {isOpen && (
        <div id={`guide-body-${section.id}`} role="region" aria-labelledby={`guide-toggle-${section.id}`} className="animate-reveal space-y-6 border-t border-white/5 px-5 pb-6 pt-5 sm:px-6 sm:pl-[5.5rem]">
          {children}
        </div>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────
 * Blocks
 * ──────────────────────────────────────────────────────────── */
function Block({ block, role, facts, onNavigate }: { block: GuideBlock; role: StaffRole; facts: GuideFacts; onNavigate: (tab: AdminTab) => void }) {
  switch (block.type) {
    case 'text':
      return <p className="text-[15px] leading-relaxed text-zinc-300"><Rich text={block.text} /></p>
    case 'steps':
      return <Steps title={block.title} steps={block.steps} onNavigate={onNavigate} />
    case 'note':
      return <Note tone={block.tone} text={block.text} />
    case 'tabs':
      return <TabsTable role={role} onNavigate={onNavigate} />
    case 'scanResults':
      return <ScanResults />
    case 'prices':
      return <Prices facts={facts} />
    case 'legacyCode':
      return <LegacyCode facts={facts} />
    case 'faq':
      return (
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5">
          {block.items.map((item, i) => (
            <details key={i} className="group bg-black/30 open:bg-white/[0.03]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-semibold text-zinc-200 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 text-sm leading-relaxed text-zinc-400"><Rich text={item.a} /></p>
            </details>
          ))}
        </div>
      )
  }
}

function Steps({ title, steps, onNavigate }: { title?: string; steps: GuideStep[]; onNavigate: (tab: AdminTab) => void }) {
  return (
    <div>
      {title && <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">{title}</h4>}
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-black">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[15px] leading-relaxed text-zinc-100"><Rich text={step.text} /></p>
              {step.detail && step.detail.split('\n').map((line, j) => (
                <p key={j} className="mt-1 text-sm leading-relaxed text-zinc-500"><Rich text={line} /></p>
              ))}
              {step.link && <StepLink link={step.link} onNavigate={onNavigate} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StepLink({ link, onNavigate }: { link: GuideLink; onNavigate: (tab: AdminTab) => void }) {
  const cls = 'mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 hover:text-white active:scale-95'
  if (link.tab) {
    const tab = link.tab
    return (
      <button type="button" onClick={() => onNavigate(tab)} className={cls}>
        {link.label} <ArrowRight className="h-3.5 w-3.5" />
      </button>
    )
  }
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {link.label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}

const NOTE_STYLES = {
  tip: { box: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100', icon: 'text-emerald-400', Icon: Lightbulb, label: 'Tip' },
  warning: { box: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-100', icon: 'text-amber-400', Icon: AlertTriangle, label: 'Careful' },
  info: { box: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-100', icon: 'text-sky-400', Icon: Info, label: 'Good to know' },
} as const

function Note({ tone, text }: { tone: keyof typeof NOTE_STYLES; text: string }) {
  const s = NOTE_STYLES[tone]
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${s.box}`}>
      <s.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.icon}`} />
      <p className="text-sm leading-relaxed">
        <span className={`mr-1 font-bold ${s.icon}`}>{s.label}:</span>
        <Rich text={text} />
      </p>
    </div>
  )
}

function TabsTable({ role, onNavigate }: { role: StaffRole; onNavigate: (tab: AdminTab) => void }) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">What each tab is for</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {tabsForRole(role).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            disabled={tab.id === 'guide'}
            className="group flex items-start gap-3 rounded-2xl border border-white/5 bg-black/40 p-3.5 text-left transition hover:border-white/15 hover:bg-white/[0.04] disabled:cursor-default disabled:hover:border-white/5 disabled:hover:bg-black/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300">
              <tab.icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-bold text-white">
                {tab.label}
                {tab.adminOnly && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Admin</span>}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{tab.purpose}</span>
            </span>
            {tab.id !== 'guide' && <ArrowRight className="mt-2.5 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-white" />}
          </button>
        ))}
      </div>
    </div>
  )
}

const TONE_UI: Record<CheckinTone, { dot: string; pill: string; word: string }> = {
  success: { dot: 'bg-emerald-400', pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', word: 'Green' },
  warning: { dot: 'bg-amber-400', pill: 'border-amber-500/30 bg-amber-500/10 text-amber-300', word: 'Yellow' },
  error: { dot: 'bg-red-400', pill: 'border-red-500/30 bg-red-500/10 text-red-300', word: 'Red' },
}

function ScanResults() {
  return (
    <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-black/30">
      {SCAN_RESULTS.map(r => {
        const { tone, staffAction } = classify(r)
        const ui = TONE_UI[tone]
        return (
          <li key={r.flag} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
            <span className={`inline-flex w-max shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1 text-xs font-bold sm:w-48 ${ui.pill}`}>
              <span className={`h-2 w-2 rounded-full ${ui.dot}`} aria-hidden />
              <span className="sr-only">{ui.word}: </span>
              {r.flag}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">{r.meaning}</p>
              {(r.action ?? staffAction) && (
                <p className="mt-0.5 text-sm text-zinc-500">
                  <span className="font-semibold text-zinc-400">What to do: </span>{r.action ?? staffAction}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Prices({ facts }: { facts: GuideFacts }) {
  if (facts.plans.length === 0 && !facts.dayPass) return null
  return (
    <div>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">Prices right now</h4>
      <div className="grid gap-2 sm:grid-cols-3">
        {facts.plans.map(p => (
          <div key={p.name} className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <p className="text-sm font-bold text-white">{p.name}</p>
            <p className="mt-1 text-2xl font-black text-white">{p.price}<span className="text-xs font-medium text-zinc-500"> /month</span></p>
            <p className="mt-1 text-xs text-zinc-500">
              {p.individual
                ? 'Just the account holder.'
                : p.peoplePerDay ? `Account holder + family, up to ${p.peoplePerDay} people a day.` : 'Account holder + family.'}
            </p>
          </div>
        ))}
        {facts.dayPass && (
          <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
            <p className="text-sm font-bold text-white">{facts.dayPass.name}</p>
            <p className="mt-1 text-2xl font-black text-white">{facts.dayPass.price}<span className="text-xs font-medium text-zinc-500"> /visit</span></p>
            <p className="mt-1 text-xs text-zinc-500">One visit. No membership needed.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LegacyCode({ facts }: { facts: GuideFacts }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!facts.legacy) {
    return <Note tone="warning" text="The Legacy plan isn’t set up right now. Ask the owner." />
  }
  const { code } = facts.legacy

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShown(true) // clipboard blocked: show it so they can type it
    }
  }

  return (
    <div className="rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-950/40 to-black p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-red-300">Access code</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code
          id="guide-legacy-code"
          className="min-w-0 flex-1 select-all rounded-xl border border-white/10 bg-black/60 px-4 py-3 font-mono text-lg tracking-wider text-white"
          aria-label={shown ? 'Legacy access code' : 'Legacy access code (hidden)'}
        >
          {shown ? code : '•'.repeat(code.length)}
        </code>
        <button
          id="guide-legacy-toggle"
          type="button"
          onClick={() => setShown(s => !s)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm font-bold text-zinc-200 hover:bg-white/10"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {shown ? 'Hide' : 'Show'}
        </button>
        <button
          id="guide-legacy-copy"
          type="button"
          onClick={copy}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm font-bold transition active:scale-95 ${
            copied ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Capital letters and spaces at the ends don&apos;t matter.</p>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────── */

/** Renders **on-screen words** as button-style labels; everything else as plain text. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="mx-0.5 inline-block whitespace-nowrap rounded-md border border-white/15 bg-white/10 px-1.5 py-px text-[0.92em] font-semibold text-white">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

/** Everything a topic says, lower-cased, for search. */
function searchableText(s: GuideSection): string {
  const bits: string[] = [s.title, s.summary, s.keywords ?? '']
  for (const b of s.blocks) {
    if (b.type === 'text' || b.type === 'note') bits.push(b.text)
    if (b.type === 'steps') {
      bits.push(b.title ?? '')
      for (const st of b.steps) bits.push(st.text, st.detail ?? '')
    }
    if (b.type === 'faq') for (const it of b.items) bits.push(it.q, it.a)
    if (b.type === 'scanResults') for (const r of SCAN_RESULTS) bits.push(r.flag, r.meaning)
  }
  return bits.join(' ').replace(/\*\*/g, '').toLowerCase()
}
