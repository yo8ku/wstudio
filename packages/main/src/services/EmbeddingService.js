/**
 * Embedding 服务 - 主进程版本
 * 在 Node.js 环境中运行，可以直接访问文件系统
 */

const path = require('path');
const { app } = require('electron');

// Mock sharp 模块以避免加载错误
// @xenova/transformers 会尝试加载 sharp，但我们不需要图像处理功能
try {
  require.cache[require.resolve('sharp')] = {
    exports: {
      default: function() {
        throw new Error('Sharp is not available in this context');
      }
    }
  };
} catch (e) {
  // sharp 未安装，忽略
}

class EmbeddingService {
  constructor() {
    this.pipeline = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  /**
   * 初始化 Embedding 服务
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
        console.log('[EmbeddingService-Main] 开始初始化...');

        // 动态导入 @xenova/transformers
        const { pipeline, env } = await import('@xenova/transformers');

        // 设置本地模型路径
        const appPath = app.getAppPath();
        const isDev = !app.isPackaged;
        
        let modelPath;
        if (isDev) {
          // 开发环境：使用项目根目录的 resources
          modelPath = path.join(appPath, 'resources', 'models', 'bge-base-zh-v1.5');
        } else {
          // 生产环境：resources 在 app.asar 外部
          const resourcesPath = process.resourcesPath || path.join(path.dirname(appPath), 'resources');
          modelPath = path.join(resourcesPath, 'models', 'bge-base-zh-v1.5');
        }
        
        console.log('[EmbeddingService-Main] 应用路径:', appPath);
        console.log('[EmbeddingService-Main] 是否开发环境:', isDev);
        console.log('[EmbeddingService-Main] 模型路径:', modelPath);

        // 配置环境：设置自定义缓存目录为模型所在目录
        // 这样 transformers 就会在正确的位置查找文件
        env.cacheDir = path.join(appPath, 'resources', 'models');
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.useBrowserCache = false;
        env.useCustomCache = true;

        // 加载模型 - 使用模型名称而不是完整路径
        console.log('[EmbeddingService-Main] 开始加载模型...');
        this.pipeline = await pipeline('feature-extraction', 'bge-base-zh-v1.5', {
          local_files_only: true,
          quantized: false,
        });

        this.isInitialized = true;
        console.log('[EmbeddingService-Main] ✓ 模型加载成功');
      } catch (error) {
        console.error('[EmbeddingService-Main] ✗ 初始化失败:', error);
        console.error('[EmbeddingService-Main] 错误详情:', error.stack);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 生成文本的向量表示
   * @param {string} text - 要转换为向量的文本
   * @returns {Promise<{vectors: number[], usage: {prompt_tokens: number, total_tokens: number}}>}
   */
  async generateEmbedding(text) {
    // 确保服务已初始化
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Pipeline 未初始化');
    }

    try {
      // 生成向量
      const output = await this.pipeline(text, { 
        pooling: 'mean', 
        normalize: true 
      });

      // 转换为普通数组
      const vectors = Array.from(output.data);

      return {
        vectors,
        usage: {
          prompt_tokens: text.split(/\s+/).length,
          total_tokens: text.split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error('[EmbeddingService-Main] 生成向量失败:', error);
      throw error;
    }
  }

  /**
   * 批量生成文本向量
   * @param {string[]} texts - 文本数组
   * @returns {Promise<Array<{vectors: number[], usage: {prompt_tokens: number, total_tokens: number}}>>}
   */
  async generateBatchEmbeddings(texts) {
    const results = [];
    for (const text of texts) {
      const result = await this.generateEmbedding(text);
      results.push(result);
    }
    return results;
  }
}

// 导出单例
const embeddingService = new EmbeddingService();
module.exports = embeddingService;
