import {
  categoryToProfessionalTemplate,
  isSiteTemplate,
  type PreviewData,
  type SiteTemplateName,
} from '@/components/templates/types'
import { parseBusinessHours, validBusinessPhone } from '@/lib/onboarding-validation'
import type {
  GoogleListingAttribution,
  GoogleListingDetails,
  GoogleListingPhoto,
} from '@/lib/google-listing-types'

export type InstantDraft = {
  goal: 'new' | 'improve'
  businessName: string
  city: string
  state: string
  address: string
  website: string
  phone: string
  contactEmail: string
  category: string
  description: string
  serviceAreas: string
  privateAddress: boolean
  services: { name: string; description: string; price: string }[]
  hours: string
  template: SiteTemplateName
  confirmed: boolean
  question: string
  answer: string
  googlePlaceId: string
  googlePhotos: GoogleListingPhoto[]
  googleAttributions: GoogleListingAttribution[]
  googleSourceUrl: string | null
  importedFromGoogle: boolean
  photosAvailable: number
  photosUnavailable: number
  ownerLabel: string
  googleEdits: GoogleDraftEdits
}

export const GOOGLE_EDITABLE_DRAFT_FIELDS = [
  'businessName', 'city', 'state', 'address', 'website', 'phone', 'contactEmail',
  'category', 'description', 'serviceAreas', 'privateAddress', 'services', 'hours',
  'question', 'answer',
] as const
export type GoogleEditableDraftField = typeof GOOGLE_EDITABLE_DRAFT_FIELDS[number]
export type GoogleDraftEdits = Partial<Pick<InstantDraft, GoogleEditableDraftField>>

export function isGoogleEditableDraftField(value: string): value is GoogleEditableDraftField {
  return (GOOGLE_EDITABLE_DRAFT_FIELDS as readonly string[]).includes(value)
}

/** A fresh object is intentional: a new listing must not inherit another owner's facts. */
export function createEmptyInstantDraft(template?: unknown): InstantDraft {
  return {
    goal: 'new', businessName: '', city: '', state: '', address: '', website: '',
    phone: '', contactEmail: '', category: '', description: '', serviceAreas: '',
    privateAddress: true, services: [], hours: '',
    template: isSiteTemplate(template) ? template : 'ledger', confirmed: false,
    question: '', answer: '', googlePlaceId: '', googlePhotos: [],
    googleAttributions: [], googleSourceUrl: null, importedFromGoogle: false,
    photosAvailable: 0, photosUnavailable: 0,
    ownerLabel: '', googleEdits: {},
  }
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function webUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value))
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    if (url.searchParams.has('key') || url.searchParams.has('access_token')) return null
    return url.toString()
  } catch {
    return null
  }
}

function copyAttributions(attributions: GoogleListingAttribution[]): GoogleListingAttribution[] {
  return attributions
    .filter(attribution => text(attribution.displayName))
    .map(attribution => ({ displayName: text(attribution.displayName), uri: webUrl(attribution.uri) }))
}

function copyPhotos(photos: GoogleListingPhoto[]): GoogleListingPhoto[] {
  const seen = new Set<string>()
  return photos.flatMap(photo => {
    const url = webUrl(photo.url)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{
      url,
      width: typeof photo.width === 'number' && photo.width > 0 ? photo.width : null,
      height: typeof photo.height === 'number' && photo.height > 0 ? photo.height : null,
      attributions: copyAttributions(photo.attributions),
    }]
  })
}

