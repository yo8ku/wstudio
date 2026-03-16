import * as monaco from 'monaco-editor';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { inlineChatHistoryService } from '../../../../services';
import { getPromptTemplateById } from '../../../../services/PromptTemplateService';
import { tableReferenceService } from '../../../../services/tableReference/TableReferenceService';
import { Select, type SelectGroup } from '../../../common/Select';
import { Icon } from '../../../Icons/Icon';
import { knowledgeBaseService } from '../../../Layout/Sidebar/KnowledgeBase/knowledgeBaseService';
import { getCloseIconSvg, getSendIconSvg } from '../iconHelpers/iconHelpers';
import { buildLevel1MenuItems, buildLevel2MenuItems } from './buildContextMenuItems';
import { InlineChatHistory } from './InlineChatHistory';
import { TipTapInput, type TipTapInputRef } from './TipTapInput';

interface AIZoneWidgetOptions {
  onSubmit: (message: string, includeSelection: boolean, selectedModel?: string) => void;
  onClose: () => void;
  onStop?: () => void;
  onAccept?: () => void;
  onClearDiff?: () => void;
  onHeightChanged?: (height: number) => void;
  availableModels?: string[];
}

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AppendMessageOptions {
  displayInResponse?: boolean;
}

interface SelectedItem {
  path: string;
  name: string;
  type?: 'file' | 'knowledge-base' | 'form';
  kbId?: string;
  formId?: string;
}

interface MutableViewZone extends monaco.editor.IViewZone {
  afterLineNumber: number;
  heightInPx: number;
  domNode: HTMLElement;
}

type ContextMenuSource = 'toolbar' | 'input';

const DEFAULT_ZONE_HEIGHT = 152;
const MIN_ZONE_HEIGHT = 132;
const MAX_ZONE_WIDTH = 834;
const MIN_ZONE_WIDTH = 280;

const LABEL_ACCEPT = '接受';
const LABEL_CANCEL = '取消';
const LABEL_CLEAR = '清除';
const LABEL_DEEP_THINKING = '深度思考';
const LABEL_PLACEHOLDER = '向AI描述您想要做什么...';
const LABEL_SELECTED_TEXT = '已包含选中文本';
const LABEL_THINKING = '正在思考';

export class AIZoneWidget {
  private static instances: Map<string, AIZoneWidget> = new Map();

  private editor: monaco.editor.IStandaloneCodeEditor;
  private options: AIZoneWidgetOptions;
  private tabId?: string;
  private zone: MutableViewZone | null = null;
  private zoneId: string | null = null;
  private zoneHostNode: HTMLDivElement;
  private domNode: HTMLDivElement;
  private contentNode: HTMLDivElement;
  private completedResponseNode: HTMLDivElement;
  private topBorderNode: HTMLDivElement;
  private bottomBorderNode: HTMLDivElement;
  private messageDisplay: HTMLDivElement;
  private responseDisplay: HTMLDivElement;
  private thinkingNode: HTMLDivElement;
  private selectedFilesToolbar: HTMLDivElement;
  public bottomToolbar: HTMLDivElement;
  private inputWrapper: HTMLDivElement;
  private inputActions: HTMLDivElement;
  private tiptapInputContainer: HTMLDivElement;
  private modelDropdown: HTMLDivElement;
  private sendButton: HTMLButtonElement;
  private closeButton: HTMLButtonElement;
  private newChatButton: HTMLButtonElement;
  private addContextButton: HTMLButtonElement;
  private deepThinkingButton: HTMLButtonElement;
  private historyButton: HTMLButtonElement;
  private tiptapInputRoot: Root;
  private tiptapInputRef: TipTapInputRef | null = null;
  private modelDropdownRoot: Root;
  private historyMenuContainer: HTMLDivElement;
  private historyMenuRoot: Root;
  private contextMenuContainer: HTMLDivElement;
  private contextMenuRoot: Root;
  private auxiliaryRoots: Root[] = [];
  private layoutFrameId: number | null = null;
  private layoutDisposable: monaco.IDisposable | null = null;
  private scrollDisposable: monaco.IDisposable | null = null;
  private chatHistory: ChatHistoryItem[] = [];
  private selectedFiles: SelectedItem[] = [];
  private submittedReferences: SelectedItem[] = [];
  private modelGroups: SelectGroup[] = [];
  private currentUserMessage = '';
  private assistantResponse = '';
  private currentFileUri = '';
  private selectedModel?: string;
  private deepThinkingEnabled = true;
  private visible = false;
  private disposed = false;
  private isHistoryOpen = false;
  private isModelDropdownOpen = false;
  private isContextMenuOpen = false;
  private isResponseCompleted = false;
  private contextMenuLevel: 'main' | 'detail' = 'main';
  private contextMenuSource: ContextMenuSource = 'toolbar';
  private contextMenuHighlightIndex = 0;
  private currentCategory = '';
  private expandedFolders: Set<string> = new Set<string>();
  private contextMenuValues: string[] = [];
  private targetLineNumber = 0;
  private thinkingText = '';
  private currentHeight = DEFAULT_ZONE_HEIGHT;

  public selectedText = '';
  public includeSelection = false;
  public isGenerating = false;

