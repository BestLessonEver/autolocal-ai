import {GET as readSite} from '@/app/api/dashboard/me/route'
import {PATCH as editSite} from '@/app/api/dashboard/me/details/route'
import {forwardLegacyDashboard} from '@/lib/legacy-dashboard'
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,readSite)}
export async function PATCH(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,editSite)}
