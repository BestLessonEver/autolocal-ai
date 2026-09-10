import type {SupabaseClient} from '@supabase/supabase-js'
import {ApiError} from '@/lib/owner-access'
import {googleAccessToken,rememberGoogleError,type GoogleConnection} from '@/lib/google-connections'
import {requireGoogleConfiguration} from '@/lib/google-config'
import {fetchGoogleProfile,profileRevision,patchGoogleProfile,changesMatch,editableProfile,validateGoogleChanges,GoogleApiError,type GoogleFetch} from '@/lib/google-api'
export type GoogleProposal={id:string;site_id:string;connection_id:string;owner_id:string;resource_name:string;status:string;base_revision:string;before_profile:Record<string,unknown>;changes:Record<string,unknown>;provider_result:unknown;created_at:string;approved_at:string|null;applied_at:string|null;error_code:string|null}
export function safeGoogleProposal(row:GoogleProposal){
 const expired=Date.parse(row.created_at)<Date.now()-29*86400000
 return {id:row.id,revision:row.base_revision,status:expired&&row.status==='draft'?'stale':row.status,changes:row.changes,before:expired?{}:row.before_profile,createdAt:row.created_at,approvedAt:row.approved_at,appliedAt:row.applied_at,result:expired?null:row.provider_result,errorCode:row.error_code}
}
export async function createGoogleProposalDraft(input:{db:SupabaseClient;connection:GoogleConnection;ownerId:string;siteId:string;changes:unknown;expectedRevision:unknown},fetcher:GoogleFetch=fetch){
 const {db,connection,ownerId,siteId}=input
 if(connection.owner_id!==ownerId||connection.site_id!==siteId||connection.provider!=='gbp'||!connection.resource_name)throw new ApiError(409,'Connect and choose the Google Business Profile for this website first.')
 if(typeof input.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedRevision))throw new ApiError(400,'Refresh the Google profile before creating a change draft.')
 const {changes}=validateGoogleChanges(input.changes)
 let profile
 try{profile=await fetchGoogleProfile(connection.resource_name,await googleAccessToken(connection,db,fetcher),fetcher)}
 catch(error){await rememberGoogleError(db,connection,error);throw error}
 const revision=profileRevision(profile)
 if(revision!==input.expectedRevision)throw new ApiError(409,'Google details changed since you opened this editor. Refresh the profile and review your changes again.')
 const {data,error}=await db.from('google_change_proposals').insert({site_id:siteId,owner_id:ownerId,connection_id:connection.id,resource_name:connection.resource_name,base_revision:revision,before_profile:editableProfile(profile),changes}).select('*').single()
 if(error)throw new ApiError(503,'Google change draft could not be saved.')
 return {proposal:safeGoogleProposal(data as GoogleProposal),message:'Draft saved. Review and approve it before any Google profile changes.'}
}
async function finish(db:SupabaseClient,id:string,status:string,result:unknown,errorCode:string|null=null){
 const {error}=await db.rpc('finish_google_proposal',{p_id:id,p_status:status,p_result:result,p_error:errorCode})
 if(error)throw new ApiError(503,'The Google result could not be recorded. Do not resubmit; sync and contact support to reconcile this change.')
}
export async function applyGoogleProposal(input:{db:SupabaseClient;connection:GoogleConnection;proposal:GoogleProposal;ownerId:string;expectedRevision:unknown;confirm:unknown},fetcher:GoogleFetch=fetch){
 const {db,connection,proposal,ownerId}=input
 if(input.confirm!==true||input.expectedRevision!==proposal.base_revision)throw new ApiError(400,'Review this exact draft and confirm before applying it.')
 if(proposal.owner_id!==ownerId||proposal.connection_id!==connection.id||proposal.site_id!==connection.site_id||proposal.resource_name!==connection.resource_name)throw new ApiError(409,'The connected Google property changed. Create a new draft.')
 if(proposal.status==='applied')return {applied:true,idempotent:true,proposal:safeGoogleProposal(proposal),message:'Google previously accepted this change. Public display can still be subject to Google review.'}
 if(Date.parse(proposal.created_at)<Date.now()-29*86400000)throw new ApiError(409,'This draft expired. Sync and create a fresh Google change draft.')
 if(proposal.status!=='draft')throw new ApiError(409,'This change has already been attempted. Review its recorded result before creating another draft.')
 requireGoogleConfiguration('gbp',true)
 const token=await googleAccessToken(connection,db,fetcher)
 const {data,error}=await db.rpc('claim_google_proposal',{p_id:proposal.id,p_owner_id:ownerId,p_revision:proposal.base_revision})
 if(error||!data?.[0])throw new ApiError(409,'Another change is being processed, or this draft was already approved.')
 let sent=false,acceptedWrite=false
 try{
  const fresh=await fetchGoogleProfile(proposal.resource_name,token,fetcher)
  if(profileRevision(fresh)!==proposal.base_revision){
   await finish(db,proposal.id,'stale',{observedAt:new Date().toISOString(),current:editableProfile(fresh)},'revision_changed')
   throw new ApiError(409,'Google details changed after this draft was created. Sync and review a new draft.')
  }
  await patchGoogleProfile(proposal.resource_name,token,proposal.changes,true,fetcher)
  sent=true
  const accepted=await patchGoogleProfile(proposal.resource_name,token,proposal.changes,false,fetcher)
  acceptedWrite=true
  const observed=await fetchGoogleProfile(proposal.resource_name,token,fetcher)
  const matched=changesMatch(observed,proposal.changes),observedAt=new Date().toISOString()
  const evidence={observedAt,accepted:editableProfile(accepted),readback:editableProfile(observed),matchesRequested:matched,hasPendingEdits:observed.metadata?.hasPendingEdits??null,publicDisplayVerified:false}
  await finish(db,proposal.id,matched?'applied':'needs_review',evidence,matched?null:'readback_differs')
  const {error:saveError}=await db.from('google_connections').update({profile:{...observed,source:'Google Business Information API',observedAt},profile_revision:profileRevision(observed),error_code:null,updated_at:observedAt}).eq('id',connection.id).eq('resource_name',proposal.resource_name)
  if(saveError)throw new ApiError(503,'Google result was recorded, but the dashboard snapshot could not be refreshed. Sync to refresh it.')
  return {applied:matched,needsReview:!matched,message:matched?'Google accepted the change and its API readback matches. Public display may still require Google review.':'Google accepted the request, but its readback differs. Review Google directly before retrying.',result:evidence}
 }catch(error){
  // A durable final result must never be overwritten by a later snapshot failure.
  if(error instanceof ApiError&&!(error instanceof GoogleApiError))throw error
  const code=error instanceof GoogleApiError?error.code:'provider_unavailable'
  const unknownOutcome=acceptedWrite||(sent&&(!(error instanceof GoogleApiError)||error.uncertain))
  await finish(db,proposal.id,unknownOutcome?'needs_review':'rejected',{observedAt:new Date().toISOString(),requestMayHaveApplied:unknownOutcome},code)
  if(unknownOutcome)throw new ApiError(409,'Google did not confirm the final result. Review the profile before creating another change; this request will not be automatically repeated.')
  throw error
 }
}
