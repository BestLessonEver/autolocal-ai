"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/safe-return-path";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import m from "@/components/marketing.module.css";
export default function LoginPage() {
  return (
    <Suspense fallback={<main>Loading sign in…</main>}>
      <Login />
    </Suspense>
  );
}
function Login() {
  const params = useSearchParams(),
    next = safeReturnPath(params.get("next") || params.get("redirect"));
  const [email, setEmail] = useState(params.get("email") || ""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      params.get("error")
        ? "That sign-in link could not be verified. Request a new one below."
        : "",
    );
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: err } = await createClient().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (err) throw err;
      setSent(true);
    } catch {
      setError(
        "We couldn’t send the sign-in link. Please check your email address and try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={m.surface}>
      <MarketingNav />
      <main className={m.prose} style={{ maxWidth: 540, minHeight: "65vh" }}>
        {sent ? (
          <>
            <MailCheck size={36} color="#347346" />
            <h1 style={{ fontSize: 37, marginTop: 25 }}>Check your inbox.</h1>
            <p>
              Your sign-in request was accepted for <strong>{email}</strong>.
              Open the email link to verify your account and continue.
            </p>
            <p>
              Use this browser to open the link. If you don’t see it, check your
              spam folder. Your pending website draft is available in this
              browser for 30 minutes.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setError("");
              }}
              className={m.buttonOutline}
            >
              Use another email or resend
            </button>
          </>
        ) : (
          <>
            <p className={m.eyebrow}>
              {params.get("reason") === "save-preview"
                ? "Keep your preview safe"
                : "Welcome to your workspace"}
            </p>
            <h1>
              {params.get("reason") === "save-preview"
                ? "Save it. Make it yours."
                : "A little less to manage."}
            </h1>
            <p>
              Enter your email and we’ll send a secure sign-in link. No password
              to remember.
            </p>
            <form className={m.form} onSubmit={send}>
              <label className={m.field}>
                Your email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                />
              </label>
              {error && (
                <p className={m.error} role="alert">
                  {error}
                </p>
              )}
              <button disabled={busy} className={m.button}>
                {busy ? "Sending your link…" : "Email me a sign-in link"}
                <ArrowRight size={17} />
              </button>
            </form>
            <p className={m.note}>
              By continuing, you agree to our <Link href="/terms">terms</Link>{" "}
              and <Link href="/privacy">privacy policy</Link>. This does not
              subscribe you to marketing emails.
            </p>
          </>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
