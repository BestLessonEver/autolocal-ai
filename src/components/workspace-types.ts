export type Site = {
  id: string;
  slug: string;
  business_name: string;
  description: string | null;
  tagline: string | null;
  category: string;
  city: string | null;
  state: string | null;
  address: string | null;
  show_address: boolean;
  phone: string | null;
  contact_email: string | null;
  template: string;
  services: { name: string; description?: string; price?: string }[];
  service_areas: string[];
  faq: { question: string; answer: string }[];
  hours: Record<string, string> | null;
  hero_image_url: string | null;
  gallery_images: string[];
  hosting_status: string;
  subscription_status?: string | null;
  has_billing?: boolean;
  website_url: string | null;
  custom_domain: string | null;
  plan: string;
  view_count: number;
  business_facts: Record<string, unknown>;
  setup_health: {
    email_verified: boolean;
    public_site: boolean;
    has_contact: boolean;
    has_services: boolean;
    publishing_verified: boolean;
    google?: {
      gbp: { status: string; connected: boolean | null };
      search_console: { status: string; connected: boolean | null };
    };
  };
};
export type Lead = {
  id: string;
  site_id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  service: string;
  source: string;
  status: string;
  notes: string;
  created_at: string;
  attribution: Record<string, string>;
};
export const statuses = [
  "new",
  "contacted",
  "qualified",
  "booked",
  "won",
  "lost",
  "spam",
] as const;
export const demoSite: Site = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "demo-summit",
  business_name: "Ridgeline Home Services",
  description:
    "A fictional home services business used to show how the AutoLocal workspace works.",
  tagline: "A home you can feel good about.",
  category: "contractor",
  city: "Your town",
  state: "Your state",
  address: null,
  show_address: false,
  phone: "555-555-0100",
  contact_email: "hello@example.com",
  template: "summit",
  services: [
    {
      name: "Interior painting",
      description: "Preparation, painting, and a careful final walkthrough.",
    },
    {
      name: "Home repairs",
      description: "Help with the everyday jobs on your home improvement list.",
    },
  ],
  service_areas: ["Your town"],
  faq: [
    {
      question: "How do I get an estimate?",
      answer:
        "Send a short description of the project and we can arrange a conversation.",
    },
  ],
  hours: null,
  hero_image_url: null,
  gallery_images: [],
  hosting_status: "preview",
  website_url: null,
  custom_domain: null,
  plan: "starter",
  view_count: 0,
  business_facts: { verified: true },
  setup_health: {
    email_verified: true,
    public_site: false,
    has_contact: true,
    has_services: true,
    publishing_verified: false,
  },
};
export function sampleLeads(): Lead[] {
  return [
    {
      id: "demo-1",
      site_id: demoSite.id,
      name: "Alex Morgan",
      email: "alex@example.com",
      phone: "",
      message:
        "We’re repainting two rooms and would love to discuss the project. Is a walkthrough possible next week?",
      service: "Interior painting",
      source: "website",
      status: "new",
      notes: "",
      created_at: new Date().toISOString(),
      attribution: { utm_source: "google", utm_medium: "organic" },
    },
    {
      id: "demo-2",
      site_id: demoSite.id,
      name: "Sam Taylor",
      email: "sam@example.com",
      phone: "",
      message: "Thanks for the estimate. We’re ready to get on the schedule.",
      service: "Home repairs",
      source: "website",
      status: "booked",
      notes: "This is a fictional example inquiry.",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      attribution: { referrer: "https://www.google.com/" },
    },
  ];
}
