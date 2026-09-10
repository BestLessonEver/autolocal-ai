import type Stripe from 'stripe'
import { getStripe } from '@/lib/providers/stripe'

export type BillingPlan = { key: 'hosting' | 'managed'; priceId: string; name: string; amount: number; currency: string; interval: 'month'; intervalCount: number; scope: string; includesHosting: boolean; trialDays: number }
export async function getBillingPlans(stripe: Stripe = getStripe()): Promise<BillingPlan[]> {
  const definitions = [{ key: 'hosting' as const, id: process.env.STRIPE_HOSTING_PRICE_ID }, { key: 'managed' as const, id: process.env.STRIPE_MANAGED_PRICE_ID }].filter(item => item.id)
  const plans = await Promise.all(definitions.map(async definition => {
    const price = await stripe.prices.retrieve(definition.id!, { expand: ['product'] })
    if (!price.active || price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 || price.unit_amount === null || price.unit_amount <= 0) return null
    const product = typeof price.product === 'string' || 'deleted' in price.product ? null : price.product
    if (!product?.active) return null
    if (definition.key === 'managed' && !(product.metadata.scope || product.description || '').trim()) return null
    const trialDays = Number(product.metadata.trial_days || 0)
    if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 30) return null
    return { trialDays, key: definition.key, priceId: price.id, name: product.name, amount: price.unit_amount, currency: price.currency, interval: 'month' as const, intervalCount: price.recurring.interval_count, scope: product.metadata.scope || product.description || '', includesHosting: definition.key === 'hosting' || product.metadata.includes_hosting === 'true' }
  }))
  return plans.filter((plan): plan is BillingPlan => plan !== null)
}
