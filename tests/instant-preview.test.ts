import test from 'node:test'
import assert from 'node:assert/strict'
import type { GoogleListingDetails } from '../src/lib/google-listing-types'
import {
  applyGoogleDraftEdits,
  createEmptyInstantDraft,
  draftFromGoogleListing,
  draftStorageSnapshot,
  intakeFromInstantDraft,
  previewFromInstantDraft,
} from '../src/lib/instant-preview'

const listing: GoogleListingDetails = {
  source: 'google_places', placeId: 'ChIJtestListing123',
  name: 'Orchard Hair Studio', address: '42 Orchard Street, Austin, TX 78701',
  phone: '(512) 555-0123', website: 'https://orchard.example.test/',
  city: 'Austin', state: 'Texas', category: 'Hair salon',
  description: 'Hair studio on Orchard Street.',
  hours: [
    'Monday: Closed',
    'Tuesday: 9:00 AM – 1:00 PM, 2:00 – 6:00 PM',
    'Wednesday: Open 24 hours',
    'Thursday: 9:00 AM – 6:00 PM',
    'Friday: 9:00 AM – 6:00 PM',
    'Saturday: 10:00 AM – 4:00 PM',
    'Sunday: Closed',
  ],
  serviceAreaBusiness: false,
  sourceUrl: 'https://maps.google.com/?cid=123', businessStatus: 'OPERATIONAL',
  photos: Array.from({ length: 10 }, (_, index) => ({
    url: `https://lh3.googleusercontent.com/listing-photo-${index}`,
    width: 1600, height: 1200,
    attributions: [{ displayName: `Photographer ${index}`, uri: `https://maps.google.com/contrib/${index}` }],
  })),
  photosAvailable: 10, photosUnavailable: 0,
  attributions: [{ displayName: 'Listing attribution', uri: 'https://maps.google.com/' }],
}

test('selecting a listing supplies its real details and all returned photos to an immediate preview', () => {
  const draft = draftFromGoogleListing(listing)
  const preview = previewFromInstantDraft(draft)
  assert.equal(draft.template, 'atelier')
  assert.equal(preview.business_name, listing.name)
  assert.equal(preview.description, listing.description)
  assert.equal(preview.address, listing.address)
  assert.equal(preview.phone, listing.phone)
  assert.equal(preview.cta_url, 'tel:5125550123')
  assert.equal(preview.city, listing.city)
  assert.equal(preview.state, listing.state)
  assert.equal(preview.hours.Monday, 'Closed')
  assert.equal(preview.hours.Tuesday, '9:00 AM – 1:00 PM, 2:00 – 6:00 PM')
  assert.equal(preview.hours.Wednesday, 'Open 24 hours')
  assert.equal(Object.keys(preview.hours).length, 7)
  assert.equal(preview.google_photos?.length, 10)
  assert.deepEqual(preview.google_photos?.map(photo => photo.url), listing.photos.map(photo => photo.url))
  assert.deepEqual(preview.google_photos?.[9].attributions, listing.photos[9].attributions)
  assert.equal(preview.google_source_url, listing.sourceUrl)
  assert.deepEqual(preview.google_attributions, listing.attributions)
  assert.equal(preview.demo, false)
  assert.equal(preview.tagline, null)
  assert.equal(preview.email, null)
  assert.equal(preview.contact_email, null)
  assert.deepEqual(preview.services, [])
  assert.deepEqual(preview.reviews, [])
  assert.equal(preview.google_rating, null)
  assert.equal(preview.google_review_count, 0)
  assert.deepEqual(preview.service_areas, [])
})

test('an explicit design survives import while automatic selection follows the listing category', () => {
  assert.equal(draftFromGoogleListing(listing, 'receipt').template, 'receipt')
  assert.equal(draftFromGoogleListing({ ...listing, category: 'Plumber' }).template, 'summit')
  assert.equal(draftFromGoogleListing({ ...listing, category: 'Accounting firm' }).template, 'ledger')
  assert.equal(draftFromGoogleListing(listing, 'unsupported').template, 'atelier')
})

test('Google editorial summaries retain their exact supplied text unless the owner replaces them', () => {
  const description = '  A supplied editorial summary.\n'
  const draft = draftFromGoogleListing({ ...listing, description })
  assert.equal(draft.description, description)
  assert.equal(previewFromInstantDraft(draft).description, description)
  const edited = applyGoogleDraftEdits(draft, { description: 'Owner replacement.' })
  assert.equal(previewFromInstantDraft(edited).description, 'Owner replacement.')
})

