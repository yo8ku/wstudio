/**
 * AI 响应渲染器导出
 */

export { AIResponseRenderer } from './AIResponseRenderer';
export type { AIResponseRendererProps } from './AIResponseRenderer';

// 重新导出格式化工具
export {
  AIResponseFormatter,
  formatAIResponse,
  formatAIResponseToPlainText,
  defaultFormatter,
} from '@/utils/aiResponseFormatter';

export type { FormatOptions } from '@/utils/aiResponseFormatter';

