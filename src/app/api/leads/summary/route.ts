import {listOwnerSites,selectorFromRequest,apiErrorResponse,ApiError} from '@/lib/owner-access'
export async function GET(request:Request) {
  try {
    const {db,sites}=await listOwnerSites(),selector=selectorFromRequest(request)
    const ids=sites.filter(site=>(!selector.siteId||site.id===selector.siteId)&&(!selector.slug||site.slug===selector.slug)).map(site=>site.id)
    const end=new Date(),start=new Date(end.getTime()-30*86400000),previousStart=new Date(start.getTime()-30*86400000)
    const metrics:Record<string,string[]|null>={inquiries:null,new:['new'],qualified:['qualified','booked','won'],booked:['booked','won'],won:['won']}
    const window=async(from:Date,to:Date)=>{
      if(!ids.length)return {inquiries:0,new:0,qualified:0,booked:0,won:0}
      const entries=await Promise.all(Object.entries(metrics).map(async([metric,statuses])=>{
        let query=db.from('site_leads').select('id',{head:true,count:'exact'}).in('site_id',ids).gte('created_at',from.toISOString()).lt('created_at',to.toISOString())
        if(statuses)query=query.in('status',statuses)
        const {count,error}=await query
        if(error)throw new ApiError(503,'Lead metrics are temporarily unavailable.')
        return [metric,count||0]
      }))
      return Object.fromEntries(entries)
    }
    const [current,previous]=await Promise.all([window(start,end),window(previousStart,start)])
    return Response.json({...current,previous,periodStart:start.toISOString(),periodEnd:end.toISOString(),previousPeriodStart:previousStart.toISOString(),definition:'Inquiries created during each window, grouped by their current status.'})
  }catch(error){return apiErrorResponse(error)}
}
