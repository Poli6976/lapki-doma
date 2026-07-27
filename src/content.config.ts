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
    category: z.enum(['koshki', 'sobaki', 'gryzuny', 'zdorovie-i-povedenie', 'sovety']),

    // Дата публикации и (опционально) последнего обновления.
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),

    // Ключевые слова/теги для внутренней перелинковки.
    keywords: z.array(z.string()).default([]),

    // Подраздел внутри категории — вкладка на странице категории.
    // Значение должно совпадать со slug из `subcategories` соответствующей
    // категории в site.config.mjs. Не указан — статья видна только на «Все».
    subcategory: z.string().optional(),

    // Обложка (путь в /public или внешний URL). Опционально.
    cover: z.string().optional(),
    coverAlt: z.string().optional(),

    // Несколько фото внутри статьи (например, породы из перечня).
    // Заполняется скриптом `fetch-photos.mjs --sets`. Авторство у каждого
    // снимка своё — лицензии CC BY / CC BY-SA требуют указывать его отдельно.
    gallery: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string(),
          caption: z.string().optional(),
          author: z.string().optional(),
          license: z.string().optional(),
          sourceUrl: z.string().optional(),
        }),
      )
      .default([]),

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

    // ─── Блоки, которые делают статью пригодной для встревоженного читателя ───
    // Все поля необязательные: без них статья собирается как раньше.

    // Фраза-присоединение в начале: что человек сейчас чувствует и почему это
    // объяснимо. Показывается до основного текста (компонент CalmIntro).
    reassurance: z.string().max(300).optional(),

    // «Что сделать в первую очередь» — 2–4 посильных шага, не список из десяти.
    tldr: z.array(z.string()).max(4).optional(),

    // Признаки, при которых нужен ветеринар, а не домашние меры (компонент VetAlert).
    // ⚠️ Только признаки «нужен осмотр» — никаких диагнозов и назначений.
    redFlags: z.array(z.string()).optional(),

    // true = в статье разбираются правовые нормы (выгул, содержание, ответственность).
    // Вместо ветеринарной оговорки подставляется юридическая: законы меняются,
    // а регионы вправе устанавливать более строгие требования.
    legal: z.boolean().default(false),

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

          // Маркировка рекламы по ст. 18.1 ФЗ «О рекламе» № 38-ФЗ.
          // Заполняются, только когда получены реальные данные: erid выдаёт ОРД
          // под конкретный креатив, наименование рекламодателя берётся из договора.
          // Выдумывать эти значения нельзя — пустые поля просто не выводятся.
          erid: z.string().optional(),
          advertiser: z.string().optional(),
        }),
      )
      .default([]),

    // Автор (по умолчанию берётся из site.config).
    author: z.string().optional(),
  }),
});

export const collections = { articles };
