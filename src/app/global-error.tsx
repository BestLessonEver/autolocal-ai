'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', background: '#f7f8f2', color: '#172d26', padding: '48px 24px', lineHeight: 1.7 }}><main style={{ maxWidth: 640, margin: 'auto' }}><h1>We couldn’t open AutoLocal.</h1><p>Please try again in a moment.</p><button type="button" onClick={reset} style={{ padding: '12px 24px', cursor: 'pointer' }}>Try again</button></main></body></html>
}
