import {ApiError} from '@/lib/owner-access'
import {digest} from '@/lib/google-vault'
export type GoogleFetch=typeof fetch
export type GoogleResource={name:string;label:string;accountName?:string;accountLabel?:string;permissionLevel?:string}
export class GoogleApiError extends ApiError {
 constructor(public code:string,status=502,public uncertain=false){super(status,code==='reauth_required'?'Google access expired. Reconnect your account.':code==='permission_required'?'Google denied access. Check API approval, enabled APIs and account permissions.':code==='quota_exceeded'?'Google is limiting requests. Try again later.':'Google could not complete the request. Try again later.')}
}
export async function googleRequest<T>(url:string,accessToken:string,init:RequestInit={},fetcher:GoogleFetch=fetch):Promise<T> {
 const parsed=new URL(url)
 if(parsed.protocol!=='https:'||!['www.googleapis.com','mybusinessaccountmanagement.googleapis.com','mybusinessbusinessinformation.googleapis.com','businessprofileperformance.googleapis.com'].includes(parsed.hostname))throw new Error('Unapproved Google API host')
 let response:Response
 try{response=await fetcher(url,{...init,headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(15000),redirect:'error'})}
 catch{throw new GoogleApiError('provider_unavailable',502,init.method==='PATCH')}
 if(!response.ok)throw new GoogleApiError(response.status===401?'reauth_required':response.status===403?'permission_required':response.status===429?'quota_exceeded':'provider_unavailable',response.status===401?401:response.status===403?403:response.status===429?429:502,init.method==='PATCH'&&response.status>=500)
 if(response.status===204)return {} as T
 const text=await response.text()
 try{return (text?JSON.parse(text):{}) as T}catch{throw new GoogleApiError('invalid_provider_response',502,init.method==='PATCH')}
}
type Location={name:string;title?:string;profile?:{description?:string};regularHours?:{periods?:HoursPeriod[]};storefrontAddress?:unknown;phoneNumbers?:unknown;websiteUri?:string;categories?:unknown;metadata?:{hasPendingEdits?:boolean}}
export type HoursPeriod={openDay:string;openTime:{hours?:number;minutes?:number};closeDay:string;closeTime:{hours?:number;minutes?:number}}
const fields='name,title,profile,regularHours,storefrontAddress,phoneNumbers,websiteUri,categories,metadata'
export async function listGoogleResources(provider:'gbp'|'search_console',token:string,fetcher:GoogleFetch=fetch):Promise<{resources:GoogleResource[];truncated:boolean}> {
 if(provider==='search_console') {
  const result=await googleRequest<{siteEntry?:{siteUrl:string;permissionLevel:string}[]}>('https://www.googleapis.com/webmasters/v3/sites',token,{},fetcher)
  return {resources:(result.siteEntry||[]).filter(site=>['siteOwner','siteFullUser','siteRestrictedUser'].includes(site.permissionLevel)).map(site=>({name:site.siteUrl,label:site.siteUrl,permissionLevel:site.permissionLevel})),truncated:false}
 }
 const resources:GoogleResource[]=[],accounts:{name:string;accountName?:string}[]=[]
 let pageToken=''
 for(let page=0;page<10;page++){
  const params=new URLSearchParams({pageSize:'20'});if(pageToken)params.set('pageToken',pageToken)
  const result=await googleRequest<{accounts?:{name:string;accountName?:string}[];nextPageToken?:string}>('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?'+params,token,{},fetcher)
  accounts.push(...(result.accounts||[]));pageToken=result.nextPageToken||'';if(!pageToken)break
 }
 let truncated=!!pageToken
 for(const account of accounts){
  if(!/^accounts\/[a-zA-Z0-9_-]+$/.test(account.name))continue
  let next=''
  for(let page=0;page<10;page++){
   const params=new URLSearchParams({pageSize:'100',readMask:'name,title'});if(next)params.set('pageToken',next)
   const result=await googleRequest<{locations?:Location[];nextPageToken?:string}>('https://mybusinessbusinessinformation.googleapis.com/v1/'+account.name+'/locations?'+params,token,{},fetcher)
   resources.push(...(result.locations||[]).map(location=>({name:location.name,label:location.title||location.name,accountName:account.name,accountLabel:account.accountName})))
   next=result.nextPageToken||'';if(!next||resources.length>=1000)break
  }
  truncated=truncated||!!next;if(resources.length>=1000){truncated=true;break}
 }
 return {resources,truncated}
}
export function locationName(value:string){if(!/^locations\/[a-zA-Z0-9_-]+$/.test(value))throw new ApiError(400,'Invalid Google location.');return value}
export async function fetchGoogleProfile(name:string,token:string,fetcher:GoogleFetch=fetch) {
 return googleRequest<Location>('https://mybusinessbusinessinformation.googleapis.com/v1/'+locationName(name)+'?readMask='+encodeURIComponent(fields),token,{},fetcher)
}
const days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']
function normalizeHours(hours:Location['regularHours']) {
 return {periods:(hours?.periods||[]).map(period=>({openDay:period.openDay,openTime:{hours:period.openTime?.hours||0,minutes:period.openTime?.minutes||0},closeDay:period.closeDay,closeTime:{hours:period.closeTime?.hours||0,minutes:period.closeTime?.minutes||0}})).sort((a,b)=>days.indexOf(a.openDay)-days.indexOf(b.openDay)||a.openTime.hours-b.openTime.hours||a.openTime.minutes-b.openTime.minutes)}
}
export function editableProfile(profile:Location){return {description:profile.profile?.description||'',regularHours:normalizeHours(profile.regularHours)}}
export function profileRevision(profile:Location){return digest(JSON.stringify(editableProfile(profile)))}
export function validateGoogleChanges(value:unknown) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'Supply a description or regular opening hours.')
 const input=value as Record<string,unknown>,keys=Object.keys(input)
 if(!keys.length||keys.some(key=>!['description','regularHours'].includes(key)))throw new ApiError(400,'Only business description and regular opening hours can be changed.')
 const changes:Record<string,unknown>={},body:Record<string,unknown>={},mask:string[]=[]
 if('description' in input){
  if(typeof input.description!=='string'||!input.description.trim()||Array.from(input.description.trim()).length>750)throw new ApiError(400,'Business description must contain 1–750 characters.')
  changes.description=input.description.trim();body.profile={description:changes.description};mask.push('profile.description')
 }
 if('regularHours' in input){
  const hours=input.regularHours as {periods?:HoursPeriod[]}
  if(!hours||!Array.isArray(hours.periods)||hours.periods.length<1||hours.periods.length>28)throw new ApiError(400,'Supply 1–28 valid opening periods.')
  for(const period of hours.periods){
   if(!period||typeof period!=='object'||!days.includes(period.openDay)||!days.includes(period.closeDay))throw new ApiError(400,'Choose a valid day for every opening period.')
   for(const time of [period.openTime,period.closeTime]){
    const hour=time?.hours??0,minute=time?.minutes??0
    if(!time||!Number.isInteger(hour)||hour<0||hour>24||!Number.isInteger(minute)||minute<0||minute>59||(hour===24&&minute!==0))throw new ApiError(400,'Use valid opening and closing times.')
   }
  }
  changes.regularHours=normalizeHours(hours);body.regularHours=changes.regularHours;mask.push('regularHours')
 }
 return {changes,body,updateMask:mask.join(',')}
}
export function changesMatch(profile:Location,changes:Record<string,unknown>) {
 const current=editableProfile(profile)
 return (!('description' in changes)||current.description===changes.description)&&(!('regularHours' in changes)||JSON.stringify(current.regularHours)===JSON.stringify(changes.regularHours))
}
export async function patchGoogleProfile(name:string,token:string,changes:unknown,validateOnly:boolean,fetcher:GoogleFetch=fetch) {
 const validated=validateGoogleChanges(changes),params=new URLSearchParams({updateMask:validated.updateMask,validateOnly:String(validateOnly)})
 return googleRequest<Location>('https://mybusinessbusinessinformation.googleapis.com/v1/'+locationName(name)+'?'+params,token,{method:'PATCH',body:JSON.stringify(validated.body)},fetcher)
}
export function googleReportingRange(now=new Date()) {
 const pacific=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
 const end=new Date(pacific+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-3)
 const start=new Date(end);start.setUTCDate(start.getUTCDate()-29)
 return {startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)}
}
export const GBP_METRICS=['BUSINESS_IMPRESSIONS_DESKTOP_MAPS','BUSINESS_IMPRESSIONS_DESKTOP_SEARCH','BUSINESS_IMPRESSIONS_MOBILE_MAPS','BUSINESS_IMPRESSIONS_MOBILE_SEARCH','BUSINESS_DIRECTION_REQUESTS','CALL_CLICKS','WEBSITE_CLICKS'] as const
export async function fetchGoogleMetrics(provider:'gbp'|'search_console',resource:string,token:string,fetcher:GoogleFetch=fetch) {
 const range=googleReportingRange(),observedAt=new Date().toISOString()
 if(provider==='search_console') {
  const url='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(resource)+'/searchAnalytics/query'
  type Row={keys?:string[];clicks:number;impressions:number;ctr:number}
  const base={...range,type:'web',dataState:'final'}
  const [summary,queries]=await Promise.all([
   googleRequest<{rows?:Row[]}>(url,token,{method:'POST',body:JSON.stringify(base)},fetcher),
   googleRequest<{rows?:Row[]}>(url,token,{method:'POST',body:JSON.stringify({...base,dimensions:['query'],rowLimit:100})},fetcher),
  ])
  const row=summary.rows?.[0]
  return {source:'Google Search Console Search Analytics API',observedAt,...range,state:row?'available':'no_data',clicks:row?.clicks??null,impressions:row?.impressions??null,ctr:row?.ctr??null,queries:(queries.rows||[]).map(item=>({query:item.keys?.[0]||'',clicks:item.clicks,impressions:item.impressions,ctr:item.ctr})),queriesAreTopRows:true,reportingLagDays:3}
 }
 const params=new URLSearchParams()
 for(const metric of GBP_METRICS)params.append('dailyMetrics',metric)
 for(const [key,date] of [['start_date',range.startDate],['end_date',range.endDate]]){const [year,month,day]=date.split('-');params.set('dailyRange.'+key.replace('_d','D')+'.year',String(Number(year)));params.set('dailyRange.'+key.replace('_d','D')+'.month',String(Number(month)));params.set('dailyRange.'+key.replace('_d','D')+'.day',String(Number(day)))}
 const result=await googleRequest<GooglePerformanceResponse>('https://businessprofileperformance.googleapis.com/v1/'+locationName(resource)+':fetchMultiDailyMetricsTimeSeries?'+params,token,{},fetcher)
 return {...googlePerformanceView(result,range),raw:result,source:'Google Business Profile Performance API',observedAt,...range,reportingLagDays:3}

}

