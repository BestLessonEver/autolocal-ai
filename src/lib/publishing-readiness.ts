import { ApiError } from '@/lib/owner-access'

export const GOOGLE_IMPORT_PUBLISHING_MESSAGE = 'This website can be previewed and saved. Publishing Google listing imports is not available yet.'

/** Static deployment cannot refresh referenced Google content or retain transient API responses. */
export function needsLiveGoogleContent(site: Record<string, unknown>): boolean {
  const facts = site.business_facts && typeof site.business_facts === 'object' && !Array.isArray(site.business_facts)
    ? site.business_facts as Record<string, unknown>
    : {}
  return facts.useGoogleListing === true ||
    (typeof site.google_source_url === 'string' && site.google_source_url.length > 0) ||
    (Array.isArray(site.google_photos) && site.google_photos.length > 0) ||
    (Array.isArray(site.google_attributions) && site.google_attributions.length > 0)
}

export function assertStaticPublishingReady(site: Record<string, unknown>): void {
  if (needsLiveGoogleContent(site)) throw new ApiError(409, GOOGLE_IMPORT_PUBLISHING_MESSAGE)
}
