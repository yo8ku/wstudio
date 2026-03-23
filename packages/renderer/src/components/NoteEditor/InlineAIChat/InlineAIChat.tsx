/**
 * CodeMirror 内联 AI 聊天组件。
 * 复刻 15c83a66 版本的卡片式内联聊天交互与 TipTap 输入实现。
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { VscMention, VscStopCircle } from 'react-icons/vsc';
import { Icon } from '../../Icons/Icon';
import { CustomScrollbar } from '../../common/CustomScrollbar';
import {
  extractActualModelIdFromCacheModelId,
  getCachedModels,
  getModelConfig,
} from '../../../services/ModelCacheService';
import { aiService } from '../../../services/ai/AIService';
import { isModelEnabled } from '../../../services/ai';
import { Select, type SelectGroup } from '../../common/Select/Select';
import { buildLevel1MenuItems, buildLevel2MenuItems } from '../../Layout/EditorArea/AIZoneWidget/buildContextMenuItems';
import { TipTapInput, type TipTapInputRef } from '../../Layout/EditorArea/AIZoneWidget/TipTapInput';
import type { AIRequestParams, AIResponse, StreamCallback } from '../../../types/aiProvider';
import { getPromptTemplateById } from '../../../services/PromptTemplateService';
import { knowledgeBaseService } from '../../Layout/Sidebar/KnowledgeBase/knowledgeBaseService';
import { tableReferenceService } from '../../../services/tableReference/TableReferenceService';
import './InlineAIChat.scss';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface ModelInfo {
  modelId: string;
  configName: string;
  providerId: string;
  actualModelId: string;
  displayName?: string;
  capabilities?: {
    thinking?: boolean;
  };
}

interface ReferenceItem {
  id: string;
  name: string;
}

interface AtMenuAnchorPosition {
  top: number;
  left: number;
}

interface InlineAIChatProps {
  onClose: () => void;
  onInsert: (text: string) => void;
  initialSelection?: string;
  view: EditorView;
}

const createId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const trimContent = (content: string, limit: number): string => (
  content.length > limit ? `${content.slice(0, limit)}\n...` : content
);

const getSelectableAtMenuValues = (groups: SelectGroup[]): string[] => {
  const values: string[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      if (!item.disabled) {
        values.push(item.value);
      }
    }
  }

  return values;
};

const groupModelsByConfig = (models: ModelInfo[]): Array<{ configName: string; models: ModelInfo[] }> => {
  const grouped = new Map<string, ModelInfo[]>();

  models.forEach((model) => {
    if (!grouped.has(model.configName)) {
      grouped.set(model.configName, []);
    }

    grouped.get(model.configName)?.push(model);
  });

  return Array.from(grouped.entries()).map(([configName, groupedModels]) => ({
    configName,
    models: groupedModels,
  }));
};

export const InlineAIChatComponent: React.FC<InlineAIChatProps> = ({
  onClose,
  onInsert,
  initialSelection,
  view,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');
  const [isAtMenuOpen, setIsAtMenuOpen] = useState(false);
  const [atMenuLevel, setAtMenuLevel] = useState<'main' | 'detail'>('main');
  const [atMenuGroups, setAtMenuGroups] = useState<SelectGroup[]>([]);
  const [currentCategory, setCurrentCategory] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [atMenuHeight, setAtMenuHeight] = useState<number | undefined>(undefined);
  const [atMenuHighlightIndex, setAtMenuHighlightIndex] = useState(0);
  const [isAtMenuKeyboardNavigating, setIsAtMenuKeyboardNavigating] = useState(false);
  const [atMenuAnchorPosition, setAtMenuAnchorPosition] = useState<AtMenuAnchorPosition | null>(null);
  const [fileReferences, setFileReferences] = useState<Array<{ path: string; name: string }>>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<ReferenceItem[]>([]);
  const [forms, setForms] = useState<ReferenceItem[]>([]);
  const [outputReservedSpace, setOutputReservedSpace] = useState(0);
  const tiptapInputRef = useRef<TipTapInputRef>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLSpanElement>(null);
  const atTriggerRef = useRef<HTMLSpanElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAtMenuOpeningRef = useRef(false);
  const atMenuOpenRequestRef = useRef(0);
  const atMenuValues = getSelectableAtMenuValues(atMenuGroups);
  const highlightedAtMenuValue = atMenuValues[atMenuHighlightIndex] ?? '';
  const canSend = (
    !isLoading
    && !!selectedModel
    && (
      inputText.trim().length > 0
      || fileReferences.length > 0
      || knowledgeBases.length > 0
      || forms.length > 0
    )
  );
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
  const shouldShowOutputActions = Boolean(
    latestAssistantMessage
    && !latestAssistantMessage.isStreaming
    && latestAssistantMessage.content.trim(),
  );
  const shouldLockScroll = isModelDropdownOpen || isAtMenuOpen;

  useEffect(() => {
    const loadModels = async (): Promise<void> => {
      const cachedModels = await getCachedModels();
      const enabledModels = cachedModels.filter((model) => isModelEnabled(model.actualModelId));
      const modelsToUse = enabledModels.length > 0 ? enabledModels : cachedModels;

      setAvailableModels(modelsToUse.map((model) => ({
        modelId: model.modelId,
        configName: model.configName,
        providerId: model.providerId,
        actualModelId: model.actualModelId,
        displayName: model.displayName,
        capabilities: model.capabilities,
      })));
      setSelectedModel((currentModel) => currentModel || modelsToUse[0]?.modelId || '');
    };

    void loadModels();
    tiptapInputRef.current?.focus();

    const handleReload = () => void loadModels();
    window.addEventListener('ai-config-updated', handleReload);
    window.addEventListener('model-enabled-changed', handleReload);

    return () => {
      window.removeEventListener('ai-config-updated', handleReload);
      window.removeEventListener('model-enabled-changed', handleReload);
      abortControllerRef.current?.abort();
    };
  }, []);

  useLayoutEffect(() => {
    const outputElement = outputRef.current;

    if (!latestAssistantMessage || !outputElement) {
      setOutputReservedSpace(0);
      return;
    }

    const updateOutputReservedSpace = (): void => {
      const nextReservedSpace = Math.ceil(outputElement.getBoundingClientRect().height);
      setOutputReservedSpace((currentReservedSpace) => (
        currentReservedSpace === nextReservedSpace ? currentReservedSpace : nextReservedSpace
      ));
    };

    updateOutputReservedSpace();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        updateOutputReservedSpace();
      })
      : null;

    resizeObserver?.observe(outputElement);
    window.addEventListener('resize', updateOutputReservedSpace);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOutputReservedSpace);
    };
  }, [latestAssistantMessage?.id]);

  useEffect(() => {
    if (!isModelDropdownOpen) {
      return;
    }

    const handleDocumentMouseDown = (event: MouseEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!modelDropdownRef.current?.contains(target)) {
        setIsModelDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown, true);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, [isModelDropdownOpen]);

  useEffect(() => {
    if (!shouldLockScroll) {
      return;
    }

    const isInsideAllowedScrollArea = (target: EventTarget | null): boolean => {
      if (target instanceof Element) {
        return Boolean(target.closest('.cm-inline-ai-output, .cm-inline-ai-model-dropdown, .cm-inline-ai-at-select-content'));
      }

      if (target instanceof Node) {
        return Boolean(target.parentElement?.closest('.cm-inline-ai-output, .cm-inline-ai-model-dropdown, .cm-inline-ai-at-select-content'));
      }

      return false;
    };

    const handleScrollLock = (event: WheelEvent | TouchEvent): void => {
      if (isInsideAllowedScrollArea(event.target)) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true };

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('wheel', handleScrollLock, listenerOptions);
    window.addEventListener('touchmove', handleScrollLock, listenerOptions);
    document.addEventListener('wheel', handleScrollLock, listenerOptions);
    document.addEventListener('touchmove', handleScrollLock, listenerOptions);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      window.removeEventListener('wheel', handleScrollLock, listenerOptions);
      window.removeEventListener('touchmove', handleScrollLock, listenerOptions);
      document.removeEventListener('wheel', handleScrollLock, listenerOptions);
      document.removeEventListener('touchmove', handleScrollLock, listenerOptions);
    };
  }, [shouldLockScroll]);

  const loadLevel1Menu = async (): Promise<void> => {
    setAtMenuGroups(await buildLevel1MenuItems());
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setAtMenuHighlightIndex(0);
  };

  const loadLevel2Menu = async (category: string, folders: Set<string>): Promise<void> => {
    setAtMenuGroups(
      await buildLevel2MenuItems(
        category,
        () => {},
        () => {},
        () => {},
        folders,
        undefined,
        () => {},
        new Set(),
      ),
    );
    setAtMenuLevel('detail');
    setCurrentCategory(category);
    setAtMenuHighlightIndex(0);
  };

  const closeAtMenu = (): void => {
    atMenuOpenRequestRef.current += 1;
    isAtMenuOpeningRef.current = false;
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setAtMenuGroups([]);
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setAtMenuHeight(undefined);
    setAtMenuHighlightIndex(0);
    setIsAtMenuKeyboardNavigating(false);
    setAtMenuAnchorPosition(null);
  };

  const insertPromptText = (text: string, replaceAtTrigger = false): void => {
    tiptapInputRef.current?.insertText(text, replaceAtTrigger);
    tiptapInputRef.current?.focus();
  };

  const handleAtMenuSelect = async (value: string): Promise<void> => {
    if (value.startsWith('category-')) {
      const folders = new Set<string>();
      setExpandedFolders(folders);
      await loadLevel2Menu(value, folders);
      return;
    }

    if (value.startsWith('folder-') && currentCategory) {
      const folderPath = value.replace('folder-', '');
      const folders = new Set(expandedFolders);

      if (folders.has(folderPath)) {
        folders.delete(folderPath);
      } else {
        folders.add(folderPath);
      }

      setExpandedFolders(folders);
      await loadLevel2Menu(currentCategory, folders);
      return;
    }

    if (value.startsWith('recent-file-')) {
      const filePath = value.replace('recent-file-', '');

      if (filePath) {
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        tiptapInputRef.current?.insertFileReference(filePath, fileName);
        setFileReferences(tiptapInputRef.current?.getFileReferences() ?? []);
      }

      closeAtMenu();
      return;
    }

    if (value.startsWith('file-')) {
      const filePath = value.replace('file-', '');
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      tiptapInputRef.current?.insertFileReference(filePath, fileName);
      setFileReferences(tiptapInputRef.current?.getFileReferences() ?? []);
      closeAtMenu();
      return;
    }

    if (value.startsWith('prompt-')) {
      const template = await getPromptTemplateById(value.replace('prompt-', ''));

      if (template?.content?.trim()) {
        insertPromptText(template.content.trim(), true);
      }

      closeAtMenu();
      return;
    }

    if (value.startsWith('kb-')) {
      const kbId = value.replace('kb-', '');
      const item = await knowledgeBaseService.findItem(kbId);

      if (item && item.type === 'folder') {
        setKnowledgeBases((currentItems) => (
          currentItems.some((entry) => entry.id === kbId)
            ? currentItems
            : [...currentItems, { id: kbId, name: item.title }]
        ));
        insertPromptText(`@${item.title} `, true);
      }

      closeAtMenu();
      return;
    }

    if (value.startsWith('form-')) {
      const formId = value.replace('form-', '');
      const formDetail = await tableReferenceService.getFormDetail(formId);

      if (formDetail) {
        setForms((currentItems) => (
          currentItems.some((entry) => entry.id === formId)
            ? currentItems
            : [...currentItems, { id: formId, name: formDetail.name }]
        ));
        insertPromptText(`@${formDetail.name} `, true);
      }

      closeAtMenu();
    }
  };

  const handleAtMenuNavigate = (direction: 'up' | 'down'): void => {
    const totalItems = atMenuValues.length;

    if (totalItems === 0) {
      return;
    }

    setAtMenuHighlightIndex((currentIndex) => (
      direction === 'up'
        ? (currentIndex <= 0 ? totalItems - 1 : currentIndex - 1)
        : (currentIndex >= totalItems - 1 ? 0 : currentIndex + 1)
    ));
  };

  const handleAtMenuSelectHighlighted = async (): Promise<void> => {
    const selectedValue = atMenuValues[atMenuHighlightIndex];

    if (selectedValue) {
      await handleAtMenuSelect(selectedValue);
    }
  };

  const handleAtMenuDropdownKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!isAtMenuOpen) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      handleAtMenuNavigate('up');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      handleAtMenuNavigate('down');
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      void handleAtMenuSelectHighlighted();
      return;
    }

    if (event.key === 'ArrowLeft' && event.altKey && atMenuLevel === 'detail') {
      event.preventDefault();
      event.stopPropagation();
      void loadLevel1Menu();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAtMenu();
    }
  };

  const getSelectionText = (): string => {
    const selection = view.state.selection.main;
    return selection.from < selection.to ? view.state.sliceDoc(selection.from, selection.to) : (initialSelection || '');
  };

  const finalizeStreamingMessage = (messageId: string): void => {
    setMessages((currentMessages) => (
      currentMessages.flatMap((message) => {
        if (message.id !== messageId) {
          return [message];
        }

        if (!message.isStreaming) {
          return [message];
        }

        if (!message.content) {
          return [];
        }

        return [{ ...message, isStreaming: false }];
      })
    ));
  };

  const handleSend = async (): Promise<void> => {
    if (isLoading || !selectedModel) {
      return;
    }

    const inputText = tiptapInputRef.current?.getText().trim() || '';
    const currentFileReferences = tiptapInputRef.current?.getFileReferences() ?? fileReferences;

    if (!inputText && currentFileReferences.length === 0 && knowledgeBases.length === 0 && forms.length === 0) {
      return;
    }

    const userMessageId = createId();
    const assistantMessageId = createId();
    const selectionText = getSelectionText().trim();
    const userMessageContent = inputText || '[context only]';
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now(),
    };
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      assistantMessage,
    ]);
    setIsLoading(true);
    tiptapInputRef.current?.clear();
    setInputText('');
    setFileReferences([]);
    setKnowledgeBases([]);
    setForms([]);

    let fileContext = '';

    for (const reference of currentFileReferences) {
      try {
        const content = await window.electronAPI?.fs?.readFile?.(reference.path, 'utf-8');
        if (content) {
          fileContext += `[File] ${reference.name}\n${trimContent(content, 3000)}\n\n`;
        }
      } catch (error) {
        console.warn('[InlineAIChat] Failed to read referenced file:', error);
      }
    }

    let requestController: AbortController | null = null;

    try {
      const modelConfig = await getModelConfig(selectedModel);

      if (!modelConfig) {
        throw new Error(`Model config not found: ${selectedModel}`);
      }

      const actualModelName = modelConfig.actualModelId;

      await aiService.setProvider(modelConfig.providerId, {
        name: modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        modelId: actualModelName,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
      });

      const contextBlocks: string[] = [];

      if (selectionText) {
        contextBlocks.push(`[Selected Text]\n${selectionText}`);
      }

      if (fileContext.trim()) {
        contextBlocks.push(fileContext.trim());
      }

      if (knowledgeBases.length > 0) {
        contextBlocks.push(`[Knowledge Bases]\n${knowledgeBases.map((item) => item.name).join(', ')}`);
      }

      if (forms.length > 0) {
        contextBlocks.push(`[Forms]\n${forms.map((item) => item.name).join(', ')}`);
      }

      const finalPrompt = contextBlocks.length > 0
        ? `${contextBlocks.join('\n\n')}\n\n[User Request]\n${inputText || 'Use the provided context.'}`
        : inputText;

      const requestParams: AIRequestParams = {
        model: actualModelName,
        messages: [
          ...messages
            .filter((message) => !message.isStreaming)
            .map((message) => ({ role: message.role, content: message.content })),
          { role: 'user', content: finalPrompt },
        ],
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        signal: (() => {
          requestController = new AbortController();
          abortControllerRef.current = requestController;
          return requestController.signal;
        })(),
      };

      let fullResponse = '';
      const streamCallback: StreamCallback = {
        onContent: (content: string) => {
          fullResponse += content;
          setMessages((currentMessages) => (
            currentMessages.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: fullResponse, isStreaming: true }
                : message
            ))
          ));
        },
        onComplete: (response: AIResponse) => {
          if (!fullResponse && response.content) {
            fullResponse = response.content;
          }

          setMessages((currentMessages) => (
            currentMessages.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: fullResponse, isStreaming: false }
                : message
            ))
          ));
          setIsLoading(false);
          if (abortControllerRef.current === requestController) {
            abortControllerRef.current = null;
          }
        },
        onError: (error: Error) => {
          if (requestController?.signal.aborted) {
            finalizeStreamingMessage(assistantMessageId);
            setIsLoading(false);
            if (abortControllerRef.current === requestController) {
              abortControllerRef.current = null;
            }
            return;
          }

          const fallback = fullResponse || `Request failed: ${error.message || 'Unknown error'}`;

          setMessages((currentMessages) => (
            currentMessages.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: fallback, isStreaming: false }
                : message
            ))
          ));
          setIsLoading(false);
          if (abortControllerRef.current === requestController) {
            abortControllerRef.current = null;
          }
        },
      };

      await aiService.generateTextStream(requestParams, streamCallback);
    } catch (error) {
      if (requestController?.signal.aborted) {
        finalizeStreamingMessage(assistantMessageId);
        setIsLoading(false);
        if (abortControllerRef.current === requestController) {
          abortControllerRef.current = null;
        }
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';

      setMessages((currentMessages) => (
        currentMessages.map((item) => (
          item.id === assistantMessageId
            ? { ...item, content: `Request failed: ${message}`, isStreaming: false }
            : item
        ))
      ));
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const getModelDisplayName = (modelId: string): string => (
    availableModels.find((model) => model.modelId === modelId)?.displayName
    || availableModels.find((model) => model.modelId === modelId)?.actualModelId
    || (modelId ? extractActualModelIdFromCacheModelId(modelId) : 'Select Model')
  );

  const openAtMenu = async (position: AtMenuAnchorPosition): Promise<void> => {
    setAtMenuAnchorPosition(position);

    if (isAtMenuOpen || isAtMenuOpeningRef.current) {
      return;
    }

    isAtMenuOpeningRef.current = true;
    const requestId = atMenuOpenRequestRef.current + 1;
    atMenuOpenRequestRef.current = requestId;
    setIsAtMenuKeyboardNavigating(false);
    setAtMenuGroups([]);

    try {
      await loadLevel1Menu();

      if (atMenuOpenRequestRef.current !== requestId) {
        return;
      }

      setIsAtMenuOpen(true);
    } finally {
      if (atMenuOpenRequestRef.current === requestId) {
        isAtMenuOpeningRef.current = false;
      }
    }
  };

  const openToolbarAtMenu = (): void => {
    const rect = atTriggerRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    void openAtMenu({
      top: rect.bottom,
      left: rect.left,
    });
  };

  const createNewChat = (): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setMessages([]);
    setIsModelDropdownOpen(false);
    closeAtMenu();
    setInputText('');
    setFileReferences([]);
    setKnowledgeBases([]);
    setForms([]);
    tiptapInputRef.current?.clear();
    tiptapInputRef.current?.focus();
  };

  return (
    <>
      <div
        className="cm-inline-ai-chat"
        style={outputReservedSpace > 0 ? { marginBottom: `${outputReservedSpace}px` } : undefined}
      >
        <div className="cm-inline-ai-border-top" />

      <div className="cm-inline-ai-input-area">
        <div className="cm-inline-ai-input-shell">
          <TipTapInput
            ref={tiptapInputRef}
            className="cm-inline-ai-tiptap-input"
            placeholder="Describe what you want AI to help with..."
            onSubmit={() => { void handleSend(); }}
            onEscape={onClose}
            onChange={(text: string) => {
              setInputText(text);
            }}
            onAtTrigger={(_query: string, position: { top: number; left: number }) => {
              void openAtMenu(position);
            }}
            onAtCancel={closeAtMenu}
            onFileReferencesChange={setFileReferences}
            isAtMenuOpen={isAtMenuOpen}
            onAtMenuNavigate={handleAtMenuNavigate}
            onAtMenuSelect={() => { void handleAtMenuSelectHighlighted(); }}
            onAtMenuBack={() => { void loadLevel1Menu(); }}
          />
          <div className="cm-inline-ai-input-side">
            {isLoading ? (
              <span
                className="cm-inline-ai-icon-btn cm-inline-ai-icon-btn-stop"
                onClick={() => {
                  abortControllerRef.current?.abort();
                  abortControllerRef.current = null;
                  if (latestAssistantMessage?.isStreaming) {
                    finalizeStreamingMessage(latestAssistantMessage.id);
                  }
                  setIsLoading(false);
                }}
                title="Stop"
              >
                <VscStopCircle size={14} />
              </span>
            ) : (
              <span
                className={`cm-inline-ai-icon-btn cm-inline-ai-icon-btn-send ${!canSend ? 'disabled' : ''}`}
                onClick={() => { void handleSend(); }}
                title="Send"
              >
                <Icon name="send" size={14} />
              </span>
            )}
            <span className="cm-inline-ai-icon-btn" onClick={onClose} title="Close">
              <Icon name="close" size={14} />
            </span>
          </div>
        </div>
        <div className="cm-inline-ai-toolbar">
          <div className="cm-inline-ai-toolbar-left">
            <div
              className="cm-inline-ai-new-chat-trigger"
              onClick={createNewChat}
              title="新建对话"
            >
              <Icon name="plus" size={14} />
            </div>
            <div className="cm-inline-ai-at-menu">
              <span
                ref={atTriggerRef}
                className="cm-inline-ai-at-trigger"
                onClick={() => {
                  if (isAtMenuOpen) {
                    closeAtMenu();
                  } else {
                    openToolbarAtMenu();
                  }
                }}
                title="Add context"
                >
                  <VscMention size={14} />
                </span>
              {isAtMenuOpen && atMenuAnchorPosition && (
                <div
                  className="cm-inline-ai-at-select-anchor"
                  style={{
                    top: `${atMenuAnchorPosition.top}px`,
                    left: `${atMenuAnchorPosition.left}px`,
                  }}
                >
                  <Select
                    value=""
                    highlightedValue={isAtMenuKeyboardNavigating ? highlightedAtMenuValue : ''}
                    onChange={(value: string) => {
                      void handleAtMenuSelect(value);
                    }}
                    groups={atMenuGroups}
                    placeholder="Select context..."
                    className="cm-inline-ai-at-select"
                    showSearch={true}
                    open={true}
                    align="left"
                    headerLeftIcon={atMenuLevel === 'detail' ? <Icon name="chevron-left" size={16} /> : undefined}
                    onHeaderLeftClick={atMenuLevel === 'detail' ? () => { void loadLevel1Menu(); } : undefined}
                    fixedHeight={atMenuLevel === 'detail' ? atMenuHeight : undefined}
                    onHeightChange={atMenuLevel === 'main' ? setAtMenuHeight : undefined}
                    onItemClick={(value: string) => !(value.startsWith('category-') || value.startsWith('folder-'))}
                    onOpenChange={(open: boolean) => {
                      if (!open) {
                        closeAtMenu();
                      }
                    }}
                    onDropdownKeyDown={handleAtMenuDropdownKeyDown}
                    onKeyboardNavigatingChange={setIsAtMenuKeyboardNavigating}
                    useCustomScrollbar={true}
                  />
                </div>
                )}
              </div>
          </div>
          {false && (
            <>
              <>
                <span
                  className="cm-inline-ai-btn"
                  onClick={() => {
                    onInsert(latestAssistantMessage?.content ?? '');
                  }}
                  title="接受"
                >
                  <Icon name="check" size={14} />
                  接受
                </span>
                <span className="cm-inline-ai-btn" onClick={onClose} title="取消">
                  <Icon name="close" size={14} />
                  取消
                </span>
              </>
            </>
          )}
          <div
            ref={modelDropdownRef}
            className={`cm-inline-ai-model-select ${isModelDropdownOpen ? 'open' : ''}`}
          >
            <span
              ref={modelTriggerRef}
              className="cm-inline-ai-model-trigger"
              onClick={() => {
                closeAtMenu();
                if (!isModelDropdownOpen) {
                  const rect = modelTriggerRef.current?.getBoundingClientRect();
                  if (rect) {
                    setDropdownDirection(rect.bottom + 260 > window.innerHeight ? 'up' : 'down');
                  }
                }
                setIsModelDropdownOpen((open) => !open);
              }}
            >
              {getModelDisplayName(selectedModel)}
              <Icon name="chevron-down" size={12} />
            </span>
            {isModelDropdownOpen && (
              <CustomScrollbar
                className={`cm-inline-ai-model-dropdown cm-inline-ai-model-dropdown-${dropdownDirection}`}
                scrollbarWidth={6}
                onWheel={(event) => {
                  event.stopPropagation();
                }}
              >
                {groupModelsByConfig(availableModels).map((group) => (
                  <div key={group.configName} className="cm-inline-ai-model-group">
                    <div className="cm-inline-ai-model-group-title">{group.configName}</div>
                    {group.models.map((model) => (
                      <div
                        key={model.modelId}
                        className={`cm-inline-ai-model-option ${model.modelId === selectedModel ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedModel(model.modelId);
                          setIsModelDropdownOpen(false);
                        }}
                      >
                        <span className="cm-inline-ai-model-name">
                          {model.displayName || model.actualModelId}
                        </span>
                        {model.capabilities?.thinking && <span className="cm-inline-ai-model-badge">Thinking</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </CustomScrollbar>
            )}
          </div>
        </div>
      </div>

        <div className="cm-inline-ai-border-bottom" />

        {latestAssistantMessage && (
          <div ref={outputRef} className="cm-inline-ai-output">
            {shouldShowOutputActions && (
              <div className="cm-inline-ai-output-header">
                <div className="cm-inline-ai-output-actions">
                  <span
                    className="cm-inline-ai-btn"
                    onClick={() => {
                      onInsert(latestAssistantMessage.content);
                    }}
                    title="接受"
                  >
                    <Icon name="check" size={14} />
                    接受
                  </span>
                  <span className="cm-inline-ai-btn" onClick={onClose} title="取消">
                    <Icon name="close" size={14} />
                    取消
                  </span>
                </div>
              </div>
            )}
            <div className="cm-inline-ai-messages">
              <div className={`cm-inline-ai-message cm-inline-ai-message-${latestAssistantMessage.role}`}>
                <div className="cm-inline-ai-message-content">
                  {latestAssistantMessage.isStreaming && !latestAssistantMessage.content ? (
                    <span className="cm-inline-ai-thinking">
                      <span>Thinking</span>
                      <span className="cm-inline-ai-thinking-dots" aria-hidden="true">
                        <span className="cm-inline-ai-thinking-dot">.</span>
                        <span className="cm-inline-ai-thinking-dot">.</span>
                        <span className="cm-inline-ai-thinking-dot">.</span>
                      </span>
                    </span>
                  ) : (
                    <>
                      {latestAssistantMessage.content}
                      {latestAssistantMessage.isStreaming && <span className="cm-inline-ai-cursor" />}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
