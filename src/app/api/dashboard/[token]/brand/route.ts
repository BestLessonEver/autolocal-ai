import {POST as uploadBrand,PATCH as updateBrand} from '@/app/api/dashboard/me/brand/route'
import {forwardLegacyDashboard} from '@/lib/legacy-dashboard'
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,uploadBrand)}
export async function PATCH(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,updateBrand)}
