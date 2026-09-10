export interface PreviewData {
  id: string
  slug: string
  business_name: string
  tagline: string | null
  description: string | null
  category: string
  brand_color_primary: string
  brand_color_secondary: string
  brand_color_accent: string
  logo_url: string | null
  hero_image_url: string | null
  hero_crop?: number
  site_mode?: 'business' | 'individual'
  gallery_images: string[]
  services: { name: string; description: string; price?: string }[]
  hours: Record<string, string>
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  contact_email?: string | null
  website_current: string | null
  reviews: { author: string; rating: number; text: string; date: string }[]
  google_rating: number | null
  google_review_count: number
  cta_text: string
  cta_url: string | null
  template: string
  discord_webhook_url?: string | null
  hosting_status?: string
  deploy_status?: string
  custom_domain?: string | null
  domain_status?: string | null
  service_areas?: string[]
  faq?: { question: string; answer: string }[]
  reviews_verified?: boolean
  demo?: boolean
  image_caption?: string | null
  show_address?: boolean
}

export interface TemplateProps {
  data: PreviewData
}

export type TemplateName = 'summit' | 'atelier' | 'ledger' | 'bold' | 'elegant' | 'professional' | 'clutch' | 'artika' | 'bde'

export type ProfessionalTemplateName = 'summit' | 'atelier' | 'ledger'

export const PROFESSIONAL_TEMPLATES = [
  { id: 'summit', name: 'Summit', audience: 'Home & local services', description: 'Confident type, architectural lines, and a clear path to an inquiry.' },
  { id: 'atelier', name: 'Atelier', audience: 'Personal services & studios', description: 'Warm editorial layouts, expressive photography, and room to breathe.' },
  { id: 'ledger', name: 'Ledger', audience: 'Experts & professional services', description: 'Refined typography and a considered layout that puts your expertise first.' },
] as const

export function categoryToProfessionalTemplate(category: string): ProfessionalTemplateName {
  if (/salon|spa|beauty|hair|wellness|fitness|yoga|studio|restaurant|cafe/i.test(category)) return 'atelier'
  if (/contractor|plumb|hvac|electric|roof|clean|landscap|repair|home|auto|mechanic/i.test(category)) return 'summit'
  return 'ledger'
}

/** Get the correct CTA button text based on URL type */
export function getCtaButtonText(data: PreviewData): string {
  if (data.cta_url && data.cta_url.startsWith('tel:')) {
    return 'Call Now'
  }
  return data.cta_text || 'Get Started'
}

/** Map legacy category names to template names */
export function categoryToTemplate(category: string): TemplateName {
  return categoryToProfessionalTemplate(category)
}
