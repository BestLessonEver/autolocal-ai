import type {SupabaseClient} from '@supabase/supabase-js'
import {escapeHtml,cleanText} from '@/lib/lead-intake'
import {appOrigin} from '@/lib/integration-config'
import {validatedReplyTo,type EmailOptions} from '@/lib/mailer'
type Sender=(to:string,subject:string,html:string,options?:EmailOptions)=>Promise<{success:boolean,error?:string}>
type NotificationLead={id:string;name?:unknown;email?:unknown;phone?:unknown;message?:unknown;service?:unknown}
type NotificationSite={id:string;business_name?:unknown}
function telephoneTarget(value:unknown){
  if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))return undefined
  const phone=value.trim()
  if(!/^\+?[\d\s().-]+$/.test(phone))return undefined
  const digits=phone.replace(/\D/g,'')
  if(digits.length<7||digits.length>15)return undefined
  return 'tel:'+(phone.startsWith('+')?'+':'')+digits
}
export function renderLeadNotification(site:NotificationSite,lead:NotificationLead){
  const workspace=new URL('/dashboard',appOrigin())
  workspace.search=new URLSearchParams({siteId:site.id,tab:'leads',leadId:lead.id}).toString()
  const replyTo=validatedReplyTo(lead.email),phoneTarget=telephoneTarget(lead.phone)
  const emailTarget=replyTo?'mailto:'+encodeURIComponent(replyTo.split('@')[0])+'@'+replyTo.split('@')[1]:undefined
  const link=(target:string,label:string)=>'<a href="'+escapeHtml(target)+'">'+escapeHtml(label)+'</a>'
  const email=replyTo&&emailTarget?link(emailTarget,String(lead.email)):escapeHtml(lead.email)
  const phone=phoneTarget?link(phoneTarget,String(lead.phone)):escapeHtml(lead.phone)
  const instructions=replyTo?'Reply to this email to use the customer-provided address.':phoneTarget?'Use the customer-provided phone number below to follow up.':'Open this inquiry to review the customer-provided contact details.'
  const html='<h2>New inquiry for '+escapeHtml(site.business_name)+'</h2><p>'+instructions+'</p><p><strong>Name:</strong> '+escapeHtml(lead.name)+'</p><p><strong>Email:</strong> '+email+'</p><p><strong>Phone:</strong> '+phone+'</p><p><strong>Service:</strong> '+escapeHtml(lead.service)+'</p><p>'+escapeHtml(lead.message)+'</p><p>'+link(workspace.toString(),'Open this inquiry in your workspace')+'</p><p>Sign in with your owner account to view the inquiry and record your follow-up.</p>'
  return {subject:'New inquiry — '+cleanText(site.business_name,200),html,replyTo}
}
export async function deliverLeadNotifications(db:SupabaseClient,send:Sender) {
  // Invalid application setup must not consume a notification attempt.
  appOrigin()
  const {data:jobs,error}=await db.rpc('claim_lead_notifications',{p_limit:10})
  if(error) throw new Error('Unable to claim lead notifications')
  const totals={processed:0,sent:0,retrying:0,failed:0}
  for(const job of jobs||[]) {
    totals.processed++
    try {
      const {data:lead,error:leadError}=await db.from('site_leads').select('id,name,email,phone,message,service,site_id').eq('id',job.lead_id).single()
      const {data:site,error:siteError}=await db.from('website_previews').select('id,business_name,email,owner_id').eq('id',job.site_id).single()
      if(leadError||siteError||!lead||!site?.email||lead.site_id!==site.id) throw new Error('Lead or owner contact unavailable')
      let recipient=site.email
      if(site.owner_id) {
        const {data,error:ownerError}=await db.auth.admin.getUserById(site.owner_id)
        if(ownerError||!data.user?.email||!data.user.email_confirmed_at) throw new Error('Verified owner contact unavailable')
        recipient=data.user.email
      }
      const rendered=renderLeadNotification(site,lead)
      const result=await send(recipient,rendered.subject,rendered.html,{idempotencyKey:'lead:'+lead.id,...(rendered.replyTo?{replyTo:rendered.replyTo}:{})})
      if(!result.success) throw new Error('Email delivery was not accepted')
      const {error:saveError}=await db.from('lead_notifications').update({status:'sent',sent_at:new Date().toISOString(),error:null}).eq('id',job.id).eq('status','processing')
      if(saveError) throw new Error('Delivery status could not be saved')
      totals.sent++
    } catch {
      const terminal=job.attempts>=5
      const {error:saveError}=await db.from('lead_notifications').update({
        status:terminal?'failed':'retry',error:'Delivery incomplete; check the connection and retry.',
        next_attempt_at:new Date(Date.now()+Math.min(60,2**job.attempts)*60_000).toISOString(),
      }).eq('id',job.id).eq('status','processing')
      if(saveError) throw new Error('Notification retry state could not be saved')
      if(terminal) totals.failed++;else totals.retrying++
    }
  }
  return totals
}
