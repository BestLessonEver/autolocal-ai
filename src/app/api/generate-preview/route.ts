import { requireUser, apiErrorResponse, ApiError } from '@/lib/owner-access'
import { saveOwnedIntake } from '@/lib/site-intake'
import { cleanText } from '@/lib/lead-intake'
import { normalizeCategory } from '@/lib/site-content'

export async function POST(request:Request) {
  try {
    const context=await requireUser()
    const body=await request.json()
    const key=process.env.GOOGLE_PLACES_API_KEY
    if(!key) throw new ApiError(503,'Google business lookup is unavailable. You can enter your business details manually.')
    const placeId=cleanText(body.placeId,250)
    if(!placeId || !/^[a-zA-Z0-9_-]+$/.test(placeId)) throw new ApiError(400,'Choose a business from search, or enter your details manually.')
    const response=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{
      headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,displayName,formattedAddress,addressComponents,regularOpeningHours,nationalPhoneNumber,websiteUri,types'},
      signal:AbortSignal.timeout(12000),
    })
    if(!response.ok) throw new ApiError(502,'Google could not return this business. Please try again or enter the details manually.')
    const place=await response.json()
    if(place.id!==placeId || !place.displayName?.text) throw new ApiError(502,'Google returned incomplete business details.')
    const component=(type:string)=>place.addressComponents?.find((item:{types:string[]})=>item.types.includes(type))?.longText||''
    const hours:Record<string,string>={}
    for(const value of place.regularOpeningHours?.weekdayDescriptions||[]) {
      const split=String(value).indexOf(': ')
      if(split>0) hours[String(value).slice(0,3).toLowerCase()]=String(value).slice(split+2)
    }
    // Imported facts remain an owner preview. No account creation, email, review
    // fabrication, automatic ownership claim, or paid/live operation occurs here.
    const result=await saveOwnedIntake({
      businessName:place.displayName.text,city:component('locality')||component('postal_town'),state:component('administrative_area_level_1'),
      address:place.formattedAddress,phone:place.nationalPhoneNumber,website:place.websiteUri,
      category:normalizeCategory((place.types||[]).join(' ')),hours,
      businessFacts:{google_place_id:place.id,facts_source:'Google Places',imported_at:new Date().toISOString()},
    },context)
    return Response.json({...result,businessName:place.displayName.text,requiresFactReview:true})
  } catch(error) {return apiErrorResponse(error)}
}
