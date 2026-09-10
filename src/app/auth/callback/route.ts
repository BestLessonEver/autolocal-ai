import { createServerSupabaseClient } from '@/lib/supabase/server'
import { safeReturnPath } from '@/lib/safe-return-path'
import { NextResponse } from 'next/server'
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code'),next=safeReturnPath(url.searchParams.get('next'))
 // Never use a caller-supplied external URL as the post-auth destination.
 const origin=process.env.NEXT_PUBLIC_SITE_URL||url.origin
 if(code)try{const supabase=await createServerSupabaseClient();const {error}=await supabase.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(next,origin))}catch{/* A provider failure returns to a recoverable sign-in screen. */}
 return NextResponse.redirect(new URL(`/login?error=auth_failed&next=${encodeURIComponent(next)}`,origin))
}
