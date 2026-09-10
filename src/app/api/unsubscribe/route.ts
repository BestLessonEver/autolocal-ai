import {createAdminClient} from '@/lib/supabase/admin'
import {cleanText,validEmail,escapeHtml} from '@/lib/lead-intake'
function html(body:string,status=200) {
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences | AutoLocal</title><body style="font-family:system-ui;max-width:34rem;margin:4rem auto;padding:1.5rem">'+body+'</body></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})
}
export async function GET(request:Request) {
  const email=cleanText(new URL(request.url).searchParams.get('email'),254)
  return html('<h1>Stop marketing emails</h1><p>We will keep essential account and service messages separate from marketing.</p><form method="POST"><label>Email <input type="email" required name="email" value="'+escapeHtml(email)+'"></label><button type="submit">Unsubscribe</button></form>')
}
export async function POST(request:Request) {
  const form=request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')
  try {
    const value=form?(await request.formData()).get('email'):(await request.json()).email
    const email=cleanText(value,254).toLowerCase()
    if(!validEmail(email))return form?html('<h1>Enter a valid email address.</h1><a href="/api/unsubscribe">Try again</a>',400):Response.json({error:'Enter a valid email address.'},{status:400})
    const {error}=await createAdminClient().rpc('unsubscribe_contact',{p_email:email})
    if(error)throw new Error('Consent could not be saved')
    return form?html('<h1>You are unsubscribed from marketing.</h1><p>Your email preference has been saved.</p>'):Response.json({success:true})
  }catch{
    return form?html('<h1>Your preference could not be saved.</h1><p>Please try again or contact support.</p>',503):Response.json({error:'Your email preference could not be saved. Please try again.'},{status:503})
  }
}
