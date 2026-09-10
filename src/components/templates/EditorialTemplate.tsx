/* eslint-disable @next/next/no-img-element */
import { ArrowUpRight, ArrowDown, MapPin } from 'lucide-react'
import { type TemplateProps } from './types'
import styles from './EditorialTemplate.module.css'

/** A data-driven hospitality direction. Kept in the design lab until export parity is ready. */
export default function EditorialTemplate({ data }: TemplateProps) {
  const services = data.services ?? []
  const hours = Object.entries(data.hours ?? {})
  const destination = data.cta_url || '#visit'
  return (
    <main className={styles.site}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="#top">{data.business_name}<span>NEIGHBORHOOD KITCHEN</span></a>
        <nav aria-label="Restaurant navigation"><a href="#menu">The menu</a><a href="#story">Our story</a><a href="#visit">Find us</a></nav>
        <a className={styles.headerCta} href={destination}>{data.cta_text} <ArrowUpRight size={16}/></a>
      </header>
      <section id="top" className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span/> {data.city}, {data.state} · Made for gathering</p>
          <h1>{data.tagline || data.business_name}</h1>
          <p className={styles.intro}>{data.description}</p>
          <div className={styles.actions}><a className={styles.primary} href={destination}>{data.cta_text}<ArrowUpRight size={20}/></a><a className={styles.secondary} href="#menu">Explore the menu <ArrowDown size={16}/></a></div>
          <div className={styles.heroNote}><span className={styles.sun}>✳</span><p>Good food.<br/>Even better company.</p></div>
        </div>
        <div className={styles.heroImage}>
          {data.hero_image_url && <img src={data.hero_image_url} alt={`The dining room at ${data.business_name}`} fetchPriority="high"/>}
          <div className={styles.imageCaption}><span>A PLACE AT THE TABLE</span><span>Come as you are. Stay awhile.</span></div>
        </div>
      </section>
      <div className={styles.strip}><span>Thoughtfully made.</span><span aria-hidden="true">✳</span><span>Locally loved.</span><span aria-hidden="true">✳</span><span>Always a little unexpected.</span></div>
      <section id="menu" className={styles.menu}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>01 / FROM OUR KITCHEN</p><h2>A few good reasons<br/>to pull up a chair.</h2></div><p>A short menu. A lot of care.<br/>Ask us what&apos;s fresh today.</p></div>
        <div className={styles.menuItems}>{services.map((service, index) => <article key={`${service.name}-${index}`}><span className={styles.number}>0{index + 1}</span><div><h3>{service.name}</h3><p>{service.description}</p></div>{service.price && <span className={styles.price}>{service.price}</span>}</article>)}</div>
      </section>
      <section id="story" className={styles.story}><span className={styles.sun}>✳</span><p className={styles.eyebrow}>A LITTLE ROOM FOR EVERYONE</p><h2>Your usual table.<br/>Your new favorite place.</h2><p>Drop in for a slow lunch, make an evening of it, or bring the people you never get enough time with. We&apos;ll take care of the rest.</p><a href="#visit">Make yourself at home <ArrowUpRight size={18}/></a></section>
      <section id="visit" className={styles.visit}><div><p className={styles.eyebrow}>02 / COME ON OVER</p><h2>See you soon.</h2><p><MapPin size={16}/>{[data.address, data.city, data.state].filter(Boolean).join(', ')}</p>{data.phone && <a href={`tel:${data.phone.replace(/[^+0-9]/g,'')}`}>{data.phone} <ArrowUpRight size={16}/></a>}</div><dl>{hours.map(([day,time])=><div key={day}><dt>{day}</dt><dd>{time}</dd></div>)}</dl></section>
      <footer className={styles.footer}><span>{data.business_name}</span><p>A little local goes a long way.</p><a href="#top">Back to top ↑</a></footer>
    </main>
  )
}
