import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Коллекция статей. Каждая статья — .md файл в src/content/articles/.
 * Имя файла = slug = часть URL. Frontmatter обязан соответствовать этой схеме,
 * иначе сборка упадёт с понятной ошибкой (это защита от битого контента).
 */
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    // Заголовок статьи (в <h1> и <title>).
    title: z.string().max(70, 'Заголовок длиннее 70 символов плохо для SEO'),

    // Мета-описание для поиска и соцсетей (идеально 120–160 символов).
    description: z.string().max(200),

    // Категория — должна совпадать со slug из CATEGORIES в site.config.mjs.
    category: z.enum(['koshki', 'sobaki', 'zdorovie-i-povedenie', 'sovety']),

    // Дата публикации и (опционально) последнего обновления.
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),

    // Ключевые слова/теги для внутренней перелинковки.
    keywords: z.array(z.string()).default([]),

    // Обложка (путь в /public или внешний URL). Опционально.
    cover: z.string().optional(),
    coverAlt: z.string().optional(),

    // Авторство фото — обязательно для лицензий CC BY / CC BY-SA.
    // Заполняется автоматически скриптом fetch-photos.mjs при загрузке
    // фотографии с Wikimedia Commons. Показывается подписью под обложкой.
    coverCredit: z
      .object({
        author: z.string(),
        license: z.string(),
        sourceUrl: z.string(),
      })
      .optional(),

    // Черновик: true = не публикуется в проде (нужна твоя вычитка).
    // Автогенератор всегда ставит draft: true — ты проверяешь и ставишь false.
    draft: z.boolean().default(false),

    // Партнёрские товары, которые показываются карточками в статье.
    products: z
      .array(
        z.object({
          name: z.string(),
          // Поисковый запрос на маркетплейсе (партнёрская метка подставится автоматически).
          marketplaceSearch: z.string(),
          blurb: z.string(),
        }),
      )
      .default([]),

    // Автор (по умолчанию берётся из site.config).
    author: z.string().optional(),
  }),
});

export const collections = { articles };
