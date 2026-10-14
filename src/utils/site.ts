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
  // Google Business Profile. The kgmid (/g/11zy8zlhvc) is the permanent
  // Knowledge Graph ID of OUR listing — linking it tells Google the website
  // and the profile are the same entity (and not the similarly named
  // "Showtime Boxing Fitness" gym in Lake Balboa).
  google: {
    kgmid: '/g/11zy8zlhvc',
    profileUrl: 'https://www.google.com/search?kgmid=/g/11zy8zlhvc',
    shareUrl: 'https://share.google/GsrNoofOcoTVj4Uu1',
    directionsUrl:
      'https://www.google.com/maps/dir/?api=1&destination=La+Familia+Showtime+Boxing+Club%2C+18323+Sherman+Way%2C+Reseda%2C+CA+91335',
  },
  // Add Instagram / Facebook / TikTok / Yelp URLs here once they exist.
  // Only add accounts WE own (@showtimeboxingla is a different gym).
  sameAs: [
    'https://www.google.com/search?kgmid=/g/11zy8zlhvc',
    'https://share.google/GsrNoofOcoTVj4Uu1',
  ] as string[],
} as const

// Only these hosts may be indexed by search engines. Everything else
// (lafamiliashowtimeboxing.dev, Vercel previews, localhost) gets noindex so
// Google never lists the dev site or treats it as duplicate content.
const PRODUCTION_HOSTS = ['lafamiliashowtimeboxing.com', 'www.lafamiliashowtimeboxing.com']

export function isProductionHost(host: string | null | undefined): boolean {
  if (!host) return false
  return PRODUCTION_HOSTS.includes(host.split(':')[0].toLowerCase())
}
