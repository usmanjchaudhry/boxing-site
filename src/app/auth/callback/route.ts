import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as any
  const next = searchParams.get('next') ?? '/dashboard'

  // Collect cookies set during auth exchange
  const cookiesToSet: { name: string; value: string; options: any }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookies) {
          // Collect cookies — we'll attach them to the final response
          cookies.forEach(c => cookiesToSet.push(c))
        },
      },
    }
  )

  // Helper: create redirect with all auth cookies attached
  const makeRedirect = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`)
    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })
    return response
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return makeRedirect(next)
    }
    return makeRedirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return makeRedirect(type === 'recovery' ? '/reset-password' : next)
    }
    return makeRedirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  return makeRedirect('/login?error=Invalid reset link. Please request a new one.')
}
