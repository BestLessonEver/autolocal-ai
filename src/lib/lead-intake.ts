import type { SupabaseClient } from '@supabase/supabase-js'

export const LEAD_STATUSES = ['new','contacted','qualified','booked','won','lost','spam'] as const
export function cleanText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : ''
}
export function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254 }
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
}

export function createLeadSubmitHandler(getDatabase: () => SupabaseClient) {
  return async (request: Request): Promise<Response> => {
    try {
      if (Number(request.headers.get('content-length') || 0) > 16_384) return Response.json({error:'Request is too large.'},{status:413})
      const body = await request.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({error:'Invalid inquiry.'},{status:400})
      if (body.website) return Response.json({error:'Unable to accept this inquiry.'},{status:400})
      const slug = cleanText(body.slug, 100), name = cleanText(body.name, 150)
      const email = cleanText(body.email, 254).toLowerCase(), phone = cleanText(body.phone, 40)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !name || (!email && !phone) || (email && !validEmail(email)) || (phone && phone.replace(/\D/g,'').length < 7)) {
        return Response.json({error:'Enter your name and a valid email or phone number.'},{status:400})
      }
      const submissionId = body.submission_id || null
      if (submissionId && (typeof submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId))) return Response.json({error:'Invalid submission identifier.'},{status:400})
      const attribution = Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','landing_page','referrer'].map(key=>[key,cleanText(body[key],500)]).filter(([,value])=>value))
      const { data, error } = await getDatabase().rpc('submit_site_lead', {
        p_slug:slug,p_name:name,p_email:email,p_phone:phone,p_message:cleanText(body.message,3000),
        p_instrument:cleanText(body.instrument,100),p_service:cleanText(body.service,150),p_source:cleanText(body.source,100)||'website',
        p_attribution:attribution,p_submission_id:submissionId,
      })
      if (error || !data) {
        if (error?.code === 'P0429') return Response.json({error:'You have already sent several inquiries. Please try later or contact the business directly.'},{status:429})
        if (error?.code === 'P0002') return Response.json({error:'This website is not accepting inquiries yet. Please contact the business directly.'},{status:404})
        return Response.json({error:'Your inquiry could not be saved. Please try again or contact the business directly.'},{status:503})
      }
      return Response.json({success:true,lead_id:data})
    } catch (error) {
      if (error instanceof SyntaxError) return Response.json({error:'Invalid inquiry.'},{status:400})
      return Response.json({error:'Your inquiry could not be saved. Please try again.'},{status:503})
    }
  }
}
