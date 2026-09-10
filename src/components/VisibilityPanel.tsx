"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Globe2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Site } from "./workspace-types";
import s from "./Workspace.module.css";
import VisibilityPlan from "./VisibilityPlan";
type Provider = "gbp" | "search_console";
type Metrics = {
  source: string;
  observedAt: string;
  startDate: string;
  endDate: string;
  state: string;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  totals?: Record<string, number | null>;
  queries?: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
  }[];
  partial?: boolean;
};
type Hours = {
  periods: {
    openDay: string;
    closeDay: string;
    openTime: {
      hours?: number;
      minutes?: number;
    };
    closeTime: {
      hours?: number;
      minutes?: number;
    };
  }[];
};
type Connection = {
  provider: Provider;
  status: string;
  resourceName: string | null;
  resourceLabel: string | null;
  lastSyncedAt: string | null;
  error: {
    code: string;
    message: string;
  } | null;
  profile: {
    title?: string;
    profile?: {
      description?: string;
    };
    regularHours?: Hours;
    metadata?: {
      newReviewUri?: string;
    };
  } | null;
  metrics: Metrics | null;
  revision: string | null;
};
type Setup = {
  configured: boolean;
  enabled: boolean;
  gbpApproved: boolean;
  profileWritesEnabled: boolean;
};
type Resource = {
  name: string;
  label: string;
  accountLabel?: string;
  permissionLevel?: string;
};
type Proposal = {
  id: string;
  revision: string;
  status: string;
  changes: {
    description?: string;
    regularHours?: Hours;
  };
  before: {
    description?: string;
    regularHours?: Hours;
  };
  createdAt: string;
};
async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      data.error || "This connection request could not be completed.",
    );
  return data;
}
const providers: {
  id: Provider;
  title: string;
  description: string;
  icon: typeof MapPin;
}[] = [
  {
    id: "gbp",
    title: "Google Business Profile",
    description:
      "Read the profile and performance data for the business you manage. You review specific changes before sending them to Google.",
    icon: MapPin,
  },
  {
    id: "search_console",
    title: "Google Search Console",
    description:
      "Read search clicks, impressions, and queries for a property you control. This connection does not change your website or Google account.",
    icon: Search,
  },
];
const days = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
function showHours(value: Hours | undefined) {
  if (!value?.periods?.length) return "No regular hours returned.";
  return value.periods
    .map((p) => {
      const time = (t: { hours?: number; minutes?: number }) =>
        `${String(t.hours || 0).padStart(2, "0")}:${String(t.minutes || 0).padStart(2, "0")}`;
      return `${p.openDay}: ${time(p.openTime)} – ${time(p.closeTime)}${p.closeDay !== p.openDay ? " (" + p.closeDay + ")" : ""}`;
    })
    .join("\n");
}
export default function VisibilityPanel({
  site,
  demo,
  onEdit,
  onLeads,
  onConnectionChange,
  initialProvider,
}: {
  site: Site;
  demo: boolean;
  onEdit: (field?: string) => void;
  onLeads: () => void;
  onConnectionChange: () => Promise<void>;
  initialProvider?: Provider;
}) {
  const focusedReturn = useRef(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [resources, setResources] = useState<{
    provider: Provider;
    items: Resource[];
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeNeedsAttention, setNoticeNeedsAttention] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);
  const [hourEdits, setHourEdits] = useState<
    Record<
      string,
      {
        mode: string;
        open: string;
        close: string;
      }
    >
  >({});
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (demo) return;
    try {
      const data = await call(`/api/connections?siteId=${site.id}`);
      setSetup(data.setup);
      setConnections(data.connections || []);
      setError("");
      const drafts = await call(
        `/api/connections/google/proposals?siteId=${site.id}`,
      );
      setProposals(drafts.proposals || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your connections could not load.",
      );
    }
  }, [demo, site.id]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  const get = (id: Provider) => connections.find((x) => x.provider === id),
    google = get("gbp"),
    search = get("search_console");
  useEffect(() => {
    if (focusedReturn.current || !initialProvider ||
        !connections.some((connection) => connection.provider === initialProvider)) return;
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`connection-${initialProvider}`);
      if (!card) return;
      focusedReturn.current = true;
      card.scrollIntoView({ block: "center" });
      card.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [connections, initialProvider]);
  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    setNoticeNeedsAttention(false);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      setBusy("");
    }
  }
  const connect = (provider: Provider) =>
    act(provider, async () => {
      const data = await call("/api/connections/google/start", "POST", {
        siteId: site.id,
        provider,
      });
      if (!data.authorizationUrl)
        throw Error("Google sign-in could not start.");
      window.location.assign(data.authorizationUrl);
    });
  const choose = (provider: Provider) =>
    act(provider, async () => {
      const data = await call(
        `/api/connections/google/resources?siteId=${site.id}&provider=${provider}`,
      );
      setResources({ provider, items: data.resources || [] });
      setSelected("");
    });
  const select = () =>
    act("select", async () => {
      if (!resources || !selected) return;
      await call("/api/connections/google/select", "POST", {
        siteId: site.id,
        provider: resources.provider,
        resourceName: selected,
      });
      setResources(null);
      setNotice(
        "Business connection selected. Refresh its data when you’re ready.",
      );
      await load();
      await onConnectionChange();
    });
  const sync = (provider: Provider) =>
    act(provider, async () => {
      await call("/api/connections/google/sync", "POST", {
        siteId: site.id,
        provider,
      });
      await load();
      await onConnectionChange();
      setNotice(
        "The connection was checked. Review the source date and any reported limitations below.",
      );
    });
  const disconnect = () =>
    act("disconnect", async () => {
      if (!disconnecting) return;
      const result = await call(
        `/api/connections/google?siteId=${site.id}&provider=${disconnecting}`,
        "DELETE",
      );
      setDisconnecting(null);
      await load();
      await onConnectionChange();
      setNoticeNeedsAttention(result.revoked === false);
      setNotice(
        result.message || "The Google connection has been disconnected.",
      );
    });
  async function draftProposal(e: React.FormEvent) {
    e.preventDefault();
    await act("proposal", async () => {
      const changes: Proposal["changes"] = {};
      if (description.trim() !== (google?.profile?.profile?.description || ""))
        changes.description = description.trim();
      const changed = Object.entries(hourEdits).filter(
        ([, x]) => x.mode !== "keep",
      );
      if (changed.length) {
        let periods = [...(google?.profile?.regularHours?.periods || [])];
        for (const [day, h] of changed) {
          periods = periods.filter((p) => p.openDay !== day);
          if (h.mode === "open") {
            if (!h.open || !h.close || h.close <= h.open)
              throw Error(
                "Choose an opening and closing time on the same day. Contact support for overnight hours.",
              );
            const [oh, om] = h.open.split(":").map(Number),
              [ch, cm] = h.close.split(":").map(Number);
            periods.push({
              openDay: day,
              closeDay: day,
              openTime: { hours: oh, minutes: om },
              closeTime: { hours: ch, minutes: cm },
            });
          }
        }
        changes.regularHours = { periods };
      }
      if (!Object.keys(changes).length)
        throw Error("Make a change before creating a review.");
      await call("/api/connections/google/proposals", "POST", {
        siteId: site.id,
        expectedRevision: google?.revision,
        changes,
      });
      setEditing(false);
      setHourEdits({});
      await load();
      setNotice(
        "Your proposed change is saved for review. Nothing has been sent to Google.",
      );
    });
  }
  const apply = (proposal: Proposal) =>
    act(proposal.id, async () => {
      const result = await call(
        `/api/connections/google/proposals/${proposal.id}/apply`,
        "POST",
        { siteId: site.id, expectedRevision: proposal.revision, confirm: true },
      );
      setApproved(null);
      await load();
      await onConnectionChange();
      setNoticeNeedsAttention(result.needsReview === true);
      setNotice(
        result.message ||
          "Your approved request was received. Check the recorded result and the public Google profile.",
      );
    });
  const reviewUrl = google?.profile?.metadata?.newReviewUri;
  const requestText = `Thanks for choosing ${site.business_name}. If you’d like to share your experience, we’d appreciate an honest Google review: ${reviewUrl || "[your Google review link]"}`;
  function openProfileEditor(field = "description") {
    if (!editing) {
      setDescription(google?.profile?.profile?.description || "");
      setHourEdits({});
      setEditing(true);
    }
    requestAnimationFrame(() => {
      const element = document.getElementById(`google-editor-${field}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
    });
  }
  return (
    <div className={s.settingsList}>
      <VisibilityPlan
        site={site}
        demo={demo}
        onAction={({ target, field }) => {
          if (target === "website") onEdit(field);
          else if (target === "leads") onLeads();
          else if (
            target === "google" &&
            google?.status === "connected" &&
            google.profile &&
            (field === "description" || field === "regularHours")
          ) {
            openProfileEditor(field);
          } else {
            const element = document.getElementById(
              `connection-${target === "google" ? "gbp" : "search_console"}`,
            );
            element?.scrollIntoView({ behavior: "smooth", block: "center" });
            element?.focus({ preventScroll: true });
          }
        }}
      />
      {error && (
        <p role="alert" className={`${s.message} ${s.error}`}>
          {error}{" "}
          <button className={s.secondary} onClick={load}>
            Try again
          </button>
        </p>
      )}
      {notice && (
        <p
          role={noticeNeedsAttention ? "alert" : "status"}
          className={`${s.message} ${noticeNeedsAttention ? s.attention : ""}`}
        >
          {noticeNeedsAttention && <strong>Needs your attention: </strong>}
          {notice}
        </p>
      )}
      <section className={s.section}>
        <h2>Start with the facts.</h2>
        <p className={`${s.small} ${s.spaced}`}>
          A useful website explains what you do, where you do it, and how to get
          in touch. These same facts help search and AI systems understand your
          business.
        </p>
        {[
          [
            "Services customers understand",
            site.services.length > 0,
            "Describe what each service includes.",
            "services",
          ],
          [
            "Real locations and service areas",
            site.service_areas.length > 0,
            "Use only the places you actually serve.",
            "service_areas",
          ],
          [
            "Answers to real questions",
            site.faq.length > 0,
            "Help people decide without having to call first.",
            "faq",
          ],
          [
            "A working contact path",
            site.setup_health.has_contact,
            "Give visitors a clear next step.",
            "contact_email",
          ],
        ].map(([title, complete, body, field]) => (
          <button
            className={s.todo}
            key={String(title)}
            onClick={() => onEdit(String(field))}
          >
            <CheckCircle2 />
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
            <span className={s.pill}>
              {complete ? "Added" : "Needs attention"}
            </span>
          </button>
        ))}
      </section>
      <section className={s.section}>
        <h2>Connect progress to a source.</h2>
        <p className={`${s.small} ${s.spaced}`}>
          Connect only the accounts for this business. Google data is used for
          these visible features, with encrypted connection credentials. You can
          disconnect at any time.{" "}
          <Link href="/privacy">How we handle connected data</Link>.
        </p>
        {providers.map(({ id, title, description: body, icon: Icon }) => {
          const c = get(id),
            enabled =
              setup?.configured &&
              setup.enabled &&
              (id !== "gbp" || setup.gbpApproved),
            connected = c?.status === "connected";
          return (
            <div
              className={s.connection}
              key={id}
              id={`connection-${id}`}
              tabIndex={-1}
            >
              <Icon size={23} />
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
                <span className={s.pill}>
                  {demo
                    ? "Example · not connected"
                    : !setup
                      ? "Connection status unavailable"
                      : !enabled
                        ? "Service setup required"
                        : (c?.status || "not_connected").replaceAll("_", " ")}
                </span>
                {c?.resourceLabel && (
                  <p>
                    <strong>{c.resourceLabel}</strong>
                    <br />
                    {c.lastSyncedAt
                      ? "Last refreshed " +
                        new Date(c.lastSyncedAt).toLocaleString()
                      : "No data refresh yet"}
                  </p>
                )}
                {c?.error && <p className={s.error}>{c.error.message}</p>}
                <div className={`${s.inline} ${s.spaced}`}>
                  {!demo &&
                    enabled &&
                    (!c ||
                      [
                        "not_connected",
                        "disconnected",
                        "reauth_required",
                      ].includes(c.status)) && (
                      <button
                        disabled={!!busy}
                        className={s.button}
                        onClick={() => connect(id)}
                      >
                        Connect Google
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                  {!demo &&
                    enabled &&
                    c &&
                    ![
                      "not_connected",
                      "disconnected",
                      "reauth_required",
                    ].includes(c.status) && (
                      <>
                        <button
                          disabled={!!busy}
                          className={s.secondary}
                          onClick={() => choose(id)}
                        >
                          {c.resourceName
                            ? "Change selection"
                            : id === "gbp"
                              ? "Choose business"
                              : "Choose property"}
                        </button>
                        {connected && (
                          <button
                            disabled={!!busy}
                            className={s.secondary}
                            onClick={() => sync(id)}
                          >
                            <RefreshCw size={14} />
                            Refresh data
                          </button>
                        )}
                      </>
                    )}
                  {!demo &&
                    c &&
                    !["not_connected", "disconnected"].includes(c.status) && (
                      <button
                        className={s.mutedLink}
                        type="button"
                        onClick={() => setDisconnecting(id)}
                      >
                        Disconnect
                      </button>
                    )}
                  {!demo && setup && !enabled && (
                    <Link href="/contact" className={s.mutedLink}>
                      Get help finishing setup
                    </Link>
                  )}
                  {id === "gbp" && connected && (
                    <a
                      href="https://business.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={s.mutedLink}
                    >
                      Manage profile in Google <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {resources && (
          <div className={s.detail}>
            <h3>
              {resources.provider === "gbp"
                ? "Which business do you manage?"
                : "Which verified property belongs to this website?"}
            </h3>
            {resources.items.length ? (
              <>
                <label className={`${s.label} ${s.spaced}`}>
                  Select the correct account resource
                  <select
                    className={s.select}
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Choose one</option>
                    {resources.items.map((x) => (
                      <option value={x.name} key={x.name}>
                        {x.label}
                        {x.accountLabel ? " · " + x.accountLabel : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!selected || !!busy}
                  className={`${s.button} ${s.spaced}`}
                  onClick={select}
                >
                  Use this selection
                </button>
              </>
            ) : (
              <p>
                No eligible resources were returned. Check that you used the
                Google account that owns or manages this business.
              </p>
            )}
            <button
              className={`${s.secondary} ${s.spaced}`}
              onClick={() => setResources(null)}
            >
              Cancel
            </button>
          </div>
        )}
        {disconnecting && (
          <div className={s.detail}>
            <h3>
              Disconnect{" "}
              {disconnecting === "gbp"
                ? "Google Business Profile"
                : "Search Console"}
              ?
            </h3>
            <p>
              This stops future access through this connection and removes the
              saved credentials. It does not delete the business in Google.
              Retained reports may remain until you request their deletion.
            </p>
            <div className={s.inline}>
              <button
                disabled={!!busy}
                className={s.button}
                onClick={disconnect}
              >
                Disconnect this account
              </button>
              <button
                className={s.secondary}
                onClick={() => setDisconnecting(null)}
              >
                Keep connected
              </button>
            </div>
          </div>
        )}
      </section>
      {[search, google]
        .filter((c) => c?.metrics)
        .map((c) => {
          const data = c!.metrics!;
          return (
            <section className={s.section} key={c!.provider}>
              <h2>
                {c!.provider === "search_console"
                  ? "How people find your website"
                  : "Your Google profile activity"}
              </h2>
              <p className={`${s.small} ${s.spaced}`}>
                {data.source} · {data.startDate} to {data.endDate} · Checked{" "}
                {new Date(data.observedAt).toLocaleString()}
              </p>
              {data.state === "no_data" ? (
                <p className={s.message}>
                  Google returned no report data for this period. This is not a
                  confirmed result of zero.
                </p>
              ) : (
                <div className={s.stats}>
                  {(c!.provider === "search_console"
                    ? [
                        ["Search clicks", data.clicks],
                        ["Search impressions", data.impressions],
                        [
                          "Click-through rate",
                          data.ctr == null
                            ? null
                            : (data.ctr * 100).toFixed(1) + "%",
                        ],
                      ]
                    : [
                        ["Call clicks", data.totals?.CALL_CLICKS],
                        ["Website clicks", data.totals?.WEBSITE_CLICKS],
                        [
                          "Direction requests",
                          data.totals?.BUSINESS_DIRECTION_REQUESTS,
                        ],
                      ]
                  ).map(([label, value]) => (
                    <div className={s.stat} key={String(label)}>
                      <p>{label}</p>
                      <strong>{value ?? "—"}</strong>
                      <small>
                        {value == null
                          ? "Data incomplete or unavailable"
                          : "Reported by Google"}
                      </small>
                    </div>
                  ))}
                </div>
              )}
              {data.queries && data.queries.length > 0 && (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Search query</th>
                        <th>Clicks</th>
                        <th>Impressions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.queries.slice(0, 10).map((q) => (
                        <tr key={q.query}>
                          <td>{q.query}</td>
                          <td>{q.clicks}</td>
                          <td>{q.impressions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={s.small}>
                    Top returned queries. Google may omit low-volume queries.
                    Query rows are not the same as all search activity.
                  </p>
                </div>
              )}
              <p className={s.small}>
                Clicks and direction requests are actions in Google. Use your
                inquiry inbox and booked outcomes to measure customers.
                {data.partial
                  ? " Some days or metrics are missing; incomplete totals are shown as unavailable."
                  : ""}
              </p>
            </section>
          );
        })}
      {google?.status === "connected" && google.profile && (
        <section className={s.section}>
          <div className={s.sectionHeader}>
            <h2>Keep your Google profile accurate.</h2>
            <button
              onClick={() => {
                if (editing) setEditing(false);
                else openProfileEditor();
              }}
            >
              {editing ? "Close editor" : "Review profile details"}
            </button>
          </div>
          <p className={s.small}>
            Use your real services and approach. Changing your business name,
            adding keywords, or inventing claims is not a shortcut to better
            rankings.
          </p>
          <p className={`${s.small} ${s.spaced}`}>
            For your phone number, website link, or other profile details,{" "}
            <a
              href="https://business.google.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              open Google Business Profile
            </a>
            , choose this business, and select Edit profile.
          </p>
          {editing && (
            <form onSubmit={draftProposal} className={`${s.form} ${s.spaced}`}>
              <label className={s.label}>
                Business description
                <textarea
                  id="google-editor-description"
                  className={s.textarea}
                  value={description}
                  maxLength={750}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <span>{description.length}/750 characters</span>
              </label>
              <div id="google-editor-regularHours" tabIndex={-1}>
                <h3>Regular hours</h3>
                <p className={s.small} style={{ whiteSpace: "pre-line" }}>
                  {showHours(google.profile.regularHours)}
                </p>
                <p className={s.small}>
                  Leave a day unchanged unless you intend to replace its current
                  hours. Special holiday hours are managed separately in Google.
                </p>
                {days.map((day) => {
                  const edit = hourEdits[day] || {
                      mode: "keep",
                      open: "",
                      close: "",
                    },
                    set = (value: Partial<typeof edit>) =>
                      setHourEdits((h) => ({
                        ...h,
                        [day]: { ...edit, ...value },
                      }));
                  return (
                    <div className={`${s.formRow} ${s.spaced}`} key={day}>
                      <label className={s.label}>
                        {day.charAt(0) + day.slice(1).toLowerCase()}
                        <select
                          className={s.select}
                          value={edit.mode}
                          onChange={(e) => set({ mode: e.target.value })}
                        >
                          <option value="keep">Keep existing hours</option>
                          <option value="open">Set open hours</option>
                          <option value="closed">Closed</option>
                        </select>
                      </label>
                      {edit.mode === "open" && (
                        <div className={s.formRow}>
                          <label className={s.label}>
                            Opens
                            <input
                              required
                              type="time"
                              className={s.input}
                              value={edit.open}
                              onChange={(e) => set({ open: e.target.value })}
                            />
                          </label>
                          <label className={s.label}>
                            Closes
                            <input
                              required
                              type="time"
                              className={s.input}
                              value={edit.close}
                              onChange={(e) => set({ close: e.target.value })}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button className={s.button} disabled={!!busy}>
                Create a change to review
              </button>
            </form>
          )}
          {proposals.map((p) => (
            <div className={s.detail} key={p.id}>
              <h3>Proposed profile update</h3>
              <p className={s.small}>
                Status: {p.status.replaceAll("_", " ")} · Saved{" "}
                {new Date(p.createdAt).toLocaleString()}
              </p>
              {p.changes.description !== undefined && (
                <div className={s.formRow}>
                  <div>
                    <h4>Current description</h4>
                    <p>{p.before.description || "No description"}</p>
                  </div>
                  <div>
                    <h4>Proposed description</h4>
                    <p>{p.changes.description}</p>
                  </div>
                </div>
              )}
              {p.changes.regularHours && (
                <div className={s.formRow}>
                  <div>
                    <h4>Current regular hours</h4>
                    <p>{showHours(p.before.regularHours)}</p>
                  </div>
                  <div>
                    <h4>Proposed regular hours</h4>
                    <p>{showHours(p.changes.regularHours)}</p>
                  </div>
                </div>
              )}
              {["draft", "pending"].includes(p.status) && (
                <>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={approved === p.id}
                      onChange={(e) =>
                        setApproved(e.target.checked ? p.id : null)
                      }
                    />
                    I checked this specific change and authorize submitting it
                    to my Google Business Profile.
                  </label>
                  <button
                    className={`${s.button} ${s.spaced}`}
                    disabled={
                      approved !== p.id ||
                      !!busy ||
                      !setup?.profileWritesEnabled
                    }
                    onClick={() => apply(p)}
                  >
                    Approve & submit to Google
                  </button>
                  {!setup?.profileWritesEnabled && (
                    <p className={s.small}>
                      Profile publication needs to be enabled after account
                      setup is verified. Your proposed changes remain saved.
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </section>
      )}
      <section className={s.section}>
        <h2>Earn reviews the honest way.</h2>
        <p className={`${s.small} ${s.spaced}`}>
          Ask real customers after a completed service. Invite everyone
          consistently, welcome honest feedback, and never offer incentives or
          screen people by whether they are happy.
        </p>
        <div className={s.detail}>
          <p>{requestText}</p>
          {reviewUrl && /^https:\/\//.test(reviewUrl) ? (
            <button
              className={s.secondary}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(requestText);
                  setCopied(true);
                } catch {
                  setNotice("Select and copy the review request text above.");
                }
              }}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy review request"}
            </button>
          ) : (
            <p className={s.small}>
              Connect and refresh your Google profile to load its verified
              review link. Nothing is sent automatically.
            </p>
          )}
        </div>
      </section>
      <div className={s.connection}>
        <Globe2 size={23} />
        <div>
          <h3>Website search foundation</h3>
          <p>
            Published pages include readable content, page titles, canonical
            addresses, structured business information, and a sitemap. Indexing
            and search performance need to be checked after launch.
          </p>
          <span className={s.pill}>
            {site.setup_health.publishing_verified
              ? "Published · verify indexing"
              : "Prepared for publication"}
          </span>
        </div>
      </div>
      <p className={`${s.small} ${s.spaced}`}>
        <ShieldCheck size={15} style={{ display: "inline", marginRight: 5 }} />
        There is no switch that guarantees rankings or AI citations. We focus on
        accurate business information, useful answers, genuine reviews, and
        measurable inquiries.
      </p>
    </div>
  );
}
