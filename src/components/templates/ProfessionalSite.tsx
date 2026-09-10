'use client'
import Script from 'next/script'
import type { ProfessionalTemplateName } from './types'
import { renderProfessionalSite, PROFESSIONAL_CSS, type PublicSiteData, type SiteRenderOptions } from './professional-renderer'
import { INQUIRY_RUNTIME } from './inquiry-runtime'

export default function ProfessionalSite({ data, template, mode }: { data: PublicSiteData; template?: ProfessionalTemplateName; mode?: SiteRenderOptions['mode'] }) {
  const html = renderProfessionalSite(data, template || data.template, { mode })
  return <><style>{PROFESSIONAL_CSS}</style><div dangerouslySetInnerHTML={{ __html: html }} /><Script id="autolocal-inquiry-runtime" strategy="afterInteractive">{INQUIRY_RUNTIME}</Script></>
}
