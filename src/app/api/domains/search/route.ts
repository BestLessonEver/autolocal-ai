import { NextResponse } from 'next/server'
import { checkAvailability, SUPPORTED_TLDS } from '@/lib/vercel-domains'
import { providerErrorResponse } from '@/lib/integration-config'

export async function POST(req: Request) {
  try {
    const { query } = await req.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 })
    }

    // Clean the query — strip TLD if provided, keep only valid domain chars
    const name = query
      .toLowerCase()
      .replace(/\.(com|net|org|co|us|biz)$/i, '')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63)

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Name too short' }, { status: 400 })
    }

    // Build domain list for all supported TLDs
    const domains = SUPPORTED_TLDS.map(tld => `${name}.${tld}`)

    // Check availability + pricing via Vercel API
    const results = await checkAvailability(domains)

    // Sort: available first (com first if available), then unavailable
    const sorted = results.sort((a, b) => {
      if (a.available && !b.available) return -1
      if (!a.available && b.available) return 1
      // .com first among available
      if (a.available && b.available) {
        if (a.domain.endsWith('.com')) return -1
        if (b.domain.endsWith('.com')) return 1
      }
      return 0
    })

    return NextResponse.json({
      results: sorted.map(r => ({
        domain: r.domain,
        available: r.available,
        price: r.retailPrice,
        renewPrice: r.retailRenew,
        isPremium: false,
      })),
    })
  } catch (err) {
    return providerErrorResponse(err)
  }
}
