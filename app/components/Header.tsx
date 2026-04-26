"use client";

import React from "react";

interface HeaderProps {
  conversationTitle: string;
}

export default function Header({
  conversationTitle,
}: HeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "16px 24px",
        background: "#ffffff",
        borderBottom: "1px solid rgba(254,108,17,0.1)",
        flexShrink: 0,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#1a1a2e" }}>
        {conversationTitle}
      </h1>
    </header>
  );
}
