import assert from 'node:assert/strict'
import test from 'node:test'
import { JobError } from '../src/lib/integration-jobs'
import { promoteDeployment } from '../src/lib/providers/vercel'

function setup(handler: typeof fetch) {
  const originalFetch = globalThis.fetch, originalToken = process.env.VERCEL_TOKEN
  globalThis.fetch = handler; process.env.VERCEL_TOKEN = 'mock-only'
  return () => {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.VERCEL_TOKEN; else process.env.VERCEL_TOKEN = originalToken
  }
}

test('first-deployment and promotion retries succeed only when the exact revision is already current production', async () => {
  const calls: string[] = []
  const restore = setup(async (input, options) => {
    const path = new URL(String(input)).pathname
    calls.push(`${options?.method || 'GET'} ${path}`)
    if (options?.method === 'POST') return Response.json({ error: { code: 'conflict' } }, { status: 409 })
    return Response.json({ id: 'project-fixture', targets: { production: { id: 'deployment-fixture' } } })
  })
  try {
    await promoteDeployment('project-fixture', 'deployment-fixture')
    assert.deepEqual(calls, [
      'POST /v10/projects/project-fixture/promote/deployment-fixture',
      'GET /v9/projects/project-fixture',
    ])
  } finally { restore() }
})

test('a generic promotion conflict cannot mark another or unconfirmed production revision as promoted', async () => {
  const projects = [
    { id: 'project-fixture', targets: { production: { id: 'different-deployment' } } },
    { id: 'other-project', targets: { production: { id: 'deployment-fixture' } } },
    { id: 'project-fixture', targets: {} },
    { id: 'project-fixture' },
  ]
  for (const project of projects) {
    const restore = setup(async (_input, options) => options?.method === 'POST'
      ? Response.json({ error: { code: 'conflict' } }, { status: 409 })
      : Response.json(project))
    try {
      await assert.rejects(() => promoteDeployment('project-fixture', 'deployment-fixture'), error => error instanceof JobError && error.message === 'Hosting promotion returned HTTP 409')
    } finally { restore() }
  }
})

test('successful promotions need no conflict lookup and other provider failures stay failures', async () => {
  for (const status of [200, 201, 202, 403, 429, 500]) {
    let calls = 0
    const restore = setup(async (_input, options) => {
      calls++; assert.equal(options?.method, 'POST')
      return new Response(null, { status })
    })
    try {
      if (status < 300) await promoteDeployment('project-fixture', 'deployment-fixture')
      else await assert.rejects(() => promoteDeployment('project-fixture', 'deployment-fixture'), JobError)
      assert.equal(calls, 1)
    } finally { restore() }
  }
})
