import type { Metadata } from 'next'
import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import styles from '@/components/marketing.module.css'

export const metadata: Metadata = { title: 'About AutoLocal', description: 'A practical approach to a better website, accurate business information, and organized customer inquiries.', alternates: { canonical: '/about' } }

export default function AboutPage() {
  return <div className={styles.surface}><MarketingNav /><main className={styles.prose}>
    <p className={styles.eyebrow}>Built for the business owner</p>
    <h1>Good work deserves a clear introduction.</h1>
    <p>Customers need to know what you do, where you work, and how to reach you. AutoLocal brings those basics together in a professional website and a workspace you can keep up with.</p>
    <h2>Start with your real business</h2>
    <p>Bring your services, contact details, photos, and the questions customers ask. Review a website preview before choosing a paid plan or approving a launch.</p>
    <h2>Keep control of what customers see</h2>
    <p>Your business facts come first. Review proposed changes, connect the Google accounts you choose, and see whether an update is saved, waiting to publish, or verified live.</p>
    <h2>Give each inquiry a next step</h2>
    <p>A contact form is the beginning of a conversation. Your workspace keeps submitted inquiries together so you can follow up and record the outcome.</p>
    <h2>Measure what actually happened</h2>
    <p>We distinguish website activity, search visibility, and customer inquiries. Search rankings and new business cannot be guaranteed. You should be able to see what is connected and what still needs attention.</p>
    <p><Link href="/start">Create your free preview</Link> or <Link href="/contact">tell us about your project</Link>.</p>
  </main><MarketingFooter /></div>
}
