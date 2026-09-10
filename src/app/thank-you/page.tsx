import Link from 'next/link'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import m from '@/components/marketing.module.css'
export const metadata={title:'Your next step',robots:{index:false,follow:false}}
export default function Thanks(){return <div className={m.surface}><MarketingNav/><main className={m.prose}><h1>Let’s check your progress.</h1><p>Your workspace shows the confirmed state of your plan and website. A checkout redirect alone does not mean the website has been published.</p><Link href="/dashboard?tab=settings" className={m.button}>Open my workspace</Link></main><MarketingFooter/></div>}
