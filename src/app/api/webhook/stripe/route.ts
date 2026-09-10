import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/providers/stripe'
import { requireEnv, providerErrorResponse } from '@/lib/integration-config'
import { createAdminClient } from '@/lib/supabase/admin'
import { fulfillBillingEvent } from '@/lib/billing-events'

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  let stripe: Stripe
  let event: Stripe.Event
  try {
    stripe = getStripe()
    const secret = requireEnv('STRIPE_WEBHOOK_SECRET')
    const body = await req.text()
    try { event = stripe.webhooks.constructEvent(body, signature, secret) }
    catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }) }
  } catch (error) { return providerErrorResponse(error) }
  let db
  try { db = createAdminClient() } catch { return NextResponse.json({ error: 'Billing storage is not configured.' }, { status: 503 }) }
  const { data: claim, error } = await db.rpc('claim_billing_event', { p_event_id: event.id, p_event_type: event.type })
  if (error) return NextResponse.json({ error: 'Billing event could not be recorded. Retry delivery.' }, { status: 503 })
  if (claim === 'processed') return NextResponse.json({ received: true, duplicate: true })
  if (claim !== 'claimed') return NextResponse.json({ error: 'Event is already processing. Retry delivery.' }, { status: 409 })
  try {
    await fulfillBillingEvent(db, stripe, event)
    const saved = await db.from('billing_events').update({ status: 'processed', processed_at: new Date().toISOString(), error: null }).eq('provider_event_id', event.id)
    if (saved.error) throw new Error('Could not confirm billing completion')
    return NextResponse.json({ received: true })
  } catch {
    await db.from('billing_events').update({ status: 'failed', error: 'Fulfillment failed; check ownership, configuration and queued jobs before retry.' }).eq('provider_event_id', event.id)
    // A non-2xx response lets Stripe retry after transient failures.
    return NextResponse.json({ error: 'Fulfillment is incomplete. Retry delivery.' }, { status: 503 })
  }
}
