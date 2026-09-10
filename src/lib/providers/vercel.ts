import { requireEnv } from '@/lib/integration-config'
import { JobError } from '@/lib/integration-jobs'

export async function vercelRequest(path: string, options: RequestInit = {}) {
  const url = new URL(path, 'https://api.vercel.com')
  if (url.origin !== 'https://api.vercel.com') throw new Error('Invalid provider endpoint')
  const team = process.env.VERCEL_TEAM_ID
  if (team) url.searchParams.set('teamId', team)
  return fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${requireEnv('VERCEL_TOKEN')}`, ...options.headers } })
}

export async function vercelJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await vercelRequest(path, options)
  if (!response.ok) throw new JobError(`Hosting provider returned HTTP ${response.status}`, response.status === 429 || response.status >= 500)
  return response.json() as Promise<T>
}

export type Deployment = { id: string; url: string; projectId: string; readyState?: string; aliasError?: unknown }

export function deploymentState(deployment: Pick<Deployment, 'readyState' | 'aliasError'>): 'ready' | 'pending' | 'failed' {
  if (deployment.aliasError || ['ERROR', 'CANCELED', 'BLOCKED'].includes(deployment.readyState || '')) return 'failed'
  return deployment.readyState === 'READY' ? 'ready' : 'pending'
}

export async function attachDomain(domain: string, projectId: string) {
  const path = `/v10/projects/${encodeURIComponent(projectId)}/domains`
  const response = await vercelRequest(path, { method: 'POST', body: JSON.stringify({ name: domain }) })
  if (!response.ok && ![400, 409].includes(response.status)) throw new JobError(`Domain attachment returned HTTP ${response.status}`)
  // A conflict is acceptable only if it is already attached to this exact project.
  let attached = await vercelJson<{ verified: boolean }>(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`)
  if (!attached.verified) attached = await vercelJson<{ verified: boolean }>(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' })
  if (!attached.verified) throw new JobError('Domain ownership verification is still pending')
  const config = await vercelJson<{ misconfigured: boolean }>(`/v6/domains/${encodeURIComponent(domain)}/config`)
  if (config.misconfigured !== false) throw new JobError('Domain DNS or TLS configuration is still pending')
}
