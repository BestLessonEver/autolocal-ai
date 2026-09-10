import type {SupabaseClient} from '@supabase/supabase-js'
import {ApiError,requireOwnerSite} from '@/lib/owner-access'
import {googleProvider,requireGoogleConfiguration,GOOGLE_SCOPES,type GoogleProvider} from '@/lib/google-config'
import {openGoogleSecret,sealGoogleSecret} from '@/lib/google-vault'
import {GoogleApiError,googleMetricsForResponse,type GoogleFetch} from '@/lib/google-api'
export type GoogleTokens={access_token:string;refresh_token:string}
export type GoogleConnection={
 id:string;created_at?:string;site_id:string;owner_id:string;provider:GoogleProvider;status:string;tokens_ciphertext:string|null;token_expires_at:string|null;granted_scope:string|null;
 resource_name:string|null;resource_label:string|null;account_name:string|null;profile:unknown;metrics:unknown;profile_revision:string|null;last_synced_at:string|null;error_code:string|null;
}
function currentGoogleCache(value:unknown,lastSyncedAt:string|null|undefined){
 if(!value||typeof value!=='object')return null
 const stamp=Date.parse(String((value as Record<string,unknown>).observedAt||lastSyncedAt||''))
 return Number.isFinite(stamp)&&stamp>=Date.now()-29*86400000?value:null
}
export function safeGoogleConnection(row:GoogleConnection|undefined,provider:GoogleProvider) {
 const profile=currentGoogleCache(row?.profile,row?.last_synced_at),metrics=currentGoogleCache(row?.metrics,row?.last_synced_at)
 return {provider,status:row?.status||'not_connected',resourceName:row?.resource_name||null,resourceLabel:row&&(Date.parse(row.last_synced_at||row.created_at||'')>=Date.now()-29*86400000)?row.resource_label:null,lastSyncedAt:row?.last_synced_at||null,
  error:row?.error_code?{code:row.error_code,message:googleErrorMessage(row.error_code)}:null,profile,metrics:googleMetricsForResponse(metrics),revision:profile?row?.profile_revision||null:null}
}
export function googleErrorMessage(code:string) {
 return code==='reauth_required'?'Reconnect Google to restore access.':code==='permission_required'?'Google denied access. Check API approval and account permissions.':code==='quota_exceeded'?'Google request limit reached. Try again later.':'Google data is temporarily unavailable. Retry the connection.'
}
export async function googleConnectionContext(siteId:unknown,providerValue:unknown) {
 if(typeof siteId!=='string'||!siteId)throw new ApiError(400,'Choose a business website.')
 const context=await requireOwnerSite({siteId}),provider=googleProvider(providerValue)
 const {data,error}=await context.db.from('google_connections').select('*').eq('site_id',context.site.id).eq('provider',provider).maybeSingle()
 if(error)throw new ApiError(503,'Google connections are temporarily unavailable. Setup may be incomplete.')
 if(data&&data.owner_id!==context.user.id)throw new ApiError(403,'This Google connection belongs to a previous account owner. Contact support to reconcile access.')
 return {...context,provider,connection:data as GoogleConnection|null}
}
export {bindVerifiedSiteOwner as bindGoogleSiteOwner} from '@/lib/owner-access'
export function tokenBinding(siteId:string,provider:GoogleProvider){return 'google-tokens:'+siteId+':'+provider}
type TokenResponse={access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error?:string}
export async function requestGoogleTokens(body:URLSearchParams,fetcher:GoogleFetch=fetch):Promise<TokenResponse> {
 let response:Response
 try{response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000),redirect:'error'})}catch{throw new GoogleApiError('provider_unavailable')}
 let result:TokenResponse
 try{result=await response.json()}catch{throw new GoogleApiError('invalid_provider_response')}
 if(!response.ok||!result.access_token||!Number.isFinite(result.expires_in)||Number(result.expires_in)<=0)throw new GoogleApiError(result.error==='invalid_grant'?'reauth_required':'provider_unavailable',result.error==='invalid_grant'?401:502)
 return result
}
export async function googleAccessToken(connection:GoogleConnection,db:SupabaseClient,fetcher:GoogleFetch=fetch) {
 requireGoogleConfiguration(connection.provider)
 if(!connection.tokens_ciphertext||connection.status==='disconnected')throw new ApiError(409,'Connect Google before continuing.')
 let tokens:GoogleTokens
 try{tokens=openGoogleSecret<GoogleTokens>(connection.tokens_ciphertext,tokenBinding(connection.site_id,connection.provider))}catch{throw new ApiError(503,'Stored Google access could not be opened. Contact support before reconnecting.')}
 if(connection.token_expires_at&&Date.parse(connection.token_expires_at)>Date.now()+60000)return tokens.access_token
 const config=requireGoogleConfiguration(connection.provider)
 try{
  const fresh=await requestGoogleTokens(new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'refresh_token',refresh_token:tokens.refresh_token}),fetcher)
  tokens={access_token:fresh.access_token!,refresh_token:fresh.refresh_token||tokens.refresh_token}
  const encrypted=sealGoogleSecret(tokens,tokenBinding(connection.site_id,connection.provider)),expiresAt=new Date(Date.now()+Number(fresh.expires_in)*1000).toISOString()
  const {data,error}=await db.from('google_connections').update({tokens_ciphertext:encrypted,token_expires_at:expiresAt,updated_at:new Date().toISOString()}).eq('id',connection.id).eq('tokens_ciphertext',connection.tokens_ciphertext).select('id').maybeSingle()
  if(error||!data)throw new ApiError(409,'Google connection changed during refresh. Retry or reconnect.')
  connection.tokens_ciphertext=encrypted;connection.token_expires_at=expiresAt
  return tokens.access_token
 }catch(error){
  await rememberGoogleError(db,connection,error)
  throw error
 }
}
export async function rememberGoogleError(db:SupabaseClient,connection:GoogleConnection,error:unknown) {
 const code=error instanceof GoogleApiError?error.code:'provider_unavailable'
 const status=['reauth_required','permission_required'].includes(code)?code:connection.status
 const {error:saveError}=await db.from('google_connections').update({status,error_code:code,updated_at:new Date().toISOString()}).eq('id',connection.id).eq('tokens_ciphertext',connection.tokens_ciphertext)
 if(saveError)throw new ApiError(503,'Google connection status could not be saved.')
}
export function buildGoogleAuthorizationUrl(provider:GoogleProvider,state:string,challenge:string) {
 const config=requireGoogleConfiguration(provider),params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:GOOGLE_SCOPES[provider],access_type:'offline',prompt:'consent select_account',include_granted_scopes:'false',state,code_challenge:challenge,code_challenge_method:'S256'})
 return 'https://accounts.google.com/o/oauth2/v2/auth?'+params
}
