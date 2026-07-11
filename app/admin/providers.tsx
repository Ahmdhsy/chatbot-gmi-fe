"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";
import { ThemeProvider } from "next-themes";
import { getAccessTokenFromCookie, getRoleFromCookie, setRoleCookie } from "../lib/auth";
import { apiFetch } from "../lib/api";
import SuperAdminFab from "../components/SuperAdminFab";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const token = getAccessTokenFromCookie();
    const role = getRoleFromCookie();

    if (!token) {
      router.replace("/signin");
      return;
    }

    // If cookie role is already admin or superadmin, allow immediately
    if (role === "superadmin") {
      setIsSuperAdmin(true);
      setAuthorized(true);
      return;
    }
    if (role === "admin") {
      setAuthorized(true);
      return;
    }

    // Fallback: verify role with backend to handle missing/out-of-sync cookies
    const verifyRoleWithBackend = async () => {
      try {
        const res = await apiFetch("/auth/me");

        if (res.ok) {
          const data = await res.json();
          const freshRole = data?.role;
          if (freshRole === "superadmin") {
            setRoleCookie(freshRole, 7);
            setIsSuperAdmin(true);
            setAuthorized(true);
          } else if (freshRole === "admin") {
            setRoleCookie(freshRole, 7);
            setAuthorized(true);
          } else {
            router.replace("/chat?new=1");
          }
        } else {
          router.replace("/signin");
        }
      } catch (err) {
        console.error("Failed to verify user role with backend:", err);
        router.replace("/chat?new=1"); // Safeguard: redirect to chat if check fails
      }
    };

    verifyRoleWithBackend();
  }, [router]);

  if (!authorized) {
    return <div className="min-h-screen bg-gray-2 dark:bg-[#171717]" />;
  }

  return (
    <ThemeProvider forcedTheme="dark" attribute="class">
      <SidebarProvider>
        {children}
        <SuperAdminFab mode="dashboard" />
      </SidebarProvider>
    </ThemeProvider>
  );
}
