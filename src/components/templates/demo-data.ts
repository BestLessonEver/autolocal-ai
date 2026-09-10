import type { PreviewData, ProfessionalTemplateName } from './types'

const base: PreviewData = {
  id: '', slug: 'fictional-template-demo', business_name: '', tagline: null, description: null,
  category: 'general', brand_color_primary: '#102e29', brand_color_secondary: '#52645e', brand_color_accent: '#d9e844',
  logo_url: null, hero_image_url: null, gallery_images: [], services: [], hours: {}, address: null, city: null, state: null,
  phone: null, email: null, contact_email: null, website_current: null, reviews: [], reviews_verified: false,
  google_rating: null, google_review_count: 0, cta_text: 'Get in touch', cta_url: null, template: 'summit',
  demo: true, hosting_status: 'preview',
}

/** All names, services and copy below are deliberately fictional design examples. */
export const TEMPLATE_DEMOS: Record<ProfessionalTemplateName, PreviewData> = {
  summit: { ...base, slug: 'demo-summit', template: 'summit', business_name: 'Ridgeline Home Services', category: 'Home services',
    tagline: 'Care for the place you call home.', description: 'From a small repair to your next home project, tell us what you have in mind. We’ll help you explore the next step.',
    hero_image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85', image_caption: 'Illustrative stock image · Fictional business',
    services: [
      { name: 'Home repairs', description: 'A place to explain the specific repair services your business provides.' },
      { name: 'Maintenance', description: 'Help customers understand the ongoing care and maintenance you offer.' },
      { name: 'Improvements', description: 'Describe the projects you take on, with real details from your work.' },
    ],
    faq: [{ question: 'Can this website use my business information?', answer: 'Yes. This is a fictional design example. Your website uses the services, photographs and business details you provide.' }, { question: 'Will this demo send an inquiry?', answer: 'No. The demo form lets you explore the design without sending a message.' }],
  },
  atelier: { ...base, slug: 'demo-atelier', template: 'atelier', business_name: 'Maison Studio', category: 'Personal care studio',
    tagline: 'A little time, just for you.', description: 'A space for considered care and a more personal experience. Explore our studio, find your service, and make time for yourself.',
    hero_image_url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85', image_caption: 'Illustrative stock image · Fictional business',
    services: [
      { name: 'Personal consultations', description: 'Introduce your consultations and explain what a first visit involves.' },
      { name: 'Studio appointments', description: 'A considered space to describe your treatments and appointments.' },
      { name: 'Individual care', description: 'Tell visitors how you tailor your actual services to their needs.' },
      { name: 'Special occasions', description: 'Share the occasion services your studio offers, if applicable.' },
    ],
    faq: [{ question: 'Can I add my own services and photographs?', answer: 'Yes. The names and images here illustrate the design. Your website displays your own confirmed services and photographs.' }, { question: 'Is this a real appointment form?', answer: 'This fictional demo does not send messages or book appointments.' }],
  },
  ledger: { ...base, slug: 'demo-ledger', template: 'ledger', business_name: 'Northline Advisory', category: 'Professional services',
    tagline: 'Clarity for your next chapter.', description: 'Practical support for the decisions ahead. Start a conversation about your business, your priorities, and where you want to go.',
    services: [
      { name: 'Business planning', description: 'Explain the planning work you offer and the questions you help clients answer.' },
      { name: 'Operations', description: 'Introduce your approach to the systems, people and processes behind a business.' },
      { name: 'Decision support', description: 'Give prospective clients a clear picture of your advisory services.' },
    ],
    faq: [{ question: 'Does this design need a large photo library?', answer: 'No. This example uses decorative geometry, so the focus stays on the business and its services. You can add your own photographs.' }, { question: 'Can I contact this example business?', answer: 'Northline Advisory is a fictional business used to demonstrate the template. No inquiries are sent.' }],
  },
}
