import {
  DEFAULT_WORKBENCH_FILE_ICON_THEME_ID,
  type WorkbenchFileIconThemeEntry,
} from '@note-studio/shared';

interface WorkspaceFileIconThemeStateSnapshot {
  readonly themes: readonly WorkbenchFileIconThemeEntry[];
  readonly activeThemeId: string;
  readonly revision: number;
}

interface NormalizedWorkspaceFileIconThemeMapping {
  readonly icon: string;
  readonly extensions: readonly string[];
  readonly fileNames: readonly string[];
}

interface NormalizedWorkspaceFileIconTheme {
  readonly id: string;
  readonly file: string;
  readonly directory: string;
  readonly directoryExpanded: string | null;
  readonly mappings: readonly NormalizedWorkspaceFileIconThemeMapping[];
}

export interface WorkspaceFileIconResolveRequest {
  readonly filePath?: string | null;
  readonly name: string;
  readonly isDirectory: boolean;
  readonly expanded?: boolean;
}

let snapshot: WorkspaceFileIconThemeStateSnapshot = {
  themes: [],
  activeThemeId: DEFAULT_WORKBENCH_FILE_ICON_THEME_ID,
  revision: 0,
};

let activeTheme: NormalizedWorkspaceFileIconTheme | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  snapshot = {
    ...snapshot,
    revision: snapshot.revision + 1,
  };

  for (const listener of listeners) {
    listener();
  }
}

function normalizeExtension(value: string): string {
  return value.trim().toLowerCase().replace(/^\./, '');
}

function normalizeFileName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTheme(
  theme: WorkbenchFileIconThemeEntry,
): NormalizedWorkspaceFileIconTheme {
  return {
    id: theme.id,
    file: theme.file,
    directory: theme.directory,
    directoryExpanded: theme.directoryExpanded,
    mappings: theme.mappings.map((mapping) => ({
      icon: mapping.icon,
      extensions: mapping.extensions
        .map(normalizeExtension)
        .filter((value) => value.length > 0),
      fileNames: mapping.fileNames
        .map(normalizeFileName)
        .filter((value) => value.length > 0),
      })),
  };
}

function resolveThemeById(themeId: string): NormalizedWorkspaceFileIconTheme | null {
  const theme = snapshot.themes.find((entry) => entry.id === themeId) ?? null;
  return theme === null ? null : normalizeTheme(theme);
}

function resolveActiveTheme(): NormalizedWorkspaceFileIconTheme | null {
  return resolveThemeById(snapshot.activeThemeId)
    ?? resolveThemeById(DEFAULT_WORKBENCH_FILE_ICON_THEME_ID);
}

function refreshActiveTheme(): void {
  activeTheme = resolveActiveTheme();
}

function getResolvedFileName(request: WorkspaceFileIconResolveRequest): string {
  if (request.filePath && request.filePath.trim().length > 0) {
    const segments = request.filePath.split(/[/\\]/).filter((segment) => segment.length > 0);
    const lastSegment = segments[segments.length - 1];

    if (lastSegment) {
      return lastSegment;
    }
  }

  return request.name;
}

function getResolvedFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) {
    return '';
  }

  return normalizeExtension(fileName.slice(lastDotIndex + 1));
}

export function getWorkspaceFileIconThemeSnapshot(): WorkspaceFileIconThemeStateSnapshot {
  return snapshot;
}

export function subscribeWorkspaceFileIconThemeChange(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function setWorkspaceFileIconThemes(
  themes: readonly WorkbenchFileIconThemeEntry[],
): void {
  snapshot = {
    ...snapshot,
    themes,
  };
  refreshActiveTheme();
  emitChange();
}

export function setActiveWorkspaceFileIconThemeId(themeId: string): void {
  snapshot = {
    ...snapshot,
    activeThemeId: themeId,
  };
  refreshActiveTheme();
  emitChange();
}

function resolveThemeIconSource(
  theme: NormalizedWorkspaceFileIconTheme,
  request: WorkspaceFileIconResolveRequest,
): string | null {
  if (request.isDirectory) {
    if (request.expanded && theme.directoryExpanded) {
      return theme.directoryExpanded;
    }

    return theme.directory;
  }

  const fileName = normalizeFileName(getResolvedFileName(request));
  const extension = getResolvedFileExtension(fileName);
  let extensionMatchIcon: string | null = null;

  for (const mapping of theme.mappings) {
    if (mapping.fileNames.includes(fileName)) {
      return mapping.icon;
    }

    if (extensionMatchIcon === null && extension.length > 0 && mapping.extensions.includes(extension)) {
      extensionMatchIcon = mapping.icon;
    }
  }

  return extensionMatchIcon ?? theme.file;
}

export function resolveWorkspaceFileIconSource(
  request: WorkspaceFileIconResolveRequest,
): string | null {
  if (activeTheme === null) {
    return null;
  }

  return resolveThemeIconSource(activeTheme, request);
}

export function resolveDefaultWorkspaceFileIconSource(
  request: WorkspaceFileIconResolveRequest,
): string | null {
  const defaultTheme = resolveThemeById(DEFAULT_WORKBENCH_FILE_ICON_THEME_ID);

  if (defaultTheme === null) {
    return null;
  }

  return resolveThemeIconSource(defaultTheme, request);
}

refreshActiveTheme();
