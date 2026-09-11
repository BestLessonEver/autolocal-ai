import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { googleImportIntake, googleOwnerUpdates, hydrateGoogleSite, legacyGooglePreviewIntake } from '../src/lib/google-site'
import { saveOwnedIntake } from '../src/lib/site-intake'
import type { GoogleListingDetails } from '../src/lib/google-listing-types'

const listing: GoogleListingDetails = {
  source: 'google_places', placeId: 'place123456789', name: 'Current Google Business',
  address: '10 Public Street', phone: '555-555-0123', website: 'https://current-listing.example/',
  city: 'Austin', state: 'TX', category: 'Restaurant', description: 'Current Google description.',
  hours: ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: Closed'], serviceAreaBusiness: false,
  sourceUrl: 'https://maps.google.com/?cid=123', businessStatus: 'OPERATIONAL',
  photos: [{ url: 'https://lh3.googleusercontent.com/fresh-photo', width: 1200, height: 800,
    attributions: [{ displayName: 'Photo author', uri: 'https://maps.google.com/contrib/123' }] }],
  photosAvailable: 1, photosUnavailable: 0, attributions: [],
}
const importedSite = () => ({
  id: 'site-a', slug: 'owner-search-label', business_name: 'Owner search label', template: 'receipt',
  google_place_id: 'place123456789', category: 'general', services: [],
  business_facts: { useGoogleListing: true, useGooglePhotos: true, googleOverrides: {} },
})
const noExistingSite = () => {
  const query = { eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: null, error: null }) }
  return query
}
const owner = (id = 'owner-a') => ({ id, email: `${id}@example.invalid`, email_confirmed_at: '2026-01-01' }) as User

function intakeDatabase(initial: Record<string, unknown>[] = []) {
  const rows = structuredClone(initial)
  let inserts = 0
  const db = { from: () => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let update: Record<string, unknown> | null = null
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
      order: () => query,
      limit: () => query,
      update: (value: Record<string, unknown>) => { update = value; return query },
      maybeSingle: async () => {
        const row = rows.find(item => filters.every(filter => filter(item)))
        if (row && update) Object.assign(row, structuredClone(update))
        return { data: row ? structuredClone(row) : null, error: null }
      },
      insert: async (value: Record<string, unknown>) => {
        inserts++
        if (rows.some(row => (value.id && row.id === value.id) || row.slug === value.slug)) return { error: { code: '23505' } }
        rows.push(structuredClone(value))
        return { error: null }
      },
    }
    return query
  } } as unknown as SupabaseClient
  return { db, rows, inserts: () => inserts }
}

test('Google intake stores a place ID and explicit owner changes, never the submitted Google payload', async () => {
  let stored: Record<string, unknown> = {}
  const user = { id: 'owner-a', email: 'owner@example.invalid', email_confirmed_at: '2026-01-01' } as User
  const db = { from: () => ({ select: noExistingSite, insert: async (value: Record<string, unknown>) => { stored = value; return { error: null } } }) } as unknown as SupabaseClient
  await saveOwnedIntake({
    googleImport: true, googlePlaceId: listing.placeId, businessName: 'Owner search label', template: 'receipt',
    city: listing.city, address: listing.address, phone: listing.phone, description: listing.description,
    hours: listing.hours, website: listing.website, photoUrls: listing.photos.map(photo => photo.url),
    hero_image_url: listing.photos[0].url, businessFacts: { copied: listing.name }, owner_id: 'attacker',
    googleOverrides: { contact_email: 'hello@owner.example', description: 'Owner wrote this.',
      existingWebsite: 'https://owner.example/', google_photos: listing.photos, owner_id: 'attacker' },
  }, { user, db })
  assert.equal(stored.business_name, 'Owner search label')
  assert.equal(stored.owner_id, 'owner-a')
  assert.equal(stored.google_place_id, 'place123456789')
  assert.equal(stored.template, 'receipt')
  assert.equal(stored.description, 'Owner wrote this.')
  for (const key of ['city', 'address', 'phone', 'hours', 'gallery_images', 'hero_image_url']) assert.equal(key in stored, false, key)
  assert.deepEqual(stored.business_facts, {
    useGoogleListing: true, useGooglePhotos: true,
    googleOverrides: { contact_email: 'hello@owner.example', description: 'Owner wrote this.', existingWebsite: 'https://owner.example/' },
    existingWebsite: 'https://owner.example/',
  })
  assert.doesNotMatch(JSON.stringify(stored), /Current Google|Public Street|fresh-photo|current-listing|attacker/)
})

