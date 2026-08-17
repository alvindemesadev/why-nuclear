// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

// Deployment URL resolution, in order of precedence:
//   1. SITE_URL                      — explicit override (custom domain, any host)
//   2. VERCEL_URL                    — set automatically on every Vercel deploy
//   3. fallback                      — the assumed Vercel project URL for local builds
// https://astro.build/config
export default defineConfig({
  site:
    process.env.SITE_URL ??
    process.env.VERCEL_URL ??
    'https://why-nuclear.vercel.app',
  build: {
    // Single page, ~8KB of CSS: inline it to remove a render-blocking request.
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      // Static content site: pages change rarely, so signal that with a
      // conservative default frequency and per-page priorities — the home
      // argument and the Philippines deep dive are the content pages
      // (1.0 / 0.8), the credits page is supporting material (0.3).
      changefreq: 'monthly',
      priority: 0.5,
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        if (path === '/') {
          return { ...item, priority: 1.0, changefreq: 'monthly' };
        }
        if (path === '/nuclear-in-philippines') {
          return { ...item, priority: 0.8, changefreq: 'monthly' };
        }
        if (path === '/credits') {
          return { ...item, priority: 0.3, changefreq: 'yearly' };
        }
        return item;
      },
    }),
    icon({
      include: {
        lucide: [
          'arrow-down',
          'arrow-up',
          'arrow-up-right',
          'gauge',
          'leaf',
          'heart-pulse',
          'calendar-clock',
          'flask-conical',
          'activity',
          'recycle',
          'coins',
          'chevron-down',
          'book-open',
          'sun',
          'moon',
          'arrow-left',
          'x',
          'check',
          'link',
        ],
      },
    }),
  ],
});
