/**
 * AI Zone Widget - 内联 AI 面板
 * 
 * 功能描述：
 * - 在代码行之间插入内联 AI 聊天面板（Zone Widget）
 * - 提供输入框、消息历史、加载状态等完整界面
 * - 与 GhostTextWidget 配合工作
 * - 支持代码高亮和差异对比
 */

import * as monaco from 'monaco-editor';
import type { editor as Editor } from 'monaco-editor';
import { getSendIconSvg } from '../iconHelpers/iconHelpers';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { Select, type SelectGroup } from '../../../common/Select';
import { getCachedModels, type CachedModelInfo } from '../../../../services/ModelCacheService';
import { AI_PROVIDERS } from '../../../../services/ai';
import { Icon } from '../../../Icons/Icon';
import { InlineChatHistory } from './InlineChatHistory';
import { buildContextMenuItems, buildLevel1MenuItems, buildLevel2MenuItems } from './buildContextMenuItems';
import { snippetService } from '../../../../services/SnippetService';
import { inlineChatHistoryService } from '../../../../services';
import './AIZoneWidget.scss';

/**
 * 获取文件名（不包含路径）
 */
function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}


interface AIZoneWidgetOptions {
  onSubmit: (message: string, includeSelection: boolean, selectedModel?: string) => void;
  onClose: () => void;
  onStop?: () => void; // 停止生成的回调
  onHeightChanged?: (height: number) => void;
  availableModels?: string[]; // 可用的模型列表
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class AIZoneWidget {
  private static instance: AIZoneWidget | null = null; // 单例实例
  private editor: monaco.editor.IStandaloneCodeEditor;
  private zoneWidget: monaco.editor.IViewZone | null = null;
  private zoneId: string | null = null;
  private domNode: HTMLElement | null = null;
  private inputElement: HTMLTextAreaElement | null = null;
  private sendButtonElement: HTMLButtonElement | null = null; // 发送/停止按钮元素
  private toolbarModelDropdownRoot: Root | null = null; // React Root 实例（工具栏中的模型选择下拉框）
  private addContextBtn: HTMLButtonElement | null = null; // @按钮元素
  private options: AIZoneWidgetOptions;
  private chatHistory: ChatMessage[] = [];
  private selectedText: string = '';
  private includeSelection: boolean = false;
  private isGenerating: boolean = false;
  private selectedModel: string = ''; // 当前选中的模型
  private borderOverlays: { top: HTMLElement, bottom: HTMLElement } | null = null; // 边框覆盖层
  private messageOverlay: HTMLElement | null = null; // 消息覆盖层（在底部边框下方）
  private scrollDisposable: monaco.IDisposable | null = null; // 滚动事件监听
  private layoutDisposable: monaco.IDisposable | null = null; // 布局变化监听
  private isDisposed: boolean = false; // 标记是否已销毁，防止重复销毁
  private adjustHeightFn: (() => void) | null = null; // 高度调整函数
  private dropdownClickHandler: ((e: MouseEvent) => void) | null = null; // 下拉菜单点击监听
  private isDropdownOpen: boolean = false; // 下拉菜单是否打开
  private originalScrollbarOptions: any = null; // 原始滚动条配置
  private messageDisplayElement: HTMLElement | null = null; // 消息显示区域
  private currentUserMessage: string = ''; // 当前用户消息
  private thinkingAnimationInterval: number | null = null; // 思考动画定时器
  private modelGroups: SelectGroup[] = []; // 模型分组数据
  private updateModelSelectionFn: ((newModel: string) => void) | null = null; // 模型选择更新函数
  private handleDropdownOpenChangeFn: ((isOpen: boolean) => void) | null = null; // 下拉菜单打开/关闭回调
  private closeDropdownFn: (() => void) | null = null; // 关闭下拉菜单的函数
  private targetLineNumber: number = 0; // Zone Widget 插入的行号
  private currentMenuLevel: 'level1' | 'level2' = 'level1'; // 当前菜单级别
  private currentCategory: string | null = null; // 当前选中的一级分类
  private historyButtonElement: HTMLButtonElement | null = null; // 历史记录按钮元素
  private historyMenuRoot: Root | null = null; // 历史记录菜单 React Root
  private historyMenuContainer: HTMLElement | null = null; // 历史记录菜单容器
  private isHistoryOpen: boolean = false; // 历史记录菜单是否打开
  private currentFileUri: string = ''; // 当前文件 URI
  private historyDisplayMode: 'floating' | 'fixed' = 'floating'; // 历史记录显示模式
  private historyPanelElement: HTMLElement | null = null; // 固定历史面板容器
  private updateBorderPositionFn: (() => void) | null = null; // 边框位置更新函数
  private shouldUpdateBorder: boolean = true; // 是否应该更新边框位置（新建聊天时暂时禁用）
  private contextMenuRoot: Root | null = null; // 上下文菜单 React Root（使用Select组件）
  private contextMenuContainer: HTMLElement | null = null; // 上下文菜单容器
  private isContextMenuOpen: boolean = false; // 上下文菜单是否打开
  private recentFilesMap: Map<string, string> = new Map(); // 最近文件映射（index -> filePath）
  private selectedFiles: Array<{ path: string; name: string; storeType?: 'persistent' | 'temporary' }> = []; // 选中的文件列表
  private selectedFilesToolbar: HTMLElement | null = null; // 显示选中文件的工具栏
  private bottomToolbar: HTMLElement | null = null; // 底部工具栏
  private currentSessionId: string = 'default'; // 当前会话ID

  constructor(editor: monaco.editor.IStandaloneCodeEditor, options: AIZoneWidgetOptions) {
    // 如果已存在实例，先销毁旧实例
    if (AIZoneWidget.instance) {
      AIZoneWidget.instance.dispose();
    }

    this.editor = editor;
    this.options = options;
    this.injectStyles();

    // 设置单例实例
    AIZoneWidget.instance = this;

    // 设置默认模型
    if (options.availableModels && options.availableModels.length > 0) {
      this.selectedModel = options.availableModels[0];
    }
  }

  /**
   * 获取当前实例
   */
  static getInstance(): AIZoneWidget | null {
    return AIZoneWidget.instance;
  }

  /**
   * 检查是否已有实例存在
   */
  static hasInstance(): boolean {
    return AIZoneWidget.instance !== null && AIZoneWidget.instance.isVisible();
  }

  /**
   * 注入 Zone Widget 样式
   */
  private injectStyles(): void {
    if (document.getElementById('ai-zone-widget-styles')) return;

    const style = document.createElement('style');
    style.id = 'ai-zone-widget-styles';
    style.textContent = `
    
    `;
    document.head.appendChild(style);
  }


  /**
   * 获取服务商显示名称
   * @param providerId 服务商ID（如 'modelscope', 'openai' 等）
   * @returns 服务商显示名称（如 '魔塔社区', 'OpenAI' 等）
   */
  private getProviderDisplayName(providerId: string): string {
    const lowerProviderId = providerId.toLowerCase();
    const provider = AI_PROVIDERS[lowerProviderId as keyof typeof AI_PROVIDERS];
    return provider?.name || providerId;
  }

  /**
   * 异步加载模型信息并创建分组
   */
  private async loadModelGroups(): Promise<void> {
    try {
      // 从缓存中获取完整的模型信息
      const cachedModels = await getCachedModels();

      // 创建模型ID到模型信息的映射
      const modelInfoMap = new Map<string, CachedModelInfo>();
      cachedModels.forEach(model => {
        modelInfoMap.set(model.modelId, model);
      });

      // 按服务商分组模型
      const groupedModels = new Map<string, Array<{ value: string; label: string }>>();

      if (this.options.availableModels) {
        this.options.availableModels.forEach(model => {
          const [providerId, modelName] = model.split(':', 2);
          if (providerId && modelName) {
            // 获取服务商显示名称
            const providerDisplayName = this.getProviderDisplayName(providerId);

            if (!groupedModels.has(providerDisplayName)) {
              groupedModels.set(providerDisplayName, []);
            }

            // 从缓存中获取模型信息，优先使用 displayName
            const modelInfo = modelInfoMap.get(model);
            const displayLabel = modelInfo?.displayName || modelName;

            groupedModels.get(providerDisplayName)!.push({
              value: model,
              label: displayLabel
            });
          }
        });
      }

      // 转换为分组数组格式
      this.modelGroups = Array.from(groupedModels.entries()).map(([groupName, items]) => ({
        groupName,
        items
      }));
    } catch (error) {
      console.error('[AIZoneWidget] 加载模型信息失败:', error);
      // 如果加载失败，回退到使用 modelName
      const groupedModels = new Map<string, Array<{ value: string; label: string }>>();

      if (this.options.availableModels) {
        this.options.availableModels.forEach(model => {
          const [providerId, modelName] = model.split(':', 2);
          if (providerId && modelName) {
            // 获取服务商显示名称
            const providerDisplayName = this.getProviderDisplayName(providerId);

            if (!groupedModels.has(providerDisplayName)) {
              groupedModels.set(providerDisplayName, []);
            }
            groupedModels.get(providerDisplayName)!.push({
              value: model,
              label: modelName
            });
          }
        });
      }

      this.modelGroups = Array.from(groupedModels.entries()).map(([groupName, items]) => ({
        groupName,
        items
      }));
    }
  }

  /**
   * 创建 Zone Widget DOM
   */
  private createDomNode(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-zone-container';
    // 不设置内联样式，CSS 完全控制宽度和布局

    // 阻止容器内所有事件冒泡到 Monaco 编辑器
    // 但允许下拉菜单内的事件正常冒泡（CustomSelect 需要事件冒泡来处理点击外部关闭）
    const shouldStopPropagation = (e: Event) => {
      const target = e.target as HTMLElement;

      // 如果点击的是 CustomSelect 触发器，不阻止事件传播
      if (target.closest('.custom-select')) {
        return false;
      }

      // 如果点击的是下拉菜单（通过 Portal 渲染到 body），也不阻止事件传播
      // 因为下拉菜单不在 container 内部，所以这个检查不会影响到它
      if (target.closest('.custom-select-dropdown')) {
        return false;
      }

      return true;
    };

    container.addEventListener('mousedown', (e) => {
      if (shouldStopPropagation(e)) e.stopPropagation();
    });
    container.addEventListener('mouseup', (e) => {
      if (shouldStopPropagation(e)) e.stopPropagation();
    });
    container.addEventListener('click', (e) => {
      if (shouldStopPropagation(e)) e.stopPropagation();
    });
    container.addEventListener('dblclick', (e) => e.stopPropagation());
    container.addEventListener('keydown', (e) => e.stopPropagation());
    container.addEventListener('keyup', (e) => e.stopPropagation());
    container.addEventListener('keypress', (e) => e.stopPropagation());

    // 内容区域
    const content = document.createElement('div');
    content.className = 'ai-zone-content';

    // 消息显示区域（在输入框上方）
    const messageDisplay = document.createElement('div');
    messageDisplay.className = 'ai-zone-message-display';
    messageDisplay.style.display = 'none'; // 初始隐藏
    this.messageDisplayElement = messageDisplay;

    // 头像和消息容器
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'ai-zone-message-wrapper';

    // 头像
    const avatar = document.createElement('img');
    avatar.className = 'ai-zone-avatar';
    avatar.src = '/avtar.jpg'; // 头像路径
    avatar.alt = 'AI Avatar';

    // 消息文本
    const messageText = document.createElement('div');
    messageText.className = 'ai-zone-message-text';
    messageText.textContent = '正在思考';

    // 思考动画点
    const thinkingDots = document.createElement('span');
    thinkingDots.className = 'ai-zone-thinking-dots';
    messageText.appendChild(thinkingDots);

    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(messageText);
    messageDisplay.appendChild(messageWrapper);
    content.appendChild(messageDisplay);

    // 一体化输入容器（包含输入框和模型选择器）
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'ai-zone-input-wrapper';

    // 输入框
    const textarea = document.createElement('textarea');
    textarea.className = 'ai-zone-input';
    textarea.placeholder = 'AI 描述您想要做什么...';
    textarea.rows = 1;
    this.inputElement = textarea;

    // 自动调整高度
    const adjustHeight = () => {
      // 先临时重置高度以获取真实的 scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;

      // 如果内容高度小于等于最大高度，设置为实际高度
      if (scrollHeight <= 88) {
        textarea.style.height = scrollHeight + 'px';
      } else {
        // 如果内容超出，设置为最大高度并确保可以滚动
        textarea.style.height = '88px';
        textarea.style.overflowY = 'auto'; // 强制启用滚动
      }

      const newHeight = Math.min(scrollHeight, 88);

      // 计算容器总高度
      // - 内容区域 padding: 8px*2 = 16px
      // - 消息显示区域高度（如果显示）
      // - 输入框容器高度（包含边框、padding和内部元素）
      // - 底部工具栏高度：28px（min-height）
      // - gap: 8px * 元素数量
      let messageHeight = 0;
      if (this.messageDisplayElement?.style.display !== 'none') {
        // 确保消息显示区域始终遵守最大高度限制
        this.messageDisplayElement!.style.maxHeight = '200px';
        this.messageDisplayElement!.style.overflowY = 'auto';

        // 强制浏览器重新计算布局
        this.messageDisplayElement!.offsetHeight;

        // 使用 scrollHeight 来获取实际内容高度，并限制在 200px 内
        const actualHeight = this.messageDisplayElement!.scrollHeight;
        messageHeight = Math.min(actualHeight, 200);
      }

      // 输入框容器高度 = max(输入框高度, 模型下拉框高度, 发送按钮高度) + padding(4px*2) + 边框(2px)
      // 模型下拉框高度约 24px，发送按钮高度约 24px
      const inputContentHeight = Math.max(newHeight, 24);
      const inputWrapperHeight = inputContentHeight + 8 + 2; // padding(top 4px + bottom 4px) + border

      // 底部工具栏高度
      const toolbarHeight = 28;

      // gap数量：根据可见元素计算
      // - 如果消息显示，gap = 2 (消息-输入框 + 输入框-工具栏)
      // - 如果消息不显示，gap = 1 (输入框-工具栏)
      const gapCount = messageHeight > 0 ? 2 : 1;
      const totalGap = 8 * gapCount;

      // 容器高度 = padding + 消息高度 + 输入框高度 + 工具栏高度 + gap
      const containerHeight = Math.max(72, 16 + messageHeight + inputWrapperHeight + toolbarHeight + totalGap);
      container.style.height = containerHeight + 'px';

      // 更新容器宽度，确保不超出编辑器内容区域
      this.updateContainerWidth();

      // 更新 Zone 高度：容器高度 + 顶部和底部分割线(2px)
      const zoneHeight = containerHeight + 2;
      this.updateZoneHeight(zoneHeight);

      // 更新底部边框位置
      this.updateBottomBorderPosition();
    };

    // 保存引用，以便在其他地方调用
    this.adjustHeightFn = adjustHeight;

    textarea.addEventListener('input', adjustHeight);

    // 鼠标滚轮事件 - 允许在 textarea 内滚动
    textarea.addEventListener('wheel', (e) => {
      const target = e.currentTarget as HTMLTextAreaElement;
      const atTop = target.scrollTop === 0;
      const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight;

      // 只有当内容可以滚动时才阻止事件冒泡
      if (target.scrollHeight > target.clientHeight) {
        // 如果在顶部向上滚动，或在底部向下滚动，允许事件冒泡
        if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
          return;
        }
        // 否则阻止事件冒泡，让 textarea 自己处理滚动
        e.stopPropagation();
      }
    }, { passive: false });

    // 键盘事件
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    });

    textarea.addEventListener('keyup', (e) => e.stopPropagation());
    textarea.addEventListener('keypress', (e) => e.stopPropagation());
    textarea.addEventListener('mousedown', (e) => e.stopPropagation());
    textarea.addEventListener('click', (e) => e.stopPropagation());

    // 输入框获得焦点时，关闭所有菜单（模型选择菜单、@菜单、历史记录菜单）
    textarea.addEventListener('focus', () => {
      // 关闭模型选择菜单
      if (this.closeDropdownFn) {
        this.closeDropdownFn();
      }
      // 关闭@菜单
      if (this.isContextMenuOpen) {
        this.closeContextMenu();
      }
      // 关闭历史记录菜单
      if (this.isHistoryOpen) {
        this.isHistoryOpen = false;
        this.renderHistoryMenu();
      }
    });

    inputWrapper.appendChild(textarea);

    // 模型选择下拉框（放在输入框右侧，发送按钮左侧）
    if (this.options.availableModels && this.options.availableModels.length > 0) {
      const toolbarModelDropdownContainer = document.createElement('div');
      toolbarModelDropdownContainer.className = 'ai-zone-toolbar-model-dropdown';

      // 使用 React 渲染 Select 组件
      this.toolbarModelDropdownRoot = createRoot(toolbarModelDropdownContainer);

      // 如果输入框下拉框已经创建了更新函数，使用它；否则创建新的
      if (!this.updateModelSelectionFn) {
        // 异步加载模型信息并创建分组
        this.loadModelGroups().then(() => {
          // 创建下拉菜单打开/关闭回调
          this.handleDropdownOpenChangeFn = (isOpen: boolean) => {
            this.isDropdownOpen = isOpen;
            if (isOpen) {
              this.disableEditorScroll();
            } else {
              this.enableEditorScroll();
            }
            // 重新渲染 Select 组件以反映新的打开/关闭状态
            if (this.toolbarModelDropdownRoot) {
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-toolbar-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: this.isDropdownOpen
                })
              );
            }
          };

          // 创建模型更新函数
          this.updateModelSelectionFn = (newModel: string) => {
            this.selectedModel = newModel;
            // 更新工具栏下拉框
            if (this.toolbarModelDropdownRoot) {
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-toolbar-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: this.isDropdownOpen
                })
              );
            }
          };

          // 创建关闭下拉菜单的函数
          this.closeDropdownFn = () => {
            if (this.isDropdownOpen && this.toolbarModelDropdownRoot) {
              // 直接设置状态为关闭，然后重新渲染
              this.isDropdownOpen = false;
              this.enableEditorScroll();
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-toolbar-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: false
                })
              );
            }
          };

          // 初始化工具栏下拉框
          if (this.modelGroups.length > 0 && this.toolbarModelDropdownRoot) {
            this.toolbarModelDropdownRoot.render(
              React.createElement(Select, {
                value: this.selectedModel,
                onChange: this.updateModelSelectionFn!,
                groups: this.modelGroups,
                placeholder: '选择模型',
                className: 'ai-zone-toolbar-model-select',
                onOpenChange: this.handleDropdownOpenChangeFn!,
                open: this.isDropdownOpen
              })
            );
          }
        });
      } else {
        // 如果已经创建了更新函数，确保模型信息已加载，然后渲染
        if (this.modelGroups.length === 0) {
          // 如果模型分组为空，重新加载
          this.loadModelGroups().then(() => {
            if (this.modelGroups.length > 0 && this.toolbarModelDropdownRoot) {
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-toolbar-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: this.isDropdownOpen
                })
              );
            }
          });
        } else {
          // 如果模型分组已加载，直接渲染
          if (this.toolbarModelDropdownRoot) {
            this.toolbarModelDropdownRoot.render(
              React.createElement(Select, {
                value: this.selectedModel,
                onChange: this.updateModelSelectionFn,
                groups: this.modelGroups,
                placeholder: '选择模型',
                className: 'ai-zone-toolbar-model-select',
                onOpenChange: this.handleDropdownOpenChangeFn!,
                open: this.isDropdownOpen
              })
            );
          }
        }
      }

      inputWrapper.appendChild(toolbarModelDropdownContainer);
    }

    // 发送/停止按钮（放在输入框右侧）
    const sendBtn = document.createElement('button');
    sendBtn.className = 'ai-zone-send-btn';
    sendBtn.title = '发布(Enter)';
    sendBtn.disabled = this.isGenerating;

    // 发送图标
    sendBtn.innerHTML = getSendIconSvg('ai-zone-send-icon');

    // 保存按钮引用
    this.sendButtonElement = sendBtn;

    sendBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isGenerating) {
        // 如果正在生成，点击停止
        this.handleStopGeneration();
      } else {
        // 否则发送消息
        this.handleSubmit();
      }
    });

    inputWrapper.appendChild(sendBtn);

    // 关闭（放在输入框容器内，右侧）
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-zone-close-btn';
    closeBtn.title = '关闭 (Esc)';

    // 关闭图标 (SVG - X 图标)
    closeBtn.innerHTML = `
      <svg class="ai-zone-close-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/>
      </svg>
    `;

    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    inputWrapper.appendChild(closeBtn);

    // 将输入框容器添加到内容区
    content.appendChild(inputWrapper);

    // 底部工具栏
    const bottomToolbar = document.createElement('div');
    bottomToolbar.className = 'ai-zone-bottom-toolbar';
    this.bottomToolbar = bottomToolbar;

    // 左侧控制
    const leftControls = document.createElement('div');
    leftControls.className = 'ai-zone-left-controls';

    // 新建聊天按钮（放在最左侧）
    const newChatBtn = document.createElement('button');
    newChatBtn.className = 'ai-zone-toolbar-icon-btn';
    newChatBtn.title = '新建聊天';
    newChatBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    newChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.createNewChat();
    });

    const newChatIconContainer = document.createElement('span');
    const newChatIconRoot = createRoot(newChatIconContainer);
    newChatIconRoot.render(
      React.createElement(Icon, {
        iconSet: 'ui',
        name: 'plus',
        size: 16
      })
    );
    newChatBtn.appendChild(newChatIconContainer);
    leftControls.appendChild(newChatBtn);

    // 添加上下文按钮容器（包含按钮和Select触发器）
    const addContextBtnContainer = document.createElement('div');
    addContextBtnContainer.className = 'ai-zone-add-context-btn-container';
    addContextBtnContainer.style.position = 'relative';
    addContextBtnContainer.style.display = 'inline-block';

    // 创建按钮
    this.addContextBtn = document.createElement('button');
    this.addContextBtn.className = 'ai-zone-add-context-btn';
    this.addContextBtn.title = '添加上下文';
    this.addContextBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    this.addContextBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleContextMenuClick();
    });

    // @ 符号图标
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('class', 'ai-zone-context-icon');
    iconSvg.setAttribute('viewBox', '0 0 16 16');
    iconSvg.style.width = '16px';
    iconSvg.style.height = '16px';
    iconSvg.style.marginRight = '6px';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M13.106 7.222c0-2.967-2.249-5.032-5.482-5.032-3.35 0-5.646 2.318-5.646 5.702 0 3.493 2.235 5.708 5.762 5.708.862 0 1.689-.123 2.304-.335v-.862c-.43.199-1.354.328-2.29.328-2.926 0-4.813-1.88-4.813-4.798 0-2.844 1.921-4.881 4.594-4.881 2.735 0 4.608 1.688 4.608 4.156 0 1.682-.554 2.769-1.416 2.769-.492 0-.772-.28-.772-.76V5.206H8.923v.834h-.11c-.266-.595-.881-.964-1.6-.964-1.4 0-2.378 1.162-2.378 2.823 0 1.737.957 2.906 2.379 2.906.8 0 1.415-.39 1.709-1.087h.11c.081.67.703 1.148 1.503 1.148 1.572 0 2.57-1.415 2.57-3.643zm-7.177.704c0-1.197.54-1.907 1.456-1.907.93 0 1.524.738 1.524 1.907S8.308 9.84 7.371 9.84c-.895 0-1.442-.725-1.442-1.914z');
    path.setAttribute('fill', 'currentColor');
    iconSvg.appendChild(path);
    this.addContextBtn.appendChild(iconSvg);

    // 创建Select触发器容器（覆盖在按钮上，用于定位菜单）
    // 注意：Select组件需要一个可见的容器来计算位置，所以我们让它有正确的尺寸
    this.contextMenuContainer = document.createElement('div');
    this.contextMenuContainer.style.position = 'absolute';
    this.contextMenuContainer.style.top = '0';
    this.contextMenuContainer.style.left = '0';
    this.contextMenuContainer.style.width = '100%';
    this.contextMenuContainer.style.height = '100%';
    this.contextMenuContainer.style.opacity = '0';
    this.contextMenuContainer.style.pointerEvents = 'none'; // 不拦截点击事件，让按钮处理

    addContextBtnContainer.appendChild(this.addContextBtn);
    addContextBtnContainer.appendChild(this.contextMenuContainer);
    leftControls.appendChild(addContextBtnContainer);

    // AI 智能体按钮
    const aiAgentBtn = document.createElement('button');
    aiAgentBtn.className = 'ai-zone-toolbar-icon-btn';
    aiAgentBtn.title = 'AI 智能体';
    aiAgentBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    aiAgentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现 AI 智能体功能
    });

    const aiAgentIconContainer = document.createElement('span');
    const aiAgentIconRoot = createRoot(aiAgentIconContainer);
    aiAgentIconRoot.render(
      React.createElement(Icon, {
        iconSet: 'ui',
        name: 'ai-agent',
        size: 16
      })
    );
    aiAgentBtn.appendChild(aiAgentIconContainer);
    leftControls.appendChild(aiAgentBtn);

    // 深度思考按钮
    const deepThinkingBtn = document.createElement('button');
    deepThinkingBtn.className = 'ai-zone-toolbar-icon-btn';
    deepThinkingBtn.title = '深度思考';
    deepThinkingBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    deepThinkingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现深度思考功能
    });

    const deepThinkingIconContainer = document.createElement('span');
    const deepThinkingIconRoot = createRoot(deepThinkingIconContainer);
    deepThinkingIconRoot.render(
      React.createElement(Icon, {
        iconSet: 'ui',
        name: 'deep-thinking',
        size: 16
      })
    );
    deepThinkingBtn.appendChild(deepThinkingIconContainer);
    leftControls.appendChild(deepThinkingBtn);

    // 网络搜索按钮
    const webSearchBtn = document.createElement('button');
    webSearchBtn.className = 'ai-zone-toolbar-icon-btn';
    webSearchBtn.title = '网络搜索';
    webSearchBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    webSearchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现网络搜索功能
    });

    const webSearchIconContainer = document.createElement('span');
    const webSearchIconRoot = createRoot(webSearchIconContainer);
    webSearchIconRoot.render(
      React.createElement(Icon, {
        iconSet: 'ui',
        name: 'network',
        size: 16
      })
    );
    webSearchBtn.appendChild(webSearchIconContainer);
    leftControls.appendChild(webSearchBtn);

    bottomToolbar.appendChild(leftControls);

    // 右侧控制
    const rightControls = document.createElement('div');
    rightControls.className = 'ai-zone-right-controls';

    // 历史记录按钮（放在工具栏最后）
    const historyBtn = document.createElement('button');
    historyBtn.className = 'ai-zone-toolbar-icon-btn';
    historyBtn.title = '历史记录';
    historyBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    historyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHistoryMenu();
    });
    this.historyButtonElement = historyBtn;

    const historyIconContainer = document.createElement('span');
    const historyIconRoot = createRoot(historyIconContainer);
    historyIconRoot.render(
      React.createElement(Icon, {
        iconSet: 'ui',
        name: 'history',
        size: 16
      })
    );
    historyBtn.appendChild(historyIconContainer);
    rightControls.appendChild(historyBtn);

    bottomToolbar.appendChild(rightControls);

    // 创建选中文件工具栏（在底部工具栏上方）
    const selectedFilesToolbar = document.createElement('div');
    selectedFilesToolbar.className = 'ai-zone-selected-files-toolbar';
    selectedFilesToolbar.style.display = 'none'; // 默认隐藏，有文件时显示
    this.selectedFilesToolbar = selectedFilesToolbar;

    // 将选中文件工具栏添加到内容区（在底部工具栏之前）
    content.appendChild(selectedFilesToolbar);

    // 将底部工具栏添加到内容区
    content.appendChild(bottomToolbar);

    // 将内容区添加到容器
    container.appendChild(content);

    return container;
  }

  /**
   * 创建全宽边框覆盖层（覆盖整个编辑器宽度）
   */
  private createBorderOverlays(): void {
    setTimeout(() => {
      if (!this.domNode) return;

      // 找到编辑器的滚动容器
      const editorDomNode = this.editor.getDomNode();
      if (!editorDomNode) return;

      // 获取 Zone Widget 在页面中的位置
      const zoneRect = this.domNode.getBoundingClientRect();
      const editorRect = editorDomNode.getBoundingClientRect();

      // 获取编辑器布局信息，计算不包括小地图的内容宽度
      const layoutInfo = this.editor.getLayoutInfo();

      // 尝试找到小地图元素来精确计算边框宽度
      const minimapElement = editorDomNode.querySelector('.minimap');
      let borderWidth: number;

      if (minimapElement && layoutInfo.minimap.minimapWidth > 0) {
        // 如果小地图存在且可见，边框宽度 = 编辑器总宽度 - 小地图宽度 - 小地图左侧偏移
        // minimapLeft 是小地图距离编辑器左边缘的距离
        borderWidth = layoutInfo.minimap.minimapLeft;
      } else {
        // 如果小地图不存在或不可见，使用整个编辑器宽度
        borderWidth = layoutInfo.width;
      }

      // 创建顶部边框
      const topBorder = document.createElement('div');
      topBorder.className = 'ai-zone-border-overlay ai-zone-border-top';
      topBorder.style.cssText = `
        position: absolute;
        left: 0;
        width: ${borderWidth}px;
        height: 1px;
        background: rgb(0, 122, 204);
        z-index: 1001;
        pointer-events: none;
        top: ${zoneRect.top - editorRect.top}px;
      `;

      // 创建底部边框
      const bottomBorder = document.createElement('div');
      bottomBorder.className = 'ai-zone-border-overlay ai-zone-border-bottom';
      bottomBorder.style.cssText = `
        position: absolute;
        left: 0;
        width: ${borderWidth}px;
        height: 1px;
        background: rgb(0, 122, 204);
        z-index: 1001;
        pointer-events: none;
        top: ${zoneRect.bottom - editorRect.top}px;
      `;

      // 将边框添加到编辑器容器
      editorDomNode.style.position = 'relative';
      editorDomNode.appendChild(topBorder);
      editorDomNode.appendChild(bottomBorder);

      // 在底部边框下方添加消息显示区域
      const messageOverlay = document.createElement('div');
      messageOverlay.className = 'ai-zone-message-overlay';
      messageOverlay.style.cssText = `
        position: absolute;
        left: 0;
        width: ${borderWidth}px;
        max-height: 200px;
        overflow-y: auto;
        overflow-x: hidden;
        background: var(--ws-editor-background);
        border: 1px solid var(--ws-panel-border, rgba(128, 128, 128, 0.35));
        border-top: none;
        z-index: 1001;
        pointer-events: auto;
        top: ${zoneRect.bottom - editorRect.top + 1}px;
        display: none;
        padding: 8px;
        box-sizing: border-box;
      `;
      editorDomNode.appendChild(messageOverlay);

      // 保存消息覆盖层的引用
      this.messageOverlay = messageOverlay;

      this.borderOverlays = { top: topBorder, bottom: bottomBorder };

      // 监听滚动事件，更新边框位置和宽度
      const updateBorderPosition = () => {
        if (!this.domNode || !this.borderOverlays) return;
        
        // 如果标志为 false，不更新边框位置（新建聊天时）
        if (!this.shouldUpdateBorder) return;

        // 滚动时关闭下拉菜单
        if (this.closeDropdownFn) {
          this.closeDropdownFn();
        }

        // 先更新容器宽度（确保在计算位置前完成）
        this.updateContainerWidth();

        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          if (!this.domNode || !this.borderOverlays) return;
          const newZoneRect = this.domNode.getBoundingClientRect();
          const newEditorRect = editorDomNode.getBoundingClientRect();

          // 更新边框位置
          this.borderOverlays.top.style.top = `${newZoneRect.top - newEditorRect.top}px`;
          this.borderOverlays.bottom.style.top = `${newZoneRect.bottom - newEditorRect.top}px`;

          // 更新消息覆盖层位置
          if (this.messageOverlay) {
            this.messageOverlay.style.top = `${newZoneRect.bottom - newEditorRect.top + 1}px`;
          }
        });
      };

      // 保存更新边框位置的函数引用，以便在其他地方调用
      this.updateBorderPositionFn = updateBorderPosition;

      // 先清理之前的监听器
      if (this.scrollDisposable) {
        this.scrollDisposable.dispose();
        this.scrollDisposable = null;
      }

      if (this.layoutDisposable) {
        this.layoutDisposable.dispose();
        this.layoutDisposable = null;
      }

      // 监听编辑器滚动
      this.scrollDisposable = this.editor.onDidScrollChange(() => {
        // 更新边框位置
        updateBorderPosition();
        
        // 编辑器滚动时，关闭所有菜单（模型选择菜单、@菜单、历史记录菜单）
        // 关闭模型选择菜单（closeDropdownFn 内部已检查 isDropdownOpen）
        if (this.closeDropdownFn) {
          this.closeDropdownFn();
        }
        // 关闭@菜单
        if (this.isContextMenuOpen) {
          this.closeContextMenu();
        }
        // 关闭历史记录菜单
        if (this.isHistoryOpen) {
          this.isHistoryOpen = false;
          this.renderHistoryMenu();
        }
      });

      // 监听编辑器布局变化（窗口大小改变、小地图显示/隐藏等）
      this.layoutDisposable = this.editor.onDidLayoutChange(updateBorderPosition);
    }, 50);
  }

  /**
   * 显示 Zone Widget
   */
  public show(lineNumber?: number, selectedText?: string): void {
    // 如果已经显示，先隐藏
    if (this.zoneId) {
      this.hide();
    }

    // 保存选中的文本
    this.selectedText = selectedText || '';
    this.includeSelection = !!this.selectedText;

    // 获取当前行号
    const position = this.editor.getPosition();
    const targetLine = lineNumber || (position ? position.lineNumber : 1);

    // 保存行号
    this.targetLineNumber = targetLine;

    // 获取当前文件 URI
    const model = this.editor.getModel();
    if (model) {
      this.currentFileUri = model.uri.toString();
    }

    // 创建 DOM
    this.domNode = this.createDomNode();

    // 设置容器宽度（立即执行一次）
    this.updateContainerWidth();

    // 延迟再次更新宽度，确认 Monaco 布局信息已准备好
    setTimeout(() => {
      this.updateContainerWidth();
    }, 0);

    // 初始高度：顶部分割线(1px) + 内容区域(72px，包含输入框+工具栏 + 底部分割1px) = 74px
    const zoneHeight = 74;

    // 创建 Zone Widget
    this.editor.changeViewZones((changeAccessor) => {
      const zone: monaco.editor.IViewZone = {
        afterLineNumber: targetLine,
        heightInPx: zoneHeight,
        domNode: this.domNode!,
        suppressMouseDown: false,
      };

      this.zoneId = changeAccessor.addZone(zone);
      this.zoneWidget = zone;
    });

    // 创建全宽边框覆盖层
    this.createBorderOverlays();

    // 添加全局监听器，防止点击下拉菜单时关闭内联聊天
    this.dropdownClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 检查点击是否在 CustomSelect 下拉菜单内
      if (target.closest('.custom-select') ||
        target.closest('.custom-select-dropdown')) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    // 使用捕获阶段，优先级高于 Monaco 的事件监听器
    document.addEventListener('mousedown', this.dropdownClickHandler, true);
    document.addEventListener('click', this.dropdownClickHandler, true);

    // 初始化输入框高度
    if (this.adjustHeightFn) {
      this.adjustHeightFn();
    }

    // 聚焦输入框
    setTimeout(() => {
      if (this.inputElement) {
        this.inputElement.focus();
      }
    }, 50);
  }

  /**
   * 隐藏 Zone Widget
   */
  hide(): void {
    // 清理下拉菜单点击监听器
    if (this.dropdownClickHandler) {
      document.removeEventListener('mousedown', this.dropdownClickHandler, true);
      document.removeEventListener('click', this.dropdownClickHandler, true);
      this.dropdownClickHandler = null;
    }

    // 清理滚动监听器
    if (this.scrollDisposable) {
      this.scrollDisposable.dispose();
      this.scrollDisposable = null;
    }

    // 清理布局监听器
    if (this.layoutDisposable) {
      this.layoutDisposable.dispose();
      this.layoutDisposable = null;
    }

    // 移除边框覆盖层
    if (this.borderOverlays) {
      this.borderOverlays.top.remove();
      this.borderOverlays.bottom.remove();
      this.borderOverlays = null;
    }

    // 移除消息覆盖层
    if (this.messageOverlay) {
      this.messageOverlay.remove();
      this.messageOverlay = null;
    }

    if (this.zoneId) {
      this.editor.changeViewZones((changeAccessor) => {
        changeAccessor.removeZone(this.zoneId!);
      });
      this.zoneId = null;
      this.zoneWidget = null;
    }

    this.domNode = null;
    this.inputElement = null;

    // 只在未销毁时调用 onClose，避免循环调用
    if (!this.isDisposed) {
      this.options.onClose();
    }
  }

  /**
   * 更新容器宽度，限制为编辑器内容区域（不包括小地图）
   */
  private updateContainerWidth(): void {
    if (!this.domNode) return;

    const layoutInfo = this.editor.getLayoutInfo();
    const minimapElement = this.editor.getDomNode()?.querySelector('.minimap');
    let editorWidth: number;

    if (minimapElement && layoutInfo.minimap.minimapWidth > 0) {
      // 如果有小地图，编辑器宽度 = 小地图左边缘位置
      editorWidth = layoutInfo.minimap.minimapLeft;
    } else {
      // 如果没有小地图，使用整个编辑器宽度
      editorWidth = layoutInfo.width;
    }

    // 不再设置容器宽度，让 CSS 控制固定宽度和居中
    // 只更新边框宽度以覆盖整个编辑器宽度
    if (this.borderOverlays) {
      this.borderOverlays.top.style.width = `${editorWidth}px`;
      this.borderOverlays.bottom.style.width = `${editorWidth}px`;
    }
  }

  /**
   * 更新 Zone 高度
   */
  private updateZoneHeight(newHeight: number): void {
    if (!this.zoneId) return;

    this.editor.changeViewZones((changeAccessor) => {
      if (this.zoneWidget) {
        this.zoneWidget.heightInPx = newHeight;
        changeAccessor.layoutZone(this.zoneId!);
      }
    });
  }

  /**
   * 检查 Zone Widget 是否可见
   */
  isVisible(): boolean {
    return this.zoneId !== null;
  }

  /**
   * 禁用编辑器滚动
   */
  private disableEditorScroll(): void {
    if (this.isDropdownOpen) return; // 已经禁用

    this.isDropdownOpen = true;

    // 保存原始配置
    this.originalScrollbarOptions = this.editor.getOption(monaco.editor.EditorOption.scrollbar);

    // 更新配置以禁用滚动并隐藏滚动条
    this.editor.updateOptions({
      scrollbar: {
        ...this.originalScrollbarOptions,
        handleMouseWheel: false, // 禁用鼠标滚轮
        alwaysConsumeMouseWheel: false,
        vertical: 'hidden', // 隐藏垂直滚动条
        horizontal: 'hidden' // 隐藏水平滚动条
      }
    });
  }

  /**
   * 启用编辑器滚动
   */
  private enableEditorScroll(): void {
    if (!this.isDropdownOpen) return; // 没有禁用

    this.isDropdownOpen = false;

    // 恢复原始配置
    if (this.originalScrollbarOptions) {
      this.editor.updateOptions({
        scrollbar: this.originalScrollbarOptions
      });
      this.originalScrollbarOptions = null;
    }
  }

  /**
   * 处理提交
   */
  private handleSubmit(): void {
    const message = this.inputElement?.value.trim();
    if (!message) return;

    // 保存当前用户消息
    this.currentUserMessage = message;

    // 添加到聊天历史
    this.chatHistory.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // 清空输入
    if (this.inputElement) {
      this.inputElement.value = '';
      // 重置高度
      if (this.adjustHeightFn) {
        this.adjustHeightFn();
      }
    }

    // 显示"正在思考..."状态
    this.showThinkingState();

    // 设置生成状态
    this.isGenerating = true;

    // 更新按钮状态（发送 -> 停止）
    this.updateSendButton();

    // 调用回调，传递选中的模型
    this.options.onSubmit(
      message,
      this.includeSelection && !!this.selectedText,
      this.selectedModel || undefined
    );

    // 不刷新界面，避免输入框布局问题
    // this.refresh();
  }

  /**
   * 更新发送/停止按钮的状态
   */
  private updateSendButton(): void {
    if (!this.sendButtonElement) return;

    if (this.isGenerating) {
      // 显示停止图标
      this.sendButtonElement.innerHTML = this.getStopIconSvg('ai-zone-send-icon');
      this.sendButtonElement.title = '停止生成';
      this.sendButtonElement.disabled = false;
    } else {
      // 显示发送图标
      this.sendButtonElement.innerHTML = getSendIconSvg('ai-zone-send-icon');
      this.sendButtonElement.title = '发布(Enter)';
      this.sendButtonElement.disabled = false;
    }
  }

  /**
   * 获取停止图标的 SVG
   */
  private getStopIconSvg(className: string = ''): string {
    return `
      <svg class="${className}" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm-8 7a8 8 0 1 1 16 0a8 8 0 0 1-16 0zm5-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8z"></path>
      </svg>
    `;
  }

  /**
   * 处理停止生成按钮点击
   */
  private handleStopGeneration(): void {
    console.log('[AIZoneWidget] 用户点击停止生成');

    // 调用停止回调
    if (this.options.onStop) {
      this.options.onStop();
    }

    // 更新状态
    this.stopGeneration();
  }

  /**
   * 停止生成
   */
  private stopGeneration(): void {
    this.isGenerating = false;
    this.updateSendButton();
    this.hideThinkingState();
    // 不调用 refresh()，避免 Zone Widget 位置重置
    // this.refresh();
  }

  /**
   * 添加 AI 响应到历史
   */
  addAssistantMessage(content: string): void {
    this.chatHistory.push({
      role: 'assistant',
      content,
      timestamp: Date.now()
    });
    this.isGenerating = false;
    this.updateSendButton();
    this.refresh();
  }

  /**
   * 追加消息（支持 user 或 assistant）
   */
  appendMessage(role: 'user' | 'assistant', content: string): void {
    this.chatHistory.push({
      role,
      content,
      timestamp: Date.now()
    });
    if (role === 'assistant') {
      this.isGenerating = false;
      this.updateSendButton();
    }
    this.refresh();
  }

  /**
   * AI 开始回复时调用（显示用户问题）
   * 公共方法，供外部调用
   */
  public onAIResponseStart(): void {
    this.showUserQuestion();
  }

  /**
   * AI 回复完成时调用
   * 公共方法，供外部调用
   */
  public onAIResponseComplete(): void {
    this.isGenerating = false;
    this.updateSendButton();
    // 保持消息显示，不隐藏
  }

  /**
   * 刷新界面
   */
  private refresh(): void {
    if (!this.zoneId || !this.domNode) return;

    const parentNode = this.domNode.parentNode;
    if (!parentNode) return;

    const newNode = this.createDomNode();
    parentNode.replaceChild(newNode, this.domNode);
    this.domNode = newNode;

    // 更新 Zone Widget 的 domNode 引用，确保位置不会重置
    if (this.zoneWidget) {
      this.zoneWidget.domNode = this.domNode;
      // 使用 layoutZone 重新布局，确保位置保持不变
      this.editor.changeViewZones((changeAccessor) => {
        changeAccessor.layoutZone(this.zoneId!);
      });
    }

    // 重新聚焦输入框
    setTimeout(() => {
      if (this.inputElement) {
        this.inputElement.focus();
      }
    }, 50);
  }

  /**
   * 转义 HTML
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 显示"正在思考..."状态
   */
  private showThinkingState(): void {
    if (!this.messageDisplayElement) return;

    // 检查消息区域是否已经可见
    const wasHidden = this.messageDisplayElement.style.display === 'none';

    // 显示消息区域
    this.messageDisplayElement.style.display = 'block';

    // 更新消息文本为"正在思考..."
    const messageText = this.messageDisplayElement.querySelector('.ai-zone-message-text');
    if (messageText) {
      messageText.innerHTML = '正在思考<span class="ai-zone-thinking-dots"></span>';
    }

    // 确保边框更新已启用（用户发起提问时，边框位置应该更新）
    this.shouldUpdateBorder = true;

    // 只有从隐藏变为显示时才调整容器高度
    if (wasHidden) {
      this.adjustContainerHeightForMessage();
    }
  }

  /**
   * 隐藏思考状态
   */
  private hideThinkingState(): void {
    if (!this.messageDisplayElement) return;

    // 停止时不隐藏消息区域，保持显示上一个问题
    // 当用户发起新问题时，会在 showUserQuestion() 中直接替换内容
    // this.messageDisplayElement.style.display = 'none';

    // 如果正在显示"正在思考..."，则保留上一个用户问题
    const messageText = this.messageDisplayElement.querySelector('.ai-zone-message-text');
    if (messageText && this.currentUserMessage) {
      // 将"正在思考..."替换为用户问题
      messageText.textContent = this.currentUserMessage;
    }

    // 调整容器高度（停止时不调整高度，避免触发位置重新计算）
    // this.adjustContainerHeightForMessage();
  }

  /**
   * 显示用户问题
   */
  private showUserQuestion(): void {
    if (!this.messageDisplayElement || !this.currentUserMessage) return;

    // 更新消息文本为用户问题（直接替换之前的内容）
    const messageText = this.messageDisplayElement.querySelector('.ai-zone-message-text');
    if (messageText) {
      messageText.textContent = this.currentUserMessage;
    }

    // 确保消息区域可见
    this.messageDisplayElement.style.display = 'block';

    // 调整容器高度以适应用户问题内容
    // 使用 requestAnimationFrame 确保 DOM 已更新
    requestAnimationFrame(() => {
      this.adjustContainerHeightForMessage();
    });
  }

  /**
   * 更新 AI 响应内容（支持流式更新）
   * 公共方法，供外部调用
   */
  public updateAIResponse(content: string): void {
    if (!this.messageOverlay) return;

    // 显示消息覆盖层
    this.messageOverlay.style.display = content ? 'block' : 'none';

    // 更新消息内容
    if (content) {
      this.messageOverlay.textContent = content;

      // 更新消息覆盖层的位置（确保在底部边框下方）
      this.updateMessageOverlayPosition();
    }
  }

  /**
   * 更新消息覆盖层的位置
   */
  private updateMessageOverlayPosition(): void {
    if (!this.messageOverlay || !this.domNode) return;

    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) return;

    const zoneRect = this.domNode.getBoundingClientRect();
    const editorRect = editorDomNode.getBoundingClientRect();

    // 设置消息覆盖层在底部边框下方（+1px 是边框高度）
    this.messageOverlay.style.top = `${zoneRect.bottom - editorRect.top + 1}px`;
  }

  /**
   * 隐藏消息显示区域
   */
  private hideMessageDisplay(): void {
    if (!this.messageDisplayElement) return;

    this.messageDisplayElement.style.display = 'none';
    this.currentUserMessage = '';

    // 调整容器高度
    this.adjustContainerHeightForMessage();
  }

  /**
   * 调整容器高度以适应消息区域
   * @param updateBorder 是否更新边框位置，默认为 true
   */
  private adjustContainerHeightForMessage(updateBorder: boolean = true): void {
    if (!this.domNode || !this.messageDisplayElement) return;

    // 强制浏览器重新计算布局
    this.messageDisplayElement.offsetHeight;

    // 计算消息区域高度，限制在最大高度 200px 内
    const messageHeight = this.messageDisplayElement.style.display === 'none'
      ? 0
      : Math.min(this.messageDisplayElement.scrollHeight, 200); // 使用 scrollHeight 但限制最大值为 200px

    // 获取当前输入框高度
    const inputHeight = this.inputElement?.offsetHeight || 28;

    // 输入框容器高度 = 输入框高度 + padding(4px*2=8px) + 边框(2px)
    const inputWrapperHeight = inputHeight + 8 + 2;

    // 底部工具栏高度
    const toolbarHeight = 28;

    // 选中文件工具栏高度（如果显示）
    const selectedFilesToolbarHeight = (this.selectedFilesToolbar && 
      this.selectedFilesToolbar.style.display !== 'none') 
      ? this.selectedFilesToolbar.offsetHeight 
      : 0;

    // gap数量：根据可见元素计算
    // 如果选中文件工具栏显示，需要额外的 gap
    const gapCount = messageHeight > 0 
      ? (selectedFilesToolbarHeight > 0 ? 3 : 2)
      : (selectedFilesToolbarHeight > 0 ? 2 : 1);
    const totalGap = 8 * gapCount;

    // 容器高度 = padding(16) + 消息高度 + 输入框高度 + 底部工具栏高度 + 选中文件工具栏高度 + gap
    const calculatedHeight = 16 + messageHeight + inputWrapperHeight + toolbarHeight + selectedFilesToolbarHeight + totalGap;
    const containerHeight = Math.max(72, calculatedHeight);
    
    // 获取当前 Zone 高度（如果存在）
    const currentZoneHeight = this.zoneWidget?.heightInPx || 0;
    const newZoneHeight = containerHeight + 2;
    
    // 只有当高度真正发生变化时才更新
    const heightChanged = Math.abs(currentZoneHeight - newZoneHeight) > 0.5;
    
    this.domNode.style.height = containerHeight + 'px';

    // 确保消息显示区域始终遵守最大高度限制
    if (this.messageDisplayElement) {
      this.messageDisplayElement.style.maxHeight = '200px';
      this.messageDisplayElement.style.overflowY = 'auto';
    }

    // 只有当高度发生变化时才更新 Zone 高度
    if (heightChanged) {
      // 更新 Zone 高度：容器高度 + 顶部和底部分割线(2px)
      this.updateZoneHeight(newZoneHeight);
    }

    // 只有在需要更新边框且高度发生变化时才更新边框位置
    // 新建聊天时，如果高度没有变化，就不应该更新边框位置
    if (updateBorder && heightChanged) {
      // 使用双重 requestAnimationFrame 确保布局完成后再更新边框位置
      // updateZoneHeight 会触发编辑器布局变化，需要等待布局完成
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 优先使用统一的边框位置更新函数
          if (this.updateBorderPositionFn) {
            this.updateBorderPositionFn();
          } else {
            // 如果没有统一的更新函数，则使用底部边框更新方法
            this.updateBottomBorderPosition();
          }
        });
      });
    }
  }

  /**
   * 更新底部边框位置
   */
  private updateBottomBorderPosition(): void {
    if (!this.domNode || !this.borderOverlays) return;

    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) return;

    // 使用 requestAnimationFrame 确保 DOM 已更新
    requestAnimationFrame(() => {
      if (!this.domNode || !this.borderOverlays) return;

      const zoneRect = this.domNode.getBoundingClientRect();
      const editorRect = editorDomNode.getBoundingClientRect();

      // 计算底部边框位置：应该在底部工具栏上方，增加间距
      let borderTop: number;
      
      if (this.bottomToolbar) {
        // 获取底部工具栏的位置
        const toolbarRect = this.bottomToolbar.getBoundingClientRect();
        // 边框应该在工具栏上方，增加 8px 间距（与内容区的 gap 保持一致）
        borderTop = toolbarRect.top - editorRect.top - 8;
      } else {
        // 如果没有底部工具栏，使用容器底部位置
        borderTop = zoneRect.bottom - editorRect.top;
      }

      // 更新底部边框位置
      this.borderOverlays.bottom.style.top = `${borderTop}px`;

      // 更新消息覆盖层位置（如果存在）
      if (this.messageOverlay) {
        this.messageOverlay.style.top = `${borderTop + 1}px`;
      }
    });
  }

  /**
   * 获取输入框元素
   */
  public getInputElement(): HTMLTextAreaElement | null {
    return this.inputElement;
  }

  /**
   * 获取 Zone Widget 底部边框的行号（用于 GhostTextWidget 定位）
   */
  public getZoneBottomLineNumber(): number {
    // Zone Widget 插入在 targetLineNumber 之后
    // 底部边框就是 targetLineNumber 的下一行
    const bottomLine = this.targetLineNumber + 1;
    console.log('[AIZoneWidget] getZoneBottomLineNumber - targetLineNumber:', this.targetLineNumber, 'bottomLine:', bottomLine);
    return bottomLine;
  }

  /**
   * 检测编辑器宽度，决定历史面板显示模式
   */
  private detectHistoryDisplayMode(): 'floating' | 'fixed' {
    const layoutInfo = this.editor.getLayoutInfo();
    const minimapElement = this.editor.getDomNode()?.querySelector('.minimap');

    // 计算编辑器内容区域宽度（不包括小地图）
    let contentWidth: number;
    if (minimapElement && layoutInfo.minimap.minimapWidth > 0) {
      contentWidth = layoutInfo.minimap.minimapLeft;
    } else {
      contentWidth = layoutInfo.width;
    }

    // 如果编辑器内容区域宽度 >= 1200px，启用固定面板模式
    // 1200px = AIZone容器(700px) + 历史面板(350px) + 间距(150px)
    const MIN_WIDTH_FOR_FIXED_MODE = 1200;

    return contentWidth >= MIN_WIDTH_FOR_FIXED_MODE ? 'fixed' : 'floating';
  }

  /**
   * 切换历史记录菜单
   */
  private toggleHistoryMenu(): void {
    this.isHistoryOpen = !this.isHistoryOpen;

    // 每次切换时重新检测显示模式
    this.historyDisplayMode = this.detectHistoryDisplayMode();

    this.renderHistoryMenu();
  }

  /**
   * 渲染历史记录菜单
   */
  private renderHistoryMenu(): void {
    // 创建容器（如果还不存在）
    if (!this.historyMenuContainer) {
      this.historyMenuContainer = document.createElement('div');

      // 根据显示模式决定容器位置
      if (this.historyDisplayMode === 'fixed') {
        // 固定模式：添加到编辑器容器
        const editorDomNode = this.editor.getDomNode();
        if (editorDomNode) {
          editorDomNode.appendChild(this.historyMenuContainer);
        } else {
          document.body.appendChild(this.historyMenuContainer);
        }
      } else {
        // 浮动模式：添加到 body
        document.body.appendChild(this.historyMenuContainer);
      }

      this.historyMenuRoot = createRoot(this.historyMenuContainer);
    }

    // 计算固定面板位置（仅在固定模式）
    let fixedPosition: { x: number; y: number; width: number; height: number } | undefined;

    if (this.historyDisplayMode === 'fixed' && this.domNode) {
      const editorDomNode = this.editor.getDomNode();
      if (editorDomNode) {
        const zoneRect = this.domNode.getBoundingClientRect();
        const editorRect = editorDomNode.getBoundingClientRect();
        const layoutInfo = this.editor.getLayoutInfo();

        // 计算编辑器内容区域宽度
        const minimapElement = editorDomNode.querySelector('.minimap');
        let contentWidth: number;
        if (minimapElement && layoutInfo.minimap.minimapWidth > 0) {
          contentWidth = layoutInfo.minimap.minimapLeft;
        } else {
          contentWidth = layoutInfo.width;
        }

        // 面板宽度和间距
        const panelWidth = 350;
        const spacing = 16;

        // Zone Widget 宽度（从 CSS 读取，默认 700px）
        const zoneWidth = 700;

        // 计算面板位置：在 Zone Widget 右侧
        const panelX = (contentWidth - zoneWidth) / 2 + zoneWidth + spacing;
        const panelY = zoneRect.top - editorRect.top;
        const panelHeight = zoneRect.height;

        fixedPosition = {
          x: panelX,
          y: panelY,
          width: panelWidth,
          height: panelHeight
        };
      }
    }

    // 渲染菜单
    if (this.historyMenuRoot) {
      this.historyMenuRoot.render(
        React.createElement(InlineChatHistory, {
          isOpen: this.isHistoryOpen,
          onClose: () => {
            this.isHistoryOpen = false;
            this.renderHistoryMenu();
          },
          onSelectSession: (sessionId: string) => {
            this.loadHistorySession(sessionId);
          },
          buttonRef: this.historyButtonElement,
          currentFileUri: this.currentFileUri,
          displayMode: this.historyDisplayMode,
          fixedPosition: fixedPosition
        })
      );
    }
  }

  /**
   * 加载历史会话
   */
  private async loadHistorySession(sessionId: string): Promise<void> {
    try {
      // 获取会话详情
      const session = await inlineChatHistoryService.getSession(sessionId);
      if (!session) {
        console.error('[AIZoneWidget] 会话不存在:', sessionId);
        return;
      }

      // 获取消息列表
      const messages = await inlineChatHistoryService.getMessages(sessionId);
      console.log('[AIZoneWidget] 加载历史会话:', session.title, messages.length, '条消息');

      // 清空当前历史
      this.chatHistory = [];

      // 恢复消息历史到聊天记录
      messages.forEach(msg => {
        this.chatHistory.push({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        });
      });

      // 如果有消息，显示最后一轮对话
      if (messages.length > 0) {
        // 找到最后一个用户消息和对应的助手回复
        let lastUserMessage = '';
        let lastAssistantMessage = '';

        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && !lastAssistantMessage) {
            lastAssistantMessage = messages[i].content;
          } else if (messages[i].role === 'user' && !lastUserMessage) {
            lastUserMessage = messages[i].content;
            break;
          }
        }

        // 显示用户问题
        if (lastUserMessage && this.messageDisplayElement) {
          const messageText = this.messageDisplayElement.querySelector('.ai-zone-message-text');
          if (messageText) {
            messageText.textContent = lastUserMessage;
          }
          this.messageDisplayElement.style.display = 'block';
          this.currentUserMessage = lastUserMessage;
        }

        // 显示助手回复
        if (lastAssistantMessage) {
          this.updateAIResponse(lastAssistantMessage);
        }

        // 调整高度
        requestAnimationFrame(() => {
          this.adjustContainerHeightForMessage();
        });
      }

      // 更新输入框提示
      if (this.inputElement) {
        this.inputElement.placeholder = '继续对话';
      }

    } catch (error) {
      console.error('[AIZoneWidget] 加载历史会话失败:', error);
    }
  }

  /**
   * 新建聊天
   */
  private createNewChat(): void {
    // 如果正在生成，先停止
    if (this.isGenerating && this.options.onStop) {
      this.options.onStop();
    }

    // 清空聊天历史
    this.chatHistory = [];

    // 清空当前用户消息
    this.currentUserMessage = '';

    // 清空选中文件列表
    this.selectedFiles = [];
    this.updateSelectedFilesToolbar();

    // 清空输入框并恢复初始 placeholder
    if (this.inputElement) {
      this.inputElement.value = '';
      this.inputElement.placeholder = 'AI 描述您想要做什么...';
    }

    // 隐藏消息显示区域
    if (this.messageDisplayElement) {
      this.messageDisplayElement.style.display = 'none';
    }

    // 关闭消息覆盖层
    if (this.messageOverlay) {
      this.messageOverlay.style.display = 'none';
    }

    // 重置生成状态
    this.isGenerating = false;

    // 清除思考动画定时器
    if (this.thinkingAnimationInterval) {
      clearInterval(this.thinkingAnimationInterval);
      this.thinkingAnimationInterval = null;
    }

    // 更新发送按钮状态
    this.updateSendButton();

    // 新建聊天时，暂时禁用边框位置更新
    // 这样可以防止布局变化事件触发边框位置更新
    this.shouldUpdateBorder = false;

    // 调整容器高度并让输入框获得焦点
    // 新建聊天时，如果高度没有变化，不应该更新边框位置
    requestAnimationFrame(() => {
      this.adjustContainerHeightForMessage(false);
      // 等待布局完成后恢复边框更新并让输入框获得焦点
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 恢复边框更新（布局变化已经完成）
          this.shouldUpdateBorder = true;
          if (this.inputElement) {
            this.inputElement.focus();
          }
        });
      });
    });
  }

  /**
   * 处理@按钮点击，显示上下文菜单
   */
  private async handleContextMenuClick(): Promise<void> {
    if (this.isContextMenuOpen) {
      this.closeContextMenu();
      return;
    }

    if (!this.contextMenuContainer) {
      console.error('[AIZoneWidget] 上下文菜单容器未创建');
      return;
    }

    if (!this.addContextBtn) {
      console.error('[AIZoneWidget] @按钮未创建');
      return;
    }

    // 重置菜单状态
    this.currentMenuLevel = 'level1';
    this.currentCategory = null;

    // 确保容器有正确的尺寸和位置（从按钮获取）
    const buttonRect = this.addContextBtn.getBoundingClientRect();
    const containerRect = this.contextMenuContainer.getBoundingClientRect();
    const parentRect = this.contextMenuContainer.parentElement?.getBoundingClientRect();
    
    if (buttonRect.width > 0 && buttonRect.height > 0) {
      // 设置容器的尺寸和位置，使其与按钮对齐
      this.contextMenuContainer.style.width = `${buttonRect.width}px`;
      this.contextMenuContainer.style.height = `${buttonRect.height}px`;
      // 确保容器可见（用于位置计算），但保持透明
      this.contextMenuContainer.style.opacity = '0';
      this.contextMenuContainer.style.visibility = 'visible';
    }

    // 创建 React Root
    if (!this.contextMenuRoot) {
      this.contextMenuRoot = createRoot(this.contextMenuContainer);
    }

    // 清空最近文件映射
    this.recentFilesMap.clear();

    // 获取最近文件并建立映射
    try {
      const response = await window.electron?.workspace?.getRecentFiles();
      if (response?.success && response.data && Array.isArray(response.data)) {
        response.data.slice(0, 3).forEach((filePath: string, index: number) => {
          this.recentFilesMap.set(`recent-file-${index}`, filePath);
        });
      }
    } catch (error) {
      console.error('[AIZoneWidget] 获取最近文件失败:', error);
    }

    // 显示一级菜单
    await this.showMenuLevel1();
  }

  /**
   * 显示一级菜单（分类菜单）
   */
  private async showMenuLevel1(): Promise<void> {
    if (!this.contextMenuRoot) return;

    const menuGroups = await buildLevel1MenuItems();

    // 渲染Select组件（使用受控模式）
    setTimeout(() => {
      if (!this.contextMenuRoot) return;
      
      this.contextMenuRoot.render(
        React.createElement(Select, {
          value: '',
          onChange: (value: string) => this.handleContextMenuItemSelect(value),
          groups: menuGroups,
          placeholder: '选择上下文...',
          className: 'ai-zone-context-select',
          showSearch: true, // 一级菜单显示搜索
          open: true,
          onItemClick: (value: string) => {
            // 如果是分类选项，不关闭菜单，以便切换到二级菜单
            if (value.startsWith('category-')) {
              return false; // 返回 false 表示不关闭菜单
            }
            // 其他选项（如最近文件）默认关闭菜单
            return true;
          },
          onOpenChange: (isOpen: boolean) => {
            this.isContextMenuOpen = isOpen;
            if (isOpen) {
              this.disableEditorScroll();
            } else {
              this.enableEditorScroll();
              this.closeContextMenu();
            }
          },
        })
      );

      this.isContextMenuOpen = true;
      this.currentMenuLevel = 'level1';
    }, 0);
  }

  /**
   * 显示二级菜单（具体选项菜单）
   */
  private async showMenuLevel2(category: string): Promise<void> {
    if (!this.contextMenuRoot) return;

    this.currentCategory = category;
    const menuGroups = await buildLevel2MenuItems(
      category,
      (filePath: string) => this.handleFileSelect(filePath),
      (promptId: string) => this.handlePromptSelect(promptId),
      (kbId: string) => this.handleKnowledgeBaseSelect(kbId),
      (agentId: string) => this.handleAgentSelect(agentId),
      (snippetId: number) => this.handleSnippetSelect(snippetId)
    );

    // 渲染Select组件（使用受控模式）
    setTimeout(() => {
      if (!this.contextMenuRoot) return;
      
      this.contextMenuRoot.render(
        React.createElement(Select, {
          value: '',
          onChange: (value: string) => this.handleContextMenuItemSelect(value),
          groups: menuGroups,
          placeholder: '选择选项...',
          className: 'ai-zone-context-select',
          showSearch: true, // 二级菜单显示搜索
          headerLeftIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-left', size: 16 }),
          onHeaderLeftClick: () => {
            // 返回一级菜单
            this.showMenuLevel1();
          },
          open: true,
          onOpenChange: (isOpen: boolean) => {
            this.isContextMenuOpen = isOpen;
            if (isOpen) {
              this.disableEditorScroll();
            } else {
              this.enableEditorScroll();
              this.closeContextMenu();
            }
          },
        })
      );

      this.isContextMenuOpen = true;
      this.currentMenuLevel = 'level2';
    }, 0);
  }

  /**
   * 处理上下文菜单项选择
   */
  private async handleContextMenuItemSelect(value: string): Promise<void> {
    // 如果是一级菜单，检查是否需要显示二级菜单
    if (this.currentMenuLevel === 'level1') {
      // 最近文件选项
      if (value.startsWith('recent-file-')) {
        this.closeContextMenu();
        const filePath = this.recentFilesMap.get(value);
        if (filePath) {
          await this.handleFileSelect(filePath);
        }
        return;
      }
      
      // 分类选项，显示二级菜单
      if (value.startsWith('category-')) {
        await this.showMenuLevel2(value);
        return;
      }
    }

    // 二级菜单选择，执行具体操作
    this.closeContextMenu();

    // 根据value前缀判断操作类型
    if (value.startsWith('file-')) {
      // 文件选择（从资源管理器）
      const filePath = value.replace('file-', '');
      await this.handleFileSelect(filePath);
    } else if (value.startsWith('folder-')) {
      // 文件夹选择（从资源管理器）
      const folderPath = value.replace('folder-', '');
      await this.handleFolderSelect(folderPath);
    } else if (value.startsWith('kb-')) {
      // 知识库选项（从二级菜单选择）
      const kbId = value.replace('kb-', '');
      this.handleKnowledgeBaseSelect(kbId);
    } else if (value.startsWith('agent-')) {
      // AI智能体选项（从二级菜单选择）
      const agentId = value.replace('agent-', '');
      this.handleAgentSelect(agentId);
    } else if (value.startsWith('prompt-')) {
      // 提取提示词ID（去掉prompt-前缀）
      const promptId = value.replace('prompt-', '');
      this.handlePromptSelect(promptId);
    } else if (value.startsWith('snippet-')) {
      // 提取片段ID（去掉snippet-前缀）
      const snippetIdStr = value.replace('snippet-', '');
      const snippetId = parseInt(snippetIdStr, 10);
      if (!isNaN(snippetId)) {
        await this.handleSnippetSelect(snippetId);
      }
    }
  }

  /**
   * 关闭上下文菜单
   */
  private closeContextMenu(): void {
    if (this.contextMenuRoot) {
      this.contextMenuRoot.unmount();
      this.contextMenuRoot = null;
    }

    // 注意：contextMenuContainer 不需要从 DOM 中移除，因为它已经附加到按钮容器中
    // 只需要清空内容即可

    this.isContextMenuOpen = false;
    this.currentMenuLevel = 'level1';
    this.currentCategory = null;
  }

  /**
   * 处理搜索
   */
  private handleSearch(): void {
    // 在输入框中插入搜索提示
    if (this.inputElement) {
      const currentValue = this.inputElement.value;
      const cursorPos = this.inputElement.selectionStart || currentValue.length;
      const newValue = currentValue.slice(0, cursorPos) + '@search ' + currentValue.slice(cursorPos);
      this.inputElement.value = newValue;
      this.inputElement.focus();
      this.inputElement.setSelectionRange(cursorPos + 8, cursorPos + 8);
    }
  }

  /**
   * 处理文件选择
   */
  private async handleFileSelect(filePath: string): Promise<void> {
    try {
      // 读取文件内容
      const result = await window.electron?.file?.read(filePath);
      if (result?.success && result.data?.content) {
        const fileName = getFileName(filePath);
        const fileContent = result.data.content;
        
        // 检查文件是否已经选中，避免重复添加
        const isAlreadySelected = this.selectedFiles.some(file => file.path === filePath);
        if (!isAlreadySelected) {
          // 默认使用临时存储
          const fileInfo = { path: filePath, name: fileName, storeType: 'temporary' as const };
          // 添加到选中文件列表
          this.selectedFiles.push(fileInfo);
          // 更新工具栏显示
          this.updateSelectedFilesToolbar();
          
          // 默认添加到临时向量存储
          await this.addFileToVectorStore(filePath, fileContent, 'temporary');
        }
        
        // 不再在输入框中插入 @file 引用，避免污染用户输入内容
        if (this.inputElement) {
          this.inputElement.focus();
        }
      }
    } catch (error) {
      console.error('[AIZoneWidget] 读取文件失败:', error);
    }
  }

  /**
   * 添加文件到向量存储
   */
  private async addFileToVectorStore(filePath: string, content: string, storeType: 'persistent' | 'temporary'): Promise<void> {
    try {
      const result = await window.electron?.fileReference?.add(
        filePath,
        content,
        storeType,
        this.currentSessionId
      );
      if (result?.success) {
        console.log(`[AIZoneWidget] 文件已添加到${storeType === 'persistent' ? '持久化' : '临时'}向量存储:`, filePath);
      } else {
        console.error('[AIZoneWidget] 添加文件到向量存储失败:', result?.error);
      }
    } catch (error) {
      console.error('[AIZoneWidget] 添加文件到向量存储异常:', error);
    }
  }

  /**
   * 更新文件的存储类型
   */
  private async updateFileStoreType(filePath: string, storeType: 'persistent' | 'temporary'): Promise<void> {
    const file = this.selectedFiles.find(f => f.path === filePath);
    if (!file) return;

    // 如果存储类型没有变化，直接返回
    if (file.storeType === storeType) return;

    // 读取文件内容
    try {
      const result = await window.electron?.file?.read(filePath);
      if (result?.success && result.data?.content) {
        const fileContent = result.data.content;
        
        // 更新存储类型
        file.storeType = storeType;
        
        // 重新添加到向量存储（新的存储类型）
        await this.addFileToVectorStore(filePath, fileContent, storeType);
      }
    } catch (error) {
      console.error('[AIZoneWidget] 更新文件存储类型失败:', error);
    }
  }

  /**
   * 获取选中的文件列表
   */
  getSelectedFiles(): Array<{ path: string; name: string; storeType?: 'persistent' | 'temporary' }> {
    return [...this.selectedFiles];
  }

  /**
   * 更新选中文件工具栏显示
   */
  private updateSelectedFilesToolbar(): void {
    if (!this.selectedFilesToolbar) return;

    // 清空工具栏内容
    this.selectedFilesToolbar.innerHTML = '';

    // 如果没有选中文件，隐藏工具栏
    if (this.selectedFiles.length === 0) {
      this.selectedFilesToolbar.style.display = 'none';
      // 工具栏隐藏后，重新计算容器高度并更新边框位置
      requestAnimationFrame(() => {
        this.adjustContainerHeightForMessage();
      });
      return;
    }

    // 显示工具栏
    this.selectedFilesToolbar.style.display = 'flex';

    // 为每个选中的文件创建显示项
    this.selectedFiles.forEach((file) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'ai-zone-selected-file-item';

      // 创建图标容器
      const iconContainer = document.createElement('span');
      const iconRoot = createRoot(iconContainer);
      iconRoot.render(
        React.createElement(Icon, {
          iconSet: 'ui',
          name: 'file',
          size: 14
        })
      );
      fileItem.appendChild(iconContainer);

      // 创建文件名文本
      const fileNameText = document.createElement('span');
      fileNameText.className = 'ai-zone-selected-file-name';
      fileNameText.textContent = file.name;
      fileItem.appendChild(fileNameText);

      // 创建存储类型选择复选框
      const storeTypeLabel = document.createElement('label');
      storeTypeLabel.className = 'ai-zone-file-store-type-label';
      storeTypeLabel.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--ws-descriptionForeground);
        cursor: pointer;
        user-select: none;
        margin-left: 4px;
      `;

      const storeTypeCheckbox = document.createElement('input');
      storeTypeCheckbox.type = 'checkbox';
      storeTypeCheckbox.className = 'ai-zone-file-store-type-checkbox';
      storeTypeCheckbox.checked = file.storeType === 'persistent';
      storeTypeCheckbox.title = file.storeType === 'persistent' ? '已添加到知识库' : '添加到知识库';
      storeTypeCheckbox.addEventListener('mousedown', (e) => e.stopPropagation());
      storeTypeCheckbox.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newStoreType = storeTypeCheckbox.checked ? 'persistent' : 'temporary';
        await this.updateFileStoreType(file.path, newStoreType);
        storeTypeCheckbox.title = newStoreType === 'persistent' ? '已添加到知识库' : '添加到知识库';
      });

      const storeTypeText = document.createElement('span');
      storeTypeText.textContent = '知识库';
      storeTypeText.style.cssText = `
        font-size: 11px;
        color: var(--ws-descriptionForeground);
      `;

      storeTypeLabel.appendChild(storeTypeCheckbox);
      storeTypeLabel.appendChild(storeTypeText);
      fileItem.appendChild(storeTypeLabel);

      // 创建删除按钮
      const removeBtn = document.createElement('button');
      removeBtn.className = 'ai-zone-selected-file-remove';
      removeBtn.title = '移除文件';
      removeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 从列表中移除文件（使用文件路径查找）
        const fileIndex = this.selectedFiles.findIndex(f => f.path === file.path);
        if (fileIndex !== -1) {
          this.selectedFiles.splice(fileIndex, 1);
          // 更新工具栏显示
          this.updateSelectedFilesToolbar();
        }
      });

      // 删除图标
      const removeIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      removeIconSvg.setAttribute('viewBox', '0 0 16 16');
      removeIconSvg.style.width = '12px';
      removeIconSvg.style.height = '12px';
      const removePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      removePath.setAttribute('d', 'M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z');
      removePath.setAttribute('fill', 'currentColor');
      removeIconSvg.appendChild(removePath);
      removeBtn.appendChild(removeIconSvg);

      fileItem.appendChild(removeBtn);
      if (this.selectedFilesToolbar) {
        this.selectedFilesToolbar.appendChild(fileItem);
      }
    });

    // 工具栏显示后，重新计算容器高度并更新边框位置
    requestAnimationFrame(() => {
      this.adjustContainerHeightForMessage();
    });
  }

  /**
   * 处理文件夹选择
   */
  private async handleFolderSelect(folderPath: string): Promise<void> {
    try {
      // 获取文件夹中的所有笔记文件
      const result = await window.electron?.folder?.getAllNotes(folderPath);
      if (result?.success && result.data && Array.isArray(result.data) && result.data.length > 0) {
        const folderName = getFileName(folderPath);
        const files = result.data;
        
        // 读取所有文件的内容
        const fileContents: Array<{ name: string; content: string }> = [];
        for (const file of files) {
          try {
            const fileResult = await window.electron?.file?.read(file.path);
            if (fileResult?.success && fileResult.data?.content) {
              fileContents.push({
                name: file.name,
                content: fileResult.data.content
              });
            }
          } catch (error) {
            console.warn(`[AIZoneWidget] 读取文件失败: ${file.path}`, error);
          }
        }
        
        // 构建文件夹引用内容
        if (fileContents.length > 0 && this.inputElement) {
          const currentValue = this.inputElement.value;
          const cursorPos = this.inputElement.selectionStart || currentValue.length;
          
          // 构建文件夹引用格式
          let folderReference = `@folder:${folderName}\n`;
          fileContents.forEach((file) => {
            folderReference += `\n## ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n`;
          });
          folderReference += '\n';
          
          const newValue = currentValue.slice(0, cursorPos) + folderReference + currentValue.slice(cursorPos);
          this.inputElement.value = newValue;
          this.inputElement.focus();
          this.inputElement.setSelectionRange(cursorPos + folderReference.length, cursorPos + folderReference.length);
        }
      } else if (result?.success && result.data && Array.isArray(result.data) && result.data.length === 0) {
        // 文件夹为空，只插入文件夹路径
        if (this.inputElement) {
          const currentValue = this.inputElement.value;
          const cursorPos = this.inputElement.selectionStart || currentValue.length;
          const folderName = getFileName(folderPath);
          const folderReference = `@folder:${folderName}\n(文件夹为空)\n`;
          const newValue = currentValue.slice(0, cursorPos) + folderReference + currentValue.slice(cursorPos);
          this.inputElement.value = newValue;
          this.inputElement.focus();
          this.inputElement.setSelectionRange(cursorPos + folderReference.length, cursorPos + folderReference.length);
        }
      }
    } catch (error) {
      console.error('[AIZoneWidget] 处理文件夹失败:', error);
    }
  }

  /**
   * 处理提示词选择
   */
  private handlePromptSelect(promptId: string): void {
    // 根据提示词ID插入对应的提示词模板（已移除代码相关的）
    const promptTemplates: Record<string, string> = {
      'doc-summary': '请为以下文档生成摘要：\n\n',
      'doc-translate': '请将以下文档翻译成中文：\n\n',
      'summarize': '请总结以下内容：\n\n',
      'rewrite': '请重写以下内容，使其更加清晰和易读：\n\n',
    };

    const template = promptTemplates[promptId] || '';
    
    if (this.inputElement && template) {
      const currentValue = this.inputElement.value;
      const cursorPos = this.inputElement.selectionStart || currentValue.length;
      const newValue = currentValue.slice(0, cursorPos) + template + currentValue.slice(cursorPos);
      this.inputElement.value = newValue;
      this.inputElement.focus();
      this.inputElement.setSelectionRange(cursorPos + template.length, cursorPos + template.length);
    }
  }

  /**
   * 处理知识库选择
   */
  private handleKnowledgeBaseSelect(kbId: string): void {
    // 在输入框中插入知识库引用
    if (this.inputElement) {
      const currentValue = this.inputElement.value;
      const cursorPos = this.inputElement.selectionStart || currentValue.length;
      const kbReference = `@knowledge-base:${kbId}\n`;
      const newValue = currentValue.slice(0, cursorPos) + kbReference + currentValue.slice(cursorPos);
      this.inputElement.value = newValue;
      this.inputElement.focus();
      this.inputElement.setSelectionRange(cursorPos + kbReference.length, cursorPos + kbReference.length);
    }
  }

  /**
   * 处理AI智能体选择
   */
  private handleAgentSelect(agentId: string): void {
    // 在输入框中插入智能体引用
    if (this.inputElement) {
      const currentValue = this.inputElement.value;
      const cursorPos = this.inputElement.selectionStart || currentValue.length;
      const agentReference = `@agent:${agentId}\n`;
      const newValue = currentValue.slice(0, cursorPos) + agentReference + currentValue.slice(cursorPos);
      this.inputElement.value = newValue;
      this.inputElement.focus();
      this.inputElement.setSelectionRange(cursorPos + agentReference.length, cursorPos + agentReference.length);
    }
  }

  /**
   * 处理片段选择
   */
  private async handleSnippetSelect(snippetId: number): Promise<void> {
    try {
      const snippet = await snippetService.getSnippet(snippetId);
      if (snippet && snippet.body) {
        // 在输入框中插入片段内容
        if (this.inputElement) {
          const currentValue = this.inputElement.value;
          const cursorPos = this.inputElement.selectionStart || currentValue.length;
          const snippetContent = snippet.body + '\n';
          const newValue = currentValue.slice(0, cursorPos) + snippetContent + currentValue.slice(cursorPos);
          this.inputElement.value = newValue;
          this.inputElement.focus();
          this.inputElement.setSelectionRange(cursorPos + snippetContent.length, cursorPos + snippetContent.length);
        }
      }
    } catch (error) {
      console.error('[AIZoneWidget] 获取片段失败:', error);
    }
  }

  /**
   * 清理
   */
  public dispose(): void {
    // 防止重复销毁
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // 恢复编辑器滚动（如果下拉菜单还在打开状态）
    if (this.isDropdownOpen) {
      this.enableEditorScroll();
    }

    this.hide();
    this.chatHistory = [];
    this.selectedText = '';

    // 清除思考动画定时器
    if (this.thinkingAnimationInterval) {
      clearInterval(this.thinkingAnimationInterval);
      this.thinkingAnimationInterval = null;
    }

    // 销毁 React Root
    if (this.toolbarModelDropdownRoot) {
      this.toolbarModelDropdownRoot.unmount();
      this.toolbarModelDropdownRoot = null;
    }

    // 关闭并销毁上下文菜单
    this.closeContextMenu();
    
    // 清空最近文件映射
    this.recentFilesMap.clear();

    // 销毁历史记录菜单
    if (this.historyMenuRoot) {
      this.historyMenuRoot.unmount();
      this.historyMenuRoot = null;
    }

    if (this.historyMenuContainer) {
      document.body.removeChild(this.historyMenuContainer);
      this.historyMenuContainer = null;
    }

    // 清理模型相关数据
    this.modelGroups = [];
    this.updateModelSelectionFn = null;

    // 清理边框位置更新函数引用
    this.updateBorderPositionFn = null;

    // 清除单例实例
    if (AIZoneWidget.instance === this) {
      AIZoneWidget.instance = null;
    }
  }
}

