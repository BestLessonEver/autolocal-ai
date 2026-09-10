/** Shared by the browser preview and exported HTML; the visual chrome never replaces real content. */
export const QUIRKY_TEMPLATE_CSS = String.raw`
/* Phone fundamentals apply to every family, including the original three. */
.al-site{overflow-wrap:anywhere;min-height:100svh}
.al-site .al-brand>span:last-child,.al-site .al-hero-copy,.al-site .al-form>*,.al-site .al-facts>*,.al-site .al-fact-list>*,.al-site .al-contact>*{min-width:0}
.al-site .al-brand{min-height:44px}.al-site .al-brand img{flex-shrink:0}
.al-site .al-form input,.al-site .al-form select,.al-site .al-form textarea{font-size:16px;max-width:100%}
.al-site .al-button{white-space:normal;max-width:100%}
.al-site .al-nav a,.al-site .al-text-link,.al-site .al-service>a,.al-site .al-footer nav a{min-height:44px;display:inline-flex;align-items:center}
.al-site .al-fact-list a,.al-site .al-footer p>a{min-height:44px;max-width:100%;display:inline-flex;align-items:center}
.al-site .al-faq summary{min-height:44px;align-items:center}
.al-site .al-faq summary:after,.al-site .al-arrow,.al-site .al-number{flex-shrink:0}
.al-site .al-hours div{align-items:baseline}.al-site .al-hours dd{text-align:right;min-width:0}
.al-site .al-window-title,.al-site .al-profile-label,.al-site .al-receipt-caption{display:none}
@media(max-width:700px){
  .al-site{padding-bottom:calc(88px + env(safe-area-inset-bottom,0px))}
  .al-site .al-mobile-contact{padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));align-items:stretch}
  .al-site .al-mobile-contact a{min-width:0;min-height:48px;font-size:14px;line-height:1.4}
  .al-site .al-mobile-contact a:first-child:not(:last-child){flex:0 0 30%}
  .al-site .al-nav{flex-wrap:wrap;column-gap:18px;row-gap:0}
  .al-site .al-nav a:nth-child(2){display:inline-flex}
  .al-site .al-footer nav{flex-wrap:wrap;gap:4px 24px}
  .al-site .al-actions>.al-button{font-size:14px}
  .al-site .al-section-head .al-kicker,.al-site .al-kicker,.al-site .al-hero .al-kicker{font-size:11px;letter-spacing:.12em}
  .al-site .al-service p,.al-site .al-faq p,.al-site .al-hours div{font-size:15px}
}
@media(max-width:380px){
  .al-site .al-fact-list{grid-template-columns:1fr}
  .al-site .al-brand{max-width:100%}
  .al-site .al-nav{margin-left:0}
  .al-atelier .al-hero h1{font-size:clamp(40px,12vw,56px)}
}

/* Desktop 95: a desktop of real content windows, with touch-sized controls. */
.al-site.al-win95{--al-ink:#171b27;--al-paper:#f7f7ee;--al-muted:#47515b;--al-line:#999fa3;--al-accent:#fff4a6;--al-panel:#e5e5df;font-family:Tahoma,Verdana,Arial,sans-serif;background:#087c80;background-image:radial-gradient(#ffffff14 1px,transparent 1px);background-size:7px 7px;padding-top:20px}
.al-win95 .al-shell{width:calc(100% - 28px);max-width:1120px}
.al-win95 .al-demo{margin-top:-20px;background:#fff4a6;color:#252619;font-size:10px}
.al-win95 .al-header{margin-top:18px;padding:0;min-height:0;gap:0;display:grid;grid-template-columns:1fr;border:2px solid;border-color:#fff #303b3e #303b3e #fff;background:#d7d9d5;box-shadow:4px 4px 0 #00474d}
.al-win95 .al-header .al-brand{max-width:none;margin:3px;padding:12px;background:#172a75;color:#fff;font-size:18px;letter-spacing:0}
.al-win95 .al-brand-mark{background:#fff4a6;color:#172a75;border:2px solid;border-color:#fff #777 #777 #fff;width:32px;height:32px;font-size:21px}
.al-win95 .al-header .al-nav{margin:0;padding:2px 10px;gap:4px;flex-wrap:wrap}
.al-win95 .al-nav a{padding:6px 12px;font-size:14px;text-decoration:underline;text-underline-offset:3px}
.al-win95 .al-nav a:hover{background:#fff4a6;text-decoration:underline}
.al-win95 .al-header>.al-button{display:none}
.al-win95 .al-button{border:2px solid;border-color:#fff #41474b #41474b #fff;background:#d7d9d5;color:#171b27;box-shadow:1px 1px 0 #171b27;border-radius:0;font-size:14px;font-weight:700;gap:20px;transition:none}
.al-win95 .al-button:hover{transform:none;background:#eee}
.al-win95 .al-button:active{border-color:#41474b #fff #fff #41474b;box-shadow:none}
.al-win95 .al-button-accent{background:#fff4a6;color:#171b27}
.al-win95 .al-button-accent:hover{background:#fff7c4}
.al-win95 .al-hero{margin-top:26px;margin-bottom:26px;padding:7px;gap:0;grid-template-columns:1fr;border:2px solid;border-color:#fff #303b3e #303b3e #fff;background:#e5e5df;box-shadow:5px 5px 0 #00474d;align-items:stretch}
.al-win95 .al-window-title{display:flex;align-items:center;gap:10px;grid-column:1/-1;padding:9px 12px;background:#172a75;color:#fff;font-size:13px;font-weight:700;letter-spacing:.03em}
.al-win95 .al-window-icon{width:15px;height:15px;display:block;border:2px solid #fff;background:linear-gradient(#fff4a6 0 30%,transparent 30%);flex-shrink:0}
.al-win95 .al-hero-copy{padding:27px 18px 30px;background:var(--al-paper)}
.al-win95 .al-hero h1{font-size:clamp(36px,9.5vw,54px);line-height:1.08;letter-spacing:-.04em;max-width:720px}
.al-win95 .al-kicker:before{width:10px;height:10px;margin-right:10px;background:#087c80}
.al-win95 .al-hero .al-kicker{margin-bottom:20px;font-size:11px}
.al-win95 .al-intro{font-size:16px;line-height:1.7;margin-top:20px}
.al-win95 .al-actions{gap:14px;margin-top:24px}
.al-win95 .al-hero-media{height:260px;padding:7px 0 0}
.al-win95 .al-image{border:2px solid;border-color:#777 #fff #fff #777}
.al-win95 .al-image figcaption{padding:6px 8px;font-size:11px;letter-spacing:0}
.al-win95 .al-art{background:#fff4a6;color:#172a75;padding:28px;border:2px solid;border-color:#777 #fff #fff #777}
.al-win95 .al-art-mark{color:#172a75;font-family:'Courier New',monospace;font-size:112px;letter-spacing:-.1em}
.al-win95 .al-art:before,.al-win95 .al-art:after{border:2px solid #172a7533;transform:none}
.al-win95 .al-art:before{width:48%;height:62%;left:40%;top:25%}.al-win95 .al-art:after{width:48%;height:62%;left:44%;top:31%}
.al-win95 .al-art-dot{background:#087c80}.al-win95 .al-art-caption{font-size:12px;letter-spacing:0}
.al-win95 .al-service-strip{background:transparent;color:#fff}
.al-win95 .al-strip-inner{display:flex;flex-wrap:wrap;gap:8px}
.al-win95 .al-strip-inner a{flex:1 1 200px;min-width:0;margin:0;padding:13px 16px;font-size:14px;border:1px solid #ffffff80;gap:13px;background:#00595e}
.al-win95 .al-strip-inner a:last-child{border:1px solid #ffffff80}
.al-win95 .al-strip-inner .al-number{color:#fff4a6}
.al-win95 .al-section{padding:24px 20px;margin-top:26px;margin-bottom:26px;border:2px solid;border-color:#fff #303b3e #303b3e #fff;background:var(--al-paper);box-shadow:4px 4px 0 #00474d}
.al-win95 .al-section-head{display:block;margin-bottom:24px}
.al-win95 .al-section-head .al-kicker{margin:-20px -16px 25px;padding:9px 12px;background:#172a75;color:#fff;font-size:12px;letter-spacing:.02em;text-transform:none}
.al-win95 .al-section-head .al-kicker:before{background:#fff4a6}
.al-win95 h2{font-size:32px;letter-spacing:-.035em;line-height:1.15;font-weight:700}
.al-win95 .al-services{display:grid;grid-template-columns:1fr;gap:16px}
.al-win95 .al-service{margin:0;padding:22px;background:#fff;border:1px solid #9ca4a5;box-shadow:inset 2px 2px 0 #e5e5df}
.al-win95 .al-service h3{font-size:23px;margin:12px 0}
.al-win95 .al-service a{color:#172a75;text-decoration:underline;text-underline-offset:4px;font-size:13px;margin-top:12px}
.al-win95 .al-service p{font-size:15px}.al-win95 .al-service .al-number{opacity:1;color:#526267;font-family:'Courier New',monospace}
.al-win95 .al-about-band{background:transparent}
.al-win95 .al-facts{grid-template-columns:1fr;gap:28px}
.al-win95 .al-fact-list{margin:0}.al-win95 .al-fact-list dt{font-size:11px}
.al-win95 .al-gallery{grid-template-columns:1fr 1fr;gap:12px}
.al-win95 .al-gallery figure{height:180px;border:5px solid #e5e5df;outline:1px solid #999fa3}
.al-win95 .al-gallery figure:first-child{grid-column:1/-1;height:260px}
.al-win95 .al-form{grid-template-columns:1fr;padding:20px;background:#e5e5df;border:1px solid #999fa3}
.al-win95 .al-form input,.al-win95 .al-form textarea,.al-win95 .al-form select{background:#fff;border:2px solid;border-color:#777 #fff #fff #777}
.al-win95 .al-contact,.al-win95 .al-faq-grid{grid-template-columns:1fr;gap:28px}
.al-win95 .al-contact-intro>p{font-size:16px}
.al-win95 .al-footer{margin-top:36px;background:#d7d9d5;color:#171b27;border-top:2px solid #fff;padding:28px 0}
.al-win95 .al-footer .al-brand{font-size:17px;max-width:none}.al-win95 .al-footer p{font-size:12px}
.al-win95 .al-mobile-contact{background:#d7d9d5;border-top:2px solid #fff;box-shadow:0 -2px 0 #777}

/* Guestbook: a profile page with orange notes and blue contact panels. */
.al-site.al-myspace{--al-ink:#162f58;--al-paper:#fff;--al-muted:#526279;--al-line:#b8cbe2;--al-accent:#f9bc56;--al-panel:#eaf1fa;background:#eaf1fa;font-family:Verdana,Geneva,Arial,sans-serif}
.al-myspace .al-shell{width:calc(100% - 32px);max-width:1080px}
.al-myspace .al-demo{background:#fff1da;color:#66460a}
.al-myspace .al-header{display:flex;flex-wrap:wrap;gap:6px 24px;min-height:0;margin-top:18px;padding:18px 20px;background:#163e80;color:white;border:0}
.al-myspace .al-header .al-brand{max-width:100%;font-size:20px;letter-spacing:-.05em}
.al-myspace .al-brand-mark{border:0;background:#f9bc56;color:#163e80;border-radius:8px 8px 8px 0;font-family:Georgia,serif}
.al-myspace .al-header .al-nav{margin-left:0;gap:22px}.al-myspace .al-nav a{font-size:13px}
.al-myspace .al-header>.al-button{display:none}
.al-myspace .al-profile-label{display:inline-flex;padding:6px 10px;background:#fff1da;border:1px solid #edcf9b;color:#714200;font-size:11px;font-weight:700;letter-spacing:.06em;margin-bottom:20px;text-transform:uppercase}
.al-myspace .al-hero{display:grid;grid-template-columns:1fr;gap:22px;padding:24px;background:#fff;border:1px solid #b8cbe2;margin-top:20px;margin-bottom:20px}
.al-myspace .al-hero h1{font-size:clamp(34px,9vw,52px);line-height:1.12;font-weight:700;letter-spacing:-.055em}
.al-myspace .al-hero .al-kicker{margin-bottom:16px;font-size:11px;letter-spacing:.04em;text-transform:none;color:#526279}
.al-myspace .al-kicker:before{display:none}
.al-myspace .al-intro{font-size:16px;margin-top:20px;line-height:1.75}
.al-myspace .al-actions{margin-top:24px;gap:12px}
.al-myspace .al-button{background:#163e80;color:#fff;border:1px solid #163e80;font-size:14px;gap:18px;min-height:48px;border-radius:3px;box-shadow:0 3px 0 #bbcadf}
.al-myspace .al-button-accent{background:#f9bc56;color:#172a49;border-color:#c98d2e;box-shadow:0 3px 0 #edcf9b}
.al-myspace .al-hero-media{height:280px;border:1px solid #b8cbe2;padding:7px;background:#eaf1fa}
.al-myspace .al-image figcaption{padding:5px;font-size:11px;background:#eaf1fa;letter-spacing:0}
.al-myspace .al-art{background:#cbdcf5;padding:24px;color:#163e80}
.al-myspace .al-art-mark{font-family:Georgia,serif;font-size:132px;font-weight:400;color:#163e80;line-height:1}
.al-myspace .al-art:before{width:175px;height:175px;border-radius:50%;background:#f9bc56;border:0;left:auto;right:-40px;top:20px;transform:none}
.al-myspace .al-art:after{width:100px;height:100px;border:2px solid #163e8040;left:auto;right:20px;top:105px;border-radius:50%;transform:none}
.al-myspace .al-art-dot{background:#163e80;border-radius:50%}.al-myspace .al-art-caption{font-size:12px;letter-spacing:0}
.al-myspace .al-service-strip{background:transparent;color:#163e80}
.al-myspace .al-strip-inner{display:flex;flex-wrap:wrap;gap:8px}
.al-myspace .al-strip-inner a{margin:0;padding:12px 14px;flex:1 1 200px;font-size:13px;font-weight:700;gap:12px;border:1px solid #b8cbe2;background:#fff;min-width:0}
.al-myspace .al-strip-inner a:last-child{border:1px solid #b8cbe2}.al-myspace .al-strip-inner .al-number{color:#163e80}
.al-myspace .al-section{padding:24px;margin-top:20px;margin-bottom:20px;background:#fff;border:1px solid #b8cbe2}
.al-myspace .al-section-head{display:block;margin-bottom:24px}
.al-myspace .al-section-head .al-kicker{background:#fff1da;color:#714200;margin:-24px -24px 25px;padding:12px 24px;font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:none;border-bottom:1px solid #edcf9b}
.al-myspace h2{font-size:30px;line-height:1.18;letter-spacing:-.045em;font-weight:700}
.al-myspace .al-services{display:grid;grid-template-columns:1fr;gap:0}
.al-myspace .al-service{display:grid;grid-template-columns:34px minmax(0,1fr);gap:0 12px;margin:0;padding:24px 0;border-top:1px solid #d9e3f0}
.al-myspace .al-service:first-child{border:0;padding-top:0}.al-myspace .al-service:last-child{padding-bottom:0}
.al-myspace .al-service .al-number{width:32px;height:32px;display:grid;place-items:center;background:#eaf1fa;border:1px solid #b8cbe2;opacity:1;color:#163e80;font-size:12px}
.al-myspace .al-service h3{margin:2px 0 12px;font-size:20px;line-height:1.4;letter-spacing:-.02em}
.al-myspace .al-service p,.al-myspace .al-service>a{grid-column:2;font-size:15px}
.al-myspace .al-service a{font-size:13px;margin-top:12px;color:#163e80;text-decoration:underline;text-underline-offset:4px}
.al-myspace .al-about-band{background:transparent}
.al-myspace .al-facts{display:block}.al-myspace .al-facts>.al-fact-list{margin-top:26px}.al-myspace .al-facts h2{font-size:26px}
.al-myspace .al-facts>div>.al-kicker{margin:-24px -24px 24px;padding:12px 24px;background:#163e80;color:#fff;font-size:12px;letter-spacing:.02em;text-transform:none}
.al-myspace .al-fact-list{grid-template-columns:1fr;gap:20px}
.al-myspace .al-fact-list>div{padding-bottom:16px;border-bottom:1px solid #d9e3f0}.al-myspace .al-fact-list>div:last-child{border:0;padding-bottom:0}
.al-myspace .al-fact-list dt{font-size:11px;color:#163e80;font-weight:700}.al-myspace .al-fact-list dd{font-size:15px}
.al-myspace .al-gallery{grid-template-columns:1fr 1fr;gap:12px}.al-myspace .al-gallery figure{height:180px;border:6px solid #eaf1fa}
.al-myspace .al-gallery figure:first-child{grid-column:1/-1;height:260px}
.al-myspace .al-faq-grid,.al-myspace .al-contact{grid-template-columns:1fr;gap:28px}
.al-myspace .al-faq summary{font-size:16px;font-weight:700}.al-myspace .al-faq p{font-size:15px}
.al-myspace .al-contact .al-kicker{color:#714200;background:#fff1da;padding:6px 10px;display:inline-block;font-size:11px;letter-spacing:.04em}
.al-myspace .al-form{padding:20px;background:#eaf1fa;border:1px solid #b8cbe2;grid-template-columns:1fr;gap:18px}
.al-myspace .al-form label{font-size:13px;color:#163e80}.al-myspace .al-form input,.al-myspace .al-form textarea,.al-myspace .al-form select{background:#fff;border-color:#9fb6d3;border-radius:2px}
.al-myspace .al-footer{background:#163e80;color:#fff;padding:30px 0;margin-top:30px}.al-myspace .al-footer .al-brand{max-width:none;font-size:18px}
.al-myspace .al-mobile-contact{background:#eaf1fa;border-color:#9fb6d3}

/* Receipt: a single paper column, real line items, generous readable type. */
.al-site.al-receipt{--al-ink:#292a24;--al-paper:#fffef7;--al-muted:#64675d;--al-line:#b9bbad;--al-accent:#e8e9d7;--al-panel:#f2f1e6;font-family:'Courier New',Courier,monospace;background:#dadbd2;padding-top:18px;background-image:linear-gradient(120deg,#e5e6dc,#cecfc7)}
.al-receipt .al-shell{width:calc(100% - 28px);max-width:720px;margin-left:auto;margin-right:auto}
.al-receipt .al-demo{margin-top:-18px;margin-bottom:18px;font-family:Arial,sans-serif;background:#292a24;color:#fffef7;font-size:10px}
.al-receipt .al-header{display:flex;flex-direction:column;gap:12px;padding:28px 22px 20px;background:#fffef7;min-height:0;border:0;position:relative}
.al-receipt .al-header:before{content:'';position:absolute;top:-7px;left:0;right:0;height:8px;background:linear-gradient(135deg,transparent 50%,#fffef7 50%) 0 0/14px 14px,linear-gradient(225deg,transparent 50%,#fffef7 50%) 0 0/14px 14px}
.al-receipt .al-header .al-brand{flex-direction:column;max-width:100%;font-size:23px;line-height:1.25;text-align:center;letter-spacing:.01em;text-transform:uppercase}
.al-receipt .al-brand-mark{border:2px solid currentColor;width:39px;height:39px;font-size:24px}
.al-receipt .al-header .al-nav{margin:0;flex-wrap:wrap;justify-content:center;gap:8px 22px;font-size:13px;text-decoration:underline;text-underline-offset:4px}
.al-receipt .al-header>.al-button{display:none}
.al-receipt .al-receipt-caption{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.15em;text-align:center}
.al-receipt .al-hero{display:flex;flex-direction:column;gap:26px;padding:28px 24px;background:#fffef7;border-top:2px dashed #9c9e90;border-bottom:2px dashed #9c9e90;text-align:center}
.al-receipt .al-hero-copy{width:100%}
.al-receipt .al-hero .al-kicker{font-size:11px;letter-spacing:.06em;margin-bottom:22px}
.al-receipt .al-kicker:before{display:none}
.al-receipt .al-hero h1{font-size:clamp(31px,8.5vw,46px);line-height:1.13;letter-spacing:-.065em;text-transform:uppercase;max-width:600px;margin:auto}
.al-receipt .al-intro{font-size:16px;line-height:1.65;margin:22px auto 0;max-width:510px}
.al-receipt .al-actions{justify-content:center;gap:10px;margin-top:26px}
.al-receipt .al-button{font-size:14px;background:#292a24;color:#fffef7;border:1px solid #292a24;gap:18px;min-height:48px;letter-spacing:-.02em;border-radius:0}
.al-receipt .al-button-accent{background:#292a24;color:#fffef7}
.al-receipt .al-hero-media{width:100%;height:220px;max-width:550px}
.al-receipt .al-image img{filter:saturate(.7)}
.al-receipt .al-image figcaption{font-size:11px;letter-spacing:0;text-align:left;padding:6px 0}
.al-receipt .al-art{background:#e8e9d7;color:#292a24;align-items:center;padding:20px}
.al-receipt .al-art-mark{font-family:'Courier New',monospace;font-size:104px;color:#292a24;line-height:1}
.al-receipt .al-art:before,.al-receipt .al-art:after{display:none}.al-receipt .al-art-dot{height:4px;width:40px;background:#292a24}
.al-receipt .al-art-caption{font-size:11px;letter-spacing:.05em;max-width:100%;text-transform:uppercase}
.al-receipt .al-service-strip{background:transparent;color:#292a24}
.al-receipt .al-strip-inner{display:flex;flex-wrap:wrap;padding:16px 24px;background:#f2f1e6;gap:0}
.al-receipt .al-strip-inner a{flex:1 1 100%;padding:10px 0;margin:0;min-width:0;gap:16px;font-size:13px;border:0;border-bottom:1px dotted #9c9e90}
.al-receipt .al-strip-inner a:last-child{border:0}.al-receipt .al-strip-inner .al-number{color:#64675d}
.al-receipt .al-section{padding:34px 24px;background:#fffef7;margin-top:0;margin-bottom:0;border-bottom:2px dashed #9c9e90}
.al-receipt .al-section-head{display:block;text-align:center;margin-bottom:26px}
.al-receipt .al-section-head .al-kicker{padding-top:0;font-size:11px;letter-spacing:.09em;margin-bottom:12px}
.al-receipt h2{font-size:27px;line-height:1.2;letter-spacing:-.055em;text-transform:uppercase;font-weight:700}
.al-receipt .al-services{display:block}
.al-receipt .al-service{display:grid;grid-template-columns:24px minmax(0,1fr);gap:0 9px;margin:0;padding:24px 0;border:0;border-top:1px dotted #9c9e90}
.al-receipt .al-service:first-child{padding-top:0;border:0}.al-receipt .al-service:last-child{padding-bottom:0}
.al-receipt .al-service .al-number{grid-column:1;grid-row:1;padding-top:3px;opacity:1;color:#64675d;font-size:12px}
.al-receipt .al-service h3{grid-column:2;grid-row:1;font-size:19px;line-height:1.3;text-transform:uppercase;letter-spacing:-.045em;margin:0 0 10px}
.al-receipt .al-service p{grid-column:2;font-size:15px;line-height:1.65}
.al-receipt .al-service .al-price{font-size:16px;margin-top:12px;font-weight:700}
.al-receipt .al-service a{grid-column:2;color:#292a24;font-size:13px;margin-top:10px;text-decoration:underline;text-underline-offset:4px;gap:12px}
.al-receipt .al-about-band{background:transparent}
.al-receipt .al-facts,.al-receipt .al-faq-grid,.al-receipt .al-contact{grid-template-columns:1fr;gap:28px}
.al-receipt .al-facts h2{font-size:24px}.al-receipt .al-facts .al-kicker,.al-receipt .al-contact .al-kicker,.al-receipt .al-faq-grid .al-kicker{font-size:11px;letter-spacing:.07em}
.al-receipt .al-fact-list{margin:0;grid-template-columns:1fr;gap:18px}
.al-receipt .al-fact-list>div{padding-bottom:15px;border-bottom:1px dotted #9c9e90}.al-receipt .al-fact-list>div:last-child{border:0;padding-bottom:0}
.al-receipt .al-fact-list dt{font-size:11px}.al-receipt .al-fact-list dd{font-size:15px}
.al-receipt .al-hours div{font-size:14px;border-bottom-style:dotted}
.al-receipt .al-gallery{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.al-receipt .al-gallery figure{height:160px}.al-receipt .al-gallery figure:first-child{grid-column:1/-1;height:240px}
.al-receipt .al-review-grid{grid-template-columns:1fr;gap:12px}.al-receipt blockquote{font-size:16px;border-top-style:dashed}
.al-receipt .al-faq summary{font-size:16px;font-weight:700;gap:15px}.al-receipt .al-faq p{font-size:15px}.al-receipt .al-faq details{border-top-style:dotted}.al-receipt .al-faq details:last-child{border-bottom-style:dotted}
.al-receipt .al-contact{border-top:0}.al-receipt .al-contact-intro>p{max-width:none;font-size:16px}
.al-receipt .al-form{grid-template-columns:1fr;gap:18px}.al-receipt .al-form label{font-size:13px;font-weight:700}
.al-receipt .al-form input,.al-receipt .al-form select,.al-receipt .al-form textarea{background:#fffef7;border:1px solid #828577;font-family:Arial,Helvetica,sans-serif}
.al-receipt .al-form .al-full{grid-column:1/-1}
.al-receipt .al-form .al-form-note{font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6}
.al-receipt .al-form .al-form-actions button{width:100%}
.al-receipt .al-footer{width:calc(100% - 28px);max-width:720px;margin:0 auto 30px;padding:28px 24px 35px;background:#fffef7;color:#292a24;position:relative}
.al-receipt .al-footer-inner{width:100%;display:flex;flex-direction:column;text-align:center;gap:16px}
.al-receipt .al-footer .al-brand{max-width:100%;font-size:16px;justify-content:center;line-height:1.3;margin:0}.al-receipt .al-footer .al-brand-mark{display:none}
.al-receipt .al-footer p{margin:0;font-size:12px;opacity:1}.al-receipt .al-footer nav{margin:0;justify-content:center;gap:24px}
.al-receipt .al-receipt-end{font-size:13px}
.al-receipt .al-barcode{width:150px;height:35px;background:repeating-linear-gradient(90deg,#292a24 0 2px,transparent 2px 5px,#292a24 5px 6px,transparent 6px 9px,#292a24 9px 13px,transparent 13px 16px);margin:0 auto 12px}
.al-receipt .al-footer:after{content:'';position:absolute;bottom:-8px;left:0;right:0;height:9px;background:linear-gradient(135deg,#fffef7 50%,transparent 50%) 0 0/16px 16px,linear-gradient(225deg,#fffef7 50%,transparent 50%) 0 0/16px 16px}
.al-receipt .al-hero-media:has(.al-art){display:none}
.al-receipt .al-mobile-contact{background:#fffef7;border-top:2px dashed #9c9e90}

@media(min-width:701px){
  .al-win95 .al-shell{width:calc(100% - 64px)}
  .al-win95 .al-header{margin-top:12px;grid-template-columns:minmax(0,1fr) auto}
  .al-win95 .al-header .al-brand{font-size:20px}.al-win95 .al-header .al-nav{padding-right:16px}
  .al-win95 .al-hero{grid-template-columns:1.2fr 1fr;margin-top:38px;margin-bottom:30px}
  .al-win95 .al-hero-copy{padding:36px 30px 40px;margin-top:7px}
  .al-win95 .al-hero h1{font-size:clamp(42px,5vw,66px)}
  .al-win95 .al-hero-media{height:auto;min-height:400px;padding:7px 0 0 7px}
  .al-win95 .al-hero-media>.al-image,.al-win95 .al-hero-media>.al-art{height:100%;min-height:400px}
  .al-win95 .al-art-mark{font-size:180px}
  .al-win95 .al-section{padding:34px;margin-top:30px;margin-bottom:30px}
  .al-win95 .al-section-head .al-kicker{margin:-30px -30px 30px}
  .al-win95 .al-services{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .al-win95 h2{font-size:38px}
  .al-win95 .al-facts{grid-template-columns:1fr 1fr;gap:40px}
  .al-win95 .al-contact{grid-template-columns:.85fr 1.15fr;gap:34px}
  .al-win95 .al-faq-grid{grid-template-columns:.8fr 1.2fr;gap:34px}
  .al-win95 .al-gallery{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .al-win95 .al-gallery figure,.al-win95 .al-gallery figure:first-child{grid-column:auto;height:250px}
  .al-myspace .al-shell{width:calc(100% - 64px)}
  .al-myspace .al-header{padding:20px 26px;justify-content:space-between;margin-top:26px}
  .al-myspace .al-header .al-brand{max-width:60%;font-size:24px}
  .al-myspace .al-header .al-nav{margin-left:auto}
  .al-myspace main{display:grid;grid-template-columns:minmax(240px,.82fr) minmax(0,1.6fr);column-gap:24px;align-items:start;max-width:1080px;width:calc(100% - 64px);margin:auto}
  .al-myspace main>.al-shell,.al-myspace main>.al-service-strip,.al-myspace main>.al-about-band{width:100%;grid-column:1/-1}
  .al-myspace .al-hero{grid-template-columns:minmax(230px,.8fr) minmax(0,1.2fr);gap:30px;padding:28px;margin-top:24px;margin-bottom:24px;align-items:center}
  .al-myspace .al-hero-media{grid-column:1;grid-row:1;height:390px}
  .al-myspace .al-hero-copy{grid-column:2;grid-row:1}
  .al-myspace .al-hero h1{font-size:clamp(36px,4.6vw,59px)}
  .al-myspace .al-strip-inner{width:100%}
  .al-myspace main:has(>#services)>#about{grid-column:1;grid-row:3}
  .al-myspace main:has(>#services)>#services{grid-column:2;grid-row:3}
  .al-myspace .al-facts{width:100%;margin-top:24px;margin-bottom:24px}
  .al-myspace .al-section{margin-top:24px;margin-bottom:0}
  .al-myspace .al-fact-list{grid-template-columns:1fr}
  .al-myspace .al-gallery{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .al-myspace .al-gallery figure,.al-myspace .al-gallery figure:first-child{grid-column:auto;height:260px}
  .al-myspace .al-contact{grid-template-columns:.85fr 1.15fr;gap:32px}
  .al-myspace .al-faq-grid{grid-template-columns:.8fr 1.2fr;gap:36px}
  .al-site.al-receipt{padding-top:40px}
  .al-receipt .al-demo{margin-top:-40px;margin-bottom:40px}
  .al-receipt .al-shell,.al-receipt .al-footer{width:calc(100% - 64px)}
  .al-receipt .al-header{padding:35px 48px 20px}.al-receipt .al-header .al-brand{font-size:30px}
  .al-receipt .al-hero{padding:34px 48px;gap:30px}.al-receipt .al-hero h1{font-size:46px}
  .al-receipt .al-hero-media{height:290px}
  .al-receipt .al-strip-inner{padding:18px 48px}
  .al-receipt .al-section{padding:40px 48px}
  .al-receipt .al-service{grid-template-columns:26px minmax(0,1fr) auto;gap:0 12px}
  .al-receipt .al-service h3{font-size:21px}.al-receipt .al-service p{grid-column:2/-1}
  .al-receipt .al-service .al-price{grid-column:3;grid-row:1;margin:0;max-width:160px;font-size:16px;text-align:right}
  .al-receipt h2{font-size:31px}
  .al-receipt .al-fact-list{grid-template-columns:1fr 1fr;gap:22px}
  .al-receipt .al-fact-list>div{border:0;padding:0}
  .al-receipt .al-footer{padding:30px 48px 40px}.al-receipt .al-footer-inner{width:100%}
}
@media(prefers-reduced-motion:reduce){.al-site *{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
@media(forced-colors:active){.al-site .al-button,.al-site .al-form input,.al-site .al-form select,.al-site .al-form textarea{border:1px solid ButtonText}.al-site .al-barcode{display:none}}
`
