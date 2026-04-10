/**
 * Main-process URL metadata resolver used by plugin-hosted link previews.
 */

import type {
  UrlMetadataRequestOptions,
  UrlMetadataResult,
  UrlMetadataService,
} from '@note-studio/plugin';

const URL_METADATA_CACHE_TTL_MS = 15 * 60 * 1000;
const URL_METADATA_DEFAULT_TIMEOUT_MS = 8000;
const URL_METADATA_HTML_LIMIT = 240_000;
const URL_METADATA_PREVIEW_HTML_LIMIT = 80_000;
const URL_METADATA_USER_AGENT = 'WStudio Canvas Link Preview';

interface CachedUrlMetadataResult {
  readonly result: UrlMetadataResult;
  readonly expiresAt: number;
}

function normalizeMetadataUrl(value: string): string | null {
  try {
    const parsedUrl = new URL(value.trim());

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    parsedUrl.username = '';
    parsedUrl.password = '';
    return parsedUrl.href;
  } catch {
    return null;
  }
}

function createErrorMetadataResult(
  url: string,
  message: string,
  statusCode: number | null = null,
): UrlMetadataResult {
  return {
    url,
    finalUrl: url,
    status: 'error',
    statusCode,
    title: null,
    description: null,
    siteName: null,
    image: null,
    favicon: null,
    previewHtml: null,
    errorMessage: message,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Readonly<Record<string, string>> = {
    amp: '&',
    apos: '\'',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string): string => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return namedEntities[normalizedEntity] ?? match;
  });
}

function escapePreviewHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMetadataText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > 0 ? normalized : null;
}

function parseHtmlAttributes(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match = attributePattern.exec(tag);

  while (match !== null) {
    const attributeName = match[1]?.toLowerCase() ?? '';
    const attributeValue = match[2] ?? match[3] ?? match[4] ?? '';

    if (attributeName.length > 0) {
      attributes.set(attributeName, attributeValue);
    }

    match = attributePattern.exec(tag);
  }

  return attributes;
}

function extractMetaContent(html: string, attributeName: 'name' | 'property', expectedValue: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const expected = expectedValue.toLowerCase();

  for (const tag of metaTags) {
    const attributes = parseHtmlAttributes(tag);
    const value = attributes.get(attributeName)?.toLowerCase() ?? '';

    if (value !== expected) {
      continue;
    }

    const content = attributes.get('content') ?? null;
    const normalized = normalizeMetadataText(content);

    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function extractTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return normalizeMetadataText(match?.[1] ?? null);
}

function extractFaviconHref(html: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of linkTags) {
    const attributes = parseHtmlAttributes(tag);
    const rel = attributes.get('rel')?.toLowerCase() ?? '';

    if (!rel.split(/\s+/).some((token) => token === 'icon' || token === 'shortcut' || token === 'apple-touch-icon')) {
      continue;
    }

    const href = attributes.get('href') ?? null;

    if (href !== null && href.trim().length > 0) {
      return href.trim();
    }
  }

  return null;
}

function resolveUrlReference(value: string | null, baseUrl: string): string | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  try {
    const resolved = new URL(value.trim(), baseUrl);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
  } catch {
    return null;
  }
}

