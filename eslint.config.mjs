import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import { fixupConfigRules } from '@eslint/compat'

export default defineConfig([
  // Next's React lint plugin still uses APIs removed by ESLint 10.
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
  globalIgnores(['.next*/**', '.runtime/**', 'out/**', 'build/**', 'client-sites/**', 'next-env.d.ts']),
])