type GooglePerformanceResponse={multiDailyMetricTimeSeries?:{dailyMetricTimeSeries?:{dailyMetric:string;timeSeries?:{datedValues?:{date:{year:number;month:number;day:number};value?:string}[]}}[]}[]}
function googlePerformanceView(result:GooglePerformanceResponse,range:{startDate:string;endDate:string}){
 const series=(result.multiDailyMetricTimeSeries||[]).flatMap(group=>group.dailyMetricTimeSeries||[])
 const daily=series.flatMap(item=>(item.timeSeries?.datedValues||[]).map(point=>({metric:item.dailyMetric,date:[point.date.year,String(point.date.month).padStart(2,'0'),String(point.date.day).padStart(2,'0')].join('-'),value:point.value===undefined?0:Number(point.value)}))).filter(point=>point.date>=range.startDate&&point.date<=range.endDate&&Number.isFinite(point.value)&&point.value>=0)
 const totals=Object.fromEntries(GBP_METRICS.map(metric=>{const points=daily.filter(point=>point.metric===metric),dates=new Set(points.map(point=>point.date));return [metric,points.length===30&&dates.size===30?points.reduce((sum,point)=>sum+point.value,0):null]}))
 return {state:daily.length?'available':'no_data',totals,daily,partial:GBP_METRICS.some(metric=>totals[metric]===null)}
}
export function stripGoogleMetricAggregation(value:unknown):unknown{
 if(!value||typeof value!=='object')return value
 const input=value as Record<string,unknown>
 if(input.source!=='Google Business Profile Performance API'||!input.raw)return value
 return {source:input.source,observedAt:input.observedAt,startDate:input.startDate,endDate:input.endDate,raw:input.raw,reportingLagDays:input.reportingLagDays,state:input.state}
}
export function googleMetricsForResponse(value:unknown):unknown{
 if(!value||typeof value!=='object')return value
 const input=value as Record<string,unknown>
 if(input.source!=='Google Business Profile Performance API'||!input.raw)return value
 const {raw,...metadata}=input
 return {...metadata,...googlePerformanceView(raw as GooglePerformanceResponse,{startDate:String(input.startDate),endDate:String(input.endDate)})}
}
