/* eslint-disable @typescript-eslint/no-explicit-any */
// Static HTML generators for deployed client sites
// Each template mirrors its React counterpart in src/components/templates/
import { PROFESSIONAL_CSS, escapeHtml, renderProfessionalSite, resolveSiteUrl, safeWebUrl, siteStructuredData, type SiteRenderOptions } from '@/components/templates/professional-renderer'
import { inquiryRuntimeScript } from '@/components/templates/inquiry-runtime'
import { categoryToProfessionalTemplate, isSiteTemplate } from '@/components/templates/types'

interface SiteData {
  slug: string
  business_name: string
  tagline: string | null
  description: string | null
  category: string
  brand_color_primary: string
  brand_color_accent: string
  logo_url: string | null
  hero_image_url: string | null
  hero_crop?: number
  site_mode?: string
  gallery_images: string[]
  services: { name: string; description?: string; price?: string }[]
  hours: Record<string, string>
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  contact_email?: string | null
  website_current: string | null
  reviews: { author: string; rating: number; text: string; date?: string }[]
  google_rating: number | null
  google_review_count: number
  cta_text: string | null
  cta_url: string | null
  template: string
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function starsSvg(rating: number, fillColor = '#facc15', emptyColor = '#374151'): string {
  return Array.from({ length: 5 }, (_, i) =>
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="${i < rating ? fillColor : emptyColor}" style="display:inline-block"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`
  ).join('')
}

const DAYS_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

const HERO_IMAGES: Record<string, string> = {
  salon: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&h=600&fit=crop',
  fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=600&fit=crop',
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=600&fit=crop',
  contractor: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&h=600&fit=crop',
  general: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=600&fit=crop',
}

function getHeroImg(d: SiteData): string {
  return safeWebUrl(d.hero_image_url) || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"%3E%3Crect width="1200" height="800" fill="%23142e29"/%3E%3Cpath d="M200 800L700 0M500 800L1000 0" stroke="%23395951" stroke-width="1"/%3E%3C/svg%3E'
}

function getCtaText(d: SiteData): string {
  if (d.cta_url && d.cta_url.startsWith('tel:')) return 'Call Now'
  return d.cta_text || 'Get Started'
}

function getEmail(d: SiteData): string {
  return d.contact_email || ''
}

/** Gallery images with hero image filtered out to avoid duplication */
function getGallery(d: SiteData): string[] {
  if (!d.gallery_images || d.gallery_images.length === 0) return []
  return d.gallery_images.filter(img => img !== d.hero_image_url)
}


function lightenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0x00FF) + amount)
  const b = Math.min(255, (num & 0x0000FF) + amount)
  return `rgb(${r}, ${g}, ${b})`
}

function isIndividual(d: SiteData): boolean {
  return d.site_mode === 'individual'
}

function showReviewCount(d: SiteData): boolean {
  return (d.google_review_count ?? 0) >= 20
}

function hoursHtml(d: SiteData, labelClass: string, valueClass: string, rowClass: string): string {
  const entries = DAYS_ORDER.filter(day => d.hours[day]).map(day =>
    `<div class="${rowClass}"><span class="${labelClass}">${DAY_LABELS[day]}</span><span class="${valueClass}">${esc(d.hours[day])}</span></div>`
  )
  return entries.length > 0 ? entries.join('') : ''
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function stickyContactBar(d: SiteData): string {
  const hasPhone = !!d.phone
  const bookingUrl = d.cta_url && !d.cta_url.startsWith('tel:') ? d.cta_url : null
  const phoneSvg = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>`
  let buttons = ''
  if (hasPhone) {
    buttons += `<a href="tel:${esc(d.phone)}" class="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white" style="background:${d.brand_color_primary}">${phoneSvg} Call Now</a>`
  }
  if (bookingUrl) {
    buttons += `<a href="${esc(bookingUrl)}" class="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white" style="background:${d.brand_color_accent || d.brand_color_primary}">Book Now</a>`
  } else if (!hasPhone) {
    buttons += `<a href="#contact" class="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white" style="background:${d.brand_color_accent || d.brand_color_primary}">Contact Us</a>`
  }
  return `<div class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] sm:hidden"><div class="flex gap-2 p-3 max-w-lg mx-auto">${buttons}</div></div>`
}

function reviewCarouselScript(reviewCount: number): string {
  if (reviewCount <= 1) return ''
  return `<script>
(function(){
  var idx=0,total=${reviewCount},texts=document.querySelectorAll('[data-review-text]'),authors=document.querySelectorAll('[data-review-author]'),dots=document.querySelectorAll('[data-review-dot]'),stars=document.querySelectorAll('[data-review-stars]'),dates=document.querySelectorAll('[data-review-date]');
  function show(i){idx=i;texts.forEach(function(el){el.style.display='none'});authors.forEach(function(el){el.style.display='none'});if(stars.length)stars.forEach(function(el){el.style.display='none'});if(dates.length)dates.forEach(function(el){el.style.display='none'});
  if(texts[i])texts[i].style.display='';if(authors[i])authors[i].style.display='';if(stars[i])stars[i].style.display='flex';if(dates[i])dates[i].style.display='';
  dots.forEach(function(el,j){el.className=j===i?el.getAttribute('data-active-class'):el.getAttribute('data-inactive-class')});}
  dots.forEach(function(el,j){el.addEventListener('click',function(){show(j)})});
  setInterval(function(){show((idx+1)%total)},5000);
  show(0);
})();
</script>`
}

// ═══════════════════════════════════════════════════════
// BOLD TEMPLATE
// ═══════════════════════════════════════════════════════
function boldTemplate(d: SiteData): string {
  const p = d.brand_color_primary
  const a = d.brand_color_accent
  const heroImg = getHeroImg(d)
  const ind = isIndividual(d)
  const ctaText = d.phone ? (ind ? 'Call Me' : 'Call Us') : getCtaText(d)
  const email = getEmail(d)
  const year = new Date().getFullYear()

  return `
<div class="min-h-screen bg-white text-gray-900">
  <!-- Header -->
  <header class="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
      <div class="flex items-center gap-3">
        ${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" class="h-9 w-9 rounded-lg object-cover">` : ''}
        <span class="font-black text-xl text-white tracking-tight">${esc(d.business_name)}</span>
      </div>
      <nav class="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-400">
        <a href="#services" class="hover:text-white transition">Services</a>
        <a href="#about" class="hover:text-white transition">About</a>
        <a href="#reviews" class="hover:text-white transition">Reviews</a>
        <a href="#contact" class="hover:text-white transition">Contact</a>
      </nav>
      <a href="${esc(d.cta_url || '#contact')}" class="px-6 py-2.5 rounded-lg text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all transform hover:scale-105" style="background:${p}">${esc(ctaText)}</a>
    </div>
  </header>

  <!-- Hero -->
  <section class="relative min-h-[85vh] flex items-end">
    <div class="absolute inset-0">
      <img src="${esc(heroImg)}" alt="" class="w-full h-full object-cover" style="object-position:center ${d.hero_crop ?? 50}%">
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"></div>
    </div>
    <div class="relative w-full">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div class="max-w-3xl">
          ${d.google_rating ? `<div class="flex items-center gap-3 mb-6">${starsSvg(Math.round(d.google_rating))}<span class="text-white/90 font-semibold text-sm">${d.google_rating} stars${showReviewCount(d) ? ` · ${d.google_review_count} reviews on Google` : ' on Google'}</span></div>` : ''}
          <h1 class="text-5xl sm:text-6xl lg:text-8xl font-black text-white leading-[0.95] tracking-tight mb-6">${esc(d.business_name)}</h1>
          ${d.tagline ? `<p class="text-xl sm:text-2xl text-gray-300 mb-10 max-w-xl leading-relaxed font-light">${esc(d.tagline)}</p>` : ''}
          <div class="flex flex-col sm:flex-row gap-4">
            <a href="${esc(d.cta_url || '#contact')}" class="inline-flex items-center justify-center px-10 py-5 rounded-lg text-white text-lg font-bold shadow-2xl transition-all transform hover:scale-105 tracking-wide" style="background:${p}">${esc(ctaText)}</a>
            <a href="#services" class="inline-flex items-center justify-center px-10 py-5 rounded-lg border-2 border-white/30 text-white text-lg font-bold hover:bg-white/10 transition backdrop-blur">View Services →</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Services -->
  ${d.services.length > 0 ? `
  <section id="services" class="py-24 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-20">
        <p class="text-sm font-bold tracking-[0.3em] uppercase mb-4" style="color:${a}">What ${ind ? 'I' : 'We'} Do</p>
        <h2 class="text-4xl sm:text-5xl font-black tracking-tight">${ind ? 'My Services' : 'Our Services'}</h2>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${d.services.map((s, i) => `
        <div class="group bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300 hover:border-white/20">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-black mb-6" style="background:${p}40">${String(i + 1).padStart(2, '0')}</div>
          <h3 class="text-xl font-bold mb-3">${esc(s.name)}</h3>
          <p class="text-gray-400 leading-relaxed mb-4">${esc(s.description)}</p>
          ${s.price ? `<p class="font-bold text-lg" style="color:${a}">${esc(s.price)}</p>` : ''}
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- About -->
  <section id="about" class="py-24 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <p class="text-sm font-bold tracking-[0.3em] uppercase mb-4" style="color:${a}">${ind ? 'About Me' : 'About Us'}</p>
          <h2 class="text-4xl sm:text-5xl font-black tracking-tight mb-8" style="color:${p}">${esc(d.business_name)}</h2>
          <p class="text-gray-600 text-lg leading-relaxed mb-8">${esc(d.description || `Welcome to ${d.business_name} — proudly serving ${d.city || 'the community'}${d.state ? `, ${d.state}` : ''}.`)}</p>
          ${d.google_rating && d.google_rating >= 4.0 ? `
          <div class="flex items-center gap-6 p-6 bg-gray-50 rounded-2xl">
            <div class="text-5xl font-black" style="color:${p}">${d.google_rating}</div>
            <div><div class="flex mb-1">${starsSvg(Math.round(d.google_rating))}</div><p class="text-gray-500 text-sm font-medium">${showReviewCount(d) ? `${d.google_review_count} verified reviews` : 'Verified on Google'}</p></div>
          </div>` : ''}
        </div>
        <div class="relative">
          <div class="rounded-2xl overflow-hidden aspect-[4/3] shadow-2xl">
            <img src="${esc(getGallery(d)[0] || heroImg)}" alt="" class="w-full h-full object-cover" ${!getGallery(d)[0] ? `style="object-position:center ${d.hero_crop ?? 50}%"` : ''}>
          </div>
          <div class="absolute -bottom-6 -left-6 w-32 h-32 rounded-2xl" style="background:${p};opacity:0.15"></div>
          <div class="absolute -top-6 -right-6 w-24 h-24 rounded-full" style="background:${a};opacity:0.2"></div>
        </div>
      </div>
    </div>
  </section>

  <!-- Reviews -->
  ${d.reviews.length > 0 ? `
  <section id="reviews" class="py-24 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <p class="text-sm font-bold tracking-[0.3em] uppercase mb-4" style="color:${a}">Testimonials</p>
        <h2 class="text-4xl sm:text-5xl font-black tracking-tight">What People Say</h2>
      </div>
      <div class="max-w-4xl mx-auto">
        <div class="bg-white/5 border border-white/10 rounded-3xl p-10 sm:p-14 text-center">
          ${d.reviews.map((r, i) => `
          <div data-review-stars style="${i > 0 ? 'display:none' : 'display:flex'};justify-content:center;margin-bottom:1.5rem">${starsSvg(r.rating)}</div>
          <p data-review-text class="text-2xl sm:text-3xl text-gray-200 leading-relaxed mb-8 font-light" ${i > 0 ? 'style="display:none"' : ''}>&ldquo;${esc(r.text)}&rdquo;</p>
          <p data-review-author class="font-bold text-lg text-white" ${i > 0 ? 'style="display:none"' : ''}>${esc(r.author)}</p>
          `).join('')}
        </div>
        ${d.reviews.length > 1 ? `<div class="flex justify-center gap-3 mt-8">${d.reviews.map((_, i) => `<button data-review-dot data-active-class="w-8 h-3 rounded-full transition-all" data-inactive-class="w-3 h-3 rounded-full bg-gray-600 transition-all" class="${i === 0 ? 'w-8 h-3 rounded-full transition-all' : 'w-3 h-3 rounded-full bg-gray-600 transition-all'}" ${i === 0 ? `style="background:${p}"` : ''}></button>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>` : ''}

  <!-- Contact -->
  <section id="contact" class="py-24 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <p class="text-sm font-bold tracking-[0.3em] uppercase mb-4" style="color:${a}">Get In Touch</p>
        <h2 class="text-4xl sm:text-5xl font-black tracking-tight" style="color:${p}">Contact Us</h2>
      </div>
      <div class="grid md:grid-cols-2 gap-16 max-w-5xl mx-auto">
        <div class="space-y-8">
          ${d.address ? `<div class="flex items-start gap-4"><div class="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 text-lg" style="background:${p}">📍</div><div><p class="font-bold text-lg mb-1">Address</p><p class="text-gray-600">${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p></div></div>` : ''}
          ${d.phone ? `<div class="flex items-start gap-4"><div class="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 text-lg" style="background:${p}">📞</div><div><p class="font-bold text-lg mb-1">Phone</p><a href="tel:${esc(d.phone)}" class="text-gray-600 hover:underline">${esc(d.phone)}</a></div></div>` : ''}
          ${email ? `<div class="flex items-start gap-4"><div class="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 text-lg" style="background:${p}">✉️</div><div><p class="font-bold text-lg mb-1">Email</p><a href="mailto:${esc(email)}" class="text-gray-600 hover:underline">${esc(email)}</a></div></div>` : ''}
        </div>
        ${Object.keys(d.hours).length > 0 ? `
        <div>
          <h3 class="text-xl font-bold mb-6">Business Hours</h3>
          <div class="space-y-3">${hoursHtml(d, 'font-semibold', 'text-gray-600', 'flex justify-between py-3 border-b border-gray-100')}</div>
        </div>` : ''}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-black text-gray-500 py-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <p class="text-white font-black text-2xl mb-3">${esc(d.business_name)}</p>
      ${d.address ? `<p class="text-sm">${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p>` : ''}
      ${d.phone ? `<p class="text-sm mt-1">${esc(d.phone)}</p>` : ''}
      <p class="text-xs mt-10 text-gray-700">© ${year} ${esc(d.business_name)}. All rights reserved.</p>
    </div>
  </footer>
  
</div>`
}

// ═══════════════════════════════════════════════════════
// ELEGANT TEMPLATE
// ═══════════════════════════════════════════════════════
function elegantTemplate(d: SiteData): string {
  const p = d.brand_color_primary
  const a = d.brand_color_accent
  const heroImg = getHeroImg(d)
  const ctaText = getCtaText(d)
  const email = getEmail(d)
  const ind = isIndividual(d)
  const gallery = getGallery(d)
  const year = new Date().getFullYear()

  return `
<div class="min-h-screen bg-stone-50 text-gray-800" style="font-family:'Georgia','Times New Roman',serif">
  <!-- Header -->
  <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200/50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
      <div class="flex items-center gap-3">
        ${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" class="h-10 w-10 rounded-full object-cover ring-2 ring-stone-200">` : ''}
        <span class="font-bold text-xl tracking-wide" style="color:${p}">${esc(d.business_name)}</span>
      </div>
      <nav class="hidden md:flex items-center gap-10 text-sm font-medium text-stone-500 tracking-wide" style="font-family:sans-serif">
        <a href="#services" class="hover:text-stone-800 transition">Services</a>
        <a href="#gallery" class="hover:text-stone-800 transition">Gallery</a>
        <a href="#testimonials" class="hover:text-stone-800 transition">Testimonials</a>
        <a href="#contact" class="hover:text-stone-800 transition">Contact</a>
      </nav>
      <a href="${esc(d.cta_url || '#contact')}" class="px-7 py-2.5 rounded-full text-white text-sm font-medium tracking-wide shadow-lg transition-all hover:scale-105" style="background:${p}">${esc(ctaText)}</a>
    </div>
  </header>

  <!-- Hero -->
  <section class="relative min-h-[80vh] flex items-center justify-center text-center">
    <div class="absolute inset-0">
      <img src="${esc(heroImg)}" alt="" class="w-full h-full object-cover" style="object-position:center ${d.hero_crop ?? 50}%">
      <div class="absolute inset-0" style="background:linear-gradient(180deg,${p}99,${p}55)"></div>
    </div>
    <div class="relative max-w-3xl mx-auto px-4 py-20">
      <div class="w-20 h-[1px] bg-white/40 mx-auto mb-8"></div>
      <p class="text-sm tracking-[0.4em] uppercase text-white/70 mb-6" style="font-family:sans-serif">Welcome to</p>
      <h1 class="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">${esc(d.business_name)}</h1>
      ${d.tagline ? `<p class="text-xl sm:text-2xl text-white/85 mb-10 italic leading-relaxed">${esc(d.tagline)}</p>` : ''}
      ${d.google_rating ? `<div class="flex items-center justify-center gap-3 mb-10">${starsSvg(Math.round(d.google_rating))}<span class="text-white/90 font-medium text-sm" style="font-family:sans-serif">${d.google_rating} stars${showReviewCount(d) ? ` · ${d.google_review_count} reviews` : ''}</span></div>` : ''}
      <a href="${esc(d.cta_url || '#contact')}" class="inline-flex px-10 py-4 rounded-full bg-white text-lg font-semibold shadow-2xl transition-all hover:scale-105" style="color:${p}">${esc(ctaText)}</a>
      <div class="w-20 h-[1px] bg-white/40 mx-auto mt-10"></div>
    </div>
  </section>

  <!-- Services -->
  ${d.services.length > 0 ? `
  <section id="services" class="py-28">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-20">
        <p class="text-xs tracking-[0.3em] uppercase mb-4 font-semibold" style="color:${a};font-family:sans-serif">${ind ? 'What I Offer' : 'What We Offer'}</p>
        <h2 class="text-3xl sm:text-4xl font-bold" style="color:${p}">${ind ? 'My Services' : 'Our Services'}</h2>
        <div class="w-16 h-[2px] mx-auto mt-6" style="background:${a}"></div>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
        ${d.services.map(s => `
        <div class="bg-white rounded-2xl p-10 shadow-sm hover:shadow-lg transition-all text-center border border-stone-100">
          <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6" style="background:${p}10"><span class="text-2xl" style="color:${p}">✦</span></div>
          <h3 class="text-xl font-bold mb-3" style="color:${p}">${esc(s.name)}</h3>
          <p class="text-stone-500 leading-relaxed mb-4 text-sm" style="font-family:sans-serif">${esc(s.description)}</p>
          ${s.price ? `<p class="font-bold text-lg" style="color:${a}">${esc(s.price)}</p>` : ''}
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Gallery -->
  ${gallery.length > 0 ? `
  <section id="gallery" class="py-28 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-20">
        <p class="text-xs tracking-[0.3em] uppercase mb-4 font-semibold" style="color:${a};font-family:sans-serif">${ind ? 'My Work' : 'Our Work'}</p>
        <h2 class="text-3xl sm:text-4xl font-bold" style="color:${p}">Gallery</h2>
        <div class="w-16 h-[2px] mx-auto mt-6" style="background:${a}"></div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        ${gallery.slice(0, 6).map((img, i) => `<div class="overflow-hidden rounded-xl ${i === 0 ? 'row-span-2' : ''}"><img src="${esc(img)}" alt="" class="w-full h-full object-cover hover:scale-105 transition-transform duration-700" style="min-height:${i === 0 ? '400px' : '200px'}"></div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- About -->
  <section class="py-28">
    <div class="max-w-3xl mx-auto px-4 text-center">
      <p class="text-xs tracking-[0.3em] uppercase mb-4 font-semibold" style="color:${a};font-family:sans-serif">${ind ? 'My Story' : 'Our Story'}</p>
      <h2 class="text-3xl sm:text-4xl font-bold mb-8" style="color:${p}">About ${esc(d.business_name)}</h2>
      <div class="w-16 h-[2px] mx-auto mb-10" style="background:${a}"></div>
      <p class="text-stone-600 text-lg leading-relaxed">${esc(d.description || `Welcome to ${d.business_name} — proudly serving ${d.city || 'the community'}${d.state ? `, ${d.state}` : ''}.`)}</p>
    </div>
  </section>

  <!-- Testimonials -->
  ${d.reviews.length > 0 ? `
  <section id="testimonials" class="py-28 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-20">
        <p class="text-xs tracking-[0.3em] uppercase mb-4 font-semibold" style="color:${a};font-family:sans-serif">Testimonials</p>
        <h2 class="text-3xl sm:text-4xl font-bold" style="color:${p}">Client Love</h2>
        <div class="w-16 h-[2px] mx-auto mt-6" style="background:${a}"></div>
      </div>
      <div class="grid md:grid-cols-3 gap-10">
        ${d.reviews.slice(0, 3).map(r => `
        <div class="bg-stone-50 rounded-2xl p-10 text-center border border-stone-100">
          <div class="flex justify-center mb-5">${starsSvg(r.rating, '#facc15', '#d1d5db')}</div>
          <p class="text-stone-700 italic leading-relaxed mb-6">&ldquo;${esc(r.text)}&rdquo;</p>
          <div class="w-8 h-[1px] bg-stone-300 mx-auto mb-4"></div>
          <p class="font-bold" style="color:${p}">${esc(r.author)}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Contact -->
  <section id="contact" class="py-28">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-20">
        <p class="text-xs tracking-[0.3em] uppercase mb-4 font-semibold" style="color:${a};font-family:sans-serif">Visit Us</p>
        <h2 class="text-3xl sm:text-4xl font-bold" style="color:${p}">Book Your Appointment</h2>
        <div class="w-16 h-[2px] mx-auto mt-6" style="background:${a}"></div>
      </div>
      <div class="grid md:grid-cols-2 gap-20 max-w-4xl mx-auto">
        <div class="space-y-8">
          ${d.address ? `<div><p class="font-bold mb-1 text-sm tracking-wide uppercase" style="color:${p};font-family:sans-serif">Location</p><p class="text-stone-600">${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p></div>` : ''}
          ${d.phone ? `<div><p class="font-bold mb-1 text-sm tracking-wide uppercase" style="color:${p};font-family:sans-serif">Phone</p><a href="tel:${esc(d.phone)}" class="text-stone-600 hover:underline">${esc(d.phone)}</a></div>` : ''}
          ${email ? `<div><p class="font-bold mb-1 text-sm tracking-wide uppercase" style="color:${p};font-family:sans-serif">Email</p><a href="mailto:${esc(email)}" class="text-stone-600 hover:underline">${esc(email)}</a></div>` : ''}
          <a href="${esc(d.cta_url || '#')}" class="inline-flex mt-4 px-8 py-3 rounded-full text-white font-medium shadow-lg transition-all hover:scale-105" style="background:${p}">${esc(ctaText)}</a>
        </div>
        ${Object.keys(d.hours).length > 0 ? `
        <div>
          <h3 class="font-bold text-xl mb-8" style="color:${p}">Hours</h3>
          <div class="space-y-3">${hoursHtml(d, 'font-medium text-sm', 'text-stone-500 text-sm', 'flex justify-between py-3 border-b border-stone-200')}</div>
        </div>` : ''}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-16 text-white text-center" style="background:${p}">
    <div class="max-w-7xl mx-auto px-4">
      <p class="text-3xl font-bold mb-3">${esc(d.business_name)}</p>
      ${d.address ? `<p class="text-white/60 text-sm">${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p>` : ''}
      ${d.phone ? `<p class="text-white/60 text-sm mt-1">${esc(d.phone)}</p>` : ''}
      <p class="text-white/30 text-xs mt-10" style="font-family:sans-serif">© ${year} ${esc(d.business_name)}</p>
    </div>
  </footer>
  
</div>`
}

// ═══════════════════════════════════════════════════════
// PROFESSIONAL TEMPLATE
// ═══════════════════════════════════════════════════════
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _professionalTemplate(d: SiteData): string {
  const p = d.brand_color_primary
  const a = d.brand_color_accent
  const heroImg = getHeroImg(d)
  const ctaText = getCtaText(d)
  const email = getEmail(d)
  const ind = isIndividual(d)
  const year = new Date().getFullYear()

  return `
<div class="min-h-screen bg-white text-gray-900">
  <!-- Header -->
  <header class="sticky top-0 z-40 shadow-md" style="background:${p}">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
      <div class="flex items-center gap-3">
        ${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" class="h-8 w-8 rounded object-cover">` : ''}
        <span class="font-bold text-lg text-white">${esc(d.business_name)}</span>
      </div>
      <nav class="hidden md:flex items-center gap-8 text-sm font-medium text-white/80">
        <a href="#services" class="hover:text-white transition">Services</a>
        <a href="#why-us" class="hover:text-white transition">Why Us</a>
        <a href="#reviews" class="hover:text-white transition">Reviews</a>
        <a href="#contact" class="hover:text-white transition">Contact</a>
      </nav>
      <div class="flex items-center gap-4">
        ${d.phone ? `<a href="tel:${esc(d.phone)}" class="hidden sm:flex items-center gap-2 text-white text-sm font-semibold">📞 ${esc(d.phone)}</a>` : ''}
        <a href="${esc(d.cta_url || '#contact')}" class="px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-lg transition-all hover:scale-105" style="background:${a}">${esc(ctaText)}</a>
      </div>
    </div>
  </header>

  <!-- Hero -->
  <section class="relative overflow-hidden" style="background:linear-gradient(135deg, ${p}08 0%, ${p}15 50%, ${a}10 100%)">
    <div class="lg:hidden relative h-[300px] sm:h-[400px]">
      <img src="${esc(heroImg)}" alt="" class="w-full h-full object-cover" style="object-position:center ${d.hero_crop ?? 50}%">
      <div class="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50"></div>
    </div>
    <div class="max-w-7xl mx-auto">
      <div class="grid lg:grid-cols-2 lg:min-h-[600px]">
        <div class="flex items-center px-4 sm:px-8 lg:px-16 py-10 lg:py-24">
          <div class="max-w-lg">
            ${d.google_rating && d.google_rating >= 4.0 ? `<div class="flex items-center gap-2 mb-6">${starsSvg(Math.round(d.google_rating), '#facc15', '#d1d5db')}<span class="text-sm font-semibold text-gray-600">${d.google_rating} stars${showReviewCount(d) ? ` · ${d.google_review_count} reviews` : ''}</span></div>` : ''}
            <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6" style="color:${p}">${esc(d.business_name)}</h1>
            ${d.tagline ? `<p class="text-xl text-gray-600 mb-8 leading-relaxed">${esc(d.tagline)}</p>` : ''}
            <div class="flex flex-col sm:flex-row gap-4 mb-10">
              <a href="${esc(d.cta_url || '#contact')}" class="inline-flex items-center justify-center px-8 py-4 rounded-lg text-white text-lg font-semibold shadow-xl transition-all hover:scale-105" style="background:${p}">${esc(ctaText)}</a>
              ${d.phone && !(d.cta_url || '').startsWith('tel:') ? `<a href="tel:${esc(d.phone)}" class="inline-flex items-center justify-center px-8 py-4 rounded-lg border-2 text-lg font-semibold transition-all hover:bg-gray-50" style="border-color:${p};color:${p}">📞 Call Now</a>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex items-center gap-2 text-sm text-gray-600"><span class="text-lg">🛡️</span><span class="font-medium">Licensed &amp; Insured</span></div>
              <div class="flex items-center gap-2 text-sm text-gray-600"><span class="text-lg">⭐</span><span class="font-medium">5-Star Rated</span></div>
              <div class="flex items-center gap-2 text-sm text-gray-600"><span class="text-lg">🏆</span><span class="font-medium">Award Winning</span></div>
              <div class="flex items-center gap-2 text-sm text-gray-600"><span class="text-lg">✅</span><span class="font-medium">Satisfaction Guaranteed</span></div>
            </div>
          </div>
        </div>
        <div class="hidden lg:block relative">
          <img src="${esc(heroImg)}" alt="" class="w-full h-full object-cover" style="object-position:center ${d.hero_crop ?? 50}%">
          <div class="absolute inset-0 bg-gradient-to-r from-gray-50 via-transparent to-transparent"></div>
        </div>
      </div>
    </div>
  </section>

  <!-- Stats -->
  <section class="py-12 text-white" style="background:${p}">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
        <div><p class="text-3xl sm:text-4xl font-bold mb-1">${d.google_review_count ? `${d.google_review_count}+` : '500+'}</p><p class="text-white/70 text-sm font-medium">Happy Clients</p></div>
        <div><p class="text-3xl sm:text-4xl font-bold mb-1">${d.google_rating ? `${d.google_rating}★` : '5★'}</p><p class="text-white/70 text-sm font-medium">Google Rating</p></div>
        <div><p class="text-3xl sm:text-4xl font-bold mb-1">10+</p><p class="text-white/70 text-sm font-medium">Years Experience</p></div>
        <div><p class="text-3xl sm:text-4xl font-bold mb-1">100%</p><p class="text-white/70 text-sm font-medium">Satisfaction</p></div>
      </div>
    </div>
  </section>

  <!-- Services -->
  ${d.services.length > 0 ? `
  <section id="services" class="py-24">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h2 class="text-3xl sm:text-4xl font-bold mb-4" style="color:${p}">${ind ? 'My Services' : 'Our Services'}</h2>
        <p class="text-gray-600 text-lg max-w-2xl mx-auto">Professional solutions tailored to your needs.</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        ${d.services.map(s => `
        <div class="bg-white rounded-xl p-8 shadow-sm hover:shadow-lg transition-shadow border-t-4" style="border-color:${p}">
          <h3 class="text-xl font-bold mb-3" style="color:${p}">${esc(s.name)}</h3>
          <p class="text-gray-600 mb-4 leading-relaxed">${esc(s.description)}</p>
          ${s.price ? `<p class="font-bold text-lg" style="color:${a}">${esc(s.price)}</p>` : ''}
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Reviews -->
  ${d.reviews.length > 0 ? `
  <section id="reviews" class="py-24">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h2 class="text-3xl sm:text-4xl font-bold mb-4" style="color:${p}">${ind ? 'What My Clients Say' : 'What Our Clients Say'}</h2>
      </div>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        ${d.reviews.slice(0, 6).map(r => `
        <div class="bg-gray-50 rounded-xl p-6 border border-gray-100">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style="background:${p}">${esc(r.author.charAt(0))}</div>
            <div><p class="font-semibold">${esc(r.author)}</p><div class="flex gap-0.5">${starsSvg(r.rating, '#facc15', '#d1d5db')}</div></div>
          </div>
          <p class="text-gray-600 leading-relaxed">&ldquo;${esc(r.text)}&rdquo;</p>
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Contact -->
  <section id="contact" class="py-24 bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-16">
        <div>
          <h2 class="text-3xl font-bold mb-8" style="color:${p}">Contact Information</h2>
          <div class="space-y-4">
            ${d.address ? `<p class="flex items-start gap-3"><span>📍</span><span>${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</span></p>` : ''}
            ${d.phone ? `<p class="flex items-start gap-3"><span>📞</span><a href="tel:${esc(d.phone)}" class="hover:underline">${esc(d.phone)}</a></p>` : ''}
            ${email ? `<p class="flex items-start gap-3"><span>✉️</span><a href="mailto:${esc(email)}" class="hover:underline">${esc(email)}</a></p>` : ''}
          </div>
          ${Object.keys(d.hours).length > 0 ? `
          <h3 class="text-xl font-bold mt-8 mb-4" style="color:${p}">Business Hours</h3>
          <div class="space-y-2">${hoursHtml(d, 'font-medium', 'text-gray-600', 'flex justify-between py-2 border-b border-gray-200')}</div>` : ''}
        </div>
        <div></div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-12 text-white" style="background:${p}">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <p class="font-bold text-xl mb-2">${esc(d.business_name)}</p>
      ${d.address ? `<p class="text-white/70 text-sm">${esc(d.address)}</p>` : ''}
      ${d.phone ? `<p class="text-white/70 text-sm mt-1">${esc(d.phone)}</p>` : ''}
      <p class="text-white/30 text-xs mt-10">© ${year} ${esc(d.business_name)}</p>
    </div>
  </footer>
  
</div>`
}

// ═══════════════════════════════════════════════════════
// CLUTCH TEMPLATE
// ═══════════════════════════════════════════════════════
function clutchTemplate(d: SiteData): string {
  const ctaText = getCtaText(d)
  const email = getEmail(d)
  const ind = isIndividual(d)
  const year = new Date().getFullYear()
  const SERVICE_ICONS = ['🔧', '⚡', '🛠️', '🏗️', '✅', '🔩', '📐', '🧰', '💡', '🏠']

  return `
<div class="min-h-screen bg-white text-gray-900">
  <!-- Header -->
  <header class="sticky top-0 z-40 bg-[#0f172a]/95 backdrop-blur border-b border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
      <div class="flex items-center gap-3">
        ${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" class="h-9 w-9 rounded-lg object-cover">` : ''}
        <span class="font-black text-xl text-white tracking-tight">${esc(d.business_name)}</span>
      </div>
      <nav class="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-400">
        ${d.services.length > 0 ? '<a href="#services" class="hover:text-white transition">Services</a>' : ''}
        <a href="#about" class="hover:text-white transition">About</a>
        ${d.reviews.length > 0 ? '<a href="#reviews" class="hover:text-white transition">Reviews</a>' : ''}
        <a href="#contact" class="hover:text-white transition">Contact</a>
      </nav>
      <a href="${esc(d.cta_url || '#contact')}" class="px-6 py-2.5 rounded-lg text-white text-sm font-bold shadow-lg" style="background:#f97316">${esc(ctaText)}</a>
    </div>
  </header>

  <!-- Hero -->
  <section class="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
    <div class="absolute inset-0">
      <img src="${esc(getHeroImg(d))}" alt="" class="w-full h-full object-cover" style="object-position:center ${d.hero_crop ?? 50}%">
      <div class="absolute inset-0 bg-[#0f172a]/80"></div>
    </div>
    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-24 sm:py-32">
      <h1 class="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.95] tracking-tight mb-6">${esc(d.business_name)}</h1>
      ${d.tagline ? `<p class="text-xl sm:text-2xl text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed">${esc(d.tagline)}</p>` : ''}
      <a href="${esc(d.cta_url || '#contact')}" class="inline-flex items-center justify-center px-12 py-5 rounded-lg text-white text-lg font-bold shadow-2xl transition-all hover:scale-105" style="background:#f97316">${esc(ctaText)}</a>
    </div>
  </section>

  <!-- Trust Bar -->
  <section class="bg-[#1e293b] border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-gray-300">
      ${d.google_rating ? `<div class="flex items-center gap-2">${starsSvg(Math.round(d.google_rating), '#f97316', '#d1d5db')}<span class="font-semibold text-white">${d.google_rating}</span>${showReviewCount(d) ? `<span class="text-gray-400">(${d.google_review_count} reviews)</span>` : ''}</div>` : ''}
      <div class="flex items-center gap-2"><span class="text-lg">🏠</span><span class="font-semibold">Locally Owned</span></div>
      ${d.phone ? `<a href="tel:${esc(d.phone)}" class="flex items-center gap-2 hover:text-white transition"><span class="text-lg">📞</span><span class="font-semibold">${esc(d.phone)}</span></a>` : ''}
      ${d.city ? `<div class="flex items-center gap-2"><span class="text-lg">📍</span><span>Serving ${esc(d.city)}${d.state ? `, ${esc(d.state)}` : ''}</span></div>` : ''}
    </div>
  </section>

  <!-- Services -->
  ${d.services.length > 0 ? `
  <section id="services" class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <p class="text-sm font-bold tracking-[0.2em] uppercase text-[#f97316] mb-3">What ${ind ? 'I' : 'We'} Do</p>
        <h2 class="text-4xl sm:text-5xl font-black tracking-tight text-[#0f172a]">${ind ? 'My Services' : 'Our Services'}</h2>
      </div>
      <div class="grid sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
        ${d.services.map((s, i) => `
        <div class="border border-gray-200 rounded-xl p-6 pl-8 border-l-4 border-l-[#f97316] hover:shadow-lg transition-shadow bg-white">
          <div class="flex items-start gap-4">
            <span class="text-2xl mt-0.5">${SERVICE_ICONS[i % SERVICE_ICONS.length]}</span>
            <div class="flex-1">
              <h3 class="text-lg font-bold text-[#0f172a] mb-1">${esc(s.name)}</h3>
              <p class="text-gray-600 leading-relaxed text-sm mb-2">${esc(s.description)}</p>
              ${s.price ? `<p class="font-bold text-[#f97316]">${esc(s.price)}</p>` : ''}
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- About -->
  <section id="about" class="py-20 bg-[#f8fafc]">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <p class="text-sm font-bold tracking-[0.2em] uppercase text-[#f97316] mb-3">${ind ? 'My Story' : 'Our Story'}</p>
          <h2 class="text-4xl sm:text-5xl font-black tracking-tight text-[#0f172a] mb-6">About ${esc(d.business_name)}</h2>
          <p class="text-gray-600 text-lg leading-relaxed">${esc(d.description || `Welcome to ${d.business_name} — proudly serving ${d.city || 'the community'}${d.state ? `, ${d.state}` : ''}.`)}</p>
        </div>
        <div>
          ${getGallery(d)[0] ? `<div class="rounded-2xl overflow-hidden aspect-[4/3] shadow-xl"><img src="${esc(getGallery(d)[0])}" alt="" class="w-full h-full object-cover"></div>` : `<div class="rounded-2xl aspect-[4/3] bg-[#0f172a] flex items-center justify-center"><span class="text-6xl opacity-30">🏢</span></div>`}
        </div>
      </div>
    </div>
  </section>

  <!-- Reviews -->
  ${d.reviews.length > 0 ? `
  <section id="reviews" class="py-20 bg-[#0f172a] text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <p class="text-sm font-bold tracking-[0.2em] uppercase text-[#f97316] mb-3">Testimonials</p>
        <h2 class="text-4xl sm:text-5xl font-black tracking-tight">${ind ? 'What My Customers Say' : 'What Our Customers Say'}</h2>
      </div>
      <div class="max-w-3xl mx-auto text-center">
        <div class="bg-white/5 border border-white/10 rounded-2xl p-10 sm:p-14 min-h-[260px] flex flex-col items-center justify-center">
          ${d.reviews.map((r, i) => `<p data-review-text class="text-xl sm:text-2xl text-gray-200 leading-relaxed mb-8 font-light" ${i > 0 ? 'style="display:none"' : ''}>&ldquo;${esc(r.text)}&rdquo;</p>
          <div data-review-stars class="flex items-center gap-3" style="${i > 0 ? 'display:none' : 'display:flex'}">${starsSvg(r.rating, '#f97316', '#d1d5db')}</div>
          <p data-review-author class="font-bold text-white mt-3" ${i > 0 ? 'style="display:none"' : ''}>${esc(r.author)}</p>`).join('')}
        </div>
        ${d.reviews.length > 1 ? `<div class="flex justify-center gap-2 mt-6">${d.reviews.map((_, i) => `<button data-review-dot data-active-class="h-2.5 w-8 rounded-full bg-[#f97316] transition-all" data-inactive-class="h-2.5 w-2.5 rounded-full bg-gray-600 transition-all" class="${i === 0 ? 'h-2.5 w-8 rounded-full bg-[#f97316] transition-all' : 'h-2.5 w-2.5 rounded-full bg-gray-600 transition-all'}"></button>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>` : ''}

  <!-- Contact -->
  <section id="contact" class="py-20 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <p class="text-sm font-bold tracking-[0.2em] uppercase text-[#f97316] mb-3">Get In Touch</p>
        <h2 class="text-4xl sm:text-5xl font-black tracking-tight text-[#0f172a]">Hours &amp; Contact</h2>
      </div>
      <div class="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
        ${Object.keys(d.hours).length > 0 ? `
        <div>
          <h3 class="text-xl font-bold text-[#0f172a] mb-6">Business Hours</h3>
          <div class="border border-gray-200 rounded-xl overflow-hidden">${DAYS_ORDER.filter(day => d.hours[day]).map(day => `<div class="flex justify-between px-5 py-3 even:bg-[#f8fafc] border-b border-gray-100 last:border-0"><span class="font-semibold text-[#0f172a]">${DAY_LABELS[day]}</span><span class="text-gray-600">${esc(d.hours[day])}</span></div>`).join('')}</div>
        </div>` : ''}
        <div>
          <h3 class="text-xl font-bold text-[#0f172a] mb-6">Contact Info</h3>
          <div class="space-y-5">
            ${d.address ? `<div class="flex items-start gap-3"><span class="text-xl mt-0.5">📍</span><div><p class="font-semibold text-[#0f172a]">Address</p><p class="text-gray-600">${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p></div></div>` : ''}
            ${d.phone ? `<div class="flex items-start gap-3"><span class="text-xl mt-0.5">📞</span><div><p class="font-semibold text-[#0f172a]">Phone</p><a href="tel:${esc(d.phone)}" class="text-[#f97316] font-semibold hover:underline">${esc(d.phone)}</a></div></div>` : ''}
            ${email ? `<div class="flex items-start gap-3"><span class="text-xl mt-0.5">✉️</span><div><p class="font-semibold text-[#0f172a]">Email</p><a href="mailto:${esc(email)}" class="text-[#f97316] font-semibold hover:underline">${esc(email)}</a></div></div>` : ''}
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-[#0f172a] text-gray-400 py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <p class="text-white font-black text-xl mb-2">${esc(d.business_name)}</p>
      ${d.phone ? `<p class="text-sm">${esc(d.phone)}</p>` : ''}
      ${d.address ? `<p class="text-sm mt-1">${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p>` : ''}
      <p class="text-xs mt-8 text-gray-600">© ${year} ${esc(d.business_name)} · Powered by <span class="text-[#f97316]">AutoLocal.ai</span></p>
    </div>
  </footer>
  
</div>`
}

// ═══════════════════════════════════════════════════════
// ARTIKA TEMPLATE
// ═══════════════════════════════════════════════════════
function artikaTemplate(d: SiteData): string {
  const accent = d.brand_color_accent || '#b8860b'
  const ctaText = getCtaText(d)
  const email = getEmail(d)
  const heroImg = getHeroImg(d)
  const gallery = getGallery(d)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const year = new Date().getFullYear()

  return `
<div class="min-h-screen" style="background:#faf9f6;color:#3a3a3a;font-family:'Georgia','Times New Roman',serif">
  <style>
    @keyframes artika-fade-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    .artika-fade-up{animation:artika-fade-up 0.8s ease-out both}
    .artika-fade-up-d1{animation-delay:0.1s}
    .artika-fade-up-d2{animation-delay:0.25s}
    .artika-fade-up-d3{animation-delay:0.4s}
  </style>

  <!-- Hero -->
  <section class="relative min-h-screen flex items-center justify-center text-center">
    <div class="absolute inset-0">
      <img src="${esc(heroImg)}" alt="" class="w-full h-full object-cover" style="object-position:center ${d.hero_crop ?? 50}%">
      <div class="absolute inset-0" style="background:linear-gradient(to right, rgba(250,249,246,0.92) 0%, rgba(250,249,246,0.7) 50%, rgba(250,249,246,0.3) 100%)"></div>
    </div>
    <div class="relative z-10 px-6 max-w-3xl mx-auto artika-fade-up">
      ${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" class="h-16 w-16 mx-auto mb-8 rounded-full object-cover">` : ''}
      <h1 class="font-extralight text-5xl sm:text-7xl lg:text-8xl tracking-tight mb-4" style="color:#2a2a2a">${esc(d.business_name)}</h1>
      ${d.tagline ? `<p class="text-xl sm:text-2xl font-light tracking-wide mb-3 artika-fade-up artika-fade-up-d1" style="color:#6b6b6b">${esc(d.tagline)}</p>` : ''}
      ${d.google_rating ? `<p class="text-sm tracking-widest uppercase mb-8 artika-fade-up artika-fade-up-d2" style="color:${accent}">★ ${d.google_rating}${showReviewCount(d) ? ` · ${d.google_review_count} reviews` : ' on Google'}</p>` : ''}
      <a href="${esc(d.cta_url || '#contact')}" class="inline-block px-10 py-4 rounded-full text-white text-base font-medium tracking-widest uppercase transition-all hover:shadow-lg hover:scale-105 artika-fade-up artika-fade-up-d3" style="background:${accent}">${esc(ctaText)}</a>
    </div>
  </section>

  <!-- Intro -->
  <section class="py-24 px-6">
    <div class="max-w-2xl mx-auto text-center">
      <div class="w-12 h-px mx-auto mb-10" style="background:${accent}"></div>
      <p class="font-light text-xl sm:text-2xl leading-relaxed" style="color:#5a5a5a">${esc(d.description || `Welcome to ${d.business_name}${d.city ? ` in ${d.city}` : ''}${d.state ? `, ${d.state}` : ''}.`)}</p>
    </div>
  </section>

  <!-- Services -->
  ${d.services.length > 0 ? `
  <section id="services" class="py-24 px-6">
    <div class="max-w-2xl mx-auto">
      <p class="text-center text-sm font-light tracking-[0.35em] uppercase mb-16" style="color:${accent}">Services</p>
      <div>
        ${d.services.map(s => `
        <div class="flex items-baseline gap-3 py-4 border-b" style="border-color:#e8e5df">
          <span class="text-xl sm:text-2xl font-light whitespace-nowrap" style="color:#2a2a2a">${esc(s.name)}</span>
          <span class="flex-1 border-b border-dotted" style="border-color:#d4d0c8;min-width:2rem"></span>
          ${s.price ? `<span class="text-sm font-light whitespace-nowrap" style="color:#6b6b6b">${esc(s.price)}</span>` : ''}
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Gallery -->
  ${gallery.length > 0 ? `
  <section class="py-24 px-6">
    <div class="max-w-5xl mx-auto">
      <p class="text-center text-sm font-light tracking-[0.35em] uppercase mb-16" style="color:${accent}">Gallery</p>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3" style="grid-auto-rows:200px">
        ${gallery.map((img, i) => `<div class="overflow-hidden rounded-sm ${i === 0 ? 'row-span-2' : i === 3 ? 'col-span-2' : ''}"><img src="${esc(img)}" alt="" class="w-full h-full object-cover transition-transform duration-700 hover:scale-105"></div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Reviews -->
  ${d.reviews.length > 0 ? `
  <section id="reviews" class="py-28 px-6">
    <div class="max-w-3xl mx-auto text-center">
      ${d.reviews.map((r, i) => `<p data-review-text class="font-light italic text-3xl sm:text-4xl lg:text-5xl leading-relaxed" style="color:#3a3a3a${i > 0 ? ';display:none' : ''}">&ldquo;${esc(r.text)}&rdquo;</p>
      <p data-review-author class="mt-8 text-sm tracking-[0.3em] uppercase font-light" style="color:#8a8a8a${i > 0 ? ';display:none' : ''}">— ${esc(r.author)}</p>`).join('')}
      ${d.reviews.length > 1 ? `<div class="flex justify-center gap-2 mt-10">${d.reviews.map((_, i) => `<button data-review-dot data-active-class="w-2 h-2 rounded-full transition-all" data-inactive-class="w-1.5 h-1.5 rounded-full transition-all" class="${i === 0 ? 'w-2 h-2 rounded-full' : 'w-1.5 h-1.5 rounded-full'}" style="background:${i === 0 ? accent : '#d4d0c8'};transform:${i === 0 ? 'scale(1.5)' : 'scale(1)'}"></button>`).join('')}</div>` : ''}
    </div>
  </section>` : ''}

  <!-- Hours -->
  ${Object.keys(d.hours).length > 0 ? `
  <section class="py-24 px-6">
    <div class="max-w-md mx-auto text-center">
      <p class="text-sm font-light tracking-[0.35em] uppercase mb-12" style="color:${accent}">Hours</p>
      <div class="space-y-3">
        ${DAYS_ORDER.filter(day => d.hours[day]).map(day => `<div class="flex justify-between text-sm font-light"><span style="color:#5a5a5a">${DAY_LABELS[day]}</span><span style="color:#8a8a8a">${esc(d.hours[day])}</span></div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Contact -->
  <section id="contact" class="py-24 px-6">
    <div class="max-w-md mx-auto text-center">
      <p class="text-sm font-light tracking-[0.35em] uppercase mb-12" style="color:${accent}">Contact</p>
      <div class="space-y-4 text-sm font-light" style="color:#5a5a5a">
        ${d.address ? `<p>${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p>` : ''}
        ${d.phone ? `<p><a href="tel:${esc(d.phone)}" class="hover:underline" style="color:${accent}">${esc(d.phone)}</a></p>` : ''}
        ${email ? `<p><a href="mailto:${esc(email)}" class="hover:underline" style="color:${accent}">${esc(email)}</a></p>` : ''}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-16 px-6 text-center">
    <div class="w-8 h-px mx-auto mb-8" style="background:#d4d0c8"></div>
    <p class="font-extralight text-xl mb-2" style="color:#2a2a2a">${esc(d.business_name)}</p>
    <p class="text-sm tracking-widest uppercase mt-8" style="color:#b0ada6">© ${year} ${esc(d.business_name)}</p>
  </footer>
  
</div>`
}

// ═══════════════════════════════════════════════════════
// BDE (DARK) TEMPLATE
// ═══════════════════════════════════════════════════════
function bdeTemplate(d: SiteData): string {
  const accent = d.brand_color_accent || '#6366f1'
  const ind = isIndividual(d)
  const ctaText = d.phone ? (ind ? 'Call Me' : 'Call Us') : getCtaText(d)
  const ctaHref = d.phone ? `tel:${esc(d.phone)}` : esc(d.cta_url || '#contact')
  const email = getEmail(d)
  const year = new Date().getFullYear()
  const gallery = getGallery(d)
  const accentLight = lightenHex(accent, 60)

  const stats: { value: string; label: string }[] = []
  if (d.google_rating) stats.push({ value: `${d.google_rating}★`, label: 'Google Rating' })
  if (d.google_review_count >= 20) stats.push({ value: `${d.google_review_count}+`, label: 'Reviews' })
  if (d.phone) stats.push({ value: d.phone, label: 'Call Us' })

  return `
<div class="min-h-screen bg-[#09090b] text-white">
${d.logo_url ? `<div class="absolute top-0 left-0 z-20 p-6"><img src="${esc(d.logo_url)}" alt="" class="h-12 w-12 rounded-xl object-cover" /></div>` : ''}

  <!-- Hero -->
  <section class="relative min-h-screen flex items-center justify-center overflow-hidden">
    ${d.hero_image_url ? `<img src="${esc(d.hero_image_url)}" alt="" class="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" style="object-position:center ${d.hero_crop ?? 50}%">` : ''}
    <div class="absolute inset-0 bg-gradient-to-b from-[#09090b]/30 via-[#09090b]/20 to-[#09090b]/90"></div>
    <div class="relative z-10 max-w-5xl mx-auto px-6 text-center flex flex-col items-center justify-center">
      <h1 class="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] mb-6" style="text-shadow:0 4px 20px rgba(0,0,0,0.6)">${esc(d.business_name)}</h1>
      ${d.tagline ? `<p class="text-xl sm:text-2xl text-gray-200 max-w-2xl mx-auto mb-10 font-normal leading-relaxed" style="text-shadow:0 2px 10px rgba(0,0,0,0.5)">${esc(d.tagline)}</p>` : ''}
      <a href="${ctaHref}" class="inline-flex items-center justify-center px-10 py-5 rounded-xl text-white text-lg font-bold shadow-lg transition-all hover:scale-105" style="background:linear-gradient(135deg,${accent},${accentLight});box-shadow:0 10px 40px -10px ${accent}40">${esc(ctaText)}</a>
    </div>
  </section>

  <!-- Stats -->
  ${stats.length > 0 ? `
  <section class="bg-[#111113] border-y border-white/5">
    <div class="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center divide-x divide-white/10">
      ${stats.map(s => `<div class="px-8 py-2 text-center"><div class="text-2xl sm:text-3xl font-black" style="background:linear-gradient(135deg,${accent},${accentLight});-webkit-background-clip:text;-webkit-text-fill-color:transparent">${esc(s.value)}</div><div class="text-xs uppercase tracking-widest text-gray-500 mt-1">${esc(s.label)}</div></div>`).join('')}
    </div>
  </section>` : ''}

  <!-- About -->
  ${d.description ? `
  <section id="about" class="py-24">
    <div class="max-w-2xl mx-auto px-6">
      <div class="h-1 w-20 rounded-full mb-8" style="background:linear-gradient(135deg,${accent},${accentLight})"></div>
      <p class="text-lg text-gray-300 leading-relaxed">${esc(d.description)}</p>
    </div>
  </section>` : ''}

  <!-- Services -->
  ${d.services.length > 0 ? `
  <section id="services" class="py-24">
    <div class="max-w-5xl mx-auto px-6">
      <h2 class="text-4xl sm:text-5xl font-black tracking-tight mb-16 text-center">Services</h2>
      <div class="grid sm:grid-cols-2 gap-4">
        ${d.services.map(s => `
        <div class="group border border-white/10 rounded-2xl p-8 hover:border-white/25 transition-all bg-white/[0.02]">
          <h3 class="text-xl font-bold text-white mb-3">${esc(s.name)}</h3>
          ${s.description ? `<p class="text-gray-500 leading-relaxed mb-4">${esc(s.description)}</p>` : ''}
          ${s.price ? `<span class="text-lg font-bold" style="background:linear-gradient(135deg,${accent},${accentLight});-webkit-background-clip:text;-webkit-text-fill-color:transparent">${esc(s.price)}</span>` : ''}
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Gallery -->
  ${gallery.length > 0 ? `
  <section class="py-24">
    <div class="max-w-7xl mx-auto px-6">
      <h2 class="text-4xl sm:text-5xl font-black tracking-tight mb-16 text-center">Gallery</h2>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${gallery.map(img => `<div class="overflow-hidden rounded-xl aspect-[4/3]"><img src="${esc(img)}" alt="" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500"></div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- Reviews -->
  ${d.reviews.length > 0 ? `
  <section id="reviews" class="py-24">
    <div class="max-w-3xl mx-auto px-6 text-center">
      <div class="text-8xl font-black leading-none mb-4" style="background:linear-gradient(135deg,${accent},${accentLight});-webkit-background-clip:text;-webkit-text-fill-color:transparent">&ldquo;</div>
      ${d.reviews.map((r, i) => `<p data-review-text class="text-2xl sm:text-3xl text-white leading-relaxed font-normal mb-8" ${i > 0 ? 'style="display:none"' : ''}>${esc(r.text)}</p>
      <p data-review-author class="text-gray-500 text-sm" ${i > 0 ? 'style="display:none"' : ''}>— ${esc(r.author)}${r.date ? `, ${esc(r.date)}` : ''}</p>`).join('')}
      ${d.reviews.length > 1 ? `<div class="flex justify-center gap-2 mt-8">${d.reviews.map((_, i) => `<button data-review-dot data-active-class="h-1.5 w-8 rounded-full transition-all" data-inactive-class="h-1.5 w-3 rounded-full bg-gray-700 transition-all" class="${i === 0 ? 'h-1.5 w-8 rounded-full' : 'h-1.5 w-3 rounded-full bg-gray-700'}" ${i === 0 ? `style="background:linear-gradient(135deg,${accent},${accentLight})"` : ''}></button>`).join('')}</div>` : ''}
    </div>
  </section>` : ''}

  <!-- Contact -->
  ${(Object.keys(d.hours).length > 0 || d.phone || email || d.address) ? `
  <section id="contact" class="py-24 border-t border-white/5">
    <div class="max-w-5xl mx-auto px-6">
      <div class="grid md:grid-cols-2 gap-16">
        ${Object.keys(d.hours).length > 0 ? `
        <div>
          <h3 class="text-2xl font-black mb-8">Hours</h3>
          <div class="space-y-3">
            ${DAYS_ORDER.filter(day => d.hours[day]).map(day => `<div class="flex justify-between py-2 border-b border-white/5 text-gray-400"><span>${DAY_LABELS[day]}</span><span>${esc(d.hours[day])}</span></div>`).join('')}
          </div>
        </div>` : ''}
        <div>
          <h3 class="text-2xl font-black mb-8">Contact</h3>
          <div class="space-y-4 text-gray-400">
            ${d.phone ? `<p><span class="text-gray-600 text-sm block mb-1">Phone</span><a href="tel:${esc(d.phone)}" class="text-lg font-bold" style="background:linear-gradient(135deg,${accent},${accentLight});-webkit-background-clip:text;-webkit-text-fill-color:transparent">${esc(d.phone)}</a></p>` : ''}
            ${email ? `<p><span class="text-gray-600 text-sm block mb-1">Email</span><a href="mailto:${esc(email)}" class="hover:text-white transition">${esc(email)}</a></p>` : ''}
            ${d.address ? `<p><span class="text-gray-600 text-sm block mb-1">Address</span>${esc(d.address)}${d.city ? `, ${esc(d.city)}` : ''}${d.state ? `, ${esc(d.state)}` : ''}</p>` : ''}
          </div>
        </div>
      </div>
    </div>
  </section>` : ''}

  <!-- Footer -->
  <footer class="py-12 border-t border-white/5 text-center">
    <p class="text-white font-black text-lg">${esc(d.business_name)}</p>
    <p class="text-gray-600 text-xs mt-3">© ${year} ${esc(d.business_name)}</p>
  </footer>
  
</div>`
}

// ═══════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════
// NOVELTY TEMPLATES
// ═══════════════════════════════════════════════════════

function myspaceTemplate(d: SiteData): string {
  const ind = isIndividual(d)
  const gallery = getGallery(d)
  const email = getEmail(d)
  const heroImg = getHeroImg(d)
  const daysHtml = DAYS_ORDER.map(day => d.hours[day] ? `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #eee"><span style="color:#666">${DAY_LABELS[day]?.substring(0,3)}</span><span style="color:#333">${esc(d.hours[day])}</span></div>` : '').join('')
  const servicesHtml = d.services.map(s => `<div style="margin-bottom:6px"><span style="color:#003471;font-weight:bold">${esc(s.name)}</span>${s.price ? `<span style="color:#666;margin-left:8px">${esc(s.price)}</span>` : ''}${s.description ? `<div style="color:#666;font-size:10px;margin-top:2px">${esc(s.description)}</div>` : ''}</div>`).join('')
  const galleryHtml = gallery.slice(0, 8).map((img, i) => `<div style="text-align:center"><img src="${esc(img)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border:1px solid #ccc"><div class="ms-link" style="font-size:9px;margin-top:2px">Friend #${i+1}</div></div>`).join('')
  const reviewsHtml = d.reviews.map(r => `<div style="background:#f5f5f5;border:1px solid #ddd;padding:8px;margin-bottom:6px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span class="ms-link" style="font-weight:bold">${esc(r.author)}</span><span style="color:#999;font-size:9px">${esc(r.date || 'Posted recently')}</span></div><div style="color:#333">"${esc(r.text)}"</div><div style="color:#f90;font-size:9px;margin-top:4px">${'⭐'.repeat(r.rating)}</div></div>`).join('')
  const visitors = d.google_review_count ? d.google_review_count * 47 : 1337

  return `
<div style="min-height:100vh;background:#c4cde0;color:#000;font-family:Verdana,Arial,sans-serif;font-size:11px">
<style>.ms-link{color:#003471;text-decoration:underline;cursor:pointer}.ms-link:hover{color:#0066cc}.ms-section{background:#fff;border:1px solid #b5c7de;margin-bottom:8px}.ms-sh{background:#003471;color:#fff;padding:5px 8px;font-weight:bold;font-size:11px;border-bottom:1px solid #00254d}</style>
<div style="background:linear-gradient(180deg,#003471 0%,#00254d 100%);padding:6px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #002244"><span style="font-weight:bold;color:#fff;font-size:16px">yourspace.</span><div style="display:flex;gap:12px;font-size:10px"><span style="color:#fff">Home</span><span style="color:#fff">Mail (2) ▾</span><span style="color:#fff">Profile ▾</span><span style="color:#fff">Friends ▾</span></div></div>
<div style="background:#fff;padding:8px 16px;max-width:960px;margin:0 auto;border-bottom:1px solid #ccc"><h1 style="font-size:16px;font-weight:bold;margin:0">${esc(ind ? d.business_name.split(' ')[0] : d.business_name)}</h1><div style="font-size:10px;color:#666">My URL: <b>yourspace.com/${esc(d.slug || d.business_name?.toLowerCase().replace(/\\s+/g, ''))}</b> [<span class="ms-link">Edit Profile</span>]</div></div>
<div style="display:flex;max-width:960px;margin:0 auto;background:#fff">
<div style="width:240px;flex-shrink:0;padding:8px;border-right:1px solid #ddd">
<div style="margin-bottom:8px"><img src="${esc(heroImg)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;object-position:center ${d.hero_crop ?? 50}%;border:1px solid #999"><div style="text-align:center;margin-top:6px"><div style="color:#000;font-weight:bold;font-size:12px">"${esc(d.tagline || d.business_name)}"</div>${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" style="width:40px;height:40px;border-radius:50%;margin:6px auto;display:block;object-fit:cover">` : ''}<div style="color:#666;font-size:10px;margin-top:4px">${ind ? 'Profile' : 'Business'} · ${esc(d.city || 'Somewhere')}, ${esc(d.state || 'US')}</div></div></div>
<div style="font-size:10px;color:#333;padding:4px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd;margin-bottom:8px"><div><b>Profile Views:</b> ${visitors}</div><div><b>Last Login:</b> Today</div></div>
<div class="ms-section"><div class="ms-sh">Contacting ${ind ? 'Me' : 'Us'}</div><div style="padding:6px">${d.phone ? `<div style="padding:4px 0;border-bottom:1px solid #eee"><a href="tel:${esc(d.phone)}" class="ms-link">📞 ${ind ? 'Call Me' : 'Call Us'}</a></div>` : ''}${email ? `<div style="padding:4px 0;border-bottom:1px solid #eee"><a href="mailto:${esc(email)}" class="ms-link">✉️ Send Message</a></div>` : ''}<div style="padding:4px 0"><span class="ms-link" style="color:#003471;font-weight:bold">⭐ Add to Friends</span></div></div></div>
</div>
<div style="flex:1;padding:8px;min-width:0;background:#fff">
${d.description ? `<div class="ms-section"><div class="ms-sh">About ${ind ? 'Me' : 'Us'}</div><div style="padding:8px;color:#333;line-height:1.6">${esc(d.description)}</div></div>` : ''}
${d.services.length > 0 ? `<div class="ms-section"><div class="ms-sh">${ind ? 'My Services' : 'Our Services'}</div><div style="padding:8px">${servicesHtml}</div></div>` : ''}
${gallery.length > 0 ? `<div class="ms-section"><div class="ms-sh">${esc(d.business_name)}'s Top ${Math.min(gallery.length, 8)} Friends</div><div style="padding:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${galleryHtml}</div></div>` : ''}
${Object.keys(d.hours).length > 0 ? `<div class="ms-section"><div class="ms-sh">Hours</div><div style="padding:8px">${daysHtml}</div></div>` : ''}
${d.reviews.length > 0 ? `<div class="ms-section"><div class="ms-sh">${esc(d.business_name)}'s Comments (${d.reviews.length})</div><div style="padding:8px">${reviewsHtml}</div></div>` : ''}
</div></div>
<div style="background:#003471;text-align:center;padding:12px;border-top:2px solid #002244"><div style="display:inline-block;background:#fff;border:1px solid #999;padding:2px 8px;font-size:10px;color:#333">Visitors: ${visitors}</div><div style="color:#5b8fb9;font-size:8px;margin-top:8px"></div></div>

</div>`
}

function aimTemplate(d: SiteData): string {
  const ind = isIndividual(d)
  const gallery = getGallery(d)
  const email = getEmail(d)
  const warningLevel = d.google_rating ? Math.round((d.google_rating / 5) * 100) : 0
  const servBuddies = d.services.map(s => `<div style="padding:2px 4px 2px 20px;font-size:11px;display:flex;align-items:center;gap:4px"><span style="color:#0a0;font-size:8px">●</span><span>${esc(s.name)}</span>${s.price ? `<span style="color:#888;font-size:9px;margin-left:auto">${esc(s.price)}</span>` : ''}</div>`).join('')
  const hoursBuddies = DAYS_ORDER.map(day => d.hours[day] ? `<div style="padding:2px 4px 2px 20px;font-size:11px;display:flex;align-items:center;gap:4px"><span style="color:${d.hours[day].toLowerCase()==='closed' ? '#c80' : '#0a0'};font-size:8px">●</span><span>${DAY_LABELS[day]?.substring(0,3)}: ${esc(d.hours[day])}</span></div>` : '').join('')
  const chatMsgs = d.reviews.map(r => `<div style="padding:4px 8px;line-height:1.5"><span style="font-weight:bold;color:#060">${esc(r.author)}:</span> "${esc(r.text)}" ${'⭐'.repeat(r.rating)}</div>`).join('')

  return `
<div style="min-height:100vh;background:#d4d0c8;font-family:Tahoma,Arial,sans-serif;font-size:12px;color:#000">
<style>.aim-w{background:#ece9d8;border:2px outset #dfdfdf;box-shadow:2px 2px 8px rgba(0,0,0,.3)}.aim-tb{background:linear-gradient(180deg,#0058a8,#003c7a);color:white;padding:3px 6px;display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:bold}.aim-btn{width:16px;height:14px;background:#c0c0c0;border:1px outset #dfdfdf;display:inline-flex;align-items:center;justify-content:center;font-size:9px}.aim-bg{background:#d4d0c8;padding:2px 4px;font-weight:bold;font-size:11px;cursor:pointer;border-bottom:1px solid #bbb}</style>
<div style="display:flex;max-width:900px;margin:0 auto;padding:20px;gap:12px;min-height:100vh">
<div class="aim-w" style="width:220px;flex-shrink:0;display:flex;flex-direction:column">
<div class="aim-tb"><span>${ind ? 'My' : 'Our'} Buddy List</span><div style="display:flex;gap:2px"><div class="aim-btn">_</div><div class="aim-btn">□</div><div class="aim-btn">✕</div></div></div>
<div style="text-align:center;padding:8px;background:#fff;border-bottom:1px solid #bbb">${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover">` : '<div style="font-size:36px">🏃</div>'}<div style="font-size:10px;color:#666;margin-top:2px">${esc(d.business_name)}</div></div>
<div style="flex:1;overflow:auto;background:#fff">
${d.services.length > 0 ? `<div><div class="aim-bg">📂 Services (${d.services.length})</div>${servBuddies}</div>` : ''}
${Object.keys(d.hours).length > 0 ? `<div><div class="aim-bg">📂 Hours</div>${hoursBuddies}</div>` : ''}
<div><div class="aim-bg">📂 Contact</div>${d.phone ? `<div style="padding:2px 4px 2px 20px;font-size:11px"><span style="color:#0a0;font-size:8px">●</span> <a href="tel:${esc(d.phone)}" style="color:inherit;text-decoration:none">${esc(d.phone)}</a></div>` : ''}${email ? `<div style="padding:2px 4px 2px 20px;font-size:10px"><span style="color:#0a0;font-size:8px">●</span> ${esc(email)}</div>` : ''}</div>
${gallery.length > 0 ? `<div><div class="aim-bg">📂 Photos (${gallery.length})</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:4px">${gallery.slice(0,9).map(img => `<img src="${esc(img)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover">`).join('')}</div></div>` : ''}
</div>
<div style="background:#ffffcc;border:1px solid #cc9;padding:6px;text-align:center;font-size:10px"><div style="font-weight:bold;color:#630">📢 ${esc(d.tagline || 'Visit ' + d.business_name + '!')}</div>${d.phone ? `<a href="tel:${esc(d.phone)}" style="color:#06c;font-weight:bold;font-size:11px">${ind ? 'Call Me' : 'Call Us'}: ${esc(d.phone)}</a>` : ''}</div>
</div>
<div class="aim-w" style="flex:1;display:flex;flex-direction:column">
<div class="aim-tb"><span>💬 Instant Message with ${esc(d.business_name)}</span><div style="display:flex;gap:2px"><div class="aim-btn">_</div><div class="aim-btn">□</div><div class="aim-btn">✕</div></div></div>
${d.google_rating ? `<div style="background:#ece9d8;padding:2px 8px;border-bottom:1px solid #bbb;display:flex;align-items:center;gap:6px;font-size:10px"><span>Warning Level:</span><div style="flex:1;max-width:120px;height:10px;background:#fff;border:1px inset #888"><div style="width:${warningLevel}%;height:100%;background:${warningLevel>80?'#0a0':warningLevel>60?'#ca0':'#c00'}"></div></div><span style="font-weight:bold">${warningLevel}%</span><span style="color:#888">(${d.google_rating}★)</span></div>` : ''}
${d.hero_image_url ? `<div style="padding:8px;background:#fff;border-bottom:1px solid #bbb"><img src="${esc(d.hero_image_url)}" alt="" style="width:100%;max-height:250px;object-fit:cover;object-position:center ${d.hero_crop ?? 50}%;border:1px solid #ccc"></div>` : ''}
<div style="flex:1;background:#fff;overflow:auto;padding:4px">
<div style="padding:4px 8px;line-height:1.5"><span style="font-weight:bold;color:#00c">${esc(d.business_name)}:</span> 🚪 ${esc(d.business_name)} has entered the chat</div>
${d.description ? `<div style="padding:4px 8px;line-height:1.5"><span style="font-weight:bold;color:#00c">${esc(d.business_name)}:</span> ${esc(d.description)}</div>` : ''}
${d.services.length > 0 ? `<div style="padding:4px 8px"><span style="font-weight:bold;color:#c00">You:</span> What services do you offer?</div><div style="padding:4px 8px"><span style="font-weight:bold;color:#00c">${esc(d.business_name)}:</span> ${ind ? 'I offer' : 'We offer'}: ${d.services.map(s => esc(s.name)).join(', ')}</div>` : ''}
${d.reviews.length > 0 ? `<div style="border-top:1px solid #eee;margin-top:8px;padding-top:8px;padding-left:8px;color:#888;font-size:10px">— What people are saying —</div>${chatMsgs}` : ''}
</div>
<div style="padding:4px;background:#ece9d8;border-top:1px solid #bbb"><textarea style="width:100%;border:2px inset #888;padding:4px;font-family:Tahoma,Arial,sans-serif;font-size:12px;background:white;resize:none" rows="2" placeholder="Send a message..." readonly></textarea><div style="display:flex;justify-content:flex-end;gap:4px;margin-top:4px"><a href="${d.phone ? `tel:${esc(d.phone)}` : '#'}" style="padding:3px 16px;background:#ece9d8;border:2px outset #dfdfdf;font-size:11px;font-weight:bold;text-decoration:none;color:#000">${d.phone ? (ind ? 'Call Me' : 'Call Us') : 'Send'}</a></div></div>
<div style="background:#ece9d8;padding:2px 6px;border-top:1px solid #bbb;font-size:9px;color:#888;text-align:center"></div>
</div></div>

</div>`
}

function win95Template(d: SiteData): string {
  const ind = isIndividual(d)
  const gallery = getGallery(d)
  const email = getEmail(d)
  const servicesHtml = d.services.map(s => `<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid #a0a0a0"><div style="width:13px;height:13px;border:2px inset #808080;background:white;display:inline-flex;align-items:center;justify-content:center;font-size:10px;margin-right:6px">✓</div><div style="flex:1"><span style="font-weight:bold">${esc(s.name)}</span>${s.price ? `<span style="color:#000080;margin-left:8px">${esc(s.price)}</span>` : ''}${s.description ? `<div style="color:#444;font-size:10px;margin-top:2px">${esc(s.description)}</div>` : ''}</div></div>`).join('')
  const galleryHtml = gallery.map((img, i) => `<div style="text-align:center"><div style="border:1px solid #808080;padding:2px;background:#fff"><img src="${esc(img)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;display:block"></div><div style="font-size:9px;color:#444;margin-top:2px">photo_${i+1}.jpg</div></div>`).join('')
  const hoursHtml = DAYS_ORDER.map(day => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #ccc"><span style="font-weight:${d.hours[day]?'bold':'normal'};color:${d.hours[day]?'#000':'#888'}">${DAY_LABELS[day]}</span><span>${esc(d.hours[day] || 'Closed')}</span></div>`).join('')
  const reviewsHtml = d.reviews.map(r => `<div style="border:2px inset #808080;background:#fff;padding:8px;margin-bottom:6px"><div style="display:flex;justify-content:space-between"><span style="font-weight:bold;color:#000080">${esc(r.author)}</span><span style="color:#888;font-size:9px">${esc(r.date||'')}</span></div><div style="color:#c80;font-size:10px">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div><div style="margin-top:4px">"${esc(r.text)}"</div></div>`).join('')

  return `
<div style="min-height:100vh;background:#008080;font-family:'MS Sans Serif',Tahoma,Arial,sans-serif;font-size:11px;color:#000;cursor:default;padding-bottom:36px">
<style>.w95-w{background:#c0c0c0;border:2px outset #dfdfdf;box-shadow:2px 2px 0 #000}.w95-tb{background:#000080;color:white;padding:2px 4px;display:flex;align-items:center;justify-content:space-between;font-weight:bold;font-size:11px}.w95-b{width:16px;height:14px;background:#c0c0c0;border:1px outset #dfdfdf;display:inline-flex;align-items:center;justify-content:center;font-size:8px}.w95-btn{padding:3px 16px;border:2px outset #dfdfdf;background:#c0c0c0;font-family:inherit;font-size:11px;cursor:pointer;text-decoration:none;color:#000;display:inline-block}</style>
<div class="hidden sm:flex" style="padding:16px;flex-direction:column;gap:24px;position:absolute;top:0;left:8px">
<div style="text-align:center;width:64px"><div style="font-size:32px">💻</div><div style="color:white;font-size:11px;text-shadow:1px 1px 0 #000">My Computer</div></div>
<div style="text-align:center;width:64px"><div style="font-size:32px">📁</div><div style="color:white;font-size:11px;text-shadow:1px 1px 0 #000">My Documents</div></div>
</div>
<div class="w95-w" style="max-width:720px;margin:24px auto">
<div class="w95-tb"><div style="display:flex;align-items:center;gap:4px">${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" style="width:16px;height:16px;object-fit:cover">` : ''}<span>${esc(d.business_name)} — Properties</span></div><div style="display:flex;gap:2px"><div class="w95-b">_</div><div class="w95-b">□</div><div class="w95-b">✕</div></div></div>
<div style="background:#c0c0c0;padding:1px 0;border-bottom:1px solid #808080"><span style="padding:1px 8px;font-size:11px">File</span><span style="padding:1px 8px;font-size:11px">Edit</span><span style="padding:1px 8px;font-size:11px">View</span><span style="padding:1px 8px;font-size:11px">Help</span></div>
${d.hero_image_url ? `<div style="padding:8px 8px 0"><div style="border:2px inset #808080;background:#fff;padding:2px"><img src="${esc(d.hero_image_url)}" alt="" style="width:100%;max-height:280px;object-fit:cover;object-position:center ${d.hero_crop ?? 50}%;display:block"></div></div>` : ''}
<div style="margin:0 8px 8px;border:2px inset #808080;background:#c0c0c0;padding:12px;min-height:300px">
<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">${d.logo_url ? `<img src="${esc(d.logo_url)}" alt="" style="width:48px;height:48px;object-fit:cover;border:1px solid #808080">` : ''}<div><div style="font-weight:bold;font-size:14px">${esc(d.business_name)}</div>${d.tagline ? `<div style="color:#444;margin-top:2px">${esc(d.tagline)}</div>` : ''}${d.google_rating ? `<div style="margin-top:4px;color:#000080">★ ${d.google_rating}/5${d.google_review_count >= 20 ? ` (${d.google_review_count} reviews)` : ''}</div>` : ''}</div></div>
${d.description ? `<div style="border:2px inset #808080;background:#fff;padding:8px;line-height:1.6;margin-bottom:12px">${esc(d.description)}</div>` : ''}
<div style="font-weight:bold;margin-bottom:4px">📋 Contact Information:</div>
<div style="border:2px inset #808080;background:#fff;padding:8px;margin-bottom:12px">${d.phone ? `<div>📞 Phone: <a href="tel:${esc(d.phone)}" style="color:#000080">${esc(d.phone)}</a></div>` : ''}${email ? `<div>✉️ Email: <a href="mailto:${esc(email)}" style="color:#000080">${esc(email)}</a></div>` : ''}${d.address ? `<div>📍 Address: ${esc(d.address)}${d.city ? ', '+esc(d.city) : ''}${d.state ? ', '+esc(d.state) : ''}</div>` : ''}</div>
${d.services.length > 0 ? `<div style="font-weight:bold;margin-bottom:8px">📋 Available Services:</div>${servicesHtml}` : ''}
${gallery.length > 0 ? `<div style="font-weight:bold;margin:12px 0 8px">📁 My Pictures</div><div style="border:2px inset #808080;background:#fff;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px">${galleryHtml}</div>` : ''}
${Object.keys(d.hours).length > 0 ? `<div style="font-weight:bold;margin:12px 0 8px">🕐 Business Hours:</div><div style="border:2px inset #808080;background:#fff;padding:8px">${hoursHtml}</div>` : ''}
${d.reviews.length > 0 ? `<div style="font-weight:bold;margin:12px 0 8px">💬 Reviews:</div>${reviewsHtml}` : ''}
</div>
<div style="padding:0 8px 8px;display:flex;justify-content:flex-end;gap:6px">${d.phone ? `<a href="tel:${esc(d.phone)}" class="w95-btn" style="font-weight:bold">📞 ${ind ? 'Call Me' : 'Call Us'}</a>` : ''}<span class="w95-btn">OK</span><span class="w95-btn">Cancel</span></div>
</div>
<div style="position:fixed;bottom:0;left:0;right:0;height:28px;background:#c0c0c0;border-top:2px outset #dfdfdf;display:flex;align-items:center;padding:2px 4px;z-index:50"><div style="border:2px outset #dfdfdf;background:#c0c0c0;padding:2px 8px;display:flex;align-items:center;gap:4px;font-weight:bold;font-size:11px;height:22px">🪟 Start</div><div style="flex:1;padding:0 8px"><div style="border:2px outset #dfdfdf;padding:2px 8px;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📋 ${esc(d.business_name)}</div></div><div style="border:1px inset #808080;padding:2px 8px;font-size:11px">${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}</div></div>
<div style="text-align:center;padding-bottom:40px;color:#006666;font-size:9px"></div>

</div>`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _pokemonTemplate(d: SiteData): string {
  const ind = isIndividual(d)
  const heroImg = getHeroImg(d)
  const gallery = getGallery(d)
  const accent = d.brand_color_accent || '#6890f0'
  const hp = d.google_rating ? Math.round(d.google_rating * 20) : 80
  const attacksHtml = d.services.slice(0, 4).map((s, i) => `<div style="padding:8px 0;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:8px"><div style="display:flex;gap:1px">${Array.from({length:Math.min(i+1,3)}).map(() => `<span style="width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;background:${accent};border:1px solid rgba(0,0,0,.2)">W</span>`).join('')}</div><div style="flex:1"><div style="font-weight:bold;font-size:14px">${esc(s.name)}</div>${s.description ? `<div style="font-size:10px;color:#666;font-style:italic">${esc(s.description)}</div>` : ''}</div><div style="font-size:20px;font-weight:bold;color:#333">${esc(s.price || String((i+1)*30))}</div></div>`).join('')
  const reviewsHtml = d.reviews.map(r => `<div style="background:rgba(255,255,255,.08);border-radius:12px;padding:12px;margin-bottom:8px;border:1px solid rgba(255,255,255,.1)"><div style="display:flex;justify-content:space-between;align-items:center"><span style="color:#fff;font-weight:bold;font-size:12px">${esc(r.author)}</span><span style="color:#ffd700;font-size:11px">${'★'.repeat(r.rating)}</span></div><div style="color:#ccc;font-size:11px;margin-top:4px;font-style:italic">"${esc(r.text)}"</div></div>`).join('')
  const hoursHtml = DAYS_ORDER.map(day => d.hours[day] ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);color:#ccc;font-size:12px"><span>${DAY_LABELS[day]?.substring(0,3)}</span><span>${esc(d.hours[day])}</span></div>` : '').join('')
  const galleryHtml = gallery.map(img => `<div style="border-radius:8px;overflow:hidden;border:2px solid #ffd700;aspect-ratio:3/4"><img src="${esc(img)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`).join('')

  return `
<div style="min-height:100vh;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);font-family:'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;padding:24px 16px">
<style>@keyframes holo{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}.poke-holo{position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,0,0,.08) 0%,rgba(255,165,0,.08) 15%,rgba(255,255,0,.08) 30%,rgba(0,128,0,.08) 45%,rgba(0,0,255,.08) 60%,rgba(75,0,130,.08) 75%,rgba(238,130,238,.08) 100%);background-size:400% 400%;animation:holo 4s ease infinite;pointer-events:none;border-radius:16px;z-index:2}</style>
<div style="max-width:420px;width:100%;border-radius:16px;padding:12px;position:relative;overflow:hidden;background:linear-gradient(145deg,#f5f5dc 0%,#eef3ff 30%,#fffde8 100%);border:6px solid ${accent};box-shadow:0 8px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.5)">
<div class="poke-holo"></div>
<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 4px 8px;position:relative;z-index:1"><div><div style="font-size:9px;color:#888">Stage 1 — Evolves from ${esc(d.city || 'local')} startup</div><div style="font-size:20px;font-weight:bold;color:#333">${esc(d.business_name)}</div></div><div style="text-align:right"><span style="font-size:12px;color:#888">HP </span><span style="font-size:24px;font-weight:bold;color:#c00">${hp}</span></div></div>
<div style="border:3px solid ${accent};border-radius:8px;overflow:hidden;margin:0 4px;position:relative;z-index:1"><img src="${esc(heroImg)}" alt="" style="width:100%;height:220px;object-fit:cover;object-position:center ${d.hero_crop ?? 50}%;display:block">${d.logo_url ? `<div style="position:absolute;bottom:8px;right:8px;width:40px;height:40px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3)"><img src="${esc(d.logo_url)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>` : ''}</div>
<div style="display:flex;justify-content:space-between;padding:6px 8px;font-size:10px;color:#666;position:relative;z-index:1"><span>${esc(d.city || 'Local')}${d.state ? ', '+esc(d.state) : ''}</span><span>No. 001 · ${ind ? 'Solo' : 'Business'}</span></div>
<div style="padding:4px 8px;position:relative;z-index:1">${attacksHtml || `<div style="padding:8px 0;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:8px"><span style="width:18px;height:18px;border-radius:50%;background:${accent};display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:bold">W</span><div style="flex:1"><div style="font-weight:bold;font-size:14px">Tackle</div><div style="font-size:10px;color:#666;font-style:italic">A basic but effective approach</div></div><div style="font-size:20px;font-weight:bold">40</div></div>`}</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid #ccc;padding:8px;font-size:10px;position:relative;z-index:1"><div style="text-align:center"><div style="color:#888;font-size:9px">weakness</div><div>🔥 ×2</div></div><div style="text-align:center"><div style="color:#888;font-size:9px">resistance</div><div>🛡️ -30</div></div><div style="text-align:center"><div style="color:#888;font-size:9px">retreat cost</div><div>⚪</div></div></div>
<div style="padding:8px;font-size:10px;font-style:italic;color:#555;border-top:1px solid #ccc;line-height:1.5;position:relative;z-index:1">${esc(d.description || d.business_name + ' is known throughout ' + (d.city || 'the region') + ' for providing exceptional services.')}</div>
<div style="display:flex;justify-content:space-between;padding:4px 8px 2px;font-size:8px;color:#999;position:relative;z-index:1"><span>Illus. AutoLocal.ai</span><span>©${new Date().getFullYear()} ${esc(d.business_name)}</span><span>001/001 ★</span></div>
</div>
<a href="${d.phone ? `tel:${esc(d.phone)}` : '#'}" style="display:inline-block;margin-top:24px;padding:14px 40px;background:${accent};color:#fff;border-radius:50px;font-weight:bold;font-size:16px;text-decoration:none;box-shadow:0 4px 20px ${accent}66">${d.phone ? (ind ? '📱 Call Me' : '📱 Call Us') : 'Get Started'}</a>
${d.reviews.length > 0 ? `<div style="max-width:420px;width:100%;margin-top:24px"><div style="color:#fff;font-size:14px;font-weight:bold;margin-bottom:8px;text-align:center">⚡ Trainer Reviews</div>${reviewsHtml}</div>` : ''}
${gallery.length > 0 ? `<div style="max-width:420px;width:100%;margin-top:24px"><div style="color:#fff;font-size:14px;font-weight:bold;margin-bottom:8px;text-align:center">🃏 Card Collection</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${galleryHtml}</div></div>` : ''}
${Object.keys(d.hours).length > 0 ? `<div style="max-width:420px;width:100%;margin-top:24px;background:rgba(255,255,255,.05);border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,.1)"><div style="color:#fff;font-size:14px;font-weight:bold;margin-bottom:8px;text-align:center">🕐 Gym Hours</div>${hoursHtml}</div>` : ''}
<div style="max-width:420px;width:100%;margin-top:16px;text-align:center;padding:16px;color:#888;font-size:11px">${d.address ? `<div>📍 ${esc(d.address)}${d.city?', '+esc(d.city):''}${d.state?', '+esc(d.state):''}</div>` : ''}${d.phone ? `<div style="margin-top:4px">📞 ${esc(d.phone)}</div>` : ''}<div style="margin-top:12px;color:#555;font-size:9px"></div></div>

</div>`
}

function receiptTemplate(d: SiteData): string {
  const ind = isIndividual(d)
  const gallery = getGallery(d)
  const email = getEmail(d)
  const now = new Date()
  const dateStr = `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${now.getFullYear()}`
  const txn = d.google_review_count ? String(d.google_review_count * 73).padStart(6, '0') : '001337'
  const div1 = '════════════════════════════════════════'
  const div2 = '────────────────────────────────────────'
  const servicesHtml = d.services.map(s => `<div style="display:flex;justify-content:space-between;align-items:baseline"><span>${esc(s.name.toUpperCase())}</span><span style="flex:1;border-bottom:1px dotted #ccc;margin:0 4px;min-width:20px;align-self:flex-end;margin-bottom:3px"></span><span>${esc(s.price || '---')}</span></div>${s.description ? `<div style="font-size:11px;color:#555;padding-left:8px">&nbsp;&nbsp;${esc(s.description)}</div>` : ''}`).join('')
  const hoursHtml = DAYS_ORDER.map(day => d.hours[day] ? `<div style="display:flex;justify-content:space-between;align-items:baseline"><span>${day.toUpperCase()}</span><span style="flex:1;border-bottom:1px dotted #ccc;margin:0 4px;min-width:20px;align-self:flex-end;margin-bottom:3px"></span><span>${esc(d.hours[day])}</span></div>` : '').join('')
  const reviewsHtml = d.reviews.map((r, i) => `<div style="margin-bottom:8px;font-size:11px"><div style="display:flex;justify-content:space-between"><span style="font-weight:bold">#${i+1} — ${esc(r.author)}</span><span>${'★'.repeat(r.rating)}</span></div><div style="color:#555;font-style:italic">"${esc(r.text)}"</div></div>`).join('')
  const barcodeHtml = Array.from({length:40}).map(() => `<span style="display:inline-block;height:40px;background:#1a1a1a;width:${Math.random()>0.5?'2':'1'}px"></span>`).join('')
  const galleryHtml = gallery.slice(0,6).map(img => `<img src="${esc(img)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;filter:contrast(1.05)">`).join('')

  return `
<div style="min-height:100vh;background:#e8e4de;font-family:'Courier New',Courier,monospace;display:flex;justify-content:center;padding:32px 16px">
<style>.r-div{color:#555;overflow:hidden;white-space:nowrap;text-align:center;letter-spacing:1px}.r-thin{color:#777;overflow:hidden;white-space:nowrap;text-align:center}.r-ctr{text-align:center}.receipt{max-width:420px;width:100%;background:#fafaf7;padding:32px 24px;box-shadow:0 2px 20px rgba(0,0,0,.1),0 0 0 1px rgba(0,0,0,.05);position:relative;color:#1a1a1a;font-size:12px;line-height:1.6}.receipt::after{content:'';position:absolute;bottom:-12px;left:0;right:0;height:12px;background:linear-gradient(135deg,#fafaf7 33.33%,transparent 33.33%) -12px 0,linear-gradient(225deg,#fafaf7 33.33%,transparent 33.33%) -12px 0,linear-gradient(315deg,#fafaf7 33.33%,transparent 33.33%),linear-gradient(45deg,#fafaf7 33.33%,transparent 33.33%);background-size:24px 12px}</style>
<div class="receipt">
${d.logo_url ? `<div class="r-ctr" style="margin-bottom:12px"><img src="${esc(d.logo_url)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;filter:grayscale(30%)"></div>` : ''}
<div class="r-ctr" style="font-weight:bold;font-size:22px;letter-spacing:3px;margin-bottom:4px">${esc(d.business_name.toUpperCase())}</div>
${d.tagline ? `<div class="r-ctr" style="font-size:12px;color:#666;margin-bottom:4px">${esc(d.tagline)}</div>` : ''}
<div class="r-ctr" style="font-size:12px;color:#555;margin-bottom:8px">${d.address ? `<div>${esc(d.address)}</div>` : ''}${d.city ? `<div>${esc(d.city)}${d.state ? ', '+esc(d.state) : ''}</div>` : ''}${d.phone ? `<div>TEL: ${esc(d.phone)}</div>` : ''}${email ? `<div>${esc(email)}</div>` : ''}</div>
<div class="r-div">${div1}</div>
<div style="display:flex;justify-content:space-between;font-size:12px;color:#666;padding:4px 0"><span>DATE: ${dateStr}</span><span>TXN #: ${txn}</span></div>
<div class="r-thin">${div2}</div>
${d.hero_image_url ? `<div style="margin:8px 0"><img src="${esc(d.hero_image_url)}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;object-position:center ${d.hero_crop ?? 50}%;filter:contrast(1.1);border:1px solid #ddd"></div>` : ''}
${d.services.length > 0 ? `<div style="margin:8px 0"><div style="font-weight:bold;margin-bottom:4px">SERVICES</div>${servicesHtml}</div><div class="r-thin">${div2}</div><div style="margin:4px 0 8px"><div style="display:flex;justify-content:space-between"><span>ITEMS</span><span style="flex:1;border-bottom:1px dotted #ccc;margin:0 4px;align-self:flex-end;margin-bottom:3px"></span><span>${d.services.length}</span></div><div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:4px"><span>SATISFACTION</span><span style="flex:1;border-bottom:1px dotted #ccc;margin:0 4px;align-self:flex-end;margin-bottom:3px"></span><span>GUARANTEED</span></div></div>` : ''}
<div class="r-div">${div1}</div>
${d.description ? `<div style="border:1px dashed #ccc;padding:8px;margin:8px 0;font-size:11px"><div style="font-weight:bold;font-size:12px;margin-bottom:4px">*** MEMO ***</div>${esc(d.description)}</div>` : ''}
${Object.keys(d.hours).length > 0 ? `<div style="margin:8px 0"><div style="font-weight:bold;margin-bottom:4px">HOURS OF OPERATION</div>${hoursHtml}</div><div class="r-thin">${div2}</div>` : ''}
${d.reviews.length > 0 ? `<div style="margin:8px 0"><div style="font-weight:bold;margin-bottom:4px">CUSTOMER REVIEWS</div>${reviewsHtml}</div>` : ''}
${d.google_rating ? `<div class="r-thin">${div2}</div><div class="r-ctr" style="font-weight:bold;margin:8px 0">RATING: ${'★'.repeat(Math.round(d.google_rating))}${'☆'.repeat(5-Math.round(d.google_rating))} (${d.google_rating})${d.google_review_count >= 20 ? `<div style="font-size:12px;color:#555">${d.google_review_count} REVIEWS ON GOOGLE</div>` : ''}</div>` : ''}
<div class="r-div">${div1}</div>
${gallery.length > 0 ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:8px 0">${galleryHtml}</div>` : ''}
<div style="display:flex;justify-content:center;gap:1px;margin:16px 0 8px">${barcodeHtml}</div>
<div class="r-ctr" style="font-weight:bold;font-size:14px;letter-spacing:2px;margin:8px 0">THANK YOU!</div>
${d.phone ? `<div class="r-ctr" style="margin:8px 0"><a href="tel:${esc(d.phone)}" style="display:inline-block;border:2px solid #1a1a1a;padding:8px 24px;font-weight:bold;font-size:14px;color:#1a1a1a;text-decoration:none;font-family:inherit;letter-spacing:1px">${ind ? 'CALL ME' : 'CALL US'}: ${esc(d.phone)}</a></div>` : ''}
<div class="r-ctr" style="font-size:11px;color:#777;margin-top:16px"></div>
</div>

</div>`
}

const TEMPLATE_MAP: Record<string, (d: SiteData) => string> = {
  modern: bdeTemplate,
  bold: boldTemplate,
  elegant: elegantTemplate,
  // professional: professionalTemplate, // removed
  clutch: clutchTemplate,
  artika: artikaTemplate,
  bde: bdeTemplate,
  myspace: myspaceTemplate,
  aim: aimTemplate,
  win95: win95Template,
  // pokemon: pokemonTemplate, // removed
  receipt: receiptTemplate,
}

/** Archived generators are retained for reference; production exports use the tested shared renderer. */
function generateArchivedStaticHtml(data: any, template: string, options: SiteRenderOptions = {}): string {
  const selected = template || categoryToProfessionalTemplate(data.category || '')
  if (isSiteTemplate(selected) || !(selected in TEMPLATE_MAP)) {
    return generateProfessionalHtml(data, isSiteTemplate(selected) ? selected : categoryToProfessionalTemplate(data.category || ''), options)
  }
  // Keep older designs available, but exclude unconfirmed testimonials and private account emails.
  data = { ...data, email: null, reviews: data.reviews_verified ? data.reviews || [] : [],
    google_rating: data.reviews_verified ? data.google_rating : null,
    google_review_count: data.reviews_verified ? data.google_review_count : 0,
    logo_url: safeWebUrl(data.logo_url) || null,
    hero_image_url: safeWebUrl(data.hero_image_url) || null,
    gallery_images: Array.isArray(data.gallery_images) ? data.gallery_images.map(safeWebUrl).filter(Boolean) : [],
    cta_url: /^tel:\+?[\d\s()-]+$/i.test(data.cta_url || '') ? `tel:${data.cta_url.slice(4).replace(/[^+\d]/g, '')}` : safeWebUrl(data.cta_url) || null,
    brand_color_primary: /^#[0-9a-f]{6}$/i.test(data.brand_color_primary || '') ? data.brand_color_primary : '#142e29',
    brand_color_accent: /^#[0-9a-f]{6}$/i.test(data.brand_color_accent || '') ? data.brand_color_accent : '#506c52',
  }
  const renderFn = TEMPLATE_MAP[selected]
  const body = renderFn(data as SiteData)

  const siteUrl = resolveSiteUrl(data, options.siteUrl)
  const desc = esc(data.description || data.tagline || `${data.business_name} — serving ${data.city || 'the community'}`)
  const title = `${esc(data.business_name)} — ${esc(data.city || '')}${data.state ? `, ${esc(data.state)}` : ''}`

  // JSON-LD structured data for search engines + ChatGPT
  const services = (data as SiteData).services || []

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: data.business_name,
    ...(data.description && { description: data.description }),
    ...(data.tagline && { slogan: data.tagline }),
    url: siteUrl,
    ...(data.logo_url && { logo: data.logo_url, image: data.hero_image_url || data.logo_url }),
    ...(data.hero_image_url && { image: data.hero_image_url }),
    ...(data.phone && { telephone: data.phone }),
    ...((data.email || (data as SiteData).contact_email) && { email: (data as SiteData).contact_email || data.email }),
    ...(data.address && {
      address: {
        '@type': 'PostalAddress',
        streetAddress: data.address,
        ...(data.city && { addressLocality: data.city }),
        ...(data.state && { addressRegion: data.state }),
        addressCountry: 'US',
      }
    }),
    ...(data.google_rating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: data.google_rating,
        ...(data.google_review_count && { reviewCount: data.google_review_count }),
        bestRating: 5,
      }
    }),
    ...(services.length > 0 && {
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Services',
        itemListElement: services.map(s => ({
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: s.name,
            ...(s.description && { description: s.description }),
          },
          ...(s.price && { price: s.price }),
        })),
      }
    }),
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="autolocal-site" content="${esc(data.slug)}">
<meta name="robots" content="index,follow">
<title>${title}</title>
<meta name="description" content="${desc}">
<!-- Open Graph / Social sharing -->
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${esc(siteUrl)}">
${data.hero_image_url ? `<meta property="og:image" content="${esc(data.hero_image_url)}">` : ''}
${data.logo_url ? `<meta property="og:image" content="${esc(data.logo_url)}">` : ''}
<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${data.hero_image_url ? `<meta name="twitter:image" content="${esc(data.hero_image_url)}">` : ''}
<!-- Canonical URL -->
<link rel="canonical" href="${esc(siteUrl)}">
<!-- Structured Data for Search + AI -->
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
${data.logo_url ? `<link rel="icon" href="${esc(data.logo_url)}" type="image/png">` : `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌐</text></svg>">`}
<script src="https://cdn.tailwindcss.com"></script>
<style>*{scroll-behavior:smooth}body{margin:0}</style>
</head>
<body>
${body}
${reviewCarouselScript(data.reviews?.length || 0)}
</body>
</html>`
}

function generateProfessionalHtml(data: any, template: string, options: SiteRenderOptions): string {
  const e = escapeHtml
  const siteUrl = resolveSiteUrl(data, options.siteUrl)
  const title = [data.business_name, [data.city, data.state].filter(Boolean).join(', ')].filter(Boolean).join(' | ')
  const description = data.description || data.tagline || [data.business_name, data.category, data.city].filter(Boolean).join(' · ')
  const image = safeWebUrl(data.hero_image_url)
  const logo = safeWebUrl(data.logo_url)
  const mode = options.mode || (data.demo ? 'demo' : 'live')
  const body = renderProfessionalSite(data, template, { ...options, mode, apiBaseUrl: options.apiBaseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://autolocal.ai' })
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="autolocal-site" content="${e(data.slug)}">
<title>${e(title)}</title><meta name="description" content="${e(description)}">
<meta name="robots" content="${mode === 'live' ? 'index,follow' : 'noindex,nofollow'}">
<link rel="canonical" href="${e(siteUrl)}">
<meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(siteUrl)}">
${image ? `<meta property="og:image" content="${e(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
${logo ? `<link rel="icon" href="${e(logo)}">` : ''}
<script type="application/ld+json">${JSON.stringify(siteStructuredData(data, siteUrl)).replace(/</g, '\\u003c')}</script>
<style>body{margin:0}html{scroll-behavior:smooth}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}${PROFESSIONAL_CSS}</style>
</head><body>${body}<script>${inquiryRuntimeScript()}</script></body></html>`
}

/** Files for one public site; add service URLs only when actual service pages exist. */
export function generateStaticHtml(data: any, template: string, options: SiteRenderOptions = {}): string {
  return generateProfessionalHtml(data, isSiteTemplate(template) ? template : categoryToProfessionalTemplate(data.category || ''), options)
}

export function generateStaticSiteFiles(data: any, template: string, options: SiteRenderOptions = {}): { file: string; data: string }[] {
  const siteUrl = resolveSiteUrl(data, options.siteUrl)
  const isPublic = !data.demo && (!options.mode || options.mode === 'live')
  return [
    { file: 'index.html', data: generateStaticHtml(data, template, options) },
    { file: 'robots.txt', data: `User-agent: *\n${isPublic ? 'Allow: /' : 'Disallow: /'}\n${isPublic ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}` },
    { file: 'sitemap.xml', data: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${isPublic ? `<url><loc>${escapeHtml(siteUrl)}/</loc></url>` : ''}</urlset>` },
  ]
}
