/**
 * SVG 图标辅助函数
 * 功能：为非 React 的轻量输入与菜单场景提供内联 SVG 字符串
 */

/**
 * 获取发送按钮图标的 SVG HTML 字符串。
 */
export function getSendIconSvg(className?: string): string {
  return `<svg class="${className || ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g fill="none">
      <path d="M10 14L21 3"></path>
      <path d="M21 3l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3"></path>
    </g>
  </svg>`;
}

/**
 * 获取关闭按钮图标的 SVG HTML 字符串。
 */
export function getCloseIconSvg(className?: string): string {
  return `<svg class="${className || ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`;
}