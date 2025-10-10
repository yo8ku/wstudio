/**
 * VSCode SCM API
 */

import { Disposable, Event } from './types';

export namespace scm {
  /**
   * 创建源代码管理
   */
  export function createSourceControl(id: string, label: string, rootUri?: any): any {
    console.log(`[SCM] 创建源代码管理: ${id} - ${label}`);
    return {
      id,
      label,
      rootUri,
      count: 0,
      quickDiffProvider: undefined,
      commitTemplate: '',
      acceptInputCommand: undefined,
      statusBarCommands: [],
      inputBox: {
        value: '',
        placeholder: '',
        visible: true,
        enabled: true,
        onDidChange: () => ({ dispose: () => {} }),
        onDidAccept: () => ({ dispose: () => {} }),
        show: () => {},
        hide: () => {}
      },
      createResourceGroup: (id: string, label: string) => ({
        id,
        label,
        hideWhenEmpty: undefined,
        resourceStates: [],
        dispose: () => {}
      }),
      dispose: () => {
        console.log(`[SCM] 销毁源代码管理: ${id}`);
      }
    };
  }

  /**
   * 源代码管理变化事件
   */
  export const onDidChangeSourceControl: Event<any> = () => ({
    dispose: () => {}
  });
}