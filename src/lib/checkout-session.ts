import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/owner-access'
import { publishingSnapshot } from '@/lib/deployment-service'
import { assertStaticPublishingReady } from '@/lib/publishing-readiness'

type CheckoutSite = Record<string, unknown> & { id: string; checkout_request_key?: string | null; checkout_session_id?: string | null; checkout_event_id?: string | null }
/** A durable site-level intent survives client retries and provider response loss. */
export async function createOwnerCheckout(db: SupabaseClient, stripe: Stripe, site: CheckoutSite, params: Stripe.Checkout.SessionCreateParams) {
  assertStaticPublishingReady(site)
  let key = site.checkout_request_key || null
  if (site.checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(site.checkout_session_id)
    if (existing.status === 'open' && existing.url) {
      if (existing.metadata?.product === params.metadata?.product && existing.metadata?.domain === params.metadata?.domain) return existing
      await stripe.checkout.sessions.expire(existing.id)
    }
    if (existing.status === 'complete') {
      const event = site.checkout_event_id ? await db.from('billing_events').select('status').eq('provider_event_id', site.checkout_event_id).maybeSingle() : null
      if (!event || event.error || event.data?.status !== 'processed') throw new ApiError(409, 'Your payment is being confirmed. Check your website billing status before starting another order.')
    }
    // An expired checkout can safely release its intent without reusing a Stripe key.
    const released = await db.from('website_previews').update({ checkout_request_key: null, checkout_session_id: null, checkout_event_id: null }).eq('id', site.id).eq('checkout_session_id', site.checkout_session_id).select('id').maybeSingle()
    if (released.error || !released.data) throw new ApiError(409, 'Checkout changed. Please reload your workspace.')
    key = null
  }
  if (!key) {
    key = randomUUID()
    const claimed = await db.from('website_previews').update({ checkout_request_key: key, checkout_site_snapshot: publishingSnapshot(site) }).eq('id', site.id).is('checkout_request_key', null).select('id').maybeSingle()
    if (claimed.error) throw new ApiError(503, 'Could not save checkout progress. Please try again.')
    if (!claimed.data) throw new ApiError(409, 'Checkout is already starting. Please try again in a moment.')
  }
  // Identical retries reuse the provider operation, including a timeout after creation.
  // A different request with an unfinished key fails provider parameter comparison.
  const session = await stripe.checkout.sessions.create({ ...params, metadata: { ...params.metadata, checkout_request_key: key } }, { idempotencyKey: `site-checkout:${site.id}:${key}` })
  const saved = await db.from('website_previews').update({ checkout_session_id: session.id }).eq('id', site.id).eq('checkout_request_key', key)
  if (saved.error) throw new ApiError(503, 'Checkout was created but confirmation could not be saved. Please retry to recover it.')
  return session
}