test('owner preview reloads Google data and keeps owner edits and uploads without mutating saved content', async () => {
  const site = {
    ...importedSite(), hero_image_url: 'https://owner.example/hero.jpg', gallery_images: ['https://owner.example/work.jpg'],
    business_facts: { useGoogleListing: true, useGooglePhotos: true, googleOverrides: {
      phone: '555-555-0199', description: 'Our own description.', show_address: false,
      hero_image_url: 'https://owner.example/old-hero.jpg', gallery_images: ['https://owner.example/old-work.jpg'],
    } },
  }
  const original = structuredClone(site)
  let reads = 0
  const loadListing = async (placeId: string) => {
    assert.equal(placeId, 'place123456789')
    reads++
    return { ...listing, hours: [`Monday: ${reads === 1 ? '9:00 AM – 5:00 PM' : '10:00 AM – 6:00 PM'}`] }
  }
  const first = await hydrateGoogleSite(site, { loadListing })
  const second = await hydrateGoogleSite(site, { loadListing })
  assert.equal(reads, 2)
  assert.equal(first.business_name, listing.name)
  assert.deepEqual(first.hours, { Monday: '9:00 AM – 5:00 PM' })
  assert.deepEqual(second.hours, { Monday: '10:00 AM – 6:00 PM' })
  assert.equal(first.phone, '555-555-0199')
  assert.equal(first.show_address, false)
  assert.equal(first.description, 'Our own description.')
  assert.equal(first.hero_image_url, site.hero_image_url)
  assert.deepEqual(first.gallery_images, site.gallery_images)
  assert.deepEqual(first.google_photos, listing.photos)
  assert.deepEqual(site, original)
  assert.doesNotMatch(JSON.stringify(site), /Current Google|Public Street|fresh-photo/)
})

test('partial photo failures keep available details and report only failed requested photos', async () => {
  const site = importedSite()
  const original = structuredClone(site)
  const partial = await hydrateGoogleSite(site, { loadListing: async () => ({ ...listing, photosAvailable: 3, photosUnavailable: 2 }) })
  assert.deepEqual(partial.google_photos, listing.photos)
  assert.equal(partial.business_name, listing.name)
  assert.deepEqual(partial.hours, { Monday: '9:00 AM – 5:00 PM', Tuesday: 'Closed' })
  assert.match(String(partial.google_import_error), /^2 Google photos could not refresh/)
  assert.deepEqual(site, original)
  const allFailed = await hydrateGoogleSite(site, { loadListing: async () => ({ ...listing, photos: [], photosAvailable: 1, photosUnavailable: 1 }) })
  assert.deepEqual(allFailed.google_photos, [])
  assert.match(String(allFailed.google_import_error), /^1 Google photo could not refresh/)
  const noneAvailable = await hydrateGoogleSite(site, { loadListing: async () => ({ ...listing, photos: [], photosAvailable: 0, photosUnavailable: 0 }) })
  assert.equal(noneAvailable.google_import_error, null)
  const disabled = await hydrateGoogleSite({ ...site, business_facts: { ...site.business_facts, useGooglePhotos: false } }, { loadListing: async () => ({ ...listing, photos: [], photosUnavailable: 1 }) })
  assert.equal(disabled.google_import_error, null)
  assert.deepEqual(disabled.google_photos, [])
})

