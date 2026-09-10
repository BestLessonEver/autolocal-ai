import { validateInternalAuth } from '@/lib/internal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueIntegrationJob } from '@/lib/integration-jobs'
import { normalizeDomain } from '@/lib/vercel-domains'
import { apiErrorResponse, ApiError } from '@/lib/owner-access'
import { requireCapability } from '@/lib/integration-config'

export async function POST(req: Request) {
  const auth = validateInternalAuth(req)
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
  try {
    requireCapability('domainPurchases')
    const { siteId, domain: input } = await req.json()
    const domain = normalizeDomain(input)
    if (!siteId || !domain) throw new ApiError(400, 'Website and domain are required.')
    const db = createAdminClient()
    const { data: site, error } = await db.from('website_previews').select('id,custom_domain,domain_status,domain_purchase_price,published_site_snapshot,checkout_site_snapshot').eq('id', siteId).single()
    if (error || !site || site.custom_domain !== domain || site.domain_status !== 'registering' || !site.domain_purchase_price) throw new ApiError(409, 'A matching paid domain order is required.')
    const jobId = await enqueueIntegrationJob(db, { kind: 'register_domain', siteId, key: `domain:${siteId}:${domain}`, payload: { domain, expectedPrice: site.domain_purchase_price, site: site.published_site_snapshot || site.checkout_site_snapshot } })
    return Response.json({ success: true, status: 'queued', jobId }, { status: 202 })
  } catch (error) { return apiErrorResponse(error) }
}
