import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, requireOwnerSite } from '@/lib/owner-access'
import { publicSiteData } from '@/components/templates/public-site-data'
import { safeWebUrl } from '@/components/templates/professional-renderer'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import PreviewWrapper from './PreviewWrapper'
import {hydrateGoogleSite} from '@/lib/google-site'

export const dynamic = 'force-dynamic'
export const revalidate = 0
type Props = { params: Promise<{ slug: string }> }

export const metadata: Metadata = { title: { absolute: 'Private website preview | AutoLocal' }, robots: { index: false, follow: false } }

function verifiedPublicUrl(site: Record<string, unknown>) {
  if (!['active', 'pending_cancel'].includes(String(site.hosting_status)) || site.deploy_status === 'suspended' || !site.deployment_verified_at) return ''
  const url = safeWebUrl(site.website_current)
  return url.startsWith('https://') ? url : ''
}

async function publicSiteUrl(slug: string) {
  const db = createAdminClient()
  const { data, error } = await db.from('website_previews').select('website_current,hosting_status,deploy_status,deployment_verified_at').eq('slug', slug).in('hosting_status', ['active', 'pending_cancel']).not('deployment_verified_at', 'is', null).maybeSingle()
  if (error) throw new ApiError(503, 'Website temporarily unavailable.')
  return data ? verifiedPublicUrl(data) : ''
}

export default async function PreviewPage({ params }: Props) {
  const { slug } = await params
  let site: Record<string, unknown> | null = null
  let liveUrl = ''
  let unavailable = false
  try {
    const result = await requireOwnerSite({ slug })
    site = result.site
    liveUrl = verifiedPublicUrl(site!)
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) unavailable = true
    try { liveUrl = await publicSiteUrl(slug) } catch { unavailable = true }
  }
  // Saved business fields are drafts. Anonymous visitors only see the last verified publication.
  if (!site && liveUrl) redirect(liveUrl)
  if (!site) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f5ef', color: '#16372f', padding: 24 }}><div style={{ maxWidth: 420, textAlign: 'center' }}><p style={{ letterSpacing: '.15em', fontSize: 12, marginBottom: 20 }}>AUTOLOCAL</p><h1 style={{ fontSize: 36, letterSpacing: '-.04em', lineHeight: 1.1 }}>{unavailable ? 'Temporarily unavailable' : 'Your preview is private.'}</h1><p style={{ lineHeight: 1.7, marginTop: 20 }}>{unavailable ? 'Please try again shortly. Your website details have not been changed.' : 'Sign in with the verified email for this business to view its website.'}</p><a style={{ display: 'inline-block', padding: '14px 22px', background: '#16372f', color: 'white', marginTop: 24 }} href={`/login?redirect=${encodeURIComponent(`/preview/${slug}`)}`}>Sign in to continue</a></div></main>
  const hydrated=await hydrateGoogleSite(site,{request:new Request('https://autolocal.ai/',{headers:await headers()})})
  return <>{hydrated.google_import_error?<p role="status" style={{margin:0,padding:'14px 20px',background:'#fff4dc',color:'#4c370e',fontSize:14,lineHeight:1.5}}>{String(hydrated.google_import_error)}</p>:null}<PreviewWrapper data={publicSiteData(hydrated)} isOwner hasPublishedSite={!!liveUrl} /></>
}
