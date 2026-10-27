import { MONETIZATION } from '../site.config.mjs';

/*
 * Внутренние ссылки — всегда со слэшем на конце. Так выглядит канонический адрес
 * страницы (GitHub Pages отдаёт /slug/index.html, а /slug перекидывает 301-м
 * редиректом). Ссылки без слэша приводили к тому, что Google держал в выдаче
 * обе версии адреса и делил между ними показы (найдено в Search Console 28.10.2026).
 */

/**
 * URL статьи вида /koshki/koshka-chasto-zevaet/.
 * @param {{ id: string, data: { category: string } }} entry запись коллекции articles
 */
export function articleUrl(entry) {
  return `/${entry.data.category}/${entry.id}/`;
}

/** URL страницы категории вида /koshki/. */
export function categoryUrl(slug) {
  return `/${slug}/`;
}

/**
 * Партнёрская ссылка на поиск Ozon. Если метка не задана — обычная ссылка на поиск
 * (сайт работает и без монетизации). Когда впишешь ozonClientId в site.config.mjs
 * (или обернёшь ссылки через CPA-сеть), все ссылки станут партнёрскими.
 * @param {string} query поисковый запрос
 */
export function marketplaceLink(query) {
  const params = new URLSearchParams({ text: query });
  if (MONETIZATION.ozonClientId) params.set('partner', MONETIZATION.ozonClientId);
  return `https://www.ozon.ru/search/?${params.toString()}`;
}

/** Абсолютный URL (для canonical / Open Graph). */
export function absoluteUrl(path, siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}
