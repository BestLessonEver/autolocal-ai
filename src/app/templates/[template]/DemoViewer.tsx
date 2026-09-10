'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import type { SiteTemplateName } from '@/components/templates/types'
import styles from '../gallery.module.css'

const phoneQuery = '(max-width: 700px)'
function subscribeToScreen(callback: () => void) {
  const query = window.matchMedia(phoneQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
function isPhoneScreen() { return window.matchMedia(phoneQuery).matches }
function serverPhoneScreen() { return true }

export default function DemoViewer({ template, name }: { template: SiteTemplateName; name: string }) {
  const narrowScreen = useSyncExternalStore(subscribeToScreen, isPhoneScreen, serverPhoneScreen)
  const [selectedSize, setSelectedSize] = useState<'phone' | 'desktop' | null>(null)
  const phone = selectedSize ? selectedSize === 'phone' : narrowScreen
  const frameWindow = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!frameWindow.current) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setAvailable(current => current.width === width && current.height === height ? current : { width, height })
    })
    observer.observe(frameWindow.current)
    return () => observer.disconnect()
  }, [])

  const desktopWidth = Math.max(1024, available.width)
  const scale = !phone && available.width ? available.width / desktopWidth : 1
  const scaledDesktop = !phone && scale < 1

  return (
    <div className={styles.demoViewport}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarIdentity}>
          <Link href="/templates">← All designs</Link>
          <strong>{name}</strong>
        </div>
        <div className={styles.toolbarActions}>
          <div className={styles.toggle} role="group" aria-label="Preview size">
            <button type="button" aria-pressed={phone} aria-controls="design-demo" onClick={() => setSelectedSize('phone')}>Phone</button>
            <button type="button" aria-pressed={!phone} aria-controls="design-demo" onClick={() => setSelectedSize('desktop')}>Desktop</button>
          </div>
          <Link className={styles.useDesign} href={`/start?template=${template}`}>Use this design ↗</Link>
        </div>
      </header>
      <main className={styles.previewStage} aria-label={`${name} interactive preview`}>
        <div ref={frameWindow} className={`${styles.frameWindow} ${phone ? styles.phone : ''}`}>
          <iframe
            id="design-demo"
            className={styles.demoFrame}
            title={`${name} fictional business demo`}
            src={`/templates/${template}?embed=1`}
            style={!phone && available.width && available.height ? { width: desktopWidth, height: available.height / scale, transform: `scale(${scale})` } : undefined}
          />
        </div>
      </main>
      <p className={styles.previewHint} role="status">{scaledDesktop ? 'Desktop layout, scaled to fit. Switch to Phone to try it at reading size.' : 'Scroll the preview to explore. Demo inquiries are disabled.'}</p>
    </div>
  )
}
