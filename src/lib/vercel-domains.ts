import { requireCapability } from '@/lib/integration-config'
import { JobError } from '@/lib/integration-jobs'
import { attachDomain, vercelJson, vercelRequest } from '@/lib/providers/vercel'

const PRICES: Record<string, { register: number; renew: number }> = {
  com: { register: 17.99, renew: 17.99 }, net: { register: 18.99, renew: 18.99 },
  org: { register: 17.99, renew: 17.99 }, co: { register: 34.99, renew: 34.99 },
  us: { register: 12.99, renew: 12.99 }, biz: { register: 29.99, renew: 29.99 },
}
export const SUPPORTED_TLDS = Object.keys(PRICES)
export function normalizeHostname(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const hostname = input.trim().toLowerCase()
  if (hostname.length > 253 || !/^[a-z0-9.-]+\.[a-z]{2,63}$/.test(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null
  if (hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  return hostname
}
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  const [name, tld, extra] = value.split('.')
  if (extra || !name || !SUPPORTED_TLDS.includes(tld) || name.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) return null
  return value
}
export interface DomainAvailability {
  domain: string; available: boolean; purchasePrice: number | null; renewalPrice: number | null;
  retailPrice: number | null; retailRenew: number | null
}
export async function checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
  if (!domains.length || domains.length > 6 || domains.some(domain => !normalizeDomain(domain))) throw new Error('Invalid domain search')
  const { results } = await vercelJson<{ results: { domain: string; available: boolean }[] }>('/v1/registrar/domains/availability', { method: 'POST', body: JSON.stringify({ domains }) })
  if (!Array.isArray(results)) throw new Error('Invalid domain availability response')
  return Promise.all(domains.map(async domain => {
    const available = results.find(row => row.domain === domain)?.available === true
    if (!available) return { domain, available: false, purchasePrice: null, renewalPrice: null, retailPrice: null, retailRenew: null }
    const raw = await vercelJson<{ purchasePrice: number | string; renewalPrice: number | string }>(`/v1/registrar/domains/${encodeURIComponent(domain)}/price?years=1`)
    const price = { purchasePrice: parseProviderPrice(raw.purchasePrice), renewalPrice: parseProviderPrice(raw.renewalPrice) }
    if (!Number.isFinite(price.purchasePrice) || price.purchasePrice <= 0 || !Number.isFinite(price.renewalPrice) || price.renewalPrice <= 0) throw new Error('Domain pricing is temporarily unavailable')
    // No placeholder prices and no below-cost purchases for premium domains.
    const minimum = PRICES[domain.split('.').pop()!]
    return { domain, available, ...price, retailPrice: Math.max(minimum.register, Math.ceil(price.purchasePrice * 1.25 * 100) / 100), retailRenew: Math.max(minimum.renew, Math.ceil(price.renewalPrice * 1.25 * 100) / 100) }
  }))
}
export type Registrant = { firstName: string; lastName: string; email: string; phone: string; address1: string; city: string; state: string; zip: string; country: string; companyName?: string }
export function parseProviderPrice(value: unknown): number {
  if (typeof value === 'number') return value
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN
}
export async function registerDomain(domain: string, expectedPrice: number, contactInfo: Registrant): Promise<{ success: true; orderId: string }> {
  requireCapability('domainPurchases')
  if (!normalizeDomain(domain) || !Number.isFinite(expectedPrice) || expectedPrice <= 0) throw new JobError('Invalid domain order', false)
  if (!/^\+[1-9]\d{7,14}$/.test(contactInfo.phone) || !/^[A-Z]{2}$/.test(contactInfo.country)) throw new JobError('Domain contact requires an international phone number and two-letter country code.', false)
  let response: Response
  try {
    response = await vercelRequest(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy`, { method: 'POST', body: JSON.stringify({ autoRenew: false, years: 1, expectedPrice, contactInformation: contactInfo }) })
  } catch {
    // A timeout can occur after a registrar accepted payment. Never repeat it automatically.
    throw new JobError('Domain purchase outcome is unknown. Review the provider order before retrying.', false, true)
  }
  if (!response.ok) throw new JobError(`Domain purchase needs review (provider HTTP ${response.status}).`, false, true)
  const data = await response.json().catch(() => null)
  if (!data?.orderId) throw new JobError('Domain purchase confirmation is missing. Review the provider order.', false, true)
  return { success: true, orderId: data.orderId }
}
export async function addDomainToProject(domain: string, projectId: string): Promise<boolean> { await attachDomain(domain, projectId); return true }
