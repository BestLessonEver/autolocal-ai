import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'


const ADMIN_KEY = process.env.ADMIN_API_KEY
const ADMIN_EMAILS = [
  'brian@autolocal.ai',
]

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Check API key header
  if (ADMIN_KEY && req.headers.get('x-admin-key') === ADMIN_KEY) return true
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false
  // Check Supabase session cookie
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return req.cookies.get(name)?.value }, set() {}, remove() {} } }
  )
  const { data: { user } } = await sb.auth.getUser()
  return !!user?.email_confirmed_at && ADMIN_EMAILS.includes(user.email || '')
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Database is not configured' }, { status: 503 })
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
