# Isolated staging deployment

This is a configuration contract for a separately approved staging release. No service, domain, scheduler, credential, or environment is created or activated by this document. Start with publishing, billing, email, domain purchasing, Google writes, and scheduled visibility refresh disabled.

## Railway application

Use a separate Railway environment named `staging` and a separate application service. Select the reviewed repository revision and the repository directory containing `package.json`; do not point a staging service at a production environment's shared variables.

| Setting | Required value |
| --- | --- |
| Builder | Railpack |
| Node runtime | `RAILPACK_NODE_VERSION=24` (also pinned by `engines.node` and `.nvmrc`) |
| Install | `RAILPACK_NODE_NPM_INSTALL=npm ci` |
| Build command | `npm run build` |
| Start command | `npm start -- --hostname 0.0.0.0 --port $PORT` |
| Runtime mode | `NODE_ENV=production` (also for staging) |
| Build output | Default `.next`; leave `NEXT_DIST_DIR` unset |
| Healthcheck | `/api/system/health` |
| Public origin | Explicit plain HTTPS `NEXT_PUBLIC_SITE_URL` for this application |

Railpack supports the Node/install overrides above. Set all public variables to the staging values before the build, because Next includes public configuration in browser assets. Railway supplies `PORT`; do not copy the local development port. The health endpoint returning success proves the app responds, not that billing, mail, migrations, or publishing work. See [Railpack Node settings](https://railpack.com/languages/node/) and [Railway healthchecks](https://docs.railway.com/deployments/healthchecks).

Use the separate staging Supabase URL, anon key, and service-role key, with its reviewed baseline and all four additive migrations. Use only synthetic accounts and content. Stripe configuration must use test mode, test price IDs, and a webhook secret for this staging endpoint. Generate separate staging internal, rate-limit, and Google token-encryption keys. Mail requires the approved staging sender and recipients. The main [release checklist](LAUNCH-READINESS.md) covers those provider checks.

## Publishing isolation

Configure these values on the application service before enabling publishing:

| Variable | Contract |
| --- | --- |
| `AUTOLOCAL_PUBLISHING_NAMESPACE` | Stable lowercase identifier, 1–20 letters/digits/hyphens, beginning and ending with a letter or digit; no triple hyphens. Use `staging` for this environment. |
| `AUTOLOCAL_SITES_DOMAIN` | Explicit owned staging sites domain, for example `sites.staging.example.com`. This is a placeholder, not an available or configured domain. The production default `autolocal.ai` is rejected. |
| `VERCEL_TOKEN` | Credential authorized for the selected staging publishing scope; never copy production secrets into local files. |
| `VERCEL_TEAM_ID` | Exact selected team when publishing under a team. Omit only when the intended scope is the credential's personal account. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Only if required to verify the staging projects' protected immutable deployment URLs. |
| `AUTOLOCAL_ENABLE_PUBLISHING` | Remains `false` until staging publishing is explicitly authorized. |

With a namespace, projects are named `autolocalstage-<namespace>-<slug fragment>-<scope hash>`. Production defaults retain `autolocal-<slug>`, so even matching business slugs cannot select the same project name. The scope hash includes the namespace, staging sites domain, and site identity. The generated name stays within Vercel's 100-character limit. [Vercel project settings](https://vercel.com/docs/project-configuration/general-settings).

The application enforces the separation:

- A named Railway environment other than `production` cannot publish without a namespace.
- Content jobs retain their publishing scope. A copied production job or a job from another namespace/domain stops and requires review.
- Before creating a deployment, a stored project ID must resolve to the exact expected staging project name and ID. A copied production ID stops the job; it is never silently repurposed.
- Resumed deployments must belong to that verified staging project before promotion or domain changes, including jobs whose result already says `promoted`.
- Staging rejects custom-domain fields and registrar purchase jobs. This also protects suspension jobs from targeting a copied production project.
- Namespaced HTML receives `noindex,nofollow`, and its `robots.txt` disallows crawling. Production output retains its normal indexing rules. These crawler directives are not access control; use only synthetic public test content.

Keep the namespace and domain stable for the lifetime of staging records. To change them, create fresh staging sites and explicitly review old pending jobs. Do not clone customer data, Vercel project IDs, registrar orders, or production integration jobs into staging.

This implementation requires the separate staging sites domain and its DNS/provider mapping for a full publishing test. It does not guess a `<project>.vercel.app` alias. The immutable Vercel URL is used only for intermediate verification; the final domain must serve the same tenant and revision before the site is marked live. The Railway application, intake, private previews, and database tests can run while publishing remains disabled and DNS setup is pending.

## Railway worker service

Prepare a second service from the same reviewed revision in the same staging environment. It calls the application over HTTPS and exits; it is not another web server.

| Setting | Required value |
| --- | --- |
| Builder / runtime / install | Same Railpack, Node 24, and `npm ci` settings as the application |
| Build override | `node --check scripts/operations/process-jobs.mjs` (no Next application build required) |
| Start command | `node scripts/operations/process-jobs.mjs` |
| Cron schedule | `*/5 * * * *`, only after activation is authorized |
| Public domain / healthcheck | None; this process must exit after each run |
| Variables | The exact staging `NEXT_PUBLIC_SITE_URL` and its `INTERNAL_API_KEY`; optional `AUTOLOCAL_ENABLE_VISIBILITY_WORKER=false` |

The worker does not need Supabase, Stripe, Vercel, Resend, or Google credentials; those stay in the application service. Its internal key must match the staging application and must differ from production. The script POSTs to `/api/jobs/process` and `/api/leads/notifications/process`; optional visibility refresh adds `/api/visibility/process`. Failure or a job needing attention produces a nonzero exit status. Output contains statuses and counts, not keys or payloads.

Railway cron has a five-minute minimum and skips the next scheduled run if the previous run has not exited. A one-minute cadence requires a different explicitly approved scheduler. The current integration endpoint leases one job per invocation; five-minute polling is appropriate for initial low-volume staging, not a promise of immediate publication or email. [Railway cron contract](https://docs.railway.com/cron-jobs).

Keep the worker service unactivated until its side effects are authorized. Set `AUTOLOCAL_SCHEDULER_VERIFIED=true` on the application only after repeated runs and approved test notification delivery have been independently verified. Confirm the actual upstream replaces forwarded IP headers before asserting proxy trust; the configuration checker does not verify proxy behavior or edge rules.

## Verification before staging activation

Run the focused publishing, billing, and configuration tests locally with synthetic provider mocks. Run `npm run check:config -- --strict` against only the selected staging configuration; it prints booleans and makes no provider calls. Then independently verify the selected app revision, isolated database, Stripe test mode, publishing namespace/domain/team, and test recipients before enabling the required staging switches. A passing local test or config check is not a deployed staging release.
