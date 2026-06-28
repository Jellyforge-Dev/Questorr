export function isValidUrl(string) {
  if (!string || typeof string !== "string") return false;
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// True only when the host is plausibly reachable from the public internet
// (i.e. by Discord's image proxy). Loopback, RFC1918 ranges and *.local
// hostnames are treated as private — sending those URLs to Discord yields a
// broken/empty image, so callers should skip them.
export function isLikelyPublicUrl(string) {
  if (!string || typeof string !== "string") return false;
  let host;
  try {
    host = new URL(string).hostname;
  } catch (_) {
    return false;
  }
  if (host === "localhost" || host.endsWith(".local")) return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}
