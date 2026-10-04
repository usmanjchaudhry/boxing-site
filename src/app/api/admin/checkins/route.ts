import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'
import { DEFAULT_TIMEZONE, daysBetween, isDateString, localDateString } from '@/utils/timezone'
import {
  listCheckins, MAX_PAGE_SIZE, MAX_RANGE_DAYS,
  type AccessFilter, type ResultFilter,
} from '@/utils/checkin-log'

const RESULTS: ResultFilter[] = ['all', 'allowed', 'denied']
const ACCESS: AccessFilter[] = ['all', 'membership', 'day_pass']

/**
 * GET /api/admin/checkins — staff + admin
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD   facility-local dates, inclusive (default: today)
 * &result=all|allowed|denied  &access=all|membership|day_pass  &q=name
 * &offset=0&limit=50
 */
export async function GET(request: NextRequest) {
  const staff = await getStaffProfile('staff')
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const db = getServiceClient()
  const { data: facility } = await db.from('facilities').select('timezone').limit(1).maybeSingle()
  const timeZone = facility?.timezone || DEFAULT_TIMEZONE
  const today = localDateString(new Date(), timeZone)

  const sp = request.nextUrl.searchParams
  const from = sp.get('from') || today
  const to = sp.get('to') || from
  if (!isDateString(from) || !isDateString(to)) {
    return NextResponse.json({ error: 'Dates must be YYYY-MM-DD.' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'Start date must be on or before end date.' }, { status: 400 })
  }
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Pick a range of ${MAX_RANGE_DAYS} days or less.` }, { status: 400 })
  }

  const result = (RESULTS as string[]).includes(sp.get('result') ?? '') ? (sp.get('result') as ResultFilter) : 'all'
  const access = (ACCESS as string[]).includes(sp.get('access') ?? '') ? (sp.get('access') as AccessFilter) : 'all'
  const q = (sp.get('q') ?? '').slice(0, 80)
  const offset = Math.max(0, Math.floor(Number(sp.get('offset')) || 0))
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(sp.get('limit')) || 50)))

  try {
    const data = await listCheckins(db, { from, to, result, access, q, offset, limit }, timeZone)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[admin/checkins]', err)
    return NextResponse.json({ error: 'Could not load check-ins.' }, { status: 500 })
  }
}
