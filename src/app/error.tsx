'use client'
import Link from 'next/link'
import styles from '@/components/marketing.module.css'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className={styles.surface}><div className={styles.prose}><p className={styles.eyebrow}>Something went wrong</p><h1>We couldn’t open this page.</h1><p>Please try again. If you just submitted a request, check your workspace before sending it a second time.</p><button type="button" onClick={reset} className={styles.button}>Try again</button><p><Link href="/">Go to AutoLocal</Link> · <Link href="/contact">Get help</Link></p></div></main>
}
