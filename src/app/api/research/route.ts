import {internalRequestError} from '@/lib/internal-request'
import {createAdminClient} from '@/lib/supabase/admin'
import {apiErrorResponse,ApiError} from '@/lib/owner-access'
import {cleanText} from '@/lib/lead-intake'
import {safeUrl} from '@/lib/site-content'
export async function POST(request:Request) {
  const denied=internalRequestError(request);if(denied)return denied
  try {
    const body=await request.json(),businessName=cleanText(body.businessName,200),website=safeUrl(body.website)
    if(!businessName||!website)throw new ApiError(400,'Business name and website are required.')
    const {researchBusiness}=await import('@/lib/research')
    const result=await researchBusiness({businessName,website,location:cleanText(body.location,200),businessType:cleanText(body.businessType,100)})
    if(!result.website)throw new ApiError(502,'The website could not be read. No research was saved.')
    if(body.businessId) {
      const {error}=await createAdminClient().from('research_results').insert({business_id:body.businessId,business_name:businessName,data:result,status:'complete'})
      if(error)throw new ApiError(503,'Research completed but could not be saved. Please try again.')
    }
    return Response.json({ok:true,result,saved:!!body.businessId})
  }catch(error){return apiErrorResponse(error)}
}
