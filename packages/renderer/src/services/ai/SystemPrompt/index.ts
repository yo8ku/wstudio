/**
 * System Prompt 加载服务
 * 功能：从 Markdown 文件加载对话与表格相关的系统提示词
 * 描述：统一管理通用聊天、带引用聊天和表格场景的系统提示词缓存
 */

const GENERAL_CHAT_PROMPT_PATH = '../../../../../../prompts/chat/general.md';
const RAG_CHAT_PROMPT_PATH = '../../../../../../prompts/chat/ai-zone-rag.md';
const TABLE_DESIGNER_PROMPT_PATH = '../../../../../../prompts/table/designer.md';
const TABLE_QUERY_PROMPT_PATH = '../../../../../../prompts/table/query.md';
const TABLE_UPDATE_PROMPT_PATH = '../../../../../../prompts/table/update.md';
const TABLE_DELETE_PROMPT_PATH = '../../../../../../prompts/table/delete.md';

let cachedGeneralChatPrompt: string | null = null;
let cachedRagSystemPrompt: string | null = null;
let cachedTableDesignerPrompt: string | null = null;
let cachedTableQueryPrompt: string | null = null;
let cachedTableUpdatePrompt: string | null = null;
let cachedTableDeletePrompt: string | null = null;

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

export function clearSystemPromptCache(): void {
  cachedGeneralChatPrompt = null;
  cachedRagSystemPrompt = null;
  cachedTableDesignerPrompt = null;
  cachedTableQueryPrompt = null;
  cachedTableUpdatePrompt = null;
  cachedTableDeletePrompt = null;
}

async function loadGeneralChatPrompt(): Promise<string> {
  if (cachedGeneralChatPrompt !== null) {
    return cachedGeneralChatPrompt;
  }

  cachedGeneralChatPrompt = await loadPromptFromFile(GENERAL_CHAT_PROMPT_PATH);
  return cachedGeneralChatPrompt;
}

async function loadRagSystemPrompt(): Promise<string> {
  if (cachedRagSystemPrompt !== null) {
    return cachedRagSystemPrompt;
  }

  cachedRagSystemPrompt = await loadPromptFromFile(RAG_CHAT_PROMPT_PATH);
  return cachedRagSystemPrompt;
}

async function loadTableDesignerPrompt(): Promise<string> {
  if (cachedTableDesignerPrompt !== null) {
    return cachedTableDesignerPrompt;
  }

  cachedTableDesignerPrompt = await loadPromptFromFile(TABLE_DESIGNER_PROMPT_PATH);
  return cachedTableDesignerPrompt;
}

async function loadTableQueryPrompt(): Promise<string> {
  if (cachedTableQueryPrompt !== null) {
    return cachedTableQueryPrompt;
  }

  cachedTableQueryPrompt = await loadPromptFromFile(TABLE_QUERY_PROMPT_PATH);
  return cachedTableQueryPrompt;
}

async function loadTableUpdatePrompt(): Promise<string> {
  if (cachedTableUpdatePrompt !== null) {
    return cachedTableUpdatePrompt;
  }

  cachedTableUpdatePrompt = await loadPromptFromFile(TABLE_UPDATE_PROMPT_PATH);
  return cachedTableUpdatePrompt;
}

async function loadTableDeletePrompt(): Promise<string> {
  if (cachedTableDeletePrompt !== null) {
    return cachedTableDeletePrompt;
  }

  cachedTableDeletePrompt = await loadPromptFromFile(TABLE_DELETE_PROMPT_PATH);
  return cachedTableDeletePrompt;
}

export async function getTableDesignerSystemPromptAsync(): Promise<string> {
  return loadTableDesignerPrompt();
}

export function getTableDesignerSystemPrompt(): string {
  if (cachedTableDesignerPrompt !== null) {
    return cachedTableDesignerPrompt;
  }

  void loadTableDesignerPrompt();
  return '';
}

export async function getTableQuerySystemPromptAsync(): Promise<string> {
  return loadTableQueryPrompt();
}

export function getTableQuerySystemPrompt(): string {
  if (cachedTableQueryPrompt !== null) {
    return cachedTableQueryPrompt;
  }

  void loadTableQueryPrompt();
  return '';
}

export async function getTableUpdateSystemPromptAsync(): Promise<string> {
  return loadTableUpdatePrompt();
}

export function getTableUpdateSystemPrompt(): string {
  if (cachedTableUpdatePrompt !== null) {
    return cachedTableUpdatePrompt;
  }

  void loadTableUpdatePrompt();
  return '';
}

export async function getTableDeleteSystemPromptAsync(): Promise<string> {
  return loadTableDeletePrompt();
}

export function getTableDeleteSystemPrompt(): string {
  if (cachedTableDeletePrompt !== null) {
    return cachedTableDeletePrompt;
  }

  void loadTableDeletePrompt();
  return '';
}

/**
 * 获取 AI 聊天系统提示词的异步版本。
 * 有上下文引用时返回 RAG 提示词，否则返回通用聊天提示词。
 */
export async function getAssistantChatSystemPromptAsync(
  hasRagContext: boolean
): Promise<string> {
  if (hasRagContext) {
    return loadRagSystemPrompt();
  }

  return loadGeneralChatPrompt();
}

/**
 * 获取 AI 聊天系统提示词的同步缓存版本。
 * 首次调用会触发后台加载，返回空字符串直到缓存准备完成。
 */
export function getAssistantChatSystemPrompt(
  hasRagContext: boolean
): string {
  if (hasRagContext) {
    if (cachedRagSystemPrompt !== null) {
      return cachedRagSystemPrompt;
    }

    void loadRagSystemPrompt();
    return '';
  }

  if (cachedGeneralChatPrompt !== null) {
    return cachedGeneralChatPrompt;
  }

  void loadGeneralChatPrompt();
  return '';
}