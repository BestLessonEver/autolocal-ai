import {createAdminClient} from '@/lib/supabase/admin'
import {appOrigin} from '@/lib/integration-config'
export async function isUnsubscribed(email:string):Promise<boolean> {
  const db=createAdminClient()
  const {data,error}=await db.from('unsubscribes').select('id').ilike('email',email.trim().toLowerCase().replace(/[\\%_]/g,'\\$&')).limit(1)
  if(error)throw new Error('Unable to verify marketing consent; sending is blocked.')
  return !!data?.length
}
export function getUnsubscribeUrl(email:string):string {
  return appOrigin()+'/api/unsubscribe?email='+encodeURIComponent(email)
}
