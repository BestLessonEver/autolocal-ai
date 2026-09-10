# AutoLocal release preparation

This is the implementation and release checklist. Follow the operator's current release authorization; this document does not grant permissions or establish a deployed state. Keep account-specific evidence outside the public repository. Configuration presence is not a working connection.

## Runtime and deployment topology

Use Node.js 24 LTS, Next.js 16.3.4, React 19.3, TypeScript, and the committed npm lockfile. Next 16 is an actively supported major; replacing this application with another framework is unnecessary. The proxy convention and asynchronous cookie APIs have been migrated. ESLint 10 uses the compatibility adapter required by Next's current React plugin.

The initial inspection found the main application served through Railway and the client-site publishing integration targeting Vercel. Preserve that separation unless an explicit hosting migration is approved: Railway runs the Next app/API, Supabase provides authentication/private data/storage, and Vercel hosts generated client sites. DNS observations are a dated snapshot, not control of those accounts. Confirm the selected Railway service, Vercel team, and domain project mappings in their owner accounts before release.

For the application service, install with `npm ci`, build with `npm run build`, and run `npm start` on the platform-provided `PORT`. Set the service runtime to Node 24. Give production and staging separate Supabase projects, Stripe modes, sender settings, public origins, and publishing domains. Do not reuse production service-role keys locally.

For isolated local UI work:

```sh
npm exec --yes --package=node@24 -- node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
```

Set `NEXT_DIST_DIR=.next-dev` when running development beside a production build. Do not run a second development server on the same port/output directory.

## Checks that need no provider accounts

```sh
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

The GitHub Actions workflow runs these checks with no provider secrets and all side effects disabled. It does not deploy. Local tests mock provider HTTP responses and use an isolated PostgreSQL-compatible test database. The tests cover ownership, private previews, durable inquiry capture/notification retries, Google OAuth/write boundaries, payment event leases, duplicate checkout recovery, bundled orders, stale subscription events, approved content snapshots, provider readiness, exact public revision markers, and superseded jobs.

`npm run check:config` prints booleans only and sends no network requests. Use `node --env-file=.env.local --import tsx scripts/operations/check-config.ts --strict` to inspect an explicitly selected deployment configuration. Strict release checks require an explicit plain HTTPS `NEXT_PUBLIC_SITE_URL` and the durable public rate-limit key; the development localhost fallback does not qualify. Proxy trust and the operator's edge-verification flag are reported separately and still need deployment-specific verification. `/api/system/health` exposes owner-friendly availability; `/api/admin/integrations` requires the internal bearer key and exposes configuration presence. None of these checks proves a provider was contacted successfully.

## Database and account setup

For an empty staging Supabase project, first prepare and review the baseline tables from the current schema; the additive migrations assume base tables such as `website_previews` already exist. Then review and apply the additive migrations in order:

1. `supabase/migrations/202609100900_owner_leads_foundation.sql`
2. `supabase/migrations/202609101100_google_connections.sql`
3. `supabase/migrations/202609101500_visibility_tasks.sql`
4. `supabase/migrations/202609101600_public_request_limits.sql`

Apply all four before exercising the rebuilt application. The visibility task tables support the owner plan even when scheduled Google refresh is disabled; the shared limiter supports protected public requests. Feature switches do not replace the database setup.

Do not run `supabase/rebuild.sql` against a populated production database. Before production migration, make an owner-controlled backup and verify existing records, constraints, RLS policies, storage policies, and subscription mappings against the actual schema. Rehearse the additive migrations against the actual backup, then record each environment's migration result privately.

Configure the correct Supabase URL, public anon key, and server-only service-role key. Require verified email. Allow the exact staging and production `/auth/callback` URLs in Supabase. Test two independent owner accounts: each must see only its own sites, inquiries, changes, uploads, billing account, Google resources, and proposals. Legacy emailed dashboard tokens and client-supplied email addresses grant no ownership.

Map existing paid subscriptions by their exact Stripe subscription ID before enabling webhook handling. A signed legacy event without new metadata is accepted only when that exact provider ID is already stored on one website. No subscription is reassigned by email. Review any unknown legacy event explicitly.

## Stripe plans and checkout

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_HOSTING_PRICE_ID`, and optionally `STRIPE_MANAGED_PRICE_ID` from the selected environment. `/api/plans` lists only active, configured, monthly Stripe prices with active products. Amount, currency, billing interval, and product scope come from Stripe. Optional product metadata:

- `scope`: the actual included service description.
- `includes_hosting=true`: only if a managed plan actually includes website hosting.
- `trial_days`: integer 0–30; absent means no trial.

