import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'


const ADMIN_KEY = process.env.ADMIN_API_KEY
const ADMIN_EMAILS = [
  'brian@autolocal.ai',
]

async function isAuthorized(req: NextRequest): Promise<boolean> {
  if (ADMIN_KEY && req.headers.get('x-admin-key') === ADMIN_KEY) return true
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false
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
    .from('website_previews')
    .select('id, slug, business_name, city, state, phone, email, category, google_rating, google_review_count, status, template, created_at, view_count, hosting_status, cancel_date, trial_end, stripe_customer_id, custom_domain')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Database is not configured' }, { status: 503 })
  const supabase = createAdminClient()

  const { id, email, custom_domain } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (email !== undefined) updates.email = email
  if (custom_domain !== undefined) updates.custom_domain = custom_domain

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('website_previews')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send domain-connected notification email when custom_domain is set
  if (custom_domain) {
    try {
      const { data: site } = await supabase
        .from('website_previews')
        .select('email, business_name, contact_name, slug')
        .eq('id', id)
        .single()

      if (site?.email) {
        const firstName = (site.contact_name || '').split(' ')[0] || 'there'

        // Generate magic link for dashboard
        const { data: linkData } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: site.email,
          options: { redirectTo: 'https://autolocal.ai/auth/callback?next=/dashboard' },
        })
        const dashboardUrl = linkData?.properties?.action_link || 'https://autolocal.ai/login'

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr><td align="center" style="padding-bottom:32px;">
          <span style="font-size:24px;font-weight:800;color:#111827;">⚡ AutoLocal.ai</span>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;padding:40px 32px;">
          <h1 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 16px;">🌐 Your custom domain is live!</h1>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Great news, ${firstName}! Your <strong style="color:#111827;">${site.business_name}</strong> website is now live at:
          </p>

          <!-- Domain highlight -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;" role="presentation">
            <tr><td align="center" bgcolor="#eef2ff" style="background-color:#eef2ff;border-radius:16px;padding:24px 32px;border:2px solid #c7d2fe;">
              <a href="https://${custom_domain}" style="color:#312e81;font-size:22px;font-weight:800;text-decoration:none;">${custom_domain}</a>
            </td></tr>
          </table>

          <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Your dashboard has been updated — the "View Site" button now goes to your custom domain. Go check it out!
          </p>

          <!-- Dashboard CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;" role="presentation">
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr><td align="center" bgcolor="#6366f1" style="background-color:#6366f1;border-radius:12px;">
                  <a href="${dashboardUrl}" style="display:inline-block;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 44px;border-radius:12px;border:1px solid #6366f1;">Sign In to My Dashboard →</a>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <p style="color:#9ca3af;font-size:13px;margin:0;">
            Questions? Just reply to this email — a real person reads every one.
          </p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">Brian @ AutoLocal.ai · Custom websites for local businesses</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
        const { sendEmail } = await import('@/lib/mailer')
        sendEmail(site.email, `🌐 ${site.business_name} is now live at ${custom_domain}!`, html).catch(err =>
          console.error('Domain notification email failed:', err)
        )
      }
    } catch (err) {
      console.error('Domain notification error (non-fatal):', err)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Database is not configured' }, { status: 503 })
  const supabase = createAdminClient()

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Delete associated storage files
  const { data: preview } = await supabase
    .from('website_previews')
    .select('slug')
    .eq('id', id)
    .single()

  if (preview?.slug) {
    // Clean up logo and photos from storage
    const { data: files } = await supabase.storage.from('logos').list(preview.slug)
    if (files?.length) {
      await supabase.storage.from('logos').remove(files.map(f => `${preview.slug}/${f.name}`))
    }
  }

  // Delete drip entries
  await supabase.from('drip_queue').delete().eq('preview_id', id)

  // Delete change requests
  await supabase.from('change_requests').delete().eq('preview_id', id)

  // Delete the preview
  const { error } = await supabase
    .from('website_previews')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
