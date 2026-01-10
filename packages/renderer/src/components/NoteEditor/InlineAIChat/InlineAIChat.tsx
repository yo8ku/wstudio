/**
 * CodeMirror 内联 AI 聊天组件
 * 功能：在 CodeMirror 编辑器中提供内联 AI 对话功能
 * 描述：类似 Monaco Editor 的 AIZoneWidget，但适配 CodeMirror
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { Icon } from '../../Icons/Icon';
import { getCachedModels, getModelConfig } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled } from '../../../services/ai';
import { Select, type SelectGroup } from '../../common/Select/Select';
import { buildLevel1MenuItems, buildLevel2MenuItems } from '../../Layout/EditorArea/AIZoneWidget/buildContextMenuItems';
import { TipTapInput, type TipTapInputRef } from '../../Layout/EditorArea/AIZoneWidget/TipTapInput';
import type { AIRequestParams, StreamCallback, AIResponse } from '../../../types/aiProvider';
import './InlineAIChat.scss';

/** AI 聊天消息类型 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

/** 模型信息类型 */
interface ModelInfo {
  modelId: string;
  configName: string;
  providerId: string;
  displayName?: string;
  capabilities?: {
    thinking?: boolean;
  };
}

/** 内联聊天组件 Props */
interface InlineAIChatProps {
  onClose: () => void;
  onInsert: (text: string) => void;
  initialSelection?: string;
  view: EditorView;
}

