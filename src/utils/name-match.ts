/**
 * Name matching shared by the browser (instant feedback) and the server
 * (the real check), so an adult's typed signature name always matches the
 * person the waiver is for.
 */

export function normalizeName(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** True when a typed name includes the profile's first and last name. */
export function nameMatches(typed: string, first: string | null, last: string | null): boolean {
  const t = ` ${normalizeName(typed)} `
  const parts = [first, last].map(x => normalizeName(x ?? '')).filter(Boolean)
  return parts.length > 0 && parts.every(p => t.includes(` ${p} `) || p.split(' ').every(w => t.includes(` ${w} `)))
}

/**
 * Initials rule, shared by the browser and the server so they always agree.
 * 1–6 characters, at least one letter. Letters in any language (Ñ, É…),
 * digits, periods, hyphens, apostrophes and spaces are allowed.
 */
export function initialsValid(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return v.length >= 1 && v.length <= 6 && /^[\p{L}\p{M}\p{N}.'’\- ]+$/u.test(v) && /\p{L}/u.test(v)
}
