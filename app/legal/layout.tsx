import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "16px 24px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#0f172a", textDecoration: "none", fontWeight: 700 }}>
            <img src="/sequlia-icon.png" width={28} height={28} alt="Sequlia" />
            <span>Sequlia</span>
          </a>
        </div>
      </header>
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 80px", flex: 1, width: "100%" }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
