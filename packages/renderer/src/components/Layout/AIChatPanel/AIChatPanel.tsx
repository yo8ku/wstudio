/**
 * AI 对话面板组件  - Note WStudio 2.0使用的是这个组件
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { tableReferenceService, type FormInfo } from '../../../services/tableReference';
import { knowledgeBaseService } from '../Sidebar/KnowledgeBase/knowledgeBaseService';
import { type KnowledgeItem } from '../Sidebar/KnowledgeBase/types';
import { getAIZoneSystemPromptAsync } from '../../../services/ai/SystemPrompt';
import { TipTapInput, type TipTapInputRef } from '../EditorArea/AIZoneWidget/TipTapInput';
import './AIChatPanel.scss';

interface ToolLog {
  uiId: string;
  name: string;
  label: string;
  summary?: string;
  status: 'pending' | 'success' | 'error';
}

/** 消息内容块：文本或工具调用 */
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ToolLog }
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
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;
const COLLAPSE_THRESHOLD = 250; // 小于此宽度时自动收缩
const EDITOR_AREA_MIN_WIDTH = 358; // editor-area 的最小宽度

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
  // 从模型ID中推断实际提供商（对于魔塔社区等聚合平台）
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
    'custom': '自定义'
  };
  return providerNames[providerId.toLowerCase()] || providerId;
};

