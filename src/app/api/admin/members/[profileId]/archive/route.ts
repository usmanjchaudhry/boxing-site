import { NextResponse } from 'next/server'
import { getServiceClient, getStaffProfile } from '@/utils/auth/staff'
import { stripe } from '@/utils/stripe/server'
import { archiveMember, ArchiveError } from '@/utils/member-archive'

// POST /api/admin/members/[profileId]/archive — Archive a member (their whole
// household if they're the primary). Cancels card billing, blocks login and check-in,
// keeps their history. Admins only.
export async function POST(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const admin = await getStaffProfile('admin')
  if (!admin) return NextResponse.json({ error: 'Unauthorized — admin only' }, { status: 403 })

  try {
    const result = await archiveMember(getServiceClient(), stripe, profileId, admin.id)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    if (e instanceof ArchiveError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[archive] Unexpected error:', e)
    return NextResponse.json({ error: 'Could not archive this member.' }, { status: 500 })
  }
}

