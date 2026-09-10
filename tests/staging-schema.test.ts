import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { PGlite } from '@electric-sql/pglite'

const baseline = readFileSync('supabase/staging-baseline.sql', 'utf8')
const migrations = [
  '202609100900_owner_leads_foundation.sql',
  '202609101100_google_connections.sql',
  '202609101500_visibility_tasks.sql',
  '202609101600_public_request_limits.sql',
].map(name => readFileSync('supabase/migrations/' + name, 'utf8'))
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const site = '33333333-3333-4333-8333-333333333333'
const business = '44444444-4444-4444-8444-444444444444'
const otherBusiness = '55555555-5555-4555-8555-555555555555'

const runtimeColumns: Record<string, string> = {
  website_previews: 'id slug business_name tagline description category brand_color_primary brand_color_secondary brand_color_accent logo_url hero_image_url gallery_images services hours address city state phone email contact_email website_current reviews google_rating google_review_count cta_text cta_url template audit_id status view_count created_at updated_at hero_crop site_mode plan hosting_status stripe_customer_id trial_end custom_domain deploy_status domain_status domain_provider domain_registrar_id domain_auto_renew domain_expires_at owner_id google_place_id cancel_date contact_name last_optimized_at stripe_subscription_id billing_event_created subscription_status vercel_project_id vercel_deployment_id deployment_url deployment_verified_at deploy_error domain_purchase_price domain_order_status reviews_verified service_areas image_caption show_address business_facts faq requested_deployment_job_id checkout_event_id checkout_site_snapshot published_site_snapshot checkout_session_id checkout_request_key visibility_last_checked_at visibility_next_check_at visibility_claimed_at',
  businesses: 'id user_id name industry address phone website_url logo_url brand_colors style_preset brand_description services differentiator target_customer posting_frequency preferred_days created_at updated_at',
  brand_profiles: 'id business_id voice_description emoji_usage caption_style hashtag_count learned_preferences',
  posts: 'id business_id caption image_url scheduled_at published_at status content_type platforms rating rating_feedback photo_upload',
  social_connections: 'id business_id platform connected access_token refresh_token platform_user_id connected_at',
  subscriptions: 'id business_id plan status trial_ends_at stripe_customer_id stripe_subscription_id current_period_start current_period_end',
  audit_requests: 'id business_name website city state email status created_at',
  audits: 'id business_name city state category website_url google_place_id overall_score data email_sent email_sent_at report_viewed report_viewed_at converted package_purchased created_at',
  outbound_emails: 'id audit_id to_email from_email subject template_used approach resend_id status opened_at clicked_at replied_at follow_up_number next_follow_up_at business_name recipient_email approach_type sent_at report_viewed_at converted follow_up_day parent_email_id scheduled_for error_message',
  clients: 'id business_name owner_name email phone website city state package social_accounts brand_preferences status audit_id stripe_customer_id',
  change_requests: 'id preview_id preview_slug business_name type message priority cost status created_at',
  feedback: 'id type message slug email status created_at',
  unsubscribes: 'id email unsubscribed_at created_at',
  drip_queue: 'id preview_id email stage step slug business_name contact_name status send_at sent_at created_at',
  research_results: 'id business_id business_name data status created_at',
  site_leads: 'id site_id slug name email phone message instrument status notes service source attribution submission_id created_at updated_at',
  lead_notifications: 'id lead_id site_id status attempts next_attempt_at claimed_at sent_at error created_at',
  contact_inquiries: 'id name email business_name message source consent marketing_opt_in status created_at',
  integration_jobs: 'id kind site_id payload status attempts next_attempt_at claimed_at result error idempotency_key created_at updated_at',
  billing_events: 'provider_event_id event_type status attempts claimed_at processed_at error',
  google_connections: 'id site_id owner_id provider status tokens_ciphertext token_expires_at granted_scope resource_name resource_label account_name profile metrics profile_revision last_synced_at error_code created_at updated_at',
  google_oauth_states: 'state_hash browser_hash user_id site_id provider verifier_ciphertext expires_at created_at',
  google_change_proposals: 'id site_id connection_id owner_id resource_name status base_revision before_profile changes provider_result error_code approved_at applied_at created_at',
  google_change_events: 'id proposal_id actor_id event_type source evidence created_at',
  visibility_tasks: 'id site_id owner_id task_key title description priority rank evidence source action source_revision inference context evidence_expires_at status completion owner_updated_at created_at updated_at',
  public_request_limits: 'scope bucket_hash count expires_at',
}
const operationalTables = Object.keys(runtimeColumns).filter(name => !['businesses', 'brand_profiles', 'posts', 'subscriptions'].includes(name))
const privateFunctions = [
  'increment_preview_views(text)', 'resolve_change_preview()', 'update_preview_timestamp()',
  'submit_site_lead(text,text,text,text,text,text,text,text,jsonb,uuid)',
  'claim_lead_notifications(integer)', 'unsubscribe_contact(text)', 'claim_integration_jobs(integer)',
  'claim_billing_event(text,text)', 'consume_google_oauth_state(text,text,uuid)',
  'claim_google_proposal(uuid,uuid,text)', 'finish_google_proposal(uuid,text,jsonb,text)',
  'expire_google_cached_content()', 'reconcile_visibility_tasks(uuid,uuid,jsonb)',
  'claim_visibility_site()', 'consume_public_request_budget(text,text)',
]

