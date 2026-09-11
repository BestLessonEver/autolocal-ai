import { requireUser, apiErrorResponse } from '@/lib/owner-access'
import { saveOwnedIntake } from '@/lib/site-intake'
import { legacyGooglePreviewIntake } from '@/lib/google-site'

/** Older clients keep their save-and-open response; Google content is loaded on preview. */
export async function POST(request: Request) {
  try {
    const context = await requireUser()
    const intake = legacyGooglePreviewIntake(await request.json())
    const result = await saveOwnedIntake(intake, context)
    return Response.json({
      ...result,
      businessName: intake.businessName,
      requiresFactReview: true,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return apiErrorResponse(error) }
}
