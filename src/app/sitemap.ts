import type { MetadataRoute } from 'next'
import { blogPosts } from '@/data/blog'
import { publicOrigin } from '@/lib/public-origin'

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin()
  return [
    ...['/', '/about', '/templates', '/blog', '/contact'].map(path => ({ url: new URL(path, origin).href })),
    ...blogPosts.map(post => ({ url: `${origin}/blog/${post.slug}`, lastModified: post.date })),
  ]
}
