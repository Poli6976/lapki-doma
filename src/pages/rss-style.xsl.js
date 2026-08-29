import { SITE } from '../site.config.mjs';

/**
 * XSL-стиль для /rss.xml — без него браузер показывает RSS как голый XML-код,
 * что для обычного читателя выглядит как сломанный сайт (проверено вживую
 * 30.08.2026). С этим файлом та же самая настоящая RSS-лента (для читалок
 * ничего не меняется) в браузере превращается в обычную страницу в стиле
 * сайта — список статей плюс честная подсказка, что RSS не обязателен и
 * проще подписаться в VK/Telegram/Дзен, если они уже настроены.
 *
 * Цвета продублированы из global.css (не импортируются — это отдельный XML-
 * документ, а не Astro-компонент, CSS-переменные ему не передать).
 */
const channels = [
  { url: SITE.social.vk, label: 'ВКонтакте' },
  { url: SITE.social.telegram, label: 'Telegram' },
  { url: SITE.social.dzen, label: 'Дзен' },
].filter((c) => c.url);

const channelLinks = channels
  .map((c) => `<a class="btn" href="${c.url}">${c.label}</a>`)
  .join('\n            ');

export const GET = () => {
  const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/rss/channel">
    <html lang="ru">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="title"/></title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vollkorn:wght@600;700&amp;family=Inter:wght@400;500;600&amp;display=swap"/>
        <style>
          :root { color-scheme: light; }
          body {
            margin: 0;
            background: #fbf3ea;
            color: #33261d;
            font-family: Inter, system-ui, sans-serif;
            line-height: 1.6;
          }
          .wrap { max-width: 680px; margin: 0 auto; padding: 40px 20px 64px; }
          h1 {
            font-family: Vollkorn, Georgia, serif;
            font-size: 1.9rem;
            margin: 0 0 8px;
          }
          .lead { color: #786052; margin: 0 0 28px; }
          .notice {
            background: #fdeade;
            border-left: 4px solid #d85a2e;
            border-radius: 0 14px 14px 0;
            padding: 18px 22px;
            margin: 0 0 32px;
            font-size: 0.95rem;
          }
          .notice p { margin: 0 0 14px; }
          .notice p:last-child { margin-bottom: 0; }
          .btn {
            display: inline-block;
            background: #d85a2e;
            color: #fff;
            text-decoration: none;
            padding: 10px 18px;
            border-radius: 999px;
            font-weight: 600;
            font-size: 0.9rem;
            margin: 4px 8px 4px 0;
          }
          a { color: #b6431d; }
          .item {
            padding: 18px 0;
            border-top: 1px solid #ecdccc;
          }
          .item h2 { font-size: 1.1rem; margin: 0 0 6px; }
          .item h2 a { text-decoration: none; color: #33261d; }
          .item p { margin: 0 0 6px; color: #786052; font-size: 0.95rem; }
          .item time { font-size: 0.8rem; color: #786052; }
          .home { display: inline-block; margin-top: 32px; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1><xsl:value-of select="title"/></h1>
          <p class="lead"><xsl:value-of select="description"/></p>

          <div class="notice">
            <p>
              Это RSS-лента — технический формат для программ-читалок, не обычная
              страница. Если у вас такой программы нет, читать новые статьи проще
              одним из способов ниже.
            </p>
            ${channels.length > 0
              ? `<p>${channelLinks}</p>`
              : `<p>Пока подписаться можно только через RSS в специальной читалке — другие каналы ещё не подключены.</p>`}
          </div>

          <xsl:for-each select="item">
            <div class="item">
              <h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
              <p><xsl:value-of select="description"/></p>
              <time><xsl:value-of select="pubDate"/></time>
            </div>
          </xsl:for-each>

          <a class="home" href="${SITE.url}">← На сайт «${SITE.name}»</a>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`;

  return new Response(xsl, { headers: { 'Content-Type': 'application/xslt+xml; charset=UTF-8' } });
};
