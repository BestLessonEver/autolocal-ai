import {internalRequestError} from '@/lib/internal-request'
import {createAdminClient} from '@/lib/supabase/admin'
import {apiErrorResponse,ApiError} from '@/lib/owner-access'
import {cleanText} from '@/lib/lead-intake'
import {buildContentSystemPrompt,buildUserPrompt} from '@/lib/content-engine'
export async function POST(request:Request) {
  const denied=internalRequestError(request);if(denied)return denied
  try {
    if(!process.env.OPENAI_API_KEY)throw new ApiError(503,'Content drafting is not configured.')
    const body=await request.json(),count=Number(body.count??3)
    if(!Number.isInteger(count)||count<1||count>14)throw new ApiError(400,'Request between 1 and 14 drafts.')
    if(!body.isSample&&!body.businessId)throw new ApiError(400,'Choose a business before saving drafts.')
    const {default:OpenAI}=await import('openai')
    const ai=new OpenAI({timeout:20000,maxRetries:1})
    const completion=await ai.chat.completions.create({model:'gpt-4o-mini',messages:[
      {role:'system',content:buildContentSystemPrompt({businessName:cleanText(body.bizName,200),businessType:cleanText(body.industry,100),services:cleanText(body.services,3000),differentiator:cleanText(body.voiceDesc,1000),targetCustomer:cleanText(body.targetCustomer,500),stylePreset:cleanText(body.stylePreset,80),brandDescription:cleanText(body.brandDescription,3000)})},
      {role:'user',content:buildUserPrompt({count,platform:'facebook'})},
    ],temperature:0.5})
    let parsed:unknown
    try{parsed=JSON.parse(completion.choices[0]?.message?.content||'')}catch{throw new ApiError(502,'The draft service returned invalid content. No posts were saved.')}
    if(!Array.isArray(parsed))throw new ApiError(502,'The draft service returned invalid content.')
    const posts=parsed.map(item=>cleanText(item?.text,3000)).filter(Boolean).slice(0,count)
    if(posts.length!==count)throw new ApiError(502,'The draft service returned incomplete content. No posts were saved.')
    if(!body.isSample) {
      const {error}=await createAdminClient().from('posts').insert(posts.map(caption=>({business_id:body.businessId,caption,status:'pending',content_type:'educational',platforms:['facebook']})))
      if(error)throw new ApiError(503,'Drafts could not be saved.')
    }
    return Response.json({posts,saved:!body.isSample,requiresReview:true})
  }catch(error){return apiErrorResponse(error)}
}
