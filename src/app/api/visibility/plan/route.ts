import { bindVerifiedSiteOwner, requireOwnerSite, selectorFromRequest, apiErrorResponse, ApiError } from '@/lib/owner-access'
import { readVisibilityPlan, persistVisibilityPlan, ownerTaskOutcome } from '@/lib/visibility-plan'

export async function GET(request: Request) {
  try { const { db, site } = await requireOwnerSite(selectorFromRequest(request)); return Response.json((await readVisibilityPlan(db, site)).response) }
  catch (error) { return apiErrorResponse(error) }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json(), { db, site, user } = await requireOwnerSite({ siteId: body.siteId })
    if (typeof body.siteId !== 'string' || typeof body.taskKey !== 'string') throw new ApiError(400, 'Choose a website and task.')
    await bindVerifiedSiteOwner(db, site, user)
    const plan = await readVisibilityPlan(db, site), task = plan.tasks.find(item => item.key === body.taskKey)
    if (!task) throw new ApiError(404, 'This task is no longer available. Refresh your plan.')
    const updated = ownerTaskOutcome(task, body.status, body.outcome, new Date().toISOString(), body.expectedRevision)
    // First materialize this exact derived task, then perform the explicit owner transition.
    await persistVisibilityPlan(db, site.id, site.owner_id, [task])
    const { data, error } = await db.from('visibility_tasks').update({ status: updated.status, completion: updated.completion, updated_at: updated.updatedAt, owner_updated_at: updated.updatedAt }).eq('site_id', site.id).eq('owner_id', site.owner_id).eq('task_key', task.key).eq('source_revision', task.revision).select('id').maybeSingle()
    if (error) throw new ApiError(503, 'The task status could not be saved.')
    if (!data) throw new ApiError(409, 'The evidence changed during this update. Refresh your plan and review the task again.')
    return Response.json({ success: true, status: updated.status, completion: updated.completion })
  } catch (error) { return apiErrorResponse(error) }
}
