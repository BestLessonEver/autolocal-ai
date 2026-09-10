import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {ownsSite} from '../src/lib/owner-access'
import {createLeadSubmitHandler} from '../src/lib/lead-intake'
import {siteUpdates} from '../src/lib/site-content'
import {SITE_TEMPLATES,isSiteTemplate} from '../src/components/templates/types'
import type {SupabaseClient} from '@supabase/supabase-js'

const migration=readFileSync('supabase/migrations/202609100900_owner_leads_foundation.sql','utf8')
async function database() {
  const db=new PGlite()
  await db.exec(`
    CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `)
  // Reproduce the recovered schema, including its actual missing columns and
  // old slug-based records, rather than testing only an empty rebuild.
  for(const file of ['supabase-schema.sql','supabase-previews.sql','supabase/schema.sql','supabase/migrations/add-hosting-status.sql','supabase/migrations/add_domain_fields.sql']) await db.exec(readFileSync(file,'utf8'))
  await db.exec(`
    ALTER TABLE website_previews ADD COLUMN deploy_status text,ADD COLUMN contact_email text,ADD COLUMN hero_crop int DEFAULT 50,ADD COLUMN site_mode text DEFAULT 'business',ADD COLUMN trial_end timestamptz,ADD COLUMN custom_domain text;
    CREATE TABLE change_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),preview_slug text,business_name text,type text,message text,priority text,status text,created_at timestamptz DEFAULT now());
    CREATE TABLE drip_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,stage text,step int,slug text,business_name text,contact_name text,status text,send_at timestamptz,sent_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE feedback(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message text);
    CREATE TABLE unsubscribes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,unsubscribed_at timestamptz DEFAULT now());
    INSERT INTO website_previews(slug,business_name,email,status) VALUES('legacy-shop','Legacy Shop','owner@example.invalid','published');
    INSERT INTO change_requests(preview_slug,message) VALUES('legacy-shop','Preserve this existing request');
    INSERT INTO drip_queue(slug,status,email) VALUES('legacy-shop','sent','owner@example.invalid');
  `)
  await db.exec(readFileSync('supabase/migrations/202605191315_harden_public_rls.sql','utf8'))
  await db.exec(migration)
  return db
}

test('additive migration preserves records, reconciles lifecycle, and keeps operations private',async()=>{
  const db=await database()
  try {
    const result=await db.query<{owner_id:null;business_name:string}>('SELECT owner_id,business_name FROM website_previews')
    assert.deepEqual(result.rows,[{owner_id:null,business_name:'Legacy Shop'}])
    assert.ok((await db.query<{preview_id:string}>('SELECT preview_id FROM change_requests')).rows[0].preview_id)
    for(const status of ['provisioning','active','pending_cancel','cancelled','past_due']) await db.query('UPDATE website_previews SET hosting_status=$1',[status])
    await db.exec(migration) // Reapplication must be non-destructive.
    for(const role of ['anon','authenticated']) {
      await db.exec('SET ROLE '+role)
      await assert.rejects(db.query('SELECT * FROM website_previews'),/permission denied/)
      await assert.rejects(db.query('SELECT * FROM site_leads'),/permission denied/)
      await assert.rejects(db.query('SELECT * FROM contact_inquiries'),/permission denied/)
      await assert.rejects(db.query("SELECT submit_site_lead('legacy-shop','Name','x@example.invalid','','')"),/permission denied/)
      await db.exec('RESET ROLE')
    }
  } finally {await db.close()}
})

