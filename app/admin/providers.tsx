"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";
import { ThemeProvider } from "next-themes";
import { getAccessTokenFromCookie, getRoleFromCookie } from "../lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = getAccessTokenFromCookie();
    const role = getRoleFromCookie();

    if (!token) {
      router.replace("/signin");
    } else if (role !== "superadmin") {
      router.replace("/chat");
    } else {
      setAuthorized(true);
    }
  }, [router]);

  if (!authorized) {
    return <div className="min-h-screen bg-gray-2 dark:bg-[#171717]" />;
  }

  return (
    <ThemeProvider forcedTheme="dark" attribute="class">
      <SidebarProvider>{children}</SidebarProvider>
    </ThemeProvider>
  );
}
