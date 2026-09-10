import type { PreviewData, SiteTemplateName } from './types'

const base: PreviewData = {
  id: '', slug: 'fictional-template-demo', business_name: '', tagline: null, description: null,
  category: 'general', brand_color_primary: '#102e29', brand_color_secondary: '#52645e', brand_color_accent: '#d9e844',
  logo_url: null, hero_image_url: null, gallery_images: [], services: [], hours: {}, address: null, city: null, state: null,
  phone: null, email: null, contact_email: null, website_current: null, reviews: [], reviews_verified: false,
  google_rating: null, google_review_count: 0, cta_text: 'Get in touch', cta_url: null, template: 'summit',
  demo: true, hosting_status: 'preview',
}

/** All names, services and copy below are deliberately fictional design examples. */
export const TEMPLATE_DEMOS: Record<SiteTemplateName, PreviewData> = {
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
  win95: { ...base, slug: 'demo-win95', template: 'win95', business_name: 'Second Byte Computer Shop', category: 'Computer repair & setup',
    tagline: 'Old-school charm. Fresh starts for your tech.', description: 'A neighborhood stop for everyday computer questions, thoughtful upgrades, and getting your workspace running comfortably.',
    services: [
      { name: 'Computer tune-ups', description: 'Tell us what feels slow, unreliable, or just plain confusing.' },
      { name: 'New computer setup', description: 'Help getting your new machine ready for the way you work.' },
      { name: 'Workspace upgrades', description: 'Explore practical improvements for your home office.' },
    ],
    faq: [{ question: 'What should I tell you about my computer?', answer: 'Describe the problem and the device you use. Please leave passwords and other private information out of the message.' }, { question: 'Is this an actual repair shop?', answer: 'Second Byte is a fictional business that demonstrates this design. The form does not send inquiries.' }],
  },
  myspace: { ...base, slug: 'demo-myspace', template: 'myspace', business_name: 'Side B Creative Club', category: 'Creative studio',
    tagline: 'Your next favorite corner of the internet.', description: 'A little color, a lot of personality. A neighborhood creative studio for personal projects, small gatherings, and making something that feels like you.',
    hero_image_url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85', image_caption: 'Illustrative stock image · Fictional business',
    services: [
      { name: 'Creative sessions', description: 'Bring a project idea and talk through what you want to make.' },
      { name: 'Small-group workshops', description: 'A space for friends to explore a creative project together.' },
      { name: 'Personal projects', description: 'Collaborate on something with your own point of view.' },
    ],
    faq: [{ question: 'Can this design feel like my business?', answer: 'Your own photographs, services, and words make the profile yours. These examples are fictional.' }, { question: 'Will this message appear in a public guestbook?', answer: 'No. The name describes the design style. A real website sends an inquiry privately to the business; this demo sends nothing.' }],
  },
  receipt: { ...base, slug: 'demo-receipt', template: 'receipt', business_name: 'The Small Fix', category: 'Everyday repair shop',
    tagline: 'Small repairs. More life in the things you love.', description: 'A simple place to ask about fixing the everyday things you would rather keep. Tell us what needs attention and we can explore the options.',
    services: [
      { name: 'Repair assessment', description: 'Share a description of the item and what needs attention.', price: 'Ask for a quote' },
      { name: 'Everyday mending', description: 'Introduce the specific repairs your shop can take on.', price: 'Quoted per project' },
      { name: 'Care & upkeep', description: 'Explain how you help customers keep their items in good shape.' },
    ],
    faq: [{ question: 'Are these prices and services real?', answer: 'This is a fictional example. Your website lists your own confirmed services and prices.' }, { question: 'Does this form send a real inquiry?', answer: 'No. You can try the demo form without sending a message.' }],
  },
}
