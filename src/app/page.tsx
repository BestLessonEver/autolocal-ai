import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Globe2,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";
import styles from "@/components/marketing.module.css";
export const metadata: Metadata = {
  title: "A better website. A stronger local presence.",
  description:
    "Build a professional website, improve your local search presence, and manage customer inquiries in one place. AutoLocal helps local business owners take the next step online.",
  alternates: { canonical: "/" },
};
const faqs = [
  [
    "I don’t have a website. Where do I start?",
    "Start with your business name and the area you serve. You can use your public Google listing or enter your information yourself. Review your details, choose a design, and see a private preview before deciding to launch.",
  ],
  [
    "What if I already have a website?",
    "Tell us what needs to improve. You can prepare a replacement without changing your current website. Your existing domain stays yours, and nothing replaces your current site until you approve the change.",
  ],
  [
    "Will this help people find me on Google and AI search?",
    "Your site is built with readable service information, useful answers, location details, and structured business data. These help search engines understand your business. Google profile and search connections let you track what happens. Rankings, AI citations, and a particular number of leads are never guaranteed.",
  ],
  [
    "How much work will I need to do?",
    "You confirm the facts about your business and approve the changes that matter. Your workspace keeps the next steps, website settings, and inquiries together. Responding to prospective customers and keeping business details accurate still needs your involvement.",
  ],
  [
    "Can I try it before paying?",
    "Yes. Explore the designs and prepare your website preview without entering payment details. Before launch, you’ll review the available plan, what it includes, recurring charges, and any separate domain costs.",
  ],
  [
    "Do I keep control of my business?",
    "Yes. Your business accounts and domain remain yours. Connections require your permission, and publishing changes is a separate step from drafting them. You can review and disconnect connected services from your workspace.",
  ],
];
export default function HomePage() {
  return (
    <div className={styles.surface}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <MarketingNav />
      <main id="main">
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>
              <MapPin size={14} aria-hidden="true" /> Your neighborhood. Your
              next customer.
            </p>
            <h1>
              You do great work.
              <br />
              <em>Let’s get it seen.</em>
            </h1>
            <p className={styles.heroIntro}>
              A website you’re proud of. A clearer presence in search. One
              simple place to turn new inquiries into your next job.
            </p>
            <div className={styles.heroActions}>
              <Link href="/start" className={styles.button}>
                Start with my business{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/templates" className={styles.textLink}>
                Explore the designs <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.note}>
              Free preview. No card needed. You approve before launch.
            </p>
          </div>
          <div className={styles.heroScene}>
            <div className={styles.sceneTop}>
              <span>Built around your business</span>
              <span className={styles.liveDot}>Example design</span>
            </div>
            <div className={styles.siteWindow}>
              <div className={styles.windowBar}>
                <ShieldCheck size={11} aria-hidden="true" /> A place your
                customers can trust
              </div>
              <div className={styles.siteFrame}>
                <iframe
                  src="/templates/summit?embed=1"
                  title="Summit website design example"
                  tabIndex={-1}
                  aria-hidden="true"
                  inert
                  loading="eager"
                />
              </div>
            </div>
            <div className={styles.sceneCaption}>
              <div>
                <strong>Make a better first impression.</strong>
                <span>Clear services. Easy contact. Made for mobile.</span>
              </div>
              <Link
                href="/templates/summit"
                aria-label="Explore the Summit design"
              >
                <ArrowUpRight size={22} />
              </Link>
            </div>
          </div>
        </section>
        <div className={styles.outcomeStrip}>
          <div>
            <Globe2 aria-hidden="true" />
            <div>
              <strong>A website that works harder</strong>
              <p>Built around what customers need.</p>
            </div>
          </div>
          <div>
            <Search aria-hidden="true" />
            <div>
              <strong>A stronger search foundation</strong>
              <p>Clear information people can find.</p>
            </div>
          </div>
          <div>
            <MessageCircle aria-hidden="true" />
            <div>
              <strong>Inquiries you can act on</strong>
              <p>Keep the conversation moving.</p>
            </div>
          </div>
        </div>
        <section id="how-it-works" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>
                  From “I need a website” to “that’s my business”
                </p>
                <h2>
                  A little input.
                  <br />A much better starting point.
                </h2>
              </div>
              <p>
                You know your business. We help turn that knowledge into a
                clear, useful online presence.
              </p>
            </div>
            <div className={styles.steps}>
              {[
                [
                  "01",
                  "Tell us what you do.",
                  "Find your business or start from scratch. Confirm your services, service area, and the best way for customers to reach you.",
                ],
                [
                  "02",
                  "Make it feel like you.",
                  "Choose a professional design. Add your real photos and your own details. Preview it on a phone and desktop before you launch.",
                ],
                [
                  "03",
                  "Build on the basics.",
                  "Connect your business accounts, work through meaningful improvements, and follow every inquiry from first hello to booked work.",
                ],
              ].map(([number, title, body]) => (
                <div className={styles.step} key={number}>
                  <div className={styles.stepNumber}>{number}</div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="services" className={styles.darkSection}>
          <div className={styles.wrap}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Your online presence, together</p>
                <h2 className={styles.sectionTitle}>
                  More useful than
                  <br />
                  another thing to manage.
                </h2>
              </div>
              <p>
                Your website, business information, and incoming inquiries
                belong in the same conversation.
              </p>
            </div>
            <div className={styles.featureRows}>
              <div className={styles.featureList}>
                <div>
                  <Globe2 size={21} />
                  <div>
                    <h3>A clear path from visit to inquiry</h3>
                    <p>
                      Fast, mobile-friendly pages with real services, helpful
                      answers, and contact forms that save inquiries to your
                      workspace.
                    </p>
                  </div>
                </div>
                <div>
                  <MapPin size={21} />
                  <div>
                    <h3>Business facts that agree everywhere</h3>
                    <p>
                      Review your website and connected Google profile together.
                      Keep the details customers depend on accurate and
                      complete.
                    </p>
                  </div>
                </div>
                <div>
                  <Search size={21} />
                  <div>
                    <h3>Search improvements you can understand</h3>
                    <p>
                      Useful page titles, readable content, structured business
                      information, and a visible next step. No mystery scores or
                      ranking promises.
                    </p>
                  </div>
                </div>
              </div>
              <div className={styles.workspaceSample}>
                <p className={styles.sampleLabel}>
                  A look inside · example workspace
                </p>
                <h3>Know what needs you.</h3>
                <p className={styles.sampleSub}>
                  One place for the next useful step.
                </p>
                <div className={styles.taskRow}>
                  <CheckCircle2 size={21} />
                  <div>
                    <strong>Review your website</strong>
                    <span>Check your services and contact details.</span>
                  </div>
                </div>
                <div className={styles.taskRow}>
                  <MapPin size={21} />
                  <div>
                    <strong>Connect your Google profile</strong>
                    <span>Choose the business you want to manage.</span>
                  </div>
                </div>
                <div className={styles.taskRow}>
                  <MessageCircle size={21} />
                  <div>
                    <strong>Follow up on your inquiries</strong>
                    <span>Move each conversation toward a booking.</span>
                  </div>
                </div>
                <p className={styles.sampleFooter}>
                  Real activity appears after setup. This is an example, not
                  customer results.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>
                  A first impression with personality
                </p>
                <h2>
                  Different businesses.
                  <br />
                  Distinctive websites.
                </h2>
              </div>
              <Link href="/templates" className={styles.textLink}>
                Find your design <ArrowRight size={17} />
              </Link>
            </div>
            <div className={styles.templateGrid}>
              {[
                [
                  "summit",
                  "Summit",
                  "Confident and clear. For the people who get the job done.",
                ],
                [
                  "atelier",
                  "Atelier",
                  "Warm and expressive. For services with a personal touch.",
                ],
                [
                  "ledger",
                  "Ledger",
                  "Thoughtful and assured. For advice people can trust.",
                ],
              ].map(([id, name, description]) => (
                <Link
                  className={styles.templateCard}
                  key={id}
                  href={`/templates/${id}`}
                >
                  <div className={styles.templateThumb}>
                    <iframe
                      src={`/templates/${id}?embed=1`}
                      title={`${name} design example`}
                      tabIndex={-1}
                      aria-hidden="true"
                      inert
                      loading="lazy"
                    />
                  </div>
                  <div className={styles.templateCardInfo}>
                    <strong>{name}</strong>
                    <ArrowUpRight size={19} />
                  </div>
                  <p>{description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section id="pricing" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.plans}>
              <div className={styles.planCopy}>
                <p className={styles.eyebrow}>Start with a preview</p>
                <h2 className={styles.sectionTitle}>
                  See your business
                  <br />
                  in a better light.
                </h2>
                <p>
                  No website yet? We’ll help you start. Have one that’s holding
                  you back? Prepare something better while your current site
                  stays live.
                </p>
                <p>
                  Your preview is free. You’ll see the full scope and price
                  before any purchase.
                </p>
              </div>
              <div className={styles.planDetails}>
                <h3>Your next step is simple.</h3>
                <p>Start with your business, then decide what you need.</p>
                <ul>
                  {[
                    "A professional website preview",
                    "Your real services and contact details",
                    "A clear launch checklist",
                    "A workspace for website and lead management",
                  ].map((x) => (
                    <li key={x}>
                      <Check aria-hidden="true" />
                      {x}
                    </li>
                  ))}
                </ul>
                <Link href="/start" className={styles.button}>
                  Create my preview <ArrowUpRight size={17} />
                </Link>
                <p className={styles.note}>
                  Have a more involved project?{" "}
                  <Link href="/contact">Talk to us first.</Link>
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.faq}>
              <p className={styles.eyebrow}>A few good questions</p>
              <h2 className={styles.sectionTitle}>Before you get started.</h2>
              {faqs.map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus aria-hidden="true" />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <div className={styles.wrap}>
          <section className={styles.finalCta}>
            <div>
              <h2>Let’s make your business easier to choose.</h2>
              <p>
                Your next customer should be able to find you, understand you,
                and get in touch.
              </p>
            </div>
            <Link href="/start" className={styles.button}>
              Get started <ArrowUpRight size={18} />
            </Link>
          </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
