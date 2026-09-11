import { NextResponse } from 'next/server'
import { enforcePublicBudget } from '@/lib/public-rate-limit'
import { GooglePlacesError, isGooglePlaceId, fetchGoogleListing } from '@/lib/google-places'

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const placeId = body && typeof body === 'object' ? body.placeId : undefined
    if (!isGooglePlaceId(placeId)) return NextResponse.json({ error: 'Choose a valid business listing.' }, { status: 400, headers })
    if (!process.env.GOOGLE_PLACES_API_KEY) return NextResponse.json({ error: 'Business lookup is temporarily unavailable. Please try again later.' }, { status: 503, headers })
    const limited = await enforcePublicBudget(request, 'google-places')
    if (limited) return limited
    const details = await fetchGoogleListing(placeId, { signal: request.signal })
    return NextResponse.json(details, { headers })
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : error instanceof GooglePlacesError ? error.status : 502
    const message = error instanceof SyntaxError ? 'Invalid business lookup request.' : error instanceof GooglePlacesError ? error.message : 'Business details could not load. Please try again.'
    return NextResponse.json({ error: message }, { status, headers })
  }
}
