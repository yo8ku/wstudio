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
import { getSendIconSvg } from './iconHelpers';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { CustomSelect } from '../../common/CustomSelect';
import { Button } from '../../ui/button';

interface AIZoneWidgetOptions {
  onSubmit: (message: string, includeSelection: boolean, selectedModel?: string) => void;
  onClose: () => void;
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
  private dropdownRoot: Root | null = null; // React Root 实例（模型选择下拉框）
  private addContextBtnRoot: Root | null = null; // React Root 实例（添加上下文按钮）
  private options: AIZoneWidgetOptions;
  private chatHistory: ChatMessage[] = [];
  private selectedText: string = '';
  private includeSelection: boolean = false;
  private isGenerating: boolean = false;
  private selectedModel: string = ''; // 当前选中的模型
  private borderOverlays: { top: HTMLElement, bottom: HTMLElement } | null = null; // 边框覆盖层
  private scrollDisposable: monaco.IDisposable | null = null; // 滚动事件监听器
  private layoutDisposable: monaco.IDisposable | null = null; // 布局变化监听器
  private isDisposed: boolean = false; // 标记是否已销毁，防止重复销毁
  private adjustHeightFn: (() => void) | null = null; // 高度调整函数
  private dropdownClickHandler: ((e: MouseEvent) => void) | null = null; // 下拉菜单点击监听器
  private isDropdownOpen: boolean = false; // 下拉菜单是否打开
  private originalScrollbarOptions: any = null; // 原始滚动条配置
  private messageDisplayElement: HTMLElement | null = null; // 消息显示区域
  private currentUserMessage: string = ''; // 当前用户消息
  private thinkingAnimationInterval: number | null = null; // 思考动画定时器

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
      .ai-zone-container {
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size, 13px);
        box-sizing: border-box !important;
        pointer-events: auto !important;
        user-select: text;
        position: relative;
        z-index: 1000;
        padding: 0;
        margin: 0;
        min-height: 72px;
        overflow: visible !important;
        /* 固定宽度 - 不受编辑器宽度影响 */
        width: 834px !important;
        min-width: 834px !important;
        max-width: 834px !important;
        /* 不使用容器边框，改用全宽覆盖层 */
      }
      
      .ai-zone-container * {
        box-sizing: border-box;
      }

      /* 内容区域 */
      .ai-zone-content {
        padding: 8px 40px 8px 0px;
        width: 100%;
        min-height: 44px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 8px;
        box-sizing: border-box;
        overflow: visible;
      }

      /* 输入容器 */
      .ai-zone-input-wrapper {
        display: flex;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
        border-radius: 4px;
        gap: 8px;
        box-sizing: border-box;
        pointer-events: auto !important;
        min-height: 28px;
        overflow: visible;
        width: 100%;
        min-width: 0;
        align-items: center;
        padding-left:2px;
        padding-right:1px;
      }

      .ai-zone-input-wrapper:focus-within {
        border-color: var(--vscode-focusBorder);
      }

      /* 输入框 */
      .ai-zone-input {
        flex: 1;
        background: transparent;
        color: var(--vscode-input-foreground);
        border: none;
        font-family: var(--vscode-font-family);
        font-size: 13px;
        line-height: 18px;
        resize: none;
        outline: none;
        overflow-y: auto;
        overflow-x: hidden;
        min-height: 18px;
        max-height: 88px;
        box-sizing: border-box;
        pointer-events: auto !important;
        cursor: text;
        min-width: 0;
        max-width: 100%;
        word-wrap: break-word;
        word-break: break-word;
      }

      .ai-zone-input::placeholder {
        color: var(--vscode-input-placeholderForeground);
        opacity: 0.6;
      }

      /* 底部控制栏 */
      .ai-zone-bottom-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 4px;
        min-height: 28px;
      }

      /* 左侧控制按钮组 */
      .ai-zone-left-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* 添加上下文按钮容器（使用 shadcn Button 组件） */
      .ai-zone-add-context-btn-container {
        pointer-events: auto !important;
      }

      /* shadcn Button 组件覆盖样式 */
      .ai-zone-add-context-btn {
        pointer-events: auto !important;
        font-family: var(--vscode-font-family) !important;
      }

      /* 上下文按钮图标 */
      .ai-zone-context-icon {
        width: 16px;
        height: 16px;
        fill: currentColor;
        flex-shrink: 0;
      }

      /* 按钮文字 */
      .ai-zone-btn-text {
        font-family: var(--vscode-font-family);
        white-space: nowrap;
      }

      /* 模型选择下拉框容器 */
      /* 模型下拉框（在输入框内） */
      .ai-zone-model-dropdown {
        flex-shrink: 0;
        pointer-events: auto;
        margin-top: 0px;
      }
      
      /* 发送按钮（在输入框内） */
      .ai-zone-send-btn {
        flex-shrink: 0;
        padding: 4px;
        background: transparent;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 2px;
        cursor: pointer;
        pointer-events: auto !important;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        transition: background-color 0.1s ease;
        margin-top: 0px;
      }
      
      .ai-zone-send-btn:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground, rgba(255, 255, 255, 0.08));
      }
      
      .ai-zone-send-btn:active:not(:disabled) {
        background: var(--vscode-button-background, rgba(255, 255, 255, 0.12));
      }
      
      .ai-zone-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .ai-zone-send-icon {
        width: 16px;
        height: 16px;
        fill: var(--vscode-button-foreground, var(--vscode-foreground));
      }

      /* Radix UI Select (新版 CustomSelect) */
      .ai-zone-model-select button {
        background: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.05));
        color: var(--vscode-dropdown-foreground) !important;
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)) !important;
        border-radius: 3px;
        outline: none !important;
        box-shadow: none !important;
        font-family: var(--vscode-font-family) !important;
        font-size: 11.5px !important;
        padding: 4px 8px !important;
        height: 24px !important;
        min-width: 120px !important;
        max-width: 300px !important;
        width: auto !important;
        transition: background-color 0.1s ease;
      }

      .ai-zone-model-select button:hover {
        background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.04)) !important;
      }

      /* 关闭按钮 - 在输入框容器内右侧 */
      .ai-zone-close-btn {
        width: 24px;
        height: 24px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: var(--vscode-icon-foreground, var(--vscode-foreground));
        border: none;
        border-radius: 3px;
        cursor: pointer;
        pointer-events: auto !important;
        flex-shrink: 0;
        opacity: 0.7;
        transition: opacity 0.1s ease, background-color 0.1s ease;
        margin-top: 0px;
      }

      .ai-zone-close-btn:hover {
        background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
        opacity: 1;
      }

      .ai-zone-close-btn:active {
        background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 103, 0.31));
      }

      /* 关闭图标 SVG */
      .ai-zone-close-icon {
        width: 20px;
        height: 20px;
        fill: currentColor;
        pointer-events: none;
      }

      /* 消息显示区域 */
      .ai-zone-message-display {
        padding: 0;
      }

      /* 消息包装器 */
      .ai-zone-message-wrapper {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      /* 头像 */
      .ai-zone-avatar {
        width: 20px;
        height: 20px;
        border-radius: 2px;
        flex-shrink: 0;
        object-fit: cover;
        margin-top: 2px;
      }

      /* 消息文本 */
      .ai-zone-message-text {
        color: var(--vscode-foreground);
        font-size: 13px;
        line-height: 20px;
        font-family: var(--vscode-font-family);
        flex: 1;
      }

      /* 思考动画点点 */
      .ai-zone-thinking-dots::after {
        content: '';
        animation: thinking-dots 1.2s steps(4, end) infinite;
      }

      @keyframes thinking-dots {
        0%, 20% { content: ''; }
        40% { content: '.'; }
        60% { content: '..'; }
        80%, 100% { content: '...'; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 创建 Zone Widget DOM
   */
  private createDomNode(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-zone-container';
    // 不设置内联样式，让 CSS 完全控制宽度和布局

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

    // 思考动画点点
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
    textarea.placeholder = '向 AI 描述您想要做什么...';
    textarea.rows = 1;
    this.inputElement = textarea;

    // 自动调整高度
    const adjustHeight = () => {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 88);
      textarea.style.height = newHeight + 'px';
      
      // 计算容器总高度
      // - 内容区域 padding: 8px*2 = 16px
      // - 消息显示区域高度（如果显示）
      // - 输入框容器高度（包含边框、padding和内部元素）
      // - 底部工具栏高度：约28px（min-height）
      // - gap: 8px * 元素数量
      const messageHeight = this.messageDisplayElement?.style.display !== 'none' 
        ? (this.messageDisplayElement?.offsetHeight || 0)
        : 0;
      
      // 输入框容器高度 = max(输入框高度, 模型下拉框高度, 发送按钮高度) + padding(6px*2) + 边框(2px)
      // 模型下拉框高度约为 24px，发送按钮高度约为 24px
      const inputContentHeight = Math.max(newHeight, 24);
      const inputWrapperHeight = inputContentHeight + 12 + 2; // padding + border
      
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
    };
    
    // 保存引用，以便在其他地方调用
    this.adjustHeightFn = adjustHeight;

    textarea.addEventListener('input', adjustHeight);

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

    inputWrapper.appendChild(textarea);
    
    // 模型选择下拉框（放在输入框内，视觉上一体）

    if (this.options.availableModels && this.options.availableModels.length > 0) {

      const dropdownContainer = document.createElement('div');
      dropdownContainer.className = 'ai-zone-model-dropdown';
      
      // 使用 React 渲染 CustomSelect 组件
      this.dropdownRoot = createRoot(dropdownContainer);
      
      // 按服务商分组模型
      // 输入格式：["OpenAI:gpt-4o", "OpenAI:gpt-4o-mini", "Claude:claude-3-5-sonnet"]
      // 输出格式：[{ groupName: "OpenAI", items: [{value: "OpenAI:gpt-4o", label: "gpt-4o"}, ...] }, ...]
      const groupedModels = new Map<string, Array<{ value: string; label: string }>>();
      
      this.options.availableModels.forEach(model => {
        const [providerName, modelName] = model.split(':', 2);
        if (providerName && modelName) {
          if (!groupedModels.has(providerName)) {
            groupedModels.set(providerName, []);
          }
          groupedModels.get(providerName)!.push({
            value: model,
            label: modelName
          });
        }
      });
      
      // 转换为分组数组格式
      const modelGroups = Array.from(groupedModels.entries()).map(([groupName, items]) => ({
        groupName,
        items
      }));
      

      const updateDropdown = () => {
        if (this.dropdownRoot) {
          this.dropdownRoot.render(
            React.createElement(CustomSelect, {
              value: this.selectedModel,
              onChange: (value: string) => {

                this.selectedModel = value;
                updateDropdown(); // 重新渲染以更新显示
              },
              groups: modelGroups,
              placeholder: '选择模型',
              className: 'ai-zone-model-select'
            })
          );
        }
      };
      
      updateDropdown();
      
      inputWrapper.appendChild(dropdownContainer);

    } else {

    }
    
    // 发送按钮（放在输入框右侧）
    const sendBtn = document.createElement('button');
    sendBtn.className = 'ai-zone-send-btn';
    sendBtn.title = '发送 (Enter)';
    sendBtn.disabled = this.isGenerating;
    
    // 发送图标
    sendBtn.innerHTML = getSendIconSvg('ai-zone-send-icon');
    
    sendBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSubmit();
    });
    
    inputWrapper.appendChild(sendBtn);

    // 关闭按钮（放在输入框容器内，右侧）
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

    // 左侧控制按钮组
    const leftControls = document.createElement('div');
    leftControls.className = 'ai-zone-left-controls';

    // 添加上下文按钮（使用 shadcn Button 组件）
    const addContextBtnContainer = document.createElement('div');
    addContextBtnContainer.className = 'ai-zone-add-context-btn-container';
    
    // 使用 React 渲染 Button 组件
    this.addContextBtnRoot = createRoot(addContextBtnContainer);
    this.addContextBtnRoot.render(
      React.createElement(Button, {
        variant: 'outline',
        size: 'sm',
        className: 'ai-zone-add-context-btn',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          // TODO: 实现添加上下文功能

        },
        onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
      },
        // 按钮内容：图标 + 文本
        React.createElement('svg', {
          className: 'ai-zone-context-icon',
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 24 24',
          style: { width: '16px', height: '16px', marginRight: '6px' }
        },
          React.createElement('path', {
            d: 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
            fill: 'currentColor'
          })
        ),
        React.createElement('span', { className: 'ai-zone-btn-text' }, '添加上下文')
      )
    );
    
    leftControls.appendChild(addContextBtnContainer);

    bottomToolbar.appendChild(leftControls);

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

      this.borderOverlays = { top: topBorder, bottom: bottomBorder };

      // 监听滚动事件，更新边框位置和宽度
      const updateBorderPosition = () => {
        if (!this.domNode || !this.borderOverlays) return;
        
        // 先更新容器宽度（确保在计算位置前完成）
        this.updateContainerWidth();
        
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          if (!this.domNode || !this.borderOverlays) return;
          const newZoneRect = this.domNode.getBoundingClientRect();
          const newEditorRect = editorDomNode.getBoundingClientRect();
          
          // 更新位置
          this.borderOverlays.top.style.top = `${newZoneRect.top - newEditorRect.top}px`;
          this.borderOverlays.bottom.style.top = `${newZoneRect.bottom - newEditorRect.top}px`;
        });
      };

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
      this.scrollDisposable = this.editor.onDidScrollChange(updateBorderPosition);
      
      // 监听编辑器布局变化（窗口大小改变、小地图显示/隐藏等）
      this.layoutDisposable = this.editor.onDidLayoutChange(updateBorderPosition);
    }, 50);
  }

  /**
   * 显示 Zone Widget
   */
  show(lineNumber?: number, selectedText?: string): void {

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

    // 创建 DOM
    this.domNode = this.createDomNode();
    
    // 设置容器宽度（立即执行一次）
    this.updateContainerWidth();

    // 延迟再次更新宽度，确保 Monaco 布局信息已准备好
    setTimeout(() => {
      this.updateContainerWidth();

    }, 0);

    // 初始高度：顶部分割线(1px) + 内容区域(72px，包含输入框+工具栏) + 底部分割线(1px) = 74px
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
    // 使用捕获阶段，优先级高于 Monaco 的事件监听
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
    if (this.isDropdownOpen) return; // 已经禁用了
    

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
   * 停止生成
   */
  private stopGeneration(): void {

    this.isGenerating = false;
    this.refresh();
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
    this.refresh();
  }

  /**
   * 当 AI 开始回复时调用（显示用户问题）
   * 公共方法，供外部调用
   */
  public onAIResponseStart(): void {

    this.showUserQuestion();
  }

  /**
   * 当 AI 回复完成时调用
   * 公共方法，供外部调用
   */
  public onAIResponseComplete(): void {

    this.isGenerating = false;
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

    // 显示消息区域
    this.messageDisplayElement.style.display = 'block';

    // 更新消息文本为"正在思考..."
    const messageText = this.messageDisplayElement.querySelector('.ai-zone-message-text');
    if (messageText) {
      messageText.innerHTML = '正在思考<span class="ai-zone-thinking-dots"></span>';
    }

    // 调整容器高度以适应消息区域
    this.adjustContainerHeightForMessage();
  }

  /**
   * 显示用户问题
   */
  private showUserQuestion(): void {
    if (!this.messageDisplayElement || !this.currentUserMessage) return;

    // 更新消息文本为用户问题
    const messageText = this.messageDisplayElement.querySelector('.ai-zone-message-text');
    if (messageText) {
      messageText.textContent = this.currentUserMessage;
    }

    // 调整容器高度
    this.adjustContainerHeightForMessage();
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
   */
  private adjustContainerHeightForMessage(): void {
    if (!this.domNode || !this.messageDisplayElement) return;

    // 计算消息区域高度
    const messageHeight = this.messageDisplayElement.style.display === 'none' 
      ? 0 
      : this.messageDisplayElement.offsetHeight;

    // 获取当前输入框高度
    const inputHeight = this.inputElement?.offsetHeight || 28;

    // 输入框容器高度 = 输入框高度 + 边框(2px)
    const inputWrapperHeight = inputHeight + 2;
    
    // 底部工具栏高度
    const toolbarHeight = 28;
    
    // gap数量：根据可见元素计算
    const gapCount = messageHeight > 0 ? 2 : 1;
    const totalGap = 8 * gapCount;
    
    // 容器高度 = padding(16) + 消息高度 + 输入框高度 + 工具栏高度 + gap
    const containerHeight = Math.max(72, 16 + messageHeight + inputWrapperHeight + toolbarHeight + totalGap);
    this.domNode.style.height = containerHeight + 'px';

    // 更新 Zone 高度：容器高度 + 顶部和底部分割线(2px)
    const zoneHeight = containerHeight + 2;
    this.updateZoneHeight(zoneHeight);
  }

  /**
   * 清理
   */
  dispose(): void {
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
    if (this.dropdownRoot) {
      this.dropdownRoot.unmount();
      this.dropdownRoot = null;

    }
    
    if (this.addContextBtnRoot) {
      this.addContextBtnRoot.unmount();
      this.addContextBtnRoot = null;

    }
    
    // 清除单例实例
    if (AIZoneWidget.instance === this) {
      AIZoneWidget.instance = null;
    }
  }
}

