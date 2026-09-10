import { validateInternalAuth } from '@/lib/internal-auth'
import { createAdminClient } from '@/lib/supabase/admin'

/** Read-only operation status. Payloads, addresses, provider tokens and contact PII stay private. */
export async function GET(request: Request) {
  const auth = validateInternalAuth(request)
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
  try {
    const db = createAdminClient()
    const [jobs, notifications] = await Promise.all([
      db.from('integration_jobs').select('id,site_id,kind,status,attempts,next_attempt_at,updated_at,error').in('status', ['pending','processing','retry','failed','needs_review']).order('created_at', { ascending: true }).limit(100),
      db.from('lead_notifications').select('id,status,attempts,next_attempt_at,claimed_at,error').in('status', ['pending','processing','retry','failed']).order('created_at', { ascending: true }).limit(100),
    ])
    if (jobs.error || notifications.error) return Response.json({ error: 'Operation status is unavailable. Verify the database migrations.' }, { status: 503 })
    return Response.json({ jobs: jobs.data, notifications: notifications.data, limit: 100, checkedAt: new Date().toISOString() })
  } catch { return Response.json({ error: 'Operation status is not configured.' }, { status: 503 }) }
}
