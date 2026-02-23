/**
 * System Prompt 加载服务
 * 功能：从 md 文件动态加载 System Prompt 内容
 * 描述：支持内联聊天（AI-Zone）、表格设计器等场景的 System Prompt 管理
 * 所有提示词统一从 .md 文件加载，代码中不保留任何硬编码提示词
 */

// 缓存已加载的 System Prompt 内容
let cachedGeneralChatPrompt: string | null = null;
let cachedRagSystemPrompt: string | null = null;
let cachedTableDesignerPrompt: string | null = null;
let cachedTableQueryPrompt: string | null = null;
let cachedTableUpdatePrompt: string | null = null;
let cachedTableDeletePrompt: string | null = null;

/**
 * 从 .md 文件加载提示词的通用方法
 */
async function loadPromptFromFile(filename: string): Promise<string> {
  try {
    const response = await fetch(new URL(`./${filename}`, import.meta.url));
    if (response.ok) {
      return await response.text();
    }
  } catch (error) {
    console.warn(`[SystemPrompt] 从文件加载提示词失败: ${filename}`, error);
  }
  return '';
}

/**
 * 清除缓存，强制下次重新加载
 */
export function clearSystemPromptCache(): void {
  cachedGeneralChatPrompt = null;
  cachedRagSystemPrompt = null;
  cachedTableDesignerPrompt = null;
  cachedTableQueryPrompt = null;
  cachedTableUpdatePrompt = null;
  cachedTableDeletePrompt = null;
}

// ==================== 普通对话提示词 ====================

async function loadGeneralChatPrompt(): Promise<string> {
  if (cachedGeneralChatPrompt !== null) return cachedGeneralChatPrompt;
  cachedGeneralChatPrompt = await loadPromptFromFile('../../../../../../prompts/chat/general.md');
  return cachedGeneralChatPrompt;
}

// ==================== RAG 提示词 ====================

async function loadRagSystemPrompt(): Promise<string> {
  if (cachedRagSystemPrompt !== null) return cachedRagSystemPrompt;
  cachedRagSystemPrompt = await loadPromptFromFile('../../../../../../prompts/chat/ai-zone-rag.md');
  return cachedRagSystemPrompt;
}

// ==================== 表格相关提示词 ====================

async function loadTableDesignerPrompt(): Promise<string> {
  if (cachedTableDesignerPrompt !== null) return cachedTableDesignerPrompt;
  cachedTableDesignerPrompt = await loadPromptFromFile('../../../../../../prompts/table/designer.md');
  return cachedTableDesignerPrompt;
}

async function loadTableQueryPrompt(): Promise<string> {
  if (cachedTableQueryPrompt !== null) return cachedTableQueryPrompt;
  cachedTableQueryPrompt = await loadPromptFromFile('../../../../../../prompts/table/query.md');
  return cachedTableQueryPrompt;
}

async function loadTableUpdatePrompt(): Promise<string> {
  if (cachedTableUpdatePrompt !== null) return cachedTableUpdatePrompt;
  cachedTableUpdatePrompt = await loadPromptFromFile('../../../../../../prompts/table/update.md');
  return cachedTableUpdatePrompt;
}

async function loadTableDeletePrompt(): Promise<string> {
  if (cachedTableDeletePrompt !== null) return cachedTableDeletePrompt;
  cachedTableDeletePrompt = await loadPromptFromFile('../../../../../../prompts/table/delete.md');
  return cachedTableDeletePrompt;
}

// ==================== 对外导出：表格设计器 ====================

export async function getTableDesignerSystemPromptAsync(): Promise<string> {
  return await loadTableDesignerPrompt();
}

export function getTableDesignerSystemPrompt(): string {
  if (cachedTableDesignerPrompt !== null) return cachedTableDesignerPrompt;
  loadTableDesignerPrompt().catch(console.error);
  return '';
}

// ==================== 对外导出：表格查询 ====================

export async function getTableQuerySystemPromptAsync(): Promise<string> {
  return await loadTableQueryPrompt();
}

export function getTableQuerySystemPrompt(): string {
  if (cachedTableQueryPrompt !== null) return cachedTableQueryPrompt;
  loadTableQueryPrompt().catch(console.error);
  return '';
}

// ==================== 对外导出：表格更新 ====================

export async function getTableUpdateSystemPromptAsync(): Promise<string> {
  return await loadTableUpdatePrompt();
}

export function getTableUpdateSystemPrompt(): string {
  if (cachedTableUpdatePrompt !== null) return cachedTableUpdatePrompt;
  loadTableUpdatePrompt().catch(console.error);
  return '';
}

// ==================== 对外导出：表格删除 ====================

export async function getTableDeleteSystemPromptAsync(): Promise<string> {
  return await loadTableDeletePrompt();
}

export function getTableDeleteSystemPrompt(): string {
  if (cachedTableDeletePrompt !== null) return cachedTableDeletePrompt;
  loadTableDeletePrompt().catch(console.error);
  return '';
}

// ==================== 对外导出：AI-Zone ====================

/**
 * 获取 AI-Zone 的 System Prompt（异步版本）
 * @param hasRagContext 是否有 RAG 上下文（@文件引用）
 */
export async function getAIZoneSystemPromptAsync(
  hasRagContext: boolean
): Promise<string> {
  if (hasRagContext) {
    return await loadRagSystemPrompt();
  }
  return await loadGeneralChatPrompt();
}

/**
 * 获取 AI-Zone 的 System Prompt（同步版本，使用缓存）
 * @param hasRagContext 是否有 RAG 上下文（@文件引用）
 */
export function getAIZoneSystemPrompt(
  hasRagContext: boolean
): string {
  if (hasRagContext) {
    if (cachedRagSystemPrompt !== null) return cachedRagSystemPrompt;
    loadRagSystemPrompt().catch(console.error);
    return '';
  }
  if (cachedGeneralChatPrompt !== null) return cachedGeneralChatPrompt;
  loadGeneralChatPrompt().catch(console.error);
  return '';
}
