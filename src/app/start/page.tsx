import { Suspense } from "react";
import type { Metadata } from "next";
import StartFlow from "./StartFlow";
export const metadata: Metadata = {
  title: "Start with your business",
  robots: { index: false, follow: true },
};
export default function StartPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 40, background: "#f7f8f2", color: "#174f3c" }}>
          Loading your workspace…
        </main>
      }
    >
      <StartFlow />
    </Suspense>
  );
}
