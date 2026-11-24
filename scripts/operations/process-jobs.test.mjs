import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const script = resolve('scripts/operations/process-jobs.mjs')

async function run(services, workerResult = { processed: 0 }) {
  const directory = await mkdtemp(join(tmpdir(), 'autolocal-worker-test-'))
  const preload = join(directory, 'fetch.mjs')
  await writeFile(preload, `
const services=${JSON.stringify(services)}
const workerResult=${JSON.stringify(workerResult)}
globalThis.fetch=async(url,options={})=>{
  const target=new URL(url)
  if(target.pathname==='/api/system/health') return Response.json({services})
  if(options.method!=='POST'||options.headers?.Authorization!=='Bearer fixture-key') throw new Error('Worker request was not authenticated POST')
  console.log(JSON.stringify({called:target.pathname}))
  return Response.json(workerResult)
}
`)
  try {
    return spawnSync(process.execPath, ['--import', preload, script], {
      env: { PATH: process.env.PATH, NEXT_PUBLIC_SITE_URL: 'https://autolocal.example.test', INTERNAL_API_KEY: 'fixture-key' },
      encoding: 'utf8', timeout: 15000,
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('disabled production capabilities skip side-effect workers cleanly', async () => {
  const result = await run({ publishing: false, domainPurchases: false, notifications: false })
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /"reason":"no_enabled_workers"/)
  assert.doesNotMatch(result.stdout, /"called":/)
})

test('enabled notifications call both authenticated POST workers', async () => {
  const result = await run({ publishing: false, domainPurchases: false, notifications: true })
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /"called":"\/api\/jobs\/process"/)
  assert.match(result.stdout, /"called":"\/api\/leads\/notifications\/process"/)
})

test('publishing without notifications calls only the integration worker', async () => {
  const result = await run({ publishing: true, domainPurchases: false, notifications: false })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /"called":"\/api\/jobs\/process"/)
  assert.doesNotMatch(result.stdout, /"called":"\/api\/leads\/notifications\/process"/)
})
