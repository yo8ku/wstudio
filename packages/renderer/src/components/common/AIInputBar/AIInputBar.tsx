/**
 * AI 输入栏组件
 * 功能：通用的 AI 聊天输入组件，支持模型选择和命令解析
 * 描述：可用于各种场景的 AI 内容生成，如表格生成、文本生成等
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '../../Icons/Icon';
import { getCachedModels, getModelConfig } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled } from '../../../services/ai';
import { CommandParser, type CommandType, type ParsedCommand } from '../../../utils/CommandParser';
import type { AIRequestParams, StreamCallback, AIResponse } from '../../../types/aiProvider';
import './AIInputBar.scss';

/** 模型信息类型 */
interface ModelInfo {
  modelId: string;
  configName: string;
  providerId: string;
  displayName?: string;
}

/** 提示词建议项 */
interface PromptSuggestion {
  id: string;
  label: string;
  prompt: string;
  /** 命令类型，用于按命令分组显示建议 */
  commandType?: CommandType;
}

/** 自定义生成函数类型 */
export type CustomGenerateFunction = (
  input: string,
  modelId: string,
  callbacks: {
    onProgress?: (message: string) => void;
    onComplete: (content: string) => void;
    onError?: (error: Error) => void;
  }
) => Promise<void>;

/** AI 输入栏 Props */
export interface AIInputBarProps {
  /** 占位符文本 */
  placeholder?: string;
  /** 生成完成回调，返回生成的内容和命令类型 */
  onGenerate?: (content: string, commandType?: CommandType) => void;
  /** 流式内容回调 */
  onStream?: (content: string) => void;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 外部控制的加载状态（优先级高于内部状态） */
  externalLoading?: boolean;
  /** 提示词建议列表 */
  suggestions?: PromptSuggestion[];
  /** 是否启用命令模式 */
  enableCommands?: boolean;
  /** 命令执行回调（用于非生成类命令） */
  onCommand?: (command: ParsedCommand) => void;
  /** 命令类型变化回调 */
  onCommandChange?: (commandType: CommandType) => void;
  /** 输入框获得焦点回调 */
  onFocus?: () => void;
  /** 是否禁用输入框 */
  disabled?: boolean;
  /** 自定义生成函数，如果提供则使用此函数代替默认的 AI 调用 */
  customGenerate?: CustomGenerateFunction;
  /** 取消生成回调 */
  onCancel?: () => void;
  /** 是否隐藏加载指示器（进度信息在外部显示时使用） */
  hideLoadingIndicator?: boolean;
}

