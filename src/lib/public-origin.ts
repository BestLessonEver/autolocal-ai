/** Public metadata may be generated without provider credentials. */
export function publicOrigin() {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://autolocal.ai').origin
}

/** Staging fixtures must not become search results. This is not access control. */
export function isStagingDeployment() {
  return Boolean(process.env.AUTOLOCAL_PUBLISHING_NAMESPACE ||
    (process.env.RAILWAY_ENVIRONMENT_NAME && process.env.RAILWAY_ENVIRONMENT_NAME !== 'production'))
}
