/**
 * VSCode Notebooks API
 */

import { Disposable, Event } from './types';

export namespace notebooks {
  /**
   * 注册笔记本提供程序
   */
  export function registerNotebookProvider(selector: any, provider: any, options?: any): Disposable {
    console.log(`[Notebooks] 注册笔记本提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Notebooks] 注销笔记本提供程序: ${selector}`);
      }
    };
  }

  /**
   * 注册笔记本内容提供程序
   */
  export function registerNotebookContentProvider(notebookType: string, provider: any): Disposable {
    console.log(`[Notebooks] 注册笔记本内容提供程序: ${notebookType}`);
    return {
      dispose: () => {
        console.log(`[Notebooks] 注销笔记本内容提供程序: ${notebookType}`);
      }
    };
  }

  /**
   * 注册笔记本内核提供程序
   */
  export function registerNotebookKernelProvider(selector: any, provider: any): Disposable {
    console.log(`[Notebooks] 注册笔记本内核提供程序: ${selector}`);
    return {
      dispose: () => {
        console.log(`[Notebooks] 注销笔记本内核提供程序: ${selector}`);
      }
    };
  }

  /**
   * 创建笔记本编辑器
   */
  export function createNotebookEditor(uri: any, notebookType: string): any {
    console.log(`[Notebooks] 创建笔记本编辑器: ${uri.toString()}`);
    return {
      uri,
      notebookType,
      document: {
        uri,
        notebookType,
        cells: [],
        metadata: {},
        version: 1
      },
      selection: undefined,
      visibleRanges: [],
      viewColumn: undefined,
      dispose: () => {
        console.log(`[Notebooks] 销毁笔记本编辑器: ${uri.toString()}`);
      }
    };
  }

  /**
   * 笔记本变化事件
   */
  export const onDidChangeNotebookDocument: Event<any> = () => ({
    dispose: () => {}
  });

  /**
   * 笔记本编辑器变化事件
   */
  export const onDidChangeActiveNotebookEditor: Event<any> = () => ({
    dispose: () => {}
  });
}