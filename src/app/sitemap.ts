import type { MetadataRoute } from 'next'
import { SITE } from '@/utils/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: SITE.url,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      images: [`${SITE.url}/gym-interior.jpg`, `${SITE.url}/logo.jpg`],
    },
    { url: `${SITE.url}/schedule`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE.url}/memberships`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE.url}/trainers`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ]
}
