#!/usr/bin/env node
/**
 * Сообщает Bing и Яндексу о новых и изменённых страницах по протоколу IndexNow.
 *
 * Зачем: карта сайта отправлена в Bing 06.10.2026, но к 28.10 он взял в индекс
 * 3 страницы из 243 — сам обходит новые маленькие сайты очень медленно. IndexNow
 * прямо говорит поисковику «вот адреса, приходи», и обход идёт за дни, а не месяцы.
 *
 * Ключ — файл public/<32 hex>.txt. Он не секрет: поисковик скачивает его с сайта
 * и так убеждается, что запрос прислал владелец домена. Файл НЕ удалять — без
 * него все запросы будут отклонены (403).
 *
 * Использование:
 *   node scripts/indexnow.mjs --all                          # все адреса из живой карты сайта
 *   node scripts/indexnow.mjs src/content/articles/<slug>.md # только эти статьи
 *   ... --dry-run                                            # показать адреса, не отправлять
 *
 * В GitHub Actions запускается после деплоя с файлами статей из пуша
 * (см. .github/workflows/deploy.yml). Черновики (draft: true) пропускаются.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/site.config.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = new URL(SITE.url).host;
// Шлём каждому напрямую, чтобы в логе было видно ответ и Bing, и Яндекса.
const ENDPOINTS = ['https://www.bing.com/indexnow', 'https://yandex.com/indexnow'];

const keyFile = fs.readdirSync(path.join(ROOT, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error('Нет файла-ключа public/<32 hex>.txt — IndexNow не настроен.');
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, '');

async function urlsFromSitemap() {
  const index = await (await fetch(`${SITE.url}/sitemap-index.xml`)).text();
  const urls = [];
  for (const [, sitemapUrl] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const xml = await (await fetch(sitemapUrl)).text();
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(loc);
  }
  return urls;
}

// Тот же разбор frontmatter, что в astro.config.mjs: простые скаляры, без YAML-парсера.
function urlsFromArticles(files) {
  const urls = new Set();
  for (const file of files) {
    const full = path.resolve(ROOT, file);
    if (!full.endsWith('.md') || !fs.existsSync(full)) continue;
    const frontmatter = fs.readFileSync(full, 'utf-8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (!frontmatter || /^draft:\s*true/m.test(frontmatter)) continue;
    const category = frontmatter.match(/^category:\s*(\S+)/m)?.[1];
    if (!category) continue;
    const slug = path.basename(full, '.md');
    urls.add(`${SITE.url}/${category}/${slug}/`);
    // Новая статья появляется и в списке раздела, и на главной.
    urls.add(`${SITE.url}/${category}/`);
    urls.add(`${SITE.url}/`);
  }
  return [...urls];
}

const args = process.argv.slice(2);
const urlList = args.includes('--all')
  ? await urlsFromSitemap()
  : urlsFromArticles(args.filter((a) => !a.startsWith('--')));
if (urlList.length === 0) {
  console.log('IndexNow: новых опубликованных статей нет, отправлять нечего.');
  process.exit(0);
}
if (args.includes('--dry-run')) {
  console.log(`IndexNow (пробный запуск, ничего не отправлено): ${urlList.length} адресов`);
  console.log(urlList.join('\n'));
  process.exit(0);
}

const body = JSON.stringify({ host: HOST, key, keyLocation: `${SITE.url}/${keyFile}`, urlList });
console.log(`IndexNow: отправляю ${urlList.length} адресов`);
let failed = false;
for (const endpoint of ENDPOINTS) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });
  // 200 — принято, 202 — принято, ключ ещё проверяется. Остальное — ошибка.
  const ok = res.status === 200 || res.status === 202;
  if (!ok) failed = true;
  console.log(`  ${endpoint}: ${res.status} ${ok ? 'OK' : await res.text()}`);
}
process.exit(failed ? 1 : 0);
