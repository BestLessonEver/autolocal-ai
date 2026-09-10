import {ApiError,apiErrorResponse} from '@/lib/owner-access'
import {googleConnectionContext} from '@/lib/google-connections'
import {applyGoogleProposal,type GoogleProposal} from '@/lib/google-proposals'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params,body=await request.json(),{db,user,site,connection}=await googleConnectionContext(body.siteId,'gbp')
  if(!connection?.resource_name)throw new ApiError(409,'Connect and choose a Google Business Profile first.')
  const {data,error}=await db.from('google_change_proposals').select('*').eq('id',id).eq('site_id',site.id).eq('owner_id',user.id).maybeSingle()
  if(error)throw new ApiError(503,'The Google change draft is unavailable.')
  if(!data)throw new ApiError(404,'Change draft not found.')
  return Response.json(await applyGoogleProposal({db,connection,proposal:data as GoogleProposal,ownerId:user.id,expectedRevision:body.expectedRevision,confirm:body.confirm}))
 }catch(error){return apiErrorResponse(error)}
}
