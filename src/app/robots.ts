import type { MetadataRoute } from 'next'
import { SITE } from '@/utils/site'

export default function robots(): MetadataRoute.Robots {
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
