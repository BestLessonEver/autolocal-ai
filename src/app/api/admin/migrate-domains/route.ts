import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'


export async function POST(req: NextRequest) {
  // Simple auth check
  const key = req.headers.get('authorization')?.replace('Bearer ', '') || ''
  if (key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Database is not configured' }, { status: 503 })
  const supabase = createAdminClient()
  const results: string[] = []

  // Add columns one at a time using raw SQL via Supabase RPC
  // Since we can't run raw SQL via PostgREST, we'll test if columns exist
  // by trying to query them, and report status

  const columns = [
    { name: 'domain_status', type: 'text' },
    { name: 'domain_provider', type: 'text' },
    { name: 'domain_registrar_id', type: 'text' },
    { name: 'domain_auto_renew', type: 'boolean' },
    { name: 'domain_expires_at', type: 'timestamptz' },
  ]

  for (const col of columns) {
    const { error } = await supabase
      .from('website_previews')
      .select(col.name)
      .limit(1)

    if (error?.code === '42703') {
      results.push(`❌ ${col.name} — MISSING (run migration in Supabase SQL editor)`)
    } else {
      results.push(`✅ ${col.name} — exists`)
    }
  }

  return NextResponse.json({
    message: 'Domain column status check',
    results,
    sql: `-- Run this in Supabase SQL Editor if any columns are missing:
ALTER TABLE website_previews ADD COLUMN IF NOT EXISTS domain_status text DEFAULT NULL;
ALTER TABLE website_previews ADD COLUMN IF NOT EXISTS domain_provider text DEFAULT NULL;
ALTER TABLE website_previews ADD COLUMN IF NOT EXISTS domain_registrar_id text DEFAULT NULL;
ALTER TABLE website_previews ADD COLUMN IF NOT EXISTS domain_auto_renew boolean DEFAULT true;
ALTER TABLE website_previews ADD COLUMN IF NOT EXISTS domain_expires_at timestamptz DEFAULT NULL;`,
  })
}
