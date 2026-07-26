// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config.mjs';

// https://astro.build/config
export default defineConfig({
  // Меняется в src/site.config.mjs — тут просто проксируется для sitemap/canonical.
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
});
