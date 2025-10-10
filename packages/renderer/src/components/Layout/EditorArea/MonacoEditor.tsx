/**
 * Monaco 编辑器封装组件
 * 功能：集成 Monaco 编辑器和快捷键支持
 * 描述：支持代码编辑、主题切换、快捷键操作（如 Ctrl+S 保存）
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { VSCodeCommandCenter, ThemeCommandProvider } from '../../../command-center';
import '../../../command-center/VSCodeCommandCenter.scss';
import { MonacoContextMenu } from './MonacoContextMenu';
import { useMonacoContextMenu } from './useMonacoContextMenu';
import './MonacoContextMenu.scss';
import './MonacoEditor.scss';
import { AIZoneWidget } from './AIZoneWidget';
import { GhostTextWidget } from './GhostTextWidget';
import { CodeDecorationManager } from './CodeDecorationManager';
import { builtinAI } from '../../../services/BuiltinAIService';

interface MonacoEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  tabId?: string;  // 当前标签页 ID
  tabTitle?: string;  // 当前标签页标题
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language = 'markdown',
  onChange,
  tabId,
  tabTitle
}) => {
  const [currentTheme, setCurrentTheme] = useState<string>('vs-dark');
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [pendingTheme, setPendingTheme] = useState<any>(null);
  const [isEditorReady, setIsEditorReady] = useState<boolean>(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const commandCenterRef = useRef<VSCodeCommandCenter | null>(null);
  const themeProviderRef = useRef<ThemeCommandProvider | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ⭐ AI 功能相关
  const aiZoneWidgetRef = useRef<AIZoneWidget | null>(null);
  const ghostTextRef = useRef<GhostTextWidget | null>(null);
  const decorationManagerRef = useRef<CodeDecorationManager | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // 🔧 调试：打印组件渲染信息
  console.log('[MonacoEditor] Rendering with:', {
    tabId,
    tabTitle,
    language,
    contentLength: value?.length || 0,
    contentPreview: value?.substring(0, 50)
  });

  // ⭐ 从内置AI服务加载真实的模型列表（与用户AI配置完全独立）
  useEffect(() => {
    const loadAvailableModels = async () => {
      try {
        const models = await builtinAI.getModels();
        
        if (models.length > 0) {
          setAvailableModels(models);
        } else {
          setAvailableModels([]);
        }
      } catch (error) {
        setAvailableModels([]);
      }
    };

    loadAvailableModels();
  }, []);

  // ⭐ 处理内联聊天消息发送
  const handleSendInlineChatMessage = useCallback(async (
    message: string, 
    includeSelection: boolean, 
    selectedModel?: string
  ) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) return;

    // 不关闭 Zone Widget，保持面板打开
    // if (aiZoneWidgetRef.current) {
    //   aiZoneWidgetRef.current.dispose();
    //   aiZoneWidgetRef.current = null;
    // }

    // 获取选中的文本（如果需要包含）
    let selectedText = '';
    if (includeSelection) {
      const selection = editor.getSelection();
      if (selection) {
        selectedText = editor.getModel()?.getValueInRange(selection) || '';
      }
    }

    // 准备系统提示
    const systemPrompt = `你是一个专业的编程助手。
当前文件: ${tabTitle || '未命名'}
语言: ${language || 'markdown'}

请根据用户的要求生成代码。只返回代码本身，不要包含任何额外的解释、markdown代码块标记或其他文本。`;

    try {
      // 初始化 Ghost Text Widget
      if (!ghostTextRef.current && editorRef.current) {
        ghostTextRef.current = new GhostTextWidget(editorRef.current);
      }

      let accumulatedCode = '';
      let isFirstChunk = true;
      
      // 使用流式API调用
      const modelToUse = selectedModel || availableModels[0] || 'OpenAI:gpt-4o';

      await builtinAI.streamGenerateCode(
        modelToUse,
        message,
        {
          onChunk: (chunk: string) => {
            // 收到第一个 chunk 时，通知 AIZoneWidget 显示用户问题
            if (isFirstChunk) {
              isFirstChunk = false;
              aiZoneWidgetRef.current?.onAIResponseStart();
            }

            // 累积代码
            accumulatedCode += chunk;
            
            // 实时更新 Ghost Text
            ghostTextRef.current?.show(position, accumulatedCode);
          },
          onComplete: () => {
            // 通知 AIZoneWidget 回复完成
            aiZoneWidgetRef.current?.onAIResponseComplete();

            // 最终显示完整代码
            if (accumulatedCode.trim()) {
              ghostTextRef.current?.show(position, accumulatedCode);
            } else {
              ghostTextRef.current?.hide();
            }
          },
          onError: (error: string) => {
            // 显示错误信息
            const errorMessage = `// ❌ AI 生成失败\n// 错误: ${error}\n`;
            ghostTextRef.current?.show(position, errorMessage);
            
            // 3秒后自动隐藏错误信息
            setTimeout(() => {
              ghostTextRef.current?.hide();
            }, 3000);
          }
        },
        selectedText || undefined,
        systemPrompt
      );
    } catch (error) {
      // 显示错误信息
      const errorMessage = `// ❌ 调用 AI 服务失败\n// ${String(error)}\n`;
      if (!ghostTextRef.current && editorRef.current) {
        ghostTextRef.current = new GhostTextWidget(editorRef.current);
      }
      ghostTextRef.current?.show(position, errorMessage);
      
      // 3秒后自动隐藏错误信息
      setTimeout(() => {
        ghostTextRef.current?.hide();
      }, 3000);
    }
  }, [tabId, tabTitle, language, availableModels]);

  // ⭐ 打开内联聊天
  const handleOpenInlineChat = useCallback(() => {
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

    // 如果已存在 Zone Widget，先销毁
    if (aiZoneWidgetRef.current) {
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
  }, [handleSendInlineChatMessage, availableModels]);

  // ⭐ 右键菜单
  const contextMenu = useMonacoContextMenu({
    editor: editorRef.current,
    onOpenInlineChat: handleOpenInlineChat
  });

  const handleEditorChange = (value: string | undefined) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  };

  // Monaco 编辑器挂载时
  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    console.log('[MonacoEditor] Editor mounted for tab:', tabId, 'Content length:', value?.length || 0);
    console.log('[MonacoEditor] Content preview:', value?.substring(0, 100));
    
    editorRef.current = editor;
    setMonacoInstance(monaco);
    setIsEditorReady(true);

    // 🔧 强制编辑器重新布局
    setTimeout(() => {
      editor.layout();
    }, 100);

    // 将编辑器实例暴露到全局，供 MarkdownCommandProvider 等使用
    (window as any).__monacoEditor = editor;
    (window as any).__currentTabId = tabId;
    (window as any).__currentTabTitle = tabTitle;

    // 禁用编辑器内置的 F1 命令面板，并转发到全局命令中心
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('keydown', (e: KeyboardEvent) => {
        // 拦截 F1 键
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
      themeProviderRef.current = new ThemeCommandProvider(commandCenterRef.current);
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

    // ⭐ 注册 Ctrl+I 打开内联聊天快捷键
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      () => {
        handleOpenInlineChat();
      }
    );

    // 注册编辑器内的 Ctrl+K Ctrl+T 快捷键 - 主题选择
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
  };

  // 辅助函数：验证并清理颜色值（Monaco Editor 要求 6 位或 8 位十六进制）
  const sanitizeColor = (color: string | undefined): string | undefined => {
    if (!color || typeof color !== 'string') return undefined;
    const cleaned = color.trim().replace(/^#/, '');
    
    // 3 位十六进制：扩展为 6 位（如 fff -> ffffff）
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
    try{
        // 定义并注册主题到 Monaco Editor
        const themeId = `custom-${themeData.id}`;
        
        // 将 VS Code 主题转换为 Monaco 主题格式
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

        // 构建颜色对象，过滤掉 undefined 值
        const colors: Record<string, string> = {};
        
        // 添加必需的颜色（带默认值）
        colors['editor.background'] = normalizeColorWithHash(themeData.colors?.['editor.background'], themeData.type === 'light' ? '#ffffff' : '#1e1e1e');
        colors['editor.foreground'] = normalizeColorWithHash(themeData.colors?.['editor.foreground'], themeData.type === 'light' ? '#000000' : '#d4d4d4');
        colors['editorLineNumber.foreground'] = normalizeColorWithHash(themeData.colors?.['editorLineNumber.foreground'], '#858585');
        colors['editorCursor.foreground'] = normalizeColorWithHash(themeData.colors?.['editorCursor.foreground'], '#007acc');
        colors['editor.selectionBackground'] = normalizeColorWithHash(themeData.colors?.['editor.selectionBackground'], '#264f78');
        
        // 添加可选颜色（仅在存在时添加）
        if (themeData.colors?.['editor.lineHighlightBackground']) {
          colors['editor.lineHighlightBackground'] = normalizeColorWithHash(themeData.colors['editor.lineHighlightBackground']);
        }
        if (themeData.colors?.['editorWhitespace.foreground']) {
          colors['editorWhitespace.foreground'] = normalizeColorWithHash(themeData.colors['editorWhitespace.foreground']);
        }
        if (themeData.colors?.['editorIndentGuide.background']) {
          colors['editorIndentGuide.background'] = normalizeColorWithHash(themeData.colors['editorIndentGuide.background']);
        }
        if (themeData.colors?.['editorIndentGuide.activeBackground']) {
          colors['editorIndentGuide.activeBackground'] = normalizeColorWithHash(themeData.colors['editorIndentGuide.activeBackground']);
        }

        const monacoTheme: monaco.editor.IStandaloneThemeData = {
          base: themeData.type === 'light' ? 'vs' : 'vs-dark',
          inherit: true,
          rules,
          colors
        };

        monaco.editor.defineTheme(themeId, monacoTheme);
        monaco.editor.setTheme(themeId);
        setCurrentTheme(themeId);
      } catch (error) {
        // 主题应用失败，静默处理
      }
  };

  // 当 Monaco 实例准备好后，应用等待中的主题
  useEffect(() => {
    if (monacoInstance && pendingTheme) {
      applyThemeToMonaco(pendingTheme, monacoInstance);
      setPendingTheme(null);
    }
  }, [monacoInstance, pendingTheme]);

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
    window.electron?.ipcRenderer.on('theme:changed', handleThemeChange);

    // 获取当前主题
    window.electron?.ipcRenderer.invoke('theme:current').then((response) => {
      if (response?.success && response.data) {
        handleThemeChange(null, response.data);
      }
    }).catch((error: any) => {
      // 获取主题失败，静默处理
    });

    return () => {
      window.electron?.ipcRenderer.removeListener('theme:changed', handleThemeChange);
    };
  }, [monacoInstance]);

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

  // 组件卸载时清理
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

  // ⭐ 监听 Monaco 编辑器的右键菜单事件
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

    console.log('[MonacoEditor] ✅ Monaco context menu listener attached');

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
        onMount={handleEditorDidMount}
        loading={<div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: 'var(--vscode-editor-foreground, #cccccc)',
          backgroundColor: 'var(--vscode-editor-background)'
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
          // 禁用编辑器 F1 命令面板
          quickSuggestionsDelay: 100
        }}
      />
      
      {/* ⭐ 自定义右键菜单 */}
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
