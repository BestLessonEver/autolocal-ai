import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as validation from '../src/lib/onboarding-validation'
import * as templates from '../src/components/templates/types'
import { demoSite, type Site } from '../src/components/workspace-types'

type Element = { type: string; props: Record<string, unknown> }
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/OwnerSiteEditor.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

// Run the actual component's event handlers with isolated hook state. Browser
// layout and native input validation are covered separately by the site review.
function editor(site: Site, onSave: (fields: Partial<Site>) => Promise<void>) {
  const state: unknown[] = []
  let cursor = 0
  const exports: { default?: (props: unknown) => Element } = {}
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react') return { useState(initial: unknown) {
        const index = cursor++
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
        return [state[index], (value: unknown) => {
          state[index] = typeof value === 'function' ? value(state[index]) : value
        }]
      } }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'lucide-react') return { Plus: 'plus', Trash2: 'trash', Upload: 'upload' }
      if (name === '@/lib/onboarding-validation') return validation
      if (name === './templates/types') return templates
      if (name === './Workspace.module.css') return { default: {} }
      throw new Error(`Unexpected editor dependency: ${name}`)
    },
  })
  const render = () => {
    cursor = 0
    return exports.default!({ site, onSave, onPhoto: async () => {}, onPhotoAction: async () => {} })
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
    field(label: string) {
      const group = elements(render()).find(node => node.type === 'label' && text(node).trim().startsWith(label))
      const field = elements(group).find(node => ['input', 'textarea', 'select'].includes(node.type))
      assert.ok(field, `Missing field: ${label}`)
      return field
    },
    change(label: string, value: string | boolean) {
      const field = this.field(label)
      const onChange = field.props.onChange as (event: unknown) => void
      onChange({ target: typeof value === 'boolean' ? { checked: value } : { value } })
    },
    async save() {
      await (render().props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} })
    },
    messages() {
      return elements(render()).filter(node => ['status', 'alert'].includes(String(node.props.role))).map(text)
    },
  }
}

const imported: Site = {
  ...demoSite,
  business_name: 'Current Google listing', description: '  Current Google summary.  ',
  phone: null, contact_email: null, city: null, state: null,
  services: [{ name: 'Owner-added service' }],
  hours: { Monday: 'Closed', Tuesday: '9:00 AM – 5:00 PM' },
  business_facts: { useGoogleListing: true },
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

test('an unchanged Google editor performs no write, even with missing optional contact details', async () => {
  const writes: Partial<Site>[] = []
  const view = editor(imported, async fields => { writes.push(fields) })
  await view.save()
  assert.equal(writes.length, 0)
  assert.ok(view.messages().includes('There are no changes to save.'))
  for (const label of ['About your business', 'Business phone', 'Public contact email', 'City', 'State or region', 'What’s included?']) {
    assert.equal(view.field(label).props.required, false)
  }
})

test('a design edit sends only the design and advances the saved baseline', async () => {
  const writes: Partial<Site>[] = []
  const view = editor(imported, async fields => { writes.push(plain(fields)) })
  view.change('Website design', 'receipt')
  await view.save()
  assert.deepEqual(writes, [{ template: 'receipt' }])
  await view.save()
  assert.equal(writes.length, 1)
  view.change('Headline', 'An owner-written headline')
  await view.save()
  assert.deepEqual(writes[1], { tagline: 'An owner-written headline' })
})

test('hours compare by content rather than object order and nested services become explicit edits', async () => {
  const writes: Partial<Site>[] = []
  const view = editor(imported, async fields => { writes.push(plain(fields)) })
  view.change('Business hours', 'Tuesday: 9:00 AM – 5:00 PM\nMonday: Closed')
  await view.save()
  assert.equal(writes.length, 0)
  view.change('Business hours', 'Monday: 10:00 AM – 2:00 PM\nTuesday: Closed')
  await view.save()
  assert.deepEqual(writes[0], { hours: { Monday: '10:00 AM – 2:00 PM', Tuesday: 'Closed' } })
  view.change('What’s included?', 'Only the owner-added service description')
  await view.save()
  assert.deepEqual(writes[1], { services: [{ name: 'Owner-added service', description: 'Only the owner-added service description', price: '' }] })
})

test('reverted values do not become overrides and invalid new phone numbers cannot save', async () => {
  const writes: Partial<Site>[] = []
  const view = editor({ ...imported, phone: '(512) 555-0123' }, async fields => { writes.push(plain(fields)) })
  view.change('Business phone', '123')
  await view.save()
  assert.equal(writes.length, 0)
  assert.ok(view.messages().some(message => message.includes('valid business phone')))
  view.change('Business phone', '(512) 555-0123')
  await view.save()
  assert.equal(writes.length, 0)
  view.change('Business phone', '')
  await view.save()
  assert.deepEqual(writes, [{ phone: null }])
})

test('a failed save retains dirty fields for retry instead of advancing the baseline', async () => {
  const writes: Partial<Site>[] = []
  let fail = true
  const view = editor(imported, async fields => {
    writes.push(plain(fields))
    if (fail) throw new Error('Retry needed')
  })
  view.change('Website design', 'myspace')
  await view.save()
  fail = false
  await view.save()
  assert.deepEqual(writes, [{ template: 'myspace' }, { template: 'myspace' }])
  await view.save()
  assert.equal(writes.length, 2)
})

test('manual websites retain required fields and full-content save behavior', async () => {
  const writes: Partial<Site>[] = []
  const view = editor(demoSite, async fields => { writes.push(plain(fields)) })
  for (const label of ['About your business', 'Business phone', 'Public contact email', 'City', 'State or region', 'What’s included?']) {
    assert.equal(view.field(label).props.required, true)
  }
  view.change('Website design', 'ledger')
  await view.save()
  assert.equal(writes[0].template, 'ledger')
  assert.equal(writes[0].business_name, demoSite.business_name)
  assert.equal(writes[0].phone, demoSite.phone)
  view.change('Business phone', '')
  await view.save()
  assert.equal(writes.length, 1)
})
