# Local backend for AutoLocal

Use this for free, isolated testing on this Mac. It uses a dedicated local Supabase runtime and synthetic test records. It does not replace the cloud database or require a paid Supabase plan.

The runtime is started separately; the database preparation script never starts, stops, resets, or destroys it. The dedicated workdir is `.runtime/backend`, with its own `supabase/config.toml`. Never point local Supabase commands at this repo's historical migration directory.

## Local addresses

| Component | Address |
| --- | --- |
| App | http://127.0.0.1:3102 |
| Supabase API | http://127.0.0.1:54321 |
| PostgreSQL | 127.0.0.1:54322, database/user postgres |
| Local email inbox | http://127.0.0.1:54324 |
| Studio | Port 54323 only if explicitly enabled; omitted from the lightweight runtime |

The dedicated container profile is `autolocal`. The lightweight runtime keeps the database, gateway, Auth, PostgREST, Storage and local mail service; Studio and other optional services are disabled to reduce memory use. Runtime creation/startup remains a separate operation.

## Normal workflow

Use Node 24 (`.nvmrc`). This Mac has Colima 0.10.3 and Docker CLI 29.7.2 installed through Homebrew core; Supabase CLI 2.117.0 is pinned in the local wrapper. The first startup downloads the virtual machine and service images. No cloud subscription is required.

For a fresh local setup only, create `.runtime/backend/supabase` and copy `scripts/local/backend-config.toml` to `.runtime/backend/supabase/config.toml`. Never overwrite an existing runtime config blindly. The dedicated project marker must remain `autolocal-local`; this directory intentionally contains no historical migration files.

Start the dedicated runtime without changing the default Docker context:

```sh
colima start autolocal --cpu 2 --memory 4 --disk 20 --vm-type vz --activate=false --ssh-config=false --mount "$PWD/.runtime/backend:w"
```

Run the pinned Supabase CLI with `DOCKER_HOST=unix://$HOME/.colima/autolocal/docker.sock`, `SUPABASE_TELEMETRY_DISABLED=1`, and `--workdir .runtime/backend`. Start with `--exclude realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`. Its normal status/start output contains local keys: capture that output privately instead of sharing it. Use `scripts/local/run.mjs status` for the sanitized readback after startup. This setup does not install a login-time background service.

From this repo after the local runtime is ready:

```sh
node scripts/local/run.mjs status
node scripts/local/run.mjs prepare
node scripts/local/run.mjs app
```

The status command prints local addresses and credential availability, never keys. The wrapper gets credentials from the explicitly selected local Supabase runtime and passes them directly to child processes. The app runs on port 3102 with cloud provider capabilities disabled. The local mail inbox receives local Auth messages; outbound provider email remains disabled.

In another terminal, use `node scripts/local/run.mjs verify` for the separate local owner-flow verification and `node scripts/local/run.mjs email` for the captured-email sign-in/callback check. Both use synthetic local fixtures; they are not cloud launch checks. Stop the foreground app with Ctrl-C. Preserve the local database and runtime files for repeatable checks.

## What prepare does

`scripts/local/prepare-database.mjs` reads only its explicit local environment and the following five allowlisted files, in order:

1. `supabase/staging-baseline.sql`
2. `supabase/migrations/202609100900_owner_leads_foundation.sql`
3. `supabase/migrations/202609101100_google_connections.sql`
4. `supabase/migrations/202609101500_visibility_tasks.sql`
5. `supabase/migrations/202609101600_public_request_limits.sql`

The staging baseline is also suitable for this fresh local database. Its private marker permits safe replay; it refuses an existing unmarked application database or auth users. The helper additionally checks managed Auth/Storage prerequisites, server-role capability, Storage RLS, unexpected existing storage content on first install, and browser write policies before installing.

Each SQL file runs transactionally through the installed `psql`. The helper stops on failure. It verifies all 26 application tables have RLS, denies browser access to operational tables and RPCs, checks the current billing/deployment/visibility columns, then requests a PostgREST schema-cache reload.

Finally, it uses the local Storage API to create and independently reread `client-assets`: public image reads, 5,242,880-byte maximum, PNG/JPEG/WebP only. It adds no browser write policies and uploads no files. An existing bucket with incompatible settings is reported for review and is not changed or deleted.

