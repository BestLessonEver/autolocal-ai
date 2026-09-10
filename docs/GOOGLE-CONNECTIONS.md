# Google connections and reviewed profile changes

These routes and migrations are implemented and covered by isolated tests. A real local Search Console pilot also completed consent and callback, stored an encrypted owner-bound grant, consumed its one-use state, and discovered the selected account's verified properties. No property was selected for the synthetic site; reporting sync, GBP operations and production availability require their own verification. Keep account identifiers, support correspondence and operational verification records outside the public repository.

## Release setup

Apply the owner/lead foundation migration first, then `supabase/migrations/202609101100_google_connections.sql` through the coordinated staging/release process. Never use the destructive rebuild scripts for an existing project.

Configure a Google OAuth **web application** with the exact authorized redirect URI `<application origin>/api/connections/google/callback`. Set:

- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: a cryptographically generated 32-byte key encoded as base64; back it up securely with restricted access. Replacing it without re-encrypting existing rows makes saved access unreadable.
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS application origin, or localhost during development.
- `AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS=true` only after setup validation.
- `GOOGLE_BUSINESS_PROFILE_API_APPROVED=true` only after the Google project has Business Profile API approval and its required APIs are enabled. This flag records operator confirmation; it does not prove current Google access.
- `AUTOLOCAL_ENABLE_GBP_WRITES=true` separately enables the reviewed apply endpoint. Draft proposals remain available while writes are disabled.

Enable Business Profile Account Management, Business Information and Performance APIs for GBP; enable Search Console API for search reporting. Complete the applicable OAuth consent configuration, verification and publishing requirements before inviting general customers. Google project approval, OAuth consent and a business's account/property permissions are separate prerequisites. API denials are shown as access errors rather than empty metrics.

## Ownership and token handling

Every business-scoped route verifies the current server session, confirmed email and site ownership. For a legacy site, OAuth start first binds the verified original owner with a compare-and-swap on its still-null owner and unchanged email. The OAuth start creates random state, a random HttpOnly SameSite=Lax browser cookie and a PKCE verifier. The server stores only state/browser hashes and an encrypted verifier for ten minutes. The callback atomically consumes the matching unexpired state for the current authenticated user, checks ownership again, and exchanges its one-use code. A replay, different browser or different user cannot consume the original authorization.

Providers request distinct minimum scopes: GBP `business.manage`; Search Console `webmasters.readonly`. Google does not offer a read-only GBP scope, so description/hours writes also require AutoLocal's explicit write switch and per-change owner approval. No Gmail, Drive, email identity or unrelated scopes are requested.

Access and refresh tokens are encrypted with AES-256-GCM and bound to the site/provider using authenticated additional data. Storage tables and RPCs are service-role only; browser responses omit tokens, encrypted envelopes and provider credentials. Refresh checks the existing ciphertext before saving so a concurrent disconnect cannot restore removed credentials.

Disconnect removes local tokens and snapshots before requesting Google revocation. If revocation cannot be confirmed, the response says to remove AutoLocal in Google account permissions. Google revocation can also invalidate other grants to the same application; those connections may need to be reconnected. Owner-authored change text and approval/outcome metadata are retained for accountability. Cached Google profile, metrics, before-values and readback evidence expire at 29 days, leaving a one-day margin under Google’s 30-day cache limit. The verified internal visibility worker invokes expire_google_cached_content() before claiming work, even when no site is due. Run it at least daily; monitor failures. API projections also hide expired content. Old drafts become stale and require a fresh read. Do not put tokens or raw provider failure payloads in analytics, logs or task evidence.

## API contract

All error responses contain a safe `error` message and an appropriate non-2xx status. Missing configuration is 503; missing login 401; invalid input 400; inaccessible business 404; rejected property selection 403; stale/already-attempted changes 409.

- `GET /api/connections?siteId=...` returns `{setup:{configured,enabled,gbpApproved,profileWritesEnabled},connections:[...]}`.
- Safe connection fields: `provider,status,resourceName,resourceLabel,lastSyncedAt,error,profile,metrics,revision`. Absent connections have `status:not_connected` and unknown values are null. Stored states include needs_selection, connected, reauth_required, permission_required, disconnected and error.
- `POST /api/connections/google/start` with `{siteId,provider}` returns `{authorizationUrl}`. Navigate there for consent.
- Callback redirects to `/dashboard?siteId=...&google_connected=gbp|search_console` after access is saved. Declined or expired consent returns an actionable error. Reconnection clears the previous resource selection to avoid attaching another Google account to an old property.
- `GET /api/connections/google/resources?siteId=...&provider=...` returns `{resources:[{name,label,accountName?,accountLabel?,permissionLevel?}],truncated}`. GBP lists accounts and locations with bounded pagination. Search Console excludes unverified user access.
- `POST /api/connections/google/select` with `{siteId,provider,resourceName}` verifies membership in a freshly fetched resource list before saving.
- `POST /api/connections/google/sync` with `{siteId,provider}` returns `{connection,partial?}`.
- `DELETE /api/connections/google?siteId=...&provider=...` returns `{disconnected,revoked,message}`.

