// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SITE } from './src/site.config.mjs';

/**
 * Даты статей для <lastmod> в sitemap.
 *
 * astro:content на этапе чтения конфига ещё не доступен (виртуальный модуль,
 * собирается позже в пайплайне Astro), поэтому даты читаем напрямую из
 * frontmatter markdown-файлов простым regexp — без ключей форматирование
 * гарантировано схемой в content.config.ts (простые скаляры, не многострочный YAML).
 */
const articlesDir = fileURLToPath(new URL('./src/content/articles', import.meta.url));
const articleLastmod = new Map();
for (const file of readdirSync(articlesDir)) {
  if (!file.endsWith('.md')) continue;
  const raw = readFileSync(`${articlesDir}/${file}`, 'utf-8');
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!frontmatter) continue;
  const category = frontmatter.match(/^category:\s*(\S+)/m)?.[1];
  const publishDate = frontmatter.match(/^publishDate:\s*(\S+)/m)?.[1];
  const updatedDate = frontmatter.match(/^updatedDate:\s*(\S+)/m)?.[1];
  if (!category || !publishDate) continue;
  const slug = file.replace(/\.md$/, '');
  articleLastmod.set(`/${category}/${slug}`, new Date(updatedDate ?? publishDate).toISOString());
}

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
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        const lastmod = articleLastmod.get(path);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
});
