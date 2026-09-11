import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchGoogleListing, GooglePlacesError } from '../src/lib/google-places'
import { POST } from '../src/app/api/business-details/route'

const placeId = 'ChIJExampleListing123'
const apiKey = 'server-secret-do-not-return'
const photo = (index: number) => ({
  name: `places/${placeId}/photos/photo_${index}`,
  widthPx: 2400,
  heightPx: 1600,
  authorAttributions: [{ displayName: `Photographer ${index}`, uri: '//maps.google.com/maps/contrib/123' }],
})

test('listing import returns all ten photos in order with attribution and real business details', async () => {
  let active = 0, peak = 0
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (!url.includes('/media?')) return Response.json({
      id: placeId,
      displayName: { text: 'Real Business & Co.' },
      formattedAddress: '123 Main St, Friendswood, TX 77546',
      nationalPhoneNumber: '(281) 555-0100',
      websiteUri: 'https://business.example/',
      primaryTypeDisplayName: { text: 'Music school' },
      editorialSummary: { text: 'A music school with individual lessons. ' },
      regularOpeningHours: { weekdayDescriptions: ['Sunday: Closed', 'Monday: 9:00 AM – 5:00 PM'] },
      addressComponents: [
        { types: ['locality'], longText: 'Friendswood' },
        { types: ['administrative_area_level_1'], longText: 'Texas', shortText: 'TX' },
      ],
      googleMapsUri: 'https://maps.google.com/?cid=123',
      businessStatus: 'OPERATIONAL',
      photos: Array.from({ length: 12 }, (_, index) => photo(index)),
      attributions: [{ provider: 'Listing provider', providerUri: 'https://provider.example/' }],
    })
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    const index = /photo_(\d+)/.exec(url)?.[1]
    return Response.json({ photoUri: `https://lh3.googleusercontent.com/photo-${index}` })
  }
  const result = await fetchGoogleListing(placeId, { apiKey, fetcher })
  assert.equal(result.source, 'google_places')
  assert.equal(result.name, 'Real Business & Co.')
  assert.equal(result.address, '123 Main St, Friendswood, TX 77546')
  assert.equal(result.phone, '(281) 555-0100')
  assert.equal(result.website, 'https://business.example/')
  assert.equal(result.city, 'Friendswood')
  assert.equal(result.state, 'Texas')
  assert.equal(result.category, 'Music school')
  assert.equal(result.description, 'A music school with individual lessons. ')
  assert.deepEqual(result.hours, ['Sunday: Closed', 'Monday: 9:00 AM – 5:00 PM'])
  assert.equal(result.sourceUrl, 'https://maps.google.com/?cid=123')
  assert.equal(result.businessStatus, 'OPERATIONAL')
  assert.equal(result.photosAvailable, 10)
  assert.equal(result.photosUnavailable, 0)
  assert.deepEqual(result.photos.map(entry => entry.url), Array.from({ length: 10 }, (_, index) => `https://lh3.googleusercontent.com/photo-${index}`))
  assert.deepEqual(result.photos[0].attributions, [{ displayName: 'Photographer 0', uri: 'https://maps.google.com/maps/contrib/123' }])
  assert.deepEqual(result.attributions, [{ displayName: 'Listing provider', uri: 'https://provider.example/' }])
  assert.equal(result.photos[0].width, 2400)
  assert.equal(result.photos[0].height, 1600)
  assert.ok(peak <= 3)
  assert.equal(requests.length, 11)
  assert.match(requests[0].url, /languageCode=en/)
  assert.match(new Headers(requests[0].init?.headers).get('X-Goog-FieldMask') || '', /photos/)
  for (const request of requests) {
    assert.equal(new URL(request.url).hostname, 'places.googleapis.com')
    assert.equal(new Headers(request.init?.headers).get('X-Goog-Api-Key'), apiKey)
    assert.equal(request.init?.cache, 'no-store')
    assert.equal(request.init?.redirect, 'error')
    assert.ok(request.init?.signal instanceof AbortSignal)
    assert.ok(!request.url.includes(apiKey))
  }
  assert.ok(!JSON.stringify(result).includes(apiKey))
  assert.ok(!JSON.stringify(result).includes(`/photos/`))
})

test('service-area listing hides its street address and absent content stays absent', async () => {
  const result = await fetchGoogleListing(placeId, { apiKey, fetcher: async () => Response.json({
    id: placeId,
    displayName: { text: 'Mobile repair' },
    formattedAddress: 'Private residence',
    pureServiceAreaBusiness: true,
    websiteUri: 'javascript:alert(1)',
    addressComponents: [{ types: ['postal_town'], longText: 'Guildford' }],
  }) })
  assert.equal(result.address, '')
  assert.equal(result.serviceAreaBusiness, true)
  assert.equal(result.city, 'Guildford')
  assert.equal(result.description, '')
  assert.equal(result.category, '')
  assert.equal(result.website, '')
  assert.deepEqual(result.hours, [])
  assert.deepEqual(result.photos, [])
  assert.equal(result.photosAvailable, 0)
  assert.equal(result.photosUnavailable, 0)
})

