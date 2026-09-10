import {internalRequestError,retiredWorkflow} from '@/lib/internal-request'
export type DripStage='searched'|'previewed'|'abandoned_checkout'|'intake_started'
export async function POST(request:Request) {
  return internalRequestError(request)||retiredWorkflow('Legacy marketing drips are retired. New inquiries are saved without enrolling contacts in marketing.')
}
