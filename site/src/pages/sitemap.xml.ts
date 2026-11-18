import type { APIRoute } from 'astro'
import { absolute } from '../site'

// Both language pages; the host comes from the build's `site` (astro.config.mjs), so no domain is written here.
export const GET: APIRoute = ({ site }) => {
  const urls = ['', 'zh/'].map((path) => `  <url><loc>${absolute(path, site)}</loc></url>`).join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
