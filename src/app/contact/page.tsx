import type { Metadata } from "next";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import ContactForm from "./ContactForm";
import m from "@/components/marketing.module.css";
export const metadata: Metadata = {
  title: "Let’s talk about your business",
  alternates: { canonical: "/contact" },
};
export default function Contact() {
  return (
    <div className={m.surface}>
      <MarketingNav />
      <main className={m.prose}>
        <p className={m.eyebrow}>A real conversation</p>
        <h1>
          Tell us what you’re
          <br />
          working toward.
        </h1>
        <p>
          A new business, a website that needs work, or a question before you
          start. Give us a little context and we’ll follow up.
        </p>
        <ContactForm />
        <p style={{ marginTop: 30 }}>
          Prefer email?{" "}
          <a href="mailto:brian@autolocal.ai">brian@autolocal.ai</a>
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
