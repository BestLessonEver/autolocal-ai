import type { Metadata } from "next";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import m from "@/components/marketing.module.css";
export const metadata: Metadata = {
  title: "Privacy policy",
  alternates: { canonical: "/privacy" },
};
export default function Privacy() {
  return (
    <div className={m.surface}>
      <MarketingNav />
      <main className={m.prose}>
        <h1>Privacy policy</h1>
        <p>Updated September 10, 2026</p>
        <h2>Who we are</h2>
        <p>
          AutoLocal.ai is operated by Futureproof Music, Inc. We provide website
          and local visibility tools for business owners. For privacy questions,
          data requests, or account help, contact{" "}
          <a href="mailto:brian@autolocal.ai">brian@autolocal.ai</a>.
        </p>
        <h2>Information used to provide the service</h2>
        <p>
          We store the account and business details you submit, including your
          email, services, contact details, website content, and uploaded
          images. When someone contacts your business through an AutoLocal
          website, we store their inquiry, contact information, status, and
          follow-up notes for your business. Inquiry records may include the
          referring page and campaign parameters so you can understand how
          visitors found you.
        </p>
        <p>
          Your business content becomes public when you approve publication.
          Your account credentials, private notes, and customer inquiries are
          not part of the public website. Do not submit sensitive medical,
          financial, payment-card, or identity-document information through an
          inquiry form.
        </p>
        <h2>Google connections</h2>
        <p>
          Public business lookup uses Google Maps listing information to help
          build a preview with available photos, hours, and contact details. We save the listing ID and your own edits, and fetch listing content again when you reopen your website. Google Maps has its own <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. This is separate from connecting an account.
          If you choose to connect Google Business Profile, we access the
          business accounts and locations you can manage, the selected profile’s
          business information, and available performance data. Profile changes
          require your specific approval in the workspace. If you connect Search
          Console, we read the properties available to your account and
          search-performance data for the property you select.
        </p>
        <p>
          Connection credentials are stored encrypted on the server. We use
          Google data only to provide the visible connection,
          profile-management, and reporting features you request. We do not sell
          it, use it for targeted advertising, or use it to train
          general-purpose AI models. AutoLocal’s use and transfer of information
          received from Google APIs follows the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
        <p>
          You can disconnect a Google service in your workspace or revoke
          AutoLocal’s access in your Google account. Disconnecting removes the
          saved connection credentials and stops further access through that
          connection. Contact us to request removal of retained reports and
          related account data. We may access connected data for support only
          with your permission, or as necessary for security or legal
          obligations.
        </p>
        <h2>Service providers</h2>
        <p>
          We use Supabase for accounts, database, and image storage; Railway and
          Vercel for application and website hosting; Stripe for payments; and
          configured email providers such as Resend for transactional delivery.
          We do not store full card numbers. Google processes business searches
          and authorized connection requests. Providers receive information
          needed for their role. If you ask for AI-assisted content, relevant
          business content may be processed by the configured AI provider;
          customer inquiry details and Google connection credentials are not
          needed for that feature.
        </p>
        <h2>Messages and consent</h2>
        <p>
          We use account and inquiry details to provide the service and respond
          to requests. Signing in or sending a contact form does not subscribe
          you to marketing. Marketing requires a separate opt-in, and you can
          withdraw it. We do not share your marketing consent or phone number
          for another organization’s marketing.
        </p>
        <h2>Browser storage and cookies</h2>
        <p>
          Essential cookies keep you signed in. An unfinished website draft is
          stored in your browser tab. If you verify your email during setup, a
          pending copy is available in the same browser for up to 30 minutes so
          the draft can continue in a new tab. It is removed after a successful
          save or when an expired copy is opened. Shared-device users should
          close their session and clear browser storage when finished. This
          version does not load advertising or optional analytics cookies by
          default.
        </p>
        <h2>Retention and your choices</h2>
        <p>
          We retain account and business information while it is needed to
          provide the service, handle support, prevent abuse, or meet
          recordkeeping obligations. You can edit business details in the
          workspace and request access, export, correction, or deletion by
          email. We verify account ownership before fulfilling a request. Some
          billing or security records may need to be retained; we will explain
          any applicable limit when responding.
        </p>
        <h2>Security and audience</h2>
        <p>
          We use authenticated owner access, protected server credentials,
          encrypted Google connection credentials, and encrypted network
          transport. No system can promise complete security. AutoLocal’s
          business-owner tools are intended for adults authorized to act for a
          business.
        </p>
        <h2>Updates</h2>
        <p>
          We update this policy when the service or data practices change.
          Material changes to connected-data use require a new disclosure and,
          where required, renewed consent before that use begins.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
