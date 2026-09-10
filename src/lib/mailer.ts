import { Resend } from 'resend'
import { requireCapability, requireEnv } from '@/lib/integration-config'

export type EmailOptions={idempotencyKey?:string;replyTo?:string}
const controls=/[\u0000-\u001f\u007f]/
/** A single plain mailbox, never a display name or additional mail headers. */
export function validatedReplyTo(value:unknown):string|undefined{
  if(typeof value!=='string'||controls.test(value))return undefined
  const email=value.trim()
  if(email.length>254)return undefined
  const parts=email.split('@')
  if(parts.length!==2)return undefined
  const [local,domain]=parts
  if(!local||local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..')||!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local))return undefined
  const labels=domain.split('.')
  if(labels.length<2||labels.some(label=>!label||label.length>63||!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)))return undefined
  return local+'@'+domain.toLowerCase()
}
export async function sendEmail(to: string, subject: string, html: string, options?: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const replyTo=options?.replyTo===undefined?undefined:validatedReplyTo(options.replyTo)
    if(typeof to!=='string'||!to.trim()||controls.test(to)||typeof subject!=='string'||controls.test(subject)||(options?.replyTo!==undefined&&!replyTo)){
      return {success:false,error:'Email delivery details are invalid'}
    }
    requireCapability('email')
    const from=requireEnv('EMAIL_FROM')
    if(controls.test(from))return {success:false,error:'Email sender configuration is invalid'}
    const resend = new Resend(requireEnv('RESEND_API_KEY'))
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(replyTo?{replyTo}:{}),
    }, options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined)

    if (error) {
      return { success: false, error: 'Email delivery was rejected by the provider' }
    }

    return { success: true, messageId: data?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error && 'status' in err ? err.message : 'Email delivery is temporarily unavailable' }
  }
}
