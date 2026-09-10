import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { blogPosts, retiredBlogRedirects } from '@/data/blog'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import styles from '@/components/marketing.module.css'

export function generateStaticParams() { return blogPosts.map(post => ({ slug: post.slug })) }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = blogPosts.find(item => item.slug === slug)
  return post ? { title: post.title, description: post.excerpt, alternates: { canonical: `/blog/${post.slug}` }, openGraph: { title: post.title, description: post.excerpt, type: 'article', modifiedTime: post.date } } : { robots: { index: false } }
}
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (Object.hasOwn(retiredBlogRedirects, slug)) permanentRedirect(`/blog/${retiredBlogRedirects[slug]}`)
  const post = blogPosts.find(item => item.slug === slug)
  if (!post) notFound()
  return <div className={styles.surface}><MarketingNav /><main className={styles.prose}><Link href="/blog">All guides</Link><article><p className={styles.eyebrow}>{post.tag} · Updated {post.date}</p><h1>{post.title}</h1><div dangerouslySetInnerHTML={{ __html: post.content }} /></article><p><Link href="/start">Start with your business</Link></p></main><MarketingFooter /></div>
}
