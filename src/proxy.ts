import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { isProductionHost } from '@/utils/site'

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  // Keep the dev site (lafamiliashowtimeboxing.dev), previews, and localhost
  // out of search results. Only the real .com domain is indexable.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!isProductionHost(host)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
