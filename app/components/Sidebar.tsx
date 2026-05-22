"use client";

import React, { useState } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import LogoutIcon from "@mui/icons-material/Logout";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  evidence?: Record<string, unknown>[];
  suggestions?: string[];
  chart?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
}

interface Conversation {
  id: string;
  title: string;
  apiConversationId?: string;
  messages: Message[];
  createdAt: Date;
}

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  conversations: Conversation[];
  activeId: string;
  onSelectConv: (conv: Conversation) => Promise<void>;
  onDeleteConv: (id: string) => void;
  onNewChat: () => void;
  userEmail: string;
  onLogout: () => void;
}

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  conversations,
  activeId,
  onSelectConv,
  onDeleteConv,
  onNewChat,
  userEmail,
  onLogout,
}: SidebarProps) {
  const [expandedSection, setExpandedSection] = useState<"history" | "settings" | null>("history");

  function getInitial(email: string) {
    return email ? email[0].toUpperCase() : "U";
  }

  return (
    <aside
      style={{
        width: sidebarOpen ? 320 : 56,
        minWidth: sidebarOpen ? 320 : 56,
        transition: "width .35s cubic-bezier(0.4, 0, 0.2, 1), min-width .35s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#171717",
        borderRight: "1px solid #2b2b2b",
        boxShadow: "1px 0 10px rgba(0,0,0,0.25)",
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: sidebarOpen ? "20px 24px" : "12px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: sidebarOpen ? "space-between" : "center",
          borderBottom: "1px solid #2a2a2a",
          background: "linear-gradient(180deg, #1b1b1b 0%, #171717 100%)",
        }}
      >
        {sidebarOpen && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <img
              src="/logo.png"
              alt="Telkom AI"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#e7e5df" }}>Telkom AI</p>
            <p style={{ margin: "2px 0 0", fontSize: "0.7rem", color: "#8f8f8a" }}>Assistant</p>
          </div>
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1.2rem",
            color: "#8f8f8a",
            padding: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .2s ease",
            borderRadius: 8,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#ddd9cf";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#8f8f8a";
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
          title={sidebarOpen ? "Minimize sidebar" : "Open sidebar"}
        >
          ☰
        </button>
      </div>

      {sidebarOpen && (
      <>
      {/* New Chat Entry (match history style) */}
      <div style={{ padding: "8px 16px 10px", position: "relative" }}>
        <button
          onClick={onNewChat}
          style={{
            width: "100%",
            padding: "12px 4px 12px 0",
            background: "transparent",
            color: "#d8d5cc",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.95rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 12,
            whiteSpace: "nowrap",
            transition: "all .2s ease",
            fontFamily: "'Inter', Tahoma, Geneva, Verdana, sans-serif",
            position: "relative",
            zIndex: 1,
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <span style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="#a7a39a" aria-hidden="true">
            <path
              d="M120-160v-600q0-33 23.5-56.5T200-840h480q33 0 56.5 23.5T760-760v203q-10-2-20-2.5t-20-.5q-10 0-20 .5t-20 2.5v-203H200v400h283q-2 10-2.5 20t-.5 20q0 10 .5 20t2.5 20H240L120-160Zm160-440h320v-80H280v80Zm0 160h200v-80H280v80Zm400 280v-120H560v-80h120v-120h80v120h120v80H760v120h-80ZM200-360v-400 400Z"
            />
          </svg>
          </span>
          <span>Chat Baru</span>
        </button>
      </div>

      {/* History Section */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* History Header */}
        <div
          style={{
            padding: "0 16px 12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            transition: "all .2s ease",
            userSelect: "none",
            background: "transparent",
            borderLeft: "3px solid transparent",
          }}
          onClick={() =>
            setExpandedSection(expandedSection === "history" ? null : "history")
          }
          onMouseEnter={(e) => {
            if (expandedSection !== "history") {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }
          }}
          onMouseLeave={(e) => {
            if (expandedSection !== "history") {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }
          }}
        >
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#d8d5cc", display: "flex", alignItems: "center", gap: 12 }}>
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="#a7a39a" aria-hidden="true">
              <path d="M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z"/>
            </svg>
            History
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#8f8f8a",
              transition: "transform .2s ease",
              transform: expandedSection === "history" ? "rotate(180deg)" : "rotate(0deg)",
              display: "inline-block",
            }}
          >
            ▼
          </span>
        </div>

        {/* Conversation List */}
        {expandedSection === "history" && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0 16px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              position: "relative",
            }}
          >
            {/* Continuous Background Line */}
            <div
              style={{
                position: "absolute",
                left: 25,
                top: 0,
                bottom: 0,
                width: 1,
                background: "#2f2f2f",
                zIndex: 0,
              }}
            />
            
            {conversations.length === 0 ? (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  color: "#7f7f7a",
                  fontSize: "0.8rem",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                Tidak ada percakapan
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectConv(c)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    cursor: "pointer",
                    transition: "all .2s ease",
                    position: "relative",
                    zIndex: 1,
                  }}
                  onMouseEnter={(e) => {
                    const lineEl = (e.currentTarget as HTMLDivElement).querySelector('[data-line]') as HTMLDivElement;
                    if (lineEl && c.id !== activeId) {
                      lineEl.style.borderLeftColor = "#c97342";
                      lineEl.style.borderLeftWidth = "3px";
                      lineEl.style.marginLeft = "-1px";
                    }
                  }}
                  onMouseLeave={(e) => {
                    const lineEl = (e.currentTarget as HTMLDivElement).querySelector('[data-line]') as HTMLDivElement;
                    if (lineEl && c.id !== activeId) {
                      lineEl.style.borderLeftColor = "transparent";
                      lineEl.style.borderLeftWidth = "1px";
                      lineEl.style.marginLeft = "0";
                    }
                  }}
                >
                  {/* Single Continuous Line - Positioned over background */}
                  <div
                    data-line
                    style={{
                      position: "absolute",
                      left: 10,
                      top: 0,
                      bottom: 0,
                      borderLeft: `${c.id === activeId ? 3 : 1}px solid ${c.id === activeId ? "#c97342" : "transparent"}`,
                      width: 0,
                      transition: "all .2s ease",
                      zIndex: 2,
                      marginLeft: c.id === activeId ? "-1px" : "0",
                    }}
                  />
                  
                  {/* Content - with left padding to avoid overlap with line */}
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: 35 }}>
                    <p
                      style={{
                        margin: 0,
                        color: "#cfcac0",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c.title}
                    </p>
                  </div>
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConv(c.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#7f7f7a",
                      cursor: "pointer",
                      padding: "4px 8px",
                      lineHeight: 1,
                      transition: "all .15s ease",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "#7f7f7a";
                    }}
                    title="Hapus percakapan"
                  >
                    <DeleteIcon sx={{ fontSize: 18 }} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent 0%, #2b2b2b 50%, transparent 100%)",
        }}
      />

      {/* User Profile Section */}
      <div style={{ padding: "18px 20px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 14px",
            background: "#1d1d1d",
            borderRadius: 16,
            border: "1px solid #343434",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: "#ff5a00",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.95rem",
                flexShrink: 0,
              }}
            >
              {getInitial(userEmail)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  color: "#e2ddd2",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {userEmail}
              </p>
              <p style={{ margin: "2px 0 0", color: "#8f8f8a", fontSize: "0.75rem" }}>
                Pengguna
              </p>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
            <button
              onClick={onLogout}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "rgba(201,115,66,0.12)",
                color: "#d98b5d",
                border: "1px solid rgba(201,115,66,0.35)",
                cursor: "pointer",
                transition: "all .2s ease",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,115,66,0.2)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,115,66,0.45)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,115,66,0.12)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,115,66,0.35)";
              }}
              title="Keluar"
            >
              <LogoutIcon sx={{ fontSize: 18 }} />
            </button>
          </div>
        </div>
      </div>
      </>
      )}
    </aside>
  );
}
