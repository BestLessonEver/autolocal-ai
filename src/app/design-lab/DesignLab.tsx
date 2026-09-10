'use client'
import { useState } from 'react'
import EditorialTemplate from '@/components/templates/EditorialTemplate'
import ModernCleanTemplate from '@/components/templates/ModernCleanTemplate'
import type { PreviewData } from '@/components/templates/types'

const fixture: PreviewData = {
  id:'00000000-0000-0000-0000-000000000001',slug:'juniper-demo',business_name:'Juniper',
  tagline:'Stay a little longer.',description:'Seasonal plates, something good in your glass, and a table that feels like yours. Right here in the neighborhood.',
  category:'restaurant',brand_color_primary:'#283329',brand_color_secondary:'#596256',brand_color_accent:'#b9c779',
  logo_url:null,hero_image_url:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&h=1600&fit=crop',gallery_images:[],
  services:[{name:'Burrata & heirloom tomatoes',description:'Basil oil, sourdough, a little flaky sea salt.',price:'$16'},{name:'Roasted mushroom pappardelle',description:'Hand-cut pasta, wild mushrooms, parmesan.',price:'$24'},{name:'The Sunday roast',description:'Slow-roasted chicken, seasonal vegetables, pan jus.',price:'$28'}],
  hours:{Tuesday:'5–9 pm',Wednesday:'5–9 pm',Thursday:'5–9 pm',Friday:'5–10 pm',Saturday:'11 am–10 pm',Sunday:'11 am–8 pm',Monday:'Closed'},
  address:'123 Example Street',city:'Friendswood',state:'TX',phone:null,email:null,website_current:null,reviews:[],google_rating:null,google_review_count:0,
  cta_text:'Plan your visit',cta_url:'#visit',template:'editorial',
}
export default function DesignLab() {
  const [original,setOriginal]=useState(false)
  const [mobile,setMobile]=useState(false)
  return <div style={{background:'#d9dbd4',minHeight:'100vh'}}>
    <div style={{background:'#202622',color:'#fff',padding:'14px 22px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap',fontSize:12}}>
      <div><strong>AutoLocal / Template Workshop</strong><p style={{fontSize:10,color:'#b9c1ba',marginTop:5}}>Fictional restaurant · Sample copy & stock photo · Local preview only</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button aria-pressed={!original} onClick={()=>setOriginal(false)} style={{padding:'9px 13px',border:'1px solid #66736a',background:!original?'#e4edb5':'transparent',color:!original?'#283329':'white'}}>New direction</button>
        <button aria-pressed={original} onClick={()=>setOriginal(true)} style={{padding:'9px 13px',border:'1px solid #66736a',background:original?'#e4edb5':'transparent',color:original?'#283329':'white'}}>Original template</button>
        <button aria-pressed={mobile} onClick={()=>setMobile(!mobile)} style={{padding:'9px 13px',border:'1px solid #66736a'}}>{mobile?'Full width':'Phone preview'}</button>
      </div>
    </div>
    {mobile ? <iframe title="Phone template preview" src={`/design-lab?frame=1&original=${original?1:0}`} style={{display:'block',width:390,maxWidth:'100%',height:800,margin:'24px auto',border:'8px solid #202622',borderRadius:24}}/> : <TemplateContent original={original}/>}
  </div>
}
function TemplateContent({original}:{original:boolean}) {
  return original ? <ModernCleanTemplate data={{...fixture,cta_url:'#contact'}}/> : <EditorialTemplate data={fixture}/>
}
export { fixture, TemplateContent }