test('lead and notification commit together, replay safely, and reject private previews',async()=>{
  const db=await database()
  try {
    await db.exec('SET ROLE service_role')
    await assert.rejects(db.query("SELECT submit_site_lead('legacy-shop','Name','x@example.invalid','','')"),/not accepting/)
    await db.exec("UPDATE website_previews SET hosting_status='active'")
    await assert.rejects(db.query("SELECT submit_site_lead('legacy-shop','Name','x@example.invalid','','')"),/not accepting/)
    await db.exec("UPDATE website_previews SET deployment_verified_at=now(),website_current='https://example.invalid',deploy_status='queued'")
    const submission='11111111-1111-4111-8111-111111111111'
    const sql="SELECT submit_site_lead('legacy-shop','Name','x@example.invalid','','Inquiry',null,null,'website','{}',$1) AS id"
    const first=await db.query<{id:string}>(sql,[submission]),second=await db.query<{id:string}>(sql,[submission])
    assert.equal(first.rows[0].id,second.rows[0].id)
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM site_leads')).rows[0].n,1)
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM lead_notifications')).rows[0].n,1)
    await db.exec("UPDATE website_previews SET deploy_status='suspended'")
    await assert.rejects(db.query("SELECT submit_site_lead('legacy-shop','Other','other@example.invalid','','')"),/not accepting/)
    await db.exec("UPDATE website_previews SET deploy_status='queued'")
    assert.equal((await db.query('SELECT * FROM claim_lead_notifications(10)')).rows.length,1)
    assert.equal((await db.query('SELECT * FROM claim_lead_notifications(10)')).rows.length,0)
    await db.exec('RESET ROLE')
    await db.exec(`CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected outbox outage'; END $$;
      CREATE TRIGGER outbox_failure BEFORE INSERT ON lead_notifications FOR EACH ROW EXECUTE FUNCTION fail_outbox();SET ROLE service_role;`)
    await assert.rejects(db.query("SELECT submit_site_lead('legacy-shop','Second','second@example.invalid','','Inquiry')"),/Injected outbox/)
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM site_leads')).rows[0].n,1)
  } finally {await db.close()}
})

test('billing/job claims prevent duplicate fulfillment and honor retry leases',async()=>{
  const db=await database()
  try {
    await db.exec('SET ROLE service_role')
    const claim=async()=> (await db.query<{state:string}>("SELECT claim_billing_event('evt_test','checkout.session.completed') state")).rows[0].state
    assert.equal(await claim(),'claimed');assert.equal(await claim(),'busy')
    await db.exec("UPDATE billing_events SET status='failed'")
    assert.equal(await claim(),'claimed')
    await db.exec("UPDATE billing_events SET status='processed'")
    assert.equal(await claim(),'processed')
    await db.exec("INSERT INTO integration_jobs(kind,idempotency_key) VALUES('deploy_site','fixture-job')")
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,1)
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,0)
    await db.exec("UPDATE integration_jobs SET claimed_at=now()-interval '11 minutes'")
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,1)
    await db.exec("UPDATE integration_jobs SET status='retry',attempts=5")
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,0)
    await db.exec("INSERT INTO integration_jobs(kind,site_id,idempotency_key) SELECT 'deploy_site',id,'same-site-1' FROM website_previews;INSERT INTO integration_jobs(kind,site_id,idempotency_key) SELECT 'deploy_site',id,'same-site-2' FROM website_previews")
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,1)
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,0)
    await db.exec("UPDATE integration_jobs SET status='succeeded' WHERE status='processing'")
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(10)')).rows.length,1)
  } finally {await db.close()}
})

test('ownership never trusts unverified emails or transfers an existing owner',()=>{
  const owner={id:'owner-a',email:'Owner@Example.invalid',email_confirmed_at:'2026-01-01'}
  assert.equal(ownsSite(owner,{owner_id:null,email:'owner@example.invalid'}),true)
  assert.equal(ownsSite({...owner,email_confirmed_at:undefined},{owner_id:null,email:'owner@example.invalid'}),false)
  assert.equal(ownsSite(owner,{owner_id:'owner-b',email:'owner@example.invalid'}),false)
  assert.equal(ownsSite(owner,{owner_id:'owner-a',email:'other@example.invalid'}),true)
})

