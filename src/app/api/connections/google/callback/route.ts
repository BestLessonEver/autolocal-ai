import {NextRequest,NextResponse} from 'next/server'
import {ApiError,apiErrorResponse,requireUser,requireOwnerSite} from '@/lib/owner-access'
import {googleProvider,requireGoogleConfiguration,GOOGLE_SCOPES} from '@/lib/google-config'
import {requestGoogleTokens,tokenBinding} from '@/lib/google-connections'
import {digest,openGoogleSecret,sealGoogleSecret} from '@/lib/google-vault'
import {appOrigin} from '@/lib/integration-config'
export async function GET(request:NextRequest) {
 try {
  const context=await requireUser(),params=request.nextUrl.searchParams,state=params.get('state'),browser=request.cookies.get('autolocal_google_oauth')?.value
  if(!state||!browser||state.length>100)throw new ApiError(400,'Google authorization expired. Start the connection again.')
  const stateHash=digest(state)
  const {data,error}=await context.db.rpc('consume_google_oauth_state',{p_state_hash:stateHash,p_browser_hash:digest(browser),p_user_id:context.user.id})
  if(error)throw new ApiError(503,'Google authorization could not be verified.')
  const saved=data?.[0]
  if(!saved)throw new ApiError(400,'Google authorization expired or was already used. Start again.')
  const {site}=await requireOwnerSite({siteId:saved.site_id},context),provider=googleProvider(saved.provider),config=requireGoogleConfiguration(provider)
  if(params.has('error'))throw new ApiError(400,'Google connection was not approved. You can start again from your dashboard.')
  const code=params.get('code');if(!code)throw new ApiError(400,'Google did not return an authorization code.')
  const verifier=openGoogleSecret<string>(saved.verifier_ciphertext,'google-state:'+stateHash)
  const token=await requestGoogleTokens(new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'authorization_code',code,redirect_uri:config.redirectUri,code_verifier:verifier}))
  if(!token.refresh_token||!token.scope?.split(' ').includes(GOOGLE_SCOPES[provider]))throw new ApiError(400,'Google did not grant the required offline access. Reconnect and approve the requested permission.')
  const {error:saveError}=await context.db.from('google_connections').upsert({
   site_id:site.id,owner_id:context.user.id,provider,status:'needs_selection',
   tokens_ciphertext:sealGoogleSecret({access_token:token.access_token,refresh_token:token.refresh_token},tokenBinding(site.id,provider)),
   token_expires_at:new Date(Date.now()+Number(token.expires_in)*1000).toISOString(),granted_scope:GOOGLE_SCOPES[provider],
   resource_name:null,resource_label:null,account_name:null,profile:null,metrics:null,profile_revision:null,last_synced_at:null,error_code:null,updated_at:new Date().toISOString()
  },{onConflict:'site_id,provider'})
  if(saveError)throw new ApiError(503,'Google access could not be saved. Reconnect from your dashboard.')
  const response=NextResponse.redirect(appOrigin()+'/dashboard?siteId='+encodeURIComponent(site.id)+'&tab=visibility&google_connected='+provider)
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer')
  response.cookies.delete({name:'autolocal_google_oauth',path:'/api/connections/google/callback'})
  return response
 }catch(error){const response=apiErrorResponse(error);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response}
}
