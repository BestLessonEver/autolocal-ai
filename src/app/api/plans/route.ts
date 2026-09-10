import { getBillingPlans } from '@/lib/billing-plans'
import { integrationHealth } from '@/lib/integration-config'
export async function GET() {
  const health = integrationHealth()
  if (!health.billing.enabled || !process.env.STRIPE_SECRET_KEY) return Response.json({ available: false, plans: [], reason: 'Online plans are not enabled yet.' })
  try { const plans = await getBillingPlans(); return Response.json({ available: plans.length > 0, plans }) }
  catch { return Response.json({ available: false, plans: [], reason: 'Plan information is temporarily unavailable.' }, { status: 503 }) }
}
