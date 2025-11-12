"use strict";
/**
 * 插件系统 - UI类型定义
 * 定义UI系统的接口、组件类型等
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationType = exports.UIPosition = exports.UIComponentType = void 0;
/**
 * UI组件类型
 */
var UIComponentType;
(function (UIComponentType) {
    /** 侧边栏 */
    UIComponentType["Sidebar"] = "sidebar";
    /** 面板 */
    UIComponentType["Panel"] = "panel";
    /** 状态栏 */
    UIComponentType["StatusBar"] = "statusbar";
    /** 菜单 */
    UIComponentType["Menu"] = "menu";
    /** 工具栏 */
    UIComponentType["Toolbar"] = "toolbar";
    /** 对话框 */
    UIComponentType["Dialog"] = "dialog";
    /** 通知 */
    UIComponentType["Notification"] = "notification";
    /** Webview */
    UIComponentType["Webview"] = "webview";
})(UIComponentType || (exports.UIComponentType = UIComponentType = {}));
/**
 * UI组件位置
 */
var UIPosition;
(function (UIPosition) {
    /** 左侧 */
    UIPosition["Left"] = "left";
    /** 右侧 */
    UIPosition["Right"] = "right";
    /** 顶部 */
    UIPosition["Top"] = "top";
    /** 底部 */
    UIPosition["Bottom"] = "bottom";
    /** 中心 */
    UIPosition["Center"] = "center";
})(UIPosition || (exports.UIPosition = UIPosition = {}));
/**
 * 通知类型
 */
var NotificationType;
(function (NotificationType) {
    /** 信息 */
    NotificationType["Info"] = "info";
    /** 警告 */
    NotificationType["Warning"] = "warning";
    /** 错误 */
    NotificationType["Error"] = "error";
    /** 成功 */
    NotificationType["Success"] = "success";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
//# sourceMappingURL=ui.js.map