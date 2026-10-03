import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'
import { extractProfileId, type CheckinMethod } from '@/utils/checkin-code'
import { processCheckin } from '@/utils/checkin-service'

const METHODS: CheckinMethod[] = ['qr_scanner', 'front_desk_manual']

/**
 * POST /api/checkin  — staff/admin only
 * Body: { code: string, method?: 'qr_scanner' | 'front_desk_manual' }
 *
 * POST (not GET) because a check-in has side effects: it writes a log row
 * and can consume a day pass. GETs can be prefetched, cached, or replayed.
 */
export async function POST(request: NextRequest) {
  const staff = await getStaffProfile('staff')
  if (!staff) {
    return NextResponse.json(
      { status: 'error', flag: 'Unauthorized', message: 'Sign in with a staff account to check members in.' },
      { status: 401 }
    )
  }

  let body: { code?: unknown; method?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'error', flag: 'Bad Request', message: 'Invalid request body.' }, { status: 400 })
  }

  const profileId = extractProfileId(typeof body.code === 'string' ? body.code : null)
  if (!profileId) {
    return NextResponse.json(
      { status: 'error', flag: 'Unreadable Code', message: "That code isn't a La Familia member QR code." },
      { status: 400 }
    )
  }

  const method: CheckinMethod = METHODS.includes(body.method as CheckinMethod)
    ? (body.method as CheckinMethod)
    : 'qr_scanner'

  try {
    const { httpStatus, body: result } = await processCheckin(getServiceClient(), profileId, method)
    return NextResponse.json(result, { status: httpStatus })
  } catch (err: unknown) {
    console.error('[checkin] Unexpected error:', err)
    return NextResponse.json(
      { status: 'error', flag: 'System Error', message: 'Check-in failed. Please try again.' },
      { status: 500 }
    )
  }
}
