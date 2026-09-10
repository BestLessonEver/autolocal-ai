import {createHmac} from 'node:crypto'
import {isIP} from 'node:net'
import type {SupabaseClient} from '@supabase/supabase-js'
import {createAdminClient} from '@/lib/supabase/admin'
export type PublicBudget='google-places'|'contact'
type Decision={allowed:boolean;retry_after:number}
const limits={ 'google-places':{maximum:30,windowMs:600000,daily:1000},contact:{maximum:5,windowMs:3600000,daily:200} } as const
// Trust an IP header only when the deployment guarantees it is overwritten.
export function publicClientIdentity(request:Request) {
 const trusted=process.env.VERCEL==='1'||process.env.AUTOLOCAL_TRUST_PROXY_IP_HEADERS==='true'
 // Railway supplies X-Real-IP. Do not fall back to a caller-controlled XFF
 // when that host's required header is missing or malformed.
 const header=process.env.RAILWAY_ENVIRONMENT_ID&&process.env.VERCEL!=='1'?'x-real-ip':'x-forwarded-for'
 const value=trusted?(header==='x-real-ip'?request.headers.get(header)?.trim():request.headers.get(header)?.split(',')[0]?.trim()):null
 return value&&isIP(value)?value:'unknown'
}
// Internal-only deployment probe: reports comparisons, never visitor addresses.
// Send this reserved documentation address in both headers during the check.
export function publicProxyProbe(request:Request) {
 const probe='192.0.2.17'
 const real=request.headers.get('x-real-ip')?.trim()
 const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
 const identity=publicClientIdentity(request)
 return {railwayEnvironment:Boolean(process.env.RAILWAY_ENVIRONMENT_ID),realIpValid:Boolean(real&&isIP(real)),realIpMatchesProbe:real===probe,forwardedIpMatchesProbe:forwarded===probe,selectedIdentityKnown:identity!=='unknown',selectedIdentityMatchesProbe:identity===probe}
}
export function getPublicRateLimitHealth(){
 return {durableConfigured:Buffer.byteLength(process.env.AUTOLOCAL_RATE_LIMIT_KEY||'')>=32,trustedProxy:process.env.VERCEL==='1'||process.env.AUTOLOCAL_TRUST_PROXY_IP_HEADERS==='true',edgeVerified:process.env.AUTOLOCAL_EDGE_RATE_LIMIT_VERIFIED==='true'}
}
export function createLocalPublicBudget(now:()=>number=Date.now){
 const visits=new Map<string,{count:number;expires:number}>()
 return (scope:PublicBudget,identity:string):Decision=>{
  const stamp=now(),settings=limits[scope],globalKey=scope+':global:'+new Date(stamp).toISOString().slice(0,10),key=scope+':'+identity
  for(const [name,row] of visits)if(row.expires<=stamp)visits.delete(name)
  const global=visits.get(globalKey),entry=visits.get(key)
  if(global&&global.count>=settings.daily)return {allowed:false,retry_after:Math.ceil((global.expires-stamp)/1000)}
  if(entry&&entry.count>=settings.maximum)return {allowed:false,retry_after:Math.ceil((entry.expires-stamp)/1000)}
  // Never clear active counters to accommodate a flood of new identities.
  if(visits.size>=2500&&!entry)return {allowed:false,retry_after:600}
  visits.set(key,{count:(entry?.count||0)+1,expires:entry?.expires||stamp+settings.windowMs})
  const nextDay=new Date(stamp);nextDay.setUTCHours(24,0,0,0)
  visits.set(globalKey,{count:(global?.count||0)+1,expires:nextDay.getTime()})
  return {allowed:true,retry_after:0}
 }
}
const localBudget=createLocalPublicBudget()
export async function enforcePublicBudget(request:Request,scope:PublicBudget,getDatabase:()=>SupabaseClient=createAdminClient){
 try{
  const identity=publicClientIdentity(request)
  let decision:Decision
  if(process.env.NODE_ENV!=='production'&&!process.env.AUTOLOCAL_RATE_LIMIT_KEY)decision=localBudget(scope,identity)
  else{
   const key=process.env.AUTOLOCAL_RATE_LIMIT_KEY
   if(!key||Buffer.byteLength(key)<32)throw new Error('Shared request budget is not configured')
   const clientHash=createHmac('sha256',key).update(scope+':'+new Date().toISOString().slice(0,10)+':'+identity).digest('hex')
   const {data,error}=await getDatabase().rpc('consume_public_request_budget',{p_scope:scope,p_client_hash:clientHash})
   if(error||!data?.[0]||typeof data[0].allowed!=='boolean')throw new Error('Shared request budget unavailable')
   decision=data[0] as Decision
  }
  if(decision.allowed)return null
  return Response.json({error:scope==='google-places'?'Too many business lookups. Continue manually or try again later.':'Too many contact requests. Please try again later.'},{status:429,headers:{'Retry-After':String(Math.max(1,decision.retry_after)),'Cache-Control':'no-store'}})
 }catch{
  return Response.json({error:scope==='google-places'?'Business lookup is temporarily unavailable. Please enter the business details manually.':'Your message could not be saved right now. Please try again later.'},{status:503,headers:{'Cache-Control':'no-store'}})
 }
}
