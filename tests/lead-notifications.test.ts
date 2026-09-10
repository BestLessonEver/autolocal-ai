import {test} from 'node:test'
import assert from 'node:assert/strict'
import {load} from 'cheerio'
import type {SupabaseClient} from '@supabase/supabase-js'
import {renderLeadNotification,deliverLeadNotifications} from '../src/lib/lead-notifications'
import {sendEmail,validatedReplyTo,type EmailOptions} from '../src/lib/mailer'
const env=process.env as Record<string,string|undefined>
function preserve(keys:string[]){const prior=Object.fromEntries(keys.map(key=>[key,env[key]]));return ()=>{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete env[key];else env[key]=value}}}
const site={id:'11111111-1111-4111-8111-111111111111',business_name:'Fixture & Sons',email:'legacy-owner@example.invalid',owner_id:'owner-fixture'}
const lead={id:'22222222-2222-4222-8222-222222222222',site_id:site.id,name:'Customer <script>alert(1)</script>',email:'customer+quote@example.invalid',phone:'+1 (555) 123-4567',message:'Please help <img src=x onerror=alert(1)>',service:'Repair & maintenance'}
function fixtureDb(){
 const updates:Record<string,unknown>[]=[]
 const db={rpc:async()=>({data:[{id:'job-fixture',lead_id:lead.id,site_id:site.id,attempts:1}],error:null}),from:(table:string)=>({
  select:()=>({eq:()=>({single:async()=>({data:table==='site_leads'?lead:site,error:null})})}),
  update:(value:Record<string,unknown>)=>{updates.push(value);return {eq:()=>({eq:async()=>({error:null})})}},
 }),auth:{admin:{getUserById:async()=>({data:{user:{email:'verified-owner@example.invalid',email_confirmed_at:'2026-01-01'}},error:null})}}} as unknown as SupabaseClient
 return {db,updates}
}
test('inquiry email renders safe reply/call actions and exact owner workspace destination',()=>{
 const restore=preserve(['NEXT_PUBLIC_SITE_URL'])
 try{
  env.NEXT_PUBLIC_SITE_URL='https://staging.autolocal.example.invalid/base-path'
  const result=renderLeadNotification(site,lead),$=load(result.html)
  assert.equal(result.replyTo,lead.email)
  assert.equal($('script,img').length,0)
  assert.ok($.text().includes('<script>alert(1)</script>'))
  const links=$('a').toArray().map(element=>$(element).attr('href')!)
  assert.ok(links.includes('mailto:customer%2Bquote@example.invalid'))
  assert.ok(links.includes('tel:+15551234567'))
  const workspace=new URL(links.find(value=>value.startsWith('https:'))!)
  assert.equal(workspace.origin,'https://staging.autolocal.example.invalid')
  assert.equal(workspace.pathname,'/dashboard')
  assert.equal(workspace.searchParams.get('siteId'),site.id)
  assert.equal(workspace.searchParams.get('tab'),'leads')
  assert.equal(workspace.searchParams.get('leadId'),lead.id)
  assert.ok(!result.html.includes(site.email))
  assert.ok(result.html.includes('&amp;tab=leads&amp;leadId='))
 }finally{restore()}
})
test('contact strings cannot add mailto headers, phone actions, HTML attributes or email headers',()=>{
 const restore=preserve(['NEXT_PUBLIC_SITE_URL'])
 try{
  env.NEXT_PUBLIC_SITE_URL='https://workspace.example.invalid'
  const special='customer?subject=hello&cc=other@example.invalid'
  const specialResult=renderLeadNotification(site,{...lead,email:special})
  assert.equal(specialResult.replyTo,special)
  const specialLink=load(specialResult.html)('a[href^="mailto:"]').attr('href')!
  assert.equal(new URL(specialLink).search,'')
  assert.equal(decodeURIComponent(new URL(specialLink).pathname),special)
  for(const email of ['victim@example.invalid\r\nBcc: other@example.invalid','Display <victim@example.invalid>','victim@example.invalid,other@example.invalid','victim@example.invalid?cc=other@example.invalid','a..b@example.invalid','a@-invalid.example']){
   assert.equal(validatedReplyTo(email),undefined)
   const result=renderLeadNotification({...site,business_name:'Shop\r\nBcc: other@example.invalid'},{...lead,email,phone:'5551234567\" onclick=\"bad()'})
   const $=load(result.html)
   assert.equal(result.replyTo,undefined);assert.equal($('a[href^="mailto:"],a[href^="tel:"],[onclick]').length,0)
   assert.ok(!/[\r\n]/.test(result.subject))
   assert.equal($('a').length,1)
  }
 }finally{restore()}
})
test('phone-only inquiry keeps direct calling and omits Reply-To',()=>{
 const rendered=renderLeadNotification(site,{...lead,email:''}),$=load(rendered.html)
 assert.equal(rendered.replyTo,undefined)
 assert.equal($('a[href^="mailto:"]').length,0)
 assert.equal($('a[href^="tel:"]').attr('href'),'tel:+15551234567')
 assert.ok($.text().includes('customer-provided phone number'))
})
test('notification preserves owner routing, stable idempotency and durable retry outcome',async()=>{
 const {db,updates}=fixtureDb();let options:EmailOptions|undefined
 const result=await deliverLeadNotifications(db,async(to,_subject,html,sentOptions)=>{
  assert.equal(to,'verified-owner@example.invalid')
  assert.ok(!html.includes('verified-owner@example.invalid'))
  options=sentOptions
  return {success:false}
 })
 assert.equal(options?.replyTo,lead.email);assert.equal(options?.idempotencyKey,'lead:'+lead.id)
 assert.deepEqual(result,{processed:1,sent:0,retrying:1,failed:0})
 assert.equal(updates[0].status,'retry');assert.ok(!updates.some(update=>update.status==='sent'))
})
test('invalid workspace origin leaves the outbox unclaimed and sends nothing',async()=>{
 const restore=preserve(['NEXT_PUBLIC_SITE_URL'])
 try{
  env.NEXT_PUBLIC_SITE_URL='https://user:password@attacker.example.invalid'
  let claimed=0,sent=0
  const db={rpc:async()=>{claimed++;return {data:[],error:null}}} as unknown as SupabaseClient
  await assert.rejects(deliverLeadNotifications(db,async()=>{sent++;return {success:true}}),/origin/)
  assert.equal(claimed,0);assert.equal(sent,0)
 }finally{restore()}
})
test('mailer passes one validated Reply-To and idempotency key to the mocked provider, rejects header injection before I/O',async()=>{
 const restore=preserve(['AUTOLOCAL_ENABLE_EMAIL','RESEND_API_KEY','EMAIL_FROM']),originalFetch=globalThis.fetch
 try{
  env.AUTOLOCAL_ENABLE_EMAIL='true';env.RESEND_API_KEY='fixture-resend-key';env.EMAIL_FROM='AutoLocal <notifications@example.invalid>'
  let calls=0,payload:Record<string,unknown>={},headers=new Headers()
  globalThis.fetch=async(input,init)=>{
   assert.equal(String(input),'https://api.resend.com/emails')
   calls++;payload=JSON.parse(String(init?.body));headers=new Headers(init?.headers)
   return Response.json({id:'fixture-message-id'})
  }
  const success=await sendEmail('owner@example.invalid','Fixture inquiry','<p>Fixture</p>',{replyTo:'customer+quote@EXAMPLE.invalid',idempotencyKey:'lead:fixture-id'})
  assert.equal(success.success,true);assert.equal(payload.reply_to,'customer+quote@example.invalid')
  assert.equal(payload.to,'owner@example.invalid');assert.equal(payload.from,env.EMAIL_FROM)
  assert.equal(headers.get('Idempotency-Key'),'lead:fixture-id')
  for(const replyTo of ['victim@example.invalid\r\nBcc: other@example.invalid','victim@example.invalid,other@example.invalid','Victim <victim@example.invalid>']){
   assert.equal((await sendEmail('owner@example.invalid','Fixture','<p>Fixture</p>',{replyTo})).success,false)
  }
  assert.equal((await sendEmail('owner@example.invalid\r\nBcc: other@example.invalid','Fixture','<p>Fixture</p>')).success,false)
  assert.equal((await sendEmail('owner@example.invalid','Fixture\r\nBcc: other@example.invalid','<p>Fixture</p>')).success,false)
  assert.equal(calls,1)
 }finally{restore();globalThis.fetch=originalFetch}
})
