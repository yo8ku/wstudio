/**
 * 跨平台 UUID 生成工具
 * 在浏览器中使用 Web Crypto API，在 Node.js 中使用 crypto 模块
 */

/**
 * 生成 UUID v4
 * @returns UUID 字符串
 */
export function generateUUID(): string {
  // 检查是否在浏览器环境中
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  
  // 检查是否有全局 crypto（Node.js 或现代浏览器）
  if (typeof globalThis !== 'undefined' && globalThis.crypto && (globalThis.crypto as any).randomUUID) {
    return (globalThis.crypto as any).randomUUID();
  }
  
  // 回退方案：手动生成 UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
