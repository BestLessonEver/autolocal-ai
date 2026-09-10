import { validateInternalAuth } from '@/lib/internal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerSite, apiErrorResponse, ApiError } from '@/lib/owner-access'
import { queueDeployment } from '@/lib/deployment-service'
import { requireCapability } from '@/lib/integration-config'
import { isProfessionalTemplate } from '@/components/templates/professional-renderer'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const selector = { slug: typeof body.slug === 'string' ? body.slug : undefined, siteId: typeof body.siteId === 'string' ? body.siteId : undefined }
    if (!selector.slug && !selector.siteId) throw new ApiError(400, 'Choose a website to publish.')
    requireCapability('publishing')
    let context
    if (req.headers.has('authorization')) {
      const auth = validateInternalAuth(req)
      if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
      const db = createAdminClient()
      const query = db.from('website_previews').select('*')
      const { data: site, error } = await (selector.siteId ? query.eq('id', selector.siteId) : query.eq('slug', selector.slug!)).single()
      if (error || !site) throw new ApiError(404, 'Website not found.')
      context = { db, site }
    } else context = await requireOwnerSite(selector)
    if (!['active', 'pending_cancel'].includes(context.site.hosting_status)) throw new ApiError(402, 'Activate hosting before publishing.')
    if (!isProfessionalTemplate(context.site.template)) throw new ApiError(409, 'Choose and review a current design before publishing.')
    const jobId = await queueDeployment(context.db, context.site)
    return Response.json({ success: true, status: 'queued', jobId }, { status: 202 })
  } catch (error) { return apiErrorResponse(error) }
}
