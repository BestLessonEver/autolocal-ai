import {PATCH as updateDetails} from '@/app/api/dashboard/me/details/route'
export async function PATCH(request:Request,{params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params
  const url=new URL(request.url);url.searchParams.set('slug',slug)
  return updateDetails(new Request(url,request))
}
