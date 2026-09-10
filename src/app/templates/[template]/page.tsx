import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ProfessionalSite from '@/components/templates/ProfessionalSite'
import { TEMPLATE_DEMOS } from '@/components/templates/demo-data'
import { isProfessionalTemplate } from '@/components/templates/professional-renderer'
import { PROFESSIONAL_TEMPLATES } from '@/components/templates/types'
import DemoViewer from './DemoViewer'
type Props = { params: Promise<{ template: string }>; searchParams: Promise<{ embed?: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { template } = await params
  return { title: { absolute: `${isProfessionalTemplate(template) ? PROFESSIONAL_TEMPLATES.find(item => item.id === template)?.name : 'Website'} design demo | AutoLocal` }, robots: { index: false, follow: false }, alternates: { canonical: `/templates/${encodeURIComponent(template)}` } }
}
export default async function TemplateDemoPage({ params, searchParams }: Props) {
  const { template } = await params
  if (!isProfessionalTemplate(template)) notFound()
  if ((await searchParams).embed === '1') return <ProfessionalSite data={TEMPLATE_DEMOS[template]} template={template} mode="demo"/>
  return <DemoViewer template={template} name={PROFESSIONAL_TEMPLATES.find(item => item.id === template)!.name}/>
}
