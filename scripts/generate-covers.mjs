#!/usr/bin/env node
/**
 * Генерирует SVG-обложки для статей без cover (запасной вариант, если для темы
 * не нашлось подходящего настоящего фото через fetch-photos.mjs).
 * Свои иллюстрации: не нужно скачивать фото (лицензии, авторские права),
 * лёгкий вес, вписаны в палитру сайта.
 *
 * Архетип иллюстрации подбирается по category/keywords статьи (кошка / собака /
 * общий силуэт лапы для универсальных тем).
 *
 * Использование: node scripts/generate-covers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES_DIR = path.join(ROOT, 'src/content/articles');
const OUT_DIR = path.join(ROOT, 'public/images/covers');

// --- палитра сайта + тона шерсти животных ---
const BG = ['#ebe0d3', '#efe4d8', '#f3ece2'];
const FUR = ['#b8916f', '#8a6a4f', '#d9b896', '#a67c52'];
const ACCENT = ['#c99f86', '#8a5c46', '#6b4226'];

/** Простой детерминированный хеш строки -> целое число. */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function pick(arr, seed, salt = 0) {
  return arr[(seed + salt) % arr.length];
}

function bgShape(seed) {
  const bg = pick(BG, seed, 2);
  const accent = pick(ACCENT, seed, 3);
  return `
    <rect width="400" height="225" fill="${bg}"/>
    <circle cx="330" cy="40" r="90" fill="${accent}" opacity="0.16"/>
    <circle cx="40" cy="190" r="70" fill="${accent}" opacity="0.12"/>`;
}

// --- архетипы иллюстраций ---

/** Простой силуэт кошачьей головы: треугольные уши, усы. */
function archetypeCat(seed) {
  const fur = pick(FUR, seed, 0);
  const inner = pick(ACCENT, seed, 1);
  let out = '';
  out += `<circle cx="200" cy="145" r="55" fill="${fur}"/>`;
  out += `<path d="M155,110 L172,58 L196,103 Z" fill="${fur}"/>`;
  out += `<path d="M245,110 L228,58 L204,103 Z" fill="${fur}"/>`;
  out += `<path d="M162,102 L172,74 L188,99 Z" fill="${inner}"/>`;
  out += `<path d="M238,102 L228,74 L212,99 Z" fill="${inner}"/>`;
  out += `<ellipse cx="182" cy="140" rx="7" ry="9" fill="${inner}"/>`;
  out += `<ellipse cx="218" cy="140" rx="7" ry="9" fill="${inner}"/>`;
  out += `<path d="M200,158 L191,168 L209,168 Z" fill="${inner}"/>`;
  [
    [175, 172, 140, 168],
    [175, 178, 138, 180],
    [225, 172, 260, 168],
    [225, 178, 262, 180],
  ].forEach(([x1, y1, x2, y2]) => {
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${inner}" stroke-width="1.5" stroke-linecap="round"/>`;
  });
  return out;
}

/** Простой силуэт собачьей головы: висячие уши, мягкая морда. */
function archetypeDog(seed) {
  const fur = pick(FUR, seed, 1);
  const earFur = pick(FUR, seed, 2);
  const inner = pick(ACCENT, seed, 0);
  let out = '';
  out += `<ellipse cx="160" cy="150" rx="22" ry="34" fill="${earFur}" transform="rotate(-15 160 150)"/>`;
  out += `<ellipse cx="240" cy="150" rx="22" ry="34" fill="${earFur}" transform="rotate(15 240 150)"/>`;
  out += `<circle cx="200" cy="140" r="52" fill="${fur}"/>`;
  out += `<ellipse cx="200" cy="172" rx="30" ry="22" fill="${fur}"/>`;
  out += `<ellipse cx="182" cy="130" rx="6" ry="8" fill="${inner}"/>`;
  out += `<ellipse cx="218" cy="130" rx="6" ry="8" fill="${inner}"/>`;
  out += `<ellipse cx="200" cy="170" rx="9" ry="7" fill="${inner}"/>`;
  return out;
}

/** Отпечаток лапы — универсальная нейтральная иллюстрация. */
function archetypePaw(seed) {
  const fur = pick(FUR, seed, 3);
  let out = '';
  out += `<ellipse cx="200" cy="155" rx="42" ry="34" fill="${fur}"/>`;
  out += `<ellipse cx="150" cy="105" rx="18" ry="22" fill="${fur}" transform="rotate(-15 150 105)"/>`;
  out += `<ellipse cx="196" cy="85" rx="18" ry="22" fill="${fur}"/>`;
  out += `<ellipse cx="242" cy="105" rx="18" ry="22" fill="${fur}" transform="rotate(15 242 105)"/>`;
  return out;
}

function pickArchetype(entry) {
  const hay = `${entry.title} ${(entry.keywords || []).join(' ')}`.toLowerCase();
  if (entry.category === 'koshki') return archetypeCat;
  if (entry.category === 'sobaki') return archetypeDog;
  if (/кошк|кот[аеу]?\b|котён|котят/.test(hay)) return archetypeCat;
  if (/собак|пёс|щен/.test(hay)) return archetypeDog;
  return archetypePaw;
}

function buildSvg(entry) {
  const seed = hash(entry.slug);
  const archetype = pickArchetype(entry);
  return `<svg viewBox="0 0 400 225" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
${bgShape(seed)}
${archetype(seed)}
</svg>`;
}

// --- чтение статей и генерация ---

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  return { fm: m[1], body: m[2] };
}

function getField(fm, name) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'm');
  const m = fm.match(re);
  return m ? m[1].trim() : '';
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.md'));
let created = 0;
let skipped = 0;

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const full = path.join(ARTICLES_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  const parsed = parseFrontmatter(raw);
  if (!parsed) continue;
  const { fm, body } = parsed;

  if (/^cover:\s*\S/m.test(fm)) {
    skipped++;
    continue;
  }

  const title = getField(fm, 'title').replace(/^['"]|['"]$/g, '');
  const category = getField(fm, 'category');
  const kwRaw = getField(fm, 'keywords');
  const keywords = kwRaw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  const svg = buildSvg({ slug, title, category, keywords });
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), svg, 'utf8');

  const coverLine = `cover: /images/covers/${slug}.svg\ncoverAlt: 'Иллюстрация: ${title.replace(/'/g, "''")}'`;
  const newFm = fm.trimEnd() + '\n' + coverLine;
  fs.writeFileSync(full, `---\n${newFm}\n---\n${body}`, 'utf8');
  created++;
}

console.log(`Готово: создано обложек ${created}, пропущено (уже с cover) ${skipped}.`);
