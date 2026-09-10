import {ApiError,apiErrorResponse,requireOwnerSite} from '@/lib/owner-access'
import {getGoogleConnectionHealth,type GoogleProvider} from '@/lib/google-config'
import {safeGoogleConnection,type GoogleConnection} from '@/lib/google-connections'
export async function GET(request:Request) {
 try {
  const siteId=new URL(request.url).searchParams.get('siteId')
  if(!siteId)throw new ApiError(400,'Choose a business website.')
  const {db,site,user}=await requireOwnerSite({siteId})
  const {data,error}=await db.from('google_connections').select('*').eq('site_id',site.id).eq('owner_id',user.id)
  if(error)throw new ApiError(503,'Google connections are unavailable. Setup may be incomplete.')
  return Response.json({setup:getGoogleConnectionHealth(),connections:(['gbp','search_console'] as GoogleProvider[]).map(provider=>safeGoogleConnection((data as GoogleConnection[]).find(row=>row.provider===provider),provider))})
 }catch(error){return apiErrorResponse(error)}
}
