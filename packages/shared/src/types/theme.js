"use strict";
/**
 * 主题系统共享类型
 * 用于主进程和渲染进程之间的 IPC 通信
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_CHANNELS = void 0;
/**
 * 主题 IPC 通道名称
 */
exports.THEME_CHANNELS = {
    // 查询操作
    GET_ALL_THEMES: 'theme:get-all-themes',
    GET_THEME: 'theme:get-theme',
    GET_THEME_LIST: 'theme:get-theme-list',
    GET_CURRENT_THEME: 'theme:get-current-theme',
    GET_THEME_CONFIG: 'theme:get-theme-config',
    GET_LATEST_USER_THEME_FILE: 'theme:getLatestUserThemeFile',
    GET_THEME_OVERRIDE: 'theme:get-override',
    // 设置操作
    SET_THEME: 'theme:set-theme',
    SET_CUSTOM_COLORS: 'theme:set-custom-colors',
    // 主题管理
    SAVE_THEME: 'theme:save',
    SAVE_OVERRIDE: 'theme:save-override',
    DELETE_THEME: 'theme:delete-theme',
    DELETE_OVERRIDE: 'theme:delete-override',
    // 事件通知（主进程 -> 渲染进程）
    THEME_CHANGED: 'theme:theme-changed',
    THEME_LIST_UPDATED: 'theme:theme-list-updated',
};
//# sourceMappingURL=theme.js.map