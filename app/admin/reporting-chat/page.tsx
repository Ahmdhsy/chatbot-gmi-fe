"use client";

import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import ReportingChat from "@/components/reporting-chat";

export default function ReportingChatPage() {
  return (
    <>
      <Breadcrumb pageName="Smart Interactive Reporting" />
      {/* No token: the admin shell is already signed in, so apiFetch's session
          headers apply. The embed page is the one that carries its own. */}
      <ReportingChat />
    </>
  );
}
