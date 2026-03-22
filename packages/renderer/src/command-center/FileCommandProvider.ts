/**
 * 文件命令提供器。
 * 收敛到唯一 CodeMirror 主编辑器后，文件类命令通过活动编辑器桥接读取内容。
 */

import { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command } from './CommandTypes';
import {
  getActiveCodeMirrorEditorContent,
  getActiveCodeMirrorEditorMeta,
} from '../lib/editor/activeCodeMirrorEditor';

export class FileCommandProvider {
  private readonly commandCenter: VSCodeCommandCenter;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerCommands();
  }

  private registerCommands(): void {
    const commands: Command[] = [
      {
        id: 'file.save',
        label: '文件: 保存',
        description: '保存当前文件',
        category: '文件',
        keybinding: 'Ctrl+S',
        execute: () => {
          const saveHandler = (globalThis as { readonly __editorSaveFile?: (() => void) | undefined }).__editorSaveFile;
          if (saveHandler) {
            saveHandler();
            return;
          }

          console.warn('[FileCommandProvider] 保存处理器未找到');
        },
      },
      {
        id: 'file.saveAs',
        label: '文件: 另存为',
        description: '将当前文件保存到新位置',
        category: '文件',
        keybinding: 'Ctrl+Shift+S',
        execute: async () => {
          const currentTabId = getActiveCodeMirrorEditorMeta().tabId;
          const currentContent = getActiveCodeMirrorEditorContent();
          if (!currentContent) {
            console.warn('[FileCommandProvider] 没有内容可保存');
            return;
          }

          try {
            const result = await window.electron?.file?.saveAs(currentContent);
            if (result?.success && result.data) {
              window.dispatchEvent(new CustomEvent('file-saved', {
                detail: {
                  path: result.data.path,
                  tabId: currentTabId,
                },
              }));
            }
          } catch (error) {
            console.error('[FileCommandProvider] 另存为失败:', error);
          }
        },
      },
      {
        id: 'file.open',
        label: '文件: 打开文件',
        description: '打开文件对话框',
        category: '文件',
        keybinding: 'Ctrl+O',
        execute: () => {
          window.dispatchEvent(new Event('open-file'));
        },
      },
      {
        id: 'file.newFile',
        label: '文件: 新建文件',
        description: '创建一个新文件',
        category: '文件',
        keybinding: 'Ctrl+N',
        execute: () => {
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: {
              path: '',
              content: '',
              name: 'Untitled',
              language: 'markdown',
              isPreview: false,
            },
          }));
        },
      },
      {
        id: 'file.saveAll',
        label: '文件: 保存所有文件',
        description: '保存所有打开的文件',
        category: '文件',
        keybinding: 'Ctrl+K S',
        execute: () => {
          window.dispatchEvent(new Event('save-all-files'));
        },
      },
    ];

    this.commandCenter.registerCommands(commands);
  }

  dispose(): void {
    // 当前命令中心不需要显式注销文件命令。
  }
}
