/**
 * AI 对话面板组件  - Note WStudio 2.0使用的是这个组件
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getCachedModels, getModelConfig, type CachedModelInfo } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled, loadModelEnabledStatesFromDB, type ChatMessage } from '../../../services/ai';
import { DropdownMenu, type DropdownMenuItem, type DropdownMenuGroup } from '../../common/DropdownMenu';
import { AIProviderIconFromModel } from '../../Icons/AIProviderIcon';
import { Icon } from '../../Icons/Icon';
import { EditIcon } from '../../Icons/EditIcon';
import { createPortal } from 'react-dom';
import { ChatHistory } from './ChatHistory';
import { AIChatSettings, DEFAULT_CHAT_SETTINGS, type AIChatSettingsConfig, SEARCH_ENGINES } from '../../AIChatSettings';
import { electronStore } from '../../../services/ElectronStoreService';
import { type ThinkingStep } from '../../ModeThinking';
import { AssistantTextContextMenu, type AssistantTextContextMenuProps } from './AssistantTextContextMenu';
import { AIResponseRenderer } from '../../AIResponseRenderer';
import { agentService } from '../../../services/agent/AgentService';
import { AgentState, AgentTaskType } from '../../../services/agent/types';
import { tableReferenceService, type FormDetail, type FormInfo } from '../../../services/tableReference';
import { knowledgeBaseService } from '../Sidebar/KnowledgeBase/knowledgeBaseService';
import { type KnowledgeItem } from '../Sidebar/KnowledgeBase/types';
import { toastService } from '../../../services/ToastService';
import { getAIZoneSystemPromptAsync } from '../../../services/ai/SystemPrompt';
import { TipTapInput, type TipTapInputRef } from '../EditorArea/AIZoneWidget/TipTapInput';
import './AIChatPanel.scss';

interface ToolLog {
  uiId: string;
  name: string;
  label: string;
  detail?: string;
  summary?: string;
  command?: string;
  output?: string;
  status: 'pending' | 'success' | 'error';
}

interface ActLog {
  id: string;
  ts: number;
  key?: string;
  kind: 'status' | 'step' | 'tool' | 'stream' | 'error';
  title: string;
  detail?: string;
  status: 'info' | 'pending' | 'running' | 'success' | 'error';
}

type TodoItemStatus = 'pending' | 'in_progress' | 'completed';

interface TodoItemView {
  id: string;
  content: string;
  status: TodoItemStatus;
  source: 'agent' | 'plan';
  stepId?: string;
}

/** 消息内容块：文本或工具调用 */
type ContentBlock =
  | { type: 'text'; text: string; key?: string; isStreaming?: boolean }
  | { type: 'tool'; tool: ToolLog }
  | { type: 'act'; act: ActLog }
  | { type: 'todo'; key: string; title: string; items: TodoItemView[]; isStreaming?: boolean }
  | { type: 'decomposition'; title: string; content: string; key: string; isStreaming?: boolean }
  | { type: 'thinking'; content: string; isThinking: boolean; elapsedSeconds?: number };

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;  // 保留用于兼容，最终文本
  contentBlocks?: ContentBlock[];  // 交错的内容块
  timestamp: Date;
  model?: string;
  thinkingSteps?: ThinkingStep[];
  isThinking?: boolean;
  reasoning?: string;
  toolCalls?: ToolLog[];  // 保留用于兼容
  isThinkingPhase?: boolean;
  thinkingStartTime?: number;
  elapsedSeconds?: number;
}

interface ModelInfo {
  modelId: string;
  configName: string;
  providerId: string;
  displayName?: string;
  capabilities?: {
    thinking?: boolean;
    tool_calls?: string[];
  };
}

interface AIChatPanelProps {
  onClose: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  position?: 'left' | 'right'; // 当前位置
  mode?: 'sidebar' | 'editor-tab';
}

const AI_CHAT_EDITOR_TAB_PATH = 'ai-chat:/main';

interface PendingToolConfirmation {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  detail?: string;
}

interface SlashCommandItem {
  command: string;
  description: string;
  insertText: string;
}

interface DecompositionRule {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
  builtin: boolean;
}

interface WritingRuleDocument {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;
const COLLAPSE_THRESHOLD = 250; // 小于此宽度时自动收缩
const EDITOR_AREA_MIN_WIDTH = 358; // editor-area 的最小宽度
const createActLogId = (): string =>
  `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const DECOMPOSITION_RULE_STORE_KEY = 'ai-chat-decomposition-rules';
const DECOMPOSITION_RULE_UPDATED_EVENT = 'decomposition-rules-updated';
const DECOMPOSITION_RULE_UPDATED_SOURCE = 'ai-chat-panel';
const WRITING_RULE_STORE_KEY = 'ai-chat-writing-rule-documents';
const WRITING_RULE_UPDATED_EVENT = 'writing-rules-updated';
const WRITING_RULE_UPDATED_SOURCE = 'ai-chat-panel';
const RULE_DOCUMENT_EXTENSIONS = new Set(['md', 'txt']);
const BUILTIN_DECOMPOSITION_RULES: DecompositionRule[] = [
  {
    id: 'overall-structure',
    name: '整体框架',
    instruction: '拆解主题目标、主线、信息组织与论证顺序。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'sub-headings',
    name: '小标题',
    instruction: '提取并评估标题层级、命名方式与信息覆盖是否完整。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'paragraph-layout',
    name: '段落',
    instruction: '分析段落长度、开合方式、段内逻辑与段间衔接。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'sentence-pattern',
    name: '句式',
    instruction: '识别长短句比例、并列与递进结构、节奏变化。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'word-choice',
    name: '用词',
    instruction: '提取关键词、术语密度、口语化/书面化倾向和情绪色彩。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'style-tone',
    name: '风格',
    instruction: '判断文风语气、作者立场、叙述视角与受众匹配度。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'transitions',
    name: '过渡词',
    instruction: '识别连接词和转场方式，检查逻辑跳跃与连贯性。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'scene',
    name: '场景',
    instruction: '标注时空背景、人物关系、事件触发点与情境张力。',
    enabled: true,
    builtin: true,
  },
  {
    id: 'case-evidence',
    name: '案例',
    instruction: '提取案例类型、证据强度、引用方式与论点支撑关系。',
    enabled: true,
    builtin: true,
  },
];

const cloneBuiltinDecompositionRules = (): DecompositionRule[] =>
  BUILTIN_DECOMPOSITION_RULES.map(rule => ({ ...rule }));

const getFileExtension = (filePath: string): string => {
  const normalized = filePath.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return '';
  return normalized.slice(dotIndex + 1);
};

const isSupportedRuleDocumentFile = (filePath: string): boolean =>
  RULE_DOCUMENT_EXTENSIONS.has(getFileExtension(filePath));

const buildRuleIdentityKey = (name: string, instruction: string): string =>
  `${name.trim().toLowerCase()}|${instruction.trim().toLowerCase()}`;

const normalizeComparableRuleDocumentPath = (value: string): string =>
  value.trim().replace(/\\/g, '/').toLowerCase();

const stringifyActDetail = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    const compact = JSON.stringify(value);
    if (!compact) return undefined;
    return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
  } catch {
    return String(value);
  }
};

interface VerifyGateDetailView {
  passed: boolean;
  score: number | null;
  threshold: number | null;
  issues: string[];
}

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const toSafeInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.floor(value)));
};

const extractVerifyGateDetail = (result: unknown): VerifyGateDetailView | null => {
  if (!isRecordObject(result)) return null;
  const gateRaw = result.gate;
  if (!isRecordObject(gateRaw)) return null;

  const score = toSafeInteger(gateRaw.score);
  const threshold = toSafeInteger(gateRaw.threshold);
  const passedRaw = gateRaw.passed;
  const passed = typeof passedRaw === 'boolean'
    ? passedRaw
    : (score != null && threshold != null ? score >= threshold : score != null);
  const issues = toStringList(gateRaw.issues);

  if (score == null && threshold == null && issues.length === 0 && typeof passedRaw !== 'boolean') {
    return null;
  }

  return {
    passed,
    score,
    threshold,
    issues,
  };
};

const formatVerifyGateDetail = (gate: VerifyGateDetailView): string => {
  const scorePart = gate.score != null
    ? (gate.threshold != null ? `${gate.score}/${gate.threshold}` : `${gate.score}`)
    : (gate.threshold != null ? `--/${gate.threshold}` : '--');
  if (gate.passed) {
    return `Verify gate passed. score=${scorePart}`;
  }
  const reason = gate.issues.slice(0, 3).join('；') || 'Score below threshold.';
  return `Verify gate failed. score=${scorePart}. reasons: ${reason}`;
};

const BASH_TOOL_OUTPUT_MAX_CHARS = 24000;

const normalizeBashOutput = (value: string): string =>
  value.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();

const truncateBashOutput = (value: string): string => {
  if (value.length <= BASH_TOOL_OUTPUT_MAX_CHARS) return value;
  const keep = Math.max(4000, BASH_TOOL_OUTPUT_MAX_CHARS - 120);
  return `${value.slice(0, keep)}\n\n...[truncated ${value.length - keep} chars]`;
};

const buildBashToolOutput = (result: { success: boolean; data?: unknown; error?: string }): string => {
  const data = isRecordObject(result.data) ? result.data : null;
  const stdout = data && typeof data.stdout === 'string' ? data.stdout : '';
  const stderr = data && typeof data.stderr === 'string' ? data.stderr : '';
  const merged = [normalizeBashOutput(stdout), normalizeBashOutput(stderr)]
    .filter(Boolean)
    .join('\n');

  if (merged) {
    return truncateBashOutput(merged);
  }

  const errorText = typeof result.error === 'string' ? result.error.trim() : '';
  return errorText || '';
};

const extractReferenceArticleField = (stdout: string, marker: string): string | null => {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\[${escaped}\\]\\s*(.+)`, 'i');
  const match = stdout.match(pattern);
  if (!match?.[1]) return null;
  const value = match[1].trim();
  return value || null;
};

const formatToolCallStepDetail = (result: unknown): string | undefined => {
  if (!isRecordObject(result)) return stringifyActDetail(result);

  const success = typeof result.success === 'boolean' ? result.success : null;
  const error = typeof result.error === 'string' ? result.error.trim() : '';
  const data = isRecordObject(result.data) ? result.data : null;
  const command = data && typeof data.command === 'string' ? data.command.trim() : '';
  const stdout = data && typeof data.stdout === 'string' ? data.stdout : '';
  const stderr = data && typeof data.stderr === 'string' ? data.stderr.trim() : '';
  const exitCode = data && typeof data.exitCode === 'number' && Number.isFinite(data.exitCode)
    ? Math.floor(data.exitCode)
    : null;

  if (stdout) {
    const refPath = extractReferenceArticleField(stdout, 'reference-article-path');
    const refName = extractReferenceArticleField(stdout, 'reference-article-name');
    if (refPath || refName) {
      return refName && refPath
        ? `Reference article selected: ${refName} (${refPath})`
        : `Reference article selected: ${refName || refPath}`;
    }
  }

  const lineCount = stdout
    ? stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).length
    : 0;
  const commandFailed = success === false || (exitCode != null && exitCode !== 0);

  if (commandFailed) {
    const errorText = error || stderr || 'Tool execution failed';
    return command
      ? `Tool failed: ${command}. ${errorText}${exitCode != null ? ` (exit=${exitCode})` : ''}`
      : `Tool failed: ${errorText}${exitCode != null ? ` (exit=${exitCode})` : ''}`;
  }

  if (command) {
    const summary = lineCount > 0 ? `output ${lineCount} lines` : 'no output';
    const exitPart = exitCode != null ? `, exit=${exitCode}` : '';
    return `Command done: ${command} (${summary}${exitPart})`;
  }

  if (lineCount > 0) {
    return `Tool succeeded, output ${lineCount} lines`;
  }

  return success === true ? 'Tool succeeded' : stringifyActDetail(result);
};

const isToolCallExecutionFailed = (result: unknown): boolean => {
  if (!isRecordObject(result)) return false;
  if (typeof result.success === 'boolean' && result.success === false) return true;
  const data = isRecordObject(result.data) ? result.data : null;
  if (data && typeof data.exitCode === 'number' && Number.isFinite(data.exitCode)) {
    return Math.floor(data.exitCode) !== 0;
  }
  return false;
};

const parseToolArgs = (argsRaw: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(argsRaw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const MINIMAX_TOOL_BLOCK_REGEX = /(?:<\s*minimax:tool_call[^>]*>|(?<![</])minimax:tool_call)\s*[\s\S]*?<\/\s*minimax:tool_call\s*>/gi;
const MINIMAX_INVOKE_BLOCK_REGEX = /<\s*invoke\b[\s\S]*?<\/\s*invoke\s*>/gi;
const MINIMAX_PARAMETER_BLOCK_REGEX = /<\s*parameter\b[\s\S]*?<\/\s*parameter\s*>/gi;

const cleanupMiniMaxMarkup = (text: string): string => {
  return text
    .replace(MINIMAX_TOOL_BLOCK_REGEX, '')
    .replace(MINIMAX_INVOKE_BLOCK_REGEX, '')
    .replace(MINIMAX_PARAMETER_BLOCK_REGEX, '')
    .trim();
};

const AGENT_ENVELOPE_KEYS = new Set([
  'thinking',
  'reasoning',
  'content',
  'answer',
  'response',
  'text',
  'tool_calls',
  'toolCalls',
  'steps',
  'status',
]);

const extractDisplayTextFromEnvelope = (value: Record<string, unknown>): string => {
  const textCandidates: string[] = [];
  const pushValue = (input: unknown): void => {
    if (typeof input === 'string' && input.trim()) {
      textCandidates.push(input.trim());
      return;
    }
    if (Array.isArray(input)) {
      const merged = input
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .join('\n');
      if (merged) textCandidates.push(merged);
    }
  };

  pushValue(value.content);
  pushValue(value.answer);
  pushValue(value.response);
  pushValue(value.text);
  pushValue(value.thinking);
  pushValue(value.reasoning);

  return textCandidates.join('\n').trim();
};

const optimizeAssistantOutput = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const cleanedRaw = cleanupMiniMaxMarkup(trimmed);
  const looksLikeEnvelope = cleanedRaw.startsWith('{') && cleanedRaw.endsWith('}');

  if (!looksLikeEnvelope) {
    return cleanedRaw || raw;
  }

  try {
    const parsed = JSON.parse(cleanedRaw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return cleanedRaw || raw;
    }
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      return cleanedRaw || raw;
    }

    const isLikelyAgentEnvelope = keys.every(key => AGENT_ENVELOPE_KEYS.has(key));
    if (!isLikelyAgentEnvelope) {
      return cleanedRaw || raw;
    }

    const extracted = extractDisplayTextFromEnvelope(record);
    const cleanedExtracted = cleanupMiniMaxMarkup(extracted);
    return cleanedExtracted || cleanedRaw || raw;
  } catch {
    return cleanedRaw || raw;
  }
};

const normalizeToolArgsForKey = (argsRaw: string): string => {
  const parsed = parseToolArgs(argsRaw);
  if (!parsed) return argsRaw.trim();

  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === 'object') {
      const input = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(input).sort()) {
        sorted[key] = normalize(input[key]);
      }
      return sorted;
    }
    return value;
  };

  return JSON.stringify(normalize(parsed));
};

const buildToolCallCacheKey = (toolName: string, argsRaw: string): string =>
  `${toolName}:${normalizeToolArgsForKey(argsRaw)}`;

const hashText = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeDecompositionRules = (value: unknown): DecompositionRule[] => {
  const defaults = cloneBuiltinDecompositionRules();
  if (!Array.isArray(value)) return defaults;

  const sanitize = (input: unknown): string =>
    typeof input === 'string' ? input.trim() : '';
  const defaultsById = new Map(defaults.map(rule => [rule.id, rule] as const));
  const normalized: DecompositionRule[] = [];
  const seenIds = new Set<string>();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const item = rawItem as Record<string, unknown>;
    const rawName = sanitize(item.name);
    const rawInstruction = sanitize(item.instruction);
    const rawId = sanitize(item.id);
    const generatedId = rawName && rawInstruction
      ? `custom-${hashText(`${rawName}|${rawInstruction}`)}`
      : '';
    const ruleId = rawId || generatedId;
    if (!ruleId || seenIds.has(ruleId)) continue;

    const defaultRule = defaultsById.get(ruleId);
    const isBuiltinRule = defaultRule?.builtin === true;
    const name = isBuiltinRule
      ? defaultRule.name
      : (rawName || defaultRule?.name || '');
    const instruction = isBuiltinRule
      ? defaultRule.instruction
      : (rawInstruction || defaultRule?.instruction || '');
    if (!name || !instruction) continue;

    const enabled = typeof item.enabled === 'boolean'
      ? item.enabled
      : (defaultRule?.enabled ?? true);
    const builtin = defaultRule?.builtin
      ?? (typeof item.builtin === 'boolean' ? item.builtin : false);

    normalized.push({
      id: ruleId,
      name,
      instruction,
      enabled,
      builtin,
    });
    seenIds.add(ruleId);

    if (defaultRule) {
      defaultsById.delete(ruleId);
    }
  }

  for (const defaultRule of defaults) {
    if (!seenIds.has(defaultRule.id)) {
      normalized.push(defaultRule);
    }
  }

  return normalized;
};

const getEnabledDecompositionRules = (rules: DecompositionRule[]): DecompositionRule[] =>
  rules.filter(rule => rule.enabled && rule.name.trim() && rule.instruction.trim());

const areDecompositionRulesEqual = (
  left: DecompositionRule[],
  right: DecompositionRule[],
): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (
      l.id !== r.id
      || l.name !== r.name
      || l.instruction !== r.instruction
      || l.enabled !== r.enabled
      || l.builtin !== r.builtin
    ) {
      return false;
    }
  }
  return true;
};

const normalizeWritingRuleDocuments = (value: unknown): WritingRuleDocument[] => {
  if (!Array.isArray(value)) return [];

  const sanitize = (input: unknown): string =>
    typeof input === 'string' ? input.trim() : '';
  const normalized: WritingRuleDocument[] = [];
  const seenPathKeys = new Set<string>();

  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const item = rawItem as Record<string, unknown>;
    const rawPath = sanitize(item.path);
    if (!rawPath) continue;

    const pathKey = normalizeComparableRuleDocumentPath(rawPath);
    if (!pathKey || seenPathKeys.has(pathKey)) continue;

    const rawName = sanitize(item.name);
    const rawId = sanitize(item.id);
    normalized.push({
      id: rawId || `writing-doc-${hashText(pathKey)}`,
      name: rawName || rawPath.split(/[/\\]/).pop() || rawPath,
      path: rawPath,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    });
    seenPathKeys.add(pathKey);
  }

  return normalized;
};

const areWritingRuleDocumentsEqual = (
  left: WritingRuleDocument[],
  right: WritingRuleDocument[],
): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i];
    const r = right[i];
    if (
      l.id !== r.id
      || l.name !== r.name
      || l.path !== r.path
      || l.enabled !== r.enabled
    ) {
      return false;
    }
  }
  return true;
};

const normalizeTimelineText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const TODO_ITEM_MAX_COUNT = 64;
const SIMPLE_TODO_CONTENT_MAX_CHARS = 42;
type SimpleAgentStepKind = 'requirement' | 'reference' | 'decomposition' | 'outline' | 'writing' | 'tool' | 'verify' | 'other';
const REQUIREMENT_BRIEF_STEP_REGEX = /(decompose user requirements|structured writing brief|需求拆解|用户需求|写作需求|writing brief)/i;
const REFERENCE_ARTICLE_STEP_REGEX = /(reference article|参考文章|读取参考|抽取参考|随机参考|随机抽取|随机提取|风格参考|style reference|\.md\/\.txt|md\/txt)/i;
const OUTLINE_STEP_REGEX = /(article framework|meta framework|overall framework|structure|outline|heading|框架|结构|大纲|小标题)/i;
const WRITING_STEP_REGEX = /(write paragraph|paragraph by paragraph|编写|写作|生成正文|rewrite|revise|draft|optimi)/i;
const VERIFY_STEP_REGEX = /(verify|评分|score|逐句|校验|gate)/i;

const trimTodoContent = (value: string, maxChars = SIMPLE_TODO_CONTENT_MAX_CHARS): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
};

const inferSimpleAgentStepKind = (stepType: string, description: string): SimpleAgentStepKind => {
  const normalizedDesc = description.trim();
  const normalizedType = stepType.trim();
  if (REQUIREMENT_BRIEF_STEP_REGEX.test(normalizedDesc)) return 'requirement';
  if (REFERENCE_ARTICLE_STEP_REGEX.test(normalizedDesc)) return 'reference';
  if (isDecompositionStep(normalizedDesc)) return 'decomposition';
  if (OUTLINE_STEP_REGEX.test(normalizedDesc)) return 'outline';
  if (normalizedType === 'write' || WRITING_STEP_REGEX.test(normalizedDesc)) return 'writing';
  if (normalizedType === 'tool_call') return 'tool';
  if (normalizedType === 'verify' || VERIFY_STEP_REGEX.test(normalizedDesc)) return 'verify';
  return 'other';
};

const getSimpleAgentStepLabel = (kind: SimpleAgentStepKind): string => {
  switch (kind) {
    case 'requirement':
      return '需求清单';
    case 'reference':
      return '读取参考文章';
    case 'decomposition':
      return '拆解文章素材';
    case 'outline':
      return '输出结构与大纲';
    case 'writing':
      return '开始编写（流式写入）';
    case 'tool':
      return '工具调用';
    case 'verify':
      return '校验与优化';
    default:
      return '执行步骤';
  }
};

const shouldShowSimpleStepLog = (kind: SimpleAgentStepKind, phase: 'start' | 'complete' | 'failed'): boolean => {
  if (phase === 'failed') return true;
  return kind === 'requirement'
    || kind === 'reference'
    || kind === 'decomposition'
    || kind === 'outline'
    || kind === 'writing'
    || kind === 'tool';
};

const simplifyPlanTodoContent = (content: string): string => {
  const kind = inferSimpleAgentStepKind('', content);
  switch (kind) {
    case 'requirement':
      return '根据需求，列举执行清单';
    case 'reference':
      return '读取文件（参考文章素材）';
    case 'decomposition':
      return '拆解文章素材';
    case 'outline':
      return '输出整体结构、文章大纲';
    case 'writing':
      return '开始编写（流式写入临时文档）';
    case 'tool':
      return '工具调用';
    case 'verify':
      return '校验与优化';
    default:
      return trimTodoContent(content);
  }
};

const simplifyTodoDisplayContent = (content: string, source: TodoItemView['source']): string => {
  if (source === 'plan') {
    return simplifyPlanTodoContent(content);
  }
  return trimTodoContent(content);
};

const TODO_STATUS_WEIGHT: Record<TodoItemStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

const mergeTodoStatus = (current: TodoItemStatus, incoming: TodoItemStatus): TodoItemStatus =>
  TODO_STATUS_WEIGHT[incoming] >= TODO_STATUS_WEIGHT[current] ? incoming : current;

const normalizeTodoStatus = (value: unknown): TodoItemStatus => {
  if (value === 'completed') return 'completed';
  if (value === 'in_progress') return 'in_progress';
  return 'pending';
};

const normalizeTodoItems = (value: unknown): TodoItemView[] => {
  if (!Array.isArray(value)) return [];
  const normalized: TodoItemView[] = [];
  const indexByKey = new Map<string, number>();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const item = rawItem as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const source: TodoItemView['source'] = item.source === 'plan' ? 'plan' : 'agent';
    const rawContent = typeof item.content === 'string' ? item.content.trim() : '';
    const content = simplifyTodoDisplayContent(rawContent, source);
    if (!id || !content) continue;
    const status = normalizeTodoStatus(item.status);
    const stepId = typeof item.stepId === 'string' ? item.stepId : undefined;
    const dedupeKey = `${source}:${content}`;
    const existingIndex = indexByKey.get(dedupeKey);
    if (existingIndex !== undefined) {
      const existing = normalized[existingIndex];
      normalized[existingIndex] = {
        ...existing,
        status: mergeTodoStatus(existing.status, status),
        stepId: existing.stepId || stepId,
      };
      continue;
    }
    normalized.push({
      id,
      content,
      status,
      source,
      stepId,
    });
    indexByKey.set(dedupeKey, normalized.length - 1);
    if (normalized.length >= TODO_ITEM_MAX_COUNT) break;
  }
  return normalized;
};

const READ_FILE_BATCH_LOG_THRESHOLD = 1;
const READ_FILE_CHUNK_DEFAULT_LINES = 160;
const READ_FILE_CHUNK_MIN_LINES = 40;
const READ_FILE_CHUNK_MAX_LINES = 320;
const READ_FILE_FULL_INLINE_LINE_LIMIT = 220;
const READ_FILE_FULL_INLINE_CHAR_LIMIT = 20000;
const TOOL_RESULT_MAX_CHARS = 26000;
const TOOL_RESULT_LIST_MAX_LINES = 420;
const TOOL_CONTEXT_BUDGET_CHARS = 180000;
const TOOL_CONTEXT_KEEP_RECENT_MESSAGES = 16;
const COMPACT_KEEP_RECENT_MESSAGES = 8;
const COMPACT_SUMMARY_ITEM_LIMIT = 8;
const WRITE_STREAM_RENDER_INTERVAL_MS = 20;
const WRITE_STREAM_RENDER_CHUNK_SIZE = 12;
const WRITE_STREAM_MIN_VISIBLE_CHARS = 20;
const WRITE_CONTENT_MARKER_REGEX = /(?:^|\n)\s*(?:[#>*-]+\s*)?(?:\*\*)?(?:生成内容如下|最终内容|正文如下|输出如下)(?:\*\*)?\s*(?:[：:]|\n)\s*/i;
const WRITE_PROCEDURE_LINE_REGEX = /^\s*(?:[-*]\s*)?(?:工具|参数|tool|params?)\s*[：:]/i;
const WRITE_PROCEDURE_TOKEN_REGEX = /\b(?:read_file|write_file|edit_file|multi_edit_file|list_files|search_files|run_shell|bash)\b/i;
const WRITE_PROCEDURE_HINT_REGEX = /(我需要先读取|我将先读取|先读取当前文件|先查询工作区|为了.*上下文.*先读取)/i;

const isProcedureLikeWriteOutput = (value: string): boolean => {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;

  let matched = 0;
  for (const line of lines) {
    if (
      WRITE_PROCEDURE_LINE_REGEX.test(line)
      || WRITE_PROCEDURE_TOKEN_REGEX.test(line)
      || WRITE_PROCEDURE_HINT_REGEX.test(line)
    ) {
      matched += 1;
    }
  }

  if (lines.length <= 4) {
    return matched >= 1;
  }

  return matched >= Math.max(2, Math.ceil(lines.length / 3));
};

const normalizeWriteOutputForEditor = (raw: string, final: boolean): string => {
  const source = raw || '';
  if (!source) return '';

  const markerMatch = source.match(WRITE_CONTENT_MARKER_REGEX);
  let content = source;

  if (markerMatch && typeof markerMatch.index === 'number') {
    content = source.slice(markerMatch.index + markerMatch[0].length);
  } else {
    const fallback = source
      .replace(/^\s*```[a-zA-Z0-9_-]*\s*\n/, '')
      .replace(/\n?```\s*$/, '')
      .trimStart();
    if (!fallback) {
      return '';
    }
    if (final) {
      if (isProcedureLikeWriteOutput(fallback)) {
        return '';
      }
      return fallback;
    }
    const fallbackDraft = fallback.trimEnd();
    if (fallbackDraft.length < WRITE_STREAM_MIN_VISIBLE_CHARS) {
      return '';
    }
    if (isProcedureLikeWriteOutput(fallbackDraft)) {
      return '';
    }
    return fallbackDraft;
  }

  content = content.replace(/^\s*```[a-zA-Z0-9_-]*\s*\n/, '');
  if (final) {
    content = content.replace(/\n?```\s*$/, '');
  }
  content = content.replace(/^\s+/, '');
  if (!content) return '';
  if (isProcedureLikeWriteOutput(content)) return '';
  return content;
};

const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  { command: '/compact', description: '压缩历史上下文，保留最近会话', insertText: '/compact' },
  { command: '/help', description: '查看可用命令说明', insertText: '/help' },
  { command: '/clear', description: '清空当前对话', insertText: '/clear' },
];

interface ReadFileChunkResult {
  chunkText: string;
  chunkLineCount: number;
  chunkIndex: number;
  chunkTotal: number;
  startLine: number;
  endLine: number;
  totalLines: number;
  safeCursor: number;
  safeChunkLines: number;
  hasMore: boolean;
  nextCursor: number;
}

type FormWhereOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'starts_with' | 'ends_with';

