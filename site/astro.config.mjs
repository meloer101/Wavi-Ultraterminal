// @ts-check
import { defineConfig } from 'astro/config'

// One build per host. Vercel serves the site at the root; GitHub Pages serves it under /terminal-reborn/,
// so the Pages workflow sets SITE_BASE (and SITE_URL) and every asset and link follows import.meta.env.BASE_URL.
// On Vercel the production domain comes from its system variable, so link previews get an absolute og:image.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
export default defineConfig({
  site: process.env.SITE_URL || (vercel ? `https://${vercel}` : undefined),
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  server: { host: '127.0.0.1', port: 4321 },
  build: { assets: '_assets' }
})
