# Real local owner and inquiry pilot

`scripts/local/verify-flow.mjs` tests the running application and a real, isolated local Supabase stack over HTTP. It does not mock application routes, Auth, PostgreSQL, or Storage. It refuses non-loopback application/database addresses and redirects, never reads an environment file, and emits only named pass/fail checks and synthetic identifiers.

## Prerequisites

- Node 24 and installed repository dependencies.
- The isolated local Supabase stack, with the reviewed fresh baseline and four additive migrations applied. The public `client-assets` bucket must exist with the supported 5 MB PNG/JPEG/WebP policy.
- A separate local Next application configured to use that exact local Supabase URL and keys. Do not load production `.env.local`. The application must use the correct local public origin.
- All external integrations disabled: Places, billing, publishing, domain purchases, Resend notifications, and Google connections. No worker or outbound scheduler should run. Auth email, if separately tested, goes only to the local mail catcher.

Default application origin: `http://127.0.0.1:3102`. Default Supabase API origin: `http://127.0.0.1:54321`. Ports and addresses may be overridden, but only exact `localhost`, `127.0.0.1`, or `[::1]` origins are accepted. The script allows requests only to the two selected origins. This guard protects the script's HTTP requests; the operator must independently confirm the Next server also uses the isolated local configuration.

## Run

Provide these variables through a private parent process using the local stack's status output:

| Variable | Purpose |
| --- | --- |
| `AUTOLOCAL_LOCAL_APP_URL` | Local application origin; defaults to port 3102 |
| `AUTOLOCAL_LOCAL_API_URL` | Local Supabase API origin; defaults to port 54321 |
| `AUTOLOCAL_LOCAL_ANON_KEY` | Local stack's public Auth/API key; required |
| `AUTOLOCAL_LOCAL_SERVICE_ROLE_KEY` | Local stack's admin key; required and never printed |

With those variables already present in the process environment:

```sh
node scripts/local/verify-flow.mjs --run
```

Do not place keys in command arguments, committed files, terminal output, or the production environment file. The `--run` flag explicitly selects a real local test run. Missing configuration or a failed assertion exits nonzero with a sanitized check name. The script is not added to the ordinary unit-test command because it requires running local services and creates real synthetic records.

## What the pilot proves

1. The selected app responds, external integrations report disabled, and anonymous dashboard access is rejected.
2. Local Auth admin creates two synthetic verified users without sending verification emails. Both sign in through the real local password endpoint. Supabase SSR supplies actual session cookies used by the application; the script does not forge JWTs or bypass app authentication.
3. Each owner saves a manual draft through `/api/intake/submit`, reads it through the dashboard API, and sees only their own site. Direct local database readback confirms owner identity and unpublished state.
4. Allowed draft edits persist. Attempts to change owner, login email, billing identity, hosting status, or published URL through content editing are ignored. Cross-owner reads, edits, intake claims, and uploads are denied without changing the draft. Anonymous direct database access is denied.
5. A real tiny PNG uploads through the owner photos route into local Storage. The public local asset bytes and saved image URL are verified. An SVG supplied in the intake route's actual `file` field must return its unsupported-image-type error, rather than merely a missing-file error.
6. A private draft rejects public inquiries. The script then changes **only its newly created local fixture's** inquiry eligibility through local admin access, enabling the real public submission path without Stripe or Vercel. A valid inquiry persists once; replay returns the same ID; attribution persists; exactly one notification remains pending with zero attempts.
7. The correct owner can open the inquiry, change its status and notes, and see matching summary counts. Another owner and an anonymous request cannot modify it.
8. Before seeding inquiry eligibility, the script captures the synthetic fixture's exact original `status`, `hosting_status`, `deploy_status`, `deployment_verified_at`, and `website_current`. A `finally` block restores those values and compares every field with a fresh database readback. No site is actually published, charged, emailed, or connected to Google.

The final result reports `real_local_http`. It does **not** prove payment processing, deployment readiness, notification delivery, magic-link email handling, browser rendering, or cloud staging readiness. Those are separate tests. The notification is intentionally unsent.

## Repeatability and retained evidence

Every run creates new unique synthetic owners, sites, one inquiry, its pending notification, and one small image. Synthetic emails use `example.test`; their generated passwords and session tokens stay in memory. Records remain in the isolated stack for inspection, and the final output includes only their generated IDs. The script does not delete records or reset the database. Any later cleanup should be explicitly scoped to this local test data.

If a run fails, earlier successful checks remain visible. The script still attempts to restore any seeded inquiry eligibility. A `restore_local_draft_eligibility` failure means the operator should inspect that run's local fixture before starting workers or rerunning. Never interpret a partly completed pilot as a pass.