const shortenPathForTimeline = (path: string, maxLength = 72): string => {
  if (path.length <= maxLength) return path;
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(/[\\/]/).filter(Boolean);
  const fileName = parts[parts.length - 1] ?? '';
  const parent = parts.length > 1 ? parts[parts.length - 2] : '';
  const tail = parent ? `${parent}${sep}${fileName}` : fileName;
  if (tail && tail.length + 4 <= maxLength) {
    return `...${sep}${tail}`;
  }
  return `...${path.slice(-(maxLength - 3))}`;
};

const parseReadLineCountFromSummary = (summary: string): number | undefined => {
  const normalized = summary.replace(/\s+\(cached\)$/i, '').trim();
  if (normalized === '(empty file)') return 0;
  const match = normalized.match(/(\d+)\s+lines(?:\s+of\s+output)?/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseLineChunkArgs = (args: Record<string, unknown> | null): { cursor: number; chunkLines: number } => {
  const cursorValue = args?.cursor;
  const chunkLinesValue = args?.chunkLines;
  const rawCursor = typeof cursorValue === 'number' && Number.isFinite(cursorValue)
    ? Math.floor(cursorValue)
    : 0;
  const rawChunkLines = typeof chunkLinesValue === 'number' && Number.isFinite(chunkLinesValue)
    ? Math.floor(chunkLinesValue)
    : READ_FILE_CHUNK_DEFAULT_LINES;
  return {
    cursor: Math.max(0, rawCursor),
    chunkLines: Math.min(
      READ_FILE_CHUNK_MAX_LINES,
      Math.max(READ_FILE_CHUNK_MIN_LINES, rawChunkLines)
    ),
  };
};

const buildReadFileChunkResult = (
  content: string,
  cursor: number,
  chunkLines: number
): ReadFileChunkResult => {
  const normalized = (content ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const totalLines = lines.length;
  const safeChunkLines = Math.min(
    READ_FILE_CHUNK_MAX_LINES,
    Math.max(READ_FILE_CHUNK_MIN_LINES, Math.floor(chunkLines || READ_FILE_CHUNK_DEFAULT_LINES))
  );
  const safeCursor = Math.max(0, Math.min(Math.floor(cursor || 0), totalLines));
  const endExclusive = Math.min(totalLines, safeCursor + safeChunkLines);
  const chunkLinesList = lines.slice(safeCursor, endExclusive);
  const chunkText = chunkLinesList.join('\n');
  const hasMore = endExclusive < totalLines;
  const nextCursor = hasMore ? endExclusive : totalLines;
  const chunkLineCount = chunkLinesList.length;
  const chunkIndex = chunkLineCount === 0 ? 0 : Math.floor(safeCursor / safeChunkLines) + 1;
  const chunkTotal = totalLines === 0 ? 0 : Math.max(1, Math.ceil(totalLines / safeChunkLines));
  const startLine = chunkLineCount === 0 ? 0 : safeCursor + 1;
  const endLine = chunkLineCount === 0 ? 0 : safeCursor + chunkLineCount;

  return {
    chunkText,
    chunkLineCount,
    chunkIndex,
    chunkTotal,
    startLine,
    endLine,
    totalLines,
    safeCursor,
    safeChunkLines,
    hasMore,
    nextCursor,
  };
};

const trimTextByChars = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  const keep = Math.max(1200, maxChars - 80);
  return `${value.slice(0, keep)}\n\n[truncated ${value.length - keep} chars]`;
};

const trimListDirectoryForModel = (content: string): string => {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length <= TOOL_RESULT_LIST_MAX_LINES) {
    return trimTextByChars(normalized, TOOL_RESULT_MAX_CHARS);
  }
  const headCount = Math.min(260, lines.length);
  const tailCount = Math.min(120, Math.max(0, lines.length - headCount));
  const head = lines.slice(0, headCount);
  const tail = tailCount > 0 ? lines.slice(-tailCount) : [];
  const omitted = Math.max(0, lines.length - head.length - tail.length);
  const merged = [
    ...head,
    `[list_directory truncated] omitted ${omitted} items to keep model context stable`,
    ...tail,
  ].join('\n');
  return trimTextByChars(merged, TOOL_RESULT_MAX_CHARS);
};

const trimReadToolResultForModel = (content: string): string => {
  if (content.length <= TOOL_RESULT_MAX_CHARS) return content;
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const firstBlankIdx = lines.findIndex(line => line.trim() === '');
  const headerEnd = firstBlankIdx >= 0 ? Math.min(firstBlankIdx + 1, 12) : Math.min(10, lines.length);
  const header = lines.slice(0, headerEnd).join('\n');
  const body = lines.slice(headerEnd).join('\n');
  const remaining = Math.max(1400, TOOL_RESULT_MAX_CHARS - header.length - 120);
  const slicedBody = body.slice(0, remaining);
  return `${header}\n${slicedBody}\n\n[truncated ${Math.max(0, body.length - slicedBody.length)} chars for context budget]`;
};

const getToolResultForModel = (toolName: string, toolResult: string): string => {
  if (!toolResult) return toolResult;
  if (toolName === 'list_directory') {
    return trimListDirectoryForModel(toolResult);
  }
  if (toolName === 'read_file' || toolName === 'read_file_chunk') {
    return trimReadToolResultForModel(toolResult);
  }
  return trimTextByChars(toolResult, TOOL_RESULT_MAX_CHARS);
};

const compactToolMessageContent = (content: string): string => {
  if (content.includes('[tool output compacted]')) {
    return content;
  }
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const head = lines.slice(0, Math.min(10, lines.length)).join('\n');
  return `${head}\n\n[tool output compacted] Older tool payload was reduced to avoid context overflow.`;
};

const enforceToolMessageBudget = (messages: ChatMessage[]): { compacted: number; totalChars: number } => {
  let totalChars = 0;
  const toolIndexes: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.role !== 'tool') continue;
    toolIndexes.push(i);
    totalChars += msg.content.length;
  }
  if (totalChars <= TOOL_CONTEXT_BUDGET_CHARS) {
    return { compacted: 0, totalChars };
  }

  let compacted = 0;
  const unprotectedCount = Math.max(0, toolIndexes.length - TOOL_CONTEXT_KEEP_RECENT_MESSAGES);
  for (let k = 0; k < unprotectedCount && totalChars > TOOL_CONTEXT_BUDGET_CHARS; k += 1) {
    const idx = toolIndexes[k];
    const original = messages[idx]?.content ?? '';
    if (!original) continue;
    const compactedContent = compactToolMessageContent(original);
    if (compactedContent.length >= original.length) continue;
    messages[idx] = { ...messages[idx], content: compactedContent };
    totalChars -= (original.length - compactedContent.length);
    compacted += 1;
  }

  if (totalChars > TOOL_CONTEXT_BUDGET_CHARS) {
    for (let k = 0; k < toolIndexes.length && totalChars > TOOL_CONTEXT_BUDGET_CHARS; k += 1) {
      const idx = toolIndexes[k];
      const original = messages[idx]?.content ?? '';
      if (!original || original.startsWith('[tool output omitted]')) continue;
      const omitted = '[tool output omitted] This payload was removed due to context budget.';
      messages[idx] = { ...messages[idx], content: omitted };
      totalChars -= Math.max(0, original.length - omitted.length);
      compacted += 1;
    }
  }

  return { compacted, totalChars };
};

const buildCompactConversationSummary = (history: Message[]): string => {
  if (history.length === 0) {
    return '无可压缩的历史消息。';
  }
  const normalizedHistory = history
    .map(item => ({ role: item.role, text: normalizeTimelineText(item.content ?? '') }))
    .filter(item => item.text.length > 0);
  if (normalizedHistory.length === 0) {
    return '无可压缩的历史消息。';
  }

  const summaryItems: string[] = [];
  for (const item of normalizedHistory.slice(-COMPACT_SUMMARY_ITEM_LIMIT)) {
    const prefix = item.role === 'user' ? '用户' : '助手';
    const brief = item.text.length > 96 ? `${item.text.slice(0, 96)}...` : item.text;
    summaryItems.push(`- ${prefix}: ${brief}`);
  }

  return [
    `已折叠 ${normalizedHistory.length} 条历史消息，保留最近 ${COMPACT_KEEP_RECENT_MESSAGES} 条原始消息。`,
    '历史摘要：',
    ...summaryItems,
  ].join('\n');
};

const buildToolActTitle = (toolName: string, argsRaw: string): { title: string; detail?: string } => {
  const args = parseToolArgs(argsRaw);
  const path = typeof args?.path === 'string' ? args.path : undefined;
  const query = typeof args?.query === 'string' ? args.query : undefined;
  const pattern = typeof args?.pattern === 'string' ? args.pattern : undefined;
  const formId = typeof args?.formId === 'string' ? args.formId : undefined;
  const formName = typeof args?.formName === 'string' ? args.formName : undefined;

  switch (toolName) {
    case 'read_file':
      return { title: path ? `Read "${path}"` : 'Read file' };
    case 'read_file_chunk':
      return { title: path ? `Read chunk "${path}"` : 'Read file chunk' };
    case 'list_directory':
      return { title: path ? `List "${path}"` : 'List directory' };
    case 'edit_file':
      return { title: path ? `Edit "${path}"` : 'Edit file' };
    case 'write_file':
      return { title: path ? `Write "${path}"` : 'Write file' };
    case 'search_files':
      return {
        title: path ? `Search in "${path}"` : 'Search files',
        detail: query ?? pattern,
      };
    case 'query_knowledge':
      return {
        title: 'Query knowledge',
        detail: query ?? undefined,
      };
    case 'query_form':
      return {
        title: formName
          ? `Query form "${formName}"`
          : 'Query form',
        detail: query ?? undefined,
      };
    default:
      return {
        title: `Run ${toolName}`,
        detail: stringifyActDetail(args ?? argsRaw),
      };
  }
};

const buildToolCallDetail = (toolName: string, params: Record<string, unknown>): string => {
  if (toolName === 'bash' && typeof params.command === 'string') {
    return params.command;
  }
  if (toolName === 'write_file') {
    const path = typeof params.path === 'string' ? params.path : '(unknown path)';
    const content = typeof params.content === 'string' ? params.content : '';
    return `path: ${path}\ncontent_length: ${content.length}`;
  }
  if (toolName === 'edit_file') {
    const path = typeof params.path === 'string' ? params.path : '(unknown path)';
    const oldString = typeof params.old_string === 'string' ? params.old_string : '';
    const newString = typeof params.new_string === 'string' ? params.new_string : '';
    return `path: ${path}\nold_length: ${oldString.length}\nnew_length: ${newString.length}`;
  }
  if (toolName === 'multi_edit_file') {
    const path = typeof params.path === 'string' ? params.path : '(unknown path)';
    const edits = Array.isArray(params.edits) ? params.edits.length : 0;
    return `path: ${path}\nedits: ${edits}`;
  }
  return stringifyActDetail(params) || '';
};

const EDIT_TASK_HINT_REGEX = /(?:\u4fee\u6539|\u6539\u5199|\u91cd\u5199|\u6da6\u8272|\u4f18\u5316|\u4fee\u590d|\u7f16\u8f91|edit|rewrite|refactor|fix|patch)/i;
const QUERY_TASK_HINT_REGEX = /(?:\?|\uFF1F|\u4ec0\u4e48|\u4e3a\u4ec0\u4e48|\u5982\u4f55|\u54ea\u4e9b|\u67e5\u8be2|\u68c0\u7d22|\u7edf\u8ba1|\u5bf9\u6bd4|compare|difference|explain|show|list|find|query|search|count)/i;
const WRITE_TASK_HINT_REGEX = /(?:\u5199\u4f5c|\u64b0\u5199|\u521b\u4f5c|\u751f\u6210|\u5b9e\u73b0|\u5f00\u53d1|write|draft|compose|create|implement|build)/i;
const NON_TASK_SMALLTALK_REGEX = /^(?:\u4f60\u597d|\u60a8\u597d|\u55e8|\u54c8\u55bd|\u563f|\u5728\u5417|\u5728\u561b|hello|hi|hey|thanks|thank you|thx|\u8c22\u8c22|\u591a\u8c22|\u597d\u7684|ok|okay|\u6536\u5230|\u660e\u767d\u4e86|\u55ef|\u54e6|\u5662)\s*[\u0021\uFF01\u003F\u002E\u3002\u007E\uFF5E]*$/i;
const NON_TASK_META_QUERY_REGEX = /(?:\u4f60\u662f\u4ec0\u4e48\u6a21\u578b|\u4f60\u662f\u5565\u6a21\u578b|\u4f60\u7528\u7684\u4ec0\u4e48\u6a21\u578b|\u5f53\u524d\u662f\u4ec0\u4e48\u6a21\u578b|\u73b0\u5728\u662f\u4ec0\u4e48\u6a21\u578b|\u4f60\u662f\u8c01|\u4f60\u80fd\u505a\u4ec0\u4e48|\u4f60\u4f1a\u4ec0\u4e48|what\s+model\s+are\s+you|which\s+model\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do)/i;
const TASK_EXECUTION_HINT_REGEX = /(?:\u5199|\u6539|\u91cd\u5199|\u6da6\u8272|\u751f\u6210|\u521b\u5efa|\u65b0\u5efa|\u6574\u7406|\u603b\u7ed3|\u5f52\u7eb3|\u5206\u6790|\u63d0\u53d6|\u62c6\u89e3|\u6267\u884c|\u8fd0\u884c|\u6253\u5f00|\u8bfb\u53d6|\u7f16\u8f91|\u4fee\u6539|\u4fdd\u5b58|\u5bfc\u5165|\u6784\u5efa|\u7f16\u8bd1|\u6d4b\u8bd5|\u4fee\u590d|\u6392\u67e5|\u5b9e\u73b0|\u5f00\u53d1|\u8c03\u7528|\u67e5\u8be2|\u68c0\u7d22|\u7ffb\u8bd1|write|rewrite|generate|create|draft|compose|edit|modify|save|run|execute|build|compile|test|fix|implement|refactor|analy[sz]e|summari[sz]e|extract|search|query|translate)/i;
const DECOMPOSITION_STEP_REGEX = /(?:\u62c6\u89e3|decompos|framework|\u5c0f\u6807\u9898|\u6bb5\u843d|\u53e5\u5f0f|\u7528\u8bcd|\u98ce\u683c|\u8fc7\u6e21|\u573a\u666f|\u6848\u4f8b)/i;
const SHOW_DECOMPOSITION_STREAM_BLOCK = false;
const SHOW_DECOMPOSITION_STEP_LOG = false;

const isLikelyNonTaskAgentInput = (input: string): boolean => {
  const normalized = input.trim();
  if (!normalized) return false;
  if (normalized.startsWith('/')) return false;
  if (TASK_EXECUTION_HINT_REGEX.test(normalized)) return false;
  if (NON_TASK_SMALLTALK_REGEX.test(normalized)) return true;
  if (normalized.length <= 64 && NON_TASK_META_QUERY_REGEX.test(normalized)) return true;
  return false;
};

const isDecompositionStep = (description: string): boolean =>
  DECOMPOSITION_STEP_REGEX.test(description.trim());

const stripDecompositionSection = (fullText: string, decompositionText: string): string => {
  const normalizedFull = fullText.trim();
  const normalizedDecomposition = decompositionText.trim();
  if (!normalizedFull || !normalizedDecomposition) return normalizedFull;

  if (normalizedFull.includes(normalizedDecomposition)) {
    return normalizedFull.replace(normalizedDecomposition, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  const firstAnchor = normalizedDecomposition.split(/\r?\n/).find(line => line.trim().length > 0)?.trim() ?? '';
  if (!firstAnchor) return normalizedFull;

  const anchorIndex = normalizedFull.indexOf(firstAnchor);
  if (anchorIndex < 0 || anchorIndex > Math.floor(normalizedFull.length * 0.7)) {
    return normalizedFull;
  }

  const approxEnd = Math.min(normalizedFull.length, anchorIndex + normalizedDecomposition.length);
  const stripped = `${normalizedFull.slice(0, anchorIndex)}${normalizedFull.slice(approxEnd)}`;
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
};

const inferAgentTaskType = (
  taskDescription: string,
  hasContextHint: boolean,
  hasCurrentFile: boolean
): AgentTaskType => {
  const normalized = taskDescription.trim();
  if (!normalized) return 'write';
  if (EDIT_TASK_HINT_REGEX.test(normalized)) return 'edit';
  if (WRITE_TASK_HINT_REGEX.test(normalized)) return 'write';
  if (hasCurrentFile && !QUERY_TASK_HINT_REGEX.test(normalized)) return 'edit';
  if (QUERY_TASK_HINT_REGEX.test(normalized)) return 'query';
  if (hasContextHint && !WRITE_TASK_HINT_REGEX.test(normalized)) return 'query';
  return 'write';
};

const buildCompactAgentResultText = (
  taskType: AgentTaskType,
  currentFilePath: string,
  changedFiles: string[],
  targetPath?: string
): string => {
  const resolvedTargetPath = (targetPath || currentFilePath).trim();
  const lines: string[] = ['已完成 Agent 执行。'];

  if (taskType === 'write' || taskType === 'edit') {
    if (resolvedTargetPath) {
      lines.push(`目标文件: ${resolvedTargetPath}`);
      if (resolvedTargetPath.toLowerCase().startsWith(AGENT_DRAFT_PATH_PREFIX)) {
        lines.push('Saved to temporary draft tab.');
      }
    }

    if (changedFiles.length > 0) {
      lines.push(`文件改动: ${changedFiles.length} 个`);
      for (const filePath of changedFiles.slice(0, 5)) {
        lines.push(`- ${filePath}`);
      }
      if (changedFiles.length > 5) {
        lines.push(`- ... 另有 ${changedFiles.length - 5} 个文件`);
      }
    } else {
      lines.push('未检测到文件改动。');
    }
  }

  if (taskType === 'query' && changedFiles.length === 0) {
    lines.push('此任务为查询模式，未执行文件写入。');
  }

  return lines.join('\n');
};

interface KnowledgeFileCandidate {
  name: string;
  path?: string;
  content?: string;
}

interface AgentRAGResultItem {
  content?: string;
  childContent?: string;
  filePath?: string;
  score?: number;
}

const normalizeFilePath = (value: string): string =>
  value.replace(/\\/g, '/').toLowerCase();

const getPathBaseName = (value: string): string => {
  const segments = value.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? value;
};

const AGENT_DRAFT_PATH_PREFIX = 'agent-draft:/';
const AGENT_DRAFT_TITLE_PREFIX = 'untitled-';
const AGENT_DRAFT_TITLE_REGEX = /^untitled-(\d+)$/i;
let agentDraftSequenceSeed = 0;

const pickNextAgentDraftTitle = (): string => {
  let maxIndex = agentDraftSequenceSeed;
  const tabsState = (window as any).__editorTabsState as {
    tabs?: Array<{ title?: string; path?: string }>;
  } | undefined;
  const tabs = Array.isArray(tabsState?.tabs) ? tabsState.tabs : [];

  for (const tab of tabs) {
    const tabPath = typeof tab.path === 'string' ? tab.path.trim() : '';
    const tabTitle = typeof tab.title === 'string' ? tab.title.trim() : '';
    if (!tabPath.toLowerCase().startsWith(AGENT_DRAFT_PATH_PREFIX)) {
      continue;
    }
    const titleMatch = tabTitle.match(AGENT_DRAFT_TITLE_REGEX);
    if (titleMatch) {
      const parsed = Number(titleMatch[1]);
      if (Number.isFinite(parsed) && parsed > maxIndex) {
        maxIndex = parsed;
      }
      continue;
    }
    const fileName = getPathBaseName(tabPath).replace(/\.md$/i, '');
    const fileMatch = fileName.match(AGENT_DRAFT_TITLE_REGEX);
    if (!fileMatch) continue;
    const parsed = Number(fileMatch[1]);
    if (Number.isFinite(parsed) && parsed > maxIndex) {
      maxIndex = parsed;
    }
  }

  agentDraftSequenceSeed = maxIndex + 1;
  return `${AGENT_DRAFT_TITLE_PREFIX}${agentDraftSequenceSeed}`;
};

const buildAgentDraftTarget = (): { path: string; name: string } => {
  const draftTitle = pickNextAgentDraftTitle();
  return {
    path: `${AGENT_DRAFT_PATH_PREFIX}${draftTitle}.md`,
    name: draftTitle,
  };
};

const VIRTUAL_TAB_PATH_PREFIXES = [
  'settings:/',
  'media:/',
  'extension-manager:/',
  'lancedb-view:/',
  'table-designer:/',
  'mermaid-designer:/',
  'skills-market:/',
  'preview:/',
  'theme-override://',
  AGENT_DRAFT_PATH_PREFIX,
];

const isVirtualTabPath = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return VIRTUAL_TAB_PATH_PREFIXES.some(prefix => normalized.startsWith(prefix));
};

const isLikelyFileSystemPath = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isVirtualTabPath(trimmed)) return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true;
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('/')) return true;
  if (trimmed.includes('/') || trimmed.includes('\\')) return true;
  return /\.[a-zA-Z0-9]+$/.test(trimmed);
};

const normalizeComparablePath = (value: string): string =>
  value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const isPathInsideBase = (targetPath: string, basePath: string): boolean => {
  const target = normalizeComparablePath(targetPath);
  const base = normalizeComparablePath(basePath);
  if (!target || !base) return false;
  if (target === base) return true;
  return target.startsWith(`${base}/`);
};

const deriveDirectoryPath = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/').trim();
  if (!normalized) return '';
  if (/^[a-zA-Z]:\/[^/]+$/.test(normalized)) {
    return normalized.slice(0, 3);
  }
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return normalized;
  return normalized.slice(0, lastSlash);
};

const trimSnippet = (value: string, maxLength = 520): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
};

const buildSearchTerms = (query: string): string[] => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const asciiTerms = trimmed.match(/[a-zA-Z0-9_#.-]+/g) ?? [];
  const cjkTerms = trimmed.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const splitTerms = trimmed
    .split(/[\s,.;:!?|/\\()[\]{}"'`]+/)
    .map(term => term.trim())
    .filter(Boolean);

  const merged = [trimmed, ...asciiTerms, ...cjkTerms, ...splitTerms]
    .filter(term => term.length >= 2 || /[a-zA-Z0-9]/.test(term));

  const dedup = new Map<string, string>();
  for (const term of merged) {
    const key = term.toLowerCase();
    if (!dedup.has(key)) {
      dedup.set(key, term);
    }
  }
  return Array.from(dedup.values()).slice(0, 16);
};

const scoreTextByTerms = (content: string, terms: string[]): number => {
  if (!content || terms.length === 0) return 0;
  const lower = content.toLowerCase();
  let score = 0;

  for (const term of terms) {
    const needle = term.toLowerCase();
    if (!needle) continue;
    let idx = lower.indexOf(needle);
    let hits = 0;
    while (idx >= 0 && hits < 8) {
      hits += 1;
      idx = lower.indexOf(needle, idx + needle.length);
    }
    if (hits > 0) {
      score += 3 + hits;
    }
  }

  return score;
};

const extractSnippetByTerms = (content: string, terms: string[], maxLength = 560): string => {
  const normalized = content.trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;

  const lower = normalized.toLowerCase();
  let anchor = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx >= 0 && (anchor < 0 || idx < anchor)) {
      anchor = idx;
    }
  }

  if (anchor < 0) {
    return trimSnippet(normalized, maxLength);
  }

  const start = Math.max(0, anchor - Math.floor(maxLength * 0.35));
  const end = Math.min(normalized.length, start + maxLength);
  const snippet = normalized.slice(start, end).trim();
  if (start > 0 || end < normalized.length) {
    return `${start > 0 ? '...' : ''}${snippet}${end < normalized.length ? '...' : ''}`;
  }
  return snippet;
};

const parseFormColumnsArg = (columns: unknown): string[] => {
  if (Array.isArray(columns)) {
    return columns
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof columns === 'string') {
    const trimmed = columns.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
        }
      } catch {
        // fall through to csv parser
      }
    }
    return columns
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const buildFormSearchTerms = (query: string): string[] => {
  const base = buildSearchTerms(query);
  if (base.length > 0) return base;
  const trimmed = query.trim();
  if (!trimmed) return [];
  return [trimmed];
};

const parseQueryFormWhere = (
  where: unknown
): { column: string; op: FormWhereOperator; value: unknown } | null => {
  let normalizedWhere = where;
  if (typeof normalizedWhere === 'string') {
    const trimmed = normalizedWhere.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        normalizedWhere = JSON.parse(trimmed);
      } catch {
        normalizedWhere = where;
      }
    }
  }

  const rawEntry = Array.isArray(normalizedWhere) ? normalizedWhere[0] : normalizedWhere;
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
  const input = rawEntry as Record<string, unknown>;
  const column = typeof input.column === 'string'
    ? input.column.trim()
    : (typeof input.field === 'string' ? input.field.trim() : '');
  const opToken = typeof input.op === 'string'
    ? input.op.trim().toLowerCase()
    : (typeof input.operator === 'string' ? input.operator.trim().toLowerCase() : '');
  const value = input.value ?? input.target;
  if (!column || !opToken || value === undefined) return null;
  const opAliasMap: Record<string, FormWhereOperator> = {
    '=': 'eq',
    '==': 'eq',
    'eq': 'eq',
    'equals': 'eq',
    'equal': 'eq',
    '等于': 'eq',
    '!=': 'ne',
    '<>': 'ne',
    'ne': 'ne',
    'not_equal': 'ne',
    'not equals': 'ne',
    '不等于': 'ne',
    '>': 'gt',
    'gt': 'gt',
    'greater_than': 'gt',
    '大于': 'gt',
    '>=': 'gte',
    'gte': 'gte',
    'greater_or_equal': 'gte',
    '大于等于': 'gte',
    '<': 'lt',
    'lt': 'lt',
    'less_than': 'lt',
    '小于': 'lt',
    '<=': 'lte',
    'lte': 'lte',
    'less_or_equal': 'lte',
    '小于等于': 'lte',
    'contains': 'contains',
    'like': 'contains',
    '包含': 'contains',
    'starts_with': 'starts_with',
    'startswith': 'starts_with',
    'prefix': 'starts_with',
    '开头是': 'starts_with',
    'ends_with': 'ends_with',
    'endswith': 'ends_with',
    'suffix': 'ends_with',
    '结尾是': 'ends_with',
  };
  const opRaw = opAliasMap[opToken] ?? (opToken as FormWhereOperator);
  const allowed: FormWhereOperator[] = [
    'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'ends_with',
  ];
  if (!allowed.includes(opRaw as FormWhereOperator)) return null;
  return { column, op: opRaw as FormWhereOperator, value };
};

const resolveFormColumnByToken = (detail: FormDetail, token: string): FormDetail['columns'][number] | null => {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  const aliasMap: Record<string, string[]> = {
    '性别': ['gender', 'sex'],
    'gender': ['性别', 'sex'],
    'sex': ['性别', 'gender'],
    '姓名': ['name'],
    'name': ['姓名'],
    '邮箱': ['email', 'mail'],
    'email': ['邮箱', 'mail'],
  };
  const candidates = new Set<string>([normalized]);
  const aliases = aliasMap[normalized] ?? [];
  for (const alias of aliases) {
    candidates.add(alias.toLowerCase());
  }
  return detail.columns.find(column => {
    const id = String(column.id ?? '').trim().toLowerCase();
    const name = String(column.name ?? '').trim().toLowerCase();
    return candidates.has(id) || candidates.has(name);
  }) ?? null;
};

const toComparableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const normalizeGenderToken = (value: unknown): 'male' | 'female' | null => {
  const text = normalizeFormCellValue(value).trim().toLowerCase();
  if (!text) return null;
  if (
    text === '男' || text === '男性' || text === 'male' || text === 'm'
    || text === 'man' || text === 'boy'
  ) return 'male';
  if (
    text === '女' || text === '女性' || text === 'female' || text === 'f'
    || text === 'woman' || text === 'girl'
  ) return 'female';
  return null;
};

const doesFormRowMatchWhere = (
  row: { cells?: Record<string, unknown> },
  detail: FormDetail,
  where: { column: string; op: FormWhereOperator; value: unknown }
): boolean => {
  const targetColumn = resolveFormColumnByToken(detail, where.column);
  if (!targetColumn) return false;
  const cellValueRaw = (row.cells ?? {})[targetColumn.id];
  const cellText = normalizeFormCellValue(cellValueRaw);
  const whereText = normalizeFormCellValue(where.value);

  switch (where.op) {
    case 'contains':
      return cellText.toLowerCase().includes(whereText.toLowerCase());
    case 'starts_with':
      return cellText.toLowerCase().startsWith(whereText.toLowerCase());
    case 'ends_with':
      return cellText.toLowerCase().endsWith(whereText.toLowerCase());
    case 'eq':
      {
        const leftGender = normalizeGenderToken(cellValueRaw);
        const rightGender = normalizeGenderToken(where.value);
        if (leftGender && rightGender) return leftGender === rightGender;
        return cellText.trim().toLowerCase() === whereText.trim().toLowerCase();
      }
    case 'ne':
      {
        const leftGender = normalizeGenderToken(cellValueRaw);
        const rightGender = normalizeGenderToken(where.value);
        if (leftGender && rightGender) return leftGender !== rightGender;
        return cellText.trim().toLowerCase() !== whereText.trim().toLowerCase();
      }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const left = toComparableNumber(cellValueRaw);
      const right = toComparableNumber(where.value);
      if (left == null || right == null) return false;
      if (where.op === 'gt') return left > right;
      if (where.op === 'gte') return left >= right;
      if (where.op === 'lt') return left < right;
      return left <= right;
    }
    default:
      return true;
  }
};