test('lead endpoint returns visible failure and never sends on missing schema or invalid input',async()=>{
  let calls=0
  const db={rpc:async()=>{calls++;return {data:null,error:{code:'PGRST202'}}}} as unknown as SupabaseClient
  const handler=createLeadSubmitHandler(()=>db)
  const request=(body:unknown)=>new Request('http://localhost/api/leads/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await handler(request({slug:'shop',name:'Name'}))).status,400);assert.equal(calls,0)
  const fail=await handler(request({slug:'shop',name:'Name',email:'x@example.invalid'}))
  assert.equal(fail.status,503);assert.ok((await fail.json()).error);assert.equal(calls,1)
  const success=createLeadSubmitHandler(()=>({rpc:async()=>({data:'lead-id',error:null})}) as unknown as SupabaseClient)
  assert.deepEqual(await (await success(request({slug:'shop',name:'Name',phone:'5551234567'}))).json(),{success:true,lead_id:'lead-id'})
})

test('website updates validate links and preserve verified factual scalars without accepting ownership',()=>{
  assert.throws(()=>siteUpdates({hero_image_url:'javascript:alert(1)'}),/valid/)
  assert.throws(()=>siteUpdates({template:'pokemon'}),/supported/)
  const result=siteUpdates({owner_id:'attacker',email:'attacker@example.invalid',business_facts:{verified:true,existingWebsite:null},contact_email:'info@example.invalid'})
  assert.equal('owner_id' in result,false);assert.equal('email' in result,false)
  assert.deepEqual(result.business_facts,{verified:true,existingWebsite:null})
})

test('the shared design catalog accepts six current templates and rejects legacy or malformed choices',()=>{
  const expected=['summit','atelier','ledger','win95','myspace','receipt']
  assert.deepEqual(SITE_TEMPLATES.map(template=>template.id),expected)
  for(const template of expected) {
    assert.equal(isSiteTemplate(template),true)
    assert.equal(siteUpdates({template}).template,template)
  }
  for(const template of ['pokemon','aim','bold','modern','professional','unknown','Summit','',null,95,['summit'],{toString:()=> 'summit'}]) {
    assert.throws(()=>siteUpdates({template}),/supported/)
  }
  assert.equal('template' in siteUpdates({tagline:'A new headline'}),false)
})

test('owner intake persists every current template and rejects unsupported choices before writing',async()=>{
  const {saveOwnedIntake}=await import('../src/lib/site-intake')
  const user={id:'owner-a',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'} as import('@supabase/supabase-js').User
  const writes:Record<string,unknown>[]=[]
  const db={from:()=>({insert:async(payload:Record<string,unknown>)=>{writes.push(payload);return {error:null}}})} as unknown as SupabaseClient
  for(const {id:template} of SITE_TEMPLATES) {
    await saveOwnedIntake({businessName:`Design ${template}`,city:'Austin',template},{user,db})
    assert.equal(writes.at(-1)?.template,template)
    assert.equal(writes.at(-1)?.owner_id,user.id)
    assert.equal(writes.at(-1)?.hosting_status,'preview')
  }
  assert.equal(writes.length,6)
  await assert.rejects(saveOwnedIntake({businessName:'Unsupported',template:'aim'},{user,db}),/supported/)
  assert.equal(writes.length,6)
})

test('intake rejects another owner slug before mutation and ignores submitted ownership',async()=>{
  const {saveOwnedIntake}=await import('../src/lib/site-intake')
  let mutations=0
  const foreign={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'site-b',owner_id:'owner-b',email:'owner@example.invalid'},error:null})})}),update:()=>{mutations++;throw new Error('Must not update')}})} as unknown as SupabaseClient
  const user={id:'owner-a',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'} as import('@supabase/supabase-js').User
  await assert.rejects(saveOwnedIntake({businessName:'Claimed Shop',slug:'foreign-shop',email:'attacker@example.invalid'},{user,db:foreign}),/not found/)
  assert.equal(mutations,0)
  let inserted:Record<string,unknown>={}
  const own={from:()=>({insert:async(payload:Record<string,unknown>)=>{inserted=payload;return {error:null}}})} as unknown as SupabaseClient
  const result=await saveOwnedIntake({businessName:'New Shop',city:'Austin',email:'attacker@example.invalid',owner_id:'attacker',template:'summit'},{user,db:own})
  assert.equal(inserted.owner_id,'owner-a');assert.equal(inserted.email,'owner@example.invalid')
  assert.equal(inserted.hosting_status,'preview');assert.equal(result.previewUrl,'/preview/new-shop-austin')
})

