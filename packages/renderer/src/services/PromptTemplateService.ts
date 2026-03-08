/**
 * PromptTemplateService
 * 功能：管理 AI 提示词模板（持久化、读取、同步事件）。
 */

import { electronStore } from './ElectronStoreService';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptTemplatesUpdatedDetail {
  source?: string;
  updatedAt: number;
}

export const PROMPT_TEMPLATE_STORE_KEY = 'ai-chat-prompt-templates';
export const PROMPT_TEMPLATES_UPDATED_EVENT = 'prompt-templates-updated';

const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'doc-summary',
    name: '文档摘要',
    content: '请为以下文档生成摘要：\n\n',
    description: '快速提炼文档核心信息。',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'doc-translate',
    name: '文档翻译',
    content: '请将以下文档翻译成中文：\n\n',
    description: '将输入内容翻译为中文。',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'summarize',
    name: '总结',
    content: '请总结以下内容：\n\n',
    description: '用于总结段落、笔记或长文本。',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'rewrite',
    name: '重写',
    content: '请重写以下内容，使其更加清晰和易读：\n\n',
    description: '保持原意前提下优化表达。',
    createdAt: 0,
    updatedAt: 0,
  },
];

const sanitizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeStoredPromptTemplates = (value: unknown): PromptTemplate[] => {
  if (!Array.isArray(value)) return [];

  const normalized: PromptTemplate[] = [];
  const seenIds = new Set<string>();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;

    const item = rawItem as Record<string, unknown>;
    const id = sanitizeText(item.id);
    const name = sanitizeText(item.name);
    const content = sanitizeText(item.content);
    const description = sanitizeText(item.description);

    if (!id || !name || !content || seenIds.has(id)) continue;

    const now = Date.now();
    const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
      ? item.createdAt
      : now;
    const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
      ? item.updatedAt
      : createdAt;

    normalized.push({
      id,
      name,
      content,
      description,
      createdAt,
      updatedAt,
    });
    seenIds.add(id);
  }

  return normalized;
};

export const clonePromptTemplate = (template: PromptTemplate): PromptTemplate => ({ ...template });

export const clonePromptTemplates = (templates: PromptTemplate[]): PromptTemplate[] =>
  templates.map(clonePromptTemplate);

export const createPromptTemplateId = (seed: string): string =>
  `prompt-${hashText(`${seed}|${Date.now().toString()}`)}`;

export const createDefaultPromptTemplates = (): PromptTemplate[] => {
  const now = Date.now();
  return DEFAULT_PROMPT_TEMPLATES.map(template => ({
    ...template,
    createdAt: now,
    updatedAt: now,
  }));
};

export const arePromptTemplatesEqual = (
  left: PromptTemplate[],
  right: PromptTemplate[],
): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (
      l.id !== r.id
      || l.name !== r.name
      || l.content !== r.content
      || l.description !== r.description
      || l.createdAt !== r.createdAt
      || l.updatedAt !== r.updatedAt
    ) {
      return false;
    }
  }
  return true;
};

export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  const hasStoredTemplates = await electronStore.has(PROMPT_TEMPLATE_STORE_KEY);
  if (!hasStoredTemplates) {
    return createDefaultPromptTemplates();
  }

  const storedTemplates = await electronStore.get(PROMPT_TEMPLATE_STORE_KEY);
  return normalizeStoredPromptTemplates(storedTemplates);
}

export async function getPromptTemplateById(id: string): Promise<PromptTemplate | undefined> {
  const templateId = id.trim();
  if (!templateId) return undefined;

  const templates = await getPromptTemplates();
  return templates.find(template => template.id === templateId);
}

export async function savePromptTemplates(
  templates: PromptTemplate[],
  source: string,
): Promise<boolean> {
  const normalizedTemplates = normalizeStoredPromptTemplates(templates);
  const success = await electronStore.set(PROMPT_TEMPLATE_STORE_KEY, normalizedTemplates);
  if (!success) return false;

  window.dispatchEvent(new CustomEvent<PromptTemplatesUpdatedDetail>(PROMPT_TEMPLATES_UPDATED_EVENT, {
    detail: {
      source,
      updatedAt: Date.now(),
    },
  }));
  return true;
}

