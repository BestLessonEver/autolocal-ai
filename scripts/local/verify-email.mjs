#!/usr/bin/env node
// Captured local email + real PKCE callback; never prints mail, links, or tokens.
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import { createServerClient } from '@supabase/ssr'
import { load } from 'cheerio'

class EmailPilotFailure extends Error {
  constructor(check, status) { super(check); this.check = check; this.status = status }
}
function ensure(value, check, status) { if (!value) throw new EmailPilotFailure(check, status) }
function localOrigin(value, label) {
  let url
  try { url = new URL(value) } catch { throw new EmailPilotFailure(label) }
  ensure(['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, label)
  return url.origin
}
function pass(check) { console.log(JSON.stringify({ check, status: 'pass' })) }

async function main() {
  const appOrigin = localOrigin(process.env.AUTOLOCAL_LOCAL_APP_URL || 'http://127.0.0.1:3102', 'application_must_be_loopback')
  const apiOrigin = localOrigin(process.env.AUTOLOCAL_LOCAL_API_URL || 'http://127.0.0.1:54321', 'auth_must_be_loopback')
  const mailOrigin = localOrigin(process.env.AUTOLOCAL_LOCAL_MAILPIT_URL || 'http://127.0.0.1:54324', 'mail_catcher_must_be_loopback')
  ensure(new Set([appOrigin, apiOrigin, mailOrigin]).size === 3, 'local_services_must_be_distinct')
  const anonKey = process.env.AUTOLOCAL_LOCAL_ANON_KEY
  ensure(anonKey, 'local_anon_key_required')
  ensure(process.argv.includes('--run'), 'explicit_run_flag_required')
  const runId = randomUUID().slice(0, 8)
  const email = `autolocal-email-pilot-${runId}@example.test`
  const returnPath = `/dashboard?tab=settings&local_pilot=${runId}`
  const callback = new URL('/auth/callback', appOrigin)
  callback.searchParams.set('next', returnPath)
  const cookies = new Map()

  function storeCookies(response) {
    for (const item of response.headers.getSetCookie()) {
      const part = item.split(';', 1)[0], separator = part.indexOf('=')
      if (separator <= 0) continue
      const name = part.slice(0, separator), value = part.slice(separator + 1)
      if (value) cookies.set(name, value); else cookies.delete(name)
    }
  }
  const authFetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    ensure(url.origin === apiOrigin && !url.username && !url.password, 'auth_request_outside_local_api')
    return fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) })
  }
  function authClient() {
    return createServerClient(apiOrigin, anonKey, {
      auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: authFetch },
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: values => { for (const cookie of values) { if (cookie.value) cookies.set(cookie.name, cookie.value); else cookies.delete(cookie.name) } },
      },
    })
  }
  async function appRequest(path, authenticated = false) {
    const url = new URL(path, appOrigin)
    ensure(url.origin === appOrigin && !url.username && !url.password, 'application_request_outside_local_origin')
    const headers = authenticated ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}
    const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(45000) })
    if (authenticated) storeCookies(response)
    return response
  }
  async function mailRequest(path, query) {
    ensure(path === '/api/v1/search' || /^\/api\/v1\/message\/[a-zA-Z0-9_-]+$/.test(path), 'only_targeted_mail_reads_allowed')
    const url = new URL(path, mailOrigin)
    if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
    ensure(response.status === 200, 'local_mailpit_api_available', response.status)
    return response.json()
  }
  const search = () => mailRequest('/api/v1/search', { query: `to:${email}`, limit: '10' })
  const intendedRecipient = message => Array.isArray(message.To) && message.To.length === 1 && message.To[0].Address?.toLowerCase() === email

  const healthResponse = await appRequest('/api/system/health')
  ensure(healthResponse.status === 200, 'local_application_health', healthResponse.status)
  const health = await healthResponse.json()
  ensure(health.services?.accounts === true, 'local_auth_configured')
  for (const service of ['businessSearch', 'billing', 'publishing', 'domainPurchases', 'notifications', 'googleBusinessProfile', 'searchConsole']) ensure(health.services[service] === false, 'external_services_must_be_disabled')
  const initialMail = await search()
  ensure(Array.isArray(initialMail.messages) && initialMail.messages.length === 0, 'synthetic_recipient_has_no_prior_mail')
  ensure((await appRequest('/api/dashboard/my-sites')).status === 401, 'anonymous_dashboard_denied')
  pass('isolated_local_auth_application_and_targeted_mail_catcher_available')

  const auth = authClient()
  const requested = await auth.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.href, shouldCreateUser: true } })
  ensure(!requested.error, 'request_captured_local_sign_in_email')
  ensure([...cookies.keys()].some(name => name.includes('-code-verifier')), 'pkce_verifier_cookie_retained')
  pass('real_email_sign_in_requested_with_pkce_cookie')

  let summary
  const deadline = Date.now() + 30000
  while (!summary && Date.now() < deadline) {
    const results = await search()
    ensure(Array.isArray(results.messages), 'mailpit_search_response_valid')
    const matches = results.messages.filter(intendedRecipient)
    ensure(matches.length <= 1, 'single_captured_sign_in_message')
    summary = matches[0]
    if (!summary) await pause(750)
  }
  ensure(summary && /^[a-zA-Z0-9_-]+$/.test(summary.ID), 'captured_sign_in_email_arrived')
  const message = await mailRequest(`/api/v1/message/${summary.ID}`)
  ensure(message.ID === summary.ID && intendedRecipient(message), 'captured_mail_matches_only_synthetic_recipient')
  // Cheerio parses the captured HTML without executing scripts or loading media.
  const document = load(typeof message.HTML === 'string' ? message.HTML : '')
  const candidates = [...document('a[href]').map((_, element) => document(element).attr('href')).get(),
    ...(typeof message.Text === 'string' ? message.Text.match(/https?:\/\/[^\s<>"']+/g) || [] : []),
  ]
  const links = new Set()
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      if (url.origin === apiOrigin && url.pathname === '/auth/v1/verify' && !url.username && !url.password && !url.hash
        && url.searchParams.has('token') && ['signup', 'magiclink'].includes(url.searchParams.get('type'))
        && url.searchParams.get('redirect_to') === callback.href) links.add(url.href)
    } catch { /* Unrelated or malformed message links are never followed. */ }
  }
  ensure(links.size === 1, 'one_local_supabase_verification_link')
  let next = new URL([...links][0])
  ensure(next.searchParams.get('redirect_to') === callback.href, 'captured_link_retains_intended_callback')
  pass('only_synthetic_mail_read_and_local_verification_link_selected')

  let callbackVisited = false
  let nextPreserved = false
  let redirectCount = 0
  while (redirectCount < 5) {
    ensure([apiOrigin, appOrigin].includes(next.origin) && !next.username && !next.password && !next.hash, 'verification_redirect_must_stay_local')
    const isCallback = next.origin === appOrigin
    if (isCallback) {
      ensure(next.pathname === '/auth/callback' && next.searchParams.has('code') && next.searchParams.get('next') === returnPath, 'actual_pkce_callback_has_code_and_next')
      ensure(!callbackVisited, 'callback_is_not_repeated')
      callbackVisited = true
    } else ensure(next.pathname === '/auth/v1/verify', 'only_local_auth_verification_route_followed')
    const response = isCallback ? await appRequest(next.href, true)
      : await fetch(next, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    ensure([301, 302, 303, 307, 308].includes(response.status), 'verification_returns_expected_redirect', response.status)
    const location = response.headers.get('location')
    ensure(location, 'verification_redirect_has_destination')
    next = new URL(location, next)
    redirectCount++
    if (isCallback) {
      ensure(next.origin === appOrigin && !next.username && !next.password && next.pathname + next.search + next.hash === returnPath, 'callback_preserves_intended_local_next')
      nextPreserved = true
      break
    }
  }
  ensure(callbackVisited && nextPreserved, 'pkce_callback_completed')
  const signedIn = await authClient().auth.getUser()
  ensure(!signedIn.error && signedIn.data.user?.email === email && signedIn.data.user?.email_confirmed_at, 'captured_email_produces_verified_authenticated_user')
  const dashboard = await appRequest('/api/dashboard/my-sites', true)
  ensure(dashboard.status === 200, 'email_session_authenticates_application', dashboard.status)
  const sites = await dashboard.json()
  ensure(Array.isArray(sites) && sites.length === 0, 'new_email_owner_has_isolated_empty_dashboard')
  pass('actual_pkce_callback_sets_verified_session_and_preserves_next')
  console.log(JSON.stringify({ status: 'pass', verification: 'real_local_captured_email_pkce', runId,
    userId: signedIn.data.user.id, capturedMail: true, nextPreserved: true, browserVerified: false,
    cloudEmailSent: false, syntheticUserAndMailRetained: true,
  }))
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'fail', check: error instanceof EmailPilotFailure ? error.check : 'local_email_request_failed',
    ...(error instanceof EmailPilotFailure && Number.isInteger(error.status) ? { httpStatus: error.status } : {}),
  }))
  process.exitCode = 1
})
