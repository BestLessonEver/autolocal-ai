"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import m from "@/components/marketing.module.css";
export default function ContactForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/capture-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          businessName: form.get("businessName"),
          message: form.get("message"),
          website: form.get("website"),
          consent: form.get("consent") === "on",
          source: "contact",
        }),
      });
      const result = await res.json();
      if (!res.ok)
        throw Error(result.error || "Your message could not be saved.");
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your message could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <div className={m.success} role="status">
        <CheckCircle2 />
        <h2>Your message is saved.</h2>
        <p>
          Thanks for the context. We’ll use the email you provided to respond.
        </p>
        <Link href="/templates">
          Explore website designs while you’re here →
        </Link>
      </div>
    );
  return (
    <form className={m.form} onSubmit={submit}>
      <label className={m.field}>
        Your name
        <input required name="name" maxLength={150} autoComplete="name" />
      </label>
      <label className={m.field}>
        Email
        <input
          required
          type="email"
          name="email"
          maxLength={254}
          autoComplete="email"
        />
      </label>
      <label className={m.field}>
        Business name
        <input
          name="businessName"
          maxLength={200}
          autoComplete="organization"
        />
      </label>
      <label className={m.field}>
        What would you like help with?
        <textarea required name="message" maxLength={3000} minLength={10} />
      </label>
      <div hidden aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label
        style={{ display: "flex", gap: 10, fontSize: 13, color: "#52694b" }}
      >
        <input type="checkbox" name="consent" required />
        You may use these details to respond to my inquiry. See our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </label>
      {error && (
        <p className={m.error} role="alert">
          {error}
        </p>
      )}
      <button className={m.button} disabled={busy}>
        {busy ? "Saving your message…" : "Send my message"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
