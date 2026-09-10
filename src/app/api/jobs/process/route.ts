import { validateInternalAuth } from '@/lib/internal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConfigurationError, requireCapability } from '@/lib/integration-config'
import { JobError, retryState, type IntegrationJob } from '@/lib/integration-jobs'
import { runDeployment, runDomainRegistration } from '@/lib/deployment-service'
import { sendEmail } from '@/lib/mailer'
export const maxDuration = 300

export async function POST(req: Request) {
  const auth = validateInternalAuth(req)
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
  try {
    const db = createAdminClient()
    const { data: jobs, error } = await db.rpc('claim_integration_jobs', { p_limit: 1 })
    if (error) return Response.json({ error: 'Job storage is unavailable. Apply the reviewed database migration.' }, { status: 503 })
    const results = []
    for (const job of (jobs || []) as IntegrationJob[]) {
      try {
        let result: Record<string, unknown>
        if (job.kind === 'deploy' || job.kind === 'suspend_site') result = await runDeployment(db, job)
        else if (job.kind === 'register_domain') result = await runDomainRegistration(db, job)
        else if (job.kind === 'email') {
          requireCapability('email')
          const sent = await sendEmail(String(job.payload.to), String(job.payload.subject), String(job.payload.html), { idempotencyKey: job.idempotency_key })
          if (!sent.success) throw new JobError('Notification delivery is incomplete')
          result = { messageId: sent.messageId }
        } else throw new JobError('Unknown job type', false)
        const saved = await db.from('integration_jobs').update({ status: 'succeeded', result, error: null, claimed_at: null, updated_at: new Date().toISOString() }).eq('id', job.id)
        if (saved.error) throw new JobError('Could not confirm job completion')
        results.push({ id: job.id, status: 'succeeded' })
      } catch (failure) {
        const state = failure instanceof ConfigurationError
          ? { ...retryState(failure, 1), attempts: Math.max(0, job.attempts - 1), error: failure.message, next_attempt_at: new Date(Date.now() + 3600_000).toISOString() }
          : retryState(failure, job.attempts)
        const saved = await db.from('integration_jobs').update(state).eq('id', job.id)
        if (saved.error) return Response.json({ error: 'Could not save retry state; the worker will reclaim expired jobs.' }, { status: 503 })
        if (job.site_id && (job.kind === 'deploy' || job.kind === 'suspend_site')) await db.from('website_previews').update({ deploy_status: state.status === 'retry' ? 'verifying' : 'failed', deploy_error: state.error }).eq('id', job.site_id).eq('requested_deployment_job_id', job.id)
        if (job.site_id && job.kind === 'register_domain' && state.status !== 'retry') await db.from('website_previews').update({ domain_status: state.status === 'needs_review' ? 'needs_review' : 'failed' }).eq('id', job.site_id)
        results.push({ id: job.id, status: state.status })
      }
    }
    return Response.json({ processed: results.length, results })
  } catch { return Response.json({ error: 'The job worker is temporarily unavailable.' }, { status: 503 }) }
}
export async function GET() { return Response.json({ error: 'Use an authenticated POST to process jobs.' }, { status: 405 }) }