test('dirty owner updates retain earlier overrides and never capture untouched hydrated fields', async () => {
  const site = { ...importedSite(), business_facts: {
    useGoogleListing: true, useGooglePhotos: true, googleOverrides: { phone: '555-555-0199' },
  } }
  const hydrated = await hydrateGoogleSite(site, { loadListing: async () => listing })
  const updates = googleOwnerUpdates(hydrated, { hours: { Monday: 'By appointment' }, description: null })
  assert.deepEqual(updates, {
    hours: { Monday: 'By appointment' }, description: null,
    business_facts: {
      useGoogleListing: true, useGooglePhotos: true,
      googleOverrides: { phone: '555-555-0199', hours: { Monday: 'By appointment' }, description: null },
    },
  })
  assert.equal('business_name' in updates, false)
  assert.equal('google_photos' in updates, false)
  assert.doesNotMatch(JSON.stringify(updates), /current-listing/)
})

test('failed refresh keeps saved owner content, removes Google response content, and reports the failure', async () => {
  const site = { ...importedSite(), description: 'Owner wrote this.', hero_image_url: 'https://owner.example/hero.jpg' }
  const result = await hydrateGoogleSite(site, { loadListing: async () => { throw new Error('Provider unavailable') } })
  assert.equal(result.business_name, site.business_name)
  assert.equal(result.description, site.description)
  assert.equal(result.hero_image_url, site.hero_image_url)
  assert.deepEqual(result.google_photos, [])
  assert.match(String(result.google_import_error), /could not refresh/)
  let reads = 0
  const manual = { business_name: 'Manual site' }
  assert.equal(await hydrateGoogleSite(manual, { loadListing: async () => { reads++; return listing } }), manual)
  assert.equal(reads, 0)
})

test('Google import rejects malformed identifiers and invalid owner-edited fields', () => {
  assert.throws(() => googleImportIntake({ businessName: 'Owner name', googlePlaceId: '../other' }), /Choose your business/)
  assert.throws(() => googleImportIntake({ businessName: 'Owner name', googlePlaceId: 'x'.repeat(256) }), /Choose your business/)
  assert.throws(() => googleImportIntake({ googlePlaceId: 'place123456789' }), /business name/)
  assert.throws(() => googleImportIntake({ businessName: 'Owner name', googlePlaceId: 'place123456789', googleOverrides: { existingWebsite: 'javascript:alert(1)' } }), /valid/)
})

test('owner refresh uses the shared lookup budget before issuing Google requests', async () => {
  let reads = 0
  const request = new Request('https://autolocal.ai/preview/owner-search-label')
  const result = await hydrateGoogleSite(importedSite(), {
    request,
    budget: async (receivedRequest, scope) => {
      assert.equal(receivedRequest, request)
      assert.equal(scope, 'google-places')
      return Response.json({ error: 'Limited' }, { status: 429 })
    },
    loadListing: async () => { reads++; return listing },
  })
  assert.equal(reads, 0)
  assert.match(String(result.google_import_error), /temporarily limited/)
  assert.deepEqual(result.google_photos, [])
})

test('legacy preview requests retain their place ID without importing Google payloads into storage', async () => {
  const request = legacyGooglePreviewIntake({
    placeId: listing.placeId, ownerLabel: 'Owner search words', template: 'myspace',
    name: listing.name, address: listing.address, phone: listing.phone, photos: listing.photos,
    hours: listing.hours, owner_id: 'attacker', businessFacts: { copied: listing.name },
  })
  assert.deepEqual(request, {
    googleImport: true, googlePlaceId: listing.placeId,
    businessName: 'Owner search words', template: 'myspace', googleOverrides: {},
  })
  let stored: Record<string, unknown> = {}
  const user = { id: 'owner-a', email: 'owner@example.invalid', email_confirmed_at: '2026-01-01' } as User
  const db = { from: () => ({ select: noExistingSite, insert: async (value: Record<string, unknown>) => { stored = value; return { error: null } } }) } as unknown as SupabaseClient
  const result = await saveOwnedIntake(request, { user, db })
  assert.match(result.previewUrl, /^\/preview\/owner-search-words-[a-f0-9]{10}$/)
  assert.equal(stored.google_place_id, listing.placeId)
  assert.doesNotMatch(JSON.stringify(stored), /Current Google|Public Street|fresh-photo|attacker/)
  assert.equal(legacyGooglePreviewIntake({ placeId: listing.placeId }).businessName, 'My business website')
  assert.throws(() => legacyGooglePreviewIntake({ placeId: '../invalid' }), /Choose your business/)
  assert.throws(() => legacyGooglePreviewIntake({ placeId: listing.placeId, template: 'pokemon' }), /supported/)
})

