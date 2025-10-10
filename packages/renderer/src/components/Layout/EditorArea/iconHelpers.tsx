/**
 * 图标辅助函数 - 提供 SVG 图标字符串
 * 
 * 功能描述：
 * - 提供纯 SVG 字符串图标（不依赖图标库）
 * - 用于在非 React 环境（如 AIZoneWidget）中使用图标
 */

/**
 * 获取 Send 图标的 SVG HTML 字符串
 * @param className - 可选的 CSS 类名
 * @returns SVG HTML 字符串
 */
export function getSendIconSvg(className?: string): string {
  return `<svg class="${className || ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>`;
}

/**
 * 获取 X (关闭) 图标的 SVG HTML 字符串
 * @param className - 可选的 CSS 类名
 * @returns SVG HTML 字符串
 */
export function getCloseIconSvg(className?: string): string {
  return `<svg class="${className || ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;
}

