"use strict";
/**
 * 插件 contribution 契约定义。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_EXTENSION_CONTRIBUTES = exports.EMPTY_AI_PANEL_CONTRIBUTES = exports.SETTING_VALUE_TYPES = exports.MENU_LOCATIONS = void 0;
exports.MENU_LOCATIONS = [
    'commandPalette',
    'editor/context',
    'note/context',
    'statusBar',
    'sidebar/title',
];
exports.SETTING_VALUE_TYPES = ['string', 'number', 'boolean', 'select'];
exports.EMPTY_AI_PANEL_CONTRIBUTES = {};
exports.EMPTY_EXTENSION_CONTRIBUTES = {
    aiPanel: exports.EMPTY_AI_PANEL_CONTRIBUTES,
};
//# sourceMappingURL=contributes.js.map