'use client'
import { useState } from 'react'
import Link from 'next/link'
import styles from '../gallery.module.css'
import type { ProfessionalTemplateName } from '@/components/templates/types'
export default function DemoViewer({ template, name }: { template: ProfessionalTemplateName; name: string }) {
  const [phone, setPhone] = useState(false)
  return <div className={styles.demoViewport}><header className={styles.toolbar}><div><Link href="/templates">← All designs</Link><strong style={{ marginLeft: 20 }}>{name}</strong></div><div className={styles.toolbarActions}><div className={styles.toggle} aria-label="Preview size"><button aria-pressed={!phone} onClick={() => setPhone(false)}>Desktop</button><button aria-pressed={phone} onClick={() => setPhone(true)}>Phone</button></div><Link href={`/start?template=${template}`}>Use this design ↗</Link></div></header><div className={phone ? styles.phone : undefined}><iframe className={!phone ? styles.demoFrame : undefined} title={`${name} fictional business demo`} src={`/templates/${template}?embed=1`}/></div></div>
}
