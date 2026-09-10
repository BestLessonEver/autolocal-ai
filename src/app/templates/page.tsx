import Link from 'next/link'
import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import { SITE_TEMPLATES } from '@/components/templates/types'
import styles from './gallery.module.css'

export const metadata: Metadata = {
  title: 'Website designs | AutoLocal',
  description: 'Explore polished and playful website designs for local businesses. Try every design on a phone or desktop, then make it yours.',
  alternates: { canonical: '/templates' },
}

const families = [
  { id: 'professional', title: 'Polished & professional', description: 'A confident first impression for your services, studio, or practice.' },
  { id: 'playful', title: 'Playful & unexpected', description: 'A little nostalgia. A lot of personality. For businesses that like to do things their own way.' },
] as const

export default function TemplatesPage() {
  return (
    <div className={styles.page}>
      <MarketingNav />
      <main className={styles.shell}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Make a first impression that feels like you</p>
          <h1>Good looks.<br />Real personality.</h1>
          <p>Quietly refined or wonderfully weird. Pick your starting point, then bring your services, photos, and voice. Every design makes room for the small screen.</p>
          <nav className={styles.familyNav} aria-label="Design styles">
            {families.map(family => <a key={family.id} href={`#${family.id}`}>{family.title} <span aria-hidden="true">↓</span></a>)}
          </nav>
        </div>

        {families.map(family => (
          <section key={family.id} id={family.id} className={styles.family} aria-labelledby={`${family.id}-heading`}>
            <div className={styles.familyHeading}>
              <h2 id={`${family.id}-heading`}>{family.title}</h2>
              <p>{family.description}</p>
            </div>
            {SITE_TEMPLATES.filter(template => template.style === family.id).map(template => (
              <article className={styles.card} key={template.id}>
                <div className={styles.previewWrap}>
                  <div className={styles.previewLabel} aria-hidden="true"><span className={styles.desktopLabel}>Desktop preview</span><span className={styles.mobileLabel}>Phone preview</span><span>Live design ↗</span></div>
                  <div className={styles.preview}>
                    <iframe inert tabIndex={-1} aria-hidden="true" loading="lazy" title={`${template.name} design preview`} src={`/templates/${template.id}?embed=1`} />
                    <Link className={styles.previewLink} href={`/templates/${template.id}`} aria-label={`Explore ${template.name}`} />
                  </div>
                </div>
                <div className={styles.details}>
                  <span className={styles.tags}>{template.audience}</span>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <div className={styles.actions}>
                    <Link className={styles.button} href={`/templates/${template.id}`}>Explore the design <span aria-hidden="true">↗</span></Link>
                    <Link className={styles.link} href={`/start?template=${template.id}`}>Make it yours</Link>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ))}
        <p className={styles.note}>Previews use fictional businesses. Demo inquiries are disabled, and sample imagery is labeled.</p>
      </main>
      <MarketingFooter />
    </div>
  )
}
