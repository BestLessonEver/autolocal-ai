import { apiErrorResponse, ApiError, requireUser, requireOwnerSite } from '@/lib/owner-access'
import { LEAD_STATUSES, cleanText } from '@/lib/lead-intake'
export async function PATCH(request: Request, {params}: {params:Promise<{id:string}>}) {
  try {
    const context = await requireUser()
    const {id} = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400,'Invalid inquiry.')
    const {data:lead,error} = await context.db.from('site_leads').select('id,site_id').eq('id',id).maybeSingle()
    if (error) throw new ApiError(503,'Your inquiry is temporarily unavailable.')
    if (!lead?.site_id) throw new ApiError(404,'Inquiry not found.')
    await requireOwnerSite({siteId:lead.site_id},context)
    const body = await request.json()
    const updates: Record<string,unknown> = {updated_at:new Date().toISOString()}
    if (body.status !== undefined) {
      if (!LEAD_STATUSES.includes(body.status)) throw new ApiError(400,'Choose a valid inquiry status.')
      updates.status=body.status
    }
    if (body.notes !== undefined) updates.notes=cleanText(body.notes,5000)
    if (Object.keys(updates).length===1) throw new ApiError(400,'No changes supplied.')
    const {error:updateError} = await context.db.from('site_leads').update(updates).eq('id',id).eq('site_id',lead.site_id)
    if (updateError) throw new ApiError(503,'Your changes could not be saved.')
    return Response.json({success:true,id,...updates})
  } catch(error) {return apiErrorResponse(error)}
}