  constructor(
    editor: monaco.editor.IStandaloneCodeEditor,
    options: AIZoneWidgetOptions,
    tabId?: string
  ) {
    this.editor = editor;
    this.options = options;
    this.tabId = tabId;
    this.currentFileUri = editor.getModel()?.uri?.toString() ?? '';
    this.selectedModel = options.availableModels?.[0];

    this.zoneHostNode = document.createElement('div');
    this.zoneHostNode.className = 'ai-zone-view-zone';
    this.zoneHostNode.style.width = '100%';
    this.zoneHostNode.style.pointerEvents = 'auto';

    this.domNode = document.createElement('div');
    this.domNode.className = 'ai-zone-container';

    this.contentNode = document.createElement('div');
    this.contentNode.className = 'ai-zone-content';

    this.completedResponseNode = document.createElement('div');
    this.completedResponseNode.className = 'ai-zone-completed-response';
    this.completedResponseNode.hidden = true;

    this.topBorderNode = document.createElement('div');
    this.topBorderNode.className = 'ai-zone-border ai-zone-border-top';

    this.bottomBorderNode = document.createElement('div');
    this.bottomBorderNode.className = 'ai-zone-border ai-zone-border-bottom';

    this.messageDisplay = document.createElement('div');
    this.messageDisplay.className = 'ai-zone-message-display';
    this.messageDisplay.hidden = true;

    this.responseDisplay = document.createElement('div');
    this.responseDisplay.className = 'ai-zone-message-display ai-zone-message-overlay';
    this.responseDisplay.hidden = true;

    this.thinkingNode = document.createElement('div');
    this.thinkingNode.className = 'ai-zone-message-content';
    this.thinkingNode.hidden = true;

    this.selectedFilesToolbar = document.createElement('div');
    this.selectedFilesToolbar.className = 'ai-zone-selected-files-toolbar';
    this.selectedFilesToolbar.hidden = true;

    this.inputWrapper = document.createElement('div');
    this.inputWrapper.className = 'ai-zone-input-wrapper';

    this.inputActions = document.createElement('div');
    this.inputActions.className = 'ai-zone-input-actions';

    this.tiptapInputContainer = document.createElement('div');
    this.tiptapInputContainer.className = 'ai-zone-tiptap-container';

    this.modelDropdown = document.createElement('div');
    this.modelDropdown.className = 'ai-zone-input-model-dropdown';

    this.sendButton = document.createElement('button');
    this.sendButton.type = 'button';
    this.sendButton.className = 'ai-zone-send-btn';

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'ai-zone-close-btn';

    this.newChatButton = document.createElement('button');
    this.newChatButton.type = 'button';
    this.newChatButton.className = 'ai-zone-toolbar-icon-btn';
    this.newChatButton.title = '新建聊天';

    this.addContextButton = document.createElement('button');
    this.addContextButton.type = 'button';
    this.addContextButton.className = 'ai-zone-add-context-btn';
    this.addContextButton.title = '添加上下文';

    this.deepThinkingButton = document.createElement('button');
    this.deepThinkingButton.type = 'button';
    this.deepThinkingButton.className = 'ai-zone-toolbar-icon-btn active';
    this.deepThinkingButton.title = '深度思考已开启';

    this.historyButton = document.createElement('button');
    this.historyButton.type = 'button';
    this.historyButton.className = 'ai-zone-toolbar-icon-btn';
    this.historyButton.title = '历史记录';

    this.bottomToolbar = document.createElement('div');
    this.bottomToolbar.className = 'ai-zone-bottom-toolbar';

    this.historyMenuContainer = document.createElement('div');
    document.body.appendChild(this.historyMenuContainer);
    this.contextMenuContainer = document.createElement('div');
    this.configureFloatingMenuContainer(this.contextMenuContainer);
    document.body.appendChild(this.contextMenuContainer);

    this.createDom();
    this.tiptapInputRoot = createRoot(this.tiptapInputContainer);
    this.modelDropdownRoot = createRoot(this.modelDropdown);
    this.historyMenuRoot = createRoot(this.historyMenuContainer);
    this.contextMenuRoot = createRoot(this.contextMenuContainer);
    this.bindEvents();
    this.renderTipTapInput();
    this.syncModelOptions();
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.syncWidth();

    this.layoutDisposable = this.editor.onDidLayoutChange(() => {
      this.syncWidth();
      this.scheduleLayout();
    });

    this.scrollDisposable = this.editor.onDidScrollChange(() => {
      this.scheduleLayout();
    });

    if (tabId) {
      const existing = AIZoneWidget.instances.get(tabId);
      existing?.dispose();
      AIZoneWidget.instances.set(tabId, this);
    }
  }

  static getInstanceByTabId(tabId: string): AIZoneWidget | null {
    return AIZoneWidget.instances.get(tabId) ?? null;
  }

  static getAllInstances(): AIZoneWidget[] {
    return Array.from(AIZoneWidget.instances.values());
  }

  static getInstance(): AIZoneWidget | null {
    return AIZoneWidget.getAllInstances()[0] ?? null;
  }

  static hasInstanceByTabId(tabId: string): boolean {
    return AIZoneWidget.instances.has(tabId);
  }

  static hasInstance(): boolean {
    return AIZoneWidget.instances.size > 0;
  }

  getTabId(): string | undefined {
    return this.tabId;
  }

  updateAvailableModels(models: string[]): void {
    this.options.availableModels = models;
    if (!this.selectedModel || !models.includes(this.selectedModel)) {
      this.selectedModel = models[0];
    }
    this.syncModelOptions();
  }

  getDomNode(): HTMLDivElement | null {
    return this.disposed ? null : this.domNode;
  }

  getInputElement(): HTMLTextAreaElement | null {
    return null;
  }

  getZoneBottomLineNumber(): number {
    return this.targetLineNumber || this.editor.getPosition()?.lineNumber || 1;
  }

