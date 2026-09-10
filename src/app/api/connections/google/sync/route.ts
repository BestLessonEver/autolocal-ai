import {ApiError,apiErrorResponse} from '@/lib/owner-access'
import {googleConnectionContext} from '@/lib/google-connections'
import {syncGoogleConnection} from '@/lib/google-sync'
export async function POST(request:Request) {
 try{
  const body=await request.json(),{db,connection}=await googleConnectionContext(body.siteId,body.provider)
  if(!connection?.resource_name)throw new ApiError(409,'Choose a Google property before syncing.')
  return Response.json(await syncGoogleConnection(db,connection))
 }catch(error){return apiErrorResponse(error)}
}
