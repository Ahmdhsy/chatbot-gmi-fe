/**
 * API Utility — centralized fetch wrapper
 * - Always sends cookies with credentials: "include"
 * - Auto-redirects to /signin on 401 Unauthorized
 */

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
    credentials: "include", // Always send HttpOnly cookies
    headers: {
      "Content-Type": "application/json",
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
    // No Content-Type header — browser adds it with multipart boundary
  });

  if (res.status === 401 && !skipRedirectOn401) {
    if (typeof window !== "undefined") {
      window.location.href = "/signin";
    }
  }

  return res;
}
