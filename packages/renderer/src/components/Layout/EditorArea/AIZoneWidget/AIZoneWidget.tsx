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
import { aiAgentService } from '../../../../services/AIAgentService';
import { knowledgeBaseService } from '../../../Layout/Sidebar/KnowledgeBase/knowledgeBaseService';
import './AIZoneWidget.scss';

/**
 * 获取文件名（不包含路径）
 */
function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/**
 * 更多文件菜单组件
 */
interface MoreFilesMenuProps {
  files: Array<{ path: string; name: string }>;
  onRemoveFile: (filePath: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const MoreFilesMenu: React.FC<MoreFilesMenuProps> = ({ files, onRemoveFile, onMouseEnter, onMouseLeave }) => {
  return (
    <div 
      className="ai-zone-more-files-menu-content"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {files.map((file) => (
        <div key={file.path} className="ai-zone-more-files-menu-item">
          <span className="ai-zone-more-files-menu-item-icon">
            <Icon iconSet="ui" name="file" size={14} />
          </span>
          <span className="ai-zone-more-files-menu-item-name">{file.name}</span>
          <button
            className="ai-zone-more-files-menu-item-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFile(file.path);
            }}
            title="移除文件"
          >
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};


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
  private static instances: Map<string, AIZoneWidget> = new Map(); // 多实例管理，以 tabId 为键
  private static readonly MIN_DIFF_SPACING_PX = 0; // diff 区域与底部边界的最小间距
  private editor: monaco.editor.IStandaloneCodeEditor;
  private tabId: string | undefined; // 当前标签页ID
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
  private scrollDisposable: monaco.IDisposable | null = null; // 滚动事件监听
  private layoutDisposable: monaco.IDisposable | null = null; // 布局变化监听
  private contentChangeDisposable: monaco.IDisposable | null = null; // 内容变化监听
  private isDisposed: boolean = false; // 标记是否已销毁，防止重复销毁
  private adjustHeightFn: (() => void) | null = null; // 高度调整函数
  private dropdownClickHandler: ((e: MouseEvent) => void) | null = null; // 下拉菜单点击监听
  private isDropdownOpen: boolean = false; // 下拉菜单是否打开
  private originalScrollbarOptions: any = null; // 原始滚动条配置
  private messageDisplayElement: HTMLElement | null = null; // 消息显示区域
  private completedResponseElement: HTMLElement | null = null; // 完成响应显示区域（在 bottomBorder 下方）
  private currentUserMessage: string = ''; // 当前用户消息
  private thinkingAnimationInterval: number | null = null; // 思考动画定时器
  private documentReferences: Array<{ fileName: string; filePath?: string; knowledgeBaseName?: string; chunks: number }> = []; // 文档引用列表
  private documentReferencesElement: HTMLElement | null = null; // 文档引用显示区域
  private modelGroups: SelectGroup[] = []; // 模型分组数据
  private updateModelSelectionFn: ((newModel: string) => void) | null = null; // 模型选择更新函数
  private handleDropdownOpenChangeFn: ((isOpen: boolean) => void) | null = null; // 下拉菜单打开/关闭回调
  private closeDropdownFn: (() => void) | null = null; // 关闭下拉菜单的函数
  private targetLineNumber: number = 0; // Zone Widget 插入的行号
  private currentMenuLevel: 'level1' | 'level2' = 'level1'; // 当前菜单级别
  private topBorderElement: HTMLElement | null = null; // 顶部边框元素
  private bottomBorderElement: HTMLElement | null = null; // 底部边框元素
  private viewZoneElement: HTMLElement | null = null; // view-zone 元素
  private borderContainer: HTMLElement | null = null; // 边框容器（overflow-guard 或 monaco-scrollable-element）
  private savedViewZoneTop: number | null = null; // 保存的 view-zone 绝对位置（用于内容变化时恢复）
  private savedBottomBorderTop: number | null = null; // 保存的底部边框位置（用于标签页切换时保持位置）
  private currentCategory: string | null = null; // 当前选中的一级分类
  private historyButtonElement: HTMLButtonElement | null = null; // 历史记录按钮元素
  private historyMenuRoot: Root | null = null; // 历史记录菜单 React Root
  private historyMenuContainer: HTMLElement | null = null; // 历史记录菜单容器
  private isHistoryOpen: boolean = false; // 历史记录菜单是否打开
  private currentFileUri: string = ''; // 当前文件 URI
  private historyDisplayMode: 'floating' | 'fixed' = 'floating'; // 历史记录显示模式
  private historyPanelElement: HTMLElement | null = null; // 固定历史面板容器
  private contextMenuRoot: Root | null = null; // 上下文菜单 React Root（使用Select组件）
  private contextMenuContainer: HTMLElement | null = null; // 上下文菜单容器（工具栏@按钮使用）
  private inputContextMenuRoot: Root | null = null; // 输入框@菜单 React Root（使用Select组件）
  private inputContextMenuContainer: HTMLElement | null = null; // 输入框@菜单容器（输入框@符号触发使用）
  private isContextMenuOpen: boolean = false; // 上下文菜单是否打开
  private recentFilesMap: Map<string, string> = new Map(); // 最近文件映射（index -> filePath）
  private selectedFiles: Array<{ path: string; name: string; type?: 'file' | 'knowledge-base'; kbId?: string }> = []; // 选中的文件列表（支持文件和知识库）
  private selectedFilesToolbar: HTMLElement | null = null; // 显示选中文件的工具栏
  private selectedFilesToolbarWasVisible: boolean = false; // 记录工具栏之前的显示状态，用于判断是否需要更新高度
  private selectedFilesToolbarHeight: number = 0; // 记录工具栏之前的高度，用于检测高度变化（换行等情况）
  private bottomToolbar: HTMLElement | null = null; // 底部工具栏
  private currentSessionId: string = 'default'; // 当前会话ID
  private agentMenuRoot: Root | null = null; // 智能体菜单 React Root
  private agentMenuContainer: HTMLElement | null = null; // 智能体菜单容器
  private isAgentMenuOpen: boolean = false; // 智能体菜单是否打开
  private moreFilesMenuRoot: Root | null = null; // 更多文件菜单 React Root
  private moreFilesMenuContainer: HTMLElement | null = null; // 更多文件菜单容器
  private heightAdjustTimer: NodeJS.Timeout | null = null; // 高度调整防抖定时器
  private positionFixTimer: NodeJS.Timeout | null = null; // 位置修复防抖定时器（用于流式输出时）
  private contextMenuPositionUpdateTimer: NodeJS.Timeout | null = null; // @菜单位置更新定时器
  private contextMenuPositionUpdateHandler: (() => void) | null = null; // @菜单位置更新处理器
  private contextMenuScrollHandler: (() => void) | null = null; // @菜单滚动监听器
  private contextMenuResizeHandler: (() => void) | null = null; // @菜单窗口大小变化监听器
  private contextMenuEditorScrollHandler: ((e: Event) => void) | null = null; // @菜单编辑器滚动监听器
  private contextMenuScrollableElement: HTMLElement | null = null; // @菜单编辑器滚动容器
  private isMoreFilesMenuOpen: boolean = false; // 更多文件菜单是否打开
  private moreFilesMenuTimeout: number | null = null; // 更多文件菜单延迟关闭定时器
  private aiAgentBtn: HTMLButtonElement | null = null; // AI智能体按钮元素
  private expandedFolders: Set<string> = new Set(); // 展开的文件夹路径集合
  private deepThinkingEnabled: boolean = true; // 深度思考开关状态
  private borderElement: HTMLElement | null = null; // 顶部边框元素（不在 ai-zone-container 内部）
  private isLayoutChanging: boolean = false; // 标记是否正在处理布局变化（窗口大小变化等）
  private wasEditorHidden: boolean = false; // 标记编辑器之前是否被隐藏（用于检测标签页重新激活）
  private layoutChangeTimer: NodeJS.Timeout | null = null; // 布局变化防抖定时器

  constructor(editor: monaco.editor.IStandaloneCodeEditor, options: AIZoneWidgetOptions, tabId?: string) {
    this.editor = editor;
    this.options = options;
    this.tabId = tabId;
    this.injectStyles();

    // 如果提供了 tabId，将实例存储到 Map 中
    if (tabId) {
      // 如果该 tabId 已存在实例，先销毁旧实例
      const existingInstance = AIZoneWidget.instances.get(tabId);
      if (existingInstance) {
        existingInstance.dispose();
      }
      AIZoneWidget.instances.set(tabId, this);
    }

    // 设置默认模型
    if (options.availableModels && options.availableModels.length > 0) {
      this.selectedModel = options.availableModels[0];
    }
  }

  /**
   * 获取指定标签页的实例
   */
  static getInstanceByTabId(tabId: string): AIZoneWidget | null {
    return AIZoneWidget.instances.get(tabId) || null;
  }

  /**
   * 获取所有实例
   */
  static getAllInstances(): AIZoneWidget[] {
    return Array.from(AIZoneWidget.instances.values());
  }

  /**
   * 获取当前实例（兼容旧代码，返回第一个可见的实例）
   */
  static getInstance(): AIZoneWidget | null {
    // 返回第一个可见的实例，如果没有则返回第一个实例
    for (const instance of AIZoneWidget.instances.values()) {
      if (instance.isVisible()) {
        return instance;
      }
    }
    // 如果没有可见的实例，返回第一个实例
    return AIZoneWidget.instances.values().next().value || null;
  }

  /**
   * 检查指定标签页是否有实例存在
   */
  static hasInstanceByTabId(tabId: string): boolean {
    const instance = AIZoneWidget.instances.get(tabId);
    return instance !== undefined && instance.isVisible();
  }

  /**
   * 检查是否已有实例存在（兼容旧代码）
   */
  static hasInstance(): boolean {
    for (const instance of AIZoneWidget.instances.values()) {
      if (instance.isVisible()) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取当前标签页ID
   */
  getTabId(): string | undefined {
    return this.tabId;
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
    console.log('[AIZoneWidget] ========== createDomNode 被调用 ==========');
    // 保证每次重建 DOM 前清理旧的边框元素，避免遗留在编辑器中
    this.removeBorderElements();

    const container = document.createElement('div');
    container.className = 'ai-zone-container';
    console.log('[AIZoneWidget] 容器已创建:', container);
    // 不设置内联样式，CSS 完全控制宽度和布局
    // 确保不设置 top 属性，位置完全由 view-zone 控制
    if (container.style.top) {
      container.style.removeProperty('top');
    }

    const topBorder = document.createElement('div');
    topBorder.className = 'ai-zone-border ai-zone-border-top';

    const bottomBorder = document.createElement('div');
    bottomBorder.className = 'ai-zone-border ai-zone-border-bottom';

    // 阻止容器内所有事件冒泡到 Monaco 编辑器
    // 但允许下拉菜单内的事件正常冒泡（CustomSelect 需要事件冒泡来处理点击外部关闭）
    const shouldStopPropagation = (e: Event) => {
      const target = e.target as HTMLElement;

      // 如果点击的是按钮，不阻止事件传播（按钮有自己的事件处理）
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return false;
      }

      // 如果点击的是输入框，不阻止事件传播
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.closest('textarea') || target.closest('input')) {
        return false;
      }

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

    // 消息内容容器
    const messageContent = document.createElement('div');
    messageContent.className = 'ai-zone-message-content';

    // AI 头像（初始状态显示思考中，使用 AI 头像）
    const avatar = this.createAIAvatar();
    messageContent.appendChild(avatar);

    // 消息文本
    const messageText = document.createElement('div');
    messageText.className = 'ai-zone-message-text';
    messageText.textContent = '正在思考';

    // 思考动画点
    const thinkingDots = document.createElement('span');
    thinkingDots.className = 'ai-zone-thinking-dots';
    messageText.appendChild(thinkingDots);

    messageContent.appendChild(messageText);
    messageDisplay.appendChild(messageContent);
    content.appendChild(messageDisplay);

    // 文档引用显示区域（在消息显示区域下方）
    const documentReferencesDisplay = document.createElement('div');
    documentReferencesDisplay.className = 'ai-zone-document-references';
    documentReferencesDisplay.style.display = 'none'; // 初始隐藏
    this.documentReferencesElement = documentReferencesDisplay;
    content.appendChild(documentReferencesDisplay);

    // 一体化输入容器（包含输入框和模型选择器）
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'ai-zone-input-wrapper';

    // 输入框
    const textarea = document.createElement('textarea');
    textarea.className = 'ai-zone-input';
    textarea.placeholder = '向AI描述您想要做什么...';
    textarea.rows = 1;
    this.inputElement = textarea;
    console.log('[AIZoneWidget] 输入框已创建:', textarea);
    
    // 添加焦点事件，用于调试
    textarea.addEventListener('focus', () => {
      console.log('[AIZoneWidget] ========== 输入框获得焦点 ==========');
    });
    
    // 添加点击事件，用于调试
    textarea.addEventListener('click', (e) => {
      console.log('[AIZoneWidget] ========== 输入框被点击 ==========', e);
      e.stopPropagation();
    });

    // 自动调整高度（调整输入框自身高度，并驱动整个内联容器的 view-zone 重新布局）
    const adjustHeight = () => {
      const maxInputHeight = 120;

      // 重置为 auto 以便获取最新的 scrollHeight
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;

      // 在最大高度内自适应，超过则固定高度并启用内部滚动
      const newHeight = Math.min(scrollHeight, maxInputHeight);
      textarea.style.height = scrollHeight > 0 ? `${newHeight}px` : "";

      if (scrollHeight > maxInputHeight) {
        textarea.style.overflowY = 'auto';
      
      } else {
        textarea.style.overflowY = 'hidden';
      }

      // 输入框高度变化后，同步容器高度并更新 view-zone，使后面的行号往下推
      // 使用 requestAnimationFrame 确保 DOM 布局已完成
      // 输入框换行时需要更新底部边框位置
      requestAnimationFrame(() => {
        this.syncContainerHeight(true);
        // 更新底部边框位置并保存
        requestAnimationFrame(() => {
          this.updateBottomBorderPosition();
        });
      });
    };

    // 保存引用，以便在其他地方调用
    this.adjustHeightFn = adjustHeight;

    // 输入事件：自动调整高度 + 检测@符号
    textarea.addEventListener('input', (e) => {
      adjustHeight();
      // 检测@符号，自动显示文件引用菜单
      this.handleInputForAtMention(e);
    });

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
        console.log('[AIZoneWidget] Enter 键被按下，执行发送');
        this.handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        console.log('[AIZoneWidget] Escape 键被按下，关闭面板');
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

    // 创建输入框@菜单容器（独立于工具栏@菜单）
    this.inputContextMenuContainer = document.createElement('div');
    this.inputContextMenuContainer.style.position = 'fixed';
    this.inputContextMenuContainer.style.pointerEvents = 'none';
    this.inputContextMenuContainer.style.opacity = '0';
    this.inputContextMenuContainer.style.visibility = 'hidden';
    this.inputContextMenuContainer.style.zIndex = '10000';
    document.body.appendChild(this.inputContextMenuContainer);

    // 输入框右侧操作按钮容器（VSCode 风格：模型选择、发送、关闭在同一行）
    const inputActions = document.createElement('div');
    inputActions.className = 'ai-zone-input-actions';

    // 模型选择下拉框（放在输入框内右侧，发送按钮左侧）
    if (this.options.availableModels && this.options.availableModels.length > 0) {
      const toolbarModelDropdownContainer = document.createElement('div');
      toolbarModelDropdownContainer.className = 'ai-zone-input-model-dropdown';

      // 使用 React 渲染 Select 组件
      this.toolbarModelDropdownRoot = createRoot(toolbarModelDropdownContainer);
      
      // 将模型选择器添加到操作按钮容器
      inputActions.appendChild(toolbarModelDropdownContainer);
      
      // 重新加载模型分组逻辑（保持原有逻辑）
      if (!this.updateModelSelectionFn) {
        this.loadModelGroups().then(() => {
          this.handleDropdownOpenChangeFn = (isOpen: boolean) => {
            this.isDropdownOpen = isOpen;
            if (isOpen) {
              this.disableEditorScroll();
              if (this.isContextMenuOpen) {
                this.closeContextMenu();
              }
            } else {
              this.enableEditorScroll();
            }
            if (this.toolbarModelDropdownRoot) {
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-input-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: this.isDropdownOpen
                })
              );
            }
          };

          this.updateModelSelectionFn = (newModel: string) => {
            this.selectedModel = newModel;
            if (this.toolbarModelDropdownRoot) {
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-input-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: this.isDropdownOpen
                })
              );
            }
          };

          this.closeDropdownFn = () => {
            if (this.isDropdownOpen && this.toolbarModelDropdownRoot) {
              this.isDropdownOpen = false;
              this.enableEditorScroll();
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-input-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: false
                })
              );
            }
          };