test('notification retry is durable, does not mark rejected mail sent, and escapes inquiry HTML',async()=>{
  const {deliverLeadNotifications}=await import('../src/lib/lead-notifications')
  const updates:Record<string,unknown>[]=[]
  const db={rpc:async()=>({data:[{id:'job',lead_id:'lead',site_id:'site',attempts:1}],error:null}),from:(table:string)=>({
    select:()=>({eq:()=>({single:async()=>({error:null,data:table==='site_leads'?{id:'lead',site_id:'site',name:'<script>',email:'prospect@example.invalid',message:'<img onerror=alert(1)>',phone:''}:{id:'site',email:'owner@example.invalid',business_name:'Shop',owner_id:null}})})}),
    update:(value:Record<string,unknown>)=>{updates.push(value);return {eq:()=>({eq:async()=>({error:null})})}}
  })} as unknown as SupabaseClient
  let rendered=''
  const result=await deliverLeadNotifications(db,async(_to,_subject,html,options)=>{rendered=html;assert.equal(options?.idempotencyKey,'lead:lead');return {success:false}})
  assert.equal(result.sent,0);assert.equal(result.retrying,1);assert.equal(updates[0].status,'retry')
  assert.ok(rendered.includes('&lt;script&gt;'));assert.ok(!rendered.includes('<img'))
})

test('legacy AI and marketing APIs deny anonymous calls before upstream work',async()=>{
  const originalKey=process.env.INTERNAL_API_KEY,originalFetch=globalThis.fetch
  process.env.INTERNAL_API_KEY='test-internal-key'
  globalThis.fetch=async()=>{throw new Error('Anonymous request must not contact a provider')}
  try {
    const routes=await Promise.all([
      import('../src/app/api/audit/route'),import('../src/app/api/research/route'),import('../src/app/api/generate-posts/route'),
      import('../src/app/api/photo-to-post/route'),import('../src/app/api/outbound/route'),import('../src/app/api/drip/enqueue/route'),import('../src/app/api/drip/process/route'),
    ])
    for(const route of routes) assert.equal((await route.POST(new Request('http://localhost/api/test',{method:'POST',body:'{}'}))).status,401)
    for(const index of [4,5,6]) assert.equal((await routes[index].POST(new Request('http://localhost/api/test',{method:'POST',headers:{Authorization:'Bearer test-internal-key'},body:'{}'}))).status,410)
  }finally{
    globalThis.fetch=originalFetch
    if(originalKey===undefined)delete process.env.INTERNAL_API_KEY;else process.env.INTERNAL_API_KEY=originalKey
  }
})

test('unsubscribe persists consent and cancels active marketing together',async()=>{
  const db=await database()
  try {
    await db.exec("SET ROLE service_role;UPDATE drip_queue SET status='active';SELECT unsubscribe_contact('OWNER@example.invalid');SELECT unsubscribe_contact('owner@example.invalid');")
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM unsubscribes')).rows[0].n,1)
    assert.equal((await db.query<{status:string}>('SELECT status FROM drip_queue')).rows[0].status,'cancelled')
    await db.exec('RESET ROLE;SET ROLE anon')
    await assert.rejects(db.query("SELECT unsubscribe_contact('owner@example.invalid')"),/permission denied/)
  }finally{await db.close()}
})

