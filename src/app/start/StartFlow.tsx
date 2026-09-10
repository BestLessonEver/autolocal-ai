"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import { createClient } from "@/lib/supabase/client";
import {
  validateOnboardingStep,
  parseBusinessHours,
} from "@/lib/onboarding-validation";
import {
  savePendingDraft,
  loadPendingDraft,
  clearPendingDraft,
} from "@/lib/pending-draft";
import m from "@/components/marketing.module.css";
import s from "./start.module.css";
import { SITE_TEMPLATES, isSiteTemplate } from "@/components/templates/types";
type Service = {
  name: string;
  description: string;
  price: string;
};
type Draft = {
  goal: "new" | "improve";
  businessName: string;
  city: string;
  state: string;
  address: string;
  website: string;
  phone: string;
  contactEmail: string;
  category: string;
  description: string;
  serviceAreas: string;
  privateAddress: boolean;
  services: Service[];
  hours: string;
  template: string;
  confirmed: boolean;
  question: string;
  answer: string;
  googlePlaceId: string;
};
type Place = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
};
const KEY = "autolocal.business-draft.v2";
const initial: Draft = {
  goal: "new",
  businessName: "",
  city: "",
  state: "",
  address: "",
  website: "",
  phone: "",
  contactEmail: "",
  category: "",
  description: "",
  serviceAreas: "",
  privateAddress: true,
  services: [{ name: "", description: "", price: "" }],
  hours: "",
  template: "summit",
  confirmed: false,
  question: "",
  answer: "",
  googlePlaceId: "",
};
const categories = [
  "Home services",
  "Beauty & wellness",
  "Professional services",
  "Health & fitness",
  "Education",
  "Food & hospitality",
  "Retail",
  "Automotive",
  "Other",
];
export default function StartFlow() {
  const params = useSearchParams(),
    router = useRouter(),
    formRef = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    // Hydrate browser-only draft storage after the initial server-matched frame.
    const frame = requestAnimationFrame(() => {
      const requestedTemplate = params.get("template");
      const selectedTemplate = isSiteTemplate(requestedTemplate) ? requestedTemplate : null;
      try {
        const pending = params.get("draft");
        const saved = pending
          ? loadPendingDraft(localStorage, pending)
          : JSON.parse(sessionStorage.getItem(KEY) || "null");
        if (pending && !saved)
          setNotice(
            "This draft link expired or is unavailable in this browser. Return to your original setup tab, or start again here.",
          );
        if (
          saved &&
          typeof saved.businessName === "string" &&
          Array.isArray(saved.services)
        ) {
          setDraft({
            ...initial,
            ...saved,
            template: selectedTemplate || (isSiteTemplate(saved.template) ? saved.template : "summit"),
            confirmed: false,
          });
          setStep(
            Number.isInteger(saved._step)
              ? Math.min(3, Math.max(0, saved._step))
              : 0,
          );
        } else
          setDraft((d) => ({
            ...d,
            businessName: params.get("name") || "",
            city: params.get("city") || "",
            contactEmail: params.get("email") || "",
            template: selectedTemplate || "summit",
          }));
      } catch {
        // A design selected from the gallery still applies if storage is unavailable.
        if (selectedTemplate) setDraft(d => ({ ...d, template: selectedTemplate }));
      }
      setReady(true);
      try {
        createClient()
          .auth.getUser()
          .then(({ data }) => setOwner(data.user?.email || null))
          .catch(() => {});
      } catch {
        /* Manual preview setup remains available while auth is configured. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [params]);
  useEffect(() => {
    if (ready)
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ ...draft, _step: step }));
      } catch {
        /* Browser storage may be disabled. */
      }
  }, [draft, ready, step]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({
      ...d,
      [key]: value,
      confirmed: key === "confirmed" ? Boolean(value) : false,
    }));
  const go = (value: number) => {
    setError("");
    setNotice("");
    setStep(value);
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  async function search() {
    if (!draft.businessName.trim()) {
      setError("Enter your business name first.");
      return;
    }
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const res = await fetch("/api/search-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: draft.businessName,
          city: draft.city,
          state: draft.state,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Business search is unavailable.");
      setResults(data.results || []);
      if (!data.results?.length)
        setNotice(
          "No matching listing found. You can enter your business details yourself.",
        );
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Search is unavailable."} You can continue manually.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function select(place: Place) {
    setBusy(true);
    setError("");
    setDraft((d) => ({
      ...d,
      businessName: place.name,
      address: place.address,
      googlePlaceId: place.placeId,
      confirmed: false,
    }));
    try {
      const res = await fetch("/api/business-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: place.placeId }),
      });
      const data = await res.json();
      if (res.ok)
        setDraft((d) => ({
          ...d,
          phone: data.phone || d.phone,
          website: data.website || d.website,
          city: data.city || d.city,
          state: data.state || d.state,
          hours: data.hours?.join("\n") || d.hours,
          privateAddress: data.serviceAreaBusiness ?? d.privateAddress,
        }));
      else
        setNotice(
          "The listing was found, but some details could not load. Please fill in what’s missing.",
        );
    } catch {
      setNotice("Please confirm the details below.");
    } finally {
      setBusy(false);
      setStep(1);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateOnboardingStep(draft, step);
    if (problem) {
      if (problem.step !== step) go(problem.step);
      setError(problem.message);
      return;
    }
    if (step < 3) {
      go(step + 1);
      return;
    }
    if (!draft.confirmed) {
      setError("Confirm the business details before continuing.");
      return;
    }
    if (draft.goal === "improve" && draft.website) {
      try {
        const url = new URL(draft.website);
        if (!["http:", "https:"].includes(url.protocol)) throw Error();
      } catch {
        setError("Enter a full website address starting with https://.");
        go(0);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const {
        data: { user },
        error: authError,
      } = await createClient().auth.getUser();
      if (authError || !user) {
        const draftId = crypto.randomUUID();
        savePendingDraft(localStorage, draftId, { ...draft, _step: 3 });
        router.push(
          `/login?next=${encodeURIComponent("/start?draft=" + draftId)}&reason=save-preview`,
        );
        return;
      }
      const hours = parseBusinessHours(draft.hours);
      const res = await fetch("/api/intake/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: draft.businessName.trim(),
          category: draft.category,
          city: draft.city.trim(),
          state: draft.state.trim(),
          address: draft.privateAddress ? "" : draft.address.trim(),
          show_address: !draft.privateAddress,
          website: draft.website,
          phone: draft.phone,
          contactEmail: draft.contactEmail,
          description: draft.description,
          services: draft.services.filter((x) => x.name.trim()),
          hours,
          template: draft.template,
          serviceAreas: draft.serviceAreas
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          faq:
            draft.question.trim() && draft.answer.trim()
              ? [
                  {
                    question: draft.question.trim(),
                    answer: draft.answer.trim(),
                  },
                ]
              : [],
          googlePlaceId: draft.googlePlaceId || undefined,
          businessFacts: {
            verified: true,
            serviceAreaBusiness: draft.privateAddress,
            existingWebsite: draft.website || null,
            goal: draft.goal,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw Error(data.error || "Your preview could not be saved.");
      sessionStorage.removeItem(KEY);
      if (params.get("draft"))
        clearPendingDraft(localStorage, params.get("draft")!);
      router.push(
        data.previewUrl || `/preview/${encodeURIComponent(data.slug)}`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your preview could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={m.surface}>
      <MarketingNav />
      <main className={s.shell}>
        <aside className={s.rail}>
          <h1>
            Your business.
            <br />A better next chapter.
          </h1>
          <p>Bring the facts. We’ll help you put them to work.</p>
          <ol className={s.progress}>
            {[
              "Your business",
              "The essentials",
              "Your services",
              "Your design",
            ].map((label, i) => (
              <li
                key={label}
                className={step === i ? s.active : ""}
                aria-current={step === i ? "step" : undefined}
              >
                <span>{i < step ? <Check size={13} /> : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <p className={s.saved}>
            Your draft stays in this browser tab until you save it. Nothing is
            published during setup.
          </p>
        </aside>
        <div className={s.panel}>
          <form ref={formRef} onSubmit={submit}>
            {step === 0 && (
              <>
                <p className={m.eyebrow}>Step 1 of 4</p>
                <h2 ref={heading} tabIndex={-1}>
                  Let’s meet your business.
                </h2>
                <p className={s.intro}>
                  Whether you’re starting from nothing or ready for something
                  better, this is the place.
                </p>
                <div className={s.choices}>
                  <button
                    type="button"
                    className={s.choice}
                    aria-pressed={draft.goal === "new"}
                    onClick={() => update("goal", "new")}
                  >
                    <Sparkles size={21} />
                    <strong>I need a website</strong>
                    <small>Give my business a place online.</small>
                  </button>
                  <button
                    type="button"
                    className={s.choice}
                    aria-pressed={draft.goal === "improve"}
                    onClick={() => update("goal", "improve")}
                  >
                    <Globe2 size={21} />
                    <strong>Mine needs work</strong>
                    <small>Build a better first impression.</small>
                  </button>
                </div>
                <div className={s.fields}>
                  <label className={m.field}>
                    Business name
                    <input
                      required
                      maxLength={120}
                      autoComplete="organization"
                      value={draft.businessName}
                      onChange={(e) => update("businessName", e.target.value)}
                      placeholder="Your business name"
                    />
                  </label>
                  <div className={s.row}>
                    <label className={m.field}>
                      City
                      <input
                        required
                        maxLength={100}
                        autoComplete="address-level2"
                        value={draft.city}
                        onChange={(e) => update("city", e.target.value)}
                        placeholder="Friendswood"
                      />
                    </label>
                    <label className={m.field}>
                      State or region
                      <input
                        required
                        maxLength={80}
                        autoComplete="address-level1"
                        value={draft.state}
                        onChange={(e) => update("state", e.target.value)}
                        placeholder="Texas"
                      />
                    </label>
                  </div>
                  {draft.goal === "improve" && (
                    <label className={m.field}>
                      Current website
                      <input
                        required
                        type="url"
                        maxLength={500}
                        value={draft.website}
                        placeholder="https://yourbusiness.com"
                        onChange={(e) => update("website", e.target.value)}
                      />
                      <small>Your current website stays unchanged.</small>
                    </label>
                  )}
                  <button
                    type="button"
                    className={m.buttonOutline}
                    disabled={busy}
                    onClick={search}
                  >
                    <Search size={17} />
                    {busy
                      ? "Looking for your business…"
                      : "Find my Google listing"}
                  </button>
                </div>
                {results && results.length > 0 && (
                  <div className={s.results}>
                    {results.map((place) => (
                      <button
                        type="button"
                        key={place.placeId}
                        disabled={busy}
                        onClick={() => select(place)}
                      >
                        <div>
                          <strong>{place.name}</strong>
                          <span>{place.address}</span>
                        </div>
                        <ArrowRight size={17} />
                      </button>
                    ))}
                  </div>
                )}
                <p className={s.hint}>
                  Listing information from Google Maps. Selecting a result does
                  not connect or claim your Google Business Profile. You can
                  also continue with your own details.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <p className={m.eyebrow}>Step 2 of 4</p>
                <h2 ref={heading} tabIndex={-1}>
                  Make it easy to reach you.
                </h2>
                <p className={s.intro}>
                  These are the details customers will see. Check anything we
                  found before moving on.
                </p>
                <div className={s.fields}>
                  <label className={m.field}>
                    Business category
                    <select
                      required
                      value={draft.category}
                      onChange={(e) => update("category", e.target.value)}
                    >
                      <option value="">Choose a category</option>
                      {categories.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <div className={s.row}>
                    <label className={m.field}>
                      Business phone
                      <input
                        required
                        type="tel"
                        minLength={7}
                        maxLength={30}
                        title="Enter a valid phone number with at least seven characters."
                        autoComplete="tel"
                        value={draft.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        placeholder="(555) 555-0100"
                      />
                    </label>
                    <label className={m.field}>
                      Customer contact email
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        value={draft.contactEmail}
                        onChange={(e) => update("contactEmail", e.target.value)}
                        placeholder="hello@yourbusiness.com"
                      />
                    </label>
                  </div>
                  <label className={m.field}>
                    Areas you serve
                    <input
                      required
                      maxLength={400}
                      value={draft.serviceAreas}
                      onChange={(e) => update("serviceAreas", e.target.value)}
                      placeholder="Friendswood, Pearland, Clear Lake"
                    />
                    <small>
                      List real areas you serve, separated by commas.
                    </small>
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={draft.privateAddress}
                      onChange={(e) =>
                        update("privateAddress", e.target.checked)
                      }
                    />
                    Customers do not visit my address. Show my service area
                    instead.
                  </label>
                  {!draft.privateAddress && (
                    <label className={m.field}>
                      Public business address
                      <input
                        required
                        autoComplete="street-address"
                        maxLength={300}
                        value={draft.address}
                        onChange={(e) => update("address", e.target.value)}
                      />
                    </label>
                  )}
                  <label className={m.field}>
                    What should customers know about you?
                    <textarea
                      required
                      minLength={30}
                      maxLength={2500}
                      value={draft.description}
                      onChange={(e) => update("description", e.target.value)}
                      placeholder="Describe what you do, who you help, and what makes your approach different."
                    />
                    <small>
                      Use facts you can stand behind. Include credentials only
                      if you hold them.
                    </small>
                  </label>
                  <label className={m.field}>
                    Business hours{" "}
                    <small>
                      Optional — leave blank if customers should contact you.
                    </small>
                    <textarea
                      maxLength={600}
                      value={draft.hours}
                      onChange={(e) => update("hours", e.target.value)}
                      placeholder={
                        "Monday: 9:00 AM – 5:00 PM\nTuesday: By appointment"
                      }
                    />
                  </label>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <p className={m.eyebrow}>Step 3 of 4</p>
                <h2 ref={heading} tabIndex={-1}>
                  What can people hire you for?
                </h2>
                <p className={s.intro}>
                  Clear services help customers choose you and help search
                  engines understand what you offer.
                </p>
                {draft.services.map((service, i) => (
                  <div className={s.service} key={i}>
                    <div className={s.serviceHeading}>
                      Service {i + 1}
                      {i > 0 && (
                        <button
                          type="button"
                          className={s.remove}
                          aria-label={`Remove service ${i + 1}`}
                          onClick={() =>
                            update(
                              "services",
                              draft.services.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <label className={m.field}>
                      Service name
                      <input
                        required
                        maxLength={120}
                        value={service.name}
                        onChange={(e) =>
                          update(
                            "services",
                            draft.services.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="For example: Interior painting"
                      />
                    </label>
                    <label className={m.field}>
                      What’s included?
                      <textarea
                        required
                        minLength={15}
                        maxLength={700}
                        value={service.description}
                        onChange={(e) =>
                          update(
                            "services",
                            draft.services.map((x, j) =>
                              j === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="Explain what the customer gets and when this service is useful."
                      />
                    </label>
                    <label className={m.field}>
                      Price or pricing note{" "}
                      <small>Optional. Leave blank to invite an inquiry.</small>
                      <input
                        maxLength={100}
                        value={service.price}
                        onChange={(e) =>
                          update(
                            "services",
                            draft.services.map((x, j) =>
                              j === i ? { ...x, price: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="For example: Quoted after a visit"
                      />
                    </label>
                  </div>
                ))}
                {draft.services.length < 8 && (
                  <button
                    type="button"
                    className={s.add}
                    onClick={() =>
                      update("services", [
                        ...draft.services,
                        { name: "", description: "", price: "" },
                      ])
                    }
                  >
                    <Plus size={16} />
                    Add another service
                  </button>
                )}
                <h3 className={s.sectionLabel}>Answer a common question</h3>
                <p className={s.hint}>
                  Optional. A useful answer saves your customers time and gives
                  search engines real context.
                </p>
                <div className={s.fields}>
                  <label className={m.field}>
                    Question
                    <input
                      maxLength={180}
                      value={draft.question}
                      onChange={(e) => update("question", e.target.value)}
                      placeholder="For example: How do I get an estimate?"
                    />
                  </label>
                  <label className={m.field}>
                    Your answer
                    <textarea
                      required={Boolean(draft.question.trim())}
                      maxLength={1000}
                      value={draft.answer}
                      onChange={(e) => update("answer", e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <p className={m.eyebrow}>Step 4 of 4</p>
                <h2 ref={heading} tabIndex={-1}>
                  Give your business its look.
                </h2>
                <p className={s.intro}>
                  Choose your starting point. You can change the design and add
                  your photos in your workspace.
                </p>
                <div className={s.designs}>
                  {SITE_TEMPLATES.map(({id, name, audience: label}) => (
                    <button
                      type="button"
                      key={id}
                      className={s.design}
                      aria-pressed={draft.template === id}
                      aria-label={`Choose ${name}: ${label}`}
                      onClick={() => update("template", id)}
                    >
                      <div className={s.designPreview}>
                        <iframe
                          src={`/templates/${id}?embed=1`}
                          title={`${name} design example`}
                          tabIndex={-1}
                          aria-hidden="true"
                          inert
                        />
                      </div>
                      <strong>{name}</strong>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <h3 className={s.sectionLabel}>
                  One last look at the essentials.
                </h3>
                <dl className={s.review}>
                  <div>
                    <dt>Business</dt>
                    <dd>{draft.businessName}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {draft.city}, {draft.state}
                    </dd>
                  </div>
                  <div>
                    <dt>Contact</dt>
                    <dd>
                      {draft.phone}
                      <br />
                      {draft.contactEmail}
                    </dd>
                  </div>
                  <div>
                    <dt>Services</dt>
                    <dd>
                      {draft.services
                        .map((x) => x.name)
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Service areas</dt>
                    <dd>{draft.serviceAreas}</dd>
                  </div>
                  <div>
                    <dt>Street address</dt>
                    <dd>
                      {draft.privateAddress
                        ? "Hidden from your website"
                        : draft.address}
                    </dd>
                  </div>
                </dl>
                <label className={s.check}>
                  <input
                    required
                    type="checkbox"
                    checked={draft.confirmed}
                    onChange={(e) => update("confirmed", e.target.checked)}
                  />
                  I’m authorized to manage this business and have checked these
                  details. I understand this creates a draft, not a published
                  website.
                </label>
                <p className={s.hint}>
                  {owner
                    ? `Saving to ${owner}.`
                    : "Next, verify your email to save and manage your preview. Your draft will be available in this browser for 30 minutes while you verify your email."}{" "}
                  By continuing you agree to our{" "}
                  <Link href="/terms">terms</Link> and{" "}
                  <Link href="/privacy">privacy policy</Link>.
                </p>
              </>
            )}
            {error && (
              <p className={`${m.error} ${s.status}`} role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className={`${m.success} ${s.status}`} role="status">
                {notice}
              </p>
            )}
            <div className={s.actions}>
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  className={s.back}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              ) : (
                <span />
              )}
              <button type="submit" disabled={busy} className={m.button}>
                {busy
                  ? "Working…"
                  : step === 3
                    ? owner
                      ? "Save my preview"
                      : "Verify email & save"
                    : "Continue"}
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
