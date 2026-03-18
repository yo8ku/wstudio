import {
  DEFAULT_WORKBENCH_BACKGROUND_SETTINGS,
  type WorkbenchBackgroundImageFit,
  type WorkbenchBackgroundSettings,
} from '@note-studio/shared';

interface PartialWorkbenchBackgroundSettings {
  enabled?: boolean;
  imagePath?: string;
  opacity?: number;
  blur?: number;
  fit?: WorkbenchBackgroundImageFit;
}

const clampNumber = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

export const normalizeWorkbenchBackgroundSettings = (
  value?: PartialWorkbenchBackgroundSettings
): WorkbenchBackgroundSettings => {
  const fit = value?.fit;
  const normalizedFit: WorkbenchBackgroundImageFit =
    fit === 'contain' || fit === 'auto' ? fit : DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.fit;

  return {
    enabled: value?.enabled ?? DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.enabled,
    imagePath: value?.imagePath?.trim() ?? DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.imagePath,
    opacity: Number.isFinite(value?.opacity)
      ? clampNumber(value?.opacity ?? DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.opacity, 0, 1)
      : DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.opacity,
    blur: Number.isFinite(value?.blur)
      ? clampNumber(value?.blur ?? DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.blur, 0, 24)
      : DEFAULT_WORKBENCH_BACKGROUND_SETTINGS.blur,
    fit: normalizedFit,
  };
};

export const toWorkbenchBackgroundImageUrl = (filePath: string): string => {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) {
    return '';
  }

  const normalizedPath = trimmedPath.replace(/\\/g, '/');
  const resolvedPath = /^[A-Za-z]:\//.test(normalizedPath)
    ? `/${normalizedPath}`
    : normalizedPath.startsWith('/')
      ? normalizedPath
      : `/${normalizedPath}`;

  return `local-file://${encodeURI(resolvedPath)}`;
};
