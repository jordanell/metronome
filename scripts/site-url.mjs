/**
 * Resolve the site's public origin for generated metadata and links.
 * Development can use the local Vite origin; production requires SITE_URL
 * to be a secure origin with no path or trailing slash.
 */
export function siteUrl({ development = false } = {}) {
  const value = process.env.SITE_URL || (development ? "http://127.0.0.1:5173" : "")
  
  if (!value) throw new Error("SITE_URL is required for production builds")

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error("SITE_URL must be an absolute origin URL")
  }

  // Templates append their own paths, so the configured URL must be only an origin.
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || value.endsWith("/")) {
    throw new Error("SITE_URL must be an absolute origin without a trailing slash, path, query, fragment, or credentials")
  }

  if (!development && url.protocol !== "https:") throw new Error("SITE_URL must use HTTPS in production")

  return url.origin
}
