import {internalRequestError,retiredWorkflow} from '@/lib/internal-request'
import {createAdminClient} from '@/lib/supabase/admin'
import {apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function POST(request:Request) {
  return internalRequestError(request)||retiredWorkflow('Create a verified owner preview through the business setup flow.')
}
export async function GET(request:Request) {
  const denied=internalRequestError(request);if(denied)return denied
  try {
    const {data,error}=await createAdminClient().from('website_previews').select('id,slug,business_name,category,city,state,status,created_at').order('created_at',{ascending:false}).limit(100)
    if(error)throw new ApiError(503,'Preview records are unavailable.')
    return Response.json({previews:data||[]})
  }catch(error){return apiErrorResponse(error)}
}
