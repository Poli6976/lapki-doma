#!/usr/bin/env node
/**
 * Загружает настоящие фотографии растений с Wikimedia Commons и подставляет их
 * как обложки статей вместо нарисованных SVG-заглушек.
 *
 * Почему именно Commons: там у каждого файла указана лицензия и автор, которые
 * можно проверить и показать на сайте. Брать картинки из поиска или скриншоты
 * с чужих видео нельзя — это чужая собственность и риск претензий.
 *
 * Лицензии CC BY / CC BY-SA требуют указания авторства — скрипт записывает автора,
 * лицензию и ссылку на источник в frontmatter (coverCredit), а шаблон статьи
 * показывает их подписью под фотографией.
 *
 * Использование:
 *   node scripts/fetch-photos.mjs                 # только статьи без фото
 *   node scripts/fetch-photos.mjs --force         # перезагрузить все
 *   node scripts/fetch-photos.mjs slug1 slug2     # перезагрузить конкретные
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES_DIR = path.join(ROOT, 'src/content/articles');
const OUT_DIR = path.join(ROOT, 'public/images/photos');
const FORCE = process.argv.includes('--force');
// Явно перечисленные slug-и перезагружаем, даже если фото уже стоит.
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// Wikimedia требует осмысленный User-Agent с контактом, иначе блокирует запросы.
// ⚠️ Поправить домен/почту, когда появится реальный домен (сейчас lapki-doma.ru
// не куплен — см. PROJECT.md).
const UA = 'LapkiDomaBot/1.0 (https://lapki-doma.ru; lapkidoma@yandex.com)';

/**
 * Какое фото искать для какой статьи. Латинские названия дают точный результат:
 * по русским запросам Commons часто возвращает случайные снимки.
 */
const PHOTO_QUERIES = {
  // Пока пусто — заполняется по мере написания статей про кошек/собак.
  // Пример на будущее: 'kak-priuchit-kotyonka-k-lotku': 'Kitten litter box',
};

/** Убирает html-теги из поля автора — Commons отдаёт его со ссылками. */
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// В Commons много исторических материалов: сканы книг, гравюры, картины,
// чёрно-белые архивные снимки. Для современного сайта они не годятся —
// выглядят как низкокачественный контент. Отсекаем их.
const BAD_AUTHORS = /internet archive book images|biodiversity heritage/i;
const BAD_TITLE =
  /\(page|bookplate|illustration|drawing|painting|sketch|engraving|lithograph|botanical art|herbarium|\bplate\b|title page/i;

/** Отсеивает исторические материалы: сканы, рисунки, дореволюционные фото. */
function looksHistorical(title, author, meta) {
  if (BAD_AUTHORS.test(author)) return true;
  if (BAD_TITLE.test(title)) return true;
  // Дата съёмки: всё старше 1990 отбраковываем — обычно это архив и ч/б.
  const date = stripHtml(meta.DateTimeOriginal?.value || meta.DateTime?.value || '');
  const year = Number((date.match(/\b(1[6-9]\d{2}|20\d{2})\b/) || [])[1]);
  if (year && year < 1990) return true;
  return false;
}

/** Ищет подходящее фото в Wikimedia Commons. Возвращает url + данные лицензии. */
async function findPhoto(query) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `File: ${query}`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '1200',
    format: 'json',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Commons ответил ${res.status}`);
  const data = await res.json();
  const pages = Object.values(data?.query?.pages ?? {});

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    // Только растровые фото: svg и рисунки нам не нужны.
    if (!/^image\/(jpeg|png)$/.test(info.mime || '')) continue;
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? '';
    // Отсекаем несвободные лицензии (fair use и подобное).
    if (/fair use|non-free/i.test(license)) continue;

    const author = stripHtml(meta.Artist?.value) || 'Wikimedia Commons';
    if (looksHistorical(page.title, author, meta)) continue;

    return {
      url: info.thumburl || info.url,
      author,
      license: stripHtml(license) || 'CC',
      sourceUrl: info.descriptionurl || '',
      title: page.title,
    };
  }
  return null;
}

/** Скачивает файл на диск. */
async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Скачивание не удалось: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/** Заменяет или добавляет поле в frontmatter. */
function setField(fm, name, value) {
  const re = new RegExp(`^${name}:.*$`, 'm');
  return re.test(fm) ? fm.replace(re, `${name}: ${value}`) : `${fm}\n${name}: ${value}`;
}

/** Экранирование для YAML-строки в одинарных кавычках. */
function yaml(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const entries = Object.entries(PHOTO_QUERIES);
let done = 0;
let skipped = 0;
const failed = [];

console.log(`Ищу фотографии для ${entries.length} статей…\n`);

for (const [slug, query] of entries) {
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) {
    failed.push(`${slug} — нет такой статьи`);
    continue;
  }

  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) {
    failed.push(`${slug} — битый frontmatter`);
    continue;
  }
  let [, fm, body] = m;

  const requested = ONLY.length > 0 && ONLY.includes(slug);
  if (ONLY.length > 0 && !requested) {
    skipped++;
    continue;
  }
  if (!FORCE && !requested && /^cover:\s*\/images\/photos\//m.test(fm)) {
    skipped++;
    continue;
  }

  try {
    const photo = await findPhoto(query);
    if (!photo) {
      failed.push(`${slug} — подходящее фото не найдено`);
      continue;
    }

    const ext = photo.url.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const filename = `${slug}.${ext}`;
    const bytes = await download(photo.url, path.join(OUT_DIR, filename));

    fm = setField(fm, 'cover', `/images/photos/${filename}`);
    const title = (fm.match(/^title:\s*(.+)$/m)?.[1] ?? slug).replace(/^['"]|['"]$/g, '');
    fm = setField(fm, 'coverAlt', yaml(title));
    // coverCredit — вложенный объект. Удаляем сам ключ ВМЕСТЕ со всеми
    // строками с отступом под ним, иначе остаются осиротевшие author/license
    // и frontmatter перестаёт парситься.
    fm = fm.replace(/^coverCredit:[ \t]*\r?\n(?:[ \t]+\S.*\r?\n?)*/m, '').trimEnd();
    fm += `\ncoverCredit:\n  author: ${yaml(photo.author)}\n  license: ${yaml(photo.license)}\n  sourceUrl: ${yaml(photo.sourceUrl)}`;

    fs.writeFileSync(file, `---\n${fm}\n---\n${body}`, 'utf8');
    done++;
    console.log(`✓ ${slug}\n    ${photo.license} · ${photo.author} · ${Math.round(bytes / 1024)} КБ`);

    // Вежливая пауза, чтобы не долбить API Wikimedia.
    await new Promise((r) => setTimeout(r, 400));
  } catch (err) {
    failed.push(`${slug} — ${err.message}`);
  }
}

console.log(`\nГотово: загружено ${done}, пропущено ${skipped}, не удалось ${failed.length}`);
if (failed.length) {
  console.log('\nНе получилось:');
  failed.forEach((f) => console.log('  ' + f));
}
