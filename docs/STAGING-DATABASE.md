# Fresh staging database

This installs AutoLocal into a **new, isolated Supabase staging project**. It does not clone production, create users, import credentials, upload images, activate workers, or publish anything. Do not run it against production.

## Confirm the destination

Verify the staging project name and reference in Supabase. Independently compare its database host and API URL with production; they must differ. Do not load this checkout's production `.env.local`. Use only newly issued staging credentials through the operator's secret environment.

Before first install, run these read-only checks in staging:

```sql
SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f');
SELECT count(*) AS auth_user_count FROM auth.users;
SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;
SELECT count(*) AS stored_object_count FROM storage.objects;
SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname='storage';
```

Public relations and auth users must be absent. Unexpected buckets, objects or custom storage policies need review. The baseline refuses existing public relations or auth users unless its private staging marker already exists. The marker is an accidental-target guard, not proof of the cloud project's identity; never add it manually to bypass the guard.

## Installation order

Apply these complete files to the **staging** SQL Editor or explicitly targeted database connection, stopping on the first error:

1. `supabase/staging-baseline.sql`
2. `supabase/migrations/202609100900_owner_leads_foundation.sql`
3. `supabase/migrations/202609101100_google_connections.sql`
4. `supabase/migrations/202609101500_visibility_tasks.sql`
5. `supabase/migrations/202609101600_public_request_limits.sql`

Each file is transactional. The baseline and all four migrations can be rerun without resetting staging rows or restoring revoked browser permissions. Keep the marker schema `autolocal_staging` outside the Data API's exposed schemas.

Do **not** also run `schema.sql`, `rebuild.sql`, `rebuild-storage.sql`, the root historical schemas, or the three older migrations. Their required structure is included. Do not blindly push the mixed historical migration directory. SQL Editor execution does not automatically record CLI migration history: record the five filenames in the release log and reconcile history explicitly before switching to CLI migrations.

Browser table access is limited to the owner's businesses, brand profiles, posts and read-only subscriptions. Website drafts, inquiries, tokens, jobs, audit data and billing changes use server routes. All application tables have RLS enabled; operational RPCs are server-only.

## Storage setup after the SQL files

Create only `client-assets`: **public reads**, **5,242,880 bytes**, and **image/jpeg, image/png, image/webp**. These match `src/lib/site-media.ts`. Images must be content the owner intends to display publicly, even before website publication. The app checks ownership and file signatures before a server upload. Do not add browser upload/update/delete policies. The historical `logos` bucket is only referenced by an old admin cleanup path; current editing does not require it.

Use the Dashboard or this SDK procedure. It creates a missing bucket, rereads it, and refuses incompatible existing settings without changing them. No files are uploaded. Supabase recommends making Storage operations through its API and treating its metadata as read-only. [Storage schema](https://supabase.com/docs/guides/storage/schema/design), [bucket creation](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [access control](https://supabase.com/docs/guides/storage/security/access-control).

Provide `AUTOLOCAL_STAGING_PROJECT_REF`, `AUTOLOCAL_STAGING_SUPABASE_URL`, and `AUTOLOCAL_STAGING_SERVICE_ROLE_KEY` in the secret environment. Never paste keys into this document or command history. Run this JavaScript with Node's module input mode from the repo, without loading `.env.local`:

```javascript
import { createClient } from '@supabase/supabase-js';

// BEGIN TESTED STAGING STORAGE PROCEDURE
async function ensureStagingStorage(client) {
  const bucketId = 'client-assets';
  const expectedMime = ['image/jpeg', 'image/png', 'image/webp'];
  let result = await client.storage.getBucket(bucketId);
  if (result.error) {
    if (Number(result.error.statusCode || result.error.status) !== 404) {
      throw new Error('Staging storage lookup failed; no bucket was changed.');
    }
    const created = await client.storage.createBucket(bucketId, {
      public: true, fileSizeLimit: 5242880, allowedMimeTypes: expectedMime
    });
    if (created.error && Number(created.error.statusCode || created.error.status) !== 409) {
      throw new Error('Staging bucket creation failed; inspect the staging project.');
    }
    result = await client.storage.getBucket(bucketId);
  }
  const bucket = result.data;
  if (result.error || !bucket || bucket.id !== bucketId || bucket.name !== bucketId ||
      bucket.public !== true || Number(bucket.file_size_limit) !== 5242880 ||
      JSON.stringify([...(bucket.allowed_mime_types || [])].sort()) !== JSON.stringify([...expectedMime].sort())) {
    throw new Error('Existing staging bucket settings need review; no existing settings were changed.');
  }
  return { bucket: bucketId, verified: true };
}
// END TESTED STAGING STORAGE PROCEDURE

const ref = process.env.AUTOLOCAL_STAGING_PROJECT_REF;
const url = process.env.AUTOLOCAL_STAGING_SUPABASE_URL;
const key = process.env.AUTOLOCAL_STAGING_SERVICE_ROLE_KEY;
if (!ref || !/^[a-z0-9]{20}$/.test(ref) || url !== 'https://' + ref + '.supabase.co' || !key) {
  throw new Error('Explicit matching staging project reference, URL and server key are required.');
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(await ensureStagingStorage(client));
```

Read back bucket settings and storage policies before declaring setup complete. A fresh project should have no custom `anon`, `authenticated`, or `public` write policy on `storage.objects`. Do not alter Supabase's managed storage schema or globally revoke its platform permissions; review unexpected policies instead.

## Read-only verification

```sql
SELECT baseline_version, created_at FROM autolocal_staging.installation;
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;
SELECT has_table_privilege('anon','public.website_previews','SELECT') AS anon_drafts,
       has_table_privilege('authenticated','public.site_leads','SELECT') AS browser_leads,
       has_table_privilege('authenticated','public.google_connections','SELECT') AS browser_tokens,
       has_table_privilege('authenticated','public.subscriptions','UPDATE') AS browser_billing_write,
       has_function_privilege('anon','public.submit_site_lead(text,text,text,text,text,text,text,text,jsonb,uuid)','EXECUTE') AS anonymous_rpc;
SELECT to_regclass('public.integration_jobs'), to_regclass('public.billing_events'),
       to_regclass('public.google_oauth_states'), to_regclass('public.visibility_tasks'),
       to_regclass('public.public_request_limits');
```

All 26 application tables must report RLS enabled; all five privilege flags must be false. The full runtime column/RPC manifest is checked in `tests/staging-schema.test.ts`.

Run locally with `npx tsx --test tests/staging-schema.test.ts`. PGlite starts empty with minimal Supabase-managed auth stand-ins, applies the actual baseline and four migrations, verifies owner isolation/browser denials and runtime RPCs, and replays the complete sequence with fixture data to prove preservation. The exact documented Storage procedure is exercised through a mocked SDK boundary.

PGlite does not run Supabase Auth, PostgREST, Storage's HTTP service/CDN, or cloud default grants. Before using staging, verify its live platform roles, schema-cache/API availability, storage RLS/default policies, bucket readback, and owner upload/read flow using synthetic content. These are fresh-platform assumptions requiring **staging** readback. No production schema, account, data or secret needs to be read or copied. This baseline cannot reconcile an existing production schema.
