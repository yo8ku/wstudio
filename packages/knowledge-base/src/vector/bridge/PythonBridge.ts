/**
 * Python 服务桥接器
 * 用于 TypeScript 与 Python 服务之间的通信
 * 支持 Node.js 环境（直接启动 Python 进程）和浏览器环境（通过 IPC）
 */

import { PythonServiceRequest, PythonServiceResponse } from '../types';

// 检测运行环境
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// IPC 响应类型
interface IPCResponse {
  success: boolean;
  error?: string;
}

// 浏览器环境的 IPC 接口类型
interface ElectronIPC {
  ipcRenderer?: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
}

// 获取 Electron IPC（仅在浏览器环境中）
function getElectronIPC(): ElectronIPC['ipcRenderer'] | null {
  if (!isBrowser) {
    return null;
  }
  const windowWithElectron = window as Window & { electron?: ElectronIPC };
  return windowWithElectron.electron?.ipcRenderer || null;
}

// 定义 path 模块的类型接口
interface PathModule {
  join: (...paths: string[]) => string;
  dirname: (path: string) => string;
}

// 定义 child_process 模块的类型接口
interface ChildProcessModule {
  spawn: (command: string, args?: string[], options?: any) => any;
}

interface ChildProcess {
  stdin: any;
  stdout: any;
  stderr: any;
  kill: () => void;
  on: (event: string, callback: (code: number | null) => void) => void;
}

// 缓存动态导入的模块
let pathModule: PathModule | null = null;
let childProcessModule: ChildProcessModule | null = null;

// 获取 path 模块
async function getPathModule(): Promise<PathModule> {
  if (isBrowser) {
    throw new Error('path module is not available in browser environment.');
  }
  if (!pathModule) {
    try {
      // 使用 Function 构造函数创建完全动态的导入，避免 Vite 静态分析
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      pathModule = await dynamicImport('path');
    } catch (error) {
      throw new Error('path module is not available. Please ensure you are running in Node.js environment.');
    }
  }
  return pathModule;
}

// 获取 child_process 模块
async function getChildProcessModule(): Promise<ChildProcessModule> {
  if (isBrowser) {
    throw new Error('child_process module is not available in browser environment.');
  }
  if (!childProcessModule) {
    try {
      // 使用 Function 构造函数创建完全动态的导入，避免 Vite 静态分析
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      childProcessModule = await dynamicImport('child_process');
    } catch (error) {
      throw new Error('child_process module is not available. Please ensure you are running in Node.js environment.');
    }
  }
  return childProcessModule;
}