export function draftFromGoogleListing(
  listing: GoogleListingDetails,
  selectedTemplate?: unknown,
  ownerLabel = 'My business website',
): InstantDraft {
  const category = text(listing.category)
  const privateAddress = listing.serviceAreaBusiness === true
  return {
    ...createEmptyInstantDraft(selectedTemplate),
    businessName: text(listing.name),
    city: text(listing.city),
    state: text(listing.state),
    address: privateAddress ? '' : text(listing.address),
    website: webUrl(listing.website) || '',
    phone: text(listing.phone),
    category,
    // Google's editorial summary must retain the exact supplied wording.
    description: typeof listing.description === 'string' ? listing.description : '',
    privateAddress,
    // A listing's location is not proof that it serves every surrounding area.
    serviceAreas: '',
    hours: listing.hours.map(text).filter(Boolean).join('\n'),
    template: isSiteTemplate(selectedTemplate) ? selectedTemplate : categoryToProfessionalTemplate(category),
    googlePlaceId: text(listing.placeId),
    googlePhotos: copyPhotos(listing.photos),
    googleAttributions: copyAttributions(listing.attributions),
    googleSourceUrl: webUrl(listing.sourceUrl),
    importedFromGoogle: true,
    photosAvailable: listing.photosAvailable,
    photosUnavailable: listing.photosUnavailable,
    ownerLabel: text(ownerLabel) || 'My business website',
  }
}

function cleanGoogleDraftEdits(value: unknown): GoogleDraftEdits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const edits: GoogleDraftEdits = {}
  for (const key of GOOGLE_EDITABLE_DRAFT_FIELDS) {
    const item = source[key]
    if (key === 'privateAddress') {
      if (typeof item === 'boolean') edits.privateAddress = item
    } else if (key === 'services') {
      if (Array.isArray(item)) edits.services = item.slice(0, 30).flatMap(service => {
        if (!service || typeof service !== 'object' || typeof service.name !== 'string') return []
        return [{ name: service.name, description: typeof service.description === 'string' ? service.description : '', price: typeof service.price === 'string' ? service.price : '' }]
      })
    } else if (typeof item === 'string') {
      edits[key] = item
    }
  }
  return edits
}

/** Restore only explicit owner edits on top of a newly fetched Google listing. */
export function applyGoogleDraftEdits(draft: InstantDraft, edits: unknown = draft.googleEdits): InstantDraft {
  const googleEdits = cleanGoogleDraftEdits(edits)
  return { ...draft, ...googleEdits, googleEdits }
}

export function draftStorageSnapshot(draft: InstantDraft) {
  if (!draft.importedFromGoogle) return draft
  // Places content stays in memory; storage contains the place identifier and
  // independently entered owner content so a return visit fetches fresh data.
  return {
    importedFromGoogle: true as const,
    googlePlaceId: text(draft.googlePlaceId),
    template: draft.template,
    ownerLabel: text(draft.ownerLabel) || 'My business website',
    googleEdits: cleanGoogleDraftEdits(draft.googleEdits),
  }
}

function servicesFromDraft(draft: InstantDraft): PreviewData['services'] {
  return draft.services.filter(service => text(service.name)).map(service => ({
    name: text(service.name),
    description: text(service.description),
    ...(text(service.price) ? { price: text(service.price) } : {}),
  }))
}

function areasFromDraft(draft: InstantDraft): string[] {
  return [...new Set(draft.serviceAreas.split(',').map(text).filter(Boolean))]
}

function faqFromDraft(draft: InstantDraft): NonNullable<PreviewData['faq']> {
  return text(draft.question) && text(draft.answer)
    ? [{ question: text(draft.question), answer: text(draft.answer) }]
    : []
}

