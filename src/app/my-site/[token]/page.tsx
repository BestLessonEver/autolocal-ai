import {redirect} from 'next/navigation'
export default async function LegacyDashboard({params}:{params:Promise<{token:string}>}) {
  const {token}=await params
  const slug=token.replace(/^[a-f0-9]{8}-/i,'')
  redirect('/dashboard?slug='+encodeURIComponent(slug))
}
