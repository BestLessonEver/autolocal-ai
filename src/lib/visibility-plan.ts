import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from './owner-access'
import { reconcileVisibility, VISIBILITY_MEASUREMENT, type VisibilityInput, type VisibilityTask } from './visibility-insights'

type Row = Record<string, unknown>
function fromRow(row: Row): VisibilityTask {
  return { key: String(row.task_key), title: String(row.title), description: String(row.description), priority: row.priority as VisibilityTask['priority'], rank: Number(row.rank), evidence: row.evidence as string[] || [], source: row.source as VisibilityTask['source'], action: row.action as VisibilityTask['action'], revision: String(row.source_revision), inference: row.inference === true, context: row.context as VisibilityTask['context'] || {}, evidenceExpiresAt: row.evidence_expires_at as string | null, status: row.status as VisibilityTask['status'], completion: row.completion as VisibilityTask['completion'], updatedAt: String(row.updated_at) }
}
function publicTask(task: VisibilityTask) {
  return { key: task.key, title: task.title, description: task.description, priority: task.priority, evidence: task.evidence, source: task.source, action: task.action, revision: task.revision, inference: task.inference, status: task.status, completion: task.completion, updatedAt: task.updatedAt }
}
export async function readVisibilityPlan(db: SupabaseClient, site: Row, now = new Date().toISOString()) {
  const cutoff = new Date(Date.parse(now) - 86400000).toISOString()
  const [connections, prior, leads] = await Promise.all([
    db.from('google_connections').select('provider,status,profile,metrics,last_synced_at,error_code,owner_id').eq('site_id', site.id),
    db.from('visibility_tasks').select('*').eq('site_id', site.id).eq('owner_id', site.owner_id).order('updated_at', { ascending: false }).limit(50),
    db.from('site_leads').select('created_at', { count: 'exact' }).eq('site_id', site.id).eq('status', 'new').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(1),
  ])
  if (prior.error) throw new ApiError(503, 'Your visibility plan is unavailable. The visibility setup may need to be applied.')
  const input: VisibilityInput = {
    site, now,
    // A newly reassigned site must not inherit the previous owner's Google evidence.
    connections: connections.error ? [] : (connections.data || []).filter(connection => connection.owner_id === site.owner_id),
    leads: { available: !leads.error, unansweredCount: leads.error ? null : leads.count || 0, oldestAt: leads.data?.[0]?.created_at || null, observedAt: now },
  }
  const previous = (prior.data || []).map(fromRow), result = reconcileVisibility(input, previous)
  if (connections.error) {
    // A storage failure is not evidence that the owner has disconnected.
    result.open = result.open.filter(task => !['gbp', 'search_console'].includes(task.source.kind))
    result.sources.gbp = { state: 'unavailable', observedAt: null, label: 'Google Business Profile data could not load' }
    result.sources.search_console = { state: 'unavailable', observedAt: null, label: 'Google Search Console data could not load' }
    result.tasks = [...result.tasks.filter(task => !['gbp', 'search_console'].includes(task.source.kind)), ...previous.filter(task => ['gbp', 'search_console'].includes(task.source.kind))]
    result.history = result.history.filter(task => !['gbp', 'search_console'].includes(task.source.kind))
  }
  const backgroundChecksEnabled = process.env.AUTOLOCAL_ENABLE_VISIBILITY_WORKER === 'true'
  return { input, previous, ...result, response: { siteId: site.id, generatedAt: now, lastProcessedAt: site.visibility_last_checked_at || null, backgroundChecksEnabled, nextRefreshAt: backgroundChecksEnabled ? site.visibility_next_check_at || null : null, tasks: result.open.map(publicTask), history: result.history.map(publicTask), sources: result.sources, measurement: VISIBILITY_MEASUREMENT } }
}

export async function persistVisibilityPlan(db: SupabaseClient, siteId: string, ownerId: string, tasks: VisibilityTask[]) {
  const { error } = await db.rpc('reconcile_visibility_tasks', { p_site_id: siteId, p_owner_id: ownerId, p_tasks: tasks.map(task => ({ task_key: task.key, title: task.title, description: task.description, priority: task.priority, rank: task.rank, evidence: task.evidence, source: task.source, action: task.action, source_revision: task.revision, inference: task.inference, context: task.context, evidence_expires_at: task.evidenceExpiresAt, status: task.status, completion: task.completion, updated_at: task.updatedAt })) })
  if (error) throw new ApiError(503, 'Your visibility tasks could not be saved.')
}

export function ownerTaskOutcome(task: VisibilityTask, status: unknown, outcome: unknown, now: string, expectedRevision: unknown): VisibilityTask {
  if (expectedRevision !== task.revision) throw new ApiError(409, 'The evidence for this task changed. Refresh your plan before updating it.')
  if (!['open', 'dismissed', 'completed'].includes(String(status))) throw new ApiError(400, 'Choose a valid task status.')
  const note = typeof outcome === 'string' ? outcome.trim().slice(0, 1000) : ''
  if (status === 'completed' && note.length < 5) throw new ApiError(400, 'Briefly describe the action you took. It will be recorded as owner-reported completion.')
  return { ...task, status: status as VisibilityTask['status'], updatedAt: now, completion: status === 'completed' ? { method: 'owner_reported', at: now, note } : null }
}
