import {validateInternalAuth} from '@/lib/internal-auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {deliverLeadNotifications} from '@/lib/lead-notifications'
import {sendEmail} from '@/lib/mailer'
import {requireCapability,requireEnv} from '@/lib/integration-config'
import {apiErrorResponse} from '@/lib/owner-access'
export async function POST(request:Request) {
  const auth=validateInternalAuth(request)
  if(!auth.ok) return Response.json({error:auth.message},{status:auth.status})
  try {
    requireCapability('email');requireEnv('RESEND_API_KEY');requireEnv('EMAIL_FROM')
    return Response.json(await deliverLeadNotifications(createAdminClient(),sendEmail))
  } catch(error) {return apiErrorResponse(error)}
}