const resolveFormColumns = (detail: FormDetail, columnsArg: unknown): FormDetail['columns'] => {
  const tokens = parseFormColumnsArg(columnsArg);
  if (tokens.length === 0) return detail.columns;

  const loweredTokens = new Set(tokens.map(token => token.toLowerCase()));
  const selected = detail.columns.filter(column => {
    const id = String(column.id ?? '').toLowerCase();
    const name = String(column.name ?? '').toLowerCase();
    return loweredTokens.has(id) || loweredTokens.has(name);
  });
  return selected.length > 0 ? selected : detail.columns;
};

const inferImplicitFormWhere = (
  detail: FormDetail,
  query: string
): { column: string; op: FormWhereOperator; value: unknown; inferredBy: 'gender' } | null => {
  const gender = normalizeGenderToken(query);
  if (!gender) return null;

  const candidateColumns = detail.columns.filter(column => {
    const name = String(column.name ?? '').trim().toLowerCase();
    return name.includes('性别') || name.includes('gender') || name.includes('sex');
  });
  const target = candidateColumns[0] ?? null;
  if (!target) return null;

  return {
    column: target.id,
    op: 'eq',
    value: query,
    inferredBy: 'gender',
  };
};

const normalizeFormCellValue = (value: unknown): string => {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? '')).join(', ');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const doesFormRowMatchQuery = (
  row: { id?: string; cells?: Record<string, unknown> },
  columns: FormDetail['columns'],
  queryTerms: string[]
): boolean => {
  if (queryTerms.length === 0) return true;
  const values: string[] = [];
  if (row.id) values.push(String(row.id));
  const cells = row.cells ?? {};
  for (const column of columns) {
    values.push(normalizeFormCellValue(cells[column.id]));
  }
  const haystack = values.join(' ').toLowerCase();
  return queryTerms.every(term => haystack.includes(term.toLowerCase()));
};

const collectKnowledgeFileCandidates = (root: KnowledgeItem): KnowledgeFileCandidate[] => {
  const output: KnowledgeFileCandidate[] = [];

  const walk = (item: KnowledgeItem): void => {
    if (item.type === 'file') {
      const name = typeof item.path === 'string' && item.path.trim().length > 0
        ? getPathBaseName(item.path)
        : item.title;
      const content = typeof item.metadata?.content === 'string'
        ? item.metadata.content
        : undefined;
      output.push({ name, path: item.path, content });
      return;
    }
    if (Array.isArray(item.children)) {
      for (const child of item.children) {
        walk(child);
      }
    }
  };

  walk(root);
  return output;
};

// 深度思考图标组件 (Lucide Brain Icon)
const ThinkingIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginLeft: 6, opacity: 0.8, verticalAlign: 'middle' }}
    aria-label="支持深度思考"
  >
    <title>支持深度思考</title>
    <path d="M12 18V5"/>
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/>
    <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/>
    <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/>
    <path d="M18 18a4 4 0 0 0 2-7.464"/>
    <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/>
    <path d="M6 18a4 4 0 0 1-2-7.464"/>
    <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>
  </svg>
);

/**
 * 模型显示名称
 *只保留实际的模型名称
 * @param modelId 完整的模型ID（如：gemini:gemini-1.5-flash）
 * @returns 格式化后的模型名称（如：gemini-1.5-flash）
 */
const formatModelDisplayName = (modelId: string): string => {
  if (!modelId) return '';
  const colonIndex = modelId.indexOf(':');
  if (colonIndex > 0) {
    return modelId.substring(colonIndex + 1);
  }
  return modelId;
};

/**
 * 获取提供商显示名称
 * @param providerId 提供商ID
 * @param modelId 模型ID（用于从模型名称推断实际提供商）
 * @returns 提供商显示名称
 */
const getProviderDisplayName = (providerId: string, modelId?: string): string => {
  // 从模型 ID 中推断实际提供商（对于魔塔社区等聚合平台）
  if (modelId) {
    const lowerModelId = modelId.toLowerCase();
    if (lowerModelId.includes('glm') || lowerModelId.includes('zhipu')) {
      return '智谱AI';
    }
    if (lowerModelId.includes('deepseek')) {
      return 'DeepSeek';
    }
    if (lowerModelId.includes('qwen')) {
      return '通义千问';
    }
    if (lowerModelId.includes('baichuan')) {
      return '百川智能';
    }
  }
  
  // 根据提供商ID返回显示名称
  const providerNames: Record<string, string> = {
    'openai': 'OpenAI',
    'deepseek': 'DeepSeek',
    'groq': 'Groq',
    'gemini': 'Google',
    'modelscope': '魔塔社区',
    'zenmux': 'Zenmux',
    'custom': '自定义',
  };
  return providerNames[providerId.toLowerCase()] || providerId;
};

/**
 * 工具调用思考块组件（类似 Claude.ai 折叠式）
 */
