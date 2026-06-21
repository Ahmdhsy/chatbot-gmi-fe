/**
 * API Utility — centralized fetch wrapper
 * - Always sends Authorization header + cookies
 * - Auto-redirects to /signin on 401 Unauthorized
 */

import { getAuthHeader } from "./auth";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

interface ApiFetchOptions extends RequestInit {
  /** Whether to skip the auto-redirect to /signin on 401 */
  skipRedirectOn401?: boolean;
}

/**
 * Wrapper around fetch that:
 * 1. Prepends API_BASE to relative paths
 * 2. Always includes credentials (HttpOnly cookies)
 * 3. Redirects to /signin on 401
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { skipRedirectOn401 = false, ...fetchOptions } = options;

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...(fetchOptions.headers ?? {}),
    },
  });

  // Auto-redirect to sign-in on unauthorized (except when explicitly skipped)
  if (res.status === 401 && !skipRedirectOn401) {
    if (typeof window !== "undefined") {
      window.location.href = "/signin";
    }
  }

  return res;
}

/**
 * apiFetch variant for multipart/form-data (file uploads)
 * Does NOT set Content-Type — browser sets it automatically with boundary
 */
export async function apiFetchMultipart(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { skipRedirectOn401 = false, headers: _headers, ...fetchOptions } = options;

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers: {
      ...getAuthHeader(),
      // No Content-Type — browser adds it with multipart boundary
    },
  });

  if (res.status === 401 && !skipRedirectOn401) {
    if (typeof window !== "undefined") {
      window.location.href = "/signin";
    }
  }

  return res;
}
