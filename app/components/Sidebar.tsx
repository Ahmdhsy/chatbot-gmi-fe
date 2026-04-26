"use client";

import React, { useState } from "react";

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
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        boxShadow: "1px 0 4px rgba(0,0,0,0.04)",
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
          borderBottom: "1px solid #f3f4f6",
          background: "linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)",
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
            <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#1a1a2e" }}>Telkom AI</p>
            <p style={{ margin: "2px 0 0", fontSize: "0.7rem", color: "#9ca3af" }}>Assistant</p>
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
            color: "#9ca3af",
            padding: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .2s ease",
            borderRadius: 8,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#4b5563";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.05)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
          title={sidebarOpen ? "Minimize sidebar" : "Open sidebar"}
        >
          ☰
        </button>
      </div>

      {sidebarOpen && (
      <>
      {/* New Chat Button */}
      <div style={{ padding: "16px 20px" }}>
        <button
          onClick={onNewChat}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "linear-gradient(135deg, #FE6C11 0%, #FF4400 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(254, 108, 17, 0.3)",
            transition: "all .2s ease",
            fontFamily: "Poppins, sans-serif",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 16px rgba(254, 108, 17, 0.4)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(254, 108, 17, 0.3)";
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>➕</span>
          <span>Chat Baru</span>
        </button>
      </div>

      {/* History Section */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* History Header */}
        <div
          style={{
            padding: "12px 20px",
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
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.0847 18.1622L18.9731 3.36844C18.9227 3.12658 18.8251 2.89706 18.6857 2.69307C18.5463 2.48908 18.368 2.31465 18.161 2.17979C17.9541 2.04492 17.7224 1.9523 17.4795 1.90724C17.2366 1.86217 16.9872 1.86555 16.7456 1.91719L12.3572 2.86032C11.9537 2.9478 11.5909 3.16715 11.3259 3.48375C11.156 3.22026 10.9227 3.0036 10.6474 2.85357C10.3721 2.70355 10.0635 2.62497 9.75 2.625H5.25C4.75272 2.625 4.27581 2.82255 3.92417 3.17418C3.57254 3.52581 3.375 4.00272 3.375 4.5V19.5C3.375 19.9973 3.57254 20.4742 3.92417 20.8258C4.27581 21.1775 4.75272 21.375 5.25 21.375H9.75C10.2473 21.375 10.7242 21.1775 11.0758 20.8258C11.4275 20.4742 11.625 19.9973 11.625 19.5V8.46094L14.0269 19.8816C14.1144 20.3028 14.3441 20.6811 14.6775 20.953C15.0109 21.2249 15.4276 21.3739 15.8578 21.375C15.9911 21.3749 16.124 21.3607 16.2544 21.3328L20.6428 20.3897C21.1283 20.2836 21.5522 19.9899 21.8223 19.5728C22.0923 19.1556 22.1866 18.6486 22.0847 18.1622ZM13.8928 8.31094L17.5491 7.52532L17.7863 8.65032L14.13 9.43594L13.8928 8.31094ZM14.5922 11.6391L18.2484 10.8534L19.1072 14.9391L15.4509 15.7247L14.5922 11.6391ZM16.8478 4.19625L17.085 5.32125L13.4288 6.10688L13.1916 4.98188L16.8478 4.19625ZM5.625 8.25H9.375V15.75H5.625V8.25ZM9.375 4.875V6H5.625V4.875H9.375ZM5.625 19.125V18H9.375V19.125H5.625ZM16.1522 19.0538L15.915 17.9288L19.5712 17.1431L19.8084 18.2681L16.1522 19.0538Z" fill="#475569"/>
            </svg>
            History
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af",
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
                left: 15,
                top: 0,
                bottom: 0,
                width: 1,
                background: "#e5e7eb",
                zIndex: 0,
              }}
            />
            
            {conversations.length === 0 ? (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  color: "#d1d5db",
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
                      lineEl.style.borderLeftColor = "#FE6C11";
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
                      left: 0,
                      top: 0,
                      bottom: 0,
                      borderLeft: `${c.id === activeId ? 3 : 1}px solid ${c.id === activeId ? "#FE6C11" : "transparent"}`,
                      width: 0,
                      transition: "all .2s ease",
                      zIndex: 2,
                      marginLeft: c.id === activeId ? "-1px" : "0",
                    }}
                  />
                  
                  {/* Content - with left padding to avoid overlap with line */}
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: 12 }}>
                    <p
                      style={{
                        margin: 0,
                        color: "#374151",
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
                      color: "#d1d5db",
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
                      (e.currentTarget as HTMLButtonElement).style.color = "#d1d5db";
                    }}
                    title="Hapus percakapan"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 2C3.9 2 3 2.9 3 4V5H2V7H3V20C3 21.1 3.9 22 5 22H19C20.1 22 21 21.1 21 20V7H22V5H21V4C21 2.9 20.1 2 19 2H15.5C15.5 1.4 14.9 0.9 14.2 0.9H9.8C9.1 0.9 8.5 1.4 8.5 2H5ZM5 4H19V20H5V4ZM8 8V17C8 17.5 8.5 18 9 18C9.5 18 10 17.5 10 17V8C10 7.5 9.5 7 9 7C8.5 7 8 7.5 8 8ZM12 8V17C12 17.5 12.5 18 13 18C13.5 18 14 17.5 14 17V8C14 7.5 13.5 7 13 7C12.5 7 12 7.5 12 8ZM16 8V17C16 17.5 16.5 18 17 18C17.5 18 18 17.5 18 17V8C18 7.5 17.5 7 17 7C16.5 7 16 7.5 16 8Z"/>
                    </svg>
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
          background: "linear-gradient(90deg, transparent 0%, #e5e7eb 50%, transparent 100%)",
        }}
      />

      {/* User Profile Section */}
      <div style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
            padding: "12px 14px",
            background: "linear-gradient(135deg, rgba(254, 108, 17, 0.08) 0%, rgba(255, 68, 0, 0.04) 100%)",
            borderRadius: 12,
            border: "1px solid rgba(254, 108, 17, 0.15)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #FE6C11, #FF4400)",
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
                color: "#1a1a2e",
                fontSize: "0.85rem",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail}
            </p>
            <p style={{ margin: "2px 0 0", color: "#9ca3af", fontSize: "0.75rem" }}>
              Pengguna
            </p>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(239, 68, 68, 0.08)",
            color: "#ef4444",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 500,
            transition: "all .2s ease",
            fontFamily: "Poppins, sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(239, 68, 68, 0.12)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239, 68, 68, 0.3)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(239, 68, 68, 0.08)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239, 68, 68, 0.2)";
          }}
        >
          <span>🚪</span>
          <span>Keluar</span>
        </button>
      </div>
      </>
      )}
    </aside>
  );
}
