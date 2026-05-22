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
        padding: "14px 24px",
        background: "linear-gradient(180deg, #1f1f1f 0%, #1b1b1b 100%)",
        borderBottom: "1px solid #2f2f2f",
        flexShrink: 0,
        boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 600, color: "#e6e1d6", letterSpacing: "0.01em" }}>
        {conversationTitle}
      </h1>
    </header>
  );
}
