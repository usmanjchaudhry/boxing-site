import { NextResponse } from 'next/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'
import { restoreMember, ArchiveError } from '@/utils/member-archive'

// POST /api/admin/members/[profileId]/restore — Undo an archive (brings back the
// people archived together with them and re-enables login). Admins only.
export async function POST(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const admin = await getStaffProfile('admin')
  if (!admin) return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })

  try {
    const result = await restoreMember(getServiceClient(), profileId)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    if (e instanceof ArchiveError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[restore] Unexpected error:', e)
    return NextResponse.json({ error: 'Could not restore this member.' }, { status: 500 })
  }
}

