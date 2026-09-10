import type {SupabaseClient} from '@supabase/supabase-js'
import {ApiError} from '@/lib/owner-access'
import {googleAccessToken,rememberGoogleError,safeGoogleConnection,type GoogleConnection} from '@/lib/google-connections'
import {fetchGoogleProfile,fetchGoogleMetrics,profileRevision,GoogleApiError,stripGoogleMetricAggregation,type GoogleFetch} from '@/lib/google-api'
export async function syncGoogleConnection(db:SupabaseClient,connection:GoogleConnection,fetcher:GoogleFetch=fetch) {
 const provider=connection.provider
 if(!connection.resource_name)throw new ApiError(409,'Choose a Google property before syncing.')
  try{
   const token=await googleAccessToken(connection,db,fetcher),observedAt=new Date().toISOString()
   const profile=provider==='gbp'?await fetchGoogleProfile(connection.resource_name,token,fetcher):null
   let metrics:unknown,metricsError:GoogleApiError|null=null
   try{metrics=await fetchGoogleMetrics(provider,connection.resource_name,token,fetcher)}
   catch(error){
    if(provider!=='gbp'||!(error instanceof GoogleApiError))throw error
    metricsError=error;metrics={state:'unavailable',source:'Google Business Profile Performance API',observedAt,error:{code:error.code,message:error.message},totals:null,daily:[]}
   }
   const {data,error}=await db.from('google_connections').update({
    profile:profile?{...profile,source:'Google Business Information API',observedAt}:null,
    profile_revision:profile?profileRevision(profile):null,metrics:stripGoogleMetricAggregation(metrics),...(profile?{resource_label:typeof profile.title==='string'?profile.title:null}:{}),status:metricsError?.code==='reauth_required'?'reauth_required':'connected',error_code:metricsError?.code||null,
    last_synced_at:observedAt,updated_at:observedAt
   }).eq('id',connection.id).eq('tokens_ciphertext',connection.tokens_ciphertext).eq('resource_name',connection.resource_name).select('*').single()
   if(error)throw new ApiError(503,'Google data was read but could not be saved.')
   return {connection:safeGoogleConnection(data as GoogleConnection,provider),partial:!!metricsError}
  }catch(error){await rememberGoogleError(db,connection,error);throw error}
}
