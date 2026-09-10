# AutoLocal

Websites, business information, and inquiry management for local business owners.

The app uses Next.js 16, React 19, TypeScript, and Node.js 24 LTS. Supabase owns authentication/private data; Stripe, Resend, Google, and Vercel are optional runtime integrations. Missing credentials disable the relevant actions without preventing a build.

## Local development

```sh
npm ci
npm run dev
```

Copy `.env.example` to an untracked local environment file only when connecting an approved development environment. Side effects are disabled by default. The public template gallery and demonstration workspace work without provider accounts.

## Verification

```sh
npm run lint
npm test
npm run build
```

Tests use local fixtures and mocks, not live accounts. See [launch preparation and provider gates](docs/LAUNCH-READINESS.md) before configuring workers, billing, publishing, email, Google editing, or domain purchases. The CI workflow verifies code and does not deploy.
