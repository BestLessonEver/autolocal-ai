/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import {enforcePublicBudget} from '@/lib/public-rate-limit'

export async function POST(req: Request) {
  try {
    const { businessName, city, state } = await req.json()

    if (typeof businessName !== 'string' || !businessName.trim() || businessName.length>200) {
      return NextResponse.json({ error: 'Business name required' }, { status: 400 })
    }
    if ([city, state].some(value => value != null && (typeof value !== 'string'||value.length>100))) {
      return NextResponse.json({ error: 'City and state must be text' }, { status: 400 })
    }
    const googleKey = process.env.GOOGLE_PLACES_API_KEY
    if (!googleKey) {
      return NextResponse.json({ error: 'Business search is temporarily unavailable. Please try again later.' }, { status: 503 })
    }

    const limited=await enforcePublicBudget(req,'google-places');if(limited)return limited
    const searchCity = city || ''
    const searchState = state || ''
    const query = [businessName, searchCity, searchState].filter(Boolean).join(' ')

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      console.error('Google business search failed:', res.status)
      return NextResponse.json({ error: 'Business search is temporarily unavailable. Please try again later.' }, { status: 502 })
    }
    const data = await res.json()
    const places = (data?.places || []).map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      rating: p.rating || null,
      reviewCount: p.userRatingCount || 0,
      photoRef: p.photos?.[0]?.name || null,
    }))

    return NextResponse.json({ results: places })
  } catch (err) {
    return NextResponse.json({ error: err instanceof SyntaxError?'Invalid search request.':'Search failed. Please enter business details manually.' }, { status: err instanceof SyntaxError?400:502 })
  }
}
