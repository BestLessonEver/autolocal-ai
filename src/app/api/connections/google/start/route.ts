import {NextResponse} from 'next/server'
import {apiErrorResponse,ApiError} from '@/lib/owner-access'
import {googleConnectionContext,buildGoogleAuthorizationUrl,bindGoogleSiteOwner} from '@/lib/google-connections'
import {requireGoogleConfiguration} from '@/lib/google-config'
import {digest,newOAuthChallenge,sealGoogleSecret} from '@/lib/google-vault'
export async function POST(request:Request) {
 try {
  const body=await request.json(),{db,user,site,provider}=await googleConnectionContext(body.siteId,body.provider)
  const config=requireGoogleConfiguration(provider),challenge=newOAuthChallenge(),stateHash=digest(challenge.state)
  await bindGoogleSiteOwner(db,site,user)
  const {error}=await db.from('google_oauth_states').insert({state_hash:stateHash,browser_hash:digest(challenge.browser),user_id:user.id,site_id:site.id,provider,verifier_ciphertext:sealGoogleSecret(challenge.verifier,'google-state:'+stateHash),expires_at:new Date(Date.now()+600000).toISOString()})
  if(error)throw new ApiError(503,'Google authorization could not be started.')
  const response=NextResponse.json({authorizationUrl:buildGoogleAuthorizationUrl(provider,challenge.state,challenge.challenge)},{headers:{'Cache-Control':'no-store'}})
  response.cookies.set('autolocal_google_oauth',challenge.browser,{httpOnly:true,sameSite:'lax',secure:config.redirectUri.startsWith('https:'),maxAge:600,path:'/api/connections/google/callback'})
  return response
 }catch(error){return apiErrorResponse(error)}
}
