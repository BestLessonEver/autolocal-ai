import type { MetadataRoute } from 'next'
import { isStagingDeployment, publicOrigin } from '@/lib/public-origin'

export default function robots(): MetadataRoute.Robots {
  if (isStagingDeployment()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/dashboard', '/auth/', '/login', '/setup', '/start', '/intake/', '/my-site/', '/preview/', '/building/', '/demo', '/design-lab', '/templates/'] },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  }
}