export function previewFromInstantDraft(draft: InstantDraft): PreviewData {
  const photos = copyPhotos(draft.googlePhotos)
  const phone = text(draft.phone)
  const canCall = validBusinessPhone(phone)
  // Partial edits remain visible while the form explains an invalid hours line.
  const hours = Object.assign({}, ...draft.hours.split('\n').map(line => {
    try { return parseBusinessHours(line) } catch { return {} }
  })) as Record<string, string>
  return {
    id: '', slug: '', business_name: text(draft.businessName), tagline: null,
    description: draft.importedFromGoogle && !Object.hasOwn(draft.googleEdits, 'description')
      ? draft.description || null
      : text(draft.description) || null,
    category: text(draft.category),
    brand_color_primary: '#173c32', brand_color_secondary: '#f3f1e9', brand_color_accent: '#f4a340',
    logo_url: null, hero_image_url: null, hero_crop: 50,
    site_mode: 'business', gallery_images: [],
    google_photos: photos,
    google_source_url: webUrl(draft.googleSourceUrl),
    google_attributions: copyAttributions(draft.googleAttributions),
    services: servicesFromDraft(draft), hours,
    address: draft.privateAddress ? null : text(draft.address) || null,
    show_address: !draft.privateAddress,
    city: text(draft.city) || null, state: text(draft.state) || null,
    phone: phone || null, email: null, contact_email: text(draft.contactEmail) || null,
    // The old website is an intake fact, never the destination of this new draft.
    website_current: null, reviews: [], reviews_verified: false,
    google_rating: null, google_review_count: 0,
    cta_text: canCall ? 'Call us' : 'Get in touch',
    cta_url: canCall ? `tel:${phone.replace(/[^+\d]/g, '')}` : null,
    template: isSiteTemplate(draft.template) ? draft.template : categoryToProfessionalTemplate(draft.category),
    hosting_status: 'preview', deploy_status: '',
    service_areas: areasFromDraft(draft), faq: faqFromDraft(draft),
    demo: false,
  }
}

export function intakeFromInstantDraft(draft: InstantDraft): Record<string, unknown> {
  if (draft.importedFromGoogle) {
    const edits = cleanGoogleDraftEdits(draft.googleEdits)
    const editedDraft = applyGoogleDraftEdits(draft, edits)
    const googleOverrides: Record<string, unknown> = {}
    const fieldNames = {
      businessName: 'business_name', city: 'city', state: 'state', phone: 'phone',
      contactEmail: 'contact_email', category: 'category', description: 'description',
    } as const
    for (const [source, destination] of Object.entries(fieldNames)) {
      if (Object.hasOwn(edits, source)) googleOverrides[destination] = text(edits[source as keyof typeof fieldNames])
    }
    if (Object.hasOwn(edits, 'address')) googleOverrides.address = editedDraft.privateAddress ? '' : text(editedDraft.address)
    if (Object.hasOwn(edits, 'privateAddress')) googleOverrides.show_address = !editedDraft.privateAddress
    if (Object.hasOwn(edits, 'website')) googleOverrides.existingWebsite = text(editedDraft.website)
    if (Object.hasOwn(edits, 'services')) googleOverrides.services = servicesFromDraft(editedDraft)
    if (Object.hasOwn(edits, 'hours')) googleOverrides.hours = parseBusinessHours(editedDraft.hours)
    if (Object.hasOwn(edits, 'serviceAreas')) googleOverrides.service_areas = areasFromDraft(editedDraft)
    if (Object.hasOwn(edits, 'question') || Object.hasOwn(edits, 'answer')) googleOverrides.faq = faqFromDraft(editedDraft)
    return {
      googleImport: true,
      googlePlaceId: text(draft.googlePlaceId),
      template: isSiteTemplate(draft.template) ? draft.template : categoryToProfessionalTemplate(draft.category),
      businessName: text(draft.ownerLabel) || 'My business website',
      googleOverrides,
    }
  }
  const preview = previewFromInstantDraft(draft)
  return {
    businessName: preview.business_name,
    category: preview.category,
    city: text(draft.city), state: text(draft.state),
    address: preview.address || '', show_address: preview.show_address,
    website: text(draft.website), phone: preview.phone || '',
    contactEmail: text(draft.contactEmail), description: text(draft.description),
    services: preview.services,
    hours: parseBusinessHours(draft.hours), template: preview.template,
    serviceAreas: preview.service_areas, faq: preview.faq,
    googlePlaceId: text(draft.googlePlaceId) || undefined,
    businessFacts: {
      verified: draft.confirmed,
      serviceAreaBusiness: draft.privateAddress,
      existingWebsite: text(draft.website) || null,
      goal: draft.goal,
    },
  }
}
