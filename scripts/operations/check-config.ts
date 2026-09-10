import { integrationHealth, appOrigin } from '../../src/lib/integration-config'
import { getGoogleConnectionHealth } from '../../src/lib/google-config'
import { getPublicRateLimitHealth } from '../../src/lib/public-rate-limit'

const strict = process.argv.includes('--strict')
const integrations = integrationHealth()
const google = getGoogleConnectionHealth()
const rateLimit = getPublicRateLimitHealth()
let originValid = false
try { appOrigin(); originValid = true } catch { /* Do not print configuration values. */ }
let releaseOriginValid = false
const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
// Require the scheduler's explicit setting, without URL normalization hiding a path.
if (configuredOrigin && /^https:\/\/[^/?#\\\s]+\/?$/.test(configuredOrigin)) {
  try {
    const url = new URL(configuredOrigin)
    releaseOriginValid = url.protocol === 'https:' && !url.username && !url.password
  } catch { /* Do not print configuration values. */ }
}
const required = {
  applicationOrigin: strict ? releaseOriginValid : originValid,
  database: integrations.database.configured,
  businessSearch: integrations.googlePlaces.configured,
  publicRateLimiting: integrations.database.configured && rateLimit.durableConfigured,
  billing: integrations.billing.enabled && integrations.billing.configured,
  publishing: integrations.publishing.enabled && integrations.publishing.configured,
  notifications: integrations.email.enabled && integrations.email.configured,
  scheduledWorkers: integrations.jobs.configured && integrations.jobs.schedulerVerified,
}
console.log(JSON.stringify({ verification: 'configuration_only', required, assumptions: { trustedProxyHeaders: rateLimit.trustedProxy, edgeRateLimitVerified: rateLimit.edgeVerified }, optional: { googleConnections: google.configured && google.enabled, googleBusinessProfileApproved: google.gbpApproved, googleProfileWrites: google.profileWritesEnabled, domainPurchases: integrations.domains.configured && integrations.domains.enabled }, note: 'No provider credentials, database migrations, proxy behavior, or edge rules were verified and no external requests were sent.' }, null, 2))
if (strict && Object.values(required).some(value => !value)) process.exitCode = 1
