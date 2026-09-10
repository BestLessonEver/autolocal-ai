# Customer template verification — 2026-09-10

Three independent imagegen concepts informed the implemented templates. Original prompts and generated references are in `prompts.md` and the three `*-inspiration.png` files in this directory. These are design references, not photographs of customer businesses.

## Visual review

Reviewed the corrected Chrome captures at desktop 1400 × 1000 and phone 390 × 844 for Summit, Atelier, and Ledger against each reference image. The earlier browser viewport control did not change the actual page width; those captures were replaced. The corrected capture used per-tab `Emulation.setDeviceMetricsOverride` and `Page.captureScreenshot`, with actual DOM width and equal document scroll width checked for each size. All six replacement PNGs were independently inspected. Captures are in the project artifact folder `artifacts/autolocal-launch-2026-09-10/screenshots/` one directory above the repository.

- Summit retains forest green, warm paper, lime actions, bold type, a split photograph, and a strong service band.
- Atelier uses plum, ivory, expressive serif type, rounded actions, a tall arched photograph, and editorial service rows.
- Ledger uses navy, ice blue, refined serif type, an asymmetric hero, and decorative geometry without invented business photography.

All six captures showed readable headings, correct wrapping, working layout proportions, no visible horizontal overflow, explicit fictional-business labeling, and a persistent mobile inquiry action. Stock demo photographs have visible illustrative captions. Actual customer sites use supplied photographs or decorative geometry. Full-length form behavior is covered by the shared renderer/runtime tests; the captured views are hero viewport checks, not full-page visual proof.

## Verified behavior

`tests/professional-templates.test.ts` passes eight tests covering:

- Identical shared preview and static HTML content for all three designs; valid section/contact links.
- Canonical URL, sitemap, robots, slug marker, and factual LocalBusiness/Service JSON-LD.
- No private owner email/ID, hidden street address, unverified reviews, or invented claims in public output.
- Escaped untrusted text and rejected credential-bearing/script URLs.
- Demo noindex output and zero real contact links.
- Actual execution of the standalone exported inquiry script: success requires a durable lead ID; failures retain entered values and retry identity.
- No network inquiry submission in demo or private preview mode.
- Service-specific links carry the selected service into the inquiry form.

Targeted lint and project typecheck passed after the final template and preview changes. The root agent separately runs whole-application tests/build and browser flows.

## Publishing boundary

The `/preview/[slug]` page renders current draft fields only for the verified owner, with generic noindex metadata. Anonymous visitors are redirected to the last verified HTTPS publication when hosting is active or paid through cancellation. A queued or failed update does not make an existing paid publication private. Unpublished or suspended sites return the private-preview sign-in state.

Publishing and paid-provider actions remain unexecuted in this local verification. Database migrations, integration secrets, provider approvals, and a controlled end-to-end pilot must be confirmed before production launch.
