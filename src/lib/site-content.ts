import { ApiError } from '@/lib/owner-access'
import { cleanText, validEmail } from '@/lib/lead-intake'
export function safeUrl(value: unknown): string | null {
  const text=cleanText(value,2048)
  if (!text) return null
  try {const url=new URL(text);if (url.protocol!=='https:' && url.protocol!=='http:') throw new Error();return url.toString()} catch {throw new ApiError(400,'Enter a valid website or image URL.')}
}
export function normalizeCategory(value: unknown) {
  const category=cleanText(value,100).toLowerCase()
  const onboarding:Record<string,string>={'home services':'contractor','beauty & wellness':'salon','health & fitness':'fitness','food & hospitality':'restaurant'}
  if(onboarding[category])return onboarding[category]
  if (['salon','dental','fitness','restaurant','contractor','general'].includes(category)) return category
  if (/salon|spa|beauty|barber|hair|nail/.test(category)) return 'salon'
  if (/dental|dentist|orthodont/.test(category)) return 'dental'
  if (/gym|yoga|fitness|training/.test(category)) return 'fitness'
  if (/restaurant|cafe|bakery|food/.test(category)) return 'restaurant'
  if (/plumb|electric|roof|hvac|landscap|repair|clean|contractor/.test(category)) return 'contractor'
  return 'general'
}
export function siteUpdates(body: Record<string,unknown>) {
  const updates:Record<string,unknown>={}
  const textFields:Record<string,number>={business_name:200,tagline:250,description:4000,phone:50,address:250,city:100,state:100,contact_name:150,image_caption:300}
  for (const [field,limit] of Object.entries(textFields)) if (body[field]!==undefined) updates[field]=cleanText(body[field],limit)||null
  if (body.business_name!==undefined && !updates.business_name) throw new ApiError(400,'Business name is required.')
  if (body.contact_email!==undefined || body.display_email!==undefined) {
    const email=cleanText(body.contact_email??body.display_email,254).toLowerCase()
    if (email && !validEmail(email)) throw new ApiError(400,'Enter a valid public contact email.')
    updates.contact_email=email||null
  }
  for(const field of ['hero_image_url','logo_url']) if(body[field]!==undefined) updates[field]=safeUrl(body[field])
  if(body.template!==undefined) {
    if(!['summit','atelier','ledger'].includes(String(body.template))) throw new ApiError(400,'Choose a supported website design.')
    updates.template=body.template
  }
  if(body.category!==undefined) updates.category=normalizeCategory(body.category)
  if(body.hero_crop!==undefined) {
    const crop=Number(body.hero_crop)
    if(!Number.isFinite(crop)||crop<0||crop>100) throw new ApiError(400,'Invalid image position.')
    updates.hero_crop=crop
  }
  if(body.site_mode!==undefined) {
    if(!['business','individual'].includes(String(body.site_mode))) throw new ApiError(400,'Invalid website mode.')
    updates.site_mode=body.site_mode
  }
  if(body.show_address!==undefined) updates.show_address=body.show_address===true
  if(body.services!==undefined) {
    if(!Array.isArray(body.services)||body.services.length>30) throw new ApiError(400,'Add up to 30 services.')
    updates.services=body.services.map(item=>typeof item==='string'?{name:cleanText(item,150),description:''}:{name:cleanText(item?.name,150),description:cleanText(item?.description,1500),price:cleanText(item?.price,100)}).filter(item=>item.name)
  }
  if(body.service_areas!==undefined) {
    if(!Array.isArray(body.service_areas)) throw new ApiError(400,'Invalid service areas.')
    updates.service_areas=body.service_areas.slice(0,30).map(item=>cleanText(item,150)).filter(Boolean)
  }
  if(body.hours!==undefined) {
    if(body.hours===null) updates.hours=null
    else if(typeof body.hours==='object'&&!Array.isArray(body.hours)) updates.hours=Object.fromEntries(Object.entries(body.hours).slice(0,7).map(([key,value])=>[cleanText(key,12),cleanText(value,100)]))
    else throw new ApiError(400,'Invalid opening hours.')
  }
  if(body.gallery_images!==undefined) {
    if(!Array.isArray(body.gallery_images)||body.gallery_images.length>20) throw new ApiError(400,'Add up to 20 photographs.')
    updates.gallery_images=body.gallery_images.map(safeUrl).filter(Boolean)
  }
  if(body.faq!==undefined) {
    if(!Array.isArray(body.faq)||body.faq.length>20) throw new ApiError(400,'Add up to 20 frequently asked questions.')
    updates.faq=body.faq.map(item=>({question:cleanText(item?.question,300),answer:cleanText(item?.answer,2000)})).filter(item=>item.question&&item.answer)
  }
  if(body.business_facts!==undefined) {
    if(!body.business_facts||typeof body.business_facts!=='object'||Array.isArray(body.business_facts)) throw new ApiError(400,'Invalid business facts.')
    updates.business_facts=Object.fromEntries(Object.entries(body.business_facts).slice(0,30).map(([key,value])=>[cleanText(key,80),typeof value==='boolean'||typeof value==='number'||value===null?value:cleanText(value,2000)]))
  }
  for(const field of ['brand_color_primary','brand_color_secondary','brand_color_accent']) if(body[field]!==undefined) {
    if(!/^#[0-9a-f]{6}$/i.test(String(body[field]))) throw new ApiError(400,'Choose a valid brand color.')
    updates[field]=body[field]
  }
  return updates
}
