# Owner, inquiry and notification contracts

This is an additive application/database upgrade. `supabase/migrations/202609100900_owner_leads_foundation.sql` has been validated locally against a reconstructed recovered schema and is **not applied to the live project by this task**. Review it against a staging copy before the coordinated application release. Do not run `rebuild.sql` on the recovered project.

## Ownership

`requireUser()` verifies the server session and confirmed email, returning `{user,db}`. `requireOwnerSite({siteId?,slug?}, context?)` returns `{user,db,site}` or throws `ApiError`; without a selector it returns the newest owned site. `listOwnerSites()` returns `{user,db,sites}`. Use `apiErrorResponse(error)` in route catch blocks. `bindVerifiedSiteOwner(db,site,user)` atomically binds a verified legacy owner only while owner_id remains null and the observed original email is unchanged; Google connection start and visibility task PATCH use it before owner-scoped persistence. Reads do not claim sites.

New sites use `owner_id`. A legacy null-owner record is accessible only to the verified original email; a populated owner ID always takes precedence. Request-body emails never establish ownership. Historic management tokens are now locators only: all management endpoints require a verified owner session. Public previews must not emit management tokens or private owner/billing columns.

## Owner setup

`POST /api/intake/submit` accepts businessName, template (`summit`, `atelier`, `ledger`, `win95`, `myspace`, `receipt`), category, tagline, description, phone, contactEmail (public), address, city, state, website, logoUrl, photoUrls, hours, services, serviceAreas, businessFacts, faq and googlePlaceId. Ownership comes from the verified session. An optional slug updates only an owned site; creation never overwrites an existing slug. Success: `{success:true,slug,previewUrl}`. An unrelated/colliding site is an explicit error. Drafts remain `hosting_status=preview`. Intake never assigns the verified deployment field website_current; supplied external websites are validated and saved in business_facts.existingWebsite. Common onboarding categories map to the existing six-value schema, and categoryLabel retains the original selection.

`GET /api/dashboard/me?siteId=...` preserves the website response and adds id, service_areas, business_facts, faq, contact_name, show_address, independent subscription_status/has_billing, and setup_health with source-dated Google connection states. `GET /api/dashboard/my-sites` returns an array. All `/api/dashboard/me` child routes accept siteId or slug query selection. Content/photo/brand writes return `publication_required` when appropriate; publishing is a separate reviewed operation.

Image uploads require an owner session, check actual PNG/JPEG/WebP signatures and MIME agreement, cap images at 5 MB, and store under the owner UUID with random names. They do not create buckets or permit SVG content.

## Public business inquiries

`POST /api/leads/submit` requires `{slug,name,email? or phone?}`; optional message, instrument, service, source, submission_id UUID, and attribution fields `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `landing_page`, `referrer`. `website` is a honeypot. Only published sites with active/pending_cancel hosting and a verified current deployment accept inquiries. A new deployment job does not disable the previous verified site; suspension does. Duplicate submission UUIDs acknowledge the original without another notification. Repeated contacts are throttled in the database.

Success `{success:true,lead_id}` means the inquiry **and notification outbox** committed atomically, not that an email arrived. Invalid input is 400, nonpublic site is 404, contact throttling is 429, unavailable persistence is 503. Never display a thank-you when the response is an error.

`GET /api/leads?siteId=...` returns `{leads,total}` for owned sites, newest first, up to 200 loaded rows. `PATCH /api/leads/[id]` accepts status (`new`, `contacted`, `qualified`, `booked`, `won`, `lost`, `spam`) and optional notes, verifies site ownership, and reports persistence errors.

`GET /api/leads/summary?siteId=...` uses exact database counts over the most recent 30 days and prior 30 days. Response: `{inquiries,new,qualified,booked,won,previous:{...},periodStart,periodEnd,previousPeriodStart,definition}`. These are cohorts of inquiries **created during the window grouped by their current status**, not status-change events or booked revenue. Qualified includes booked/won; booked includes won. Do not compute whole-business totals from the loaded inbox sample.

`POST /api/leads/notifications/process` is an internal-bearer worker. Configure and explicitly enable email delivery before scheduling it. It atomically claims jobs, resolves the verified current owner email, escapes content, sends with a stable provider idempotency key, and records success or retry with a five-attempt limit. A validated single customer email becomes Reply-To while EMAIL_FROM remains the verified platform sender. Safe mailto/tel actions use only validated contact strings; invalid strings remain escaped text. The owner workspace link targets /dashboard?siteId=...&tab=leads&leadId=... on the validated configured application origin and still requires sign-in. Invalid origin setup stops the worker before it claims jobs. Schedule this worker as well as the integrations worker. Pending/failed notification records require operational monitoring; a saved inquiry remains visible if email delivery fails.

## AutoLocal contact and consent

`POST /api/capture-lead` accepts `{name,email,businessName?,message,source:'contact',consent:true,marketingOptIn?:boolean}`. It persists a separate contact inquiry and does not send or enroll in a marketing drip. Production requests pass the shared database budget described in PUBLIC-REQUEST-LIMITS.md before insertion. `GET /api/contact-inquiries` is restricted to verified `ADMIN_EMAILS`. The team must review that inbox; no response-time promise is implied.

Marketing unsubscribe is public but persisted atomically with cancellation of existing active/paused legacy drips. New notifications to business owners are operational account messages, separate from prospect marketing consent.

## Legacy safety

Audit/research/social draft APIs require an internal bearer key before any paid provider call. They check persistence failures, return drafts for review, and never fabricate fallback testimonials/offers. Cold outbound and marketing-drip trigger endpoints return an explicit retired-workflow response; historic database records are preserved. Legacy outbound preview generation is retired in favor of verified-owner setup. Feedback and review requests use verified owner identity and no longer promise unverified delivery or a 24-hour service time.

## Validation

`tests/security-foundation.test.ts` exercises additive migration/reapplication and record preservation, RLS and RPC denials, atomic inquiry/outbox rollback and replay, private-preview denial, webhook/job leases, owner checks and hostile claims, notification retry/HTML escaping, anonymous legacy-AI denial before external calls, and atomic unsubscribe. The separate lead-notifications tests cover reply/call/workspace rendering, encoded mailto parameters, header/HTML injection rejection, verified owner routing, unchanged idempotency/retry handling, and invalid-origin preflight. Tests use local PGlite and mocked providers only. Live transactions, emails, paid calls, migrations and deployment remain separate release validation.
