import Link from 'next/link'

/** Legacy entry point retained for callers; current domain setup lives in one flow. */
export default function DomainSearch({ slug }: {
  siteId: string; slug: string; businessName?: string; currentDomain?: string | null;
  onDomainRegistered?: (domain: string) => void;
}) {
  return <Link href={`/setup?slug=${encodeURIComponent(slug)}`}>Review your website address and domain options</Link>
}
