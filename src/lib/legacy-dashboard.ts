import {ApiError,apiErrorResponse} from '@/lib/owner-access'
export async function forwardLegacyDashboard(request:Request,params:Promise<{token:string}>,handler:(request:Request)=>Promise<Response>) {
  try {
    const {token}=await params
    // A historic token is now only a locator. Every destination requires an owner session.
    const slug=token.replace(/^[a-f0-9]{8}-/i,'')
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ApiError(400,'Invalid website.')
    const url=new URL(request.url);url.searchParams.set('slug',slug)
    return handler(new Request(url,request))
  } catch(error) {return apiErrorResponse(error)}
}