/** 内联 AI 聊天 React 组件 */
export const InlineAIChatComponent: React.FC<InlineAIChatProps> = ({
  onClose,
  onInsert,
  initialSelection,
  view,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');
  const [isAtMenuOpen, setIsAtMenuOpen] = useState(false);
  const [atMenuLevel, setAtMenuLevel] = useState<'main' | 'form'>('main');
  const [atMenuGroups, setAtMenuGroups] = useState<SelectGroup[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedForms, setExpandedForms] = useState<Set<string>>(new Set());
  const [atMenuHeight, setAtMenuHeight] = useState<number | undefined>(undefined);
  const [atMenuHighlightIndex, setAtMenuHighlightIndex] = useState(0);
  const [isSparklesMenuOpen, setIsSparklesMenuOpen] = useState(false);
  const [isToneSubmenuOpen, setIsToneSubmenuOpen] = useState(false);
  const [currentSelection, setCurrentSelection] = useState(initialSelection || '');
  const [fileReferences, setFileReferences] = useState<Array<{ path: string; name: string }>>([]);
  const tiptapInputRef = useRef<TipTapInputRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelTriggerRef = useRef<HTMLSpanElement>(null);
  const atTriggerRef = useRef<HTMLSpanElement>(null);
  const sparklesTriggerRef = useRef<HTMLSpanElement>(null);

  /** AI 能力类型 */
  type AIAbilityType = 'polish' | 'expand' | 'shorten' | 'tone';
  /** 语气类型 */
  type ToneType = 'professional' | 'humorous' | 'casual' | 'readable' | 'subtle' | 'academic' | 'trendy' | 'literary';

  // 关闭所有下拉菜单
  const closeAllMenus = useCallback(() => {
    setIsModelDropdownOpen(false);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
  }, []);

  // 切换模型菜单
  const toggleModelMenu = useCallback(() => {
    if (!isModelDropdownOpen && modelTriggerRef.current) {
      const rect = modelTriggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = Math.min(availableModels.length * 40 + 8, 208);
      setDropdownDirection(spaceBelow < dropdownHeight ? 'up' : 'down');
    }
    setIsAtMenuOpen(false);
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
    setIsModelDropdownOpen(!isModelDropdownOpen);
  }, [isModelDropdownOpen, availableModels.length]);

  // 切换 @ 菜单
  const toggleAtMenu = useCallback(async () => {
    setIsModelDropdownOpen(false);
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
    if (isAtMenuOpen) {
      setIsAtMenuOpen(false);
      setAtMenuLevel('main');
      setCurrentCategory('');
      setExpandedFolders(new Set());
    } else {
      // 加载一级菜单
      const groups = await buildLevel1MenuItems();
      setAtMenuGroups(groups);
      setIsAtMenuOpen(true);
      setAtMenuLevel('main');
    }
  }, [isAtMenuOpen]);

  // 切换 sparkles 菜单
  const toggleSparklesMenu = useCallback(() => {
    setIsModelDropdownOpen(false);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setIsToneSubmenuOpen(false);
    setIsSparklesMenuOpen(!isSparklesMenuOpen);
  }, [isSparklesMenuOpen]);

  // 点击外部关闭所有菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 检查是否有菜单打开
      const hasOpenMenu = isModelDropdownOpen || isAtMenuOpen || isSparklesMenuOpen;
      if (!hasOpenMenu) return;

      // 检查点击是否在下拉菜单内部
      const isInDropdown = target.closest('.cm-inline-ai-model-dropdown') ||
                          target.closest('.cm-inline-ai-sparkles-dropdown') ||
                          target.closest('.select-content') || // Select 组件的下拉菜单
                          target.closest('.cm-inline-ai-tone-submenu');
      
      // 检查点击是否在触发器上
      const isOnTrigger = target.closest('.cm-inline-ai-model-trigger') ||
                         target.closest('.cm-inline-ai-sparkles-btn') ||
                         target.closest('.cm-inline-ai-at-trigger');

      // 如果点击不在下拉菜单内部且不在触发器上，关闭所有菜单
      if (!isInDropdown && !isOnTrigger) {
        closeAllMenus();
      }
    };

    // 使用 capture 阶段捕获事件，确保在其他事件处理之前执行
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [closeAllMenus, isModelDropdownOpen, isAtMenuOpen, isSparklesMenuOpen]);

  // 监听编辑器滚动，关闭 @ 菜单
  useEffect(() => {
    const handleScroll = () => {
      if (isAtMenuOpen) {
        setIsAtMenuOpen(false);
        setAtMenuLevel('main');
        setCurrentCategory('');
        setExpandedFolders(new Set());
        setExpandedForms(new Set());
      }
    };

    // 监听 CodeMirror 编辑器的滚动事件
    const scrollDOM = view.scrollDOM;
    scrollDOM.addEventListener('scroll', handleScroll);

    return () => {
      scrollDOM.removeEventListener('scroll', handleScroll);
    };
  }, [view, isAtMenuOpen]);

  // 加载可用模型
  useEffect(() => {
    const loadModels = async () => {
      try {
        const cachedModels = await getCachedModels();
        const modelInfos: ModelInfo[] = cachedModels
          .filter(model => {
            const modelName = model.modelId.includes(':') 
              ? model.modelId.split(':')[1] 
              : model.modelId;
            return isModelEnabled(modelName);
          })
          .map(model => ({
            modelId: model.modelId,
            configName: model.configName,
            providerId: model.providerId,
            displayName: model.displayName,
            capabilities: model.capabilities,
          }));
        
        setAvailableModels(modelInfos);
        if (modelInfos.length > 0 && !selectedModel) {
          setSelectedModel(modelInfos[0].modelId);
        }
      } catch (error) {
        console.error('[InlineAIChat] 加载模型失败:', error);
      }
    };
    loadModels();
  }, [selectedModel]);

  // 自动聚焦输入框
  useEffect(() => {
    tiptapInputRef.current?.focus();
  }, []);

  // 滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 监听编辑器选择变化
  useEffect(() => {
    const updateSelection = () => {
      const { from, to } = view.state.selection.main;
      if (from < to) {
        const text = view.state.sliceDoc(from, to);
        setCurrentSelection(text);
      } else {
        setCurrentSelection('');
      }
    };

    // 使用 DOM 事件监听选择变化
    view.contentDOM.addEventListener('mouseup', updateSelection);
    view.contentDOM.addEventListener('keyup', updateSelection);

    return () => {
      view.contentDOM.removeEventListener('mouseup', updateSelection);
      view.contentDOM.removeEventListener('keyup', updateSelection);
    };
  }, [view]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const inputText = tiptapInputRef.current?.getText() || '';
    if (!inputText.trim() || isLoading || !selectedModel) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    tiptapInputRef.current?.clear();
    setIsLoading(true);

    // 创建助手消息占位
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const modelConfig = await getModelConfig(selectedModel);
      if (!modelConfig) {
        throw new Error(`未找到模型配置：${selectedModel}`);
      }

      // 从 modelId 中提取实际的模型名称（格式：configName:modelName）
      const actualModelName = modelConfig.modelId.includes(':') 
        ? modelConfig.modelId.split(':')[1] 
        : modelConfig.modelId;

      // 设置 AI 提供商
      await aiService.setProvider(modelConfig.providerId, {
        name: modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        modelId: actualModelName,
      });

      // 构建消息历史
      const chatMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      
      // 添加当前用户消息
      chatMessages.push({
        role: 'user' as const,
        content: currentSelection 
          ? `以下是选中的文本：\n\n${currentSelection}\n\n用户问题：${userMessage.content}`
          : userMessage.content,
      });

      // 创建 AbortController
      abortControllerRef.current = new AbortController();

      // 构建请求参数
      const requestParams: AIRequestParams = {
        model: actualModelName,
        messages: chatMessages,
        signal: abortControllerRef.current.signal,
      };

      // 流式回调
      let fullResponse = '';
      const streamCallback: StreamCallback = {
        onContent: (content: string) => {
          fullResponse += content;
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: fullResponse }
                : msg
            )
          );
        },
        onComplete: (_response: AIResponse) => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, isStreaming: false }
                : msg
            )
          );
          setIsLoading(false);
        },
        onError: (error: Error) => {
          console.error('[InlineAIChat] AI 响应错误:', error);
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: `错误: ${error.message}`, isStreaming: false }
                : msg
            )
          );
          setIsLoading(false);
        },
      };

      // 调用流式 API
      await aiService.generateTextStream(requestParams, streamCallback);
    } catch (error) {
      console.error('[InlineAIChat] 发送消息失败:', error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: `错误: ${(error as Error).message}`, isStreaming: false }
            : msg
        )
      );
      setIsLoading(false);
    }
  }, [isLoading, selectedModel, messages, currentSelection]);

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setMessages(prev => 
      prev.map(msg => 
        msg.isStreaming ? { ...msg, isStreaming: false } : msg
      )
    );
  }, []);

  // 插入最后一条助手消息到编辑器
  const handleInsertLastResponse = useCallback(() => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMessage) {
      onInsert(lastAssistantMessage.content);
    }
  }, [messages, onInsert]);

  // 获取模型显示名称
  const getModelDisplayName = (modelId: string): string => {
    const model = availableModels.find(m => m.modelId === modelId);
    if (model?.displayName) return model.displayName;
    const colonIndex = modelId.indexOf(':');
    return colonIndex > 0 ? modelId.substring(colonIndex + 1) : modelId;
  };

  // @ 菜单项选择处理
  const handleAtMenuSelect = useCallback(async (value: string) => {
    // 处理分类选项 - 切换到二级菜单
    if (value.startsWith('category-')) {
      setCurrentCategory(value);
      const groups = await buildLevel2MenuItems(
        value,
        (filePath: string) => handleFileSelect(filePath),
        (promptId: string) => handlePromptSelect(promptId),
        (kbId: string) => handleKnowledgeBaseSelect(kbId),
        (snippetId: number) => handleSnippetSelect(snippetId),
        (agentId: string) => handleAgentSelect(agentId),
        expandedFolders,
        undefined,
        (formId: string) => handleFormSelect(formId),
        expandedForms
      );
      setAtMenuGroups(groups);
      setAtMenuLevel('form');
      return; // 不关闭菜单，直接返回
    }

    // 处理文件夹展开/折叠
    if (value.startsWith('folder-')) {
      const folderPath = value.replace('folder-', '');
      const newExpanded = new Set(expandedFolders);
      if (newExpanded.has(folderPath)) {
        newExpanded.delete(folderPath);
      } else {
        newExpanded.add(folderPath);
      }
      setExpandedFolders(newExpanded);
      
      // 重新加载二级菜单
      const groups = await buildLevel2MenuItems(
        currentCategory,
        (filePath: string) => handleFileSelect(filePath),
        (promptId: string) => handlePromptSelect(promptId),
        (kbId: string) => handleKnowledgeBaseSelect(kbId),
        (snippetId: number) => handleSnippetSelect(snippetId),
        (agentId: string) => handleAgentSelect(agentId),
        newExpanded,
        undefined,
        (formId: string) => handleFormSelect(formId),
        expandedForms
      );
      setAtMenuGroups(groups);
      return; // 不关闭菜单，直接返回
    }

    // 处理表单展开/折叠
    if (value.startsWith('form-expand-')) {
      const formId = value.replace('form-expand-', '');
      const newExpanded = new Set(expandedForms);
      if (newExpanded.has(formId)) {
        newExpanded.delete(formId);
      } else {
        newExpanded.add(formId);
      }
      setExpandedForms(newExpanded);
      
      // 重新加载二级菜单
      const groups = await buildLevel2MenuItems(
        currentCategory,
        (filePath: string) => handleFileSelect(filePath),
        (promptId: string) => handlePromptSelect(promptId),
        (kbId: string) => handleKnowledgeBaseSelect(kbId),
        (snippetId: number) => handleSnippetSelect(snippetId),
        (agentId: string) => handleAgentSelect(agentId),
        expandedFolders,
        undefined,
        (formId: string) => handleFormSelect(formId),
        newExpanded
      );
      setAtMenuGroups(groups);
      return; // 不关闭菜单，直接返回
    }

    // 处理表单字段选择
    if (value.startsWith('form-column|')) {
      // 格式: form-column|{encodedFormName}|{encodedColumnName}
      const parts = value.split('|');
      // parts: ['form-column', encodedFormName, encodedColumnName]
      if (parts.length >= 3) {
        const formName = decodeURIComponent(parts[1]);
        const columnName = decodeURIComponent(parts[2]);
        handleFormColumnSelect(formName, columnName);
      }
      return;
    }

    // 处理最近文件选择
    if (value.startsWith('recent-file-')) {
      // TODO: 获取实际文件路径并处理
      console.log('[InlineAIChat] 选择最近文件:', value);
    }

    // 处理文件选择
    if (value.startsWith('file-')) {
      const filePath = value.replace('file-', '');
      handleFileSelect(filePath);
    }

    // 处理表单选择（直接选择表单，不是展开）
    if (value.startsWith('form|')) {
      // 格式: form|{encodedFormName}
      const parts = value.split('|');
      if (parts.length >= 2) {
        const formName = decodeURIComponent(parts[1]);
        handleFormSelect(formName);
      }
    }

    // 处理知识库选择
    if (value.startsWith('kb-')) {
      const kbId = value.replace('kb-', '');
      handleKnowledgeBaseSelect(kbId);
    }

    // 处理提示词选择
    if (value.startsWith('prompt-')) {
      handlePromptSelect(value);
    }

    // 处理片段选择
    if (value.startsWith('snippet-')) {
      const snippetId = parseInt(value.replace('snippet-', ''), 10);
      handleSnippetSelect(snippetId);
    }

    // 处理智能体选择
    if (value.startsWith('agent-')) {
      const agentId = value.replace('agent-', '');
      handleAgentSelect(agentId);
    }

    // 只有在选择具体项目时才关闭菜单（由 onItemClick 控制）
  }, [expandedFolders, expandedForms, currentCategory]);

  // 文件选择处理
  const handleFileSelect = useCallback((filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    tiptapInputRef.current?.insertFileReference(filePath, fileName);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 表单选择处理
  const handleFormSelect = useCallback((formName: string) => {
    tiptapInputRef.current?.insertFileReference(`form:${formName}`, formName);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 表单字段选择处理
  const handleFormColumnSelect = useCallback((formName: string, columnName: string) => {
    // 显示格式: @表单名称（字段名称）
    const displayName = `${formName}（${columnName}）`;
    tiptapInputRef.current?.insertFileReference(`column:${formName}:${columnName}`, displayName);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 知识库选择处理
  const handleKnowledgeBaseSelect = useCallback((kbId: string) => {
    tiptapInputRef.current?.insertFileReference(`kb:${kbId}`, kbId);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 提示词选择处理
  const handlePromptSelect = useCallback((promptId: string) => {
    tiptapInputRef.current?.insertFileReference(`prompt:${promptId}`, promptId);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 片段选择处理
  const handleSnippetSelect = useCallback((snippetId: number) => {
    tiptapInputRef.current?.insertFileReference(`snippet:${snippetId}`, `片段${snippetId}`);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 智能体选择处理
  const handleAgentSelect = useCallback((agentId: string) => {
    tiptapInputRef.current?.insertFileReference(`agent:${agentId}`, `智能体:${agentId}`);
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setExpandedForms(new Set());
  }, []);

  // 返回一级菜单
  const handleBackToMainMenu = useCallback(async () => {
    setExpandedFolders(new Set());
    setCurrentCategory('');
    const groups = await buildLevel1MenuItems();
    setAtMenuGroups(groups);
    setAtMenuLevel('main');
  }, []);

  // @ 菜单键盘导航 - 向上/向下
  const handleAtMenuNavigate = useCallback((direction: 'up' | 'down') => {
    // 计算所有可选项的总数
    let totalItems = 0;
    atMenuGroups.forEach(group => {
      totalItems += group.items.length;
    });
    
    if (totalItems === 0) return;
    
    setAtMenuHighlightIndex(prev => {
      if (direction === 'up') {
        return prev <= 0 ? totalItems - 1 : prev - 1;
      } else {
        return prev >= totalItems - 1 ? 0 : prev + 1;
      }
    });
  }, [atMenuGroups]);

  // @ 菜单键盘导航 - 选择当前高亮项
  const handleAtMenuSelectHighlighted = useCallback(() => {
    // 找到当前高亮的项
    let currentIndex = 0;
    for (const group of atMenuGroups) {
      for (const item of group.items) {
        if (currentIndex === atMenuHighlightIndex) {
          handleAtMenuSelect(item.value);
          return;
        }
        currentIndex++;
      }
    }
  }, [atMenuGroups, atMenuHighlightIndex, handleAtMenuSelect]);

  // 处理 TipTap 输入变化
  const handleTipTapChange = useCallback(() => {
    // 输入变化时的处理（如果需要）
  }, []);

  // 处理 TipTap 提交
  const handleTipTapSubmit = useCallback(() => {
    handleSend();
  }, [handleSend]);

  // 处理文件引用变化
  const handleFileReferencesChange = useCallback((refs: Array<{ path: string; name: string }>) => {
    setFileReferences(refs);
  }, []);

  // AI 能力菜单点击处理
  const handleAIAbilityClick = useCallback((ability: AIAbilityType, tone?: ToneType) => {
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
    
    if (!currentSelection) {
      // 没有选中文本时提示
      tiptapInputRef.current?.setText('请先选中需要处理的文本');
      return;
    }

    let prompt = '';
    switch (ability) {
      case 'polish':
        prompt = `请润色以下文本，使其更加流畅、优美，保持原意不变：\n\n${currentSelection}`;
        break;
      case 'expand':
        prompt = `请扩写以下文本，增加更多细节和内容，使其更加丰富：\n\n${currentSelection}`;
        break;
      case 'shorten':
        prompt = `请缩短以下文本，保留核心内容，使其更加简洁：\n\n${currentSelection}`;
        break;
      case 'tone':
        if (tone) {
          const toneMap: Record<ToneType, string> = {
            professional: '更专业',
            humorous: '更幽默',
            casual: '更口语化',
            readable: '更易读',
            subtle: '更含蓄',
            academic: '更学术',
            trendy: '更网感',
            literary: '更有文采',
          };
          prompt = `请将以下文本改写为${toneMap[tone]}的语气，保持原意不变：\n\n${currentSelection}`;
        }
        break;
    }

    if (prompt) {
      tiptapInputRef.current?.setText(prompt);
      // 自动聚焦
      setTimeout(() => {
        tiptapInputRef.current?.focus();
      }, 100);
    }
  }, [currentSelection]);

  return (
    <div className="cm-inline-ai-chat">
      {/* 头部工具栏 */}
      <div className="cm-inline-ai-header">
        <div className="cm-inline-ai-header-left">
          <span className="cm-inline-ai-title">AI 助手</span>
          {currentSelection && (
            <span className="cm-inline-ai-selection-badge" title="已选中文本">
              已选中
            </span>
          )}
        </div>
        <div className="cm-inline-ai-header-right">
          <div className="cm-inline-ai-sparkles-menu">
            <span
              ref={sparklesTriggerRef}
              className="cm-inline-ai-sparkles-btn"
              onClick={toggleSparklesMenu}
              title="AI 能力"
            >
              <Icon name="sparkles" size={14} />
            </span>
            {isSparklesMenuOpen && (
              <div className="cm-inline-ai-sparkles-dropdown">
                <div
                  className="cm-inline-ai-sparkles-option"
                  onClick={() => handleAIAbilityClick('polish')}
                >
                  润色
                </div>
                <div
                  className="cm-inline-ai-sparkles-option"
                  onClick={() => handleAIAbilityClick('expand')}
                >
                  扩写
                </div>
                <div
                  className="cm-inline-ai-sparkles-option"
                  onClick={() => handleAIAbilityClick('shorten')}
                >
                  缩短
                </div>
                <div
                  className="cm-inline-ai-sparkles-option cm-inline-ai-sparkles-option-submenu"
                  onMouseEnter={() => setIsToneSubmenuOpen(true)}
                  onMouseLeave={() => setIsToneSubmenuOpen(false)}
                >
                  <span>更改语气</span>
                  <Icon name="chevron-right" size={12} />
                  {isToneSubmenuOpen && (
                    <div className="cm-inline-ai-tone-submenu">
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'professional')}
                      >
                        更专业
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'humorous')}
                      >
                        更幽默
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'casual')}
                      >
                        更口语化
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'readable')}
                      >
                        更易读
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'subtle')}
                      >
                        更含蓄
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'academic')}
                      >
                        更学术
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'trendy')}
                      >
                        更网感
                      </div>
                      <div
                        className="cm-inline-ai-sparkles-option"
                        onClick={() => handleAIAbilityClick('tone', 'literary')}
                      >
                        更有文采
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="cm-inline-ai-at-menu">
            <span
              ref={atTriggerRef}
              className="cm-inline-ai-at-trigger"
              onClick={toggleAtMenu}
              title="添加上下文"
            >
              @
            </span>
            {isAtMenuOpen && (
              <Select
                value=""
                onChange={handleAtMenuSelect}
                groups={atMenuGroups}
                placeholder="选择上下文..."
                className="cm-inline-ai-at-select"
                showSearch={true}
                open={true}
                align="right"
                headerLeftIcon={atMenuLevel === 'form' ? <Icon name="chevron-left" size={16} /> : undefined}
                onHeaderLeftClick={atMenuLevel === 'form' ? handleBackToMainMenu : undefined}
                fixedHeight={atMenuLevel === 'form' ? atMenuHeight : undefined}
                onHeightChange={atMenuLevel === 'main' ? setAtMenuHeight : undefined}
                onItemClick={(value: string) => {
                  // 分类选项、文件夹和表单展开不关闭菜单
                  if (value.startsWith('category-') || value.startsWith('folder-') || value.startsWith('form-expand-')) {
                    return false;
                  }
                  return true;
                }}
                onOpenChange={(isOpen: boolean) => {
                  if (!isOpen) {
                    setIsAtMenuOpen(false);
                    setAtMenuLevel('main');
                    setCurrentCategory('');
                    setExpandedFolders(new Set());
                    setExpandedForms(new Set());
                    setAtMenuHeight(undefined);
                  }
                }}
              />
            )}
          </div>
          <span 
            className="cm-inline-ai-close"
            onClick={onClose}
            title="关闭 (Esc)"
          >
            <Icon name="close" size={14} />
          </span>
        </div>
      </div>

      {/* 消息列表 */}
      {messages.length > 0 && (
        <div className="cm-inline-ai-messages">
          {messages.map(msg => (
            <div 
              key={msg.id} 
              className={`cm-inline-ai-message cm-inline-ai-message-${msg.role}`}
            >
              <div className="cm-inline-ai-message-content">
                {msg.content || (msg.isStreaming ? '思考中...' : '')}
                {msg.isStreaming && <span className="cm-inline-ai-cursor" />}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 输入区域 */}
      <div className="cm-inline-ai-input-area">
        <TipTapInput
          ref={tiptapInputRef}
          className="cm-inline-ai-tiptap-input"
          placeholder="向 AI 描述您想要做什么..."
          onSubmit={handleTipTapSubmit}
          onEscape={onClose}
          onChange={handleTipTapChange}
          onFileReferencesChange={handleFileReferencesChange}
          isAtMenuOpen={isAtMenuOpen}
          onAtMenuNavigate={handleAtMenuNavigate}
          onAtMenuSelect={handleAtMenuSelectHighlighted}
          onAtMenuBack={handleBackToMainMenu}
        />
        
        {/* 底部工具栏 */}
        <div className="cm-inline-ai-toolbar">
          {/* 模型选择 */}
          <div className={`cm-inline-ai-model-select ${isModelDropdownOpen ? 'open' : ''}`}>
            <span 
              ref={modelTriggerRef}
              className="cm-inline-ai-model-trigger"
              onClick={toggleModelMenu}
            >
              {getModelDisplayName(selectedModel)}
              <Icon name="chevron-down" size={12} />
            </span>
            {isModelDropdownOpen && (
              <div className={`cm-inline-ai-model-dropdown cm-inline-ai-model-dropdown-${dropdownDirection}`}>
                {availableModels.map(model => (
                  <div
                    key={model.modelId}
                    className={`cm-inline-ai-model-option ${model.modelId === selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.modelId);
                      setIsModelDropdownOpen(false);
                    }}
                  >
                    <span className="cm-inline-ai-model-name">
                      {model.displayName || model.modelId.split(':')[1]}
                    </span>
                    {model.capabilities?.thinking && (
                      <span className="cm-inline-ai-model-badge">Thinking</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="cm-inline-ai-actions">
            {messages.some(m => m.role === 'assistant' && !m.isStreaming) && (
              <span 
                className="cm-inline-ai-btn"
                onClick={handleInsertLastResponse}
                title="插入到编辑器"
              >
                <Icon name="check" size={14} />
                插入
              </span>
            )}
            {isLoading ? (
              <span 
                className="cm-inline-ai-btn cm-inline-ai-btn-stop"
                onClick={handleStop}
                title="停止生成"
              >
                <Icon name="close" size={14} />
                停止
              </span>
            ) : (
              <span 
                className={`cm-inline-ai-btn cm-inline-ai-btn-send ${!selectedModel ? 'disabled' : ''}`}
                onClick={handleSend}
                title="发送 (Enter)"
              >
                <Icon name="send" size={14} />
                发送
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
