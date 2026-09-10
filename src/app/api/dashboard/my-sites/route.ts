import {listOwnerSites,apiErrorResponse} from '@/lib/owner-access'
export async function GET() {
  try {
    const {sites}=await listOwnerSites()
    return Response.json(sites.map(site=>({id:site.id,slug:site.slug,business_name:site.business_name,city:site.city,state:site.state,template:site.template,hosting_status:site.hosting_status,subscription_status:site.subscription_status||null,has_billing:!!site.stripe_customer_id,hero_image_url:site.hero_image_url,created_at:site.created_at})))
  } catch(error) {return apiErrorResponse(error)}
}
