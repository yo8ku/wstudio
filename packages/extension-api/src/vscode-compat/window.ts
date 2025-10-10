/**
 * VSCode Window API
 */

import { EventEmitter } from './event-emitter';
import { Disposable, Event, TextEditor, ViewColumn, Uri, Position, Range, TextDocument, Selection, Thenable } from './types';

export namespace window {
  const eventEmitter = new EventEmitter();
  let activeTextEditor: TextEditor | undefined = undefined;
  let visibleTextEditors: TextEditor[] = [];

  /**
   * 当前活动的文本编辑器
   */
  export function getActiveTextEditor(): TextEditor | undefined {
    return activeTextEditor;
  }

  /**
   * 所有可见的文本编辑器
   */
  export function getVisibleTextEditors(): TextEditor[] {
    return visibleTextEditors;
  }

  /**
   * 活动文本编辑器变化事件
   */
  export const onDidChangeActiveTextEditor: Event<TextEditor | undefined> = (listener) => {
    eventEmitter.on('activeTextEditorChanged', listener);
    return {
      dispose: () => {
        eventEmitter.off('activeTextEditorChanged', listener);
      }
    };
  };

  /**
   * 可见文本编辑器变化事件
   */
  export const onDidChangeVisibleTextEditors: Event<TextEditor[]> = (listener) => {
    eventEmitter.on('visibleTextEditorsChanged', listener);
    return {
      dispose: () => {
        eventEmitter.off('visibleTextEditorsChanged', listener);
      }
    };
  };

  /**
   * 显示信息消息
   */
  export function showInformationMessage(message: string, ...items: any[]): Thenable<any> {
    console.log(`[Window] 信息消息: ${message}`);
    // 在实际实现中，这里会显示 UI 消息
    return Promise.resolve(undefined);
  }

  /**
   * 显示警告消息
   */
  export function showWarningMessage(message: string, ...items: any[]): Thenable<any> {
    console.log(`[Window] 警告消息: ${message}`);
    return Promise.resolve(undefined);
  }

  /**
   * 显示错误消息
   */
  export function showErrorMessage(message: string, ...items: any[]): Thenable<any> {
    console.log(`[Window] 错误消息: ${message}`);
    return Promise.resolve(undefined);
  }

  /**
   * 显示输入框
   */
  export function showInputBox(options?: any): Thenable<string | undefined> {
    console.log(`[Window] 显示输入框:`, options);
    return Promise.resolve(undefined);
  }

  /**
   * 显示快速选择
   */
  export function showQuickPick<T extends any>(items: T[] | Thenable<T[]>, options?: any): Thenable<T | T[] | undefined> {
    console.log(`[Window] 显示快速选择:`, options);
    return Promise.resolve(undefined);
  }

  /**
   * 显示文件选择器
   */
  export function showOpenDialog(options?: any): Thenable<Uri[] | undefined> {
    console.log(`[Window] 显示文件选择器:`, options);
    return Promise.resolve(undefined);
  }

  /**
   * 显示保存对话框
   */
  export function showSaveDialog(options?: any): Thenable<Uri | undefined> {
    console.log(`[Window] 显示保存对话框:`, options);
    return Promise.resolve(undefined);
  }

  /**
   * 显示工作区文件夹选择
   */
  export function showWorkspaceFolderPick(options?: any): Thenable<any> {
    console.log(`[Window] 显示工作区文件夹选择:`, options);
    return Promise.resolve(undefined);
  }

  /**
   * 创建输出通道
   */
  export function createOutputChannel(name: string): any {
    console.log(`[Window] 创建输出通道: ${name}`);
    return {
      name,
      append: (value: string) => console.log(`[Output:${name}] ${value}`),
      appendLine: (value: string) => console.log(`[Output:${name}] ${value}`),
      show: () => console.log(`[Output:${name}] 显示`),
      hide: () => console.log(`[Output:${name}] 隐藏`),
      dispose: () => console.log(`[Output:${name}] 销毁`)
    };
  }

  /**
   * 创建状态栏项
   */
  export function createStatusBarItem(alignment?: any, priority?: number): any {
    console.log(`[Window] 创建状态栏项`);
    return {
      text: '',
      tooltip: '',
      command: undefined,
      color: undefined,
      backgroundColor: undefined,
      show: () => console.log(`[StatusBar] 显示`),
      hide: () => console.log(`[StatusBar] 隐藏`),
      dispose: () => console.log(`[StatusBar] 销毁`)
    };
  }

  /**
   * 创建终端
   */
  export function createTerminal(options?: any): any {
    console.log(`[Window] 创建终端:`, options);
    return {
      name: options?.name || 'Terminal',
      processId: Promise.resolve(Math.floor(Math.random() * 10000)),
      creationOptions: options,
      exitStatus: undefined,
      state: { isInteractedWith: false },
      sendText: (text: string) => console.log(`[Terminal] 发送文本: ${text}`),
      show: () => console.log(`[Terminal] 显示`),
      hide: () => console.log(`[Terminal] 隐藏`),
      dispose: () => console.log(`[Terminal] 销毁`)
    };
  }

  /**
   * 设置状态栏消息
   */
  export function setStatusBarMessage(text: string, hideAfterTimeout?: number): Disposable {
    console.log(`[Window] 状态栏消息: ${text}`);
    return {
      dispose: () => console.log(`[Window] 状态栏消息已清除`)
    };
  }

  /**
   * 显示文档
   */
  export function showTextDocument(document: TextDocument, column?: ViewColumn, preserveFocus?: boolean): Thenable<TextEditor> {
    console.log(`[Window] 显示文档: ${document.uri.toString()}`);
    // 在实际实现中，这里会打开文档并返回编辑器
    return Promise.resolve(activeTextEditor!);
  }

  /**
   * 显示通知
   */
  export function showNotification(message: string, severity?: any): void {
    console.log(`[Window] 通知: ${message} (${severity})`);
  }

  /**
   * 设置活动文本编辑器（内部使用）
   */
  export function _setActiveTextEditor(editor: TextEditor | undefined): void {
    activeTextEditor = editor;
    eventEmitter.emit('activeTextEditorChanged', editor);
  }

  /**
   * 设置可见文本编辑器（内部使用）
   */
  export function _setVisibleTextEditors(editors: TextEditor[]): void {
    visibleTextEditors = editors;
    eventEmitter.emit('visibleTextEditorsChanged', editors);
  }
}