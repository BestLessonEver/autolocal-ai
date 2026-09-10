import { createHash } from 'node:crypto'
import { load } from 'cheerio'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appOrigin, requireCapability, requireEnv } from '@/lib/integration-config'
import { enqueueIntegrationJob, JobError, type IntegrationJob } from '@/lib/integration-jobs'
import { attachDomain, deploymentState, promoteDeployment, vercelJson, type Deployment } from '@/lib/providers/vercel'
import { normalizeDomain, normalizeHostname, registerDomain, type Registrant } from '@/lib/vercel-domains'
import { generateStaticSiteFiles } from '@/lib/static-templates'
import { publicSiteData } from '@/components/templates/public-site-data'
import { isolatedProject, publishingNamespace, publishingTarget, verifyIsolatedDeployment } from '@/lib/providers/publishing-target'

async function saveSite(db: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await db.from('website_previews').update(values).eq('id', id)
  if (error) throw new JobError('Could not save the website publishing state')
}
async function saveJobResult(db: SupabaseClient, job: IntegrationJob, result: Record<string, unknown>) {
  const { error } = await db.from('integration_jobs').update({ result }).eq('id', job.id)
  if (error) throw new JobError('Could not save the provider operation reference', false, true)
  job.result = result
}
export function publishingSnapshot(site: Record<string, unknown>) {
  return { ...publicSiteData(site), website_current: null, hosting_status: 'active', deploy_status: '' }
}
export function siteRevision(site: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(publishingSnapshot(site))).digest('hex').slice(0, 24)
}
export async function queueDeployment(db: SupabaseClient, site: Record<string, unknown>, source = 'owner', approvedSite?: Record<string, unknown>) {
  const target = publishingTarget(site)
  const snapshot = publishingSnapshot(approvedSite || site)
  if (snapshot.slug !== site.slug) throw new JobError('Approved content does not match this website', false, true)
  const revision = siteRevision(snapshot)
  const key = `deploy:${String(site.id)}:${revision}:${source}${target.scope ? `:${target.scope}` : ''}`
  const payload = { site: snapshot, revision, source, ...(target.scope ? { publishingScope: target.scope } : {}) }
  let id = await enqueueIntegrationJob(db, { kind: 'deploy', siteId: String(site.id), key, payload })
  const existing = await db.from('integration_jobs').select('status').eq('id', id).single()
  if (existing.error) throw new JobError('Could not confirm publishing progress')
  if (source !== 'owner' && site.requested_deployment_job_id && site.requested_deployment_job_id !== id) {
    const current = await db.from('integration_jobs').select('status').eq('id', site.requested_deployment_job_id).maybeSingle()
    if (current.error) throw new JobError('Could not confirm the current publishing request')
    if (current.data && ['pending', 'processing', 'retry'].includes(current.data.status)) return String(site.requested_deployment_job_id)
  }
  if (existing.data.status === 'succeeded') {
    if (site.deploy_status !== 'suspended' && site.published_site_snapshot && siteRevision(site.published_site_snapshot as Record<string, unknown>) === revision) return id
    // An explicit rollback must publish again; a historic succeeded job is not live proof.
    id = await enqueueIntegrationJob(db, { kind: 'deploy', siteId: String(site.id), key: `${key}:${crypto.randomUUID()}`, payload })
  }
  if (existing.data.status === 'needs_review') throw new JobError('This publishing attempt needs support review before retrying.', false, true)
  if (existing.data.status === 'failed') {
    const retry = await db.from('integration_jobs').update({ status: 'pending', attempts: 0, result: null, error: null, claimed_at: null, next_attempt_at: new Date().toISOString() }).eq('id', id).eq('status', 'failed')
    if (retry.error) throw new JobError('Could not retry the publishing request')
  }
  let requested = db.from('website_previews').update({ deploy_status: 'queued', deploy_error: null, requested_deployment_job_id: id }).eq('id', String(site.id))
  if (source !== 'owner') requested = site.requested_deployment_job_id ? requested.eq('requested_deployment_job_id', site.requested_deployment_job_id) : requested.is('requested_deployment_job_id', null)
  const saved = await requested
  if (saved.error) throw new JobError('Could not save the publishing request')
  return id
}
export function hasSiteMarker(html: string, slug: string, revision?: string) {
  const document = load(html)
  return document('meta[name="autolocal-site"]').attr('content') === slug && (!revision || document('meta[name="autolocal-revision"]').attr('content') === revision)
}
async function verifyLivePage(domain: string, slug: string, revision: string, immutableDeployment = false) {
  // Only a provider-verified hostname selected from this site's stored mapping reaches here.
  const headers: Record<string, string> = {}
  if (immutableDeployment && domain.endsWith('.vercel.app') && process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const response = await fetch(`https://${domain}`, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (immutableDeployment && [401, 403].includes(response.status)) throw new JobError('Deployment verification is protected. Configure Vercel automation access for client projects.', false)
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new JobError('The published website is not serving yet')
  const html = await response.text()
  if (!hasSiteMarker(html, slug, revision)) throw new JobError('The domain is not serving the expected website revision yet')
}
export async function runDeployment(db: SupabaseClient, job: IntegrationJob) {
  requireCapability('publishing')
  const { data: site, error } = await db.from('website_previews').select('*').eq('id', job.site_id).single()
  if (error || !site) throw new JobError('Website not found', false)
  if (site.requested_deployment_job_id !== job.id) return { skipped: 'A newer publishing request superseded this job' }
  const suspended = job.kind === 'suspend_site'
  if (!suspended && !['active', 'pending_cancel'].includes(site.hosting_status)) throw new JobError('Hosting is not active', false)
  if (suspended && site.hosting_status !== 'cancelled') return { skipped: 'Hosting is active again' }
  const target = publishingTarget(site)
  // Suspension contains no owner-approved content; its target is still checked
  // against the isolated project below. Content jobs must retain their scope.
  if ((job.payload.publishingScope || (target.scope && !suspended)) && job.payload.publishingScope !== target.scope) throw new JobError('This publishing job belongs to another environment. Queue a new staging publication.', false, true)
  const { domain, siteUrl, custom: useCustom } = target
  const approved = job.payload.site && typeof job.payload.site === 'object' ? job.payload.site as Record<string, unknown> : null
  if (!suspended && (!approved || approved.slug !== site.slug || siteRevision(approved) !== job.payload.revision)) throw new JobError('Approved website content is missing or changed. Publish again from the owner workspace.', false, true)
  let deploymentId = String(job.result?.deploymentId || '')
  let projectId = String(job.result?.projectId || site.vercel_project_id || '')
  projectId = await isolatedProject(target, projectId)
  if (!deploymentId) {
    await saveSite(db, site.id, { deploy_status: 'deploying', deploy_error: null })
    const siteData = approved!
    const files = suspended
      ? [{ file: 'index.html', data: `<!doctype html><html><head><meta name="robots" content="noindex"><meta name="autolocal-site" content="${site.slug}"></head><body><h1>This website is currently unavailable.</h1></body></html>` }]
      : generateStaticSiteFiles(siteData, String(siteData.template || 'summit'), { siteUrl, apiBaseUrl: appOrigin() })
    if (target.namespace) {
      for (const file of files) if (file.file.endsWith('.html')) {
        const document = load(file.data)
        document('meta[name="robots"]').remove()
        document('head').append('<meta name="robots" content="noindex,nofollow">')
        file.data = document.html()
      }
      const robots = files.find(file => file.file === 'robots.txt')
      if (robots) robots.data = 'User-agent: *\nDisallow: /\n'
      else files.push({ file: 'robots.txt', data: 'User-agent: *\nDisallow: /\n' })
    }
    for (const file of files) if (file.file === 'index.html') file.data = file.data.replace('</head>', `<meta name="autolocal-revision" content="${job.id}"></head>`)
    const deployment = await vercelJson<Deployment>('/v13/deployments', { method: 'POST', body: JSON.stringify({ name: target.projectName, ...(projectId ? { project: projectId } : {}), files, projectSettings: { framework: null }, meta: { autolocalJobId: job.id } }) })
    if (!deployment.id || !deployment.projectId || !deployment.url) throw new JobError('Hosting provider did not return deployment references', false, true)
    deploymentId = deployment.id; projectId = deployment.projectId
    await saveJobResult(db, job, { deploymentId, projectId, deploymentUrl: `https://${deployment.url}` })
    await isolatedProject(target, projectId)
    await saveSite(db, site.id, { vercel_project_id: projectId, vercel_deployment_id: deploymentId, deploy_status: 'verifying' })
  }
  const deployment = await verifyIsolatedDeployment(target, deploymentId, projectId)
  const state = deploymentState(deployment)
  if (state === 'failed') throw new JobError('Hosting provider could not publish this revision', false)
  if (state !== 'ready') throw new JobError('Hosting provider is still preparing the website')
  const immutableHost = normalizeHostname(new URL(String(job.result?.deploymentUrl || '')).hostname)
  if (!immutableHost?.endsWith('.vercel.app')) throw new JobError('Invalid deployment verification address', false, true)
  await verifyLivePage(immutableHost, site.slug, job.id, true)
  const current = await db.from('website_previews').select('requested_deployment_job_id,hosting_status').eq('id', site.id).single()
  if (current.error) throw new JobError('Could not confirm the current publishing request')
  if (current.data.requested_deployment_job_id !== job.id) return { skipped: 'A newer publishing request superseded this job' }
  if ((!suspended && !['active', 'pending_cancel'].includes(current.data.hosting_status)) || (suspended && current.data.hosting_status !== 'cancelled')) return { skipped: 'Hosting status changed' }
  if (!job.result?.promoted) {
    await promoteDeployment(projectId, deploymentId)
    await saveJobResult(db, job, { ...job.result, promoted: true })
  }
  await attachDomain(domain, projectId)
  await verifyLivePage(domain, site.slug, job.id)
  const finalized = await db.from('website_previews').update({ website_current: siteUrl, deployment_url: job.result?.deploymentUrl || null, status: 'published', deploy_status: suspended ? 'suspended' : 'live', deployment_verified_at: new Date().toISOString(), deploy_error: null, ...(!suspended ? { published_site_snapshot: approved } : {}), ...(useCustom ? { domain_status: 'active' } : {}) }).eq('id', site.id).eq('requested_deployment_job_id', job.id)
  if (finalized.error) throw new JobError('Could not confirm verified publishing state')
  return { ...job.result, url: siteUrl, verified: true, suspended }
}
export async function runDomainRegistration(db: SupabaseClient, job: IntegrationJob) {
  if (publishingNamespace()) throw new JobError('Domain purchases are disabled in isolated staging publishing', false, true)
  requireCapability('domainPurchases')
  const { data: site, error } = await db.from('website_previews').select('*').eq('id', job.site_id).single()
  if (error || !site) throw new JobError('Website not found', false)
  const domain = normalizeDomain(job.payload.domain)
  const expectedPrice = Number(job.payload.expectedPrice)
  if (!domain || site.custom_domain !== domain || !Number.isFinite(expectedPrice) || expectedPrice <= 0) throw new JobError('The paid domain order does not match this website', false, true)
  let orderId = String(job.result?.orderId || site.domain_registrar_id || '')
  if (!orderId) {
    if (job.result?.purchaseStarted) throw new JobError('An earlier purchase may have completed. Review the provider before retrying.', false, true)
    const contact = JSON.parse(requireEnv('DOMAIN_REGISTRANT_JSON')) as Registrant
    if (!['firstName','lastName','email','phone','address1','city','state','zip','country'].every(key => typeof contact[key as keyof Registrant] === 'string' && contact[key as keyof Registrant])) throw new JobError('Domain registrant configuration is incomplete', false)
    // Persist intent BEFORE the non-idempotent registrar purchase.
    await saveJobResult(db, job, { purchaseStarted: true })
    const result = await registerDomain(domain, expectedPrice, contact)
    orderId = result.orderId
    await saveJobResult(db, job, { purchaseStarted: true, orderId })
    await saveSite(db, site.id, { domain_registrar_id: orderId, domain_order_status: 'pending', domain_auto_renew: false })
  }
  const order = await vercelJson<{ status: string; domains: { domainName: string; status: string; error?: unknown }[] }>(`/v1/registrar/orders/${encodeURIComponent(orderId)}`)
  const domainOrder = order.domains?.find(item => item.domainName === domain)
  if (domainOrder?.error || ['failed', 'error', 'refunded', 'refund-failed'].includes(domainOrder?.status || '') || ['failed', 'error'].includes(order.status)) throw new JobError('The domain order needs provider review', false, true)
  if (!['completed', 'succeeded'].includes(domainOrder?.status || '')) throw new JobError('Domain registration is still processing')
  const registration = await vercelJson<{ domain?: { expiresAt?: number }; expiresAt?: number }>(`/v5/domains/${encodeURIComponent(domain)}`)
  const expiresAt = registration.domain?.expiresAt ?? registration.expiresAt
  await saveSite(db, site.id, { domain_status: 'verifying', domain_order_status: 'completed', domain_provider: 'vercel', domain_auto_renew: false, domain_expires_at: Number.isFinite(expiresAt) ? new Date(expiresAt!).toISOString() : null })
  const approved = site.published_site_snapshot || (job.payload.site && typeof job.payload.site === 'object' ? job.payload.site as Record<string, unknown> : null)
  if (!approved) throw new JobError('Domain registration completed. Review and publish the website from your workspace.', false, true)
  const jobId = await queueDeployment(db, { ...site, domain_status: 'verifying' }, `domain:${orderId}`, { ...approved, custom_domain: domain, domain_status: 'verifying' })
  return { orderId, deploymentJobId: jobId, status: 'verifying' }
}
