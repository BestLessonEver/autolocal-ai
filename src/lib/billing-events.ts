import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueIntegrationJob } from '@/lib/integration-jobs'
import { appOrigin } from '@/lib/integration-config'
import { queueDeployment } from '@/lib/deployment-service'

const id = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id || null
// The customer portal can schedule cancel_at while cancel_at_period_end is false.
const hasScheduledCancellation = (subscription: Stripe.Subscription) => subscription.cancel_at_period_end || (typeof subscription.cancel_at === 'number' && subscription.cancel_at > 0)
export function checkoutActions(product: string, includesHosting = false) {
  return { hosting: product === 'hosting' || product === 'hosting_and_domain' || (product === 'managed' && includesHosting), managed: product === 'managed', domain: product === 'domain' || product === 'hosting_and_domain' }
}
async function siteForEvent(db: SupabaseClient, metadata: Record<string, string> | null) {
  if (!metadata?.siteId || !metadata.owner_id) throw new Error('Billing event needs ownership review')
  const { data: site, error } = await db.from('website_previews').select('*').eq('id', metadata.siteId).single()
  if (error || !site || site.owner_id !== metadata.owner_id) throw new Error('Billing event does not match a verified website owner')
  return site
}
async function siteForSubscription(db: SupabaseClient, subscription: Stripe.Subscription) {
  if (subscription.metadata.siteId || subscription.metadata.owner_id) return siteForEvent(db, subscription.metadata)
  // Older subscriptions are accepted only by their exact, already stored provider ID.
  // Never infer account ownership from an email address or a shared Stripe customer.
  const { data: site, error } = await db.from('website_previews').select('*').eq('stripe_subscription_id', subscription.id).maybeSingle()
  if (error || !site) throw new Error('Legacy subscription requires an explicit website mapping')
  return site
}
async function save(db: SupabaseClient, siteId: string, values: Record<string, unknown>) {
  const { error } = await db.from('website_previews').update(values).eq('id', siteId)
  if (error) throw new Error('Could not save billing state')
}
export async function fulfillBillingEvent(db: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) return
    const site = await siteForEvent(db, session.metadata)
    if (!site) return
    const meta = session.metadata!
    const actions = checkoutActions(meta.product, meta.includes_hosting === 'true')
    if (!actions.hosting && !actions.domain && !actions.managed) throw new Error('Unsupported paid order requires review')
    const approved = site.checkout_site_snapshot
    if ((actions.hosting || actions.domain) && (!approved || site.checkout_request_key !== meta.checkout_request_key)) throw new Error('Paid website content requires approval review')
    const values: Record<string, unknown> = { stripe_customer_id: id(session.customer), checkout_event_id: event.id }
    if (actions.hosting || actions.managed) {
      if (!id(session.subscription)) throw new Error('Hosting subscription reference is missing')
      const subscription = await stripe.subscriptions.retrieve(id(session.subscription)!)
      const active = ['active', 'trialing'].includes(subscription.status)
      if (actions.hosting) values.hosting_status = active ? (hasScheduledCancellation(subscription) ? 'pending_cancel' : 'active') : subscription.status === 'canceled' ? 'cancelled' : 'past_due'
      values.plan = actions.managed ? 'managed' : 'hosting'; values.stripe_subscription_id = subscription.id
      values.subscription_status = subscription.status
      values.cancel_date = subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null
      values.trial_end = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
    }
    if (actions.domain) {
      if (!meta.domain || !Number.isFinite(Number(meta.domainPurchasePrice)) || Number(meta.domainPurchasePrice) <= 0) throw new Error('Domain quote reference is missing')
      values.custom_domain = meta.domain; values.domain_status = 'registering'; values.domain_provider = 'vercel'; values.domain_purchase_price = Number(meta.domainPurchasePrice)
    }
    await save(db, site.id, values)
    // The hosting branch also runs for bundled hosting + domain orders.
    if (actions.hosting && ['active', 'pending_cancel'].includes(String(values.hosting_status))) await queueDeployment(db, { ...site, ...values }, `checkout:${session.id}`, approved)
    if (actions.domain) await enqueueIntegrationJob(db, { kind: 'register_domain', siteId: site.id, key: `domain:${site.id}:${meta.domain}`, payload: { domain: meta.domain, expectedPrice: Number(meta.domainPurchasePrice), site: site.published_site_snapshot || approved } })
    const owner = await db.auth.admin.getUserById(meta.owner_id)
    if (owner.error || !owner.data.user?.email_confirmed_at || !owner.data.user?.email) throw new Error('Verified billing contact is unavailable')
    await enqueueIntegrationJob(db, { kind: 'email', siteId: site.id, key: `checkout:${session.id}:receipt`, payload: { to: owner.data.user.email, subject: 'Your AutoLocal order is confirmed', html: `<p>Your order is confirmed. Your dashboard shows your plan and any setup still in progress.</p><p>A queued website update is not live until its publishing status is verified.</p><p><a href="${appOrigin()}/dashboard?slug=${encodeURIComponent(site.slug)}&tab=settings">Open your dashboard</a></p>` } })
  } else if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const subscription = event.data.object as Stripe.Subscription
    const site = await siteForSubscription(db, subscription)
    if (event.created < Number(site.billing_event_created || 0)) return
    if (site.stripe_subscription_id && site.stripe_subscription_id !== subscription.id) return
    const hostingIncluded = subscription.metadata.plan !== 'managed' || subscription.metadata.includes_hosting === 'true'
    const cancelled = event.type === 'customer.subscription.deleted' || subscription.status === 'canceled'
    const active = ['active', 'trialing'].includes(subscription.status)
    const status = cancelled ? 'cancelled' : active ? hasScheduledCancellation(subscription) ? 'pending_cancel' : 'active' : 'past_due'
    const { data: updated, error } = await db.from('website_previews').update({ ...(hostingIncluded ? { hosting_status: status } : {}), stripe_subscription_id: subscription.id, subscription_status: subscription.status, stripe_customer_id: id(subscription.customer), cancel_date: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null, billing_event_created: event.created }).eq('id', site.id).lte('billing_event_created', event.created).select('id').maybeSingle()
    if (error) throw new Error('Could not save subscription state')
    if (!updated) return
    if (cancelled && hostingIncluded) {
      const jobId = await enqueueIntegrationJob(db, { kind: 'suspend_site', siteId: site.id, key: `billing:${event.id}:suspend` })
      await save(db, site.id, { requested_deployment_job_id: jobId })
    }
    else if (hostingIncluded && active && site.hosting_status === 'cancelled' && site.published_site_snapshot) await queueDeployment(db, { ...site, hosting_status: status }, `billing:${event.id}:restore`, site.published_site_snapshot)
  }
}
