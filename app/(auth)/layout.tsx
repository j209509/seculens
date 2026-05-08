import "../lp.css";
import { SiteFooter } from "@/components/SiteFooter";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #eff6ff 0%, #dbeafe 55%, #eff6ff 100%)",
          padding: "20px",
        }}
      >
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
