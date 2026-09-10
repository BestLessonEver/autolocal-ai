import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function POST(request:Request) {
  try {
    const {site,db,user}=await requireOwnerSite(selectorFromRequest(request))
    const {error}=await db.from('audit_requests').insert({business_name:site.business_name,website:site.website_current||null,city:site.city||'',state:site.state||'',email:user.email,status:'pending'})
    if(error)throw new ApiError(503,'Your review request could not be saved.')
    return Response.json({success:true,message:'Your business review request is saved for the team.'})
  }catch(error){return apiErrorResponse(error)}
}
