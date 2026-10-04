'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ageFromDob, dobError, toIsoDob } from '@/utils/dob'

type Props = {
  /** Name of the hidden field submitted with the form (value: YYYY-MM-DD). */
  name: string
  label?: string
  required?: boolean
  /**
   * true  → the person filling the form (browser may offer their saved birthday)
   * false → someone else, e.g. a child; never autofill the parent's birthday
   */
  autofill?: boolean
  inputClassName: string
  labelClassName?: string
}

const digits = (v: string) => v.replace(/\D/g, '')

/**
 * Date of birth as three numeric text fields (Month / Day / Year).
 *
 * Why not <input type="date">: on mobile the native picker grabs today's date as
 * soon as it receives focus (including when an autofill jumps focus into it), has
 * no reliable way to clear it, and makes users scroll back decades. Separate
 * numeric fields are the pattern recommended for memorable dates (GOV.UK Design
 * System, Baymard): numeric keypad, autofill via bday-* tokens, no picker.
 */
export default function DateOfBirthInput({
  name,
  label = 'Date of Birth',
  required = false,
  autofill = true,
  inputClassName,
  labelClassName = 'block text-sm font-medium text-zinc-300',
}: Props) {
  const uid = useId()
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  const [touched, setTouched] = useState(false)

  const wrapRef = useRef<HTMLFieldSetElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)

  const iso = toIsoDob(month, day, year)
  const complete = month !== '' && day !== '' && year.length === 4
  const error = complete ? dobError(iso) : (touched && (month || day || year) ? 'Enter your full date of birth.' : null)
  const age = complete && !error ? ageFromDob(iso) : null

  // Feed the browser's built-in form validation so an invalid date blocks submit.
  useEffect(() => {
    yearRef.current?.setCustomValidity(complete && error ? error : (year && year.length < 4 ? 'Enter a 4-digit year.' : ''))
  }, [complete, error, year])

  // Clear when the parent form is reset (e.g. after adding a family member).
  useEffect(() => {
    const form = wrapRef.current?.closest('form')
    if (!form) return
    const onReset = () => { setMonth(''); setDay(''); setYear(''); setTouched(false) }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [])

  // Accept a whole date pasted (or autofilled) into any box: 04/27/1995, 4-27-1995, 1995-04-27
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim()
    const us = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(text)
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
    const parts = us ? [us[1], us[2], us[3]] : isoMatch ? [isoMatch[2], isoMatch[3], isoMatch[1]] : null
    if (!parts) return
    e.preventDefault()
    setMonth(parts[0].padStart(2, '0'))
    setDay(parts[1].padStart(2, '0'))
    setYear(parts[2])
    setTouched(true)
    yearRef.current?.focus()
  }

  // Backspace in an empty box goes back to the previous one.
  const handleBackspace = (e: React.KeyboardEvent<HTMLInputElement>, prev: 'month' | 'day') => {
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault()
      ;(prev === 'month' ? monthRef : dayRef).current?.focus()
    }
  }

  const pad = (v: string, set: (s: string) => void) => { if (v.length === 1 && v !== '0') set(v.padStart(2, '0')) }

  const msgId = `${uid}-msg`
  const box = `${inputClassName} text-center tabular-nums tracking-wider placeholder:text-zinc-600`
  const sub = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1'

  return (
    <fieldset ref={wrapRef} aria-describedby={msgId}>
      <legend className={labelClassName}>{label}</legend>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1.6fr] gap-2">
        <div>
          <label htmlFor={`${uid}-m`} className={sub}>Month</label>
          <input
            ref={monthRef}
            id={`${uid}-m`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="MM"
            enterKeyHint="next"
            autoComplete={autofill ? 'bday-month' : 'off'}
            required={required}
            aria-invalid={!!error}
            value={month}
            onPaste={handlePaste}
            onChange={e => {
              const v = digits(e.target.value).slice(0, 2)
              setMonth(v)
              // Advance once the month is unambiguous: "2"–"9" or two digits
              if (v.length === 2 || (v.length === 1 && Number(v) > 1)) dayRef.current?.focus()
            }}
            onBlur={() => pad(month, setMonth)}
            className={box}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-d`} className={sub}>Day</label>
          <input
            ref={dayRef}
            id={`${uid}-d`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="DD"
            enterKeyHint="next"
            autoComplete={autofill ? 'bday-day' : 'off'}
            required={required}
            aria-invalid={!!error}
            value={day}
            onPaste={handlePaste}
            onKeyDown={e => handleBackspace(e, 'month')}
            onChange={e => {
              const v = digits(e.target.value).slice(0, 2)
              setDay(v)
              if (v.length === 2 || (v.length === 1 && Number(v) > 3)) yearRef.current?.focus()
            }}
            onBlur={() => pad(day, setDay)}
            className={box}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-y`} className={sub}>Year</label>
          <input
            ref={yearRef}
            id={`${uid}-y`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="YYYY"
            enterKeyHint="next"
            autoComplete={autofill ? 'bday-year' : 'off'}
            required={required}
            aria-invalid={!!error}
            value={year}
            onPaste={handlePaste}
            onKeyDown={e => handleBackspace(e, 'day')}
            onChange={e => setYear(digits(e.target.value).slice(0, 4))}
            onBlur={() => setTouched(true)}
            className={box}
          />
        </div>
      </div>

      <input type="hidden" name={name} value={iso} />

      <p id={msgId} aria-live="polite" className="mt-1.5 min-h-[1rem] text-xs">
        {error ? (
          <span className="text-red-400">{error}</span>
        ) : age !== null ? (
          <span className="text-zinc-500">{age} {age === 1 ? 'year' : 'years'} old</span>
        ) : null}
      </p>
    </fieldset>
  )
}
