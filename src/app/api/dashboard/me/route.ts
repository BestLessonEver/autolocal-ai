import {appOrigin} from '@/lib/integration-config'
import {ownerSetupHealth,type ProviderHealthRow} from '@/lib/owner-setup-health'
import {requireOwnerSite,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function GET(request:Request) {
  try {
  const {site,db,user}=await requireOwnerSite(selectorFromRequest(request))
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0)
  const {count:changesThisMonth,error}=await db.from('change_requests').select('id',{count:'exact',head:true}).eq('preview_id',site.id).gte('created_at',monthStart.toISOString())
  if(error) throw new ApiError(503,'Your dashboard is temporarily unavailable.')
  const connections=await db.from('google_connections').select('provider,status,resource_name,last_synced_at,error_code').eq('site_id',site.id).eq('owner_id',user.id)
  const setupHealth=ownerSetupHealth(site,connections.error?null:connections.data as ProviderHealthRow[])
  const plan = site.plan || 'starter'
  const unlimited = plan === 'living'
  const used = changesThisMonth || 0
  const freeRemaining = unlimited ? Infinity : Math.max(0, 2 - used)

  return Response.json({
    id: site.id,
    subscription_status: site.subscription_status || null,
    has_billing: !!site.stripe_customer_id,
    service_areas: site.service_areas || [],
    business_facts: site.business_facts || {},
    faq: site.faq || [],
    contact_name: site.contact_name || null,
    show_address: site.show_address !== false,
    setup_health: setupHealth,
    business_name: site.business_name,
    slug: site.slug,
    tagline: site.tagline,
    category: site.category,
    city: site.city,
    state: site.state,
    phone: site.phone,
    email: site.contact_email || site.email,
    address: site.address,
    google_rating: site.google_rating,
    google_review_count: site.google_review_count || 0,
    status: site.status,
    template: site.template,
    hero_image_url: site.hero_image_url,
    services: site.services || [],
    hours: site.hours,
    preview_url: `${appOrigin()}/preview/${site.slug}`,
    website_url: site.deployment_verified_at ? site.website_current : null,
    website_current: site.website_current || null,
    view_count: site.view_count || 0,
    created_at: site.created_at,
    plan,
    hosting_status: site.hosting_status || 'preview',
    custom_domain: site.custom_domain || null,
    changes_this_month: used,
    free_changes_remaining: freeRemaining,
    unlimited_changes: unlimited,
    logo_url: site.logo_url,
    brand_color_primary: site.brand_color_primary || '#0f172a',
    brand_color_secondary: site.brand_color_secondary || '#1e293b',
    brand_color_accent: site.brand_color_accent || '#3b82f6',
    description: site.description || null,
    contact_email: site.contact_email || null,
    preview_id: site.id,
    gallery_images: site.gallery_images || [],
    hero_crop: site.hero_crop ?? 50,
    site_mode: site.site_mode || 'business',
  })
  } catch(error) { return apiErrorResponse(error) }
}
