"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ExternalLink, Globe2 } from "lucide-react";
import s from "./Workspace.module.css";
type Plan = {
  key: "hosting" | "managed";
  name: string;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  scope: string;
  includesHosting: boolean;
  trialDays: number;
};
interface Props {
  siteId: string;
  slug: string;
  businessName: string;
  email: string;
  hostingStatus: string;
  subscriptionStatus?: string | null;
  hasBilling?: boolean;
  currentDomain?: string | null;
  onTrackConversion?: (id: string, value: number) => void;
}
async function request(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "This action could not be completed.");
  return data;
}
export default function GoLiveFlow({
  siteId,
  slug,
  businessName,
  hostingStatus,
  subscriptionStatus,
  hasBilling,
  currentDomain,
}: Props) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const active = ["active", "pending_cancel"].includes(hostingStatus);
  const hasSubscription =
    active ||
    Boolean(
      subscriptionStatus &&
      !["canceled", "incomplete_expired"].includes(subscriptionStatus),
    );
  async function loadPlans() {
    setBusy(true);
    setError("");
    try {
      const data = await request("/api/plans");
      setPlans(data.plans || []);
      if (!data.available)
        setNotice(
          "Online plan activation is being set up. Your preview is saved. Contact us to confirm the right launch plan.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plans could not load.");
    } finally {
      setBusy(false);
    }
  }
  async function checkout(plan: Plan) {
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      const data = await request("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ product: plan.key, siteId, slug }),
      });
      if (!data.url) throw Error("Checkout could not be opened.");
      window.location.assign(data.url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Checkout could not be opened.",
      );
      setBusy(false);
    }
  }
  async function billing() {
    setBusy(true);
    setError("");
    try {
      const data = await request(`/api/billing-portal?siteId=${siteId}`, {
        method: "POST",
      });
      if (!data.url) throw Error("Billing is unavailable.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing could not be opened.");
      setBusy(false);
    }
  }
  async function publish() {
    if (!publishConfirmed) return;
    setBusy(true);
    setError("");
    try {
      const data = await request("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, slug }),
      });
      setNotice(
        data.status === "queued"
          ? "Publication is queued. The site will be marked live only after the deployment is verified."
          : "Publication request received. Check your website status before sharing it.",
      );
      setPublishConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing could not start.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.spaced}>
      <div className={s.connection}>
        <Globe2 size={22} />
        <div>
          <h3>{currentDomain || "Your own business address online"}</h3>
          <p>
            {currentDomain
              ? "Your connected domain is separate from your billing and draft changes."
              : "Keep an existing domain or choose a new one. Domain ownership and any separate registration charge are confirmed before purchase."}
          </p>
          <Link
            href={`/setup?slug=${encodeURIComponent(slug)}`}
            className={s.mutedLink}
          >
            Review domain setup
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
      {hasSubscription ? (
        <>
          <div className={s.inline}>
            <span className={s.pill}>
              <Check size={13} />
              {active
                ? hostingStatus === "pending_cancel"
                  ? "Hosting ending at period end"
                  : "Hosting active"
                : `Plan ${subscriptionStatus?.replaceAll("_", " ") || "connected"}`}
            </span>
            <button onClick={billing} disabled={busy} className={s.secondary}>
              Manage billing
              <ExternalLink size={13} />
            </button>
          </div>
          {active ? (
            <div className={s.editSection} style={{ marginTop: 28 }}>
              <h3>Publish the website you reviewed</h3>
              <p className={s.small}>
                Review the contact details, services, photos, and inquiry form
                in your preview. Publishing will replace the currently deployed
                version of {businessName}.
              </p>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={publishConfirmed}
                  onChange={(e) => setPublishConfirmed(e.target.checked)}
                />
                I reviewed this draft and want it published to my website.
              </label>
              <button
                className={s.button}
                disabled={busy || !publishConfirmed}
                onClick={publish}
              >
                {busy ? "Working…" : "Publish reviewed draft"}
              </button>
            </div>
          ) : (
            <p className={s.message}>
              Your plan is already connected. Use billing to review its status
              or contact us to add website hosting.
            </p>
          )}
        </>
      ) : (
        <>
          {hasBilling && (
            <button className={s.secondary} onClick={billing} disabled={busy}>
              Review previous billing
              <ExternalLink size={13} />
            </button>
          )}
          <button className={s.button} onClick={loadPlans} disabled={busy}>
            {busy ? "Loading plans…" : "Review available plans"}
          </button>
          {plans && plans.length > 0 && (
            <div className={s.spaced}>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I’ve reviewed my preview. I understand the plan renews at the
                price shown and domain charges are separate.
              </label>
              {plans.map((plan) => (
                <div className={s.connection} key={plan.key}>
                  <div>
                    <h3>{plan.name}</h3>
                    <p>{plan.scope}</p>
                    <p>
                      <strong>
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: plan.currency,
                        }).format(plan.amount / 100)}{" "}
                        every{" "}
                        {plan.intervalCount > 1 ? plan.intervalCount + " " : ""}
                        {plan.interval}
                        {plan.intervalCount > 1 ? "s" : ""}
                      </strong>
                      {plan.trialDays > 0
                        ? ` after a ${plan.trialDays}-day trial. A payment method is required.`
                        : ""}
                    </p>
                    <p>
                      {plan.includesHosting
                        ? "Website hosting included."
                        : "Website hosting is separate."}{" "}
                      Review the final total and billing terms in secure
                      checkout.
                    </p>
                    <button
                      className={s.button}
                      disabled={!confirmed || busy}
                      onClick={() => checkout(plan)}
                    >
                      Continue to secure checkout
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {notice && (
        <p className={s.message} role="status">
          {notice} <Link href="/contact">Contact us</Link>
        </p>
      )}
      {error && (
        <p className={`${s.message} ${s.error}`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
