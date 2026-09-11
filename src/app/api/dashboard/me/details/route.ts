import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
import {siteUpdates} from '@/lib/site-content'
import {googleOwnerUpdates} from '@/lib/google-site'
export async function PATCH(request:Request) {
  try {
    const {site,db}=await requireOwnerSite(selectorFromRequest(request))
    const supplied=siteUpdates(await request.json())
    if(!Object.keys(supplied).length) throw new ApiError(400,'No changes supplied.')
    const updates=googleOwnerUpdates(site,supplied)
    const {error}=await db.from('website_previews').update({...updates,updated_at:new Date().toISOString()}).eq('id',site.id)
    if(error) throw new ApiError(503,'Your changes could not be saved.')
    return Response.json({success:true,publication_required:site.hosting_status==='active'||site.hosting_status==='pending_cancel'})
  } catch(error) {return apiErrorResponse(error)}
}
