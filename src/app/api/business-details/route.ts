import { NextResponse } from "next/server";
import { enforcePublicBudget } from "@/lib/public-rate-limit";
export async function POST(request: Request) {
  try {
    const { placeId } = await request.json();
    if (typeof placeId !== "string" || !/^[A-Za-z0-9_-]{10,255}$/.test(placeId))
      return NextResponse.json(
        { error: "Choose a valid business listing." },
        { status: 400 },
      );
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key)
      return NextResponse.json(
        {
          error:
            "Business details are unavailable. Please enter them manually.",
        },
        { status: 503 },
      );
    const limited=await enforcePublicBudget(request, "google-places");if(limited)return limited;
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,addressComponents,nationalPhoneNumber,websiteUri,regularOpeningHours.weekdayDescriptions,pureServiceAreaBusiness,googleMapsUri",
        },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      return NextResponse.json(
        {
          error:
            "Google could not return these details. Please enter them manually.",
        },
        { status: 502 },
      );
    const data = await response.json();
    const components: Array<{
      types: string[];
      longText?: string;
      shortText?: string;
    }> = Array.isArray(data.addressComponents) ? data.addressComponents : [];
    const component = (type: string) =>
      components.find((x) => x.types?.includes(type))?.longText || "";
    return NextResponse.json(
      {
        name: data.displayName?.text || "",
        phone: data.nationalPhoneNumber || "",
        website: data.websiteUri || "",
        city: component("locality") || component("postal_town"),
        state: component("administrative_area_level_1"),
        hours: data.regularOpeningHours?.weekdayDescriptions || [],
        serviceAreaBusiness: data.pureServiceAreaBusiness || false,
        sourceUrl: data.googleMapsUri || null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof SyntaxError ? "Invalid business lookup request." : "Business details could not load. Please enter them manually." },
      { status: error instanceof SyntaxError ? 400 : 502 },
    );
  }
}
