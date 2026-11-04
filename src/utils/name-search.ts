/** Lowercase and strip accents so "jose" finds "José". */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * True when every word of `query` appears somewhere in the given fields.
 * Word order and extra spaces don't matter, so "smith john" finds "John Smith".
 * An empty query matches everything.
 */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalize(fields.filter(Boolean).join(' '))
  return words.every(w => haystack.includes(w))
}

/** "First Last" without "null"/"undefined" or stray spaces when a part is missing. */
export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].map(s => (s ?? '').trim()).filter(Boolean).join(' ')
}
