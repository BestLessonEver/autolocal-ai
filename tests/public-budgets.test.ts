import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import type {SupabaseClient} from '@supabase/supabase-js'
import {createLocalPublicBudget,enforcePublicBudget,publicClientIdentity} from '../src/lib/public-rate-limit'
import {POST as search} from '../src/app/api/search-business/route'
import {POST as details} from '../src/app/api/business-details/route'
import {POST as contact} from '../src/app/api/capture-lead/route'
import {GET as integrations} from '../src/app/api/admin/integrations/route'
const env=process.env as Record<string,string|undefined>
function savedEnv(keys:string[]){const prior=Object.fromEntries(keys.map(key=>[key,env[key]]));return ()=>{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete env[key];else env[key]=value}}}
test('shared request budget enforces clients and global limits, expires counters, and denies public SQL access',async()=>{
 const db=new PGlite()
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;')
  const migration=readFileSync('supabase/migrations/202609101600_public_request_limits.sql','utf8')
  await db.exec(migration);await db.exec(migration);await db.exec('SET ROLE service_role')
  const hash='a'.repeat(64),other='b'.repeat(64)
  const consume=async(scope:string,key=hash)=>(await db.query<{allowed:boolean;retry_after:number}>('SELECT * FROM consume_public_request_budget($1,$2)',[scope,key])).rows[0]
  for(let index=0;index<30;index++)assert.equal((await consume('google-places')).allowed,true)
  const limited=await consume('google-places');assert.equal(limited.allowed,false);assert.ok(limited.retry_after>0)
  assert.equal((await consume('google-places',other)).allowed,true)
  await db.query("UPDATE public_request_limits SET expires_at=now()-interval '1 second' WHERE bucket_hash=$1",[hash])
  assert.equal((await consume('google-places')).allowed,true)
  for(let index=0;index<5;index++)assert.equal((await consume('contact')).allowed,true)
  assert.equal((await consume('contact')).allowed,false)
  await db.exec("UPDATE public_request_limits SET count=1000 WHERE scope='google-places' AND bucket_hash LIKE 'global:%'")
  assert.equal((await consume('google-places','c'.repeat(64))).allowed,false)
  // Rejecting a client cannot continue spending the global provider budget.
  const count=(await db.query<{n:number}>("SELECT count n FROM public_request_limits WHERE scope='google-places' AND bucket_hash LIKE 'global:%'")).rows[0].n
  assert.equal(count,1000)
  await assert.rejects(consume('unknown'),/Unsupported/);await assert.rejects(consume('contact','raw-ip'),/Invalid/)
  await db.exec('RESET ROLE')
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role)
   await assert.rejects(db.query('SELECT * FROM public_request_limits'),/permission denied/)
   await assert.rejects(consume('contact'),/permission denied/)
   await db.exec('RESET ROLE')
  }
 }finally{await db.close()}
})
test('untrusted headers cannot rotate identities; local development counters expire predictably',()=>{
 const restore=savedEnv(['VERCEL','AUTOLOCAL_TRUST_PROXY_IP_HEADERS'])
 try{
  delete env.VERCEL;delete env.AUTOLOCAL_TRUST_PROXY_IP_HEADERS
  const request=new Request('http://localhost',{headers:{'x-forwarded-for':'203.0.113.8','x-real-ip':'198.51.100.20'}})
  assert.equal(publicClientIdentity(request),'unknown')
  env.VERCEL='1';assert.equal(publicClientIdentity(request),'203.0.113.8')
  assert.equal(publicClientIdentity(new Request('http://localhost',{headers:{'x-forwarded-for':'invented'}})),'unknown')
  let now=Date.parse('2026-09-10T12:00:00Z');const consume=createLocalPublicBudget(()=>now)
  for(let index=0;index<5;index++)assert.equal(consume('contact','fixture').allowed,true)
  assert.equal(consume('contact','fixture').allowed,false)
  now+=3600001;assert.equal(consume('contact','fixture').allowed,true)
 }finally{restore()}
})
test('production limiter stores keyed hashes only and returns real throttling or storage errors',async()=>{
 const restore=savedEnv(['NODE_ENV','AUTOLOCAL_RATE_LIMIT_KEY','VERCEL'])
 try{
  env.NODE_ENV='production';env.AUTOLOCAL_RATE_LIMIT_KEY='fixture-random-rate-secret-at-least-32-bytes';env.VERCEL='1'
  const request=new Request('https://fixture.invalid',{headers:{'x-forwarded-for':'203.0.113.9'}})
  let args:Record<string,unknown>={}
  const blocked={rpc:async(_name:string,payload:Record<string,unknown>)=>{args=payload;return {data:[{allowed:false,retry_after:345}],error:null}}} as unknown as SupabaseClient
  const limited=await enforcePublicBudget(request,'contact',()=>blocked)
  assert.equal(limited?.status,429);assert.equal(limited?.headers.get('Retry-After'),'345')
  assert.match(String(args.p_client_hash),/^[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(args).includes('203.0.113.9'))
  const failed={rpc:async()=>({data:null,error:{message:'private operational detail'}})} as unknown as SupabaseClient
  const outage=await enforcePublicBudget(request,'google-places',()=>failed)
  assert.equal(outage?.status,503);assert.ok(!(await outage!.text()).includes('private'))
 }finally{restore()}
})
test('Railway uses only its verified real-IP header and the protected probe never reveals addresses',async()=>{
 const restore=savedEnv(['VERCEL','RAILWAY_ENVIRONMENT_ID','AUTOLOCAL_TRUST_PROXY_IP_HEADERS','INTERNAL_API_KEY'])
 try{
  delete env.VERCEL;env.RAILWAY_ENVIRONMENT_ID='fixture-production';delete env.AUTOLOCAL_TRUST_PROXY_IP_HEADERS
  env.INTERNAL_API_KEY='fixture-internal-only'
  const request=(headers:Record<string,string>)=>new Request('https://fixture.invalid/api/admin/integrations?probe=proxy',{headers})
  const headers={'x-forwarded-for':'192.0.2.17','x-real-ip':'198.51.100.42'}
  assert.equal(publicClientIdentity(request(headers)),'unknown')
  env.AUTOLOCAL_TRUST_PROXY_IP_HEADERS='true'
  assert.equal(publicClientIdentity(request(headers)),'198.51.100.42')
  assert.equal(publicClientIdentity(request({'x-forwarded-for':'192.0.2.17'})),'unknown')
  assert.equal(publicClientIdentity(request({...headers,'x-real-ip':'198.51.100.42, 192.0.2.17'})),'unknown')
  assert.equal((await integrations(request(headers))).status,401)
  const response=await integrations(request({...headers,authorization:'Bearer fixture-internal-only'}))
  const result=await response.json()
  assert.equal(response.headers.get('Cache-Control'),'private, no-store')
  assert.deepEqual(result.proxy,{railwayEnvironment:true,realIpValid:true,realIpMatchesProbe:false,forwardedIpMatchesProbe:true,selectedIdentityKnown:true,selectedIdentityMatchesProbe:false})
  assert.ok(!JSON.stringify(result).includes('198.51.100.42'))
  assert.ok(!JSON.stringify(result).includes('192.0.2.17'))
 }finally{restore()}
})
test('missing production request-budget setup blocks paid lookups and contact writes before upstream work',async()=>{
 const restore=savedEnv(['NODE_ENV','AUTOLOCAL_RATE_LIMIT_KEY','GOOGLE_PLACES_API_KEY']),originalFetch=globalThis.fetch
 try{
  env.NODE_ENV='production';delete env.AUTOLOCAL_RATE_LIMIT_KEY;env.GOOGLE_PLACES_API_KEY='fixture-only'
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('No upstream work allowed')}
  const request=(path:string,body:unknown)=>new Request('https://fixture.invalid/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await search(request('search-business',{businessName:'Fixture shop'}))).status,503)
  assert.equal((await details(request('business-details',{placeId:'fixture-place-id'}))).status,503)
  assert.equal((await contact(request('capture-lead',{name:'Fixture',email:'fixture@example.invalid',message:'Please help',consent:true}))).status,503)
  assert.equal(calls,0)
 }finally{restore();globalThis.fetch=originalFetch}
})
