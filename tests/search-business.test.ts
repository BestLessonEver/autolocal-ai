import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '../src/app/api/search-business/route'

test('search distinguishes outages from an actual empty result', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GOOGLE_PLACES_API_KEY
  const originalPublicKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
  const request = (body: unknown) => new Request('http://localhost/api/search-business', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
  })
  try {
    delete process.env.GOOGLE_PLACES_API_KEY
    delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    globalThis.fetch = async () => { throw new Error('Unexpected external call') }
    assert.equal((await POST(request({businessName: 42}))).status, 400)
    assert.equal((await POST(request({businessName: 'Demo', city: []}))).status, 400)
    assert.equal((await POST(request({businessName: 'Demo'}))).status, 503)
    process.env.GOOGLE_PLACES_API_KEY = 'local-test-only'
    globalThis.fetch = async () => new Response('{}', {status: 403})
    const unavailable = await POST(request({businessName: 'Demo'}))
    assert.equal(unavailable.status, 502)
    assert.ok((await unavailable.json()).error)
    globalThis.fetch = async () => Response.json({places: []})
    const empty = await POST(request({businessName: 'Demo'}))
    assert.equal(empty.status, 200)
    assert.deepEqual(await empty.json(), {results: []})
    globalThis.fetch = async () => Response.json({places:[{id:'demo',displayName:{text:'Demo'},formattedAddress:'Houston, TX',rating:4.8,userRatingCount:10}]})
    const found = await POST(request({businessName:'Demo'}))
    assert.equal((await found.json()).results[0].name, 'Demo')
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY
    else process.env.GOOGLE_PLACES_API_KEY = originalKey
    if (originalPublicKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    else process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY = originalPublicKey
  }
})
