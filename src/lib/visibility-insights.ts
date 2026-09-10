import { createHash } from 'node:crypto'

export type VisibilitySource = { kind: 'website' | 'gbp' | 'search_console' | 'leads'; label: string; observedAt: string | null; periodStart?: string; periodEnd?: string }
export type VisibilityAction = { label: string; target: 'website' | 'leads' | 'google' | 'search_console'; field?: string }
export type VisibilityCandidate = {
  key: string; title: string; description: string; priority: 'high' | 'medium' | 'low'; rank: number;
  evidence: string[]; source: VisibilitySource; action: VisibilityAction; revision: string; inference: boolean;
  context: { queries?: string[] }; evidenceExpiresAt: string | null;
}
export type VisibilityTask = VisibilityCandidate & {
  status: 'open' | 'dismissed' | 'completed'; completion: { method: 'verified_change' | 'owner_reported'; at: string; note?: string } | null; updatedAt: string;
}
export type VisibilityInput = {
  site: Record<string, unknown>; now: string;
  connections: { provider: string; status: string; profile?: unknown; metrics?: unknown; last_synced_at?: string | null; error_code?: string | null }[];
  leads: { available: boolean; unansweredCount: number | null; oldestAt: string | null; observedAt: string };
}
type Json = Record<string, unknown>
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const list = (value: unknown) => Array.isArray(value) ? value : []
export function evidenceRevision(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24) }
function fresh(value: unknown, now: string, days = 7) { const age = Date.parse(now) - Date.parse(text(value)); return Number.isFinite(age) && age >= -300_000 && age <= days * 86400000 }
function hostname(value: unknown) { try { const url = new URL(text(value)); return ['https:', 'http:'].includes(url.protocol) ? url.hostname.toLowerCase().replace(/^www\./, '') : '' } catch { return '' } }
function phone(value: unknown) { return text(value).replace(/\D/g, '') }
const stop = new Set(['a','an','the','and','or','for','in','at','to','of','near','me','my','best','local','service','services','company','companies','cost','price','prices','how','much'])
function words(value: string) { return value.toLocaleLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2 && !stop.has(word)) }
function queryCovered(query: string, site: Json) {
  const locationWords = new Set(words([site.city, site.state, site.business_name, ...list(site.service_areas)].map(text).join(' ')))
  const meaningful = words(query).filter(word => !locationWords.has(word))
  if (!meaningful.length) return true
  const services = list(site.services).map(obj)
  return services.some(service => { const coverage = new Set(words(text(service.name) + ' ' + text(service.description))); return meaningful.every(word => coverage.has(word)) })
}

