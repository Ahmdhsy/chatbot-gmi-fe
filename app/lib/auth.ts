// Lightweight cookie helper for auth
function getCookieAttrs(expiresUtc: string) {
  // In local HTTP development, Secure cookies are ignored by browsers.
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  return [
    `expires=${expiresUtc}`,
    "path=/",
    `samesite=${isHttps ? "strict" : "lax"}`,
    isHttps ? "secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const encoded = encodeURIComponent(value);
  document.cookie = `${name}=${encoded}; ${getCookieAttrs(expires)}`;

  // Fallback for browsers/environments that reject stricter attributes.
  if (!getCookie(name)) {
    document.cookie = `${name}=${encoded}; path=/`;
  }
}

function getCookie(name: string): string | null {
  const entries = document.cookie
    ? document.cookie.split(";").map((entry) => entry.trim()).filter(Boolean)
    : [];
  const prefix = `${name}=`;
  const matched = entries.find((entry) => entry.startsWith(prefix));
  if (!matched) return null;
  const raw = matched.slice(prefix.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function setAccessTokenCookie(token: string, days = 7) {
  setCookie("access_token", token, days);
}

export function setRoleCookie(role: string, days = 7) {
  setCookie("user_role", role, days);
}

export function setUserIdCookie(userId: string, days = 7) {
  setCookie("user_id", userId, days);
}

export function getAccessTokenFromCookie(): string | null {
  return getCookie("access_token");
}

export function getRoleFromCookie(): string | null {
  return getCookie("user_role");
}

export function getUserIdFromCookie(): string | null {
  return getCookie("user_id");
}

export function clearAccessTokenCookie() {
  const expired = new Date(0).toUTCString();
  document.cookie = `access_token=; ${getCookieAttrs(expired)}`;
  document.cookie = `user_role=; ${getCookieAttrs(expired)}`;
  document.cookie = `user_id=; ${getCookieAttrs(expired)}`;
  // Fallback clear for minimal-cookie variant.
  document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "user_role=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

export function isAuthenticated(): boolean {
  return getAccessTokenFromCookie() !== null;
}

export function getAuthHeader(): Record<string, string> {
  const token = getAccessTokenFromCookie();
  if (!token) {
    return {};
  }
  return {
    'Authorization': `Bearer ${token}`,
  };
}
