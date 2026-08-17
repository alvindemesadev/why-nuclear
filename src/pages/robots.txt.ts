import type { APIRoute } from "astro";

// robots.txt generated at build time so the Sitemap URL always matches the
// resolved site domain (SITE_URL → VERCEL_URL → fallback), exactly like the
// sitemap integration itself. Blocks nothing.
export const GET: APIRoute = ({ site }) => {
  const body = site
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap-index.xml", site).href}\n`
    : "User-agent: *\nAllow: /\n";
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
