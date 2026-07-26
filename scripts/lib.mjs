import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARTICLES_DIR = path.join(ROOT, 'src', 'content', 'articles');

// Транслитерация кириллицы в латиницу для slug-ов (ГОСТ-подобная, упрощённая).
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function translit(text) {
  return text.replace(/[а-яё]/gi, (ch) => {
    const lower = ch.toLowerCase();
    return TRANSLIT[lower] ?? ch;
  });
}

/** Превращает заголовок в slug (латиницей) для имени файла и URL. */
export function slugify(text) {
  return translit(String(text))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['"«»]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Список slug-ов уже существующих статей (чтобы не создавать дубли). */
export function existingSlugs() {
  if (!fs.existsSync(ARTICLES_DIR)) return new Set();
  const slugs = new Set();
  for (const file of fs.readdirSync(ARTICLES_DIR)) {
    if (!file.endsWith('.md')) continue;
    slugs.add(file.replace(/\.md$/, ''));
    // Имя файла может отличаться от slugify(title) — сверяем и по заголовку,
    // иначе генератор считает статью отсутствующей и создаёт дубль.
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8');
    const title = raw.match(/^title:\s*(.+)$/m);
    if (title) slugs.add(slugify(title[1].trim().replace(/^['"]|['"]$/g, '')));
  }
  return slugs;
}

/** YYYY-MM-DD на сегодня. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Экранирование одинарных кавычек для YAML-строк в одинарных кавычках. */
export function yamlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Собирает frontmatter + тело в готовый markdown-файл. */
export function buildMarkdown({ title, description, category, keywords = [], products = [], draft = true, body }) {
  const fm = [
    '---',
    `title: ${yamlStr(title)}`,
    `description: ${yamlStr(description)}`,
    `category: ${category}`,
    `publishDate: ${today()}`,
    `keywords: [${keywords.map((k) => yamlStr(k)).join(', ')}]`,
    `draft: ${draft}`,
  ];
  if (products.length) {
    fm.push('products:');
    for (const p of products) {
      fm.push(`  - name: ${yamlStr(p.name)}`);
      fm.push(`    amazonSearch: ${yamlStr(p.amazonSearch)}`);
      fm.push(`    blurb: ${yamlStr(p.blurb)}`);
    }
  }
  fm.push('---', '');
  return fm.join('\n') + '\n' + body.trim() + '\n';
}

/** Записывает статью в файл, возвращает путь. Не перезаписывает существующие. */
export function writeArticle(slug, markdown, { overwrite = false } = {}) {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  if (fs.existsSync(file) && !overwrite) {
    return { file, written: false };
  }
  fs.writeFileSync(file, markdown, 'utf8');
  return { file, written: true };
}
