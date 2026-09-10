export interface BlogPost {
  slug: string; title: string; excerpt: string; tag: string; date: string; content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'google-reviews-local-seo', title: 'A practical checkup for your Google Business Profile',
    excerpt: 'Check the details customers rely on, build an honest review habit, and measure what changes.', tag: 'Local search', date: '2026-09-10',
    content: `<p>Your Google Business Profile should describe the business a customer will actually find. Start with accuracy before adding more content.</p>
<h2>Check the essentials together</h2>
<p>Review your business name, category, phone, website, regular hours, and special hours. Compare them with your website. If you visit customers instead of serving them at a storefront, make sure the profile reflects how you operate.</p>
<p>Google describes local ranking in terms of relevance, distance, and prominence. Complete information can help Google understand a business; it does not remove the effect of a searcher’s location or guarantee a position. <a href="https://support.google.com/business/answer/7091?hl=en">Read Google’s local ranking guidance</a>.</p>
<h2>Make reviews a normal part of service</h2>
<p>Invite customers to share an honest account of their experience. Give every customer the same opportunity, rather than screening for positive feedback. Keep replies specific and respectful, and avoid sharing private details about a customer.</p>
<h2>Fix one real problem at a time</h2>
<p>An outdated phone number matters more than a clever post. Keep a short change log: what was wrong, what you changed, and when you checked the result. After editing, inspect the public profile as well as the management screen.</p>
<h2>Look beyond a single search</h2>
<p>Record incoming inquiries and whether they became customers. Where connected reports provide search activity, compare similar periods and note missing data. A position from one device in one location is only one observation.</p>`
  },
  {
    slug: 'local-business-automation-starter', title: 'Your first useful business automation: an inquiry that does not get lost',
    excerpt: 'Build a dependable path from a website form to a real follow-up before adding more automation.', tag: 'Lead management', date: '2026-09-10',
    content: `<p>Start with a job you can describe clearly: when someone asks about your service, save the inquiry, make it visible to the right person, and give that person a next step.</p>
<h2>Ask for enough to reply</h2>
<p>Keep the form short. A name, a way to get in touch, and a description of the request are usually a useful starting point. Tell people what happens after they submit. Do not promise an immediate response unless someone can deliver it.</p>
<h2>Save first, then notify</h2>
<p>The inquiry should remain available even if an email provider is temporarily unavailable. Treat a saved inquiry and a delivered notification as separate outcomes. Show a clear error if saving fails so the visitor knows to try another contact method.</p>
<h2>Give the conversation an owner</h2>
<p>Decide who follows up and when they check the inbox. Use a small set of statuses such as new, contacted, won, and lost. Add enough notes to pick up a conversation without asking the customer to start over.</p>
<h2>Test the whole path</h2>
<p>Use a clearly labeled test inquiry. Confirm it appears once in the inbox, reaches the intended recipient, and can be marked contacted. Check an invalid submission as well. Repeat after changing your form or notification setup.</p>
<h2>Measure completed conversations</h2>
<p>A form submission is an inquiry, not revenue. Record the result of the follow-up. Once this basic workflow is dependable, consider which reminder or reporting task would save you the most effort next.</p>`
  },
  {
    slug: 'ai-search-business-website', title: 'Make your website useful in search, including AI answers',
    excerpt: 'Clear services, accurate facts, and useful answers are a stronger foundation than a promise to rank everywhere.', tag: 'Search essentials', date: '2026-09-10',
    content: `<p>Someone searching for a local service needs a practical answer: can you help, do you serve their area, and what should they do next? Build your website around those questions.</p>
<h2>Explain the service in plain language</h2>
<p>Use the words your customers use. Describe the work you actually offer, your real service area, and any requirements a customer should understand before contacting you. Avoid filling pages with repeated city names or services you do not provide.</p>
<h2>Answer questions you hear in real conversations</h2>
<p>Explain how estimates work, what information you need, and what a customer can expect from the first appointment. Confirm each answer with the business owner. Do not invent prices, qualifications, availability, or guarantees to fill a template.</p>
<h2>Keep technical information consistent</h2>
<p>Page titles, contact links, and structured business data should agree with the visible page. Give each useful page its own address and canonical URL. Check the site on a phone, and test the contact form.</p>
<h2>Understand what AI search requires</h2>
<p>Google says its existing SEO practices remain relevant to AI Overviews and AI Mode, and there is no special schema required for those features. Eligibility is not a promise that a page will be shown or cited. <a href="https://developers.google.com/search/docs/appearance/ai-features">Read Google’s guidance on AI features and websites</a>.</p>
<h2>Check outcomes without guessing</h2>
<p>Use connected Search Console reports when available and track customer inquiries separately. If a report does not distinguish an AI answer from other search activity, do not label it as an AI result. Useful content is a foundation to maintain, not a guaranteed shortcut.</p>`
  },
]

export const retiredBlogRedirects: Record<string, string> = {
  '5-ways-ai-transforms-local-business': 'local-business-automation-starter',
  'why-local-businesses-need-chatbots': 'local-business-automation-starter',
  'social-media-small-business-ai': 'local-business-automation-starter',
  'ai-appointment-scheduling-guide': 'local-business-automation-starter',
}
