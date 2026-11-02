import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { siteUrl } from "./site-url.mjs"

const root = fileURLToPath(new URL("..", import.meta.url))
const output = join(root, ".generated")
const origin = siteUrl({ development: process.argv.includes("--dev") })

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(join(root, "assets"), output, { recursive: true })

for (const name of ["robots.txt", "llms.txt"]) {
  const template = await readFile(join(root, "templates", name), "utf8")
  await writeFile(join(output, name), template.replaceAll("__SITE_URL__", origin))
}
await writeFile(join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`)
await cp(join(root, "templates", "manifest.json"), join(output, "manifest.json"))
