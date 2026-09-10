import {internalRequestError} from '@/lib/internal-request'
import {createAdminClient} from '@/lib/supabase/admin'
import {apiErrorResponse,ApiError} from '@/lib/owner-access'
import {cleanText} from '@/lib/lead-intake'
import {safeUrl} from '@/lib/site-content'
export async function POST(request:Request) {
  const denied=internalRequestError(request);if(denied)return denied
  try {
    const body=await request.json(),businessName=cleanText(body.businessName,200),city=cleanText(body.city,100),state=cleanText(body.state,100)
    if(!businessName||!city||!state)throw new ApiError(400,'Business name, city and state are required.')
    const website=safeUrl(body.website),category=cleanText(body.category,100)||'general'
    const {runAudit}=await import('@/lib/audit-engine')
    const audit=await runAudit({id:crypto.randomUUID(),businessName,category,address:[city,state].join(', '),city,state,website:website||undefined})
    const auditId=crypto.randomUUID();audit.id=auditId
    const {error}=await createAdminClient().from('audits').insert({id:auditId,business_name:businessName,city,state,category,website_url:website,overall_score:audit.overallScore,data:audit})
    if(error)throw new ApiError(503,'The audit could not be saved. Please try again.')
    return Response.json({success:true,auditId,reportUrl:'/audit/'+auditId,audit,requiresReview:true})
  }catch(error){return apiErrorResponse(error)}
}
