// Server-side Places client. Only google-listing-types.ts may be imported by UI code.
import type { GoogleListingAttribution, GoogleListingDetails, GoogleListingPhoto } from './google-listing-types'

const PLACE_FIELDS = 'id,displayName,formattedAddress,addressComponents,nationalPhoneNumber,websiteUri,primaryTypeDisplayName,editorialSummary,regularOpeningHours.weekdayDescriptions,pureServiceAreaBusiness,googleMapsUri,businessStatus,photos,attributions'
const MAX_PHOTOS = 10
const PHOTO_CONCURRENCY = 3
type JsonObject = Record<string, unknown>
type GooglePlacesOptions = { apiKey?: string; fetcher?: typeof fetch; signal?: AbortSignal }

export class GooglePlacesError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function isGooglePlaceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{10,255}$/.test(value)
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}
function string(value: unknown) { return typeof value === 'string' ? value : '' }
function dimension(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100000 ? value : null }

function webUrl(value: unknown, allowHttp = false): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null
  try {
    const url = new URL(value.startsWith('//') ? 'https:' + value : value)
    if (url.username || url.password || (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))) return null
    return url.href
  } catch { return null }
}

function attributions(value: unknown, placeProvider = false): GoogleListingAttribution[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const entry = object(item)
    const displayName = string(entry[placeProvider ? 'provider' : 'displayName'])
    return displayName ? [{ displayName, uri: webUrl(entry[placeProvider ? 'providerUri' : 'uri']) }] : []
  })
}

function photoUri(value: unknown, apiKey: string) {
  const href = webUrl(value)
  if (!href || href.includes(apiKey)) return null
  const url = new URL(href)
  // Use Google's returned media URL directly. No arbitrary URL proxy or image download.
  if (!['googleusercontent.com', 'ggpht.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return null
  if ([...url.searchParams.keys()].some(key => /^(key|api[-_]?key|access_token)$/i.test(key))) return null
  return href
}

async function googleJson(url: string, apiKey: string, fetcher: typeof fetch, signal: AbortSignal, fields?: string) {
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { 'X-Goog-Api-Key': apiKey, ...(fields ? { 'X-Goog-FieldMask': fields } : {}) },
      signal,
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw new GooglePlacesError(502, 'Google could not load this listing. Please try again.')
  }
  if (!response.ok) throw new GooglePlacesError(502, 'Google could not load this listing. Please try again.')
  try { return object(await response.json()) }
  catch { throw new GooglePlacesError(502, 'Google returned an incomplete listing. Please try again.') }
}

/** Fetch fresh details and all available photos for one user-selected listing. No DB writes or cache. */
export async function fetchGoogleListing(placeId: string, options: GooglePlacesOptions = {}): Promise<GoogleListingDetails> {
  if (!isGooglePlaceId(placeId)) throw new GooglePlacesError(400, 'Choose a valid business listing.')
  const apiKey = options.apiKey ?? process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new GooglePlacesError(503, 'Business lookup is temporarily unavailable. Please try again later.')
  const fetcher = options.fetcher ?? fetch
  const overallSignal = AbortSignal.timeout(14000)
  const signal = options.signal ? AbortSignal.any([overallSignal, options.signal]) : overallSignal
  const detailsSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)])
  const data = await googleJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, apiKey, fetcher, detailsSignal, PLACE_FIELDS)
  const returnedId = string(data.id)
  const name = string(object(data.displayName).text)
  if (!name || (returnedId && returnedId !== placeId)) throw new GooglePlacesError(502, 'Google returned an incomplete listing. Please try again.')
  const components = Array.isArray(data.addressComponents) ? data.addressComponents.map(object) : []
  const component = (type: string) => string(components.find(entry => Array.isArray(entry.types) && entry.types.includes(type))?.longText)
  const serviceAreaBusiness = data.pureServiceAreaBusiness === true
  const rawPhotos = Array.isArray(data.photos) ? data.photos.slice(0, MAX_PHOTOS) : []
  const resolved: Array<GoogleListingPhoto | null> = rawPhotos.map(() => null)
  let cursor = 0
  // Bound provider requests; one missing photo must not discard the rest of the listing.
  await Promise.all(Array.from({ length: Math.min(PHOTO_CONCURRENCY, rawPhotos.length) }, async () => {
    while (cursor < rawPhotos.length && !signal.aborted) {
      const index = cursor++
      const photo = object(rawPhotos[index])
      const resource = string(photo.name)
      const prefix = `places/${placeId}/photos/`
      if (!resource.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,4096}$/.test(resource.slice(prefix.length))) continue
      try {
        const response = await googleJson(`https://places.googleapis.com/v1/${resource}/media?maxWidthPx=1600&skipHttpRedirect=true`, apiKey, fetcher, AbortSignal.any([signal, AbortSignal.timeout(4000)]))
        const url = photoUri(response.photoUri, apiKey)
        if (url) resolved[index] = { url, width: dimension(photo.widthPx), height: dimension(photo.heightPx), attributions: attributions(photo.authorAttributions) }
      } catch { /* Return partial photo availability without provider errors or secrets. */ }
    }
  }))
  const photos = resolved.filter((photo): photo is GoogleListingPhoto => photo !== null)
  const rawHours = object(data.regularOpeningHours).weekdayDescriptions
  return {
    source: 'google_places',
    placeId,
    name,
    address: serviceAreaBusiness ? '' : string(data.formattedAddress),
    phone: string(data.nationalPhoneNumber),
    website: webUrl(data.websiteUri, true) || '',
    city: component('locality') || component('postal_town') || component('sublocality_level_1'),
    state: component('administrative_area_level_1'),
    category: string(object(data.primaryTypeDisplayName).text),
    description: string(object(data.editorialSummary).text),
    hours: Array.isArray(rawHours) ? rawHours.filter((line): line is string => typeof line === 'string' && line.length > 0).slice(0, 7) : [],
    serviceAreaBusiness,
    sourceUrl: webUrl(data.googleMapsUri),
    businessStatus: string(data.businessStatus) || null,
    photos,
    photosAvailable: rawPhotos.length,
    photosUnavailable: rawPhotos.length - photos.length,
    attributions: attributions(data.attributions, true),
  }
}