export class PythonBridge {
  private process: ChildProcess | null = null;
  private isReady: boolean = false;
  private requestQueue: Array<{
    request: PythonServiceRequest;
    resolve: (value: PythonServiceResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private currentRequest: {
    resolve: (value: PythonServiceResponse) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor() {
    // 不在构造函数中检测，改为在运行时动态检测
  }

  /**
   * 检测是否应该使用 IPC（运行时动态检测）
   */
  private shouldUseIPC(): boolean {
    return isBrowser && getElectronIPC() !== null;
  }

  /**
   * 启动 Python 服务
   */
  async start(): Promise<void> {
    // 运行时动态检测是否应该使用 IPC
    if (this.shouldUseIPC()) {
      const ipc = getElectronIPC();
      if (!ipc) {
        throw new Error('Electron IPC is not available in browser environment.');
      }
      try {
        const result = await ipc.invoke('python-bridge:start') as IPCResponse;
        if (result && typeof result === 'object' && 'success' in result) {
          if (!result.success) {
            throw new Error(result.error || 'Failed to start Python service via IPC');
          }
          this.isReady = true;
          return;
        }
      } catch (error) {
        throw new Error(`Failed to start Python service via IPC: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    // Node.js 环境：直接启动 Python 进程
    if (this.process) {
      return;
    }

    if (isBrowser) {
      // 在浏览器环境中，如果 IPC 不可用，尝试再次检测
      const ipc = getElectronIPC();
      if (!ipc) {
        throw new Error('PythonBridge is not supported in browser environment without Electron IPC. Please ensure the Electron preload script is loaded.');
      }
      // 如果 IPC 可用，递归调用使用 IPC 路径
      return this.start();
    }

    const path = await getPathModule();
    const childProcess = await getChildProcessModule();
    
    // 获取当前文件所在目录（ESM 兼容方式）
    let currentDir: string;
    if (typeof __dirname !== 'undefined') {
      // CommonJS 环境
      currentDir = __dirname;
    } else {
      // ESM 环境，使用 import.meta.url
      const url = new URL(import.meta.url);
      currentDir = url.pathname.replace(/\/[^/]*$/, '');
      // Windows 路径处理
      if (process.platform === 'win32' && currentDir.startsWith('/')) {
        currentDir = currentDir.slice(1);
      }
    }

    const pythonScriptPath = path.join(currentDir, '../python/server.py');
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';

    this.process = childProcess.spawn(pythonExecutable, [pythonScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(pythonScriptPath),
    }) as ChildProcess;

    this.process.stdout?.on('data', (data: Buffer) => {
      try {
        const response: PythonServiceResponse = JSON.parse(data.toString());
        if (this.currentRequest) {
          this.currentRequest.resolve(response);
          this.currentRequest = null;
          this.processNextRequest();
        }
      } catch (error) {
        if (this.currentRequest) {
          this.currentRequest.reject(new Error(`Failed to parse response: ${error}`));
          this.currentRequest = null;
          this.processNextRequest();
        }
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('Python service error:', data.toString());
    });

    this.process.on('exit', (code) => {
      this.process = null;
      this.isReady = false;
      if (this.currentRequest) {
        this.currentRequest.reject(new Error(`Python process exited with code ${code}`));
        this.currentRequest = null;
      }
      // 拒绝所有待处理的请求
      this.requestQueue.forEach(({ reject }) => {
        reject(new Error('Python process exited'));
      });
      this.requestQueue = [];
    });

    this.isReady = true;
  }

  /**
   * 停止 Python 服务
   */
  async stop(): Promise<void> {
    // 运行时动态检测是否应该使用 IPC
    if (this.shouldUseIPC()) {
      const ipc = getElectronIPC();
      if (ipc) {
        try {
          await ipc.invoke('python-bridge:stop');
        } catch (error) {
          console.error('Failed to stop Python service via IPC:', error);
        }
      }
      this.isReady = false;
      return;
    }

    // Node.js 环境：直接停止 Python 进程
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
  }

  /**
   * 发送请求到 Python 服务
   */
  async request(req: PythonServiceRequest): Promise<PythonServiceResponse> {
    // 运行时动态检测是否应该使用 IPC
    if (this.shouldUseIPC()) {
      const ipc = getElectronIPC();
      if (!ipc) {
        throw new Error('Electron IPC is not available in browser environment.');
      }
      
      // 确保服务已启动
      if (!this.isReady) {
        await this.start();
      }

      try {
        const result = await ipc.invoke('python-bridge:request', req);
        if (result && typeof result === 'object') {
          return result as PythonServiceResponse;
        }
        throw new Error('Invalid response from IPC');
      } catch (error) {
        throw new Error(`Failed to send request via IPC: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Node.js 环境：直接发送请求到 Python 进程
    if (!this.isReady || !this.process) {
      await this.start();
    }

    return new Promise<PythonServiceResponse>((resolve, reject) => {
      if (this.currentRequest) {
        // 如果当前有请求在处理，加入队列
        this.requestQueue.push({ request: req, resolve, reject });
      } else {
        this.sendRequest(req, resolve, reject);
      }
    });
  }

  /**
   * 发送请求
   */
  private sendRequest(
    req: PythonServiceRequest,
    resolve: (value: PythonServiceResponse) => void,
    reject: (error: Error) => void
  ): void {
    if (!this.process || !this.process.stdin) {
      reject(new Error('Python process is not available'));
      return;
    }

    this.currentRequest = { resolve, reject };

    try {
      const requestJson = JSON.stringify(req) + '\n';
      this.process.stdin.write(requestJson);
    } catch (error) {
      this.currentRequest = null;
      reject(new Error(`Failed to send request: ${error}`));
      this.processNextRequest();
    }
  }

  /**
   * 处理下一个请求
   */
  private processNextRequest(): void {
    if (this.requestQueue.length > 0 && !this.currentRequest) {
      const { request, resolve, reject } = this.requestQueue.shift()!;
      this.sendRequest(request, resolve, reject);
    }
  }

  /**
   * 检查服务是否就绪
   */
  isServiceReady(): boolean {
    // 运行时动态检测是否应该使用 IPC
    if (this.shouldUseIPC()) {
      return this.isReady;
    }
    // Node.js 环境：检查进程状态
    return this.isReady && this.process !== null;
  }
}

