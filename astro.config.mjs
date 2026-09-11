// Note: not `// @ts-check`ed — @tailwindcss/vite and Astro currently resolve different
// Vite type versions, which produces a harmless Plugin-type identity mismatch here.
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static microsite (product.md §3). No SSR, no adapter — pure static → dist/.
// Set `site` for canonical URLs / sitemap once the final domain is confirmed (§14.1).
export default defineConfig({
  site: 'https://compare.ogkilsbadminton.com',
  output: 'static',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
