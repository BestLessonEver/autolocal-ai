import {ApiError,apiErrorResponse} from '@/lib/owner-access'
import {googleConnectionContext} from '@/lib/google-connections'
import {safeGoogleProposal,createGoogleProposalDraft,type GoogleProposal} from '@/lib/google-proposals'
export async function GET(request:Request){
 try{
  const {db,site}=await googleConnectionContext(new URL(request.url).searchParams.get('siteId'),'gbp')
  const {data,error}=await db.from('google_change_proposals').select('*').eq('site_id',site.id).order('created_at',{ascending:false}).limit(50)
  if(error)throw new ApiError(503,'Google change history is unavailable.')
  return Response.json({proposals:(data as GoogleProposal[]).map(safeGoogleProposal)})
 }catch(error){return apiErrorResponse(error)}
}
export async function POST(request:Request){
 try{
  const body=await request.json(),{db,user,site,connection}=await googleConnectionContext(body.siteId,'gbp')
  if(!connection?.resource_name)throw new ApiError(409,'Connect and choose a Google Business Profile first.')
  return Response.json(await createGoogleProposalDraft({db,connection,ownerId:user.id,siteId:site.id,changes:body.changes,expectedRevision:body.expectedRevision}),{status:201})
 }catch(error){return apiErrorResponse(error)}
}
