import {ApiError,apiErrorResponse} from '@/lib/owner-access'
import {googleConnectionContext,googleAccessToken,rememberGoogleError,safeGoogleConnection,type GoogleConnection} from '@/lib/google-connections'
import {listGoogleResources} from '@/lib/google-api'
export async function POST(request:Request) {
 try{
  const body=await request.json(),context=await googleConnectionContext(body.siteId,body.provider),{db,connection,provider}=context
  if(!connection)throw new ApiError(409,'Connect Google before choosing a property.')
  let resources
  try{resources=await listGoogleResources(provider,await googleAccessToken(connection,db))}
  catch(error){await rememberGoogleError(db,connection,error);throw error}
  const selected=resources.resources.find(resource=>resource.name===body.resourceName)
  if(!selected)throw new ApiError(403,'Choose a property available to this connected Google account.')
  const {data,error}=await db.from('google_connections').update({resource_name:selected.name,resource_label:selected.label,account_name:'accountName' in selected?selected.accountName:null,status:'connected',error_code:null,profile:null,metrics:null,profile_revision:null,last_synced_at:null,updated_at:new Date().toISOString()}).eq('id',connection.id).eq('tokens_ciphertext',connection.tokens_ciphertext).select('*').single()
  if(error)throw new ApiError(503,'Selected Google property could not be saved.')
  return Response.json({connection:safeGoogleConnection(data as GoogleConnection,provider)})
 }catch(error){return apiErrorResponse(error)}
}
