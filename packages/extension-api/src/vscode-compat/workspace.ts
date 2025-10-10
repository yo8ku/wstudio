/**
 * VSCode Workspace API
 */

import { EventEmitter } from './event-emitter';
import { Disposable, Event, TextDocument, Uri, Thenable, WorkspaceFolder, ConfigurationChangeEvent, FileSystemWatcher } from './types';

export namespace workspace {
  const eventEmitter = new EventEmitter();
  let workspaceFolders: WorkspaceFolder[] | undefined = undefined;
  let name: string | undefined = undefined;

  /**
   * 工作区名称
   */
  export function getName(): string | undefined {
    return name;
  }

  /**
   * 工作区文件夹
   */
  export function getWorkspaceFolders(): WorkspaceFolder[] | undefined {
    return workspaceFolders;
  }

  /**
   * 是否在文件夹中打开
   */
  export function getIsTrusted(): boolean {
    return true;
  }

  /**
   * 工作区文件夹变化事件
   */
  export const onDidChangeWorkspaceFolders: Event<any> = (listener) => {
    eventEmitter.on('workspaceFoldersChanged', listener);
    return {
      dispose: () => {
        eventEmitter.off('workspaceFoldersChanged', listener);
      }
    };
  };

  /**
   * 文档变化事件
   */
  export const onDidOpenTextDocument: Event<TextDocument> = (listener) => {
    eventEmitter.on('textDocumentOpened', listener);
    return {
      dispose: () => {
        eventEmitter.off('textDocumentOpened', listener);
      }
    };
  };

  /**
   * 文档关闭事件
   */
  export const onDidCloseTextDocument: Event<TextDocument> = (listener) => {
    eventEmitter.on('textDocumentClosed', listener);
    return {
      dispose: () => {
        eventEmitter.off('textDocumentClosed', listener);
      }
    };
  };

  /**
   * 文档保存事件
   */
  export const onDidSaveTextDocument: Event<TextDocument> = (listener) => {
    eventEmitter.on('textDocumentSaved', listener);
    return {
      dispose: () => {
        eventEmitter.off('textDocumentSaved', listener);
      }
    };
  };

  /**
   * 配置变化事件
   */
  export const onDidChangeConfiguration: Event<ConfigurationChangeEvent> = (listener) => {
    eventEmitter.on('configurationChanged', listener);
    return {
      dispose: () => {
        eventEmitter.off('configurationChanged', listener);
      }
    };
  };

  /**
   * 获取所有文本文档
   */
  export function getTextDocuments(): TextDocument[] {
    console.log(`[Workspace] 获取所有文本文档`);
    return [];
  }

  /**
   * 打开文本文档
   */
  export function openTextDocument(uri: Uri): Thenable<TextDocument>;
  export function openTextDocument(fileName: string): Thenable<TextDocument>;
  export function openTextDocument(options?: any): Thenable<TextDocument>;
  export function openTextDocument(uriOrFileNameOrOptions?: Uri | string | any): Thenable<TextDocument> {
    console.log(`[Workspace] 打开文本文档:`, uriOrFileNameOrOptions);
    // 在实际实现中，这里会打开文档
    return Promise.resolve({} as TextDocument);
  }

  /**
   * 应用编辑
   */
  export function applyEdit(edit: any): Thenable<boolean> {
    console.log(`[Workspace] 应用编辑:`, edit);
    return Promise.resolve(true);
  }

  /**
   * 获取配置
   */
  export function getConfiguration(section?: string, scope?: any): any {
    console.log(`[Workspace] 获取配置: ${section}`);
    return {
      get: (key: string, defaultValue?: any) => {
        console.log(`[Workspace] 获取配置值: ${key}`);
        return defaultValue;
      },
      has: (key: string) => {
        console.log(`[Workspace] 检查配置键: ${key}`);
        return false;
      },
      inspect: (key: string) => {
        console.log(`[Workspace] 检查配置: ${key}`);
        return undefined;
      },
      update: (key: string, value: any, configurationTarget?: any) => {
        console.log(`[Workspace] 更新配置: ${key} = ${value}`);
        return Promise.resolve();
      }
    };
  }

  /**
   * 创建文件系统监视器
   */
  export function createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher {
    console.log(`[Workspace] 创建文件系统监视器: ${globPattern}`);
    return {
      ignoreCreateEvents: ignoreCreateEvents || false,
      ignoreChangeEvents: ignoreChangeEvents || false,
      ignoreDeleteEvents: ignoreDeleteEvents || false,
      onDidCreate: (listener: (e: Uri) => any) => {
        eventEmitter.on('fileCreated', listener);
        return {
          dispose: () => {
            eventEmitter.off('fileCreated', listener);
          }
        };
      },
      onDidChange: (listener: (e: Uri) => any) => {
        eventEmitter.on('fileChanged', listener);
        return {
          dispose: () => {
            eventEmitter.off('fileChanged', listener);
          }
        };
      },
      onDidDelete: (listener: (e: Uri) => any) => {
        eventEmitter.on('fileDeleted', listener);
        return {
          dispose: () => {
            eventEmitter.off('fileDeleted', listener);
          }
        };
      },
      dispose: () => {
        console.log(`[Workspace] 销毁文件系统监视器: ${globPattern}`);
      }
    };
  }

  /**
   * 查找文件
   */
  export function findFiles(include: string, exclude?: string, maxResults?: number, token?: any): Thenable<Uri[]> {
    console.log(`[Workspace] 查找文件: ${include}, 排除: ${exclude}`);
    return Promise.resolve([]);
  }

  /**
   * 保存所有文件
   */
  export function saveAll(includeUntitled?: boolean): Thenable<boolean> {
    console.log(`[Workspace] 保存所有文件`);
    return Promise.resolve(true);
  }

  /**
   * 设置工作区文件夹（内部使用）
   */
  export function _setWorkspaceFolders(folders: WorkspaceFolder[] | undefined): void {
    workspaceFolders = folders;
    eventEmitter.emit('workspaceFoldersChanged', { added: [], removed: [] });
  }

  /**
   * 设置工作区名称（内部使用）
   */
  export function _setName(newName: string | undefined): void {
    name = newName;
  }
}