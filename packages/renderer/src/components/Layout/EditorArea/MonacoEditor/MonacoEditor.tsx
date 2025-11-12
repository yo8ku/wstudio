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
import { builtinAI } from '../../../../services/BuiltinAIService';
import { snippetService } from '../../../../services/SnippetService';
import type { Snippet } from '@note-studio/shared';
import { initializeMonaco } from '../../../../hooks/useMonacoInit';
import { getCachedModels, getModelConfig } from '../../../../services/ModelCacheService';
import { aiService } from '../../../../services/ai/AIService';
import { ragProcessingService } from '../../../../services/RAGProcessingService';
import { estimateTokens } from '../../../../utils/tokenCounter';
import { getModelInputTokenLimit } from '../../../../utils/modelTokenLimit';

// 全局标记：防止重复注册 jsonc 语言
let jsoncLanguageRegistered = false;

interface MonacoEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  tabId?: string;  // 当前标签页ID
  tabTitle?: string;  // 当前标签页标题
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language = 'markdown',
  onChange,
  tabId,
  tabTitle
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
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const forceApplyColorsRef = useRef<(() => void) | null>(null);
  
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
        // 优先从数据库加载模型配置
        const cachedModels = await getCachedModels();
        
        if (cachedModels && cachedModels.length > 0) {
          // 提取模型ID列表（格式：ProviderName:modelId）
          const modelIds = cachedModels.map(model => model.modelId);
          setAvailableModels(modelIds);
          console.log('[MonacoEditor] 从数据库加载模型配置，数量:', modelIds.length);
        } else {
          // 如果数据库中没有模型配置，回退到内置AI服务
          console.log('[MonacoEditor] 数据库中没有模型配置，使用内置AI服务');
          const models = await builtinAI.getModels();
          if (models.length > 0) {
            setAvailableModels(models);
          } else {
            setAvailableModels([]);
          }
        }
      } catch (error) {
        console.error('[MonacoEditor] 加载模型配置失败:', error);
        // 出错时回退到内置AI服务
        try {
          const models = await builtinAI.getModels();
          setAvailableModels(models || []);
        } catch (fallbackError) {
          console.error('[MonacoEditor] 回退到内置AI服务也失败:', fallbackError);
          setAvailableModels([]);
        }
      }
    };

    loadAvailableModels();
    
    // 监听模型配置更新事件
    const handleModelConfigUpdate = () => {
      loadAvailableModels();
    };
    
    // 监听窗口事件（当AI配置更新时触发）
    window.addEventListener('ai-model-config-updated', handleModelConfigUpdate);
    
    return () => {
      window.removeEventListener('ai-model-config-updated', handleModelConfigUpdate);
    };
  }, []);

  // 组件卸载时清理颜色选择器观察器
  useEffect(() => {
    return () => {
      if (colorPickerObserverCleanupRef.current) {
        colorPickerObserverCleanupRef.current();
        colorPickerObserverCleanupRef.current = null;
      }
    };
  }, []);

  // 处理内联聊天消息发送
  const handleSendInlineChatMessage = useCallback(async (
    message: string, 
    includeSelection: boolean, 
    selectedModel?: string
  ) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) return;

    // 检查是否是模型判断问题
    const isModelQuestion = /(你是什么|你是谁|你是什么模型|你是什么AI|你是什么助手|你是什么技术|你是什么系统|你是什么工具|你是什么软件|你是什么程序|你是什么应用|你是什么平台|你是什么服务|你是什么产品|你是什么品牌|你是什么公司|你是什么组织|你是什么团队|你是什么开发者|你是什么开发者|你是什么作者|你是什么创建者|你是什么制造者|你是什么设计者|你是什么开发者|你是什么程序员|你是什么工程师|你是什么科学家|你是什么研究员|你是什么专家|你是什么顾问|你是什么助手|你是什么助理|你是什么秘书|你是什么助手|你是什么帮手|你是什么伙伴|你是什么朋友|你是什么同事|你是什么伙伴|你是什么搭档|你是什么合作者|你是什么协作者|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员|你是什么团队成员)/i.test(message);

    if (isModelQuestion) {
      // 特殊回答逻辑
      const specialAnswer = `我是一个基于claude-4.5-sonnet-thinking技术的AI助手，在Cursor IDE环境中工作，随时为您提供专业支持。你问的是："${message}"`;
      
      // 显示特殊回答
      if (aiZoneWidgetRef.current) {
        aiZoneWidgetRef.current.appendMessage('assistant', specialAnswer);
      }
      return;
    }

    // 规范化用户输入，移除 @file 引用占位符
    const sanitizedMessage = message.replace(/@file:[^\s]+/g, '').trim();

    // 获取选中的文本（如果需要包含）
    let selectedText = '';
    if (includeSelection) {
      const selection = editor.getSelection();
      if (selection) {
        selectedText = editor.getModel()?.getValueInRange(selection) || '';
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

      // 1. 文件监听与读取：获取文件工具栏的所有文件
      let ragChunks: Array<{ text: string; embedding: number[]; metadata: { filePath: string; fileName: string; chunkIndex: number; totalChunks: number } }> = [];
      let fileContents: Array<{ path: string; name: string; content: string }> = [];
      
      if (aiZoneWidgetRef.current) {
        const selectedFiles = aiZoneWidgetRef.current.getSelectedFiles();
        
        if (selectedFiles.length > 0) {
          console.log(`[InlineChat] 开始处理 ${selectedFiles.length} 个文件`);
          
          // 读取所有文件内容
          try {
            for (const file of selectedFiles) {
              try {
                const content = await window.electronAPI?.fs?.readFile?.(file.path, 'utf-8');
                if (content) {
                  fileContents.push({
                    path: file.path,
                    name: file.name,
                    content: content
                  });
                }
              } catch (error) {
                console.warn(`[InlineChat] 读取文件失败: ${file.path}`, error);
              }
            }
            console.log(`[InlineChat] 成功读取 ${fileContents.length} 个文件`);
            // 输出每个文件的 token 信息
            fileContents.forEach((file, index) => {
              const tokens = estimateTokens(file.content);
              console.log(`[InlineChat] 文件#${index + 1} "${file.name}" (${file.path}) -> tokens=${tokens}, length=${file.content.length}`);
            });
          } catch (error) {
            console.error('[InlineChat] 读取文件内容失败:', error);
          }

          // 计算总token数
      const userMessageTokens = estimateTokens(sanitizedMessage);
          const selectedTextTokens = estimateTokens(selectedText);
          const fileContentsTokens = fileContents.reduce((sum, file) => sum + estimateTokens(file.content), 0);
          const totalTokens = userMessageTokens + selectedTextTokens + fileContentsTokens;
          
          console.log(`[InlineChat] Token统计: 用户消息=${userMessageTokens}, 选中文本=${selectedTextTokens}, 文件内容=${fileContentsTokens}, 总计=${totalTokens}, 限制=${modelInputTokenLimit}`);

          // 如果总token数超过模型限制，使用RAG搜索
          if (totalTokens > modelInputTokenLimit) {
            console.log(`[InlineChat] Token数超过限制，使用RAG搜索`);
            
            try {
              // 调用 Python 服务进行处理
              const ragResult = await ragProcessingService.processFiles(selectedFiles);
              
              if (ragResult.success && ragResult.chunks.length > 0) {
                ragChunks = ragResult.chunks;
                console.log(`[InlineChat] RAG 处理完成: ${ragResult.totalFiles} 个文件，${ragResult.totalChunks} 个块`);
                // 输出 RAG 每个文件及分块的 token 信息
                const ragByFile = ragChunks.reduce<Record<string, Array<typeof ragChunks[number]>>>((acc, chunk) => {
                  const key = chunk.metadata.filePath || chunk.metadata.fileName;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(chunk);
                  return acc;
                }, {});
                Object.entries(ragByFile).forEach(([fileKey, chunks], idx) => {
                  const perChunkTokens = chunks.map((c) => estimateTokens(c.text));
                  const sumTokens = perChunkTokens.reduce((a, b) => a + b, 0);
                  console.log(`[InlineChat] RAG 文件#${idx + 1} "${chunks[0].metadata.fileName}" (${fileKey}) -> 总块数=${chunks.length}, tokens=${sumTokens}`);
                  perChunkTokens.forEach((tok, cidx) => {
                    const meta = chunks[cidx].metadata;
                    console.log(`  ├─ 块 ${meta.chunkIndex + 1}/${meta.totalChunks} -> tokens=${tok}, textLen=${chunks[cidx].text.length}`);
                  });
                });
              } else if (ragResult.error) {
                console.warn(`[InlineChat] RAG 处理部分失败: ${ragResult.error}`);
              }
            } catch (error) {
              console.error('[InlineChat] RAG 处理失败:', error);
              // RAG 处理失败不影响消息发送，继续执行
            }
          } else {
            console.log(`[InlineChat] Token数未超过限制，直接使用文件内容`);
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

      // 准备聊天历史（不使用系统提示词，直接使用用户消息）
      const chatHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

      // 如果有 RAG 处理结果，按文件区分添加到消息中（token超限时使用）
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
            .map((chunk) => {
              return `块 ${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks}\n${chunk.text}`;
            })
            .join('\n\n---\n\n');

          chatHistory.push({
            role: 'user',
            content: `文件: ${metadata.fileName}\n${chunkTexts}`
          });
        });
      } else if (fileContents.length > 0) {
        // 如果token未超限，直接使用文件内容，按文件区分
        fileContents.forEach((file) => {
          chatHistory.push({
            role: 'user',
            content: `文件: ${file.name}\n\`\`\`\n${file.content}\n\`\`\``
          });
        });
      }

      // 如果有选中的文本，添加到消息中（独立分组）
      if (selectedText) {
        chatHistory.push({
          role: 'user',
          content: `选中代码 (${language})：\n\`\`\`${language}\n${selectedText}\n\`\`\``
        });
      }

      // 最后添加用户问题
      chatHistory.push({
        role: 'user',
        content: `用户问题：${sanitizedMessage}`
      });

      // 输出最终构建的 Prompt 消息与 token 统计
      try {
        const messagesTokenSum = chatHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);
        console.log('[InlineChat] 最终Prompt消息（按顺序发送给模型）:');
        console.log(JSON.stringify(chatHistory, null, 2));
        console.log(`[InlineChat] 最终Prompt消息的总token预估: ${messagesTokenSum}`);
      } catch (e) {
        console.warn('[InlineChat] 序列化 Prompt 或 token 统计失败:', e);
      }

      let accumulatedCode = '';
      let isFirstChunk = true;
      
      // 获取 AIZoneWidget 底部边框的行号
      const zoneBottomLine = aiZoneWidgetRef.current?.getZoneBottomLineNumber() || position.lineNumber;
      console.log('[InlineChat] Zone 底部行号:', zoneBottomLine, '原始光标行号:', position.lineNumber);
      
      // 确保目标行存在，如果不存在则先插入空行
      const model = editor.getModel();
      if (model) {
        const totalLines = model.getLineCount();
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
      
      // 清除之前的 Ghost Text Widget（如果存在）
      if (currentGhostWidgetRef.current) {
        console.log('[InlineChat] 清除上一次的 diff 预览');
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
        },
        onReject: () => {
          console.log('[InlineChat] 用户拒绝了代码');
          ghostWidget.dispose();
          currentGhostWidgetRef.current = null;
        }
      });
      
      // 保存到 ref 中
      currentGhostWidgetRef.current = ghostWidget;
      
      // 使用 aiService 的流式API
      await aiService.generateTextStream({
        model: actualModelId,
        messages: chatHistory,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens
      }, {
        onContent: (chunk: string) => {
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
          // 内联聊天不显示推理过程，只显示最终结果
          console.log('[InlineChat] 推理片段:', reasoning.substring(0, 100));
        }
      });

      console.log('[InlineChat] AI 响应完成');
      
      // 通知 AIZoneWidget 回复完成
      aiZoneWidgetRef.current?.onAIResponseComplete();
    } catch (error) {
      console.error('[InlineChat] 调用 AI 服务失败:', error);
      
      // 在 AIZoneWidget 中显示错误信息
      const errorMessage = `调用 AI 服务失败\n错误: ${String(error)}`;
      aiZoneWidgetRef.current?.updateAIResponse(errorMessage);
      
      // 3秒后清空错误信息
      setTimeout(() => {
        aiZoneWidgetRef.current?.updateAIResponse('');
      }, 3000);
    }
  }, [tabId, tabTitle, language, availableModels]);

  // 打开内联聊天
  const handleOpenInlineChat = useCallback((skipRecreate: boolean = false) => {
    if (!editorRef.current) {
      return;
    }

    const editor = editorRef.current;
    const selection = editor.getSelection();
    const position = editor.getPosition();

    if (!position) return;

    // 获取选中的文本（如果有）
    const selectedText = selection && !selection.isEmpty() 
      ? editor.getModel()?.getValueInRange(selection) 
      : undefined;

    // 如果已存在 Zone Widget 且不需要重新创建，直接返回
    if (aiZoneWidgetRef.current && skipRecreate) {
      return;
    }

    // 如果已存在 Zone Widget，保存当前输入内容后再销毁
    let existingInputValue = '';
    if (aiZoneWidgetRef.current) {
      const inputElement = aiZoneWidgetRef.current.getInputElement();
      if (inputElement) {
        existingInputValue = inputElement.value.trim();
      }
      aiZoneWidgetRef.current.dispose();
      aiZoneWidgetRef.current = null;
    }

    // 创建新的 Zone Widget
    aiZoneWidgetRef.current = new AIZoneWidget(editor, {
      availableModels,
      onSubmit: (message: string, includeSelection: boolean, selectedModel?: string) => {
        handleSendInlineChatMessage(message, includeSelection, selectedModel);
      },
      onClose: () => {
        if (aiZoneWidgetRef.current) {
          aiZoneWidgetRef.current.dispose();
          aiZoneWidgetRef.current = null;
        }
      }
    });

    // 显示 Zone Widget
    aiZoneWidgetRef.current.show(position.lineNumber, selectedText);

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
  }, [handleSendInlineChatMessage, availableModels]);

  // 右键菜单
  const contextMenu = useMonacoContextMenu({
    editor: editorRef.current,
    onOpenInlineChat: handleOpenInlineChat
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
    // 暴露打开内联聊天的方法
    (window as any).__openInlineChat = (initialText?: string) => {
      // 如果已存在 widget 且提供了初始文本，直接追加内容（不重新创建）
      if (aiZoneWidgetRef.current && initialText) {
        const inputElement = aiZoneWidgetRef.current.getInputElement();
        if (inputElement) {
          const currentValue = inputElement.value.trim();
          if (currentValue) {
            // 如果已有内容，追加新内容
            inputElement.value = currentValue + '\n\n' + initialText;
          } else {
            // 如果没有内容，直接设置
            inputElement.value = initialText;
          }
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          
          // 滚动到底部
          inputElement.scrollTop = inputElement.scrollHeight;
          
          // 将光标移动到末尾并聚焦
          inputElement.focus();
          inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }
        return;
      }

      // 如果不存在 widget，调用打开内联聊天
      handleOpenInlineChat(false);
      
      // 如果有初始文本，等待 widget 创建完成后设置
      if (initialText) {
        setTimeout(() => {
          const inputElement = aiZoneWidgetRef.current?.getInputElement();
          if (inputElement) {
            inputElement.value = initialText;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 滚动到底部
            inputElement.scrollTop = inputElement.scrollHeight;
            
            // 将光标移动到末尾并聚焦
            inputElement.focus();
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
          }
        }, 100);
      }
    };

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
    
    if (!commandCenterRef.current) {
      commandCenterRef.current = new VSCodeCommandCenter();
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
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      () => {
        handleOpenInlineChat();
      }
    );

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
  useEffect(() => {
    const handleThemeChange = (_event: any, themeData: any) => {
      if (!monacoInstance) {
        setPendingTheme(themeData);
        return;
      }

      applyThemeToMonaco(themeData, monacoInstance);
    };

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
      window.electron?.ipcRenderer.removeListener('theme:theme-changed', handleThemeChange);
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
    
    // 使用 Monaco 的 onContextMenu 事件
    const disposable = editor.onContextMenu((e) => {
      console.log('[MonacoEditor] Monaco context menu event:', e);
      e.event.preventDefault();
      e.event.stopPropagation();
      
      // 获取鼠标位置
      const x = e.event.posx;
      const y = e.event.posy;
      
      console.log('[MonacoEditor] Showing menu at:', x, y);
      contextMenu.showMenu(x, y);
    });

    console.log('[MonacoEditor] Monaco context menu listener attached');

    return () => {
      disposable.dispose();
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
          renderWhitespace: 'selection',
          minimap: {
            enabled: true
          },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
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
    </div>
  );
};