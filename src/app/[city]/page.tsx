import { notFound, permanentRedirect } from 'next/navigation'
import { areas } from '@/data/areas'

// Previous location pages repeated unverified service claims. Keep known inbound
// links useful without generating pages that imply a local office or local results.
export default async function LegacyCityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  if (!areas.some(area => area.slug === city)) notFound()
  permanentRedirect('/')
}
