import {POST as requestChange} from '@/app/api/dashboard/me/changes/route'
import {forwardLegacyDashboard} from '@/lib/legacy-dashboard'
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) {return forwardLegacyDashboard(request,params,requestChange)}
