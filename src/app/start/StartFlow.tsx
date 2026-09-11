"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Search, SlidersHorizontal } from 'lucide-react';
import MarketingNav from '@/components/MarketingNav';
import MarketingFooter from '@/components/MarketingFooter';
import { createClient } from '@/lib/supabase/client';
import { clearPendingDraft, loadPendingDraft, savePendingDraft } from '@/lib/pending-draft';
import { isGoogleEditableDraftField, draftFromGoogleListing, previewFromInstantDraft, intakeFromInstantDraft, draftStorageSnapshot, applyGoogleDraftEdits, type InstantDraft } from '@/lib/instant-preview';
import type { GoogleListingDetails } from '@/lib/google-listing-types';
import { SITE_TEMPLATES, isSiteTemplate } from '@/components/templates/types';
import { parseBusinessHours, validBusinessPhone } from '@/lib/onboarding-validation';
import { generateStaticHtml } from '@/lib/static-templates';
import ManualStartFlow from './ManualStartFlow';
import m from '@/components/marketing.module.css';
import s from './instant.module.css';

const STORAGE_KEY = 'autolocal.instant-website.v1';
type Place = { placeId: string; name: string; address: string };
type SavedDraft = ReturnType<typeof draftStorageSnapshot>;

function comparable(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, comparable(item)]));
  return value;
}

