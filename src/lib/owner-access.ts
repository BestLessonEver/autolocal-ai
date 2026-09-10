import {ConfigurationError} from '@/lib/integration-config'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export type OwnerContext = { user: User; db: SupabaseClient }
export type SiteSelector = { siteId?: string; slug?: string }

export function ownsSite(user: Pick<User, 'id' | 'email' | 'email_confirmed_at'>, site: { owner_id?: string | null; email?: string | null }) {
  if (!user.email_confirmed_at || !user.email) return false
  if (site.owner_id) return site.owner_id === user.id
  return !!site.email && site.email.trim().toLowerCase() === user.email.trim().toLowerCase()
}

export async function bindVerifiedSiteOwner(db:SupabaseClient,site:{id:string;owner_id?:string|null;email?:string|null},user:Pick<User,'id'|'email'|'email_confirmed_at'>){
 if(!ownsSite(user,site))throw new ApiError(404,'Website not found.')
 if(site.owner_id)return
 // Match the exact observed legacy record as well as its still-null owner.
 // A concurrent email or ownership change must never be overwritten.
 const {data,error}=await db.from('website_previews').update({owner_id:user.id}).eq('id',site.id).is('owner_id',null).eq('email',site.email).select('id,owner_id').maybeSingle()
 if(error)throw new ApiError(503,'Business ownership could not be confirmed. Please try again.')
 if(!data||data.owner_id!==user.id)throw new ApiError(409,'Business ownership changed. Reload your workspace before connecting Google.')
 site.owner_id=user.id
}

export async function requireUser(): Promise<OwnerContext> {
  const auth = await createServerSupabaseClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) throw new ApiError(401, 'Sign in to continue.')
  if (!user.email || !user.email_confirmed_at) throw new ApiError(403, 'Verify your email before managing a business.')
  return { user, db: createAdminClient() }
}

export async function listOwnerSites(context?: OwnerContext) {
  const { user, db } = context || await requireUser()
  const { data: owned, error } = await db.from('website_previews').select('*').eq('owner_id', user.id).order('created_at', { ascending: false })
  if (error) throw new ApiError(503, 'Your websites are temporarily unavailable. Please try again.')
  // Existing records can be accessed only through the verified original email.
  // Never replace an existing owner_id or claim using an email from a request.
  const escapedEmail = user.email!.replace(/[\\%_]/g, '\\$&')
  const { data: legacy, error: legacyError } = await db.from('website_previews').select('*').is('owner_id', null).ilike('email', escapedEmail).order('created_at', { ascending: false })
  if (legacyError) throw new ApiError(503, 'Your websites are temporarily unavailable. Please try again.')
  const sites = [...(owned || []), ...(legacy || [])].filter(site => ownsSite(user, site)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return { user, db, sites }
}

export async function requireOwnerSite(selector: SiteSelector = {}, context?: OwnerContext) {
  const { user, db } = context || await requireUser()
  if (!selector.siteId && !selector.slug) {
    const { sites } = await listOwnerSites({ user, db })
    if (!sites.length) throw new ApiError(404, 'No website found for this account.')
    return { user, db, site: sites[0] }
  }
  if (selector.siteId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(selector.siteId)) throw new ApiError(400, 'Invalid website.')
  let query = db.from('website_previews').select('*')
  query = selector.siteId ? query.eq('id', selector.siteId) : query.eq('slug', selector.slug!)
  const { data: site, error } = await query.maybeSingle()
  if (error) throw new ApiError(503, 'Your website is temporarily unavailable. Please try again.')
  if (!site || !ownsSite(user, site)) throw new ApiError(404, 'Website not found.')
  return { user, db, site }
}

export function selectorFromRequest(request: Request): SiteSelector {
  const params = new URL(request.url).searchParams
  return { siteId: params.get('siteId') || undefined, slug: params.get('slug') || undefined }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ConfigurationError) return Response.json({error:'This service needs setup before it can be used.',code:error.code},{status:503})
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof SyntaxError) return Response.json({ error: 'Invalid request. Please check your information.' }, { status: 400 })
  console.error('[api] Request failed:', error instanceof Error ? error.message : 'Unknown failure')
  return Response.json({ error: 'Service temporarily unavailable. Please try again.' }, { status: 503 })
}
