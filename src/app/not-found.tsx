import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import styles from '@/components/marketing.module.css'

export default function NotFound() {
  return <div className={styles.surface}><MarketingNav /><main className={styles.prose}><p className={styles.eyebrow}>Page not found</p><h1>Let’s get you back on track.</h1><p>This address may have changed, or the page is no longer available.</p><p><Link href="/">Go to AutoLocal</Link> or <Link href="/dashboard">open your workspace</Link>.</p></main><MarketingFooter /></div>
}
