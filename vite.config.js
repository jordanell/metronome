import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import { siteUrl } from "./scripts/site-url.mjs"

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
}

export default defineConfig(({ command }) => {
  const origin = siteUrl({ development: command === "serve" })
  const verification = [
    ["google-site-verification", process.env.GOOGLE_SITE_VERIFICATION],
    ["msvalidate.01", process.env.BING_SITE_VERIFICATION]
  ].filter(([, value]) => value).map(([name, value]) =>
    `<meta name="${name}" content="${escapeAttribute(value)}">`
  ).join("\n  ")

  return {
    publicDir: ".generated",
    plugins: [tailwindcss(), {
      name: "static-metadata",
      transformIndexHtml(html) {
        return html.replaceAll("__SITE_URL__", origin).replace("__VERIFICATION_TAGS__", verification)
      }
    }],
    build: { outDir: "dist", emptyOutDir: true }
  }
})
