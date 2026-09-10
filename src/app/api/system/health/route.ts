import { integrationHealth } from '@/lib/integration-config'
import { getGoogleConnectionHealth } from '@/lib/google-config'
import { getPublicRateLimitHealth } from '@/lib/public-rate-limit'
export async function GET() {
  const integrations = integrationHealth()
  const google = getGoogleConnectionHealth()
  const protection = getPublicRateLimitHealth()
  return Response.json({ status: integrations.database.configured ? 'configured' : 'setup_required', verification: 'configuration_only', services: {
    accounts: integrations.database.configured,
    businessSearch: integrations.googlePlaces.configured && (process.env.NODE_ENV !== 'production' || protection.durableConfigured),
    billing: integrations.billing.enabled && integrations.billing.configured,
    publishing: integrations.publishing.enabled && integrations.publishing.configured,
    domainPurchases: integrations.domains.enabled && integrations.domains.configured && integrations.billing.enabled && integrations.billing.configured,
    notifications: integrations.email.enabled && integrations.email.configured,
    googleBusinessProfile: google.configured && google.enabled && google.gbpApproved,
    searchConsole: google.configured && google.enabled,
  }, note: 'Connected services need a verified staging check before launch.' })
}
