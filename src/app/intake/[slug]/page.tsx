import { redirect } from 'next/navigation'
export default async function LegacyIntake({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams;const next=new URLSearchParams();for(const key of ['name','city','email','template'])if(typeof query[key]==='string')next.set(key,query[key]);redirect(`/start?${next}`)}
