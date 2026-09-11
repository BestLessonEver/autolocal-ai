import { createHash, randomUUID } from 'node:crypto'
import { ApiError, requireOwnerSite, type OwnerContext } from '@/lib/owner-access'
import { cleanText } from '@/lib/lead-intake'
import { siteUpdates, normalizeCategory, safeUrl } from '@/lib/site-content'
import { googleImportIntake, googleOwnerUpdates, sanitizeGoogleOverrides, usesGoogleListing } from '@/lib/google-site'

function object(value: unknown): Record<string,unknown> {
  return value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{}
}
function intakeResult(slug: string) { return {success:true,slug,previewUrl:'/preview/'+slug} }

function googleSiteIdentity(ownerId: string, placeId: string) {
  // A stable custom UUID makes concurrent first saves converge through the
  // existing primary key. Slugs remain independently random and readable.
  const bytes=createHash('sha256').update(`autolocal:google-import:v1\0${ownerId}\0${placeId}`).digest().subarray(0,16)
  bytes[6]=(bytes[6]&0x0f)|0x80;bytes[8]=(bytes[8]&0x3f)|0x80
  const hex=bytes.toString('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

async function saveGoogleIntake(body: Record<string,unknown>, context: OwnerContext) {
  const imported=googleImportIntake(body)
  const placeId=String(imported.google_place_id)
  const findExisting=async()=>{
    const {data,error}=await context.db.from('website_previews').select('*').eq('owner_id',context.user.id).eq('google_place_id',placeId).order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw new ApiError(503,'Your saved website could not be checked. Please try again.')
    return data as Record<string,unknown>|null
  }
  const updateExisting=async(site:Record<string,unknown>)=>{
    const existingFacts=object(site.business_facts)
    const nextOverrides=sanitizeGoogleOverrides(object(imported.business_facts).googleOverrides)
    const {existingWebsite,...fields}=nextOverrides
    const facts:Record<string,unknown>={...existingFacts,...(existingWebsite!==undefined?{existingWebsite}:{})}
    if(usesGoogleListing(site)) facts.googleOverrides={...sanitizeGoogleOverrides(existingFacts.googleOverrides),...nextOverrides}
    const updates={...fields,...(imported.template!==undefined?{template:imported.template}:{}),...(Object.keys(facts).length?{business_facts:facts}:{}),updated_at:new Date().toISOString()}
    const {data,error}=await context.db.from('website_previews').update(updates).eq('id',site.id).eq('owner_id',context.user.id).select('id').maybeSingle()
    if(error)throw new ApiError(503,'Your website changes could not be saved. Please try again.')
    if(!data)throw new ApiError(409,'Website ownership changed. Please reload your workspace.')
    return intakeResult(String(site.slug))
  }
  const requestedSlug=cleanText(body.slug,100)
  if(requestedSlug){
    const {site}=await requireOwnerSite({slug:requestedSlug},context)
    if(site.google_place_id!==placeId)throw new ApiError(409,'This website uses a different listing. Start a new preview for the other business.')
    return updateExisting(site)
  }
  const existing=await findExisting()
  if(existing)return updateExisting(existing)
  const businessName=String(imported.business_name)
  const stem=businessName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70).replace(/-$/,'')||'my-business'
  const category=normalizeCategory(imported.category)
  const template=imported.template||(['salon','fitness','restaurant'].includes(category)?'atelier':category==='contractor'?'summit':'ledger')
  const id=googleSiteIdentity(context.user.id,placeId)
  for(let attempt=0;attempt<3;attempt++){
    const slug=`${stem}-${randomUUID().replace(/-/g,'').slice(0,10)}`
    const {error}=await context.db.from('website_previews').insert({
      ...imported,id,slug,category,template,owner_id:context.user.id,email:context.user.email,
      hosting_status:'preview',status:'published',services:imported.services||[],reviews:[],reviews_verified:false,
      brand_color_primary:imported.brand_color_primary||'#173c32',brand_color_secondary:imported.brand_color_secondary||'#f3f1e9',brand_color_accent:imported.brand_color_accent||'#f4a340',
    })
    if(!error)return intakeResult(slug)
    if(error.code!=='23505')throw new ApiError(503,'Your preview could not be saved. Please try again.')
    // A concurrent request may have saved this same owner's listing while this
    // request was inserting. Reuse it; an unrelated slug collision gets a retry.
    const winner=await findExisting()
    if(winner)return updateExisting(winner)
  }
  throw new ApiError(503,'Your preview could not be saved. Please try again.')
}

export async function saveOwnedIntake(body: Record<string,unknown>, context: OwnerContext) {
  if(body.googleImport===true)return saveGoogleIntake(body,context)
  const businessName=cleanText(body.businessName??body.business_name,200)
  if(!businessName) throw new ApiError(400,'Business name is required.')
  let updates=siteUpdates({
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
    updates=googleOwnerUpdates(site,updates)
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
