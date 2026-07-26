import type { APIRoute } from 'astro';
import { SITE } from '../site.config.mjs';

export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${SITE.url.replace(/\/$/, '')}/sitemap-index.xml`,
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
