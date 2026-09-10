# Public lookup and contact limits

Production now uses the shared database budget in `supabase/migrations/202609101600_public_request_limits.sql`; this migration is not applied by the coding task. Apply it after the owner and Google migrations as part of the coordinated release.

`POST /api/search-business` and `POST /api/business-details` consume one combined Google Places request budget before calling Google. The shared defaults are 30 requests per client per ten-minute window and 1,000 requests per UTC day across the application. `POST /api/capture-lead` allows five contact submissions per client per hour and 200 across the application per UTC day. A denied request does not consume another global allowance. Limits count attempted upstream calls/submissions, including subsequent provider or storage failures. They are request counts, not a dollar budget.

Counters are atomic across application replicas and workers. The table and budget RPC allow only the service role. Clients are represented by a scoped, daily rotating HMAC digest; raw IP addresses and request payloads are not stored in this table. Expired counters are pruned during subsequent budget calls. The production secret `AUTOLOCAL_RATE_LIMIT_KEY` must contain at least 32 bytes of cryptographically random material and remain server-only.

On Vercel, `VERCEL=1` identifies the deployment where Vercel supplies the client forwarding header. Railway supplies `X-Real-IP`; when `RAILWAY_ENVIRONMENT_ID` is present, the limiter reads only that header and never falls back to `X-Forwarded-For`. Other hosts use `X-Forwarded-For`. Outside Vercel, enable `AUTOLOCAL_TRUST_PROXY_IP_HEADERS=true` only after verifying the selected proxy overwrites its client header and clients cannot bypass it to reach the origin. Otherwise, requests share the conservative unknown-client bucket. See [Vercel's request-header contract](https://vercel.com/docs/headers/request-headers) and [Railway's documented headers](https://docs.railway.com/networking/public-networking/specs-and-limits).

The authenticated `/api/admin/integrations?probe=proxy` response provides a deployment check without revealing IPs. Send the reserved documentation address `192.0.2.17` as both `X-Real-IP` and `X-Forwarded-For`. On Railway the response must show a valid real-IP header that does not match the supplied probe. Repeat on both the custom and provider domain. Only after that check, enable trust and confirm `selectedIdentityKnown=true` and `selectedIdentityMatchesProbe=false`. The probe is internal-key protected, returns no-store booleans, and does not call providers, consume a budget, or store visitor data. A passing check does not establish WAF rules or Google quota settings.

A missing production secret, database/RPC outage or missing migration returns 503 before a paid lookup or contact insertion. Excess traffic returns 429 with Retry-After. The onboarding flow must continue offering manual business entry. A contact error must remain visible without a success confirmation.

Development without the secret uses bounded process-local counters to keep local setup usable. This is explicitly not production protection. Setting the key exercises the shared database path even in development; use isolated staging credentials, never the production database, for that verification.

## Required shared edge setup

The database budget prevents unlimited upstream provider work, but an attacker can still send requests to the application and database. Configure and verify shared edge/WAF rules before release:

- Match POST requests to both business lookup paths as one per-client group; allow no more than 30 per ten minutes. Contact POST should allow no more than five per hour.
- Enforce a small request body limit appropriate to these JSON forms (16 KB is sufficient for the current contact and lookup contracts).
- Apply bot/abuse filtering at the edge and restrict direct origin access where a separate proxy is used. Check that the proxy presents a trustworthy client address rather than a single shared CDN address.
- Set Google Places project quotas consistent with the approved launch request budget. Use a server-only key restricted to the required API. Alerts alone are not a hard spending limit.
- Verify limits across at least two application instances, exercise a 429 and an unavailable-budget 503, then test that manual onboarding still works. Mark `AUTOLOCAL_EDGE_RATE_LIMIT_VERIFIED=true` only after that deployment-specific check.

These settings are documented and implemented locally; no live edge rules, quotas, secrets or migrations were changed by this task.
