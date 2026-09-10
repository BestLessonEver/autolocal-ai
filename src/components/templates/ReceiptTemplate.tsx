/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
'use client'

import { type TemplateProps, getCtaButtonText } from './types'

function dots(label: string, value: string, width = 40): string {
  const used = label.length + value.length
  const dotCount = Math.max(2, width - used)
  return label + '.'.repeat(dotCount) + value
}

export default function ReceiptTemplate({ data }: TemplateProps) {
  const services = data.services ?? []
  const reviews = data.reviews ?? []
  const galleryImages = (data.gallery_images ?? []).filter(img => img !== data.hero_image_url)
  const hours = data.hours ?? {}
  const ind = data.site_mode === 'individual'

  const daysOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const dayLabels: Record<string, string> = { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN' }

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })

  const divider = '════════════════════════════════════════'
  const thinDivider = '────────────────────────────────────────'

  return (
    <div className="min-h-screen" style={{ background: '#e8e4de', fontFamily: "'Courier New', Courier, monospace", display: 'flex', justifyContent: 'center', padding: '32px 16px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .receipt {
          max-width: 420px;
          width: 100%;
          background: #fafaf7;
          padding: 32px 24px;
          box-shadow: 0 2px 20px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05);
          position: relative;
          color: #1a1a1a;
          font-size: 12px;
          line-height: 1.6;
        }
        .receipt::after {
          content: '';
          position: absolute;
          bottom: -12px;
          left: 0;
          right: 0;
          height: 12px;
          background: linear-gradient(135deg, #fafaf7 33.33%, transparent 33.33%) -12px 0,
                      linear-gradient(225deg, #fafaf7 33.33%, transparent 33.33%) -12px 0,
                      linear-gradient(315deg, #fafaf7 33.33%, transparent 33.33%),
                      linear-gradient(45deg, #fafaf7 33.33%, transparent 33.33%);
          background-size: 24px 12px;
        }
        .receipt-header { text-align: center; font-weight: bold; }
        .receipt-divider { color: #888; overflow: hidden; white-space: nowrap; text-align: center; letter-spacing: 1px; }
        .receipt-thin { color: #aaa; overflow: hidden; white-space: nowrap; text-align: center; }
        .receipt-item { display: flex; justify-content: space-between; align-items: baseline; }
        .receipt-dots { flex: 1; border-bottom: 1px dotted #ccc; margin: 0 4px; min-width: 20px; align-self: flex-end; margin-bottom: 3px; }
        .receipt-barcode { display: flex; justify-content: center; gap: 1px; margin: 16px 0 8px; }
        .receipt-barcode span { display: inline-block; height: 40px; background: #1a1a1a; }
        .receipt-center { text-align: center; }
        .receipt-memo { border: 1px dashed #ccc; padding: 8px; margin: 8px 0; font-size: 11px; }
        @media (max-width: 480px) {
          .receipt { padding: 24px 16px; font-size: 11px; }
        }
      `}} />

      <div className="receipt">
        {/* Logo */}
        {data.logo_url && (
          <div className="receipt-center" style={{ marginBottom: '12px' }}>
            <img src={data.logo_url} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', filter: 'grayscale(30%)' }} />
          </div>
        )}

        {/* Business Name */}
        <div className="receipt-header" style={{ fontSize: '22px', letterSpacing: '3px', marginBottom: '4px' }}>
          {data.business_name.toUpperCase()}
        </div>

        {/* Tagline */}
        {data.tagline && (
          <div className="receipt-center" style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
            {data.tagline}
          </div>
        )}

        {/* Address & Contact */}
        <div className="receipt-center" style={{ fontSize: '10px', color: '#555', marginBottom: '8px' }}>
          {data.address && <div>{data.address}</div>}
          {data.city && <div>{data.city}{data.state ? `, ${data.state}` : ''}</div>}
          {data.phone && <div>TEL: {data.phone}</div>}
          {(data.contact_email || data.email) && <div>{data.contact_email || data.email}</div>}
        </div>

        <div className="receipt-divider">{divider}</div>

        {/* Date / Time / Transaction */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', padding: '4px 0' }}>
          <span>DATE: {dateStr}</span>
          <span>TIME: {timeStr}</span>
        </div>
        <div style={{ fontSize: '10px', color: '#666' }}>
          TXN #: {data.google_review_count ? String(data.google_review_count * 73).padStart(6, '0') : '001337'}
        </div>

        <div className="receipt-thin">{thinDivider}</div>

        {/* Hero Image */}
        {data.hero_image_url && (
          <div style={{ margin: '8px 0' }}>
            <img
              src={data.hero_image_url}
              alt=""
              style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', objectPosition: `center ${data.hero_crop ?? 50}%`, filter: 'contrast(1.1)', border: '1px solid #ddd' }}
            />
          </div>
        )}

        {/* Services as Line Items */}
        {services.length > 0 && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>SERVICES</div>
            {services.map((s, i) => (
              <div key={i}>
                <div className="receipt-item">
                  <span>{s.name.toUpperCase()}</span>
                  <span className="receipt-dots" />
                  <span>{s.price || '---'}</span>
                </div>
                {s.description && (
                  <div style={{ fontSize: '9px', color: '#555', paddingLeft: '8px' }}>  {s.description}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="receipt-thin">{thinDivider}</div>

        {/* Totals */}
        {services.length > 0 && (
          <div style={{ margin: '4px 0 8px' }}>
            <div className="receipt-item">
              <span>ITEMS</span>
              <span className="receipt-dots" />
              <span>{services.length}</span>
            </div>
            <div className="receipt-item" style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>
              <span>SATISFACTION</span>
              <span className="receipt-dots" />
              <span>GUARANTEED</span>
            </div>
          </div>
        )}

        <div className="receipt-divider">{divider}</div>

        {/* Description as Memo */}
        {data.description && (
          <div className="receipt-memo">
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>*** MEMO ***</div>
            {data.description}
          </div>
        )}

        {/* Hours */}
        {Object.keys(hours).length > 0 && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>HOURS OF OPERATION</div>
            {daysOrder.map(day => hours[day] ? (
              <div key={day} className="receipt-item" style={{ fontSize: '11px' }}>
                <span>{dayLabels[day]}</span>
                <span className="receipt-dots" />
                <span>{hours[day]}</span>
              </div>
            ) : null)}
          </div>
        )}

        <div className="receipt-thin">{thinDivider}</div>

        {/* Reviews */}
        {reviews.length > 0 && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>CUSTOMER REVIEWS</div>
            {reviews.map((r, i) => (
              <div key={i} style={{ marginBottom: '8px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'bold' }}>#{i + 1} — {r.author}</span>
                  <span>{'★'.repeat(r.rating)}</span>
                </div>
                <div style={{ color: '#555', fontStyle: 'italic' }}>&quot;{r.text}&quot;</div>
              </div>
            ))}
          </div>
        )}

        {/* Google Rating */}
        {data.google_rating && (
          <>
            <div className="receipt-thin">{thinDivider}</div>
            <div className="receipt-center" style={{ fontWeight: 'bold', margin: '8px 0' }}>
              RATING: {'★'.repeat(Math.round(data.google_rating))}{'☆'.repeat(5 - Math.round(data.google_rating))} ({data.google_rating})
              {data.google_review_count >= 20 && <div style={{ fontSize: '10px', color: '#555' }}>{data.google_review_count} REVIEWS ON GOOGLE</div>}
            </div>
          </>
        )}

        <div className="receipt-divider">{divider}</div>

        {/* Gallery */}
        {galleryImages.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', margin: '8px 0' }}>
            {galleryImages.slice(0, 6).map((img, i) => (
              <img key={i} src={img} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', filter: 'contrast(1.05)' }} />
            ))}
          </div>
        )}

        {/* Barcode */}
        <div className="receipt-barcode">
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={i} style={{ width: (i * 7 + 3) % 5 > 2 ? '2px' : '1px' }} />
          ))}
        </div>

        {/* Thank You */}
        <div className="receipt-center" style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px', margin: '8px 0' }}>
          THANK YOU!
        </div>

        {/* CTA */}
        {data.phone && (
          <div className="receipt-center" style={{ margin: '8px 0' }}>
            <a
              href={`tel:${data.phone}`}
              style={{ display: 'inline-block', border: '2px solid #1a1a1a', padding: '8px 24px', fontWeight: 'bold', fontSize: '14px', color: '#1a1a1a', textDecoration: 'none', fontFamily: 'inherit', letterSpacing: '1px' }}
            >
              {ind ? 'CALL ME' : 'CALL US'}: {data.phone}
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="receipt-center" style={{ fontSize: '9px', color: '#777', marginTop: '16px' }}>
        </div>
      </div>

    </div>
  )
}
