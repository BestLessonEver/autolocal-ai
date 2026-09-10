import type { Metadata } from 'next'
import Link from 'next/link'
import { blogPosts } from '@/data/blog'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import styles from '@/components/marketing.module.css'

export const metadata: Metadata = { title: 'Practical guides for local business owners', description: 'Clear guides to business information, useful websites, and following up on customer inquiries.', alternates: { canonical: '/blog' } }
export default function BlogPage() {
  return <div className={styles.surface}><MarketingNav /><main className={styles.prose}><p className={styles.eyebrow}>Small improvements that matter</p><h1>A more useful online presence.</h1><p>Practical guides for the parts of your business customers see first.</p>
    {blogPosts.map(post => <article key={post.slug}><h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><p className={styles.note}>{post.tag} · Updated {post.date}</p></article>)}
  </main><MarketingFooter /></div>
}
