"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import m from "@/components/marketing.module.css";
type Domain = { domain: string; available: boolean; price?: number };
export default function DomainSetup() {
  const params = useSearchParams(),
    slug = params.get("slug") || "";
  const [query, setQuery] = useState(""),
    [domains, setDomains] = useState<Domain[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [allowed, setAllowed] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    fetch("/api/system/health")
      .then((r) => r.json())
      .then((d) =>
        setAllowed(
          d.services?.billing === true && d.services?.domainPurchases === true,
        ),
      )
      .catch(() => {});
  }, []);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/domains/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Domain lookup is unavailable.");
      setDomains(data.results || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Domain lookup is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function buy(domain: string) {
    if (!allowed || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ product: "domain", slug, domain }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Checkout is unavailable.");
      if (!data.url) throw Error("Checkout is unavailable.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout is unavailable.");
      setBusy(false);
    }
  }
  return (
    <div className={m.surface}>
      <MarketingNav />
      <main className={m.prose}>
        <Link
          href={`/dashboard?tab=settings${slug ? "&slug=" + encodeURIComponent(slug) : ""}`}
          className={m.textLink}
        >
          <ArrowLeft size={16} />
          Back to your workspace
        </Link>
        <h1 style={{ marginTop: 25 }}>
          A familiar address.
          <br />A better destination.
        </h1>
        <p>
          Your domain stays yours. If you already own one, we’ll help confirm
          the records before connecting it. Your existing website can stay live
          while the new one is prepared.
        </p>
        <Link href="/contact" className={m.buttonOutline}>
          I have a domain to connect
        </Link>
        <h2>Looking for a new name?</h2>
        <form className={m.form} onSubmit={search}>
          <label className={m.field}>
            Business or domain name
            <input
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={63}
              placeholder="yourbusiness"
            />
          </label>
          <button className={m.button} disabled={busy}>
            <Search size={17} />
            {busy ? "Checking availability…" : "Check domain names"}
          </button>
        </form>
        {domains && (
          <>
            <p className={m.note}>
              Availability can change. The current registration price is checked
              again before checkout. One-year registration; renewal is not
              automatic.
            </p>
            {domains.map((domain) => (
              <div
                key={domain.domain}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 15,
                  padding: "18px 0",
                  borderBottom: "1px solid #cad7be",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{domain.domain}</strong>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {domain.available && domain.price
                      ? `$${domain.price.toFixed(2)} for the first year`
                      : domain.available
                        ? "Price unavailable"
                        : "Unavailable"}
                  </p>
                </div>
                {domain.available && domain.price && allowed && slug ? (
                  <button
                    disabled={busy || !confirmed}
                    className={m.buttonSmall}
                    onClick={() => buy(domain.domain)}
                  >
                    Review purchase
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "#6a7c62" }}>
                    {domain.available
                      ? "Confirm with us"
                      : "Already registered"}
                  </span>
                )}
              </div>
            ))}
            {allowed && slug && (
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 13,
                  marginTop: 20,
                }}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I understand this purchases one year of registration, does not
                automatically renew, and website hosting is separate.
              </label>
            )}
            {!allowed && (
              <p className={m.note}>
                Online domain purchasing is not enabled yet.{" "}
                <Link href="/contact">Contact us</Link> to confirm the domain
                and setup.
              </p>
            )}
          </>
        )}
        {error && (
          <p className={m.error} style={{ marginTop: 20 }} role="alert">
            {error}
          </p>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
