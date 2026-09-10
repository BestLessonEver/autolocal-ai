import { validateInternalAuth } from '@/lib/internal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCapability, requireEnv, providerErrorResponse } from '@/lib/integration-config'
import { queueDeployment } from '@/lib/deployment-service'

// Refresh verified listing signals. Rewriting copy alone is not SEO improvement.
// Business descriptions and services stay owner-controlled.
export async function POST(req: Request) {
  const auth = validateInternalAuth(req)
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun !== false
    const key = requireEnv('GOOGLE_PLACES_API_KEY')
    if (!dryRun) requireCapability('publishing')
    const db = createAdminClient()
    let query = db.from('website_previews').select('*').eq('hosting_status', 'active').limit(25)
    if (typeof body.slug === 'string') query = query.eq('slug', body.slug)
    const { data: sites, error } = await query
    if (error) throw new Error('Website storage unavailable')
    if (!sites?.length) return Response.json({ message: 'No active sites to optimize', results: [] })
    const results = []
    for (const site of sites) {
      if (!site.google_place_id) { results.push({ slug: site.slug, changes: [], skipped: 'No Google listing selected' }); continue }
      try {
        const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(site.google_place_id)}`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' })
        if (!response.ok) throw new Error('Google listing refresh unavailable')
        const data = await response.json()
        const updates: Record<string, unknown> = {}
        if (Number.isFinite(data.rating) && data.rating !== site.google_rating) updates.google_rating = data.rating
        if (Number.isInteger(data.userRatingCount) && data.userRatingCount !== site.google_review_count) updates.google_review_count = data.userRatingCount
        const changes = Object.keys(updates)
        let jobId: string | undefined
        if (!dryRun && changes.length) {
          const saved = await db.from('website_previews').update({ ...updates, last_optimized_at: new Date().toISOString() }).eq('id', site.id)
          if (saved.error) throw new Error('Listing updates could not be saved')
          if (site.published_site_snapshot) jobId = await queueDeployment(db, { ...site, ...updates }, 'listing-refresh', { ...site.published_site_snapshot, ...updates })
        }
        results.push({ slug: site.slug, changes, ...(jobId ? { jobId, status: 'queued' } : {}) })
      } catch { results.push({ slug: site.slug, changes: [], error: 'This listing could not be refreshed. Its published data was left unchanged.' }) }
    }
    return Response.json({ summary: { dryRun, sitesProcessed: results.length, sitesChanged: results.filter(row => row.changes.length).length, sitesQueued: results.filter(row => 'jobId' in row).length, sitesRedeployed: 0 }, results, note: 'Listing refresh and queued publishing do not establish improved search rankings.' })
  } catch (error) { return providerErrorResponse(error) }
}
export async function GET() { return Response.json({ error: 'Use POST with an internal bearer token.' }, { status: 405 }) }
