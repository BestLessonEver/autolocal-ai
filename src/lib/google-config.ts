import {ApiError} from '@/lib/owner-access'
import {appOrigin} from '@/lib/integration-config'
export type GoogleProvider='gbp'|'search_console'
export const GOOGLE_SCOPES={gbp:'https://www.googleapis.com/auth/business.manage',search_console:'https://www.googleapis.com/auth/webmasters.readonly'} as const
export function googleProvider(value:unknown):GoogleProvider {
 if(value!=='gbp'&&value!=='search_console')throw new ApiError(400,'Choose Google Business Profile or Search Console.')
 return value
}
export function getGoogleConnectionHealth() {
 const configured=!!process.env.GOOGLE_OAUTH_CLIENT_ID&&!!process.env.GOOGLE_OAUTH_CLIENT_SECRET&&Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY||'','base64').length===32
 return {configured,enabled:process.env.AUTOLOCAL_ENABLE_GOOGLE_CONNECTIONS==='true',gbpApproved:process.env.GOOGLE_BUSINESS_PROFILE_API_APPROVED==='true',profileWritesEnabled:process.env.AUTOLOCAL_ENABLE_GBP_WRITES==='true'}
}
export function requireGoogleConfiguration(provider?:GoogleProvider,write=false) {
 const health=getGoogleConnectionHealth()
 if(!health.configured||!health.enabled)throw new ApiError(503,'Google connections are not enabled yet. Setup is required.')
 if(provider==='gbp'&&!health.gbpApproved)throw new ApiError(503,'Google Business Profile API approval must be confirmed before connecting.')
 if(write&&!health.profileWritesEnabled)throw new ApiError(503,'Google profile editing is not enabled. Your draft remains saved.')
 return {clientId:process.env.GOOGLE_OAUTH_CLIENT_ID!,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET!,redirectUri:appOrigin()+'/api/connections/google/callback'}
}
