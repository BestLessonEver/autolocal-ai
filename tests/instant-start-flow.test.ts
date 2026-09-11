import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as model from '../src/lib/instant-preview'
import * as pending from '../src/lib/pending-draft'
import * as validation from '../src/lib/onboarding-validation'
import * as templates from '../src/components/templates/types'
import type { GoogleListingDetails } from '../src/lib/google-listing-types'

type Element = { type: string; props: Record<string, unknown> }
type Hook = { value?: unknown; deps?: unknown[]; cleanup?: () => void }
const compiled = ts.transpileModule(readFileSync(new URL('../src/app/start/StartFlow.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const listing: GoogleListingDetails = {
  source: 'google_places', placeId: 'ChIJflowListing123', name: 'Live listing name',
  address: '100 Listing Lane', phone: '(512) 555-0123', website: 'https://listing.example.test',
  city: 'Austin', state: 'Texas', category: 'Hair salon', description: 'The current Google summary.',
  hours: ['Monday: Closed'], serviceAreaBusiness: false, sourceUrl: 'https://maps.google.com/?cid=123',
  businessStatus: 'OPERATIONAL', photos: [], photosAvailable: 0, photosUnavailable: 0, attributions: [],
}
const draftId = '11111111-2222-4333-8444-555555555555'
const signedIn = { data: { user: { id: 'owner', email: 'owner@example.test' } } }
const signedOut = { data: { user: null } }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values,
  }
}

function flow(options: {
  pending?: boolean;
  edits?: model.GoogleDraftEdits;
  auth?: () => Promise<typeof signedIn | typeof signedOut>;
  load?: () => Promise<GoogleListingDetails>;
  save?: () => Promise<Record<string, unknown>>;
} = {}) {
  const hooks: Hook[] = []
  let cursor = 0, dirty = true, mounted = true
  let tree: Element
  const effects: (() => void)[] = []
  const routes: string[] = [], saves: Record<string, unknown>[] = []
  let authCalls = 0
  const local = storage(), session = storage()
  const saved = model.draftStorageSnapshot(model.applyGoogleDraftEdits(model.draftFromGoogleListing(listing, 'atelier', 'Owner search label'), options.edits))
  if (options.pending) pending.savePendingDraft(local, draftId, saved)
  else session.setItem('autolocal.instant-website.v1', JSON.stringify(saved))
  const params = new URLSearchParams(options.pending ? `draft=${draftId}` : '')
  const exports: { default?: () => Element } = {}
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props })
  const client = { auth: { async getUser() { authCalls++; return (options.auth || (async () => signedIn))() } } }
  vm.runInNewContext(compiled, {
    exports, AbortController, URLSearchParams,
    crypto: { randomUUID: () => draftId }, localStorage: local, sessionStorage: session,
    async fetch(url: string, init: { body: string }) {
      if (url === '/api/business-details') return { ok: true, json: async () => (options.load || (async () => listing))() }
      if (url === '/api/intake/submit') {
        saves.push(JSON.parse(init.body))
        return { ok: true, json: async () => (options.save || (async () => ({ success: true, slug: 'saved-website', previewUrl: '/preview/saved-website' })))() }
      }
      throw new Error(`Unexpected request: ${url}`)
    },
    require(name: string) {
      if (name === 'react') return {
        useState(initial: unknown) {
          const index = cursor++
          if (!(index in hooks)) hooks[index] = { value: typeof initial === 'function' ? initial() : initial }
          return [hooks[index].value, (value: unknown) => {
            hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value
            dirty = true
          }]
        },
        useRef(initial: unknown) {
          const index = cursor++
          if (!(index in hooks)) hooks[index] = { value: { current: initial } }
          return hooks[index].value
        },
        useEffect(effect: () => void | (() => void), deps: unknown[]) {
          const index = cursor++
          const previous = hooks[index]
          if (!previous || deps.some((dep, i) => dep !== previous.deps?.[i])) effects.push(() => {
            previous?.cleanup?.()
            hooks[index] = { deps, cleanup: effect() || undefined }
          })
        },
        useMemo: (fn: () => unknown) => fn(),
      }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'next/navigation') return { useSearchParams: () => params, useRouter: () => ({ push: (url: string) => routes.push(url), replace: (url: string) => routes.push(url) }) }
      if (name === 'next/link') return { default: 'a' }
      if (name === 'lucide-react') return Object.fromEntries(['ArrowLeft', 'ArrowRight', 'Check', 'LoaderCircle', 'Search', 'SlidersHorizontal'].map(icon => [icon, icon]))
      if (name === '@/lib/supabase/client') return { createClient: () => client }
      if (name === '@/lib/pending-draft') return pending
      if (name === '@/lib/instant-preview') return model
      if (name === '@/lib/onboarding-validation') return validation
      if (name === '@/components/templates/types') return templates
      if (name === '@/lib/static-templates') return { generateStaticHtml: () => '<main>Website preview</main>' }
      if (name.endsWith('.module.css')) return { default: {} }
      if (['@/components/MarketingNav', '@/components/MarketingFooter', './ManualStartFlow'].includes(name)) return { default: name }
      throw new Error(`Unexpected flow dependency: ${name}`)
    },
  })
  const render = () => {
    if (!mounted) return
    cursor = 0; dirty = false
    tree = exports.default!()
    while (effects.length) effects.shift()!()
  }
  const elements = (node: unknown): Element[] => {
    if (Array.isArray(node)) return node.flatMap(elements)
    if (!node || typeof node !== 'object' || !('props' in node)) return []
    const element = node as Element
    return [element, ...elements(element.props.children)]
  }
  const text = (node: unknown): string => {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(text).join(' ')
    return node && typeof node === 'object' && 'props' in node ? text((node as Element).props.children) : ''
  }
  return {
    routes, saves, local, session,
    authCalls: () => authCalls,
    async flush() { for (let i = 0; i < 30; i++) { if (dirty) render(); await Promise.resolve() } },
    button(label: string) {
      if (dirty) render()
      const button = elements(tree).find(node => node.type === 'button' && text(node).includes(label))
      assert.ok(button, `Missing button: ${label}`)
      return button
    },
    click(label: string) { (this.button(label).props.onClick as () => void)() },
    change(label: string, value: string) {
      if (dirty) render()
      const group = elements(tree).find(node => node.type === 'label' && text(node).trim().startsWith(label))
      const field = elements(group).find(node => ['input', 'textarea', 'select'].includes(node.type))
      assert.ok(field, `Missing field: ${label}`)
      ;(field.props.onChange as (event: unknown) => void)({ target: { value } })
    },
    messages() { if (dirty) render(); return elements(tree).filter(node => node.props.role === 'alert').map(text) },
    unmount() { mounted = false; for (const hook of hooks) hook.cleanup?.() },
  }
}