function resolveFallbackFavicon(baseUrl: string): string | null {
  try {
    const parsedUrl = new URL(baseUrl);
    return `${parsedUrl.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function pickMetadataText(values: ReadonlyArray<string | null>): string | null {
  return values.find((value) => value !== null && value.trim().length > 0) ?? null;
}

function resolveClientRedirectUrl(html: string, finalUrl: string): string | null {
  const trimmedHtml = html.trim();

  if (/location\.replace\s*\(\s*location\.href\.replace\s*\(\s*["']https:\/\/["']\s*,\s*["']http:\/\/["']\s*\)\s*\)/i.test(trimmedHtml)) {
    try {
      const parsedUrl = new URL(finalUrl);

      if (parsedUrl.protocol === 'https:') {
        parsedUrl.protocol = 'http:';
        return parsedUrl.href;
      }
    } catch {
      return null;
    }
  }

  const directLocationMatch = /location\.(?:href|replace)\s*(?:=|\()\s*["']([^"']+)["']/i.exec(trimmedHtml);

  if (directLocationMatch?.[1] !== undefined) {
    return resolveUrlReference(directLocationMatch[1], finalUrl);
  }

  const metaRefreshTags = trimmedHtml.match(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi) ?? [];

  for (const tag of metaRefreshTags) {
    const attributes = parseHtmlAttributes(tag);
    const content = attributes.get('content') ?? '';
    const urlMatch = /url\s*=\s*([^;]+)/i.exec(content);

    if (urlMatch?.[1] !== undefined) {
      return resolveUrlReference(urlMatch[1].trim().replace(/^["']|["']$/g, ''), finalUrl);
    }
  }

  return null;
}

function extractPreviewBodyHtml(html: string): string {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return bodyMatch?.[1] ?? html;
}

function resolvePreviewAttributeUrl(value: string, baseUrl: string, attributeName: string): string | null {
  const trimmedValue = decodeHtmlEntities(value).trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  if (trimmedValue.startsWith('#')) {
    return trimmedValue;
  }

  if (/^data:image\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  if (attributeName.toLowerCase() === 'href' && /^(mailto|tel):/i.test(trimmedValue)) {
    return trimmedValue;
  }

  try {
    const resolvedUrl = new URL(trimmedValue, baseUrl);
    return resolvedUrl.protocol === 'http:' || resolvedUrl.protocol === 'https:' ? resolvedUrl.href : null;
  } catch {
    return null;
  }
}

function absolutizePreviewReferences(html: string, baseUrl: string): string {
  return html.replace(
    /\s(src|href|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
    (_attributeText: string, attributeName: string, _rawValue: string, doubleQuotedValue?: string, singleQuotedValue?: string, bareValue?: string): string => {
      const attributeValue = doubleQuotedValue ?? singleQuotedValue ?? bareValue ?? '';
      const resolvedValue = resolvePreviewAttributeUrl(attributeValue, baseUrl, attributeName);

      if (resolvedValue === null) {
        return attributeName.toLowerCase() === 'href' ? ` ${attributeName}="#"` : '';
      }

      return ` ${attributeName}="${escapePreviewHtml(resolvedValue)}"`;
    },
  );
}

function sanitizePreviewBodyHtml(html: string, baseUrl: string): string {
  const sanitizedHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, '')
    .replace(/\s+(?:srcdoc|autofocus|formaction|style|srcset|imagesrcset|data-src|data-original|data-lazy-src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, '')
    .replace(/\s+href\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, ' href="#"')
    .replace(/\s+src\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .slice(0, URL_METADATA_PREVIEW_HTML_LIMIT);

  return absolutizePreviewReferences(sanitizedHtml, baseUrl);
}

function createFallbackPreviewBody(title: string | null, description: string | null, finalUrl: string): string {
  const titleText = title ?? formatPreviewHost(finalUrl);
  const descriptionText = description ?? '该页面没有可提取的正文快照，可通过右键菜单打开原始链接。';

  return [
    '<main class="wstudio-url-preview-fallback">',
    `<h1>${escapePreviewHtml(titleText)}</h1>`,
    `<p>${escapePreviewHtml(descriptionText)}</p>`,
    `<small>${escapePreviewHtml(finalUrl)}</small>`,
    '</main>',
  ].join('');
}

function formatPreviewHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function createPreviewHtml(
  finalUrl: string,
  html: string,
  title: string | null,
  description: string | null,
): string {
  const bodyHtml = sanitizePreviewBodyHtml(extractPreviewBodyHtml(html), finalUrl);
  const previewBody = bodyHtml.trim().length > 0
    ? bodyHtml
    : createFallbackPreviewBody(title, description, finalUrl);

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<style>',
    'html,body{margin:0;min-height:100%;background:#fff;color:#111;font:14px/1.5 sans-serif;}',
    'body{box-sizing:border-box;padding:10px;overflow:hidden;}',
    'body *{box-sizing:border-box;max-width:100%;position:static!important;transform:none!important;animation:none!important;transition:none!important;}',
    'div:empty,span:empty,i:empty,b:empty{display:none!important;}',
    'img,video,canvas,svg{max-width:100%;height:auto;}',
    'div,section,article,main,header,footer,nav,aside,form,ul,ol,li,p{min-height:0!important;}',
    'a{color:#1d4ed8;text-decoration:none;}',
    'input,textarea,select{max-width:100%;box-sizing:border-box;}',
    '.wstudio-url-preview-fallback{display:flex;min-height:180px;flex-direction:column;justify-content:center;gap:8px;}',
    '.wstudio-url-preview-fallback h1{margin:0;font-size:20px;line-height:1.25;}',
    '.wstudio-url-preview-fallback p{margin:0;color:#4b5563;}',
    '.wstudio-url-preview-fallback small{color:#6b7280;overflow-wrap:anywhere;}',
    '</style>',
    '</head>',
    '<body>',
    previewBody,
    '</body>',
    '</html>',
  ].join('');
}

async function readMetadataHtmlResponse(url: string, signal: AbortSignal): Promise<{
  readonly html: string;
  readonly finalUrl: string;
  readonly statusCode: number;
}> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
      'user-agent': URL_METADATA_USER_AGENT,
    },
    redirect: 'follow',
    signal,
  });
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    throw new Error(`请求失败，HTTP 状态码 ${response.status}`);
  }

  if (contentType.length > 0 && !contentType.toLowerCase().includes('text/html')) {
    throw new Error(`目标不是 HTML 页面：${contentType}`);
  }

  const html = await response.text();

  return {
    html: html.slice(0, URL_METADATA_HTML_LIMIT),
    finalUrl: response.url.length > 0 ? response.url : url,
    statusCode: response.status,
  };
}

async function requestMetadataHtml(url: string, timeoutMs: number): Promise<{
  readonly html: string;
  readonly finalUrl: string;
  readonly statusCode: number;
}> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const firstResponse = await readMetadataHtmlResponse(url, controller.signal);
    const clientRedirectUrl = resolveClientRedirectUrl(firstResponse.html, firstResponse.finalUrl);

    if (clientRedirectUrl === null || clientRedirectUrl === firstResponse.finalUrl) {
      return firstResponse;
    }

    return await readMetadataHtmlResponse(clientRedirectUrl, controller.signal);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function extractMetadataResult(
  requestedUrl: string,
  finalUrl: string,
  statusCode: number,
  html: string,
): UrlMetadataResult {
  const title = pickMetadataText([
    extractMetaContent(html, 'property', 'og:title'),
    extractMetaContent(html, 'name', 'twitter:title'),
    extractTitle(html),
  ]);
  const description = pickMetadataText([
    extractMetaContent(html, 'property', 'og:description'),
    extractMetaContent(html, 'name', 'description'),
    extractMetaContent(html, 'name', 'twitter:description'),
  ]);
  const siteName = pickMetadataText([
    extractMetaContent(html, 'property', 'og:site_name'),
    extractMetaContent(html, 'name', 'application-name'),
  ]);
  const image = resolveUrlReference(
    pickMetadataText([
      extractMetaContent(html, 'property', 'og:image'),
      extractMetaContent(html, 'name', 'twitter:image'),
    ]),
    finalUrl,
  );
  const favicon = resolveUrlReference(extractFaviconHref(html), finalUrl) ?? resolveFallbackFavicon(finalUrl);

  return {
    url: requestedUrl,
    finalUrl,
    status: 'ok',
    statusCode,
    title,
    description,
    siteName,
    image,
    favicon,
    previewHtml: createPreviewHtml(finalUrl, html, title, description),
    errorMessage: null,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

export class MainProcessUrlMetadataService implements UrlMetadataService {
  private readonly cache = new Map<string, CachedUrlMetadataResult>();

  public async fetch(url: string, options: UrlMetadataRequestOptions = {}): Promise<UrlMetadataResult> {
    const normalizedUrl = normalizeMetadataUrl(url);

    if (normalizedUrl === null) {
      return createErrorMetadataResult(url, '仅支持 http 或 https URL。');
    }

    const now = Date.now();
    const cached = this.cache.get(normalizedUrl) ?? null;

    if (cached !== null && options.forceRefresh !== true && cached.expiresAt > now) {
      return {
        ...cached.result,
        cached: true,
      };
    }

    try {
      const response = await requestMetadataHtml(
        normalizedUrl,
        options.timeoutMs ?? URL_METADATA_DEFAULT_TIMEOUT_MS,
      );
      const result = extractMetadataResult(
        normalizedUrl,
        response.finalUrl,
        response.statusCode,
        response.html,
      );
      this.cache.set(normalizedUrl, {
        result,
        expiresAt: now + URL_METADATA_CACHE_TTL_MS,
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const result = createErrorMetadataResult(normalizedUrl, errorMessage);
      this.cache.set(normalizedUrl, {
        result,
        expiresAt: now + URL_METADATA_CACHE_TTL_MS,
      });
      return result;
    }
  }

  public clearCache(url?: string): void {
    if (url === undefined) {
      this.cache.clear();
      return;
    }

    const normalizedUrl = normalizeMetadataUrl(url);

    if (normalizedUrl === null) {
      return;
    }

    this.cache.delete(normalizedUrl);
  }
}
