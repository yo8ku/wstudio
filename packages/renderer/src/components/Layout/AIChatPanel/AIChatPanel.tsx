/**
 * AI 对话面板组件  - Note WStudio 2.0使用的是这个组件
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getCachedModels, getModelConfig, type CachedModelInfo } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled, loadModelEnabledStatesFromDB } from '../../../services/ai';
import { DropdownMenu, type DropdownMenuItem, type DropdownMenuGroup } from '../../common/DropdownMenu';
import { AIProviderIconFromModel } from '../../Icons/AIProviderIcon';
import { Icon } from '../../Icons/Icon';
import { EditIcon } from '../../Icons/EditIcon';
import { createPortal } from 'react-dom';
import { ChatHistory } from './ChatHistory';
import { AIChatSettings, DEFAULT_CHAT_SETTINGS, type AIChatSettingsConfig, SEARCH_ENGINES } from '../../AIChatSettings';
import { electronStore } from '../../../services/ElectronStoreService';
import { ModelThinking, type ThinkingStep } from '../../ModeThinking';
import { ModelCapabilityDetector } from '../../../services/modelCapabilityDetector';
import { ModelCapability } from '../../../types/modelCapabilities';
import { AssistantTextContextMenu, type AssistantTextContextMenuProps } from './AssistantTextContextMenu';
import { AIResponseRenderer } from '../../AIResponseRenderer';
import { agentService } from '../../../services/agent/AgentService';
import { AgentState } from '../../../services/agent/types';
import { tableReferenceService, type FormInfo } from '../../../services/tableReference';
import { knowledgeBaseService } from '../Sidebar/KnowledgeBase/knowledgeBaseService';
import { type KnowledgeItem } from '../Sidebar/KnowledgeBase/types';
import './AIChatPanel.scss';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string; // 用于记录助手回复使用的模型
  thinkingSteps?: ThinkingStep[]; // 深度思考步骤
  isThinking?: boolean; // 是否正在思考
  reasoning?: string; // 原始推理内容（用于持久化）
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
  const [thinkingExpanded, setThinkingExpanded] = useState<Map<string, boolean>>(new Map()); // 深度思考组件的展开状态
  const [activeThinkingSteps, setActiveThinkingSteps] = useState<ThinkingStep[] | null>(null); // 当前正在进行的思考步骤（独立显示）
  const [isActiveThinkingExpanded, setIsActiveThinkingExpanded] = useState(false); // 临时思考步骤的展开状态
  const [textContextMenu, setTextContextMenu] = useState<{ x: number; y: number; text: string } | null>(null); // 文本选择右键菜单
  // 模式切换状态：chat(普通对话)、plan(计划模式)、auto-edit(自动编辑)、ask-before-edit(编辑前询问)
  const [chatMode, setChatMode] = useState<'chat' | 'plan' | 'auto-edit' | 'ask-before-edit'>('chat');
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 消息容器的 ref
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contextButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerContextMenuRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const modeSwitcherRef = useRef<HTMLDivElement>(null); // 模式切换器的 ref
  const isInitialLoadRef = useRef(true); // 追踪是否是初始加载
  
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
    if (textareaRef.current) {
      textareaRef.current.focus();
      // 将光标移到末尾
      setTimeout(() => {
        if (textareaRef.current) {
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }, 0);
    }

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
    const updateCurrentFile = () => {
      const tabTitle = (window as any).__currentTabTitle;
      setCurrentFileName(tabTitle || '');
    };

    // 初始化
    updateCurrentFile();

    // 监听标签页变化事件
    const handleTabChange = () => {
      updateCurrentFile();
    };

    window.addEventListener('tab-changed', handleTabChange);
    window.addEventListener('file-opened', handleTabChange);

    return () => {
      window.removeEventListener('tab-changed', handleTabChange);
      window.removeEventListener('file-opened', handleTabChange);
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
        setSelectedModel(modelInfos[0].modelId); // 默认选择第一个模型
        console.log('[AIChatPanel] 默认选择模型:', modelInfos[0].modelId);
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

  // 自动调整输入框高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // 重置高度以便正确计算
      textarea.style.height = 'auto';
      // 设置新高度（不超过最大高度200px）
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

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
                // 分离文件夹和文件，文件夹在前
                const folders = treeResult.data.filter((item: any) => item.type === 'directory');
                const files = treeResult.data.filter((item: any) => item.type !== 'directory');
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

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 如果是第一条消息，先创建会话
    if (messages.length === 0) {
      try {
        const now = Date.now();
        await window.electronAPI?.chatHistory?.createSession({
          id: currentSessionId,
          title: '新对话',
          createdAt: now,
          updatedAt: now
        });
        console.log('[AIChatPanel] 创建新会话（首条消息）:', currentSessionId);
      } catch (error) {
        console.error('[AIChatPanel] 创建会话失败:', error);
      }
    }

    // 保存用户消息到数据库
    try {
      await window.electronAPI?.chatHistory?.addMessage({
        id: userMessage.id,
        sessionId: currentSessionId,
        role: 'user',
        content: userMessage.content,
        timestamp: userMessage.timestamp.getTime()
      });
    } catch (error) {
      console.error('[AIChatPanel] 保存用户消息失败:', error);
    }

    try {
      // 获取选择的模型配置
      const modelConfig = await getModelConfig(selectedModel);
      if (!modelConfig) {
        throw new Error(`未找到模型配置：${selectedModel}`);
      }

      console.log('[AIChatPanel] 发送消息到模型:', selectedModel);
      console.log('[AIChatPanel] 使用配置:', modelConfig.name);

      // 提取实际的模型ID（去掉提供商前缀）
      const [providerId, actualModelId] = selectedModel.split(':');
      
      console.log('[AIChatPanel] 提供商:', providerId, '模型:', actualModelId);

      // 🎯 如果启用了深度思考，立即显示深度思考组件（先假设支持）
      // 这样用户可以立即看到反馈，而不是等待能力检测完成
      let shouldShowThinking = isDeepThinkingEnabled;
      
      if (isDeepThinkingEnabled) {
        // 立即初始化思考步骤显示
        const initialThinkingStep: ThinkingStep = {
          id: Date.now().toString(),
          title: '',
          content: '',
          status: 'thinking',
          timestamp: new Date()
        };
        setActiveThinkingSteps([initialThinkingStep]);
        setIsActiveThinkingExpanded(false); // 初始化时默认折叠
        console.log('[AIChatPanel] 🎯 立即初始化深度思考组件显示（默认折叠）');
        
        // 滚动到底部，确保深度思考组件在可视范围内
        setTimeout(() => {
          scrollToBottom(true); // 使用 instant 模式立即滚动
        }, 50);
      }

      // 检测模型是否支持深度思考
      // 对于某些不支持模型详情API的服务商（如魔塔社区），跳过API检测以提升速度
      const skipAPIDetection = providerId === 'ModelScope';
      
      const capabilityDetector = new ModelCapabilityDetector();
      const detectionResult = await capabilityDetector.detectCapabilities(
        actualModelId,
        modelConfig.apiEndpoint,
        modelConfig.apiKey,
        skipAPIDetection
      );
      const supportsReasoning = detectionResult.success && 
        detectionResult.capabilities.includes(ModelCapability.REASONING);
      
      // 更新是否需要显示深度思考过程（根据实际检测结果）
      shouldShowThinking = isDeepThinkingEnabled && supportsReasoning;
      
      console.log('[AIChatPanel] 深度思考状态:', {
        enabled: isDeepThinkingEnabled,
        supportsReasoning,
        shouldShowThinking
      });
      
      // 如果检测到模型不支持推理，清除已显示的深度思考组件
      if (isDeepThinkingEnabled && !supportsReasoning) {
        setActiveThinkingSteps([]);
        setIsActiveThinkingExpanded(false);
        console.log('[AIChatPanel] ⚠️ 模型不支持深度思考，清除深度思考组件');
      }

      // 准备聊天历史
      let chatHistory = [...messages, userMessage].map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }));

      // 🔥 修复：添加system message明确告知模型身份，避免模型身份混淆
      // 移除所有现有的system message（避免旧的system message干扰）
      chatHistory = chatHistory.filter(msg => msg.role !== 'system');
      
      // 根据模型信息生成身份说明
      const modelDisplayName = modelConfig.displayName || formatModelDisplayName(selectedModel);
      const providerDisplayName = getProviderDisplayName(providerId, actualModelId);
      const systemMessage = `你是一个AI助手，模型名称是${modelDisplayName}。当用户询问你的身份、模型名称或开发者时，请准确回答：你是${modelDisplayName}模型，由${providerDisplayName}提供。不要声称自己是其他模型（如Google训练的模型、OpenAI的模型等）。`;
      
      // 在消息数组开头添加system message
      chatHistory.unshift({
        role: 'system',
        content: systemMessage
      });
      
      console.log('[AIChatPanel] 🔥 添加system message:', {
        modelDisplayName,
        providerId,
        systemMessage
      });

      // 创建临时的助手消息ID（但先不添加到消息列表）
      const tempAiMessageId = (Date.now() + 1).toString();
      let assistantMessageAdded = false; // 标记是否已添加 assistant 消息

      // 设置AI Provider（使用modelConfig中的配置）
      await aiService.setProvider(modelConfig.providerId, {
        id: modelConfig.id || 'default',
        name: modelConfig.name || modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        temperature: chatSettings.temperature,
        maxTokens: chatSettings.maxTokens,
        modelId: actualModelId // ✅ 传递实际的模型ID（如 glm-4-plus）
      });

      // 使用 AIService 的流式API
      let accumulatedContent = '';
      let accumulatedReasoning = '';
      const thinkingSteps: ThinkingStep[] = [];
      let currentThinkingStep: ThinkingStep | null = null;
      let hasReceivedReasoning = false; // 🔥 新增：标记是否收到过推理内容
      
      // 如果启用了深度思考且模型支持，初始化 currentThinkingStep
      if (shouldShowThinking) {
        currentThinkingStep = {
          id: Date.now().toString(),
          title: '',
          content: '',
          status: 'thinking',
          timestamp: new Date()
        };
        thinkingSteps.push(currentThinkingStep);
        console.log('[AIChatPanel] 🎯 初始化思考步骤追踪');
      }
      
      await aiService.generateTextStream({
        model: actualModelId,
        messages: chatHistory,
        temperature: chatSettings.temperature,
        maxTokens: chatSettings.maxTokens,
        reasoning: shouldShowThinking ? { 
          enabled: true,
          thinkingBudget: chatSettings.thinkingBudget // ✅ 传递思考预算参数
        } : undefined
      }, {
        onReasoning: (reasoning: string) => {
          // 处理推理内容（从模型返回的真实思考过程）
          // console.log('[AIChatPanel] 🧠 收到推理片段:', reasoning.substring(0, 100) + '...');
          // console.log('[AIChatPanel] 推理片段长度:', reasoning.length);
          
          hasReceivedReasoning = true; // 🔥 标记已收到推理内容
          accumulatedReasoning += reasoning;
          // console.log('[AIChatPanel] 累计推理长度:', accumulatedReasoning.length);
          
          // 更新当前思考步骤（已在初始化时创建）
          if (currentThinkingStep) {
            currentThinkingStep.content = accumulatedReasoning;
            // console.log('[AIChatPanel] 🔄 更新思考步骤内容');
          }
          
          // ✅ 更新临时思考步骤状态（独立显示，不在 assistant 消息中）
          setActiveThinkingSteps([...thinkingSteps]);
          // console.log('[AIChatPanel] 🎯 更新临时思考步骤显示');
        },
        onContent: (chunk: string) => {
          // 流式回调 - 处理正常回复内容
          accumulatedContent += chunk;
          // console.log('[AIChatPanel] 📝 收到内容片段，长度:', chunk.length, '已收到推理:', hasReceivedReasoning, '已添加消息:', assistantMessageAdded);
          
          // 🔥 如果启用了深度思考但还没收到推理内容，先不创建 assistant 消息
          if (shouldShowThinking && !hasReceivedReasoning) {
            // console.log('[AIChatPanel] ⏳ 等待推理内容，暂不创建 assistant 消息');
            return;
          }
          
          // 如果有思考过程，标记思考完成
          if (currentThinkingStep && currentThinkingStep.status === 'thinking') {
            currentThinkingStep.status = 'completed';
            if (currentThinkingStep.timestamp) {
              currentThinkingStep.duration = Date.now() - currentThinkingStep.timestamp.getTime();
              console.log('[AIChatPanel] ⏱️ 思考耗时:', currentThinkingStep.duration, 'ms');
            }
            // console.log('[AIChatPanel] ✅ 思考步骤已完成，状态已更新为:', currentThinkingStep.status);
          }
          
          // ✅ 只有在收到第一个内容片段时才添加 assistant 消息
          if (!assistantMessageAdded) {
            // console.log('[AIChatPanel] 🎯 准备创建 assistant 消息，ID:', tempAiMessageId);
            assistantMessageAdded = true;
            
            // 清除临时思考步骤显示，并重置展开状态
            setActiveThinkingSteps(null);
            setIsActiveThinkingExpanded(false);
            
            const initialMessage: Message = {
              id: tempAiMessageId,
              role: 'assistant',
              content: accumulatedContent,
              timestamp: new Date(),
              model: selectedModel,
              isThinking: false,
              thinkingSteps: thinkingSteps.length > 0 ? thinkingSteps.map(step => ({...step})) : undefined
            };
            setMessages(prev => {
              // console.log('[AIChatPanel] 🔥 创建 assistant 消息，ID:', tempAiMessageId, '当前消息数:', prev.length, '→', prev.length + 1);
              // console.log('[AIChatPanel] 🔍 当前所有消息ID:', prev.map(m => `${m.id}(${m.role})`).join(', '));
              const newMessages = [...prev, initialMessage];
              // console.log('[AIChatPanel] 🔍 新消息列表ID:', newMessages.map(m => `${m.id}(${m.role})`).join(', '));
              return newMessages;
            });
            // console.log('[AIChatPanel] ✅ 思考完成，开始显示 assistant 消息');
          } else {
            // 更新消息显示
            // console.log('[AIChatPanel] 🔄 更新 assistant 消息，内容长度:', accumulatedContent.length);
            setMessages(prev => prev.map(msg =>
              msg.id === tempAiMessageId
                ? { 
                    ...msg, 
                    content: accumulatedContent,
                    isThinking: false,
                    // 深拷贝思考步骤，确保 React 能检测到变化
                    thinkingSteps: thinkingSteps.length > 0 ? thinkingSteps.map(step => ({...step})) : undefined
                  }
                : msg
            ));
          }
        }
      });

      console.log('[AIChatPanel] AI 响应完成');
      console.log('[AIChatPanel] 最终累计推理长度:', accumulatedReasoning.length);
      console.log('[AIChatPanel] 最终累计内容长度:', accumulatedContent.length);
      
      // 保存AI响应到数据库（包括推理内容）
      try {
        const messageToSave = {
          id: tempAiMessageId,
          sessionId: currentSessionId,
          role: 'assistant' as const,
          content: accumulatedContent,
          model: selectedModel,
          timestamp: Date.now(),
          reasoning: accumulatedReasoning || undefined // 保存推理内容
        };
        
        console.log('[AIChatPanel] 准备保存的消息:', {
          id: messageToSave.id,
          contentLength: messageToSave.content.length,
          reasoningLength: messageToSave.reasoning?.length || 0,
          hasReasoning: !!messageToSave.reasoning
        });
        
        await window.electronAPI?.chatHistory?.addMessage(messageToSave);
        console.log('[AIChatPanel] ✅ AI消息已保存（包含推理内容）');
      } catch (error) {
        console.error('[AIChatPanel] ❌ 保存AI消息失败:', error);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('[AIChatPanel] 调用 AI 服务失败:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，调试AI 服务失败！${String(error)}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
                
                // 检查上一条消息是否是用户消息
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const isPrevUser = prevMessage?.role === 'user';
                
                // 当前消息是否有思考步骤
                const hasThinkingSteps = message.role === 'assistant' && message.thinkingSteps && message.thinkingSteps.length > 0;
                
                return (
                  <React.Fragment key={message.id}>
                    {/* 如果当前是助手消息且有思考步骤，先渲染思考组件 */}
                    {hasThinkingSteps && isPrevUser && (
                      <div className="thinking-container">
                        <ModelThinking
                          steps={message.thinkingSteps!}
                          isExpanded={thinkingExpanded.get(message.id) ?? false}
                          showDuration={true}
                          onToggleExpand={() => {
                            setThinkingExpanded(prev => {
                              const newMap = new Map(prev);
                              const currentState = newMap.get(message.id) ?? false;
                              newMap.set(message.id, !currentState);
                              return newMap;
                            });
                          }}
                        />
                      </div>
                    )}
                    
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
          
          {/* 临时思考步骤显示（独立于消息，在思考过程中显示） */}
          {activeThinkingSteps && activeThinkingSteps.length > 0 && (
            <div className="thinking-container active-thinking">
              <ModelThinking
                steps={activeThinkingSteps}
                isExpanded={isActiveThinkingExpanded}
                showDuration={true}
                onToggleExpand={() => {
                  console.log('[AIChatPanel] 切换临时思考步骤展开状态:', !isActiveThinkingExpanded);
                  setIsActiveThinkingExpanded(!isActiveThinkingExpanded);
                }}
              />
            </div>
          )}
          
          {/* 只在非思考模式下显示"正在思考..."加载动画 */}
          {isLoading && !isDeepThinkingEnabled && (
            <div className="message assistant">
              <div className="message-bubble assistant">
                <div className="message-loading">
                  <div className="message-loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="text">正在思考...</span>
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
                              // 将文件引用插入到输入框
                              const fileRef = `@file[${file.path}](${file.name})`;
                              setInput(prev => prev + fileRef + ' ');
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              // 聚焦输入框
                              textareaRef.current?.focus();
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
                              // 将知识库引用插入到输入框
                              const kbRef = `@kb[${kb.id}](${kb.title})`;
                              setInput(prev => prev + kbRef + ' ');
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              // 聚焦输入框
                              textareaRef.current?.focus();
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
                              // 将表单引用插入到输入框
                              const formRef = `@form[${form.id}](${form.name})`;
                              setInput(prev => prev + formRef + ' ');
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              // 聚焦输入框
                              textareaRef.current?.focus();
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
                            className="context-menu-item"
                            onClick={() => {
                              // 将技能包引用插入到输入框
                              const skillRef = `@skill[${skill.path}](${skill.name})`;
                              setInput(prev => prev + skillRef + ' ');
                              setSubMenuType('none');
                              setIsContextMenuOpen(false);
                              // 聚焦输入框
                              textareaRef.current?.focus();
                            }}
                          >
                            <Icon name={skill.type === 'directory' ? 'folder' : 'file'} size={14} />
                            <span className="context-menu-item-text">{skill.name}</span>
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
            <textarea
              ref={textareaRef}
              className="input-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入消息，使用 / 打开命令菜单..."
              disabled={isLoading}
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
                    chatMode === 'plan' ? '计划模式，AI会先制定计划再执行任务' :
                    chatMode === 'auto-edit' ? 'Agent自动编辑模式，AI会自动执行文件编辑操作' :
                    'Agent询问模式，AI在执行编辑操作前会先询问确认'
                  }
                >
                  {chatMode === 'plan' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                      <path d="M9 18h6"/>
                      <path d="M10 22h4"/>
                    </svg>
                  )}
                  {chatMode === 'auto-edit' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19h8"/>
                      <path d="m4 17 6-6-6-6"/>
                    </svg>
                  )}
                  {chatMode === 'ask-before-edit' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6v.343"/>
                      <path d="M18.218 18.218A7 7 0 0 1 5 15V9a7 7 0 0 1 .782-3.218"/>
                      <path d="M19 13.343V9A7 7 0 0 0 8.56 2.902"/>
                      <path d="M22 22 2 2"/>
                    </svg>
                  )}
                  {chatMode === 'chat' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
                    </svg>
                  )}
                  <span>
                    {chatMode === 'chat' ? '普通' :
                     chatMode === 'plan' ? '计划' :
                     chatMode === 'auto-edit' ? '自动编辑' : '编辑前询问'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {isModeMenuOpen && (
                  <div className="mode-menu">
                    <div className="mode-menu-group">
                      <div className="mode-menu-group-title">对话模式</div>
                      <div
                        className={`mode-menu-item ${chatMode === 'chat' ? 'active' : ''}`}
                        onClick={() => { setChatMode('chat'); setIsModeMenuOpen(false); }}
                        title="普通对话模式，直接与AI进行对话交流"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
                        </svg>
                        <span>普通</span>
                        {chatMode === 'chat' && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                            <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div
                        className={`mode-menu-item ${chatMode === 'plan' ? 'active' : ''}`}
                        onClick={() => { setChatMode('plan'); setIsModeMenuOpen(false); }}
                        title="计划模式，AI会先制定计划再执行任务"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                          <path d="M9 18h6"/>
                          <path d="M10 22h4"/>
                        </svg>
                        <span>计划</span>
                        {chatMode === 'plan' && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                            <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="mode-menu-group">
                      <div className="mode-menu-group-title">Agent模式</div>
                      <div
                        className={`mode-menu-item ${chatMode === 'auto-edit' ? 'active' : ''}`}
                        onClick={() => { setChatMode('auto-edit'); setIsModeMenuOpen(false); }}
                        title="Agent自动编辑模式，AI会自动执行文件编辑操作"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 19h8"/>
                          <path d="m4 17 6-6-6-6"/>
                        </svg>
                        <span>自动编辑</span>
                        {chatMode === 'auto-edit' && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                            <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div
                        className={`mode-menu-item ${chatMode === 'ask-before-edit' ? 'active' : ''}`}
                        onClick={() => { setChatMode('ask-before-edit'); setIsModeMenuOpen(false); }}
                        title="Agent询问模式，AI在执行编辑操作前会先询问确认"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 6v.343"/>
                          <path d="M18.218 18.218A7 7 0 0 1 5 15V9a7 7 0 0 1 .782-3.218"/>
                          <path d="M19 13.343V9A7 7 0 0 0 8.56 2.902"/>
                          <path d="M22 22 2 2"/>
                        </svg>
                        <span>编辑前询问</span>
                        {chatMode === 'ask-before-edit' && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                            <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
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
