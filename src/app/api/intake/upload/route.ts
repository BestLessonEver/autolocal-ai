import {requireUser,apiErrorResponse} from '@/lib/owner-access'
import {uploadImage} from '@/lib/site-media'
export const runtime='nodejs'
export async function POST(request:Request) {
  try {const {user,db}=await requireUser();const form=await request.formData();const url=await uploadImage(form.get('file') as File,db,user.id);return Response.json({url})}
  catch(error) {return apiErrorResponse(error)}
}
