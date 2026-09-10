import { createHash } from 'node:crypto'
import { ConfigurationError } from '@/lib/integration-config'
import { JobError } from '@/lib/integration-jobs'
import { normalizeHostname } from '@/lib/vercel-domains'
import { vercelJson, vercelRequest } from '@/lib/providers/vercel'

export function publishingNamespace() {
  const namespace = process.env.AUTOLOCAL_PUBLISHING_NAMESPACE
  const railwayEnvironment = process.env.RAILWAY_ENVIRONMENT_NAME
  if (!namespace) {
    if (railwayEnvironment && railwayEnvironment !== 'production') throw new ConfigurationError('An isolated publishing namespace is required outside the production Railway environment')
    return null
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?$/.test(namespace) || namespace.includes('---')) throw new ConfigurationError('Invalid isolated publishing namespace')
  return namespace
}

export function publishingTarget(site: Record<string, unknown>) {
  const namespace = publishingNamespace()
  const slug = String(site.slug || '')
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) throw new JobError('Invalid website address', false)
  const baseDomain = process.env.AUTOLOCAL_SITES_DOMAIN || 'autolocal.ai'
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(baseDomain)) throw new ConfigurationError('Invalid hosting domain configuration')
  const custom = site.custom_domain && ['active', 'verifying'].includes(String(site.domain_status))
  if (namespace) {
    if (!site.id || !process.env.AUTOLOCAL_SITES_DOMAIN || baseDomain === 'autolocal.ai' || normalizeHostname(baseDomain) !== baseDomain) throw new ConfigurationError('Isolated publishing requires an explicit staging sites domain and website identity')
    if (site.custom_domain) throw new JobError('Custom domains cannot be published from an isolated staging namespace', false, true)
  }
  const domain = custom ? normalizeHostname(site.custom_domain) : `${slug}.${baseDomain}`
  if (!domain) throw new JobError('Invalid custom domain', false)
  const scope = namespace ? createHash('sha256').update(JSON.stringify([namespace, baseDomain, String(site.id)])).digest('hex').slice(0, 16) : null
  // Production names always start "autolocal-". This prefix cannot collide with
  // one of those names, even when a production slug starts with "staging".
  const projectName = namespace ? `autolocalstage-${namespace}-${slug.replace(/-+/g, '-').slice(0, 40)}-${scope}` : `autolocal-${slug}`
  return { namespace, scope, projectName, domain, siteUrl: `https://${domain}`, custom: Boolean(custom) }
}

type Target = ReturnType<typeof publishingTarget>
type Project = { id: string; name: string }

export async function isolatedProject(target: Target, existingId: string): Promise<string> {
  if (!target.namespace) return existingId
  const reference = existingId || target.projectName
  const response = await vercelRequest(`/v9/projects/${encodeURIComponent(reference)}`)
  if (response.status === 404 && !existingId) return ''
  if (!response.ok) throw new JobError('Could not verify the isolated publishing project', response.status === 429 || response.status >= 500, response.status === 404)
  const project = await response.json() as Project
  if (!project.id || project.name !== target.projectName || (existingId && project.id !== existingId)) throw new JobError('The stored hosting project does not belong to this staging namespace', false, true)
  return project.id
}

export async function verifyIsolatedDeployment(target: Target, deploymentId: string, projectId: string) {
  const deployment = await vercelJson<import('@/lib/providers/vercel').Deployment>(`/v13/deployments/${encodeURIComponent(deploymentId)}`)
  if (target.namespace && deployment.projectId !== projectId) throw new JobError('The stored deployment does not belong to this staging project', false, true)
  return deployment
}
