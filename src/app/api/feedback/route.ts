import {requireUser,requireOwnerSite,apiErrorResponse,ApiError} from '@/lib/owner-access'
import {cleanText} from '@/lib/lead-intake'
export async function POST(request:Request) {
  try {
    const context=await requireUser(),body=await request.json(),message=cleanText(body.message,5000)
    if(!message)throw new ApiError(400,'Enter your feedback.')
    let slug:null|string=null
    if(body.slug){const {site}=await requireOwnerSite({slug:cleanText(body.slug,100)},context);slug=site.slug}
    const {error}=await context.db.from('feedback').insert({type:body.type==='bug'?'bug':'feedback',message,slug,email:context.user.email,status:'new'})
    if(error)throw new ApiError(503,'Your feedback could not be saved. Please try again.')
    return Response.json({success:true})
  }catch(error){return apiErrorResponse(error)}
}
