'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCcw, Trash2, Search } from 'lucide-react'
import { matchesSearch } from '@/utils/name-search'

interface ArchivedMember {
  id: string
  name: string
  householdRole: string
  primaryName: string | null
  archivedAt: string | null
  planName: string
}

async function fetchArchived(): Promise<{ members: ArchivedMember[] } | { error: string }> {
  try {
    const res = await fetch('/api/admin/members?archived=1')
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Could not load archived members' }
    return { members: data.members ?? [] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load archived members' }
  }
}

/** Admin view of archived members: restore them, or permanently delete junk accounts. */
export default function ArchivedMembersPanel({ onChanged }: { onChanged: () => void }) {
  const [members, setMembers] = useState<ArchivedMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ArchivedMember | null>(null)

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchArchived>>) => {
    if ('error' in r) setError(r.error)
    else { setMembers(r.members); setError(null) }
  }, [])
  const load = useCallback(async () => apply(await fetchArchived()), [apply])

  useEffect(() => {
    let cancelled = false
    fetchArchived().then(r => { if (!cancelled) apply(r) })
    return () => { cancelled = true }
  }, [apply])

  const act = async (m: ArchivedMember, action: 'restore' | 'delete') => {
    setBusyId(m.id)
    setMessage(null)
    try {
      const res = action === 'restore'
        ? await fetch(`/api/admin/members/${m.id}/restore`, { method: 'POST' })
        : await fetch(`/api/admin/members/${m.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Could not ${action} this member`)
      const names: string[] = (action === 'restore' ? data.restored : data.deleted) ?? [m.name]
      const parts = [`${action === 'restore' ? 'Restored' : 'Permanently deleted'} ${names.join(', ')}.`]
      if (action === 'restore' && data.hadCardMembership) parts.push('Their card membership was cancelled when archived, so they need to sign up again.')
      if (data.warnings?.length) parts.push(...data.warnings)
      setMessage({ type: 'success', text: parts.join(' ') })
      setConfirmDelete(null)
      await load()
      onChanged()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Something went wrong' })
      setConfirmDelete(null)
    } finally {
      setBusyId(null)
    }
  }

  const visible = (members ?? []).filter(m => matchesSearch(search, m.name, m.primaryName))

  return (
    <div>
      <div className="px-4 sm:px-6 py-3 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Archived people can&apos;t log in or check in. Their waivers, check-ins and payments are kept.
          {members ? ` ${members.length} archived.` : ''}
        </p>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            id="archived-search"
            type="search"
            placeholder="Search archived..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {message && (
        <p className={`px-4 sm:px-6 py-3 text-sm border-b border-white/5 ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-4 sm:px-6 py-3 font-semibold">Name</th>
              <th className="text-left px-4 sm:px-6 py-3 font-semibold hidden sm:table-cell">Archived</th>
              <th className="text-left px-4 sm:px-6 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr><td colSpan={3} className="px-6 py-8 text-center text-red-400">{error}</td></tr>
            ) : !members ? (
              <tr><td colSpan={3} className="px-6 py-16 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-red-500 mx-auto" />
              </td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={3} className="px-6 py-8 text-center text-zinc-600">{members.length ? 'No archived members match.' : 'No archived members.'}</td></tr>
            ) : visible.map(m => (
              <tr key={m.id} className="border-b border-white/5">
                <td className="px-4 sm:px-6 py-3">
                  <p className="font-medium text-zinc-300">{m.name}</p>
                  <p className="text-xs text-zinc-500">
                    {m.householdRole}{m.primaryName ? ` of ${m.primaryName}` : ''}
                  </p>
                </td>
                <td className="px-4 sm:px-6 py-3 text-xs text-zinc-500 hidden sm:table-cell">
                  {m.archivedAt ? new Date(m.archivedAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 sm:px-6 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      id={`restore-${m.id}`}
                      onClick={() => act(m, 'restore')}
                      disabled={busyId === m.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-bold rounded"
                    >
                      {busyId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Restore
                    </button>
                    <button
                      id={`delete-${m.id}`}
                      onClick={() => setConfirmDelete(m)}
                      disabled={busyId === m.id}
                      title="Only for accounts that never used the gym (no check-ins or payments)"
                      className="inline-flex items-center gap-1 px-2 py-1 text-red-400 hover:text-white hover:bg-red-600 disabled:opacity-50 text-xs font-bold rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete permanently
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 id="delete-title" className="text-xl font-black text-white mb-2">Permanently delete {confirmDelete.name}?</h3>
            <p className="text-sm text-zinc-400 mb-6">
              {confirmDelete.householdRole === 'Primary' ? 'Their whole household, login and waivers' : 'Their profile, login and waivers'} will be erased. This can&apos;t be undone.
              It only works for accounts that never used the gym. Anyone with check-ins or payments stays archived.
            </p>
            <div className="flex flex-col gap-3">
              <button
                id="delete-confirm"
                onClick={() => act(confirmDelete, 'delete')}
                disabled={busyId === confirmDelete.id}
                className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {busyId === confirmDelete.id && <Loader2 className="w-4 h-4 animate-spin" />}
                {busyId === confirmDelete.id ? 'Deleting...' : 'Yes, delete forever'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busyId === confirmDelete.id}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors border border-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

