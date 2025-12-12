/**
 * AI 改写组件
 * 功能：对选中文本进行 AI 改写、续写、差异对比等功能
 * 描述：在选中文本的上一行显示图标，点击后显示菜单进行操作
 */

import * as monaco from 'monaco-editor';
import { aiService } from '../../../../services/ai/AIService';
import { getCachedModels, getModelConfig } from '../../../../services/ModelCacheService';
import { toastService } from '../../../../services/ToastService';
import { GhostTextWidget } from '../GhostTextWidget/GhostTextWidget';
import { CodeDecorationManager } from '../CodeDecorationManager/CodeDecorationManager';

interface AIRewriteWidgetOptions {
  onRewrite?: (originalText: string, rewrittenText: string) => void;
  onContinue?: (originalText: string, continuedText: string) => void;
  onDiff?: (originalText: string, rewrittenText: string) => void;
}

type ActionType = 'rewrite' | 'continue' | 'compress' | 'diff';

/**
 * 图标 ContentWidget
 */
class IconContentWidget implements monaco.editor.IContentWidget {
  private domNode: HTMLElement;
  private position: monaco.IPosition | null = null;

  constructor(private onClick: (event: MouseEvent) => void) {
    this.domNode = document.createElement('div');
    this.domNode.className = 'ai-rewrite-icon-widget';
    this.domNode.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="16" height="16" class="ai-rewrite-icon">
        <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm0 6l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25zm-7.5-5.5L9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zm-1.51 3.49L9 15.17l-.99-2.18L5.83 12l2.18-.99L9 8.83l.99 2.18l2.18.99l-2.18.99z" fill="currentColor"></path>
      </svg>
    `;
    this.domNode.style.cursor = 'pointer';
    this.domNode.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(e);
    });
  }

  getId(): string {
    return 'ai-rewrite-icon-widget';
  }

  getDomNode(): HTMLElement {
    return this.domNode;
  }

  getPosition(): monaco.editor.IContentWidgetPosition | null {
    if (!this.position) {
      return null;
    }
    return {
      position: this.position,
      preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
    };
  }

  setPosition(position: monaco.IPosition): void {
    this.position = position;
  }

  dispose(): void {
    this.domNode.remove();
  }
}

export class AIRewriteWidget {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private decorationIds: string[] = [];
  private menuElement: HTMLElement | null = null;
  private submenuElement: HTMLElement | null = null;
  private options: AIRewriteWidgetOptions;
  private selectionDisposable: monaco.IDisposable | null = null;
  private clickDisposable: monaco.IDisposable | null = null;
  private currentSelection: monaco.IRange | null = null;
  private ghostWidget: GhostTextWidget | null = null;
  private decorationManager: CodeDecorationManager | null = null;
  private isProcessing: boolean = false;
  private iconWidget: IconContentWidget | null = null;
  private iconDisplayLine: number | null = null; // 图标所在的行号
  private isMouseDown: boolean = false; // 是否正在鼠标按下状态
  private globalMouseUpHandler: ((e: MouseEvent) => void) | null = null; // 全局鼠标释放处理器
  private isClickingIcon: boolean = false; // 是否正在点击图标

  constructor(editor: monaco.editor.IStandaloneCodeEditor, options: AIRewriteWidgetOptions = {}) {
    this.editor = editor;
    this.options = options;
    this.decorationManager = new CodeDecorationManager(editor);
    this.init();
  }

  /**
   * 初始化
   */
  private init(): void {
    console.log('[AIRewriteWidget] 初始化开始');
    this.injectStyles();
    
    // 确保 glyph margin 已启用
    const glyphMarginEnabled = this.editor.getOption(monaco.editor.EditorOption.glyphMargin);
    if (!glyphMarginEnabled) {
      // 静默启用 glyph margin，不显示警告
      this.editor.updateOptions({
        glyphMargin: true
      });
    }
    
    this.setupSelectionListener();
    this.setupClickListener();
    console.log('[AIRewriteWidget] 初始化完成');
  }

  /**
   * 注入样式
   */
  private injectStyles(): void {
    if (document.getElementById('ai-rewrite-widget-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ai-rewrite-widget-styles';

    document.head.appendChild(style);
  }

  /**
   * 设置选择监听
   */
  private setupSelectionListener(): void {
    // 监听选择变化（主要用于键盘选择，鼠标选择时会在 mouseup 时处理）
    this.selectionDisposable = this.editor.onDidChangeCursorSelection((e) => {
      console.log('[AIRewriteWidget] 选择变化:', {
        selection: e.selection,
        isEmpty: e.selection.isEmpty(),
        isMouseDown: this.isMouseDown,
        isClickingIcon: this.isClickingIcon,
        text: e.selection.isEmpty() ? '' : this.editor.getModel()?.getValueInRange(e.selection)
      });
      
      // 如果正在点击图标，不更新图标位置（防止图标移动）
      if (this.isClickingIcon) {
        return;
      }
      
      // 如果正在鼠标按下状态（拖动选择），隐藏图标并等待鼠标释放
      if (this.isMouseDown) {
        this.hideIcon();
        return;
      }
      
      // 对于键盘选择或光标移动，延迟更新图标
      setTimeout(() => {
        this.updateIcon();
      }, 50);
    });
    
    // 监听光标位置变化（键盘移动光标时，且没有选中文本）
    this.editor.onDidChangeCursorPosition(() => {
      // 如果正在点击图标，不更新图标位置（防止图标移动）
      if (this.isClickingIcon) {
        return;
      }
      
      // 如果正在鼠标按下状态，隐藏图标
      if (this.isMouseDown) {
        this.hideIcon();
        return;
      }
      
      setTimeout(() => {
        this.updateIcon();
      }, 50);
    });
    
    // 监听鼠标释放事件，在释放后显示图标
    this.editor.onMouseUp(() => {
      this.isMouseDown = false;
      // 延迟清除点击图标标志，确保选择变化事件处理完成
      setTimeout(() => {
        this.isClickingIcon = false;
      }, 100);
      setTimeout(() => {
        this.updateIcon();
      }, 50);
    });
    
    // 添加全局鼠标释放监听器，处理在编辑器外部释放鼠标的情况
    this.globalMouseUpHandler = () => {
      if (this.isMouseDown) {
        this.isMouseDown = false;
        // 延迟清除点击图标标志，确保选择变化事件处理完成
        setTimeout(() => {
          this.isClickingIcon = false;
        }, 100);
        setTimeout(() => {
          this.updateIcon();
        }, 50);
      } else if (this.isClickingIcon) {
        // 如果只是点击图标，也清除标志
        setTimeout(() => {
          this.isClickingIcon = false;
        }, 100);
      }
    };
    document.addEventListener('mouseup', this.globalMouseUpHandler);
    
    // 初始化时也检查一次
    setTimeout(() => {
      this.updateIcon();
    }, 100);
  }

  /**
   * 设置点击监听
   */
  private setupClickListener(): void {
    this.clickDisposable = this.editor.onMouseDown((e) => {
      const target = e.target;
      
      // 先检查是否点击了图标，如果点击了图标，显示菜单并返回（不隐藏图标）
      let isClickingIcon = false;
      
      // 检查是否点击了 glyph margin
      if (target && (target as { type?: number }).type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const position = e.target.position;
        if (position) {
          // 检查点击的行号是否与图标所在行匹配，并且该行有我们的装饰图标
          // 如果点击的是 glyph margin 区域，并且行号匹配，就识别为点击图标
          // 这样可以防止点击图标右侧时触发行号的点击事件
          const isIconOnThisLine = this.iconDisplayLine !== null && 
                                   position.lineNumber === this.iconDisplayLine &&
                                   this.decorationIds.length > 0;
          
          console.log('[AIRewriteWidget] 点击 glyph margin:', {
            positionLineNumber: position.lineNumber,
            iconDisplayLine: this.iconDisplayLine,
            decorationIdsLength: this.decorationIds.length,
            isIconOnThisLine
          });
          
          if (isIconOnThisLine) {
            isClickingIcon = true;
            this.isClickingIcon = true; // 设置标志，防止选择变化时更新图标位置
            e.event.preventDefault();
            e.event.stopPropagation();
            console.log('[AIRewriteWidget] 检测到点击图标，显示菜单');
            this.showMenu(e.event.browserEvent);
            return; // 提前返回，避免执行后续逻辑
          }
        }
      }
      
      // 检查是否点击了行内图标
      if (!isClickingIcon && target && (target as { element?: HTMLElement }).element) {
        const element = (target as { element: HTMLElement }).element;
        if (element) {
          const clickedElement = e.event.browserEvent.target as HTMLElement;
          if (clickedElement && (clickedElement.classList.contains('ai-rewrite-icon') || clickedElement.closest('.ai-rewrite-icon'))) {
            isClickingIcon = true;
            this.isClickingIcon = true; // 设置标志，防止选择变化时更新图标位置
            e.event.preventDefault();
            e.event.stopPropagation();
            this.showMenu(e.event.browserEvent);
          }
        }
      }
      
      // 如果点击的不是图标，标记鼠标按下状态并隐藏图标（防止拖动选择时显示）
      if (!isClickingIcon) {
        this.isMouseDown = true;
        this.hideIcon();
      }
    });
  }

  /**
   * 更新图标显示
   */
  private updateIcon(): void {
    const selection = this.editor.getSelection();
    const model = this.editor.getModel();

    console.log('[AIRewriteWidget] updateIcon 被调用:', {
      hasModel: !!model,
      hasSelection: !!selection,
      isEmpty: selection?.isEmpty(),
      selection: selection
    });

    if (!model || !selection) {
      console.log('[AIRewriteWidget] 隐藏图标：没有模型或选择');
      this.hideIcon();
      return;
    }

    // 如果没有选择文本，使用当前光标位置
    if (selection.isEmpty()) {
      const cursorLine = selection.positionLineNumber;
      const cursorColumn = selection.positionColumn;
      
      // 检查当前行是否有内容
      const lineContent = model.getLineContent(cursorLine);
      const hasContent = lineContent.trim().length > 0;
      
      // 如果当前行是空行，不显示装饰图标
      if (!hasContent) {
        console.log('[AIRewriteWidget] 当前行是空行，隐藏图标');
        this.hideIcon();
        return;
      }
      
      // 在当前光标行的行号左侧显示图标（使用 glyph margin）
      this.currentSelection = new monaco.Range(cursorLine, 1, cursorLine, cursorColumn);
      
      // 移除旧的图标 widget
      if (this.iconWidget) {
        this.editor.removeContentWidget(this.iconWidget);
        this.iconWidget.dispose();
        this.iconWidget = null;
      }
      
      // 使用 glyph margin 装饰器在当前光标行显示图标
      const decorations: monaco.editor.IModelDeltaDecoration[] = [{
        range: new monaco.Range(cursorLine, 1, cursorLine, 1),
        options: {
          glyphMarginClassName: 'ai-rewrite-glyph',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }];
      
      // 先清除旧的装饰器
      this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
      // 应用新的装饰器
      this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
      this.iconDisplayLine = cursorLine;
      
      // 强制刷新编辑器布局，确保装饰器显示
      setTimeout(() => {
        this.editor.layout();
        // 再次检查装饰器是否正确应用
        const model = this.editor.getModel();
        if (model) {
          const lineDecorations = model.getLineDecorations(cursorLine);
          console.log('[AIRewriteWidget] 行装饰器:', lineDecorations);
        }
      }, 0);
      
      console.log('[AIRewriteWidget] 图标已显示在光标行:', {
        cursorLine,
        iconDisplayLine: this.iconDisplayLine,
        decorationIds: this.decorationIds,
        glyphMarginEnabled: this.editor.getOption(monaco.editor.EditorOption.glyphMargin),
        lineContent: lineContent
      });
      return;
    }

    this.currentSelection = selection;
    // 使用选中区域的起始行（startLineNumber）来显示图标，默认在上面的行显示
    const startLine = selection.startLineNumber;
    const prevLine = startLine - 1;
    const nextLine = startLine + 1;
    const totalLines = model.getLineCount();

    // 检查上一行是否有内容
    const prevLineContent = prevLine > 0 ? model.getLineContent(prevLine) : '';
    const prevLineHasContent = prevLineContent.trim().length > 0;

    // 检查下一行是否有内容
    const nextLineContent = nextLine <= totalLines ? model.getLineContent(nextLine) : '';
    const nextLineHasContent = nextLineContent.trim().length > 0;

    console.log('[AIRewriteWidget] 准备显示图标:', {
      startLine,
      prevLine,
      nextLine,
      prevLineHasContent,
      nextLineHasContent,
      selectedText: model.getValueInRange(selection).substring(0, 50)
    });

    // 移除旧的图标 widget
    if (this.iconWidget) {
      this.editor.removeContentWidget(this.iconWidget);
      this.iconWidget.dispose();
      this.iconWidget = null;
    }

    // 确定显示位置
    let displayLine: number;
    let displayColumn: number = 1;
    let useGlyphMargin = false;
    
    // 图标显示逻辑：
    // 1. 默认显示在上一行（选中区域的起始行的上一行）
    // 2. 如果上一行有内容，则在下一行显示图标
    // 3. 如果上下行都有内容，则在行号前面显示（glyph margin）
    
    if (prevLineHasContent && nextLineHasContent) {
      // 上下行都有内容，在行号区域显示（使用 glyph margin）
      displayLine = startLine;
      useGlyphMargin = true;
    } else if (prevLineHasContent) {
      // 上一行有内容，在下一行显示图标（使用 ContentWidget）
      displayLine = nextLine <= totalLines ? nextLine : startLine;
      useGlyphMargin = false;
    } else {
      // 上一行没有内容，在上一行显示图标（默认，使用 ContentWidget）
      displayLine = prevLine > 0 ? prevLine : startLine;
      useGlyphMargin = false;
    }
    
    if (useGlyphMargin) {
      // 使用 glyph margin 装饰器
      const decorations: monaco.editor.IModelDeltaDecoration[] = [{
        range: new monaco.Range(displayLine, 1, displayLine, 1),
        options: {
          glyphMarginClassName: 'ai-rewrite-glyph',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }];
      this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
      // 使用 glyph margin 时，图标在选中行
      this.iconDisplayLine = displayLine;
    } else {
      // 使用 ContentWidget
      displayColumn = 1;
      
      // 创建 ContentWidget
      this.iconWidget = new IconContentWidget((event: MouseEvent) => {
        this.showMenu(event);
      });
      
      this.iconWidget.setPosition({ lineNumber: displayLine, column: displayColumn });
      this.editor.addContentWidget(this.iconWidget);
      
      // 保存图标所在的行号
      this.iconDisplayLine = displayLine;
      
      // 清除装饰器
      this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
      
      // 强制编辑器重新布局，确保 ContentWidget 显示
      setTimeout(() => {
        this.editor.layout();
      }, 0);
    }
    
    console.log('[AIRewriteWidget] 图标已显示:', {
      displayLine,
      displayColumn,
      useGlyphMargin,
      prevLineHasContent,
      nextLineHasContent,
      startLine,
      iconDisplayLine: this.iconDisplayLine
    });
  }

  /**
   * 隐藏图标
   */
  private hideIcon(): void {
    // 移除装饰器
    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
    
    // 移除 ContentWidget
    if (this.iconWidget) {
      this.editor.removeContentWidget(this.iconWidget);
      this.iconWidget.dispose();
      this.iconWidget = null;
    }
    
    this.currentSelection = null;
    this.iconDisplayLine = null;
    this.hideMenu();
  }

  /**
   * 显示菜单
   */
  private showMenu(event: MouseEvent): void {
    if (this.isProcessing) {
      return;
    }

    console.log('[AIRewriteWidget] showMenu 被调用');

    // 保存当前的选中区域，确保点击菜单时能获取到选中的文本
    const selection = this.editor.getSelection();
    if (selection && !selection.isEmpty()) {
      this.currentSelection = selection;
      console.log('[AIRewriteWidget] 保存选中区域:', this.currentSelection);
    }

    this.hideMenu();

    const menu = document.createElement('div');
    menu.className = 'ai-rewrite-menu';
    
    // 计算菜单位置：显示在图标的右下方
    let menuX: number;
    let menuY: number;
    
    if (this.iconWidget) {
      // 使用 ContentWidget 的位置
      const domNode = this.iconWidget.getDomNode();
      const rect = domNode.getBoundingClientRect();
      // 菜单显示在图标右下方：图标右侧 + 偏移，图标底部 + 偏移
      menuX = rect.right - 20; // 在图标右侧，向左偏移 20px
      
      // 判断图标是否显示在上方（图标行号 < 选中区域的起始行号）
      const isIconAbove = this.iconDisplayLine !== null && 
                          this.currentSelection !== null && 
                          this.iconDisplayLine < this.currentSelection.startLineNumber;
      
      // 判断图标是否显示在下方（图标行号 > 选中区域的结束行号）
      const isIconBelow = this.iconDisplayLine !== null && 
                          this.currentSelection !== null && 
                          this.iconDisplayLine > this.currentSelection.endLineNumber;
      
      if (isIconAbove) {
        // 如果图标在上方，菜单距离图标一行的高度
        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        menuY = rect.bottom + lineHeight + 8; // 图标底部 + 一行高度 + 额外偏移 8px
      } else if (isIconBelow) {
        // 如果图标在下方，菜单向上紧凑一点
        menuY = rect.bottom + 4; // 在图标底部，向下偏移 4px（更紧凑）
      } else {
        // 如果图标在同一行，保持原有逻辑
        menuY = rect.bottom + 12; // 在图标底部，向下偏移 12px
      }
    } else if (this.iconDisplayLine !== null) {
      // 使用 glyph margin 的位置，根据图标所在行计算
      // 优先使用鼠标事件位置（更准确）
      if (event && event.clientX !== undefined && event.clientY !== undefined && event.clientX > 0 && event.clientY > 0) {
        // 使用鼠标点击位置，菜单显示在点击位置的右下方
        menuX = event.clientX + 4;
        menuY = event.clientY + 4;
      } else {
        // 如果没有鼠标事件，使用图标所在行的位置计算
        const editorDom = this.editor.getDomNode();
        if (editorDom) {
          const editorRect = editorDom.getBoundingClientRect();
          // 获取图标所在行的顶部位置
          const lineTop = this.editor.getTopForLineNumber(this.iconDisplayLine);
          // 获取行高
          const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
          // 获取 glyph margin 的宽度
          const glyphMarginWidth = this.editor.getOption(monaco.editor.EditorOption.glyphMargin) 
            ? this.editor.getLayoutInfo().glyphMarginWidth 
            : 0;
          // 图标在 glyph margin 中，大约在行中间位置
          // 菜单显示在图标右下方：行号区域右侧 + 偏移，行的中间位置（图标底部）+ 偏移
          menuX = editorRect.left + glyphMarginWidth - 20; // 行号区域右侧，向左偏移 20px
          menuY = editorRect.top + lineTop + lineHeight / 2 + 12; // 图标底部（行中间）向下偏移 12px
        } else {
          menuX = 100;
          menuY = 100;
        }
      }
    } else {
      // 最后的后备方案：使用鼠标事件或编辑器位置
      if (event && event.clientX !== undefined && event.clientY !== undefined && event.clientX > 0 && event.clientY > 0) {
        menuX = event.clientX + 4;
        menuY = event.clientY + 4; // 向下偏移 4px
      } else {
        const editorDom = this.editor.getDomNode();
        if (editorDom) {
          const rect = editorDom.getBoundingClientRect();
          menuX = rect.left + 100;
          menuY = rect.top + 100;
        } else {
          menuX = 100;
          menuY = 100;
        }
      }
    }
    
    // 使用 fixed 定位，相对于视口
    menu.style.position = 'fixed';
    menu.style.left = `${menuX}px`;
    menu.style.top = `${menuY}px`;

    const actions: Array<{ label: string; type: ActionType; icon?: string; submenu?: Array<{ label: string; value: number }> }> = [
      { 
        label: '改写', 
        type: 'rewrite',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="16" height="16"><path d="M20 7l.94-2.06L23 4l-2.06-.94L20 1l-.94 2.06L17 4l2.06.94zM8.5 7l.94-2.06L11.5 4l-2.06-.94L8.5 1l-.94 2.06L5.5 4l2.06.94zM20 12.5l-.94 2.06l-2.06.94l2.06.94l.94 2.06l.94-2.06L23 15.5l-2.06-.94zm-2.29-3.38l-2.83-2.83c-.2-.19-.45-.29-.71-.29c-.26 0-.51.1-.71.29L2.29 17.46a.996.996 0 0 0 0 1.41l2.83 2.83c.2.2.45.3.71.3s.51-.1.71-.29l11.17-11.17c.39-.39.39-1.03 0-1.42zm-3.54-.7l1.41 1.41L14.41 11L13 9.59l1.17-1.17zM5.83 19.59l-1.41-1.41L11.59 11L13 12.41l-7.17 7.18z" fill="currentColor"></path></svg>'
      },
      { 
        label: '续写', 
        type: 'continue',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" width="16" height="16"><path d="M28.828 3.172a4.094 4.094 0 0 0-5.656 0L4.05 22.292A6.954 6.954 0 0 0 2 27.242V30h2.756a6.952 6.952 0 0 0 4.95-2.05L28.828 8.829a3.999 3.999 0 0 0 0-5.657zM10.91 18.26l2.829 2.829l-2.122 2.121l-2.828-2.828zm-2.619 8.276A4.966 4.966 0 0 1 4.756 28H4v-.759a4.967 4.967 0 0 1 1.464-3.535l1.91-1.91l2.829 2.828zM27.415 7.414l-12.261 12.26l-2.829-2.828l12.262-12.26a2.047 2.047 0 0 1 2.828 0a2 2 0 0 1 0 2.828z" fill="currentColor"></path><path d="M6.5 15a3.5 3.5 0 0 1-2.475-5.974l3.5-3.5a1.502 1.502 0 0 0 0-2.121a1.537 1.537 0 0 0-2.121 0L3.415 5.394L2 3.98l1.99-1.988a3.585 3.585 0 0 1 4.95 0a3.504 3.504 0 0 1 0 4.949L5.439 10.44a1.502 1.502 0 0 0 0 2.121a1.537 1.537 0 0 0 2.122 0l4.024-4.024L13 9.95l-4.025 4.024A3.475 3.475 0 0 1 6.5 15z" fill="currentColor"></path></svg>'
      },
      { 
        label: '倍率压缩', 
        type: 'compress',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="16" height="16"><path d="M8 19h3v3h2v-3h3l-4-4l-4 4zm8-15h-3V1h-2v3H8l4 4l4-4zM4 9v2h16V9H4zm0 3h16v2H4z" fill="currentColor"></path></svg>',
        submenu: [
          { label: '0.3', value: 0.3 },
          { label: '0.5', value: 0.5 },
          { label: '0.8', value: 0.8 },
          { label: '1', value: 1 },
          { label: '1.2', value: 1.2 },
          { label: '1.5', value: 1.5 },
          { label: '1.7', value: 1.7 },
          { label: '1.8', value: 1.8 },
          { label: '2', value: 2 }
        ]
      },
      { 
        label: '差异对比', 
        type: 'diff',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 20 20" width="16" height="16"><g fill="none"><path d="M10 2.5a.5.5 0 0 0-1 0v15a.5.5 0 0 0 1 0v-15zM4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4v-1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4V4H4zm7 0v1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4v1h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4z" fill="currentColor"></path></g></svg>'
      }
    ];

    actions.forEach((action) => {
      const item = document.createElement('div');
      item.className = 'ai-rewrite-menu-item';
      
      // 如果有图标，先添加图标
      if (action.icon) {
        const iconContainer = document.createElement('span');
        iconContainer.className = 'ai-rewrite-menu-item-icon';
        iconContainer.innerHTML = action.icon;
        item.appendChild(iconContainer);
      }
      
      const labelSpan = document.createElement('span');
      labelSpan.textContent = action.label;
      item.appendChild(labelSpan);
      
      // 如果有子菜单，添加箭头图标并处理鼠标悬停
      if (action.submenu) {
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'ai-rewrite-menu-item-arrow';
        arrowSpan.innerHTML = '▶';
        arrowSpan.style.marginLeft = 'auto';
        arrowSpan.style.fontSize = '10px';
        arrowSpan.style.opacity = '0.6';
        item.appendChild(arrowSpan);
        
        item.addEventListener('mouseenter', () => {
          this.showSubmenu(item, action.submenu!, menuX, menuY);
        });
        
        item.addEventListener('mouseleave', (e) => {
          // 延迟隐藏，给子菜单时间接收鼠标事件
          setTimeout(() => {
            if (this.submenuElement && !this.submenuElement.matches(':hover') && !item.matches(':hover')) {
              this.hideSubmenu();
            }
          }, 100);
        });
      } else {
        // 使用 mousedown 事件，在捕获阶段处理，确保在 closeMenu 之前触发
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[AIRewriteWidget] 菜单项被点击:', action.type, action.label);
          console.log('[AIRewriteWidget] 当前选中区域:', this.currentSelection);
          // 立即执行，不延迟
          this.handleAction(action.type);
          this.hideMenu();
        }, true); // 使用捕获阶段，确保在 closeMenu 之前处理
      }
      
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    this.menuElement = menu;
    
    // 为装饰图标添加 menu-active 类，保持高亮
    this.setIconActive(true);
    
    console.log('[AIRewriteWidget] 菜单已创建并添加到 DOM:', {
      menuX,
      menuY,
      menuElement: menu,
      menuStyle: menu.style.cssText
    });

    // 调整菜单位置，防止超出视口
    setTimeout(() => {
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = menuX;
      let adjustedY = menuY;

      // 检查右边界
      if (menuX + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // 检查底部边界
      if (menuY + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      // 确保不超出左边界和顶部边界
      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);

      if (adjustedX !== menuX || adjustedY !== menuY) {
        menu.style.left = `${adjustedX}px`;
        menu.style.top = `${adjustedY}px`;
      }
    }, 0);

    // 点击外部关闭菜单
    const closeMenu = (e: MouseEvent) => {
      if (!menu) {
        return;
      }
      
      const target = e.target as HTMLElement;
      
      // 检查点击的是否是菜单本身或子菜单
      if (menu.contains(target) || (this.submenuElement && this.submenuElement.contains(target))) {
        console.log('[AIRewriteWidget] 点击菜单内部，不关闭');
        return;
      }
      
      // 检查点击的是否是图标或图标相关的元素
      const isClickingIcon = target && (
        target.classList.contains('ai-rewrite-glyph') ||
        target.closest('.ai-rewrite-glyph') !== null ||
        target.classList.contains('ai-rewrite-icon') ||
        target.closest('.ai-rewrite-icon') !== null ||
        target.closest('.ai-rewrite-icon-widget') !== null
      );
      
      if (isClickingIcon) {
        console.log('[AIRewriteWidget] 点击图标，不关闭菜单');
        return;
      }
      
      console.log('[AIRewriteWidget] 点击外部，关闭菜单');
      // 点击外部，关闭菜单
      this.hideMenu();
      document.removeEventListener('mousedown', closeMenu, true);
    };
    
    // 延迟添加监听器，确保点击事件已经处理完成
    // 使用较长的延迟，避免点击图标的事件立即触发关闭
    // 使用 mousedown 事件而不是 click 事件，避免与点击图标的事件冲突
    setTimeout(() => {
      document.addEventListener('mousedown', closeMenu, true); // 使用捕获阶段和 mousedown
    }, 200);
  }

  /**
   * 隐藏菜单
   */
  private hideMenu(): void {
    if (this.menuElement) {
      this.menuElement.remove();
      this.menuElement = null;
    }
    this.hideSubmenu();
    // 移除装饰图标的 menu-active 类
    this.setIconActive(false);
    // 清除点击图标标志
    setTimeout(() => {
      this.isClickingIcon = false;
    }, 100);
  }

  /**
   * 显示子菜单
   */
  private showSubmenu(parentItem: HTMLElement, submenuItems: Array<{ label: string; value: number }>, menuX: number, menuY: number): void {
    this.hideSubmenu();
    
    const submenu = document.createElement('div');
    submenu.className = 'ai-rewrite-submenu';
    
    const parentRect = parentItem.getBoundingClientRect();
    const submenuX = parentRect.right + 4;
    const submenuY = parentRect.top;
    
    submenu.style.position = 'fixed';
    submenu.style.left = `${submenuX}px`;
    submenu.style.top = `${submenuY}px`;
    
    submenuItems.forEach((subItem) => {
      const item = document.createElement('div');
      item.className = 'ai-rewrite-submenu-item';
      item.textContent = subItem.label;
      
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleAction('compress', subItem.value);
        this.hideMenu();
      });
      
      submenu.appendChild(item);
    });
    
    // 子菜单鼠标事件处理
    submenu.addEventListener('mouseenter', () => {
      // 鼠标移入子菜单时，保持显示
    });
    
    submenu.addEventListener('mouseleave', () => {
      // 鼠标离开子菜单时，延迟隐藏
      setTimeout(() => {
        if (!parentItem.matches(':hover')) {
          this.hideSubmenu();
        }
      }, 100);
    });
    
    document.body.appendChild(submenu);
    this.submenuElement = submenu;
    
    // 调整子菜单位置，防止超出视口
    setTimeout(() => {
      const rect = submenu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let adjustedX = submenuX;
      let adjustedY = submenuY;
      
      // 检查右边界
      if (submenuX + rect.width > viewportWidth) {
        adjustedX = parentRect.left - rect.width - 4;
      }
      
      // 检查底部边界
      if (submenuY + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }
      
      // 确保不超出左边界和顶部边界
      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);
      
      if (adjustedX !== submenuX || adjustedY !== submenuY) {
        submenu.style.left = `${adjustedX}px`;
        submenu.style.top = `${adjustedY}px`;
      }
    }, 0);
  }

  /**
   * 隐藏子菜单
   */
  private hideSubmenu(): void {
    if (this.submenuElement) {
      this.submenuElement.remove();
      this.submenuElement = null;
    }
  }

  /**
   * 设置图标激活状态（菜单显示时高亮）
   */
  private setIconActive(active: boolean): void {
    // 处理 ContentWidget 图标
    if (this.iconWidget) {
      const domNode = this.iconWidget.getDomNode();
      const iconElement = domNode.querySelector('.ai-rewrite-icon');
      if (iconElement) {
        if (active) {
          iconElement.classList.add('menu-active');
        } else {
          iconElement.classList.remove('menu-active');
        }
      }
    }

    // 处理 glyph margin 装饰图标
    const editorDom = this.editor.getDomNode();
    if (editorDom) {
      // 查找所有包含 ai-rewrite-glyph 类的元素
      const glyphElements = editorDom.querySelectorAll('.ai-rewrite-glyph');
      glyphElements.forEach((element) => {
        if (active) {
          element.classList.add('menu-active');
        } else {
          element.classList.remove('menu-active');
        }
      });
    }
  }

  /**
   * 处理操作
   */
  private async handleAction(actionType: ActionType, compressRatio?: number): Promise<void> {
    console.log('[AIRewriteWidget] ========== handleAction 被调用 ==========');
    console.log('[AIRewriteWidget] actionType:', actionType);
    console.log('[AIRewriteWidget] currentSelection:', this.currentSelection);
    
    const model = this.editor.getModel();
    if (!model) {
      console.warn('[AIRewriteWidget] 编辑器模型不存在');
      return;
    }

    // 获取编辑器当前的选中状态（确保使用最新的状态）
    const editorSelection = this.editor.getSelection();
    
    // 判断是否有选中文本
    const hasSelection = editorSelection && !editorSelection.isEmpty();
    
    if (hasSelection) {
      // 情况2：用户选中了文本，使用用户选中的范围
      this.currentSelection = editorSelection;
      console.log('[AIRewriteWidget] 使用用户选中的文本范围:', this.currentSelection);
    } else {
      // 情况1：没有选中文本，默认选中当前光标所在行的整行内容
      const position = this.editor.getPosition();
      if (position) {
        const cursorLine = position.lineNumber;
        const lineContent = model.getLineContent(cursorLine);
        
        // 如果当前行有文本，选中整行（从第1列到行尾）
        if (lineContent.trim().length > 0) {
          const lineLength = model.getLineLength(cursorLine);
          this.currentSelection = new monaco.Range(
            cursorLine,
            1,
            cursorLine,
            lineLength + 1
          );
          // 更新编辑器中的选中状态
          this.editor.setSelection(this.currentSelection);
          console.log('[AIRewriteWidget] 没有选中文本，默认选中当前行（整行）:', {
            line: cursorLine,
            startColumn: 1,
            endColumn: lineLength + 1,
            range: this.currentSelection
          });
        } else {
          console.warn('[AIRewriteWidget] 当前行没有文本，无法执行操作');
          toastService.error('当前行没有文本');
          return;
        }
      } else {
        console.warn('[AIRewriteWidget] 无法获取光标位置，无法执行操作');
        toastService.error('无法获取光标位置');
        return;
      }
    }

    let selectedText = model.getValueInRange(this.currentSelection);
    
    // 如果选中文本为空，使用当前行的文本
    if (!selectedText.trim()) {
      const cursorLine = this.currentSelection.startLineNumber;
      selectedText = model.getLineContent(cursorLine);
      
      // 如果当前行也没有文本，显示错误
      if (!selectedText.trim()) {
        toastService.error('当前行没有文本');
        return;
      }
      
      // 更新选择范围为当前行
      this.currentSelection = new monaco.Range(
        cursorLine,
        1,
        cursorLine,
        model.getLineLength(cursorLine) + 1
      );
      // 更新编辑器中的选中状态
      this.editor.setSelection(this.currentSelection);
    }

    // 如果是改写操作，在装饰图标上一行显示内联聊天
    if (actionType === 'rewrite') {
      this.hideMenu();
      
      try {
        // 保存当前选中区域，用于恢复背景色高亮
        // 如果没有选中文本，确保是整行范围（从第1列到行尾）
        let savedSelection: monaco.Range;
        const editorSelection = this.editor.getSelection();
        const hasSelection = editorSelection && !editorSelection.isEmpty();
        
        if (!hasSelection) {
          // 情况1：没有选中文本，确保是整行范围
          const selectionLine = this.currentSelection.startLineNumber;
          const lineLength = model.getLineLength(selectionLine);
          savedSelection = new monaco.Range(
            selectionLine,
            1,
            selectionLine,
            lineLength + 1
          );
          console.log('[AIRewriteWidget] 没有选中文本，保存整行范围用于恢复:', savedSelection);
        } else {
          // 情况2：用户选中了文本，保持用户选中的范围
          savedSelection = new monaco.Range(
            this.currentSelection.startLineNumber,
            this.currentSelection.startColumn,
            this.currentSelection.endLineNumber,
            this.currentSelection.endColumn
          );
          console.log('[AIRewriteWidget] 用户选中了文本，保存选中范围用于恢复:', savedSelection);
        }
        
        // 先清除旧的高亮装饰（如果存在）
        if (this.decorationManager) {
          this.decorationManager.removeDecoration('rewrite-selection');
        }
        
        // 使用 CodeDecorationManager 高亮显示选中的文本，保持背景色
        if (savedSelection && this.decorationManager) {
          this.decorationManager.highlightSelection(savedSelection, 'rewrite-selection');
        }
        
        // 保存选中文本的内容，用于发送消息时包含
        const selectedTextContent = model.getValueInRange(savedSelection);
        console.log('[AIRewriteWidget] 保存选中文本内容用于发送消息:', selectedTextContent);
        
        // 为了不让选中文本显示到输入框中，需要临时清除选中状态
        // 但需要先保存位置信息，用于确定内联聊天的显示位置
        const endLine = savedSelection.endLineNumber;
        const endColumn = savedSelection.endColumn;
        
        // 将光标移动到选中内容的结束位置（下一行），并清除选中状态
        // 这样 handleOpenInlineChat 不会检测到选中内容，也就不会传递 selectedText
        const targetLine = endLine + 1; // 显示在选中内容的下方
        const totalLines = model.getLineCount();
        const finalLine = Math.min(totalLines, targetLine);
        const finalColumn = model.getLineLength(finalLine) + 1;
        
        // 清除选中状态，将光标移动到目标位置
        this.editor.setPosition({ lineNumber: finalLine, column: finalColumn });
        this.editor.setSelection(new monaco.Range(finalLine, finalColumn, finalLine, finalColumn));
        this.editor.revealLineInCenter(finalLine);
        
        // 直接调用打开内联聊天的方法
        const openInlineChat = (window as unknown as { __openInlineChat?: () => void | Promise<void> }).__openInlineChat;
        const aiZoneWidgetRef = (window as any).__aiZoneWidgetRef;
        
        if (openInlineChat) {
          console.log('[AIRewriteWidget] 调用打开内联聊天方法');
          // 调用打开内联聊天的方法（可能是异步的）
          const result = openInlineChat();
          
          // 设置选中文本的函数
          const setSelectedText = () => {
            if (aiZoneWidgetRef?.current && selectedTextContent) {
              // 直接设置 AIZoneWidget 的选中文本和 includeSelection
              (aiZoneWidgetRef.current as any).selectedText = selectedTextContent;
              (aiZoneWidgetRef.current as any).includeSelection = true;
              console.log('[AIRewriteWidget] 已设置选中文本到 AIZoneWidget:', selectedTextContent);
            }
          };
          
          // 如果返回 Promise，等待完成后再恢复选中状态和设置选中文本
          if (result instanceof Promise) {
            result.then(() => {
              // 延迟恢复选中状态和设置选中文本，确保内联聊天已完全创建
              setTimeout(() => {
                // 先清除改写菜单的高亮装饰，让内联聊天的监听器来处理高亮
                if (this.decorationManager) {
                  this.decorationManager.removeDecoration('rewrite-selection');
                }
                
                // 设置选中文本，用于发送消息时包含
                setSelectedText();
                
                // 恢复选中状态，用于高亮显示（使用保存的选中范围，保持用户选中的部分文本）
                // 这会触发内联聊天的监听器，使用 inline-chat-selection 来高亮
                if (savedSelection) {
                  console.log('[AIRewriteWidget] 恢复选中状态:', savedSelection);
                  this.editor.setSelection(savedSelection);
                  console.log('[AIRewriteWidget] 已恢复选中状态');
                }
              }, 200);
            }).catch((error) => {
              console.error('[AIRewriteWidget] 打开内联聊天失败:', error);
              toastService.error('打开内联聊天失败');
              // 即使失败也恢复选中状态
              if (savedSelection) {
                this.editor.setSelection(savedSelection);
              }
            });
          } else {
            // 同步调用，延迟恢复选中状态和设置选中文本，确保内联聊天已创建
            setTimeout(() => {
              // 先清除改写菜单的高亮装饰，让内联聊天的监听器来处理高亮
              if (this.decorationManager) {
                this.decorationManager.removeDecoration('rewrite-selection');
              }
              
              // 设置选中文本，用于发送消息时包含
              setSelectedText();
              
              // 恢复选中状态，用于高亮显示（使用保存的选中范围，保持用户选中的部分文本）
              // 这会触发内联聊天的监听器，使用 inline-chat-selection 来高亮
              if (savedSelection) {
                console.log('[AIRewriteWidget] 同步调用后恢复选中状态:', savedSelection);
                this.editor.setSelection(savedSelection);
                console.log('[AIRewriteWidget] 已恢复选中状态');
              }
            }, 200);
          }
          // 不设置任何提示文本，让用户自己输入
        } else {
          console.warn('[AIRewriteWidget] 没有找到打开内联聊天的方法');
          toastService.error('无法打开内联聊天：方法未找到');
          // 恢复选中状态
          if (savedSelection) {
            this.editor.setSelection(savedSelection);
          }
        }
      } catch (error) {
        console.error('[AIRewriteWidget] 处理改写操作时发生错误:', error);
        toastService.error('处理改写操作失败');
      }
      
      return;
    }

    this.isProcessing = true;
    this.hideIcon();

    try {
      // 获取默认模型
      const models = await getCachedModels();
      if (!models || models.length === 0) {
        toastService.error('没有可用的 AI 模型');
        this.isProcessing = false;
        return;
      }

      const defaultModel = models[0].modelId;
      const modelConfig = await getModelConfig(defaultModel);

      let prompt = '';
      switch (actionType) {
        case 'continue':
          prompt = `请续写以下文本：\n\n${selectedText}`;
          break;
        case 'compress':
          const ratio = compressRatio !== undefined ? compressRatio : 1;
          if (ratio < 1) {
            // 压缩：减少到原长度的 ratio 倍
            prompt = `请压缩以下文本到原长度的 ${(ratio * 100).toFixed(0)}%，保持核心信息不变：\n\n${selectedText}`;
          } else if (ratio > 1) {
            // 扩展：增加到原长度的 ratio 倍
            prompt = `请扩展以下文本到原长度的 ${(ratio * 100).toFixed(0)}%，保持原意并丰富内容：\n\n${selectedText}`;
          } else {
            // 保持原长度
            prompt = `请改写以下文本，保持原长度和核心信息不变：\n\n${selectedText}`;
          }
          break;
        case 'diff':
          prompt = `请改写以下文本，使其更加清晰、准确：\n\n${selectedText}`;
          break;
      }

      const messages = [
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      let accumulatedText = '';

      // 创建 Ghost Widget 用于显示结果
      if (this.ghostWidget) {
        this.ghostWidget.dispose();
      }
      
      this.ghostWidget = new GhostTextWidget(this.editor, {
        onAccept: (text: string) => {
          this.replaceSelection(text);
          if (actionType === 'continue' && this.options.onContinue) {
            this.options.onContinue(selectedText, text);
          } else if (actionType === 'diff' && this.options.onDiff) {
            this.options.onDiff(selectedText, text);
          } else if (actionType === 'compress' && this.options.onDiff) {
            // 倍率压缩使用 onDiff 回调，因为都是改写类操作
            this.options.onDiff(selectedText, text);
          }
        },
        onReject: () => {
          // 拒绝时不做任何操作
        }
      });

      // 获取插入位置
      const insertLine = this.currentSelection.endLineNumber;
      const insertColumn = model.getLineMaxColumn(insertLine);

      // 调用 AI 服务
      await aiService.generateTextStream(
        {
          model: defaultModel,
          messages,
          temperature: modelConfig?.temperature || 0.7,
          maxTokens: modelConfig?.maxTokens || 2000
        },
        {
          onContent: (chunk: string) => {
            accumulatedText += chunk;
            if (this.ghostWidget) {
              const position: monaco.IPosition = {
                lineNumber: insertLine,
                column: insertColumn
              };
              this.ghostWidget.show(position, accumulatedText);
            }
          },
          onReasoning: () => {
            // 忽略推理过程
          }
        }
      );

      // 差异对比和倍率压缩功能：GhostTextWidget 已经显示了改写后的文本，用户可以看到差异
      // 当用户接受时，会调用 onAccept 回调，在那里我们已经处理了替换
      if ((actionType === 'diff' || actionType === 'compress') && accumulatedText && this.options.onDiff) {
        this.options.onDiff(selectedText, accumulatedText);
      }
    } catch (error) {
      console.error('[AIRewriteWidget] AI 处理失败:', error);
      toastService.error('AI 处理失败，请稍后重试');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 替换选中文本
   */
  private replaceSelection(text: string): void {
    if (!this.currentSelection) {
      return;
    }

    this.editor.executeEdits('ai-rewrite', [
      {
        range: this.currentSelection,
        text: text
      }
    ]);

    // 清除 Ghost Widget
    if (this.ghostWidget) {
      this.ghostWidget.dispose();
      this.ghostWidget = null;
    }
  }


  /**
   * 清除改写操作的高亮装饰
   */
  public clearRewriteHighlight(): void {
    if (this.decorationManager) {
      this.decorationManager.removeDecoration('rewrite-selection');
      console.log('[AIRewriteWidget] 已清除改写操作的高亮装饰');
    }
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.hideIcon();
    this.hideMenu();
    
    // 清除改写操作的高亮装饰
    this.clearRewriteHighlight();
    
    if (this.selectionDisposable) {
      this.selectionDisposable.dispose();
      this.selectionDisposable = null;
    }

    if (this.clickDisposable) {
      this.clickDisposable.dispose();
      this.clickDisposable = null;
    }

    if (this.ghostWidget) {
      this.ghostWidget.dispose();
      this.ghostWidget = null;
    }

    if (this.iconWidget) {
      this.editor.removeContentWidget(this.iconWidget);
      this.iconWidget.dispose();
      this.iconWidget = null;
    }

    if (this.decorationManager) {
      this.decorationManager.dispose();
      this.decorationManager = null;
    }

    // 移除全局鼠标释放监听器
    if (this.globalMouseUpHandler) {
      document.removeEventListener('mouseup', this.globalMouseUpHandler);
      this.globalMouseUpHandler = null;
    }
  }
}