async function emptyPlatform() {
  const db = new PGlite()
  await db.exec([
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
    'CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);',
    "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    'GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;',
    // Start with broad API-role default grants so the real SQL must revoke them.
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;',
  ].join('\n'))
  return db
}
async function applyRelease(db: PGlite) {
  await db.exec(baseline)
  for (const migration of migrations) await db.exec(migration)
}
async function privateAccess(db: PGlite) {
  for (const role of ['anon', 'authenticated']) {
    for (const name of operationalTables) {
      const result = await db.query<{ permitted: boolean }>(
        "SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS permitted",
        [role, 'public.' + name],
      )
      assert.equal(result.rows[0].permitted, false, role + ' must not access ' + name)
    }
    for (const signature of privateFunctions) {
      const result = await db.query<{ permitted: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') AS permitted", [role, 'public.' + signature])
      assert.equal(result.rows[0].permitted, false, role + ' must not execute ' + signature)
    }
    await db.exec('SET ROLE ' + role)
    await assert.rejects(db.query('SELECT * FROM website_previews'), /permission denied/)
    await assert.rejects(db.query('SELECT * FROM google_connections'), /permission denied/)
    await assert.rejects(db.query('SELECT * FROM autolocal_staging.installation'), /permission denied/)
    await assert.rejects(db.query("SELECT submit_site_lead('fixture-shop','Test','test@example.invalid','','')"), /permission denied/)
    await db.exec('RESET ROLE')
  }
}
async function snapshots(db: PGlite) {
  const data: Record<string, unknown> = {}
  for (const name of Object.keys(runtimeColumns)) data[name] = (await db.query('SELECT * FROM ' + name + ' ORDER BY 1')).rows
  return data
}

test('fresh staging baseline and all four migrations install complete private runtime and preserve data on replay', async () => {
  const db = await emptyPlatform()
  try {
    await db.exec(baseline)
    await db.exec(baseline) // Even a partial release can resume safely.
    for (const migration of migrations) await db.exec(migration)
    const tables = await db.query<{ name: string; rls: boolean }>("SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")
    assert.deepEqual(tables.rows.map(row => row.name), Object.keys(runtimeColumns).sort())
    assert.equal(tables.rows.length, 26)
    assert.ok(tables.rows.every(row => row.rls))
    for (const [table, columns] of Object.entries(runtimeColumns)) {
      await db.query('SELECT ' + columns.split(' ').join(',') + ' FROM ' + table + ' LIMIT 0')
      assert.deepEqual((await db.query('SELECT * FROM ' + table)).rows, [], 'no seed/customer rows in ' + table)
    }
    await privateAccess(db)
    await db.query('INSERT INTO auth.users VALUES($1),($2)', [owner, other])
    await db.query('INSERT INTO businesses(id,user_id,name) VALUES($1,$2,$3),($4,$5,$6)', [business, owner, 'Fixture owner business', otherBusiness, other, 'Other fixture business'])
    await db.query('INSERT INTO brand_profiles(business_id) VALUES($1),($2)', [business, otherBusiness])
    await db.query('INSERT INTO posts(business_id,caption) VALUES($1,$2),($3,$4)', [business, 'Own draft', otherBusiness, 'Other draft'])
    await db.query('INSERT INTO subscriptions(business_id) VALUES($1),($2)', [business, otherBusiness])
    await db.query('INSERT INTO website_previews(id,owner_id,slug,business_name,email) VALUES($1,$2,$3,$4,$5)', [site, owner, 'fixture-shop', 'Fixture shop', 'owner@example.invalid'])
    await db.exec("INSERT INTO change_requests(preview_slug,message) VALUES('fixture-shop','Fixture request')")
    assert.equal((await db.query<{ preview_id: string }>('SELECT preview_id FROM change_requests')).rows[0].preview_id, site)
    await assert.rejects(db.query("INSERT INTO website_previews(owner_id,slug,business_name) VALUES('99999999-9999-4999-8999-999999999999','missing-owner','Fixture')"), /foreign key/)
    await db.exec("SET ROLE authenticated; SET request.jwt.claim.sub='" + owner + "'")
    for (const table of ['businesses', 'brand_profiles', 'posts', 'subscriptions']) assert.equal((await db.query('SELECT * FROM ' + table)).rows.length, 1)
    await assert.rejects(db.query('INSERT INTO businesses(user_id,name) VALUES($1,$2)', [other, 'Forbidden']), /row-level security/)
    await assert.rejects(db.query('INSERT INTO posts(business_id,caption) VALUES($1,$2)', [otherBusiness, 'Forbidden']), /row-level security/)
    assert.equal((await db.query('UPDATE posts SET caption=$1 WHERE business_id=$2 RETURNING id', ['Forbidden', otherBusiness])).rows.length, 0)
    await assert.rejects(db.query("UPDATE subscriptions SET plan='pro'"), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE service_role')
    await assert.rejects(db.query("SELECT submit_site_lead('fixture-shop','Customer','customer@example.invalid','','Fixture inquiry')"), /not accepting/)
    await db.exec([
      "UPDATE website_previews SET hosting_status='active',status='published',deploy_status='live',deployment_verified_at=now(),website_current='https://fixture.example.invalid',subscription_status='active',checkout_request_key='66666666-6666-4666-8666-666666666666',checkout_site_snapshot='{\"slug\":\"fixture-shop\"}',published_site_snapshot='{\"slug\":\"fixture-shop\"}';",
      "SELECT submit_site_lead('fixture-shop','Customer','customer@example.invalid','','Fixture inquiry');",
    ].join('\n'))
    await db.query('INSERT INTO integration_jobs(kind,site_id,idempotency_key) VALUES($1,$2,$3)', ['deploy_site', site, 'fixture-deploy'])
    assert.equal((await db.query('SELECT * FROM claim_lead_notifications(1)')).rows.length, 1)
    assert.equal((await db.query('SELECT * FROM claim_integration_jobs(1)')).rows.length, 1)
    assert.equal((await db.query<{ state: string }>("SELECT claim_billing_event('evt_fixture','checkout.session.completed') AS state")).rows[0].state, 'claimed')
    assert.equal((await db.query("SELECT * FROM consume_google_oauth_state('missing','missing',$1)", [owner])).rows.length, 0)
    await db.query("SELECT reconcile_visibility_tasks($1,$2,'[]'::jsonb)", [site, owner])
    assert.equal((await db.query('SELECT * FROM claim_visibility_site()')).rows.length, 1)
    assert.equal((await db.query<{ allowed: boolean }>("SELECT * FROM consume_public_request_budget('contact',$1)", ['a'.repeat(64)])).rows[0].allowed, true)
    await db.exec('SELECT expire_google_cached_content(); RESET ROLE')
    const before = await snapshots(db)
    const markerBefore = (await db.query('SELECT * FROM autolocal_staging.installation')).rows
    await applyRelease(db)
    assert.deepEqual(await snapshots(db), before)
    assert.deepEqual((await db.query('SELECT * FROM autolocal_staging.installation')).rows, markerBefore)
    await privateAccess(db)
  } finally { await db.close() }
})

test('fresh staging guard refuses existing tables or auth users atomically without touching their data', async () => {
  for (const fixture of ['table', 'auth']) {
    const db = await emptyPlatform()
    try {
      if (fixture === 'table') await db.exec("CREATE TABLE public.customer_fixture(note text); INSERT INTO customer_fixture VALUES('keep this record')")
      else await db.query('INSERT INTO auth.users VALUES($1)', [owner])
      await assert.rejects(db.exec(baseline), /requires a fresh empty project/)
      await db.exec('ROLLBACK')
      assert.equal((await db.query<{ present: string | null }>("SELECT to_regclass('public.website_previews') AS present")).rows[0].present, null)
      assert.equal((await db.query<{ present: string | null }>("SELECT to_regclass('autolocal_staging.installation') AS present")).rows[0].present, null)
      if (fixture === 'table') assert.deepEqual((await db.query('SELECT * FROM customer_fixture')).rows, [{ note: 'keep this record' }])
      else assert.deepEqual((await db.query('SELECT id FROM auth.users')).rows, [{ id: owner }])
    } finally { await db.close() }
  }
})

type Bucket = { id: string; name: string; public: boolean; file_size_limit: number; allowed_mime_types: string[] }
type StorageResult = { data: Bucket | null; error: { statusCode?: string; status?: number } | null }
type StorageClient = { storage: { getBucket(id: string): Promise<StorageResult>; createBucket(id: string, options: unknown): Promise<{ error: { statusCode?: string; status?: number } | null }> } }
const storageDocument = readFileSync('docs/STAGING-DATABASE.md', 'utf8')
const storageProcedure = storageDocument.split('// BEGIN TESTED STAGING STORAGE PROCEDURE')[1].split('// END TESTED STAGING STORAGE PROCEDURE')[0]
const ensureStorage = runInNewContext(storageProcedure + '\nensureStagingStorage', {}) as (client: StorageClient) => Promise<{ bucket: string; verified: boolean }>
const bucket = (): Bucket => ({ id: 'client-assets', name: 'client-assets', public: true, file_size_limit: 5242880, allowed_mime_types: ['image/webp', 'image/png', 'image/jpeg'] })

test('documented staging storage setup creates and verifies once, replays safely, and refuses incompatible or denied access', async () => {
  let record: Bucket | null = null
  let creates = 0
  let options: unknown
  const client: StorageClient = { storage: {
    getBucket: async id => { assert.equal(id, 'client-assets'); return record ? { data: record, error: null } : { data: null, error: { statusCode: '404' } } },
    createBucket: async (id, config) => { assert.equal(id, 'client-assets'); creates++; options = config; record = bucket(); return { error: null } },
  } }
  assert.equal((await ensureStorage(client)).verified, true)
  assert.equal((await ensureStorage(client)).verified, true)
  assert.equal(creates, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(options)), { public: true, fileSizeLimit: 5242880, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] })
  record = { ...bucket(), public: false }
  await assert.rejects(ensureStorage(client), /settings need review/)
  assert.equal(creates, 1)
  client.storage.getBucket = async () => ({ data: null, error: { status: 403 } })
  await assert.rejects(ensureStorage(client), /lookup failed/)
  assert.equal(creates, 1)
  let reads = 0
  client.storage.getBucket = async () => ++reads === 1 ? { data: null, error: { status: 404 } } : { data: bucket(), error: null }
  client.storage.createBucket = async () => ({ error: { statusCode: '409' } })
  assert.equal((await ensureStorage(client)).verified, true)
  assert.equal(reads, 2)
})
