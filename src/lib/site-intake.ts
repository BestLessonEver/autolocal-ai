import { ApiError, requireOwnerSite, type OwnerContext } from '@/lib/owner-access'
import { cleanText } from '@/lib/lead-intake'
import { siteUpdates, normalizeCategory, safeUrl } from '@/lib/site-content'
export async function saveOwnedIntake(body: Record<string,unknown>, context: OwnerContext) {
  const businessName=cleanText(body.businessName??body.business_name,200)
  if(!businessName) throw new ApiError(400,'Business name is required.')
  const updates=siteUpdates({
    ...body,business_name:businessName,contact_email:body.contactEmail??body.contact_email,
    logo_url:body.logoUrl??body.logo_url,gallery_images:body.photoUrls??body.gallery_images,
    business_facts:body.businessFacts??body.business_facts,service_areas:body.serviceAreas??body.service_areas,
  })
  const category=normalizeCategory(body.category)
  if(body.googlePlaceId!==undefined) updates.google_place_id=cleanText(body.googlePlaceId,250)||null
  // Only verified deployment completion may change website_current. Intake's
  // external website is a business fact, including when editing legacy sites.
  const facts={...(updates.business_facts as Record<string,unknown>||{})}
  if(body.website!==undefined)facts.existingWebsite=safeUrl(body.website)
  else if(facts.existingWebsite!==undefined)facts.existingWebsite=safeUrl(facts.existingWebsite)
  if(body.category!==undefined)facts.categoryLabel=cleanText(body.category,100)
  if(Object.keys(facts).length)updates.business_facts=facts
  const requestedSlug=cleanText(body.slug,100)
  if(requestedSlug) {
    const {site}=await requireOwnerSite({slug:requestedSlug},context)
    if(updates.business_facts)updates.business_facts={...(site.business_facts&&typeof site.business_facts==='object'?site.business_facts:{}),...(updates.business_facts as Record<string,unknown>)}
    const {error}=await context.db.from('website_previews').update({...updates,owner_id:context.user.id,updated_at:new Date().toISOString()}).eq('id',site.id)
    if(error) throw new ApiError(503,'Your website changes could not be saved.')
    return {success:true,slug:site.slug,previewUrl:'/preview/'+site.slug}
  }
  const slug=[businessName,cleanText(body.city,100)].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,85)
  if(!slug) throw new ApiError(400,'Please use a business name containing letters or numbers.')
  const template=body.template||(['salon','fitness','restaurant'].includes(category)?'atelier':category==='contractor'?'summit':'ledger')
  const {error}=await context.db.from('website_previews').insert({
    ...updates,slug,category,template,owner_id:context.user.id,email:context.user.email,
    hosting_status:'preview',status:'published',services:updates.services||[],reviews:[],reviews_verified:false,
    brand_color_primary:updates.brand_color_primary||'#173c32',brand_color_secondary:updates.brand_color_secondary||'#f3f1e9',brand_color_accent:updates.brand_color_accent||'#f4a340',
  })
  if(error?.code==='23505') throw new ApiError(409,'A website with that business name and city already exists. Open it from your dashboard or use a distinct location.')
  if(error) throw new ApiError(503,'Your preview could not be saved. Please try again.')
  return {success:true,slug,previewUrl:'/preview/'+slug}
}