          if (this.modelGroups.length > 0 && this.toolbarModelDropdownRoot) {
            this.toolbarModelDropdownRoot.render(
              React.createElement(Select, {
                value: this.selectedModel,
                onChange: this.updateModelSelectionFn!,
                groups: this.modelGroups,
                placeholder: '选择模型',
                className: 'ai-zone-input-model-select',
                onOpenChange: this.handleDropdownOpenChangeFn!,
                open: this.isDropdownOpen
              })
            );
          }
        });
      } else {
        if (this.modelGroups.length === 0) {
          this.loadModelGroups().then(() => {
            if (this.modelGroups.length > 0 && this.toolbarModelDropdownRoot) {
              this.toolbarModelDropdownRoot.render(
                React.createElement(Select, {
                  value: this.selectedModel,
                  onChange: this.updateModelSelectionFn!,
                  groups: this.modelGroups,
                  placeholder: '选择模型',
                  className: 'ai-zone-input-model-select',
                  onOpenChange: this.handleDropdownOpenChangeFn!,
                  open: this.isDropdownOpen
                })
              );
            }
          });
        } else {
          if (this.toolbarModelDropdownRoot) {
            this.toolbarModelDropdownRoot.render(
              React.createElement(Select, {
                value: this.selectedModel,
                onChange: this.updateModelSelectionFn,
                groups: this.modelGroups,
                placeholder: '选择模型',
                className: 'ai-zone-input-model-select',
                onOpenChange: this.handleDropdownOpenChangeFn!,
                open: this.isDropdownOpen
              })
            );
          }
        }
      }
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

    console.log('[AIZoneWidget] 发送按钮已创建:', sendBtn);
    sendBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      console.log('[AIZoneWidget] ========== 发送按钮 mousedown 事件 ==========');
    });
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('[AIZoneWidget] ========== 发送按钮被点击 ==========');
      console.log('[AIZoneWidget] isGenerating:', this.isGenerating, 'inputValue:', this.inputElement?.value);
      if (this.isGenerating) {
        // 如果正在生成，点击停止
        console.log('[AIZoneWidget] 正在生成，执行停止');
        this.handleStopGeneration();
      } else {
        // 否则发送消息
        console.log('[AIZoneWidget] 执行发送消息');
        this.handleSubmit();
      }
    });

    inputActions.appendChild(sendBtn);

    // 关闭（放在输入框容器内，最右侧）
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

    inputActions.appendChild(closeBtn);
    
    // 将操作按钮容器添加到输入框容器
    inputWrapper.appendChild(inputActions);

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
    this.addContextBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      console.log('[AIZoneWidget] @按钮 mousedown 事件');
    });
    this.addContextBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('[AIZoneWidget] @按钮被点击');
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
    this.aiAgentBtn = aiAgentBtn;
    aiAgentBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    aiAgentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAgentMenu();
    });

    // 创建智能体菜单容器
    const aiAgentBtnContainer = document.createElement('div');
    aiAgentBtnContainer.style.position = 'relative';
    aiAgentBtnContainer.style.display = 'inline-block';
    
    this.agentMenuContainer = document.createElement('div');
    this.agentMenuContainer.style.position = 'absolute';
    this.agentMenuContainer.style.top = '0';
    this.agentMenuContainer.style.left = '0';
    this.agentMenuContainer.style.width = '100%';
    this.agentMenuContainer.style.height = '100%';
    this.agentMenuContainer.style.opacity = '0';
    this.agentMenuContainer.style.pointerEvents = 'none';

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
    aiAgentBtnContainer.appendChild(aiAgentBtn);
    aiAgentBtnContainer.appendChild(this.agentMenuContainer);
    leftControls.appendChild(aiAgentBtnContainer);

    // 深度思考按钮
    const deepThinkingBtn = document.createElement('button');
    deepThinkingBtn.className = 'ai-zone-toolbar-icon-btn';
    deepThinkingBtn.title = this.deepThinkingEnabled ? '深度思考已开启' : '深度思考已关闭';
    deepThinkingBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    deepThinkingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deepThinkingEnabled = !this.deepThinkingEnabled;
      deepThinkingBtn.classList.toggle('active', this.deepThinkingEnabled);
      deepThinkingBtn.title = this.deepThinkingEnabled ? '深度思考已开启' : '深度思考已关闭';
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
    deepThinkingBtn.classList.toggle('active', this.deepThinkingEnabled);
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

    // 不将边框添加到 container，而是保存引用，稍后添加到 view-zone
    this.topBorderElement = topBorder;
    this.bottomBorderElement = bottomBorder;
    
    container.appendChild(content);

    // 完成响应显示区域（在 bottomBorder 下方）
    const completedResponse = document.createElement('div');
    completedResponse.className = 'ai-zone-completed-response';
    completedResponse.style.display = 'none'; // 初始隐藏
    this.completedResponseElement = completedResponse;
    container.appendChild(completedResponse);

    return container;
  }

  /**
   * 设置滚动监听器（用于关闭菜单）
   */
  private setupScrollListeners(): void {
    // 先清理之前的监听器
    if (this.scrollDisposable) {
      this.scrollDisposable.dispose();
      this.scrollDisposable = null;
    }

    if (this.layoutDisposable) {
      this.layoutDisposable.dispose();
      this.layoutDisposable = null;
    }

    if (this.contentChangeDisposable) {
      this.contentChangeDisposable.dispose();
      this.contentChangeDisposable = null;
    }

    // 监听编辑器滚动
    this.scrollDisposable = this.editor.onDidScrollChange(() => {
      // 检查内联聊天是否仍然显示
      if (!this.zoneId || !this.isVisible()) {
        return;
      }

      // 立即检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
      // 标签页切换时，非活动标签页的编辑器也会触发滚动事件
      if (!this.isEditorReallyVisible()) {
        return;
      }

      // 额外检查：确保当前标签页是活动标签页
      const scrollEditorDomNode = this.editor.getDomNode();
      if (scrollEditorDomNode) {
        const scrollEditorContainer = scrollEditorDomNode.closest('.editor-tab-content') as HTMLElement | null;
        if (scrollEditorContainer) {
          const scrollComputedStyle = window.getComputedStyle(scrollEditorContainer);
          // 如果 display 是 none，说明不是活动标签页，不应该更新布局
          if (scrollComputedStyle.display === 'none') {
            return;
          }
        }
      }

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
      // 确保 ai-zone-container 没有 top 属性（Monaco Editor 可能会在某些情况下设置它）
      if (this.domNode && this.domNode.style.top) {
        this.domNode.style.removeProperty('top');
      }
      
      // 如果正在处理布局变化（窗口大小变化），只更新宽度和左侧位置，不更新 top/bottom
      // 这样可以避免布局混乱，因为 view-zone 的位置不会因为窗口大小变化而改变
      if (this.isLayoutChanging) {
        this.updateBorderWidthAndLeft();
      } else {
        // 正常滚动时，更新边框位置，防止边框随着编辑器滚动而移动
        // 但只在当前标签页是活动标签页时才更新，避免在标签页切换时更新
        if (this.isActiveTab()) {
          this.updateBorderPositions();
        }
      }
    });

    // 监听编辑器布局变化（窗口大小改变、小地图显示/隐藏等）
    this.layoutDisposable = this.editor.onDidLayoutChange(() => {
      // 检查内联聊天是否仍然显示
      if (!this.zoneId || !this.isVisible()) {
        this.wasEditorHidden = true;
        return;
      }

      // 立即检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
      // 这个检查必须非常严格，因为标签页切换时，非活动标签页的编辑器也会触发此事件
      const isVisible = this.isEditorReallyVisible();
      
      // 如果编辑器不可见，在标记为隐藏之前，先记录底部边框的位置
      if (!isVisible) {
        // 记录底部边框位置，用于切换回来时恢复
        if (this.bottomBorderElement && this.isActiveTab()) {
          const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
          if (currentTop > 0) {
            this.savedBottomBorderTop = currentTop;
          }
        }
        this.wasEditorHidden = true;
        return;
      }

      // 额外检查：确保当前标签页是活动标签页
      // 通过检查编辑器容器的 display 样式来确认
      const editorDomNode = this.editor.getDomNode();
      if (!editorDomNode) {
        this.wasEditorHidden = true;
        return;
      }
      
      const editorContainer = editorDomNode.closest('.editor-tab-content') as HTMLElement | null;
      if (!editorContainer) {
        // 记录底部边框位置
        if (this.bottomBorderElement && this.isActiveTab()) {
          const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
          if (currentTop > 0) {
            this.savedBottomBorderTop = currentTop;
          }
        }
        this.wasEditorHidden = true;
        return;
      }
      
      const computedStyle = window.getComputedStyle(editorContainer);
      // 如果 display 是 none，说明不是活动标签页，不应该更新布局（不延迟，立即返回）
      // 在标记为隐藏之前，先记录底部边框的位置
      if (computedStyle.display === 'none') {
        // 记录底部边框位置，用于切换回来时恢复
        if (this.bottomBorderElement && this.isActiveTab()) {
          const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
          if (currentTop > 0) {
            this.savedBottomBorderTop = currentTop;
          }
        }
        this.wasEditorHidden = true;
        return;
      }

      // 再次确认标签页是否真的可见（双重检查，确保万无一失）
      // 检查标签页容器的父元素是否可见
      let parentElement: HTMLElement | null = editorContainer.parentElement;
      while (parentElement) {
        const parentStyle = window.getComputedStyle(parentElement);
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
          // 记录底部边框位置，用于切换回来时恢复
          if (this.bottomBorderElement && this.isActiveTab()) {
            const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
            if (currentTop > 0) {
              this.savedBottomBorderTop = currentTop;
            }
          }
          this.wasEditorHidden = true;
          return;
        }
        parentElement = parentElement.parentElement;
      }

      // 清除之前的定时器，使用防抖避免频繁触发
      if (this.layoutChangeTimer) {
        clearTimeout(this.layoutChangeTimer);
      }

      // 使用防抖，避免在 AI Panel 打开/关闭或标签页切换时频繁触发
      // 延迟检查，确保 React 已经完成标签页的显示/隐藏操作
      this.layoutChangeTimer = setTimeout(() => {
        this.layoutChangeTimer = null;
        
        // 再次检查内联聊天是否仍然显示（可能在延迟期间被隐藏）
        if (!this.zoneId || !this.isVisible()) {
          // 记录底部边框位置
          if (this.bottomBorderElement && this.isActiveTab()) {
            const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
            if (currentTop > 0) {
              this.savedBottomBorderTop = currentTop;
            }
          }
          this.wasEditorHidden = true;
          return;
        }

        // 再次检查编辑器是否真的可见（可能在延迟期间标签页被切换了）
        if (!this.isEditorReallyVisible()) {
          // 记录底部边框位置
          if (this.bottomBorderElement && this.isActiveTab()) {
            const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
            if (currentTop > 0) {
              this.savedBottomBorderTop = currentTop;
            }
          }
          this.wasEditorHidden = true;
          return;
        }

        // 再次检查标签页容器（可能在延迟期间标签页被切换了）
        const checkEditorDomNode = this.editor.getDomNode();
        if (!checkEditorDomNode) {
          // 记录底部边框位置
          if (this.bottomBorderElement && this.isActiveTab()) {
            const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
            if (currentTop > 0) {
              this.savedBottomBorderTop = currentTop;
            }
          }
          this.wasEditorHidden = true;
          return;
        }
        
        const checkEditorContainer = checkEditorDomNode.closest('.editor-tab-content') as HTMLElement | null;
        if (!checkEditorContainer) {
          // 记录底部边框位置
          if (this.bottomBorderElement && this.isActiveTab()) {
            const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
            if (currentTop > 0) {
              this.savedBottomBorderTop = currentTop;
            }
          }
          this.wasEditorHidden = true;
          return;
        }
        
        const checkComputedStyle = window.getComputedStyle(checkEditorContainer);
        if (checkComputedStyle.display === 'none') {
          // 记录底部边框位置
          if (this.bottomBorderElement && this.isActiveTab()) {
            const currentTop = parseFloat(this.bottomBorderElement.style.top || '0');
            if (currentTop > 0) {
              this.savedBottomBorderTop = currentTop;
            }
          }
          this.wasEditorHidden = true;
          return;
        }

        // 如果编辑器之前被隐藏，现在变为可见，需要恢复位置
        // 但只在标签页真正切换回来时才恢复，避免切换时的闪烁
        const wasHidden = this.wasEditorHidden;
        this.wasEditorHidden = false;

        // 设置布局变化标志，防止滚动事件更新 top/bottom 位置
        this.isLayoutChanging = true;

        // 更新容器宽度（窗口大小变化时需要）
        this.updateContainerWidth();
        
        if (wasHidden) {
          // 标签页重新激活时，恢复保存的底部边框位置（如果存在）
          // 这样可以避免位置突然变化
          // 使用 requestAnimationFrame 确保在浏览器完成渲染后恢复
          requestAnimationFrame(() => {
            if (this.bottomBorderElement) {
              // 先清除 bottom: 0，避免使用默认位置
              this.bottomBorderElement.style.bottom = 'auto';
              
              // 如果有保存的位置，优先使用保存的位置
              if (this.savedBottomBorderTop !== null && this.savedBottomBorderTop > 0) {
                this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
              } else {
                // 如果没有保存的位置，尝试使用 view-zone 底部作为临时位置
                if (this.viewZoneElement) {
                  const viewZoneRect = this.viewZoneElement.getBoundingClientRect();
                  // 如果 view-zone 的位置有效（不在视口外）
                  if (viewZoneRect.width > 0 && viewZoneRect.height > 0) {
                    this.bottomBorderElement.style.top = `${viewZoneRect.bottom}px`;
                    // 保存这个位置
                    this.savedBottomBorderTop = viewZoneRect.bottom;
                  } else {
                    // 如果 view-zone 位置无效，使用 domNode 底部作为临时位置
                    if (this.domNode) {
                      const domRect = this.domNode.getBoundingClientRect();
                      if (domRect.width > 0 && domRect.height > 0) {
                        this.bottomBorderElement.style.top = `${domRect.bottom}px`;
                        // 保存这个位置
                        this.savedBottomBorderTop = domRect.bottom;
                      }
                    }
                  }
                } else if (this.domNode) {
                  // 如果 viewZoneElement 还没有准备好，使用 domNode 底部
                  const domRect = this.domNode.getBoundingClientRect();
                  if (domRect.width > 0 && domRect.height > 0) {
                    this.bottomBorderElement.style.top = `${domRect.bottom}px`;
                    // 保存这个位置
                    this.savedBottomBorderTop = domRect.bottom;
                  }
                }
              }
              
              // 确保底部边框可见
              this.bottomBorderElement.style.display = '';
              this.bottomBorderElement.style.visibility = '';
              
              // 立即更新宽度和左侧位置
              this.updateBorderWidthAndLeft();
            }
          });
          
          // 然后延迟更新完整布局
          setTimeout(() => {
            // 再次检查可见性，确保在延迟期间标签页没有被切换走
            if (!this.zoneId || !this.isVisible() || !this.isEditorReallyVisible()) {
              this.isLayoutChanging = false;
              return;
            }

            // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
            if (!this.isActiveTab()) {
              this.isLayoutChanging = false;
              return;
            }
            
            // 使用 requestAnimationFrame 确保在浏览器完成渲染后更新
            requestAnimationFrame(() => {
              // 最后一次检查可见性
              if (!this.zoneId || !this.isVisible() || !this.isEditorReallyVisible()) {
                this.isLayoutChanging = false;
                return;
              }

              // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
              if (!this.isActiveTab()) {
                this.isLayoutChanging = false;
                return;
              }
              
              // 检查 view-zone 位置是否真的需要更新
              // 如果位置已经正确，就不需要更新，避免不必要的闪烁
              const viewZoneElement = this.getViewZoneDomElement();
              if (viewZoneElement) {
                const currentTop = parseFloat(viewZoneElement.style.top || '0');
                const expectedTop = this.savedViewZoneTop;
                // 如果位置已经正确（误差在 2px 以内），就不需要更新
                if (expectedTop !== null && Math.abs(currentTop - expectedTop) < 2) {
                  // 位置已经正确，只更新宽度和左侧位置，不更新底部边框位置
                  // 这样可以避免在标签页切换时底部边框位置突然变化
                  this.updateBorderWidthAndLeft();
                  setTimeout(() => {
                    this.isLayoutChanging = false;
                  }, 100);
                  return;
                }
              }
              
              // 位置不正确，需要恢复
              this.setViewZoneTopPosition();
              // 只更新宽度和左侧位置，不更新底部边框位置（使用保存的位置）
              // 这样可以避免在标签页切换时底部边框位置突然变化
              this.updateBorderWidthAndLeft();
              
              // 如果有保存的底部边框位置，恢复它
              if (this.bottomBorderElement && this.savedBottomBorderTop !== null && this.savedBottomBorderTop > 0) {
                this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
                this.bottomBorderElement.style.bottom = 'auto';
                this.bottomBorderElement.style.display = '';
                this.bottomBorderElement.style.visibility = '';
              }
              
              // 确保 ai-zone-container 没有 top 属性
              if (this.domNode && this.domNode.style.top) {
                this.domNode.style.removeProperty('top');
              }
              
              // 延迟清除标志，并在延迟后更新完整边框位置（包括底部边框）
              // 但只在没有保存位置时才更新，避免覆盖保存的位置
              setTimeout(() => {
                // 再次检查可见性，确保在延迟期间标签页没有被切换走
                if (this.zoneId && this.isVisible() && this.isEditorReallyVisible() && this.isActiveTab()) {
                  // 只有在没有保存位置时才更新完整边框位置
                  // 如果有保存位置，说明是标签页切换回来的，应该保持保存的位置
                  if (this.savedBottomBorderTop === null || this.savedBottomBorderTop === 0) {
                    this.updateBorderPositions();
                  } else {
                    // 有保存位置，只更新顶部边框和宽度，保持底部边框位置不变
                    this.updateBorderWidthAndLeft();
                    // 确保底部边框使用保存的位置
                    if (this.bottomBorderElement) {
                      this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
                      this.bottomBorderElement.style.bottom = 'auto';
                    }
                  }
                }
                this.isLayoutChanging = false;
              }, 100);
            });
          }, 150); // 延迟 150ms，确保标签页切换完全完成，避免闪烁
        } else {
          // 窗口大小变化或侧边栏打开/关闭时，需要更新边框的宽度和左侧位置
          // 但 view-zone 的位置（top）不应该改变，因为它相对于编辑器内容区域
          requestAnimationFrame(() => {
            // 再次检查可见性，确保在异步回调执行时仍然可见
            if (!this.isEditorReallyVisible()) {
              this.isLayoutChanging = false;
              return;
            }

            // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
            if (!this.isActiveTab()) {
              this.isLayoutChanging = false;
              return;
            }

            // 只更新边框的宽度和左侧位置
            this.updateBorderWidthAndLeft();
            
            // 延迟清除标志
            setTimeout(() => {
              this.isLayoutChanging = false;
            }, 100);
          });
        }
      }, 100); // 延迟 100ms，确保 React 已经完成标签页的显示/隐藏操作，并且标签页切换完成
    });

    // 监听编辑器内容变化（当用户在编辑器中输入、换行等操作时，会触发此事件）
    const model = this.editor.getModel();
    if (model) {
      this.contentChangeDisposable = model.onDidChangeContent(() => {
        // 检查内联聊天是否仍然显示
        if (!this.zoneId || !this.isVisible()) {
          return;
        }

        // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
        if (!this.isEditorReallyVisible()) {
          return;
        }

        // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
        if (!this.isActiveTab()) {
          return;
        }

        // 在流式输出时，更积极地修复位置，防止内联聊天往上移动
        if (this.isGenerating) {
          // 使用防抖，避免频繁修复位置
          if (this.positionFixTimer) {
            clearTimeout(this.positionFixTimer);
          }
          this.positionFixTimer = setTimeout(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // 检查内联聊天是否仍然显示
                if (!this.zoneId || !this.isVisible()) {
                  return;
                }

                // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
                if (!this.isEditorReallyVisible()) {
                  return;
                }

                // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
                if (!this.isActiveTab()) {
                  return;
                }

                // 直接修复view-zone位置，确保位置稳定
                this.setViewZoneTopPosition();
                // 更新边框位置
                this.updateBorderPositions();
                
                // 检查 view-zone 的位置是否被重置（比如被 Monaco 重置到顶部）
                // 如果位置被重置，才需要修复位置
                if (this.zoneWidget && this.zoneWidget.afterLineNumber !== this.targetLineNumber) {
                  // 位置被重置了，需要修复
                  this.fixZoneWidgetPosition();
                }
              });
            });
          }, 50); // 流式输出时，使用较短的延迟，确保位置及时修复
        } else {
          // 非流式输出时，使用原有的逻辑
          // 在内容变化前，保存 view-zone 的当前绝对位置
          const viewZoneElement = this.getViewZoneDomElement();
          if (viewZoneElement && this.borderContainer) {
            const viewZoneRect = viewZoneElement.getBoundingClientRect();
            const containerRect = this.borderContainer.getBoundingClientRect();
            this.savedViewZoneTop = viewZoneRect.top - containerRect.top;
          }
          
          // 内容变化后，恢复 view-zone 的绝对位置，防止它跟着内容移动
          // 使用 requestAnimationFrame 确保在 Monaco 重新布局后恢复
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
              if (!this.isEditorReallyVisible()) {
                return;
              }

              // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
              if (!this.isActiveTab()) {
                return;
              }

              // 恢复 view-zone 的绝对位置
              if (viewZoneElement && this.savedViewZoneTop !== null) {
                viewZoneElement.style.setProperty('top', `${this.savedViewZoneTop}px`, 'important');
              }
              
              // 更新边框位置（基于恢复后的 view-zone 位置）
              this.updateBorderPositions();
              
              // 检查 view-zone 的位置是否被重置（比如被 Monaco 重置到顶部）
              // 如果位置被重置，才需要修复位置
              if (this.zoneWidget && this.zoneWidget.afterLineNumber !== this.targetLineNumber) {
                // 位置被重置了，需要修复
                this.fixZoneWidgetPosition();
                // 修复后清除保存的位置，因为已经重新计算了
                this.savedViewZoneTop = null;
              }
            });
          });
        }
      });
    }
  }

  /**
   * 显示 Zone Widget
   */
  public show(lineNumber?: number, selectedText?: string): void {
    console.log('[AIZoneWidget] ========== show 方法被调用 ==========');
    console.log('[AIZoneWidget] lineNumber:', lineNumber, 'selectedText:', selectedText);
    
    // 如果已经显示且 DOM 节点存在，检查是否需要更新
    if (this.zoneId && this.domNode && this.isVisible()) {
      // 如果只是标签页切换回来，不需要重新创建 DOM，只需要更新引用
      // 检查编辑器是否可见，如果可见说明只是标签页切换，不需要重新创建
      if (this.isEditorReallyVisible()) {
        console.log('[AIZoneWidget] 已存在且可见，更新行号、选中文本和布局');
        // 确保 ai-zone-container 没有 top 属性
        if (this.domNode.style.top) {
          this.domNode.style.removeProperty('top');
        }
        // 只更新行号和选中文本
        if (lineNumber !== undefined) {
          this.targetLineNumber = lineNumber;
        }
        if (selectedText !== undefined) {
          this.selectedText = selectedText;
          this.includeSelection = !!this.selectedText;
        }
        
        // 标签页切换回来时，强制更新布局，确保显示正常
        // 使用延迟确保标签页已经完全激活
        const wasHidden = this.wasEditorHidden;
        this.wasEditorHidden = false;
        
        if (wasHidden) {
          // 标签页切换回来，恢复保存的底部边框位置（如果存在）
          // 这样可以避免位置突然变化
          // 使用 requestAnimationFrame 确保在浏览器完成渲染后恢复
          requestAnimationFrame(() => {
            if (this.bottomBorderElement) {
              // 先清除 bottom: 0，避免使用默认位置
              this.bottomBorderElement.style.bottom = 'auto';
              
              // 如果有保存的位置，优先使用保存的位置
              if (this.savedBottomBorderTop !== null && this.savedBottomBorderTop > 0) {
                this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
              } else {
                // 如果没有保存的位置，尝试使用 view-zone 底部作为临时位置
                if (this.viewZoneElement) {
                  const viewZoneRect = this.viewZoneElement.getBoundingClientRect();
                  if (viewZoneRect.width > 0 && viewZoneRect.height > 0) {
                    this.bottomBorderElement.style.top = `${viewZoneRect.bottom}px`;
                    this.savedBottomBorderTop = viewZoneRect.bottom;
                  }
                } else if (this.domNode) {
                  const domRect = this.domNode.getBoundingClientRect();
                  if (domRect.width > 0 && domRect.height > 0) {
                    this.bottomBorderElement.style.top = `${domRect.bottom}px`;
                    this.savedBottomBorderTop = domRect.bottom;
                  }
                }
              }
              
              // 确保底部边框可见
              this.bottomBorderElement.style.display = '';
              this.bottomBorderElement.style.visibility = '';
              
              // 立即更新宽度和左侧位置（不更新底部边框位置）
              this.updateBorderWidthAndLeft();
            }
          });
          
          // 然后延迟更新完整布局
          setTimeout(() => {
            // 再次检查可见性，确保在延迟期间标签页没有被切换走
            if (!this.zoneId || !this.isVisible() || !this.isEditorReallyVisible() || !this.isActiveTab()) {
              return;
            }
            
            // 更新容器宽度
            this.updateContainerWidth();
            
            // 使用 requestAnimationFrame 确保在浏览器完成渲染后更新
            requestAnimationFrame(() => {
              // 最后一次检查可见性
              if (!this.zoneId || !this.isVisible() || !this.isEditorReallyVisible() || !this.isActiveTab()) {
                return;
              }
              
              // 更新 view-zone 位置
              this.setViewZoneTopPosition();
              
              // 只更新宽度和左侧位置，不更新底部边框位置（使用保存的位置）
              // 这样可以避免在标签页切换时底部边框位置突然变化
              this.updateBorderWidthAndLeft();
              
              // 如果有保存的底部边框位置，恢复它
              if (this.bottomBorderElement && this.savedBottomBorderTop !== null && this.savedBottomBorderTop > 0) {
                this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
                this.bottomBorderElement.style.bottom = 'auto';
                this.bottomBorderElement.style.display = '';
                this.bottomBorderElement.style.visibility = '';
              }
              
              // 确保 ai-zone-container 没有 top 属性
              if (this.domNode && this.domNode.style.top) {
                this.domNode.style.removeProperty('top');
              }
            });
          }, 50); // 延迟 50ms，确保标签页切换完成
        } else {
          // 不是标签页切换，只是普通更新，只更新容器宽度
          this.updateContainerWidth();
        }
        
        return;
      }
    }
    
    // 如果已经显示，先隐藏
    if (this.zoneId) {
      console.log('[AIZoneWidget] 已存在 zoneId，先隐藏');
      this.hide();
    }

    // 保存选中的文本
    this.selectedText = selectedText || '';
    this.includeSelection = !!this.selectedText;
    console.log('[AIZoneWidget] selectedText:', this.selectedText, 'includeSelection:', this.includeSelection);

    // 获取当前行号
    const position = this.editor.getPosition();
    const targetLine = lineNumber || (position ? position.lineNumber : 1);
    console.log('[AIZoneWidget] targetLine:', targetLine, 'position:', position);

    // 保存行号
    this.targetLineNumber = targetLine;

    // 获取当前文件 URI
    const model = this.editor.getModel();
    if (model) {
      this.currentFileUri = model.uri.toString();
      console.log('[AIZoneWidget] currentFileUri:', this.currentFileUri);
    }

    // 创建 DOM
    console.log('[AIZoneWidget] 开始创建 DOM 节点...');
    this.domNode = this.createDomNode();
    console.log('[AIZoneWidget] DOM 节点已创建:', this.domNode);
    console.log('[AIZoneWidget] DOM 节点内容:', this.domNode.innerHTML.substring(0, 200));

    // 设置容器宽度（立即执行一次）
    this.updateContainerWidth();

    // 延迟再次更新宽度，确认 Monaco 布局信息已准备好
    setTimeout(() => {
      this.updateContainerWidth();
    }, 0);

    // 初始高度：顶部分割线(1px) + 内容区域(52px，包含输入框+工具栏 + 底部分割1px) = 54px
    const zoneHeight = 54;
    console.log('[AIZoneWidget] zoneHeight:', zoneHeight);

    // 创建 Zone Widget
    console.log('[AIZoneWidget] 开始注册 Zone Widget...');
    this.editor.changeViewZones((changeAccessor) => {
      const zone: monaco.editor.IViewZone = {
        afterLineNumber: targetLine,
        heightInPx: zoneHeight,
        domNode: this.domNode!,
        suppressMouseDown: false,
      };

      this.zoneId = changeAccessor.addZone(zone);
      this.zoneWidget = zone;
      console.log('[AIZoneWidget] Zone Widget 已注册，zoneId:', this.zoneId);
    });

    // 初始化时设置 view-zone 的 top 位置，并移除 ai-zone-container 的 top 属性
    // 标记编辑器为可见状态
    this.wasEditorHidden = false;
    // 确保 ai-zone-container 没有 top 属性
    if (this.domNode && this.domNode.style.top) {
      this.domNode.style.removeProperty('top');
    }
    
    // 设置 MutationObserver 来持续监控并移除 top 属性
    // 因为 Monaco Editor 或其他代码可能会在某些情况下设置它
    if (this.domNode) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            if (this.domNode && this.domNode.style.top) {
              this.domNode.style.removeProperty('top');
            }
          }
        });
      });
      
      observer.observe(this.domNode, {
        attributes: true,
        attributeFilter: ['style']
      });
      
      // 保存 observer 引用，以便在销毁时清理
      (this.domNode as any).__topObserver = observer;
    }
    
    requestAnimationFrame(() => {
      this.setViewZoneTopPosition();
      // 将边框添加到 .view-zones 容器
      this.attachBordersToViewZone();
      // 延迟更新边框位置与容器高度，确保 view-zone 位置已设置
      requestAnimationFrame(() => {
        this.updateBorderPositions();
        // 初次渲染后立即同步容器高度，避免覆盖下一行
        this.adjustContainerHeightForMessage();
        // 初始化时更新底部边框位置
        requestAnimationFrame(() => {
          this.updateBottomBorderPosition();
        });
        
        // 再次确保 ai-zone-container 没有 top 属性
        if (this.domNode && this.domNode.style.top) {
          this.domNode.style.removeProperty('top');
        }
      });
    });

    // 设置滚动监听器（用于关闭菜单）
    this.setupScrollListeners();

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
      console.log('[AIZoneWidget] 尝试聚焦输入框，inputElement:', this.inputElement);
      if (this.inputElement) {
        console.log('[AIZoneWidget] 输入框存在，执行 focus()');
        this.inputElement.focus();
        console.log('[AIZoneWidget] 输入框 focus 后，document.activeElement:', document.activeElement);
      } else {
        console.error('[AIZoneWidget] 输入框不存在！');
      }
    }, 50);
  }

  /**
   * 隐藏 Zone Widget
   */
  hide(): void {
    // 清理 MutationObserver（如果存在）
    if (this.domNode && (this.domNode as any).__topObserver) {
      const observer = (this.domNode as any).__topObserver as MutationObserver;
      observer.disconnect();
      delete (this.domNode as any).__topObserver;
    }
    
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

    // 清理内容变化监听器
    if (this.contentChangeDisposable) {
      this.contentChangeDisposable.dispose();
      this.contentChangeDisposable = null;
    }

    // 清理布局变化防抖定时器
    if (this.layoutChangeTimer) {
      clearTimeout(this.layoutChangeTimer);
      this.layoutChangeTimer = null;
    }

    // 清空文档引用
    this.documentReferences = [];
    if (this.documentReferencesElement) {
      this.documentReferencesElement.innerHTML = '';
      this.documentReferencesElement.style.display = 'none';
    }

    // 清理边框容器上的边框
    if (this.borderContainer) {
      if (this.topBorderElement && this.borderContainer.contains(this.topBorderElement)) {
        this.borderContainer.removeChild(this.topBorderElement);
      }
      if (this.bottomBorderElement && this.borderContainer.contains(this.bottomBorderElement)) {
        this.borderContainer.removeChild(this.bottomBorderElement);
      }
      this.borderContainer = null;
    }
    this.topBorderElement = null;
    this.bottomBorderElement = null;
    this.viewZoneElement = null;

    if (this.zoneId) {
      this.editor.changeViewZones((changeAccessor) => {
        changeAccessor.removeZone(this.zoneId!);
      });
      this.zoneId = null;
      this.zoneWidget = null;
    }
    this.removeResidualAIZones();

    this.domNode = null;
    this.inputElement = null;

    // 只在未销毁时调用 onClose，避免循环调用
    if (!this.isDisposed) {
      this.options.onClose();
    }
  }

  /**
   * 清理可能残留的 View Zone DOM（防止样式残留）
   */
  private removeResidualAIZones(): void {
    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) {
      return;
    }

    // 移除可能残留的 ai-zone 容器
    const orphanContainers = editorDomNode.querySelectorAll<HTMLElement>('.ai-zone-container');
    orphanContainers.forEach((container) => {
      const zoneWrapper = container.closest('.view-zone');
      if (zoneWrapper && zoneWrapper.parentElement) {
        zoneWrapper.parentElement.removeChild(zoneWrapper);
      } else if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    });
  }

  /**
   * 检查当前标签页是否是活动标签页
   * 用于防止在标签页切换时触发更新
   */
  private isActiveTab(): boolean {
    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) {
      return false;
    }
    
    const editorContainer = editorDomNode.closest('.editor-tab-content') as HTMLElement | null;
    if (!editorContainer) {
      return false;
    }
    
    const computedStyle = window.getComputedStyle(editorContainer);
    if (computedStyle.display === 'none') {
      return false;
    }
    
    return true;
  }

  /**
   * 更新容器宽度，限制为编辑器内容区域（不包括小地图）
   */
  private updateContainerWidth(): void {
    if (!this.domNode) return;

    // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
    if (!this.isActiveTab()) {
      return;
    }

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
  }

  /**
   * 更新 Zone 高度
   */
  private updateZoneHeight(newHeight: number): void {
    if (!this.zoneId || !this.zoneWidget) return;

    // 保存当前期望的位置
    const expectedAfterLineNumber = this.targetLineNumber;
    
    this.editor.changeViewZones((changeAccessor) => {
      if (this.zoneWidget) {
        // 强制设置 afterLineNumber，防止位置重置
        this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
        this.zoneWidget.heightInPx = newHeight;
        changeAccessor.layoutZone(this.zoneId!);
      }
    });

    // 在高度更新后立即设置 view-zone 的 top 位置
    // 使用 requestAnimationFrame 确保在 Monaco 完成布局计算后设置
    requestAnimationFrame(() => {
      // 如果有保存的位置，优先恢复保存的位置（用于工具栏变化时保持位置）
      const viewZoneElement = this.getViewZoneDomElement();
      if (viewZoneElement && this.savedViewZoneTop !== null) {
        viewZoneElement.style.setProperty('top', `${this.savedViewZoneTop}px`, 'important');
      } else {
        // 否则重新计算位置
        this.setViewZoneTopPosition();
      }
      
      if (this.zoneWidget && this.zoneWidget.afterLineNumber !== expectedAfterLineNumber) {
        this.editor.changeViewZones((changeAccessor) => {
          if (this.zoneWidget) {
            this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
            changeAccessor.layoutZone(this.zoneId!);
          }
        });
        
        // 再次设置 top 位置
        requestAnimationFrame(() => {
          // 如果有保存的位置，优先恢复保存的位置
          if (viewZoneElement && this.savedViewZoneTop !== null) {
            viewZoneElement.style.setProperty('top', `${this.savedViewZoneTop}px`, 'important');
          } else {
            this.setViewZoneTopPosition();
          }
        });
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
    console.log('[AIZoneWidget] handleSubmit 被调用, message:', message);
    if (!message) {
      console.warn('[AIZoneWidget] 消息为空，取消发送');
      return;
    }

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

    // 立即显示用户问题，让用户看到自己发送的消息
    // 不显示"正在思考..."，因为用户应该先看到自己的消息
    this.showUserQuestion();
    
    // 发起提问时需要更新底部边框位置
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.updateBottomBorderPosition();
      });
    });
    
    // 添加保护机制，确保元素在显示后不会被意外隐藏
    setTimeout(() => {
      if (this.messageDisplayElement && this.currentUserMessage) {
        const computedDisplay = window.getComputedStyle(this.messageDisplayElement).display;
        if (computedDisplay === 'none') {
          console.warn('[AIZoneWidget] handleSubmit: 消息显示区域被意外隐藏，重新显示');
          this.messageDisplayElement.style.display = 'block';
          this.messageDisplayElement.style.visibility = 'visible';
          this.messageDisplayElement.style.opacity = '1';
        }
      }
    }, 100);

    // 设置生成状态
    this.isGenerating = true;

    // 更新按钮状态（发送 -> 停止）
    this.updateSendButton();

    // 调用回调，传递选中的模型
    console.log('[AIZoneWidget] 调用 onSubmit 回调, message:', message, 'selectedModel:', this.selectedModel);
    if (!this.options.onSubmit) {
      console.error('[AIZoneWidget] onSubmit 回调未定义！');
      return;
    }
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
      this.sendButtonElement.title = '发送(Enter)';
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
   * 创建用户头像元素
   */
  private createUserAvatar(): HTMLElement {
    const avatar = document.createElement('div');
    avatar.className = 'ai-zone-message-avatar';
    avatar.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
      </svg>
    `;
    return avatar;
  }

  /**
   * 创建 AI 头像元素
   */
  private createAIAvatar(): HTMLElement {
    const avatar = document.createElement('div');
    avatar.className = 'ai-zone-message-avatar';
    avatar.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.86z"/>
      </svg>
    `;
    return avatar;
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
    // 只负责结束生成状态 & 保持布局稳定
    // 最终 AI 响应通过编辑器中的代码 diff 展示，
    // 内联聊天顶部消息容器只展示用户提问。
    this.isGenerating = false;
    this.updateSendButton();

    // 不在 completedResponseElement 中渲染 AI 文本，保持该区域为空/隐藏
    if (this.completedResponseElement) {
      this.completedResponseElement.style.display = 'none';
      this.completedResponseElement.innerHTML = '';
    }
 
    // 先调整高度，确保容器高度正确
    // 在调整高度前先保存并强制设置位置，防止高度调整时位置被重置
    const expectedAfterLineNumber = this.targetLineNumber;
    if (this.zoneWidget && this.zoneWidget.afterLineNumber !== expectedAfterLineNumber) {
      this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
    }
    
    requestAnimationFrame(() => {
      this.adjustContainerHeightForMessage();
      
      // 在高度调整后立即设置 view-zone 的 top 位置
      // 这是修复 view-zone top 始终为 0 问题的关键
      requestAnimationFrame(() => {
        // 直接设置 view-zone DOM 元素的 top 位置
        this.setViewZoneTopPosition();
        
        // 强制修复位置（设置 afterLineNumber）
        if (this.zoneWidget && this.zoneWidget.afterLineNumber !== expectedAfterLineNumber) {
          this.editor.changeViewZones((changeAccessor) => {
            if (this.zoneWidget) {
              this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
              changeAccessor.layoutZone(this.zoneId!);
            }
          });
        }
        
        // 再次设置 top 位置，确保位置正确
        requestAnimationFrame(() => {
          this.setViewZoneTopPosition();
          
          // 额外延迟设置，确保所有 DOM 更新都完成
          setTimeout(() => {
            this.setViewZoneTopPosition();
            
            // 最后一次设置，确保位置稳定
            setTimeout(() => {
              this.setViewZoneTopPosition();
            }, 100);
          }, 200);
        });
      });
    });
  }

  /**
   * 获取 view-zone 的 DOM 元素
   * view-zone 的 DOM 元素是 domNode 的父元素（Monaco 创建的容器）
   * Monaco Editor 的结构通常是：.view-zones > .view-zone > domNode
   */
  private getViewZoneDomElement(): HTMLElement | null {
    if (!this.domNode) return null;
    
    // 从 domNode 开始向上查找 view-zone 元素
    let element: HTMLElement | null = this.domNode.parentElement;
    
    while (element) {
      // 检查是否是 view-zone 元素
      // view-zone 元素通常有特定的样式属性（如 position: absolute）
      // 或者可以通过检查其父元素是否是 .view-zones 来判断
      const parent = element.parentElement;
      
      // 如果父元素是 .view-zones，那么当前元素就是 view-zone
      if (parent && parent.classList.contains('view-zones')) {
        return element;
      }
      
      // 如果当前元素有 position: absolute 或 position: relative，且其父元素是 .view-zones 的父元素
      // 也可能是 view-zone
      const computedStyle = window.getComputedStyle(element);
      if ((computedStyle.position === 'absolute' || computedStyle.position === 'relative') && 
          parent && parent.classList.contains('view-lines')) {
        return element;
      }
      
      // 继续向上查找
      element = parent;
      
      // 如果到达了编辑器根元素，停止查找
      if (element && element.classList.contains('monaco-editor')) {
        break;
      }
    }
    
    // 如果找不到，返回 domNode 的直接父元素（通常是正确的）
    return this.domNode.parentElement;
  }

  /**
   * 获取 .view-zones 容器元素
   * 这是 view-zone 的父容器，用于放置边框
   */
  private getViewZonesContainer(): HTMLElement | null {
    if (!this.domNode) return null;
    
    // 从 domNode 开始向上查找 .view-zones 容器
    let element: HTMLElement | null = this.domNode.parentElement;
    
    while (element) {
      // 如果当前元素是 .view-zones，返回它
      if (element.classList.contains('view-zones')) {
        return element;
      }
      
      // 继续向上查找
      element = element.parentElement;
      
      // 如果到达了编辑器根元素，停止查找
      if (element && element.classList.contains('monaco-editor')) {
        break;
      }
    }
    
    return null;
  }

  /**
   * 获取 monaco-scrollable-element 容器
   * 这是 Monaco Editor 的滚动容器，与 editor-scrollable vs-dark 同级
   */
  private getMonacoScrollableElement(): HTMLElement | null {
    if (!this.editor) return null;
    
    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) return null;
    
    // 查找 monaco-scrollable-element 容器
    const scrollableElement = editorDomNode.querySelector('.monaco-scrollable-element') as HTMLElement;
    return scrollableElement || null;
  }

  /**
   * 获取 overflow-guard 容器
   * 这是包含行号区域和内容区域的容器，比 monaco-scrollable-element 更外层
   */
  private getOverflowGuardElement(): HTMLElement | null {
    if (!this.editor) return null;
    
    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) return null;
    
    // 查找 overflow-guard 容器（包含行号区域）
    const overflowGuard = editorDomNode.querySelector('.overflow-guard') as HTMLElement;
    return overflowGuard || null;
  }

  /**
   * 获取 monaco-editor 容器（最外层）
   * 这是编辑器的根容器，包含行号区域和所有内容
   */
  private getMonacoEditorElement(): HTMLElement | null {
    if (!this.editor) return null;
    
    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) return null;
    
    // 返回编辑器根节点（.monaco-editor）
    return editorDomNode;
  }

  /**
   * 更新边框位置（基于当前编辑器布局和 view-zone 位置）
   */
  /**
   * 检查编辑器是否真的可见（不仅在 DOM 中，还要在活动标签页中）
   * 切换标签页时，编辑器可能还没有完全隐藏，但已经不在活动标签页中
   */
  private isEditorReallyVisible(): boolean {
    const editorDomNode = this.editor.getDomNode();
    if (!editorDomNode) {
      return false;
    }

    const editorContainer = editorDomNode.closest('.editor-tab-content') as HTMLElement | null;
    if (!editorContainer) {
      return false;
    }

    const computedStyle = window.getComputedStyle(editorContainer);
    // 如果编辑器被隐藏（display: none），不可见
    // 标签页切换时，非活动标签页的 display 会被设置为 none
    // 这是最优先的检查，因为 React 会立即设置 display: none
    if (computedStyle.display === 'none') {
      return false;
    }

    // 检查 visibility
    if (computedStyle.visibility === 'hidden') {
      return false;
    }

    // 检查 offsetParent，如果为 null 说明元素不在渲染树中
    // 但要注意，fixed 定位的元素 offsetParent 可能为 null
    if (!editorContainer.offsetParent && computedStyle.position !== 'fixed') {
      return false;
    }

    // 检查是否在视口中（通过 getBoundingClientRect）
    // 这是最可靠的检查方法，因为即使 display 不是 none，如果标签页不在活动状态，
    // 元素也可能不在视口中或者尺寸为 0
    const rect = editorContainer.getBoundingClientRect();
    
    // 如果尺寸为 0，说明不可见
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // 额外检查：如果元素完全在视口外（可能是标签页切换的瞬间）
    // 检查元素是否真的在可视区域内
    if (rect.bottom < 0 || rect.top > window.innerHeight || 
        rect.right < 0 || rect.left > window.innerWidth) {
      return false;
    }

    // 额外检查：检查父元素是否可见
    // 如果父元素被隐藏，子元素也不可见
    let parent = editorContainer.parentElement;
    while (parent && parent !== document.body) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
        return false;
      }
      parent = parent.parentElement;
    }

    return true;
  }

  /**
   * 只更新边框的宽度和左侧位置
   * 用于窗口大小变化时，只更新宽度和位置，不更新 top/bottom（这些应该跟随 view-zone）
   */
  private updateBorderWidthAndLeft(): void {
    if (!this.topBorderElement || !this.bottomBorderElement || !this.borderContainer || !this.editor) {
      return;
    }

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
    if (!this.isActiveTab()) {
      return;
    }

    // 获取边框容器的位置信息（相对于视口）
    const containerRect = this.borderContainer.getBoundingClientRect();

    // 获取编辑器布局信息
    const layoutInfo = this.editor.getLayoutInfo();
    
    // 获取行号宽度
    const lineNumbersWidth = layoutInfo.lineNumbersWidth;
    
    // 边框从容器的左边缘开始（使用视口坐标）
    // 注意：当侧边栏打开/关闭时，容器的 left 位置可能会改变
    this.topBorderElement.style.left = `${containerRect.left}px`;
    this.bottomBorderElement.style.left = `${containerRect.left}px`;
    
    // 计算内容区域宽度（不包括小地图）
    let contentWidth = layoutInfo.contentWidth;
    if (layoutInfo.minimap.minimapWidth > 0) {
      // 如果有小地图，使用 minimapLeft 作为内容区域的右边缘
      contentWidth = layoutInfo.minimap.minimapLeft - lineNumbersWidth;
    }
    
    // 设置边框宽度为内容区域宽度 + 行号宽度（从容器左边缘开始，覆盖行号区域）
    this.topBorderElement.style.width = `${contentWidth + lineNumbersWidth}px`;
    this.bottomBorderElement.style.width = `${contentWidth + lineNumbersWidth}px`;
    // 清除 right 属性，使用 width 和 left 来控制位置
    this.topBorderElement.style.right = 'auto';
    this.bottomBorderElement.style.right = 'auto';
  }

  /**
   * 更新底部边框位置（仅在指定时机调用）
   * 更新时机：
   * 1. ai-zone-input 发生了换行
   * 2. 添加了@引用文件
   * 3. 发起了提问
   */
  private updateBottomBorderPosition(): void {
    if (!this.bottomBorderElement || !this.viewZoneElement || !this.borderContainer || !this.editor || !this.domNode) {
      return;
    }

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 检查当前标签页是否是活动标签页
    if (!this.isActiveTab()) {
      return;
    }

    // 获取 view-zone 的位置信息（相对于视口）
    const viewZoneRect = this.viewZoneElement.getBoundingClientRect();
    
    // 计算底部边框的位置：必须始终在最底部元素（bottomToolbar）的下方
    // selectedFilesToolbar 在 bottomToolbar 上方，所以 bottomToolbar 始终是最底部元素
    let bottomBorderTop: number;
    
    if (this.bottomToolbar) {
      const toolbarRect = this.bottomToolbar.getBoundingClientRect();
      // 使用 position: fixed，所以直接使用视口坐标
      bottomBorderTop = toolbarRect.bottom;
    } else {
      // 如果没有底部工具栏，则使用 view-zone 底部作为后备
      bottomBorderTop = viewZoneRect.bottom;
    }
    
    // 保存底部边框位置，用于标签页切换时保持位置
    this.savedBottomBorderTop = bottomBorderTop;
    
    // 设置底部边框的 top 位置，使其位于底部工具栏下方（使用视口坐标）
    this.bottomBorderElement.style.top = `${bottomBorderTop}px`;
    // 清除样式中的 bottom: 0，避免与 top 冲突
    this.bottomBorderElement.style.bottom = 'auto';
    // 确保底部边框可见
    this.bottomBorderElement.style.display = '';
    this.bottomBorderElement.style.visibility = '';
  }

  private updateBorderPositions(skipBottomBorder: boolean = false): void {
    if (!this.topBorderElement || !this.bottomBorderElement || !this.viewZoneElement || !this.borderContainer || !this.editor || !this.domNode) {
      return;
    }

    // 确保 ai-zone-container 没有 top 属性（Monaco Editor 可能会在某些情况下设置它）
    if (this.domNode.style.top) {
      this.domNode.style.removeProperty('top');
    }

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 检查当前标签页是否是活动标签页
    const isActiveTab = this.isActiveTab();
    
    // 如果不是活动标签页，不更新任何边框位置（包括底部边框）
    // 这样可以避免在标签页切换时更新底部边框位置
    if (!isActiveTab) {
      // 但确保底部边框使用保存的位置（如果存在），保持可见
      if (this.bottomBorderElement && this.savedBottomBorderTop !== null) {
        this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
        this.bottomBorderElement.style.bottom = 'auto';
        this.bottomBorderElement.style.display = '';
        this.bottomBorderElement.style.visibility = '';
      }
      return;
    }

    // 获取 view-zone 的位置信息（相对于视口）
    const viewZoneRect = this.viewZoneElement.getBoundingClientRect();
    // 获取边框容器的位置信息（相对于视口）
    const containerRect = this.borderContainer.getBoundingClientRect();

    // 获取编辑器布局信息和行高
    const layoutInfo = this.editor.getLayoutInfo();
    // 通过 Monaco Editor 选项获取行高
    const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight) || 19;
    // 计算 view-zone 的偏移量（与 setViewZoneTopPosition 中的偏移量保持一致）
    const viewZoneOffset = Math.floor(lineHeight * 0.5);
    // 顶部边框偏移量：view-zone 偏移量 + 行高的 150%，确保边框在 view-zone 下方，不会遮挡行号，但至少 20px
    const topBorderOffset = Math.max(20, viewZoneOffset + Math.floor(lineHeight * 1.5));
    
    // 使用 position: fixed，所以直接使用视口坐标（getBoundingClientRect 返回的就是视口坐标）
    // 顶部边框位置 = view-zone 的视口 top + 偏移量
    this.topBorderElement.style.setProperty('top', `${viewZoneRect.top + topBorderOffset}px`, 'important');
    // 清除可能存在的 bottom 属性，避免与 top 冲突
    this.topBorderElement.style.bottom = 'auto';
    
    // 默认不更新底部边框位置，只有在明确要求时才更新
    // 底部边框位置应该只在特定时机更新（输入框换行、添加文件、发起提问）
    if (this.savedBottomBorderTop !== null) {
      // 使用保存的位置，保持底部边框位置不变
      this.bottomBorderElement.style.top = `${this.savedBottomBorderTop}px`;
      this.bottomBorderElement.style.bottom = 'auto';
      // 确保底部边框可见
      this.bottomBorderElement.style.display = '';
      this.bottomBorderElement.style.visibility = '';
    }

    // 更新宽度和左侧位置（复用逻辑）
    this.updateBorderWidthAndLeft();
  }

  /**
   * 将边框附加到编辑器根容器
   * 边框附加到 monaco-editor 根容器，这样可以覆盖行号区域
   */
  private attachBordersToViewZone(): void {
    if (!this.topBorderElement || !this.bottomBorderElement || !this.domNode) {
      return;
    }

    // 获取 view-zone 元素（用于计算位置）
    const viewZone = this.getViewZoneDomElement();
    if (!viewZone) {
      console.warn('[AIZoneWidget] 无法找到 view-zone 元素');
      return;
    }

    // 保存 view-zone 引用
    this.viewZoneElement = viewZone;

    // 将边框附加到 monaco-editor 根容器（包含行号区域）
    // 这样边框可以从行号区域开始，覆盖整个编辑器宽度
    let container: HTMLElement | null = this.getMonacoEditorElement();
    if (!container) {
      console.warn('[AIZoneWidget] 无法找到编辑器根容器');
      return;
    }

    // 确保容器有相对定位，以便边框可以绝对定位
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    // 将边框添加到编辑器根容器
    // 边框将从行号区域开始（left: 0），覆盖行号和内容区域
    if (!container.contains(this.topBorderElement)) {
      container.appendChild(this.topBorderElement);
    }
    if (!container.contains(this.bottomBorderElement)) {
      container.appendChild(this.bottomBorderElement);
      // 确保底部边框立即可见，清除可能的隐藏样式
      this.bottomBorderElement.style.display = '';
      this.bottomBorderElement.style.visibility = '';
      this.bottomBorderElement.style.bottom = 'auto';
    }

    // 保存容器引用，用于后续清理
    this.borderContainer = container;

    // 立即尝试更新边框位置（如果 viewZoneElement 已准备好）
    // 这样可以避免延迟显示
    if (this.viewZoneElement && this.domNode) {
      // 立即更新底部边框位置，使用临时位置
      const viewZoneRect = this.viewZoneElement.getBoundingClientRect();
      if (viewZoneRect.width > 0 && viewZoneRect.height > 0) {
        this.bottomBorderElement.style.top = `${viewZoneRect.bottom}px`;
        this.updateBorderWidthAndLeft();
      }
    }

    // 延迟更新完整边框位置，确保 DOM 已经渲染
    requestAnimationFrame(() => {
      this.updateBorderPositions();
    });
  }

  /**
   * 移除已经附加到编辑器上的边框，避免刷新或销毁后遗留 DOM
   */
  private removeBorderElements(): void {
    if (this.topBorderElement?.parentElement) {
      this.topBorderElement.parentElement.removeChild(this.topBorderElement);
    }
    if (this.bottomBorderElement?.parentElement) {
      this.bottomBorderElement.parentElement.removeChild(this.bottomBorderElement);
    }

    this.topBorderElement = null;
    this.bottomBorderElement = null;
    this.borderContainer = null;
  }

  /**
   * 直接设置 view-zone DOM 元素的 top 位置
   * 这是修复 view-zone top 始终为 0 问题的关键方法
   */
  private setViewZoneTopPosition(): void {
    if (!this.zoneId || !this.zoneWidget || !this.domNode) return;

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
    if (!this.isActiveTab()) {
      return;
    }

    const expectedAfterLineNumber = this.targetLineNumber;
    
    // 检查 targetLineNumber 是否有效
    if (expectedAfterLineNumber <= 0) {
      console.warn('[AIZoneWidget] targetLineNumber 无效:', expectedAfterLineNumber);
      return;
    }

    try {
      // 使用 Monaco API 获取指定行号的顶部位置
      // getTopForLineNumber 返回的是该行顶部相对于编辑器内容区域的像素位置
      const currentLineTop = this.editor.getTopForLineNumber(expectedAfterLineNumber);

      // 通过行高计算"当前行的下一行"的顶部位置
      // 这样可以保证内联聊天永远显示在当前行的下方，而不会遮挡当前行
      const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
      // 增加额外的偏移量（行高的 50%），确保 view-zone 不会遮挡上一行的内容，给代码留出足够的空间
      const viewZoneOffset = Math.floor(lineHeight * 0.5);
      
      // 计算基础位置：当前行顶部 + 行高 + 偏移量
      const lineTop = currentLineTop + lineHeight + viewZoneOffset;
      
      // 获取 view-zone 的 DOM 元素
      const viewZoneElement = this.getViewZoneDomElement();
      
      if (viewZoneElement) {
        // 直接设置 view-zone DOM 元素的 top 位置
        // 使用 !important 确保样式优先级
        const currentTop = parseFloat(viewZoneElement.style.top || '');
        if (!Number.isFinite(currentTop) || Math.abs(currentTop - lineTop) > 0.5) {
          viewZoneElement.style.setProperty('top', `${lineTop}px`, 'important');
        }
        
        // 更新保存的位置，用于内容变化时恢复
        this.savedViewZoneTop = lineTop;
        
        console.log('[AIZoneWidget] 设置 view-zone top 位置:', {
          lineNumber: expectedAfterLineNumber,
          top: lineTop,
          element: viewZoneElement
        });
      } else {
        console.warn('[AIZoneWidget] 无法找到 view-zone DOM 元素');
      }

      // 移除 ai-zone-container 的 top 属性（如果存在）
      // 因为位置完全由 view-zone 控制，ai-zone-container 不需要 top 属性
      if (this.domNode.style.top) {
        this.domNode.style.removeProperty('top');
      }

      // 更新边框位置（view-zone 位置改变了）
      this.updateBorderPositions();
    } catch (error) {
      console.error('[AIZoneWidget] 设置 view-zone top 位置失败:', error);
    }
  }

  /**
   * 修复 Zone Widget 位置
   * 当文档内容变化（如 GhostTextWidget 插入新行）后，确保 Zone Widget 位置正确
   */
  private fixZoneWidgetPosition(): void {
    if (!this.zoneId || !this.zoneWidget) return;

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 始终使用 targetLineNumber 作为正确的位置，不依赖当前值
    const expectedAfterLineNumber = this.targetLineNumber;
    const currentAfterLineNumber = this.zoneWidget.afterLineNumber;

    // 检查 targetLineNumber 是否有效（必须大于0）
    if (expectedAfterLineNumber <= 0) {
      console.warn('[AIZoneWidget] targetLineNumber 无效:', expectedAfterLineNumber);
      return;
    }

    // 如果位置不正确，或者位置被重置到编辑器顶部（0或1），强制修复
    // 注意：afterLineNumber 为 0 表示在第一行之前，1 表示在第一行之后
    // 如果 targetLineNumber 大于 1，但 afterLineNumber 是 0 或 1，说明位置被重置了
    const isAtTop = currentAfterLineNumber === 0 || currentAfterLineNumber === 1;
    const isWrongPosition = currentAfterLineNumber === undefined || currentAfterLineNumber !== expectedAfterLineNumber;
    const needsFix = isWrongPosition || (isAtTop && expectedAfterLineNumber > 1);

    if (needsFix) {
      console.log('[AIZoneWidget] 修复 Zone Widget 位置:', {
        current: currentAfterLineNumber,
        expected: expectedAfterLineNumber,
        targetLineNumber: this.targetLineNumber,
        isAtTop,
        reason: isAtTop && expectedAfterLineNumber > 1 ? '位置被重置到顶部' : '位置不匹配'
      });

      // 强制修复位置，使用 changeViewZones 确保 Monaco 正确更新
      this.editor.changeViewZones((changeAccessor) => {
        if (this.zoneWidget) {
          // 强制设置 afterLineNumber
          this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
          // 重新布局 Zone Widget
          changeAccessor.layoutZone(this.zoneId!);
        }
      });

      // 直接设置 view-zone DOM 元素的 top 位置
      // 使用 requestAnimationFrame 确保在 Monaco 完成布局计算后设置
      requestAnimationFrame(() => {
        this.setViewZoneTopPosition();
        // 更新边框位置
        this.updateBorderPositions();
        
        // 在修复后再次检查，确保位置正确
        if (this.zoneWidget && this.zoneWidget.afterLineNumber !== expectedAfterLineNumber) {
          this.editor.changeViewZones((changeAccessor) => {
            if (this.zoneWidget) {
              this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
              changeAccessor.layoutZone(this.zoneId!);
            }
          });
          
          // 再次设置 top 位置
          requestAnimationFrame(() => {
            this.setViewZoneTopPosition();
          });
        }
      });
    } else {
      // 即使位置看起来正确，也确保 afterLineNumber 属性正确设置
      // 因为 DOM 更新可能导致属性丢失
      if (this.zoneWidget.afterLineNumber !== expectedAfterLineNumber) {
        this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
        this.editor.changeViewZones((changeAccessor) => {
          if (this.zoneWidget) {
            this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
          }
          changeAccessor.layoutZone(this.zoneId!);
        });
      }
      
      // 始终设置 view-zone 的 top 位置，确保位置正确
      requestAnimationFrame(() => {
        this.setViewZoneTopPosition();
      });
    }
  }

  /**
   * 在刷新 DOM 后恢复 UI 状态，确保用户提问与边框仍然可见
   */
  private restoreWidgetStateAfterRefresh(): void {
    if (!this.domNode) {
      return;
    }

    // 重新挂载边框，新的 DOM 引用才能被定位逻辑使用
    this.attachBordersToViewZone();

    if (this.currentUserMessage) {
      requestAnimationFrame(() => this.showUserQuestion());
    } else if (this.isGenerating) {
      requestAnimationFrame(() => this.showThinkingState());
    } else if (this.messageDisplayElement) {
      this.messageDisplayElement.style.display = 'none';
      this.messageDisplayElement.style.visibility = 'hidden';
      this.messageDisplayElement.style.opacity = '0';
    }

    // 重新同步依赖 DOM 的可视元素
    this.updateSelectedFilesToolbar();
    this.updateDocumentReferencesDisplay();

    requestAnimationFrame(() => {
      this.adjustContainerHeightForMessage();
    });
  }

  /**
   * 刷新界面
   */
  private refresh(): void {
    if (!this.zoneId || !this.domNode) return;

    const parentNode = this.domNode.parentNode;
    if (!parentNode) return;

    // 始终使用 targetLineNumber 作为正确的位置，确保位置不会重置
    const expectedAfterLineNumber = this.targetLineNumber;
    const currentHeight = this.zoneWidget?.heightInPx ?? 74;

    const newNode = this.createDomNode();
    parentNode.replaceChild(newNode, this.domNode);
    this.domNode = newNode;

    // 重建 DOM 后，立即恢复 UI 状态和边框位置
    this.restoreWidgetStateAfterRefresh();

    // 更新 Zone Widget 的配置，确保位置不会重置
    if (this.zoneWidget) {
      this.zoneWidget.domNode = this.domNode;
      // 确保 afterLineNumber 使用 targetLineNumber，而不是当前值（可能已错误）
      this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
      // 使用 layoutZone 重新布局，确保位置保持不变
      this.editor.changeViewZones((changeAccessor) => {
        // 再次确保 afterLineNumber 正确
        if (this.zoneWidget) {
          this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
        }
        changeAccessor.layoutZone(this.zoneId!);
      });
    }

    // 在 DOM 更新后，使用 requestAnimationFrame 确保位置修复
    requestAnimationFrame(() => {
      this.fixZoneWidgetPosition();
    });

    // 重新聚焦输入框
    setTimeout(() => {
      if (this.inputElement) {
        this.inputElement.focus();
      }
    }, 50);

    // 更新文档引用显示
    this.updateDocumentReferencesDisplay();
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
      // 确保 className 保持不变，不会被替换
      if (messageText.className !== 'ai-zone-message-text') {
        messageText.className = 'ai-zone-message-text';
      }
      messageText.innerHTML = '正在思考<span class="ai-zone-thinking-dots"></span>';
    }


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
      // 确保 className 保持不变，不会被替换
      if (messageText.className !== 'ai-zone-message-text') {
        messageText.className = 'ai-zone-message-text';
      }
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
    if (!this.messageDisplayElement || !this.currentUserMessage) {
      console.warn('[AIZoneWidget] showUserQuestion: messageDisplayElement or currentUserMessage is missing', {
        hasMessageDisplay: !!this.messageDisplayElement,
        hasMessage: !!this.currentUserMessage
      });
      return;
    }

    // 隐藏完成响应区域（开始新对话时）
    if (this.completedResponseElement) {
      this.completedResponseElement.style.display = 'none';
      this.completedResponseElement.innerHTML = '';
    }

    console.log('[AIZoneWidget] showUserQuestion: 开始显示用户问题', {
      message: this.currentUserMessage,
      elementExists: !!this.messageDisplayElement,
      currentDisplay: this.messageDisplayElement.style.display,
      parentElement: this.messageDisplayElement.parentElement?.className
    });

    // 确保消息区域可见（先显示，再更新内容，确保高度计算正确）
    this.messageDisplayElement.style.display = 'block';
    this.messageDisplayElement.style.visibility = 'visible';
    this.messageDisplayElement.style.opacity = '1';
    this.messageDisplayElement.style.height = 'auto';
    this.messageDisplayElement.style.minHeight = '24px'; // 设置最小高度，确保至少可见

    // 查找或创建消息内容容器
    let messageContent = this.messageDisplayElement.querySelector('.ai-zone-message-content') as HTMLElement;
    if (!messageContent) {
      console.log('[AIZoneWidget] showUserQuestion: 创建新的消息内容容器');
      messageContent = document.createElement('div');
      messageContent.className = 'ai-zone-message-content';
      this.messageDisplayElement.appendChild(messageContent);
    }

    // 确保消息内容容器可见
    messageContent.style.display = 'flex';
    messageContent.style.visibility = 'visible';
    messageContent.style.opacity = '1';
    messageContent.style.minHeight = '24px';

    // 查找或创建用户头像
    let avatar = messageContent.querySelector('.ai-zone-message-avatar') as HTMLElement;
    if (!avatar) {
      avatar = this.createUserAvatar();
      messageContent.insertBefore(avatar, messageContent.firstChild);
    } else {
      // 如果已存在头像，确保是用户头像
      avatar.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
        </svg>
      `;
    }

    // 查找或创建消息文本元素
    let messageText = messageContent.querySelector('.ai-zone-message-text') as HTMLElement;
    if (!messageText) {
      console.log('[AIZoneWidget] showUserQuestion: 创建新的消息文本元素');
      messageText = document.createElement('div');
      messageText.className = 'ai-zone-message-text';
      messageContent.appendChild(messageText);
    }

    // 确保消息文本元素可见
    messageText.style.display = 'block';
    messageText.style.visibility = 'visible';
    messageText.style.opacity = '1';

    // 更新消息文本为用户问题（直接替换之前的内容，包括所有子元素）
    messageText.textContent = this.currentUserMessage;

    // 确保消息显示区域样式正确
    this.messageDisplayElement.style.maxHeight = '200px';
    this.messageDisplayElement.style.overflowY = 'auto';
    this.messageDisplayElement.style.minHeight = '24px'; // 确保最小高度

    // 强制浏览器重新计算布局，确保消息区域高度正确
    // 使用双重 requestAnimationFrame 确保 DOM 完全更新
    requestAnimationFrame(() => {
      // 强制重新计算布局
      if (this.messageDisplayElement) {
        // 强制浏览器重新计算
        const offsetHeight = this.messageDisplayElement.offsetHeight;
        const scrollHeight = this.messageDisplayElement.scrollHeight;
        const clientHeight = this.messageDisplayElement.clientHeight;
        
        console.log('[AIZoneWidget] showUserQuestion: 布局计算', {
          offsetHeight,
          scrollHeight,
          clientHeight,
          display: this.messageDisplayElement.style.display,
          computedDisplay: window.getComputedStyle(this.messageDisplayElement).display
        });
      }
      requestAnimationFrame(() => {
        this.adjustContainerHeightForMessage();
        
        // 再次确保消息区域可见
        if (this.messageDisplayElement) {
          this.messageDisplayElement.style.display = 'block';
          this.messageDisplayElement.style.visibility = 'visible';
          this.messageDisplayElement.style.opacity = '1';
          
          // 最终检查
          const finalHeight = this.messageDisplayElement.offsetHeight;
          const finalDisplay = window.getComputedStyle(this.messageDisplayElement).display;
          console.log('[AIZoneWidget] showUserQuestion: 最终状态', {
            finalHeight,
            finalDisplay,
            hasContent: !!this.messageDisplayElement.textContent
          });
        }
      });
    });
  }

  /**
   * 更新 AI 响应内容（支持流式更新）
   * 公共方法，供外部调用
   */
  public updateAIResponse(content: string): void {
    if (!this.messageDisplayElement) return;

    // 显示消息显示区域
    this.messageDisplayElement.style.display = content ? 'block' : 'none';

    // 更新消息内容
    if (content) {
      // 查找或创建消息内容容器
      let messageContent = this.messageDisplayElement.querySelector('.ai-zone-message-content') as HTMLElement;
      if (!messageContent) {
        messageContent = document.createElement('div');
        messageContent.className = 'ai-zone-message-content';
        this.messageDisplayElement.appendChild(messageContent);
      }

      // 查找或创建 AI 头像
      let avatar = messageContent.querySelector('.ai-zone-message-avatar') as HTMLElement;
      if (!avatar) {
        avatar = this.createAIAvatar();
        messageContent.insertBefore(avatar, messageContent.firstChild);
      } else {
        // 如果已存在头像，确保是 AI 头像
        avatar.innerHTML = `
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.86z"/>
          </svg>
        `;
      }

      const messageText = messageContent.querySelector('.ai-zone-message-text') as HTMLElement;
      if (!messageText) {
        const textElement = document.createElement('div');
        textElement.className = 'ai-zone-message-text';
        messageContent.appendChild(textElement);
        textElement.textContent = content;
      } else {
        // 确保 className 保持不变，不会被替换
        if (messageText.className !== 'ai-zone-message-text') {
          messageText.className = 'ai-zone-message-text';
        }
        messageText.textContent = content;
      }
    }

    // 在内容更新后调整高度，使用防抖避免频繁调整
    // 只在流式更新时调整，最终完成时会在 onAIResponseComplete 中调整
    if (content && this.isGenerating) {
      // 使用防抖，避免每次更新都调整高度
      if (this.heightAdjustTimer) {
        clearTimeout(this.heightAdjustTimer);
      }
      this.heightAdjustTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          this.adjustContainerHeightForMessage();
        });
      }, 100);

      // 在流式输出时，修复view-zone位置，防止内联聊天往上移动
      // 使用防抖，避免频繁修复位置
      if (this.positionFixTimer) {
        clearTimeout(this.positionFixTimer);
      }
      this.positionFixTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // 检查内联聊天是否仍然显示
            if (!this.zoneId || !this.isVisible()) {
              return;
            }

            // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
            if (!this.isEditorReallyVisible()) {
              return;
            }

            // 修复view-zone位置，确保内联聊天位置稳定
            this.setViewZoneTopPosition();
            // 更新边框位置
            this.updateBorderPositions();
          });
        });
      }, 150); // 稍微延迟一点，确保Monaco完成布局计算
    }
  }

  /**
   * 设置文档引用列表
   * 公共方法，供外部调用
   */
  public setDocumentReferences(references: Array<{ fileName: string; filePath?: string; knowledgeBaseName?: string; chunks: number }>): void {
    this.documentReferences = references;
    this.updateDocumentReferencesDisplay();
  }

  /**
   * 更新文档引用显示
   */
  private updateDocumentReferencesDisplay(): void {
    if (!this.documentReferencesElement) return;

    // 清空现有内容
    this.documentReferencesElement.innerHTML = '';

    if (this.documentReferences.length === 0) {
      this.documentReferencesElement.style.display = 'none';
      return;
    }

    // 显示文档引用区域
    this.documentReferencesElement.style.display = 'block';

    // 创建标题
    const title = document.createElement('div');
    title.className = 'ai-zone-document-references-title';
    title.textContent = `引用文档 (${this.documentReferences.length})`;
    this.documentReferencesElement.appendChild(title);

    // 创建文档列表
    const list = document.createElement('div');
    list.className = 'ai-zone-document-references-list';

    this.documentReferences.forEach((ref) => {
      const item = document.createElement('div');
      item.className = 'ai-zone-document-reference-item';

      const fileName = document.createElement('span');
      fileName.className = 'ai-zone-document-reference-file-name';
      fileName.textContent = ref.fileName;
      item.appendChild(fileName);

      if (ref.knowledgeBaseName) {
        const kbName = document.createElement('span');
        kbName.className = 'ai-zone-document-reference-kb-name';
        kbName.textContent = ` · ${ref.knowledgeBaseName}`;
        item.appendChild(kbName);
      }

      if (ref.chunks > 0) {
        const chunks = document.createElement('span');
        chunks.className = 'ai-zone-document-reference-chunks';
        chunks.textContent = ` · ${ref.chunks} 个片段`;
        item.appendChild(chunks);
      }

      list.appendChild(item);
    });

    this.documentReferencesElement.appendChild(list);
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
    if (!this.domNode) return;

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
    if (!this.isActiveTab()) {
      return;
    }

    // 确保消息显示区域始终遵守最大高度限制
    if (this.messageDisplayElement) {
      if (this.messageDisplayElement.style.display !== 'none') {
        // 强制浏览器重新计算布局，确保 scrollHeight 是最新的
        void this.messageDisplayElement.offsetHeight;
      }
      this.messageDisplayElement.style.maxHeight = '200px';
      this.messageDisplayElement.style.overflowY = 'auto';
    }

    // 确保完成响应区域可以正常显示完整内容
    if (this.completedResponseElement) {
      if (this.completedResponseElement.style.display !== 'none') {
        void this.completedResponseElement.offsetHeight;
      }
      this.completedResponseElement.style.maxHeight = 'none';
      this.completedResponseElement.style.overflowY = 'visible';
    }

    this.syncContainerHeight(updateBorder);
  }

  /**
   * 同步容器高度，使其与实际内容高度保持一致
   * @param updateBorder 是否需要在高度变动后更新边框位置
   */
  private syncContainerHeight(updateBorder: boolean = true): void {
    if (!this.domNode) return;

    // 检查编辑器是否真的可见（避免在隐藏的标签页上更新布局）
    if (!this.isEditorReallyVisible()) {
      return;
    }

    // 检查当前标签页是否是活动标签页，防止在标签页切换时更新
    if (!this.isActiveTab()) {
      return;
    }

    // 访问相关元素的尺寸，确保浏览器完成最新的布局计算
    if (this.selectedFilesToolbar && this.selectedFilesToolbar.style.display !== 'none') {
      void this.selectedFilesToolbar.offsetHeight;
    }
    if (this.documentReferencesElement && this.documentReferencesElement.style.display !== 'none') {
      void this.documentReferencesElement.offsetHeight;
    }

    // 先移除固定高度，让浏览器根据内容撑开，再测量真实高度
    this.domNode.style.height = 'auto';
    const minHeight = 72;
    const measuredHeight = Math.max(minHeight, Math.ceil(this.domNode.scrollHeight));
    const adjustedHeight = this.ensureDiffSpacing(measuredHeight);
    this.domNode.style.height = `${adjustedHeight}px`;

    // 宽度依旧交给 CSS 控制，但在测量后重新同步一次，确保与编辑器内容区域保持一致
    this.updateContainerWidth();

    const currentZoneHeight = this.zoneWidget?.heightInPx || 0;
    const newZoneHeight = adjustedHeight + 2; // 额外 2px 覆盖顶部/底部边框
    const heightChanged = Math.abs(currentZoneHeight - newZoneHeight) > 0.5;

    if (heightChanged) {
      // 在更新高度前确保位置没有被重置
      const expectedAfterLineNumber = this.targetLineNumber;
      if (this.zoneWidget && this.zoneWidget.afterLineNumber !== expectedAfterLineNumber) {
        this.zoneWidget.afterLineNumber = expectedAfterLineNumber;
      }

      this.updateZoneHeight(newZoneHeight);

      if (updateBorder) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.updateBorderPositions();
          });
        });
      }
    } else {
      // 即使高度未变化，也要确保 view-zone 和边框位置正确
      requestAnimationFrame(() => {
        this.setViewZoneTopPosition();
      });

      if (updateBorder) {
        requestAnimationFrame(() => {
          this.updateBorderPositions();
        });
      }
    }
  }

  /**
   * 根据 bottom border 位置，确保 diff 区域拥有足够的可视空间
   * 这样 Monaco diff（GhostText）始终显示在 ai-zone-border-bottom 之后
   */
  private ensureDiffSpacing(baseHeight: number): number {
    if (!this.bottomBorderElement) {
      return baseHeight;
    }

    const viewZoneElement = this.getViewZoneDomElement();
    if (!viewZoneElement) {
      return baseHeight;
    }

    const borderRect = this.bottomBorderElement.getBoundingClientRect();
    const viewZoneRect = viewZoneElement.getBoundingClientRect();

    if (borderRect.height === 0 || viewZoneRect.height === 0) {
      return baseHeight;
    }

    const rawDistance = borderRect.top - viewZoneRect.top;
    if (!Number.isFinite(rawDistance) || rawDistance <= 0) {
      return baseHeight;
    }

    const clampedDistance = Math.max(rawDistance, 0);
    const needsExtraSpacing = clampedDistance + AIZoneWidget.MIN_DIFF_SPACING_PX > baseHeight;
    if (!needsExtraSpacing) {
      return baseHeight;
    }

    return clampedDistance + AIZoneWidget.MIN_DIFF_SPACING_PX;
  }

  /**
   * 获取输入框元素
   */
  public getInputElement(): HTMLTextAreaElement | null {
    return this.inputElement;
  }

  /**
   * 获取当前聊天历史
   * 返回副本以避免外部直接修改内部状态
   */
  public getChatHistory(): ChatMessage[] {
    return this.chatHistory.map(message => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp
    }));
  }

  /**
   * 获取深度思考开关状态
   */
  public getDeepThinkingEnabled(): boolean {
    return this.deepThinkingEnabled;
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
            // 确保 className 保持不变，不会被替换
            if (messageText.className !== 'ai-zone-message-text') {
              messageText.className = 'ai-zone-message-text';
            }
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
      this.inputElement.placeholder = '向AI 描述您想要做什么...';
    }

    // 隐藏消息显示区域
    if (this.messageDisplayElement) {
      this.messageDisplayElement.style.display = 'none';
    }

    // 隐藏完成响应区域
    if (this.completedResponseElement) {
      this.completedResponseElement.style.display = 'none';
      this.completedResponseElement.innerHTML = '';
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

    // 调整容器高度并让输入框获得焦点
    requestAnimationFrame(() => {
      this.adjustContainerHeightForMessage(false);
      // 等待布局完成后让输入框获得焦点
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this.inputElement) {
            this.inputElement.focus();
          }
        });
      });
    });
  }

  /**
   * 处理输入框输入事件，检测@符号并自动显示文件引用菜单
   */
  private async handleInputForAtMention(e: Event): Promise<void> {
    if (!this.inputElement) return;
    
    const textarea = e.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart || value.length;
    
    // 从光标位置向前查找最近的@符号
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        // 检查@符号前是否有空格或换行，或者@符号在行首
        if (i === 0 || value[i - 1] === ' ' || value[i - 1] === '\n') {
          atIndex = i;
          break;
        }
      } else if (value[i] === ' ' || value[i] === '\n') {
        // 如果遇到空格或换行，说明@符号不在当前单词中
        break;
      }
    }
    
    // 如果找到@符号，且菜单未打开，则显示菜单
    if (atIndex !== -1 && !this.isContextMenuOpen) {
      // 延迟一下，确保@符号已经输入到输入框中
      setTimeout(async () => {
        // 再次检查，避免重复打开
        if (!this.isContextMenuOpen && this.inputElement) {
          // 使用输入框位置来显示菜单，而不是@按钮位置
          await this.showContextMenuFromInput();
        }
      }, 50);
    } else if (atIndex === -1 && this.isContextMenuOpen) {
      // 如果@符号被删除或不在有效位置，可以选择关闭菜单
      // 但为了更好的用户体验，保持菜单打开直到用户明确关闭或选择项目
    }
  }

  /**
   * 计算@符号在输入框中的实际像素位置
   * @param textarea 输入框元素
   * @param atIndex @符号在文本中的索引位置
   * @returns @符号的位置信息 {top, left}
   */
  private getAtSymbolPosition(textarea: HTMLTextAreaElement, atIndex: number): { top: number; left: number } | null {
    try {
      // 保存当前选择范围
      const savedSelectionStart = textarea.selectionStart;
      const savedSelectionEnd = textarea.selectionEnd;

      // 获取textarea的位置和样式
      const textareaRect = textarea.getBoundingClientRect();
      const style = window.getComputedStyle(textarea);
      
      // 创建一个临时的div来测量文本位置
      const div = document.createElement('div');
      
      // 复制所有影响文本布局的样式
      div.style.position = 'fixed';
      div.style.visibility = 'hidden';
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordWrap = 'break-word';
      div.style.font = style.font;
      div.style.fontSize = style.fontSize;
      div.style.fontFamily = style.fontFamily;
      div.style.fontWeight = style.fontWeight;
      div.style.fontStyle = style.fontStyle;
      div.style.letterSpacing = style.letterSpacing;
      div.style.padding = style.padding;
      div.style.border = style.border;
      div.style.boxSizing = style.boxSizing;
      div.style.width = `${textarea.offsetWidth}px`;
      div.style.lineHeight = style.lineHeight;
      div.style.wordSpacing = style.wordSpacing;
      div.style.overflowWrap = style.overflowWrap;
      
      // 将div定位到textarea的相同位置
      div.style.top = `${textareaRect.top}px`;
      div.style.left = `${textareaRect.left}px`;
      
      // 获取输入框的文本内容
      const text = textarea.value;
      const textBeforeAt = text.substring(0, atIndex);
      
      // 创建文本节点（只包含@符号之前的文本）
      const textNode = document.createTextNode(textBeforeAt);
      div.appendChild(textNode);
      
      // 添加一个span来标记@符号位置
      const marker = document.createElement('span');
      marker.textContent = '@';
      div.appendChild(marker);
      
      // 将div添加到body
      document.body.appendChild(div);
      
      // 获取marker的位置（相对于视口）
      const markerRect = marker.getBoundingClientRect();
      
      // 计算相对于textarea的位置
      const left = markerRect.left - textareaRect.left;
      const top = markerRect.top - textareaRect.top;
      
      // 清理
      document.body.removeChild(div);
      
      // 恢复选择范围
      textarea.setSelectionRange(savedSelectionStart, savedSelectionEnd);
      
      return { top, left };
    } catch (error) {
      console.error('[AIZoneWidget] 计算@符号位置失败:', error);
      return null;
    }
  }

  /**
   * 从输入框位置显示上下文菜单（用于@符号自动触发）
   */
  private async showContextMenuFromInput(): Promise<void> {
    if (!this.inputElement || !this.inputContextMenuContainer) {
      return;
    }

    // 如果工具栏@菜单是打开的，先关闭它（输入框@菜单和工具栏@菜单是隔离的）
    if (this.isContextMenuOpen) {
      // 检查是否是工具栏菜单打开的（通过检查容器是否是工具栏容器）
      if (this.contextMenuContainer && this.contextMenuContainer.parentElement?.contains(this.addContextBtn)) {
        this.closeContextMenu();
      }
    }

    // 如果智能体菜单是打开的，先关闭它
    if (this.isAgentMenuOpen) {
      this.closeAgentMenu();
    }

    // 重置菜单状态
    this.currentMenuLevel = 'level1';
    this.currentCategory = null;

    // 获取@符号的位置
    const textarea = this.inputElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart || value.length;
    
    // 从光标位置向前查找最近的@符号
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        if (i === 0 || value[i - 1] === ' ' || value[i - 1] === '\n') {
          atIndex = i;
          break;
        }
      } else if (value[i] === ' ' || value[i] === '\n') {
        break;
      }
    }

    if (atIndex === -1) {
      return; // 找不到@符号，不显示菜单
    }

    // 计算@符号在输入框中的位置
    const atPosition = this.getAtSymbolPosition(textarea, atIndex);
    if (!atPosition) {
      return; // 无法计算位置，不显示菜单
    }

    // 更新菜单容器位置的函数
    const updateMenuPosition = () => {
      if (!this.inputElement || !this.inputContextMenuContainer) {
        return;
      }

      // 重新计算@符号位置（因为输入框内容可能变化）
      const currentValue = this.inputElement.value;
      const currentCursorPos = this.inputElement.selectionStart || currentValue.length;
      
      let currentAtIndex = -1;
      for (let i = currentCursorPos - 1; i >= 0; i--) {
        if (currentValue[i] === '@') {
          if (i === 0 || currentValue[i - 1] === ' ' || currentValue[i - 1] === '\n') {
            currentAtIndex = i;
            break;
          }
        } else if (currentValue[i] === ' ' || currentValue[i] === '\n') {
          break;
        }
      }

      if (currentAtIndex === -1) {
        // @符号不存在了，关闭菜单
        this.closeContextMenu();
        return;
      }

      const currentAtPosition = this.getAtSymbolPosition(this.inputElement, currentAtIndex);
      if (!currentAtPosition) {
        return;
      }

      // 获取输入框的位置
      const inputRect = this.inputElement.getBoundingClientRect();
      
      // 计算@符号在视口中的绝对位置
      const atTop = inputRect.top + currentAtPosition.top;
      const atLeft = inputRect.left + currentAtPosition.left;
      
      // 验证位置值是否有效
      if (isNaN(atTop) || isNaN(atLeft) || atTop < 0 || atLeft < 0) {
        console.warn('[AIZoneWidget] @符号位置计算异常:', { atTop, atLeft, currentAtPosition, inputRect });
        // 如果位置无效，使用输入框底部作为默认位置
        this.inputContextMenuContainer.style.top = `${inputRect.bottom + 5}px`;
        this.inputContextMenuContainer.style.left = `${inputRect.left}px`;
      } else {
        // 设置容器的尺寸和位置
        this.inputContextMenuContainer.style.top = `${atTop + 20}px`; // @符号下方20px
        this.inputContextMenuContainer.style.left = `${atLeft}px`;
      }
      
      this.inputContextMenuContainer.style.width = `${Math.max(inputRect.width, 300)}px`;
      this.inputContextMenuContainer.style.height = 'auto';
      this.inputContextMenuContainer.style.maxHeight = `${window.innerHeight - (isNaN(atTop) ? inputRect.bottom : atTop) - 20}px`;
      this.inputContextMenuContainer.style.overflowY = 'auto';
      this.inputContextMenuContainer.style.position = 'fixed';
      this.inputContextMenuContainer.style.zIndex = '10000';
      this.inputContextMenuContainer.style.opacity = '1';
      this.inputContextMenuContainer.style.visibility = 'visible';
      this.inputContextMenuContainer.style.pointerEvents = 'auto';
    };

    // 立即更新一次位置
    updateMenuPosition();

    // 保存位置更新处理器，用于清理
    this.contextMenuPositionUpdateHandler = updateMenuPosition;

    // 监听滚动和窗口大小变化，实时更新菜单位置
    const handleScroll = () => {
      if (this.contextMenuPositionUpdateTimer) {
        clearTimeout(this.contextMenuPositionUpdateTimer);
      }
      // 使用防抖，避免频繁更新
      this.contextMenuPositionUpdateTimer = setTimeout(() => {
        updateMenuPosition();
      }, 16); // 约60fps
    };

    const handleResize = () => {
      updateMenuPosition();
    };

    // 保存监听器引用，以便清理
    this.contextMenuScrollHandler = handleScroll;
    this.contextMenuResizeHandler = handleResize;

    // 监听编辑器滚动、窗口滚动和窗口大小变化
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    
    // 如果编辑器有滚动容器，也监听它的滚动
    const editorDomNode = this.editor.getDomNode();
    if (editorDomNode) {
      const scrollableElement = editorDomNode.querySelector('.monaco-scrollable-element') as HTMLElement;
      if (scrollableElement) {
        this.contextMenuScrollableElement = scrollableElement;
        this.contextMenuEditorScrollHandler = handleScroll;
        scrollableElement.addEventListener('scroll', handleScroll, { passive: true });
      }
    }

    // 创建 React Root（使用输入框菜单容器）
    if (!this.inputContextMenuRoot && this.inputContextMenuContainer) {
      this.inputContextMenuRoot = createRoot(this.inputContextMenuContainer);
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

    // 标记菜单已打开
    this.isContextMenuOpen = true;

    // 显示一级菜单（使用输入框菜单Root）
    await this.showMenuLevel1(true);
  }

  /**
   * 处理@按钮点击，显示上下文菜单
   */
  private async handleContextMenuClick(): Promise<void> {
    console.log('[AIZoneWidget] handleContextMenuClick 被调用, isContextMenuOpen:', this.isContextMenuOpen);
    if (this.isContextMenuOpen) {
      console.log('[AIZoneWidget] 菜单已打开，关闭菜单');
      this.closeContextMenu();
      return;
    }

    // 如果智能体菜单是打开的，先关闭它
    if (this.isAgentMenuOpen) {
      this.closeAgentMenu();
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

    // 创建 React Root（工具栏菜单）
    if (!this.contextMenuRoot && this.contextMenuContainer) {
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

    // 显示一级菜单（工具栏菜单，useInputMenu=false）
    await this.showMenuLevel1(false);
  }

  /**
   * 显示一级菜单（分类菜单）
   * @param useInputMenu 是否使用输入框菜单容器（true=输入框@菜单，false=工具栏@菜单）
   */
  private async showMenuLevel1(useInputMenu: boolean = false): Promise<void> {
    const menuRoot = useInputMenu ? this.inputContextMenuRoot : this.contextMenuRoot;
    if (!menuRoot) return;

    const menuGroups = await buildLevel1MenuItems();

    // 渲染Select组件（使用受控模式）
    setTimeout(() => {
      if (!menuRoot) return;
      
      menuRoot.render(
        React.createElement(Select, {
          value: '',
          onChange: (value: string) => this.handleContextMenuItemSelect(value, useInputMenu),
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
              // 打开@菜单时，关闭模型菜单
              if (this.isDropdownOpen && this.closeDropdownFn) {
                this.closeDropdownFn();
              }
            } else {
              this.enableEditorScroll();
              this.closeContextMenu();
            }
          },
        })
      );

      this.isContextMenuOpen = true;
      this.currentMenuLevel = 'level1';
      
      // 菜单渲染后，再次更新位置以确保正确显示
      if (this.contextMenuPositionUpdateHandler) {
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          if (this.contextMenuPositionUpdateHandler) {
            this.contextMenuPositionUpdateHandler();
          }
        });
      }
    }, 0);
  }

  /**
   * 显示二级菜单（具体选项菜单）
   * @param category 分类名称
   * @param useInputMenu 是否使用输入框菜单容器（true=输入框@菜单，false=工具栏@菜单）
   */
  private async showMenuLevel2(category: string, useInputMenu: boolean = false): Promise<void> {
    const menuRoot = useInputMenu ? this.inputContextMenuRoot : this.contextMenuRoot;
    if (!menuRoot) return;

    this.currentCategory = category;
    await this.renderMenuLevel2(useInputMenu);
  }

  /**
   * 渲染二级菜单
   * @param useInputMenu 是否使用输入框菜单容器（true=输入框@菜单，false=工具栏@菜单）
   */
  private async renderMenuLevel2(useInputMenu: boolean = false): Promise<void> {
    const menuRoot = useInputMenu ? this.inputContextMenuRoot : this.contextMenuRoot;
    if (!menuRoot || !this.currentCategory) return;

    const menuGroups = await buildLevel2MenuItems(
      this.currentCategory,
      (filePath: string) => this.handleFileSelect(filePath),
      (promptId: string) => this.handlePromptSelect(promptId),
      (kbId: string) => this.handleKnowledgeBaseSelect(kbId),
      (snippetId: number) => this.handleSnippetSelect(snippetId),
      (agentId: string) => this.handleAgentSelect(agentId),
      this.expandedFolders
    );

    // 渲染Select组件（使用受控模式）
    setTimeout(() => {
      if (!menuRoot) return;
      
      menuRoot.render(
        React.createElement(Select, {
          value: '',
          onChange: (value: string) => this.handleContextMenuItemSelect(value, useInputMenu),
          onItemClick: (value: string) => {
            // 如果是文件夹，返回 false 阻止菜单关闭
            if (value.startsWith('folder-')) {
              return false;
            }
            // 其他情况默认关闭菜单
            return true;
          },
          groups: menuGroups,
          placeholder: '选择选项...',
          className: 'ai-zone-context-select',
          showSearch: true, // 二级菜单显示搜索
          headerLeftIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-left', size: 16 }),
          onHeaderLeftClick: () => {
            // 返回一级菜单时清空展开状态
            this.expandedFolders.clear();
            this.showMenuLevel1(useInputMenu);
          },
          open: true,
          onOpenChange: (isOpen: boolean) => {
            this.isContextMenuOpen = isOpen;
            if (isOpen) {
              this.disableEditorScroll();
              // 打开@菜单时，关闭模型菜单
              if (this.isDropdownOpen && this.closeDropdownFn) {
                this.closeDropdownFn();
              }
            } else {
              this.enableEditorScroll();
              this.closeContextMenu();
            }
          },
        })
      );

      this.isContextMenuOpen = true;
      this.currentMenuLevel = 'level2';
      
      // 菜单渲染后，再次更新位置以确保正确显示
      if (this.contextMenuPositionUpdateHandler) {
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          if (this.contextMenuPositionUpdateHandler) {
            this.contextMenuPositionUpdateHandler();
          }
        });
      }
    }, 0);
  }

  /**
   * 处理上下文菜单项选择
   * @param value 选中的值
   * @param useInputMenu 是否使用输入框菜单容器（true=输入框@菜单，false=工具栏@菜单）
   */
  private async handleContextMenuItemSelect(value: string, useInputMenu: boolean = false): Promise<void> {
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
        // 清空展开状态
        this.expandedFolders.clear();
        await this.showMenuLevel2(value, useInputMenu);
        return;
      }
    }

    // 二级菜单选择，执行具体操作
    // 根据value前缀判断操作类型
    if (value.startsWith('file-')) {
      // 文件选择（从资源管理器）
      this.closeContextMenu();
      const filePath = value.replace('file-', '');
      await this.handleFileSelect(filePath);
    } else if (value.startsWith('folder-')) {
      // 文件夹展开/折叠处理
      const folderPath = value.replace('folder-', '');
      
      // 切换展开状态
      if (this.expandedFolders.has(folderPath)) {
        this.expandedFolders.delete(folderPath);
      } else {
        this.expandedFolders.add(folderPath);
      }
      
      // 重新渲染菜单以反映展开状态变化
      await this.renderMenuLevel2();
    } else if (value.startsWith('kb-')) {
      // 知识库选项（从二级菜单选择）
      this.closeContextMenu();
      const kbId = value.replace('kb-', '');
      await this.handleKnowledgeBaseSelect(kbId);
    } else if (value.startsWith('prompt-')) {
      // 提取提示词ID（去掉prompt-前缀）
      this.closeContextMenu();
      const promptId = value.replace('prompt-', '');
      this.handlePromptSelect(promptId);
    } else if (value.startsWith('snippet-')) {
      // 提取片段ID（去掉snippet-前缀）
      this.closeContextMenu();
      const snippetIdStr = value.replace('snippet-', '');
      const snippetId = parseInt(snippetIdStr, 10);
      if (!isNaN(snippetId)) {
        await this.handleSnippetSelect(snippetId);
      }
    } else if (value.startsWith('agent-')) {
      // 提取智能体ID（去掉agent-前缀）
      this.closeContextMenu();
      const agentId = value.replace('agent-', '');
      this.handleAgentSelect(agentId);
    }
  }

  /**
   * 关闭上下文菜单
   */
  private closeContextMenu(): void {
    // 清理工具栏@菜单
    if (this.contextMenuRoot) {
      this.contextMenuRoot.unmount();
      this.contextMenuRoot = null;
    }

    // 清理输入框@菜单
    if (this.inputContextMenuRoot) {
      this.inputContextMenuRoot.unmount();
      this.inputContextMenuRoot = null;
    }

    // 清理位置更新监听器
    if (this.contextMenuPositionUpdateTimer) {
      clearTimeout(this.contextMenuPositionUpdateTimer);
      this.contextMenuPositionUpdateTimer = null;
    }

    if (this.contextMenuScrollHandler) {
      window.removeEventListener('scroll', this.contextMenuScrollHandler, true);
      this.contextMenuScrollHandler = null;
    }

    if (this.contextMenuResizeHandler) {
      window.removeEventListener('resize', this.contextMenuResizeHandler);
      this.contextMenuResizeHandler = null;
    }

    if (this.contextMenuEditorScrollHandler && this.contextMenuScrollableElement) {
      this.contextMenuScrollableElement.removeEventListener('scroll', this.contextMenuEditorScrollHandler);
      this.contextMenuEditorScrollHandler = null;
      this.contextMenuScrollableElement = null;
    }

    // 恢复工具栏菜单容器的原始位置
    if (this.contextMenuContainer) {
      // 恢复为absolute定位，相对于按钮容器
      this.contextMenuContainer.style.position = 'absolute';
      this.contextMenuContainer.style.top = '0';
      this.contextMenuContainer.style.left = '0';
      this.contextMenuContainer.style.width = '100%';
      this.contextMenuContainer.style.height = '100%';
      // 清理从输入框触发时设置的样式
      this.contextMenuContainer.style.maxHeight = '';
      this.contextMenuContainer.style.overflowY = '';
      this.contextMenuContainer.style.zIndex = '';
    }

    // 隐藏输入框菜单容器
    if (this.inputContextMenuContainer) {
      this.inputContextMenuContainer.style.opacity = '0';
      this.inputContextMenuContainer.style.visibility = 'hidden';
      this.inputContextMenuContainer.style.pointerEvents = 'none';
    }

    // 注意：contextMenuContainer 不需要从 DOM 中移除，因为它已经附加到按钮容器中
    // inputContextMenuContainer 也不需要从 DOM 中移除，只需要隐藏即可

    this.isContextMenuOpen = false;
    this.currentMenuLevel = 'level1';
    this.currentCategory = null;
    // 清空展开状态
    this.expandedFolders.clear();
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
      const fileName = getFileName(filePath);
      
      // 检查文件是否已经选中，避免重复添加
      const isAlreadySelected = this.selectedFiles.some(file => file.path === filePath);
      if (!isAlreadySelected) {
        const fileInfo = { path: filePath, name: fileName };
        // 添加到选中文件列表
        this.selectedFiles.push(fileInfo);
        // 更新工具栏显示
        this.updateSelectedFilesToolbar();
      }
      
      // 读取文件内容并在输入框中插入 @file 引用
      if (this.inputElement) {
        try {
          const fileResult = await window.electron?.file?.read(filePath);
          if (fileResult?.success && fileResult.data?.content) {
            const currentValue = this.inputElement.value;
            const cursorPos = this.inputElement.selectionStart || currentValue.length;
            
            // 构建文件引用格式
            const fileReference = `@file:${fileName}\n\`\`\`\n${fileResult.data.content}\n\`\`\`\n`;
            const newValue = currentValue.slice(0, cursorPos) + fileReference + currentValue.slice(cursorPos);
            this.inputElement.value = newValue;
            this.inputElement.focus();
            this.inputElement.setSelectionRange(cursorPos + fileReference.length, cursorPos + fileReference.length);
          } else {
            // 如果读取文件失败，只插入文件名引用
            const currentValue = this.inputElement.value;
            const cursorPos = this.inputElement.selectionStart || currentValue.length;
            const fileReference = `@file:${fileName}\n`;
            const newValue = currentValue.slice(0, cursorPos) + fileReference + currentValue.slice(cursorPos);
            this.inputElement.value = newValue;
            this.inputElement.focus();
            this.inputElement.setSelectionRange(cursorPos + fileReference.length, cursorPos + fileReference.length);
          }
        } catch (error) {
          console.warn(`[AIZoneWidget] 读取文件失败: ${filePath}`, error);
          // 即使读取失败，也插入文件名引用
          const currentValue = this.inputElement.value;
          const cursorPos = this.inputElement.selectionStart || currentValue.length;
          const fileReference = `@file:${fileName}\n`;
          const newValue = currentValue.slice(0, cursorPos) + fileReference + currentValue.slice(cursorPos);
          this.inputElement.value = newValue;
          this.inputElement.focus();
          this.inputElement.setSelectionRange(cursorPos + fileReference.length, cursorPos + fileReference.length);
        }
      }
    } catch (error) {
      console.error('[AIZoneWidget] 处理文件选择失败:', error);
    }
  }

  /**
   * 获取选中的文件列表（支持文件和知识库）
   */
  getSelectedFiles(): Array<{ path: string; name: string; type?: 'file' | 'knowledge-base'; kbId?: string }> {
    return [...this.selectedFiles];
  }

  /**
   * 更新选中文件工具栏显示
   */
  private updateSelectedFilesToolbar(): void {
    if (!this.selectedFilesToolbar) return;

    // 检查工具栏之前的显示状态和高度
    const wasVisible = this.selectedFilesToolbarWasVisible;
    const willBeVisible = this.selectedFiles.length > 0;
    const visibilityChanged = wasVisible !== willBeVisible;
    
    // 保存工具栏之前的高度（在清空内容前，如果工具栏是显示的，获取实际高度）
    const previousHeight = (wasVisible && this.selectedFilesToolbar?.style.display !== 'none')
      ? (this.selectedFilesToolbar.offsetHeight || this.selectedFilesToolbarHeight)
      : this.selectedFilesToolbarHeight;

    // 清空工具栏内容
    this.selectedFilesToolbar.innerHTML = '';

    // 如果没有选中文件，隐藏工具栏
    if (this.selectedFiles.length === 0) {
      // 在隐藏工具栏前，保存 view-zone 的当前位置
      const viewZoneElement = this.getViewZoneDomElement();
      if (viewZoneElement && this.borderContainer) {
        const viewZoneRect = viewZoneElement.getBoundingClientRect();
        const containerRect = this.borderContainer.getBoundingClientRect();
        this.savedViewZoneTop = viewZoneRect.top - containerRect.top;
      }
      
      this.selectedFilesToolbar.style.display = 'none';
      this.selectedFilesToolbarWasVisible = false;
      this.selectedFilesToolbarHeight = 0;

      const hadHeight = previousHeight > 0;
      const needsLayoutUpdate = visibilityChanged || hadHeight;
      
      // 当显示状态变化或之前曾经占位时，都需要刷新布局，确保底部边框收缩
      if (needsLayoutUpdate) {
        // 工具栏隐藏后，重新计算容器高度并更新边框位置
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // 更新容器高度（updateZoneHeight 会恢复保存的位置）
            this.adjustContainerHeightForMessage();
            
            // @引用文件从文件工具栏全部删除后，需要更新底部边框位置
            requestAnimationFrame(() => {
              this.updateBottomBorderPosition();
            });
            
            // 在高度更新后，再次确保位置正确
            requestAnimationFrame(() => {
              if (viewZoneElement && this.savedViewZoneTop !== null) {
                viewZoneElement.style.setProperty('top', `${this.savedViewZoneTop}px`, 'important');
                // 清除保存的位置，让后续的位置更新正常进行
                this.savedViewZoneTop = null;
              }
            });
          });
        });
      } else {
        // 即使不需要布局更新，删除所有文件后也需要更新底部边框位置
        requestAnimationFrame(() => {
          this.updateBottomBorderPosition();
        });
      }
      return;
    }

    // 显示工具栏
    this.selectedFilesToolbar.style.display = 'flex';
    this.selectedFilesToolbarWasVisible = true;

    // 计算要显示的文件数量（最多5个）
    const maxDisplayCount = 5;
    const displayFiles = this.selectedFiles.slice(0, maxDisplayCount);
    const remainingCount = this.selectedFiles.length - maxDisplayCount;

    // 为每个要显示的文件或知识库创建显示项
    displayFiles.forEach((file) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'ai-zone-selected-file-item';

      // 创建图标容器（根据类型选择不同图标）
      const iconContainer = document.createElement('span');
      const iconRoot = createRoot(iconContainer);
      iconRoot.render(
        React.createElement(Icon, {
          iconSet: 'ui',
          name: file.type === 'knowledge-base' ? 'book-open' : 'file',
          size: 14
        })
      );
      fileItem.appendChild(iconContainer);

      // 创建文件名文本
      const fileNameText = document.createElement('span');
      fileNameText.className = 'ai-zone-selected-file-name';
      fileNameText.textContent = file.name;
      fileItem.appendChild(fileNameText);

      // 创建删除按钮
      const removeBtn = document.createElement('button');
      removeBtn.className = 'ai-zone-selected-file-remove';
      removeBtn.title = file.type === 'knowledge-base' ? '移除知识库' : '移除文件';
      removeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 从列表中移除（使用路径或知识库ID查找）
        const fileIndex = file.type === 'knowledge-base' && file.kbId
          ? this.selectedFiles.findIndex(f => f.kbId === file.kbId)
          : this.selectedFiles.findIndex(f => f.path === file.path);
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

    // 如果还有剩余文件，显示"更多"指示器
    if (remainingCount > 0) {
      const moreItem = document.createElement('div');
      moreItem.className = 'ai-zone-selected-file-item ai-zone-selected-file-more';

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
      moreItem.appendChild(iconContainer);

      // 创建数字文本
      const countText = document.createElement('span');
      countText.className = 'ai-zone-selected-file-count';
      countText.textContent = `+${remainingCount}`;
      moreItem.appendChild(countText);

      // 添加悬停事件
      moreItem.addEventListener('mouseenter', () => {
        this.showMoreFilesMenu(moreItem, this.selectedFiles.slice(maxDisplayCount));
      });

      moreItem.addEventListener('mouseleave', () => {
        this.scheduleCloseMoreFilesMenu();
      });

      if (this.selectedFilesToolbar) {
        this.selectedFilesToolbar.appendChild(moreItem);
      }
    }

    // 等待工具栏内容完全渲染后，检测高度变化
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 获取工具栏当前高度
        const currentHeight = this.selectedFilesToolbar?.offsetHeight || 0;
        const heightChanged = Math.abs(currentHeight - previousHeight) > 0.5;
        
        // 更新保存的高度
        this.selectedFilesToolbarHeight = currentHeight;
        
        // 如果显示状态变化或高度变化（比如换行），都需要更新高度和边框位置
        if (visibilityChanged || heightChanged) {
          // 在工具栏内容完全渲染后，保存 view-zone 的当前位置
          const viewZoneElement = this.getViewZoneDomElement();
          if (viewZoneElement && this.borderContainer) {
            const viewZoneRect = viewZoneElement.getBoundingClientRect();
            const containerRect = this.borderContainer.getBoundingClientRect();
            this.savedViewZoneTop = viewZoneRect.top - containerRect.top;
          }
          
          // 更新容器高度（updateZoneHeight 会恢复保存的位置）
          this.adjustContainerHeightForMessage();
          
          // 添加@引用文件时需要更新底部边框位置
          requestAnimationFrame(() => {
            this.updateBottomBorderPosition();
          });
          
          // 在高度更新后，再次确保位置正确
          requestAnimationFrame(() => {
            if (viewZoneElement && this.savedViewZoneTop !== null) {
              viewZoneElement.style.setProperty('top', `${this.savedViewZoneTop}px`, 'important');
              // 清除保存的位置，让后续的位置更新正常进行
              this.savedViewZoneTop = null;
            }
          });
        }
      });
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
  private async handleKnowledgeBaseSelect(kbId: string): Promise<void> {
    try {
      // 获取知识库信息
      const knowledgeBase = await knowledgeBaseService.findItem(kbId);
      if (!knowledgeBase || knowledgeBase.type !== 'folder') {
        console.warn(`[AIZoneWidget] 知识库不存在或类型不正确: ${kbId}`);
        return;
      }

      // 清空文件工具栏
      this.selectedFiles = [];

      // 添加知识库到工具栏
      this.selectedFiles.push({
        path: kbId, // 使用知识库ID作为路径标识
        name: knowledgeBase.title,
        type: 'knowledge-base',
        kbId: kbId
      });

      // 更新工具栏显示
      this.updateSelectedFilesToolbar();

      // 在输入框中插入知识库名称（而不是 @knowledge-base:kb_xxx）
      if (this.inputElement) {
        const currentValue = this.inputElement.value;
        const cursorPos = this.inputElement.selectionStart || currentValue.length;
        const kbReference = `@${knowledgeBase.title} `;
        const newValue = currentValue.slice(0, cursorPos) + kbReference + currentValue.slice(cursorPos);
        this.inputElement.value = newValue;
        this.inputElement.focus();
        this.inputElement.setSelectionRange(cursorPos + kbReference.length, cursorPos + kbReference.length);
      }
    } catch (error) {
      console.error(`[AIZoneWidget] 处理知识库选择失败: ${kbId}`, error);
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
    // 关闭智能体菜单
    this.closeAgentMenu();
  }

  /**
   * 切换智能体菜单显示/隐藏
   */
  private async toggleAgentMenu(): Promise<void> {
    if (this.isAgentMenuOpen) {
      this.closeAgentMenu();
      return;
    }
    
    // 如果上下文菜单是打开的，先关闭它
    if (this.isContextMenuOpen) {
      this.closeContextMenu();
    }
    
    await this.showAgentMenu();
  }

  /**
   * 显示智能体菜单
   */
  private async showAgentMenu(): Promise<void> {
    if (!this.agentMenuContainer) {
      console.error('[AIZoneWidget] 智能体菜单容器未创建');
      return;
    }

    if (!this.aiAgentBtn) {
      console.error('[AIZoneWidget] AI智能体按钮未创建');
      return;
    }

    // 确保容器有正确的尺寸和位置（从按钮获取）
    const buttonRect = this.aiAgentBtn.getBoundingClientRect();
    
    if (buttonRect.width > 0 && buttonRect.height > 0) {
      // 设置容器的尺寸和位置，使其与按钮对齐
      this.agentMenuContainer.style.width = `${buttonRect.width}px`;
      this.agentMenuContainer.style.height = `${buttonRect.height}px`;
      // 确保容器可见（用于位置计算），但保持透明
      this.agentMenuContainer.style.opacity = '0';
      this.agentMenuContainer.style.visibility = 'visible';
    }

    // 创建 React Root
    if (!this.agentMenuRoot) {
      this.agentMenuRoot = createRoot(this.agentMenuContainer);
    }

    // 获取所有智能体
    const agents = await aiAgentService.getAllAgents();

    // 构建菜单项
    const menuGroups: SelectGroup[] = [
      {
        groupName: 'AI 智能体',
        items: agents.length > 0
          ? agents.map(agent => ({
              value: agent.id,
              label: `${agent.emoji} ${agent.name}`
            }))
          : [
              {
                value: 'no-agent',
                label: '暂无智能体',
                disabled: true
              }
            ]
      }
    ];

    // 渲染Select组件
    setTimeout(() => {
      if (!this.agentMenuRoot) return;
      
      this.agentMenuRoot.render(
        React.createElement(Select, {
          value: '',
          onChange: (value: string) => {
            if (value && value !== 'no-agent') {
              this.handleAgentSelect(value);
            }
          },
          groups: menuGroups,
          placeholder: '选择智能体...',
          className: 'ai-zone-agent-select',
          showSearch: true,
          open: true,
          onItemClick: (value: string) => {
            // 选择智能体后关闭菜单
            if (value && value !== 'no-agent') {
              return true; // 返回 true 表示关闭菜单
            }
            return false;
          },
          onOpenChange: (isOpen: boolean) => {
            this.isAgentMenuOpen = isOpen;
            if (isOpen) {
              this.disableEditorScroll();
            } else {
              this.enableEditorScroll();
              this.closeAgentMenu();
            }
          },
        })
      );

      this.isAgentMenuOpen = true;
    }, 0);
  }

  /**
   * 关闭智能体菜单
   */
  private closeAgentMenu(): void {
    if (this.agentMenuRoot) {
      this.agentMenuRoot.unmount();
      this.agentMenuRoot = null;
    }

    this.isAgentMenuOpen = false;
  }

  /**
   * 显示更多文件菜单
   */
  private showMoreFilesMenu(triggerElement: HTMLElement, files: Array<{ path: string; name: string }>): void {
    // 清除延迟关闭定时器
    if (this.moreFilesMenuTimeout) {
      clearTimeout(this.moreFilesMenuTimeout);
      this.moreFilesMenuTimeout = null;
    }

    // 如果菜单已经打开，直接返回
    if (this.isMoreFilesMenuOpen) {
      return;
    }

    // 创建菜单容器（如果不存在）
    if (!this.moreFilesMenuContainer) {
      this.moreFilesMenuContainer = document.createElement('div');
      this.moreFilesMenuContainer.className = 'ai-zone-more-files-menu';
      // 添加悬停事件，防止菜单在鼠标移动到菜单上时关闭
      this.moreFilesMenuContainer.addEventListener('mouseenter', () => {
        if (this.moreFilesMenuTimeout) {
          clearTimeout(this.moreFilesMenuTimeout);
          this.moreFilesMenuTimeout = null;
        }
      });
      this.moreFilesMenuContainer.addEventListener('mouseleave', () => {
        this.scheduleCloseMoreFilesMenu();
      });
      document.body.appendChild(this.moreFilesMenuContainer);
    }

    // 计算菜单位置
    const triggerRect = triggerElement.getBoundingClientRect();
    const menuStyle = this.moreFilesMenuContainer.style;
    menuStyle.position = 'fixed';
    menuStyle.top = `${triggerRect.bottom + 4}px`;
    menuStyle.left = `${triggerRect.left}px`;
    menuStyle.zIndex = '99999';
    menuStyle.display = 'block';

    // 创建 React Root
    if (!this.moreFilesMenuRoot) {
      this.moreFilesMenuRoot = createRoot(this.moreFilesMenuContainer);
    }

    // 渲染菜单内容
    this.moreFilesMenuRoot.render(
      React.createElement(MoreFilesMenu, {
        files: files,
        onRemoveFile: (filePath: string) => {
          const fileIndex = this.selectedFiles.findIndex(f => f.path === filePath);
          if (fileIndex !== -1) {
            this.selectedFiles.splice(fileIndex, 1);
            this.updateSelectedFilesToolbar();
            // 如果删除后没有剩余文件，关闭菜单
            if (this.selectedFiles.length <= 5) {
              this.closeMoreFilesMenu();
            }
          }
        },
        onMouseEnter: () => {
          // 鼠标进入菜单，取消延迟关闭
          if (this.moreFilesMenuTimeout) {
            clearTimeout(this.moreFilesMenuTimeout);
            this.moreFilesMenuTimeout = null;
          }
        },
        onMouseLeave: () => {
          // 鼠标离开菜单，延迟关闭
          this.scheduleCloseMoreFilesMenu();
        }
      })
    );

    this.isMoreFilesMenuOpen = true;
  }

  /**
   * 延迟关闭更多文件菜单
   */
  private scheduleCloseMoreFilesMenu(): void {
    // 清除之前的定时器
    if (this.moreFilesMenuTimeout) {
      clearTimeout(this.moreFilesMenuTimeout);
    }

    // 设置延迟关闭（200ms）
    this.moreFilesMenuTimeout = window.setTimeout(() => {
      this.closeMoreFilesMenu();
      this.moreFilesMenuTimeout = null;
    }, 200);
  }

  /**
   * 关闭更多文件菜单
   */
  private closeMoreFilesMenu(): void {
    // 清除延迟关闭定时器
    if (this.moreFilesMenuTimeout) {
      clearTimeout(this.moreFilesMenuTimeout);
      this.moreFilesMenuTimeout = null;
    }

    if (this.moreFilesMenuRoot) {
      this.moreFilesMenuRoot.unmount();
      this.moreFilesMenuRoot = null;
    }

    if (this.moreFilesMenuContainer) {
      this.moreFilesMenuContainer.style.display = 'none';
    }

    this.isMoreFilesMenuOpen = false;
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

    // 从 Map 中移除实例
    if (this.tabId) {
      const existingInstance = AIZoneWidget.instances.get(this.tabId);
      if (existingInstance === this) {
        AIZoneWidget.instances.delete(this.tabId);
      }
    }

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

    // 清除高度调整定时器
    if (this.heightAdjustTimer) {
      clearTimeout(this.heightAdjustTimer);
      this.heightAdjustTimer = null;
    }

    // 清除位置修复定时器
    if (this.positionFixTimer) {
      clearTimeout(this.positionFixTimer);
      this.positionFixTimer = null;
    }

    // 清除布局变化防抖定时器
    if (this.layoutChangeTimer) {
      clearTimeout(this.layoutChangeTimer);
      this.layoutChangeTimer = null;
    }

    // 清除@菜单位置更新定时器
    if (this.contextMenuPositionUpdateTimer) {
      clearTimeout(this.contextMenuPositionUpdateTimer);
      this.contextMenuPositionUpdateTimer = null;
    }

    // 清理@菜单位置更新监听器
    if (this.contextMenuScrollHandler) {
      window.removeEventListener('scroll', this.contextMenuScrollHandler, true);
      this.contextMenuScrollHandler = null;
    }

    if (this.contextMenuResizeHandler) {
      window.removeEventListener('resize', this.contextMenuResizeHandler);
      this.contextMenuResizeHandler = null;
    }

    if (this.contextMenuEditorScrollHandler && this.contextMenuScrollableElement) {
      this.contextMenuScrollableElement.removeEventListener('scroll', this.contextMenuEditorScrollHandler);
      this.contextMenuEditorScrollHandler = null;
      this.contextMenuScrollableElement = null;
    }

    // 销毁 React Root
    if (this.toolbarModelDropdownRoot) {
      this.toolbarModelDropdownRoot.unmount();
      this.toolbarModelDropdownRoot = null;
    }

    // 关闭并销毁上下文菜单
    this.closeContextMenu();

    // 清理输入框菜单容器（从DOM中移除）
    if (this.inputContextMenuContainer && this.inputContextMenuContainer.parentElement) {
      this.inputContextMenuContainer.parentElement.removeChild(this.inputContextMenuContainer);
      this.inputContextMenuContainer = null;
    }

    // 关闭并销毁智能体菜单
    this.closeAgentMenu();

    // 关闭并销毁更多文件菜单
    this.closeMoreFilesMenu();
    if (this.moreFilesMenuContainer) {
      document.body.removeChild(this.moreFilesMenuContainer);
      this.moreFilesMenuContainer = null;
    }
    
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
  }
}

