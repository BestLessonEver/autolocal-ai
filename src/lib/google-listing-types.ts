/** Live Google Maps content for the current preview. Do not persist this payload. */
export type GoogleListingAttribution = {
  displayName: string
  uri: string | null
}

export type GoogleListingPhoto = {
  url: string
  width: number | null
  height: number | null
  attributions: GoogleListingAttribution[]
}

export type GoogleListingDetails = {
  source: 'google_places'
  placeId: string
  name: string
  address: string
  phone: string
  website: string
  city: string
  state: string
  category: string
  /** Google's editorial summary, when available. Display it without rewriting it. */
  description: string
  hours: string[]
  serviceAreaBusiness: boolean
  sourceUrl: string | null
  businessStatus: string | null
  photos: GoogleListingPhoto[]
  /** Number returned by Google, which can be fewer than the full Maps gallery. */
  photosAvailable: number
  photosUnavailable: number
  attributions: GoogleListingAttribution[]
}