/** Editorial triage rules, not ranking scores. No external calls or generated business facts. */
export function visibilityInsights(input: VisibilityInput, previous: VisibilityTask[] = []) {
  const { site, now } = input, candidates: VisibilityCandidate[] = [], satisfied = new Set<string>()
  const website: VisibilitySource = { kind: 'website', label: 'Saved website draft', observedAt: text(site.updated_at) || now }
  const candidate = (key: string, rank: number, title: string, description: string, evidence: string[], source: VisibilitySource, action: VisibilityAction, relevant: unknown, inference = false, context: VisibilityCandidate['context'] = {}) => {
    candidates.push({ key, rank, title, description, evidence, source, action, inference, context, priority: rank >= 75 ? 'high' : rank >= 50 ? 'medium' : 'low', revision: evidenceRevision(relevant), evidenceExpiresAt: ['gbp', 'search_console'].includes(source.kind) && source.observedAt ? new Date(Date.parse(source.observedAt) + 29 * 86400000).toISOString() : null })
  }
  const edit = (field: string, label = 'Edit website details'): VisibilityAction => ({ target: 'website', label, field })
  const rule = (key: string, issue: boolean, create: () => void) => issue ? create() : satisfied.add(key)
  const services = list(site.services).map(obj), areas = list(site.service_areas).map(text).filter(Boolean), faq = list(site.faq).map(obj).filter(item => text(item.question) && text(item.answer))
  rule('website.contact', !phone(site.phone) && !text(site.contact_email), () => candidate('website.contact', 95, 'Add a direct contact option', 'Give customers a public business phone or contact email alongside your inquiry form.', ['No public business phone or contact email is saved.'], website, edit('contact_email'), [site.phone, site.contact_email]))
  rule('website.services', !services.length || services.some(service => !text(service.name) || text(service.description).length < 40), () => candidate('website.services', 80, 'Explain the services customers can hire you for', 'Add real services and explain what is included, who each is for, and how to get started. The 40-character check is a writing prompt, not a Google requirement.', [services.length ? `${services.filter(service => text(service.description).length < 40).length} saved service descriptions have fewer than 40 characters.` : 'No services are saved.'], website, edit('services', 'Describe services'), services, true))
  rule('website.areas', !areas.length, () => candidate('website.areas', 72, 'Confirm the places you actually serve', 'Add your real service area. A city in an address does not establish where you take customers or jobs.', ['No service areas are saved.'], website, edit('service_areas', 'Add service areas'), areas))
  rule('website.faq', !faq.length, () => candidate('website.faq', 55, 'Answer one real customer question', 'Use a question you hear from customers and a factual answer about your process, service, or availability. Adding an answer does not guarantee an AI citation.', ['No complete question and answer is saved.'], website, edit('faq', 'Add a useful answer'), faq))
  const photographs = [site.hero_image_url, ...list(site.gallery_images)].map(text).filter(Boolean)
  rule('website.photo', !photographs.length, () => candidate('website.photo', 60, 'Show your business with a real photograph', 'Upload a photograph you have permission to use of your work, space, or team. An upload confirms a file exists; AutoLocal cannot independently verify who took it.', ['No business cover or gallery photograph is saved.'], website, edit('hero_image_url', 'Add a photograph'), photographs))
  rule('website.description', text(site.description).length < 80, () => candidate('website.description', 45, 'Give visitors a clearer introduction', 'Explain what your business does and who it helps. The 80-character check is an editorial prompt, not a ranking factor.', [`The saved introduction contains ${text(site.description).length} characters.`], website, edit('description'), text(site.description), true))

  const leadSource: VisibilitySource = { kind: 'leads', label: 'Owner inquiry inbox', observedAt: input.leads.observedAt }
  if (input.leads.available) rule('leads.reply', (input.leads.unansweredCount || 0) > 0, () => candidate('leads.reply', 100, 'Check inquiries still marked new', 'Follow up if you have not already replied, then update the inquiry status. AutoLocal can see the saved status, not whether you called or replied elsewhere.', [`${input.leads.unansweredCount} inquiries older than 24 hours are still marked new.`, ...(input.leads.oldestAt ? [`Oldest received: ${input.leads.oldestAt}.`] : [])], leadSource, { target: 'leads', label: 'Open inquiries' }, [input.leads.unansweredCount, input.leads.oldestAt]))

  const sources: Record<string, { state: string; observedAt: string | null; label: string }> = { website: { state: 'available', observedAt: website.observedAt, label: 'Saved draft; changes require publication' }, leads: { state: input.leads.available ? 'available' : 'unavailable', observedAt: input.leads.observedAt, label: 'Inquiry status, not independently verified contact' } }
  for (const provider of ['gbp', 'search_console'] as const) {
    const connection = input.connections.find(row => row.provider === provider), label = provider === 'gbp' ? 'Google Business Profile' : 'Google Search Console'
    const source: VisibilitySource = { kind: provider, label: connection?.error_code ? `${label} saved read; last refresh incomplete` : label, observedAt: connection?.last_synced_at || null }
    const action: VisibilityAction = { target: provider === 'gbp' ? 'google' : 'search_console', label: `Open ${label}` }
    if (!connection || connection.status !== 'connected') {
      sources[provider] = { state: connection?.status || 'not_connected', observedAt: source.observedAt, label }
      candidate(`${provider}.connection`, 50, `Connect ${label} evidence`, 'Connect the account and select the property for this business so recommendations can use its actual data.', [`Connection status: ${connection?.status || 'not connected'}.`], { ...source, observedAt: now }, action, connection?.status || 'not_connected')
      continue
    }
    satisfied.add(`${provider}.connection`)
    if (!fresh(connection.last_synced_at, now)) {
      sources[provider] = { state: 'stale', observedAt: source.observedAt, label }
      candidate(`${provider}.refresh`, 65, `Refresh ${label} evidence`, 'The last read is missing or more than seven days old. Refresh the connection before acting on old comparisons.', ['No current snapshot is available for recommendations.'], { ...source, observedAt: now }, action, connection.last_synced_at)
      continue
    }
    satisfied.add(`${provider}.refresh`)
    const profile = obj(connection.profile), metrics = obj(connection.metrics)
    sources[provider] = { state: provider === 'gbp' ? (fresh(profile.observedAt, now) ? connection.error_code ? 'cached' : 'available' : 'unavailable') : connection.error_code ? 'cached' : text(metrics.state) || 'unavailable', observedAt: source.observedAt, label: source.label }
    if (provider === 'gbp' && fresh(profile.observedAt, now)) {
      const profileSource = { ...source, observedAt: text(profile.observedAt) }
      const published = !!site.deployment_verified_at && ['active', 'pending_cancel'].includes(text(site.hosting_status)) && site.deploy_status !== 'suspended'
      const intendedHost = published ? hostname(site.website_current) : ''
      if (intendedHost) rule('gbp.website', hostname(profile.websiteUri) !== intendedHost, () => candidate('gbp.website', 85, 'Check the website linked from Google', 'The listing and the verified published website use different hosts. Confirm which is correct before requesting a Google change; either may be intentional.', [`Google website host: ${hostname(profile.websiteUri) || 'not supplied'}.`, `Verified website host: ${intendedHost}.`], profileSource, {...action,field:"websiteUri"}, [hostname(profile.websiteUri), intendedHost], true))
      const publishedFacts = obj(site.published_site_snapshot), publicPhone = phone(publishedFacts.phone || (published ? '' : site.phone)), googlePhone = phone(obj(profile.phoneNumbers).primaryPhone)
      if (publicPhone) rule('gbp.phone', publicPhone !== googlePhone, () => candidate('gbp.phone', 78, 'Confirm your public phone details', 'Your saved business phone and Google phone differ. Check both before changing either; a separate tracking number may be intentional.', [`Google phone: ${text(obj(profile.phoneNumbers).primaryPhone) || 'not supplied'}.`, `Website phone: ${text(publishedFacts.phone || site.phone)}.`], profileSource, {...action,field:"phoneNumbers"}, [publicPhone, googlePhone], true))
      rule('gbp.description', !text(obj(profile.profile).description), () => candidate('gbp.description', 52, 'Add a factual Google business description', 'Draft a short description of what you do and who you help, then review the exact change before submitting it to Google.', ['Google returned no business description in the current profile read.'], profileSource, {...action,field:"description"}, obj(profile.profile).description))
      if (site.show_address === true) rule('gbp.hours', !list(obj(profile.regularHours).periods).length, () => candidate('gbp.hours', 58, 'Confirm visiting hours on Google', 'Your website allows customer visits, but Google returned no regular opening periods. If you keep regular hours, add the actual times and review the change; do not invent hours for an appointment-only business.', ['The saved website shows a visitor address.', 'Google returned no regular opening periods.'], profileSource, { ...action, field: "regularHours" }, profile.regularHours, true))
    }
    if (provider === 'search_console' && metrics.state === 'available' && fresh(metrics.observedAt, now)) {
      const searchSource = { ...source, observedAt: text(metrics.observedAt), periodStart: text(metrics.startDate), periodEnd: text(metrics.endDate) }
      const rows = list(metrics.queries).map(obj).filter(row => text(row.query) && Number.isFinite(row.impressions) && Number(row.impressions) >= 100 && Number.isFinite(row.clicks) && Number(row.clicks) >= 0 && Number(row.clicks) / Number(row.impressions) < .02 && !queryCovered(text(row.query), site)).sort((a,b) => Number(b.impressions) - Number(a.impressions)).slice(0,2)
      if (rows.length) candidate('search.coverage', 62, 'Check a search query against your real services', 'These top reported queries have visibility but few clicks, and their terms do not all appear in one saved service. Confirm relevance first. Clarify an existing service only if you actually offer it; dismiss irrelevant searches. This is a triage heuristic, not proof of a content gap.', rows.flatMap(row => [`Query: ${text(row.query).slice(0,250)}`, `${row.impressions} impressions and ${row.clicks} clicks in this reporting window.`]), searchSource, edit('services', 'Review service coverage'), rows, true, { queries: rows.map(row => text(row.query)) })
      const old = previous.find(task => task.key === 'search.coverage')
      if (old?.context.queries?.length && fresh(old.source.observedAt, now, 29) && old.context.queries.every(query => queryCovered(query, site))) satisfied.add('search.coverage')
    }
  }
  return { candidates: candidates.sort((a,b) => b.rank - a.rank || a.key.localeCompare(b.key)), satisfied, sources }
}