interface ThinkingBlockProps {
  toolCalls?: Message['toolCalls'];
  thinkingContent?: string;
  isDeepThinking?: boolean;
  isThinkingPhase: boolean;
  elapsedSeconds?: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ toolCalls, thinkingContent, isDeepThinking, isThinkingPhase, isExpanded, onToggle }) => {
  const headerText = isDeepThinking
    ? (isThinkingPhase ? '思考中...' : '思考')
    : (isThinkingPhase ? '思考中...' : '思考');

  // 进行中时默认展开
  const effectiveExpanded = isThinkingPhase ? true : isExpanded;

  return (
    <div className={`thinking-block${isThinkingPhase ? ' thinking-block--active' : ' thinking-block--done'}`}>
      <div className="thinking-block__header" onClick={onToggle}>
        {isThinkingPhase && <span className="thinking-block__spinner" />}
        <span className="thinking-block__title">{headerText}</span>
        <span className={`thinking-block__chevron${effectiveExpanded ? ' expanded' : ''}`} />
      </div>
      {effectiveExpanded && (
        <div className="thinking-block__body">
          {thinkingContent && (
            <div className="thinking-block__reasoning">{thinkingContent}</div>
          )}
          {(toolCalls ?? []).map((tc, i) => (
              <div key={tc.uiId ?? i} className={`tool-call-item tool-call-${tc.status}`}>
                <span className="tool-call-dot" />
                <span className="tool-call-label">{tc.label}</span>
                {tc.summary && <span className="tool-call-summary">{tc.summary}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

/**
 * 解析消息内容，将 [TOOL_CALL:uiId] 占位符与文字块交错渲染
 */
interface DecompositionBlockProps {
  title: string;
  content: string;
  isStreaming?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

const DecompositionBlock: React.FC<DecompositionBlockProps> = ({
  title,
  content,
  isStreaming = false,
  isExpanded,
  onToggle
}) => {
  if (!content.trim() && !isStreaming) return null;

  return (
    <div className={`decomposition-block${isStreaming ? ' decomposition-block--active' : ''}`}>
      <div className="decomposition-block__header" onClick={onToggle}>
        {isStreaming && <span className="decomposition-block__spinner" />}
        <span className="decomposition-block__title">{title}</span>
        <span className={`decomposition-block__chevron${isExpanded ? ' expanded' : ''}`} />
      </div>
      {isExpanded && (
        <div className="decomposition-block__body">
          <AIResponseRenderer content={content} isStreaming={isStreaming} />
        </div>
      )}
    </div>
  );
};

function renderMessageBlocks(
  content: string,
  toolCalls: Message['toolCalls'],
  isStreaming: boolean
): React.ReactNode {
  if (!content) return <AIResponseRenderer content="" isStreaming={isStreaming} />;
  const MARKER = /\[TOOL_CALL:([^\]]+)\]/g;
  const parts: Array<{ type: 'text'; text: string } | { type: 'tool'; uiId: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MARKER.exec(content)) !== null) {
    const text = content.slice(lastIndex, match.index).replace(/^\n+|\n+$/g, '');
    if (text) parts.push({ type: 'text', text });
    parts.push({ type: 'tool', uiId: match[1] });
    lastIndex = match.index + match[0].length;
  }
  const tail = content.slice(lastIndex).replace(/^\n+/, '');
  if (tail) parts.push({ type: 'text', text: tail });

  if (parts.length === 0) {
    return <AIResponseRenderer content={content} isStreaming={isStreaming} />;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <AIResponseRenderer
              key={i}
              content={part.text}
              isStreaming={isStreaming && i === parts.length - 1}
            />
          );
        }
        const tc = toolCalls?.find(t => t.uiId === part.uiId);
        if (!tc) return null;
        return (
          <div key={i} className={`tool-call-item tool-call-${tc.status}`}>
            <span className="tool-call-dot" />
            <span className="tool-call-label">{tc.label}</span>
          </div>
        );
      })}
    </>
  );
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ onClose, onMoveLeft, onMoveRight, position = 'right', mode = 'sidebar' }) => {
  const isEditorTabMode = mode === 'editor-tab';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isMaximized = false;
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [subMenuType, setSubMenuType] = useState<'none' | 'model' | 'knowledge' | 'form' | 'skills' | 'memory' | 'decompositionRules' | 'writingRules' | 'mcpServer' | 'files'>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isDeepThinkingEnabled, setIsDeepThinkingEnabled] = useState(true);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [headerContextMenu, setHeaderContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(() => {
    return Boolean((window as any).__aiChatHistoryOpen);
  });
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat'); // 当前视图状态
  const [chatSettings, setChatSettings] = useState<AIChatSettingsConfig>(DEFAULT_CHAT_SETTINGS);
  const [toolThinkingExpanded, setToolThinkingExpanded] = useState<Map<string, boolean>>(new Map()); // 思考块展开状态（工具调用 + 深度思考）
  const [textContextMenu, setTextContextMenu] = useState<{ x: number; y: number; text: string } | null>(null); // 文本选择右键菜单
  const [currentFileName, setCurrentFileName] = useState<string>(''); // 当前打开的文件名
  const [currentFilePath, setCurrentFilePath] = useState<string>(''); // 当前打开标签页对应的文件路径
  const [formsList, setFormsList] = useState<FormInfo[]>([]); // 表单列表
  const [isLoadingForms, setIsLoadingForms] = useState(false); // 是否正在加载表单
  const [knowledgeBaseList, setKnowledgeBaseList] = useState<KnowledgeItem[]>([]); // 知识库列表
  const [isLoadingKnowledgeBases, setIsLoadingKnowledgeBases] = useState(false); // 是否正在加载知识库
  const [filesList, setFilesList] = useState<Array<{ name: string; path: string; type: 'file' | 'directory' }>>([]); // 文件列表
  const [isLoadingFiles, setIsLoadingFiles] = useState(false); // 是否正在加载文件
  const [skillsList, setSkillsList] = useState<Array<{ name: string; path: string; type: 'file' | 'directory' }>>([]); // 技能包列表
  const [isLoadingSkills, setIsLoadingSkills] = useState(false); // 是否正在加载技能包
  const [selectedSkills, setSelectedSkills] = useState<Array<{ name: string; path: string }>>([]); // 用户选中的技能包
  const [selectedFiles, setSelectedFiles] = useState<Array<{ name: string; path: string; type?: 'file' | 'directory' }>>([]); // 用户选中的文件
  const [selectedKbs, setSelectedKbs] = useState<Array<{ id: string; title: string }>>([]); // 用户选中的知识库
  const [selectedForms, setSelectedForms] = useState<Array<{ id: string; name: string }>>([]); // 用户选中的表单
  const [writingRuleDocuments, setWritingRuleDocuments] = useState<WritingRuleDocument[]>([]);
  const [newDecompositionRuleName, setNewDecompositionRuleName] = useState('');
  const [newDecompositionRuleInstruction, setNewDecompositionRuleInstruction] = useState('');
  const [agentMemoryStats, setAgentMemoryStats] = useState<{ usagePercentage: number; totalEntries: number }>({
    usagePercentage: 0,
    totalEntries: 0,
  });
  const [decompositionRules, setDecompositionRules] = useState<DecompositionRule[]>(() => cloneBuiltinDecompositionRules());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 消息容器 ref
  const panelRef = useRef<HTMLDivElement>(null);
  const tiptapRef = useRef<TipTapInputRef>(null);
  const contextButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerContextMenuRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const isInitialLoadRef = useRef(true); // 追踪是否为初始加载
  const providerCacheRef = useRef<{ modelId: string; actualModelId: string } | null>(null); // 缓存已初始化的 provider

  const [pendingToolConfirmation, setPendingToolConfirmation] = useState<PendingToolConfirmation | null>(null);
  const pendingToolConfirmationResolverRef = useRef<{
    id: string;
    resolve: (allowed: boolean) => void;
  } | null>(null);

  const decompositionRulesLoadedRef = useRef(false);
  const writingRulesLoadedRef = useRef(false);

  const handleInsertSlashCommand = useCallback((insertText: string) => {
    tiptapRef.current?.setText(insertText);
    setInput(insertText);
    setIsContextMenuOpen(false);
    setSubMenuType('none');
    setSearchQuery('');
    tiptapRef.current?.focus();
  }, []);

  const enabledDecompositionRules = getEnabledDecompositionRules(decompositionRules);
  const enabledWritingRuleDocuments = useMemo(
    () => writingRuleDocuments.filter(document => document.enabled && document.path.trim().length > 0),
    [writingRuleDocuments],
  );
  const getSelectedModelTabTitle = useCallback((): string => {
    if (!selectedModel) return '未选择模型';
    const selected = availableModels.find(model => model.modelId === selectedModel);
    const displayName = (selected?.displayName || formatModelDisplayName(selectedModel)).trim();
    return displayName || '未选择模型';
  }, [availableModels, selectedModel]);
  const openInEditorTab = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-editor-tab', {
      detail: {
        path: AI_CHAT_EDITOR_TAB_PATH,
        type: 'ai-chat',
        title: getSelectedModelTabTitle(),
      },
    }));
  }, [getSelectedModelTabTitle]);

  const refreshAgentMemoryStats = useCallback(() => {
    try {
      const stats = agentService.getMemoryStats();
      setAgentMemoryStats({
        usagePercentage: Number.isFinite(stats.usagePercentage) ? stats.usagePercentage : 0,
        totalEntries: Number.isFinite(stats.totalEntries) ? stats.totalEntries : 0,
      });
    } catch (error) {
      console.error('[AIChatPanel] 获取记忆统计失败:', error);
      setAgentMemoryStats({ usagePercentage: 0, totalEntries: 0 });
    }
  }, []);

  const handleClearAgentMemory = useCallback(() => {
    try {
      agentService.getMemory().clear();
      refreshAgentMemoryStats();
      toastService.success('已清空记忆');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AIChatPanel] 清空记忆失败:', error);
      toastService.error(`清空记忆失败: ${errorMessage}`);
    }
  }, [refreshAgentMemoryStats]);

  const handleToggleDecompositionRule = useCallback((ruleId: string) => {
    setDecompositionRules(prev => prev.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  }, []);

  const handleAddDecompositionRule = useCallback(() => {
    const name = newDecompositionRuleName.trim();
    const instruction = newDecompositionRuleInstruction.trim();
    if (!name || !instruction) {
      toastService.warning('请先输入规则名称和规则说明');
      return;
    }

    const identityKey = buildRuleIdentityKey(name, instruction);
    const existingRule = decompositionRules.find(
      rule => buildRuleIdentityKey(rule.name, rule.instruction) === identityKey,
    );

    if (existingRule) {
      if (!existingRule.enabled) {
        setDecompositionRules(prev =>
          prev.map(rule =>
            rule.id === existingRule.id ? { ...rule, enabled: true } : rule,
          ),
        );
        toastService.success('规则已存在，已自动启用');
      } else {
        toastService.info('规则已存在');
      }
      return;
    }

    const uniqueSeed = `${name}|${instruction}|${Date.now().toString()}`;
    setDecompositionRules(prev => [
      ...prev,
      {
        id: `custom-${hashText(uniqueSeed)}`,
        name,
        instruction,
        enabled: true,
        builtin: false,
      },
    ]);
    setNewDecompositionRuleName('');
    setNewDecompositionRuleInstruction('');
    toastService.success('已添加拆解规则');
  }, [decompositionRules, newDecompositionRuleInstruction, newDecompositionRuleName]);

  const handleDeleteDecompositionRule = useCallback((ruleId: string) => {
    setDecompositionRules(prev => prev.filter(rule => !(rule.id === ruleId && !rule.builtin)));
  }, []);

  const handleResetBuiltinDecompositionRules = useCallback(() => {
    setDecompositionRules(prev => {
      const customRules = prev.filter(rule => !rule.builtin);
      return [...cloneBuiltinDecompositionRules(), ...customRules];
    });
  }, []);

  const handleOpenDecompositionRulesTab = useCallback(() => {
    setSubMenuType('none');
    setIsContextMenuOpen(false);
    window.dispatchEvent(new CustomEvent('open-decomposition-rules', {
      detail: {
        rules: decompositionRules.map(rule => ({ ...rule })),
        writingRuleDocuments: writingRuleDocuments.map(document => ({ ...document })),
      },
    }));
  }, [decompositionRules, writingRuleDocuments]);

  const handleImportWritingRuleDocuments = useCallback(async () => {
    try {
      const dialogResult = await window.electron?.file?.showOpenDialog?.({
        title: '导入写作规则',
        filters: [
          { name: '规则文档 (*.md, *.txt)', extensions: ['md', 'txt'] },
          { name: 'Markdown (*.md)', extensions: ['md'] },
          { name: 'Text (*.txt)', extensions: ['txt'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (!dialogResult || dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return;
      }

      const supportedPaths = dialogResult.filePaths
        .map(path => path.trim())
        .filter(path => path.length > 0 && isSupportedRuleDocumentFile(path));
      if (supportedPaths.length === 0) {
        toastService.error('仅支持导入 .md 或 .txt 文档');
        return;
      }

      if (supportedPaths.length < dialogResult.filePaths.length) {
        toastService.warning(`已忽略 ${dialogResult.filePaths.length - supportedPaths.length} 个非 .md/.txt 文件`);
      }

      const nextDocuments = writingRuleDocuments.map(document => ({ ...document }));
      const indexByPath = new Map<string, number>();
      nextDocuments.forEach((document, index) => {
        indexByPath.set(normalizeComparableRuleDocumentPath(document.path), index);
      });
      let addedCount = 0;
      let enabledCount = 0;

      for (const filePath of supportedPaths) {
        const pathKey = normalizeComparableRuleDocumentPath(filePath);
        const existingIndex = indexByPath.get(pathKey);
        if (typeof existingIndex === 'number') {
          const existingDocument = nextDocuments[existingIndex];
          if (!existingDocument.enabled) {
            nextDocuments[existingIndex] = { ...existingDocument, enabled: true };
            enabledCount += 1;
          }
          continue;
        }

        const documentName = filePath.split(/[/\\]/).pop() || filePath;
        nextDocuments.push({
          id: `writing-doc-${hashText(pathKey)}`,
          name: documentName,
          path: filePath,
          enabled: true,
        });
        indexByPath.set(pathKey, nextDocuments.length - 1);
        addedCount += 1;
      }

      if (addedCount === 0 && enabledCount === 0) {
        toastService.info('没有新的写作规则可导入');
        return;
      }

      setWritingRuleDocuments(nextDocuments);

      if (enabledCount > 0) {
        toastService.success(`导入完成：新增 ${addedCount} 个文档，启用已有 ${enabledCount} 个文档`);
      } else {
        toastService.success(`导入完成：新增 ${addedCount} 个写作规则`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`导入写作规则失败: ${errorMessage}`);
      console.error('[AIChatPanel] 导入写作规则失败:', error);
    }
  }, [writingRuleDocuments]);

  const handleToggleWritingRuleDocument = useCallback((documentId: string) => {
    setWritingRuleDocuments(prev => prev.map(document =>
      document.id === documentId ? { ...document, enabled: !document.enabled } : document,
    ));
  }, []);

  const handleDeleteWritingRuleDocument = useCallback((documentId: string) => {
    setWritingRuleDocuments(prev => prev.filter(document => document.id !== documentId));
  }, []);

  const handleEditWritingRuleDocument = useCallback(async (document: WritingRuleDocument) => {
    try {
      const filePath = document.path.trim();
      if (!filePath) {
        toastService.warning('规则文档路径无效');
        return;
      }

      const content = await window.electron?.ipcRenderer.invoke('read-file', filePath);
      if (typeof content !== 'string') {
        toastService.error('读取规则文档失败');
        return;
      }

      window.dispatchEvent(new CustomEvent('open-file', {
        detail: {
          path: filePath,
          name: document.name,
          content,
          isPreview: false,
        },
      }));
      setSubMenuType('none');
      setIsContextMenuOpen(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`打开规则文档失败: ${errorMessage}`);
      console.error('[AIChatPanel] 打开规则文档失败:', error);
    }
  }, []);

  const handleClearWritingRuleDocuments = useCallback(() => {
    if (writingRuleDocuments.length === 0) {
      toastService.info('当前没有可清空的写作规则');
      return;
    }
    setWritingRuleDocuments([]);
    toastService.success('已清空写作规则');
  }, [writingRuleDocuments.length]);

  const appendActLog = useCallback((
    messageId: string,
    payload: {
      key?: string;
      kind: ActLog['kind'];
      title: string;
      detail?: string;
      status?: ActLog['status'];
    }
  ) => {
    const event: ActLog = {
      id: createActLogId(),
      ts: Date.now(),
      key: payload.key,
      kind: payload.kind,
      title: payload.title,
      detail: payload.detail,
      status: payload.status ?? 'info',
    };

    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, contentBlocks: [...(msg.contentBlocks ?? []), { type: 'act', act: event }] }
        : msg
    ));
  }, []);

  const upsertActLog = useCallback((
    messageId: string,
    payload: {
      key: string;
      kind: ActLog['kind'];
      title: string;
      detail?: string;
      status?: ActLog['status'];
    }
  ) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;
      const blocks = [...(msg.contentBlocks ?? [])];
      const idx = blocks.findIndex(
        block => block.type === 'act' && block.act.key === payload.key
      );
      if (idx >= 0) {
        const existing = blocks[idx];
        if (existing.type === 'act') {
          blocks[idx] = {
            type: 'act',
            act: {
              ...existing.act,
              ts: Date.now(),
              kind: payload.kind,
              title: payload.title,
              detail: payload.detail,
              status: payload.status ?? existing.act.status,
            },
          };
        }
      } else {
        blocks.push({
          type: 'act',
          act: {
            id: createActLogId(),
            ts: Date.now(),
            key: payload.key,
            kind: payload.kind,
            title: payload.title,
            detail: payload.detail,
            status: payload.status ?? 'info',
          },
        });
      }

      return { ...msg, contentBlocks: blocks };
    }));
  }, []);

  const upsertTodoBlock = useCallback((
    messageId: string,
    items: TodoItemView[],
    options?: {
      title?: string;
      isStreaming?: boolean;
    }
  ) => {
    const key = `${messageId}-todo`;
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;
      const blocks = [...(msg.contentBlocks ?? [])];
      const nextBlock: ContentBlock = {
        type: 'todo',
        key,
        title: options?.title || 'Todo',
        items,
        isStreaming: options?.isStreaming ?? false,
      };
      const existingIndex = blocks.findIndex(block => block.type === 'todo' && block.key === key);
      if (existingIndex >= 0) {
        blocks[existingIndex] = nextBlock;
      } else {
        blocks.push(nextBlock);
      }
      return { ...msg, contentBlocks: blocks };
    }));
  }, []);

  const appendToolLogBlock = useCallback((
    messageId: string,
    tool: ToolLog
  ) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;
      return {
        ...msg,
        contentBlocks: [...(msg.contentBlocks ?? []), { type: 'tool', tool }],
        toolCalls: [...(msg.toolCalls ?? []), tool],
      };
    }));
  }, []);

  const resolveLatestPendingToolLog = useCallback((
    messageId: string,
    toolName: string,
    status: 'success' | 'error',
    summary?: string,
    updates?: {
      detail?: string;
      command?: string;
      output?: string;
    }
  ) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== messageId) return msg;

      let resolved = false;
      const applyResolution = (tool: ToolLog): ToolLog => {
        if (!resolved && tool.name === toolName && tool.status === 'pending') {
          resolved = true;
          const nextTool: ToolLog = {
            ...tool,
            status,
            summary: summary ?? tool.summary,
          };
          if (updates) {
            if (typeof updates.detail === 'string') {
              nextTool.detail = updates.detail;
            }
            if (typeof updates.command === 'string') {
              nextTool.command = updates.command;
            }
            if (typeof updates.output === 'string') {
              nextTool.output = updates.output;
            }
          }
          return nextTool;
        }
        return tool;
      };

      const nextBlocks = (msg.contentBlocks ?? []).map(block => {
        if (block.type !== 'tool') return block;
        return {
          type: 'tool' as const,
          tool: applyResolution(block.tool),
        };
      });

      const nextToolCalls = (msg.toolCalls ?? []).map(applyResolution);

      return {
        ...msg,
        contentBlocks: nextBlocks,
        toolCalls: nextToolCalls,
      };
    }));
  }, []);

  const settlePendingToolConfirmation = useCallback((allowed: boolean) => {
    const pending = pendingToolConfirmationResolverRef.current;
    if (!pending) return;
    pendingToolConfirmationResolverRef.current = null;
    setPendingToolConfirmation(null);
    pending.resolve(allowed);
  }, []);

  const requestToolConfirmation = useCallback((
    toolName: string,
    params: Record<string, unknown>
  ): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      // Keep only one pending request to avoid stacked popups.
      const previous = pendingToolConfirmationResolverRef.current;
      if (previous) {
        previous.resolve(false);
      }

      const id = `tool-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingToolConfirmationResolverRef.current = { id, resolve };
      setPendingToolConfirmation({
        id,
        toolName,
        params,
        detail: buildToolCallDetail(toolName, params),
      });
    });
  }, []);

  const handleToolConfirmActionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, allowed: boolean) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      settlePendingToolConfirmation(allowed);
    },
    [settlePendingToolConfirmation]
  );

  useEffect(() => {
    return () => {
      const pending = pendingToolConfirmationResolverRef.current;
      if (!pending) return;
      pendingToolConfirmationResolverRef.current = null;
      pending.resolve(false);
    };
  }, []);

  const syncEditorTabContent = useCallback((
    content: string,
    path?: string,
    name?: string,
    markDirty: boolean = false
  ) => {
    if (typeof content !== 'string') return;
    window.dispatchEvent(new CustomEvent('editor:replace-active-tab-content', {
      detail: {
        content,
        path,
        name,
        markDirty,
      },
    }));
  }, []);

  const waitForActFrame = useCallback(
    async (ms = 180): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
    []
  );
  
  // 滚动条淡入淡出效果
  const DEFAULT_OPACITY = 0.5; // 默认透明度
  const [scrollbarOpacity, setScrollbarOpacity] = useState(0); // 初始值，完全透明
  const fadeTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 淡入：立即中断所有动画并显示滚动条
  const fadeIn = useCallback(() => {
    // 取消已有进行中的动画
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      clearTimeout(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // 立即设置为默认透明度
    setScrollbarOpacity(DEFAULT_OPACITY);
  }, [DEFAULT_OPACITY]);

  // 淡出：从默认透明度逐步降低到完全消失
  const fadeOut = useCallback(() => {
    const step = 0.01; // 每次减少 1%
    const interval = 10; // 10ms 减少一次
    let currentOpacity = DEFAULT_OPACITY; 
    
    const animate = () => {
      currentOpacity -= step;
      
      // 降低到 0 时完全消失
      if (currentOpacity <= 0) {
        setScrollbarOpacity(0);
        return;
      }
      
      setScrollbarOpacity(currentOpacity);
      animationFrameRef.current = window.setTimeout(() => {
        animate();
      }, interval) as unknown as number;
    };

    animate();
  }, [DEFAULT_OPACITY]);

  // 处理鼠标进入
  const handleMessagesMouseEnter = useCallback(() => {
    fadeIn();
  }, [fadeIn]);

  // 处理鼠标离开
  const handleMessagesMouseLeave = useCallback(() => {
    fadeOut();
  }, [fadeOut]);

  // 处理插入到文档
  const handleInsertToDocument = useCallback((text: string) => {
    try {
      // 获取全局 Monaco 编辑器实例
      const editor = (window as unknown as { __monacoEditor?: { executeEdits: (source: string, edits: Array<{ range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }>) => void; getPosition: () => { lineNumber: number; column: number } | null; focus: () => void } }).__monacoEditor;
      
      if (!editor) {
        console.warn('[AIChatPanel] 没有找到活动的编辑器');
        // TODO: 显示通知提示用户打开一个文档
        return;
      }

      // 获取当前光标位置
      const position = editor.getPosition();
      if (!position) {
        console.warn('[AIChatPanel] 无法获取光标位置');
        return;
      }

      // 插入文本到光标位置
      editor.executeEdits('ai-chat-panel', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: text
      }]);

      // 聚焦编辑器
      editor.focus();

      console.log('[AIChatPanel] 已插入文本到文档');
    } catch (error) {
      console.error('[AIChatPanel] 插入文本失败:', error);
    }
  }, []);

  // 处理复制文本
  const handleCopyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log('[AIChatPanel] Text copied to clipboard');
      // TODO: 显示通知提示用户复制成功
    } catch (error) {
      console.error('[AIChatPanel] 复制文本失败:', error);
    }
  }, []);

  // 处理添加到聊天
  const handleAddToChat = useCallback((text: string) => {
    // 将文本追加到聊天输入框
    setInput((prevInput) => {
      // 如果输入框已有内容，在末尾添加换行后再添加文本
      if (prevInput.trim()) {
        return prevInput + '\n' + text;
      }
      // 如果输入框为空，直接设置文本
      return text;
    });

    // 聚焦到输入框
    setTimeout(() => {
      tiptapRef.current?.focus();
    }, 0);

    console.log('[AIChatPanel] Added text to chat input');
  }, []);

  // 处理插入到内联编辑
  const handleInsertToInlineEdit = useCallback((text: string) => {
    try {
      // 获取全局内联聊天打开函数
      const openInlineChat = (window as unknown as { __openInlineChat?: (initialText?: string) => void }).__openInlineChat;
      
      if (!openInlineChat) {
        console.warn('[AIChatPanel] Inline chat opener not found');
        // TODO: 显示通知提示用户打开一个文档
        return;
      }

      // 打开内联聊天并填充文本
      openInlineChat(text);

      console.log('[AIChatPanel] 已插入文本到内联编辑');
    } catch (error) {
      console.error('[AIChatPanel] 插入文本到内联编辑失败:', error);
    }
  }, []);

  // 处理 assistant 消息中的文本选中
  const handleAssistantTextSelection = useCallback((event: React.MouseEvent) => {
    // 只处理右键点击
    if (event.button !== 2) return;

    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') {
      return;
    }

    const selectedText = selection.toString();
    
    // Ensure selected text belongs to an assistant message.
    const target = event.target as HTMLElement;
    const messageContent = target.closest('.message.assistant .message-content');
    
    if (!messageContent) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // 显示右键菜单
    setTextContextMenu({
      x: event.clientX,
      y: event.clientY,
      text: selectedText
    });
  }, []);

  // 清理定时器和动画
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }
    };
  }, []);

  // Track active editor file changes.
  useEffect(() => {
    // Initialize from global active tab context.
    const tabTitle = (window as any).__currentTabTitle;
    const tabPath = (window as any).__currentTabPath;
    setCurrentFileName(tabTitle || '');
    setCurrentFilePath(tabPath || '');

    // Listen for tab-change events and sync title/path.
    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent<{ title?: string; path?: string }>).detail;
      setCurrentFileName(detail?.title || '');
      setCurrentFilePath(detail?.path || '');
    };

    window.addEventListener('editor:active-tab-changed', handleTabChange);

    return () => {
      window.removeEventListener('editor:active-tab-changed', handleTabChange);
    };
  }, []);

  // 注入滚动条样式
  useEffect(() => {
    if (!messagesContainerRef.current) return;

    const styleId = 'ai-chat-panel-scrollbar-style';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // Read CSS variable color and convert to RGBA.
    const getColorWithOpacity = (cssVar: string, fallbackColor: string, opacity: number) => {
      const computedStyle = getComputedStyle(document.documentElement);
      const color = computedStyle.getPropertyValue(cssVar).trim() || fallbackColor;
      
      // If the color is already rgba().
      if (color.startsWith('rgba')) {
        return color.replace(/[\d.]+\)$/g, `${opacity})`);
      }
      
      // If the color is rgb(), convert to rgba().
      if (color.startsWith('rgb')) {
        return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
      }
      
      // If the color is hex, convert to rgba().
      if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      
      return color;
    };

    // Apply theme color with dynamic opacity.
    const normalColor = getColorWithOpacity(
      '--ws-scrollbarSlider-background',
      'rgba(121, 121, 121, 0.4)',
      scrollbarOpacity
    );
    
    const hoverColor = getColorWithOpacity(
      '--ws-scrollbarSlider-hoverBackground',
      'rgba(100, 100, 100, 0.7)',
      scrollbarOpacity
    );
    
    const activeColor = getColorWithOpacity(
      '--ws-scrollbarSlider-activeBackground',
      'rgba(85, 85, 85, 0.8)',
      scrollbarOpacity
    );

    styleElement.textContent = `
      .ai-chat-panel-messages::-webkit-scrollbar-thumb {
        background: ${normalColor} !important;
      }
      .ai-chat-panel-messages::-webkit-scrollbar-thumb:hover {
        background: ${hoverColor} !important;
      }
      .ai-chat-panel-messages::-webkit-scrollbar-thumb:active {
        background: ${activeColor} !important;
      }
    `;
  }, [scrollbarOpacity]);

  // 加载可用模型
  const loadModels = async () => {
    try {
      console.log('[AIChatPanel] Loading model list from cache...');
      
      const cachedModels = await getCachedModels();
      console.log('[AIChatPanel] 获取到模型列表，数量:', cachedModels.length);
      
      if (cachedModels.length === 0) {
        console.warn('[AIChatPanel] 未获取到可用模型');
        console.warn('  1. Check whether AI model config is set (API key / endpoint).');
        console.warn('  2. Check whether a concrete model is selected.');
      }
      
      // Convert to ModelInfo and filter out disabled models.
      const modelInfos: ModelInfo[] = cachedModels
        .filter(model => {
          // Extract real model name from model ID (configName:modelName).
          const modelName = model.modelId.includes(':') ? model.modelId.split(':')[1] : model.modelId;
          return isModelEnabled(modelName);
        })
        .map(model => {
          console.log('[AIChatPanel] 模型信息:', model.modelId, 'capabilities:', model.capabilities);
          return {
            modelId: model.modelId,
            configName: model.configName,
            providerId: model.providerId,
            displayName: model.displayName,
            capabilities: model.capabilities
          };
        });
      
      setAvailableModels(modelInfos);
      if (modelInfos.length > 0 && !selectedModel) {
        // Try restoring previously selected model from persistence.
        const savedModel = await electronStore.get('ai-chat-selected-model') as string | undefined;
        if (savedModel && modelInfos.some(m => m.modelId === savedModel)) {
          setSelectedModel(savedModel);
          console.log('[AIChatPanel] Restored previous model:', savedModel);
        } else {
          setSelectedModel(modelInfos[0].modelId);
          console.log('[AIChatPanel] 默认选择模型:', modelInfos[0].modelId);
        }
      }
    } catch (error) {
      console.error('[AIChatPanel] 加载模型失败:', error);
    }
  };

  const scrollToBottom = (instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  // Load history session (wrapped with useCallback for stability).
  const loadHistorySession = React.useCallback(async (sessionId: string, closeMenu = true) => {
    try {
      console.log('[AIChatPanel] Start loading history session:', sessionId);
      
      // 关闭历史记录菜单（如果需要）
      if (closeMenu) {
        setIsHistoryOpen(false);
      }
      
      // 获取历史消息
      const result = await window.electronAPI?.chatHistory?.getMessages(sessionId);
      if (result?.success && result.data) {
        console.log('[AIChatPanel] Raw history messages from DB:', result.data);
        
        // Convert DB messages to component message format.
        const historyMessages: Message[] = result.data.map(msg => {
          const message: Message = {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            model: msg.model,
            reasoning: msg.reasoning
          };

          // If reasoning exists, convert it into thinking step data.
          if (msg.reasoning && msg.role === 'assistant') {
            console.log('[AIChatPanel] Found reasoning content, length:', msg.reasoning.length, 'messageId:', msg.id);
            
            // Estimate thinking duration from reasoning content length.
            const estimatedDuration = Math.round(msg.reasoning.length / 10);
            
            message.thinkingSteps = [{
              id: `thinking-${msg.id}`,
              title: 'Deep thinking',
              content: msg.reasoning,
              status: 'completed',
              timestamp: new Date(msg.timestamp),
              duration: estimatedDuration // 添加估算耗时
            }];
            // console.log('[AIChatPanel] 已创建思考步骤，估算耗时:', estimatedDuration, 'ms');
          } else if (msg.role === 'assistant') {
          }

          return message;
        });
        
        console.log('[AIChatPanel] 转换后的消息列表:', historyMessages);
        
        // 标记初始化加载完成，后续滚动采用 smooth 行为
        isInitialLoadRef.current = true;
        
        // 更新消息列表和当前会话ID
        setMessages(historyMessages);
        setCurrentSessionId(sessionId);
        console.log('[AIChatPanel] History session loaded:', sessionId, 'message count:', historyMessages.length);
        
        // Scroll to bottom instantly so latest message is visible.
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        }, 100);
      } else {
        console.warn('[AIChatPanel] Failed to load history: no data returned');
      }
    } catch (error) {
      console.error('[AIChatPanel] 加载历史会话失败:', error);
    }
  }, []); // No external dependencies.

  // 初始化聊天会话并恢复当前会话 ID
  useEffect(() => {
    const initializeChat = async () => {
      try {
        // Try reading existing sessions first.
        const result = await window.electronAPI?.chatHistory?.getSessions();
        if (result?.success && result.data && result.data.length > 0) {
          // 按更新时间排序，优先加载最新会话
          const sessions = result.data.sort((a, b) => b.updatedAt - a.updatedAt);
          const latestSession = sessions[0];
          
          console.log('[AIChatPanel] Found history sessions, auto-loading latest:', latestSession.id);
          
          // 自动加载最新会话，避免创建新会话覆盖历史
          await loadHistorySession(latestSession.id, false);
        } else {
          // 没有历史记录，生成新的会话ID
          const sessionId = `session-${Date.now()}`;
          setCurrentSessionId(sessionId);
          console.log('[AIChatPanel] 无历史记录，生成新会话ID:', sessionId);
        }
      } catch (error) {
        console.error('[AIChatPanel] Failed to initialize chat:', error);
        // 出错时生成新的会话ID
        const sessionId = `session-${Date.now()}`;
        setCurrentSessionId(sessionId);
      }
    };

    initializeChat();
  }, []); // Run once on mount.

  useEffect(() => {
    // First load: restore model-enabled state, then load models.
    const initModels = async () => {
      await loadModelEnabledStatesFromDB();
      loadModels();
    };
    initModels();
    
    // 监听模型缓存更新事件
    const handleModelsCacheUpdate = () => {
      console.log('[AIChatPanel] 模型缓存已更新，重新加载模型列表...');
      loadModels();
    };
    
    // Listen for model-enabled state change events.
    const handleModelEnabledChanged = () => {
      console.log('[AIChatPanel] Model-enabled state changed, reloading model list...');
      loadModels();
    };
    
    window.addEventListener('models-cache-updated', handleModelsCacheUpdate);
    window.addEventListener('model-enabled-changed', handleModelEnabledChanged);
    
    return () => {
      window.removeEventListener('models-cache-updated', handleModelsCacheUpdate);
      window.removeEventListener('model-enabled-changed', handleModelEnabledChanged);
    };
  }, []);

  useEffect(() => {
    if (!isEditorTabMode) return;
    window.dispatchEvent(new CustomEvent('editor:update-active-tab-title', {
      detail: { title: getSelectedModelTabTitle() },
    }));
  }, [getSelectedModelTabTitle, isEditorTabMode]);

  useEffect(() => {
    (window as any).__aiChatHistoryOpen = isHistoryOpen;
  }, [isHistoryOpen]);

  useEffect(() => {
    if (currentView !== 'chat' && isHistoryOpen) {
      setIsHistoryOpen(false);
    }
  }, [currentView, isHistoryOpen]);

  // 加载AI聊天设置
  useEffect(() => {
    const loadChatSettings = async () => {
      try {
        const savedSettings = await electronStore.get('ai-chat-settings');
        if (savedSettings) {
          // Backward compatibility for settings without searchEngine field.
          const settingsWithDefaults = {
            ...DEFAULT_CHAT_SETTINGS,
            ...savedSettings
          };
          setChatSettings(settingsWithDefaults);
          console.log('[AIChatPanel] 已加载保存的聊天设置');
        }
      } catch (error) {
        console.error('[AIChatPanel] 加载聊天设置失败:', error);
      }
    };
    
    loadChatSettings();
  }, []);

  // 保存AI聊天设置
  useEffect(() => {
    const saveChatSettings = async () => {
      try {
        await electronStore.set('ai-chat-settings', chatSettings);
        console.log('[AIChatPanel] Chat settings saved');
      } catch (error) {
        console.error('[AIChatPanel] 保存聊天设置失败:', error);
      }
    };
    
    // 跳过初始渲染，只在设置变化时保存
    if (chatSettings !== DEFAULT_CHAT_SETTINGS) {
      saveChatSettings();
    }
  }, [chatSettings]);

  useEffect(() => {
    let disposed = false;
    const loadDecompositionRules = async () => {
      try {
        const savedRules = await electronStore.get(DECOMPOSITION_RULE_STORE_KEY);
        if (!disposed) {
          setDecompositionRules(normalizeDecompositionRules(savedRules));
        }
      } catch (error) {
        console.error('[AIChatPanel] 加载拆解规则失败:', error);
      } finally {
        if (!disposed) {
          decompositionRulesLoadedRef.current = true;
        }
      }
    };

    loadDecompositionRules();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!decompositionRulesLoadedRef.current) return;
    let disposed = false;

    const saveDecompositionRules = async () => {
      try {
        const success = await electronStore.set(DECOMPOSITION_RULE_STORE_KEY, decompositionRules);
        if (!success || disposed) return;

        window.dispatchEvent(new CustomEvent(DECOMPOSITION_RULE_UPDATED_EVENT, {
          detail: {
            source: DECOMPOSITION_RULE_UPDATED_SOURCE,
            updatedAt: Date.now(),
          },
        }));
      } catch (error) {
        console.error('[AIChatPanel] 保存拆解规则失败:', error);
      }
    };

    saveDecompositionRules();

    return () => {
      disposed = true;
    };
  }, [decompositionRules]);

  useEffect(() => {
    const handleDecompositionRulesUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source === DECOMPOSITION_RULE_UPDATED_SOURCE) {
        return;
      }

      try {
        const savedRules = await electronStore.get(DECOMPOSITION_RULE_STORE_KEY);
        const normalized = normalizeDecompositionRules(savedRules);
        setDecompositionRules(prev =>
          areDecompositionRulesEqual(prev, normalized) ? prev : normalized,
        );
      } catch (error) {
        console.error('[AIChatPanel] 同步拆解规则失败:', error);
      }
    };

    window.addEventListener(DECOMPOSITION_RULE_UPDATED_EVENT, handleDecompositionRulesUpdated as EventListener);
    return () => {
      window.removeEventListener(DECOMPOSITION_RULE_UPDATED_EVENT, handleDecompositionRulesUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadWritingRuleDocuments = async () => {
      try {
        const savedDocuments = await electronStore.get(WRITING_RULE_STORE_KEY);
        if (!disposed) {
          setWritingRuleDocuments(normalizeWritingRuleDocuments(savedDocuments));
        }
      } catch (error) {
        console.error('[AIChatPanel] 加载写作规则文档失败:', error);
      } finally {
        if (!disposed) {
          writingRulesLoadedRef.current = true;
        }
      }
    };

    loadWritingRuleDocuments();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!writingRulesLoadedRef.current) return;
    let disposed = false;

    const saveWritingRuleDocuments = async () => {
      try {
        const success = await electronStore.set(WRITING_RULE_STORE_KEY, writingRuleDocuments);
        if (!success || disposed) return;

        window.dispatchEvent(new CustomEvent(WRITING_RULE_UPDATED_EVENT, {
          detail: {
            source: WRITING_RULE_UPDATED_SOURCE,
            updatedAt: Date.now(),
          },
        }));
      } catch (error) {
        console.error('[AIChatPanel] 保存写作规则文档失败:', error);
      }
    };

    saveWritingRuleDocuments();

    return () => {
      disposed = true;
    };
  }, [writingRuleDocuments]);

  useEffect(() => {
    const handleWritingRulesUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source === WRITING_RULE_UPDATED_SOURCE) {
        return;
      }

      try {
        const savedDocuments = await electronStore.get(WRITING_RULE_STORE_KEY);
        const normalized = normalizeWritingRuleDocuments(savedDocuments);
        setWritingRuleDocuments(prev =>
          areWritingRuleDocumentsEqual(prev, normalized) ? prev : normalized,
        );
      } catch (error) {
        console.error('[AIChatPanel] 同步写作规则文档失败:', error);
      }
    };

    window.addEventListener(WRITING_RULE_UPDATED_EVENT, handleWritingRulesUpdated as EventListener);
    return () => {
      window.removeEventListener(WRITING_RULE_UPDATED_EVENT, handleWritingRulesUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    // Use instant on initial load, smooth on subsequent updates.
    scrollToBottom(isInitialLoadRef.current);
    // Mark initial load as consumed after first scroll.
    if (isInitialLoadRef.current && messages.length > 0) {
      isInitialLoadRef.current = false;
    }
  }, [messages]);

  // Close context menu when clicking outside.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isContextMenuOpen &&
        contextMenuRef.current &&
        contextButtonRef.current &&
        !contextMenuRef.current.contains(event.target as Node) &&
        !contextButtonRef.current.contains(event.target as Node)
      ) {
        setIsContextMenuOpen(false);
        setSubMenuType('none');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isContextMenuOpen]);

  // 点击外部关闭 header 右键菜单
  useEffect(() => {
    if (!headerContextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is inside header or menu.
      const isInsideHeader = headerRef.current?.contains(target);
      const isInsideMenu = headerContextMenuRef.current?.contains(target);
      
      if (!isInsideHeader && !isInsideMenu) {
        closeHeaderContextMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeHeaderContextMenu();
      }
    };

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [headerContextMenu]);

  // 同步思考块展开状态，确保新消息默认展开
  useEffect(() => {
    setToolThinkingExpanded(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const msg of messages) {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          if (msg.isThinkingPhase && !next.has(msg.id)) {
            next.set(msg.id, true);
            changed = true;
          } else if (!msg.isThinkingPhase && next.get(msg.id) === true) {
            next.set(msg.id, false);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [messages]);

  // 新建聊天
  const createNewChat = () => {
    // 生成新的会话ID
    const sessionId = `session-${Date.now()}`;
    
    // 清空当前消息
    setMessages([]);
    setCurrentSessionId(sessionId);
    console.log('[AIChatPanel] New chat created (sessionId):', sessionId);
  };

  // Toggle context menu visibility.
  const toggleContextMenu = () => {
    const newState = !isContextMenuOpen;
    setIsContextMenuOpen(newState);
    
    // Focus search input when opening the menu.
    if (newState) {
      refreshAgentMemoryStats();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      // Clear search query when closing the menu.
      setSearchQuery('');
    }
  };

  // 处理上下文菜单项点击
  const handleContextMenuItemClick = (action: string) => {
    console.log(`[AIChatPanel] Context menu click: ${action}`);

    // Trigger event or show second-level panel based on action.
    switch (action) {
      case 'snippets':
        // Open bottom panel and switch to snippets tab.
        setIsContextMenuOpen(false);
        setSubMenuType('none');
        window.dispatchEvent(new CustomEvent('open-panel', {
          detail: { view: 'snippets' }
        }));
        break;
      case 'knowledge':
        // Show knowledge submenu and load knowledge list.
        setSubMenuType('knowledge');
        setIsLoadingKnowledgeBases(true);
        knowledgeBaseService.loadFromStorage().then(data => {
          setKnowledgeBaseList(data.created);
          setIsLoadingKnowledgeBases(false);
        }).catch(err => {
          console.error('[AIChatPanel] Failed to load knowledge list:', err);
          setIsLoadingKnowledgeBases(false);
        });
        break;
      case 'files':
        // 显示文件&文件夹二级面板并加载文件列表
        setSubMenuType('files');
        setIsLoadingFiles(true);
        (async () => {
          try {
            // Get current workspace path.
            const workspaceResult = await (window as any).electron?.workspace?.getDir();
            if (workspaceResult?.success && workspaceResult.data) {
              const workspacePath = workspaceResult.data;
              // Read files/folders under workspace root.
              const treeResult = await (window as any).electron?.folder?.readTree(workspacePath);
              if (treeResult?.success && treeResult.data && Array.isArray(treeResult.data)) {
                // Exclude .wstudio directory.
                const filteredData = treeResult.data.filter((item: any) => item.name !== '.wstudio');
                // 分离文件夹和文件，文件夹在前
                const folders = filteredData.filter((item: any) => item.type === 'directory');
                const files = filteredData.filter((item: any) => item.type !== 'directory');
                setFilesList([...folders, ...files].map((item: any) => ({
                  name: item.name,
                  path: item.path,
                  type: item.type === 'directory' ? 'directory' : 'file'
                })));
              } else {
                setFilesList([]);
              }
            } else {
              setFilesList([]);
            }
          } catch (err) {
            console.error('[AIChatPanel] 获取文件列表失败:', err);
            setFilesList([]);
          } finally {
            setIsLoadingFiles(false);
          }
        })();
        break;
      case 'form':
        // Show forms submenu and load forms list.
        setSubMenuType('form');
        setIsLoadingForms(true);
        tableReferenceService.getAllForms().then(forms => {
          setFormsList(forms);
          setIsLoadingForms(false);
        }).catch(err => {
          console.error('[AIChatPanel] 获取表单列表失败:', err);
          setIsLoadingForms(false);
        });
        break;
      case 'skills':
        // 显示技能包子菜单并加载 .wstudio/skills 列表
        setSubMenuType('skills');
        setIsLoadingSkills(true);
        (async () => {
          try {
            // Get current workspace path.
            const workspaceResult = await (window as any).electron?.workspace?.getDir();
            if (workspaceResult?.success && workspaceResult.data) {
              const workspacePath = workspaceResult.data;
              const skillsPath = workspacePath + '/.wstudio/skills';
              // 读取 .wstudio/skills 目录下的技能包
              const treeResult = await (window as any).electron?.folder?.readTree(skillsPath);
              if (treeResult?.success && treeResult.data && Array.isArray(treeResult.data)) {
                // 分离文件夹和文件，文件夹在前
                const folders = treeResult.data.filter((item: any) => item.type === 'directory');
                const files = treeResult.data.filter((item: any) => item.type !== 'directory');
                setSkillsList([...folders, ...files].map((item: any) => ({
                  name: item.name,
                  path: item.path,
                  type: item.type === 'directory' ? 'directory' : 'file'
                })));
              } else {
                setSkillsList([]);
              }
            } else {
              setSkillsList([]);
            }
          } catch (err) {
            console.error('[AIChatPanel] 加载技能包失败:', err);
            setSkillsList([]);
          } finally {
            setIsLoadingSkills(false);
          }
        })();
        break;
      case 'memory':
        refreshAgentMemoryStats();
        setSubMenuType('memory');
        break;
      case 'decompositionRules':
        setSubMenuType('decompositionRules');
        break;
      case 'writingRules':
        setSubMenuType('writingRules');
        break;
      case 'mcpServer':
        // 显示 MCP Server 二级面板
        setSubMenuType('mcpServer');
        break;
      case 'clear':
        // 清除对话
        setIsContextMenuOpen(false);
        setSubMenuType('none');
        setMessages([]);
        break;
      case 'search':
        // 打开全局搜索
        setIsContextMenuOpen(false);
        setSubMenuType('none');
        window.dispatchEvent(new Event('show-global-search'));
        break;
      default:
        console.warn(`[AIChatPanel] 未知的上下文菜单操作: ${action}`);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const trimmedInput = input.trim();

    // Ensure a model is selected before sending.
    if (!selectedModel) {
      console.error('[AIChatPanel] 未选择模型');
      return;
    }

    const useChatFlowForNonTaskInAgent = isLikelyNonTaskAgentInput(trimmedInput);

    const consumeAgentContextDesc = (): string => {
      let contextDesc = '';

      if (selectedForms.length > 0) {
        for (const form of selectedForms) {
          contextDesc += `\n\n[Referenced form] ${form.name} (id: ${form.id})\n- If specific data is needed, call query_form with formId="${form.id}"`;
        }
        setSelectedForms([]);
      }

      const activeTabTitle = currentFileName.trim();
      const activeTabPath = currentFilePath.trim();
      if (activeTabTitle || activeTabPath) {
        contextDesc += '\n\n[Current active tab]';
        if (activeTabTitle) {
          contextDesc += `\n- title: ${activeTabTitle}`;
        }
        if (activeTabPath) {
          contextDesc += `\n- path: ${activeTabPath}`;
        }
        contextDesc += '\n- instruction: If editing is required, prioritize this file unless the user explicitly asks to edit another file.';
      }

      if (selectedKbs.length > 0) {
        contextDesc += `\n\n[Referenced knowledge bases]\n${selectedKbs.map(k => `- ${k.title} (id: ${k.id})`).join('\n')}`;
        setSelectedKbs([]);
      }

      if (selectedFiles.length > 0) {
        const referencedFileItems = selectedFiles.filter(item => item.type === 'file');
        const referencedDirectoryItems = selectedFiles.filter(item => item.type === 'directory');
        if (referencedFileItems.length > 0) {
          contextDesc += `\n\n[Referenced files]\n${referencedFileItems.map(f => `- ${f.name} (${f.path})`).join('\n')}`;
        }
        if (referencedDirectoryItems.length > 0) {
          contextDesc += `\n\n[Referenced directories]\n${referencedDirectoryItems.map(f => `- ${f.name} (${f.path})`).join('\n')}`;
          contextDesc += '\n- instruction: Use list_files on directories first. Do not call read_file directly on a directory path.';
        }
        setSelectedFiles([]);
      }

      if (selectedSkills.length > 0) {
        contextDesc += `\n\n[Skill constraints]\nOnly execute using the following skill packs:\n${selectedSkills.map(s => `- ${s.name} (${s.path})`).join('\n')}`;
        setSelectedSkills([]);
      }

      if (enabledDecompositionRules.length > 0) {
        contextDesc += '\n\n[Auto decomposition rules]\n'
          + 'Before writing or editing, first decompose the reference materials and the current draft according to the enabled rules. '
          + `Then continue with the final write/edit output.\nEnabled rules:\n${enabledDecompositionRules.map(rule => `- ${rule.name}: ${rule.instruction}`).join('\n')}`;
      }

      if (enabledWritingRuleDocuments.length > 0) {
        contextDesc += '\n\n[Writing rule documents]\n'
          + 'Before final writing/editing output, read these rule documents and apply their style and constraints.\n'
          + `${enabledWritingRuleDocuments.map(document => `- ${document.name} (${document.path})`).join('\n')}`;
      }

      return contextDesc;
    };

    // /help: show built-in command help
    if (/^\/help\b/i.test(trimmedInput)) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: '/help',
        timestamp: new Date(),
      };
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: [
          '可用命令：',
          '- `/compact` 压缩历史上下文，保留最近会话',
          '- `/clear` 清空当前对话',
          '- `/help` 查看命令说明',
        ].join('\n'),
        timestamp: new Date(),
        model: selectedModel,
      };
      setMessages(prev => [...prev, userMessage, assistantMessage]);
      tiptapRef.current?.clear();
      setInput('');
      setIsContextMenuOpen(false);
      setSubMenuType('none');
      return;
    }

    // /clear: clear all messages
    if (/^\/clear\b/i.test(trimmedInput)) {
      setMessages([]);
      tiptapRef.current?.clear();
      setInput('');
      setIsContextMenuOpen(false);
      setSubMenuType('none');
      return;
    }

    // /compact: fold old history into a compact summary message
    if (/^\/compact\b/i.test(trimmedInput)) {
      const historyToCompact = messages.filter(m => m.role === 'user' || m.role === 'assistant');
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: '/compact',
        timestamp: new Date(),
      };
      if (historyToCompact.length <= COMPACT_KEEP_RECENT_MESSAGES) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '当前历史较短，暂不需要压缩。',
          timestamp: new Date(),
          model: selectedModel,
        };
        setMessages(prev => [...prev, userMessage, assistantMessage]);
      } else {
        const historyToFold = historyToCompact.slice(0, historyToCompact.length - COMPACT_KEEP_RECENT_MESSAGES);
        const recentHistory = historyToCompact.slice(-COMPACT_KEEP_RECENT_MESSAGES);
        const compactSummary = buildCompactConversationSummary(historyToFold);
        const compactMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Context compacted\n${compactSummary}`,
          timestamp: new Date(),
          model: selectedModel,
        };
        setMessages([...recentHistory, userMessage, compactMessage]);
      }
      tiptapRef.current?.clear();
      setInput('');
      setIsContextMenuOpen(false);
      setSubMenuType('none');
      return;
    }

    // Non-task query: call AI directly (without Agent workflow).
    if (useChatFlowForNonTaskInAgent) {
      const taskDesc = input.trim();
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: taskDesc,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      tiptapRef.current?.clear();
      setInput('');
      setIsLoading(true);

      const assistantMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        model: selectedModel
      }]);
      const ignoreReferencedContext = useChatFlowForNonTaskInAgent;

      try {
        // Reinitialize provider only when model changes.
        const actualModelId = selectedModel.includes(':') ? selectedModel.split(':')[1] : selectedModel;
        if (!providerCacheRef.current || providerCacheRef.current.modelId !== selectedModel) {
          const modelConfig = await getModelConfig(selectedModel);
          if (!modelConfig) throw new Error(`未找到模型配置：${selectedModel}`);
          await aiService.setProvider(modelConfig.providerId, {
            id: modelConfig.id || 'default',
            name: modelConfig.name || modelConfig.configName,
            apiKey: modelConfig.apiKey,
            apiEndpoint: modelConfig.apiEndpoint,
            temperature: 0.7,
            maxTokens: 4000,
            modelId: actualModelId
          });
          providerCacheRef.current = { modelId: selectedModel, actualModelId };
        }

        // Build context text.
        let contextText = '';
        const pendingForms = ignoreReferencedContext ? [] : [...selectedForms];
        const pendingKbs = ignoreReferencedContext ? [] : [...selectedKbs];
        const knowledgeFileNamesForTool = new Set<string>();
        const knowledgeKnownPathsForTool = new Set<string>();
        const knowledgeCandidatesForTool: KnowledgeFileCandidate[] = [];
        const knowledgeContentCache = new Map<string, string>();
        const allowedFormIdsForTool = new Set<string>();
        const allowedFormNamesForTool = new Map<string, string>();
        const taskSearchTerms = buildSearchTerms(taskDesc);
        if (pendingForms.length > 0) {
          for (const form of pendingForms) {
            allowedFormIdsForTool.add(form.id);
            if (form.name?.trim()) {
              allowedFormNamesForTool.set(form.name.trim().toLowerCase(), form.id);
            }
            contextText += `\n\n[Referenced form] ${form.name} (id: ${form.id})\n- Use query_form with formId to fetch rows as needed.`;
          }
          setSelectedForms([]);
        }
        if (pendingKbs.length > 0) {
          const kbActKey = 'chat-kb-retrieval';
          const MAX_FILES_PER_KB = 24;
          const MAX_SNIPPETS_TOTAL = 20;
          const MAX_TOTAL_CHARS = 12000;
          const MAX_FALLBACK_SNIPPETS_PER_KB = 2;
          let totalSnippetCount = 0;
          let totalChars = 0;
          let fallbackSnippetCount = 0;
          const dedupKeys = new Set<string>();
          const kbSections: string[] = [];

          upsertActLog(assistantMessageId, {
            key: kbActKey,
            kind: 'tool',
            title: `Retrieving knowledge snippets 0/${pendingKbs.length}`,
            detail: `${pendingKbs.length} knowledge base(s)`,
            status: 'running',
          });
          await waitForActFrame(80);

          for (let kbIndex = 0; kbIndex < pendingKbs.length; kbIndex += 1) {
            const kb = pendingKbs[kbIndex];
            const kbItem = await knowledgeBaseService.findItem(kb.id);
            if (!kbItem || kbItem.type !== 'folder') {
              continue;
            }

            const candidates = collectKnowledgeFileCandidates(kbItem);
            const uniqueFileNames = Array.from(
              new Set(
                candidates
                  .map(candidate => candidate.name.trim())
                  .filter(name => name.length > 0)
              )
            );

            const knownPathSet = new Set(
              candidates
                .map(candidate => candidate.path)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
                .map(value => normalizeFilePath(value))
            );

            const searchFileNames = uniqueFileNames
              .slice(0, MAX_FILES_PER_KB)
              .map(name => getPathBaseName(name));
            for (const fileName of searchFileNames) {
              knowledgeFileNamesForTool.add(fileName);
            }
            for (const normalizedPath of knownPathSet) {
              knowledgeKnownPathsForTool.add(normalizedPath);
            }
            knowledgeCandidatesForTool.push(...candidates);

            const kbSnippets: string[] = [];
            for (const fileName of searchFileNames) {
              if (totalSnippetCount >= MAX_SNIPPETS_TOTAL || totalChars >= MAX_TOTAL_CHARS) {
                break;
              }

              let ragResult: any;
              try {
                ragResult = await (window as any).electron?.ipcRenderer.invoke('agent:rag:query', {
                  query: taskDesc,
                  topK: 3,
                  fileName,
                });
              } catch {
                continue;
              }

              const ragItems = Array.isArray(ragResult?.data?.results)
                ? (ragResult.data.results as AgentRAGResultItem[])
                : [];

              for (const item of ragItems) {
                if (totalSnippetCount >= MAX_SNIPPETS_TOTAL || totalChars >= MAX_TOTAL_CHARS) {
                  break;
                }

                const filePath = typeof item.filePath === 'string' ? item.filePath : '';
                if (knownPathSet.size > 0 && filePath) {
                  const normalized = normalizeFilePath(filePath);
                  if (!knownPathSet.has(normalized)) {
                    continue;
                  }
                }

                const rawText = typeof item.childContent === 'string' && item.childContent.trim().length > 0
                  ? item.childContent
                  : (typeof item.content === 'string' ? item.content : '');
                if (!rawText.trim()) continue;

                const snippet = trimSnippet(rawText, 560);
                const dedupKey = `${filePath}|${snippet}`;
                if (dedupKeys.has(dedupKey)) {
                  continue;
                }
                dedupKeys.add(dedupKey);

                const sourceName = filePath ? getPathBaseName(filePath) : fileName;
                kbSnippets.push(`[${sourceName}]\n${snippet}`);
                totalSnippetCount += 1;
                totalChars += snippet.length;
              }
            }

            if (kbSnippets.length === 0) {
              const rankedFallback: Array<{ score: number; name: string; path?: string; snippet: string }> = [];
              for (const candidate of candidates.slice(0, MAX_FILES_PER_KB * 2)) {
                if (totalSnippetCount >= MAX_SNIPPETS_TOTAL || totalChars >= MAX_TOTAL_CHARS) {
                  break;
                }
                const cacheKey = candidate.path ?? candidate.name;
                let content = typeof candidate.content === 'string' ? candidate.content : '';
                if (!content && candidate.path) {
                  if (knowledgeContentCache.has(cacheKey)) {
                    content = knowledgeContentCache.get(cacheKey) ?? '';
                  } else {
                    try {
                      const fileContent: string = await (window as any).electron?.ipcRenderer.invoke('read-file', candidate.path);
                      content = typeof fileContent === 'string' ? fileContent : '';
                    } catch {
                      content = '';
                    }
                    knowledgeContentCache.set(cacheKey, content);
                  }
                } else if (content) {
                  knowledgeContentCache.set(cacheKey, content);
                }

                if (!content.trim()) continue;
                const score = scoreTextByTerms(content, taskSearchTerms);
                if (score <= 0) continue;
                const snippet = extractSnippetByTerms(content, taskSearchTerms, 560);
                if (!snippet) continue;
                rankedFallback.push({
                  score,
                  name: candidate.name,
                  path: candidate.path,
                  snippet,
                });
              }

              rankedFallback.sort((a, b) => b.score - a.score);
              for (const item of rankedFallback.slice(0, MAX_FALLBACK_SNIPPETS_PER_KB)) {
                if (totalSnippetCount >= MAX_SNIPPETS_TOTAL || totalChars >= MAX_TOTAL_CHARS) {
                  break;
                }
                const dedupKey = `${item.path ?? item.name}|${item.snippet}`;
                if (dedupKeys.has(dedupKey)) continue;
                dedupKeys.add(dedupKey);
                kbSnippets.push(`[${item.name}]\n${item.snippet}`);
                totalSnippetCount += 1;
                totalChars += item.snippet.length;
                fallbackSnippetCount += 1;
              }
            }

            if (kbSnippets.length > 0) {
              kbSections.push(`- ${kb.title}\n${kbSnippets.join('\n\n')}`);
            }

            upsertActLog(assistantMessageId, {
              key: kbActKey,
              kind: 'tool',
              title: `Retrieving knowledge snippets ${kbIndex + 1}/${pendingKbs.length}`,
              detail: `${totalSnippetCount} snippets`,
              status: 'running',
            });
          }

          if (kbSections.length > 0) {
            contextText += `\n\n[Referenced knowledge snippets]\n${kbSections.join('\n\n')}`;
            upsertActLog(assistantMessageId, {
              key: kbActKey,
              kind: 'tool',
              title: `Knowledge retrieval completed ${pendingKbs.length}/${pendingKbs.length}`,
              detail: fallbackSnippetCount > 0
                ? `${totalSnippetCount} snippets (${fallbackSnippetCount} from stored content)`
                : `${totalSnippetCount} snippets`,
              status: 'success',
            });
          } else {
            let progressText = '';
            try {
              const progress = await (window as any).electron?.workspaceVectorIndex?.getProgress?.();
              if (progress?.success && progress.data) {
                const p = progress.data;
                progressText = ` | index ${p.status} ${p.processedFiles}/${p.totalFiles}`;
              }
            } catch {
              // ignore optional status fetch failure
            }
            contextText += `\n\n[Referenced knowledge bases]\n${pendingKbs.map(k => `- ${k.title} (id: ${k.id})`).join('\n')}`;
            upsertActLog(assistantMessageId, {
              key: kbActKey,
              kind: 'tool',
              title: `Knowledge retrieval completed ${pendingKbs.length}/${pendingKbs.length}`,
              detail: `No vector snippets found, fallback to referenced knowledge base list${progressText}`,
              status: 'success',
            });
          }

          setSelectedKbs([]);
        }
        // If referenced files/folders exist, expand folders and pass context to AI.
        const pendingFiles = ignoreReferencedContext ? [] : [...selectedFiles];
        const hasFiles = pendingFiles.length > 0;
        if (hasFiles) {
          // 展开目录并收集其中所有文件
          const expandedFiles: { name: string; path: string }[] = [];
          for (const f of pendingFiles) {
            if (f.type === 'directory') {
              const treeResult = await (window as any).electron?.folder?.readTree(f.path);
              if (treeResult?.success && Array.isArray(treeResult.data)) {
                const flatten = (items: any[]): void => {
                  for (const item of items) {
                    if (item.type !== 'directory') {
                      expandedFiles.push({ name: item.name, path: item.path });
                    } else if (Array.isArray(item.children)) {
                      flatten(item.children);
                    }
                  }
                };
                flatten(treeResult.data);
              }
              // Include folder item itself so list_directory can be used.
              expandedFiles.unshift({ name: `${f.name} (folder)`, path: f.path });
            } else {
              expandedFiles.push({ name: f.name, path: f.path });
            }
          }
          contextText += `\n\n[Referenced files] The following files are prepared. Use read_file/read_file_chunk to read content and list_directory to inspect folders:\n${expandedFiles.map(f => `- ${f.name}: ${f.path}`).join('\n')}`;
          setSelectedFiles([]);
        }

        if (!ignoreReferencedContext && enabledWritingRuleDocuments.length > 0) {
          contextText += '\n\n[Writing rule documents] Read these documents first and follow their writing constraints/style before final output:\n'
            + `${enabledWritingRuleDocuments.map(document => `- ${document.name}: ${document.path}`).join('\n')}`;
        }

        // 构建消息列表
        const chatMessages: ChatMessage[] = [];

        const timelineStylePrompt = [
          'When tool use is needed, keep a Claude-Code-like timeline interaction style.',
          'Before each tool call, output 1-2 short Chinese sentences explaining the next action.',
          'After each tool result, output one short Chinese progress update before continuing.',
          'Keep updates incremental and concise; do not dump everything at once.',
          'Avoid repeating the same progress sentence or re-listing unchanged conclusions.',
          'If knowledge base context is referenced but insufficient, use query_knowledge to continue retrieval before final answer.',
          'If forms are referenced, use query_form with formId to fetch only the rows/columns needed before final answer.',
          'For numeric conditions (e.g. 年龄 > 29), call query_form with where={column,op,value}; do not manually recount names.',
          'For categorical filters (e.g. 女性/男性), use query_form where on 性别/sex/gender column instead of fuzzy matching all columns.',
          'When query_form returns all_columns and selected_columns, use all_columns to decide whether a field exists.',
          'When query_form returns matched_total, use that exact number in final answer.',
          'When the user asks to summarize a folder or multiple files, read every listed file unless the user explicitly asks for sampling.',
          'For large files, prefer read_file_chunk with sequential cursor until has_more=false, and report progress in Chinese after each chunk.',
          'If file count is large, continue in batches until all files are read before the final summary.'
        ].join('\n');
        chatMessages.push({ role: 'system', content: timelineStylePrompt });

        // 有上下文时加 system prompt
        if (contextText.length > 0) {
          const systemPrompt = await getAIZoneSystemPromptAsync(false);
          if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
        }

        // History messages snapshot (excluding just-added message).
        for (const m of messages) {
          if (m.role === 'user' || m.role === 'assistant') {
            chatMessages.push({ role: m.role, content: m.content });
          }
        }

        // 当前用户消息（含上下文）
        chatMessages.push({ role: 'user', content: taskDesc + contextText });

        // Chat tool definitions: file queries + knowledge retrieval.
        const toolDefs: Array<{
          type: 'function';
          function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
          };
        }> = [];
        if (allowedFormIdsForTool.size > 0) {
          toolDefs.push({
            type: 'function',
            function: {
              name: 'query_form',
              description: 'Query rows from referenced forms by formId, with optional query/columns/limit/offset.',
              parameters: {
                type: 'object',
                properties: {
                  formId: { type: 'string', description: 'Referenced form ID' },
                  formName: { type: 'string', description: 'Optional form name alias when formId is unavailable' },
                  query: { type: 'string', description: 'Optional keyword query for row filtering' },
                  columns: {
                    oneOf: [
                      { type: 'array', items: { type: 'string' } },
                      { type: 'string' }
                    ],
                    description: 'Optional columns by id/name. Supports ["列A","列B"] or "列A,列B"',
                  },
                  selected_columns: {
                    oneOf: [
                      { type: 'array', items: { type: 'string' } },
                      { type: 'string' }
                    ],
                    description: 'Alias of columns',
                  },
                  selectedColumns: {
                    oneOf: [
                      { type: 'array', items: { type: 'string' } },
                      { type: 'string' }
                    ],
                    description: 'Alias of columns',
                  },
                  limit: { type: 'number', description: 'Rows per call, default 20, max 80' },
                  offset: { type: 'number', description: 'Offset for pagination, default 0' },
                  rowIds: { type: 'array', items: { type: 'string' }, description: 'Optional explicit row ids' },
                  where: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          column: { type: 'string' },
                          field: { type: 'string' },
                          op: { type: 'string' },
                          operator: { type: 'string' },
                          value: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
                          target: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
                        },
                      },
                      {
                        type: 'array',
                        items: { type: 'object' },
                      },
                      { type: 'string' }
                    ],
                    description: 'Structured filter, supports object/array/json-string. op supports =, !=, >, >=, <, <= and aliases',
                  },
                },
                required: ['formId']
              }
            }
          });
        }
        if (hasFiles) {
          toolDefs.push(
            {
              type: 'function',
              function: {
                name: 'read_file',
                description: 'Read local file content. For large files this may return partial content and a next cursor.',
                parameters: {
                  type: 'object',
                  properties: { path: { type: 'string', description: 'Absolute file path' } },
                  required: ['path']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'read_file_chunk',
                description: 'Read one chunk of a local file by line cursor. Call repeatedly until has_more=false.',
                parameters: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'Absolute file path' },
                    cursor: { type: 'number', description: '0-based next line cursor, default 0' },
                    chunkLines: { type: 'number', description: `Lines per chunk, recommended ${READ_FILE_CHUNK_DEFAULT_LINES}` }
                  },
                  required: ['path']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'list_directory',
                description: 'List files and subfolders in a directory.',
                parameters: {
                  type: 'object',
                  properties: { path: { type: 'string', description: 'Absolute directory path' } },
                  required: ['path']
                }
              }
            }
          );
        }
        if (pendingKbs.length > 0 && knowledgeFileNamesForTool.size > 0) {
          toolDefs.push({
            type: 'function',
            function: {
              name: 'query_knowledge',
              description: 'Search referenced knowledge bases by semantic query and return matched snippets.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Natural language query for retrieval' },
                  topK: { type: 'number', description: 'Maximum snippets to return' },
                  fileName: { type: 'string', description: 'Optional file name in referenced knowledge bases' }
                },
                required: ['query']
              }
            }
          });
        }
        const chatTools = toolDefs.length > 0 ? toolDefs : undefined;
        let activeChatTools = chatTools;
        let chatRound = 0;
        const MAX_CHAT_ROUNDS = 24;
        const MAX_QUERY_KNOWLEDGE_CALLS = 3;
        const toolResultCache = new Map<string, { result: string; summary: string; status: 'success' | 'error' }>();
        const emittedToolActKeys = new Set<string>();
        const readBatchActKey = 'chat-tool-read-batch-global';
        let readFilePlannedTotal = 0;
        let readFileDoneTotal = 0;
        let readFileFailedTotal = 0;
        let readFileTotalLines = 0;
        let listedFileCountHint = 0;
        let useGlobalReadFileBatchLog = false;
        let queryKnowledgeCallsTotal = 0;
        let queryKnowledgeNoNewResultStreak = 0;
        const queryKnowledgeResultHashes = new Set<string>();
        const readFileContentCache = new Map<string, string>();
        const contextBudgetActKey = 'chat-tool-context-budget';
        let toolContextCompactedTotal = 0;
        let lastToolRoundSignature = '';
        let repeatedCachedToolRounds = 0;

        // tool call 循环：AI 可能多次调用工具，每次执行后继续对话
        const runChatWithTools = async (): Promise<void> => {
          const roundIndex = ++chatRound;
          if (roundIndex > MAX_CHAT_ROUNDS) {
            appendActLog(assistantMessageId, {
              kind: 'error',
              title: 'Stopped: too many rounds',
              detail: `Exceeded ${MAX_CHAT_ROUNDS} rounds, please refine the request.`,
              status: 'error',
            });
            setIsLoading(false);
            return;
          }
          let pendingToolCalls: { id: string; name: string; argsRaw: string; uiId: string }[] = [];
          let currentContent = '';
          let renderQueue = '';
          let renderTimer: ReturnType<typeof setTimeout> | null = null;
          const textBlockKey = `chat-text-round-${roundIndex}`;

          const appendContentChunk = (chunk: string): void => {
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMessageId) return msg;
              const blocks = msg.contentBlocks ?? [];
              const textIdx = blocks.findIndex(
                block => block.type === 'text' && block.key === textBlockKey
              );
              if (textIdx >= 0) {
                const existing = blocks[textIdx];
                if (existing.type === 'text') {
                  const updatedBlock: ContentBlock = {
                    type: 'text',
                    key: textBlockKey,
                    text: existing.text + chunk,
                    isStreaming: true,
                  };
                  const updated = [...blocks];
                  updated[textIdx] = updatedBlock;
                  return { ...msg, content: msg.content + chunk, contentBlocks: updated };
                }
              }
              return {
                ...msg,
                content: msg.content + chunk,
                contentBlocks: [...blocks, { type: 'text', key: textBlockKey, text: chunk, isStreaming: true }],
              };
            }));
          };

          const flushRenderQueue = (): void => {
            if (!renderQueue) {
              renderTimer = null;
              return;
            }

            const stepSize = Math.max(2, Math.min(10, Math.ceil(renderQueue.length / 10)));
            const chunk = renderQueue.slice(0, stepSize);
            renderQueue = renderQueue.slice(stepSize);
            appendContentChunk(chunk);
            renderTimer = setTimeout(flushRenderQueue, 30);
          };

          const enqueueRenderChunk = (chunk: string): void => {
            renderQueue += chunk;
            if (!renderTimer) {
              flushRenderQueue();
            }
          };

          const waitForRenderQueueDrain = async (): Promise<void> => {
            while (renderQueue.length > 0 || renderTimer) {
              await new Promise(resolve => setTimeout(resolve, 20));
            }
          };

          await aiService.generateTextStream(
            { model: actualModelId, messages: chatMessages, temperature: 0.7, maxTokens: 4000, tools: activeChatTools },
            {
              onContent: (chunk) => {
                currentContent += chunk;
                enqueueRenderChunk(chunk);
              },
              onReasoning: () => {
                // Keep reasoning hidden for a cleaner Claude-like timeline.
              },
              onToolCall: (toolCall) => {
                const idx = (toolCall as any).index ?? 0;
                const isNew = !pendingToolCalls[idx];
                if (isNew) {
                  const uiId = `tc-${Date.now()}-${idx}`;
                  pendingToolCalls[idx] = { id: toolCall.id ?? '', name: '', argsRaw: '', uiId };
                }
                if (toolCall.id) pendingToolCalls[idx].id = toolCall.id;
                if (toolCall.function?.name) pendingToolCalls[idx].name += toolCall.function.name;
                if (toolCall.function?.arguments) pendingToolCalls[idx].argsRaw += toolCall.function.arguments;
              },
              onComplete: async () => {
                try {
                  await waitForRenderQueueDrain();
                // Thinking round completed: mark block completed and record elapsed time.
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== assistantMessageId) return msg;
                  const elapsed = msg.thinkingStartTime ? Math.max(1, Math.round((Date.now() - msg.thinkingStartTime) / 1000)) : 1;
                  // Update thinking/text block state when a round completes.
                  const updatedBlocks = msg.contentBlocks?.map(b =>
                    b.type === 'thinking'
                      ? { ...b, isThinking: false, elapsedSeconds: elapsed }
                      : (b.type === 'text' && b.key === textBlockKey)
                        ? { ...b, isStreaming: false }
                        : b
                  );
                  return {
                    ...msg,
                    isThinking: false,
                    elapsedSeconds: elapsed,
                    contentBlocks: updatedBlocks,
                  };
                }));

                const allowedToolNames = new Set(
                  (activeChatTools ?? []).map(tool => tool.function?.name).filter(Boolean) as string[]
                );
                const ignoredToolCalls = pendingToolCalls.filter(
                  tc => tc != null && tc.name && !allowedToolNames.has(tc.name)
                );
                if (ignoredToolCalls.length > 0) {
                  const ignoredNames = Array.from(new Set(ignoredToolCalls.map(tc => tc.name))).join(', ');
                  appendActLog(assistantMessageId, {
                    kind: 'status',
                    title: 'Ignored unsupported tool calls',
                    detail: ignoredNames,
                    status: 'info',
                  });
                }
                const validToolCalls = pendingToolCalls.filter(
                  tc => tc != null && tc.name && allowedToolNames.has(tc.name)
                );
                if (validToolCalls.length === 0) {
                  const optimizedFinalText = optimizeAssistantOutput(currentContent);
                  if (optimizedFinalText !== currentContent) {
                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            content: optimizedFinalText,
                            contentBlocks: (msg.contentBlocks ?? []).map(block => (
                              block.type === 'text'
                                ? { ...block, text: optimizeAssistantOutput(block.text), isStreaming: false }
                                : block
                            )),
                          }
                        : msg
                    ));
                  }
                  if (useGlobalReadFileBatchLog) {
                    const hasIncompleteReads = listedFileCountHint > 0 && readFileDoneTotal < listedFileCountHint;
                    const detailParts = [`total ${readFileTotalLines} lines`];
                    if (listedFileCountHint > 0) {
                      detailParts.push(`listed ${listedFileCountHint} files`);
                    }
                    if (readFileFailedTotal > 0) {
                      detailParts.push(`failed ${readFileFailedTotal}`);
                    }
                    upsertActLog(assistantMessageId, {
                      key: readBatchActKey,
                      kind: 'tool',
                      title: hasIncompleteReads
                        ? `Read calls ${readFileDoneTotal}/${readFilePlannedTotal} (incomplete)`
                        : `Read calls ${readFileDoneTotal}/${readFilePlannedTotal}`,
                      detail: detailParts.join(' | '),
                      status: hasIncompleteReads || readFileFailedTotal > 0 ? 'error' : 'success',
                    });
                  }
                  setIsLoading(false);
                  return;
                }
                const roundToolKeys = validToolCalls.map(tc => buildToolCallCacheKey(tc.name, tc.argsRaw));
                const roundToolSignature = roundToolKeys.join('||');
                const allRoundToolsCached = roundToolKeys.length > 0
                  && roundToolKeys.every(key => toolResultCache.has(key));
                if (
                  roundToolSignature
                  && roundToolSignature === lastToolRoundSignature
                  && allRoundToolsCached
                ) {
                  repeatedCachedToolRounds += 1;
                } else {
                  repeatedCachedToolRounds = 0;
                }
                lastToolRoundSignature = roundToolSignature;

                const readFileCallsInRound = validToolCalls.reduce(
                  (count, tc) => (tc.name === 'read_file' || tc.name === 'read_file_chunk' ? count + 1 : count),
                  0
                );
                if (readFileCallsInRound > 0) {
                  readFilePlannedTotal += readFileCallsInRound;
                  if (!useGlobalReadFileBatchLog && readFilePlannedTotal >= READ_FILE_BATCH_LOG_THRESHOLD) {
                    useGlobalReadFileBatchLog = true;
                  }
                  if (useGlobalReadFileBatchLog) {
                    const detailParts = [`queued ${readFilePlannedTotal - readFileDoneTotal}`];
                    detailParts.push(`total ${readFileTotalLines} lines`);
                    if (listedFileCountHint > 0) {
                      detailParts.push(`listed ${listedFileCountHint} files`);
                    }
                    if (readFileFailedTotal > 0) {
                      detailParts.push(`failed ${readFileFailedTotal}`);
                    }
                    upsertActLog(assistantMessageId, {
                      key: readBatchActKey,
                      kind: 'tool',
                      title: `Reading calls ${readFileDoneTotal}/${readFilePlannedTotal}`,
                      detail: detailParts.join(' | '),
                      status: 'running',
                    });
                    await waitForActFrame(40);
                  }
                }

                // Append assistant tool_calls into chat history.
                const toolCallsForMsg = validToolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.name, arguments: tc.argsRaw }
                }));
                chatMessages.push({ role: 'assistant', content: currentContent, tool_calls: toolCallsForMsg });

                for (const tc of validToolCalls) {
                  let toolResult = '';
                  let resultSummary = 'done';
                  let resultStatus: 'success' | 'error' = 'success';
                  let readFilePath = '';
                  let readFileLineCount: number | undefined;
                  const toolCacheKey = buildToolCallCacheKey(tc.name, tc.argsRaw);
                  const toolActKey = `chat-tool-${hashText(toolCacheKey)}`;
                  let toolAct = buildToolActTitle(tc.name, tc.argsRaw);
                  const cachedToolResult = toolResultCache.get(toolCacheKey);
                  const isReadToolCall = tc.name === 'read_file' || tc.name === 'read_file_chunk';
                  const useBatchReadLogForCall = useGlobalReadFileBatchLog && isReadToolCall;
                  const showToolLog = !useBatchReadLogForCall && !emittedToolActKeys.has(toolActKey);

                  if (showToolLog) {
                    upsertActLog(assistantMessageId, {
                      key: toolActKey,
                      kind: 'tool',
                      title: toolAct.title,
                      detail: toolAct.detail,
                      status: 'running',
                    });
                    await waitForActFrame(90);
                  }
                  try {
                    if (cachedToolResult) {
                      toolResult = cachedToolResult.result;
                      resultStatus = cachedToolResult.status;
                      resultSummary = cachedToolResult.summary.endsWith('(cached)')
                        ? cachedToolResult.summary
                        : `${cachedToolResult.summary} (cached)`;
                      if (isReadToolCall) {
                        const args = parseToolArgs(tc.argsRaw);
                        readFilePath = typeof args?.path === 'string' ? args.path : '';
                        const cachedLineCount = parseReadLineCountFromSummary(resultSummary);
                        if (typeof cachedLineCount === 'number') {
                          readFileLineCount = cachedLineCount;
                        } else if (!toolResult || toolResult === '[empty file]') {
                          readFileLineCount = 0;
                        } else {
                          readFileLineCount = toolResult.split('\n').length;
                        }
                      }
                    } else if (tc.name === 'read_file') {
                      const args = parseToolArgs(tc.argsRaw);
                      readFilePath = typeof args?.path === 'string' ? args.path : '';
                      if (!readFilePath) throw new Error('Missing file path');

                      let content = readFileContentCache.get(readFilePath);
                      if (typeof content !== 'string') {
                        const readResult: string = await (window as any).electron?.ipcRenderer.invoke('read-file', readFilePath);
                        content = readResult ?? '';
                        readFileContentCache.set(readFilePath, content);
                      }

                      const normalized = content.replace(/\r\n/g, '\n');
                      const totalLines = normalized ? normalized.split('\n').length : 0;
                      const shouldInlineFull = totalLines <= READ_FILE_FULL_INLINE_LINE_LIMIT
                        && normalized.length <= READ_FILE_FULL_INLINE_CHAR_LIMIT;

                      if (shouldInlineFull) {
                        toolResult = normalized || '[empty file]';
                        readFileLineCount = totalLines;
                        resultSummary = totalLines > 0 ? `${totalLines} lines of output` : '(empty file)';
                      } else {
                        const { cursor, chunkLines } = parseLineChunkArgs(null);
                        const chunk = buildReadFileChunkResult(normalized, cursor, chunkLines);
                        readFileLineCount = chunk.chunkLineCount;
                        resultSummary = chunk.chunkLineCount > 0
                          ? `${chunk.chunkLineCount} lines | chunk ${chunk.chunkIndex}/${chunk.chunkTotal}`
                          : '(empty file)';
                        toolResult = [
                          `[read_file partial] ${readFilePath}`,
                          `chunk ${chunk.chunkIndex}/${chunk.chunkTotal}`,
                          `lines ${chunk.startLine}-${chunk.endLine}/${chunk.totalLines}`,
                          `cursor ${chunk.safeCursor}`,
                          `has_more ${chunk.hasMore ? 'true' : 'false'}`,
                          `next_cursor ${chunk.nextCursor}`,
                          `chunk_lines ${chunk.safeChunkLines}`,
                          '',
                          chunk.chunkText || '[empty chunk]',
                          ...(chunk.hasMore
                            ? [
                              '',
                              `[continue] Call read_file_chunk with {"path":"${readFilePath}","cursor":${chunk.nextCursor},"chunkLines":${chunk.safeChunkLines}}`
                            ]
                            : []),
                        ].join('\n');
                      }
                    } else if (tc.name === 'read_file_chunk') {
                      const args = parseToolArgs(tc.argsRaw);
                      readFilePath = typeof args?.path === 'string' ? args.path : '';
                      if (!readFilePath) throw new Error('Missing file path');

                      let content = readFileContentCache.get(readFilePath);
                      if (typeof content !== 'string') {
                        const readResult: string = await (window as any).electron?.ipcRenderer.invoke('read-file', readFilePath);
                        content = readResult ?? '';
                        readFileContentCache.set(readFilePath, content);
                      }

                      const { cursor, chunkLines } = parseLineChunkArgs(args);
                      const chunk = buildReadFileChunkResult(content, cursor, chunkLines);
                      readFileLineCount = chunk.chunkLineCount;
                      resultSummary = chunk.chunkLineCount > 0
                        ? `${chunk.chunkLineCount} lines | chunk ${chunk.chunkIndex}/${chunk.chunkTotal} | ${chunk.endLine}/${chunk.totalLines}`
                        : '(empty file)';
                      toolResult = [
                        `[read_file_chunk] ${readFilePath}`,
                        `chunk ${chunk.chunkIndex}/${chunk.chunkTotal}`,
                        `lines ${chunk.startLine}-${chunk.endLine}/${chunk.totalLines}`,
                        `cursor ${chunk.safeCursor}`,
                        `has_more ${chunk.hasMore ? 'true' : 'false'}`,
                        `next_cursor ${chunk.nextCursor}`,
                        `chunk_lines ${chunk.safeChunkLines}`,
                        '',
                        chunk.chunkText || '[empty chunk]',
                      ].join('\n');
                    } else if (tc.name === 'query_form') {
                      const args = parseToolArgs(tc.argsRaw);
                      const formIdArg = typeof args?.formId === 'string' ? args.formId.trim() : '';
                      const formNameArg = typeof args?.formName === 'string' ? args.formName.trim() : '';
                      const query = typeof args?.query === 'string' ? args.query.trim() : '';
                      const explicitWhere = parseQueryFormWhere(args?.where);
                      const limitArg = typeof args?.limit === 'number' && Number.isFinite(args.limit)
                        ? Math.floor(args.limit)
                        : 80;
                      const offsetArg = typeof args?.offset === 'number' && Number.isFinite(args.offset)
                        ? Math.floor(args.offset)
                        : 0;
                      const rowIdsArg = Array.isArray(args?.rowIds)
                        ? args.rowIds.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
                        : [];
                      const limit = Math.max(1, Math.min(80, limitArg));
                      const offset = Math.max(0, offsetArg);

                      let resolvedFormId = formIdArg;
                      if (resolvedFormId) {
                        const normalizedFromFormId = resolvedFormId.toLowerCase();
                        const mappedFromName = allowedFormNamesForTool.get(normalizedFromFormId);
                        if (mappedFromName) {
                          resolvedFormId = mappedFromName;
                        }
                      }
                      if (!resolvedFormId && formNameArg) {
                        const normalizedName = formNameArg.toLowerCase();
                        resolvedFormId = allowedFormNamesForTool.get(normalizedName) ?? '';
                      }
                      if (!resolvedFormId) {
                        throw new Error('Missing formId');
                      }
                      if (allowedFormIdsForTool.size > 0 && !allowedFormIdsForTool.has(resolvedFormId)) {
                        throw new Error(`Form is not referenced in context: ${resolvedFormId}`);
                      }
                      const columnsArg = args?.columns ?? args?.selected_columns ?? args?.selectedColumns;
                      const selectedColumnsArg = parseFormColumnsArg(columnsArg);
                      const queryRowsResult = await window.electron?.form?.queryRows({
                        formId: resolvedFormId,
                        query,
                        where: explicitWhere ?? undefined,
                        columns: selectedColumnsArg,
                        limit,
                        offset,
                        rowIds: rowIdsArg,
                      });
                      if (!queryRowsResult?.success || !queryRowsResult.data) {
                        throw new Error(queryRowsResult?.error || `Form not found: ${resolvedFormId}`);
                      }

                      const data = queryRowsResult.data;
                      toolAct = { ...toolAct, title: `Query form "${data.formName}"` };
                      allowedFormIdsForTool.add(data.formId);
                      allowedFormNamesForTool.set(data.formName.trim().toLowerCase(), data.formId);

                      const rowLines = data.rows.map((row, idx) => {
                        const cellPairs = data.selectedColumns.map(column => {
                          const value = normalizeFormCellValue((row.cells ?? {})[column.id]);
                          const compactValue = value.length > 120 ? `${value.slice(0, 120)}...` : value;
                          return `${column.name}=${compactValue}`;
                        });
                        if (cellPairs.length === 0) {
                          return `[${data.offset + idx + 1}] rowId=${row.id}`;
                        }
                        return `[${data.offset + idx + 1}] rowId=${row.id} | ${cellPairs.join(' | ')}`;
                      });

                      toolResult = [
                        `[form] ${data.formName} (id: ${data.formId})`,
                        `all_columns: ${data.allColumns.map(column => column.name).join(', ')}`,
                        `selected_columns: ${data.selectedColumns.map(column => column.name).join(', ')}`,
                        `matched_total: ${data.matchedTotal}`,
                        `returned_count: ${data.returnedCount}`,
                        `rows: ${data.returnedCount} returned / ${data.matchedTotal} matched / ${data.totalRows} total`,
                        `offset: ${data.offset}`,
                        `limit: ${data.limit}`,
                        ...(query ? [`query: ${query}`] : []),
                        ...(data.appliedWhere ? [`where: ${JSON.stringify(data.appliedWhere)}`] : []),
                        ...(data.whereInferred ? ['where_inferred: true'] : []),
                        `has_more ${data.hasMore ? 'true' : 'false'}`,
                        ...(data.hasMore ? [`next_offset ${data.nextOffset}`] : []),
                        '',
                        ...(rowLines.length > 0 ? rowLines : ['[no rows matched]']),
                      ].join('\n');
                      resultSummary = `${data.matchedTotal} matched | ${data.returnedCount} returned`;
                    } else if (tc.name === 'query_knowledge') {
                      const args = parseToolArgs(tc.argsRaw);
                      const query = typeof args?.query === 'string' ? args.query.trim() : '';
                      const topK = typeof args?.topK === 'number'
                        ? Math.max(1, Math.min(12, Math.floor(args.topK)))
                        : 6;
                      const fileNameArg = typeof args?.fileName === 'string'
                        ? args.fileName.trim()
                        : '';

                      if (!query) {
                        throw new Error('Missing query');
                      }

                      queryKnowledgeCallsTotal += 1;

                      const fileNames = fileNameArg
                        ? [getPathBaseName(fileNameArg)]
                        : Array.from(knowledgeFileNamesForTool).slice(0, 36);
                      const queryTerms = buildSearchTerms(query);

                      if (fileNames.length === 0) {
                        toolResult = 'No referenced knowledge files available';
                        resultSummary = 'no referenced knowledge files';
                      } else {
                        const collected: AgentRAGResultItem[] = [];
                        const dedup = new Set<string>();

                        for (const fileName of fileNames) {
                          let ragResult: any;
                          try {
                            ragResult = await (window as any).electron?.ipcRenderer.invoke('agent:rag:query', {
                              query,
                              topK: 3,
                              fileName,
                            });
                          } catch {
                            continue;
                          }

                          const ragItems = Array.isArray(ragResult?.data?.results)
                            ? (ragResult.data.results as AgentRAGResultItem[])
                            : [];

                          for (const item of ragItems) {
                            const filePath = typeof item.filePath === 'string' ? item.filePath : '';
                            if (knowledgeKnownPathsForTool.size > 0 && filePath) {
                              const normalized = normalizeFilePath(filePath);
                              if (!knowledgeKnownPathsForTool.has(normalized)) {
                                continue;
                              }
                            }

                            const rawText = typeof item.childContent === 'string' && item.childContent.trim().length > 0
                              ? item.childContent
                              : (typeof item.content === 'string' ? item.content : '');
                            if (!rawText.trim()) continue;

                            const dedupKey = `${filePath}|${rawText.slice(0, 180)}`;
                            if (dedup.has(dedupKey)) {
                              continue;
                            }
                            dedup.add(dedupKey);

                            collected.push({
                              ...item,
                              childContent: rawText,
                            });
                          }
                        }

                        collected.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
                        const snippets = collected.slice(0, topK);
                        if (snippets.length === 0) {
                          const rankedFallback: Array<{ score: number; sourceName: string; snippet: string; path?: string }> = [];
                          const fileNameFilter = fileNameArg ? getPathBaseName(fileNameArg).toLowerCase() : '';
                          for (const candidate of knowledgeCandidatesForTool.slice(0, 120)) {
                            const candidateName = getPathBaseName(candidate.name).toLowerCase();
                            if (fileNameFilter && candidateName !== fileNameFilter) {
                              continue;
                            }
                            const cacheKey = candidate.path ?? candidate.name;
                            let content = typeof candidate.content === 'string' ? candidate.content : '';
                            if (!content && candidate.path) {
                              if (knowledgeContentCache.has(cacheKey)) {
                                content = knowledgeContentCache.get(cacheKey) ?? '';
                              } else {
                                try {
                                  const fileContent: string = await (window as any).electron?.ipcRenderer.invoke('read-file', candidate.path);
                                  content = typeof fileContent === 'string' ? fileContent : '';
                                } catch {
                                  content = '';
                                }
                                knowledgeContentCache.set(cacheKey, content);
                              }
                            } else if (content) {
                              knowledgeContentCache.set(cacheKey, content);
                            }

                            if (!content.trim()) continue;
                            const score = scoreTextByTerms(content, queryTerms);
                            if (score <= 0) continue;
                            const snippet = extractSnippetByTerms(content, queryTerms, 560);
                            if (!snippet) continue;
                            rankedFallback.push({
                              score,
                              sourceName: candidate.name,
                              snippet,
                              path: candidate.path,
                            });
                          }

                          rankedFallback.sort((a, b) => b.score - a.score);
                          const fallbackSnippets = rankedFallback.slice(0, topK);
                          if (fallbackSnippets.length === 0) {
                            toolResult = 'No matching knowledge snippets found';
                            resultSummary = 'no matches';
                            queryKnowledgeNoNewResultStreak += 1;
                          } else {
                            toolResult = fallbackSnippets.map((item, idx) => (
                              `[${idx + 1}] ${item.sourceName}\n${item.snippet}`
                            )).join('\n\n');
                            resultSummary = `${fallbackSnippets.length} snippets (keyword fallback)`;
                            const hash = hashText(toolResult);
                            if (queryKnowledgeResultHashes.has(hash)) {
                              queryKnowledgeNoNewResultStreak += 1;
                            } else {
                              queryKnowledgeResultHashes.add(hash);
                              queryKnowledgeNoNewResultStreak = 0;
                            }
                          }
                        } else {
                          toolResult = snippets.map((item, idx) => {
                            const filePath = typeof item.filePath === 'string' ? item.filePath : '';
                            const sourceName = filePath ? getPathBaseName(filePath) : 'knowledge';
                            const rawText = typeof item.childContent === 'string' && item.childContent.trim().length > 0
                              ? item.childContent
                              : (typeof item.content === 'string' ? item.content : '');
                            return `[${idx + 1}] ${sourceName}\n${trimSnippet(rawText, 560)}`;
                          }).join('\n\n');
                          resultSummary = `${snippets.length} snippets`;
                          const hash = hashText(toolResult);
                          if (queryKnowledgeResultHashes.has(hash)) {
                            queryKnowledgeNoNewResultStreak += 1;
                          } else {
                            queryKnowledgeResultHashes.add(hash);
                            queryKnowledgeNoNewResultStreak = 0;
                          }
                        }
                      }
                    } else if (tc.name === 'list_directory') {
                      const args = parseToolArgs(tc.argsRaw);
                      const path = typeof args?.path === 'string' ? args.path : '';
                      if (!path) throw new Error('Missing directory path');
                      const treeResult = await (window as any).electron?.folder?.readTree(path);
                      if (treeResult?.success && Array.isArray(treeResult.data)) {
                        const items = treeResult.data;
                        const listedFiles = items.filter((item: any) => item?.type !== 'directory').length;
                        listedFileCountHint = Math.max(listedFileCountHint, listedFiles);
                        toolResult = items.map((item: any) =>
                          `${item.type === 'directory' ? '[DIR]' : '[FILE]'} ${item.path}`
                        ).join('\n');
                        resultSummary = `${items.length} items`;
                      } else {
                        toolResult = 'Failed to list directory';
                        resultSummary = 'failed';
                        resultStatus = 'error';
                      }
                    } else {
                      toolResult = `Unknown tool: ${tc.name}`;
                      resultSummary = toolResult;
                      resultStatus = 'error';
                    }
                  } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    toolResult = `Tool execution failed: ${errorMessage}`;
                    resultSummary = errorMessage;
                    resultStatus = 'error';
                  }

                  if (!cachedToolResult) {
                    toolResultCache.set(toolCacheKey, {
                      result: toolResult,
                      summary: resultSummary,
                      status: resultStatus,
                    });
                  }

                  if (useBatchReadLogForCall) {
                    readFileDoneTotal += 1;
                    if (resultStatus === 'error') {
                      readFileFailedTotal += 1;
                    } else {
                      const lineCount = typeof readFileLineCount === 'number'
                        ? readFileLineCount
                        : parseReadLineCountFromSummary(resultSummary) ?? 0;
                      readFileTotalLines += lineCount;
                      readFileLineCount = lineCount;
                    }

                    const isBatchFinished = readFileDoneTotal >= readFilePlannedTotal;
                    const status: ActLog['status'] = isBatchFinished
                      ? (readFileFailedTotal > 0 ? 'error' : 'success')
                      : 'running';
                    const title = isBatchFinished
                      ? (readFileFailedTotal > 0
                        ? `Read calls ${readFileDoneTotal}/${readFilePlannedTotal} (with errors)`
                        : `Read calls ${readFileDoneTotal}/${readFilePlannedTotal}`)
                      : `Reading calls ${readFileDoneTotal}/${readFilePlannedTotal}`;

                    const detailParts: string[] = [
                      `latest: ${shortenPathForTimeline(readFilePath || '(unknown)')}`,
                    ];
                    if (resultStatus === 'error') {
                      detailParts.push(`error: ${resultSummary}`);
                    } else if (typeof readFileLineCount === 'number') {
                      detailParts.push(`${readFileLineCount} lines`);
                    }
                    detailParts.push(`total ${readFileTotalLines} lines`);
                    if (listedFileCountHint > 0) {
                      detailParts.push(`listed ${listedFileCountHint} files`);
                    }
                    if (readFileFailedTotal > 0) {
                      detailParts.push(`failed ${readFileFailedTotal}`);
                    }

                    upsertActLog(assistantMessageId, {
                      key: readBatchActKey,
                      kind: 'tool',
                      title,
                      detail: detailParts.join(' | '),
                      status,
                    });
                    await waitForActFrame(isBatchFinished ? 80 : 20);
                  } else if (showToolLog) {
                    upsertActLog(assistantMessageId, {
                      key: toolActKey,
                      kind: 'tool',
                      title: toolAct.title,
                      detail: resultSummary,
                      status: resultStatus,
                    });
                    emittedToolActKeys.add(toolActKey);
                    await waitForActFrame(80);
                  }
                  const toolResultForModel = getToolResultForModel(tc.name, toolResult);
                  chatMessages.push({ role: 'tool', content: toolResultForModel, tool_call_id: tc.id });
                  const budgetResult = enforceToolMessageBudget(chatMessages);
                  if (budgetResult.compacted > 0) {
                    toolContextCompactedTotal += budgetResult.compacted;
                    upsertActLog(assistantMessageId, {
                      key: contextBudgetActKey,
                      kind: 'status',
                      title: 'Context budget applied',
                      detail: `compacted ${toolContextCompactedTotal} tool payloads | tool chars ${budgetResult.totalChars}`,
                      status: 'info',
                    });
                    await waitForActFrame(20);
                  }
                }

                const onlyKnowledgeCallsThisRound = validToolCalls.length > 0
                  && validToolCalls.every(tc => tc.name === 'query_knowledge');
                const shouldStopKnowledgeLoop = !!activeChatTools
                  && onlyKnowledgeCallsThisRound
                  && (
                    queryKnowledgeCallsTotal >= MAX_QUERY_KNOWLEDGE_CALLS
                    || (queryKnowledgeNoNewResultStreak >= 1 && queryKnowledgeCallsTotal >= 2)
                  );
                if (shouldStopKnowledgeLoop) {
                  activeChatTools = undefined;
                  appendActLog(assistantMessageId, {
                    kind: 'status',
                    title: 'Knowledge retrieval converged',
                    detail: `Stop tools after ${queryKnowledgeCallsTotal} calls; generate final answer.`,
                    status: 'success',
                  });
                  chatMessages.push({
                    role: 'system',
                    content: 'You already have enough retrieved context. Do not call any tools. Provide the final answer in Chinese now.'
                  });
                }
                const shouldStopRepeatedToolLoop = !!activeChatTools
                  && repeatedCachedToolRounds >= 1
                  && allRoundToolsCached;
                if (shouldStopRepeatedToolLoop) {
                  activeChatTools = undefined;
                  appendActLog(assistantMessageId, {
                    kind: 'status',
                    title: 'Tool loop detected',
                    detail: 'Repeated cached tool calls detected, forcing final answer.',
                    status: 'info',
                  });
                  chatMessages.push({
                    role: 'system',
                    content: 'Tool results are already sufficient. Do not call any tools again. Provide the final answer in Chinese now.'
                  });
                }

                pendingToolCalls = [];
                currentContent = '';

                  await runChatWithTools();
                } catch (error) {
                  if (renderTimer) {
                    clearTimeout(renderTimer);
                    renderTimer = null;
                  }
                  renderQueue = '';
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  appendActLog(assistantMessageId, {
                    kind: 'error',
                    title: 'Round finalize error',
                    detail: errorMessage,
                    status: 'error',
                  });
                  setMessages(prev => prev.map(msg => {
                    if (msg.id !== assistantMessageId) return msg;
                    return {
                      ...msg,
                      isThinking: false,
                      content: msg.content + `\n\nRequest failed: ${errorMessage}`,
                      contentBlocks: msg.contentBlocks?.map(b => (
                        b.type === 'thinking'
                          ? { ...b, isThinking: false }
                          : (b.type === 'text' ? { ...b, isStreaming: false } : b)
                      )),
                    };
                  }));
                  setIsLoading(false);
                }
              },
              onError: (error) => {
                if (renderTimer) {
                  clearTimeout(renderTimer);
                  renderTimer = null;
                }
                renderQueue = '';
                appendActLog(assistantMessageId, {
                  kind: 'error',
                  title: 'Streaming error',
                  detail: error.message,
                  status: 'error',
                });
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + `\n\nRequest failed: ${error.message}` }
                    : msg
                ));
                setIsLoading(false);
              }
            }
          );
        };

        await runChatWithTools();
      } catch (err) {
        appendActLog(assistantMessageId, {
          kind: 'error',
          title: 'Chat request exception',
          detail: err instanceof Error ? err.message : String(err),
          status: 'error',
        });
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: `Request failed: ${err instanceof Error ? err.message : String(err)}` }
            : msg
        ));
        setIsLoading(false);
      }
      return;
    }

    // Agent 模式：调用 Agent 执行任务
    {
      const taskDesc = input.trim();
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: taskDesc,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      tiptapRef.current?.clear();
      setInput('');
      setIsLoading(true);

      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        model: selectedModel
      };
      setMessages(prev => [...prev, assistantMessage]);
      appendActLog(assistantMessageId, {
        kind: 'status',
        title: 'Agent task started',
        detail: taskDesc,
        status: 'running',
      });
      let finalizeDecompositionBlock: () => void = () => {};
      let todoEventListener: EventListener | null = null;
      const detachTodoListener = (): void => {
        if (!todoEventListener) return;
        window.removeEventListener('agent:todo-changed', todoEventListener);
        todoEventListener = null;
      };

      try {
        const modelConfig = await getModelConfig(selectedModel);
        if (!modelConfig) throw new Error(`未找到模型配置：${selectedModel}`);

        const actualModelId = selectedModel.includes(':') ? selectedModel.split(':')[1] : selectedModel;

        await aiService.setProvider(modelConfig.providerId, {
          id: modelConfig.id || 'default',
          name: modelConfig.name || modelConfig.configName,
          apiKey: modelConfig.apiKey,
          apiEndpoint: modelConfig.apiEndpoint,
          temperature: 0.7,
          maxTokens: 4000,
          modelId: actualModelId
        });

        await agentService.initialize({
          execution: { modelId: actualModelId, temperature: 0.7, maxTokens: 4000, streaming: true }
        });

        // 每次对话前重置记忆，避免上次工具结果污染本次
        agentService.reset();

        // 获取工作区路径并注册工具（每次都重新注册以确保路径最新）
        const workspaceResult = await (window as any).electron?.workspace?.getDir();
        const configuredWorkspacePath = workspaceResult?.success ? String(workspaceResult.data || '') : '';

        // Agent mode constraints: allow file write and command execution (with confirmation).
        const constraints = { allowFileWrite: true, allowCommandExecution: true };
        const selectedFormsSnapshot = selectedForms.map(form => ({ ...form }));
        const selectedKbsSnapshot = selectedKbs.map(kb => ({ ...kb }));
        const selectedFilesSnapshot = selectedFiles.map(file => ({ ...file }));
        const hasContextHint = selectedFormsSnapshot.length > 0
          || selectedKbsSnapshot.length > 0
          || selectedFilesSnapshot.length > 0;
        const contextDesc = consumeAgentContextDesc();
        const liveCurrentTabPath = typeof (window as any).__currentTabPath === 'string'
          ? (window as any).__currentTabPath.trim()
          : '';
        const liveCurrentTabTitle = typeof (window as any).__currentTabTitle === 'string'
          ? (window as any).__currentTabTitle.trim()
          : '';
        const selectedFileFallback = selectedFiles.find(item =>
          item.type === 'file' && typeof item.path === 'string' && item.path.trim().length > 0
        )?.path?.trim() ?? '';
        const normalizedCurrentFilePath = currentFilePath.trim() || liveCurrentTabPath || selectedFileFallback;
        const normalizedCurrentFileName = currentFileName.trim()
          || liveCurrentTabTitle
          || (normalizedCurrentFilePath ? getPathBaseName(normalizedCurrentFilePath) : '');
        const hasWritableCurrentFile = isLikelyFileSystemPath(normalizedCurrentFilePath);
        const taskType = inferAgentTaskType(taskDesc, hasContextHint, hasWritableCurrentFile);
        const compactAgentOutput = taskType === 'write' || taskType === 'edit';
        const currentFileForTask = !compactAgentOutput && hasWritableCurrentFile
          ? normalizedCurrentFilePath
          : '';
        const streamingDraftTarget = compactAgentOutput
          ? buildAgentDraftTarget()
          : null;
        const inferredWorkspacePath = hasWritableCurrentFile
          ? deriveDirectoryPath(normalizedCurrentFilePath)
          : '';
        const workspacePath = (() => {
          if (!configuredWorkspacePath) {
            return inferredWorkspacePath;
          }
          if (
            inferredWorkspacePath
            && hasWritableCurrentFile
            && !isPathInsideBase(normalizedCurrentFilePath, configuredWorkspacePath)
          ) {
            return inferredWorkspacePath;
          }
          return configuredWorkspacePath;
        })();

        // 每次按最新上下文重新注册工具，确保当前标签页文件可写。
        agentService.registerDefaultTools({ workspacePath });
        const additionalContext: Record<string, unknown> = {};
        if (!compactAgentOutput && normalizedCurrentFileName) {
          additionalContext.currentTabTitle = normalizedCurrentFileName;
        }
        if (!compactAgentOutput && normalizedCurrentFilePath) {
          additionalContext.currentTabPath = normalizedCurrentFilePath;
          additionalContext.currentTabEditPriority = 'prefer_current_tab_file';
        }
        if (compactAgentOutput) {
          additionalContext.referenceSource = 'random_workspace_article_by_command';
          additionalContext.referenceDimensions = [
            'framework',
            'style',
            'sentence_patterns',
            'structure',
            'logic_chain',
            'wording',
            'transitions',
            'turning_points',
            'cases',
          ];
          additionalContext.decompositionWorkflow = {
            steps: [
              'extract_meta_framework',
              'decide_sub_headings_or_direct_paragraph_decomposition',
              'paragraph_level_decomposition',
              'paragraph_by_paragraph_writing',
              'sentence_level_compare_score_and_optimize_loop',
            ],
            paragraphDimensions: [
              'logic_chain',
              'transitions',
              'turning_points',
              'cases',
              'word_choice',
              'information_density',
              'layout_style',
              'highlight_lines',
              'verb_adjective_precision',
              'rhetorical_devices',
              'length',
              'rhythm',
              'narrative_perspective',
              'hooks',
              'emotion_curve',
              'core_intent',
              'entry_point',
              'voice_style',
              'credibility_backing',
              'scientific_examples',
              'verb_noun_ratio',
              'rhetorical_logic',
            ],
          };
          // Reduce token burn from repeated verify loops for draft-generation mode.
          additionalContext.verifyGate = {
            minScore: 80,
            maxRepairRounds: 1,
          };
        }
        additionalContext.taskIntent = compactAgentOutput
          ? (taskType === 'edit'
            ? 'rewrite_by_random_reference_article'
            : 'generate_by_random_reference_article')
          : `${taskType}_task`;
        additionalContext.referencedContext = {
          files: selectedFilesSnapshot
            .filter(item => item.type === 'file' && typeof item.path === 'string' && item.path.trim().length > 0)
            .map(item => ({ name: item.name, path: item.path, type: 'file' })),
          directories: selectedFilesSnapshot
            .filter(item => item.type === 'directory' && typeof item.path === 'string' && item.path.trim().length > 0)
            .map(item => ({ name: item.name, path: item.path, type: 'directory' })),
          knowledgeBases: selectedKbsSnapshot.map(item => ({ id: item.id, title: item.title })),
          forms: selectedFormsSnapshot.map(item => ({ id: item.id, name: item.name })),
        };
        if (enabledDecompositionRules.length > 0) {
          additionalContext.decompositionRules = enabledDecompositionRules.map(rule => ({
            id: rule.id,
            name: rule.name,
            instruction: rule.instruction,
          }));
        }
        if (enabledWritingRuleDocuments.length > 0) {
          additionalContext.writingRuleDocuments = enabledWritingRuleDocuments.map(document => ({
            id: document.id,
            name: document.name,
            path: document.path,
            enabled: document.enabled,
          }));
        }
        const currentTabTargetContext = !compactAgentOutput && normalizedCurrentFilePath
          ? `\n\n[Current tab reference]\n- title: ${normalizedCurrentFileName || getPathBaseName(normalizedCurrentFilePath)}\n- path: ${normalizedCurrentFilePath}\n- instruction: use as reference only. do not overwrite this file unless the user explicitly requests writing to this path.`
          : '';

        const task = agentService.createTask(
          taskType,
          taskDesc + contextDesc + currentTabTargetContext,
          {
            workspacePath,
            currentFile: currentFileForTask || undefined,
            additionalContext: Object.keys(additionalContext).length > 0 ? additionalContext : undefined,
          },
          constraints
        );

        if (streamingDraftTarget) {
          syncEditorTabContent('', streamingDraftTarget.path, streamingDraftTarget.name, false);
        }

        // Agent mode always requires confirmation.
        const needsConfirm = true;
        let hasLoggedStreamStart = false;
        const decompositionBlockKey = `${assistantMessageId}-decomposition`;
        let activeStepId = '';
        let activeStepType = '';
        let activeStepIsDecomposition = false;
        let decompositionStreamText = '';
        let streamingWriteDraft = '';
        let streamingWriteBuffer = '';
        let streamingWriteRaw = '';
        let writeStepPendingFinalize = false;
        let writeRenderTimer: ReturnType<typeof setInterval> | null = null;

        upsertTodoBlock(assistantMessageId, [], {
          title: '执行清单',
          isStreaming: true,
        });
        todoEventListener = (event: Event) => {
          const detail = (event as CustomEvent<{ todos?: unknown }>).detail;
          const items = normalizeTodoItems(detail?.todos);
          upsertTodoBlock(assistantMessageId, items, {
            title: '执行清单',
            isStreaming: true,
          });
        };
        window.addEventListener('agent:todo-changed', todoEventListener);

        const resolveStreamingTargetPath = (): string => {
          if (streamingDraftTarget?.path) {
            return streamingDraftTarget.path;
          }
          if (currentFileForTask) {
            return currentFileForTask;
          }
          const livePath = typeof (window as any).__currentTabPath === 'string'
            ? (window as any).__currentTabPath.trim()
            : '';
          if (isLikelyFileSystemPath(livePath)) {
            return livePath;
          }
          return hasWritableCurrentFile
            ? normalizedCurrentFilePath
            : '';
        };

        const resolveStreamingTargetName = (targetPath: string): string | undefined => {
          if (streamingDraftTarget && targetPath === streamingDraftTarget.path) {
            return streamingDraftTarget.name;
          }
          if (normalizedCurrentFileName) {
            return normalizedCurrentFileName;
          }
          const liveTitle = typeof (window as any).__currentTabTitle === 'string'
            ? (window as any).__currentTabTitle.trim()
            : '';
          if (liveTitle) {
            return liveTitle;
          }
          return targetPath ? getPathBaseName(targetPath) : undefined;
        };

        const flushStreamingWriteDraft = (markDirty: boolean): void => {
          if (!compactAgentOutput) return;
          if (!streamingWriteDraft) return;
          const targetPath = resolveStreamingTargetPath();
          if (!targetPath) return;
          syncEditorTabContent(
            streamingWriteDraft,
            targetPath,
            resolveStreamingTargetName(targetPath),
            markDirty
          );
        };

        const stopWriteRenderPump = (): void => {
          if (!writeRenderTimer) return;
          clearInterval(writeRenderTimer);
          writeRenderTimer = null;
        };

        const drainWriteRenderBuffer = (markDirty: boolean, final: boolean): void => {
          if (streamingWriteBuffer) {
            streamingWriteRaw += streamingWriteBuffer;
            streamingWriteBuffer = '';
          }
          streamingWriteDraft = normalizeWriteOutputForEditor(streamingWriteRaw, final);
          flushStreamingWriteDraft(markDirty);
        };

        const ensureWriteRenderPump = (): void => {
          if (writeRenderTimer) return;
          writeRenderTimer = setInterval(() => {
            if (!streamingWriteBuffer) {
              if (writeStepPendingFinalize) {
                writeStepPendingFinalize = false;
                activeStepType = '';
                drainWriteRenderBuffer(false, true);
              }
              stopWriteRenderPump();
              return;
            }
            const chunk = streamingWriteBuffer.slice(0, WRITE_STREAM_RENDER_CHUNK_SIZE);
            streamingWriteBuffer = streamingWriteBuffer.slice(chunk.length);
            if (!chunk) return;
            streamingWriteRaw += chunk;
            streamingWriteDraft = normalizeWriteOutputForEditor(streamingWriteRaw, false);
            flushStreamingWriteDraft(true);
            if (!streamingWriteBuffer && writeStepPendingFinalize) {
              writeStepPendingFinalize = false;
              activeStepType = '';
              drainWriteRenderBuffer(false, true);
              stopWriteRenderPump();
            }
          }, WRITE_STREAM_RENDER_INTERVAL_MS);
        };

        const appendDecompositionChunk = (chunk: string): void => {
          const normalizedChunk = chunk;
          decompositionStreamText += normalizedChunk;
          if (!SHOW_DECOMPOSITION_STREAM_BLOCK) {
            return;
          }
          setMessages(prev => prev.map(msg => {
            if (msg.id !== assistantMessageId) return msg;
            const blocks = [...(msg.contentBlocks ?? [])];
            const existingIndex = blocks.findIndex(
              block => block.type === 'decomposition' && block.key === decompositionBlockKey
            );
            if (existingIndex >= 0) {
              const existing = blocks[existingIndex];
              if (existing.type === 'decomposition') {
                blocks[existingIndex] = {
                  ...existing,
                  content: existing.content + normalizedChunk,
                  isStreaming: true,
                };
              }
            } else {
              blocks.push({
                type: 'decomposition',
                key: decompositionBlockKey,
                title: '拆解过程',
                content: normalizedChunk,
                isStreaming: true,
              });
            }
            return { ...msg, contentBlocks: blocks };
          }));
        };

        finalizeDecompositionBlock = (): void => {
          if (!SHOW_DECOMPOSITION_STREAM_BLOCK) {
            return;
          }
          setMessages(prev => prev.map(msg => {
            if (msg.id !== assistantMessageId) return msg;
            const blocks = (msg.contentBlocks ?? []).map(block => {
              if (block.type === 'decomposition' && block.key === decompositionBlockKey) {
                return { ...block, isStreaming: false };
              }
              return block;
            });
            return { ...msg, contentBlocks: blocks };
          }));
        };

        await agentService.executeTaskStream(task, {
          onStepStart: (step) => {
            activeStepId = typeof step.id === 'string' ? step.id : '';
            activeStepType = typeof step.type === 'string' ? step.type : '';
            activeStepIsDecomposition = isDecompositionStep(String(step.description ?? ''));
            const stepDescription = String(step.description ?? '');
            const simpleStepKind = inferSimpleAgentStepKind(activeStepType, stepDescription);
            if (activeStepType === 'write') {
              stopWriteRenderPump();
              streamingWriteDraft = '';
              streamingWriteBuffer = '';
              streamingWriteRaw = '';
              writeStepPendingFinalize = false;
            }
            const shouldShowStartLog = compactAgentOutput
              ? shouldShowSimpleStepLog(simpleStepKind, 'start')
              : !(activeStepIsDecomposition && !SHOW_DECOMPOSITION_STEP_LOG);
            if (shouldShowStartLog) {
              appendActLog(assistantMessageId, {
                kind: 'step',
                title: compactAgentOutput
                  ? `开始：${getSimpleAgentStepLabel(simpleStepKind)}`
                  : (activeStepIsDecomposition
                    ? `Step started (decomposition): ${step.description}`
                    : `Step started: ${step.description}`),
                status: 'running',
              });
            }
          },
          onStepComplete: (step, result) => {
            const completedIsDecomposition = isDecompositionStep(String(step.description ?? ''));
            const completedStepType = typeof step.type === 'string' ? step.type : '';
            const completedDescription = String(step.description ?? '');
            const simpleStepKind = inferSimpleAgentStepKind(completedStepType, completedDescription);
            const verifyGateDetail = step.type === 'verify'
              ? extractVerifyGateDetail(result)
              : null;
            const toolCallFailed = step.type === 'tool_call'
              ? isToolCallExecutionFailed(result)
              : false;
            const verifyFailed = !!(verifyGateDetail && !verifyGateDetail.passed);
            const stepFailed = verifyFailed || toolCallFailed;
            const stepTitlePrefix = verifyFailed
              ? 'Step failed (verify gate)'
              : (toolCallFailed ? 'Step failed (tool call)' : 'Step completed');
            const stepDetail = verifyGateDetail
              ? formatVerifyGateDetail(verifyGateDetail)
              : (step.type === 'tool_call'
                ? formatToolCallStepDetail(result)
                : (result ? stringifyActDetail(result) : undefined));
            const shouldShowCompleteLog = compactAgentOutput
              ? shouldShowSimpleStepLog(simpleStepKind, stepFailed ? 'failed' : 'complete')
              : !(completedIsDecomposition && !SHOW_DECOMPOSITION_STEP_LOG);
            const compactStepDetailRaw = stepFailed
              ? (verifyGateDetail
                ? formatVerifyGateDetail(verifyGateDetail)
                : (step.type === 'tool_call' ? formatToolCallStepDetail(result) : undefined))
              : undefined;
            const compactStepDetail = compactStepDetailRaw
              ? trimTodoContent(compactStepDetailRaw, 120)
              : undefined;
            if (shouldShowCompleteLog) {
              appendActLog(assistantMessageId, {
                kind: 'step',
                title: compactAgentOutput
                  ? `${stepFailed ? '失败' : '完成'}：${getSimpleAgentStepLabel(simpleStepKind)}`
                  : (completedIsDecomposition
                    ? `${stepTitlePrefix} (decomposition): ${step.description}`
                    : `${stepTitlePrefix}: ${step.description}`),
                detail: compactAgentOutput ? compactStepDetail : stepDetail,
                status: stepFailed ? 'error' : 'success',
              });
            }
            if (completedIsDecomposition) {
              finalizeDecompositionBlock();
            }
            if (step.type === 'write') {
              writeStepPendingFinalize = true;
              if (!streamingWriteBuffer && !writeRenderTimer) {
                writeStepPendingFinalize = false;
                activeStepType = '';
                drainWriteRenderBuffer(false, true);
              } else {
                ensureWriteRenderPump();
              }
            }
            if (activeStepId && step.id === activeStepId) {
              activeStepIsDecomposition = false;
              if (step.type !== 'write') {
                activeStepType = '';
              }
            }
          },
          onContent: (() => {
            let answerBuffer = '';
            let answerTimer: ReturnType<typeof setTimeout> | null = null;
            const flushAnswerBuffer = () => {
              const flushed = answerBuffer;
              answerBuffer = '';
              answerTimer = null;
              if (!flushed) return;
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + flushed }
                  : msg
              ));
            };
            return (content: string) => {
              if (!compactAgentOutput && !hasLoggedStreamStart && content.trim()) {
                hasLoggedStreamStart = true;
                appendActLog(assistantMessageId, {
                  kind: 'stream',
                  title: 'Agent streaming response',
                  status: 'running',
                });
              }
              if (activeStepIsDecomposition) {
                appendDecompositionChunk(content);
                return;
              }
              if (compactAgentOutput && activeStepType === 'write') {
                streamingWriteBuffer += content;
                ensureWriteRenderPump();
                return;
              }
              // Compact write/edit mode keeps only concise timeline and write-stream-to-tab behavior.
              if (compactAgentOutput) {
                return;
              }
              answerBuffer += content;
              if (!answerTimer) {
                answerTimer = setTimeout(flushAnswerBuffer, 90);
              }
            };
          })(),
          onToolCall: (toolName, params) => {
            const uiId = `tc-agent-${Date.now()}-${toolName}`;
            const p = params as Record<string, unknown>;
            let label = toolName;
            if (typeof p.path === 'string') label = `${toolName} ${p.path}`;
            else if (typeof p.query === 'string') label = `${toolName} "${p.query}"`;
            else if (typeof p.pattern === 'string') label = `${toolName} "${p.pattern}"`;
            else if (typeof p.command === 'string') label = `${toolName} ${p.command}`;
            const toolDetail = buildToolCallDetail(toolName, p);
            const bashCommand = toolName === 'bash' && typeof p.command === 'string'
              ? p.command
              : undefined;
            const pendingToolLog: ToolLog = {
              uiId,
              name: toolName,
              label,
              detail: toolDetail,
              command: bashCommand,
              output: toolName === 'bash' ? 'Running...' : undefined,
              status: 'pending',
            };
            appendActLog(assistantMessageId, {
              kind: 'tool',
              title: `Tool call: ${toolName}`,
              detail: toolDetail,
              status: 'pending',
            });
            appendToolLogBlock(assistantMessageId, pendingToolLog);
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    isThinkingPhase: true,
                    thinkingStartTime: msg.thinkingStartTime ?? Date.now(),
                  }
                : msg
            ));
          },
          onToolResult: (toolName, result) => {
            // 从真实结果中提取摘要
            let summary = result.success ? 'done' : 'failed';
            const resultData = (result.data ?? {}) as Record<string, unknown>;
            const bashOutput = toolName === 'bash'
              ? buildBashToolOutput(result as { success: boolean; data?: unknown; error?: string })
              : undefined;
            if (result.success && result.data) {
              const d = resultData;
              if (typeof d.content === 'string') {
                const lines = d.content.split('\n').length;
                summary = `${lines} lines`;
              } else if (Array.isArray(d.items)) {
                summary = `${d.items.length} items`;
              } else if (typeof d.count === 'number') {
                summary = `${d.count} results`;
              } else if (typeof d.output === 'string') {
                const lines = d.output.split('\n').filter(Boolean).length;
                summary = lines > 0 ? `${lines} lines` : 'done';
              } else if (typeof d.stdout === 'string') {
                const lines = d.stdout.split('\n').filter(Boolean).length;
                summary = lines > 0 ? `${lines} lines` : 'done';
              }
            }
            if (toolName === 'bash' && bashOutput) {
              const lines = bashOutput.split('\n').filter(Boolean).length;
              summary = lines > 0 ? `${lines} lines` : summary;
            }
            appendActLog(assistantMessageId, {
              kind: 'tool',
              title: `Tool result: ${toolName}`,
              detail: summary,
              status: result.success ? 'success' : 'error',
            });
            resolveLatestPendingToolLog(
              assistantMessageId,
              toolName,
              result.success ? 'success' : 'error',
              summary,
              {
                detail: toolName === 'bash' && typeof resultData.command === 'string'
                  ? resultData.command
                  : undefined,
                command: toolName === 'bash' && typeof resultData.command === 'string'
                  ? resultData.command
                  : undefined,
                output: toolName === 'bash'
                  ? (bashOutput || (result.success ? '(no output)' : (result.error || 'Tool execution failed')))
                  : undefined,
              }
            );

            const isWriteTool = toolName === 'write_file' || toolName === 'edit_file' || toolName === 'multi_edit_file';
            if (isWriteTool && result.success) {
              const data = (result.data ?? {}) as Record<string, unknown>;
              const changeWithContent = (result.changes ?? []).find((change: { newContent?: string }) =>
                typeof change.newContent === 'string'
              );
              const writtenContent = typeof changeWithContent?.newContent === 'string'
                ? changeWithContent.newContent
                : (typeof data.newContent === 'string' ? data.newContent : '');
              const writtenPath = typeof data.path === 'string'
                ? data.path
                : (typeof changeWithContent?.filePath === 'string'
                  ? changeWithContent.filePath
                  : normalizedCurrentFilePath);
              const writtenName = writtenPath
                ? getPathBaseName(writtenPath)
                : (normalizedCurrentFileName || undefined);
              const normalizedWrittenContent = normalizeWriteOutputForEditor(writtenContent, true);

              if (normalizedWrittenContent) {
                syncEditorTabContent(normalizedWrittenContent, writtenPath || undefined, writtenName, false);
              }
            }
          },
          onConfirmRequired: needsConfirm
            ? (toolName, params) => requestToolConfirmation(toolName, params)
            : undefined,
          onComplete: (result) => {
            detachTodoListener();
            if (pendingToolConfirmationResolverRef.current) {
              settlePendingToolConfirmation(false);
            }
            if (writeStepPendingFinalize && !writeRenderTimer) {
              writeStepPendingFinalize = false;
              drainWriteRenderBuffer(false, true);
            } else if (streamingWriteBuffer && !writeRenderTimer) {
              ensureWriteRenderPump();
            }
            const optimizedOutput = result.output ? optimizeAssistantOutput(result.output) : '';
            const outputWithoutDecomposition = decompositionStreamText.trim()
              ? stripDecompositionSection(optimizedOutput, decompositionStreamText)
              : optimizedOutput;
            const finalSuccessOutput = outputWithoutDecomposition || optimizedOutput;
            const changedFiles = (result.changes ?? [])
              .map((change: { filePath?: string }) => change.filePath)
              .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
            if (compactAgentOutput && result.success && changedFiles.length === 0) {
              const fallbackWriteContent = typeof result.finalWriteContent === 'string'
                ? normalizeWriteOutputForEditor(result.finalWriteContent, true).trim()
                : '';
              if (fallbackWriteContent) {
                const fallbackTargetPath = resolveStreamingTargetPath();
                if (fallbackTargetPath) {
                  syncEditorTabContent(
                    fallbackWriteContent,
                    fallbackTargetPath,
                    resolveStreamingTargetName(fallbackTargetPath),
                    true
                  );
                }
              }
            }
            const finalSuccessContent = compactAgentOutput
              ? buildCompactAgentResultText(
                taskType,
                normalizedCurrentFilePath,
                changedFiles,
                resolveStreamingTargetPath()
              )
              : finalSuccessOutput;
            const finalContent = result.success
              ? finalSuccessContent
              : `**Execution failed**: ${result.error || 'Unknown error'}`;
            const completionDetail = (() => {
              if (!result.success) {
                return result.error || 'unknown error';
              }
              if (compactAgentOutput) {
                const targetPath = resolveStreamingTargetPath() || normalizedCurrentFilePath;
                if (changedFiles.length > 0) {
                  return `已完成，文件改动 ${changedFiles.length} 个`;
                }
                if (targetPath) {
                  return `已完成，输出目标 ${targetPath}`;
                }
                return '已完成';
              }
              const outputLength = finalSuccessOutput.trim().length;
              return outputLength > 0
                ? `已完成，输出 ${outputLength} 字符`
                : '已完成';
            })();
            appendActLog(assistantMessageId, {
              kind: 'status',
              title: result.success ? 'Agent task completed' : 'Agent task failed',
              detail: completionDetail,
              status: result.success ? 'success' : 'error',
            });
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMessageId) return msg;
              const elapsed = msg.thinkingStartTime ? Math.max(1, Math.round((Date.now() - msg.thinkingStartTime) / 1000)) : 1;
              const finalizedBlocks = (msg.contentBlocks ?? []).map(block => {
                if (block.type === 'decomposition' && block.key === decompositionBlockKey) {
                  return { ...block, isStreaming: false };
                }
                if (block.type === 'todo') {
                  return { ...block, isStreaming: false };
                }
                if (block.type === 'tool' && block.tool.status === 'pending') {
                  return { ...block, tool: { ...block.tool, status: 'success' as const } };
                }
                return block;
              });
              return {
                ...msg,
                isThinkingPhase: false,
                elapsedSeconds: elapsed,
                content: result.success
                  ? (finalContent.trim() || msg.content.trim())
                  : finalContent.trim(),
                contentBlocks: finalizedBlocks,
                toolCalls: msg.toolCalls?.map(tc =>
                  tc.status === 'pending' ? { ...tc, status: 'success' as const } : tc
                ),
              };
            }));
            setIsLoading(false);
          },
          onError: (err) => {
            detachTodoListener();
            if (pendingToolConfirmationResolverRef.current) {
              settlePendingToolConfirmation(false);
            }
            stopWriteRenderPump();
            writeStepPendingFinalize = false;
            drainWriteRenderBuffer(false, true);
            finalizeDecompositionBlock();
            appendActLog(assistantMessageId, {
              kind: 'error',
              title: 'Agent stream error',
              detail: err.message,
              status: 'error',
            });
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMessageId) return msg;
              const nextBlocks = (msg.contentBlocks ?? []).map(block =>
                block.type === 'todo'
                  ? { ...block, isStreaming: false }
                  : block
              );
              return {
                ...msg,
                content: msg.content + `\n\n**Error**: ${err.message}`,
                contentBlocks: nextBlocks,
              };
            }));
            setIsLoading(false);
          }
        });
        detachTodoListener();
      } catch (err) {
        detachTodoListener();
        if (pendingToolConfirmationResolverRef.current) {
          settlePendingToolConfirmation(false);
        }
        finalizeDecompositionBlock();
        appendActLog(assistantMessageId, {
          kind: 'error',
          title: 'Agent task exception',
          detail: err instanceof Error ? err.message : String(err),
          status: 'error',
        });
        setMessages(prev => prev.map(msg => {
          if (msg.id !== assistantMessageId) return msg;
          const nextBlocks = (msg.contentBlocks ?? []).map(block =>
            block.type === 'todo'
              ? { ...block, isStreaming: false }
              : block
          );
          return {
            ...msg,
            content: msg.content + `\n\n**Execution failed**: ${err instanceof Error ? err.message : String(err)}`,
            contentBlocks: nextBlocks,
          };
        }));
        setIsLoading(false);
      }
      return;
    }
  };

  const toggleMaximize = () => {
    if (isEditorTabMode) {
      window.dispatchEvent(new Event('restore-ai-chat-panel'));
      onClose();
      return;
    }
    openInEditorTab();
    onClose();
  };

  const handleHeaderRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setHeaderContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeHeaderContextMenu = () => {
    setHeaderContextMenu(null);
  };

  const handleMoveLeft = () => {
    closeHeaderContextMenu();
    if (onMoveLeft) {
      onMoveLeft();
    }
  };

  const handleMoveRight = () => {
    closeHeaderContextMenu();
    if (onMoveRight) {
      onMoveRight();
    }
  };

  const handleClosePanel = () => {
    setIsHistoryOpen(false);
    onClose();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized || isEditorTabMode) return; // 标签页模式禁用拖拽调整
    e.preventDefault();
    setIsResizing(true);
  };

  const renderToolLogEntry = (tool: ToolLog, key: React.Key): React.ReactNode => {
    if (tool.name === 'bash') {
      const commandText = (tool.command || tool.detail || tool.label || 'bash').trim();
      const outputText = (tool.output || '').trim();
      const bodyText = outputText || (tool.status === 'pending' ? 'Running...' : '(no output)');

      return (
        <div key={key} className={`tool-bash-card tool-bash-card--${tool.status}`}>
          <div className="tool-bash-card__header">
            <span className="tool-bash-card__tag">Bash</span>
            <code className="tool-bash-card__command">{commandText}</code>
          </div>
          <pre className="tool-bash-card__body">{bodyText}</pre>
        </div>
      );
    }

    return (
      <div key={key} className={`tool-call-log__item tool-call-log__item--${tool.status}`}>
        <span className="tool-call-log__dot" />
        <span className="tool-call-log__label">{tool.label}</span>
        {tool.summary && <span className="tool-call-log__summary">{tool.summary}</span>}
        {tool.detail && (
          <details className="tool-call-log__details">
            <summary>查看参数/命令</summary>
            <pre>{tool.detail}</pre>
          </details>
        )}
      </div>
    );
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;
      
      const rect = panelRef.current.getBoundingClientRect();
      
      // 查询 editor-area 元素获取实际宽度
      const editorArea = document.querySelector('.editor-area') as HTMLElement;
      
      // 根据位置计算期望的新宽度
      let newWidth = position === 'right' 
        ? rect.right - e.clientX  // Right panel: drag left to increase width.
        : e.clientX - rect.left;  // Left panel: drag right to increase width.
      
      // If editor-area exists, check its current width.
      if (editorArea) {
        const editorAreaRect = editorArea.getBoundingClientRect();
        const currentEditorAreaWidth = editorAreaRect.width;
        
        // If editor-area is at or below the minimum width.
        if (currentEditorAreaWidth <= EDITOR_AREA_MIN_WIDTH) {
          // Only allow shrinking AI panel (thus increasing editor-area width).
          const currentWidth = rect.width;
          if (newWidth > currentWidth) {
            // 阻止 AI panel 继续增大
            return;
          }
        }
      }
      
      // Clamp width between min and max.
      newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
      
      // 宽度低于阈值时自动关闭面板
      if (newWidth < COLLAPSE_THRESHOLD) {
        onClose();
        setIsResizing(false);
        return;
      }
      
      // Apply new width.
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onClose, position]);

  return (
    <div 
      ref={panelRef}
      className={`ai-chat-panel ${isEditorTabMode ? 'editor-tab' : ''} ${isMaximized ? 'maximized' : ''}`.trim()}
      style={!isMaximized && !isEditorTabMode ? { 
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`
      } : {}}
    >
      
       <div className='ai-chat-panel-border'></div>
      {/* 拖拽手柄 */}
      {!isMaximized && !isEditorTabMode && (
        <div
          className={`ai-chat-panel-resize-handle ${isResizing ? 'resizing' : ''}`}
          style={{
            backgroundColor: (isResizing || isHoveringHandle) ? undefined : 'var(--ws-button-background)',
            opacity: (isResizing || isHoveringHandle) ? undefined : 0,
            // 根据位置调整手柄位置
            left: position === 'right' ? 0 : 'auto',
            right: position === 'left' ? 0 : 'auto'
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHoveringHandle(true)}
          onMouseLeave={() => setIsHoveringHandle(false)}
        />
      )}

      {/* Panel Header */}
      <div 
        ref={headerRef}
        className="ai-chat-panel-header"
        onContextMenu={handleHeaderRightClick}
      >
        <div className="ai-chat-panel-header-left">
          {currentView === 'chat' && (
            <button
              ref={historyButtonRef}
              className={`history-dropdown-trigger ${isHistoryOpen ? 'active' : ''}`}
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              title="历史记录"
            >
              <Icon name="history" size={14} />
              <span>历史记录</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d={isHistoryOpen ? 'M3 7L6 4L9 7' : 'M3 5L6 8L9 5'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="ai-chat-panel-header-right">
          {currentView === 'chat' ? (
            <>
              <button
                onClick={createNewChat}
                title="新建聊天"
              >
                <Icon name="plus" size={16} />
              </button>
              <button
                onClick={() => setCurrentView('settings')}
                title="聊天设置"
              >
                <Icon name="gear" size={16} />
              </button>
              <div className="ai-chat-panel-header-divider"></div>
              <button
                onClick={toggleMaximize}
                title={isEditorTabMode ? '还原到侧边栏' : '在标签页打开'}
              >
                {isEditorTabMode ? (
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M9 9V3H7v2.59L3.91 2.5L2.5 3.91L5.59 7H3v2h6zm12 0V7h-2.59l3.09-3.09l-1.41-1.41L17 5.59V3h-2v6h6zM3 15v2h2.59L2.5 20.09l1.41 1.41L7 18.41V21h2v-6H3zm12 0v6h2v-2.59l3.09 3.09l1.41-1.41L18.41 17H21v-2h-6z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3.75 3a.75.75 0 0 0-.75.75V5.5a.5.5 0 0 1-1 0V3.75C2 2.784 2.784 2 3.75 2H5.5a.5.5 0 0 1 0 1H3.75zM10 2.5a.5.5 0 0 1 .5-.5h1.75c.966 0 1.75.784 1.75 1.75V5.5a.5.5 0 0 1-1 0V3.75a.75.75 0 0 0-.75-.75H10.5a.5.5 0 0 1-.5-.5zM2.5 10a.5.5 0 0 1 .5.5v1.75c0 .414.336.75.75.75H5.5a.5.5 0 0 1 0 1H3.75A1.75 1.75 0 0 1 2 12.25V10.5a.5.5 0 0 1 .5-.5zm11 0a.5.5 0 0 1 .5.5v1.75A1.75 1.75 0 0 1 12.25 14H10.5a.5.5 0 0 1 0-1h1.75a.75.75 0 0 0 .75-.75V10.5a.5.5 0 0 1 .5-.5z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleClosePanel}
                title="关闭"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" strokeWidth="1"/>
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => setCurrentView('chat')}
              title="关闭"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
                <path d="M1 1l10 10M11 1L1 11" strokeWidth="1"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Header 右键菜单 */}
      {headerContextMenu && createPortal(
        <div
          ref={headerContextMenuRef}
          className="ai-chat-header-context-menu"
          style={{
            position: 'fixed',
            left: `${headerContextMenu.x}px`,
            top: `${headerContextMenu.y}px`,
            zIndex: 9999
          }}
        >
          {position === 'right' && (
            <div 
              className="ai-chat-header-context-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLeft();
              }}
            >
              <span>向左移动聊天</span>
            </div>
          )}
          {position === 'left' && (
            <div 
              className="ai-chat-header-context-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveRight();
              }}
            >
              <span>向右移动聊天</span>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Main content area: render chat view or settings view. */}
      {currentView === 'chat' ? (
        <React.Fragment>
          {/* 消息列表容器 */}
          <div 
            ref={messagesContainerRef}
            className={`ai-chat-panel-messages ${isMaximized ? 'centered' : ''}`}
            onMouseEnter={handleMessagesMouseEnter}
            onMouseLeave={handleMessagesMouseLeave}
          >
            <div 
              className={`ai-chat-panel-messages-content ${isMaximized ? 'max-width' : ''}`}
            >
              {messages.map((message, index) => {
                // Debug: output thinkingSteps state for each message.
                // if (message.role === 'assistant') {
                //   console.log('[AIChatPanel Render] 助手消息ID:', message.id, 
                //     'thinkingSteps:', message.thinkingSteps, 
                //     'thinkingSteps length:', message.thinkingSteps?.length,
                //     'content:', message.content?.substring(0, 50));
                // }
                
                // Whether current assistant message has thinking steps.
                const hasThinkingSteps = message.role === 'assistant' && message.thinkingSteps && message.thinkingSteps.length > 0;
                const isLatestAssistantMessage = message.role === 'assistant' && index === messages.length - 1;
                const contentBlocks = message.contentBlocks ?? [];
                const dedupedContentBlocks = contentBlocks.reduce<ContentBlock[]>((acc, block) => {
                  if (block.type !== 'text') {
                    acc.push(block);
                    return acc;
                  }
                  const normalizedCurrent = normalizeTimelineText(block.text);
                  const lastTextBlock = [...acc].reverse().find(item => item.type === 'text');
                  if (lastTextBlock && lastTextBlock.type === 'text') {
                    const normalizedLast = normalizeTimelineText(lastTextBlock.text);
                    if (normalizedCurrent && normalizedCurrent === normalizedLast) {
                      return acc;
                    }
                  }
                  acc.push(block);
                  return acc;
                }, []);
                const hasTextBlock = message.role === 'assistant' && dedupedContentBlocks.some(block => block.type === 'text');
                const showThinkingIndicator = isLatestAssistantMessage && isLoading;
                
                return (
                  <React.Fragment key={message.id}>

                    {/* Render user or assistant message. */}
                    <div
                      className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
                    >
                      {/* 用户消息显示头像 */}
                      {message.role === 'user' && (
                        <div className="message-avatar">
                          <img 
                            src="/avtar.jpg" 
                            alt="User Avatar"
                            className="avatar-image"
                          />
                        </div>
                      )}
                      
                      <div className={`message-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}>
                        {/* 助手消息显示模型信息 */}
                        {message.role === 'assistant' && message.model && (
                          <div className="message-model-info">
                            <AIProviderIconFromModel modelString={message.model} />
                            <span className="model-name">{formatModelDisplayName(message.model)}</span>
                          </div>
                        )}
                        
                        {/* Interleaved blocks: text, tool calls, deep thinking. */}
                        {message.role === 'assistant' && dedupedContentBlocks.length > 0 ? (
                          <div className="message-content-blocks">
                            {dedupedContentBlocks.map((block, blockIdx) => {
                              if (block.type === 'thinking') {
                                return (
                                  <ThinkingBlock
                                    key={`thinking-${blockIdx}`}
                                    thinkingContent={block.content}
                                    isDeepThinking={true}
                                    isThinkingPhase={block.isThinking}
                                    elapsedSeconds={block.elapsedSeconds}
                                    isExpanded={toolThinkingExpanded.get(message.id + '-dt') ?? block.isThinking}
                                    onToggle={() => setToolThinkingExpanded(prev => {
                                      const next = new Map(prev);
                                      const key = message.id + '-dt';
                                      next.set(key, !prev.get(key));
                                      return next;
                                    })}
                                  />
                                );
                              }
                              if (block.type === 'tool') {
                                return renderToolLogEntry(block.tool, block.tool.uiId);
                              }
                              if (block.type === 'act') {
                                return (
                                  <div key={block.act.id} className={`act-log__item act-log__item--${block.act.status}`}>
                                    <span className="act-log__dot" />
                                    <span className="act-log__title">{block.act.title}</span>
                                    {block.act.detail && <span className="act-log__detail">{block.act.detail}</span>}
                                  </div>
                                );
                              }
                              if (block.type === 'todo') {
                                const completedCount = block.items.filter(item => item.status === 'completed').length;
                                const totalCount = block.items.length;
                                const requirementItems = block.items.filter(item => item.source === 'agent');
                                const requirementCompleted = requirementItems.filter(item => item.status === 'completed').length;
                                const planItems = block.items.filter(item => item.source === 'plan');
                                const planCompleted = planItems.filter(item => item.status === 'completed').length;
                                return (
                                  <div key={block.key} className="todo-card">
                                    <div className="todo-card__header">
                                      <span className="todo-card__title">{block.title}</span>
                                      {totalCount > 0 && (
                                        <span className="todo-card__meta">{completedCount}/{totalCount}</span>
                                      )}
                                    </div>
                                    {totalCount > 0 ? (
                                      <div className="todo-card__sections">
                                        {requirementItems.length > 0 && (
                                          <div className="todo-card__section">
                                            <div className="todo-card__section-header">
                                              <span className="todo-card__section-title">需求拆解</span>
                                              <span className="todo-card__section-meta">{requirementCompleted}/{requirementItems.length}</span>
                                            </div>
                                            <ul className="todo-card__list">
                                              {requirementItems.map(item => (
                                                <li key={item.id} className={`todo-card__item todo-card__item--${item.status}`}>
                                                  <span className="todo-card__dot" />
                                                  <span className="todo-card__text">{item.content}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {planItems.length > 0 && (
                                          <div className="todo-card__section">
                                            <div className="todo-card__section-header">
                                              <span className="todo-card__section-title">执行计划</span>
                                              <span className="todo-card__section-meta">{planCompleted}/{planItems.length}</span>
                                            </div>
                                            <ul className="todo-card__list">
                                              {planItems.map(item => (
                                                <li key={item.id} className={`todo-card__item todo-card__item--${item.status}`}>
                                                  <span className="todo-card__dot" />
                                                  <span className="todo-card__text">{item.content}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="todo-card__empty">
                                        {block.isStreaming ? '正在拆解需求...' : '暂无任务'}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              if (block.type === 'decomposition') {
                                const key = `${message.id}-decomposition-expanded`;
                                const isExpanded = toolThinkingExpanded.get(key) ?? true;
                                return (
                                  <DecompositionBlock
                                    key={block.key}
                                    title={block.title}
                                    content={block.content}
                                    isStreaming={block.isStreaming}
                                    isExpanded={isExpanded}
                                    onToggle={() => setToolThinkingExpanded(prev => {
                                      const next = new Map(prev);
                                      next.set(key, !isExpanded);
                                      return next;
                                    })}
                                  />
                                );
                              }
                              if (block.type === 'text') {
                                const isStreamingThis = block.isStreaming ?? showThinkingIndicator;
                                return (
                                  <div key={block.key ?? `text-${blockIdx}`} className="message-content message-content--timeline" onContextMenu={handleAssistantTextSelection}>
                                    <AIResponseRenderer content={block.text} isStreaming={isStreamingThis} />
                                  </div>
                                );
                              }
                              return null;
                            })}
                            {!hasTextBlock && message.content && (
                              <div className="message-content message-content--timeline" onContextMenu={handleAssistantTextSelection}>
                                <AIResponseRenderer
                                  content={message.content}
                                  isStreaming={showThinkingIndicator}
                                />
                              </div>
                            )}
                            {showThinkingIndicator && (
                              <div className="act-log__item act-log__item--running act-log__item--thinking">
                                <span className="act-log__dot" />
                                <span className="act-log__title">Thinking</span>
                                <span className="act-log__detail">In progress...</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Deep thinking block (legacy-compatible). */}
                            {hasThinkingSteps && (
                              <ThinkingBlock
                                thinkingContent={message.thinkingSteps![0].content}
                                isDeepThinking={true}
                                isThinkingPhase={message.isThinking ?? false}
                                elapsedSeconds={message.elapsedSeconds}
                                isExpanded={toolThinkingExpanded.get(message.id + '-dt') ?? false}
                                onToggle={() => setToolThinkingExpanded(prev => {
                                  const next = new Map(prev);
                                  const key = message.id + '-dt';
                                  next.set(key, !prev.get(key));
                                  return next;
                                })}
                              />
                            )}

                            {/* Tool call log (legacy-compatible). */}
                            {message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
                              <div className="tool-call-log">
                                {message.toolCalls.map((tc, i) => (
                                  renderToolLogEntry(tc, tc.uiId ?? i)
                                ))}
                              </div>
                            )}

                            {/* Final answer */}
                            <div
                              className="message-content"
                              onContextMenu={message.role === 'assistant' ? handleAssistantTextSelection : undefined}
                            >
                              {message.role === 'assistant' ? (
                                <AIResponseRenderer
                                  content={message.content}
                                  isStreaming={isLoading && index === messages.length - 1}
                                />
                              ) : (
                                message.content
                              )}
                            </div>
                            {showThinkingIndicator && message.role === 'assistant' && !message.content && !hasThinkingSteps && (
                              <div className="act-log__item act-log__item--running act-log__item--thinking">
                                <span className="act-log__dot" />
                                <span className="act-log__title">Thinking</span>
                                <span className="act-log__detail">In progress...</span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="message-footer">
                          {/* Assistant message toolbar */}
                          {message.role === 'assistant' && (
                            <div className="message-toolbar">
                              <button 
                                className="toolbar-button"
                                title="重新生成"
                                onClick={() => {
                                  console.log('[AIChatPanel] 重新生成回答');
                                  // TODO: 实现重新生成功能
                                }}
                              >
                                <Icon name="regenerate" size={14} iconSet="ui" />
                              </button>
                              <button 
                                className="toolbar-button"
                                title="点赞"
                                onClick={() => {
                                  console.log('[AIChatPanel] 点赞');
                                  // TODO: 实现点赞功能
                                }}
                              >
                                <Icon name="thumb-up" size={14} iconSet="ui" />
                              </button>
                              <button 
                                className="toolbar-button"
                                title="点踩"
                                onClick={() => {
                                  console.log('[AIChatPanel] 点踩');
                                  // TODO: 实现点踩功能
                                }}
                              >
                                <Icon name="thumb-down" size={14} iconSet="ui" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
          })}

          {/* 加载中占位（仅非深度思考模式） */}
          {isLoading && !isDeepThinkingEnabled && (!messages.length || messages[messages.length - 1]?.role !== 'assistant') && (
            <div className="message assistant">
              <div className="message-bubble assistant">
                <div className="message-loading">
                  <div className="message-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 输入区域 */}
          <div className={`ai-chat-panel-input-container ${isMaximized ? 'centered' : ''}`}>
        <div className={`ai-chat-panel-input-container-inner ${isMaximized ? 'max-width' : ''}`}>
          {/* Top toolbar */}
          <div className="input-top-toolbar">
            <button
              ref={contextButtonRef}
              className={`context-button ${isContextMenuOpen ? 'active' : ''}`}
              onClick={toggleContextMenu}
              title="命令菜单"
            >
              <span className="slash-icon">/</span>
            </button>

            {/* Context menu */}
            {isContextMenuOpen && (
              <div ref={contextMenuRef} className="context-menu">
                {/* Search bar (sticky) */}
                <div className="context-menu-search">
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="context-menu-search-input"
                    placeholder="搜索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        handleContextMenuItemClick('search');
                      }
                    }}
                  />
                </div>

                {/* 滚动内容区域 */}
                <div className="context-menu-content">
                {subMenuType === 'none' ? (
                  <>
                    {/* Context groups */}
                    <div className="context-menu-group">
                      <div className="context-menu-group-title">上下文</div>
                      <div className="context-menu-item" onClick={() => handleContextMenuItemClick('files')}>
                        <span className="context-menu-item-text">文件与文件夹</span>
                      </div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('knowledge')}>
                        <span className="context-menu-item-text">知识库</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('form')}>
                        <span className="context-menu-item-text">表单</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>

                    {/* 模型分组 */}
                    <div className="context-menu-group">
                      <div className="context-menu-group-title">模型</div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => setSubMenuType('model')}>
                        <span className="context-menu-item-text">选择模型</span>
                        <span className="context-menu-item-current">{availableModels.find(m => m.modelId === selectedModel)?.displayName || formatModelDisplayName(selectedModel)}</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="context-menu-item context-menu-item-switch" onClick={() => setIsDeepThinkingEnabled(!isDeepThinkingEnabled)}>
                        <span className="context-menu-item-text">思考</span>
                        <div className={`context-menu-switch ${isDeepThinkingEnabled ? 'active' : ''}`}>
                          <div className="context-menu-switch-thumb" />
                        </div>
                      </div>
                    </div>

                    {/* Skills group */}
                    <div className="context-menu-group">
                      <div className="context-menu-group-title">技能</div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('skills')}>
                        <span className="context-menu-item-text">Skills</span>
                        {selectedSkills.length > 0 && <span className="context-menu-item-badge">{selectedSkills.length}</span>}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('memory')}>
                        <span className="context-menu-item-text">记忆</span>
                        <span className="context-menu-item-current">{agentMemoryStats.usagePercentage}%</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('decompositionRules')}>
                        <span className="context-menu-item-text">拆解规则</span>
                        {enabledDecompositionRules.length > 0 && <span className="context-menu-item-badge">{enabledDecompositionRules.length}</span>}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('writingRules')}>
                        <span className="context-menu-item-text">写作规则</span>
                        {enabledWritingRuleDocuments.length > 0 && <span className="context-menu-item-badge">{enabledWritingRuleDocuments.length}</span>}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('mcpServer')}>
                        <span className="context-menu-item-text">MCP Server</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>

                    <div className="context-menu-group">
                      <div className="context-menu-group-title">命令</div>
                      {SLASH_COMMAND_ITEMS
                        .filter(cmd => {
                          const keyword = searchQuery.trim().toLowerCase();
                          if (!keyword) return true;
                          return cmd.command.toLowerCase().includes(keyword)
                            || cmd.description.toLowerCase().includes(keyword);
                        })
                        .map(cmd => (
                          <div
                            key={cmd.command}
                            className="context-menu-item"
                            onClick={() => handleInsertSlashCommand(cmd.insertText)}
                          >
                            <span className="context-menu-item-text">{cmd.command}</span>
                          </div>
                        ))}
                    </div>
                  </>
                ) : subMenuType === 'model' ? (
                  <>
                    {/* 模型选择二级菜单 */}
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>

                    <div className="context-menu-model-list">
                      {(() => {
                        // Group models by config name.
                        const grouped = new Map<string, ModelInfo[]>();
                        availableModels.forEach(model => {
                          if (!grouped.has(model.configName)) {
                            grouped.set(model.configName, []);
                          }
                          grouped.get(model.configName)!.push(model);
                        });

                        return Array.from(grouped.entries()).map(([configName, models]) => (
                          <div key={configName} className="context-menu-group">
                            <div className="context-menu-group-title">{configName}</div>
                            {models.map(model => (
                              <div
                                key={model.modelId}
                                className={`context-menu-item ${selectedModel === model.modelId ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectedModel(model.modelId);
                                  electronStore.set('ai-chat-selected-model', model.modelId); // 持久化已选模型
                                  providerCacheRef.current = null; // Clear provider cache on model switch.
                                  // Check whether selected model supports deep thinking.
                                  const supportsThinking = model.capabilities?.thinking === true;
                                  if (supportsThinking) {
                                    setIsDeepThinkingEnabled(true);
                                  } else {
                                    setIsDeepThinkingEnabled(false);
                                  }
                                  setSubMenuType('none');
                                  setIsContextMenuOpen(false);
                                }}
                              >
                                <AIProviderIconFromModel modelString={model.modelId} size={16} />
                                <span className="context-menu-item-text">{model.displayName || formatModelDisplayName(model.modelId)}</span>
                                {model.capabilities?.thinking && <ThinkingIcon size={14} />}
                                {selectedModel === model.modelId && (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                                    <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </>
                ) : subMenuType === 'files' ? (
                  <>
                    {/* Files & folders submenu */}
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>
                    {isLoadingFiles ? (
                      <div className="context-menu-empty">
                        <span>加载中...</span>
                      </div>
                    ) : filesList.length === 0 ? (
                      <div className="context-menu-empty">
                        <span>暂无文件</span>
                      </div>
                    ) : (
                      <div className="context-menu-list">
                        {filesList.map(file => (
                          <div
                            key={file.path}
                            className="context-menu-item"
                            onClick={() => {
                              // 避免重复选择同一路径
                              setSelectedFiles(prev => {
                                const exists = prev.some(f => f.path === file.path);
                                if (exists) return prev;
                                return [...prev, { name: file.name, path: file.path, type: file.type }];
                              });
                              // 插入内联 @tag
                              tiptapRef.current?.insertFileReference(file.path, file.name);
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              tiptapRef.current?.focus();
                            }}
                          >
                            <Icon name={file.type === 'directory' ? 'folder' : 'file'} size={14} />
                            <span className="context-menu-item-text">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : subMenuType === 'knowledge' ? (
                  <>
                    {/* Knowledge base submenu */}
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>
                    {isLoadingKnowledgeBases ? (
                      <div className="context-menu-empty">
                        <span>加载中...</span>
                      </div>
                    ) : knowledgeBaseList.length === 0 ? (
                      <div className="context-menu-empty">
                        <span>暂无知识库</span>
                      </div>
                    ) : (
                      <div className="context-menu-list">
                        {knowledgeBaseList.map(kb => (
                          <div
                            key={kb.id}
                            className="context-menu-item"
                            onClick={() => {
                              // 将知识库存入选中列表
                              setSelectedKbs(prev => {
                                const exists = prev.some(k => k.id === kb.id);
                                if (exists) return prev;
                                return [...prev, { id: kb.id, title: kb.title }];
                              });
                              // 插入内联 @tag
                              tiptapRef.current?.insertFileReference(`kb:${kb.id}`, kb.title);
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              tiptapRef.current?.focus();
                            }}
                          >
                            <Icon name="book" size={14} />
                            <span className="context-menu-item-text">{kb.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : subMenuType === 'form' ? (
                  <>
                    {/* 表单二级菜单 */}
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>
                    {isLoadingForms ? (
                      <div className="context-menu-empty">
                        <span>加载中...</span>
                      </div>
                    ) : formsList.length === 0 ? (
                      <div className="context-menu-empty">
                        <span>暂无表单</span>
                      </div>
                    ) : (
                      <div className="context-menu-list">
                        {formsList.map(form => (
                          <div
                            key={form.id}
                            className="context-menu-item"
                            onClick={() => {
                              // 避免重复选择同一表单
                              setSelectedForms(prev => {
                                const exists = prev.some(f => f.id === form.id);
                                if (exists) return prev;
                                return [...prev, { id: form.id, name: form.name }];
                              });
                              // 插入内联 @tag
                              tiptapRef.current?.insertFileReference(`form:${form.id}`, form.name);
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              tiptapRef.current?.focus();
                            }}
                          >
                            <Icon name="table" size={14} />
                            <span className="context-menu-item-text">{form.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : subMenuType === 'skills' ? (
                  <>
                    {/* Skills 二级菜单 */}
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>
                    {/* 浏览市场选项 */}
                    <div className="context-menu-list">
                      <div
                        className="context-menu-item"
                        onClick={() => {
                          // Open skills marketplace.
                          setSubMenuType('none');
                          setIsContextMenuOpen(false);
                          window.dispatchEvent(new CustomEvent('open-skill-market'));
                        }}
                      >
                        <Icon name="store" size={14} />
                        <span className="context-menu-item-text">浏览市场</span>
                      </div>
                    </div>
                    {/* 技能包列表 */}
                    {isLoadingSkills ? (
                      <div className="context-menu-empty">
                        <span>加载中...</span>
                      </div>
                    ) : skillsList.length === 0 ? (
                      <div className="context-menu-empty">
                        <span>暂无技能包</span>
                      </div>
                    ) : (
                      <div className="context-menu-list">
                        {skillsList.map(skill => (
                          <div
                            key={skill.path}
                            className={`context-menu-item${selectedSkills.some(s => s.path === skill.path) ? ' selected' : ''}`}
                            onClick={() => {
                              // Toggle selected state for skill package.
                              const exists = selectedSkills.some(s => s.path === skill.path);
                              setSelectedSkills(prev => {
                                if (exists) return prev.filter(s => s.path !== skill.path);
                                return [...prev, { name: skill.name, path: skill.path }];
                              });
                              // Insert/remove @tag in input text.
                              if (!exists) {
                                tiptapRef.current?.insertFileReference(`skill:${skill.path}`, skill.name);
                              } else {
                                tiptapRef.current?.removeFileReference(`skill:${skill.path}`);
                              }
                            }}
                          >
                            <Icon name={skill.type === 'directory' ? 'folder' : 'file'} size={14} />
                            <span className="context-menu-item-text">{skill.name}</span>
                            {selectedSkills.some(s => s.path === skill.path) && (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : subMenuType === 'decompositionRules' ? (
                  <>
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>

                    <div className="context-menu-group">
                      <div className="context-menu-group-title">拆解规则</div>
                      <div className="context-menu-rule-editor">
                        <input
                          className="context-menu-rule-input"
                          placeholder="规则名称"
                          value={newDecompositionRuleName}
                          onChange={event => setNewDecompositionRuleName(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleAddDecompositionRule();
                            }
                          }}
                        />
                        <input
                          className="context-menu-rule-input"
                          placeholder="规则说明"
                          value={newDecompositionRuleInstruction}
                          onChange={event => setNewDecompositionRuleInstruction(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleAddDecompositionRule();
                            }
                          }}
                        />
                        <div className="context-menu-item" onClick={handleAddDecompositionRule}>
                          <Icon name="file-code" size={14} />
                          <span className="context-menu-item-text">添加规则</span>
                        </div>
                        <div className="context-menu-item" onClick={handleOpenDecompositionRulesTab}>
                          <Icon name="file" size={14} />
                          <span className="context-menu-item-text">在标签页中管理</span>
                        </div>
                        <div className="context-menu-item" onClick={handleResetBuiltinDecompositionRules}>
                          <Icon name="refresh" size={14} />
                          <span className="context-menu-item-text">恢复默认规则</span>
                        </div>
                      </div>
                    </div>

                    <div className="context-menu-group">
                      <div className="context-menu-group-title">拆解规则列表</div>
                      {decompositionRules.length === 0 ? (
                        <div className="context-menu-empty">
                          <span>暂无规则</span>
                        </div>
                      ) : (
                        <div className="context-menu-list">
                          {decompositionRules.map(rule => (
                            <div
                              key={rule.id}
                              className={`context-menu-item context-menu-rule-item${rule.enabled ? ' selected' : ''}`}
                              onClick={() => handleToggleDecompositionRule(rule.id)}
                            >
                              <span className="context-menu-item-text">{rule.name}</span>
                              <span className="context-menu-rule-instruction" title={rule.instruction}>{rule.instruction}</span>
                              <div className={`context-menu-switch ${rule.enabled ? 'active' : ''}`}>
                                <div className="context-menu-switch-thumb" />
                              </div>
                              {!rule.builtin && (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="context-menu-rule-delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDecompositionRule(rule.id);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleDeleteDecompositionRule(rule.id);
                                    }
                                  }}
                                >
                                  <Icon name="delete" size={12} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </>
                ) : subMenuType === 'writingRules' ? (
                  <>
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                      <div className="context-menu-header-actions">
                        <div
                          role="button"
                          tabIndex={0}
                          className="context-menu-header-action"
                          title="导入文档"
                          onClick={handleImportWritingRuleDocuments}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleImportWritingRuleDocuments();
                            }
                          }}
                        >
                          <Icon name="file-upload" size={14} />
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          className="context-menu-header-action"
                          title="清空文档"
                          onClick={handleClearWritingRuleDocuments}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleClearWritingRuleDocuments();
                            }
                          }}
                        >
                          <Icon name="delete" size={14} />
                        </div>
                      </div>
                    </div>

                    <div className="context-menu-group">
                      {writingRuleDocuments.length === 0 ? (
                        <div className="context-menu-empty">
                          <span>暂无规则</span>
                        </div>
                      ) : (
                        <div className="context-menu-list">
                          {writingRuleDocuments.map(document => (
                            <div
                              key={document.id}
                              className={`context-menu-item context-menu-rule-item${document.enabled ? ' selected' : ''}`}
                              onClick={() => handleToggleWritingRuleDocument(document.id)}
                            >
                              <span className="context-menu-item-text">{document.name}</span>
                              <span className="context-menu-rule-instruction" title={document.path}>{document.path}</span>
                              <div className={`context-menu-switch ${document.enabled ? 'active' : ''}`}>
                                <div className="context-menu-switch-thumb" />
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                className="context-menu-rule-edit"
                                title="编辑文档"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditWritingRuleDocument(document);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleEditWritingRuleDocument(document);
                                  }
                                }}
                              >
                                <Icon name="edit" size={12} />
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                className="context-menu-rule-delete"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteWritingRuleDocument(document.id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleDeleteWritingRuleDocument(document.id);
                                  }
                                }}
                              >
                                <Icon name="delete" size={12} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : subMenuType === 'memory' ? (
                  <>
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>

                    <div className="context-menu-group">
                      <div className="context-menu-group-title">记忆状态</div>
                      <div className="context-menu-item disabled">
                        <span className="context-menu-item-text">
                          使用率 {agentMemoryStats.usagePercentage}% · 共 {agentMemoryStats.totalEntries} 条
                        </span>
                      </div>
                      <div className="context-menu-item" onClick={handleClearAgentMemory}>
                        <Icon name="refresh" size={14} />
                        <span className="context-menu-item-text">清空记忆</span>
                      </div>
                    </div>
                  </>
                ) : subMenuType === 'mcpServer' ? (
                  <>
                    {/* MCP Server 二级菜单 */}
                    <div className="context-menu-header">
                      <div className="context-menu-back" onClick={() => setSubMenuType('none')}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>返回</span>
                      </div>
                    </div>
                    <div className="context-menu-empty">
                      <span>暂无 MCP Server</span>
                    </div>
                  </>
                ) : null}
                </div>
              </div>
            )}

            {/* Currently opened file */}
            {currentFileName && (
              <div className="current-file-indicator" title={currentFilePath || currentFileName}>
                <Icon name="file" size={14} />
                <span className="current-file-name">{currentFileName}</span>
              </div>
            )}
          </div>

          {pendingToolConfirmation && (
            <div className="tool-confirm-inline">
              <div className="tool-confirm-inline__content">
                <div className="tool-confirm-inline__title">
                  工具执行确认: {pendingToolConfirmation.toolName}
                </div>
                {pendingToolConfirmation.detail && (
                  <div className="tool-confirm-inline__detail">
                    {pendingToolConfirmation.detail}
                  </div>
                )}
              </div>
              <div className="tool-confirm-inline__actions">
                <div
                  role="button"
                  tabIndex={0}
                  className="tool-confirm-inline__btn tool-confirm-inline__btn--deny"
                  onClick={() => settlePendingToolConfirmation(false)}
                  onKeyDown={(event) => handleToolConfirmActionKeyDown(event, false)}
                >
                  拒绝
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  className="tool-confirm-inline__btn tool-confirm-inline__btn--allow"
                  onClick={() => settlePendingToolConfirmation(true)}
                  onKeyDown={(event) => handleToolConfirmActionKeyDown(event, true)}
                >
                  允许
                </div>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="input-area">
            <TipTapInput
              ref={tiptapRef}
              placeholder="输入消息，使用 @ 引用上下文..."
              onChange={(text) => setInput(text)}
              onSubmit={() => handleSend()}
              onAtTrigger={() => {
                setIsContextMenuOpen(true);
                setSubMenuType('none');
              }}
              onAtCancel={() => setIsContextMenuOpen(false)}
              isAtMenuOpen={isContextMenuOpen}
              className={isLoading ? 'disabled' : ''}
            />
          </div>

          {/* Bottom toolbar */}
          <div className="input-toolbar">
            <div className="toolbar-left" />
            
            <div className="input-actions">
              {isLoading && (
                <button
                  className="icon-button stop-button"
                  onClick={() => setIsLoading(false)}
                  title="停止生成"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="4" y="4" width="8" height="8" />
                  </svg>
                </button>
              )}
              <button
                className="icon-button send-button"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                title="发送"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.5l14 5.5-14 5.5V9l10-1.5L1 6V2.5z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        </div>
        </React.Fragment>
      ) : (
        /* 设置视图 */
        <AIChatSettings
          visible={true}
          onClose={() => setCurrentView('chat')}
          config={chatSettings}
          onConfigChange={setChatSettings}
        />
      )}

      {/* 历史记录菜单 */}
      <ChatHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectSession={loadHistorySession}
        buttonRef={historyButtonRef}
      />

      {/* Assistant 文本选择右键菜单 */}
      <AssistantTextContextMenu
        visible={textContextMenu !== null}
        x={textContextMenu?.x || 0}
        y={textContextMenu?.y || 0}
        selectedText={textContextMenu?.text || ''}
        onClose={() => setTextContextMenu(null)}
        onInsertToDocument={handleInsertToDocument}
        onCopy={handleCopyText}
        onAddToChat={handleAddToChat}
        onInsertToInlineEdit={handleInsertToInlineEdit}
      />
    </div>
  );
};
