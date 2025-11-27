/**
 * VSCode API 实现
 */
import * as vscode from '@note-studio/extension-api';
export declare class APIImplementation {
    getAPI(): typeof vscode;
    executeCommand(command: string, ...args: any[]): Promise<any>;
    registerCommand(command: string, callback: (...args: any[]) => any): any;
}
//# sourceMappingURL=APIImplementation.d.ts.map