No new rates, free trials, rush fees, or change fees are invented in checkout. Existing subscriptions are not repriced. Managed subscriptions have their own `subscription_status`; a managed plan without hosting does not activate hosting.

Enable billing only in the chosen staging environment with `AUTOLOCAL_ENABLE_BILLING=true`. Configure the Stripe customer portal and a webhook at `/api/webhook/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, and `customer.subscription.deleted`. Verify the signing secret belongs to that endpoint and environment.

Using Stripe test mode, confirm one hosting purchase, cancellation, payment failure, duplicate event delivery, browser return before webhook delivery, retry after a lost checkout response, and a hosting/domain bundle with the registrar mocked. Checkout persists one site-level intent and reuses its provider idempotency key. A completed checkout cannot release that intent until durable event processing is confirmed. Do not use live charges to test the software.

## Website publishing and domains

Set the intended Vercel team/token and `AUTOLOCAL_SITES_DOMAIN`. For staging, use an isolated owned staging domain and staging-only client projects/slugs, or a separate Vercel team. Do not copy production `vercel_project_id` values into staging. The project naming convention is `autolocal-${slug}`, so a different application origin alone does not isolate generated-site publishing. Confirm wildcard DNS/project mappings and the public application origin before enabling publishing. The static site's form posts to `NEXT_PUBLIC_SITE_URL`; that origin must be the correct environment.

`AUTOLOCAL_ENABLE_PUBLISHING=true` enables publishing requests. An authenticated owner or authorized internal request queues approved public content. The worker creates a preview deployment, waits for provider `READY`, verifies the exact tenant and revision at the immutable Vercel URL, checks that the job is still the current request, promotes that deployment, verifies the domain belongs to that project, and checks the same revision over public HTTPS. Only then is the database marked live. Provider protection on immutable preview URLs may require `VERCEL_AUTOMATION_BYPASS_SECRET`; it is sent only to `.vercel.app` verification URLs and never to customer domains. Public production site URLs must remain accessible to customers.

Saved edits after queuing do not change the queued content. Old jobs are superseded, retries are bounded, and only one job per site is leased at a time. The last verified website and its inquiry form remain usable during a subsequent pending or failed update. A hosting cancellation disables inquiry eligibility and queues a suspension page. Cancellation/restore and explicit rollback must be verified in staging. Legacy designs must be reviewed in a current template before a new hosting activation or owner publish.

Domain buying stays disabled by default. Before enabling `AUTOLOCAL_ENABLE_DOMAIN_PURCHASES`, confirm the authorized registrant, privacy/ownership arrangement, provider billing, and `DOMAIN_REGISTRANT_JSON` fields: firstName, lastName, email, international E.164 phone, address1, city, state, zip, and two-letter uppercase country. The current configuration supplies one registrant identity; do not sell registration for unrelated owners without an approved registrant arrangement or completing per-owner registrant intake. Existing-domain connection also needs verified ownership/DNS support. These are release gates for the domain purchase feature, not reasons to block a subdomain-only website launch.

Only real provider quotes can become a domain checkout. Registration is one year, auto-renew is off, and expiry is read from the provider. A domain purchase intent is saved before contacting the registrar. An ambiguous outcome is `needs_review` and is never automatically charged again. Review the actual provider order before any manual retry/refund. No domain has been purchased in this implementation session.

## Inquiries, mail and workers

Set `RESEND_API_KEY`, a verified `EMAIL_FROM`, and `AUTOLOCAL_ENABLE_EMAIL=true` only after the staging sender/recipient arrangement is approved. Inquiry capture and its notification outbox commit together. A failed email leaves the inquiry saved and visible. Delivery retries use a provider idempotency key and record sent only after provider success.

Configure an approved scheduler to run `npm run jobs:process` against the intended HTTPS application origin. Railway cron supports a minimum five-minute interval: use `*/5 * * * *` for the initial Railway worker. If queue latency requires a one-minute interval, use another approved scheduler that supports it. The script makes authenticated POST requests to `/api/jobs/process` and `/api/leads/notifications/process`; it does not place secrets on the command line or print payloads. The job worker processes one leased job per call with a 300-second route budget. Monitor backlog and worker duration; Railway skips a scheduled run while its previous execution is still active. Vercel's GET-only cron does not directly call these POST handlers. See [Railway cron documentation](https://docs.railway.com/cron-jobs) and `docs/STAGING-PUBLISHING.md` for the staging service contract.

Verify repeated scheduler executions and actual test delivery before setting `AUTOLOCAL_SCHEDULER_VERIFIED=true`. That flag records an operator assertion, not automatic proof. Alert an operator on worker failures, terminal jobs, notification failures, and paid orders waiting for setup. Use private database views or `/api/admin/jobs` to inspect status, not public dashboards or raw payload logs. A needs-review registrar job must remain stopped until the provider outcome is known.

Submit one explicitly authorized staging inquiry from each generated template and from a mobile browser. Confirm exactly one inbox row and notification, then change its status. Test validation, retries, spam rejection, CORS from the exact hosted domain, and the visible failure state when storage is unavailable. No fake success message should appear when persistence fails.

## Google connections

Public Places lookup is separate from Google Business Profile access. OAuth uses `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, a 32-byte base64 `GOOGLE_TOKEN_ENCRYPTION_KEY`, and the exact `/api/connections/google/callback` URL. Keep all token/encryption credentials server-only.

