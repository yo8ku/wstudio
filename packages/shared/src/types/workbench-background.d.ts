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
export declare const DEFAULT_WORKBENCH_BACKGROUND_SETTINGS: WorkbenchBackgroundSettings;
//# sourceMappingURL=workbench-background.d.ts.map