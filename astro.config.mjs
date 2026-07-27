// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config.mjs';

// https://astro.build/config
export default defineConfig({
  // Меняется в src/site.config.mjs — тут просто проксируется для sitemap/canonical.
  site: SITE.url,
  trailingSlash: 'ignore',
  // Чёрная плашка Astro внизу экрана на localhost. В собранный сайт она и так
  // не попадала — посетители её никогда не видели, — но мешает смотреть дизайн.
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
});
