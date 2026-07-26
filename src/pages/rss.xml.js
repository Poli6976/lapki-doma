import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../site.config.mjs';
import { articleUrl } from '../lib/urls.mjs';

export async function GET(context) {
  const all = await getCollection('articles', ({ data }) => !data.draft);
  const items = all
    .sort((a, b) => +new Date(b.data.publishDate) - +new Date(a.data.publishDate))
    .map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      pubDate: new Date(entry.data.publishDate),
      link: articleUrl(entry),
    }));

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items,
  });
}