test('choosing a different business cancels automatic saving while restored authentication is pending', async () => {
  const auth = deferred<typeof signedIn>()
  const view = flow({ pending: true, auth: () => auth.promise })
  await view.flush()
  view.click('Different business')
  auth.resolve(signedIn)
  await view.flush()
  assert.deepEqual(view.saves, [])
  assert.deepEqual(view.routes, ['/start'])
})

test('unmounting cancels a pending auth restore and an already started save cannot navigate afterward', async () => {
  const auth = deferred<typeof signedIn>()
  const restored = flow({ pending: true, auth: () => auth.promise })
  await restored.flush()
  restored.unmount()
  auth.resolve(signedIn)
  await restored.flush()
  assert.deepEqual(restored.saves, [])
  assert.deepEqual(restored.routes, [])

  const result = deferred<Record<string, unknown>>()
  const saving = flow({ save: () => result.promise })
  await saving.flush()
  saving.click('Save my website')
  await saving.flush()
  assert.equal(saving.button('Different business').props.disabled, true)
  assert.equal(saving.saves.length, 1)
  saving.unmount()
  result.resolve({ success: true, previewUrl: '/preview/old-save' })
  await saving.flush()
  assert.deepEqual(saving.routes, [])
})

test('an active authenticated resume saves exactly once and clears the pending reference', async () => {
  const view = flow({ pending: true })
  await view.flush()
  assert.equal(view.saves.length, 1)
  assert.deepEqual(view.saves[0], { googleImport: true, googlePlaceId: listing.placeId, template: 'atelier', businessName: 'Owner search label', googleOverrides: {} })
  assert.deepEqual(view.routes, ['/preview/saved-website'])
  assert.equal(pending.loadPendingDraft(view.local, draftId), null)
})

test('editing then reverting imported content removes the new override while saved owner edits survive', async () => {
  const view = flow({ edits: { phone: '(512) 555-0199' } })
  await view.flush()
  view.click('Edit business details')
  view.change('About your business', 'Temporary typing')
  view.change('About your business', listing.description)
  view.change('Business phone', '(512) 555-0188')
  view.change('Business phone', '(512) 555-0199')
  view.click('Save my website')
  await view.flush()
  assert.deepEqual(view.saves[0].googleOverrides, { phone: '(512) 555-0199' })
})

test('invalid edited contact values are caught before another authentication request or sign-in navigation', async () => {
  const view = flow({ auth: async () => signedOut })
  await view.flush()
  view.click('Edit business details')
  view.change('Business phone', 'abc')
  view.click('Save my website')
  await view.flush()
  assert.equal(view.authCalls(), 1)
  assert.ok(view.messages().some(message => message.includes('valid business phone')))
  view.change('Business phone', '')
  view.change('Public contact email', 'not-an-email')
  view.click('Save my website')
  await view.flush()
  assert.equal(view.authCalls(), 1)
  assert.ok(view.messages().some(message => message.includes('valid public contact email')))
  assert.deepEqual(view.routes, [])
})

test('sign-in navigation saves only the place reference and independently entered owner content', async () => {
  const view = flow({ auth: async () => signedOut })
  await view.flush()
  view.click('Save my website')
  await view.flush()
  const saved = pending.loadPendingDraft(view.local, draftId)
  assert.deepEqual(saved, { importedFromGoogle: true, googlePlaceId: listing.placeId, template: 'atelier', ownerLabel: 'Owner search label', googleEdits: {} })
  assert.equal(view.routes.length, 1)
  assert.match(view.routes[0], /^\/login\?next=/)
  assert.ok(!JSON.stringify(saved).includes(listing.description))
  assert.ok(!JSON.stringify(saved).includes(listing.phone))
})

test('an abandoned listing response cannot restore a preview after the owner goes back', async () => {
  const details = deferred<GoogleListingDetails>()
  const view = flow({ load: () => details.promise })
  await view.flush()
  view.click('Back to results')
  details.resolve(listing)
  await view.flush()
  assert.throws(() => view.button('Save my website'), /Missing button/)
  assert.deepEqual(view.saves, [])
})
