import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('fresh database recovery preserves private data and both change-request formats', async () => {
  const db = new PGlite()
  try {
    // Supabase-provided roles/auth schema, represented locally for SQL validation.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    `)
    await db.exec(readFileSync('supabase/rebuild.sql', 'utf8'))
    const tables = await db.query<{count: number}>("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")
    assert.equal(tables.rows[0].count, 16)
    await db.exec(`SET ROLE service_role;
      INSERT INTO public.website_previews(slug,business_name,email) VALUES ('recovery-test','Recovery Test','owner@example.invalid');
      INSERT INTO public.change_requests(preview_slug,message) VALUES ('recovery-test','Test change');
      SELECT public.increment_preview_views('recovery-test');`)
    const changes = await db.query<{preview_id: string}>('SELECT preview_id FROM public.change_requests')
    assert.ok(changes.rows[0].preview_id)
    const sites = await db.query<{hosting_status: string; view_count: number}>('SELECT hosting_status, view_count FROM public.website_previews')
    assert.deepEqual(sites.rows[0], {hosting_status: 'preview', view_count: 1})
    for (const role of ['anon','authenticated']) {
      await db.exec(`RESET ROLE; SET ROLE ${role};`)
      await assert.rejects(db.query('SELECT * FROM public.website_previews'), /permission denied/)
      await assert.rejects(db.query("SELECT public.increment_preview_views('recovery-test')"), /permission denied/)
    }
    await db.exec('RESET ROLE;')
    await assert.rejects(db.exec(readFileSync('supabase/rebuild.sql','utf8')), /requires an empty/)
    await db.exec('ROLLBACK;')
  } finally { await db.close() }
})
