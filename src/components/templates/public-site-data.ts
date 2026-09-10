import type { PreviewData } from './types'
import { safeWebUrl } from './professional-renderer'

/** Explicit public projection: never serialize the source record or account email. */
export function publicSiteData(site: Record<string, unknown>): PreviewData {
  const text = (key: string) => typeof site[key] === 'string' ? site[key] as string : null
  const color = (key: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(text(key) || '') ? text(key)! : fallback
  const cta = text('cta_url') || ''
  const ctaUrl = /^tel:\+?[\d\s()-]+$/i.test(cta) ? `tel:${cta.slice(4).replace(/[^+\d]/g, '')}` : safeWebUrl(cta) || null
  const services = Array.isArray(site.services) ? site.services.filter(service => service && typeof service.name === 'string').map(service => ({ name: service.name, description: typeof service.description === 'string' ? service.description : '', ...(typeof service.price === 'string' ? { price: service.price } : {}) })) : []
  return {
    id: '', email: null, slug: text('slug') || '', business_name: text('business_name') || '',
    tagline: text('tagline'), description: text('description'), category: text('category') || '',
    brand_color_primary: color('brand_color_primary', '#102e29'), brand_color_secondary: color('brand_color_secondary', '#52645e'), brand_color_accent: color('brand_color_accent', '#d9e844'),
    logo_url: safeWebUrl(site.logo_url) || null, hero_image_url: safeWebUrl(site.hero_image_url) || null, hero_crop: typeof site.hero_crop === 'number' ? Math.min(100, Math.max(0, site.hero_crop)) : 50,
    image_caption: text('image_caption'), site_mode: site.site_mode === 'individual' ? 'individual' : 'business',
    gallery_images: Array.isArray(site.gallery_images) ? site.gallery_images.map(safeWebUrl).filter(Boolean) : [], services,
    hours: site.hours && typeof site.hours === 'object' && !Array.isArray(site.hours) ? Object.fromEntries(Object.entries(site.hours).filter(([, value]) => typeof value === 'string')) : {},
    address: site.show_address === false ? null : text('address'), show_address: site.show_address !== false,
    city: text('city'), state: text('state'), phone: text('phone'), contact_email: text('contact_email'),
    website_current: text('website_current'), custom_domain: text('custom_domain'), domain_status: text('domain_status'),
    reviews: site.reviews_verified === true && Array.isArray(site.reviews) ? site.reviews.filter(review => review && typeof review.author === 'string' && typeof review.text === 'string').map(review => ({ author: review.author, text: review.text, rating: Number(review.rating) || 0, date: typeof review.date === 'string' ? review.date : '' })) : [],
    reviews_verified: site.reviews_verified === true,
    google_rating: site.reviews_verified === true && typeof site.google_rating === 'number' ? site.google_rating : null,
    google_review_count: site.reviews_verified === true && typeof site.google_review_count === 'number' ? site.google_review_count : 0,
    cta_text: text('cta_text') || 'Get in touch', cta_url: ctaUrl, template: text('template') || '',
    hosting_status: text('hosting_status') || 'preview', deploy_status: text('deploy_status') || '',
    service_areas: Array.isArray(site.service_areas) ? site.service_areas.filter(area => typeof area === 'string') : [],
    faq: Array.isArray(site.faq) ? site.faq.filter(item => item && typeof item.question === 'string' && typeof item.answer === 'string').map(item => ({ question: item.question, answer: item.answer })) : [],
  }
}
