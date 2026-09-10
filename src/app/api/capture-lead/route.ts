import {enforcePublicBudget} from '@/lib/public-rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanText, validEmail } from '@/lib/lead-intake'
import { apiErrorResponse, ApiError } from '@/lib/owner-access'
export async function POST(request: Request) {
  try {
    const body=await request.json()
    const name=cleanText(body.name,150),email=cleanText(body.email,254).toLowerCase(),message=cleanText(body.message,3000)
    if (!name || !validEmail(email) || !message || body.consent!==true || body.website) throw new ApiError(400,'Enter your name, email and message, and allow us to respond.')
    const limited=await enforcePublicBudget(request,'contact');if(limited)return limited
    const {error}=await createAdminClient().from('contact_inquiries').insert({
      name,email,message,business_name:cleanText(body.businessName,200),source:cleanText(body.source,100)||'contact',consent:true,marketing_opt_in:body.marketingOptIn===true,
    })
    if (error) throw new ApiError(503,'Your message could not be saved. Please try again.')
    return Response.json({success:true,captured:true})
  } catch(error) {return apiErrorResponse(error)}
}
