import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
import {cleanText} from '@/lib/lead-intake'
export async function POST(request:Request) {
  try {
    const {site,db}=await requireOwnerSite(selectorFromRequest(request))
    const body=await request.json(),message=cleanText(body.message,5000)
    if(!message) throw new ApiError(400,'Describe the change you need.')
    const {data,error}=await db.from('change_requests').insert({preview_id:site.id,preview_slug:site.slug,business_name:site.business_name,type:cleanText(body.type,50)||'general',message,priority:body.priority==='urgent'?'urgent':'normal',cost:0,status:'pending'}).select('id').single()
    if(error) throw new ApiError(503,'Your change request could not be saved.')
    return Response.json({success:true,id:data.id,message:'Your request is saved for review. No fee has been charged.'})
  } catch(error) {return apiErrorResponse(error)}
}
