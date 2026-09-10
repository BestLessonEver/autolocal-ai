import { validateInternalAuth } from '@/lib/internal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { readVisibilityPlan, persistVisibilityPlan } from '@/lib/visibility-plan'
import { syncGoogleConnection } from '@/lib/google-sync'
import type { GoogleConnection } from '@/lib/google-connections'

export const maxDuration = 60
export async function POST(request: Request) {
  const auth = validateInternalAuth(request)
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
  if (process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER !== 'true') return Response.json({ error: 'Scheduled visibility checks are not enabled.' }, { status: 503 })
  const db = createAdminClient()
  const { error: expiryError } = await db.rpc('expire_google_cached_content')
  if (expiryError) return Response.json({ error: 'Google data retention maintenance could not finish.' }, { status: 503 })
  const { data: claims, error } = await db.rpc('claim_visibility_site')
  if (error) return Response.json({ error: 'Visibility scheduling storage is unavailable.' }, { status: 503 })
  if (!claims?.length) return Response.json({ processed: 0 })
  const siteId = claims[0].id
  try {
    const { data: site, error: siteError } = await db.from('website_previews').select('*').eq('id', siteId).single()
    if (siteError || !site) throw new Error('Website unavailable')
    const { data: connections, error: connectionError } = await db.from('google_connections').select('*').eq('site_id', siteId).eq('owner_id', site.owner_id).eq('status', 'connected')
    if (connectionError) throw new Error('Connections unavailable')
    const due = (connections || []).filter((row: GoogleConnection) => row.resource_name && (!row.last_synced_at || Date.parse(row.last_synced_at) <= Date.now() - (row.error_code ? 6 * 3600000 : 86400000))).slice(0, 2)
    const refreshed = await Promise.allSettled(due.map((row: GoogleConnection) => syncGoogleConnection(db, row)))
    const plan = await readVisibilityPlan(db, site)
    await persistVisibilityPlan(db, siteId, site.owner_id, plan.tasks)
    const refreshFailures = refreshed.filter(item => item.status === 'rejected' || item.value.partial).length
    const { error: finishError } = await db.from('website_previews').update({ visibility_last_checked_at: new Date().toISOString(), visibility_claimed_at: null, visibility_next_check_at: new Date(Date.now() + (refreshFailures ? 6 * 3600000 : 86400000)).toISOString() }).eq('id', siteId)
    if (finishError) throw new Error('Schedule unavailable')
    return Response.json({ processed: 1, refreshed: refreshed.filter(item => item.status === 'fulfilled' && !item.value.partial).length, refreshFailures, openTasks: plan.open.length })
  } catch {
    await db.from('website_previews').update({ visibility_claimed_at: null, visibility_next_check_at: new Date(Date.now() + 6 * 3600000).toISOString() }).eq('id', siteId)
    return Response.json({ error: 'The visibility check could not finish. It will retry later.' }, { status: 503 })
  }
}
