import React, { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { Icon } from '../../Icons/Icon';
import { getCachedModels, getModelConfig } from '../../../services/ModelCacheService';
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
  displayName?: string;
  capabilities?: {
    thinking?: boolean;
  };
}

interface ReferenceItem {
  id: string;
  name: string;
}

interface InlineAIChatProps {
  onClose: () => void;
  onInsert: (text: string) => void;
  initialSelection?: string;
  view: EditorView;
}

const createId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const trimContent = (content: string, limit: number): string => content.length > limit ? `${content.slice(0, limit)}\n...` : content;

export const InlineAIChatComponent: React.FC<InlineAIChatProps> = ({ onClose, onInsert, initialSelection, view }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
  const [isSparklesMenuOpen, setIsSparklesMenuOpen] = useState(false);
  const [isToneSubmenuOpen, setIsToneSubmenuOpen] = useState(false);
  const [fileReferences, setFileReferences] = useState<Array<{ path: string; name: string }>>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<ReferenceItem[]>([]);
  const [forms, setForms] = useState<ReferenceItem[]>([]);
  const tiptapInputRef = useRef<TipTapInputRef>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLSpanElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const loadModels = async (): Promise<void> => {
      const cachedModels = await getCachedModels();
      const enabledModels = cachedModels.filter((model) => isModelEnabled(model.modelId));
      const modelsToUse = enabledModels.length > 0 ? enabledModels : cachedModels;
      setAvailableModels(modelsToUse.map((model) => ({
        modelId: model.modelId,
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const loadLevel1Menu = async (): Promise<void> => {
    setAtMenuGroups(await buildLevel1MenuItems());
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setAtMenuHighlightIndex(0);
  };

  const loadLevel2Menu = async (category: string, folders: Set<string>): Promise<void> => {
    setAtMenuGroups(await buildLevel2MenuItems(category, () => {}, () => {}, () => {}, folders, undefined, () => {}, new Set()));
    setAtMenuLevel('detail');
    setCurrentCategory(category);
    setAtMenuHighlightIndex(0);
  };

  const closeAtMenu = (): void => {
    setIsAtMenuOpen(false);
    setAtMenuLevel('main');
    setCurrentCategory('');
    setExpandedFolders(new Set());
    setAtMenuHeight(undefined);
    setAtMenuHighlightIndex(0);
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
      if (folders.has(folderPath)) folders.delete(folderPath);
      else folders.add(folderPath);
      setExpandedFolders(folders);
      await loadLevel2Menu(currentCategory, folders);
      return;
    }

    if (value.startsWith('recent-file-')) {
      const response = await window.electron?.workspace?.getRecentFiles();
      const index = Number.parseInt(value.replace('recent-file-', ''), 10);
      const filePath = response?.success && response.data ? response.data[index] || '' : '';
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
      if (template?.content?.trim()) insertPromptText(template.content.trim(), true);
      closeAtMenu();
      return;
    }

    if (value.startsWith('kb-')) {
      const kbId = value.replace('kb-', '');
      const item = await knowledgeBaseService.findItem(kbId);
      if (item && item.type === 'folder') {
        setKnowledgeBases((currentItems) => currentItems.some((entry) => entry.id === kbId) ? currentItems : [...currentItems, { id: kbId, name: item.title }]);
        insertPromptText(`@${item.title} `, true);
      }
      closeAtMenu();
      return;
    }

    if (value.startsWith('form-')) {
      const formId = value.replace('form-', '');
      const formDetail = await tableReferenceService.getFormDetail(formId);
      if (formDetail) {
        setForms((currentItems) => currentItems.some((entry) => entry.id === formId) ? currentItems : [...currentItems, { id: formId, name: formDetail.name }]);
        insertPromptText(`@${formDetail.name} `, true);
      }
      closeAtMenu();
    }
  };

  const handleAtMenuNavigate = (direction: 'up' | 'down'): void => {
    const totalItems = atMenuGroups.reduce((count, group) => count + group.items.length, 0);
    if (totalItems === 0) return;
    setAtMenuHighlightIndex((currentIndex) => direction === 'up'
      ? (currentIndex <= 0 ? totalItems - 1 : currentIndex - 1)
      : (currentIndex >= totalItems - 1 ? 0 : currentIndex + 1));
  };

  const handleAtMenuSelectHighlighted = async (): Promise<void> => {
    let currentIndex = 0;
    for (const group of atMenuGroups) {
      for (const item of group.items) {
        if (currentIndex === atMenuHighlightIndex) {
          await handleAtMenuSelect(item.value);
          return;
        }
        currentIndex += 1;
      }
    }
  };

  const getSelectionText = (): string => {
    const selection = view.state.selection.main;
    return selection.from < selection.to ? view.state.sliceDoc(selection.from, selection.to) : (initialSelection || '');
  };

  const handleSend = async (): Promise<void> => {
    if (isLoading || !selectedModel) return;

    const inputText = tiptapInputRef.current?.getText().trim() || '';
    const currentFileReferences = tiptapInputRef.current?.getFileReferences() ?? fileReferences;
    if (!inputText && currentFileReferences.length === 0 && knowledgeBases.length === 0 && forms.length === 0) return;

    const userMessageId = createId();
    const assistantMessageId = createId();
    const selectionText = getSelectionText().trim();
    setMessages((currentMessages) => [...currentMessages, { id: userMessageId, role: 'user', content: inputText || '[context only]', timestamp: Date.now() }, { id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true }]);
    setIsLoading(true);
    tiptapInputRef.current?.clear();
    setFileReferences([]);
    setKnowledgeBases([]);
    setForms([]);

    let fileContext = '';
    for (const reference of currentFileReferences) {
      try {
        const content = await window.electronAPI?.fs?.readFile?.(reference.path, 'utf-8');
        if (content) fileContext += `[File] ${reference.name}\n${trimContent(content, 3000)}\n\n`;
      } catch (error) {
        console.warn('[InlineAIChat] Failed to read referenced file:', error);
      }
    }

    try {
      const modelConfig = await getModelConfig(selectedModel);
      if (!modelConfig) throw new Error(`Model config not found: ${selectedModel}`);
      const actualModelName = modelConfig.modelId.includes(':') ? modelConfig.modelId.split(':')[1] : modelConfig.modelId;

      await aiService.setProvider(modelConfig.providerId, {
        name: modelConfig.configName,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint,
        modelId: actualModelName,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
      });

      const contextBlocks: string[] = [];
      if (selectionText) contextBlocks.push(`[Selected Text]\n${selectionText}`);
      if (fileContext.trim()) contextBlocks.push(fileContext.trim());
      if (knowledgeBases.length > 0) contextBlocks.push(`[Knowledge Bases]\n${knowledgeBases.map((item) => item.name).join(', ')}`);
      if (forms.length > 0) contextBlocks.push(`[Forms]\n${forms.map((item) => item.name).join(', ')}`);
      const finalPrompt = contextBlocks.length > 0 ? `${contextBlocks.join('\n\n')}\n\n[User Request]\n${inputText || 'Use the provided context.'}` : inputText;

      const requestParams: AIRequestParams = {
        model: actualModelName,
        messages: [...messages.filter((message) => !message.isStreaming).map((message) => ({ role: message.role, content: message.content })), { role: 'user', content: finalPrompt }],
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        signal: (abortControllerRef.current = new AbortController()).signal,
      };

      let fullResponse = '';
      const streamCallback: StreamCallback = {
        onContent: (content: string) => {
          fullResponse += content;
          setMessages((currentMessages) => currentMessages.map((message) => message.id === assistantMessageId ? { ...message, content: fullResponse, isStreaming: true } : message));
        },
        onComplete: (response: AIResponse) => {
          if (!fullResponse && response.content) fullResponse = response.content;
          setMessages((currentMessages) => currentMessages.map((message) => message.id === assistantMessageId ? { ...message, content: fullResponse, isStreaming: false } : message));
          setIsLoading(false);
          abortControllerRef.current = null;
        },
        onError: (error: Error) => {
          const fallback = fullResponse || `Request failed: ${error.message || 'Unknown error'}`;
          setMessages((currentMessages) => currentMessages.map((message) => message.id === assistantMessageId ? { ...message, content: fallback, isStreaming: false } : message));
          setIsLoading(false);
          abortControllerRef.current = null;
        },
      };

      await aiService.generateTextStream(requestParams, streamCallback);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMessages((currentMessages) => currentMessages.map((item) => item.id === assistantMessageId ? { ...item, content: `Request failed: ${message}`, isStreaming: false } : item));
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleAIAbilityClick = (type: 'polish' | 'expand' | 'shorten' | 'tone', tone?: string): void => {
    const selectionText = getSelectionText().trim();
    if (!selectionText) {
      tiptapInputRef.current?.insertText('Please select some text first.');
      return;
    }
    const prompts: Record<'polish' | 'expand' | 'shorten', string> = {
      polish: `Please polish the following text:\n\n${selectionText}`,
      expand: `Please expand the following text:\n\n${selectionText}`,
      shorten: `Please shorten the following text:\n\n${selectionText}`,
    };
    tiptapInputRef.current?.setText(type === 'tone' ? `Please rewrite the following text in a ${tone || 'professional'} tone:\n\n${selectionText}` : prompts[type]);
    tiptapInputRef.current?.focus();
    setIsSparklesMenuOpen(false);
    setIsToneSubmenuOpen(false);
  };

  const getModelDisplayName = (modelId: string): string => availableModels.find((model) => model.modelId === modelId)?.displayName || (modelId.includes(':') ? modelId.split(':')[1] : modelId || 'Select Model');

  return (
    <div className="cm-inline-ai-chat">
      <div className="cm-inline-ai-header">
        <div className="cm-inline-ai-header-left"><span className="cm-inline-ai-title">AI Assistant</span>{getSelectionText().trim() && <span className="cm-inline-ai-selection-badge">Selected</span>}</div>
        <div className="cm-inline-ai-header-right">
          <div className="cm-inline-ai-sparkles-menu">
            <span className="cm-inline-ai-sparkles-btn" onClick={() => { setIsSparklesMenuOpen((open) => !open); setIsToneSubmenuOpen(false); }} title="Quick actions"><Icon name="sparkles" size={14} /></span>
            {isSparklesMenuOpen && <div className="cm-inline-ai-sparkles-dropdown"><div className="cm-inline-ai-sparkles-option" onClick={() => handleAIAbilityClick('polish')}>Polish</div><div className="cm-inline-ai-sparkles-option" onClick={() => handleAIAbilityClick('expand')}>Expand</div><div className="cm-inline-ai-sparkles-option" onClick={() => handleAIAbilityClick('shorten')}>Shorten</div><div className="cm-inline-ai-sparkles-option cm-inline-ai-sparkles-option-submenu" onMouseEnter={() => setIsToneSubmenuOpen(true)} onMouseLeave={() => setIsToneSubmenuOpen(false)}><span>Rewrite Tone</span><Icon name="chevron-right" size={12} />{isToneSubmenuOpen && <div className="cm-inline-ai-tone-submenu"><div className="cm-inline-ai-sparkles-option" onClick={() => handleAIAbilityClick('tone', 'professional')}>Professional</div><div className="cm-inline-ai-sparkles-option" onClick={() => handleAIAbilityClick('tone', 'casual')}>Casual</div><div className="cm-inline-ai-sparkles-option" onClick={() => handleAIAbilityClick('tone', 'academic')}>Academic</div></div>}</div></div>}
          </div>
          <div className="cm-inline-ai-at-menu">
            <span className="cm-inline-ai-at-trigger" onClick={() => { if (isAtMenuOpen) closeAtMenu(); else { void loadLevel1Menu(); setIsAtMenuOpen(true); } }} title="Add context">@</span>
            {isAtMenuOpen && <Select value="" onChange={(value: string) => { void handleAtMenuSelect(value); }} groups={atMenuGroups} placeholder="Select context..." className="cm-inline-ai-at-select" showSearch={true} open={true} align="right" headerLeftIcon={atMenuLevel === 'detail' ? <Icon name="chevron-left" size={16} /> : undefined} onHeaderLeftClick={atMenuLevel === 'detail' ? () => { void loadLevel1Menu(); } : undefined} fixedHeight={atMenuLevel === 'detail' ? atMenuHeight : undefined} onHeightChange={atMenuLevel === 'main' ? setAtMenuHeight : undefined} onItemClick={(value: string) => !(value.startsWith('category-') || value.startsWith('folder-'))} onOpenChange={(open: boolean) => { if (!open) closeAtMenu(); }} />}
          </div>
          <span className="cm-inline-ai-close" onClick={onClose} title="Close"><Icon name="close" size={14} /></span>
        </div>
      </div>
      {messages.length > 0 && <div className="cm-inline-ai-messages">{messages.map((message) => <div key={message.id} className={`cm-inline-ai-message cm-inline-ai-message-${message.role}`}><div className="cm-inline-ai-message-content">{message.content || (message.isStreaming ? 'Thinking...' : '')}{message.isStreaming && <span className="cm-inline-ai-cursor" />}</div></div>)}<div ref={messagesEndRef} /></div>}
      <div className="cm-inline-ai-input-area">
        <TipTapInput ref={tiptapInputRef} className="cm-inline-ai-tiptap-input" placeholder="Describe what you want AI to help with..." onSubmit={() => { void handleSend(); }} onEscape={onClose} onChange={() => setFileReferences(tiptapInputRef.current?.getFileReferences() ?? [])} onAtTrigger={() => { if (!isAtMenuOpen) { void loadLevel1Menu(); setIsAtMenuOpen(true); } }} onAtCancel={closeAtMenu} onFileReferencesChange={setFileReferences} isAtMenuOpen={isAtMenuOpen} onAtMenuNavigate={handleAtMenuNavigate} onAtMenuSelect={() => { void handleAtMenuSelectHighlighted(); }} onAtMenuBack={() => { void loadLevel1Menu(); }} />
        <div className="cm-inline-ai-toolbar">
          <div className={`cm-inline-ai-model-select ${isModelDropdownOpen ? 'open' : ''}`}>
            <span ref={modelTriggerRef} className="cm-inline-ai-model-trigger" onClick={() => { if (!isModelDropdownOpen) { const rect = modelTriggerRef.current?.getBoundingClientRect(); if (rect) setDropdownDirection(rect.bottom + 260 > window.innerHeight ? 'up' : 'down'); } setIsModelDropdownOpen((open) => !open); }}>{getModelDisplayName(selectedModel)}<Icon name="chevron-down" size={12} /></span>
            {isModelDropdownOpen && <div className={`cm-inline-ai-model-dropdown cm-inline-ai-model-dropdown-${dropdownDirection}`}>{availableModels.map((model) => <div key={model.modelId} className={`cm-inline-ai-model-option ${model.modelId === selectedModel ? 'selected' : ''}`} onClick={() => { setSelectedModel(model.modelId); setIsModelDropdownOpen(false); }}><span className="cm-inline-ai-model-name">{model.displayName || model.modelId.split(':')[1] || model.modelId}</span>{model.capabilities?.thinking && <span className="cm-inline-ai-model-badge">Thinking</span>}</div>)}</div>}
          </div>
          <div className="cm-inline-ai-actions">
            {messages.some((message) => message.role === 'assistant' && !message.isStreaming && message.content.trim()) && <span className="cm-inline-ai-btn" onClick={() => { const lastMessage = [...messages].reverse().find((message) => message.role === 'assistant' && !message.isStreaming && message.content.trim()); if (lastMessage) onInsert(lastMessage.content); }} title="Insert into editor"><Icon name="check" size={14} />Insert</span>}
            {isLoading ? <span className="cm-inline-ai-btn cm-inline-ai-btn-stop" onClick={() => { abortControllerRef.current?.abort(); abortControllerRef.current = null; setIsLoading(false); }} title="Stop"><Icon name="close" size={14} />Stop</span> : <span className={`cm-inline-ai-btn cm-inline-ai-btn-send ${!selectedModel ? 'disabled' : ''}`} onClick={() => { void handleSend(); }} title="Send"><Icon name="send" size={14} />Send</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
