import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { requireOwnerSite, apiErrorResponse, ApiError } from '@/lib/owner-access'
import { getStripe } from '@/lib/providers/stripe'
import { appOrigin, requireCapability } from '@/lib/integration-config'
import { getBillingPlans } from '@/lib/billing-plans'
import { checkAvailability, normalizeDomain } from '@/lib/vercel-domains'
import { createOwnerCheckout } from '@/lib/checkout-session'
import { isSiteTemplate } from '@/components/templates/types'
import { assertStaticPublishingReady } from '@/lib/publishing-readiness'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const product = String(body.product || '')
    if (!['hosting', 'managed', 'change', 'rush', 'domain', 'hosting_and_domain'].includes(product)) throw new ApiError(400, 'Choose a valid service.')
    const { user, db, site } = await requireOwnerSite({ siteId: body.siteId, slug: body.slug })
    assertStaticPublishingReady(site)
    const stripe = getStripe()
    const origin = appOrigin()
    const metadata: Record<string, string> = { product, siteId: site.id, owner_id: user.id, slug: site.slug }
    if (product === 'change' || product === 'rush') throw new ApiError(409, 'Submit your change request for review before payment.')
    const subscription = ['hosting', 'hosting_and_domain', 'managed'].includes(product)
    const plan = subscription ? (await getBillingPlans(stripe)).find(item => item.key === (product === 'managed' ? 'managed' : 'hosting')) : undefined
    if (subscription && !plan) throw new ApiError(503, 'This plan is not available for purchase.')
    const hosting = plan?.includesHosting === true
    if (hosting && !isSiteTemplate(site.template)) throw new ApiError(409, 'Choose and review a current website design before activating hosting.')
    metadata.includes_hosting = String(hosting)
    metadata.plan = product === 'managed' ? 'managed' : 'hosting'
    if (hosting && ['active', 'pending_cancel'].includes(site.hosting_status)) throw new ApiError(409, 'Hosting is already active. Manage it in billing.')
    if (subscription && site.stripe_subscription_id && !['canceled', 'incomplete_expired'].includes(site.subscription_status || '')) throw new ApiError(409, 'A subscription already exists. Manage your current plan in billing.')
    const items: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    if (plan) items.push({ price: plan.priceId, quantity: 1 })
    if (product === 'domain' || product === 'hosting_and_domain') {
      if (product === 'domain' && !['active', 'pending_cancel'].includes(site.hosting_status)) throw new ApiError(409, 'Activate hosting before adding a domain.')
      requireCapability('domainPurchases')
      const domain = normalizeDomain(body.domain)
      if (!domain) throw new ApiError(400, 'Enter a supported domain.')
      if (site.custom_domain && site.custom_domain !== domain) throw new ApiError(409, 'This website already has a domain. Contact support to change it.')
      const [quote] = await checkAvailability([domain])
      if (!quote?.available || !quote.purchasePrice || !quote.retailPrice) throw new ApiError(409, 'This domain cannot currently be purchased. Search again.')
      metadata.domain = domain
      metadata.domainPurchasePrice = String(quote.purchasePrice)
      items.push({ price_data: { currency: 'usd', unit_amount: Math.round(quote.retailPrice * 100), product_data: { name: `One-year domain registration: ${domain}`, description: 'One-year registration. Renewal is not automatic; you will be contacted before expiry.' } }, quantity: 1 })
    }
    // Bind legacy sites after ownership was verified, before the billing event can arrive.
    if (!site.owner_id) {
      const { error } = await db.from('website_previews').update({ owner_id: user.id }).eq('id', site.id).is('owner_id', null)
      if (error) throw new ApiError(503, 'Could not confirm website ownership. Please try again.')
    }
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: subscription ? 'subscription' : 'payment',
      line_items: items,
      metadata,
      ...(site.stripe_customer_id ? { customer: site.stripe_customer_id } : { customer_email: user.email! }),
      success_url: `${origin}/dashboard?slug=${encodeURIComponent(site.slug)}&tab=settings&checkout=complete`,
      cancel_url: `${origin}/dashboard?slug=${encodeURIComponent(site.slug)}&tab=settings&checkout=cancelled`,
      ...(subscription ? { subscription_data: { metadata, ...(plan && plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : {}) }, payment_method_collection: 'always' as const } : { payment_intent_data: { metadata } }),
    }
    const session = await createOwnerCheckout(db, stripe, site, params)
    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error) { return apiErrorResponse(error) }
}