function sameDraftValue(field: keyof InstantDraft, left: unknown, right: unknown) {
  if (field === 'hours' && typeof left === 'string' && typeof right === 'string') {
    try { return JSON.stringify(comparable(parseBusinessHours(left))) === JSON.stringify(comparable(parseBusinessHours(right))); }
    catch { /* Incomplete typing is still compared as text. */ }
  }
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export default function StartFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const [businessName, setBusinessName] = useState(params.get('name') || '');
  const [city, setCity] = useState(params.get('city') || '');
  const [results, setResults] = useState<Place[] | null>(null);
  const [draft, setDraft] = useState<InstantDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [manualResume, setManualResume] = useState(false);
  const scope = useRef(0);
  const restoreToken = useRef(0);
  const lookup = useRef<AbortController | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const listingBaseline = useRef<InstantDraft | null>(null);
  const saving = useRef(false);
  const pendingResume = useRef(false);
  const manual = params.get('manual') === '1' || manualResume;
  const queryKey = params.toString();

  useEffect(() => {
    const activeScope = ++scope.current;
    const activeRestore = ++restoreToken.current;
    const active = () => scope.current === activeScope;
    // Restore browser-owned draft state after hydration.
    const restore = async () => {
    await Promise.resolve();
    if (!active() || params.get('manual') === '1') return;
    let saved: SavedDraft | null = null;
    try {
      const pending = params.get('draft');
      const value = pending ? loadPendingDraft(localStorage, pending) : JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (pending && value && !(value as InstantDraft).importedFromGoogle) {
        setManualResume(true);
        return;
      }
      if (value && typeof value === 'object' && (value as InstantDraft).importedFromGoogle && typeof (value as InstantDraft).googlePlaceId === 'string') saved = value as SavedDraft;
      else if (pending) setNotice('Your saved setup is unavailable in this browser. Find your business again to continue.');
    } catch { /* Finding a business still works when browser storage is unavailable. */ }
    const getOwner = async () => {
      try { const { data } = await createClient().auth.getUser(); if (active()) setOwner(data.user?.email || null); return Boolean(data.user); }
      catch { return false; }
    };
    if (saved) {
      const resume = saved;
      setBusinessName(resume.ownerLabel || '');
      pendingResume.current = Boolean(params.get('draft'));
      void Promise.all([getOwner(), loadListing(resume.googlePlaceId, resume.ownerLabel || 'Your business', resume, true)]).then(([signedIn, restored]) => {
        if (active() && restoreToken.current === activeRestore && signedIn && restored && pendingResume.current) {
          pendingResume.current = false;
          void saveWebsite(restored);
        }
      });
    } else void getOwner();
    };
    void restore();
    return () => {
      scope.current = activeScope + 1;
      restoreToken.current = activeRestore + 1;
      pendingResume.current = false;
      lookup.current?.abort();
      searchRequest.current?.abort();
      saveRequest.current?.abort();
      saving.current = false;
    };
    // URL changes initialize a new setup; user edits must not re-run the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    if (!draft) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draftStorageSnapshot(draft))); }
    catch { /* The live preview remains available without storage. */ }
  }, [draft]);

  const html = useMemo(() => draft ? generateStaticHtml(previewFromInstantDraft(draft), draft.template, { mode: 'preview' }) : '', [draft]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!businessName.trim()) { setError('Enter your business name.'); return; }
    pendingResume.current = false; restoreToken.current++;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    const activeScope = scope.current;
    const active = () => scope.current === activeScope && searchRequest.current === controller && !controller.signal.aborted;
    setBusy(true); setError(''); setNotice(''); setResults(null);
    try {
      const response = await fetch('/api/search-business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName: businessName.trim(), city: city.trim() }), signal: controller.signal });
      const data = await response.json();
      if (!active()) return;
      if (!response.ok) throw Error(data.error || 'Business search is unavailable.');
      setResults(data.results || []);
      if (!data.results?.length) setNotice('No matching business found. Try a nearby city or enter your details yourself.');
    } catch (e) { if (active()) setError(e instanceof Error ? e.message : 'Business search is unavailable. Please try again.'); }
    finally { if (active()) setBusy(false); }
  }

  async function loadListing(placeId: string, name: string, saved?: SavedDraft, restoring = false): Promise<InstantDraft | null> {
    if (!restoring) { pendingResume.current = false; restoreToken.current++; }
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    const activeScope = scope.current;
    const active = () => scope.current === activeScope && lookup.current === controller && !controller.signal.aborted;
    setSelecting(name); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/business-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId }), signal: controller.signal });
      const data: GoogleListingDetails & { error?: string } = await response.json();
      if (!active()) return null;
      if (!response.ok || data.placeId !== placeId || !data.name) throw Error(data.error || 'The business details could not load. Try again or enter your details yourself.');
      const selected = params.get('template');
      const next = applyGoogleDraftEdits(draftFromGoogleListing(data, isSiteTemplate(selected) ? selected : saved?.template, saved?.ownerLabel || businessName.trim() || name), saved?.googleEdits);
      listingBaseline.current = next;
      setDraft(next); setEditing(false); setSettingsExpanded(false);
      if (data.photosUnavailable) setNotice(`${data.photosUnavailable} photo${data.photosUnavailable === 1 ? '' : 's'} could not load. You can refresh them without starting over.`);
      if (data.businessStatus === 'CLOSED_PERMANENTLY') setNotice('Google marks this business permanently closed. Check that you chose the right listing.');
      return next;
    } catch (e) {
      if (active()) setError(e instanceof Error ? e.message : 'Your business details could not load. Please try again.');
      return null;
    } finally { if (active()) { setBusy(false); setSelecting(''); } }
  }

  function update<K extends keyof InstantDraft>(field: K, value: InstantDraft[K]) {
    pendingResume.current = false; restoreToken.current++;
    setDraft(current => {
      if (!current) return current;
      const googleEdits = { ...current.googleEdits };
      if (isGoogleEditableDraftField(field)) {
        const baseline = listingBaseline.current;
        if (baseline && sameDraftValue(field, value, baseline[field])) {
          if (Object.hasOwn(baseline.googleEdits, field)) Object.assign(googleEdits, { [field]: baseline.googleEdits[field] });
          else delete googleEdits[field];
        } else Object.assign(googleEdits, { [field]: value });
      }
      return { ...current, [field]: value, confirmed: false, googleEdits };
    });
  }

  async function saveWebsite(current: InstantDraft) {
    if (saving.current) return;
    saving.current = true; pendingResume.current = false; restoreToken.current++;
    const activeScope = scope.current;
    const controller = new AbortController();
    saveRequest.current = controller;
    const active = () => scope.current === activeScope && saveRequest.current === controller && !controller.signal.aborted;
    setBusy(true); setError('');
    try {
      if (!current.businessName.trim()) throw Error('Enter your business name before saving.');
      if (Object.hasOwn(current.googleEdits, 'phone') && current.phone.trim() && !validBusinessPhone(current.phone.trim())) throw Error('Enter a valid business phone number with 7 to 15 digits, or leave it blank.');
      if (Object.hasOwn(current.googleEdits, 'contactEmail') && current.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.contactEmail.trim())) throw Error('Enter a valid public contact email, or leave it blank.');
      const payload = intakeFromInstantDraft({ ...current, confirmed: true });
      const { data: { user } } = await createClient().auth.getUser();
      if (!active()) return;
      if (!user) {
        const pending = params.get('draft') || '';
        const id = /^[0-9a-f-]{36}$/i.test(pending) ? pending : crypto.randomUUID();
        savePendingDraft(localStorage, id, draftStorageSnapshot(current));
        router.push(`/login?next=${encodeURIComponent('/start?draft=' + id)}&reason=save-preview`);
        return;
      }
      const response = await fetch('/api/intake/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json();
      if (!active()) return;
      if (!response.ok || !result.success) throw Error(result.error || 'Your website could not be saved.');
      try {
        sessionStorage.removeItem(STORAGE_KEY);
        if (params.get('draft')) clearPendingDraft(localStorage, params.get('draft')!);
      } catch { /* The saved website is available in the account. */ }
      router.push(result.previewUrl || `/preview/${encodeURIComponent(result.slug)}`);
    } catch (e) { if (active()) { setError(e instanceof Error ? e.message : 'Your website could not be saved. Please try again.'); setEditing(true); setSettingsExpanded(true); } }
    finally { if (saveRequest.current === controller) saving.current = false; if (active()) setBusy(false); }
  }

  function chooseAnother() {
    if (saving.current) return;
    pendingResume.current = false; restoreToken.current++;
    lookup.current?.abort(); searchRequest.current?.abort(); listingBaseline.current = null;
    setDraft(null); setSelecting(''); setBusy(false); setError(''); setNotice(''); setEditing(false); setSettingsExpanded(false);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    if (params.get('draft')) router.replace('/start');
  }

  if (manual) return <ManualStartFlow />;

  if (draft) return <div className={s.previewPage}>
    <header className={s.previewHeader}>
      <button type="button" className={s.back} disabled={busy} onClick={chooseAnother}><ArrowLeft size={16} />Different business</button>
      <strong>{draft.businessName}</strong>
      <button type="button" className={s.primary} disabled={busy} onClick={() => void saveWebsite(draft)}>{busy ? selecting ? 'Refreshing…' : 'Saving…' : 'Save my website'}<ArrowRight size={17} /></button>
    </header>
    <div className={s.previewLayout}>
      <aside className={s.controls} aria-label="Your website settings" data-expanded={settingsExpanded}>
        <p className={s.eyebrow}>Built from your listing</p><h1>Your website is ready.</h1>
        <div className={s.imported}><span><Check size={16}/>{draft.googlePhotos.length} photos</span><span><Check size={16}/>{draft.hours ? 'Opening hours' : 'Contact details'}</span></div>
        <button type="button" className={`${s.secondary} ${s.settingsToggle}`} disabled={busy} onClick={() => setSettingsExpanded(!settingsExpanded)} aria-expanded={settingsExpanded} aria-controls="website-settings"><SlidersHorizontal size={17}/>{settingsExpanded ? 'Hide settings' : 'Design & details'}</button>
        <div id="website-settings" className={s.settingsBody}>
        <label className={s.field}>Website design<select value={draft.template} disabled={busy} onChange={event => { if (isSiteTemplate(event.target.value)) update('template', event.target.value); }}>{SITE_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button type="button" className={s.secondary} disabled={busy} onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="business-detail-editor"><SlidersHorizontal size={17}/>{editing ? 'Hide details' : 'Edit business details'}</button>
        {editing && <div id="business-detail-editor" className={s.editor}>
          <label className={s.field}>Business name<input value={draft.businessName} disabled={busy} maxLength={200} onChange={e => update('businessName', e.target.value)}/></label>
          <label className={s.field}>Business category<input value={draft.category} disabled={busy} maxLength={100} onChange={e => update('category', e.target.value)}/></label>
          <label className={s.field}>About your business<textarea value={draft.description} disabled={busy} maxLength={4000} rows={4} onChange={e => update('description', e.target.value)}/></label>
          <label className={s.field}>Business phone<input type="tel" value={draft.phone} disabled={busy} maxLength={50} onChange={e => update('phone', e.target.value)}/></label>
          <label className={s.field}>Public contact email<input type="email" value={draft.contactEmail} disabled={busy} maxLength={254} onChange={e => update('contactEmail', e.target.value)}/><small>Optional. Use the address customers should see.</small></label>
          <label className={s.check}><input type="checkbox" checked={!draft.privateAddress} disabled={busy} onChange={e => update('privateAddress', !e.target.checked)}/>Customers can visit this address</label>
          {!draft.privateAddress && <label className={s.field}>Address<input value={draft.address} disabled={busy} maxLength={250} onChange={e => update('address', e.target.value)}/></label>}
          <label className={s.field}>City<input value={draft.city} disabled={busy} maxLength={100} onChange={e => update('city', e.target.value)}/></label>
          <label className={s.field}>State or region<input value={draft.state} disabled={busy} maxLength={100} onChange={e => update('state', e.target.value)}/></label>
          <label className={s.field}>Opening hours<textarea value={draft.hours} disabled={busy} rows={7} onChange={e => update('hours', e.target.value)}/><small>One day per line. Leave unknown hours blank.</small></label>
        </div>}
        {draft.photosUnavailable > 0 && <button type="button" className={s.secondary} disabled={busy} onClick={() => void loadListing(draft.googlePlaceId, draft.businessName, draftStorageSnapshot(draft))}>Refresh photos</button>}
        {!draft.hours && <p className={s.subtle}>Google hasn’t supplied opening hours. Add them whenever you’re ready.</p>}
        {!draft.googlePhotos.length && <p className={s.subtle}>No photos were available from Google. You can add your own after saving.</p>}
        </div>
        {error && <p className={s.error} role="alert">{error}</p>}{notice && <p className={s.notice} role="status">{notice}</p>}
        <p className={s.saveNote}>{owner ? `Save privately to ${owner}.` : 'Sign in to save privately.'} Saving confirms you manage this business and agree to our <Link href="/terms">terms</Link>.</p>
      </aside>
      <main className={s.website} aria-label="Your populated website"><iframe title={`${draft.businessName} website`} srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" /></main>
    </div>
  </div>;

  return <div className={m.surface}><MarketingNav/><main className={s.searchPage}>
    <div className={s.searchIntro}><p className={m.eyebrow}>Your business is the starting point</p><h1>Find your business.<br/>See your website.</h1><p>Choose your Google listing. We’ll bring in your photos, hours, and contact details and put your website together.</p></div>
    {selecting ? <section className={s.loading} aria-live="polite" aria-busy="true"><LoaderCircle size={30} className={s.spinner}/><h2>Building {selecting}’s website.</h2><p>Bringing in photos, hours, and business details…</p><button className={s.back} type="button" onClick={chooseAnother}>Back to results</button></section> : <form className={s.searchForm} onSubmit={search}>
      <label className={s.field}>Business name<input autoComplete="organization" value={businessName} required maxLength={200} onChange={e => setBusinessName(e.target.value)} placeholder="Your business name"/></label>
      <label className={s.field}>City or area <span className={s.optional}>(optional)</span><input autoComplete="address-level2" value={city} maxLength={100} onChange={e => setCity(e.target.value)} placeholder="Where is your business?"/></label>
      <button className={s.primary} type="submit" disabled={busy}><Search size={18}/>{busy ? 'Finding your business…' : 'Find my business'}</button>
      {error && <p className={s.error} role="alert">{error}</p>}{notice && <p className={s.notice} role="status">{notice}</p>}
      {results && results.length > 0 && <section className={s.results} aria-label="Matching businesses"><h2>Choose your business</h2>{results.map(place => <button type="button" key={place.placeId} disabled={busy} onClick={() => void loadListing(place.placeId, place.name)}><span><strong>{place.name}</strong><span>{place.address}</span></span><ArrowRight size={20}/></button>)}</section>}
      <p className={s.maps}>Business information from <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer">Google Maps</a>.</p>
      <Link className={s.manual} href={`/start?manual=1${isSiteTemplate(params.get('template')) ? '&template=' + params.get('template') : ''}`}>Can’t find your listing? Enter your details yourself <ArrowRight size={15}/></Link>
    </form>}
  </main><MarketingFooter/></div>;
}
