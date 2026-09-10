import {GET as getPhotos,POST as uploadPhoto,PATCH as updatePhotos} from '@/app/api/dashboard/me/photos/route'
import {forwardLegacyDashboard} from '@/lib/legacy-dashboard'
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,getPhotos)}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,uploadPhoto)}
export async function PATCH(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,updatePhotos)}