## Captured email and PKCE callback supplement

`scripts/local/verify-email.mjs` independently checks the real email sign-in flow through local Supabase Auth, Mailpit, and the application's `/auth/callback`. It complements the password-session pilot; it does not replace browser rendering or work around browser access policy.

Use the same local app/API/anon variables, plus optional `AUTOLOCAL_LOCAL_MAILPIT_URL` (default `http://127.0.0.1:54324`). The service-role key is not needed for this supplement. Local Supabase email confirmation must be enabled, its SMTP delivery must point exclusively to the local Mailpit catcher, and its allowed redirect URLs must include the exact local application callback. Keep Resend and every external integration disabled. The app, Auth API, and Mailpit must have three distinct loopback origins.

```sh
node scripts/local/verify-email.mjs --run
```

The script requests `signInWithOtp` for one unique synthetic `example.test` address while retaining the actual Supabase SSR PKCE verifier cookie. It queries Mailpit only with that exact recipient and reads only the matching message. It selects the real local Supabase verification link from captured HTML/text, follows at most five redirects confined to the selected Auth API and application, and visits `/auth/callback` with the original PKCE cookies. It requires a real authorization code, a confirmed user, an authenticated `200` response from `/api/dashboard/my-sites`, and preservation of the intended dashboard query in `next`.

Mailpit's documented search endpoint is `GET /api/v1/search?query=to:<recipient>`. The message endpoint is `GET /api/v1/message/<id>`; reading marks that synthetic message as read. The pilot does not list unrelated inbox messages, release SMTP mail, send through Mailpit's HTTP send endpoint, load remote images, or delete captured messages. [Mailpit API](https://mailpit.axllent.org/docs/api-v1/) and [recipient search filters](https://mailpit.axllent.org/docs/usage/search-filters/).

Mail capture waits up to 30 seconds. A successful result reports `real_local_captured_email_pkce`, a synthetic user ID, and boolean verification results. The script never prints message content, links, codes, verifier cookies, keys, or session tokens. Keep the Next server's request log private: development request logging can include the callback URL's one-time code. The synthetic user and captured email remain for local inspection. This verifies captured local mail and the HTTP authentication exchange, not cloud email delivery or browser UI behavior.

## Execution evidence — 2026-09-10

Both pilots completed successfully against the running local application and bootstrapped local Supabase stack. Auth, database, Storage, and captured email were real local services. All external integrations remained disabled. No code fixes were needed during these runs.

### Owner, draft, upload, and inquiry pilot

Run `05d97754` returned `status: pass`, `verification: real_local_http`, and **8 of 8 named checks passed**. It verified two authenticated owners, draft persistence and isolation, blocked cross-owner/privileged-field changes, real PNG upload/readback and SVG rejection, one deduplicated inquiry with attribution and pending notification, owner-scoped inquiry status/summary changes, and restoration of the fixture's exact original eligibility fields.

| Retained synthetic record | ID |
| --- | --- |
| Owner 1 | `f4b2d88f-892b-437f-9b50-4a68e17a9f09` |
| Owner 2 | `6794b782-aaa9-4d95-aa5f-081f79f4eca4` |
| Site 1 | `520b5cc6-3b95-4dbc-a1ec-2c17ef639b9b` |
| Site 2 | `8abc7ffe-fea6-4d88-bbfd-55f6b401138d` |
| Inquiry | `75b50a54-1234-4989-b3d5-79eeb6bd451f` |

The final output recorded `externalServicesInvoked: false` and `notificationDelivered: false`. Synthetic records, the small image, and the unsent notification were retained in the isolated local stack. Inquiry eligibility was seeded only on that local fixture and restored; this was not a payment or website-publishing test.

### Captured email and PKCE pilot

Run `fff8a402` returned `status: pass`, `verification: real_local_captured_email_pkce`, and **4 of 4 named checks passed**. The actual captured email supplied the local verification link; the callback used the original PKCE cookies, confirmed the user, preserved the intended `next` query, and authenticated `/api/dashboard/my-sites` successfully.

The retained synthetic user is `ca6b90ab-6d8b-4ec0-a224-57bdfe633775`. The final output recorded `capturedMail: true`, `nextPreserved: true`, `browserVerified: false`, and `cloudEmailSent: false`. The synthetic user and its captured local message were retained.

### Limits of this evidence

These results prove the exercised local HTTP flows and their database/storage readbacks. They do not establish browser rendering or interaction, cloud staging readiness, live email delivery, Stripe processing, Vercel publishing, domain registration, Google access, or production migration safety. The email result covers delivery to local Mailpit only; the inquiry notification remained unsent. No fixtures were rerun or created merely to record this evidence.
