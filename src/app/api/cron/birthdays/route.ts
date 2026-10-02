import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGymEmail } from '@/utils/email'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://lafamiliashowtimeboxing.dev'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  if (process.env.NODE_ENV === 'development') return true
  return false
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function birthdayEmail(firstName: string) {
  return {
    subject: `Happy Birthday, ${firstName}! 🎂🥊`,
    html: `
      <h2 style="color: #fff; margin-bottom: 10px;">Happy Birthday ${firstName}!</h2>
      <p style="color: #aaa; line-height: 1.6;">
        From all of us at La Familia Showtime Boxing Club, we want to wish you a fantastic birthday!
      </p>
      <p style="color: #aaa; line-height: 1.6;">
        Another year older, another year stronger. Come celebrate with a great workout today.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${SITE_URL}/schedule" style="background-color: #dc2626; color: #fff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Book a Birthday Class →
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">
        Have a great one!
      </p>
    `
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const results = { sent: 0, errors: 0 }

  try {
    // We'll fetch all profiles with a DOB and filter for today's month/day in memory.
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('first_name, email, date_of_birth')
      .not('date_of_birth', 'is', null)

    if (error) throw error

    const today = new Date()
    // Using UTC date from string is better to avoid timezone offset issues
    // date_of_birth is returned as 'YYYY-MM-DD'
    const currentMonth = today.getMonth() + 1
    const currentDay = today.getDate()

    for (const profile of profiles || []) {
      if (!profile.date_of_birth || !profile.email) continue

      const [yearStr, monthStr, dayStr] = profile.date_of_birth.split('-')
      const dobMonth = parseInt(monthStr, 10)
      const dobDay = parseInt(dayStr, 10)

      if (dobMonth === currentMonth && dobDay === currentDay) {
        const email = birthdayEmail(profile.first_name)
        await sendGymEmail(profile.email, email.subject, email.html)
        results.sent++
      }
    }
  } catch (err: any) {
    console.error('Birthday cron error:', err)
    results.errors++
    return NextResponse.json({ error: err.message, results }, { status: 500 })
  }

  console.log('Birthday cron completed:', results)
  return NextResponse.json({
    message: 'Birthday emails sent',
    results,
    timestamp: new Date().toISOString()
  })
}
