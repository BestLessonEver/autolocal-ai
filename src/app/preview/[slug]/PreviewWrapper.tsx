'use client'

import { useState, useSyncExternalStore, Component, type ReactNode } from 'react'
import { type PreviewData, SITE_TEMPLATES, isSiteTemplate, categoryToProfessionalTemplate } from '@/components/templates/types'
import ProfessionalSite from '@/components/templates/ProfessionalSite'
import BoldTemplate from '@/components/templates/BoldTemplate'
import ElegantTemplate from '@/components/templates/ElegantTemplate'
import ClutchTemplate from '@/components/templates/ClutchTemplate'
import ArtikaTemplate from '@/components/templates/ArtikaTemplate'
import BDETemplate from '@/components/templates/BDETemplate'
import AIMTemplate from '@/components/templates/AIMTemplate'

const LEGACY: Record<string, React.ComponentType<{ data: PreviewData }>> = { bold: BoldTemplate, elegant: ElegantTemplate, clutch: ClutchTemplate, artika: ArtikaTemplate, bde: BDETemplate, modern: BDETemplate, aim: AIMTemplate }
class TemplateBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div style={{ padding: 60, textAlign: 'center', background: '#f7f5ef', color: '#16372f' }}>This design could not be displayed. Please try another design or return to your dashboard.</div> : this.props.children }
}

export default function PreviewWrapper({ data, isOwner = false, hasPublishedSite = false }: { data: PreviewData; isOwner?: boolean; hasPublishedSite?: boolean }) {
  const initial = data.template in LEGACY || isSiteTemplate(data.template) ? data.template : categoryToProfessionalTemplate(data.category)
  const [selected, setSelected] = useState(initial)
  const [savedTemplate, setSavedTemplate] = useState(initial)
  const compact = useSyncExternalStore(() => () => {}, () => window.self !== window.top, () => false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const isLive = hasPublishedSite
  const save = async () => {
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`/api/preview/${encodeURIComponent(data.slug)}/edit`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: selected }) })
      const result = await response.json()
      if (!response.ok || result.success !== true) throw new Error(result.error || 'Your design could not be saved.')
      setSavedTemplate(selected)
      setMessage(result.publication_required ? 'Design saved. Publish the update from your dashboard to change the live site.' : 'Design saved to your private preview.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Your design could not be saved.') }
    setSaving(false)
  }
  const Legacy = LEGACY[selected]
  return <>
    {isOwner && !compact && <section aria-label="Website preview controls" style={{ background: '#102e29', color: '#fff', padding: '15px 24px', fontFamily: 'Arial,sans-serif' }}><div style={{ maxWidth: 1280, margin: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}><div><strong style={{ fontSize: 13 }}>{isLive ? 'Website preview' : 'Private website preview'}</strong><p style={{ margin: '3px 0 0', fontSize: 11, color: '#c7d5cf' }}>Only you can see these controls.</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><label style={{ fontSize: 12 }} htmlFor="preview-style">Design</label><select id="preview-style" value={selected} onChange={event => { setSelected(event.target.value); setMessage('') }} style={{ background: '#fff', color: '#102e29', border: 0, padding: '9px 12px', fontSize: 16, minHeight: 44, maxWidth: '100%' }}>{selected in LEGACY && <option value={selected}>Current classic design</option>}{SITE_TEMPLATES.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select><button onClick={save} disabled={saving || selected === savedTemplate || !isSiteTemplate(selected)} style={{ padding: '10px 14px', fontSize: 14, minHeight: 44, color: '#102e29', background: '#d9e844', border: 0, opacity: saving || selected === savedTemplate ? .6 : 1, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save design'}</button><a href={`/dashboard?slug=${encodeURIComponent(data.slug)}`} style={{ fontSize: 12, color: '#fff', textDecoration: 'underline', marginLeft: 6 }}>Open dashboard</a></div></div>{message && <p role="status" style={{ maxWidth: 1280, margin: '10px auto 0', fontSize: 12 }}>{message}</p>}</section>}
    <TemplateBoundary key={selected}>{Legacy ? <Legacy data={data} /> : <ProfessionalSite data={data} template={isSiteTemplate(selected) ? selected : categoryToProfessionalTemplate(data.category)} mode="preview" />}</TemplateBoundary>
  </>
}
