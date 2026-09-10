import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import type {SupabaseClient} from '@supabase/supabase-js'
import {sealGoogleSecret,openGoogleSecret,newOAuthChallenge,digest} from '../src/lib/google-vault'
import {GOOGLE_SCOPES,getGoogleConnectionHealth,requireGoogleConfiguration} from '../src/lib/google-config'
import {bindGoogleSiteOwner,buildGoogleAuthorizationUrl,safeGoogleConnection,googleAccessToken,tokenBinding,type GoogleConnection} from '../src/lib/google-connections'
import {GoogleApiError,googleRequest,fetchGoogleMetrics,googleReportingRange,GBP_METRICS,listGoogleResources,profileRevision,validateGoogleChanges,patchGoogleProfile,stripGoogleMetricAggregation,googleMetricsForResponse,type GoogleFetch} from '../src/lib/google-api'
import {applyGoogleProposal,createGoogleProposalDraft,type GoogleProposal} from '../src/lib/google-proposals'

const fixtureEnv={GOOGLE_OAUTH_CLIENT_ID:'fixture-client',GOOGLE_OAUTH_CLIENT_SECRET:'fixture-secret',GOOGLE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS:'true',GOOGLE_BUSINESS_PROFILE_API_APPROVED:'true',AUTOLOCAL_ENABLE_GBP_WRITES:'true',NEXT_PUBLIC_SITE_URL:'https://autolocal.example.invalid'}
Object.assign(process.env,fixtureEnv)
const connection:GoogleConnection={id:'connection-a',owner_id:'owner-a',site_id:'site-a',provider:'gbp',status:'connected',tokens_ciphertext:sealGoogleSecret({access_token:'access-fixture',refresh_token:'refresh-fixture'},tokenBinding('site-a','gbp')),token_expires_at:new Date(Date.now()+3600000).toISOString(),granted_scope:GOOGLE_SCOPES.gbp,resource_name:'locations/123',resource_label:'Fixture Shop',account_name:'accounts/1',profile:null,metrics:null,profile_revision:null,last_synced_at:null,error_code:null}
const profile={name:'locations/123',profile:{description:'Existing factual business description.'}}
const proposal:GoogleProposal={id:'proposal-a',site_id:'site-a',connection_id:'connection-a',owner_id:'owner-a',resource_name:'locations/123',status:'draft',base_revision:profileRevision(profile),before_profile:{description:profile.profile.description},changes:{description:'Reviewed replacement description.'},provider_result:null,created_at:new Date().toISOString(),approved_at:null,applied_at:null,error_code:null}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status})
function mockDatabase(){
 const calls:{name:string;args:Record<string,unknown>}[]=[],updates:Record<string,unknown>[]=[]
 const query={eq:()=>query,select:()=>query,maybeSingle:async()=>({data:{id:'connection-a'},error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)}
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:name==='claim_google_proposal'?[proposal]:null,error:null}},from:()=>({update:(value:Record<string,unknown>)=>{updates.push(value);return query}})} as unknown as SupabaseClient
 return {db,calls,updates}
}
test('vault binds ciphertext to one owner site/provider and rejects tampering',()=>{
 const encrypted=sealGoogleSecret({refresh_token:'private-fixture'},'site-one')
 assert.ok(!encrypted.includes('private-fixture'))
 assert.deepEqual(openGoogleSecret(encrypted,'site-one'),{refresh_token:'private-fixture'})
 assert.throws(()=>openGoogleSecret(encrypted,'site-two'))
 const parts=encrypted.split('.');parts[3]=(parts[3][0]==='a'?'b':'a')+parts[3].slice(1)
 assert.throws(()=>openGoogleSecret(parts.join('.'),'site-one'))
 const safe=JSON.stringify(safeGoogleConnection(connection,'gbp'))
 for(const secret of ['access-fixture','refresh-fixture','tokens_ciphertext','owner_id','account_name'])assert.ok(!safe.includes(secret))
})
test('OAuth uses distinct minimum scopes, PKCE and offline access; flags fail closed',()=>{
 const first=newOAuthChallenge(),second=newOAuthChallenge()
 assert.notEqual(first.state,second.state);assert.equal(first.state.length,43)
 assert.notEqual(digest(first.browser),digest(second.browser))
 for(const provider of ['gbp','search_console'] as const){
  const url=new URL(buildGoogleAuthorizationUrl(provider,first.state,first.challenge))
  assert.equal(url.searchParams.get('scope'),GOOGLE_SCOPES[provider])
  assert.equal(url.searchParams.get('state'),first.state);assert.equal(url.searchParams.get('code_challenge_method'),'S256')
  assert.equal(url.searchParams.get('access_type'),'offline')
  assert.ok(!url.toString().includes('fixture-secret'))
 }
 process.env.AUTOLOCAL_ENABLE_GBP_WRITES='false'
 assert.equal(getGoogleConnectionHealth().profileWritesEnabled,false)
 assert.throws(()=>requireGoogleConfiguration('gbp',true),/not enabled/)
 process.env.AUTOLOCAL_ENABLE_GBP_WRITES='true'
})
test('Google state is one-time and bound to browser, authenticated user and expiry; tables and RPCs are private',async()=>{
 const db=new PGlite()
 try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE website_previews(id uuid PRIMARY KEY);GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;")
  const migration=readFileSync('supabase/migrations/202609101100_google_connections.sql','utf8')
  await db.exec(migration);await db.exec(migration)
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',site='33333333-3333-4333-8333-333333333333'
  await db.query('INSERT INTO auth.users VALUES($1),($2)',[owner,other]);await db.query('INSERT INTO website_previews VALUES($1)',[site])
  await db.query("INSERT INTO google_oauth_states(state_hash,browser_hash,user_id,site_id,provider,verifier_ciphertext,expires_at) VALUES('state','browser',$1,$2,'gbp','cipher',now()+interval '10 minutes'),('expired','browser',$1,$2,'gbp','cipher',now()-interval '1 minute')",[owner,site])
  await db.exec('SET ROLE service_role')
  const consume=async(state:string,browser:string,user:string)=>(await db.query('SELECT * FROM consume_google_oauth_state($1,$2,$3)',[state,browser,user])).rows
  assert.equal((await consume('state','wrong-browser',owner)).length,0)
  assert.equal((await consume('state','browser',other)).length,0)
  assert.equal((await consume('expired','browser',owner)).length,0)
  assert.equal((await consume('state','browser',owner)).length,1)
  assert.equal((await consume('state','browser',owner)).length,0)
  const result=await db.query<{id:string}>("INSERT INTO google_connections(site_id,owner_id,provider,status,resource_name) VALUES($1,$2,'gbp','connected','locations/123') RETURNING id",[site,owner])
  const create=async()=>(await db.query<{id:string}>("INSERT INTO google_change_proposals(site_id,connection_id,owner_id,resource_name,base_revision,before_profile,changes) VALUES($1,$2,$3,'locations/123','revision','{}','{}') RETURNING id",[site,result.rows[0].id,owner])).rows[0].id
  const first=await create(),second=await create()
  assert.equal((await db.query('SELECT * FROM claim_google_proposal($1,$2,$3)',[first,other,'revision'])).rows.length,0)
  assert.equal((await db.query('SELECT * FROM claim_google_proposal($1,$2,$3)',[first,owner,'wrong'])).rows.length,0)
  assert.equal((await db.query('SELECT * FROM claim_google_proposal($1,$2,$3)',[first,owner,'revision'])).rows.length,1)
  assert.equal((await db.query('SELECT * FROM claim_google_proposal($1,$2,$3)',[first,owner,'revision'])).rows.length,0)
  await assert.rejects(db.query('SELECT * FROM claim_google_proposal($1,$2,$3)',[second,owner,'revision']),/unique constraint/)
  await db.query("SELECT finish_google_proposal($1,'applied',$2,null)",[first,{matchesRequested:true}])
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM google_change_events')).rows[0].n,2)
  await assert.rejects(db.query("SELECT finish_google_proposal($1,'applied','{}',null)",[first]),/not applying/)
  await db.query("UPDATE google_connections SET tokens_ciphertext='retained-encrypted-grant',profile=$1,metrics=$2,last_synced_at=now()-interval '30 days'",[{observedAt:new Date(Date.now()-30*86400000).toISOString(),profile:{description:'Expired Google content'}},{observedAt:new Date(Date.now()-30*86400000).toISOString(),raw:{}}])
  await db.query("UPDATE google_change_proposals SET before_profile=$1,created_at=now()-interval '30 days' WHERE id=$2",[{description:'Expired before-value'},first])
  await db.exec("UPDATE google_change_events SET created_at=now()-interval '30 days'")
  await db.exec('SELECT expire_google_cached_content()')
  const retained=(await db.query<{profile:null;metrics:null;tokens_ciphertext:string}>('SELECT profile,metrics,tokens_ciphertext FROM google_connections')).rows[0]
  assert.equal(retained.profile,null);assert.equal(retained.metrics,null);assert.equal(retained.tokens_ciphertext,'retained-encrypted-grant')
  assert.deepEqual((await db.query<{before_profile:unknown}>('SELECT before_profile FROM google_change_proposals WHERE id=$1',[first])).rows[0].before_profile,{})
  assert.deepEqual((await db.query<{evidence:unknown}>("SELECT evidence FROM google_change_events WHERE source='Google Business Information API'")).rows[0].evidence,{})
  await db.exec('RESET ROLE')
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role)
   for(const table of ['google_connections','google_oauth_states','google_change_proposals','google_change_events'])await assert.rejects(db.query('SELECT * FROM '+table),/permission denied/)
   await assert.rejects(db.query("SELECT * FROM consume_google_oauth_state('state','browser',$1)",[owner]),/permission denied/)
   await assert.rejects(db.query('SELECT expire_google_cached_content()'),/permission denied/)
   await db.exec('RESET ROLE')
  }
 }finally{await db.close()}
})
test('resource selection candidates exclude unverified Search Console access and preserve account ownership',async()=>{
 const sc=await listGoogleResources('search_console','token',async()=>json({siteEntry:[{siteUrl:'https://verified.invalid/',permissionLevel:'siteOwner'},{siteUrl:'https://unverified.invalid/',permissionLevel:'siteUnverifiedUser'}]}))
 assert.equal(sc.resources.length,1);assert.equal(sc.resources[0].name,'https://verified.invalid/')
 const urls:string[]=[]
 const gbp=await listGoogleResources('gbp','token',async(input)=>{const url=String(input);urls.push(url);return url.includes('accountmanagement')?json({accounts:[{name:'accounts/12',accountName:'Owner account'}]}):json({locations:[{name:'locations/123',title:'Fixture Shop'}]})})
 assert.equal(gbp.resources[0].accountName,'accounts/12');assert.ok(urls[1].includes('/accounts/12/locations?'))
 await assert.rejects(googleRequest('https://attacker.invalid/','token',{},async()=>{throw new Error('must not call')}),/Unapproved/)
})
test('token refresh saves encrypted rotation and marks revoked grants without leaking Google errors',async()=>{
 const {db,updates}=mockDatabase(),expired={...connection,token_expires_at:'2000-01-01'}
 const token=await googleAccessToken(expired,db,async(input,init)=>{
  assert.equal(String(input),'https://oauth2.googleapis.com/token')
  assert.equal(new URLSearchParams(String(init?.body)).get('grant_type'),'refresh_token')
  return json({access_token:'fresh-access',expires_in:3600})
 })
 assert.equal(token,'fresh-access')
 assert.ok(!JSON.stringify(updates).includes('fresh-access'))
 assert.equal(openGoogleSecret<{access_token:string}>(String(updates[0].tokens_ciphertext),tokenBinding('site-a','gbp')).access_token,'fresh-access')
 await assert.rejects(googleAccessToken({...expired,token_expires_at:'2000-01-01'},db,async()=>json({error:'invalid_grant',error_description:'DO NOT EXPOSE PRIVATE DATA'},400)),/expired/)
 assert.equal(updates.at(-1)?.status,'reauth_required')
 assert.ok(!JSON.stringify(updates).includes('DO NOT EXPOSE'))
})
test('Search Console uses total query plus top queries, and missing data stays unknown',async()=>{
 const requests:Record<string,unknown>[]=[]
 const metrics=await fetchGoogleMetrics('search_console','sc-domain:example.invalid','token',async(input,init)=>{
  assert.ok(String(input).includes('sc-domain%3Aexample.invalid'))
  const body=JSON.parse(String(init?.body));requests.push(body)
  return json(body.dimensions?{rows:[{keys:['fixture search'],clicks:2,impressions:10,ctr:0.2}]}:{rows:[{clicks:8,impressions:40,ctr:0.2}]})
 })
 assert.equal('clicks' in metrics?metrics.clicks:null,8)
 assert.equal(requests.length,2);assert.ok(requests.every(body=>body.dataState==='final'))
 const empty=await fetchGoogleMetrics('search_console','https://example.invalid/','token',async()=>json({}))
 assert.equal(empty.state,'no_data');assert.equal('clicks' in empty?empty.clicks:undefined,null)
})
test('GBP returned zero differs from absent metrics and incomplete periods',async()=>{
 const range=googleReportingRange(),start=new Date(range.startDate+'T00:00:00Z')
 const datedValues=Array.from({length:30},(_,index)=>{const date=new Date(start);date.setUTCDate(date.getUTCDate()+index);return {date:{year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate()}}})
 const metrics=await fetchGoogleMetrics('gbp','locations/123','token',async(input)=>{
  const url=new URL(String(input));assert.equal(url.searchParams.get('dailyRange.startDate.year'),range.startDate.slice(0,4))
  assert.equal(url.searchParams.getAll('dailyMetrics').length,7)
  return json({multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:[{dailyMetric:'CALL_CLICKS',timeSeries:{datedValues}}]}]})
 })
 assert.ok('totals' in metrics);if(!('totals' in metrics))return
 assert.equal(metrics.totals.CALL_CLICKS,0);assert.equal(metrics.totals.WEBSITE_CLICKS,null)
 assert.equal(metrics.daily[0].value,0);assert.equal(metrics.partial,true)
 assert.equal(Object.keys(metrics.totals).length,GBP_METRICS.length)
 const stored=stripGoogleMetricAggregation(metrics) as Record<string,unknown>
 assert.equal('totals' in stored,false);assert.equal('daily' in stored,false);assert.ok(stored.raw)
 const returned=googleMetricsForResponse(stored) as {totals:Record<string,number|null>;raw?:unknown}
 assert.equal(returned.totals.CALL_CLICKS,0);assert.equal(returned.raw,undefined)
})
test('profile changes reject extra fields and send the exact allowed update mask',async()=>{
 for(const bad of [{websiteUri:'https://attacker.invalid/'},{description:''},{description:'x'.repeat(751)},{regularHours:{periods:[null]}},{regularHours:{periods:[{openDay:'MONDAY',closeDay:'MONDAY',openTime:{hours:25},closeTime:{hours:17}}]}}])assert.throws(()=>validateGoogleChanges(bad))
 let captured:Record<string,unknown>|undefined
 await patchGoogleProfile('locations/123','token',{description:'Confirmed description'},true,async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.searchParams.get('updateMask'),'profile.description');assert.equal(url.searchParams.get('validateOnly'),'true')
  captured=JSON.parse(String(init?.body));return json(profile)
 })
 assert.deepEqual(captured,{profile:{description:'Confirmed description'}})
})
test('stale Google profile prevents all PATCH requests after owner approval',async()=>{
 const {db,calls}=mockDatabase(),methods:string[]=[]
 await assert.rejects(applyGoogleProposal({db,connection,proposal,ownerId:'owner-a',expectedRevision:proposal.base_revision,confirm:true},async(_input,init)=>{
  methods.push(init?.method||'GET');return json({...profile,profile:{description:'Changed elsewhere'}})
 }),/changed after/)
 assert.deepEqual(methods,['GET'])
 assert.equal(calls.at(-1)?.args.p_status,'stale')
})
test('approval required, foreign property rejected, and completed proposal is idempotent',async()=>{
 const {db,calls}=mockDatabase()
 const noFetch:GoogleFetch=async()=>{throw new Error('must not call Google')}
 await assert.rejects(applyGoogleProposal({db,connection,proposal,ownerId:'owner-a',expectedRevision:proposal.base_revision,confirm:false},noFetch),/confirm/)
 await assert.rejects(applyGoogleProposal({db,connection,proposal,ownerId:'other-owner',expectedRevision:proposal.base_revision,confirm:true},noFetch),/property changed/)
 const completed=await applyGoogleProposal({db,connection,proposal:{...proposal,status:'applied'},ownerId:'owner-a',expectedRevision:proposal.base_revision,confirm:true},noFetch)
 assert.equal(completed.idempotent,true);assert.equal(calls.length,0)
})
test('ambiguous write and failed readback are never automatically retried or reported applied',async()=>{
 for(const mode of ['write-timeout','readback-error']){
  const {db,calls}=mockDatabase();let reads=0,writes=0
  await assert.rejects(applyGoogleProposal({db,connection,proposal,ownerId:'owner-a',expectedRevision:proposal.base_revision,confirm:true},async(input,init)=>{
   if(init?.method==='PATCH'){
    if(new URL(String(input)).searchParams.get('validateOnly')==='true')return json(profile)
    writes++;if(mode==='write-timeout')throw new Error('timeout')
    return json({...profile,profile:{description:proposal.changes.description}})
   }
   reads++;if(reads>1)return json({error:{message:'private error'}},503)
   return json(profile)
  }),/did not confirm/)
  assert.equal(writes,1);assert.equal(calls.at(-1)?.args.p_status,'needs_review')
 }
})
test('successful Google apply validates, writes once, records readback and does not claim public publication',async()=>{
 const {db,calls}=mockDatabase();let reads=0,writes=0
 const updated={...profile,profile:{description:proposal.changes.description},metadata:{hasPendingEdits:true}}
 const result=await applyGoogleProposal({db,connection,proposal,ownerId:'owner-a',expectedRevision:proposal.base_revision,confirm:true},async(input,init)=>{
  if(init?.method==='PATCH'){if(new URL(String(input)).searchParams.get('validateOnly')==='false')writes++;return json(updated)}
  return json(reads++?updated:profile)
 })
 assert.equal(result.applied,true);assert.equal(writes,1)
 assert.equal(calls.at(-1)?.args.p_status,'applied')
 const evidence=calls.at(-1)?.args.p_result as {publicDisplayVerified:boolean;hasPendingEdits:boolean}
 assert.equal(evidence.publicDisplayVerified,false);assert.equal(evidence.hasPendingEdits,true)
})
test('provider API failures expose a safe actionable status, not response payloads',async()=>{
 await assert.rejects(googleRequest('https://www.googleapis.com/webmasters/v3/sites','token',{},async()=>json({error:{message:'private-token-material'}},403)),(error:unknown)=>error instanceof GoogleApiError&&error.code==='permission_required'&&!error.message.includes('private-token'))
})

