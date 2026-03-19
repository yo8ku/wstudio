/**
 * useMonacoContextMenu.tsx
 * Monaco 编辑器右键菜单 Hook
 * 功能：管理 Monaco 右键菜单的位置、显示状态与菜单项行为。
 */

import { useState, useCallback, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import type {
  WorkbenchEditorMenuContext,
  WorkbenchMenuContributionEntry,
  WorkbenchTextRange,
} from '@note-studio/shared';
import type { MenuGroup } from './MonacoContextMenu';
import { openBidirectionalLinksPanel } from '../../../../utils/noteLinking';
import { buildBidirectionalLinkText } from '../../../../utils/bidirectionalLink';
import {
  executeWorkbenchMenuContribution,
  groupWorkbenchMenuContributions,
} from '../../../../utils/workbenchMenus';

export interface UseMonacoContextMenuOptions {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  onOpenInlineChat?: () => void;
  onUploadToKnowledgeBase?: () => void;
  tabId?: string;
  tabTitle?: string;
  filePath?: string;
  language?: string;
  pluginMenus?: readonly WorkbenchMenuContributionEntry[];
}

export const useMonacoContextMenu = (options: UseMonacoContextMenuOptions) => {
  const {
    editor,
    onOpenInlineChat,
    onUploadToKnowledgeBase,
    tabId,
    tabTitle,
    filePath,
    language,
    pluginMenus = [],
  } = options;
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectionText, setSelectionText] = useState('');
  const [selectionRange, setSelectionRange] = useState<WorkbenchTextRange | null>(null);

  const captureSelectionContext = useCallback((): void => {
    if (!editor) {
      setSelectionText('');
      setSelectionRange(null);
      return;
    }

    const selection = editor.getSelection();
    const model = editor.getModel();

    if (!selection || selection.isEmpty() || !model) {
      setSelectionText('');
      setSelectionRange(null);
      return;
    }

    setSelectionText(model.getValueInRange(selection));
    setSelectionRange({
      startLine: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLine: selection.endLineNumber,
      endColumn: selection.endColumn,
    });
  }, [editor]);

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

  const handlePaste = useCallback(async () => {
    if (!editor) return;

    try {
      const text = await navigator.clipboard.readText();
      const selection = editor.getSelection();
      if (!selection) return;

      editor.executeEdits('context-menu', [{
        range: selection,
        text
      }]);
      editor.focus();
    } catch (error) {
      console.error('[useMonacoContextMenu] 读取剪贴板失败:', error);
    }
  }, [editor]);

  const handleSelectAll = useCallback(() => {
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    editor.setSelection(model.getFullModelRange());
    editor.focus();
  }, [editor]);

  const handleSetBidirectionalLink = useCallback(() => {
    if (!editor) return;

    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return;

    const model = editor.getModel();
    if (!model) return;

    const selectedText = model.getValueInRange(selection);
    const linkText = buildBidirectionalLinkText(selectedText);
    if (!linkText) return;

    editor.pushUndoStop();
    editor.executeEdits('context-menu', [{
      range: selection,
      text: linkText
    }]);
    editor.pushUndoStop();
    editor.focus();
  }, [editor]);

  const menuGroups: MenuGroup[] = useMemo(() => {
    const hasText = selectionText.length > 0;
    const hasLinkableText = Boolean(buildBidirectionalLinkText(selectionText));
    const isFile = Boolean(tabId);
    const editorMenuContext: WorkbenchEditorMenuContext = {
      kind: 'editor/context',
      tabId: tabId ?? null,
      title: tabTitle ?? null,
      path: filePath ?? null,
      language: language ?? null,
      selectionText,
      hasSelection: hasText,
      selectionRange,
    };
    const pluginMenuGroups = groupWorkbenchMenuContributions(pluginMenus).map((group, groupIndex) => ({
      id: `plugin-group-${groupIndex}`,
      items: group.items.map((menu) => ({
        id: menu.menuItemId,
        label: menu.title,
        action: () => {
          void executeWorkbenchMenuContribution(menu, [editorMenuContext]);
        },
      })),
    }));

    return [
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
            action: onOpenInlineChat || (() => {}),
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
      {
        id: 'edit',
        items: [
          {
            id: 'open-bidirectional-links',
            label: '打开双向链接',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 5A2.5 2.5 0 0 1 7 2.5h2a2.5 2.5 0 1 1 0 5H7V6h2a1 1 0 1 0 0-2H7a1 1 0 1 0 0 2H5.5V5zm4 6a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H8.5v-1.5h2A2.5 2.5 0 1 1 10.5 14h-2a2.5 2.5 0 1 1 0-5h2V11h-2z" />
              </svg>
            ),
            action: openBidirectionalLinksPanel,
            disabled: !isFile
          },
          {
            id: 'set-bidirectional-link',
            label: '设置双链',
            icon: (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.5 5A2.5 2.5 0 0 1 7 2.5h2a2.5 2.5 0 1 1 0 5H7V6h2a1 1 0 1 0 0-2H7a1 1 0 1 0 0 2H5.5V5zm4 6a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H8.5v-1.5h2A2.5 2.5 0 1 1 10.5 14h-2a2.5 2.5 0 1 1 0-5h2V11h-2z" />
              </svg>
            ),
            action: handleSetBidirectionalLink,
            disabled: !hasLinkableText
          },
          {
            id: 'open-bidirectional-links-separator',
            label: '',
            action: () => {},
            separator: true
          },
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
      },
      ...pluginMenuGroups,
    ];
  }, [
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleSetBidirectionalLink,
    filePath,
    language,
    onOpenInlineChat,
    onUploadToKnowledgeBase,
    pluginMenus,
    selectionRange,
    selectionText,
    tabId,
    tabTitle,
  ]);

  const showMenu = useCallback((x: number, y: number) => {
    captureSelectionContext();
    setPosition({ x, y });
    setVisible(true);
  }, [captureSelectionContext]);

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