export function reconcileVisibility(input: VisibilityInput, previous: VisibilityTask[]) {
  const { candidates, satisfied, sources } = visibilityInsights(input, previous), current = new Map(candidates.map(item => [item.key, item]))
  const tasks: VisibilityTask[] = candidates.map(item => {
    const old = previous.find(task => task.key === item.key)
    const retain = old?.status === 'dismissed' || (old?.status === 'completed' && old.completion?.method === 'owner_reported' && old.revision === item.revision)
    return { ...item, status: retain ? old!.status : 'open', completion: retain ? old!.completion : null, updatedAt: input.now }
  })
  for (const old of previous) {
    if (current.has(old.key)) continue
    const completed = old.status === 'open' && satisfied.has(old.key)
    const expired = !!old.evidenceExpiresAt && Date.parse(old.evidenceExpiresAt) <= Date.parse(input.now)
    tasks.push({ ...old, ...(expired ? { evidence: [], context: {} } : {}), ...(completed ? { status: 'completed' as const, completion: { method: 'verified_change' as const, at: input.now, note: old.source.kind === 'website' ? 'Relevant saved draft fields now satisfy this check; publication is separate.' : 'The relevant source fields now satisfy this check.' }, updatedAt: input.now } : {}) })
  }
  const activeKeys = new Set(candidates.map(task => task.key))
  return { tasks, open: tasks.filter(task => task.status === 'open' && activeKeys.has(task.key)).sort((a,b) => b.rank - a.rank).slice(0,5), history: tasks.filter(task => task.status !== 'open').sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,10), sources }
}

export const VISIBILITY_MEASUREMENT = {
  search: 'Search Console impressions and clicks are search visibility and visits, not inquiries or booked work. The API returns top query rows and can omit queries; absence is not proof of zero demand.',
  leads: 'Response tasks count inquiries older than 24 hours whose current saved status is new. A status change records owner activity, not independent proof a customer was contacted.',
  completion: 'Verified change means a relevant saved field or source check changed. Owner-reported completion is labeled separately. Neither means rankings improved.',
  thresholds: 'Seven-day source freshness, 100 query impressions, below 2% query click rate, and short-description checks are transparent triage rules, not Google ranking standards.',
}