test('onboarding categories stay schema-compatible and preserve owner-facing labels',async()=>{
 const {normalizeCategory}=await import('../src/lib/site-content')
 for(const [label,expected] of [['Home services','contractor'],['Beauty & wellness','salon'],['Health & fitness','fitness'],['Food & hospitality','restaurant']])assert.equal(normalizeCategory(label),expected)
 const {saveOwnedIntake}=await import('../src/lib/site-intake')
 let inserted:Record<string,unknown>={}
 const db={from:()=>({insert:async(payload:Record<string,unknown>)=>{inserted=payload;return {error:null}}})} as unknown as SupabaseClient
 const user={id:'owner-a',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'} as import('@supabase/supabase-js').User
 await saveOwnedIntake({businessName:'Fixture home service',category:'Home services',website:'https://external.example.invalid',businessFacts:{verified:true}},{user,db})
 assert.equal(inserted.category,'contractor');assert.equal(inserted.template,'summit')
 assert.equal('website_current' in inserted,false)
 assert.deepEqual(inserted.business_facts,{verified:true,existingWebsite:'https://external.example.invalid/',categoryLabel:'Home services'})
})

test('editing a legacy owned site cannot replace its verified deployment with an external intake URL',async()=>{
 const {saveOwnedIntake}=await import('../src/lib/site-intake')
 const site={id:'legacy-site',slug:'legacy-shop',owner_id:null,email:'owner@example.invalid',hosting_status:'active',deployment_verified_at:'2026-09-10',website_current:'https://verified.example.invalid',business_facts:{verified:true,goal:'improve'}}
 let updated:Record<string,unknown>={}
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:site,error:null})})}),update:(payload:Record<string,unknown>)=>{updated=payload;return {eq:async()=>({error:null})}}})} as unknown as SupabaseClient
 const user={id:'owner-a',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'} as import('@supabase/supabase-js').User
 await saveOwnedIntake({slug:'legacy-shop',businessName:'Fixture legacy',category:'Beauty & wellness',website:'https://existing.example.invalid',businessFacts:{serviceAreaBusiness:false}},{user,db})
 assert.equal('website_current' in updated,false);assert.equal('deployment_verified_at' in updated,false)
 assert.deepEqual(updated.business_facts,{verified:true,goal:'improve',serviceAreaBusiness:false,existingWebsite:'https://existing.example.invalid/',categoryLabel:'Beauty & wellness'})
 assert.equal(updated.owner_id,'owner-a')
})

test('setup health separates billing-independent publication and unknown versus connected Google access',async()=>{
 const {ownerSetupHealth}=await import('../src/lib/owner-setup-health')
 const paid={hosting_status:'active',deployment_verified_at:'2026-09-10',website_current:'https://verified.example.invalid',deploy_status:'queued'}
 assert.equal(ownerSetupHealth(paid,[]).public_site,true)
 assert.equal(ownerSetupHealth({...paid,hosting_status:'cancelled'},[]).publishing_verified,false)
 assert.equal(ownerSetupHealth({...paid,deploy_status:'suspended'},[]).public_site,false)
 assert.equal(ownerSetupHealth({hosting_status:'active'},[]).public_site,false)
 assert.equal(ownerSetupHealth(paid,null).google.gbp.connected,null)
 assert.equal(ownerSetupHealth(paid,[]).google.gbp.status,'not_connected')
 const google=ownerSetupHealth(paid,[{provider:'gbp',status:'connected',resource_name:'locations/123',last_synced_at:'2026-09-10',error_code:null},{provider:'search_console',status:'reauth_required',resource_name:'sc-domain:example.invalid',last_synced_at:'2026-09-01',error_code:'reauth_required'}]).google
 assert.equal(google.gbp.connected,true);assert.equal(google.search_console.connected,false);assert.equal(google.search_console.resourceSelected,true)
})

test('missing provider setup is explicitly unavailable without exposing configuration internals',async()=>{
 const {apiErrorResponse}=await import('../src/lib/owner-access')
 const {ConfigurationError}=await import('../src/lib/integration-config')
 const result=apiErrorResponse(new ConfigurationError('Service configuration missing: STRIPE_SECRET_KEY'))
 assert.equal(result.status,503)
 assert.deepEqual(await result.json(),{error:'This service needs setup before it can be used.',code:'integration_unavailable'})
})
