"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  Globe2,
  Home,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "./MarketingNav";
import { createClient } from "@/lib/supabase/client";
import LeadsInbox from "./LeadsInbox";
import OwnerSiteEditor from "./OwnerSiteEditor";
import GoLiveFlow from "./GoLiveFlow";
import VisibilityPanel from "./VisibilityPanel";
import { demoSite, sampleLeads, type Site, type Lead } from "./workspace-types";
import s from "./Workspace.module.css";
import { publicSiteData } from "./templates/public-site-data";
import {
  PROFESSIONAL_CSS,
  renderProfessionalSite,
} from "./templates/professional-renderer";
import { INQUIRY_RUNTIME } from "./templates/inquiry-runtime";
function demoHtml(site: Site) {
  const data = { ...publicSiteData(site), demo: true };
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><style>body{margin:0}${PROFESSIONAL_CSS}</style></head><body>${renderProfessionalSite(data, site.template, { mode: "demo" })}<script>${INQUIRY_RUNTIME}</script></body></html>`;
}
function ExamplePreview({
  site,
  onClose,
}: {
  site: Site;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={s.previewDialog}
      aria-label="Example website preview"
      onCancel={onClose}
    >
      <div className={s.sectionHeader}>
        <h2>Your edited example</h2>
        <button autoFocus className={s.secondary} onClick={onClose}>
          Close preview
        </button>
      </div>
      <iframe
        title="Your edited example website"
        srcDoc={demoHtml(site)}
        sandbox="allow-scripts"
      />
    </dialog>
  );
}
const tabs = [
  { id: "overview", name: "Overview", icon: Home },
  { id: "leads", name: "Inquiries", icon: MessageCircle },
  { id: "website", name: "Website", icon: Globe2 },
  { id: "visibility", name: "Visibility", icon: Search },
  { id: "settings", name: "Settings", icon: Settings },
];
type Summary = {
  inquiries: number;
  new: number;
  qualified: number;
  booked: number;
  won: number;
};
async function json(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "This could not be completed. Please try again."),
      { status: response.status },
    );
  return data;
}
export default function Workspace({ demo = false }: { demo?: boolean }) {
  return (
    <Suspense
      fallback={<main className={s.loading}>Loading your workspace…</main>}
    >
      <Content demo={demo} />
    </Suspense>
  );
}
function Content({ demo }: { demo: boolean }) {
  const params = useSearchParams(),
    initialTab = tabs.some((x) => x.id === params.get("tab"))
      ? params.get("tab")!
      : ["gbp", "search_console"].includes(params.get("google_connected") || "")
        ? "visibility"
        : "overview";
  const requestedLead = useRef(params.get("leadId"));
  const returnedGoogleProvider = params.get("google_connected");
  const [tab, setTab] = useState(params.get("leadId") ? "leads" : initialTab);
  const [linkedLead, setLinkedLead] = useState<Lead | null>(() =>
    demo
      ? sampleLeads().find((lead) => lead.id === params.get("leadId")) || null
      : null,
  );
  const [linkedLeadError, setLinkedLeadError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [site, setSite] = useState<Site | null>(demo ? demoSite : null);
  const [leads, setLeads] = useState<Lead[]>(() => (demo ? sampleLeads() : []));
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [leadError, setLeadError] = useState("");
  const [notice, setNotice] = useState("");
  const [missing, setMissing] = useState(false);
  const [sites, setSites] = useState<
    {
      id: string;
      slug: string;
      business_name: string;
    }[]
  >([]);
  const selector = params.get("siteId")
    ? `?siteId=${encodeURIComponent(params.get("siteId")!)}`
    : params.get("slug")
      ? `?slug=${encodeURIComponent(params.get("slug")!)}`
      : "";
  const reload = useCallback(async () => {
    if (demo) {
      const examples = sampleLeads();
      setLeads(examples);
      setTotal(examples.length);
      setSummary({ inquiries: 2, new: 1, qualified: 1, booked: 1, won: 0 });
      return;
    }
    setLoading(true);
    setError("");
    setMissing(false);
    try {
      const data = await json(`/api/dashboard/me${selector}`);
      setSite(data);
      const list = await json("/api/dashboard/my-sites");
      setSites(list);
      try {
        const inbox = await json(`/api/leads?siteId=${data.id}`);
        setLeads(inbox.leads);
        setTotal(inbox.total);
        setLeadError("");
        if (requestedLead.current) {
          try {
            let requested = inbox.leads.find(
              (lead: Lead) => lead.id === requestedLead.current,
            );
            if (!requested)
              requested = (
                await json(
                  `/api/leads?siteId=${data.id}&leadId=${encodeURIComponent(requestedLead.current)}`,
                )
              ).leads?.[0];
            setLinkedLead(requested || null);
            setLinkedLeadError(
              requested
                ? ""
                : "This inquiry link is unavailable for the selected business.",
            );
          } catch {
            setLinkedLeadError(
              "The linked inquiry could not be opened. Your recent inquiries are still available below.",
            );
          }
        }
      } catch (e) {
        setLeadError(
          e instanceof Error ? e.message : "Your inquiries could not load.",
        );
      }
      try {
        setSummary(await json(`/api/leads/summary?siteId=${data.id}`));
      } catch {
        setSummary(null);
      }
    } catch (e) {
      const status = (
        e as {
          status?: number;
        }
      ).status;
      if (status === 401) {
        window.location.assign(
          `/login?next=${encodeURIComponent("/dashboard" + selector + (requestedLead.current ? `${selector ? "&" : "?"}tab=leads&leadId=${encodeURIComponent(requestedLead.current)}` : ""))}`,
        );
        return;
      }
      if (status === 404) setMissing(true);
      else
        setError(
          e instanceof Error ? e.message : "Your workspace could not load.",
        );
    } finally {
      setLoading(false);
    }
  }, [
    demo,
    selector,
    setLeads,
    setTotal,
    setSummary,
    setLoading,
    setError,
    setMissing,
    setSite,
    setSites,
    setLeadError,
    setLinkedLead,
    setLinkedLeadError,
  ]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void reload();
    });
    return () => cancelAnimationFrame(frame);
  }, [reload]);
  const choose = (id: string) => {
    setTab(id);
    setNotice("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  function editField(field?: string) {
    choose("website");
    if (field)
      requestAnimationFrame(() => {
        const element = document.getElementById(`editor-${field}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.focus({ preventScroll: true });
      });
  }
  function closeLinkedLead() {
    requestedLead.current = null;
    setLinkedLead(null);
    setLinkedLeadError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("leadId");
    window.history.replaceState(null, "", url);
  }
  async function saveSite(fields: Partial<Site>) {
    if (!site) return;
    if (!demo)
      await json(`/api/dashboard/me/details?siteId=${site.id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
    setSite({ ...site, ...fields });
  }
  async function refreshSiteMetadata() {
    if (!site || demo) return;
    try {
      setSite(await json(`/api/dashboard/me?siteId=${site.id}`));
    } catch {
      setNotice(
        "Your connection changed, but the overview could not refresh. Reload the workspace to check its current status.",
      );
    }
  }
  async function photo(file: File, target: string) {
    if (!site || demo) return;
    const body = new FormData();
    body.append("photo", file);
    body.append("target", target);
    const data = await json(`/api/dashboard/me/photos?siteId=${site.id}`, {
      method: "POST",
      body,
    });
    setSite({
      ...site,
      ...(target === "hero"
        ? { hero_image_url: data.url }
        : { gallery_images: [...site.gallery_images, data.url] }),
    });
  }
  async function photoAction(action: "remove" | "set_hero", url: string) {
    if (!site) return;
    if (!demo)
      await json(`/api/dashboard/me/photos?siteId=${site.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, url }),
      });
    const gallery =
      action === "remove"
        ? site.gallery_images.filter((x) => x !== url)
        : site.gallery_images;
    setSite({
      ...site,
      gallery_images: gallery,
      hero_image_url:
        action === "set_hero"
          ? url
          : site.hero_image_url === url
            ? gallery[0] || null
            : site.hero_image_url,
    });
  }
  async function updateLead(
    id: string,
    updates: {
      status?: string;
      notes?: string;
    },
  ) {
    if (!demo)
      await json(`/api/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    if (linkedLead?.id === id) setLinkedLead({ ...linkedLead, ...updates });
    const updated = leads.map((x) => (x.id === id ? { ...x, ...updates } : x));
    setLeads(updated);
    if (demo)
      setSummary({
        inquiries: updated.length,
        new: updated.filter((x) => x.status === "new").length,
        qualified: updated.filter((x) =>
          ["qualified", "booked", "won"].includes(x.status),
        ).length,
        booked: updated.filter((x) => ["booked", "won"].includes(x.status))
          .length,
        won: updated.filter((x) => x.status === "won").length,
      });
    setNotice(
      demo ? "Example inquiry updated for this session." : "Inquiry updated.",
    );
    if (site && !demo)
      try {
        setSummary(await json(`/api/leads/summary?siteId=${site.id}`));
      } catch {
        setSummary(null);
      }
  }
  async function signOut() {
    try {
      await createClient().auth.signOut();
      window.location.assign("/login");
    } catch {
      setNotice("Sign out could not be completed. Please try again.");
    }
  }
  const title =
    tab === "overview"
      ? "A clearer picture of your business."
      : tab === "leads"
        ? "Your next customers."
        : tab === "website"
          ? "Make your business feel like you."
          : tab === "visibility"
            ? "Be easier to find."
            : "Keep everything connected.";
  const subtitle =
    tab === "overview"
      ? "The next useful step, and the conversations worth following up."
      : tab === "leads"
        ? "Track each inquiry from first hello to booked work."
        : tab === "website"
          ? "Edit your draft, check the preview, then decide when to publish."
          : tab === "visibility"
            ? "Build a strong foundation and track what happens in search."
            : "Manage your plan, domain, and account.";
  return (
    <div className={s.app}>
      {demo && (
        <div className={s.banner}>
          Example workspace · fictional business and inquiries. Changes stay in
          this session.<Link href="/start">Start with your business →</Link>
        </div>
      )}
      {previewOpen && site && (
        <ExamplePreview site={site} onClose={() => setPreviewOpen(false)} />
      )}
      <div className={s.layout}>
        <aside className={s.sidebar}>
          <Brand small />
          <nav className={s.nav} aria-label="Workspace navigation">
            {tabs.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => choose(id)}
                aria-current={tab === id ? "page" : undefined}
              >
                <Icon />
                {name}
              </button>
            ))}
          </nav>
          <div className={s.sidebarBottom}>
            <Link href="/contact">
              <LifeBuoy size={16} />
              Get a hand
            </Link>
            <Link href="/start">
              <Globe2 size={16} />
              Add a business
            </Link>
            {!demo && (
              <button onClick={signOut}>
                <LogOut size={16} />
                Sign out
              </button>
            )}
          </div>
        </aside>
        <main className={s.main}>
          <header className={s.topbar}>
            <div className={s.business}>
              <div className={s.avatar}>
                {site?.business_name
                  .split(" ")
                  .slice(0, 2)
                  .map((x) => x[0])
                  .join("") || "AL"}
              </div>
              <div>
                <strong>
                  {site?.business_name || "Your business workspace"}
                </strong>
                <small>
                  {site?.city || "Make your next move online"}
                  {site?.state ? `, ${site.state}` : ""}
                </small>
              </div>
            </div>
            <div className={s.topbarActions}>
              {site && (
                <>
                  <span className={s.pill}>
                    {site.setup_health.publishing_verified
                      ? "Published site verified"
                      : "Website draft"}
                  </span>
                  {demo ? (
                    <button
                      className={s.secondary}
                      onClick={() => setPreviewOpen(true)}
                    >
                      Preview
                      <ArrowUpRight size={14} />
                    </button>
                  ) : (
                    <Link
                      href={`/preview/${site.slug}`}
                      className={s.secondary}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview
                      <ArrowUpRight size={14} />
                    </Link>
                  )}
                </>
              )}
            </div>
          </header>
          {loading ? (
            <div className={s.loading} role="status">
              Loading your workspace…
            </div>
          ) : error ? (
            <div className={s.empty}>
              <h2>Your workspace couldn’t load.</h2>
              <p role="alert">{error}</p>
              <button className={s.button} onClick={reload}>
                Try again
              </button>
            </div>
          ) : missing || !site ? (
            <div className={s.empty}>
              <Globe2 size={36} />
              <h2>Your first website starts here.</h2>
              <p>
                You’re signed in. Tell us about your business to create a
                preview and begin setting up your local presence.
              </p>
              <Link href="/start" className={s.button}>
                Add my business
                <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <>
              <div className={s.title}>
                <div>
                  <p className={s.eyebrow}>
                    {demo
                      ? "Example workspace"
                      : site.setup_health.public_site
                        ? "Your business, online"
                        : "Let’s get you ready"}
                  </p>
                  <h1>{title}</h1>
                  <p>{subtitle}</p>
                </div>
              </div>
              {notice && (
                <p className={s.message} role="status">
                  {notice}
                </p>
              )}
              {tab === "overview" && (
                <>
                  {leadError && (
                    <p className={`${s.message} ${s.error}`} role="alert">
                      {leadError}
                    </p>
                  )}
                  <div className={s.stats}>
                    {[
                      ["Inquiries", summary?.inquiries],
                      ["Need a response", summary?.new],
                      ["Qualified", summary?.qualified],
                      ["Booked", summary?.booked],
                    ].map(([label, value]) => (
                      <div className={s.stat} key={label}>
                        <p>{label}</p>
                        <strong>{value ?? "—"}</strong>
                        <small>
                          {demo
                            ? "Illustrative example"
                            : summary
                              ? "Last 30 days"
                              : "Count unavailable"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className={s.columns}>
                    <div>
                      <section className={s.section}>
                        <div className={s.sectionHeader}>
                          <h2>Your next useful steps</h2>
                          <span className={s.small}>Start here</span>
                        </div>
                        {[
                          {
                            title: "Confirm the essentials",
                            body: "Services, contact details, and the areas you serve.",
                            done:
                              site.setup_health.has_contact &&
                              site.setup_health.has_services,
                            target: "website",
                          },
                          {
                            title: "Add real photos",
                            body: "Show customers your work, your space, or your team.",
                            done: !!site.hero_image_url,
                            target: "website",
                          },
                          {
                            title: "Connect your search accounts",
                            body: "Link Google so your progress has a source.",
                            done: Boolean(
                              site.setup_health.google?.gbp.connected &&
                              site.setup_health.google?.search_console
                                .connected,
                            ),
                            target: "visibility",
                          },
                          {
                            title: "Review your launch plan",
                            body: "Check the website, billing, and publication requirements.",
                            done: site.setup_health.publishing_verified,
                            target: "settings",
                          },
                        ].map((item) => (
                          <button
                            key={item.title}
                            className={`${s.todo} ${item.done ? s.todoDone : ""}`}
                            onClick={() => choose(item.target)}
                          >
                            <span className={s.todoIcon}>
                              {item.done ? <Check /> : <Circle />}
                            </span>
                            <div>
                              <strong>{item.title}</strong>
                              <p>{item.body}</p>
                            </div>
                            <ArrowRight />
                          </button>
                        ))}
                      </section>
                      <section className={s.section}>
                        <div className={s.sectionHeader}>
                          <h2>Recent conversations</h2>
                          <button onClick={() => choose("leads")}>
                            All inquiries →
                          </button>
                        </div>
                        {leads.length ? (
                          leads.slice(0, 3).map((lead) => (
                            <div className={s.overviewLead} key={lead.id}>
                              <div>
                                <strong>{lead.name}</strong>
                                <p>
                                  {lead.service || "General inquiry"} ·{" "}
                                  {lead.status}
                                </p>
                              </div>
                              <button onClick={() => choose("leads")}>
                                Open
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className={s.empty}>
                            <p>
                              New inquiries will appear here after your site is
                              published. Every conversation has a place to land.
                            </p>
                          </div>
                        )}
                      </section>
                    </div>
                    <section className={s.section}>
                      <div className={s.sectionHeader}>
                        <h2>Your website</h2>
                        <button onClick={() => choose("website")}>
                          Make an edit →
                        </button>
                      </div>
                      <div className={s.miniSite}>
                        <iframe
                          src={
                            demo ? undefined : `/preview/${site.slug}?embed=1`
                          }
                          srcDoc={demo ? demoHtml(site) : undefined}
                          sandbox={demo ? "allow-scripts" : undefined}
                          title="Your website preview"
                          aria-hidden="true"
                          inert
                          tabIndex={-1}
                          loading="lazy"
                        />
                        <p>
                          {site.setup_health.publishing_verified
                            ? "Preview your next website update."
                            : "A draft you can review before anything goes live."}
                        </p>
                      </div>
                      <p className={`${s.small} ${s.spaced}`}>
                        Better leads start with a useful website and a quick
                        response. Track which inquiries turn into bookings to
                        understand what’s working.
                      </p>
                    </section>
                  </div>
                </>
              )}
              {tab === "leads" && (
                <>
                  {linkedLeadError && (
                    <p className={`${s.message} ${s.error}`} role="alert">
                      {linkedLeadError}
                    </p>
                  )}
                  {leadError ? (
                    <p className={`${s.message} ${s.error}`} role="alert">
                      {leadError}
                    </p>
                  ) : (
                    <LeadsInbox
                      leads={leads}
                      total={total}
                      initialLead={linkedLead}
                      onClose={closeLinkedLead}
                      onUpdate={updateLead}
                      demo={demo}
                    />
                  )}
                </>
              )}
              <div hidden={tab !== "website"}>
                <OwnerSiteEditor
                  key={site.id}
                  site={site}
                  onSave={saveSite}
                  onPhoto={photo}
                  onPhotoAction={photoAction}
                  demo={demo}
                />
              </div>
              <div hidden={tab !== "visibility"}>
                <VisibilityPanel
                  site={site}
                  demo={demo}
                  onEdit={editField}
                  onLeads={() => choose("leads")}
                  onConnectionChange={refreshSiteMetadata}
                  initialProvider={
                    tab === "visibility" &&
                    (returnedGoogleProvider === "gbp" ||
                      returnedGoogleProvider === "search_console")
                      ? returnedGoogleProvider
                      : undefined
                  }
                />
              </div>
              {tab === "settings" && (
                <div className={s.settingsList}>
                  <section className={s.section}>
                    <h2>Your website & plan</h2>
                    <p className={`${s.small} ${s.spaced}`}>
                      A saved preview is separate from a live website. Review
                      your plan and confirm the launch requirements before
                      publishing.
                    </p>
                    {demo ? (
                      <p className={s.message}>
                        Plan selection, billing, and publishing are available in
                        your own workspace. This example cannot make purchases
                        or launch a website.
                      </p>
                    ) : (
                      <GoLiveFlow
                        siteId={site.id}
                        slug={site.slug}
                        businessName={site.business_name}
                        email={site.contact_email || ""}
                        hostingStatus={site.hosting_status}
                        subscriptionStatus={site.subscription_status}
                        hasBilling={site.has_billing}
                        currentDomain={site.custom_domain}
                      />
                    )}
                  </section>
                  <section className={s.section}>
                    <h2>Business access</h2>
                    <div className={s.connection}>
                      <ShieldCheck size={22} />
                      <div>
                        <h3>Verified owner account</h3>
                        <p>
                          Your website and inquiries are available only to the
                          signed-in owner. Your public contact email does not
                          grant account access.
                        </p>
                      </div>
                      <span className={s.pill}>
                        <CheckCircle2 size={13} />
                        Verified
                      </span>
                    </div>
                    {sites.length > 1 && (
                      <label className={s.label}>
                        Switch business
                        <select
                          className={s.select}
                          value={site.slug}
                          onChange={(e) =>
                            window.location.assign(
                              `/dashboard?slug=${encodeURIComponent(e.target.value)}`,
                            )
                          }
                        >
                          {sites.map((x) => (
                            <option key={x.id} value={x.slug}>
                              {x.business_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Link href="/contact" className={s.mutedLink}>
                      Need help with a domain, account, or website change?
                      <ArrowUpRight size={13} />
                    </Link>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
