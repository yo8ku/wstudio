/**
 * Shared workbench background settings.
 */

export type WorkbenchBackgroundImageFit = 'cover' | 'contain' | 'auto';

export interface WorkbenchBackgroundSettings {
  enabled: boolean;
  imagePath: string;
  opacity: number;
  blur: number;
  fit: WorkbenchBackgroundImageFit;
}

export const DEFAULT_WORKBENCH_BACKGROUND_SETTINGS: WorkbenchBackgroundSettings = {
  enabled: false,
  imagePath: '',
  opacity: 0.5,
  blur: 0,
  fit: 'cover',
};
