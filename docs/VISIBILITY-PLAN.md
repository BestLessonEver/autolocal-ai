# Ongoing visibility plan

Implemented locally on September 10, 2026. No production migration, schedule, Google connection, provider write, email, or publication was activated during implementation.

The plan turns the owner's saved facts and dated source reads into at most five useful next actions. It does not produce a ranking score. Rules run in application code without an LLM; private Google data is not sent to an AI service. Website edits remain drafts until the owner publishes them. Google recommendations open the separate review workflow or connection panel; the worker never changes a Google profile.

## What is checked

| Evidence | Action | Limit of the evidence |
| --- | --- | --- |
| Inquiries older than 24 hours still marked `new` | Check whether a reply is needed and update status | AutoLocal cannot see calls or replies made elsewhere. |
| Missing public phone/email, service areas, photograph or complete Q&A | Supply actual business details | An uploaded file is not independent proof of its subject or rights. |
| Missing/short service descriptions or introduction | Explain the actual services and process | The 40/80-character checks are editorial prompts, not Google requirements. |
| Fresh Google website host differs from verified published host | Confirm the intended destination | Another website or tracking arrangement may be intentional. |
| Fresh Google phone differs from saved/published phone | Check both phone numbers | This is a discrepancy to review, not automatic permission to overwrite either. |
| Google description missing, or no regular hours for a website allowing visits | Review a factual description or actual hours | Appointment-only businesses should not invent regular hours. |
| A returned Search Console query has at least 100 impressions and below 2% click rate, with terms absent from a service | Check relevance and clarify an actual offered service | A query may be irrelevant; lexical matching is not proof of a content gap. |
| Missing, disconnected or stale source | Connect or refresh the evidence | Unavailable values are not treated as zero. |

Queries are compared with existing service text using Unicode word matching, removing saved location/business terms and common English stop words. There is no stemming, intent model, translated keyword generation, or automatic page creation. Non-English input is preserved; the simple heuristic may be less useful in other languages. At most two queries contribute to the one query-coverage task. Every inference is labeled and may be dismissed.

Google comparisons require snapshots no older than seven days. A failed refresh can leave a still-current cached read, explicitly labeled as incomplete. Old or unavailable observations do not prove that an issue was resolved. Phone and website comparisons use the last verified publication when one exists; the worker does not mistake an edited draft for the currently published business site.

## Owner API and lifecycle

`GET /api/visibility/plan?siteId=<owned site UUID>` requires a verified owner session. It reads local data and derives the current plan; it makes no Google request and performs no write. Response fields are `siteId`, `generatedAt`, `lastProcessedAt`, `backgroundChecksEnabled`, `nextRefreshAt`, `tasks`, `history`, `sources`, and `measurement`. `tasks` contains at most five open priorities; `history` contains up to ten recent completed/dismissed tasks. A disabled worker returns no next-check date.

Each task includes `key`, `title`, `description`, `priority`, `evidence`, `source` with observation date and optional reporting period, `action`, `revision`, `inference`, `status`, `completion`, and `updatedAt`. Internal matching context and sorting values are excluded. Tokens and encrypted token envelopes are never selected into plan evidence or returned.

`PATCH /api/visibility/plan` accepts `{siteId, taskKey, expectedRevision, status, outcome?}`. Status is `open`, `dismissed`, or `completed`. A stale evidence revision returns 409. Completion requires a short owner explanation and is labeled `owner_reported`; it is separate from a `verified_change`, which means the specific saved field or fresh source check now satisfies its rule. Neither proves improved ranking, a contacted customer, or a booking. A task can reopen when verified facts regress. Dismissed tasks remain dismissed until the owner reopens them. Unknown/stale source data hides unsupported open recommendations without inventing completion.

