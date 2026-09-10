import Link from 'next/link'
import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import { PROFESSIONAL_TEMPLATES } from '@/components/templates/types'
import styles from './gallery.module.css'
export const metadata: Metadata = { title: 'Website designs | AutoLocal', description: 'Explore three thoughtful website designs for local service businesses, studios and professional practices.', alternates: { canonical: '/templates' } }
export default function TemplatesPage() {
  return <div className={styles.page}><MarketingNav/><main className={styles.shell}><div className={styles.intro}><p className={styles.eyebrow}>A good first impression</p><h1>Your business.<br/>Beautifully represented.</h1><p>Three distinct starting points. Your services, your photographs, your voice. Every design works from the first phone tap to the last detail.</p></div>{PROFESSIONAL_TEMPLATES.map(template => <article className={styles.card} key={template.id}><div className={styles.preview}><iframe inert tabIndex={-1} aria-hidden="true" loading="lazy" title={`${template.name} design preview`} src={`/templates/${template.id}?embed=1`}/><Link className={styles.previewLink} href={`/templates/${template.id}`} aria-label={`Explore ${template.name}`}/></div><div className={styles.details}><span className={styles.tags}>{template.audience}</span><h2>{template.name}</h2><p>{template.description}</p><div className={styles.actions}><Link className={styles.button} href={`/templates/${template.id}`}>Explore the design <span aria-hidden="true">↗</span></Link><Link className={styles.link} href={`/start?template=${template.id}`}>Make it yours</Link></div><p className={styles.note}>The preview uses a fictional business. Inquiries are disabled, and any sample imagery is labeled.</p></div></article>)}</main><MarketingFooter/></div>
}
