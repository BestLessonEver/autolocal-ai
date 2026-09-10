import { requireUser, requireOwnerSite, apiErrorResponse, ApiError } from '@/lib/owner-access'
import { saveOwnedIntake } from '@/lib/site-intake'
import { siteUpdates } from '@/lib/site-content'
export async function POST(request:Request) {
  try { const context=await requireUser();const body=await request.json();return Response.json(await saveOwnedIntake(body,context)) }
  catch(error) {return apiErrorResponse(error)}
}
export async function PATCH(request:Request) {
  try {
    const context=await requireUser(),body=await request.json()
    if(!body.slug) throw new ApiError(400,'Choose a website.')
    const {site,db}=await requireOwnerSite({slug:body.slug},context)
    const updates=siteUpdates({logo_url:body.logoUrl,gallery_images:body.photoUrls})
    if(!Object.keys(updates).length) throw new ApiError(400,'No changes supplied.')
    const {error}=await db.from('website_previews').update(updates).eq('id',site.id)
    if(error) throw new ApiError(503,'Your photographs could not be saved.')
    return Response.json({success:true})
  } catch(error) {return apiErrorResponse(error)}
}
