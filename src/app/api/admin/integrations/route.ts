import { validateInternalAuth } from '@/lib/internal-auth'
import { integrationHealth } from '@/lib/integration-config'
import { getGoogleConnectionHealth } from '@/lib/google-config'
import { getPublicRateLimitHealth, publicProxyProbe } from '@/lib/public-rate-limit'
export async function GET(request: Request) {
  const auth = validateInternalAuth(request)
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status })
  if (new URL(request.url).searchParams.get('probe') === 'proxy') {
    return Response.json({ proxy: publicProxyProbe(request) }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  return Response.json({ integrations: integrationHealth(), google: getGoogleConnectionHealth(), publicProtection: getPublicRateLimitHealth(), checkedAt: new Date().toISOString(), note: 'Configuration presence only. Provider credentials and scheduled delivery require staging verification.' })
}
