export class ConfigurationError extends Error {
  readonly status = 503
  readonly code = 'integration_unavailable'
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new ConfigurationError(`Service configuration missing: ${name}`)
  return value
}

const switches = {
  billing: 'AUTOLOCAL_ENABLE_BILLING',
  publishing: 'AUTOLOCAL_ENABLE_PUBLISHING',
  domainPurchases: 'AUTOLOCAL_ENABLE_DOMAIN_PURCHASES',
  email: 'AUTOLOCAL_ENABLE_EMAIL',
} as const

export function requireCapability(capability: keyof typeof switches) {
  if (process.env[switches[capability]] !== 'true') {
    throw new ConfigurationError(`This service is not enabled: ${capability}`)
  }
}

export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new ConfigurationError('Service configuration missing: NEXT_PUBLIC_SITE_URL')
  }
  const url = new URL(configured || 'http://localhost:3000')
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new ConfigurationError('Invalid application origin configuration')
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new ConfigurationError('Application origin must use HTTPS')
  }
  return url.origin
}

export function providerErrorResponse(error: unknown) {
  if (error instanceof ConfigurationError) {
    return Response.json({ error: error.message, code: error.code }, { status: 503 })
  }
  return Response.json({ error: 'The service could not complete this request. Please try again.' }, { status: 502 })
}

export function integrationHealth() {
  const configured = (...names: string[]) => names.every(name => Boolean(process.env[name]?.trim()))
  return {
    database: { configured: configured('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY') },
    googlePlaces: { configured: configured('GOOGLE_PLACES_API_KEY') },
    ai: { configured: configured('OPENAI_API_KEY') },
    billing: { configured: configured('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET') && (configured('STRIPE_HOSTING_PRICE_ID') || configured('STRIPE_MANAGED_PRICE_ID')), enabled: process.env[switches.billing] === 'true' },
    publishing: { configured: configured('VERCEL_TOKEN', 'INTERNAL_API_KEY'), enabled: process.env[switches.publishing] === 'true' },
    domains: { configured: configured('VERCEL_TOKEN', 'DOMAIN_REGISTRANT_JSON'), enabled: process.env[switches.domainPurchases] === 'true' },
    email: { configured: configured('RESEND_API_KEY', 'EMAIL_FROM'), enabled: process.env[switches.email] === 'true' },
    jobs: { configured: configured('INTERNAL_API_KEY'), schedulerVerified: process.env.AUTOLOCAL_SCHEDULER_VERIFIED === 'true' },
  }
}
