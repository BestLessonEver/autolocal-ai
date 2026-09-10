import { NextResponse } from 'next/server'
import { requireOwnerSite, selectorFromRequest, apiErrorResponse, ApiError } from '@/lib/owner-access'
import { getStripe } from '@/lib/providers/stripe'
import { appOrigin } from '@/lib/integration-config'

async function createSession(req: Request) {
  const { site } = await requireOwnerSite(selectorFromRequest(req))
  if (!site.stripe_customer_id) throw new ApiError(404, 'No billing account is attached to this website.')
  return getStripe().billingPortal.sessions.create({ customer: site.stripe_customer_id, return_url: `${appOrigin()}/dashboard?slug=${encodeURIComponent(site.slug)}&tab=settings` })
}

export async function POST(req: Request) {
  try { return NextResponse.json({ url: (await createSession(req)).url }) }
  catch (error) { return apiErrorResponse(error) }
}

// Existing links remain usable, but email query parameters grant no authority.
export async function GET(req: Request) {
  try { return NextResponse.redirect((await createSession(req)).url, 303) }
  catch (error) { return apiErrorResponse(error) }
}
