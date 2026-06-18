"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";
import { ThemeProvider } from "next-themes";
import { getAccessTokenFromCookie, getRoleFromCookie, setRoleCookie } from "../lib/auth";
import SuperAdminFab from "../components/SuperAdminFab";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

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
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

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
            router.replace("/chat");
          }
        } else {
          router.replace("/signin");
        }
      } catch (err) {
        console.error("Failed to verify user role with backend:", err);
        router.replace("/chat"); // Safeguard: redirect to chat if check fails
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
