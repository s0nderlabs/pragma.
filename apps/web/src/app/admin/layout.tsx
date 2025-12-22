import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Pragma Admin",
  description: "Internal admin dashboard for Pragma",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check (except for login page)
  // Note: This runs for all admin routes, but login page handles its own logic
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  // If there's a token, verify it
  if (token) {
    const payload = await verifyToken(token);
    if (!payload) {
      // Invalid token - clear it and redirect to login
      redirect("/admin/login");
    }
  }

  return (
    <>
      {/* Font stylesheets for admin dashboard */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700&f[]=cal-sans@400&display=swap"
        rel="stylesheet"
      />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {/* Override inherited IBM Plex Mono from main app */}
      <style>{`
        .admin-fonts, .admin-fonts * {
          font-family: 'Raleway', sans-serif;
        }
        .admin-fonts .font-cal {
          font-family: 'Cal Sans', 'Cabinet Grotesk', sans-serif;
        }
        .admin-fonts .font-mono {
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
        }
      `}</style>
      <div className="admin-fonts bg-[#FAFAFA] dark:bg-[#121212] min-h-screen">
        {children}
      </div>
    </>
  );
}
