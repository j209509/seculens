import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

// PC幅で固定 (スマホはピンチ/スライド操作前提)
export const viewport: Viewport = {
  width: 1280,
  initialScale: 1,
  minimumScale: 0.25,
  maximumScale: 3,
  userScalable: true,
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/dashboard");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9", minWidth: 1280 }}>
      <AdminSidebar adminEmail={admin.email} />
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
