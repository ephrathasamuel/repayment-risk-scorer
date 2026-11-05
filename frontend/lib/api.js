// Small fetch wrapper for the scoring API (same origin, proxied by proxy.js).

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// 502/503/504 also happen while a free hosted API wakes from sleep, which takes about a minute.
const WAKING = "The scoring service is starting up. Wait a minute and try again.";

function messageFrom(body, status) {
  if (!body) return status >= 500 ? WAKING : `Request failed (${status})`;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((d) => `${(d.loc || []).slice(1).join(" ")}: ${d.msg}`.trim())
      .join("; ");
  }
  return `Request failed (${status})`;
}

export async function api(path, { method = "GET", json, body, signal } = {}) {
  const init = { method, credentials: "same-origin", signal, headers: {} };
  if (json !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(json);
  } else if (body) {
    init.body = body;
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, `Can't reach the scoring service. ${WAKING}`);
  }
  if (res.status === 401 && !path.startsWith("/api/auth/") && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = new URL(`/login?next=${next}`, window.location.origin).href;
    throw new ApiError(401, "Please sign in.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFrom(data, res.status), data);
  return data;
}

export const pct = (p, digits = 1) => `${(p * 100).toFixed(digits)}%`;
export const money = (n) => (n == null ? "—" : `NT$ ${Math.round(n).toLocaleString("en-US")}`);
export const when = (iso) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// The shared demo account is shown by name, never by its internal email.
export const who = (email) => (email?.startsWith("demo@") ? "Demo account" : email);
