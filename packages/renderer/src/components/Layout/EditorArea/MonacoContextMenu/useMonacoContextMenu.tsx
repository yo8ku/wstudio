/**
 * Monaco 编辑器右键菜单Hook
 * 功能：管理右键菜单的状态和菜单项
 * 描述：提供可扩展的菜单项配置和管理机制
 */

import { useState, useCallback, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import type { MenuItem, MenuGroup } from './MonacoContextMenu';

export interface UseMonacoContextMenuOptions {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  onOpenInlineChat?: () => void;
  onUploadToKnowledgeBase?: () => void;
  tabId?: string;
  tabTitle?: string;
}

export const useMonacoContextMenu = (options: UseMonacoContextMenuOptions) => {
  const { editor, onOpenInlineChat, onUploadToKnowledgeBase, tabId, tabTitle } = options;
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // 剪切
  const handleCut = useCallback(() => {
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return;

    const model = editor.getModel();
    if (!model) return;

    const text = model.getValueInRange(selection);
    navigator.clipboard.writeText(text);
    editor.executeEdits('context-menu', [{
      range: selection,
      text: ''
    }]);
    editor.focus();
  }, [editor]);

  // 复制
  const handleCopy = useCallback(() => {
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return;

    const model = editor.getModel();
    if (!model) return;

    const text = model.getValueInRange(selection);
    navigator.clipboard.writeText(text);
    editor.focus();
  }, [editor]);

  // 粘贴
  const handlePaste = useCallback(async () => {
    if (!editor) return;
    
    try {
      const text = await navigator.clipboard.readText();
      const selection = editor.getSelection();
      if (!selection) return;

      editor.executeEdits('context-menu', [{
        range: selection,
        text: text
      }]);
      editor.focus();
    } catch (error) {

    }
  }, [editor]);

  // 全选
  const handleSelectAll = useCallback(() => {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const fullRange = model.getFullModelRange();
    editor.setSelection(fullRange);
    editor.focus();
  }, [editor]);

  // 构建菜单
  const menuGroups: MenuGroup[] = useMemo(() => {
    console.log('[useMonacoContextMenu] ========== 构建菜单 ==========');
    console.log('[useMonacoContextMenu] onOpenInlineChat:', onOpenInlineChat);
    console.log('[useMonacoContextMenu] typeof onOpenInlineChat:', typeof onOpenInlineChat);
    
    const hasText = editor ? (() => {
      const selection = editor.getSelection();
      return selection ? !selection.isEmpty() : false;
    })() : false;

    // 检查是否是文件（不是片段文件）
    const isFile = tabId && !tabId.startsWith('snippet-') && !tabId.includes('snippet');
    
    const groups: MenuGroup[] = [
      // AI 操作
      {
        id: 'ai',
        items: [
          {
            id: 'inline-chat',
            label: '打开内联聊天',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 3H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h2v2l2-2h8c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zm0 9H5.5L4 13.5V12H2V4h12v8z"/>
                <circle cx="5" cy="8" r=".75"/>
                <circle cx="8" cy="8" r=".75"/>
                <circle cx="11" cy="8" r=".75"/>
              </svg>
            ),
            shortcut: 'Ctrl+I',
            action: onOpenInlineChat ? (() => {
              console.log('[MonacoContextMenu] ========== 右键菜单：打开内联聊天被点击 ==========');
              console.log('[MonacoContextMenu] onOpenInlineChat:', onOpenInlineChat);
              onOpenInlineChat();
            }) : (() => {
              console.warn('[MonacoContextMenu] onOpenInlineChat 未定义！');
            }),
            disabled: !onOpenInlineChat
          },
          {
            id: 'upload-to-knowledge-base',
            label: '上传知识库',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1L3 6h3v5h4V6h3L8 1zm6 10v3H2v-3H0v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2z"/>
              </svg>
            ),
            action: onUploadToKnowledgeBase || (() => {}),
            disabled: !onUploadToKnowledgeBase || !isFile
          }
        ]
      },
      // 编辑操作
      {
        id: 'edit',
        items: [
          {
            id: 'cut',
            label: '剪切',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.5 2C2.67 2 2 2.67 2 3.5S2.67 5 3.5 5 5 4.33 5 3.5 4.33 2 3.5 2zm0 4C2.67 6 2 6.67 2 7.5S2.67 9 3.5 9 5 8.33 5 7.5 4.33 6 3.5 6zm9-4C11.67 2 11 2.67 11 3.5S11.67 5 12.5 5 14 4.33 14 3.5 13.33 2 12.5 2zm0 4C11.67 6 11 6.67 11 7.5S11.67 9 12.5 9 14 8.33 14 7.5 13.33 6 12.5 6zM6 4l4 4-4 4v-2.5H5V7h1V4.5z"/>
              </svg>
            ),
            shortcut: 'Ctrl+X',
            action: handleCut,
            disabled: !hasText
          },
          {
            id: 'copy',
            label: '复制',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 4l1-1h5.414L12 4.414V9l-1 1H5l-1-1V4zm1 0v5h5V5h-1L8 4H5z"/>
                <path d="M3 1L2 2v10l1 1V2h8V1H3z"/>
              </svg>
            ),
            shortcut: 'Ctrl+C',
            action: handleCopy,
            disabled: !hasText
          },
          {
            id: 'paste',
            label: '粘贴',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 2h3l.5.5v1h2l.5.5v10l-.5.5h-9l-.5-.5v-10l.5-.5h2v-1l.5-.5zM7 3v1h2V3H7zm3 1h1v9H4V4h1v1h5V4z"/>
              </svg>
            ),
            shortcut: 'Ctrl+V',
            action: handlePaste,
            disabled: false
          }
        ]
      },
      // 选择操作
      {
        id: 'selection',
        items: [
          {
            id: 'select-all',
            label: '全选',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 3h14v2H1V3zm0 4h14v2H1V7zm0 4h14v2H1v-2z"/>
              </svg>
            ),
            shortcut: 'Ctrl+A',
            action: handleSelectAll,
            disabled: false
          }
        ]
      }
    ];

    console.log('[useMonacoContextMenu] 创建的菜单组:', groups);
    console.log('[useMonacoContextMenu] inline-chat 菜单项:', groups[0]?.items[0]);
    console.log('[useMonacoContextMenu] inline-chat action:', groups[0]?.items[0]?.action);
    console.log('[useMonacoContextMenu] inline-chat disabled:', groups[0]?.items[0]?.disabled);

    return groups;
  }, [editor, handleCut, handleCopy, handlePaste, handleSelectAll, onOpenInlineChat, onUploadToKnowledgeBase, tabId]);

  // 显示菜单
  const showMenu = useCallback((x: number, y: number) => {
    console.log('[useMonacoContextMenu] ========== showMenu 被调用 ==========');
    console.log('[useMonacoContextMenu] 位置:', x, y);
    console.log('[useMonacoContextMenu] 当前 menuGroups:', menuGroups);
    setPosition({ x, y });
    setVisible(true);
  }, [menuGroups]);

  // 隐藏菜单
  const hideMenu = useCallback(() => {
    setVisible(false);
  }, []);

  return {
    visible,
    position,
    menuGroups,
    showMenu,
    hideMenu
  };
};

