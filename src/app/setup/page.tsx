import { Suspense } from "react";
import type { Metadata } from "next";
import DomainSetup from "./DomainSetup";
export const metadata: Metadata = {
  title: "Connect your domain",
  robots: { index: false, follow: false },
};
export default function Setup() {
  return (
    <Suspense fallback={<main>Loading domain setup…</main>}>
      <DomainSetup />
    </Suspense>
  );
}
