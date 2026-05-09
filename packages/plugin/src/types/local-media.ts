/**
 * Plugin-safe local media URL helpers exposed to third-party plugin authors.
 */

export const LOCAL_MEDIA_PROTOCOL_SCHEME = 'local-media';
export const LOCAL_MEDIA_PROTOCOL_PREFIX = `${LOCAL_MEDIA_PROTOCOL_SCHEME}://`;
export const LOCAL_MEDIA_PROTOCOL_ROOT_PREFIX = `${LOCAL_MEDIA_PROTOCOL_PREFIX}/`;

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeLocalMediaPath(sourcePath: string): string {
  const trimmedSourcePath = sourcePath.trim();

  if (trimmedSourcePath.length === 0) {
    return '';
  }

  if (/^local-media:\/\//i.test(trimmedSourcePath)) {
    return trimmedSourcePath;
  }

  let pathValue = trimmedSourcePath;

  if (/^file:\/\//i.test(pathValue)) {
    try {
      const parsedUrl = new URL(pathValue);
      pathValue = parsedUrl.pathname;
    } catch {
      pathValue = pathValue.replace(/^file:\/\/\/?/i, '/');
    }
  } else if (/^local-file:\/\//i.test(pathValue)) {
    pathValue = pathValue.replace(/^local-file:\/\/\/?/i, '/');
  }

  const normalizedPath = pathValue.replace(/\\/g, '/');
  const decodedPath = normalizedPath
    .split('/')
    .map((segment) => decodePathSegment(segment))
    .join('/');

  if (/^\/[A-Za-z]:/.test(decodedPath)) {
    return decodedPath;
  }

  if (/^[A-Za-z]:/.test(decodedPath)) {
    return `/${decodedPath}`;
  }

  if (decodedPath.startsWith('/')) {
    return decodedPath;
  }

  return `/${decodedPath.replace(/^\/+/, '')}`;
}

export function toLocalMediaUrl(sourcePath: string): string {
  const normalizedPath = normalizeLocalMediaPath(sourcePath);

  if (normalizedPath.length === 0 || /^local-media:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  const encodedPath = normalizedPath
    .split('/')
    .map((segment, index) => {
      if (segment.length === 0) {
        return index === 0 ? '' : segment;
      }

      return /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment);
    })
    .join('/');

  return `${LOCAL_MEDIA_PROTOCOL_PREFIX}${encodedPath}`;
}
