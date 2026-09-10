type SiteHealthInput={hosting_status?:string;deployment_verified_at?:string|null;website_current?:string|null;deploy_status?:string;phone?:string|null;contact_email?:string|null;services?:unknown[]}
export type ProviderHealthRow={provider:string;status:string;resource_name:string|null;last_synced_at:string|null;error_code:string|null}
export function ownerSetupHealth(site:SiteHealthInput,connections:ProviderHealthRow[]|null){
 const publicSite=['active','pending_cancel'].includes(site.hosting_status||'')&&!!site.deployment_verified_at&&!!site.website_current&&site.deploy_status!=='suspended'
 const providerState=(provider:string)=>{
  const row=connections?.find(value=>value.provider===provider),status=connections===null?'unknown':row?.status||'not_connected'
  return {status,connected:connections===null?null:status==='connected'&&!!row?.resource_name,resourceSelected:connections===null?null:!!row?.resource_name,lastSyncedAt:row?.last_synced_at||null,errorCode:row?.error_code||null}
 }
 return {email_verified:true,public_site:publicSite,publishing_verified:publicSite,has_contact:!!(site.phone||site.contact_email),has_services:!!site.services?.length,google:{gbp:providerState('gbp'),search_console:providerState('search_console')}}
}
