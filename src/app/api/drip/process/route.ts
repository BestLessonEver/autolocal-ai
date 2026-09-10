import {internalRequestError,retiredWorkflow} from '@/lib/internal-request'
export async function POST(request:Request) {
  return internalRequestError(request)||retiredWorkflow('Legacy marketing drips are retired. Use the authenticated notification worker for owner lead alerts.')
}
export async function GET() {return Response.json({error:'Use an authenticated POST.'},{status:405,headers:{Allow:'POST'}})}
