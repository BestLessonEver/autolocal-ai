import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function PATCH(request:Request) {
  try {
    const {site,db}=await requireOwnerSite(selectorFromRequest(request)),body=await request.json()
    if(site.hosting_status!=='preview') throw new ApiError(409,'A published website address needs a managed redirect. Contact support to change it.')
    const slug=typeof body.subdomain==='string'?body.subdomain.toLowerCase().trim():''
    if(!/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/.test(slug)) throw new ApiError(400,'Use 3–60 letters, numbers and hyphens.')
    if(['www','api','admin','mail','app','dashboard'].includes(slug)) throw new ApiError(400,'That address is reserved.')
    const {error}=await db.from('website_previews').update({slug}).eq('id',site.id)
    if(error?.code==='23505') throw new ApiError(409,'That address is already in use.')
    if(error) throw new ApiError(503,'Your preview address could not be saved.')
    return Response.json({success:true,slug,previewUrl:'/preview/'+slug})
  } catch(error) {return apiErrorResponse(error)}
}