The database reconciliation function protects a newer owner action or worker result from an older derived plan. Lifecycle transitions are stored in service-only `visibility_tasks`, bound to the current site owner. A transferred site does not expose the previous owner's task history; an in-flight worker with the old ownership cannot save evidence under the new owner. The UI can derive a verified resolution immediately; the next background check persists it. Task keys remain stable across evidence revisions.

## Background processing and release setup

Apply the additive owner/lead and Google migrations first, then `supabase/migrations/202609101500_visibility_tasks.sql`. Do not use rebuild/reset scripts for an existing database. Configure the Google connection requirements in [GOOGLE-CONNECTIONS.md](GOOGLE-CONNECTIONS.md), and set `AUTOLOCAL_ENABLE_VISIBILITY_WORKER=true` only as part of the approved rollout. `AUTOLOCAL_ENABLE_GBP_WRITES` is unrelated to this read-only worker.

`POST /api/visibility/process` requires the server's `INTERNAL_API_KEY` bearer credential and the worker flag. Each invocation first runs the Google cache-expiry maintenance RPC, then leases at most one due owned site. It refreshes at most its two selected Google connections, verifying that the connection owner still matches the site owner. The shared refresh preserves ciphertext/resource compare conditions, so a concurrent disconnect or property selection cannot be overwritten. Search Analytics uses POST for a read query; no provider mutation endpoint is called.

Normal checks become due every 24 hours. Incomplete reads and processing failures retry after six hours. A lost invocation's lease can be reclaimed after ten minutes. Reauthentication or denied access remains visible for owner action. The response exposes aggregate `processed`, `refreshed`, `refreshFailures`, and `openTasks`; a partial refresh can be HTTP 200 with a nonzero failure count, which the scheduler treats as needing attention.

Use the existing `npm run jobs:process` scheduler command to include visibility with the other workers, or `node scripts/process-visibility.mjs` for only visibility checks. Both read the application origin and internal credential from their environment; neither prints credentials. Install a schedule in an owner-controlled environment only during release. An every-minute invocation supports up to 1,440 site checks per day in principle; each invocation handles one site, so monitor queue age and provider quotas before increasing scale. The standalone command is also suitable for a protected local smoke check with a local origin.

Run cache maintenance at least daily and alert on failures, including when no site is due. Google snapshots and task evidence expire after 29 days, leaving a one-day margin under the Business Profile cache limit. Completed/dismissed task evidence is also cleared; task metadata and explicit owner-authored outcome notes remain. Read projections suppress expired content even before scheduled cleanup. Do not disable cleanup while retaining Google cached data.

## Measurement and pilot

Search Console returns top rows rather than an exhaustive query inventory. The separate aggregate request supplies overall clicks and impressions; top queries are not summed into that total. Query tasks show the actual reporting window. Clicks and impressions measure search activity, not qualified leads or booked work. See Google's [Search Analytics query contract](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

GBP performance stores raw dated responses and derives totals for display. Missing daily values/metrics remain unknown; clicking a call button is not proof of a connected call. Cache limits and account consent are governed by Google's [Business Profile API policies](https://developers.google.com/my-business/content/policies). Useful factual content and accessible search fundamentals remain the basis of Google's [AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide); the plan offers no special AI-ranking guarantee.

For the first real customer, verify connection ownership and source dates, trigger one protected read cycle, inspect the exact returned tasks, and prove dismissal, revision conflict, factual resolution, partial-provider failure, and cache cleanup in staging. Then track whether the owner completes useful actions, how long inquiries remain new, and owner-recorded qualified/booked outcomes separately from traffic. This implementation does not independently attribute revenue or prove SEO lift; a controlled live pilot is still required.

Local verification covers rule prioritization, query thresholds, unknown/stale sources, evidence expiry, owner-reported versus verified completion, revision conflicts, service-only database access, leases, reconciliation races, internal endpoint gating, read-only shared Google refresh, and raw metric persistence. Provider responses are injected and migrations run in PGlite; these are not evidence of production access or live Google approval.
