export function mutationIsTrusted(request, { mode, proxyKey }) {
  const contentType = firstHeaderValue(request.headers["content-type"]);
  if (!contentType?.toLowerCase().startsWith("application/json")) return false;

  const providedProxyKey = firstHeaderValue(request.headers["x-haven-proxy-key"]);
  if (mode === "live" && (!proxyKey || providedProxyKey !== proxyKey)) return false;

  const origin = firstHeaderValue(request.headers.origin);
  const forwardedHost = firstHeaderValue(request.headers["x-forwarded-host"]);
  const directHost = firstHeaderValue(request.headers.host);
  const expectedHost = forwardedHost || directHost;
  if (!origin || !expectedHost) return true;

  try {
    return normalizeHost(new URL(origin).host) === normalizeHost(expectedHost);
  } catch {
    return false;
  }
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0]?.trim();
  return typeof value === "string" ? value.split(",", 1)[0].trim() : "";
}

function normalizeHost(value) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}
