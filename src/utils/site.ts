// Canonical business info used for SEO (metadata, sitemap, robots, JSON-LD).
// Keep this EXACTLY in sync with the Google Business Profile and Yelp listing —
// search engines reward consistent Name / Address / Phone ("NAP") everywhere.

export const SITE = {
  // Production URL — intentionally hardcoded (not NEXT_PUBLIC_SITE_URL) so
  // canonical links never point at localhost or a preview deployment.
  url: 'https://www.lafamiliashowtimeboxing.com',
  name: 'La Familia Showtime Boxing Club',
  shortName: 'La Familia Showtime',
  description:
    'Boxing gym in Reseda, CA offering boxing classes, fitness training, sparring, and youth and adult programs in the San Fernando Valley. Your first class is free.',
  phone: '+1-747-265-9364',
  email: 'info@lafamiliashowtime.com',
  address: {
    street: '18323 Sherman Way',
    city: 'Reseda',
    region: 'CA',
    postalCode: '91335',
    country: 'US',
  },
  // Add Instagram / Facebook / Yelp / Google Maps URLs here once they exist.
  sameAs: [] as string[],
} as const

// Only these hosts may be indexed by search engines. Everything else
// (lafamiliashowtimeboxing.dev, Vercel previews, localhost) gets noindex so
// Google never lists the dev site or treats it as duplicate content.
const PRODUCTION_HOSTS = ['lafamiliashowtimeboxing.com', 'www.lafamiliashowtimeboxing.com']

export function isProductionHost(host: string | null | undefined): boolean {
  if (!host) return false
  return PRODUCTION_HOSTS.includes(host.split(':')[0].toLowerCase())
}
