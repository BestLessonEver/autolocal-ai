import {internalRequestError,retiredWorkflow} from '@/lib/internal-request'
import {createAdminClient} from '@/lib/supabase/admin'
import {apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function POST(request:Request) {
  return internalRequestError(request)||retiredWorkflow('Automatic cold outreach is retired. This product focuses on permissioned business visibility and inbound inquiries.')
}
export async function GET(request:Request) {
  const denied=internalRequestError(request);if(denied)return denied
  try {
    const {data,error}=await createAdminClient().from('outbound_emails').select('id,status,template_used,created_at').order('created_at',{ascending:false}).limit(100)
    if(error)throw new ApiError(503,'Historical outreach status is unavailable.')
    return Response.json({records:data||[]})
  }catch(error){return apiErrorResponse(error)}
}