  getSelectedFiles(): SelectedItem[] {
    return [...this.selectedFiles];
  }

  setSelectedFiles(items: SelectedItem[]): void {
    this.selectedFiles = [...items];
    this.renderSelectedFilesToolbar();
    this.scheduleLayout();
  }

  updateSelectedFilesToolbar(): void {
    this.renderSelectedFilesToolbar();
    this.scheduleLayout();
  }

  updateThinkingText(text: string): void {
    this.thinkingText = text;
    this.renderChatHistory();
    this.renderThinkingState();
    this.scheduleLayout();
  }

  getThinkingText(): string {
    return this.thinkingText;
  }

  getChatHistory(): ChatHistoryItem[] {
    return [...this.chatHistory];
  }

  clearChatHistory(): void {
    this.chatHistory = [];
    this.currentUserMessage = '';
    this.assistantResponse = '';
    this.isResponseCompleted = false;
    this.submittedReferences = [];
    this.renderChatHistory();
    this.renderSelectedFilesToolbar();
    this.scheduleLayout();
  }

  getDeepThinkingEnabled(): boolean {
    return false;
  }

  show(lineNumber: number, selectedText: string = ''): void {
    if (this.disposed) {
      return;
    }

    this.visible = true;
    this.targetLineNumber = lineNumber;
    this.selectedText = selectedText;
    this.includeSelection = selectedText.trim().length > 0;
    this.mountZone();
    this.attachBorders();
    this.renderSelectedFilesToolbar();
    this.editor.getDomNode()?.classList.add('ai-zone-active');
    this.scheduleLayout();
    this.focusInput();
  }

  hide(): void {
    if (this.disposed) {
      return;
    }

    this.visible = false;
    this.closeModelDropdown();
    this.closeContextMenu();
    this.removeZone();
    this.detachBorders();
    this.editor.getDomNode()?.classList.remove('ai-zone-active');
    this.options.onHeightChanged?.(0);
  }

  isVisible(): boolean {
    return this.visible;
  }

  appendMessage(
    role: 'user' | 'assistant',
    content: string,
    options: AppendMessageOptions = {}
  ): void {
    this.chatHistory.push({ role, content, timestamp: Date.now() });

    if (role === 'user') {
      this.currentUserMessage = content;
      this.assistantResponse = '';
      this.isResponseCompleted = false;
    } else {
      const displayInResponse = options.displayInResponse ?? true;
      this.assistantResponse = displayInResponse ? content : '';
      this.isGenerating = false;
      this.isResponseCompleted = content.trim().length > 0;
      this.thinkingText = '';
      this.bottomToolbar.style.display = 'flex';
    }

    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.scheduleLayout();
  }

  onAIResponseStart(): void {
    this.isGenerating = true;
    this.isResponseCompleted = false;
    this.bottomToolbar.style.display = 'none';
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.scheduleLayout();
  }

  onAIResponseComplete(): void {
    this.isGenerating = false;
    this.isResponseCompleted = this.isResponseCompleted || this.assistantResponse.trim().length > 0;
    this.bottomToolbar.style.display = 'flex';
    if (!this.isResponseCompleted) {
      this.thinkingText = '';
    }
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.scheduleLayout();
  }

  submit(message: string, selectedModel?: string): void {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    this.appendMessage('user', trimmedMessage);
    this.options.onSubmit(trimmedMessage, this.includeSelection, selectedModel ?? this.selectedModel);
  }

  stop(): void {
    this.isGenerating = false;
    this.thinkingText = '';
    this.bottomToolbar.style.display = 'flex';
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.options.onStop?.();
  }

  accept(): void {
    this.options.onAccept?.();
  }

  clearDiff(): void {
    this.options.onClearDiff?.();
    this.clearCurrentConversation();
  }

  hideThinkingState(): void {
    this.thinkingText = '';
    this.renderChatHistory();
    this.renderThinkingState();
  }

  updateSendButton(): void {
    const hasText = (this.tiptapInputRef?.getText().trim() ?? '').length > 0;
    this.sendButton.innerHTML = this.isGenerating
      ? this.getStopIconSvg('ai-zone-send-icon')
      : getSendIconSvg('ai-zone-send-icon');
    this.sendButton.title = this.isGenerating ? '停止生成' : '发送(Enter)';
    this.sendButton.disabled = this.isGenerating ? false : !hasText;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.hide();
    this.disposed = true;

    if (this.layoutFrameId !== null) {
      window.cancelAnimationFrame(this.layoutFrameId);
      this.layoutFrameId = null;
    }

    this.layoutDisposable?.dispose();
    this.scrollDisposable?.dispose();

    this.tiptapInputRoot.unmount();
    this.modelDropdownRoot.unmount();
    this.historyMenuRoot.unmount();
    this.contextMenuRoot.unmount();

    for (const root of this.auxiliaryRoots) {
      root.unmount();
    }
    this.auxiliaryRoots = [];

    this.historyMenuContainer.remove();
    this.contextMenuContainer.remove();
    this.zoneHostNode.remove();
    this.domNode.remove();

    if (this.tabId && AIZoneWidget.instances.get(this.tabId) === this) {
      AIZoneWidget.instances.delete(this.tabId);
    }
  }

