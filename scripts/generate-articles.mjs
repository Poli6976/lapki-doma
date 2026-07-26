#!/usr/bin/env node
/**
 * Генерирует ПАЧКУ статей-черновиков из data/topics.json.
 *
 * Два режима (выбирается автоматически):
 *   • Офлайн-скелет  — если ключа Claude API нет. Создаёт каркас статьи для ручного
 *     наполнения. Интернет и деньги не нужны.
 *   • AI-статьи      — если в .env задан ANTHROPIC_API_KEY. Пишет готовые статьи
 *     через Claude API (платно, по желанию).
 *
 * Все статьи создаются с draft: true — ты проверяешь и публикуешь вручную.
 *
 * Использование:
 *   npm run generate            # берёт GENERATE_BATCH_SIZE тем (по умолчанию 3)
 *   npm run generate -- 5       # взять 5 тем за раз
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, slugify, buildMarkdown, writeArticle, existingSlugs } from './lib.mjs';
import { skeletonBody, aiPrompt } from './templates.mjs';

// --- крошечный парсер .env (без зависимостей) ---
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const BATCH = Number(process.argv[2] || process.env.GENERATE_BATCH_SIZE || 3);
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5';

const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'topics.json'), 'utf8'));
const done = existingSlugs();
const pending = topics.filter((t) => !done.has(slugify(t.title))).slice(0, BATCH);

if (pending.length === 0) {
  console.log('✅  Все темы из topics.json уже созданы. Добавь новые темы в data/topics.json.');
  process.exit(0);
}

console.log(
  `Режим: ${API_KEY ? `AI (${MODEL})` : 'офлайн-скелет'} · создаю ${pending.length} черновик(ов)…\n`,
);

/** Запрос к Claude API за телом статьи. */
async function aiBody(topic) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: aiPrompt(topic) }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content.map((b) => b.text).join('').trim();
}

let created = 0;
for (const topic of pending) {
  const slug = slugify(topic.title);
  try {
    let body;
    let products;
    if (API_KEY) {
      body = await aiBody(topic);
      products = skeletonBody(topic).products; // партнёрские товары по категории
    } else {
      ({ body, products } = skeletonBody(topic));
    }

    const description = `${topic.title} — a clear, practical guide.`.slice(0, 160);
    const md = buildMarkdown({
      title: topic.title,
      description,
      category: topic.category,
      keywords: topic.keywords ?? [],
      products,
      draft: true,
      body,
    });
    const { file, written } = writeArticle(slug, md);
    if (written) {
      created++;
      console.log(`  ✅  ${path.basename(file)}`);
    } else {
      console.log(`  ⏭️   ${slug} уже есть, пропуск`);
    }
  } catch (err) {
    console.error(`  ❌  ${slug}: ${err.message}`);
  }
}

console.log(`\nГотово: создано ${created} черновик(ов) в src/content/articles/.`);
console.log('Проверь их, при необходимости дополни и поставь draft: false для публикации.');
