import {
  apiErrorResponse,
  ApiError,
  listOwnerSites,
  selectorFromRequest,
} from "@/lib/owner-access";
export async function GET(request: Request) {
  try {
    const { db, sites } = await listOwnerSites();
    const selector = selectorFromRequest(request);
    const leadId = new URL(request.url).searchParams.get("leadId");
    if (
      leadId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        leadId,
      )
    )
      throw new ApiError(400, "Invalid inquiry link.");
    const owned = sites.filter(
      (site) =>
        (!selector.siteId || site.id === selector.siteId) &&
        (!selector.slug || site.slug === selector.slug),
    );
    if (!owned.length) return Response.json({ leads: [], total: 0 });
    let query = db
      .from("site_leads")
      .select(
        "id,site_id,slug,name,email,phone,message,instrument,service,source,attribution,status,notes,created_at,updated_at",
        { count: "exact" },
      )
      .in(
        "site_id",
        owned.map((site) => site.id),
      );
    if (leadId) query = query.eq("id", leadId);
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .limit(200);
    if (error)
      throw new ApiError(503, "Your inquiries are temporarily unavailable.");
    return Response.json({ leads: data || [], total: count || 0 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
