const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'strong', 'em', 'b', 'i',
  'ul', 'ol', 'li', 'blockquote',
  'a', 'sup', 'sub', 'hr', 'span',
]);

function decodeEntities(value = '') {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function sanitizeChapterHtml(html = '') {
  const withoutUnsafeBlocks = String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');

  const bodyMatch = withoutUnsafeBlocks.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : withoutUnsafeBlocks;

  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z0-9:-]+)([^>]*)>/gi, (match, rawTag, rawAttrs = '') => {
      const tag = rawTag.toLowerCase().replace(/^.*:/, '');
      const closing = /^<\//.test(match);
      const selfClosing = /\/>$/.test(match) || ['br', 'hr'].includes(tag);

      if (!ALLOWED_TAGS.has(tag)) return '';
      if (closing) return `</${tag}>`;
      if (tag === 'a') {
        const href = rawAttrs.match(/\shref=(["'])(.*?)\1/i)?.[2] ?? '';
        if (href && !/^\s*javascript:/i.test(href)) {
          return `<a href="${href.replaceAll('"', '&quot;')}">`;
        }
        return '<a>';
      }
      return selfClosing && ['br', 'hr'].includes(tag) ? `<${tag}>` : `<${tag}>`;
    })
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToText(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function countWords(text = '') {
  const value = String(text).trim();
  if (!value) return 0;
  const cjk = value.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  const latin = value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + latin;
}
