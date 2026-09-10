import type {AuditResult} from './audit-engine'
type AdditionalData={tagline?:string;description?:string;services?:{name:string;description:string;price?:string}[];hours?:Record<string,string>;brand_colors?:{primary?:string;secondary?:string;accent?:string};logo_url?:string;hero_image_url?:string;gallery_images?:string[];email?:string}
/** Legacy outbound callers must use the verified-owner intake workflow.
 * This function previously fabricated reviews, prices and opening hours and
 * overwrote existing slugs. Keeping an explicit failure avoids silent data loss.
 */
export async function generatePreview(_audit:AuditResult,_additional?:AdditionalData):Promise<{url:string;slug:string;id:string}> {
  void _audit
  void _additional
  throw new Error('Legacy outbound preview generation is retired. Use the verified owner business setup flow.')
}