test('saving the same owner listing reuses its site and merges only newly edited fields', async () => {
  const state = intakeDatabase()
  const request = { googleImport: true, googlePlaceId: listing.placeId, businessName: 'Owner search label', template: 'receipt', googleOverrides: { description: 'Owner description.', hours: { Monday: 'By appointment' } } }
  const first = await saveOwnedIntake(request, { user: owner(), db: state.db })
  const stored = state.rows[0]
  stored.hero_image_url = 'https://owner.example/new-photo.jpg'
  stored.services = [{ name: 'Owner service', description: 'Saved later in the editor.' }]
  ;(stored.business_facts as Record<string, unknown>).useGooglePhotos = false
  const second = await saveOwnedIntake({ ...request, businessName: 'Different search words', template: 'myspace', googleOverrides: { phone: '555-555-0199' } }, { user: owner(), db: state.db })
  assert.equal(first.slug, second.slug)
  assert.equal(state.rows.length, 1)
  assert.equal(state.inserts(), 1)
  assert.equal(stored.business_name, 'Owner search label')
  assert.equal(stored.description, 'Owner description.')
  assert.deepEqual(stored.hours, { Monday: 'By appointment' })
  assert.equal(stored.hero_image_url, 'https://owner.example/new-photo.jpg')
  assert.deepEqual(stored.services, [{ name: 'Owner service', description: 'Saved later in the editor.' }])
  assert.equal(stored.template, 'myspace')
  assert.equal(stored.phone, '555-555-0199')
  assert.deepEqual(stored.business_facts, {
    useGoogleListing: true, useGooglePhotos: false,
    googleOverrides: { description: 'Owner description.', hours: { Monday: 'By appointment' }, phone: '555-555-0199' },
  })
})

test('different owners can save the same listing and search label without sharing a site or slug', async () => {
  const state = intakeDatabase()
  const request = { googleImport: true, googlePlaceId: listing.placeId, businessName: 'Same search label', template: 'ledger' }
  const a = await saveOwnedIntake({ ...request, googleOverrides: { phone: '555-555-0101' } }, { user: owner('owner-a'), db: state.db })
  const b = await saveOwnedIntake({ ...request, googleOverrides: { phone: '555-555-0102' } }, { user: owner('owner-b'), db: state.db })
  assert.equal(state.rows.length, 2)
  assert.notEqual(a.slug, b.slug)
  assert.notEqual(state.rows[0].id, state.rows[1].id)
  for (const row of state.rows) assert.match(String(row.slug), /^same-search-label-[a-f0-9]{10}$/)
  assert.equal(state.rows[0].phone, '555-555-0101')
  assert.equal(state.rows[1].phone, '555-555-0102')
  const manual = await saveOwnedIntake({ businessName: 'Manual Business', city: 'Austin' }, { user: owner(), db: state.db })
  assert.equal(manual.slug, 'manual-business-austin')
})

test('simultaneous first-save requests for one owner listing converge through the existing primary key', async () => {
  const state = intakeDatabase()
  const request = { googleImport: true, googlePlaceId: listing.placeId, businessName: 'Repeated submit', googleOverrides: { contact_email: 'owner@example.invalid' } }
  const context = { user: owner(), db: state.db }
  const [a, b] = await Promise.all([saveOwnedIntake(request, context), saveOwnedIntake(request, context)])
  assert.equal(a.slug, b.slug)
  assert.equal(state.rows.length, 1)
  assert.equal(state.inserts(), 2)
  assert.equal(state.rows[0].contact_email, 'owner@example.invalid')
})
