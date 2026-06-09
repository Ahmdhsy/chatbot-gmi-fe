"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface SuperAdminFabProps {
  mode: "dashboard" | "chat";
}

export default function SuperAdminFab({ mode }: SuperAdminFabProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (mode === "dashboard") {
      router.push("/chat");
    } else {
      router.push("/admin");
    }
  };

  const tooltipText = mode === "dashboard" ? "Masuk ke Ruang Chat" : "Kembali ke Dashboard Admin";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "28px",
        right: "28px",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Tooltip */}
      <div
        style={{
          position: "absolute",
          right: "70px",
          background: "#1e1e1e",
          color: "#ece7dc",
          padding: "8px 14px",
          borderRadius: "8px",
          fontSize: "0.8rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateX(0)" : "translateX(10px)",
          transition: "opacity 0.25s ease, transform 0.25s ease",
          pointerEvents: "none",
          border: "1px solid #333333",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
        }}
      >
        {tooltipText}
      </div>

      {/* Ripple/Pulsing Glow Effect */}
      <div
        style={{
          position: "absolute",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "rgba(254, 108, 17, 0.35)",
          animation: "fab-pulse 2s infinite ease-in-out",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />

      {/* Main Floating Button */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #FE6C11 0%, #C8102E 100%)",
          color: "#ffffff",
          border: "none",
          cursor: "pointer",
          boxShadow: hovered 
            ? "0 8px 24px rgba(254, 108, 17, 0.55), 0 0 0 3px rgba(255, 255, 255, 0.15)" 
            : "0 6px 16px rgba(0, 0, 0, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          transform: hovered ? "scale(1.1) rotate(5deg)" : "scale(1) rotate(0)",
          outline: "none",
        }}
        aria-label={tooltipText}
      >
        {mode === "dashboard" ? (
          /* Chat Balloon SVG Icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              width: "26px",
              height: "26px",
              transition: "transform 0.3s ease",
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          >
            <path
              fillRule="evenodd"
              d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.378.201 2.348 1.4 2.348 2.787v6.058c0 1.386-.97 2.586-2.348 2.787A47.16 47.16 0 0 1 12 14.88c-1.42 0-2.822-.095-4.2-.278L4.3 17.65a.75.75 0 0 1-1.15-.625v-3.79c-.88-.415-1.55-1.15-1.85-2.025A4.47 4.47 0 0 1 1 9.5V5.558c0-1.387.97-2.586 2.348-2.787ZM12 6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-3 1a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          /* Dashboard Layout/Grid SVG Icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              width: "26px",
              height: "26px",
              transition: "transform 0.3s ease",
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          >
            <path
              fillRule="evenodd"
              d="M3 6a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3V6ZM3 15.75a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2.25Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3v-2.25Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {/* Global CSS for pulsing animation */}
      <style>{`
        @keyframes fab-pulse {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.25);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