test('bad photos are excluded without losing available photos or requesting arbitrary resources', async () => {
  const urls: string[] = []
  const fetcher: typeof fetch = async input => {
    const url = String(input)
    urls.push(url)
    if (!url.includes('/media?')) return Response.json({
      id: placeId, displayName: { text: 'Business' },
      photos: [
        photo(0), photo(1), photo(2), photo(3), photo(4), photo(5), photo(6),
        { ...photo(7), name: 'https://attacker.example/steal' },
        { ...photo(8), name: 'places/OtherPlace123/photos/something' },
        { ...photo(9), name: `places/${placeId}/photos/x?key=stolen` },
      ],
    })
    if (url.includes('photo_0/')) return Response.json({ photoUri: 'https://lh3.googleusercontent.com/good' })
    if (url.includes('photo_1/')) return new Response('{}', { status: 429 })
    if (url.includes('photo_2/')) return Response.json({ photoUri: 'http://lh3.googleusercontent.com/insecure' })
    if (url.includes('photo_3/')) return Response.json({ photoUri: 'https://lh3.googleusercontent.com.attacker.example/fake' })
    if (url.includes('photo_4/')) return Response.json({ photoUri: `https://lh3.googleusercontent.com/image?key=${apiKey}` })
    if (url.includes('photo_5/')) return Response.json({ photoUri: 'https://user:pass@lh3.googleusercontent.com/image' })
    throw new Error('Provider failure with ' + apiKey)
  }
  const result = await fetchGoogleListing(placeId, { apiKey, fetcher })
  assert.equal(result.photos.length, 1)
  assert.equal(result.photos[0].url, 'https://lh3.googleusercontent.com/good')
  assert.equal(result.photosAvailable, 10)
  assert.equal(result.photosUnavailable, 9)
  assert.equal(urls.length, 8)
  assert.ok(urls.every(url => new URL(url).hostname === 'places.googleapis.com'))
  assert.ok(!JSON.stringify(result).includes(apiKey))
})

test('invalid and mismatched listings fail honestly before returning a preview', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ id: 'DifferentPlace123', displayName: { text: 'Wrong business' } }) }
  await assert.rejects(fetchGoogleListing('../not-a-place', { apiKey, fetcher }), error => error instanceof GooglePlacesError && error.status === 400)
  assert.equal(calls, 0)
  await assert.rejects(fetchGoogleListing(placeId, { apiKey, fetcher }), error => error instanceof GooglePlacesError && error.status === 502)
  await assert.rejects(fetchGoogleListing(placeId, { apiKey, fetcher: async () => new Response('{broken') }), error => error instanceof GooglePlacesError && error.status === 502)
  await assert.rejects(fetchGoogleListing(placeId, { apiKey, fetcher: async () => { throw new Error(apiKey) } }), error => error instanceof GooglePlacesError && !error.message.includes(apiKey))
})

test('an aborted lookup forwards cancellation and does not fabricate an empty successful listing', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchGoogleListing(placeId, { apiKey, signal: controller.signal, fetcher: async (_input, init) => {
    assert.equal(init?.signal?.aborted, true)
    throw new DOMException('Aborted', 'AbortError')
  } }), error => error instanceof GooglePlacesError && error.status === 502)
})

test('business-details route validates input, preserves no-store, and returns the complete import without signup', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GOOGLE_PLACES_API_KEY
  const originalRateKey = process.env.AUTOLOCAL_RATE_LIMIT_KEY
  const request = (body: unknown) => new Request('http://localhost/api/business-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    delete process.env.GOOGLE_PLACES_API_KEY
    delete process.env.AUTOLOCAL_RATE_LIMIT_KEY
    assert.equal((await POST(request(null))).status, 400)
    assert.equal((await POST(request({ placeId: 123 }))).status, 400)
    assert.equal((await POST(request({ placeId }))).status, 503)
    process.env.GOOGLE_PLACES_API_KEY = apiKey
    globalThis.fetch = async input => String(input).includes('/media?')
      ? Response.json({ photoUri: 'https://lh3.googleusercontent.com/good' })
      : Response.json({ id: placeId, displayName: { text: 'Listing ready to view' }, photos: [photo(0)] })
    const response = await POST(request({ placeId }))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Cache-Control') || '', /no-store/)
    const result = await response.json()
    assert.equal(result.name, 'Listing ready to view')
    assert.equal(result.photos.length, 1)
    globalThis.fetch = async () => { throw new Error('Private provider detail ' + apiKey) }
    const failed = await POST(request({ placeId }))
    assert.equal(failed.status, 502)
    assert.match(failed.headers.get('Cache-Control') || '', /no-store/)
    assert.ok(!(await failed.text()).includes(apiKey))
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY
    else process.env.GOOGLE_PLACES_API_KEY = originalKey
    if (originalRateKey === undefined) delete process.env.AUTOLOCAL_RATE_LIMIT_KEY
    else process.env.AUTOLOCAL_RATE_LIMIT_KEY = originalRateKey
  }
})