test('refresh losing a concurrent disconnect cannot restore access',async()=>{
 let savedFilter=false
 const query={eq:(key:string)=>{if(key==='tokens_ciphertext')savedFilter=true;return query},select:()=>query,maybeSingle:async()=>({data:null,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)}
 const db={from:()=>({update:()=>query})} as unknown as SupabaseClient
 await assert.rejects(googleAccessToken({...connection,token_expires_at:'2000-01-01'},db,async()=>json({access_token:'new-fixture',expires_in:3600})),/changed during refresh/)
 assert.equal(savedFilter,true)
})

test('expired Google content is hidden and an expired draft cannot trigger another Google request',async()=>{
 const expired=new Date(Date.now()-30*86400000).toISOString()
 const safe=safeGoogleConnection({...connection,last_synced_at:expired,profile:{observedAt:expired,profile:{description:'Expired content'}},metrics:{observedAt:expired,clicks:10}},'gbp')
 assert.equal(safe.profile,null);assert.equal(safe.metrics,null);assert.equal(safe.resourceLabel,null)
 const {db,calls}=mockDatabase()
 await assert.rejects(applyGoogleProposal({db,connection,proposal:{...proposal,created_at:expired},ownerId:'owner-a',expectedRevision:proposal.base_revision,confirm:true},async()=>{throw new Error('must not call Google')}),/expired/)
 assert.equal(calls.length,0)
})

test('Google start binds only the verified unchanged legacy owner and rejects competing claims',async()=>{
 const user={id:'owner-a',email:'owner@example.invalid',email_confirmed_at:'2026-09-10'}
 const legacy={id:'legacy-site',owner_id:null as string|null,email:' Owner@Example.invalid '}
 const filters:[string,unknown][]=[];let updates=0,returned:{id:string;owner_id:string}|null={id:legacy.id,owner_id:user.id}
 const query={eq:(key:string,value:unknown)=>{filters.push([key,value]);return query},is:(key:string,value:unknown)=>{filters.push([key,value]);return query},select:()=>query,maybeSingle:async()=>({data:returned,error:null})}
 const db={from:()=>({update:(value:{owner_id:string})=>{updates++;assert.equal(value.owner_id,user.id);return query}})} as unknown as SupabaseClient
 const claimed={...legacy};await bindGoogleSiteOwner(db,claimed,user)
 assert.equal(claimed.owner_id,user.id)
 assert.deepEqual(filters,[['id',legacy.id],['owner_id',null],['email',legacy.email]])
 await bindGoogleSiteOwner(db,claimed,user);assert.equal(updates,1)
 await assert.rejects(bindGoogleSiteOwner(db,{...legacy},{...user,email_confirmed_at:undefined}),/not found/)
 await assert.rejects(bindGoogleSiteOwner(db,{...legacy,owner_id:'other-owner'},user),/not found/)
 assert.equal(updates,1)
 returned=null
 const raced={...legacy}
 await assert.rejects(bindGoogleSiteOwner(db,raced,user),/ownership changed/)
 assert.equal(raced.owner_id,null)
})
test('proposal creation rejects missing or stale editor revisions before storing a draft',async()=>{
 let insertions=0,reads=0
 const db={from:()=>({insert:(payload:Record<string,unknown>)=>{insertions++;return {select:()=>({single:async()=>({data:{...proposal,...payload},error:null})})}}})} as unknown as SupabaseClient
 const request={db,connection,ownerId:'owner-a',siteId:'site-a',changes:{description:'Reviewed description'},expectedRevision:undefined as unknown}
 await assert.rejects(createGoogleProposalDraft(request,async()=>{reads++;return json(profile)}),/Refresh/)
 assert.equal(reads,0);assert.equal(insertions,0)
 const hours={periods:[{openDay:'MONDAY',openTime:{hours:9},closeDay:'MONDAY',closeTime:{hours:17}}]}
 const cached={...profile,regularHours:hours},fresh={...profile,regularHours:{periods:[{...hours.periods[0],closeTime:{hours:18}}]}}
 await assert.rejects(createGoogleProposalDraft({...request,changes:{description:'Reviewed description',regularHours:hours},expectedRevision:profileRevision(cached)},async(_url,init)=>{assert.equal(init?.method,undefined);reads++;return json(fresh)}),/changed since/)
 assert.equal(reads,1);assert.equal(insertions,0)
 const result=await createGoogleProposalDraft({...request,expectedRevision:profileRevision(profile)},async(_url,init)=>{assert.equal(init?.method,undefined);return json(profile)})
 assert.equal(insertions,1);assert.equal(result.proposal.revision,profileRevision(profile));assert.equal(result.proposal.status,'draft')
 assert.equal(result.proposal.before.description,profile.profile.description)
})
