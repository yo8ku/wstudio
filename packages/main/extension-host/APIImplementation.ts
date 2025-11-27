/**
 * VSCode API 实现
 */

import * as vscode from '@note-studio/extension-api';

export class APIImplementation {
  getAPI(): typeof vscode {
    return vscode;
  }

  executeCommand(command: string, ...args: any[]): Promise<any> {
    return vscode.vscode.commands.executeCommand(command, ...args);
  }

  registerCommand(command: string, callback: (...args: any[]) => any): any {
    return vscode.vscode.commands.registerCommand(command, callback);
  }
}