  private createDom(): void {
    this.domNode.addEventListener('mousedown', (event: MouseEvent) => {
      event.stopPropagation();
    });
    this.domNode.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
    });

    this.sendButton.innerHTML = getSendIconSvg('ai-zone-send-icon');
    this.closeButton.innerHTML = getCloseIconSvg('ai-zone-close-icon');
    this.closeButton.title = '关闭';

    this.mountIcon(this.newChatButton, 'plus');
    this.addContextButton.textContent = '@';

    const thinkingText = document.createElement('div');
    thinkingText.className = 'ai-zone-message-text ai-zone-thinking-dots';
    this.thinkingNode.appendChild(thinkingText);

    this.inputActions.append(this.modelDropdown, this.sendButton, this.closeButton);
    this.inputWrapper.append(this.tiptapInputContainer, this.inputActions);

    const leftControls = document.createElement('div');
    leftControls.className = 'ai-zone-left-controls';

    const addContextContainer = document.createElement('div');
    addContextContainer.className = 'ai-zone-add-context-btn-container';
    addContextContainer.appendChild(this.addContextButton);

    leftControls.append(this.newChatButton, addContextContainer);

    this.bottomToolbar.appendChild(leftControls);
    this.contentNode.append(
      this.messageDisplay,
      this.inputWrapper,
      this.selectedFilesToolbar,
      this.bottomToolbar
    );
    this.completedResponseNode.append(this.thinkingNode, this.responseDisplay);
    this.domNode.append(this.contentNode, this.completedResponseNode);
    this.zoneHostNode.appendChild(this.domNode);
  }

  private bindEvents(): void {
    this.sendButton.addEventListener('click', () => {
      if (this.isGenerating) {
        this.stop();
        return;
      }
      this.handleSubmit();
    });

    this.closeButton.addEventListener('click', () => {
      this.options.onClose();
    });

    this.newChatButton.addEventListener('click', () => {
      this.createNewChat();
    });

    this.addContextButton.addEventListener('click', () => {
      void this.openToolbarContextMenu();
    });

    this.deepThinkingButton.addEventListener('click', () => {
      this.deepThinkingEnabled = !this.deepThinkingEnabled;
      this.deepThinkingButton.classList.toggle('active', this.deepThinkingEnabled);
      this.deepThinkingButton.title = this.deepThinkingEnabled ? '深度思考已开启' : '深度思考已关闭';
      this.renderThinkingState();
    });

    this.historyButton.addEventListener('click', () => {
      this.toggleHistoryMenu();
    });
  }

  private renderTipTapInput(): void {
    this.tiptapInputRoot.render(
      React.createElement(TipTapInput, {
        ref: (ref: TipTapInputRef | null) => {
          this.tiptapInputRef = ref;
        },
        placeholder: LABEL_PLACEHOLDER,
        onSubmit: () => {
          this.handleSubmit();
        },
        onEscape: () => {
          this.options.onClose();
        },
        onChange: () => {
          this.updateSendButton();
          this.scheduleLayout();
        },
        onAtTrigger: (query: string, position: { top: number; left: number }) => {
          void this.openInputContextMenu(query, position);
        },
        onAtCancel: () => {
          this.closeContextMenu();
        },
        onFileReferencesChange: () => {
          this.updateSendButton();
          this.scheduleLayout();
        },
        isAtMenuOpen: this.isContextMenuOpen,
        onAtMenuNavigate: (direction: 'up' | 'down') => {
          this.navigateContextMenu(direction);
        },
        onAtMenuSelect: () => {
          void this.selectHighlightedContextMenuItem();
        },
        onAtMenuBack: () => {
          void this.goBackToLevel1Menu();
        },
      })
    );
  }

  private handleSubmit(): void {
    const message = this.tiptapInputRef?.getText().trim() ?? '';
    if (!message) {
      return;
    }

    const inputReferences = this.getCurrentInputFileReferences();
    this.submittedReferences = this.mergeReferences(inputReferences, this.selectedFiles);
    this.selectedFiles = [];
    this.assistantResponse = '';
    this.isGenerating = true;
    this.isResponseCompleted = false;
    this.thinkingText = '';
    this.bottomToolbar.style.display = 'none';
    this.closeContextMenu();
    this.renderSelectedFilesToolbar();
    this.renderThinkingState();
    this.updateSendButton();

    this.tiptapInputRef?.clear();
    this.submit(message, this.selectedModel);
  }

  private syncModelOptions(): void {
    this.modelGroups = this.buildModelGroups(this.options.availableModels ?? []);
    if (!this.selectedModel || !(this.options.availableModels ?? []).includes(this.selectedModel)) {
      this.selectedModel = this.options.availableModels?.[0];
    }
    this.renderModelDropdown();
  }

  private buildModelGroups(models: string[]): SelectGroup[] {
    const grouped = new Map<string, Array<{ value: string; label: string }>>();

    for (const model of models) {
      const [providerId, modelName] = model.includes(':') ? model.split(':', 2) : ['模型', model];
      const providerLabel = providerId
        .split(/[-_]/)
        .filter((segment) => segment.length > 0)
        .map((segment) => segment[0].toUpperCase() + segment.slice(1))
        .join(' ');

      if (!grouped.has(providerLabel)) {
        grouped.set(providerLabel, []);
      }

      grouped.get(providerLabel)?.push({
        value: model,
        label: modelName || model,
      });
    }

    return Array.from(grouped.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }

  private renderModelDropdown(): void {
    const hasModels = this.modelGroups.length > 0;
    const groups = hasModels
      ? this.modelGroups
      : [{
          groupName: '',
          items: [{ value: '__empty__', label: '暂无可用模型', disabled: true }],
        }];

    this.modelDropdownRoot.render(
      React.createElement(Select, {
        value: hasModels ? (this.selectedModel ?? '') : '',
        onChange: (value: string) => {
          if (value && value !== '__empty__') {
            this.selectedModel = value;
            this.renderModelDropdown();
          }
        },
        groups,
        placeholder: '选择模型',
        className: 'ai-zone-input-model-select',
        showSearch: true,
        align: 'parent',
        menuGap: 3,
        disabled: !hasModels,
        open: this.isModelDropdownOpen,
        onOpenChange: (isOpen: boolean) => {
          this.isModelDropdownOpen = isOpen;
          if (isOpen) {
            this.closeContextMenu();
          }
          this.renderModelDropdown();
        },
      })
    );
  }

  private renderChatHistory(): void {
    this.messageDisplay.replaceChildren();
    this.responseDisplay.replaceChildren();
    const displayAssistantResponse = !this.isPlaceholderOnlyText(this.assistantResponse);

    if (this.currentUserMessage.trim().length > 0) {
      this.messageDisplay.appendChild(
        this.createMessageRow('user', this.currentUserMessage, this.shouldShowInlineThinkingDots())
      );
      this.messageDisplay.hidden = false;
    } else {
      this.messageDisplay.hidden = true;
    }

    if (displayAssistantResponse) {
      this.responseDisplay.appendChild(this.createMessageRow('assistant', this.assistantResponse));
      this.responseDisplay.hidden = false;
    } else {
      this.responseDisplay.hidden = true;
    }

    this.updateResponseVisibility();
  }

  private isPlaceholderOnlyText(content: string): boolean {
    const normalizedContent = content.trim();
    return normalizedContent.length === 0
      || normalizedContent === LABEL_THINKING
      || /^[.\u2026]+$/.test(normalizedContent);
  }

  private shouldShowInlineThinkingDots(): boolean {
    return this.isGenerating
      && this.thinkingText.trim().length === 0
      && this.assistantResponse.trim().length === 0
      && this.currentUserMessage.trim().length > 0;
  }

  private createMessageRow(
    role: 'user' | 'assistant',
    content: string,
    showThinkingDots = false
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'ai-zone-message-content';

    const text = document.createElement('div');
    text.className = 'ai-zone-message-text';
    text.textContent = content;
    text.classList.toggle('ai-zone-thinking-dots', showThinkingDots);

    if (role === 'user') {
      row.append(this.createAvatar(role), text);
    } else {
      row.appendChild(text);
    }
    return row;
  }

  private createAvatar(role: 'user' | 'assistant'): HTMLDivElement {
    const avatar = document.createElement('div');
    avatar.className = 'ai-zone-message-avatar';
    avatar.textContent = role === 'assistant' ? 'AI' : 'U';
    return avatar;
  }

  private renderThinkingState(): void {
    this.thinkingNode.hidden = true;
    this.updateResponseVisibility();
  }

  private renderSelectedFilesToolbar(): void {
    this.selectedFilesToolbar.replaceChildren();
    this.selectedFilesToolbar.classList.remove('ai-zone-result-toolbar', 'ai-zone-cancel-toolbar');

    if (this.isGenerating) {
      this.selectedFilesToolbar.hidden = false;
      this.selectedFilesToolbar.classList.add('ai-zone-cancel-toolbar');
      this.selectedFilesToolbar.appendChild(
        this.createActionButton(LABEL_CANCEL, '取消本次提问', () => {
          this.stop();
        })
      );
      return;
    }

    if (this.isResponseCompleted) {
      this.selectedFilesToolbar.hidden = false;
      this.selectedFilesToolbar.classList.add('ai-zone-result-toolbar');

      if (this.submittedReferences.length > 0) {
        const referencedFiles = document.createElement('div');
        referencedFiles.className = 'ai-zone-referenced-files';

        for (const item of this.submittedReferences) {
          const chip = document.createElement('div');
          chip.className = 'ai-zone-referenced-file-item';
          chip.textContent = item.name;
          referencedFiles.appendChild(chip);
        }

        this.selectedFilesToolbar.appendChild(referencedFiles);
      }

      const actions = document.createElement('div');
      actions.className = 'ai-zone-result-actions-container';
      const leftActions = document.createElement('div');
      leftActions.className = 'ai-zone-result-actions-left';
      leftActions.append(
        this.createActionButton(LABEL_ACCEPT, '接受更改', () => {
          this.accept();
        }),
        this.createActionButton(LABEL_CLEAR, '清除当前结果', () => {
          this.clearDiff();
        })
      );

      actions.appendChild(leftActions);
      this.selectedFilesToolbar.appendChild(actions);
      return;
    }

    const hasSelection = this.includeSelection && this.selectedText.trim().length > 0;
    const hasFiles = this.selectedFiles.length > 0;

    if (!hasSelection && !hasFiles) {
      this.selectedFilesToolbar.hidden = true;
      return;
    }

    this.selectedFilesToolbar.hidden = false;

    if (hasSelection) {
      this.selectedFilesToolbar.appendChild(
        this.createChip(LABEL_SELECTED_TEXT, () => {
          this.includeSelection = false;
          this.renderSelectedFilesToolbar();
          this.scheduleLayout();
        })
      );
    }

    for (const item of this.selectedFiles) {
      this.selectedFilesToolbar.appendChild(
        this.createChip(item.name, () => {
          this.selectedFiles = this.selectedFiles.filter((entry) => entry.path !== item.path);
          this.renderSelectedFilesToolbar();
          this.scheduleLayout();
        })
      );
    }
  }

  private createChip(text: string, onRemove: () => void): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'ai-zone-input-file-ref-chip';
    chip.textContent = text;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'ai-zone-selected-file-remove';
    removeButton.title = '移除';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      onRemove();
    });

    chip.appendChild(removeButton);
    return chip;
  }

  private createActionButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-zone-result-action ai-zone-result-action-text';
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private updateResponseVisibility(): void {
    const hasResponse = !this.thinkingNode.hidden || !this.responseDisplay.hidden;
    this.completedResponseNode.hidden = !hasResponse;
  }

  private mountZone(): void {
    if (this.zoneId) {
      this.removeZone();
    }

    this.zone = {
      afterLineNumber: this.targetLineNumber,
      heightInPx: this.currentHeight,
      domNode: this.zoneHostNode,
      suppressMouseDown: true,
    };

    this.editor.changeViewZones((accessor) => {
      if (!this.zone) {
        return;
      }
      this.zoneId = accessor.addZone(this.zone);
    });
  }

  private removeZone(): void {
    if (!this.zoneId) {
      return;
    }

    const currentZoneId = this.zoneId;
    this.zoneId = null;
    this.zone = null;

    this.editor.changeViewZones((accessor) => {
      accessor.removeZone(currentZoneId);
    });
  }

  private scheduleLayout(): void {
    if (this.disposed || !this.visible) {
      return;
    }

    if (this.layoutFrameId !== null) {
      window.cancelAnimationFrame(this.layoutFrameId);
    }

    this.layoutFrameId = window.requestAnimationFrame(() => {
      this.layoutFrameId = null;
      this.layoutZoneHeight();
    });
  }

  private layoutZoneHeight(): void {
    if (!this.zoneId || !this.zone) {
      return;
    }

    const measuredHeight = Math.max(
      MIN_ZONE_HEIGHT,
      Math.ceil(this.domNode.getBoundingClientRect().height + 8)
    );

    if (measuredHeight !== this.currentHeight) {
      this.currentHeight = measuredHeight;
      this.zone.heightInPx = measuredHeight;
      this.editor.changeViewZones((accessor) => {
        if (this.zoneId) {
          accessor.layoutZone(this.zoneId);
        }
      });
    }

    this.syncBorderPositions();
    this.options.onHeightChanged?.(this.currentHeight);
  }

  private syncWidth(): void {
    const layoutInfo = this.editor.getLayoutInfo();
    const nextWidth = Math.max(
      MIN_ZONE_WIDTH,
      Math.min(MAX_ZONE_WIDTH, layoutInfo.contentWidth - 12)
    );
    this.domNode.style.width = `${nextWidth}px`;
  }

  private attachBorders(): void {
    document.body.append(this.topBorderNode, this.bottomBorderNode);
    this.syncBorderPositions();
  }

  private detachBorders(): void {
    this.topBorderNode.remove();
    this.bottomBorderNode.remove();
  }

  private syncBorderPositions(): void {
    if (!this.visible) {
      return;
    }

    const editorNode = this.editor.getDomNode();
    if (!editorNode) {
      return;
    }

    const editorRect = editorNode.getBoundingClientRect();
    const contentRect = this.contentNode.getBoundingClientRect();
    if (editorRect.width <= 0 || contentRect.height <= 0) {
      return;
    }

    const left = `${editorRect.left}px`;
    const width = `${editorRect.width}px`;

    this.topBorderNode.style.left = left;
    this.topBorderNode.style.width = width;
    this.topBorderNode.style.top = `${contentRect.top}px`;

    this.bottomBorderNode.style.left = left;
    this.bottomBorderNode.style.width = width;
    this.bottomBorderNode.style.top = `${contentRect.bottom}px`;
  }

  private focusInput(): void {
    window.setTimeout(() => {
      this.tiptapInputRef?.focus();
    }, 0);
  }

  private createNewChat(): void {
    if (this.isGenerating) {
      this.stop();
    }

    this.options.onClearDiff?.();
    this.chatHistory = [];
    this.currentUserMessage = '';
    this.assistantResponse = '';
    this.selectedFiles = [];
    this.submittedReferences = [];
    this.isResponseCompleted = false;
    this.thinkingText = '';
    this.bottomToolbar.style.display = 'flex';
    this.closeContextMenu();

    this.tiptapInputRef?.clear();
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.scheduleLayout();
    this.focusInput();
  }

  private clearCurrentConversation(): void {
    this.assistantResponse = '';
    this.submittedReferences = [];
    this.isResponseCompleted = false;
    this.isGenerating = false;
    this.thinkingText = '';
    this.bottomToolbar.style.display = 'flex';
    this.closeContextMenu();
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.scheduleLayout();
    this.focusInput();
  }

  private toggleHistoryMenu(): void {
    if (this.isHistoryOpen) {
      this.closeHistoryMenu();
      return;
    }

    this.closeModelDropdown();
    this.closeContextMenu();
    this.isHistoryOpen = true;
    this.renderHistoryMenu();
  }

  private closeHistoryMenu(): void {
    if (!this.isHistoryOpen) {
      return;
    }

    this.isHistoryOpen = false;
    this.renderHistoryMenu();
  }

  private renderHistoryMenu(): void {
    this.historyMenuRoot.render(
      React.createElement(InlineChatHistory, {
        isOpen: this.isHistoryOpen,
        onClose: () => {
          this.closeHistoryMenu();
        },
        onSelectSession: (sessionId: string) => {
          void this.loadHistorySession(sessionId);
        },
        buttonRef: this.historyButton,
        currentFileUri: this.currentFileUri,
      })
    );
  }

  private async loadHistorySession(sessionId: string): Promise<void> {
    const messages = await inlineChatHistoryService.getMessages(sessionId);
    const history: ChatHistoryItem[] = [];

    for (const message of messages) {
      if (message.role === 'user' || message.role === 'assistant') {
        history.push({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
        });
      }
    }

    this.chatHistory = history;
    this.currentUserMessage = '';
    this.assistantResponse = '';

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry.role === 'assistant' && this.assistantResponse.length === 0) {
        this.assistantResponse = entry.content;
      }
      if (entry.role === 'user') {
        this.currentUserMessage = entry.content;
        break;
      }
    }

    this.isGenerating = false;
    this.isResponseCompleted = this.assistantResponse.trim().length > 0;
    this.thinkingText = '';
    this.bottomToolbar.style.display = 'flex';
    this.closeHistoryMenu();
    this.renderChatHistory();
    this.renderThinkingState();
    this.renderSelectedFilesToolbar();
    this.updateSendButton();
    this.scheduleLayout();
  }

  private closeModelDropdown(): void {
    if (!this.isModelDropdownOpen) {
      return;
    }
    this.isModelDropdownOpen = false;
    this.renderModelDropdown();
  }

  private configureFloatingMenuContainer(container: HTMLDivElement): void {
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.style.visibility = 'hidden';
    container.style.zIndex = '10000';
  }

  private positionContextMenu(top: number, left: number, width = 1, height = 1): void {
    this.contextMenuContainer.style.top = `${top}px`;
    this.contextMenuContainer.style.left = `${left}px`;
    this.contextMenuContainer.style.width = `${width}px`;
    this.contextMenuContainer.style.height = `${height}px`;
    this.contextMenuContainer.style.visibility = 'visible';
  }

  private resetContextMenuState(): void {
    this.contextMenuLevel = 'main';
    this.currentCategory = '';
    this.expandedFolders = new Set<string>();
    this.contextMenuHighlightIndex = 0;
  }

  private async openToolbarContextMenu(): Promise<void> {
    const buttonRect = this.addContextButton.getBoundingClientRect();

    this.contextMenuSource = 'toolbar';
    this.resetContextMenuState();
    this.closeHistoryMenu();
    this.closeModelDropdown();
    this.positionContextMenu(buttonRect.bottom + 4, buttonRect.left, buttonRect.width, buttonRect.height);
    await this.renderContextMenu();
  }

  private async openInputContextMenu(query: string, position: { top: number; left: number }): Promise<void> {
    void query;
    if (!this.isContextMenuOpen || this.contextMenuSource !== 'input') {
      this.resetContextMenuState();
    }

    this.contextMenuSource = 'input';
    this.closeHistoryMenu();
    this.closeModelDropdown();
    this.positionContextMenu(position.top + 4, position.left, 1, 1);
    await this.renderContextMenu();
  }

  private closeContextMenu(): void {
    if (!this.isContextMenuOpen) {
      return;
    }

    this.isContextMenuOpen = false;
    this.contextMenuLevel = 'main';
    this.currentCategory = '';
    this.contextMenuHighlightIndex = 0;
    this.contextMenuValues = [];
    this.expandedFolders = new Set<string>();
    this.contextMenuContainer.style.visibility = 'hidden';
    this.contextMenuRoot.render(React.createElement(React.Fragment));
    this.renderTipTapInput();
  }

  private async renderContextMenu(): Promise<void> {
    const groups = this.contextMenuLevel === 'main'
      ? await buildLevel1MenuItems()
      : await buildLevel2MenuItems(
          this.currentCategory,
          () => {
            return;
          },
          () => {
            return;
          },
          () => {
            return;
          },
          this.expandedFolders,
          undefined,
          () => {
            return;
          },
          new Set<string>()
        );

    this.contextMenuValues = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.disabled) {
          this.contextMenuValues.push(item.value);
        }
      }
    }

    if (this.contextMenuHighlightIndex >= this.contextMenuValues.length) {
      this.contextMenuHighlightIndex = 0;
    }

    const highlightedValue = this.contextMenuValues[this.contextMenuHighlightIndex] ?? '';

    this.contextMenuRoot.render(
      React.createElement(Select, {
        value: highlightedValue,
        onChange: (value: string) => {
          void this.handleContextMenuSelect(value);
        },
        groups,
        placeholder: '选择上下文',
        className: 'ai-zone-context-select',
        showSearch: true,
        open: true,
        align: 'left',
        menuGap: 4,
        headerLeftIcon: this.contextMenuLevel === 'detail'
          ? React.createElement(Icon, { iconSet: 'ui', name: 'chevron-left', size: 16 })
          : undefined,
        onHeaderLeftClick: this.contextMenuLevel === 'detail'
          ? () => {
              void this.goBackToLevel1Menu();
            }
          : undefined,
        onItemClick: (value: string) => {
          return !(value.startsWith('category-') || value.startsWith('folder-'));
        },
        onOpenChange: (isOpen: boolean) => {
          if (!isOpen) {
            this.closeContextMenu();
          }
        },
      })
    );

    this.isContextMenuOpen = true;
    this.renderTipTapInput();
  }

  private async handleContextMenuSelect(value: string): Promise<void> {
    if (value.startsWith('category-')) {
      this.contextMenuLevel = 'detail';
      this.currentCategory = value;
      this.contextMenuHighlightIndex = 0;
      await this.renderContextMenu();
      return;
    }

    if (value.startsWith('folder-') && this.currentCategory) {
      const folderPath = value.replace('folder-', '');
      const nextExpandedFolders = new Set(this.expandedFolders);
      if (nextExpandedFolders.has(folderPath)) {
        nextExpandedFolders.delete(folderPath);
      } else {
        nextExpandedFolders.add(folderPath);
      }
      this.expandedFolders = nextExpandedFolders;
      await this.renderContextMenu();
      return;
    }

    if (value.startsWith('recent-file-')) {
      const response = await window.electron?.workspace?.getRecentFiles();
      const index = Number.parseInt(value.replace('recent-file-', ''), 10);
      const filePath = response?.success && response.data ? response.data[index] || '' : '';
      if (filePath) {
        if (this.contextMenuSource === 'toolbar') {
          this.addSelectedReference({
            path: filePath,
            name: this.getReferenceName(filePath),
            type: 'file',
          });
        } else {
          this.insertFileReference(filePath);
        }
      }
      this.closeContextMenu();
      return;
    }

    if (value.startsWith('file-')) {
      const filePath = value.replace('file-', '');
      if (this.contextMenuSource === 'toolbar') {
        this.addSelectedReference({
          path: filePath,
          name: this.getReferenceName(filePath),
          type: 'file',
        });
      } else {
        this.insertFileReference(filePath);
      }
      this.closeContextMenu();
      return;
    }

    if (value.startsWith('prompt-')) {
      const template = await getPromptTemplateById(value.replace('prompt-', ''));
      if (template?.content?.trim()) {
        this.tiptapInputRef?.insertText(template.content.trim(), this.contextMenuSource === 'input');
      }
      this.closeContextMenu();
      return;
    }

    if (value.startsWith('kb-')) {
      const knowledgeBaseId = value.replace('kb-', '');
      const knowledgeBase = await knowledgeBaseService.findItem(knowledgeBaseId);
      if (knowledgeBase && knowledgeBase.type === 'folder') {
        if (this.contextMenuSource === 'toolbar') {
          this.addSelectedReference({
            path: `knowledge-base:${knowledgeBase.id}`,
            name: knowledgeBase.title,
            type: 'knowledge-base',
            kbId: knowledgeBase.id,
          });
        } else {
          this.tiptapInputRef?.insertText(`@${knowledgeBase.title} `, true);
        }
      }
      this.closeContextMenu();
      return;
    }

    if (value.startsWith('form-')) {
      const formId = value.replace('form-', '');
      const form = await tableReferenceService.getFormDetail(formId);
      if (form) {
        if (this.contextMenuSource === 'toolbar') {
          this.addSelectedReference({
            path: `form:${form.id}`,
            name: form.name,
            type: 'form',
            formId: form.id,
          });
        } else {
          this.tiptapInputRef?.insertText(`@${form.name} `, true);
        }
      }
      this.closeContextMenu();
    }
  }

  private getReferenceName(referencePath: string): string {
    return referencePath.split(/[/\\]/).pop() || referencePath;
  }

  private addSelectedReference(item: SelectedItem): void {
    this.selectedFiles = this.mergeReferences(this.selectedFiles, [item]);
    this.renderSelectedFilesToolbar();
    this.scheduleLayout();
  }

  private insertFileReference(filePath: string): void {
    const fileName = this.getReferenceName(filePath);
    this.tiptapInputRef?.insertFileReference(filePath, fileName);
  }

  private navigateContextMenu(direction: 'up' | 'down'): void {
    if (!this.isContextMenuOpen || this.contextMenuValues.length === 0) {
      return;
    }

    if (direction === 'up') {
      this.contextMenuHighlightIndex = this.contextMenuHighlightIndex <= 0
        ? this.contextMenuValues.length - 1
        : this.contextMenuHighlightIndex - 1;
    } else {
      this.contextMenuHighlightIndex = this.contextMenuHighlightIndex >= this.contextMenuValues.length - 1
        ? 0
        : this.contextMenuHighlightIndex + 1;
    }

    void this.renderContextMenu();
  }

  private async selectHighlightedContextMenuItem(): Promise<void> {
    if (!this.isContextMenuOpen || this.contextMenuValues.length === 0) {
      return;
    }

    const value = this.contextMenuValues[this.contextMenuHighlightIndex];
    if (!value) {
      return;
    }

    await this.handleContextMenuSelect(value);
  }

  private async goBackToLevel1Menu(): Promise<void> {
    if (this.contextMenuLevel !== 'detail') {
      return;
    }

    this.contextMenuLevel = 'main';
    this.currentCategory = '';
    this.expandedFolders = new Set<string>();
    this.contextMenuHighlightIndex = 0;
    await this.renderContextMenu();
  }

  private getCurrentInputFileReferences(): SelectedItem[] {
    const fileReferences = this.tiptapInputRef?.getFileReferences() ?? [];
    return fileReferences.map((item) => ({
      path: item.path,
      name: item.name,
      type: 'file',
    }));
  }

  private mergeReferences(primary: SelectedItem[], secondary: SelectedItem[]): SelectedItem[] {
    const merged = new Map<string, SelectedItem>();
    for (const item of [...primary, ...secondary]) {
      merged.set(item.path, item);
    }
    return Array.from(merged.values());
  }

  private mountIcon(button: HTMLButtonElement, iconName: string): void {
    const iconContainer = document.createElement('span');
    const root = createRoot(iconContainer);
    root.render(
      React.createElement(Icon, {
        iconSet: 'ui',
        name: iconName,
        size: 16,
      })
    );
    this.auxiliaryRoots.push(root);
    button.appendChild(iconContainer);
  }

  private getStopIconSvg(className = ''): string {
    return `
      <svg class="${className}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm-8 7a8 8 0 1 1 16 0a8 8 0 0 1-16 0zm5-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8z"></path>
      </svg>
    `;
  }
}