test('switching listings does not inherit edited contact details, photos, or claims from the first business', () => {
  const first = draftFromGoogleListing(listing)
  first.contactEmail = 'first-owner@example.test'
  first.services = [{ name: 'First business service', description: 'Only supplied for the first business.', price: '$50' }]
  first.question = 'A first business question'
  first.answer = 'A first business answer'
  first.confirmed = true
  first.googlePhotos[0].attributions[0].displayName = 'Changed in draft'
  const second = draftFromGoogleListing({
    ...listing, placeId: 'ChIJsecondListing123', name: 'Second Business',
    phone: '', website: '', address: '', city: '', state: '', category: '',
    description: '', hours: [], photos: [], attributions: [], sourceUrl: null,
    photosAvailable: 0, photosUnavailable: 0,
  })
  const preview = previewFromInstantDraft(second)
  assert.equal(second.businessName, 'Second Business')
  assert.equal(second.googlePlaceId, 'ChIJsecondListing123')
  assert.equal(second.contactEmail, '')
  assert.equal(second.phone, '')
  assert.equal(second.website, '')
  assert.equal(second.city, '')
  assert.equal(second.state, '')
  assert.equal(second.question, '')
  assert.equal(second.answer, '')
  assert.equal(second.confirmed, false)
  assert.deepEqual(second.services, [])
  assert.deepEqual(preview.hours, {})
  assert.deepEqual(preview.google_photos, [])
  assert.deepEqual(preview.google_attributions, [])
  assert.equal(preview.google_source_url, null)
  assert.equal(preview.description, null)
  assert.equal(preview.cta_url, null)
  assert.equal(listing.photos[0].attributions[0].displayName, 'Photographer 0')
})

test('service-area businesses never expose a returned street address in preview or saved intake', () => {
  const draft = draftFromGoogleListing({ ...listing, serviceAreaBusiness: true })
  assert.equal(draft.address, '')
  draft.address = 'Private home address'
  const preview = previewFromInstantDraft(draft)
  const intake = intakeFromInstantDraft(draft)
  assert.equal(preview.show_address, false)
  assert.equal(preview.address, null)
  assert.deepEqual(intake.googleOverrides, {})
  assert.ok(!JSON.stringify(intake).includes('Private home address'))
  const editedIntake = intakeFromInstantDraft(applyGoogleDraftEdits(draft, { address: 'Private home address', privateAddress: true }))
  assert.deepEqual(editedIntake.googleOverrides, { address: '', show_address: false })
})

test('saving an untouched listing stores only its identifier, selected design, and the owner-entered label', () => {
  const draft = draftFromGoogleListing(listing, undefined, 'My Orchard search')
  const intake = intakeFromInstantDraft(draft)
  assert.deepEqual(intake, {
    googleImport: true,
    googlePlaceId: listing.placeId,
    template: 'atelier',
    businessName: 'My Orchard search',
    googleOverrides: {},
  })
  for (const key of ['photoUrls', 'googlePhotos', 'google_photos', 'googleAttributions', 'hero_image_url', 'gallery_images']) {
    assert.equal(Object.hasOwn(intake, key), false)
  }
  assert.ok(!JSON.stringify(intake).includes('googleusercontent'))
  assert.ok(!JSON.stringify(intake).includes('Photographer'))
  assert.ok(!JSON.stringify(intake).includes(listing.name))
  assert.ok(!JSON.stringify(intake).includes(listing.phone))
  assert.ok(!JSON.stringify(intake).includes(listing.description))
})

test('Google draft storage omits fetched content and restores only owner edits over a fresh listing', () => {
  const first = applyGoogleDraftEdits(draftFromGoogleListing(listing, 'receipt', 'Orchard search'), {
    phone: '(512) 555-0199', description: 'A description written by the owner.',
    services: [{ name: 'Owner entered service' }],
    googlePhotos: [{ url: 'https://example.test/not-owner-content' }],
    googlePlaceId: 'altered-place-id', importedFromGoogle: false,
  })
  const snapshot = draftStorageSnapshot(first)
  assert.deepEqual(snapshot, {
    importedFromGoogle: true, googlePlaceId: listing.placeId,
    template: 'receipt', ownerLabel: 'Orchard search',
    googleEdits: {
      phone: '(512) 555-0199', description: 'A description written by the owner.',
      services: [{ name: 'Owner entered service', description: '', price: '' }],
    },
  })
  assert.ok(!JSON.stringify(snapshot).includes('googleusercontent'))
  assert.ok(!JSON.stringify(snapshot).includes(listing.name))
  const current = draftFromGoogleListing({
    ...listing, name: 'The current Google name',
    hours: ['Monday: 10:00 AM – 2:00 PM'],
  }, snapshot.template, snapshot.ownerLabel)
  const restored = applyGoogleDraftEdits(current, snapshot.googleEdits)
  assert.equal(restored.businessName, 'The current Google name')
  assert.equal(restored.phone, '(512) 555-0199')
  assert.equal(restored.hours, 'Monday: 10:00 AM – 2:00 PM')
  assert.equal(restored.googlePlaceId, listing.placeId)
  assert.equal(restored.importedFromGoogle, true)
  assert.equal(restored.googlePhotos.length, listing.photos.length)
  assert.equal(restored.template, 'receipt')
})

