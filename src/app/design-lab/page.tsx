import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import DesignLab, { TemplateContent } from './DesignLab'
export const metadata: Metadata = {title:'AutoLocal — Template Workshop',robots:{index:false,follow:false}}
export default function Page({ searchParams }: { searchParams: {frame?: string; original?: string} }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  if (searchParams.frame === '1') return <TemplateContent original={searchParams.original === '1'}/>
  return <DesignLab/>
}
