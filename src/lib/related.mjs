/**
 * Насколько статья b близка статье a: совпавшие keywords весят больше,
 * совпадение категории — небольшой бонус.
 */
function relatedScore(a, b) {
  const aKeywords = new Set(a.data.keywords ?? []);
  const shared = (b.data.keywords ?? []).filter((k) => aKeywords.has(k)).length;
  const sameCategory = a.data.category === b.data.category ? 1 : 0;
  return shared * 2 + sameCategory;
}

/**
 * Похожие статьи для блока «Читайте также»: сперва по общим keywords,
 * затем по категории, недостающее место добивается свежими статьями.
 * @param {any} entry текущая статья
 * @param {any[]} all все статьи коллекции
 * @param {number} limit сколько вернуть
 */
export function getRelatedArticles(entry, all, limit = 3) {
  return all
    .filter((e) => e.id !== entry.id)
    .map((e) => ({ entry: e, score: relatedScore(entry, e) }))
    .sort((x, y) => y.score - x.score || new Date(y.entry.data.publishDate) - new Date(x.entry.data.publishDate))
    .slice(0, limit)
    .map((x) => x.entry);
}
