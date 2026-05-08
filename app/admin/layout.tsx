import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

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
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      <AdminSidebar adminEmail={admin.email} />
      <main style={{ flex: 1, overflow: "auto" }}>
        <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
