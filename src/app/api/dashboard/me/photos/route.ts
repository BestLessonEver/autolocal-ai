import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
import {uploadImage} from '@/lib/site-media'
import {siteUpdates} from '@/lib/site-content'
export async function GET(request:Request) {
  try {const {site}=await requireOwnerSite(selectorFromRequest(request));return Response.json({hero_image_url:site.hero_image_url,gallery_images:site.gallery_images||[]})}
  catch(error) {return apiErrorResponse(error)}
}
export async function POST(request:Request) {
  try {
    const {site,db,user}=await requireOwnerSite(selectorFromRequest(request)),form=await request.formData()
    const target=form.get('target')==='hero'?'hero':'gallery'
    if(target==='gallery'&&(site.gallery_images||[]).length>=20) throw new ApiError(400,'Your gallery already has 20 photographs.')
    const url=await uploadImage(form.get('photo') as File,db,user.id)
    const updates=target==='hero'?{hero_image_url:url}:{gallery_images:[...(site.gallery_images||[]),url]}
    const {error}=await db.from('website_previews').update(updates).eq('id',site.id)
    if(error) throw new ApiError(503,'Your image uploaded, but the website could not be updated. Please try again.')
    return Response.json({success:true,url,target,publication_required:['active','pending_cancel'].includes(site.hosting_status)})
  } catch(error) {return apiErrorResponse(error)}
}
export async function PATCH(request:Request) {
  try {
    const {site,db}=await requireOwnerSite(selectorFromRequest(request)),body=await request.json()
    let updates:Record<string,unknown>
    if(body.action==='set_hero') updates=siteUpdates({hero_image_url:body.url})
    else if(body.action==='reorder') updates=siteUpdates({gallery_images:body.gallery_images})
    else if(body.action==='remove') {
      const gallery=(site.gallery_images||[]).filter((url:string)=>url!==body.url)
      updates={gallery_images:gallery}
      if(site.hero_image_url===body.url) updates.hero_image_url=gallery[0]||null
    } else throw new ApiError(400,'Choose a valid image action.')
    const {error}=await db.from('website_previews').update(updates).eq('id',site.id)
    if(error) throw new ApiError(503,'Your image changes could not be saved.')
    return Response.json({success:true,publication_required:['active','pending_cancel'].includes(site.hosting_status)})
  } catch(error) {return apiErrorResponse(error)}
}
