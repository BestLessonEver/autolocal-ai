import {ApiError,apiErrorResponse} from '@/lib/owner-access'
import {googleConnectionContext,googleAccessToken,rememberGoogleError} from '@/lib/google-connections'
import {listGoogleResources} from '@/lib/google-api'
export async function GET(request:Request) {
 try{
  const params=new URL(request.url).searchParams,context=await googleConnectionContext(params.get('siteId'),params.get('provider'))
  if(!context.connection)throw new ApiError(409,'Connect Google before choosing a property.')
  try{return Response.json(await listGoogleResources(context.provider,await googleAccessToken(context.connection,context.db)))}
  catch(error){await rememberGoogleError(context.db,context.connection,error);throw error}
 }catch(error){return apiErrorResponse(error)}
}
