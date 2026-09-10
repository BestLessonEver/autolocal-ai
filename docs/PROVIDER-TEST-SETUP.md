# Local provider-test setup

This is a deliberate mode for testing Stripe's existing sandbox and Google OAuth against the **local** AutoLocal database. Production `.env.local` is untouched. The ordinary `scripts/local/run.mjs app` mode continues to disable external providers.

## Private configuration

`scripts/local/provider-test.mjs` uses only `.runtime/provider-test/config.json` for provider settings. The directory must have permissions 700 and the file 600. Both are ignored by Git. The tracked `scripts/local/provider-test.example.json` contains placeholders only; it is a format reference, not a runnable credential file.

```sh
node scripts/local/provider-test.mjs init
node scripts/local/provider-test.mjs status
```

Initialization securely generates an independent 32-byte Google token encryption key and a local rate-limit key. Repeating initialization preserves both. Configure the Google client ID, client secret and Stripe credentials through the private handoff; no provider account is preselected. Status prints booleans only; configured does not mean a provider flow has succeeded.

Use `node scripts/local/provider-test.mjs configure` with a JSON patch on **stdin**. It merges fields under a lock and saves atomically. Do not put secrets in command arguments, shell history, chat, screenshots, or tracked files. The permitted fields are:

- `version: 1`
- `enableStripeSandbox`, `enableGoogleOAuth`, `googleBusinessProfileApproved`: booleans
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_HOSTING_PRICE_ID`, `STRIPE_MANAGED_PRICE_ID`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Generated `GOOGLE_TOKEN_ENCRYPTION_KEY` and `AUTOLOCAL_RATE_LIMIT_KEY`

Do not replace the existing local encryption key: locally stored Google grants require it. Configure refuses replacement. Unsupported fields, cloud Supabase overrides, malformed credentials and Stripe live keys are rejected, even if their enable switch is false. Stripe price IDs do not encode their mode; their sandbox account and product metadata require provider readback.

## Starting the two deliberate processes

Stop the existing port-3102 app through the controlling task first. The launcher never kills another app or restarts Supabase.

```sh
node scripts/local/provider-test.mjs app
```

The launcher verifies the dedicated `autolocal-local` backend config, privately obtains local credentials from pinned Supabase CLI status, and accepts only API `http://127.0.0.1:54321` plus PostgreSQL `127.0.0.1:54322/postgres`. It uses the same app origin `http://127.0.0.1:3102` and a separate Next build directory. Existing local browser sessions can continue because the auth backend and app origin are unchanged.

Next's environment-file assignment names are scanned only to prefill empty values; no production values are exported or reused. Provider settings then come from the private config, and database keys come from validated local status. Arbitrary inherited environment variables and Node/proxy options are excluded.

Raw Next stdout/stderr is **suppressed**, not saved to an app log. Only fixed readiness or port-conflict messages are emitted. Request URLs, OAuth codes, state, auth tokens, stacks and provider payloads are never forwarded to the terminal, including when output arrives in separate chunks. Use the browser's visible error state and redacted status for diagnosis.

In another terminal, start the installed Stripe CLI through the protected listener:

```sh
node scripts/local/provider-test.mjs stripe-listen
```

It uses the validated sandbox key through `STRIPE_API_KEY`, no key argument or saved CLI account fallback, and forwards only to `http://127.0.0.1:3102/api/webhook/stripe`. It subscribes to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

The listener compares its actual ready-line signing secret with the private configured secret in memory. A mismatch stops the listener. Output is limited to readiness/error booleans and event IDs/types/HTTP statuses; raw lines and signing secrets are suppressed. Ctrl-C stops each foreground process independently. Stopping the app does not stop a separately running listener.

## What remains disabled

Both modes keep real email, publishing, registrar purchases, Google profile writes, AI, Places lookup and background workers disabled. The internal worker credential is empty, so worker requests fail closed. The synthetic `AUTOLOCAL_SITES_DOMAIN=autolocal-pilot.invalid` allows sandbox fulfillment to record a deployment job without referring to a real public domain.

Sandbox checkout can persist local billing state and queued deployment/email jobs. A queued job is not published content or a sent message. No worker starts with this launcher. Google OAuth can request approved read access, select a property and sync real provider data into the local database; Google profile apply/write remains disabled.

## Real Google consent check

Register the exact Google redirect `http://127.0.0.1:3102/api/connections/google/callback` in the Google project used for your private client configuration. Verify Search Console API enablement, consent scopes and the callback before the pilot. Keep `googleBusinessProfileApproved=false` until Business Profile API access and quota are independently verified for that project.

Create a synthetic local owner and private pilot draft through the normal onboarding flow and captured local email confirmation. Reuse that browser session; do not copy auth cookies or tokens into tools or documents.

For a fresh browser session:

1. Open the local app in your chosen browser and use the normal local email sign-in.
2. Open the captured confirmation in the local mail inbox at `http://127.0.0.1:54324`, in the **same browser** that requested sign-in so its PKCE verifier remains available. Local Auth sends to the catcher, not the real recipient inbox.
3. Open the private pilot workspace and choose the Search Console connection.
4. Complete Google's consent with the intended Google account, select an already verified property, then sync.
5. Verify the selected property's identity, source dates, real clicks/impressions/query data or explicit unavailable state, and lack of sensitive token fields in the owner-facing response. Do not alter Google profile facts.

An owner email in local Supabase and the Google account granting access are separate identities. Existing automated local verification scripts keep their own session cookies in memory and deliberately expect providers disabled; they do not export browser sessions and should not be reused as privileged login shortcuts.

## Verification and current boundaries

```sh
node --test scripts/local/provider-test.test.mjs
```

Focused tests cover live-key rejection, cloud-target rejection, strict config fields, private file permissions, independent/preserved keys, concurrent handoffs, absent-credential status, production-env blanking, forced-off capabilities, safe Stripe forwarding, signing-secret mismatch, and OAuth/auth log suppression across chunk boundaries.

A configured/enabled status records configuration readiness only. Actual consent, sandbox payment, webhook fulfillment and property-sync results require separate verification. Keep account-specific setup and test receipts in private operator records outside the public repository.

References: [Stripe keys and sandbox separation](https://docs.stripe.com/keys), [Google web-server OAuth and redirect matching](https://developers.google.com/identity/protocols/oauth2/web-server). Next environment behavior was checked against the installed Next 16 documentation and covered by the environment/logging tests.
