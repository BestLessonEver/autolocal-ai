import {ApiError,apiErrorResponse} from '@/lib/owner-access'
import {googleConnectionContext,tokenBinding,type GoogleTokens} from '@/lib/google-connections'
import {openGoogleSecret} from '@/lib/google-vault'
export async function DELETE(request:Request) {
 try{
  const params=new URL(request.url).searchParams,{connection,db,provider,site}=await googleConnectionContext(params.get('siteId'),params.get('provider'))
  if(!connection)return Response.json({disconnected:true,revoked:true})
  const {error}=await db.from('google_connections').update({tokens_ciphertext:null,token_expires_at:null,granted_scope:null,resource_name:null,resource_label:null,account_name:null,profile:null,metrics:null,profile_revision:null,last_synced_at:null,status:'disconnected',error_code:null,updated_at:new Date().toISOString()}).eq('id',connection.id)
  if(error)throw new ApiError(503,'Google access could not be removed. Retry disconnecting.')
  let revoked=!connection.tokens_ciphertext
  if(connection.tokens_ciphertext){
   try{
    const tokens=openGoogleSecret<GoogleTokens>(connection.tokens_ciphertext,tokenBinding(site.id,provider))
    const response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh_token||tokens.access_token}),signal:AbortSignal.timeout(15000),redirect:'error'})
    revoked=response.ok
   }catch{revoked=false}
  }
  return Response.json({disconnected:true,revoked,message:revoked?'Disconnected. Other Google connections for this app may need to be reconnected.':'Local access removed. Google revocation could not be confirmed; remove AutoLocal from your Google account permissions.'})
 }catch(error){return apiErrorResponse(error)}
}