Provider values are `gbp` and `search_console`.

## What reports mean

GBP profile data includes Google source and observation timestamp. Search Console reports a 30-day period ending three days before the current Pacific date, requesting final web-search data. Overall clicks/impressions come from a separate aggregate request; the top 100 query rows are not summed into an overall total. Query rows are a limited sample Google returns, not an exhaustive keyword inventory. This product does not invent rankings, AEO visibility or leads from impressions.

GBP performance persists the raw dated Google response only; totals are derived for the owner response and are not stored as an aggregate. GBP performance requests desktop/mobile Search/Maps impressions, direction requests, call clicks and website clicks for the same disclosed reporting period. A metric total is known only when all 30 daily values are returned. Missing metrics/days remain null. Google's omitted numeric value on an explicitly returned dated point represents zero; that differs from an absent point. Partial data is labeled.

A successful profile sync with unavailable performance keeps a fresh profile and an explicit unavailable metrics object. It does not label the metrics zero or silently reuse them as fresh. Stored observations remain dated; a failed later sync records an access/error state. The UI should show the individual source/observation date and reporting period, not imply live tracking.

## Explicit Google profile approval

`POST /api/connections/google/proposals` accepts `{siteId,expectedRevision,changes:{description?,regularHours?}}`, where expectedRevision is the current connection.revision. A changed Google profile rejects the draft with 409 before storage, so keeping cached hours cannot silently revert newer Google changes. It reads the current Google profile and saves an immutable draft with its revision and before-values. It performs no profile mutation. `GET .../proposals?siteId=...` returns up to 50 recent safe proposals.

Description is 1–750 characters. Regular hours use Google's `{periods:[{openDay,openTime:{hours,minutes},closeDay,closeTime:{hours,minutes}}]}` format. Only these two fields are accepted. Unsupported fields, invalid days and invalid times are rejected. Google validates the full proposed hours before applying; seasonal/special hours, names, addresses, categories, reviews and posts are outside this workflow.

`POST /api/connections/google/proposals/[id]/apply` requires `{siteId,expectedRevision,confirm:true}`. The server checks ownership, property identity and the exact reviewed revision, atomically claims the draft and records the approval. Only one proposal per connection may be applying. It rereads Google before mutation; a changed revision yields stale status and no PATCH. It then performs Google's validation-only PATCH, a single actual PATCH with an explicit field mask, and a fresh readback.

Success means Google accepted the request and its API readback matches. It does **not** prove public display or ranking improvement, and pending Google edits are exposed. Known rejection, stale revision, and unknown outcomes are distinct durable statuses. An ambiguous write or failed readback is `needs_review`; it is never automatically resent. A completed request is idempotent. An interrupted applying request requires operator reconciliation; no lease automatically authorizes another write.

Google's documented location PATCH does not expose an atomic revision precondition. The pre-read and narrow update mask protect unrelated fields, but a simultaneous edit in Google itself cannot be completely excluded. The recorded readback and uncertainty state make that limit visible. A new draft should only follow a fresh sync/review.

## Verified primary references

- [Business Profile storage and consent policies](https://developers.google.com/my-business/content/policies)
- [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Business Profile API setup and approval](https://developers.google.com/my-business/content/basic-setup)
- [Business Profile account list](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list)
- [Business Profile location list](https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list)
- [Location PATCH, update masks and validation-only](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch)
- [Business Profile daily performance](https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries)
- [Search Console property list](https://developers.google.com/webmaster-tools/v1/sites/list)
- [Search Analytics query and limitations](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)

The test suite exercises encryption/tampering, minimum OAuth scopes and PKCE, atomic state/replay/expiry boundaries, service-only tables/RPCs, owned resource discovery, refresh failures, honest metric semantics, field allowlists, revision conflicts, idempotency, ambiguous provider writes and readback evidence. Tests use local PGlite and injected HTTP responses, not real OAuth accounts.
