import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const wrapper = resolve('scripts/nightly-optimize.sh')

async function run({ services = { publishing: true }, optimize = { summary: { sitesChanged: 2 } }, healthStatus = 200, optimizeStatus = 200, args = [], envFile }) {
  const directory = await mkdtemp(join(tmpdir(), 'autolocal-optimize-test-'))
  const preload = join(directory, 'fetch.mjs')
  const dotenv = envFile || join(directory, '.env.local')
  await writeFile(preload, `
const services=${JSON.stringify(services)}
const optimize=${JSON.stringify(optimize)}
const healthStatus=${healthStatus}
const optimizeStatus=${optimizeStatus}
globalThis.fetch=async(url,options={})=>{
  const target=new URL(url)
  console.log(JSON.stringify({called:target.pathname}))
  if(target.pathname==='/api/system/health') return Response.json({services},{status:healthStatus})
  if(target.pathname==='/api/optimize') {
    if(options.method!=='POST'||options.headers?.Authorization!=='Bearer fixture-key') throw new Error('Optimization request was not authenticated')
    return Response.json(optimize,{status:optimizeStatus})
  }
  throw new Error('Unexpected request')
}
`)
  if (!envFile) await writeFile(dotenv, 'INTERNAL_API_KEY=fixture-key\n')
  const result = spawnSync('bash', [wrapper, ...args], {
    env: { PATH: process.env.PATH, NODE_OPTIONS: `--import=${preload}`, AUTOLOCAL_ENV_FILE: dotenv, NEXT_PUBLIC_SITE_URL: 'https://autolocal.example.test' },
    encoding: 'utf8', timeout: 15000,
  })
  return { result, directory }
}

async function cleanup(runResult) { await rm(runResult.directory, { recursive: true, force: true }) }

test('disabled publishing cleanly skips optimization after health check', async () => {
  const output = await run({ services: { publishing: false } })
  try {
    assert.equal(output.result.status, 0)
    assert.equal(output.result.stderr, '')
    assert.match(output.result.stdout, /"called":"\/api\/system\/health"/)
    assert.doesNotMatch(output.result.stdout, /"called":"\/api\/optimize"/)
    assert.match(output.result.stdout, /publishing capability is disabled/)
  } finally { await cleanup(output) }
})

test('enabled publishing makes an authenticated optimization request', async () => {
  const output = await run({})
  try {
    assert.equal(output.result.status, 0)
    assert.equal(output.result.stderr, '')
    assert.match(output.result.stdout, /"called":"\/api\/optimize"/)
    assert.match(output.result.stdout, /2 site\(s\) refreshed/)
  } finally { await cleanup(output) }
})

test('health and optimization errors fail closed', async t => {
  await t.test('health error', async () => {
    const output = await run({ healthStatus: 503 })
    try {
      assert.notEqual(output.result.status, 0)
      assert.doesNotMatch(output.result.stdout, /"called":"\/api\/optimize"/)
      assert.match(output.result.stderr, /health check failed/)
    } finally { await cleanup(output) }
  })
  await t.test('optimization error', async () => {
    const output = await run({ optimizeStatus: 503, optimize: { code: 'integration_unavailable' } })
    try {
      assert.notEqual(output.result.status, 0)
      assert.match(output.result.stderr, /Optimization failed \(HTTP 503\)/)
    } finally { await cleanup(output) }
  })
})

test('dotenv values are loaded without shell evaluation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolocal-dotenv-test-'))
  const marker = join(directory, 'must-not-exist')
  const envFile = join(directory, '.env.local')
  await writeFile(envFile, `INTERNAL_API_KEY=fixture-key\nUNUSED=$(touch ${marker})\n`)
  const output = await run({ services: { publishing: false }, envFile })
  try {
    assert.equal(output.result.status, 0)
    await assert.rejects(access(marker))
  } finally {
    await cleanup(output)
    await rm(directory, { recursive: true, force: true })
  }
})
