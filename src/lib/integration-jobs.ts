import type { SupabaseClient } from '@supabase/supabase-js'

export type IntegrationJob = {
  id: string; kind: string; site_id: string | null; payload: Record<string, unknown>;
  attempts: number; result: Record<string, unknown> | null; idempotency_key: string
}

export class JobError extends Error {
  constructor(message: string, public retryable = true, public needsReview = false) { super(message) }
}

export async function enqueueIntegrationJob(db: SupabaseClient, input: {
  kind: 'deploy' | 'register_domain' | 'suspend_site' | 'email'; siteId: string; key: string; payload?: Record<string, unknown>
}) {
  const row = { kind: input.kind, site_id: input.siteId, payload: input.payload || {}, idempotency_key: input.key, status: 'pending' }
  const { data, error } = await db.from('integration_jobs').upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle()
  if (error) throw new Error('Could not queue the website update')
  if (data) return data.id as string
  const existing = await db.from('integration_jobs').select('id').eq('idempotency_key', input.key).single()
  if (existing.error || !existing.data) throw new Error('Could not confirm the queued website update')
  return existing.data.id as string
}

export function retryState(error: unknown, attempts: number, now = Date.now()) {
  const review = error instanceof JobError && error.needsReview
  const retry = !review && !(error instanceof JobError && !error.retryable) && attempts < 5
  return {
    status: review ? 'needs_review' : retry ? 'retry' : 'failed',
    error: error instanceof JobError ? error.message : 'Provider operation failed. Retry or review the integration connection.',
    next_attempt_at: new Date(now + Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1)) * 1000).toISOString(),
    claimed_at: null,
    updated_at: new Date(now).toISOString(),
  }
}
