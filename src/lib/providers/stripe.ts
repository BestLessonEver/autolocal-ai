import Stripe from 'stripe'
import { requireCapability, requireEnv } from '@/lib/integration-config'

export function getStripe() {
  requireCapability('billing')
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), { maxNetworkRetries: 2, timeout: 20_000 })
}
