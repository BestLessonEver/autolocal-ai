#!/usr/bin/env npx tsx
/** Offline export of the same renderer used for previews and queued deployment. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAdminClient } from '../../src/lib/supabase/admin'
import { generateStaticSiteFiles } from '../../src/lib/static-templates'
import { appOrigin } from '../../src/lib/integration-config'

async function main() {
  const slug = process.argv[2]
  if (!slug || !/^[a-z0-9-]{1,100}$/.test(slug)) throw new Error('Usage: tsx scripts/deploy/generate-static-site.ts <slug> [--out <directory>]')
  const index = process.argv.indexOf('--out')
  const directory = resolve(index >= 0 ? process.argv[index + 1] : `client-sites/${slug}`)
  const { data: site, error } = await createAdminClient().from('website_previews').select('*').eq('slug', slug).single()
  if (error || !site) throw new Error('Website could not be read')
  const siteUrl = site.domain_status === 'active' && site.custom_domain ? `https://${site.custom_domain}` : `https://${slug}.${process.env.AUTOLOCAL_SITES_DOMAIN || 'autolocal.ai'}`
  const files = generateStaticSiteFiles({ ...site, email: site.contact_email || null }, site.template || 'summit', { siteUrl, apiBaseUrl: appOrigin() })
  mkdirSync(directory, { recursive: true })
  for (const file of files) writeFileSync(resolve(directory, file.file), file.data)
  console.log(`Exported ${files.length} files to ${directory}. Nothing was published.`)
}
main().catch(() => { console.error('Export failed. Check the website and local connection configuration.'); process.exitCode = 1 })
