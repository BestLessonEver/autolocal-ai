import {requireUser,apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function GET() {
  try {
    const {user,db}=await requireUser()
    const admins=(process.env.ADMIN_EMAILS||'brian@autolocal.ai').split(',').map(email=>email.trim().toLowerCase())
    if(!admins.includes(user.email!.toLowerCase())) throw new ApiError(403,'This inbox is available only to an administrator.')
    const {data,error}=await db.from('contact_inquiries').select('id,name,email,business_name,message,source,status,created_at').order('created_at',{ascending:false}).limit(200)
    if(error) throw new ApiError(503,'Contact inquiries are temporarily unavailable.')
    return Response.json({inquiries:data||[]})
  } catch(error) {return apiErrorResponse(error)}
}
