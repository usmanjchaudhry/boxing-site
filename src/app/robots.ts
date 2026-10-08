import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { SITE, isProductionHost } from '@/utils/site'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')

  // Dev / preview / localhost: block all crawling.
  if (!isProductionHost(host)) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Private / member-only areas — nothing useful for search results.
      disallow: [
        '/admin',
        '/dashboard',
        '/checkin',
        '/api/',
        '/auth/',
        '/reset-password',
        '/forgot-password',
      ],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