/**
 * 工具调用思考块组件（类 Claude.ai 折叠式）
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

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ toolCalls, thinkingContent, isDeepThinking, isThinkingPhase, elapsedSeconds, isExpanded, onToggle }) => {
  const headerText = isDeepThinking
    ? (isThinkingPhase ? '深度思考中...' : `已深度思考 ${elapsedSeconds ?? 0} 秒`)
    : (isThinkingPhase ? '正在思考...' : `已思考 ${elapsedSeconds ?? 0} 秒`);

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

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ onClose, onMoveLeft, onMoveRight, position = 'right' }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [subMenuType, setSubMenuType] = useState<'none' | 'model' | 'knowledge' | 'form' | 'skills' | 'mcpServer' | 'files'>('none');
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat'); // 当前视图状态
  const [chatSettings, setChatSettings] = useState<AIChatSettingsConfig>(DEFAULT_CHAT_SETTINGS);
  const [toolThinkingExpanded, setToolThinkingExpanded] = useState<Map<string, boolean>>(new Map()); // 思考块展开状态（工具调用 + 深度思考）
  const [textContextMenu, setTextContextMenu] = useState<{ x: number; y: number; text: string } | null>(null); // 文本选择右键菜单
  // 模式切换状态：chat(普通对话)、agent(Agent模式，执行前询问确认)
  const [chatMode, setChatMode] = useState<'chat' | 'agent'>('chat');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false); // 模式菜单展开状态
  const [currentFileName, setCurrentFileName] = useState<string>(''); // 当前打开的文件名
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 消息容器的 ref
  const panelRef = useRef<HTMLDivElement>(null);
  const tiptapRef = useRef<TipTapInputRef>(null);
  const contextButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerContextMenuRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const modeSwitcherRef = useRef<HTMLDivElement>(null); // 模式切换器的 ref
  const isInitialLoadRef = useRef(true); // 追踪是否是初始加载
  const providerCacheRef = useRef<{ modelId: string; actualModelId: string } | null>(null); // 缓存已初始化的 provider
  
  // 滚动条淡入淡出效果
  const DEFAULT_OPACITY = 0.5; // 默认透明度
  const [scrollbarOpacity, setScrollbarOpacity] = useState(0); // 初始为0，完全透明
  const fadeTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 淡入：立即中断所有动画并显示滚动条
  const fadeIn = useCallback(() => {
    // 取消所有进行中的动画
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
      // 获取全局的 Monaco 编辑器实例
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
      console.log('[AIChatPanel] 已复制文本到剪贴板');
      // TODO: 显示通知提示用户复制成功
    } catch (error) {
      console.error('[AIChatPanel] 复制文本失败:', error);
    }
  }, []);

  // 处理添加到聊天
  const handleAddToChat = useCallback((text: string) => {
    // 将选中的文本添加到输入框中
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

    console.log('[AIChatPanel] 已添加文本到聊天输入框');
  }, []);

  // 处理插入到内联编辑
  const handleInsertToInlineEdit = useCallback((text: string) => {
    try {
      // 获取全局的打开内联聊天方法
      const openInlineChat = (window as unknown as { __openInlineChat?: (initialText?: string) => void }).__openInlineChat;
      
      if (!openInlineChat) {
        console.warn('[AIChatPanel] 没有找到打开内联聊天的方法');
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

  // 处理 assistant 消息的文本选择
  const handleAssistantTextSelection = useCallback((event: React.MouseEvent) => {
    // 只处理右键点击
    if (event.button !== 2) return;

    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === '') {
      return;
    }

    const selectedText = selection.toString();
    
    // 检查选中的文本是否在 assistant 消息中
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

  // 监听当前打开的文件变化
  useEffect(() => {
    // 初始化：从全局变量读取当前标签页标题
    const tabTitle = (window as any).__currentTabTitle;
    setCurrentFileName(tabTitle || '');

    // 监听标签页切换事件，从事件 detail 中获取文件名
    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCurrentFileName(detail?.title || '');
    };

    window.addEventListener('editor:active-tab-changed', handleTabChange);

    return () => {
      window.removeEventListener('editor:active-tab-changed', handleTabChange);
    };
  }, []);

  // 动态更新滚动条样式
  useEffect(() => {
    if (!messagesContainerRef.current) return;

    const styleId = 'ai-chat-panel-scrollbar-style';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // 获取 CSS 变量的颜色值并转换为 RGBA
    const getColorWithOpacity = (cssVar: string, fallbackColor: string, opacity: number) => {
      const computedStyle = getComputedStyle(document.documentElement);
      const color = computedStyle.getPropertyValue(cssVar).trim() || fallbackColor;
      
      // 如果颜色已经是 rgba 格式
      if (color.startsWith('rgba')) {
        return color.replace(/[\d.]+\)$/g, `${opacity})`);
      }
      
      // 如果是 rgb 格式，转换为 rgba
      if (color.startsWith('rgb')) {
        return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
      }
      
      // 如果是十六进制，转换为 rgba
      if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      
      return color;
    };

    // 使用主题配色，动态设置透明度
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
      console.log('[AIChatPanel] 从缓存加载模型列表...');
      
      const cachedModels = await getCachedModels();
      console.log('[AIChatPanel] 获取到模型列表，数量:', cachedModels.length);
      
      if (cachedModels.length === 0) {
        console.warn('[AIChatPanel] 模型列表为空！请检查：');
        console.warn('  1. 是否配置了AI模型？（需要设置API Key和API Endpoint）');
        console.warn('  2. 是否选择了具体的模型？');
      }
      
      // 转换为 ModelInfo 格式，并过滤掉禁用的模型
      const modelInfos: ModelInfo[] = cachedModels
        .filter(model => {
          // 从模型ID中提取实际的模型名称（格式：configName:modelName）
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
        // 尝试从持久化存储读取上次选择的模型
        const savedModel = await electronStore.get('ai-chat-selected-model') as string | undefined;
        if (savedModel && modelInfos.some(m => m.modelId === savedModel)) {
          setSelectedModel(savedModel);
          console.log('[AIChatPanel] 恢复上次选择的模型:', savedModel);
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

  // 加载历史会话（使用 useCallback 确保函数稳定）
  const loadHistorySession = React.useCallback(async (sessionId: string, closeMenu = true) => {
    try {
      console.log('[AIChatPanel] 开始加载历史会话:', sessionId);
      
      // 关闭历史记录菜单（如果需要）
      if (closeMenu) {
        setIsHistoryOpen(false);
      }
      
      // 获取历史消息
      const result = await window.electronAPI?.chatHistory?.getMessages(sessionId);
      if (result?.success && result.data) {
        console.log('[AIChatPanel] 从数据库加载的原始消息:', result.data);
        
        // 将数据库消息转换为组件消息格式
        const historyMessages: Message[] = result.data.map(msg => {
          const message: Message = {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            model: msg.model,
            reasoning: msg.reasoning
          };

          // 如果有推理内容，转换为思考步骤
          if (msg.reasoning && msg.role === 'assistant') {
            console.log('[AIChatPanel] 发现推理内容，长度:', msg.reasoning.length, '消息ID:', msg.id);
            
            // 估算思考耗时：基于推理内容长度估算（每1000字符约1秒）
            const estimatedDuration = Math.round(msg.reasoning.length / 10);
            
            message.thinkingSteps = [{
              id: `thinking-${msg.id}`,
              title: '深度思考',
              content: msg.reasoning,
              status: 'completed',
              timestamp: new Date(msg.timestamp),
              duration: estimatedDuration // 添加估算的耗时
            }];
            // console.log('[AIChatPanel] 已创建思考步骤，估算耗时:', estimatedDuration, 'ms');
          } else if (msg.role === 'assistant') {
          }

          return message;
        });
        
        console.log('[AIChatPanel] 转换后的消息列表:', historyMessages);
        
        // 加载历史会话时，设置为初始加载状态，以便直接显示最后的消息
        isInitialLoadRef.current = true;
        
        // 更新消息列表和当前会话ID
        setMessages(historyMessages);
        setCurrentSessionId(sessionId);
        console.log('[AIChatPanel] 成功加载历史会话:', sessionId, '消息数:', historyMessages.length);
        
        // 滚动到底部（使用 instant 行为，直接显示最后的消息）
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        }, 100);
      } else {
        console.warn('[AIChatPanel] 加载历史会话失败：未获取到数据');
      }
    } catch (error) {
      console.error('[AIChatPanel] 加载历史会话失败:', error);
    }
  }, []); // 空依赖数组，函数不依赖外部变量

  // 初始化：加载最后一条历史记录或生成新会话ID
  useEffect(() => {
    const initializeChat = async () => {
      try {
        // 尝试获取所有会话
        const result = await window.electronAPI?.chatHistory?.getSessions();
        if (result?.success && result.data && result.data.length > 0) {
          // 按更新时间排序，获取最新的会话
          const sessions = result.data.sort((a, b) => b.updatedAt - a.updatedAt);
          const latestSession = sessions[0];
          
          console.log('[AIChatPanel] 发现历史会话，自动加载最新会话:', latestSession.id);
          
          // 加载最新会话的消息（不需要关闭菜单，因为初始化时菜单本来就是关闭的）
          await loadHistorySession(latestSession.id, false);
        } else {
          // 没有历史记录，生成新的会话ID
          const sessionId = `session-${Date.now()}`;
          setCurrentSessionId(sessionId);
          console.log('[AIChatPanel] 无历史记录，生成新会话ID:', sessionId);
        }
      } catch (error) {
        console.error('[AIChatPanel] 初始化聊天失败:', error);
        // 出错时生成新的会话ID
        const sessionId = `session-${Date.now()}`;
        setCurrentSessionId(sessionId);
      }
    };

    initializeChat();
  }, []); // 空依赖数组，仅在组件挂载时执行一次

  useEffect(() => {
    // 首次加载：先从数据库加载模型启用状态，再加载模型列表
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
    
    // 监听模型启用状态变化事件
    const handleModelEnabledChanged = () => {
      console.log('[AIChatPanel] 模型启用状态已变化，重新加载模型列表...');
      loadModels();
    };
    
    window.addEventListener('models-cache-updated', handleModelsCacheUpdate);
    window.addEventListener('model-enabled-changed', handleModelEnabledChanged);
    
    return () => {
      window.removeEventListener('models-cache-updated', handleModelsCacheUpdate);
      window.removeEventListener('model-enabled-changed', handleModelEnabledChanged);
    };
  }, []);

  // 加载AI聊天设置
  useEffect(() => {
    const loadChatSettings = async () => {
      try {
        const savedSettings = await electronStore.get('ai-chat-settings');
        if (savedSettings) {
          // 兼容旧版本设置（没有 searchEngine 字段）
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
        console.log('[AIChatPanel] 聊天设置已保存');
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
    // 如果是初始加载，使用 instant 行为；否则使用 smooth 行为
    scrollToBottom(isInitialLoadRef.current);
    // 第一次滚动后，将标志设置为 false
    if (isInitialLoadRef.current && messages.length > 0) {
      isInitialLoadRef.current = false;
    }
  }, [messages]);

  // 点击外部关闭上下文菜单
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

  // 点击外部关闭模式菜单
  useEffect(() => {
    if (!isModeMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        modeSwitcherRef.current &&
        !modeSwitcherRef.current.contains(event.target as Node)
      ) {
        setIsModeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModeMenuOpen]);

  // 点击外部关闭 header 右键菜单
  useEffect(() => {
    if (!headerContextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // 检查点击是否在标题栏或菜单内
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

  // 工具调用思考块：进行中时自动展开，完成后自动折叠
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
    console.log('[AIChatPanel] 创建新对话（延迟创建）:', sessionId);
  };

  // 切换上下文菜单
  const toggleContextMenu = () => {
    const newState = !isContextMenuOpen;
    setIsContextMenuOpen(newState);
    
    // 当菜单打开时，自动聚焦搜索框
    if (newState) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      // 菜单关闭时清空搜索
      setSearchQuery('');
    }
  };

  // 处理上下文菜单项点击
  const handleContextMenuItemClick = (action: string) => {
    console.log(`[AIChatPanel] 上下文菜单点击: ${action}`);

    // 触发相应的全局事件或显示二级面板
    switch (action) {
      case 'snippets':
        // 打开底部面板并切换到常用片段标签页
        setIsContextMenuOpen(false);
        setSubMenuType('none');
        window.dispatchEvent(new CustomEvent('open-panel', {
          detail: { view: 'snippets' }
        }));
        break;
      case 'knowledge':
        // 显示知识库二级面板并加载知识库列表
        setSubMenuType('knowledge');
        setIsLoadingKnowledgeBases(true);
        knowledgeBaseService.loadFromStorage().then(data => {
          setKnowledgeBaseList(data.created);
          setIsLoadingKnowledgeBases(false);
        }).catch(err => {
          console.error('[AIChatPanel] 获取知识库列表失败:', err);
          setIsLoadingKnowledgeBases(false);
        });
        break;
      case 'files':
        // 显示文件&文件夹二级面板并加载文件列表
        setSubMenuType('files');
        setIsLoadingFiles(true);
        (async () => {
          try {
            // 获取当前工作区路径
            const workspaceResult = await (window as any).electron?.workspace?.getDir();
            if (workspaceResult?.success && workspaceResult.data) {
              const workspacePath = workspaceResult.data;
              // 读取工作区根目录的文件和文件夹
              const treeResult = await (window as any).electron?.folder?.readTree(workspacePath);
              if (treeResult?.success && treeResult.data && Array.isArray(treeResult.data)) {
                // 过滤掉 .wstudio 目录
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
        // 显示表单二级面板并加载表单列表
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
        // 显示技能二级面板并加载 .wstudio/skills 目录下的技能包
        setSubMenuType('skills');
        setIsLoadingSkills(true);
        (async () => {
          try {
            // 获取当前工作区路径
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
            console.error('[AIChatPanel] 获取技能包列表失败:', err);
            setSkillsList([]);
          } finally {
            setIsLoadingSkills(false);
          }
        })();
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

    // 检查是否选择了模型
    if (!selectedModel) {
      console.error('[AIChatPanel] 未选择模型');
      return;
    }

    // 检查是否是 /agent 命令
    const agentMatch = input.trim().match(/^\/agent\s+(.+)$/s);
    if (agentMatch) {
      const taskDesc = agentMatch[1].trim();
      console.log('[AIChatPanel] 检测到 /agent 命令，在聊天中执行 Agent 任务:', taskDesc);

      // 将用户的 Agent 任务作为用户消息添加
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: `/agent ${taskDesc}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      tiptapRef.current?.clear();
      setInput('');
      setIsLoading(true);

      // 创建助手消息用于显示 Agent 执行过程
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '🤖 **Agent 任务开始执行...**\n\n',
        timestamp: new Date(),
        model: selectedModel
      };
      setMessages(prev => [...prev, assistantMessage]);

      try {
        // 获取模型配置
        const modelConfig = await getModelConfig(selectedModel);
        if (!modelConfig) {
          throw new Error(`未找到模型配置：${selectedModel}`);
        }

        // 提取实际的模型 ID
        const actualModelId = selectedModel.includes(':') ? selectedModel.split(':')[1] : selectedModel;

        // 配置 AI 提供商
        await aiService.setProvider(modelConfig.providerId, {
          id: modelConfig.id || 'default',
          name: modelConfig.name || modelConfig.configName,
          apiKey: modelConfig.apiKey,
          apiEndpoint: modelConfig.apiEndpoint,
          temperature: 0.7,
          maxTokens: 4000,
          modelId: actualModelId
        });

        // 初始化 Agent 服务
        await agentService.initialize({
          execution: {
            modelId: actualModelId,
            temperature: 0.7,
            maxTokens: 4000,
            streaming: true
          }
        });

        // 创建任务
        const task = agentService.createTask('write', taskDesc, {});

        // 流式执行任务，更新聊天消息
        await agentService.executeTaskStream(task, {
          onStepStart: (step) => {
            console.log('[AIChatPanel Agent] 步骤开始:', step.description);
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + `\n📋 **步骤**: ${step.description}\n` }
                : msg
            ));
          },
          onStepComplete: (step, result) => {
            console.log('[AIChatPanel Agent] 步骤完成:', step.description);
            // 从步骤结果中提取输出
            if (result) {
              const stepOutput = (result as { thinking?: string; content?: string }).thinking
                || (result as { thinking?: string; content?: string }).content
                || '';
              if (stepOutput) {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + `\n${stepOutput}\n` }
                    : msg
                ));
              }
            }
          },
          onToolCall: (toolName, params) => {
            console.log('[AIChatPanel Agent] 工具调用:', toolName);
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + `\n🔧 **调用工具**: ${toolName}\n` }
                : msg
            ));
          },
          onToolResult: (toolName, result) => {
            console.log('[AIChatPanel Agent] 工具结果:', toolName);
          },
          onComplete: (result) => {
            console.log('[AIChatPanel Agent] 任务完成:', result.success);
            const finalContent = result.success
              ? `\n\n✅ **Agent 任务完成**${result.output ? `\n\n${result.output}` : ''}`
              : `\n\n❌ **Agent 任务失败**: ${result.error || '未知错误'}`;
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + finalContent }
                : msg
            ));
            setIsLoading(false);
          },
          onError: (err) => {
            console.error('[AIChatPanel Agent] 任务错误:', err);
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + `\n\n❌ **错误**: ${err.message}` }
                : msg
            ));
            setIsLoading(false);
          }
        });
      } catch (err) {
        console.error('[AIChatPanel Agent] 执行失败:', err);
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content + `\n\n❌ **执行失败**: ${err instanceof Error ? err.message : String(err)}` }
            : msg
        ));
        setIsLoading(false);
      }
      return;
    }

    // 普通对话模式：直接调用 AI，不走 Agent 流水线
    if (chatMode === 'chat') {
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

      try {
        // 只在模型切换时重新初始化 provider，避免每次发送都重复初始化
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

        // 构建上下文文本
        let contextText = '';
        if (selectedForms.length > 0) {
          for (const form of selectedForms) {
            const detail = await tableReferenceService.getFormDetail(form.id);
            if (detail && detail.columns.length > 0) {
              const colNames = detail.columns.map((c: { name: string }) => c.name).join('、');
              contextText += `\n\n【引用表单：${detail.name}】\n- 列：${colNames}\n- 共 ${detail.rows.length} 行数据`;
            }
          }
          setSelectedForms([]);
        }
        if (selectedKbs.length > 0) {
          contextText += `\n\n【引用知识库】\n${selectedKbs.map(k => `- ${k.title}`).join('\n')}`;
          setSelectedKbs([]);
        }
        // 有引用文件/文件夹时，展开文件夹并告知 AI
        const hasFiles = selectedFiles.length > 0;
        const pendingFiles = [...selectedFiles];
        if (hasFiles) {
          // 递归展开文件夹，收集所有子文件路径
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
              // 文件夹本身也告知 AI，方便 list_directory 探索
              expandedFiles.unshift({ name: f.name + '（文件夹）', path: f.path });
            } else {
              expandedFiles.push({ name: f.name, path: f.path });
            }
          }
          contextText += `\n\n【引用文件】以下文件已准备好，请使用 read_file 工具读取内容，使用 list_directory 工具列出文件夹内容：\n${expandedFiles.map(f => `- ${f.name}：${f.path}`).join('\n')}`;
          setSelectedFiles([]);
        }

        // 构建消息列表
        const chatMessages: ChatMessage[] = [];

        // 有上下文时加 system prompt
        if (contextText.length > 0) {
          const systemPrompt = await getAIZoneSystemPromptAsync(false);
          if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
        }

        // 历史对话（当前 messages 快照，不含刚加入的新消息）
        for (const m of messages) {
          if (m.role === 'user' || m.role === 'assistant') {
            chatMessages.push({ role: m.role, content: m.content });
          }
        }

        // 当前用户消息（含上下文）
        chatMessages.push({ role: 'user', content: taskDesc + contextText });

        // read_file 工具定义（仅在有引用文件时注入）
        const chatTools = hasFiles ? [
          {
            type: 'function' as const,
            function: {
              name: 'read_file',
              description: '读取本地文件内容。',
              parameters: {
                type: 'object',
                properties: { path: { type: 'string', description: '文件的绝对路径' } },
                required: ['path']
              }
            }
          },
          {
            type: 'function' as const,
            function: {
              name: 'list_directory',
              description: '列出文件夹下的文件和子文件夹。',
              parameters: {
                type: 'object',
                properties: { path: { type: 'string', description: '文件夹的绝对路径' } },
                required: ['path']
              }
            }
          }
        ] : undefined;

        // tool call 循环：AI 可能多次调用工具，每次执行后继续对话
        const runChatWithTools = async (): Promise<void> => {
          let pendingToolCalls: { id: string; name: string; argsRaw: string; uiId: string }[] = [];
          let currentContent = '';

          await aiService.generateTextStream(
            { model: actualModelId, messages: chatMessages, temperature: 0.7, maxTokens: 4000, tools: chatTools },
            {
              onContent: (chunk) => {
                currentContent += chunk;
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== assistantMessageId) return msg;
                  // 追加到 contentBlocks 的最后一个文本块，或创建新文本块
                  const blocks = msg.contentBlocks ?? [];
                  const lastBlock = blocks[blocks.length - 1];
                  if (lastBlock?.type === 'text') {
                    const updated = [...blocks];
                    updated[updated.length - 1] = { type: 'text', text: lastBlock.text + chunk };
                    return { ...msg, content: msg.content + chunk, contentBlocks: updated };
                  } else {
                    return { ...msg, content: msg.content + chunk, contentBlocks: [...blocks, { type: 'text', text: chunk }] };
                  }
                }));
              },
              onReasoning: (reasoning) => {
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== assistantMessageId) return msg;
                  // 追加到 contentBlocks 的 thinking 块
                  const blocks = msg.contentBlocks ?? [];
                  const thinkingIdx = blocks.findIndex(b => b.type === 'thinking');
                  if (thinkingIdx >= 0) {
                    const updated = [...blocks];
                    const tb = updated[thinkingIdx] as { type: 'thinking'; content: string; isThinking: boolean };
                    updated[thinkingIdx] = { ...tb, content: tb.content + reasoning };
                    return { ...msg, contentBlocks: updated, isThinking: true, thinkingStartTime: msg.thinkingStartTime ?? Date.now() };
                  } else {
                    // 在开头插入 thinking 块
                    return {
                      ...msg,
                      contentBlocks: [{ type: 'thinking', content: reasoning, isThinking: true }, ...blocks],
                      isThinking: true,
                      thinkingStartTime: msg.thinkingStartTime ?? Date.now()
                    };
                  }
                }));
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

                const tc = pendingToolCalls[idx];
                if (tc.name && isNew) {
                  // 插入工具调用块到 contentBlocks
                  const toolLog: ToolLog = { uiId: tc.uiId, name: tc.name, label: tc.name, status: 'pending' };
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          isThinkingPhase: true,
                          thinkingStartTime: msg.thinkingStartTime ?? Date.now(),
                          toolCalls: [...(msg.toolCalls ?? []), toolLog],
                          contentBlocks: [...(msg.contentBlocks ?? []), { type: 'tool', tool: toolLog }]
                        }
                      : msg
                  ));
                }
              },
              onComplete: async () => {
                // 推理完成：把 thinking 块状态改为 completed，记录耗时
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== assistantMessageId) return msg;
                  const elapsed = msg.thinkingStartTime ? Math.max(1, Math.round((Date.now() - msg.thinkingStartTime) / 1000)) : 1;
                  // 更新 contentBlocks 中的 thinking 块
                  const updatedBlocks = msg.contentBlocks?.map(b =>
                    b.type === 'thinking' ? { ...b, isThinking: false, elapsedSeconds: elapsed } : b
                  );
                  return {
                    ...msg,
                    isThinking: false,
                    elapsedSeconds: elapsed,
                    contentBlocks: updatedBlocks,
                  };
                }));

                const validToolCalls = pendingToolCalls.filter(tc => tc != null);
                if (validToolCalls.length === 0) {
                  setIsLoading(false);
                  return;
                }

                // 把 assistant 的 tool_calls 追加到消息历史
                const toolCallsForMsg = validToolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.name, arguments: tc.argsRaw }
                }));
                chatMessages.push({ role: 'assistant', content: currentContent, tool_calls: toolCallsForMsg });

                // 执行每个 tool call，通过 uiId 更新已有条目（不重复添加）
                const updateToolInMessage = (uiId: string, updates: Partial<ToolLog>) => {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id !== assistantMessageId) return msg;
                    const updatedToolCalls = msg.toolCalls?.map(t => t.uiId === uiId ? { ...t, ...updates } : t);
                    const updatedBlocks = msg.contentBlocks?.map(b =>
                      b.type === 'tool' && b.tool.uiId === uiId
                        ? { ...b, tool: { ...b.tool, ...updates } }
                        : b
                    );
                    return { ...msg, toolCalls: updatedToolCalls, contentBlocks: updatedBlocks };
                  }));
                };

                for (const tc of validToolCalls) {
                  let toolResult = '';
                  try {
                    if (tc.name === 'read_file') {
                      const args = JSON.parse(tc.argsRaw) as { path: string };
                      const label = `Read "${args.path}"`;
                      updateToolInMessage(tc.uiId, { label });
                      const content: string = await (window as any).electron?.ipcRenderer.invoke('read-file', args.path);
                      toolResult = content ?? '';
                      const lineCount = toolResult ? toolResult.split('\n').length : 0;
                      const summary = lineCount > 0 ? `${lineCount} lines of output` : '(empty)';
                      updateToolInMessage(tc.uiId, { status: 'success', summary });
                      if (!toolResult) toolResult = '（文件内容为空）';
                    } else if (tc.name === 'list_directory') {
                      const args = JSON.parse(tc.argsRaw) as { path: string };
                      const label = `List "${args.path}"`;
                      updateToolInMessage(tc.uiId, { label });
                      const treeResult = await (window as any).electron?.folder?.readTree(args.path);
                      if (treeResult?.success && Array.isArray(treeResult.data)) {
                        const items = treeResult.data;
                        toolResult = items.map((item: any) =>
                          `${item.type === 'directory' ? '[DIR]' : '[FILE]'} ${item.path}`
                        ).join('\n');
                        const summary = `${items.length} items`;
                        updateToolInMessage(tc.uiId, { status: 'success', summary });
                      } else {
                        toolResult = '（无法列出目录内容）';
                        updateToolInMessage(tc.uiId, { status: 'error' });
                      }
                    } else {
                      toolResult = `未知工具：${tc.name}`;
                    }
                  } catch (e) {
                    toolResult = `读取失败：${e instanceof Error ? e.message : String(e)}`;
                    updateToolInMessage(tc.uiId, { status: 'error', summary: 'failed' });
                  }
                  chatMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
                }

                // 工具全部执行完毕，重置状态，继续下一轮对话
                pendingToolCalls = [];
                currentContent = '';

                await runChatWithTools();
              },
              onError: (error) => {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + `\n\n❌ 请求失败: ${error.message}` }
                    : msg
                ));
                setIsLoading(false);
              }
            }
          );
        };

        await runChatWithTools();
      } catch (err) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: `❌ 请求失败: ${err instanceof Error ? err.message : String(err)}` }
            : msg
        ));
        setIsLoading(false);
      }
      return;
    }

    // Agent 模式：执行写入操作前需用户确认
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
        const workspacePath = workspaceResult?.success ? workspaceResult.data : '';
        agentService.registerDefaultTools({ workspacePath });

        // agent 模式：允许文件写入，禁止命令执行（执行前需确认）
        const constraints = { allowFileWrite: true, allowCommandExecution: false };

        // 将选中的上下文（表单、知识库、文件、技能）注入任务描述
        let contextDesc = '';

        // 表单：只注入元数据（列名、行数），数据通过 query_form 工具按需查询
        if (selectedForms.length > 0) {
          for (const form of selectedForms) {
            const detail = await tableReferenceService.getFormDetail(form.id);
            if (detail && detail.columns.length > 0) {
              const colNames = detail.columns.map(c => c.name).join('、');
              contextDesc += `\n\n【引用表单：${detail.name}】\n- 表单ID: ${detail.id}\n- 列：${colNames}\n- 共 ${detail.rows.length} 行数据\n- 如需查询具体数据，请使用 query_form 工具，传入 formId="${detail.id}"`;
            } else {
              contextDesc += `\n\n【引用表单】${form.name} (id: ${form.id})`;
            }
          }
          setSelectedForms([]);
        }
        if (selectedKbs.length > 0) {
          contextDesc += `\n\n【引用知识库】\n${selectedKbs.map(k => `- ${k.title} (id: ${k.id})`).join('\n')}`;
          setSelectedKbs([]);
        }
        if (selectedFiles.length > 0) {
          contextDesc += `\n\n【引用文件】\n${selectedFiles.map(f => `- ${f.name} (${f.path})`).join('\n')}`;
          setSelectedFiles([]);
        }
        if (selectedSkills.length > 0) {
          contextDesc += `\n\n【技能指令】请只执行以下指定的技能包：\n${selectedSkills.map(s => `- ${s.name} (${s.path})`).join('\n')}`;
          setSelectedSkills([]);
        }

        const taskType: AgentTaskType = 'write';
        const task = agentService.createTask(taskType, taskDesc + contextDesc, { workspacePath }, constraints);

        // agent 模式始终需要用户确认
        const needsConfirm = true;

        await agentService.executeTaskStream(task, {
          onStepStart: (_step) => {
            // 步骤开始：不写入 content，由 ThinkingBlock 展示
          },
          onContent: (() => {
            let buffer = '';
            let timer: ReturnType<typeof setTimeout> | null = null;
            return (content: string) => {
              buffer += content;
              if (!timer) {
                timer = setTimeout(() => {
                  const flushed = buffer;
                  buffer = '';
                  timer = null;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + flushed }
                      : msg
                  ));
                }, 50);
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
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    isThinkingPhase: true,
                    thinkingStartTime: msg.thinkingStartTime ?? Date.now(),
                    toolCalls: [...(msg.toolCalls ?? []), { uiId, name: toolName, label, status: 'pending' as const }]
                  }
                : msg
            ));
          },
          onToolResult: (toolName, result) => {
            // 从真实结果中提取摘要
            let summary = result.success ? 'done' : 'failed';
            if (result.success && result.data) {
              const d = result.data as Record<string, unknown>;
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
              }
            }
            // 把最后一个同名 pending 工具调用标记为 success + 填入 summary
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMessageId) return msg;
              let marked = false;
              const updated = (msg.toolCalls ?? []).map(tc => {
                if (!marked && tc.name === toolName && tc.status === 'pending') {
                  marked = true;
                  return { ...tc, status: (result.success ? 'success' : 'error') as 'success' | 'error', summary };
                }
                return tc;
              });
              return { ...msg, toolCalls: updated };
            }));
          },
          onConfirmRequired: needsConfirm
            ? (toolName, _params) => new Promise<boolean>(resolve => {
                // TODO: 接入真实的 UI 确认弹窗，目前自动允许
                resolve(true);
              })
            : undefined,
          onComplete: (result) => {
            const finalContent = result.success
              ? (result.output ? result.output : '')
              : `❌ **执行失败**: ${result.error || '未知错误'}`;
            setMessages(prev => prev.map(msg => {
              if (msg.id !== assistantMessageId) return msg;
              const elapsed = msg.thinkingStartTime ? Math.max(1, Math.round((Date.now() - msg.thinkingStartTime) / 1000)) : 1;
              return {
                ...msg,
                isThinkingPhase: false,
                elapsedSeconds: elapsed,
                content: finalContent.trim(),
                toolCalls: msg.toolCalls?.map(tc =>
                  tc.status === 'pending' ? { ...tc, status: 'success' as const } : tc
                ),
              };
            }));
            setIsLoading(false);
          },
          onError: (err) => {
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + `\n\n❌ **错误**: ${err.message}` }
                : msg
            ));
            setIsLoading(false);
          }
        });
      } catch (err) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content + `\n\n❌ **执行失败**: ${err instanceof Error ? err.message : String(err)}` }
            : msg
        ));
        setIsLoading(false);
      }
      return;
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return; // 最大化时不允许调整大小
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;
      
      const rect = panelRef.current.getBoundingClientRect();
      
      // 查询 editor-area 元素获取实际宽度
      const editorArea = document.querySelector('.editor-area') as HTMLElement;
      
      // 根据位置计算期望的新宽度
      let newWidth = position === 'right' 
        ? rect.right - e.clientX  // 右侧：从右边界向左拖动增加宽度
        : e.clientX - rect.left;  // 左侧：从左边界向右拖动增加宽度
      
      // 如果能找到 editor-area，检查其当前宽度
      if (editorArea) {
        const editorAreaRect = editorArea.getBoundingClientRect();
        const currentEditorAreaWidth = editorAreaRect.width;
        
        // 如果 editor-area 已经达到或低于最小宽度
        if (currentEditorAreaWidth <= EDITOR_AREA_MIN_WIDTH) {
          // 只允许减小 AI panel 的宽度（即增加 editor-area 的宽度）
          const currentWidth = rect.width;
          if (newWidth > currentWidth) {
            // 阻止 AI panel 继续增大
            return;
          }
        }
      }
      
      // 限制在最小和最大宽度之间
      newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
      
      // 如果宽度小于收缩阈值，自动关闭面板
      if (newWidth < COLLAPSE_THRESHOLD) {
        onClose();
        setIsResizing(false);
        return;
      }
      
      // 设置新宽度
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
      className={`ai-chat-panel ${isMaximized ? 'maximized' : ''}`} 
      style={!isMaximized ? { 
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`
      } : {}}
    >
      
       <div className='ai-chat-panel-border'></div>
      {/* 拖拽手柄 */}
      {!isMaximized && (
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

      {/* 面板标题栏*/}
      <div 
        ref={headerRef}
        className="ai-chat-panel-header"
        onContextMenu={handleHeaderRightClick}
      >
        <div className="ai-chat-panel-header-left">
          <span>{currentView === 'chat' ? '聊天' : '设置'}</span>
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
                ref={historyButtonRef}
                className={isHistoryOpen ? 'active' : ''}
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                title="历史记录"
              >
                <Icon name="history" size={16} />
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
                title={isMaximized ? '还原' : '最大化'}
              >
                {isMaximized ? (
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
                onClick={onClose}
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

      {/* 主内容区域 - 条件渲染聊天视图或设置视图 */}
      {currentView === 'chat' ? (
        <>
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
                // 调试：输出每条消息的 thinkingSteps 状态
                // if (message.role === 'assistant') {
                //   console.log('[AIChatPanel Render] 助手消息ID:', message.id, 
                //     'thinkingSteps:', message.thinkingSteps, 
                //     'thinkingSteps长度:', message.thinkingSteps?.length,
                //     'content:', message.content?.substring(0, 50));
                // }
                
                // 当前消息是否有思考步骤
                const hasThinkingSteps = message.role === 'assistant' && message.thinkingSteps && message.thinkingSteps.length > 0;
                
                return (
                  <React.Fragment key={message.id}>

                    {/* 渲染用户消息或助手消息 */}
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
                        
                        {/* 交错渲染内容块：文本、工具调用、深度思考 */}
                        {message.role === 'assistant' && message.contentBlocks && message.contentBlocks.length > 0 ? (
                          <div className="message-content-blocks">
                            {message.contentBlocks.map((block, blockIdx) => {
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
                                return (
                                  <div key={block.tool.uiId} className={`tool-call-log__item tool-call-log__item--${block.tool.status}`}>
                                    <span className="tool-call-log__dot" />
                                    <span className="tool-call-log__label">{block.tool.label}</span>
                                    {block.tool.summary && <span className="tool-call-log__summary">{block.tool.summary}</span>}
                                  </div>
                                );
                              }
                              if (block.type === 'text') {
                                const isLastBlock = blockIdx === message.contentBlocks!.length - 1;
                                const isStreamingThis = isLoading && index === messages.length - 1 && isLastBlock;
                                return (
                                  <div key={`text-${blockIdx}`} className="message-content" onContextMenu={handleAssistantTextSelection}>
                                    <AIResponseRenderer content={block.text} isStreaming={isStreamingThis} />
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        ) : (
                          <>
                            {/* 深度思考块（兼容旧消息） */}
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

                            {/* 工具调用日志（兼容旧消息） */}
                            {message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
                              <div className="tool-call-log">
                                {message.toolCalls.map((tc, i) => (
                                  <div key={tc.uiId ?? i} className={`tool-call-log__item tool-call-log__item--${tc.status}`}>
                                    <span className="tool-call-log__dot" />
                                    <span className="tool-call-log__label">{tc.label}</span>
                                    {tc.summary && <span className="tool-call-log__summary">{tc.summary}</span>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 最终答案 */}
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
                          </>
                        )}
                        <div className="message-footer">
                          <div className="message-time">
                            {message.timestamp.toLocaleTimeString()}
                          </div>
                          {/* 助手消息工具栏 */}
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

          {/* 只在非思考模式下显示加载动画 */}
          {isLoading && !isDeepThinkingEnabled && (
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
          {/* 上方工具栏 */}
          <div className="input-top-toolbar">
            <button
              ref={contextButtonRef}
              className={`context-button ${isContextMenuOpen ? 'active' : ''}`}
              onClick={toggleContextMenu}
              title="命令菜单"
            >
              <span className="slash-icon">/</span>
            </button>

            {/* 上下文菜单 */}
            {isContextMenuOpen && (
              <div ref={contextMenuRef} className="context-menu">
                {/* 搜索框 - 吸顶 */}
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
                    {/* 上下文分组 */}
                    <div className="context-menu-group">
                      <div className="context-menu-group-title">上下文</div>
                      <div className="context-menu-item" onClick={() => handleContextMenuItemClick('files')}>
                        <span className="context-menu-item-text">文件&文件夹</span>
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
                      <div className="context-menu-item" onClick={() => handleContextMenuItemClick('clear')}>
                        <span className="context-menu-item-text">清除对话</span>
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

                    {/* 技能分组 */}
                    <div className="context-menu-group">
                      <div className="context-menu-group-title">技能</div>
                      <div className="context-menu-item context-menu-item-arrow" onClick={() => handleContextMenuItemClick('skills')}>
                        <span className="context-menu-item-text">Skills</span>
                        {selectedSkills.length > 0 && <span className="context-menu-item-badge">{selectedSkills.length}</span>}
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
                        // 按配置名称分组模型
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
                                  electronStore.set('ai-chat-selected-model', model.modelId); // 持久化选择
                                  providerCacheRef.current = null; // 模型切换，清除 provider 缓存
                                  // 检查选中的模型是否支持深度思考
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
                    {/* 文件&文件夹二级菜单 */}
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
                              // 将文件存入选中列表
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
                    {/* 知识库二级菜单 */}
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
                              // 将表单存入选中列表
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
                          // 打开技能市场
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
                              // 切换技能包选中状态
                              const exists = selectedSkills.some(s => s.path === skill.path);
                              setSelectedSkills(prev => {
                                if (exists) return prev.filter(s => s.path !== skill.path);
                                return [...prev, { name: skill.name, path: skill.path }];
                              });
                              // 插入或移除内联 @tag
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

            {/* 当前打开的文件 */}
            {currentFileName && (
              <div className="current-file-indicator" title={currentFileName}>
                <Icon name="file" size={14} />
                <span className="current-file-name">{currentFileName}</span>
              </div>
            )}
          </div>

          {/* 输入框区域 */}
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

          {/* 底部工具栏 */}
          <div className="input-toolbar">
            <div className="toolbar-left">
              {/* 模式切换 */}
              <div className="mode-switcher" ref={modeSwitcherRef}>
                <button
                  className="mode-current"
                  onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                  title={
                    chatMode === 'chat' ? '普通对话模式，直接与AI进行对话交流' :
                    'Agent模式，执行操作前会询问确认'
                  }
                >
                  {chatMode === 'agent' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19h8"/>
                      <path d="m4 17 6-6-6-6"/>
                    </svg>
                  )}
                  {chatMode === 'chat' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
                    </svg>
                  )}
                  <span>
                    {chatMode === 'chat' ? 'Chat' : 'Agent'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {isModeMenuOpen && (
                  <div className="mode-menu">
                    <div
                      className={`mode-menu-item ${chatMode === 'chat' ? 'active' : ''}`}
                      onClick={() => { setChatMode('chat'); setIsModeMenuOpen(false); }}
                      title="普通对话模式，直接与AI进行对话交流"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
                      </svg>
                      <span>Chat</span>
                      {chatMode === 'chat' && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                          <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div
                      className={`mode-menu-item ${chatMode === 'agent' ? 'active' : ''}`}
                      onClick={() => { setChatMode('agent'); setIsModeMenuOpen(false); }}
                      title="Agent模式，执行操作前会询问确认"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19h8"/>
                        <path d="m4 17 6-6-6-6"/>
                      </svg>
                      <span>Agent</span>
                      {chatMode === 'agent' && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                          <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
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
        </>
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
        panelPosition={position}
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
