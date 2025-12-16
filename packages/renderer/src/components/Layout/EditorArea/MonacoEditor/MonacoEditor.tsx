/**
 * Monaco 编辑器封装组件
 * 功能：集成 Monaco 编辑器和快捷键支持
 * 描述：支持代码编辑、主题切换、快捷键操作（如 Ctrl+S 保存）
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { VSCodeCommandCenter } from '../../../../command-center';
import '../../../../command-center/VSCodeCommandCenter.scss';
import { MonacoContextMenu } from '../MonacoContextMenu/MonacoContextMenu';
import { useMonacoContextMenu } from '../MonacoContextMenu/useMonacoContextMenu';
import '../MonacoContextMenu/MonacoContextMenu.scss';
import './MonacoEditor.scss';
import { AIZoneWidget } from '../AIZoneWidget/AIZoneWidget';
import { GhostTextWidget } from '../GhostTextWidget/GhostTextWidget';
import { CodeDecorationManager } from '../CodeDecorationManager/CodeDecorationManager';
import { AIRewriteWidget } from '../AIRewriteWidget/AIRewriteWidget';
import { builtinAI } from '../../../../services/BuiltinAIService';
import { snippetService } from '../../../../services/SnippetService';
import type { Snippet } from '@note-studio/shared';
import { initializeMonaco } from '../../../../hooks/useMonacoInit';
import { getCachedModels, getModelConfig } from '../../../../services/ModelCacheService';
import { aiService } from '../../../../services/ai/AIService';
import { isModelEnabled, loadModelEnabledStatesFromDB } from '../../../../services/ai';
import { ragProcessingService } from '../../../../services/RAGProcessingService';
import { toastService } from '../../../../services/ToastService';
import { estimateTokens } from '../../../../utils/tokenCounter';
import { getModelInputTokenLimit } from '../../../../utils/modelTokenLimit';
import { SelectKnowledgeBaseDialog } from '../../Sidebar/KnowledgeBase/SelectKnowledgeBaseDialog';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import { FileParser, VectorStore } from '@note-studio/global-rag';
import { ModelCapabilityDetector } from '../../../../services/modelCapabilityDetector';
import { ModelCapability } from '../../../../types/modelCapabilities';
import { DEFAULT_CHAT_SETTINGS } from '../../../AIChatSettings/AIChatSettings';
import { getAIZoneSystemPromptAsync } from '../../../../services/ai/SystemPrompt';

const MAX_INLINE_CHAT_HISTORY_MESSAGES = 12;

const formatModelDisplayName = (modelId?: string): string => {
  if (!modelId) {
    return '';
  }
  const colonIndex = modelId.indexOf(':');
  if (colonIndex > 0) {
    return modelId.substring(colonIndex + 1);
  }
  return modelId;
};

const getProviderDisplayName = (providerId: string, modelId?: string): string => {
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
  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    groq: 'Groq',
    gemini: 'Google',
    modelscope: '魔塔社区',
    zenmux: 'Zenmux',
    custom: '自定义'
  };
  return providerNames[providerId.toLowerCase()] || providerId;
};

// 全局标记：防止重复注册 jsonc 语言
let jsoncLanguageRegistered = false;

interface MonacoEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  tabId?: string;  // 当前标签页ID
  tabTitle?: string;  // 当前标签页标题
  filePath?: string;  // 当前文件路径
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language = 'markdown',
  onChange,
  tabId,
  tabTitle,
  filePath
}) => {
  const [currentTheme, setCurrentTheme] = useState<string>('__note-studio-editor-theme__');
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [pendingTheme, setPendingTheme] = useState<any>(null);
  const [isEditorReady, setIsEditorReady] = useState<boolean>(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const commandCenterRef = useRef<VSCodeCommandCenter | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // AI 功能相关
  const aiZoneWidgetRef = useRef<AIZoneWidget | null>(null);
  const ghostTextRef = useRef<GhostTextWidget | null>(null);
  const decorationManagerRef = useRef<CodeDecorationManager | null>(null);
  const currentGhostWidgetRef = useRef<GhostTextWidget | null>(null);
  const originalLineCountRef = useRef<number | null>(null); // 记录插入空行前的原始行数
  const aiRewriteWidgetRef = useRef<AIRewriteWidget | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const availableModelsRef = useRef<string[]>([]); // 用于在闭包中访问最新的 availableModels
  const [showSelectKnowledgeBaseDialog, setShowSelectKnowledgeBaseDialog] = useState(false);
  const forceApplyColorsRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null); // 用于取消 AI 请求
  
  // 颜色选择器 MutationObserver 的清理函数
  const colorPickerObserverCleanupRef = useRef<(() => void) | null>(null);

  // 调试：打印组件渲染信息
  console.log('[MonacoEditor] Rendering with:', {
    tabId,
    tabTitle,
    language,
    contentLength: value?.length || 0,
    contentPreview: value?.substring(0, 50)
  });

  // 从数据库加载模型配置列表
  useEffect(() => {
    const loadAvailableModels = async () => {
      try {
        // 首先从数据库加载模型启用状态（确保 isModelEnabled 能正确工作）
        await loadModelEnabledStatesFromDB();
        
        // 优先从数据库加载模型配置
        const cachedModels = await getCachedModels();
        
        if (cachedModels && cachedModels.length > 0) {
          // 提取模型ID列表（格式：ProviderName:modelId），并过滤掉禁用的模型
          const modelIds = cachedModels
            .filter(model => {
              // 从模型ID中提取实际的模型名称（格式：configName:modelName）
              const modelName = model.modelId.includes(':') ? model.modelId.split(':')[1] : model.modelId;
              return isModelEnabled(modelName);
            })
            .map(model => model.modelId);
          setAvailableModels(modelIds);
          availableModelsRef.current = modelIds; // 同步更新 ref
          console.log('[MonacoEditor] 从数据库加载已启用的模型，数量:', modelIds.length);
        } else {
          // 如果数据库中没有模型配置，回退到内置AI服务
          console.log('[MonacoEditor] 数据库中没有模型配置，使用内置AI服务');
          const models = await builtinAI.getModels();
          if (models.length > 0) {
            setAvailableModels(models);
            availableModelsRef.current = models; // 同步更新 ref
          } else {
            setAvailableModels([]);
            availableModelsRef.current = []; // 同步更新 ref
          }
        }
      } catch (error) {
        console.error('[MonacoEditor] 加载模型配置失败:', error);
        // 出错时回退到内置AI服务
        try {
          const models = await builtinAI.getModels();
          const modelsArray = models || [];
          setAvailableModels(modelsArray);
          availableModelsRef.current = modelsArray; // 同步更新 ref
        } catch (fallbackError) {
          console.error('[MonacoEditor] 回退到内置AI服务也失败:', fallbackError);
          setAvailableModels([]);
          availableModelsRef.current = []; // 同步更新 ref
        }
      }
    };

    loadAvailableModels();
    
    // 监听模型配置更新事件
    const handleModelConfigUpdate = async () => {
      console.log('[MonacoEditor] AI配置已更新，重新加载模型列表...');
      await loadAvailableModels();
    };
    
    // 监听模型启用状态变化事件
    const handleModelEnabledChanged = async () => {
      console.log('[MonacoEditor] 模型启用状态已变化，重新加载模型列表...');
      await loadAvailableModels();
    };
    
    // 监听模型缓存更新事件
    const handleModelsCacheUpdated = async () => {
      console.log('[MonacoEditor] 模型缓存已更新，重新加载模型列表...');
      await loadAvailableModels();
    };
    
    // 监听窗口事件（当AI配置更新时触发）
    window.addEventListener('ai-model-config-updated', handleModelConfigUpdate);
    window.addEventListener('ai-config-updated', handleModelConfigUpdate);
    window.addEventListener('model-enabled-changed', handleModelEnabledChanged);
    window.addEventListener('models-cache-updated', handleModelsCacheUpdated);
    
    return () => {
      window.removeEventListener('ai-model-config-updated', handleModelConfigUpdate);
      window.removeEventListener('ai-config-updated', handleModelConfigUpdate);
      window.removeEventListener('model-enabled-changed', handleModelEnabledChanged);
      window.removeEventListener('models-cache-updated', handleModelsCacheUpdated);
    };
  }, []);

  // 当 availableModels 变化时，更新已存在的 AIZoneWidget
  useEffect(() => {
    if (aiZoneWidgetRef.current && availableModels.length > 0) {
      console.log('[MonacoEditor] availableModels 已更新，更新 AIZoneWidget 的模型列表');
      // 更新 AIZoneWidget 的 options
      aiZoneWidgetRef.current.updateAvailableModels(availableModels);
    }
  }, [availableModels]);

  // 组件卸载时清理颜色选择器观察器
  useEffect(() => {
    return () => {
      if (colorPickerObserverCleanupRef.current) {
        colorPickerObserverCleanupRef.current();
        colorPickerObserverCleanupRef.current = null;
      }
    };
  }, []);

  /**
   * 清除之前的 diff 内容和空行
   * 这是一个通用函数，用于在重新生成或新请求时清除之前的 diff 状态
   */
  const cleanupPreviousDiff = useCallback(() => {
    // 立即清除之前的 Ghost Text Widget（如果存在）
    if (currentGhostWidgetRef.current) {
      console.log('[MonacoEditor] 清除上一次的 diff 预览（重新生成或新请求）');
      currentGhostWidgetRef.current.dispose();
      currentGhostWidgetRef.current = null;
    }
    
    // 清除之前插入的空行（无论 widget 是否存在，都要清除空行）
    // 保存上一次的原始行数，用于清除空行
    const previousOriginalLineCount = originalLineCountRef.current;
    
    // 获取当前的 zoneBottomLine，用于清除 GhostTextWidget 插入的空行
    const currentZoneBottomLine = aiZoneWidgetRef.current?.getZoneBottomLineNumber();
    
    if (editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const currentLineCount = model.getLineCount();
        
        // 策略1: 如果有记录的原始行数，使用它来清除空行
        if (previousOriginalLineCount !== null && currentLineCount > previousOriginalLineCount) {
          // 从文档末尾向前查找，找到第一个非空行
          let lastNonEmptyLine = previousOriginalLineCount;
          
          // 从最后一行向前检查到原始行数之后
          for (let lineNum = currentLineCount; lineNum > previousOriginalLineCount; lineNum--) {
            const lineContent = model.getLineContent(lineNum);
            // 如果行不为空（有非空白字符），找到最后非空行
            if (lineContent.trim().length > 0) {
              lastNonEmptyLine = lineNum;
              break;
            }
          }
          
          // 如果最后非空行小于当前行数，说明文档末尾有连续的空行需要删除
          if (lastNonEmptyLine < currentLineCount) {
            const linesToRemove = currentLineCount - lastNonEmptyLine;
            const startLine = lastNonEmptyLine + 1;
            const endLine = currentLineCount;
            
            console.log('[MonacoEditor] 清除', linesToRemove, '个空行（从第', startLine, '行到第', endLine, '行）');
            
            // 删除从 startLine 到 endLine 的所有行
            if (startLine === previousOriginalLineCount + 1) {
              // 从原始行数的末尾删除到文档末尾
              const originalLineEndColumn = model.getLineMaxColumn(previousOriginalLineCount);
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup', [{
                range: new monaco.Range(previousOriginalLineCount, originalLineEndColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            } else {
              // 从 startLine 的第1列删除到 endLine 的最后列
              const startColumn = 1;
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup', [{
                range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            }
          }
        }
        
        // 策略2: 清除从 zoneBottomLine 之后的所有连续空行（清除 GhostTextWidget 插入的空行）
        // 重新获取当前行数（因为策略1可能已经修改了文档）
        const updatedLineCount = model.getLineCount();
        if (currentZoneBottomLine !== undefined && currentZoneBottomLine > 0 && currentZoneBottomLine <= updatedLineCount) {
          // 从 zoneBottomLine 之后开始检查，找到第一个非空行
          let firstNonEmptyLineAfterZone = updatedLineCount + 1; // 初始化为超出范围的值
          
          // 从 zoneBottomLine + 1 开始向后查找，找到第一个非空行
          for (let lineNum = currentZoneBottomLine + 1; lineNum <= updatedLineCount; lineNum++) {
            // 确保行号有效（重新检查当前行数）
            const actualLineCount = model.getLineCount();
            if (lineNum < 1 || lineNum > actualLineCount) continue;
            const lineContent = model.getLineContent(lineNum);
            if (lineContent.trim().length > 0) {
              firstNonEmptyLineAfterZone = lineNum;
              break;
            }
          }
          
          // 如果从 zoneBottomLine + 1 到 firstNonEmptyLineAfterZone - 1 都是空行，清除它们
          if (firstNonEmptyLineAfterZone > currentZoneBottomLine + 1) {
            const startLine = currentZoneBottomLine + 1;
            const endLine = firstNonEmptyLineAfterZone - 1;
            const linesToRemove = endLine - startLine + 1;
            
            console.log('[MonacoEditor] 清除 GhostTextWidget 插入的', linesToRemove, '个空行（从第', startLine, '行到第', endLine, '行）');
            
            // 删除从 startLine 到 endLine 的所有行
            const startColumn = 1;
            const endLineColumn = model.getLineMaxColumn(endLine);
            
            editor.executeEdits('inline-chat-cleanup-ghost', [{
              range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
              text: '',
              forceMoveMarkers: true
            }]);
          } else if (firstNonEmptyLineAfterZone > updatedLineCount) {
            // 如果从 zoneBottomLine + 1 到文档末尾都是空行，清除它们
            const startLine = currentZoneBottomLine + 1;
            const endLine = model.getLineCount(); // 重新获取当前行数
            
            if (startLine <= endLine) {
              const linesToRemove = endLine - startLine + 1;
              
              console.log('[MonacoEditor] 清除 GhostTextWidget 插入的', linesToRemove, '个空行（从第', startLine, '行到第', endLine, '行，文档末尾）');
              
              // 删除从 startLine 到 endLine 的所有行
              const startColumn = 1;
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup-ghost', [{
                range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            }
          }
        }
        
        // 策略3: 如果没有记录的原始行数，但从文档末尾有连续空行，也尝试清除
        const finalLineCount = model.getLineCount(); // 重新获取当前行数
        if (previousOriginalLineCount === null && finalLineCount > 0) {
          // 从文档末尾向前查找，找到最后一个非空行
          let lastNonEmptyLine = finalLineCount;
          for (let lineNum = finalLineCount; lineNum >= 1; lineNum--) {
            // 确保行号有效
            if (lineNum < 1 || lineNum > model.getLineCount()) continue;
            const lineContent = model.getLineContent(lineNum);
            if (lineContent.trim().length > 0) {
              lastNonEmptyLine = lineNum;
              break;
            }
          }
          
          // 如果最后非空行小于当前行数，说明文档末尾有连续的空行需要删除
          const currentFinalLineCount = model.getLineCount();
          if (lastNonEmptyLine < currentFinalLineCount) {
            const linesToRemove = currentFinalLineCount - lastNonEmptyLine;
            const startLine = lastNonEmptyLine + 1;
            const endLine = currentFinalLineCount;
            
            // 确保行号有效
            if (startLine >= 1 && endLine >= startLine && endLine <= model.getLineCount()) {
              console.log('[MonacoEditor] 清除文档末尾', linesToRemove, '个空行（从第', startLine, '行到第', endLine, '行）');
              
              // 删除从 startLine 到 endLine 的所有行
              const startColumn = 1;
              const endLineColumn = model.getLineMaxColumn(endLine);
              
              editor.executeEdits('inline-chat-cleanup', [{
                range: new monaco.Range(startLine, startColumn, endLine, endLineColumn),
                text: '',
                forceMoveMarkers: true
              }]);
            }
          }
        }
        
        // 重置原始行数记录，以便重新生成时重新记录
        originalLineCountRef.current = null;
      }
    }
  }, []);

  // 标签页切换时，恢复对应标签页的内联聊天，并清理之前的 diff
  useEffect(() => {
    if (!tabId || !editorRef.current) {
      return;
    }

    // 清理之前标签页的 diff 内容和空行（如果存在）
    cleanupPreviousDiff();

    // 检查是否有该标签页的内联聊天实例
    const existingInstance = AIZoneWidget.getInstanceByTabId(tabId);
    if (existingInstance) {
      // 如果实例存在，直接使用（不需要重新调用 show()，因为标签页切换时，内联聊天会自动显示）
      // show() 方法会重新创建 DOM，导致闪烁
      aiZoneWidgetRef.current = existingInstance;
      
      // 当标签页切换回来时，延迟触发布局恢复，确保标签页已经完全激活
      // 使用延迟确保 React 已经完成标签页的显示/隐藏操作
      // 布局恢复由 onDidLayoutChange 中的 wasHidden 逻辑处理
      // 这里只需要确保实例被正确引用即可
    }
  }, [tabId]); // cleanupPreviousDiff 没有依赖项，引用稳定，不需要放在依赖项中

  /**
   * 初始化 diff 显示
   * 这是一个通用函数，用于创建 GhostTextWidget 并准备显示 diff 内容
   * @returns 返回包含 ghostWidget 和 zoneBottomLine 的对象
   */
  const initializeDiffDisplay = useCallback(() => {
    if (!editorRef.current) {
      console.error('[MonacoEditor] editorRef.current 为空，无法初始化 diff 显示');
      return null;
    }

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) {
      console.error('[MonacoEditor] 无法获取编辑器位置');
      return null;
    }

    // 获取 AIZoneWidget 底部边框的行号
    let zoneBottomLine = aiZoneWidgetRef.current?.getZoneBottomLineNumber() || position.lineNumber;
    
    // 确保行号有效（至少为 1）
    if (zoneBottomLine < 1) {
      console.warn('[InlineChat] zoneBottomLine 无效:', zoneBottomLine, '使用光标位置:', position.lineNumber);
      zoneBottomLine = Math.max(1, position.lineNumber);
    }
    
    console.log('[InlineChat] Zone 底部行号:', zoneBottomLine, '原始光标行号:', position.lineNumber);
    
    // 确保目标行存在，如果不存在则先插入空行
    const model = editor.getModel();
    if (model) {
      const totalLines = model.getLineCount();
      // 记录插入空行前的原始行数
      originalLineCountRef.current = totalLines;
      console.log('[InlineChat] 文档总行数:', totalLines, '目标行号:', zoneBottomLine);
      
      if (zoneBottomLine > totalLines) {
        // 在文档末尾插入空行，使目标行号有效
        const lastLine = model.getLineMaxColumn(totalLines);
        editor.executeEdits('inline-chat-prepare', [{
          range: new monaco.Range(totalLines, lastLine, totalLines, lastLine),
          text: '\n'.repeat(zoneBottomLine - totalLines),
          forceMoveMarkers: true
        }]);
        console.log('[InlineChat] 插入了', zoneBottomLine - totalLines, '个空行');
      }
    }
    
    // 再次确保清除之前的 Ghost Text Widget（如果存在，双重保险）
    if (currentGhostWidgetRef.current) {
      console.log('[InlineChat] 再次清除上一次的 diff 预览（双重保险）');
      currentGhostWidgetRef.current.dispose();
      currentGhostWidgetRef.current = null;
    }
    
    // 创建新的 Ghost Text Widget 用于显示 diff 效果（从底部边框下一行开始）
    const ghostWidget = new GhostTextWidget(editor, {
      onAccept: (text: string) => {
        console.log('[InlineChat] 用户接受了代码:', text.substring(0, 50));
        // 代码已经被插入，清理 widget
        ghostWidget.dispose();
        currentGhostWidgetRef.current = null;
        // 用户接受了代码，重置原始行数记录（因为代码已经被插入，不需要清除）
        originalLineCountRef.current = null;
      },
      onReject: () => {
        console.log('[InlineChat] 用户拒绝了代码');
        ghostWidget.dispose();
        currentGhostWidgetRef.current = null;
        // 用户拒绝了代码，保持原始行数记录，以便在关闭时清除空行
      }
    });
    
    // 保存到 ref 中
    currentGhostWidgetRef.current = ghostWidget;
    
    return {
      ghostWidget,
      zoneBottomLine
    };
  }, []);

  // 处理内联聊天消息发送
  const handleSendInlineChatMessage = useCallback(async (
    message: string, 
    includeSelection: boolean, 
    selectedModel?: string
  ) => {
    // 清除之前的 diff 内容和空行
    cleanupPreviousDiff();
    
    console.log('[MonacoEditor] handleSendInlineChatMessage 被调用, message:', message, 'selectedModel:', selectedModel);
    if (!editorRef.current) {
      console.error('[MonacoEditor] editorRef.current 为空，无法发送消息');
      return;
    }

    // 如果已有正在进行的请求，先取消它
    if (abortControllerRef.current) {
      console.log('[MonacoEditor] 取消之前的请求');
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) return;

    // 规范化用户输入，移除 @file 引用占位符
    let sanitizedMessage = message.replace(/@file:[^\s]+/g, '').trim();
    

    // 检测 @知识库 语法（支持 @知识库名称 或 @知识库ID）
    const knowledgeBaseMentions: Array<{ id: string; name: string; mention: string }> = [];
    
    // 首先，从工具栏选择的知识库中获取（优先级最高）
    if (aiZoneWidgetRef.current) {
      const selectedFiles = aiZoneWidgetRef.current.getSelectedFiles();
      const knowledgeBaseItems = selectedFiles.filter(file => file.type === 'knowledge-base' && file.kbId);
      
      for (const item of knowledgeBaseItems) {
        if (item.kbId) {
          try {
            const kb = await knowledgeBaseService.findItem(item.kbId);
            if (kb && kb.type === 'folder') {
              // 检查是否已经添加过（避免重复）
              if (!knowledgeBaseMentions.find(kb => kb.id === item.kbId)) {
                knowledgeBaseMentions.push({
                  id: kb.id,
                  name: kb.title,
                  mention: `@${kb.title}`
                });
                console.log(`[InlineChat] 从工具栏检测到知识库: ${kb.title} (${kb.id})`);
              }
            }
          } catch (error) {
            console.warn(`[InlineChat] 从工具栏获取知识库失败: ${item.kbId}`, error);
          }
        }
      }
    }
    
    // 然后，从输入框文本中检测 @知识库 引用
    const knowledgeBaseMentionRegex = /@([^\s@]+)/g;
    let match: RegExpExecArray | null;
    
    while ((match = knowledgeBaseMentionRegex.exec(message)) !== null) {
      const mention = match[1];
      // 跳过 @file: 格式
      if (mention.startsWith('file:')) {
        continue;
      }
      
      // 尝试通过名称或ID查找知识库
      try {
        const knowledgeBases = await knowledgeBaseService.loadFromStorage();
        let foundKnowledgeBase: { id: string; name: string } | null = null;
        
        // 先尝试通过ID查找（如果mention是ID格式，如 kb_xxx）
        if (mention.startsWith('kb_')) {
          const kb = await knowledgeBaseService.findItem(mention);
          if (kb && kb.type === 'folder') {
            foundKnowledgeBase = { id: kb.id, name: kb.title };
          }
        }
        
        // 如果没找到，尝试通过名称查找
        if (!foundKnowledgeBase) {
          for (const kb of knowledgeBases.created) {
            if (kb.type === 'folder' && (kb.title === mention || kb.id === mention)) {
              foundKnowledgeBase = { id: kb.id, name: kb.title };
              break;
            }
          }
        }
        
        if (foundKnowledgeBase) {
          // 检查是否已经添加过（避免重复）
          if (!knowledgeBaseMentions.find(kb => kb.id === foundKnowledgeBase!.id)) {
            knowledgeBaseMentions.push({
              id: foundKnowledgeBase.id,
              name: foundKnowledgeBase.name,
              mention: `@${mention}`
            });
            console.log(`[InlineChat] 从输入框文本检测到知识库: ${foundKnowledgeBase.name} (${foundKnowledgeBase.id})`);
          }
        }
      } catch (error) {
        console.warn(`[InlineChat] 查找知识库失败: ${mention}`, error);
      }
    }

    // 移除 @知识库 引用占位符（只移除完整的 @mention 格式，保留其他内容）
    knowledgeBaseMentions.forEach(({ mention }) => {
      // 使用单词边界确保只匹配完整的 @mention
      const escapedMention = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sanitizedMessage = sanitizedMessage.replace(new RegExp(`\\s*${escapedMention}\\s*`, 'g'), ' ').trim();
    });

    // 获取选中的文本（如果需要包含）
    let selectedText = '';
    if (includeSelection) {
      // 优先从 AIZoneWidget 获取选中文本（因为可能已经清除了编辑器中的选中状态）
      if (aiZoneWidgetRef.current) {
        const widgetSelectedText = (aiZoneWidgetRef.current as any).selectedText;
        if (widgetSelectedText) {
          selectedText = widgetSelectedText;
          console.log('[MonacoEditor] 从 AIZoneWidget 获取选中文本:', selectedText);
        }
      }
      
      // 如果 AIZoneWidget 中没有，尝试从编辑器获取
      if (!selectedText) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
          selectedText = editor.getModel()?.getValueInRange(selection) || '';
          console.log('[MonacoEditor] 从编辑器获取选中文本:', selectedText);
        }
      }
    }

    try {
      // 使用选中的模型或默认模型
      const modelToUse = selectedModel || availableModels[0] || 'OpenAI:gpt-4o';
      
      console.log('[InlineChat] 发送消息到模型:', modelToUse);

      // 获取模型配置
      const modelConfig = await getModelConfig(modelToUse);
      if (!modelConfig) {
        throw new Error(`未找到模型配置：${modelToUse}`);
      }

      console.log('[InlineChat] 使用配置:', modelConfig.configName);

      // 提取实际的模型ID（去掉提供商前缀）
      const [providerId, actualModelId] = modelToUse.split(':');
      
      console.log('[InlineChat] 提供商:', providerId, '模型:', actualModelId);

      // 获取模型的输入token限制
      const modelInputTokenLimit = getModelInputTokenLimit(providerId, actualModelId);
      console.log('[InlineChat] 模型输入token限制:', modelInputTokenLimit);

      // 1. 文件向量检索：获取文件工具栏的所有文件，进行向量搜索
      let ragChunks: Array<{ text: string; embedding: number[]; metadata: { filePath: string; fileName: string; chunkIndex: number; totalChunks: number } }> = [];
      let fileContents: Array<{ path: string; name: string; content: string }> = [];
      // 文件向量搜索结果
      let fileVectorSearchResults: Array<{
        filePath: string;
        fileName: string;
        results: Array<{
          id: string;
          text: string;
          metadata: Record<string, unknown>;
          score: number;
        }>;
      }> = [];
      
      if (aiZoneWidgetRef.current) {
        const selectedFiles = aiZoneWidgetRef.current.getSelectedFiles();
        console.log('[InlineChat] getSelectedFiles() 返回:', selectedFiles);
        
        // 过滤出文件类型的项（排除知识库）
        const fileItems = selectedFiles.filter(file => !file.type || file.type === 'file');
        console.log('[InlineChat] 过滤后的文件项:', fileItems);
        
        if (fileItems.length > 0) {
          console.log(`[InlineChat] 开始对 ${fileItems.length} 个文件进行向量搜索`);
          
          try {
            // 初始化嵌入服务
            const { EmbeddingService } = await import('@note-studio/shared');
            const embeddingService = new EmbeddingService();
            
            // 生成查询向量
            const query = sanitizedMessage.trim() || '请基于文件内容回答问题';
            const queryEmbedding = await embeddingService.generateEmbedding(query);
            console.log('[InlineChat] 查询向量生成完成');
            
            // 对每个文件进行向量搜索
            for (const file of fileItems) {
              try {
                console.log(`[InlineChat] 搜索文件: ${file.name} (${file.path})`);
                
                // 调用主进程的向量搜索 API
                const searchResults = await window.electronAPI?.workspaceIndexDb?.searchByFilePath?.(
                  file.path,
                  queryEmbedding.vectors,
                  5 // topK: 每个文件返回前5个相关父块
                );
                
                if (searchResults && searchResults.length > 0) {
                  fileVectorSearchResults.push({
                    filePath: file.path,
                    fileName: file.name,
                    results: searchResults
                  });
                  console.log(`[InlineChat] 文件 "${file.name}" 搜索到 ${searchResults.length} 个相关片段`);
                } else {
                  console.log(`[InlineChat] 文件 "${file.name}" 未找到相关片段，尝试读取全文`);
                  // 如果向量搜索没有结果，回退到读取全文（可能文件未被索引）
                  const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
                  if (content) {
                    fileContents.push({
                      path: file.path,
                      name: file.name,
                      content: content
                    });
                  }
                }
              } catch (error) {
                console.warn(`[InlineChat] 搜索文件失败: ${file.path}`, error);
                // 搜索失败时回退到读取全文
                try {
                  const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
                  if (content) {
                    fileContents.push({
                      path: file.path,
                      name: file.name,
                      content: content
                    });
                  }
                } catch (readError) {
                  console.warn(`[InlineChat] 读取文件也失败: ${file.path}`, readError);
                }
              }
            }
            
            console.log(`[InlineChat] 文件向量搜索完成: ${fileVectorSearchResults.length} 个文件有结果, ${fileContents.length} 个文件回退到全文`);
          } catch (error) {
            console.error('[InlineChat] 文件向量搜索失败，回退到读取全文:', error);
            // 向量搜索整体失败时，回退到读取所有文件全文
            for (const file of fileItems) {
              try {
                const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
                if (content) {
                  fileContents.push({
                    path: file.path,
                    name: file.name,
                    content: content
                  });
                }
              } catch (readError) {
                console.warn(`[InlineChat] 读取文件失败: ${file.path}`, readError);
              }
            }
          }
        }
      }

      // 设置AI Provider
      await aiService.setProvider(modelConfig.providerId, {
        id: modelConfig.id || 'default',
        name: modelConfig.name || modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        modelId: actualModelId
      });

      // 步骤2：向量检索 - 对每个知识库进行向量搜索
      let vectorSearchResults: Array<{
        knowledgeBaseId: string;
        knowledgeBaseName: string;
        results: Array<{
          id: string;
          text: string;
          metadata: {
            filePath?: string;
            fileName?: string;
            fileType?: string;
            chunkIndex?: number;
            totalChunks?: number;
            [key: string]: unknown;
          };
          score: number;
        }>;
      }> = [];

      if (knowledgeBaseMentions.length > 0) {
        console.log(`[InlineChat] 检测到知识库引用: ${knowledgeBaseMentions.map(kb => kb.name).join(', ')}`);
        console.log(`[InlineChat] 开始向量检索...`);

        try {
          // 初始化 VectorStore 和 EmbeddingService
          const vectorStore = new VectorStore();
          await vectorStore.initialize();
          
          const { EmbeddingService } = await import('@note-studio/shared');
          const embeddingService = new EmbeddingService();

          // 并行检索所有知识库
          const searchPromises = knowledgeBaseMentions.map(async (kb) => {
            try {
              // 获取知识库配置
              const kbItem = await knowledgeBaseService.findItem(kb.id);
              if (!kbItem || kbItem.type !== 'folder') {
                console.warn(`[InlineChat] 知识库不存在或类型不正确: ${kb.id}`);
                return null;
              }

              console.log(`[InlineChat] 使用内置嵌入模型 (知识库: ${kb.name})`);

              // 执行向量检索
              // 使用 sanitizedMessage 作为查询（已移除知识库引用）
              const query = sanitizedMessage.trim() || '请基于知识库内容回答问题';
              
              // 生成查询向量
              const queryEmbedding = await embeddingService.generateEmbedding(query);
              
              // 搜索向量存储
              const results = await vectorStore.search(query, queryEmbedding.vectors, {
                topK: 5, // 每个知识库返回前5个结果
                filterMetadata: {
                  knowledgeBaseId: kb.id, // 过滤条件：只检索该知识库的内容
                },
              });

              console.log(`[InlineChat] 知识库 "${kb.name}" 检索到 ${results.length} 个结果`);

              return {
                knowledgeBaseId: kb.id,
                knowledgeBaseName: kb.name,
                results: results,
              };
            } catch (error) {
              console.error(`[InlineChat] 检索知识库 "${kb.name}" 失败:`, error);
              // 返回空结果，不中断其他知识库的检索
              return {
                knowledgeBaseId: kb.id,
                knowledgeBaseName: kb.name,
                results: [],
              };
            }
          });

          // 等待所有检索完成
          const searchResults = await Promise.all(searchPromises);
          vectorSearchResults = searchResults.filter((result): result is NonNullable<typeof result> => result !== null);

          console.log(`[InlineChat] 向量检索完成，共检索 ${vectorSearchResults.length} 个知识库`);

          // 关闭 VectorStore
          await vectorStore.close();
        } catch (error) {
          console.error('[InlineChat] 向量检索失败:', error);
          // 继续执行，不使用检索结果
          vectorSearchResults = [];
        }
      }

      // 检查是否是模型判断问题（在构建 prompt 之前检查）
      const isModelQuestion = /(你是什么|你是谁|你是什么模型|你是什么AI|你是什么助手|你是什么技术|你是什么系统|你是什么工具|你是什么软件|你是什么程序|你是什么应用|你是什么平台|你是什么服务|你是什么产品|你是什么品牌|你是什么公司|你是什么组织|你是什么团队|你是什么开发者|你是什么作者|你是什么创建者|你是什么制造者|你是什么设计者|你是什么程序员|你是什么工程师|你是什么科学家|你是什么研究员|你是什么专家|你是什么顾问|你是什么助理|你是什么秘书|你是什么帮手|你是什么伙伴|你是什么朋友|你是什么同事|你是什么搭档|你是什么合作者|你是什么协作者|你是什么团队成员|是谁|什么模型|什么AI|什么助手)/i.test(sanitizedMessage);

      if (isModelQuestion) {
        // 特殊回答逻辑 - 必须使用指定的答案
        const specialAnswer = `我是基于claude-4.5-sonnet-thinking模型的AI助手，在Cursor IDE中为您提供支持。我能够在Cursor IDE中为您提供全方位的支持。不论是编程疑难解答、代码优化建议、技术知识讲解，还是日常开发中的各种任务，我都可以为您提供高效、专业的帮助。无论您遇到什么问题，都可以随时向我提问，我会尽力为您提供最优的解决方案，助力您的开发之路更加顺畅！`;
        
        // 显示特殊回答
        if (aiZoneWidgetRef.current) {
          aiZoneWidgetRef.current.appendMessage('assistant', specialAnswer);
        }
        return;
      }

      // 准备聊天历史：引用内联面板中的多轮对话
      const existingHistory = aiZoneWidgetRef.current?.getChatHistory() ?? [];
      const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = existingHistory.map((historyMessage) => ({
        role: historyMessage.role,
        content: historyMessage.content
      }));

      // 构建用户消息内容
      // 格式：参考文档：\n...\n用户问题：xxxx
      let referenceDocuments = '';
      let documentIndex = 1;

      // 步骤3：添加向量检索结果到参考文档
      if (vectorSearchResults.length > 0) {
        const hasResults = vectorSearchResults.some(kb => kb.results.length > 0);
        
        if (hasResults) {
          // 计算检索结果的最大 token 数（预留空间给其他内容）
          const reservedTokens = 4000;
          const maxSearchResultTokens = Math.max(2000, modelInputTokenLimit - reservedTokens);
          let currentSearchResultTokens = 0;

          // 遍历每个知识库的检索结果
          for (const kbResult of vectorSearchResults) {
            if (kbResult.results.length === 0) {
              continue;
            }

            // 按相似度分数排序（从高到低）
            const sortedResults = [...kbResult.results].sort((a, b) => b.score - a.score);

            // 添加每个检索结果
            for (const result of sortedResults) {
              const fileName = result.metadata.fileName || result.metadata.filePath || '未知文件';
              
              // 格式：[文档 N] 文件名\n内容
              const docContent = `[文档 ${documentIndex}] ${fileName}\n${result.text}\n`;
              const docTokens = estimateTokens(docContent);

              if (currentSearchResultTokens + docTokens > maxSearchResultTokens) {
                console.warn(`[InlineChat] 检索结果 token 数已达限制，停止添加更多结果`);
                break;
              }

              referenceDocuments += docContent + '\n';
              currentSearchResultTokens += docTokens;
              documentIndex++;
            }
          }

          console.log(`[InlineChat] 检索结果 token 数: ${currentSearchResultTokens}/${maxSearchResultTokens}`);
        } else {
          console.warn('[InlineChat] 所有知识库的检索结果为空');
        }
      }

      // 步骤4：添加文件向量搜索结果到参考文档
      if (fileVectorSearchResults.length > 0) {
        console.log(`[InlineChat] 添加 ${fileVectorSearchResults.length} 个文件的向量搜索结果`);
        
        // 计算文件搜索结果的最大 token 数
        const reservedTokens = 4000;
        const maxFileSearchTokens = Math.max(2000, modelInputTokenLimit - reservedTokens);
        let currentFileSearchTokens = 0;
        
        for (const fileResult of fileVectorSearchResults) {
          if (fileResult.results.length === 0) continue;
          
          // 按相似度分数排序（从高到低）
          const sortedResults = [...fileResult.results].sort((a, b) => b.score - a.score);
          
          for (const result of sortedResults) {
            // 格式：[文档 N] 文件名\n内容
            const docContent = `[文档 ${documentIndex}] ${fileResult.fileName}\n${result.text}\n`;
            const docTokens = estimateTokens(docContent);
            
            if (currentFileSearchTokens + docTokens > maxFileSearchTokens) {
              console.warn(`[InlineChat] 文件搜索结果 token 数已达限制，停止添加更多结果`);
              break;
            }
            
            referenceDocuments += docContent + '\n';
            currentFileSearchTokens += docTokens;
            documentIndex++;
          }
        }
        
        console.log(`[InlineChat] 文件搜索结果 token 数: ${currentFileSearchTokens}/${maxFileSearchTokens}`);
      }

      // 添加文件内容到参考文档（回退方案：未被索引的文件）
      if (ragChunks.length > 0) {
        const chunksByFile = ragChunks.reduce<Record<string, Array<typeof ragChunks[number]>>>((acc, chunk) => {
          const fileKey = chunk.metadata.filePath || chunk.metadata.fileName;
          if (!acc[fileKey]) {
            acc[fileKey] = [];
          }
          acc[fileKey].push(chunk);
          return acc;
        }, {});

        Object.values(chunksByFile).forEach((chunks) => {
          if (chunks.length === 0) {
            return;
          }
          const [{ metadata }] = chunks;
          const chunkTexts = chunks
            .map((chunk) => chunk.text)
            .join('\n\n');

          referenceDocuments += `[文档 ${documentIndex}] ${metadata.fileName}\n${chunkTexts}\n\n`;
          documentIndex++;
        });
      } else if (fileContents.length > 0) {
        // 直接使用文件内容（回退方案：向量搜索失败或文件未被索引）
        console.log(`[InlineChat] 使用 ${fileContents.length} 个文件的全文内容（回退方案）`);
        fileContents.forEach((file) => {
          referenceDocuments += `[文档 ${documentIndex}] ${file.name}\n${file.content}\n\n`;
          documentIndex++;
        });
      }

      // 添加选中的文本到参考文档
      if (selectedText) {
        referenceDocuments += `[文档 ${documentIndex}] 选中代码 (${language})\n\`\`\`${language}\n${selectedText}\n\`\`\`\n\n`;
        documentIndex++;
      }

      // 构建最终的用户消息
      let finalPrompt = '';
      
      if (referenceDocuments.trim()) {
        // 有参考文档时，使用 RAG 格式
        const userQuery = sanitizedMessage.trim() || '请基于上述文档内容回答问题。';
        finalPrompt = `这是你需要参考的知识库片段：\n######################\n${referenceDocuments.trim()}\n######################\n\n用户的提问是："${userQuery}"\n\n请根据以上文档回答用户的问题。`;
      } else {
        // 没有参考文档时，直接使用用户问题
        finalPrompt = sanitizedMessage.trim();
      }

      // 将完整的 prompt 与历史整合，确保最后一条用户消息为当前问题
      if (finalPrompt.trim()) {
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
          chatHistory[chatHistory.length - 1] = {
            role: 'user',
            content: finalPrompt
          };
        } else {
          chatHistory.push({
            role: 'user',
            content: finalPrompt
          });
        }
      }

      const modelDisplayName = modelConfig.displayName || formatModelDisplayName(modelToUse);
      const providerDisplayName = getProviderDisplayName(providerId, actualModelId);
      
      // 判断是否有 RAG 上下文（@文件引用、知识库引用、向量检索结果、参考文档）
      const hasRagContext = vectorSearchResults.length > 0 || 
                            fileContents.length > 0 || 
                            ragChunks.length > 0 || 
                            knowledgeBaseMentions.length > 0 ||
                            referenceDocuments.trim().length > 0;
      
      console.log('[InlineChat] RAG 上下文检测:', {
        vectorSearchResults: vectorSearchResults.length,
        fileContents: fileContents.length,
        ragChunks: ragChunks.length,
        knowledgeBaseMentions: knowledgeBaseMentions.length,
        referenceDocuments: referenceDocuments.trim().length > 0,
        hasRagContext
      });
      
      // 根据是否有 RAG 上下文选择不同的 System Prompt（从 AI-Zone.md 文件动态加载）
      const systemMessage = await getAIZoneSystemPromptAsync(hasRagContext, modelDisplayName, providerDisplayName);

      const trimmedHistory = chatHistory.length > MAX_INLINE_CHAT_HISTORY_MESSAGES
        ? chatHistory.slice(chatHistory.length - MAX_INLINE_CHAT_HISTORY_MESSAGES)
        : chatHistory;

      const requestMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: systemMessage },
        ...trimmedHistory
      ];

      // 输出最终构建的 Prompt 消息与 token 统计
      try {
        const messagesTokenSum = requestMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
        console.log('[InlineChat] ========== 发送给大模型的提示词 ==========');
        console.log('[InlineChat] 消息数量:', requestMessages.length);
        requestMessages.forEach((msg, index) => {
          console.log(`[InlineChat] 消息 ${index + 1} (${msg.role}):`);
          console.log(`[InlineChat] ${msg.content}`);
          console.log(`[InlineChat] Token 预估: ${estimateTokens(msg.content)}`);
          console.log(`[InlineChat] ---`);
        });
        console.log(`[InlineChat] 总 Token 预估: ${messagesTokenSum}`);
        console.log('[InlineChat] ============================================');
        // 同时输出 JSON 格式以便调试
        console.log('[InlineChat] JSON 格式:', JSON.stringify(requestMessages, null, 2));
      } catch (e) {
        console.warn('[InlineChat] 序列化 Prompt 或 token 统计失败:', e);
      }

      let accumulatedCode = '';
      let isFirstChunk = true;
      
      // 使用封装的函数初始化 diff 显示
      const diffDisplay = initializeDiffDisplay();
      if (!diffDisplay) {
        console.error('[MonacoEditor] 初始化 diff 显示失败');
        return;
      }
      
      const { ghostWidget, zoneBottomLine } = diffDisplay;
      
      // 获取深度思考状态
      const isDeepThinkingEnabled = aiZoneWidgetRef.current?.getDeepThinkingEnabled() ?? true;
      
      // 检测模型是否支持深度思考
      let shouldShowThinking = isDeepThinkingEnabled;
      if (isDeepThinkingEnabled) {
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
        
        console.log('[InlineChat] 深度思考状态:', {
          enabled: isDeepThinkingEnabled,
          supportsReasoning,
          shouldShowThinking
        });
        
        // 如果检测到模型不支持推理，记录警告
        if (isDeepThinkingEnabled && !supportsReasoning) {
          console.log('[InlineChat] ⚠️ 模型不支持深度思考，将使用普通模式');
        }
      }
      
      // 使用 aiService 的流式API
      await aiService.generateTextStream({
        model: actualModelId,
        messages: requestMessages,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        reasoning: shouldShowThinking ? { 
          enabled: true,
          thinkingBudget: DEFAULT_CHAT_SETTINGS.thinkingBudget // 使用默认思考预算
        } : undefined,
        signal: abortController.signal // 传递 AbortSignal 以支持取消
      }, {
        onContent: (chunk: string) => {
          // 检查是否已被取消
          if (abortController.signal.aborted) {
            return;
          }

          // 收到第一个 chunk 时，通知 AIZoneWidget 显示用户问题
          if (isFirstChunk) {
            isFirstChunk = false;
            aiZoneWidgetRef.current?.onAIResponseStart();
          }

          // 累积代码
          accumulatedCode += chunk;
          
          // 实时更新 Ghost Text 显示 diff 效果（从底部边框下一行开始）
          ghostWidget.updateTextAtLine(accumulatedCode, zoneBottomLine);
        },
        onReasoning: (reasoning: string) => {
          // 检查是否已被取消
          if (abortController.signal.aborted) {
            return;
          }
          // 内联聊天不显示推理过程，只记录日志
          console.log('[InlineChat] 推理片段:', reasoning.substring(0, 100));
        }
      });

      // 检查是否已被取消，如果已取消则不执行完成处理
      if (abortController.signal.aborted) {
        console.log('[InlineChat] 检测到请求已被取消，跳过完成处理');
        return;
      }

      console.log('[InlineChat] AI 响应完成');

      // 将助手回复写入历史，便于后续多轮对话引用
      if (aiZoneWidgetRef.current) {
        const MAX_ASSISTANT_HISTORY_LENGTH = 4000;
        let assistantHistoryMessage = accumulatedCode.trim();

        if (!assistantHistoryMessage) {
          assistantHistoryMessage = 'AI 已完成本次代码修改。';
        } else if (assistantHistoryMessage.length > MAX_ASSISTANT_HISTORY_LENGTH) {
          assistantHistoryMessage = `${assistantHistoryMessage.slice(0, MAX_ASSISTANT_HISTORY_LENGTH)}\n...（内容已截断以控制上下文长度）`;
        }

        aiZoneWidgetRef.current.appendMessage('assistant', assistantHistoryMessage);
      }
      
      // 再次检查是否已被取消（可能在 appendMessage 过程中被取消）
      if (abortController.signal.aborted) {
        console.log('[InlineChat] 检测到请求已被取消，跳过完成处理');
        return;
      }
      
      // 通知 AIZoneWidget 回复完成
      aiZoneWidgetRef.current?.onAIResponseComplete();
    } catch (error) {
      // 如果是取消操作，不显示错误信息
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[InlineChat] 请求已被用户取消');
        // 清理 AbortController
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        return;
      }

      console.error('[InlineChat] 调用 AI 服务失败:', error);
      
      // 停止生成状态（不替换提问内容，错误信息将在 diff 区域显示）
      if (aiZoneWidgetRef.current) {
        // 手动停止生成，但不调用 stopGeneration（因为那会标记为取消）
        const widget = aiZoneWidgetRef.current as any;
        widget.isGenerating = false;
        widget.updateSendButton();
        widget.hideThinkingState();
        
        // 恢复底部工具栏
        if (widget.bottomToolbar) {
          widget.bottomToolbar.style.display = 'flex';
        }
        // 更新工具栏显示（隐藏取消工具栏，恢复为文件工具栏或隐藏）
        if (widget.updateSelectedFilesToolbar) {
          widget.updateSelectedFilesToolbar();
        }
      }
      
      // 在 diff 区域（ghost text widget）显示错误信息，而不是替换提问内容
      if (editorRef.current && aiZoneWidgetRef.current) {
        const editor = editorRef.current;
        const zoneBottomLine = aiZoneWidgetRef.current.getZoneBottomLineNumber();
        
        // 格式化错误信息
        let errorMessage = `调用 AI 服务失败\n\n`;
        if (error instanceof Error) {
          // 尝试解析错误消息，提取更友好的信息
          let errorDetail = error.message;
          
          // 如果是 RateLimitError，尝试提取更友好的消息
          if (error.name === 'RateLimitError' || error.message.includes('RateLimitError')) {
            try {
              // 尝试从错误消息中提取 JSON 格式的错误详情
              const jsonMatch = error.message.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const errorData = JSON.parse(jsonMatch[0]);
                if (errorData.errors && errorData.errors.message) {
                  errorDetail = errorData.errors.message;
                } else if (errorData.message) {
                  errorDetail = errorData.message;
                }
              }
            } catch (e) {
              // 如果解析失败，使用原始消息
            }
            
            // 如果是配额限制错误，添加更友好的提示
            if (errorDetail.includes('quota') || errorDetail.includes('配额') || errorDetail.includes('exceeded')) {
              errorMessage = `⚠️ API 配额已用完\n\n${errorDetail}\n\n建议：\n• 明天再试\n• 或切换到其他模型`;
            } else {
              errorMessage = `⚠️ 请求频率限制\n\n${errorDetail}`;
            }
          } else {
            errorMessage += `错误: ${errorDetail}`;
            if (error.name && error.name !== 'Error') {
              errorMessage += `\n\n类型: ${error.name}`;
            }
          }
        } else {
          errorMessage += `错误: ${String(error)}`;
        }
        
        // 如果已有 ghost widget，先清除它
        if (currentGhostWidgetRef.current) {
          currentGhostWidgetRef.current.dispose();
          currentGhostWidgetRef.current = null;
        }
        
        // 创建新的 ghost text widget 显示错误信息
        const errorGhostWidget = new GhostTextWidget(editor, {
          onReject: () => {
            errorGhostWidget.dispose();
            if (currentGhostWidgetRef.current === errorGhostWidget) {
              currentGhostWidgetRef.current = null;
            }
          }
        });
        
        const errorPosition: monaco.IPosition = {
          lineNumber: zoneBottomLine,
          column: 1
        };
        errorGhostWidget.show(errorPosition, errorMessage);
        currentGhostWidgetRef.current = errorGhostWidget;
      }
    } finally {
      // 清理 AbortController（如果这是当前的请求）
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [tabId, tabTitle, language, availableModels]);

  // 打开内联聊天
  const handleOpenInlineChat = useCallback((skipRecreate: boolean = false) => {
    console.log('[MonacoEditor] ========== handleOpenInlineChat 被调用 ==========');
    console.log('[MonacoEditor] skipRecreate:', skipRecreate);
    console.log('[MonacoEditor] editorRef.current:', editorRef.current);
    
    if (!editorRef.current) {
      console.warn('[MonacoEditor] editorRef.current 不存在，返回');
      return;
    }

    const editor = editorRef.current;
    const selection = editor.getSelection();
    const position = editor.getPosition();
    console.log('[MonacoEditor] selection:', selection, 'position:', position);

    if (!position) {
      console.warn('[MonacoEditor] position 不存在，返回');
      return;
    }

    // 获取选中的文本（如果有）
    const selectedText = selection && !selection.isEmpty() 
      ? editor.getModel()?.getValueInRange(selection) 
      : undefined;

    // 计算内联聊天显示的行号：如果有选中内容，显示在选中内容的下方（结束行号的下一行）
    let targetLineNumber: number;
    if (selection && !selection.isEmpty()) {
      // 有选中内容，显示在选中内容的下方（结束行号的下一行）
      const model = editor.getModel();
      const totalLines = model ? model.getLineCount() : 1;
      // 显示在选中内容的下一行，而不是选中内容的最后一行
      targetLineNumber = Math.min(totalLines, selection.endLineNumber + 1);
      console.log('[MonacoEditor] 有选中内容，内联聊天显示在选中内容下方:', {
        selectionStartLine: selection.startLineNumber,
        selectionEndLine: selection.endLineNumber,
        targetLineNumber,
        totalLines
      });
    } else {
      // 没有选中内容，显示在当前光标位置
      targetLineNumber = position.lineNumber;
      console.log('[MonacoEditor] 没有选中内容，内联聊天显示在当前光标位置:', targetLineNumber);
    }

    // 如果已存在 Zone Widget 且不需要重新创建，直接返回
    if (aiZoneWidgetRef.current && skipRecreate) {
      return;
    }

    // 如果已存在该标签页的 Zone Widget，检查是否需要重新创建
    if (tabId) {
      const existingInstance = AIZoneWidget.getInstanceByTabId(tabId);
      if (existingInstance && existingInstance.isVisible()) {
        // 检查模型下拉框是否存在
        const dropdownContainer = existingInstance.getDomNode()?.querySelector('.ai-zone-input-model-dropdown');
        const shouldHaveDropdown = availableModels && availableModels.length > 0;
        const isMissingDropdown = shouldHaveDropdown && !dropdownContainer;
        
        // 如果已存在且可见，且不需要重新创建，且模型下拉框存在，直接返回
        if (skipRecreate && !isMissingDropdown) {
          aiZoneWidgetRef.current = existingInstance;
          return;
        }
        // 否则先销毁旧实例（包括模型下拉框缺失的情况）
        // 销毁前先清除改写操作的高亮装饰
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        existingInstance.dispose();
      }
    }

    // 如果已存在 Zone Widget（可能是其他标签页的），保存当前输入内容后再销毁
    let existingInputValue = '';
    if (aiZoneWidgetRef.current) {
      const inputElement = aiZoneWidgetRef.current.getInputElement();
      if (inputElement) {
        existingInputValue = inputElement.value.trim();
      }
      // 只有当前实例不是当前标签页的实例时，才销毁
      if (!tabId || aiZoneWidgetRef.current.getTabId() !== tabId) {
        // 销毁前先清除改写操作的高亮装饰
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        aiZoneWidgetRef.current.dispose();
      }
      aiZoneWidgetRef.current = null;
    }

    // 创建新的 Zone Widget，传入 tabId
    // 优先使用 availableModelsRef.current，确保使用最新的值
    const modelsToUse = availableModelsRef.current.length > 0 ? availableModelsRef.current : availableModels;
    console.log('[MonacoEditor] 创建 AIZoneWidget', {
      availableModelsCount: availableModels?.length || 0,
      availableModelsRefCount: availableModelsRef.current?.length || 0,
      modelsToUseCount: modelsToUse?.length || 0,
      availableModels: availableModels,
      availableModelsRef: availableModelsRef.current,
      modelsToUse: modelsToUse
    });
    aiZoneWidgetRef.current = new AIZoneWidget(editor, {
      availableModels: modelsToUse,
      onSubmit: (message: string, includeSelection: boolean, selectedModel?: string) => {
        handleSendInlineChatMessage(message, includeSelection, selectedModel);
      },
      onStop: () => {
        // 取消当前的 AI 请求
        if (abortControllerRef.current) {
          console.log('[MonacoEditor] 用户点击取消，正在取消请求...');
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      },
      onAccept: () => {
        // 接受 AI 生成的 diff 内容
        console.log('[MonacoEditor] 用户点击接受，开始应用 diff 内容');
        
        if (currentGhostWidgetRef.current) {
          // 调用 GhostTextWidget 的公共方法来接受内容
          currentGhostWidgetRef.current.acceptGhostText();
          currentGhostWidgetRef.current = null;
          
          // 重置原始行数记录（因为内容已被接受，不需要清除空行）
          originalLineCountRef.current = null;
          
          console.log('[MonacoEditor] diff 内容已应用');
        } else {
          console.warn('[MonacoEditor] 没有可接受的 diff 内容');
        }
      },
      onClose: () => {
        console.log('[MonacoEditor] 内联聊天关闭，开始清理 diff 和空行');
        
        // 关闭时也取消正在进行的请求
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        
        // 清除改写操作的高亮装饰
        if (aiRewriteWidgetRef.current) {
          aiRewriteWidgetRef.current.clearRewriteHighlight();
        }
        
        // 使用统一的清理函数清除 diff 内容和空行
        cleanupPreviousDiff();
        
        // 清理 AI Zone Widget
        if (aiZoneWidgetRef.current) {
          aiZoneWidgetRef.current.dispose();
          aiZoneWidgetRef.current = null;
        }
      }
    }, tabId);

    // 显示 Zone Widget（使用计算的目标行号）
    aiZoneWidgetRef.current.show(targetLineNumber, selectedText);

    // 如果有之前的输入内容，恢复它
    if (existingInputValue) {
      setTimeout(() => {
        const inputElement = aiZoneWidgetRef.current?.getInputElement();
        if (inputElement) {
          inputElement.value = existingInputValue;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 50);
    }
  }, [handleSendInlineChatMessage, availableModels, tabId]);

  // 处理上传知识库（显示选择对话框）
  const handleUploadToKnowledgeBase = useCallback(() => {
    if (!filePath || !tabTitle) {
      toastService.error('无法获取文件信息');
      return;
    }

    // 检查是否是文件（不是片段文件或特殊文件）
    if (filePath.startsWith('snippet:') || 
        filePath.startsWith('settings:') || 
        filePath.startsWith('theme-config:')) {
      toastService.error('该文件类型不支持上传到知识库');
      return;
    }

    // 检查文件类型是否支持
    if (!FileParser.isSupportedFileType(tabTitle)) {
      const extension = FileParser.getFileExtension(tabTitle);
      const supportedTypes = FileParser.getSupportedFileTypes().join(', ');
      toastService.error(
        `不支持的文件类型: .${extension}\n支持的文件类型: ${supportedTypes}`
      );
      return;
    }

    // 显示选择知识库对话框
    setShowSelectKnowledgeBaseDialog(true);
  }, [filePath, tabTitle]);

  // 处理选择知识库后的上传
  const handleSelectKnowledgeBase = useCallback(async (knowledgeBaseId: string) => {
    if (!filePath || !tabTitle) {
      toastService.error('无法获取文件信息');
      return;
    }

    // 立即关闭对话框，避免UI卡顿
    setShowSelectKnowledgeBaseDialog(false);

    // 获取文件名
    const fileName = tabTitle || filePath.split(/[/\\]/).pop() || '未知文件';

    try {
      // 检查文件是否正在处理中（防止重复上传）
      const latestData = await knowledgeBaseService.loadFromStorage();
      const latestKnowledgeBase = latestData.created.find(kb => kb.id === knowledgeBaseId);
      if (latestKnowledgeBase?.children) {
        const findExistingFile = (items: typeof latestKnowledgeBase.children): typeof latestKnowledgeBase.children[0] | undefined => {
          for (const item of items) {
            if (item.type === 'file' && item.title === fileName) {
              return item;
            }
            if (item.children) {
              const found = findExistingFile(item.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        
        const existingFile = findExistingFile(latestKnowledgeBase.children);
        if (existingFile) {
          const processingStatus = existingFile.metadata?.processingStatus;
          if (processingStatus === 'processing' || processingStatus === 'pending') {
            toastService.warning(`文件 "${fileName}" 正在上传中，请等待完成！`);
            return;
          }
        }
      }
      
      // 先检查文件内容长度（最小 300 字符）
      const fileReadResult = await window.electron?.file?.read(filePath);
      if (!fileReadResult?.success || !fileReadResult.data?.content) {
        toastService.error(`无法读取文件: ${fileName}`);
        return;
      }
      
      // 去除空白字符（但保留换行符），防止恶意上传空内容
      const contentWithoutSpaces = fileReadResult.data.content.replace(/[^\S\n]/g, '');
      const contentLength = contentWithoutSpaces.length;
      const MIN_DOCUMENT_LENGTH = 300;
      
      if (contentLength < MIN_DOCUMENT_LENGTH) {
        toastService.error(
          `文档 "${fileName}" 过短（${contentLength} 字符），最少需要 ${MIN_DOCUMENT_LENGTH} 字符`
        );
        return;
      }
      
      // 先将文件添加到知识库服务中（立即显示）
      await knowledgeBaseService.addFileToKnowledgeBase(knowledgeBaseId, filePath, fileName);

      // 更新处理状态为 processing
      await knowledgeBaseService.updateFileProcessingStatus(filePath, 'processing', 10);

      // 立即触发知识库刷新事件，更新UI显示处理状态
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId: knowledgeBaseId }
      }));

      // 自动打开知识库标签页
      try {
        const data = await knowledgeBaseService.loadFromStorage();
        const knowledgeBase = data.created.find(kb => kb.id === knowledgeBaseId);
        
        if (knowledgeBase) {
          // 触发打开知识库事件，自动打开对应知识库标签页
          window.dispatchEvent(new CustomEvent('open-knowledge', {
            detail: {
              id: knowledgeBase.id,
              title: knowledgeBase.title,
              description: knowledgeBase.metadata?.description || '',
              items: data.created,
              knowledgeData: {
                id: knowledgeBase.id,
                items: data.created
              }
            }
          }));
        }
      } catch (error) {
        console.error('[MonacoEditor] 打开知识库标签页失败:', error);
      }

      // 进度更新回调函数
      const handleProgress = async (progressFilePath: string, progress: number) => {
        await knowledgeBaseService.updateFileProcessingStatus(progressFilePath, 'processing', progress);
        // 触发知识库刷新事件，更新UI显示
        window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
          detail: { knowledgeId: knowledgeBaseId }
        }));
      };

      // 后台异步处理文件（分块、嵌入、存储）
      ragProcessingService.uploadFilesToKnowledgeBase(
        [filePath],
        knowledgeBaseId,
        { onProgress: handleProgress }
      ).then(() => {
        // 处理完成，更新状态为 completed
        knowledgeBaseService.updateFileProcessingStatus(filePath, 'completed', 100).then(() => {
          // 触发知识库刷新事件，更新UI显示
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId }
          }));
        }).catch(() => {
          // 静默处理错误
        });
      }).catch((error) => {
        // 处理失败，更新状态为 error
        knowledgeBaseService.updateFileProcessingStatus(filePath, 'error', 0).then(() => {
          // 触发知识库刷新事件，更新UI显示
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: knowledgeBaseId }
          }));
        }).catch(() => {
          // 静默处理错误
        });
        
        // 显示错误提示
        const errorMessage = error instanceof Error ? error.message : String(error);
        let displayMessage = '上传知识库失败';
        
        // 提取更友好的错误信息
        if (errorMessage.includes('Failed to process file paths') || errorMessage.includes('处理文件路径失败')) {
          displayMessage = '文件处理失败，请检查文件格式或重试';
        } else if (errorMessage.includes('处理文件时发生错误')) {
          // 提取具体的错误信息
          const match = errorMessage.match(/处理文件时发生错误:\s*(.+)/);
          if (match && match[1]) {
            displayMessage = `文件处理失败: ${match[1].substring(0, 100)}`;
          } else {
            displayMessage = '文件处理失败，请查看控制台获取详细信息';
          }
        } else if (errorMessage.includes('向量存储未初始化')) {
          displayMessage = '向量存储未初始化，请重试';
        } else if (errorMessage.includes('超时')) {
          displayMessage = '处理超时，请检查文件大小或网络连接';
        } else if (errorMessage) {
          // 如果错误信息较短且有意义，直接显示
          if (errorMessage.length < 100) {
            displayMessage = errorMessage;
          } else {
            // 尝试提取关键错误信息
            const lines = errorMessage.split('\n');
            const firstLine = lines[0] || errorMessage;
            displayMessage = firstLine.length < 100 ? firstLine : firstLine.substring(0, 50) + '...';
          }
        }
        
        toastService.error(displayMessage);
        console.error('[MonacoEditor] 文件处理失败:', {
          error,
          errorMessage,
          filePath,
          knowledgeBaseId,
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`添加文件失败: ${errorMessage}`);
    }
  }, [filePath, tabTitle]);

  // 右键菜单
  const contextMenu = useMonacoContextMenu({
    editor: editorRef.current,
    onOpenInlineChat: handleOpenInlineChat,
    onUploadToKnowledgeBase: handleUploadToKnowledgeBase,
    tabId,
    tabTitle
  });

  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  // Monaco 编辑器挂载前 - 配置语言支持
  const handleEditorWillMount = (monaco: Monaco) => {
    console.log('[MonacoEditor] 编辑器挂载前配置');
    
    // 配置 JSON/JSONC 语言的诊断选项（启用实时语法错误提示）
    // 定义片段的 JSON Schema（用于验证片段格式）
    const snippetSchema = {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '片段名称，用于显示和区分片段',
          minLength: 1
        },
        prefix: {
          type: 'string',
          description: '触发前缀（必填），用于自动补全，应该是独一无二的',
          minLength: 1,
          pattern: '^[a-zA-Z0-9_-]+$'
        },
        body: {
          type: 'string',
          description: '片段内容',
          minLength: 1
        },
        description: {
          type: 'string',
          description: '片段描述（可选）'
        },
        language: {
          type: 'string',
          description: '编程语言（可选），如：javascript, python, html, css 等'
        },
        tags: {
          type: 'string',
          description: '标签（可选，多个标签用逗号分隔）'
        }
      },
      required: ['name', 'prefix', 'body'],
      additionalProperties: false
    };
    
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,  // 允许注释（支持 JSONC）
      schemas: [
        {
          uri: 'http://internal/snippet-schema.json',
          fileMatch: ['snippet:///*'],  // 匹配 snippet:/// 开头的所有文档
          schema: snippetSchema
        }
      ],
      enableSchemaRequest: false,
      schemaValidation: 'error',  // Schema 验证错误级别设置为 error
      schemaRequest: 'warning',
      trailingCommas: 'warning',  // 尾随逗号警告
      comments: 'ignore'  // 忽略注释错误
    });
    
    console.log('[MonacoEditor] JSON 诊断配置完成（包含片段 Schema 验证）');
    console.log('[MonacoEditor] Schema 配置详情:', {
      validate: true,
      fileMatch: ['snippet:///*'],
      schemaUri: 'http://internal/snippet-schema.json',
      requiredFields: snippetSchema.required
    });
    
    // 只在第一次时注册 jsonc 语言
    if (!jsoncLanguageRegistered) {
      console.log('[MonacoEditor] 首次注册 jsonc 语言');
      
      // 检查是否已注册 jsonc 语言
      const languages = monaco.languages.getLanguages();
      const hasJsonc = languages.some(lang => lang.id === 'jsonc');
      
      console.log('[MonacoEditor] Monaco 支持的语言:', languages.map(l => l.id));
      console.log('[MonacoEditor] 是否已支持 jsonc:', hasJsonc);
      
      // 只在未注册时注册
      if (!hasJsonc) {
        // 注册 jsonc 语言
        monaco.languages.register({ id: 'jsonc' });
        console.log('[MonacoEditor] ✅ jsonc 语言已注册');
      }
      
      // ⚠️⚠️⚠️ 关键发现：不要为 jsonc 设置自定义 tokenizer！
      // 原因：
      // 1. Monaco 内置的 JSON tokenizer 被用于 Markdown 代码块的 JSON 高亮
      // 2. 如果我们为 jsonc 设置自定义 tokenizer，Monaco 可能会混淆 json 和 jsonc
      // 3. 这会导致 Markdown 中的 JSON 代码块失去语法高亮
      //
      // 解决方案：
      // 1. 只注册 jsonc 语言（让 Monaco 知道它存在）
      // 2. 只设置语言配置（括号匹配、注释等）
      // 3. 不设置 tokenizer - 让 jsonc 自动继承 json 的 tokenizer
      console.log('[MonacoEditor] ⚠️ 跳过设置 jsonc tokenizer，让其继承 json 的 tokenizer');
      
      // 设置语言配置（括号匹配、自动缩进等）
      monaco.languages.setLanguageConfiguration('jsonc', {
        comments: {
          lineComment: '//',
          blockComment: ['/*', '*/'],
        },
        brackets: [
          ['{', '}'],
          ['[', ']'],
        ],
        autoClosingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '"', close: '"' },
        ],
        surroundingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '"', close: '"' },
        ],
      });
      
      console.log('[MonacoEditor] jsonc 语言配置完成（仅配置，无自定义 tokenizer）');
      
      // 标记已注册
      jsoncLanguageRegistered = true;
    } else {
      console.log('[MonacoEditor] jsonc 语言已注册，跳过重复注册');
    }
    
    // 注册片段自动补全提供器
    console.log('[MonacoEditor] 注册片段自动补全提供器');
    monaco.languages.registerCompletionItemProvider('*', {
      provideCompletionItems: async (model, position) => {
        try {
          // 获取当前语言
          const currentLanguage = model.getLanguageId();
          
          // 获取当前行的内容和光标前的文档
          const lineContent = model.getLineContent(position.lineNumber);
          const textUntilPosition = lineContent.substring(0, position.column - 1);
          
          // 提取当前正在输入的单词
          const wordMatch = textUntilPosition.match(/\S+$/);
          const word = wordMatch ? wordMatch[0] : '';
          
          // 查询数据库中的片段
          const snippets = await snippetService.querySnippets({
            prefix: word,
            language: currentLanguage === 'plaintext' ? undefined : currentLanguage,
            limit: 50
          });
          
          // 转换为 Monaco 的补全项 - 只显示有 prefix 的片段
          const suggestions = snippets.map((snippet: Snippet) => ({
              label: {
                label: snippet.name,
                description: `(${snippet.prefix})`,
                detail: snippet.description
              },
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: snippet.description || `插入代码片段: ${snippet.name}`,
              insertText: snippet.body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: snippet.language ? `[${snippet.language}] ${snippet.description || ''}` : snippet.description,
              sortText: `0_${snippet.prefix}`, // 优先显示片段
              filterText: `${snippet.name} ${snippet.prefix}`, // 同时支持按名称和前缀过滤
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column - word.length,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              }
            }));
          
          return {
            suggestions
          };
        } catch (error) {
          console.error('[MonacoEditor] 片段补全失败:', error);
          return { suggestions: [] };
        }
      }
    });
    
    console.log('[MonacoEditor] 片段自动补全提供器注册完成');
  };

  // Monaco 编辑器挂载时
  const handleEditorDidMount = async (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    console.log('[MonacoEditor] Editor mounted for tab:', tabId, 'Content length:', value?.length || 0);
    console.log('[MonacoEditor] Content preview:', value?.substring(0, 100));
    
    // 全局初始化 Monaco（只在第一次调用时执行）
    await initializeMonaco(monaco);
    
    editorRef.current = editor;
    setMonacoInstance(monaco);
    setIsEditorReady(true);

    console.log('[MonacoEditor] 颜色装饰器状态:', editor.getOption(monaco.editor.EditorOption.colorDecorators));

    // 确保语言模式正确设置
    const model = editor.getModel();
    if (model) {
      const currentLanguageId = model.getLanguageId();
      console.log(`[MonacoEditor] ========== 语言设置检查 ==========`);
      console.log(`[MonacoEditor] 标签页 ID: ${tabId}`);
      console.log(`[MonacoEditor] 标签页标题: ${tabTitle || '(未知)'}`);
      console.log(`[MonacoEditor] 当前模型语言: ${currentLanguageId}`);
      console.log(`[MonacoEditor] 期望语言: ${language}`);
      console.log(`[MonacoEditor] colorDecorators: ${editor.getOption(monaco.editor.EditorOption.colorDecorators)}`);
      
      // 列出所有支持的语言
      const supportedLanguages = monaco.languages.getLanguages();
      console.log(`[MonacoEditor] Monaco 支持的语言:`, supportedLanguages.map(l => l.id));
      
      // 检查是否支持目标语言
      const isLanguageSupported = supportedLanguages.some(l => l.id === language);
      console.log(`[MonacoEditor] 是否支持 ${language}:`, isLanguageSupported);
      
      if (currentLanguageId !== language) {
        console.log(`[MonacoEditor] 语言模式不匹配，设置为 ${language} (当前: ${currentLanguageId})`);
        monaco.editor.setModelLanguage(model, language);
        
        // 验证设置后的语言
        const newLanguageId = model.getLanguageId();
        console.log(`[MonacoEditor] 设置后的语言: ${newLanguageId}`);
      }
      
      // 如果是片段文件，为模型设置自定义 URI 以启用 Schema 验证
      if (tabId && (tabId.startsWith('snippet-') || tabId.includes('snippet'))) {
        const uri = monaco.Uri.parse(`snippet:///${tabId}.json`);
        const content = model.getValue();
        
        console.log('[MonacoEditor] 片段文件检查', {
          tabId,
          uri: uri.toString(),
          scheme: uri.scheme,
          path: uri.path,
          currentModelUri: model.uri.toString(),
          language,
          propLanguage: language  // 记录传入的 language prop
        });
        
        // 销毁旧模型，创建新模型（带自定义 URI 和 JSONC 语言）
        const newModel = monaco.editor.createModel(content, 'jsonc', uri);
        editor.setModel(newModel);
        
        // 销毁旧模型
        model.dispose();
        
        console.log('[MonacoEditor] 片段文件模型已创建');
        console.log('[MonacoEditor]   - URI:', uri.toString());
        console.log('[MonacoEditor]   - Language:', newModel.getLanguageId());
        console.log('[MonacoEditor]   - 模型语言应为: jsonc');
        
        // 验证 Schema 是否应用（延迟检查，等待 Monaco 内部验证）
        setTimeout(() => {
          const markers = monaco.editor.getModelMarkers({ resource: uri });
          console.log('[MonacoEditor] 当前编辑器错误标记:', markers);
          
          // 再次确认语言设置
          const currentModel = editor.getModel();
          if (currentModel) {
            const currentLang = currentModel.getLanguageId();
            console.log('[MonacoEditor] 验证后的语言ID:', currentLang);
            if (currentLang !== 'jsonc') {
              console.warn('[MonacoEditor] 语言被重置为:', currentLang, '，强制设置回 jsonc');
              monaco.editor.setModelLanguage(currentModel, 'jsonc');
            }
          }
        }, 500);
      }
    }

    // 强制刷新颜色装饰器的函数（需要在监听器之前定义）
    const forceRefreshColorDecorators = () => {
      const model = editor.getModel();
      if (!model) return;
      
      console.log('[MonacoEditor] 🔄 开始强制刷新颜色装饰器...');
      
      // 🎯 方法1：触发可见范围变化事件，强制 Monaco 重新评估装饰器
      // 通过滚动到当前位置来触发
      const currentPosition = editor.getPosition();
      if (currentPosition) {
        editor.revealLineInCenter(currentPosition.lineNumber);
      }
      
      // 🎯 方法2：强制重新渲染（同步，立即执行）
      editor.render(true);
      
      // 🎯 方法3：强制浏览器重新计算样式（防止浏览器优化导致的延迟）
      const domNode = editor.getDomNode();
      if (domNode) {
        void domNode.offsetHeight; // 强制浏览器重新计算布局
      }
      
      // 🎯 方法4：触发编辑器重新布局
      editor.layout();
      
      // 🎯 方法5：再次立即渲染，确保装饰器完全刷新
      editor.render(true);
      
      // 🎯 方法6：再次强制浏览器重新计算样式
      if (domNode) {
        void domNode.offsetHeight;
      }
      
      console.log('[MonacoEditor] ✅ 已立即同步刷新颜色装饰器（无延迟）');
    };

    // 监听编辑器内容变化，重新应用颜色
    editor.onDidChangeModelContent(() => {
      // 立即刷新颜色装饰器，避免延迟消失
      const domNode = editor.getDomNode();
      if (domNode) {
        // 检查是否有颜色选择器打开，如果有，说明可能是颜色更新
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        let hasColorPickerOpen = false;
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
            hasColorPickerOpen = true;
            break;
          }
        }
        
        // 如果颜色选择器打开，立即刷新装饰器
        if (hasColorPickerOpen) {
          forceRefreshColorDecorators();
        }
      }
      
      // 🎯 立即执行，不延迟（DOM 更新是同步的）
      if (forceApplyColorsRef.current) {
        forceApplyColorsRef.current();
      }
    });

    // 🎯 通过 CSS 默认隐藏颜色选择器，只在点击颜色装饰器时才显示
    // 并且当点击颜色选择器外部时立即隐藏（无动画、无空白闪烁）
    const domNode = editor.getDomNode();
    if (domNode) {
      // 清理之前的观察器（如果存在）
      if (colorPickerObserverCleanupRef.current) {
        colorPickerObserverCleanupRef.current();
        colorPickerObserverCleanupRef.current = null;
      }
      
    // 🎯 优雅方案：使用全局事件监听器 + Monaco 原生命令立即关闭颜色选择器
    let isClosingColorPicker = false; // 防止重复触发
    let isDraggingInsideColorPicker = false; // 标记是否正在颜色选择器内拖动
    let globalMouseDownHandler: ((event: MouseEvent) => void) | null = null;
    let globalMouseMoveHandler: ((event: MouseEvent) => void) | null = null;
    let globalMouseUpHandler: ((event: MouseEvent) => void) | null = null;
    let globalWheelHandler: ((event: WheelEvent) => void) | null = null;
    let globalKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
    
    // 🎯 最优雅方案：模拟按下 ESC 键立即关闭颜色选择器（与手动按 ESC 效果完全一致）
    const closeColorPickerImmediately = (reason: string) => {
      if (isClosingColorPicker) return;
      
      isClosingColorPicker = true;
      console.log(`[MonacoEditor] 🚀 ${reason}，模拟按下 ESC 键立即关闭颜色选择器`);
      
      // 🎯 核心：模拟按下 ESC 键，让 Monaco 使用原生的关闭逻辑
      // 这是最可靠的方法，因为 Monaco 已经实现了 ESC 键的立即关闭逻辑
      const escapeKeyEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        code: 'Escape',
        which: 27,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      
      // 直接在编辑器的 DOM 节点上触发，确保 Monaco 能捕获到
      const editorDomNode = editor.getDomNode();
      if (editorDomNode) {
        editorDomNode.dispatchEvent(escapeKeyEvent);
        console.log('[MonacoEditor] ✅ 已触发 ESC 键事件，颜色选择器应立即关闭');
      }
      
      // 🎯 立即刷新颜色装饰器
      forceRefreshColorDecorators();
      
      // 🎯 关键：移除全局事件监听器，防止内存泄漏
      if (globalMouseDownHandler) {
        document.removeEventListener('mousedown', globalMouseDownHandler, true);
        globalMouseDownHandler = null;
        console.log('[MonacoEditor] ✅ 已移除全局 mousedown 监听器');
      }
      
      if (globalMouseMoveHandler) {
        document.removeEventListener('mousemove', globalMouseMoveHandler, true);
        globalMouseMoveHandler = null;
        console.log('[MonacoEditor] ✅ 已移除全局 mousemove 监听器');
      }
      
      if (globalMouseUpHandler) {
        document.removeEventListener('mouseup', globalMouseUpHandler, true);
        globalMouseUpHandler = null;
        console.log('[MonacoEditor] ✅ 已移除全局 mouseup 监听器');
      }
      
      if (globalKeyDownHandler) {
        document.removeEventListener('keydown', globalKeyDownHandler, true);
        globalKeyDownHandler = null;
        console.log('[MonacoEditor] ✅ 已移除全局 keydown 监听器');
      }
      
      // 重置拖动标志
      isDraggingInsideColorPicker = false;
      
      // 50ms 后重置标志（ESC 键响应更快）
      setTimeout(() => {
        isClosingColorPicker = false;
      }, 50);
    };
    
    // 🎯 全局 mousedown 事件监听器（用于检测"点击外部"）
    const handleGlobalMouseDown = (event: MouseEvent) => {
      const clickTarget = event.target as HTMLElement;
      
      // 查找所有可能的颜色选择器
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement) {
          // 如果颜色选择器已显示
          if (colorPicker.classList.contains('show-picker')) {
            // 🎯 关键：使用 contains() 判断点击是否在选择器内部
            const isClickInsideColorPicker = colorPicker.contains(clickTarget);
            
            // 🎯 检查是否点击了颜色装饰器（用于打开/切换颜色选择器）
            const isClickOnColorDecorator = 
              clickTarget.classList.contains('colorpicker-color-decoration') ||
              clickTarget.classList.contains('color-decoration') ||
              clickTarget.classList.contains('mtk6') ||
              clickTarget.closest('.colorpicker-color-decoration') !== null;
            
            // 🎯 调试日志
            console.log('[MonacoEditor] 全局点击检测:', {
              isClickInsideColorPicker,
              isClickOnColorDecorator,
              clickTargetClass: clickTarget.className,
              clickTargetTag: clickTarget.tagName
            });
            
            // 🎯 如果点击在颜色选择器内部，阻止事件传播到编辑器
            if (isClickInsideColorPicker) {
              console.log('[MonacoEditor] 🎯 点击在颜色选择器内部，阻止事件传播');
              isDraggingInsideColorPicker = true; // 标记开始拖动
              event.stopPropagation(); // 阻止事件冒泡
              event.stopImmediatePropagation(); // 阻止同级监听器
              // 不阻止默认行为，让颜色选择器正常工作
              return; // 提前返回，不执行关闭逻辑
            }
            
            // 🎯 只有当点击在颜色选择器外部，并且不是颜色装饰器时，才模拟 ESC 键关闭
            if (!isClickOnColorDecorator) {
              console.log('[MonacoEditor] 🎯 点击颜色选择器外部，模拟 ESC 键关闭');
              
              // 创建一个 ESC 键事件，派发到颜色选择器元素上
              const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true
              });
              
              // 将 ESC 事件派发到颜色选择器上，让 Monaco 原生逻辑处理
              colorPicker.dispatchEvent(escapeEvent);
              
              // 同时派发到 document，确保 Monaco 能捕获到
              document.dispatchEvent(escapeEvent);
            }
          }
        }
      }
    };
    
    // 🎯 全局 mousemove 事件监听器（防止在颜色选择器内移动时触发编辑器滚动）
    const handleGlobalMouseMove = (event: MouseEvent) => {
      const moveTarget = event.target as HTMLElement;
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      // 🎯 关键修复：只要检测到颜色选择器存在，就检查鼠标是否在其内部
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
          const isInsideColorPicker = colorPicker.contains(moveTarget) || 
                                       moveTarget.closest('.colorpicker-widget') !== null ||
                                       moveTarget.closest('.monaco-color-picker') !== null ||
                                       moveTarget.closest('.color-picker-widget') !== null;
          
          if (isInsideColorPicker) {
            console.log('[MonacoEditor] 🎯 鼠标在颜色选择器内部移动，完全阻止事件');
            event.stopPropagation(); // 阻止事件冒泡
            event.stopImmediatePropagation(); // 阻止同级监听器
            event.preventDefault(); // 阻止默认行为（防止触发编辑器滚动）
            return;
          }
        }
      }
      
      // 🎯 额外检查：如果正在拖动，也阻止所有 mousemove 事件
      if (isDraggingInsideColorPicker) {
        console.log('[MonacoEditor] 🎯 正在拖动中，阻止 mousemove 事件');
        event.stopPropagation();
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    
    // 🎯 全局 mouseup 事件监听器（结束拖动）
    const handleGlobalMouseUp = (event: MouseEvent) => {
      if (isDraggingInsideColorPicker) {
        console.log('[MonacoEditor] 🎯 拖动结束，重置拖动标志');
        isDraggingInsideColorPicker = false;
        event.stopPropagation(); // 阻止事件冒泡
        event.stopImmediatePropagation(); // 阻止同级监听器
      }
    };
    
    // 🎯 全局 wheel 事件监听器（防止在颜色选择器内滚动时触发编辑器滚动）
    const handleGlobalWheel = (event: WheelEvent) => {
      const wheelTarget = event.target as HTMLElement;
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
          const isInsideColorPicker = colorPicker.contains(wheelTarget) || 
                                       wheelTarget.closest('.colorpicker-widget') !== null ||
                                       wheelTarget.closest('.monaco-color-picker') !== null ||
                                       wheelTarget.closest('.color-picker-widget') !== null;
          
          if (isInsideColorPicker) {
            console.log('[MonacoEditor] 🎯 在颜色选择器内部滚动，阻止编辑器滚动');
            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();
            return;
          }
        }
      }
    };
    
    // 🎯 全局 keydown 事件监听器（仅处理 Enter 键确认）
    // 注意：ESC 键完全交给 Monaco 原生处理，Monaco 已实现：
    //   1. 在颜色选择器内按 ESC → 立即消失
    //   2. 修改颜色后按 ESC → 立即消失（不走延迟逻辑）
    //   3. 修改颜色后失去焦点 → 延迟消失（防止误操作）
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const keyTarget = event.target as HTMLElement;
      const colorPickerSelectors = [
        '.colorpicker-widget',
        '.monaco-color-picker',
        '.color-picker-widget'
      ];
      
      for (const selector of colorPickerSelectors) {
        const colorPicker = domNode.querySelector(selector);
        if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
          
          // 🎯 检测按键是否在颜色选择器内部触发
          const isKeyInsideColorPicker = colorPicker.contains(keyTarget) || 
                                          colorPicker === keyTarget ||
                                          keyTarget.closest('.colorpicker-widget') !== null ||
                                          keyTarget.closest('.monaco-color-picker') !== null ||
                                          keyTarget.closest('.color-picker-widget') !== null;
          
          // 🎯 Enter 键处理逻辑（确认并关闭）
          // Monaco 原生可能没有 Enter 键确认功能，所以我们手动添加
          if (event.key === 'Enter' || event.keyCode === 13) {
            if (isKeyInsideColorPicker) {
              console.log('[MonacoEditor] 🎯 在颜色选择器内部按下 Enter，确认并关闭');
              closeColorPickerImmediately('在颜色选择器内部按下 Enter 键');
              event.stopPropagation(); // 阻止事件传播
              event.preventDefault(); // 阻止默认行为
            }
          }
          
          // 🎯 ESC 键完全不拦截，让 Monaco 原生逻辑处理
          // Monaco 会根据是否修改了颜色来决定立即消失还是延迟消失
        }
      }
    };
      
      // 存储已创建观察器的颜色选择器元素，避免重复创建
      const observedColorPickers = new WeakSet<HTMLElement>();
      
      // 监听颜色选择器内部的颜色变化事件（当用户选择颜色时）
      const handleColorPickerChange = () => {
        // 使用 MutationObserver 监听颜色选择器的变化
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && colorPicker instanceof HTMLElement) {
            // 如果已经观察过这个元素，跳过
            if (observedColorPickers.has(colorPicker)) {
              continue;
            }
            
            // 标记为已观察
            observedColorPickers.add(colorPicker);
            
            // 监听颜色选择器内的输入框或颜色值变化
            const observer = new MutationObserver((mutations) => {
              // 检查是否有内容变化，可能表示颜色已更新
              for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                  // 🎯 立即刷新装饰器，不延迟（颜色值更新是同步的）
                  forceRefreshColorDecorators();
                  break;
                }
              }
            });
            
            observer.observe(colorPicker, {
              childList: true,
              subtree: true,
              characterData: true,
              attributes: true,
              attributeFilter: ['class'] // 监听 class 变化，检测颜色选择器的显示/隐藏
            });
            
            // 保存 observer 以便清理
            (colorPicker as any).__colorObserver = observer;
          }
        }
      };
      
      // 定期检查颜色选择器是否出现，并附加全局事件监听器
      const checkColorPickerInterval = setInterval(() => {
        handleColorPickerChange();
        checkAndAttachGlobalListeners(); // 检查并添加全局监听器
      }, 300);
      
      // 🎯 监听颜色选择器的出现，当检测到颜色选择器显示时，添加全局事件监听器
      const checkAndAttachGlobalListeners = () => {
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && colorPicker instanceof HTMLElement && colorPicker.classList.contains('show-picker')) {
            // 如果颜色选择器已显示，且全局监听器尚未添加
            if (!globalMouseDownHandler) {
              globalMouseDownHandler = handleGlobalMouseDown;
              document.addEventListener('mousedown', globalMouseDownHandler, true);
              console.log('[MonacoEditor] ✅ 已添加全局 mousedown 监听器');
            }
            
            if (!globalMouseMoveHandler) {
              globalMouseMoveHandler = handleGlobalMouseMove;
              document.addEventListener('mousemove', globalMouseMoveHandler, true);
              console.log('[MonacoEditor] ✅ 已添加全局 mousemove 监听器');
            }
            
            if (!globalMouseUpHandler) {
              globalMouseUpHandler = handleGlobalMouseUp;
              document.addEventListener('mouseup', globalMouseUpHandler, true);
              console.log('[MonacoEditor] ✅ 已添加全局 mouseup 监听器');
            }
            
            if (!globalWheelHandler) {
              globalWheelHandler = handleGlobalWheel;
              document.addEventListener('wheel', globalWheelHandler, { passive: false, capture: true });
              console.log('[MonacoEditor] ✅ 已添加全局 wheel 监听器');
            }
            
            if (!globalKeyDownHandler) {
              globalKeyDownHandler = handleGlobalKeyDown;
              document.addEventListener('keydown', globalKeyDownHandler, true);
              console.log('[MonacoEditor] ✅ 已添加全局 keydown 监听器');
            }
            break;
          }
        }
      };
      
      // 保存清理函数到 ref
      colorPickerObserverCleanupRef.current = () => {
        // 🎯 清理全局事件监听器（防止内存泄漏）
        if (globalMouseDownHandler) {
          document.removeEventListener('mousedown', globalMouseDownHandler, true);
          globalMouseDownHandler = null;
          console.log('[MonacoEditor] 🧹 清理：已移除全局 mousedown 监听器');
        }
        
        if (globalMouseMoveHandler) {
          document.removeEventListener('mousemove', globalMouseMoveHandler, true);
          globalMouseMoveHandler = null;
          console.log('[MonacoEditor] 🧹 清理：已移除全局 mousemove 监听器');
        }
        
        if (globalMouseUpHandler) {
          document.removeEventListener('mouseup', globalMouseUpHandler, true);
          globalMouseUpHandler = null;
          console.log('[MonacoEditor] 🧹 清理：已移除全局 mouseup 监听器');
        }
        
        if (globalWheelHandler) {
          document.removeEventListener('wheel', globalWheelHandler, true);
          globalWheelHandler = null;
          console.log('[MonacoEditor] 🧹 清理：已移除全局 wheel 监听器');
        }
        
        if (globalKeyDownHandler) {
          document.removeEventListener('keydown', globalKeyDownHandler, true);
          globalKeyDownHandler = null;
          console.log('[MonacoEditor] 🧹 清理：已移除全局 keydown 监听器');
        }
        
        // 重置拖动标志
        isDraggingInsideColorPicker = false;
        
        clearInterval(checkColorPickerInterval);
        
        // 清理所有 MutationObserver
        const colorPickerSelectors = [
          '.colorpicker-widget',
          '.monaco-color-picker',
          '.color-picker-widget'
        ];
        
        for (const selector of colorPickerSelectors) {
          const colorPicker = domNode.querySelector(selector);
          if (colorPicker && (colorPicker as any).__colorObserver) {
            (colorPicker as any).__colorObserver.disconnect();
            delete (colorPicker as any).__colorObserver;
          }
        }
      };
    }

    // 强制编辑器重新布局
    setTimeout(() => {
      editor.layout();
    }, 100);

    // Markdown 自动列表功能（仅在 Markdown 语言时启用）
    if (language === 'markdown') {
      editor.onKeyDown((e) => {
        // 检测 Enter 键
        if (e.keyCode === monaco.KeyCode.Enter) {
          const model = editor.getModel();
          const position = editor.getPosition();
          
          if (!model || !position) return;
          
          const lineNumber = position.lineNumber;
          const lineContent = model.getLineContent(lineNumber);
          
          // 匹配有序列表：1. 、2. 等
          const orderedListMatch = lineContent.match(/^(\s*)(\d+)\.\s+(.*)$/);
          if (orderedListMatch) {
            const [, indent, currentNumber, content] = orderedListMatch;
            
            // 如果内容为空，则退出列表（删除当前行的列表标记）
            if (content.trim() === '') {
              e.preventDefault();
              editor.executeEdits('auto-list', [{
                range: new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1),
                text: indent
              }]);
              editor.setPosition({ lineNumber, column: indent.length + 1 });
              return;
            }
            
            // 否则，插入下一个编号的列表项
            const nextNumber = parseInt(currentNumber) + 1;
            e.preventDefault();
            editor.executeEdits('auto-list', [{
              range: new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1),
              text: `\n${indent}${nextNumber}. `
            }]);
            editor.setPosition({ 
              lineNumber: lineNumber + 1, 
              column: indent.length + nextNumber.toString().length + 3 
            });
            return;
          }
          
          // 匹配无序列表：- 、* 、+ 等
          const unorderedListMatch = lineContent.match(/^(\s*)([-*+])\s+(.*)$/);
          if (unorderedListMatch) {
            const [, indent, marker, content] = unorderedListMatch;
            
            // 如果内容为空，则退出列表
            if (content.trim() === '') {
              e.preventDefault();
              editor.executeEdits('auto-list', [{
                range: new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1),
                text: indent
              }]);
              editor.setPosition({ lineNumber, column: indent.length + 1 });
              return;
            }
            
            // 否则，插入相同标记的列表项
            e.preventDefault();
            editor.executeEdits('auto-list', [{
              range: new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1),
              text: `\n${indent}${marker} `
            }]);
            editor.setPosition({ 
              lineNumber: lineNumber + 1, 
              column: indent.length + 3 
            });
            return;
          }
          
          // 匹配任务列表：- [ ] 、- [x] 等
          const taskListMatch = lineContent.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
          if (taskListMatch) {
            const [, indent, marker, , content] = taskListMatch;
            
            // 如果内容为空，则退出列表
            if (content.trim() === '') {
              e.preventDefault();
              editor.executeEdits('auto-list', [{
                range: new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1),
                text: indent
              }]);
              editor.setPosition({ lineNumber, column: indent.length + 1 });
              return;
            }
            
            // 否则，插入新的未完成任务项
            e.preventDefault();
            editor.executeEdits('auto-list', [{
              range: new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1),
              text: `\n${indent}${marker} [ ] `
            }]);
            editor.setPosition({ 
              lineNumber: lineNumber + 1, 
              column: indent.length + 7 
            });
            return;
          }
        }
      });
      
      console.log('[MonacoEditor] Markdown 自动列表功能已启用');
    }

    // 将编辑器实例暴露到全局，供 MarkdownCommandProvider 等使用
    (window as any).__monacoEditor = editor;
    (window as any).__currentTabId = tabId;
    (window as any).__currentTabTitle = tabTitle;
    // 暴露打开内联聊天的方法（供外部调用，如改写菜单）
    // 先销毁现有 widget，然后调用 handleOpenInlineChat，确保重新创建并显示模型下拉框
    (window as any).__openInlineChat = async () => {
      // 清除上次生成的 diff 内容（如果存在）
      cleanupPreviousDiff();
      
      // 如果已存在 widget，先销毁，确保重新创建
      if (aiZoneWidgetRef.current) {
        aiZoneWidgetRef.current.dispose();
        aiZoneWidgetRef.current = null;
      }
      
      // 如果 availableModels 还没有准备好，等待它准备好
      // 最多等待 2 秒
      let waitCount = 0;
      const maxWait = 20; // 20 * 100ms = 2秒
      while ((!availableModelsRef.current || availableModelsRef.current.length === 0) && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      // 再等待一个渲染周期，确保 availableModels state 也已经更新
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log('[MonacoEditor] __openInlineChat 准备创建 widget', {
        availableModelsCount: availableModelsRef.current?.length || 0,
        availableModelsStateCount: availableModels?.length || 0,
        waited: waitCount * 100 + 50
      });
      
      // 调用 handleOpenInlineChat，与右键菜单逻辑一致
      handleOpenInlineChat();
    };
    // 暴露 aiZoneWidgetRef，供外部获取输入元素
    (window as any).__aiZoneWidgetRef = aiZoneWidgetRef;

    // 禁用编辑器内置的 F1 命令面板，并转发到全局命令中心
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('keydown', (e: KeyboardEvent) => {
        // 拦截 F1
        if (e.key === 'F1') {
          e.preventDefault();
          e.stopPropagation();
          
          // 手动触发全局命令中心
          const globalCommandCenter = (window as any).__commandCenter;
          if (globalCommandCenter) {
            globalCommandCenter.show('>');
          }
        }
      }, true);
    }

    // 使用全局命令中心实例（由 MainLayout 初始化）
    commandCenterRef.current = (window as any).__commandCenter;

    // 初始化 AI 改写组件
    if (!aiRewriteWidgetRef.current) {
      aiRewriteWidgetRef.current = new AIRewriteWidget(editor, {
        onRewrite: (originalText: string, rewrittenText: string) => {
          console.log('[MonacoEditor] AI 改写完成:', { originalText, rewrittenText });
        },
        onContinue: (originalText: string, continuedText: string) => {
          console.log('[MonacoEditor] AI 续写完成:', { originalText, continuedText });
        },
        onDiff: (originalText: string, rewrittenText: string) => {
          console.log('[MonacoEditor] AI 差异对比完成:', { originalText, rewrittenText });
        }
      });
    }
    
    // 优先使用全局命令中心实例，避免重复创建
    if (!commandCenterRef.current) {
      commandCenterRef.current = (window as any).__commandCenter || new VSCodeCommandCenter();
      // 如果创建了新实例，保存到全局
      if (!(window as any).__commandCenter) {
        (window as any).__commandCenter = commandCenterRef.current;
      }
    }

    // 注册 Ctrl+S 保存快捷键
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        // 触发全局保存事件
        const saveHandler = (window as any).__editorSaveFile;
        if (saveHandler) {
          saveHandler();
        }
      }
    );

    // 注册 Ctrl+I 打开内联聊天快捷键
    console.log('[MonacoEditor] 注册 Ctrl+I 快捷键...');
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      () => {
        console.log('[MonacoEditor] ========== Ctrl+I 快捷键被触发 ==========');
        handleOpenInlineChat();
      }
    );
    console.log('[MonacoEditor] Ctrl+I 快捷键已注册');

    // 注册编辑器内 Ctrl+K Ctrl+T 快捷键 - 主题选择
    // （F1 已在 MainLayout 全局注册，不需要在编辑器内重复注册）
    editor.addCommand(
      monaco.KeyMod.chord(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT
      ),
      () => {
        const globalCommandCenter = (window as any).__commandCenter || commandCenterRef.current;
        globalCommandCenter?.show('>');
        // 在命令中心打开后，自动输入主题命令
        setTimeout(() => {
          const input = document.querySelector('.command-center-input') as HTMLInputElement;
          if (input) {
            input.value = '>首选项: 配色主题';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 100);
      }
    );
    
    // 清理 Monaco 注入的 VSCode CSS 变量
    setTimeout(() => {
      cleanupVSCodeVariables();
    }, 100);
  };

  // 辅助函数：验证并清理颜色值（Monaco Editor 要求 6 位或 8 位十六进制）
  const sanitizeColor = (color: string | undefined): string | undefined => {
    if (!color || typeof color !== 'string') return undefined;
    const cleaned = color.trim().replace(/^#/, '');
    
    // 3 位十六进制：扩展为 6 位（fff -> ffffff）
    if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
      const [r, g, b] = cleaned.split('');
      return `${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    
    // 6 位或 8 位十六进制：直接返回（转小写）
    if (/^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(cleaned)) {
      return cleaned.toLowerCase();
    }
    
    return undefined;
  };

  // 应用主题到 Monaco 编辑器的核心函数
  const applyThemeToMonaco = (themeData: any, monaco: Monaco) => {
    try {
        console.log('[MonacoEditor] applyThemeToMonaco 开始，主题数据:', {
          id: themeData.id,
          name: themeData.name,
          type: themeData.type,
          hasColors: !!themeData.colors,
          colorsCount: Object.keys(themeData.colors || {}).length,
          colorsSample: Object.entries(themeData.colors || {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')
        });
        
        // 定义并注册主题到 Monaco Editor
        const themeId = `custom-${themeData.id}`;
        
        // 辅助函数：规范化颜色值（保留 # 号）
        const normalizeColorWithHash = (color: string | undefined, fallback?: string): string => {
          const colorToUse = color || fallback;
          if (!colorToUse) return fallback || '#000000';
          
          // 移除 # 号进行处理
          const cleaned = colorToUse.trim().replace(/^#/, '');
          
          // 3 位十六进制：扩展为 6 位
          if (/^[0-9A-Fa-f]{3}$/.test(cleaned)) {
            const [r, g, b] = cleaned.split('');
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
          }
          
          // 6 位或 8 位十六进制：添加 # 号
          if (/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(cleaned)) {
            return `#${cleaned.toLowerCase()}`;
          }
          
          return colorToUse;
        };

        // 主题转换为 Monaco 主题格式
        const rules = themeData.tokenColors?.map((token: any) => {
          const rule: any = {
            token: token.scope || '',
          };
          
          const fg = sanitizeColor(token.settings?.foreground);
          const bg = sanitizeColor(token.settings?.background);
          
          if (fg) rule.foreground = fg;
          if (bg) rule.background = bg;
          if (token.settings?.fontStyle) rule.fontStyle = token.settings.fontStyle;
          
          return rule;
        }).filter((rule: any) => rule.token) || [];

        // ⭐ 从 semanticTokenColors 创建额外的 Token 规则
        // 将语义 Token 颜色映射到具体的 TextMate scope
        if (themeData.semanticTokenColors) {
          const semanticToScopeMapping: Record<string, string[]> = {
            'property': ['entity.name.tag', 'support.type.property-name'],
            'variable': ['variable', 'variable.other'],
            'parameter': ['variable.parameter'],
            'string': ['string'],
            'number': ['constant.numeric'],
            'keyword': ['keyword'],
            'type': ['entity.name.type', 'support.type'],
            'class': ['entity.name.class', 'support.class'],
            'function': ['entity.name.function', 'support.function'],
            'method': ['entity.name.function.member'],
            'namespace': ['entity.name.namespace'],
            'enum': ['entity.name.enum'],
            'interface': ['entity.name.interface'],
            'typeParameter': ['entity.name.type.parameter'],
            'comment': ['comment']
          };

          Object.entries(themeData.semanticTokenColors).forEach(([semanticType, color]) => {
            const scopes = semanticToScopeMapping[semanticType];
            if (scopes && typeof color === 'string') {
              const normalizedColor = normalizeColorWithHash(color);
              scopes.forEach(scope => {
                rules.push({
                  token: scope,
                  foreground: normalizedColor.replace(/^#/, '')
                });
              });
            }
          });

          console.log('[MonacoEditor] ✅ 已从 semanticTokenColors 生成', 
            Object.keys(themeData.semanticTokenColors).length, 
            '个语义 Token 规则，总规则数:', rules.length);
          
          // 🔍 调试：打印生成的语义 Token 规则
          console.log('[MonacoEditor] 📋 语义 Token 规则详情:', 
            rules.slice(-15).map((r: any) => ({ token: r.token, foreground: r.foreground })));
          
          // 🔍 调试：添加 JSON 专用的 Token 规则
          // Monaco JSON 语言使用特殊的 token 命名约定
          if (themeData.semanticTokenColors.property) {
            const propColor = normalizeColorWithHash(themeData.semanticTokenColors.property).replace(/^#/, '');
            // JSON 属性键的所有可能 token 名称
            rules.push({ token: 'string.key.json', foreground: propColor });
            rules.push({ token: 'support.type.property-name.json', foreground: propColor });
            rules.push({ token: 'keyword.json', foreground: propColor }); // 有时 Monaco 会用这个
            // ⭐ Markdown 代码块中的 JSON 属性键
            rules.push({ token: 'key.json', foreground: propColor, fontStyle: 'bold' });
            console.log('[MonacoEditor] 🔧 添加 JSON 属性规则:', propColor);
          }
          
          if (themeData.semanticTokenColors.string) {
            const strColor = normalizeColorWithHash(themeData.semanticTokenColors.string).replace(/^#/, '');
            // JSON 字符串值
            rules.push({ token: 'string.value.json', foreground: strColor });
            rules.push({ token: 'string.json', foreground: strColor }); // 通用字符串(Markdown 中使用)
            console.log('[MonacoEditor] 🔧 添加 JSON 字符串值规则:', strColor);
          }
          
          if (themeData.semanticTokenColors.number) {
            const numColor = normalizeColorWithHash(themeData.semanticTokenColors.number).replace(/^#/, '');
            // JSON 数字
            rules.push({ token: 'number.json', foreground: numColor });
            rules.push({ token: 'constant.numeric.json', foreground: numColor });
            console.log('[MonacoEditor] 🔧 添加 JSON 数字规则:', numColor);
          }
          
          if (themeData.semanticTokenColors.keyword) {
            const keywordColor = normalizeColorWithHash(themeData.semanticTokenColors.keyword).replace(/^#/, '');
            // JSON 关键字 (true, false, null)
            rules.push({ token: 'keyword.json', foreground: keywordColor });
            console.log('[MonacoEditor] 🔧 添加 JSON 关键字规则:', keywordColor);
          }
          
          // 🎯 关键修复：Monaco JSON 默认 token 通常没有 .json 后缀
          // 让我们添加无后缀的版本
          console.log('[MonacoEditor] 🎯 添加通用 Monaco token 规则...');
          if (themeData.semanticTokenColors.property) {
            const propColor = normalizeColorWithHash(themeData.semanticTokenColors.property).replace(/^#/, '');
            rules.push({ token: 'string.key', foreground: propColor });
            rules.push({ token: 'key', foreground: propColor });
            // ⭐ 为语义 token 添加规则（支持 Markdown 代码块中的 JSON）
            rules.push({ token: 'property', foreground: propColor, fontStyle: 'bold' });
          }
          if (themeData.semanticTokenColors.string) {
            const strColor = normalizeColorWithHash(themeData.semanticTokenColors.string).replace(/^#/, '');
            rules.push({ token: 'string.value', foreground: strColor });
          }
          if (themeData.semanticTokenColors.number) {
            const numColor = normalizeColorWithHash(themeData.semanticTokenColors.number).replace(/^#/, '');
            rules.push({ token: 'number', foreground: numColor });
          }
          // ⭐ 为分隔符（括号、逗号等）添加规则
          // 优先使用主题中的 delimiter 颜色，其次 operator，最后使用前景色
          const delimiterColor = themeData.semanticTokenColors?.delimiter ||
                                 themeData.semanticTokenColors?.operator || 
                                 themeData.colors?.['editor.foreground'] || 
                                 '#839496';
          const delimColor = normalizeColorWithHash(delimiterColor).replace(/^#/, '');
          // 添加各种 delimiter token 变体
          rules.push({ token: 'delimiter', foreground: delimColor });
          rules.push({ token: 'delimiter.bracket', foreground: delimColor });
          rules.push({ token: 'delimiter.array', foreground: delimColor });
          rules.push({ token: 'delimiter.comma', foreground: delimColor });
          rules.push({ token: 'delimiter.colon', foreground: delimColor });
          rules.push({ token: 'delimiter.json', foreground: delimColor });
          rules.push({ token: 'delimiter.bracket.json', foreground: delimColor });
          rules.push({ token: 'delimiter.array.json', foreground: delimColor });
          rules.push({ token: 'delimiter.comma.json', foreground: delimColor });
          rules.push({ token: 'delimiter.colon.json', foreground: delimColor });
          // 添加标点符号
          rules.push({ token: 'punctuation', foreground: delimColor });
          rules.push({ token: 'punctuation.definition', foreground: delimColor });
          rules.push({ token: 'punctuation.separator', foreground: delimColor });
          
          // ⭐⭐⭐ 关键修复：Markdown 中嵌入的 JSON 代码块使用特殊的 token 前缀
          // Monaco 在 Markdown 中嵌入其他语言时，会使用 "meta.embedded" 前缀
          rules.push({ token: 'meta.embedded.block.json delimiter', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json delimiter.bracket', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json delimiter.array', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json delimiter.comma', foreground: delimColor });
          rules.push({ token: 'meta.embedded.block.json punctuation', foreground: delimColor });
          
          console.log('[MonacoEditor] 🔧 添加分隔符规则（含 Markdown 嵌入式）:', delimColor);
        }

        // 辅助函数：从主题数据中获取颜色，支持 --ws- 前缀和标准键
        const getColorFromTheme = (key: string, fallback?: string): string => {
          const wsKey = `--ws-${key.replace(/\./g, '-')}`;
          const color = themeData.colors?.[key] || themeData.colors?.[wsKey];
          
          // 调试日志：显示颜色获取过程
          if (key === 'editor.background' || key === 'editor.foreground') {
            console.log(`[MonacoEditor] 获取颜色 ${key}:`, {
              standardKey: key,
              wsKey,
              colorFromStandardKey: themeData.colors?.[key],
              colorFromWsKey: themeData.colors?.[wsKey],
              finalColor: color,
              normalized: normalizeColorWithHash(color, fallback)
            });
          }
          
          return normalizeColorWithHash(color, fallback);
        };

        // 构建完整的颜色对象，映射所有 Monaco Editor 需要的颜色
        // 这样可以最大程度避免 Monaco 使用默认值
        const colors: Record<string, string> = {};

        // 从主题数据中提取所有颜色
        if (themeData.colors) {
          // 直接使用主题中的所有颜色
          Object.entries(themeData.colors).forEach(([key, value]) => {
            if (typeof value === 'string') {
              colors[key] = normalizeColorWithHash(value);
            }
          });
        }

        console.log('[MonacoEditor] 提取的颜色数量:', Object.keys(colors).length);
        console.log('[MonacoEditor] 编辑器背景色:', colors['editor.background']);
        console.log('[MonacoEditor] 编辑器前景色:', colors['editor.foreground']);

        // 提取语义 Token 颜色
        const semanticTokenColors: Record<string, string> = {};
        if (themeData.semanticTokenColors) {
          Object.entries(themeData.semanticTokenColors).forEach(([key, value]) => {
            if (typeof value === 'string') {
              semanticTokenColors[key] = normalizeColorWithHash(value);
            }
          });
          console.log('[MonacoEditor] 提取的语义 Token 颜色:', semanticTokenColors);
        }

        // 创建完全自定义的主题
        // 注意：base 必须是 'vs', 'vs-dark', 或 'hc-black' 之一
        // inherit: true 以继承语法高亮规则（因为我们的主题中没有 tokenColors）
        const monacoTheme: monaco.editor.IStandaloneThemeData = {
          base: themeData.type === 'light' ? 'vs' : 'vs-dark',
          inherit: true,  // 继承基础主题的语法规则，但使用我们的颜色
          rules,
          colors,
          encodedTokensColors: undefined
        };

        // ⭐ 添加语义高亮规则（用于语义 token 提供器）
        const semanticHighlightingRules: Record<string, string> = {};
        
        // 为每个语义 token 类型添加规则
        if (themeData.semanticTokenColors) {
          // delimiter（分隔符：括号、逗号等）
          const delimiterColor = themeData.semanticTokenColors.delimiter ||
                                 themeData.semanticTokenColors.operator || 
                                 themeData.colors?.['editor.foreground'] || 
                                 '#839496';
          semanticHighlightingRules['delimiter'] = normalizeColorWithHash(delimiterColor);
          
          // property（JSON 属性名）
          if (themeData.semanticTokenColors.property) {
            semanticHighlightingRules['property'] = normalizeColorWithHash(themeData.semanticTokenColors.property);
            console.log('[MonacoEditor] 🎨 从主题加载 property 颜色:', themeData.semanticTokenColors.property, '→', semanticHighlightingRules['property']);
          }
          
          // string（字符串）
          if (themeData.semanticTokenColors.string) {
            semanticHighlightingRules['string'] = normalizeColorWithHash(themeData.semanticTokenColors.string);
          }
          
          // number（数字）
          if (themeData.semanticTokenColors.number) {
            semanticHighlightingRules['number'] = normalizeColorWithHash(themeData.semanticTokenColors.number);
          }
          
          // keyword（关键字）
          if (themeData.semanticTokenColors.keyword) {
            semanticHighlightingRules['keyword'] = normalizeColorWithHash(themeData.semanticTokenColors.keyword);
          }
          
          console.log('[MonacoEditor] 🎨 语义高亮规则:', semanticHighlightingRules);
        }

        // 如果有语义 Token 颜色，添加到主题中（使用类型断言绕过 TypeScript 限制）
        if (Object.keys(semanticTokenColors).length > 0) {
          (monacoTheme as monaco.editor.IStandaloneThemeData & { semanticTokenColors?: Record<string, string> }).semanticTokenColors = semanticTokenColors;
        }
        
        // 添加语义高亮规则到主题
        if (Object.keys(semanticHighlightingRules).length > 0) {
          (monacoTheme as monaco.editor.IStandaloneThemeData & { semanticHighlighting?: boolean; semanticTokenColors?: Record<string, string> }).semanticHighlighting = true;
          (monacoTheme as monaco.editor.IStandaloneThemeData & { semanticTokenColors?: Record<string, string> }).semanticTokenColors = semanticHighlightingRules;
        }

        console.log('[MonacoEditor] 准备注册主题:', {
          themeId,
          base: monacoTheme.base,
          inherit: monacoTheme.inherit,
          rulesCount: rules.length,
          colorsCount: Object.keys(colors).length,
          colorsSample: Object.entries(colors).slice(0, 10),
          editorBackground: colors['editor.background'],
          editorForeground: colors['editor.foreground']
        });
        
        // // 🔍 关键调试：打印所有与 JSON 相关的 token 规则
        // const jsonRules = rules.filter((r: any) => 
        //   r.token.includes('json') || 
        //   r.token.includes('string') || 
        //   r.token.includes('number') ||
        //   r.token.includes('key')
        // );
        // console.log('[MonacoEditor] 🎯 JSON 相关的 Token 规则 (' + jsonRules.length + ' 条):', 
        //   JSON.stringify(jsonRules, null, 2));

        monaco.editor.defineTheme(themeId, monacoTheme);
        console.log('[MonacoEditor] 主题已定义:', themeId);
        
        monaco.editor.setTheme(themeId);
        console.log('[MonacoEditor] 主题已设置:', themeId);
        
        setCurrentTheme(themeId);
        
        // ⭐ 强制应用 JSON token 颜色（通过 CSS 直接覆盖）
        injectJSONTokenColors(themeId, themeData.semanticTokenColors || {});
        
        // 🔥 关键修复：主题应用后，强制重新 tokenize 当前文档
        // 这样可以确保 Markdown 代码块中的 JSON 高亮正常显示
        setTimeout(() => {
          if (editorRef.current) {
            const model = editorRef.current.getModel();
            if (model) {
              const languageId = model.getLanguageId();
              console.log('[MonacoEditor] 🔄 主题应用后重新 tokenize，语言:', languageId);
              
              // 强制重新设置语言（触发 tokenization）
              monaco.editor.setModelLanguage(model, languageId);
              
              // 如果是 Markdown，额外刷新一次布局
              if (languageId === 'markdown') {
                editorRef.current.layout();
                console.log('[MonacoEditor] ✅ Markdown 编辑器已重新布局');
              }
            }
          }
          
          // 清理 VSCode CSS 变量
          cleanupVSCodeVariables();
          console.log('[MonacoEditor] CSS 变量清理完成');
        }, 150); // 增加延迟，确保主题完全应用
      } catch (error) {
        console.error('[MonacoEditor] 主题应用失败:', error);
      }
  };
  
  // 通过注入 CSS 强制覆盖 JSON token 颜色
  const injectJSONTokenColors = (themeId: string, semanticTokenColors: Record<string, string>) => {
    console.log('[MonacoEditor] 🔍 injectJSONTokenColors 被调用');
    console.log('[MonacoEditor] themeId:', themeId);
    console.log('[MonacoEditor] semanticTokenColors:', semanticTokenColors);
    
    const styleId = 'monaco-json-token-colors';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
      console.log('[MonacoEditor] ✅ 创建了新的 <style> 元素');
    } else {
      console.log('[MonacoEditor] ♻️ 复用现有的 <style> 元素');
    }
    
    // 构建 CSS 规则
    const cssRules: string[] = [];
    
    // JSON 属性键（property name）- 精确覆盖 mtk1 类（使用更高优先级的选择器）
    if (semanticTokenColors.property) {
      const color = semanticTokenColors.property;
      cssRules.push(`
        /* JSON 属性键通常使用 mtk1 类 - 超高优先级选择器 */
        .monaco-editor .${themeId} .view-line .mtk1,
        .monaco-editor.${themeId} .view-line .mtk1,
        .${themeId} .view-line .mtk1 {
          color: ${color} !important;
        }
      `);
    }
    
    // JSON 字符串值
    if (semanticTokenColors.string) {
      const color = semanticTokenColors.string;
      cssRules.push(`
        .monaco-editor .${themeId} .view-line .mtk10,
        .monaco-editor.${themeId} .view-line .mtk10,
        .${themeId} .view-line .mtk10,
        .${themeId} .token.string.value.json {
          color: ${color} !important;
        }
      `);
    }
    
    // JSON 数字
    if (semanticTokenColors.number) {
      const color = semanticTokenColors.number;
      cssRules.push(`
        .monaco-editor .${themeId} .view-line .mtk7,
        .monaco-editor.${themeId} .view-line .mtk7,
        .${themeId} .view-line .mtk7,
        .${themeId} .token.constant.numeric.json,
        .${themeId} .token.number.json {
          color: ${color} !important;
        }
      `);
    }
    
    // JSON 关键字 (true, false, null)
    if (semanticTokenColors.keyword) {
      const color = semanticTokenColors.keyword;
      cssRules.push(`
        .monaco-editor .${themeId} .view-line .mtk8,
        .monaco-editor.${themeId} .view-line .mtk8,
        .${themeId} .view-line .mtk8,
        .${themeId} .token.keyword.json {
          color: ${color} !important;
        }
      `);
    }
    
    // ⭐ JSON 分隔符（括号、逗号、冒号等）
    // tokenType 10 (delimiter) → mtk11 (Monaco 从 1 开始索引)
    const delimiterColor = semanticTokenColors.delimiter || 
                           semanticTokenColors.operator || 
                           '#839496';
    
    console.log('[MonacoEditor] 🔍 分隔符颜色调试信息:');
    console.log('  - semanticTokenColors.delimiter:', semanticTokenColors.delimiter);
    console.log('  - semanticTokenColors.operator:', semanticTokenColors.operator);
    console.log('  - 最终使用的颜色:', delimiterColor);
    
    cssRules.push(`
      /* 语义 token - delimiter (tokenType 10 → mtk11) */
      .monaco-editor .view-line .mtk11,
      .monaco-editor.${themeId} .view-line .mtk11,
      .${themeId} .view-line .mtk11,
      .view-line .mtk11,
      /* 标准 token - delimiter */
      .${themeId} .token.delimiter,
      .${themeId} .token.delimiter.bracket,
      .${themeId} .token.delimiter.array,
      .${themeId} .token.delimiter.comma,
      .${themeId} .token.delimiter.colon,
      .${themeId} .token.delimiter.json,
      .${themeId} .token.delimiter.bracket.json,
      .${themeId} .token.delimiter.array.json,
      .${themeId} .token.delimiter.comma.json,
      .${themeId} .token.delimiter.colon.json,
      .${themeId} .token.punctuation,
      .${themeId} .token.punctuation.definition,
      .${themeId} .token.punctuation.separator,
      /* 全局覆盖（最高优先级） */
      .monaco-editor .mtk11,
      span.mtk11 {
        color: ${delimiterColor} !important;
      }
    `);
    console.log('[MonacoEditor] 💉 添加分隔符 CSS 规则（tokenType 10 → mtk11），颜色:', delimiterColor);
    
    styleEl.textContent = cssRules.join('\n');
    console.log('[MonacoEditor] 💉 已注入 JSON Token CSS 覆盖规则', cssRules.length, '条');
    
    // ✅ JSON tokenizer 已在 handleEditorWillMount 中正确配置
    // 不需要在这里重复设置，避免覆盖之前的配置
    console.log('[MonacoEditor] ✅ JSON 括号颜色由主题规则控制');
  };
  
  // 清除 VSCode 前缀的 CSS 变量
  // 清理函数：移除 Monaco 可能注入的 CSS 变量（作为双重保险）
  // 注：已通过 semanticHighlighting.enabled: false 从源头禁用
  const cleanupVSCodeVariables = () => {
    const root = document.documentElement;
    const styles = root.style;
    const propertiesToRemove: string[] = [];
    
    // 收集所有 --vscode- 前缀的变量
    for (let i = 0; i < styles.length; i++) {
      const propertyName = styles[i];
      if (propertyName.startsWith('--vscode-')) {
        propertiesToRemove.push(propertyName);
      }
    }
    
    // 如果发现了这些变量（理论上不应该出现），移除它们
    if (propertiesToRemove.length > 0) {
      propertiesToRemove.forEach(property => {
        root.style.removeProperty(property);
      });
      console.warn(`[MonacoEditor] 检测到并移除了意外的 ${propertiesToRemove.length} 个 --vscode- 变量`);
    }
  };

  // Monaco 实例准备好后，应用等待中的主题
  useEffect(() => {
    if (monacoInstance && pendingTheme) {
      applyThemeToMonaco(pendingTheme, monacoInstance);
      setPendingTheme(null);
    }
  }, [monacoInstance, pendingTheme]);
  
  // 定期清理 VSCode CSS 变量
  useEffect(() => {
    // 立即清理一次
    cleanupVSCodeVariables();
    
    // 设置定期清理
    const cleanupInterval = setInterval(() => {
      cleanupVSCodeVariables();
    }, 2000); // 每2秒清理一次
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);

  // 监听主题变化
  // 使用 useRef 存储监听器函数，避免依赖项变化导致重复添加
  const themeChangeHandlerRef = useRef<((_event: any, themeData: any) => void) | null>(null);
  
  useEffect(() => {
    // 如果已经有监听器，先移除旧的
    if (themeChangeHandlerRef.current) {
      window.electron?.ipcRenderer.removeListener('theme:theme-changed', themeChangeHandlerRef.current);
    }

    const handleThemeChange = (_event: any, themeData: any) => {
      if (!monacoInstance) {
        setPendingTheme(themeData);
        return;
      }

      applyThemeToMonaco(themeData, monacoInstance);
    };

    // 保存监听器引用
    themeChangeHandlerRef.current = handleThemeChange;

    // 监听主题变化事件
    window.electron?.ipcRenderer.on('theme:theme-changed', handleThemeChange);

    // 获取当前主题
    window.electron?.ipcRenderer.invoke('theme:get-current-theme').then((theme) => {
      if (theme) {
        handleThemeChange(null, theme);
      }
    }).catch((error: any) => {
      console.error('[MonacoEditor] 获取当前主题失败:', error);
    });

    return () => {
      if (themeChangeHandlerRef.current) {
        window.electron?.ipcRenderer.removeListener('theme:theme-changed', themeChangeHandlerRef.current);
        themeChangeHandlerRef.current = null;
      }
    };
  }, [monacoInstance]);

  // 动态更新语言模式（支持语法高亮）
  useEffect(() => {
    if (!isEditorReady || !editorRef.current || !monacoInstance) {
      return;
    }

    const editor = editorRef.current;
    const model = editor.getModel();
    
    if (model) {
      const currentLanguageId = model.getLanguageId();
      
      // 特殊处理：如果是片段文件，强制使用 jsonc，忽略 language prop
      const isSnippetFile = tabId && (tabId.startsWith('snippet-') || tabId.includes('snippet'));
      const targetLanguage = isSnippetFile ? 'jsonc' : language;
      
      if (currentLanguageId !== targetLanguage) {
        console.log(`[MonacoEditor] 更新语言模式: ${currentLanguageId} -> ${targetLanguage}`, {
          tabId,
          isSnippetFile,
          languageProp: language,
          finalLanguage: targetLanguage
        });
        monacoInstance.editor.setModelLanguage(model, targetLanguage);
      }
    }
  }, [language, isEditorReady, monacoInstance, tabId]);

  // 更新全局标签页信息
  useEffect(() => {
    (window as any).__currentTabId = tabId;
    (window as any).__currentTabTitle = tabTitle;
  }, [tabId, tabTitle]);

  // 监听编辑器滚动事件，同步到预览
  useEffect(() => {
    if (!isEditorReady || !editorRef.current || !tabId) {
      return;
    }

    const editor = editorRef.current;
    
    // 监听编辑器滚动
    const scrollDisposable = editor.onDidScrollChange((e) => {
      if (isSyncingScrollRef.current) return;

      // 清除之前的定时器
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // 防抖处理
      scrollTimeoutRef.current = setTimeout(() => {
        const visibleRange = editor.getVisibleRanges()[0];
        if (!visibleRange) return;

        const model = editor.getModel();
        if (!model) return;

        const totalLines = model.getLineCount();
        const currentLine = visibleRange.startLineNumber;
        
        // 计算滚动百分比
        const scrollPercentage = currentLine / totalLines;

        // 广播滚动事件到对应的预览组件
        const customEvent = new CustomEvent('editor-scroll', {
          detail: {
            sourceTabId: tabId,
            scrollPercentage: scrollPercentage
          }
        });
        window.dispatchEvent(customEvent);
      }, 50); // 50ms 防抖
    });

    // 监听来自预览的滚动同步请求
    const handlePreviewScroll = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        sourceTabId: string;
        scrollPercentage: number;
      }>;
      const { sourceTabId, scrollPercentage } = customEvent.detail;

      // 只处理与当前标签页对应的滚动同步
      if (sourceTabId !== tabId) return;

      const model = editor.getModel();
      if (!model) return;

      const totalLines = model.getLineCount();
      const targetLine = Math.floor(totalLines * scrollPercentage);

      // 设置同步标志，防止循环触发
      isSyncingScrollRef.current = true;

      // 滚动到目标行
      editor.revealLineInCenter(targetLine);

      // 重置同步标志
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 100);
    };

    window.addEventListener('preview-scroll', handlePreviewScroll);

    return () => {
      scrollDisposable.dispose();
      window.removeEventListener('preview-scroll', handlePreviewScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isEditorReady, tabId, tabTitle]);

  // 组件卸载时清空
  useEffect(() => {
    return () => {
      // 清理命令中心
      if (commandCenterRef.current) {
        commandCenterRef.current.dispose();
        commandCenterRef.current = null;
      }

      // 清理 diff 内容和空行
      cleanupPreviousDiff();

      // 清理 AI widgets
      if (aiZoneWidgetRef.current) {
        aiZoneWidgetRef.current.dispose();
        aiZoneWidgetRef.current = null;
      }

      if (ghostTextRef.current) {
        ghostTextRef.current.dispose();
        ghostTextRef.current = null;
      }

      if (currentGhostWidgetRef.current) {
        currentGhostWidgetRef.current.dispose();
        currentGhostWidgetRef.current = null;
      }

      if (decorationManagerRef.current) {
        decorationManagerRef.current.dispose();
        decorationManagerRef.current = null;
      }

      if (aiRewriteWidgetRef.current) {
        aiRewriteWidgetRef.current.dispose();
        aiRewriteWidgetRef.current = null;
      }
    };
  }, []);

  // 监听定位到指定行的事件
  useEffect(() => {
    const handleRevealLine = (event: Event) => {
      const customEvent = event as CustomEvent<{ lineNumber: number; column: number }>;
      const editor = editorRef.current;
      
      if (editor && customEvent.detail) {
        const { lineNumber, column } = customEvent.detail;
        
        // 设置光标位置
        editor.setPosition({ lineNumber, column });
        
        // 滚动到该位置并居中显示，不使用动画
        editor.revealLineInCenter(lineNumber, monaco.editor.ScrollType.Immediate);
        
        // 聚焦编辑器
        editor.focus();
      }
    };

    window.addEventListener('editor-reveal-line', handleRevealLine as EventListener);

    return () => {
      window.removeEventListener('editor-reveal-line', handleRevealLine as EventListener);
    };
  }, []);

  // 监听 Monaco 编辑器的右键菜单事件
  useEffect(() => {
    if (!editorRef.current || !isEditorReady) return;

    const editor = editorRef.current;
    
    // 获取编辑器的 DOM 容器元素
    const container = editor.getContainerDomNode();
    if (!container) {
      console.warn('[MonacoEditor] 无法获取编辑器容器元素');
      return;
    }

    console.log('[MonacoEditor] 获取到编辑器容器元素:', container);
    
    // 直接在 DOM 元素上监听 contextmenu 事件
    const handleContextMenu = (e: MouseEvent) => {
      console.log('[MonacoEditor] ========== DOM contextmenu 事件触发 ==========');
      console.log('[MonacoEditor] 事件对象:', e);
      console.log('[MonacoEditor] 鼠标位置:', e.clientX, e.clientY);
      
      // 阻止默认的右键菜单
      e.preventDefault();
      e.stopPropagation();
      
      // 获取鼠标位置（相对于视口）
      const x = e.clientX;
      const y = e.clientY;
      
      console.log('[MonacoEditor] Showing menu at:', x, y);
      contextMenu.showMenu(x, y);
    };

    container.addEventListener('contextmenu', handleContextMenu);
    console.log('[MonacoEditor] Monaco context menu listener attached to DOM');

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
      console.log('[MonacoEditor] Monaco context menu listener disposed');
    };
  }, [contextMenu, isEditorReady]);

  return (
    <div className="monaco-editor-wrapper">
      <Editor
        height="100%"
        width="100%"
        defaultLanguage={language}
        language={language}
        value={value}
        onChange={handleEditorChange}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        loading={<div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: 'var(--ws-editor-foreground)',
          backgroundColor: 'var(--ws-editor-background)'
        }}>
          加载编辑器中...
        </div>}
        theme={currentTheme}
        options={{
          fontSize: 14,
          fontFamily: "'Cascadia Mono', '微软雅黑', 'MonoLisa', 'Consolas', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          glyphMargin: true, // 启用 glyph margin，供 AIRewriteWidget 使用
          renderWhitespace: 'selection',
          minimap: {
            enabled: false
          },
          scrollbar: {
            horizontal: 'auto', // 启用横向滚动条（配合 wordWrap: 'off' 使用）
            horizontalScrollbarSize: 10, // 设置横向滚动条大小
            vertical: 'auto', // 保持纵向滚动条
            verticalScrollbarSize: 14, // 纵向滚动条大小
          },
          scrollBeyondLastLine: false,
          wordWrap: 'off', // 禁用自动换行，避免编辑器宽度变化时行高变化导致内联聊天位置移动
          automaticLayout: true,
          padding: {
            top: 16,
            bottom: 16
          },
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          // ⭐ 启用语义高亮
          'semanticHighlighting.enabled': true,
          matchBrackets: 'always',
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          contextmenu: false, // 禁用 Monaco 默认右键菜单，使用自定义右键菜单
          smoothScrolling: true,
          mouseWheelZoom: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'top',
          formatOnPaste: true,
          formatOnType: true,
          colorDecorators: true, // 启用颜色装饰器 UI（使用自定义颜色提供器）
          quickSuggestionsDelay: 100,
          occurrencesHighlight: false, // 禁用出现位置高亮
          // Unicode 高亮配置
          unicodeHighlight: {
            ambiguousCharacters: false // 禁用模糊字符高亮
          }
          // 启用语义高亮已在上面定义（第 1601 行）
        }}
      />
      
      {/* 自定义右键菜单 */}
      <MonacoContextMenu
        visible={contextMenu.visible}
        x={contextMenu.position.x}
        y={contextMenu.position.y}
        menuGroups={contextMenu.menuGroups}
        onClose={contextMenu.hideMenu}
      />

      {/* 选择知识库对话框 */}
      <SelectKnowledgeBaseDialog
        visible={showSelectKnowledgeBaseDialog}
        onClose={() => setShowSelectKnowledgeBaseDialog(false)}
        onSelect={handleSelectKnowledgeBase}
      />
    </div>
  );
};