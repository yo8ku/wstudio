/**
 * File tree display helpers.
 * Resolves the visible file name and the optional suffix badge shown in the explorer tree.
 */

export interface FileTreeDisplayMeta {
  readonly displayName: string;
  readonly extensionBadge: string | null;
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx']);
const CANVAS_EXTENSIONS = new Set(['canvas', 'canvs']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);

function splitFileExtension(fileName: string): { readonly displayName: string; readonly extension: string | null } {
  const extensionIndex = fileName.lastIndexOf('.');

  if (extensionIndex <= 0 || extensionIndex >= fileName.length - 1) {
    return {
      displayName: fileName,
      extension: null,
    };
  }

  return {
    displayName: fileName.slice(0, extensionIndex),
    extension: fileName.slice(extensionIndex + 1).toLowerCase(),
  };
}

function resolveExtensionBadge(extension: string): string | null {
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return null;
  }

  if (CANVAS_EXTENSIONS.has(extension)) {
    return 'canvas';
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }

  return extension;
}

export function getFileTreeDisplayMeta(fileName: string): FileTreeDisplayMeta {
  const normalizedName = fileName.trim();
  if (!normalizedName) {
    return {
      displayName: fileName,
      extensionBadge: null,
    };
  }

  const { displayName, extension } = splitFileExtension(normalizedName);
  if (!extension) {
    return {
      displayName: normalizedName,
      extensionBadge: null,
    };
  }

  return {
    displayName,
    extensionBadge: resolveExtensionBadge(extension),
  };
}
