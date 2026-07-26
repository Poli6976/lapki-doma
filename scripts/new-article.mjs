#!/usr/bin/env node
/**
 * Создаёт ЗАГОТОВКУ статьи (черновик) из шаблона. Интернет не нужен.
 *
 * Использование:
 *   npm run new -- "How to care for a snake plant"
 *   npm run new -- "How to care for a snake plant" care-guides
 *
 * Второй аргумент — категория (по умолчанию care-guides):
 *   care-guides | troubleshooting | buying-guides | beginners
 *
 * Файл создаётся с draft: true — проверь/дополни и поставь draft: false для публикации.
 */
import { slugify, buildMarkdown, writeArticle } from './lib.mjs';
import { skeletonBody } from './templates.mjs';

const [, , rawTitle, rawCategory] = process.argv;

if (!rawTitle) {
  console.error('❌  Укажи заголовок: npm run new -- "Заголовок статьи" [категория]');
  process.exit(1);
}

const VALID = ['care-guides', 'troubleshooting', 'buying-guides', 'beginners'];
const category = VALID.includes(rawCategory) ? rawCategory : 'care-guides';
const title = rawTitle.trim();
const slug = slugify(title);

const description = `${title} — a clear, practical guide.`.slice(0, 160);
const { body, products } = skeletonBody({ title, category });

const md = buildMarkdown({ title, description, category, products, draft: true, body });
const { file, written } = writeArticle(slug, md);

if (!written) {
  console.error(`⚠️  Файл уже существует, пропускаю: ${file}`);
  process.exit(1);
}
console.log(`✅  Создан черновик: ${file}`);
console.log('   Дополни содержимое, затем поставь draft: false для публикации.');
