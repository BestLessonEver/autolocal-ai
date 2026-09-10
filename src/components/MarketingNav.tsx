"use client";
import Link from "next/link";
import { Menu, X, ArrowUpRight, MapPin } from "lucide-react";
import { useState } from "react";
import styles from "./marketing.module.css";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="AutoLocal home"
      className={`${styles.brand} ${small ? styles.brandSmall : ""}`}
    >
      <MapPin aria-hidden="true" strokeWidth={2.6} />
      <span>
        autolocal<span className={styles.brandDot}>.</span>
      </span>
    </Link>
  );
}
export default function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className={styles.header}>
      <div className={styles.nav}>
        <Brand />
        <nav className={styles.desktopLinks} aria-label="Main navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/templates">Website designs</Link>
          <Link href="/#services">What’s included</Link>
        </nav>
        <div className={styles.navActions}>
          <Link href="/login" className={styles.login}>
            Sign in
          </Link>
          <Link href="/start" className={styles.buttonSmall}>
            Get started <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile navigation"
          className={styles.mobileLinks}
          onClick={() => setOpen(false)}
        >
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/templates">Website designs</Link>
          <Link href="/#services">What’s included</Link>
          <Link href="/contact">Talk to us</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      )}
    </header>
  );
}