Enable Google connections only after the OAuth project, consent screen, test users/publishing state, and required APIs are ready. GBP additionally requires confirmed provider project approval (`GOOGLE_BUSINESS_PROFILE_API_APPROVED=true`). That flag is not proof Google will authorize a request. Search Console and GBP use distinct scopes and owner-selected resources. Verify two owners cannot select each other's resources; test token refresh/revocation and disconnect.

`AUTOLOCAL_ENABLE_GBP_WRITES` is a separate switch. Proposed changes require owner approval and a fresh provider read before applying. A provider readback is recorded separately from Google public publication. Verify the approved test profile before allowing customer edits. Search Console reports describe only the selected property's returned measurements; they do not imply Google Analytics, a booking, or revenue attribution.

## Final owner review and release

Keep billing, publishing, domain purchases, email, and GBP writes disabled wherever their staging checks are incomplete. Record the exact tested deployment ID, environment, domain, test account, test inquiry, and provider event IDs privately. Obtain production release approval only after the prepared result and remaining account-specific gates are reviewable.

Before enabling production traffic: recheck page/canonical/sitemap/robots behavior; mobile navigation; sign-up/login/email verification; business intake; all three previews; saving without publishing; exact-revision publish; inquiry delivery; billing/portal; Google selection/proposal approval; errors; and a failed provider request. Confirm no old doorway pages, unsupported statistics, placeholder audits, fake progress screens, or promises of guaranteed rankings remain public.

Run `node scripts/operations/verify-public-site.mjs https://autolocal.ai --require-launch-services` against the intended deployed application. It makes only anonymous GET requests, follows no redirects, and prints pass/fail checks without response bodies. It verifies public canonical URLs, sitemap scope, production robots rules, non-indexed private/demo pages, anonymous API denials and availability flags. Use `--staging` for a deliberately non-indexed environment; a loopback origin also requires `--allow-local`. This public-surface check complements the authenticated/provider checks above and never establishes complete launch readiness by itself. Record the provider's exact deployed commit separately.

Rollback means disabling new side effects first, preserving queued records and paid-order evidence, and returning traffic to a previously verified application deployment. Do not delete private data or reset registrar purchase intents as a rollback shortcut.

## Primary references

- [Next.js support policy](https://nextjs.org/support-policy) and version-matched upgrade docs in `node_modules/next/dist/docs/`.
- [Vercel create deployment](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [explicit promotion](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment), [domain attachment](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project), and [registrar API](https://vercel.com/docs/domains/registrar-api).
- [Google local ranking guidance](https://support.google.com/business/answer/7091?hl=en) and [AI features guidance](https://developers.google.com/search/docs/appearance/ai-features).

## Optional ongoing visibility checks

Review the additive `supabase/migrations/202609101500_visibility_tasks.sql` after the earlier migrations. When `AUTOLOCAL_ENABLE_VISIBILITY_WORKER=true`, the scheduler also calls the read-only `/api/visibility/process` worker. It checks at most one due site per request and refreshes the selected Google sources on a daily cadence. It does not edit a Google profile, send email, or publish website content. Confirm due-site fairness, lease recovery, and actual source timestamps in staging before treating reports as current.

Production public endpoints require shared rate limiting. Configure `AUTOLOCAL_RATE_LIMIT_KEY` with at least 32 bytes, apply the reviewed shared limiter migration, and verify proxy/header handling and edge rules. Do not set `AUTOLOCAL_TRUST_PROXY_IP_HEADERS=true` unless the actual upstream strips and replaces client-supplied IP headers. The protected integration health report exposes readiness booleans without keys. Missing limiter configuration disables metered public search rather than allowing unbounded provider calls.