/** AI 输入栏组件 */
export const AIInputBar: React.FC<AIInputBarProps> = ({
  placeholder = '描述您想要生成的内容...',
  onGenerate,
  onStream,
  systemPrompt,
  externalLoading,
  suggestions = [],
  enableCommands = false,
  onCommand,
  onCommandChange,
  onFocus,
  disabled = false,
  customGenerate,
  onCancel,
  hideLoadingIndicator = false,
}) => {
  const [input, setInput] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);
  // 如果提供了外部 loading 状态，则使用外部状态；否则使用内部状态
  const isLoading = externalLoading !== undefined ? externalLoading : internalLoading;
  const setIsLoading = setInternalLoading;
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [commandError, setCommandError] = useState<string>('');
  const [currentCommand, setCurrentCommand] = useState<CommandType>('generate');
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelTriggerRef = useRef<HTMLSpanElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);

  // 命令解析器
  const commandParser = useMemo(() => {
    return enableCommands ? new CommandParser() : null;
  }, [enableCommands]);

  // 命令配置
  const commandConfigs: Array<{ type: CommandType; label: string; prefix: string }> = [
    { type: 'generate', label: '生成表格', prefix: '' },
    { type: 'query', label: '查询数据', prefix: '/query:' },
    { type: 'update', label: '更新数据', prefix: '/update:' },
    { type: 'delete', label: '删除数据', prefix: '/delete:' },
  ];

  // 获取当前命令配置
  const currentCommandConfig = useMemo(() => {
    return commandConfigs.find(c => c.type === currentCommand) || commandConfigs[0];
  }, [currentCommand]);

  // 根据当前命令类型过滤建议
  const filteredSuggestions = useMemo(() => {
    if (!enableCommands) return suggestions;
    return suggestions.filter(s => !s.commandType || s.commandType === currentCommand);
  }, [suggestions, currentCommand, enableCommands]);

  // 检查是否可以发送
  const canSend = useMemo(() => {
    if (!input.trim() || isLoading || !selectedModel) return false;
    return true;
  }, [input, isLoading, selectedModel]);

  // 更新命令错误提示
  useEffect(() => {
    setCommandError('');
  }, [input]);

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
          }));
        
        setAvailableModels(modelInfos);
        if (modelInfos.length > 0 && !selectedModel) {
          setSelectedModel(modelInfos[0].modelId);
        }
      } catch (error) {
        console.error('[AIInputBar] 加载模型失败:', error);
      }
    };
    loadModels();
  }, [selectedModel]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!isModelDropdownOpen) return;

      const isInDropdown = target.closest('.ai-input-bar-model-dropdown');
      const isOnTrigger = target.closest('.ai-input-bar-model-trigger');

      if (!isInDropdown && !isOnTrigger) {
        setIsModelDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isModelDropdownOpen]);

  // 点击外部关闭建议列表
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!showSuggestions) return;

      const isInSuggestions = target.closest('.ai-input-bar-suggestions');
      const isInInput = target.closest('.ai-input-bar-input');

      if (!isInSuggestions && !isInInput) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showSuggestions]);

  // 点击外部关闭命令菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!showCommandMenu) return;

      const isInMenu = target.closest('.ai-input-bar-command-menu');
      const isOnTrigger = target.closest('.ai-input-bar-command-trigger');

      if (!isInMenu && !isOnTrigger) {
        setShowCommandMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showCommandMenu]);

  // 切换命令
  const handleSelectCommand = useCallback((type: CommandType) => {
    setCurrentCommand(type);
    setShowCommandMenu(false);
    onCommandChange?.(type);
    inputRef.current?.focus();
  }, [onCommandChange]);

  // 选择提示词建议
  const handleSelectSuggestion = useCallback((suggestion: PromptSuggestion) => {
    setInput(suggestion.prompt);
    setShowSuggestions(false);
    // 根据建议的 commandType 切换命令，如果没有指定则切换到生成表格
    if (enableCommands) {
      const newCommand = suggestion.commandType || 'generate';
      setCurrentCommand(newCommand);
      onCommandChange?.(newCommand);
    }
    inputRef.current?.focus();
  }, [enableCommands, onCommandChange]);

  // 自动调整输入框高度
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 100);
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!canSend) return;

    const userInput = input.trim();
    
    // 如果启用命令模式且不是生成命令，调用 onCommand 回调
    if (enableCommands && currentCommand !== 'generate') {
      const parsedCmd: ParsedCommand = {
        type: currentCommand,
        content: userInput,
        raw: userInput,
        isValid: true,
      };
      setInput('');
      onCommand?.(parsedCmd);
      return;
    }

    setInput('');
    setIsLoading(true);
    setProgressMessage('');

    // 如果提供了自定义生成函数，使用它
    if (customGenerate) {
      try {
        await customGenerate(userInput, selectedModel, {
          onProgress: (message: string) => {
            setProgressMessage(message);
          },
          onComplete: (content: string) => {
            setIsLoading(false);
            setProgressMessage('');
            onGenerate?.(content, currentCommand);
          },
          onError: (error: Error) => {
            console.error('[AIInputBar] 自定义生成错误:', error);
            setIsLoading(false);
            setProgressMessage('');
          },
        });
      } catch (error) {
        console.error('[AIInputBar] 自定义生成失败:', error);
        setIsLoading(false);
        setProgressMessage('');
      }
      return;
    }

    let fullResponse = '';

    try {
      const modelConfig = await getModelConfig(selectedModel);
      if (!modelConfig) {
        throw new Error(`未找到模型配置：${selectedModel}`);
      }

      const actualModelName = modelConfig.modelId.includes(':') 
        ? modelConfig.modelId.split(':')[1] 
        : modelConfig.modelId;

      await aiService.setProvider(modelConfig.providerId, {
        name: modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        modelId: actualModelName,
      });

      // 构建消息
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      
      messages.push({ role: 'user', content: userInput });

      abortControllerRef.current = new AbortController();

      const requestParams: AIRequestParams = {
        model: actualModelName,
        messages,
        signal: abortControllerRef.current.signal,
      };

      const streamCallback: StreamCallback = {
        onContent: (content: string) => {
          fullResponse += content;
          onStream?.(fullResponse);
        },
        onComplete: (_response: AIResponse) => {
          setIsLoading(false);
          onGenerate?.(fullResponse, currentCommand);
        },
        onError: (error: Error) => {
          console.error('[AIInputBar] AI 响应错误:', error);
          setIsLoading(false);
        },
      };

      await aiService.generateTextStream(requestParams, streamCallback);
    } catch (error) {
      console.error('[AIInputBar] 发送消息失败:', error);
      setIsLoading(false);
    }
  }, [canSend, input, enableCommands, currentCommand, selectedModel, systemPrompt, onGenerate, onStream, onCommand, customGenerate]);

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // 调用外部取消回调
    onCancel?.();
    setIsLoading(false);
    setProgressMessage('');
  }, [onCancel]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 获取模型显示名称
  const getModelDisplayName = (modelId: string): string => {
    const model = availableModels.find(m => m.modelId === modelId);
    if (model?.displayName) return model.displayName;
    const colonIndex = modelId.indexOf(':');
    return colonIndex > 0 ? modelId.substring(colonIndex + 1) : modelId;
  };

  // 切换模型菜单
  const toggleModelMenu = useCallback(() => {
    setIsModelDropdownOpen(!isModelDropdownOpen);
  }, [isModelDropdownOpen]);

  return (
    <div className="ai-input-bar">
      <div className="ai-input-bar-content">
        {/* 命令选择器 */}
        {enableCommands && (
          <div className="ai-input-bar-command-select" ref={commandMenuRef}>
            <span 
              className="ai-input-bar-command-trigger"
              onClick={() => setShowCommandMenu(!showCommandMenu)}
            >
              <span className="ai-input-bar-command-label">{currentCommandConfig.label}</span>
              <Icon name="chevron-down" size={12} />
            </span>
            {showCommandMenu && (
              <div className="ai-input-bar-command-menu">
                {commandConfigs.map(cmd => (
                  <div
                    key={cmd.type}
                    className={`ai-input-bar-command-option ${cmd.type === currentCommand ? 'selected' : ''}`}
                    onClick={() => handleSelectCommand(cmd.type)}
                  >
                    {cmd.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 输入框 */}
        <textarea
          ref={inputRef}
          className="ai-input-bar-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (filteredSuggestions.length > 0 && !input.trim()) {
              setShowSuggestions(true);
            }
            onFocus?.();
          }}
          placeholder={isLoading ? '正在生成中...' : placeholder}
          rows={1}
          disabled={isLoading || disabled}
        />

        {/* 生成状态提示 */}
        {isLoading && !hideLoadingIndicator && (
          <div className="ai-input-bar-loading">
            <Icon name="refresh" size={14} className="ai-input-bar-loading-icon" />
            <span>{progressMessage || '正在生成...'}</span>
          </div>
        )}

        {/* 命令错误提示 */}
        {commandError && !isLoading && (
          <div className="ai-input-bar-error">
            <span>{commandError}</span>
          </div>
        )}

        {/* 提示词建议列表 */}
        {showSuggestions && filteredSuggestions.length > 0 && !input.trim() && (
          <div ref={suggestionsRef} className="ai-input-bar-suggestions">
            {filteredSuggestions.map(suggestion => (
              <div
                key={suggestion.id}
                className="ai-input-bar-suggestion-item"
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                <Icon name="sparkles" size={14} />
                <span>{suggestion.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* 模型选择 - 放在发送按钮左侧 */}
        <div className="ai-input-bar-model-select">
          <span 
            ref={modelTriggerRef}
            className="ai-input-bar-model-trigger"
            onClick={toggleModelMenu}
          >
            <Icon name="sparkles" size={14} />
            <span className="ai-input-bar-model-name">
              {selectedModel ? getModelDisplayName(selectedModel) : '选择模型'}
            </span>
            <Icon name="chevron-down" size={12} />
          </span>
          {isModelDropdownOpen && (
            <div className="ai-input-bar-model-dropdown">
              {availableModels.length > 0 ? (
                availableModels.map(model => (
                  <div
                    key={model.modelId}
                    className={`ai-input-bar-model-option ${model.modelId === selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.modelId);
                      setIsModelDropdownOpen(false);
                    }}
                  >
                    {model.displayName || model.modelId.split(':')[1]}
                  </div>
                ))
              ) : (
                <div className="ai-input-bar-model-empty">暂无可用模型</div>
              )}
            </div>
          )}
        </div>

        {/* 发送/停止按钮 */}
        {isLoading ? (
          <span 
            className="ai-input-bar-btn ai-input-bar-btn-stop"
            onClick={handleStop}
            title="停止生成"
          >
            <Icon name="close" size={16} />
          </span>
        ) : (
          <span 
            className={`ai-input-bar-btn ai-input-bar-btn-send ${!canSend ? 'disabled' : ''}`}
            onClick={handleSend}
            title="发送 (Enter)"
          >
            <Icon name="send" size={16} />
          </span>
        )}
      </div>
    </div>
  );
};
