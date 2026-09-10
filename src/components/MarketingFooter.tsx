import Link from "next/link";
import { Brand } from "./MarketingNav";
import styles from "./marketing.module.css";
export default function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <div>
          <Brand />
          <p>
            A stronger local presence.
            <br />
            More time for the business you love.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/start">Start your website</Link>
          <Link href="/templates">Explore designs</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/login">Your workspace</Link>
        </nav>
      </div>
      <div className={styles.footerBottom}>
        <p>© {new Date().getFullYear()} AutoLocal.ai</p>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <p>Built for businesses that make their neighborhoods better.</p>
      </div>
    </footer>
  );
}