test('saving an imported draft persists only explicit edits with the agreed database field names', () => {
  const draft = applyGoogleDraftEdits(draftFromGoogleListing(listing), {
    businessName: 'Owner-written name', phone: '(512) 555-0199', contactEmail: '',
    description: '', privateAddress: true, address: 'Keep private',
    website: 'https://owner-entered.example.test', hours: 'Monday: By appointment',
    services: [{ name: 'Owner service', description: '', price: '' }],
    serviceAreas: 'Austin, Round Rock', question: 'Owner question?', answer: 'Owner answer.',
  })
  const intake = intakeFromInstantDraft(draft)
  assert.deepEqual(intake.googleOverrides, {
    business_name: 'Owner-written name', phone: '(512) 555-0199', contact_email: '',
    description: '', address: '', show_address: false,
    existingWebsite: 'https://owner-entered.example.test',
    services: [{ name: 'Owner service', description: '' }],
    hours: { Monday: 'By appointment' }, service_areas: ['Austin', 'Round Rock'],
    faq: [{ question: 'Owner question?', answer: 'Owner answer.' }],
  })
  assert.equal(Object.hasOwn(intake.googleOverrides as object, 'city'), false)
  assert.ok(!JSON.stringify(intake).includes(listing.website))
})

test('incomplete fetched hours never block saving an unedited import while malformed owner edits do', () => {
  const draft = draftFromGoogleListing({ ...listing, hours: ['Unavailable format'] })
  assert.deepEqual(intakeFromInstantDraft(draft).googleOverrides, {})
  assert.throws(() => intakeFromInstantDraft(applyGoogleDraftEdits(draft, { hours: 'Monday' })), /Write each day/)
})

test('manual input supports optional content and never requires service descriptions or a second contact method', () => {
  const draft = {
    ...createEmptyInstantDraft('win95'), businessName: 'Owner supplied name',
    phone: '(512) 555-0123', contactEmail: '',
    services: [{ name: 'Owner supplied service', description: '', price: '' }],
    serviceAreas: 'Austin, , Austin, Round Rock',
  }
  const preview = previewFromInstantDraft(draft)
  const intake = intakeFromInstantDraft(draft)
  assert.equal(preview.template, 'win95')
  assert.equal(preview.description, null)
  assert.equal(preview.contact_email, null)
  assert.equal(preview.cta_url, 'tel:5125550123')
  assert.deepEqual(preview.services, [{ name: 'Owner supplied service', description: '' }])
  assert.deepEqual(preview.service_areas, ['Austin', 'Round Rock'])
  assert.deepEqual(intake.hours, {})
  assert.equal((intake.businessFacts as Record<string, unknown>).useGooglePhotos, undefined)
  assert.equal(createEmptyInstantDraft().googlePhotos.length, 0)
})

test('preview rejects unsafe links and retains safe photographs and their attribution', () => {
  const draft = draftFromGoogleListing({
    ...listing, website: 'javascript:alert(1)', sourceUrl: 'https://user:password@example.test',
    photos: [
      { url: 'https://example.test/photo?key=secret', width: null, height: null, attributions: [] },
      { url: 'javascript:alert(1)', width: null, height: null, attributions: [] },
      { ...listing.photos[0], attributions: [{ displayName: 'Photographer', uri: 'javascript:alert(1)' }] },
      listing.photos[0],
    ],
  })
  const preview = previewFromInstantDraft(draft)
  assert.equal(draft.website, '')
  assert.equal(preview.google_source_url, null)
  assert.equal(preview.google_photos?.length, 1)
  assert.equal(preview.google_photos?.[0].attributions[0].uri, null)
  assert.equal(preview.google_photos?.[0].url, listing.photos[0].url)
})

test('typing partial hours does not crash the preview while saving still reports invalid hours', () => {
  const draft = { ...createEmptyInstantDraft(), hours: 'Monday: Closed\nTuesday' }
  assert.deepEqual(previewFromInstantDraft(draft).hours, { Monday: 'Closed' })
  assert.throws(() => intakeFromInstantDraft(draft), /Write each day with its hours/)
})
