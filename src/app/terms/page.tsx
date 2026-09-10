import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import m from "@/components/marketing.module.css";
export const metadata: Metadata = {
  title: "Terms of service",
  alternates: { canonical: "/terms" },
};
export default function Terms() {
  return (
    <div className={m.surface}>
      <MarketingNav />
      <main className={m.prose}>
        <h1>Terms of service</h1>
        <p>Updated September 10, 2026</p>
        <h2>Using AutoLocal</h2>
        <p>
          AutoLocal.ai is operated by Futureproof Music, Inc. By using the
          service, you agree to these terms and our{" "}
          <Link href="/privacy">privacy policy</Link>. You must be an adult
          authorized to act for the business you manage.
        </p>
        <h2>Your website and business information</h2>
        <p>
          AutoLocal helps you prepare and host a business website, manage
          inquiries, and use supported local visibility connections. You are
          responsible for the accuracy of business facts and for permission to
          use submitted text, photographs, logos, reviews, and other material.
          Do not invent qualifications, reviews, service areas, or customer
          results.
        </p>
        <p>
          A saved preview is a draft. Review it before approving publication.
          Publication, domain configuration, and provider verification are
          separate steps, and an external provider may delay or reject a change.
          Your existing website should remain available until its replacement
          and domain transition are confirmed.
        </p>
        <h2>Prices, renewals, and cancellation</h2>
        <p>
          Preparing a website preview does not require payment. Available paid
          plans, their included services, any trial, and the recurring billing
          amount are shown before checkout. The plan and terms accepted in
          checkout govern your purchase. Existing subscriptions keep their
          agreed terms unless you accept a change.
        </p>
        <p>
          Paid recurring plans renew at the agreed interval until cancelled. Use
          the billing portal or contact us for account assistance. Cancellation
          takes effect as shown in the billing portal; access to paid services
          may end at that time. Refund requests are handled individually;
          contact <a href="mailto:brian@autolocal.ai">brian@autolocal.ai</a>.
          Any mandatory rights under applicable law still apply.
        </p>
        <h2>Domains and third-party accounts</h2>
        <p>
          You retain control of your existing domain and connected business
          accounts. New domain registration is a separate purchase unless
          explicitly included in your order. The current purchase flow registers
          a domain for one year and does not enable automatic renewal.
          Availability and price are rechecked before checkout; registration is
          complete only after the registrar confirms it. A requested domain can
          become unavailable. If registration fails after payment, contact us to
          resolve the order or appropriate refund.
        </p>
        <p>
          Google, Stripe, registrars, and hosting providers have their own terms
          and availability requirements. Connecting an account grants the
          permissions shown in that provider’s consent screen. Specific
          business-profile changes require your approval. You can revoke a
          connection, and you must tell us if your authority to manage a
          business ends.
        </p>
        <h2>Search and customer outcomes</h2>
        <p>
          We prepare useful website content, technical search information, and
          supported connection tools. We do not guarantee search rankings,
          indexing, inclusion in AI answers, review growth, a number of
          inquiries, or revenue. Those outcomes depend on the business,
          competition, search providers, customer behavior, and follow-up.
          Performance reports identify their sources and dates; missing data is
          not a result of zero.
        </p>
        <h2>Inquiries and communications</h2>
        <p>
          Inquiries are saved for the business to review. Notification delivery
          depends on the configured email provider and recipient systems, so
          business owners should also check their inbox in AutoLocal. You remain
          responsible for responding to customers, permission to contact them,
          and how you use their information. Do not send spam, buy or fabricate
          reviews, reward only positive reviews, or selectively suppress
          negative feedback.
        </p>
        <h2>Acceptable use and intellectual property</h2>
        <p>
          Do not impersonate a business, access another owner’s account, publish
          unlawful or infringing content, or use the service for phishing,
          harassment, fraud, or malicious activity. We may restrict access for
          violations or to protect the service. You retain your submitted
          business content and grant us the rights needed to store, display, and
          publish it as requested. The AutoLocal platform, code, templates, and
          branding remain the property of Futureproof Music, Inc. or their
          respective licensors.
        </p>
        <h2>Service limits</h2>
        <p>
          To the maximum extent permitted by law, AutoLocal and Futureproof
          Music, Inc. are not liable for indirect, incidental, special,
          consequential, or punitive damages, including lost profits, data, or
          business opportunities arising from use of the service. No provision
          removes rights that cannot be excluded under applicable law.
        </p>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms and will notify users of material changes
          through the service or by email. These terms are governed by Texas
          law, with disputes resolved in the courts of Galveston County, Texas,
          subject to applicable mandatory law. Contact{" "}
          <a href="mailto:brian@autolocal.ai">brian@autolocal.ai</a> with
          questions.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
