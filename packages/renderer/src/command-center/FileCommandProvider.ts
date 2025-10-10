/**
 * 文件命令提供者
 * 功能：提供文件操作相关的命令（保存、另存为等）
 * 描述：集成到命令中心，支持通过命令面板执行文件操作
 */

import { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command } from './CommandTypes';

export class FileCommandProvider {
  private commandCenter: VSCodeCommandCenter;

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
          console.log('[FileCommandProvider] 执行保存命令');
          const saveHandler = (window as any).__editorSaveFile;
          if (saveHandler) {
            saveHandler();
          } else {
            console.warn('[FileCommandProvider] 保存处理器未找到');
          }
        }
      },
      {
        id: 'file.saveAs',
        label: '文件: 另存为',
        description: '将当前文件保存到新位置',
        category: '文件',
        keybinding: 'Ctrl+Shift+S',
        execute: async () => {
          console.log('[FileCommandProvider] 执行另存为命令');
          // 获取当前激活的编辑器内容
          const currentTabId = (window as any).__currentTabId;
          const currentContent = (window as any).__monacoEditor?.getValue() || '';
          
          if (!currentContent) {
            console.warn('[FileCommandProvider] 没有内容可保存');
            return;
          }

          try {
            const result = await window.electron?.file?.saveAs(currentContent);
            if (result?.success && result.data) {
              console.log('[FileCommandProvider] 另存为成功:', result.data.path);
              // 触发文件已保存事件
              window.dispatchEvent(new CustomEvent('file-saved', {
                detail: { path: result.data.path, tabId: currentTabId }
              }));
            }
          } catch (error) {
            console.error('[FileCommandProvider] 另存为失败:', error);
          }
        }
      },
      {
        id: 'file.open',
        label: '文件: 打开文件',
        description: '打开文件对话框',
        category: '文件',
        keybinding: 'Ctrl+O',
        execute: () => {
          console.log('[FileCommandProvider] 执行打开文件命令');
          window.dispatchEvent(new Event('open-file'));
        }
      },
      {
        id: 'file.newFile',
        label: '文件: 新建文件',
        description: '创建一个新文件',
        category: '文件',
        keybinding: 'Ctrl+N',
        execute: () => {
          console.log('[FileCommandProvider] 执行新建文件命令');
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: {
              path: '',
              content: '',
              name: 'Untitled',
              language: 'markdown',
              isPreview: false
            }
          }));
        }
      },
      {
        id: 'file.saveAll',
        label: '文件: 保存所有文件',
        description: '保存所有打开的文件',
        category: '文件',
        keybinding: 'Ctrl+K S',
        execute: () => {
          console.log('[FileCommandProvider] 执行保存所有文件命令');
          // 触发保存所有文件事件
          window.dispatchEvent(new Event('save-all-files'));
        }
      }
    ];

    this.commandCenter.registerCommands(commands);
    console.log(`[FileCommandProvider] 已注册 ${commands.length} 个文件命令`);
  }

  /**
   * 注销所有命令
   */
  dispose(): void {
    console.log('[FileCommandProvider] 注销所有文件命令');
    // 注销命令的逻辑（如果需要）
  }
}











































