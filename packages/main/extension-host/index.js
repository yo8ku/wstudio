"use strict";
/**
 * 扩展宿主进程入口
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ExtensionHostMain_1 = require("./ExtensionHostMain");
const host = new ExtensionHostMain_1.ExtensionHostMain();
process.on('message', (message) => {
    host.handleMessage(message);
});
process.on('disconnect', () => {
    console.log('[ExtensionHost] 父进程断开连接');
    process.exit(0);
});
host.initialize().then(() => {
    console.log('[ExtensionHost] 宿主进程已初始化');
}).catch(error => {
    console.error('[ExtensionHost] 初始化失败:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map