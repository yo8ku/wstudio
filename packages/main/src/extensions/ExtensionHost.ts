/**
 * 扩展宿主进程 - 在独立进程中运行扩展
 */

import { fork, ChildProcess } from 'child_process';
import * as path from 'path';

export class ExtensionHost {
  private process: ChildProcess | null = null;

  async start(): Promise<void> {
    const hostPath = path.join(__dirname, '../../extension-host/index.js');
    
    this.process = fork(hostPath, [], {
      stdio: 'inherit',
      env: process.env
    });

    this.process.on('exit', (code) => {
      console.log(`[ExtensionHost] 进程退出，代码: ${code}`);
    });

    console.log('[ExtensionHost] 扩展宿主进程已启动');
  }

  async terminate(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      console.log('[ExtensionHost] 扩展宿主进程已终止');
    }
  }

  sendMessage(message: any): void {
    if (this.process) {
      this.process.send(message);
    }
  }
}



