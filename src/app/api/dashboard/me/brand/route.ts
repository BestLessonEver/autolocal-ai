import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
import {uploadImage} from '@/lib/site-media'
import {siteUpdates} from '@/lib/site-content'
export async function POST(request:Request) {
  try {
    const {site,db,user}=await requireOwnerSite(selectorFromRequest(request)),form=await request.formData()
    const url=await uploadImage(form.get('logo') as File,db,user.id)
    const {error}=await db.from('website_previews').update({logo_url:url}).eq('id',site.id)
    if(error) throw new ApiError(503,'Your logo uploaded, but the website could not be updated.')
    return Response.json({success:true,logo_url:url,publication_required:['active','pending_cancel'].includes(site.hosting_status)})
  } catch(error) {return apiErrorResponse(error)}
}
export async function PATCH(request:Request) {
  try {
    const {site,db}=await requireOwnerSite(selectorFromRequest(request)),body=await request.json()
    const updates=siteUpdates({brand_color_primary:body.brand_color_primary,brand_color_secondary:body.brand_color_secondary,brand_color_accent:body.brand_color_accent})
    if(!Object.keys(updates).length) throw new ApiError(400,'No colors supplied.')
    const {error}=await db.from('website_previews').update(updates).eq('id',site.id)
    if(error) throw new ApiError(503,'Your colors could not be saved.')
    return Response.json({success:true,publication_required:['active','pending_cancel'].includes(site.hosting_status)})
  } catch(error) {return apiErrorResponse(error)}
}
