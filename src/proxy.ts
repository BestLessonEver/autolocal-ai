import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_EMAILS = [
  'brian@autolocal.ai',
]

export async function proxy(request: NextRequest) {
  // An isolated, local-only gallery: no database, lead capture, or paid services.
  if (process.env.NODE_ENV === 'development' && process.env.AUTOLOCAL_DESIGN_LAB_ONLY === '1') {
    const path = request.nextUrl.pathname
    if (path === '/design-lab' || path.startsWith('/_next/')) return NextResponse.next()
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Services are disabled in the local design lab.' }, { status: 503 })
    }
    return NextResponse.redirect(new URL('/design-lab', request.url))
  }
  if (request.nextUrl.pathname.startsWith('/admin') && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) return NextResponse.redirect(new URL('/login', request.url))
  // Protect admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    let response = NextResponse.next({ request: { headers: request.headers } })
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return request.cookies.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options })
            response = NextResponse.next({ request: { headers: request.headers } })
            response.cookies.set({ name, value: '', ...options })
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