Success writes a private-permission, non-secret manifest at `.runtime/backend/database-setup.json`, including the applied file hashes, local addresses and verification result. Failures after database preflight record completed files and a safe error, so an interrupted setup can be diagnosed and rerun. A failed later step does not erase earlier successful transactions. No auth users, customer fixtures, jobs, emails or provider connections are created by preparation.

## Direct environment contract

The wrapper is preferred. For a controlled direct invocation, provide these values through the process environment; never put credentials in command arguments or shell history:

| Variable | Requirement |
| --- | --- |
| `AUTOLOCAL_LOCAL_API_URL` | `http://127.0.0.1:54321` |
| `AUTOLOCAL_LOCAL_DB_URL` | `postgresql://postgres@127.0.0.1:54322/postgres`, with no password/query |
| `AUTOLOCAL_LOCAL_DB_PASSWORD` | Password obtained from this local runtime |
| `AUTOLOCAL_LOCAL_SERVICE_ROLE_KEY` | Service key obtained from this local runtime |
| `AUTOLOCAL_LOCAL_RUNTIME_DIR` | Absolute path to this checkout's `.runtime/backend` |
| `AUTOLOCAL_LOCAL_PSQL_PATH` | Optional absolute executable path; otherwise `psql` on PATH |

Then run `node scripts/local/prepare-database.mjs`. No `.env`, `.env.local`, cloud config or status file is loaded by that helper. Do not use Node's `--env-file` option or source cloud env files. A controlled direct environment should not include proxy variables.

Only literal loopback IPs (`127.0.0.1` or `[::1]`) with explicit ports are accepted. DNS names, cloud hosts, database query overrides and embedded credentials are rejected. HTTP requests are confined to the same local API origin and redirects are refused. The child `psql` receives a fresh environment with fixed host/address/port/database/user; inherited PG service files, connection overrides and startup scripts are excluded. The database password is passed only in its environment, never on the command line or in the manifest.

## Verified local bootstrap

The real local Supabase bootstrap completed successfully on **2026-09-10 at 16:05:32 UTC**, recorded in `.runtime/backend/database-setup.json` with `verified: true`. A subsequent read-only manifest review confirmed that all five applied SQL hashes still match the current repo files, in the required order, and that the recorded API/database destinations are the loopback addresses above.

The completed helper verifies these database postconditions before writing success:

- All 26 required application tables exist with RLS enabled.
- Both browser roles lack privileges on the 22 operational tables and cannot execute the 13 checked operational RPCs.
- Authenticated clients cannot insert, update or delete subscription rows directly.
- The current ownership, checkout, deployment and visibility handoff columns are available.
- The local `client-assets` bucket was reread through the Storage API with public reads, the 5,242,880-byte limit, and only JPEG/PNG/WebP allowed.

This is a successful **real local database and Storage setup**, beyond the earlier PGlite and mocked checks. The manifest review did not rerun migrations, reset data, query customer records, or contact cloud services. The helper requested a PostgREST schema reload; its manifest alone does not establish HTTP API schema availability, completed login/callback flows, cross-owner HTTP access checks, image uploads, or browser usability. Those remain separate owner-flow and browser checks and should be recorded with their own results.

## Verification and limits

Run the helper's no-I/O guard checks:

```sh
node scripts/local/prepare-database.mjs --self-test
npx tsx --test tests/staging-schema.test.ts
```

The first checks loopback/destination validation, inherited connection override rejection, redirect protection and bucket replay/settings behavior against a mocked Storage boundary. It performs no network, SQL, or filesystem mutations. The PGlite test installs and replays the actual five SQL files, exercises owner/RLS protections and runtime RPCs, and verifies fixture preservation.

A passing helper proves its SQL checks and local bucket readback. It does not prove login, row-level ownership through the HTTP API, image upload, the inbox UI, or cloud integrations; use the separate local owner-flow check and browser verification for those. Paid checkout, publishing, domain purchases, real Google OAuth and provider email should remain disabled.

If setup fails, inspect the safe manifest and the current local service state. SQLSTATE-only errors intentionally suppress database/provider payloads. Correct the local connection or missing prerequisite and rerun. Never resolve a guard failure by resetting the database, deleting volumes, copying production data, or manually adding the baseline marker. This tool is not a migration repair tool for existing cloud projects.

The Storage procedure follows Supabase's [API-based storage guidance](https://supabase.com/docs/guides/storage/schema/design); bucket restrictions and public reads follow its [bucket documentation](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
