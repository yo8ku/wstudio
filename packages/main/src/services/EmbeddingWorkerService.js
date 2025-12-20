/**
 * Embedding 子进程服务（使用 Electron utilityProcess）
 * 功能：管理 Embedding 子进程，提供向量化 API
 * 描述：
 * 1. 使用 Electron utilityProcess 创建独立进程执行向量化，完全不阻塞主进程
 * 2. 使用 os.setPriority() 降低子进程优先级，确保系统优先响应用户操作
 * 3. 提供与原 EmbeddingService 相同的 API 接口
 * 4. 自动管理子进程生命周期
 */

const { utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

// 并发数固定为 1，只启动 1 个 embeddingChild 进程
const CONCURRENCY = 1;

class EmbeddingWorkerService {
  constructor() {
    this.child = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.pendingRequests = new Map();
    this.requestId = 0;
    // 并发控制：固定为 1
    this.concurrency = CONCURRENCY;
    this.activeRequests = 0;
    this.requestQueue = [];
    // 运行模式（由子进程检测后通知）
    this.runMode = 'cpu'; // 'webgpu' | 'cpu'
    this.delayPerText = 50; // 子进程中每个文本的延迟（毫秒）
  }

  /**
   * 获取当前运行模式
   * @returns {'webgpu' | 'cpu'} 运行模式
   */
  getRunMode() {
    return this.runMode;
  }

  /**
   * 是否为高速模式（GPU 加速）
   * @returns {boolean}
   */
  isHighSpeedMode() {
    return this.runMode === 'gpu' || this.runMode === 'webgpu';
  }

  /**
   * 初始化子进程（使用 utilityProcess）
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const appPath = app.getAppPath();
        const childPath = path.join(appPath, 'packages/main/src/workers/embeddingChild.js');

        if (!fs.existsSync(childPath)) {
          throw new Error(`Embedding 子进程文件不存在: ${childPath}`);
        }

        console.log('[EmbeddingWorkerService] 创建 utilityProcess:', childPath);
        
        // 使用 utilityProcess 替代 fork
        this.child = utilityProcess.fork(childPath, [], {
          env: {
            ...process.env,
            DISABLE_SHARP: '1',
          },
          stdio: 'pipe',
        });

        // 转发子进程的 stdout
        this.child.stdout?.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) {
            console.log('[EmbeddingChild]', msg);
          }
        });

        // 转发子进程的 stderr
        this.child.stderr?.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) {
            console.error('[EmbeddingChild Error]', msg);
          }
        });

        // 等待子进程就绪
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('子进程启动超时'));
          }, 30000);

          const onMessage = (message) => {
            if (message.type === 'ready') {
              clearTimeout(timeout);
              this.child.removeListener('message', onMessage);
              resolve();
            }
          };

          this.child.on('message', onMessage);
          this.child.on('spawn', () => {
            console.log('[EmbeddingWorkerService] 子进程已启动, PID:', this.child.pid);
            // 降低子进程优先级到最低（PRIORITY_IDLE = 19）
            // Windows: IDLE_PRIORITY_CLASS，系统只在完全空闲时才调度
            // Linux/macOS: nice 值 19，最低优先级
            try {
              os.setPriority(this.child.pid, 19);
              console.log('[EmbeddingWorkerService] 已设置子进程为最低优先级');
            } catch (e) {
              // 忽略优先级设置失败
            }
          });
          this.child.on('exit', (code) => {
            if (!this.isInitialized) {
              clearTimeout(timeout);
              reject(new Error(`子进程退出，代码: ${code}`));
            }
          });
        });

        // 设置消息处理
        this.child.on('message', (message) => {
          this.handleChildMessage(message);
        });

        this.child.on('exit', (code) => {
          if (code !== 0) {
            console.log('[EmbeddingWorkerService] 子进程退出，代码:', code);
          }
          this.isInitialized = false;
          this.child = null;
          this.initPromise = null;
        });

        // 初始化模型
        await this.initializeModel();

        this.isInitialized = true;
        console.log('[EmbeddingWorkerService] 子进程初始化成功');
      } catch (error) {
        console.error('[EmbeddingWorkerService] 初始化失败:', error.message || error);
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 初始化模型
   */
  async initializeModel() {
    const appPath = app.getAppPath();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('模型初始化超时'));
      }, 120000);

      const handler = (msg) => {
        if (msg.type === 'initialized') {
          clearTimeout(timeout);
          this.child.removeListener('message', handler);
          if (msg.success) {
            resolve();
          } else {
            reject(new Error(msg.error || '模型初始化失败'));
          }
        }
      };

      this.child.on('message', handler);
      this.child.postMessage({
        type: 'initialize',
        data: { appPath },
      });
    });
  }

  /**
   * 处理子进程初始化完成消息，更新运行模式
   */
  handleInitializedMessage(message) {
    if (message.mode) {
      this.runMode = message.mode;
      this.delayPerText = message.delayPerText || 50;
      console.log(`[EmbeddingWorkerService] 运行模式: ${this.runMode}, 延迟: ${this.delayPerText}ms/文本`);
    }
  }

  /**
   * 处理子进程消息
   */
  handleChildMessage(message) {
    const { type, id, success, vector, vectors, error, mode } = message;

    // 处理初始化完成消息
    if (type === 'initialized') {
      this.handleInitializedMessage(message);
    }

    // 单个向量结果
    if (type === 'embedding-result' && id !== undefined) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        this.activeRequests--;
        this.processQueue(); // 处理队列中的下一个请求
        
        if (success && vector) {
          pending.resolve({
            vectors: vector,
            usage: { prompt_tokens: 0, total_tokens: 0 },
          });
        } else {
          pending.reject(new Error(error || '向量生成失败'));
        }
      }
    }

    // 批量向量结果
    if (type === 'embedding-batch-result' && id !== undefined) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        this.activeRequests--;
        this.processQueue(); // 处理队列中的下一个请求
        
        if (success && vectors) {
          const results = vectors.map((v) => ({
            vectors: v.vector || [],
            usage: { prompt_tokens: 0, total_tokens: 0 },
          }));
          pending.resolve(results);
        } else {
          pending.reject(new Error(error || '批量向量生成失败'));
        }
      }
    }
  }

  /**
   * 处理请求队列
   */
  processQueue() {
    while (this.requestQueue.length > 0 && this.activeRequests < this.concurrency) {
      const request = this.requestQueue.shift();
      if (request) {
        this.activeRequests++;
        this.child.postMessage(request.message);
      }
    }
  }

  /**
   * 发送请求（带并发控制）
   */
  sendRequest(message) {
    if (this.activeRequests < this.concurrency) {
      this.activeRequests++;
      this.child.postMessage(message);
    } else {
      this.requestQueue.push({ message });
    }
  }

  /**
   * 生成文本的向量表示
   */
  async generateEmbedding(text) {
    await this.initialize();

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.sendRequest({
        type: 'generate',
        id,
        data: { text },
      });

      // 超时处理（5 分钟）
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.activeRequests--;
          reject(new Error('向量生成超时'));
        }
      }, 300000);
    });
  }

  /**
   * 批量生成文本向量
   */
  async generateBatchEmbeddings(texts) {
    await this.initialize();

    const id = ++this.requestId;
    console.log(`[EmbeddingWorkerService] 批量向量化: id=${id}, 数量=${texts.length}`);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.sendRequest({
        type: 'generate-batch',
        id,
        data: { texts },
      });

      // 超时处理（10 分钟）
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.activeRequests--;
          reject(new Error('批量向量生成超时'));
        }
      }, 600000);
    });
  }

  /**
   * 设置后台模式（低 CPU 占用）
   * @param {boolean} enabled 是否启用后台模式
   */
  setBackgroundMode(enabled) {
    if (this.child) {
      this.child.postMessage({
        type: 'set-background-mode',
        data: { enabled },
      });
      console.log(`[EmbeddingWorkerService] 后台模式: ${enabled ? '开启' : '关闭'}`);
    }
  }

  /**
   * 关闭子进程
   */
  async close() {
    if (this.child) {
      this.child.postMessage({ type: 'shutdown' });
      this.child.kill();
      this.child = null;
      this.isInitialized = false;
      this.initPromise = null;
      this.pendingRequests.clear();
      this.requestQueue = [];
      this.activeRequests = 0;
    }
  }
}

// 导出单例
const embeddingWorkerService = new EmbeddingWorkerService();
module.exports = embeddingWorkerService;
