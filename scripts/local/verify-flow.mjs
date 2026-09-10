#!/usr/bin/env node
// Real HTTP pilot for an explicitly selected local Supabase + application only.
// No environment files, cloud services, provider mocks, or mail workers are used.
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

class PilotFailure extends Error {
  constructor(check, status) { super(check); this.check = check; this.status = status }
}
function ensure(value, check, status) { if (!value) throw new PilotFailure(check, status) }
function localOrigin(value, label) {
  let url
  try { url = new URL(value) } catch { throw new PilotFailure(label) }
  ensure(['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, label)
  return url.origin
}
function required(name) { ensure(Boolean(process.env[name]), 'local_credentials_missing'); return process.env[name] }
function pass(check) { console.log(JSON.stringify({ check, status: 'pass' })) }

async function main() {
  const appOrigin = localOrigin(process.env.AUTOLOCAL_LOCAL_APP_URL || 'http://127.0.0.1:3102', 'application_must_be_loopback')
  const apiOrigin = localOrigin(process.env.AUTOLOCAL_LOCAL_API_URL || 'http://127.0.0.1:54321', 'database_must_be_loopback')
  ensure(appOrigin !== apiOrigin, 'application_and_database_must_be_distinct')
  const anonKey = required('AUTOLOCAL_LOCAL_ANON_KEY')
  const serviceKey = required('AUTOLOCAL_LOCAL_SERVICE_ROLE_KEY')
  ensure(process.argv.includes('--run'), 'explicit_run_flag_required')
  const allowedOrigins = new Set([appOrigin, apiOrigin])
  const guardedFetch = async (input, options = {}) => {
    const target = new URL(input instanceof Request ? input.url : String(input))
    ensure(allowedOrigins.has(target.origin) && !target.username && !target.password, 'request_outside_selected_local_services')
    return fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(45000) })
  }
  const admin = createClient(apiOrigin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guardedFetch } })
  const runId = randomUUID().slice(0, 8)
  const owners = []
  const sites = []
  let leadId
  let eligibilitySeeded = false
  let originalEligibility
  let failure
  let completedChecks = 0
  const done = check => { completedChecks++; pass(check) }

  async function request(path, { owner, method = 'GET', body, form } = {}) {
    ensure(path.startsWith('/api/'), 'only_application_api_routes_allowed')
    const headers = {}
    if (owner) headers.Cookie = [...owner.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await guardedFetch(new URL(path, appOrigin), {
      method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)),
    })
    if (owner) for (const item of response.headers.getSetCookie()) {
      const part = item.split(';', 1)[0], separator = part.indexOf('=')
      if (separator > 0) {
        const name = part.slice(0, separator), value = part.slice(separator + 1)
        if (value) owner.cookies.set(name, value); else owner.cookies.delete(name)
      }
    }
    const data = await response.json().catch(() => null)
    return { status: response.status, data }
  }
  function success(result, check) { ensure(result.status === 200, check, result.status); return result.data }
  async function readSite(site) {
    const result = await admin.from('website_previews').select('*').eq('id', site.id).eq('owner_id', site.ownerId).single()
    ensure(!result.error && result.data, 'local_site_readback')
    return result.data
  }
  async function createOwner(label) {
    const email = `autolocal-pilot-${runId}-${label}@example.test`
    const password = randomBytes(32).toString('base64url')
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { local_pilot: runId } })
    ensure(!created.error && created.data.user?.email_confirmed_at, 'create_verified_local_owner')
    const owner = { id: created.data.user.id, email, cookies: new Map() }
    const auth = createServerClient(apiOrigin, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: guardedFetch },
      cookies: {
        getAll: () => [...owner.cookies].map(([name, value]) => ({ name, value })),
        setAll: cookies => { for (const cookie of cookies) { if (cookie.value) owner.cookies.set(cookie.name, cookie.value); else owner.cookies.delete(cookie.name) } },
      },
    })
    const signedIn = await auth.auth.signInWithPassword({ email, password })
    ensure(!signedIn.error && signedIn.data.user?.id === owner.id && owner.cookies.size > 0, 'sign_in_verified_local_owner')
    owners.push(owner)
    return owner
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMw7kj7DwAENAIhJ+yrnwAAAABJRU5ErkJggg==', 'base64')
  function photoForm() {
    const form = new FormData()
    form.set('target', 'hero')
    form.set('photo', new Blob([png], { type: 'image/png' }), 'synthetic-pixel.png')
    return form
  }

  try {
    const health = success(await request('/api/system/health'), 'local_application_health')
    ensure(health?.services?.accounts === true, 'local_accounts_configured')
    for (const service of ['businessSearch', 'billing', 'publishing', 'domainPurchases', 'notifications', 'googleBusinessProfile', 'searchConsole']) {
      ensure(health.services[service] === false, 'external_services_must_be_disabled')
    }
    done('loopback_services_and_disabled_external_integrations')
    ensure((await request('/api/dashboard/my-sites')).status === 401, 'anonymous_dashboard_denied')
    const [first, second] = [await createOwner('one'), await createOwner('two')]
    for (const owner of owners) {
      const list = success(await request('/api/dashboard/my-sites', { owner }), 'authenticated_site_list')
      ensure(Array.isArray(list) && list.length === 0, 'new_owner_has_no_existing_sites')
    }
    done('two_verified_local_owners_authenticate_with_real_session_cookies')

    for (const [index, owner] of owners.entries()) {
      const draft = success(await request('/api/intake/submit', { owner, method: 'POST', body: {
        businessName: `AutoLocal Local Pilot ${runId} Owner ${index + 1}`, city: 'Test City', state: 'TX',
        category: 'Home Services', template: index === 0 ? 'summit' : 'ledger',
        contactEmail: `public-${runId}-${index}@example.test`,
        description: 'Synthetic local verification business. Not a real customer.',
        services: [{ name: 'Synthetic service', description: 'Local test only.' }],
      } }), 'manual_intake_saves')
      ensure(draft.success === true && typeof draft.slug === 'string', 'manual_intake_returns_draft')
      const detail = success(await request(`/api/dashboard/me?slug=${encodeURIComponent(draft.slug)}`, { owner }), 'owner_reads_saved_draft')
      const site = { id: detail.id, slug: detail.slug, ownerId: owner.id }
      const stored = await readSite(site)
      ensure(stored.owner_id === owner.id && stored.hosting_status === 'preview' && !stored.website_current && !stored.deployment_verified_at, 'draft_is_owned_and_unpublished')
      sites.push(site)
    }
    const [firstSite, secondSite] = sites
    for (const [index, owner] of owners.entries()) {
      const list = success(await request('/api/dashboard/my-sites', { owner }), 'owner_lists_own_site')
      ensure(list.length === 1 && list[0].id === sites[index].id, 'site_list_is_owner_scoped')
    }
    done('manual_drafts_persist_and_owner_lists_are_isolated')

    success(await request(`/api/dashboard/me/details?siteId=${firstSite.id}`, { owner: first, method: 'PATCH', body: {
      tagline: 'Saved through the local HTTP pilot', owner_id: second.id, email: second.email,
      hosting_status: 'active', website_current: 'https://should-never-be-published.example.test', stripe_customer_id: 'forged-local-customer',
    } }), 'owner_can_save_allowed_content')
    const saved = await readSite(firstSite)
    ensure(saved.tagline === 'Saved through the local HTTP pilot' && saved.owner_id === first.id && saved.email === first.email
      && saved.hosting_status === 'preview' && !saved.website_current && !saved.stripe_customer_id, 'protected_owner_and_billing_fields_ignored')
    const forbidden = [
      await request(`/api/dashboard/me?siteId=${firstSite.id}`, { owner: second }),
      await request(`/api/dashboard/me/details?siteId=${firstSite.id}`, { owner: second, method: 'PATCH', body: { tagline: 'Cross-owner overwrite' } }),
      await request('/api/intake/submit', { owner: second, method: 'POST', body: { slug: firstSite.slug, businessName: 'Cross-owner overwrite', email: first.email, owner_id: second.id } }),
      await request(`/api/dashboard/me/photos?siteId=${firstSite.id}`, { owner: second }),
      await request(`/api/dashboard/me/photos?siteId=${firstSite.id}`, { owner: second, method: 'POST', form: photoForm() }),
    ]
    ensure(forbidden.every(result => result.status === 404), 'cross_owner_reads_and_writes_denied')
    ensure((await readSite(firstSite)).tagline === saved.tagline, 'cross_owner_attempts_do_not_mutate_draft')
    const anonymous = createClient(apiOrigin, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guardedFetch } })
    const privateRows = await anonymous.from('website_previews').select('id').eq('id', firstSite.id)
    ensure(privateRows.error && !privateRows.data, 'anonymous_database_drafts_denied')
    done('cross_owner_and_privileged_field_attacks_fail_without_mutation')

    const uploaded = success(await request(`/api/dashboard/me/photos?siteId=${firstSite.id}`, { owner: first, method: 'POST', form: photoForm() }), 'owner_uploads_real_local_png')
    ensure(uploaded.success === true && typeof uploaded.url === 'string', 'local_upload_returns_asset')
    const asset = new URL(uploaded.url)
    ensure(asset.origin === apiOrigin && asset.pathname.startsWith(`/storage/v1/object/public/client-assets/${first.id}/`), 'uploaded_asset_is_local_and_owner_scoped')
    const image = await guardedFetch(asset)
    ensure(image.status === 200 && Buffer.from(await image.arrayBuffer()).equals(png), 'uploaded_image_bytes_read_back')
    ensure((await readSite(firstSite)).hero_image_url === uploaded.url, 'uploaded_image_persists_on_owned_site')
    const invalidPhoto = new FormData()
    invalidPhoto.set('file', new Blob(['<svg>synthetic invalid image</svg>'], { type: 'image/svg+xml' }), 'unsafe.svg')
    const unsupported = await request('/api/intake/upload', { owner: first, method: 'POST', form: invalidPhoto })
    ensure(unsupported.status === 400 && unsupported.data?.error === 'Upload a PNG, JPEG or WebP image.', 'unsupported_upload_type_rejected')
    done('real_local_image_upload_readback_and_invalid_type_rejection')

    const inquiry = {
      slug: firstSite.slug, name: 'Synthetic Local Prospect', email: `prospect-${runId}@example.test`,
      message: 'Local pilot inquiry; do not contact.', service: 'Synthetic service', source: 'local-pilot',
      utm_source: 'local-pilot', utm_campaign: runId, landing_page: `${appOrigin}/preview/${firstSite.slug}`,
      submission_id: randomUUID(),
    }
    ensure((await request('/api/leads/submit', { method: 'POST', body: inquiry })).status === 404, 'draft_rejects_public_inquiries')
    // Seed ONLY this newly created local fixture's eligibility. This is not a
    // payment or a real publishing test; no provider job or worker is invoked.
    const originalSite = await readSite(firstSite)
    originalEligibility = Object.fromEntries(['status', 'hosting_status', 'deploy_status', 'deployment_verified_at', 'website_current'].map(field => [field, originalSite[field]]))
    ensure(Object.values(originalEligibility).every(value => value !== undefined), 'original_local_eligibility_captured')
    eligibilitySeeded = true
    const eligible = await admin.from('website_previews').update({ hosting_status: 'active', status: 'published', deploy_status: 'live',
      deployment_verified_at: new Date().toISOString(), website_current: `${appOrigin}/local-pilot/${runId}`,
    }).eq('id', firstSite.id).eq('owner_id', first.id).select('id').single()
    ensure(!eligible.error && eligible.data?.id === firstSite.id, 'seed_local_inquiry_eligibility')
    const lead = success(await request('/api/leads/submit', { method: 'POST', body: inquiry }), 'public_inquiry_persists')
    ensure(lead.success === true && typeof lead.lead_id === 'string', 'public_inquiry_returns_saved_identifier')
    leadId = lead.lead_id
    const replay = success(await request('/api/leads/submit', { method: 'POST', body: inquiry }), 'inquiry_retry_returns_success')
    ensure(replay.lead_id === leadId, 'inquiry_retry_uses_same_record')
    ensure((await request('/api/leads/submit', { method: 'POST', body: { ...inquiry, website: 'honeypot-filled' } })).status === 400, 'inquiry_honeypot_rejected')
    const [leadRows, outbox] = await Promise.all([
      admin.from('site_leads').select('id,site_id,status,source,attribution').eq('site_id', firstSite.id),
      admin.from('lead_notifications').select('id,lead_id,status,attempts').eq('site_id', firstSite.id),
    ])
    ensure(!leadRows.error && leadRows.data?.length === 1 && leadRows.data[0].id === leadId
      && leadRows.data[0].source === 'local-pilot' && leadRows.data[0].attribution.utm_campaign === runId, 'one_inquiry_with_attribution_read_back')
    ensure(!outbox.error && outbox.data?.length === 1 && outbox.data[0].lead_id === leadId
      && outbox.data[0].status === 'pending' && outbox.data[0].attempts === 0, 'one_notification_queued_without_delivery')
    done('real_inquiry_retry_deduplication_attribution_and_durable_unsent_outbox')

    const inbox = success(await request(`/api/leads?siteId=${firstSite.id}&leadId=${leadId}`, { owner: first }), 'owner_reads_direct_inquiry')
    ensure(inbox.total === 1 && inbox.leads[0].id === leadId && inbox.leads[0].status === 'new', 'owner_inbox_has_saved_inquiry')
    const otherInbox = success(await request(`/api/leads?siteId=${firstSite.id}&leadId=${leadId}`, { owner: second }), 'other_owner_inquiry_list')
    ensure(otherInbox.total === 0 && otherInbox.leads.length === 0, 'other_owner_cannot_read_inquiry')
    ensure((await request(`/api/leads/${leadId}`, { owner: second, method: 'PATCH', body: { status: 'won' } })).status === 404, 'other_owner_cannot_change_inquiry')
    ensure((await request(`/api/leads/${leadId}`, { method: 'PATCH', body: { status: 'won' } })).status === 401, 'anonymous_cannot_change_inquiry')
    success(await request(`/api/leads/${leadId}`, { owner: first, method: 'PATCH', body: { status: 'qualified', notes: 'Synthetic qualification; no customer contact.' } }), 'owner_updates_inquiry_status')
    const refreshed = success(await request(`/api/leads?leadId=${leadId}`, { owner: first }), 'owner_reads_changed_status')
    ensure(refreshed.leads[0]?.status === 'qualified' && refreshed.leads[0]?.notes === 'Synthetic qualification; no customer contact.', 'inquiry_status_and_notes_persist')
    const summary = success(await request(`/api/leads/summary?siteId=${firstSite.id}`, { owner: first }), 'owner_reads_lead_summary')
    const otherSummary = success(await request(`/api/leads/summary?siteId=${secondSite.id}`, { owner: second }), 'other_owner_reads_empty_summary')
    ensure(summary.inquiries === 1 && summary.new === 0 && summary.qualified === 1 && summary.won === 0 && otherSummary.inquiries === 0, 'lead_summaries_match_isolated_saved_state')
    done('owner_inquiry_status_summary_and_cross_owner_protection')
  } catch (error) { failure = error }
  finally {
    if (eligibilitySeeded && sites[0]) {
      try {
        const restored = await admin.from('website_previews').update(originalEligibility)
          .eq('id', sites[0].id).eq('owner_id', sites[0].ownerId).select('id').single()
        ensure(!restored.error && restored.data?.id === sites[0].id, 'restore_local_draft_eligibility')
        const readback = await readSite(sites[0])
        ensure(Object.entries(originalEligibility).every(([field, value]) => readback[field] === value), 'restored_local_eligibility_matches_original')
        done('synthetic_site_original_eligibility_restored')
      } catch { failure = new PilotFailure('restore_local_draft_eligibility') }
    }
  }
  if (failure) throw failure
  console.log(JSON.stringify({ status: 'pass', verification: 'real_local_http', checks: completedChecks, runId,
    ownerIds: owners.map(owner => owner.id), siteIds: sites.map(site => site.id), leadId,
    retainedSyntheticRecords: true, externalServicesInvoked: false, notificationDelivered: false,
  }))
}

main().catch(error => {
  // Never print SDK errors, response bodies, URLs, credentials, or session data.
  console.error(JSON.stringify({ status: 'fail', check: error instanceof PilotFailure ? error.check : 'local_request_failed',
    ...(error instanceof PilotFailure && Number.isInteger(error.status) ? { httpStatus: error.status } : {}),
  }))
  process.exitCode = 1
})
