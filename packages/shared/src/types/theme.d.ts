/**
 * 主题系统共享类型
 * 用于主进程和渲染进程之间的 IPC 通信
 */
/**
 * 主题信息（传输用）
 */
export interface ThemeInfo {
    id: string;
    name: string;
    type: 'light' | 'dark' | 'hc' | 'hcLight';
    author?: string;
    description?: string;
    source?: 'builtin' | 'user' | 'market';
    isFavorite?: boolean;
    lastUsedAt?: number;
}
/**
 * 完整主题数据（传输用）
 */
export interface ThemeData {
    id: string;
    name: string;
    type: 'light' | 'dark' | 'hc' | 'hcLight';
    author?: string;
    description?: string;
    version?: string;
    colors: Record<string, string>;
    tokenColors: Array<{
        name?: string;
        scope: string[];
        settings: {
            foreground?: string;
            background?: string;
            fontStyle?: string;
        };
    }>;
    semanticHighlighting?: boolean;
    semanticTokenColors?: Record<string, string | Record<string, string>>;
    source?: 'builtin' | 'user' | 'market';
    isBuiltin?: boolean;
    isFavorite?: boolean;
    usageCount?: number;
    lastUsedAt?: number;
    createdAt?: number;
    updatedAt?: number;
    originalPath?: string;
}
/**
 * 主题配置（传输用）
 */
export interface ThemeConfigData {
    activeThemeId?: string;
    customColors?: Record<string, string>;
    recentThemes?: string[];
    favoriteThemes?: string[];
}
/**
 * 主题 IPC 通道名称
 */
export declare const THEME_CHANNELS: {
    readonly GET_ALL_THEMES: "theme:get-all-themes";
    readonly GET_THEME: "theme:get-theme";
    readonly GET_THEME_LIST: "theme:get-theme-list";
    readonly GET_CURRENT_THEME: "theme:get-current-theme";
    readonly GET_THEME_CONFIG: "theme:get-theme-config";
    readonly GET_LATEST_USER_THEME_FILE: "theme:getLatestUserThemeFile";
    readonly GET_THEME_OVERRIDE: "theme:get-override";
    readonly SET_THEME: "theme:set-theme";
    readonly SET_CUSTOM_COLORS: "theme:set-custom-colors";
    readonly SAVE_THEME: "theme:save";
    readonly SAVE_OVERRIDE: "theme:save-override";
    readonly DELETE_THEME: "theme:delete-theme";
    readonly DELETE_OVERRIDE: "theme:delete-override";
    readonly THEME_CHANGED: "theme:theme-changed";
    readonly THEME_LIST_UPDATED: "theme:theme-list-updated";
};
/**
 * 设置主题的参数
 */
export interface SetThemeParams {
    themeId: string;
    customColors?: Record<string, string>;
}
/**
 * 主题覆盖数据
 */
export interface ThemeOverrideData {
    baseThemeId: string;
    colors: Record<string, string>;
}
//# sourceMappingURL=theme.d.ts.map