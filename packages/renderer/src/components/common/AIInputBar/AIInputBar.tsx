/**
 * AI 输入栏组件
 * 功能：通用的 AI 聊天输入组件，支持模型选择
 * 描述：可用于各种场景的 AI 内容生成，如表格生成、文本生成等
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../../Icons/Icon';
import { getCachedModels, getModelConfig } from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled } from '../../../services/ai';
import type { AIRequestParams, StreamCallback, AIResponse } from '../../../types/aiProvider';
import './AIInputBar.scss';

/** 模型信息类型 */
interface ModelInfo {
  modelId: string;
  configName: string;
  providerId: string;
  displayName?: string;
}

/** AI 输入栏 Props */
export interface AIInputBarProps {
  /** 占位符文本 */
  placeholder?: string;
  /** 生成完成回调，返回生成的内容 */
  onGenerate?: (content: string) => void;
  /** 流式内容回调 */
  onStream?: (content: string) => void;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 是否显示加载状态 */
  isLoading?: boolean;
  /** 外部控制加载状态 */
  setIsLoading?: (loading: boolean) => void;
}

/** AI 输入栏组件 */
export const AIInputBar: React.FC<AIInputBarProps> = ({
  placeholder = '描述您想要生成的内容...',
  onGenerate,
  onStream,
  systemPrompt,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modelTriggerRef = useRef<HTMLSpanElement>(null);

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
    if (!input.trim() || isLoading || !selectedModel) return;

    const userInput = input.trim();
    setInput('');
    setIsLoading(true);

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
          onGenerate?.(fullResponse);
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
  }, [input, isLoading, selectedModel, systemPrompt, onGenerate, onStream]);

  // 停止生成
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

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
        {/* 模型选择 */}
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

        {/* 输入框 */}
        <textarea
          ref={inputRef}
          className="ai-input-bar-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
        />

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
            className={`ai-input-bar-btn ai-input-bar-btn-send ${!input.trim() || !selectedModel ? 'disabled' : ''}`}
            onClick={handleSend}
            title="发送 (Enter)"
          >
            <Icon name="play" size={16} />
          </span>
        )}
      </div>
    </div>
  );
};
