import { ApiError } from '@/lib/owner-access'
import { cleanText } from '@/lib/lead-intake'
import { safeUrl, siteUpdates } from '@/lib/site-content'
import { fetchGoogleListing, isGooglePlaceId } from '@/lib/google-places'
import type { GoogleListingDetails } from '@/lib/google-listing-types'
import { draftFromGoogleListing, previewFromInstantDraft } from '@/lib/instant-preview'
import { enforcePublicBudget } from '@/lib/public-rate-limit'

type SiteRecord = Record<string, unknown>
const ownerFields = new Set([
  'business_name', 'tagline', 'description', 'category', 'phone', 'address', 'city', 'state',
  'contact_name', 'contact_email', 'image_caption', 'hero_image_url', 'logo_url', 'gallery_images',
  'hero_crop', 'site_mode', 'show_address', 'services', 'service_areas', 'hours', 'faq',
  'brand_color_primary', 'brand_color_secondary', 'brand_color_accent',
])
const listingFields = [
  'business_name', 'description', 'category', 'city', 'state', 'address', 'show_address',
  'phone', 'hours', 'google_photos', 'google_source_url', 'google_attributions',
] as const

function object(value: unknown): SiteRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SiteRecord : {}
}

export function usesGoogleListing(site: SiteRecord): boolean {
  return object(site.business_facts).useGoogleListing === true &&
    isGooglePlaceId(site.google_place_id)
}

/** Only explicitly edited owner fields belong in the saved override map. */
export function sanitizeGoogleOverrides(value: unknown): SiteRecord {
  const input = object(value)
  const result = siteUpdates(Object.fromEntries(Object.entries(input).filter(([key]) => ownerFields.has(key))))
  if (input.existingWebsite !== undefined) result.existingWebsite = safeUrl(input.existingWebsite)
  return result
}

/** Compatibility for older callers that submit placeId instead of googlePlaceId. */
export function legacyGooglePreviewIntake(value: unknown): SiteRecord {
  const body = object(value)
  const request = {
    googleImport: true,
    googlePlaceId: body.googlePlaceId ?? body.placeId,
    businessName: cleanText(body.ownerLabel ?? body.businessName, 200) || 'My business website',
    ...(body.template !== undefined ? { template: body.template } : {}),
    googleOverrides: sanitizeGoogleOverrides(body.googleOverrides),
  }
  // Validate before the compatibility route reaches a database mutation.
  googleImportIntake(request)
  return request
}

/** Google API content remains transient. The search label was typed by the owner. */
export function googleImportIntake(body: SiteRecord): SiteRecord {
  if (!isGooglePlaceId(body.googlePlaceId)) throw new ApiError(400, 'Choose your business from Google search.')
  const placeId = body.googlePlaceId
  const label = cleanText(body.businessName ?? body.business_name, 200)
  if (!label) throw new ApiError(400, 'Enter your business name to save this website.')
  const overrides = sanitizeGoogleOverrides(body.googleOverrides)
  const { existingWebsite, ...fields } = overrides
  return {
    business_name: label,
    ...fields,
    ...siteUpdates(body.template === undefined ? {} : { template: body.template }),
    google_place_id: placeId,
    business_facts: {
      useGoogleListing: true,
      useGooglePhotos: true,
      googleOverrides: overrides,
      ...(existingWebsite !== undefined ? { existingWebsite } : {}),
    },
  }
}

/** Called after request validation; a hydrated editor must submit only dirty fields. */
export function googleOwnerUpdates(site: SiteRecord, updates: SiteRecord): SiteRecord {
  if (!usesGoogleListing(site)) return updates
  const facts = object(site.business_facts)
  const incomingFacts = object(updates.business_facts)
  const overrides = {
    ...sanitizeGoogleOverrides(facts.googleOverrides),
    ...sanitizeGoogleOverrides({
      ...updates,
      ...(incomingFacts.existingWebsite !== undefined ? { existingWebsite: incomingFacts.existingWebsite } : {}),
    }),
  }
  const retainedFacts = { ...facts }
  // A response may include the listing's external website for display. Only an
  // explicit owner override can promote that field back into persistent facts.
  if (overrides.existingWebsite === undefined) delete retainedFacts.existingWebsite
  return {
    ...updates,
    business_facts: {
      ...retainedFacts,
      ...incomingFacts,
      useGoogleListing: true,
      useGooglePhotos: facts.useGooglePhotos !== false,
      googleOverrides: overrides,
      ...(overrides.existingWebsite !== undefined ? { existingWebsite: overrides.existingWebsite } : {}),
    },
  }
}

/** Fresh Google fields are response-only: this function never writes to the database. */
export async function hydrateGoogleSite(
  site: SiteRecord,
  options: {
    request?: Request,
    loadListing?: (placeId: string) => Promise<GoogleListingDetails>,
    budget?: typeof enforcePublicBudget,
  } = {},
): Promise<SiteRecord> {
  if (!usesGoogleListing(site)) return site
  const facts = object(site.business_facts)
  const { existingWebsite, ...overrides } = sanitizeGoogleOverrides(facts.googleOverrides)
  // Media uploads and other owner-only columns are already authoritative. Their
  // upload routes may change them after an earlier edit saved an override map.
  const listingOverrides = Object.fromEntries(Object.entries(overrides).filter(([key]) => listingFields.includes(key as typeof listingFields[number])))
  let errorMessage = 'Google listing details could not refresh. Your saved changes are safe. Please try again.'
  try {
    if (options.request) {
      const limited = await (options.budget || enforcePublicBudget)(options.request, 'google-places')
      if (limited) {
        errorMessage = limited.status === 429
          ? 'Google listing refreshes are temporarily limited. Your saved changes are safe. Please try again later.'
          : errorMessage
        throw new Error('Google refresh budget unavailable')
      }
    }
    const listing = await (options.loadListing || fetchGoogleListing)(String(site.google_place_id))
    const fresh = previewFromInstantDraft(draftFromGoogleListing(listing, site.template))
    const fields = Object.fromEntries(listingFields.map(key => [key, fresh[key]]))
    return {
      ...site,
      ...fields,
      ...listingOverrides,
      // Owner uploads stay in their own fields; the renderer selects Google photos only as a fallback.
      google_photos: facts.useGooglePhotos === false ? [] : fresh.google_photos,
      business_facts: {
        ...facts,
        existingWebsite: existingWebsite !== undefined ? existingWebsite : listing.website,
      },
      google_import_error: facts.useGooglePhotos !== false && listing.photosUnavailable > 0
        ? `${listing.photosUnavailable} Google photo${listing.photosUnavailable === 1 ? '' : 's'} could not refresh. Your business details and saved changes are available. Reload to try the missing photos again.`
        : null,
    }
  } catch {
    return {
      ...site,
      ...listingOverrides,
      google_photos: [],
      google_source_url: null,
      google_attributions: [],
      google_import_error: errorMessage,
    }
  }
}
