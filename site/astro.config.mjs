// @ts-check
import { defineConfig } from 'astro/config'

// Vercel serves the site at the root of https://wavi.autos. Its production domain comes from a system variable, so
// canonical, hreflang, sitemap and og:image get absolute URLs; SITE_URL overrides it, SITE_BASE builds under a sub-path.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
export default defineConfig({
  site: process.env.SITE_URL || (vercel ? `https://${vercel}` : undefined),
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  server: { host: '127.0.0.1', port: 4321 },
  build: { assets: '_assets' }
})
