/**
 * AI 对话面板组件  - Note WStudio 2.0使用的是这个组件
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getCachedModels, getModelConfig, type CachedModelInfo } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { DropdownMenu, type DropdownMenuItem, type DropdownMenuGroup } from '../../common/DropdownMenu';
import { AIProviderIconFromModel } from '../../Icons/AIProviderIcon';
import { Icon } from '../../Icons/Icon';
import { EditIcon } from '../../Icons/EditIcon';
import { createPortal } from 'react-dom';
import { ChatHistory } from './ChatHistory';
import { aiAgentService } from '../../../services/AIAgentService';
import { AIChatSettings, DEFAULT_CHAT_SETTINGS, type AIChatSettingsConfig, SEARCH_ENGINES } from '../../AIChatSettings';
import { electronStore } from '../../../services/ElectronStoreService';
import { ModelThinking, type ThinkingStep } from '../../ModeThinking';
import { ModelCapabilityDetector } from '../../../services/modelCapabilityDetector';
import { ModelCapability } from '../../../types/modelCapabilities';
import { AssistantTextContextMenu, type AssistantTextContextMenuProps } from './AssistantTextContextMenu';
import { AIResponseRenderer } from '../../AIResponseRenderer';
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
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [myAgents, setMyAgents] = useState<Array<{id: string; name: string; emoji: string}>>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isDeepThinkingEnabled, setIsDeepThinkingEnabled] = useState(false);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 消息容器的 ref
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contextButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const agentButtonRef = useRef<HTMLButtonElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerContextMenuRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
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
      
      // 转换为 ModelInfo 格式
      const modelInfos: ModelInfo[] = cachedModels.map(model => ({
        modelId: model.modelId,
        configName: model.configName,
        providerId: model.providerId,
        displayName: model.displayName
      }));
      
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
    // 首次加载模型
    loadModels();
    
    // 监听模型缓存更新事件
    const handleModelsCacheUpdate = () => {
      console.log('[AIChatPanel] 模型缓存已更新，重新加载模型列表...');
      loadModels();
    };
    
    window.addEventListener('models-cache-updated', handleModelsCacheUpdate);
    
    return () => {
      window.removeEventListener('models-cache-updated', handleModelsCacheUpdate);
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
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isContextMenuOpen]);

  // 点击外部关闭 AI 智能体菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isAgentMenuOpen &&
        agentMenuRef.current &&
        agentButtonRef.current &&
        !agentMenuRef.current.contains(event.target as Node) &&
        !agentButtonRef.current.contains(event.target as Node)
      ) {
        setIsAgentMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAgentMenuOpen]);

  // 监听 AI 智能体更新事件
  useEffect(() => {
    const handleAgentUpdated = () => {
      console.log('[AIChatPanel] 收到智能体更新事件，重新加载');
      if (isAgentMenuOpen) {
        loadMyAgents();
      }
    };

    window.addEventListener('ai-agent-updated', handleAgentUpdated);
    return () => {
      window.removeEventListener('ai-agent-updated', handleAgentUpdated);
    };
  }, [isAgentMenuOpen]);

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

  // 切换 AI 智能体菜单
  const toggleAgentMenu = async () => {
    const newState = !isAgentMenuOpen;
    setIsAgentMenuOpen(newState);
    console.log(`[AIChatPanel] AI智能体菜单状态变为: ${newState ? '打开' : '关闭'}`);
    
    // 打开菜单时加载"我的"智能体
    if (newState) {
      await loadMyAgents();
    }
  };

  // 加载"我的"智能体列表
  const loadMyAgents = async () => {
    setIsLoadingAgents(true);
    try {
      const agents = await aiAgentService.getMyAgents();
      setMyAgents(agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji
      })));
      console.log(`[AIChatPanel] 加载到 ${agents.length} 个我的智能体`);
    } catch (error) {
      console.error('[AIChatPanel] 加载我的智能体失败:', error);
      setMyAgents([]);
    } finally {
      setIsLoadingAgents(false);
    }
  };

  // 处理上下文菜单项点击
  const handleContextMenuItemClick = (action: string) => {
    console.log(`[AIChatPanel] 上下文菜单点击: ${action}`);
    setIsContextMenuOpen(false);
    
    // 触发相应的全局事件
    switch (action) {
      case 'snippets':
        // 打开底部面板并切换到常用片段标签页
        window.dispatchEvent(new CustomEvent('open-panel', {
          detail: { view: 'snippets' }
        }));
        break;
      case 'knowledge':
        // 打开知识库面板
        window.dispatchEvent(new Event('show-knowledge-base'));
        break;
      case 'files':
        // 打开文件选择器
        window.dispatchEvent(new Event('show-file-picker'));
        break;
      case 'search':
        // 打开全局搜索
        window.dispatchEvent(new Event('show-global-search'));
        break;
      default:
        console.warn(`[AIChatPanel] 未知的上下文菜单操作: ${action}`);
    }
  };

  // 处理 AI 智能体选择
  const handleAgentSelect = (agentId: string) => {
    console.log(`[AIChatPanel] 选择AI智能体: ${agentId}`);
    setIsAgentMenuOpen(false);
    // TODO: 实现 AI 智能体切换逻辑
    window.dispatchEvent(new CustomEvent('agent-selected', { 
      detail: { agentId } 
    }));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    // 检查是否选择了模型
    if (!selectedModel) {
      console.error('[AIChatPanel] 未选择模型');
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
              title="添加上下文"
            >
              <Icon name="at-sign" size={16} />
            </button>

            {/* 上下文菜单 */}
            {isContextMenuOpen && (
              <div ref={contextMenuRef} className="context-menu">
                {/* 搜索框 */}
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

                {/* 菜单项 */}
                <div className="context-menu-item" onClick={() => handleContextMenuItemClick('files')}>
                  <Icon name="files-folder" size={16} />
                  <span className="context-menu-item-text">文件&文件夹</span>
                </div>
                <div className="context-menu-item" onClick={() => handleContextMenuItemClick('knowledge')}>
                  <Icon name="knowledge-base-book" size={16} />
                  <span className="context-menu-item-text">知识库</span>
                </div>
                <div className="context-menu-item" onClick={() => handleContextMenuItemClick('snippets')}>
                  <Icon name="code-snippet" size={16} />
                  <span className="context-menu-item-text">常用片段</span>
                </div>
              </div>
            )}

            {/* AI 智能体按钮 */}
            <button 
              ref={agentButtonRef}
              className={`agent-button ${isAgentMenuOpen ? 'active' : ''}`}
              onClick={toggleAgentMenu}
              title="AI 智能体"
            >
              <Icon name="ai-agent" size={16} />
            </button>

            {/* AI 智能体菜单 */}
            {isAgentMenuOpen && (
              <div ref={agentMenuRef} className="agent-menu menu">
                {/* 创建智能体选项 - 始终显示 */}
                <div 
                  className="agent-menu-item menu-item agent-menu-create"
                  onClick={() => {
                    setIsAgentMenuOpen(false);
                    // 触发打开 AI 智能体侧边栏的"我的"分类
                    window.dispatchEvent(new CustomEvent('open-ai-agent', {
                      detail: { categoryId: 'my', categoryName: '我的' }
                    }));
                  }}
                >
                  <Icon name="plus" size={16} />
                  <span className="agent-menu-item-text">创建智能体</span>
                </div>

                {/* 分隔线 */}
                {!isLoadingAgents && myAgents.length > 0 && (
                  <div className="agent-menu-divider"></div>
                )}

                {isLoadingAgents ? (
                  <div className="agent-menu-loading">
                    <span>加载中...</span>
                  </div>
                ) : myAgents.length > 0 ? (
                  myAgents.map(agent => (
                    <div 
                      key={agent.id} 
                      className="agent-menu-item menu-item"
                    >
                      <div 
                        className="agent-menu-item-content"
                        onClick={() => handleAgentSelect(agent.id)}
                      >
                        <span className="agent-emoji">{agent.emoji}</span>
                        <span className="agent-menu-item-text">{agent.name}</span>
                      </div>
                      <EditIcon 
                        size={14}
                        className="agent-menu-item-edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[AIChatPanel] 编辑智能体:', agent.id);
                          // TODO: 实现编辑功能
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <div className="agent-menu-empty">
                    <Icon name="empty-state" size={32} color="var(--ws-description-foreground)" />
                    <span className="agent-menu-empty-text">暂无智能体</span>
                  </div>
                )}
              </div>
            )}
            
            <button
              className={`deep-thinking-button ${isDeepThinkingEnabled ? 'active' : ''}`}
              onClick={() => setIsDeepThinkingEnabled(!isDeepThinkingEnabled)}
              title={isDeepThinkingEnabled ? '关闭深度思考' : '开启深度思考'}
              disabled={isLoading}
            >
              <Icon name="deep-thinking" size={16} />
            </button>

            <button
              className={`web-search-button ${isWebSearchEnabled ? 'active' : ''}`}
              onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
              title={isWebSearchEnabled ? `关闭网络搜索 (${SEARCH_ENGINES[chatSettings.searchEngine].name})` : `开启网络搜索 (${SEARCH_ENGINES[chatSettings.searchEngine].name})`}
              disabled={isLoading}
            >
              <Icon name="network" size={16} />
            </button>

            <button
              className="clear-context-button"
              onClick={() => {/* TODO: 添加清除上下文功能 */}}
              title="清除上下文"
              disabled={isLoading}
            >
              <Icon name="clear-context" size={16} />
            </button>
          </div>

          {/* 输入框区域 */}
          <div className="input-area">
            <textarea
              ref={textareaRef}
              className="input-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="添加上下文，扩展@，命令 /..."
              disabled={isLoading}
            />
          </div>

          {/* 底部工具栏 */}
          <div className="input-toolbar">
            <div className="toolbar-left">
              <DropdownMenu
                value={selectedModel}
                onChange={(model) => setSelectedModel(model)}
                groups={(() => {
                  // 按配置名称分组模型
                  const grouped = new Map<string, DropdownMenuItem[]>();
                  availableModels.forEach(model => {
                    if (!grouped.has(model.configName)) {
                      grouped.set(model.configName, []);
                    }
                    grouped.get(model.configName)!.push({
                      value: model.modelId,
                      label: model.displayName || formatModelDisplayName(model.modelId),
                      icon: <AIProviderIconFromModel modelString={model.modelId} size={16} />
                    });
                  });
                  return Array.from(grouped.entries()).map(([configName, items]) => ({
                    groupName: configName,
                    items
                  }));
                })()}
                disabled={isLoading}
                placeholder="选择模型"
                showSearch={availableModels.length > 5}
                placement="top"
                className="ai-chat-model-selector"
              />
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
