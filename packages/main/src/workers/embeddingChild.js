/**
 * Embedding 子进程 - 使用 Node.js child_process.fork()
 * 完全独立的 Node.js 进程，不会阻塞主进程
 */

const path = require('path');

// ========== Sharp Mock ==========
// 必须在 import @xenova/transformers 之前设置
// 尝试获取 sharp 的路径并预先填充 require.cache

const sharpMock = {
  default: function() {
    return {
      resize: () => sharpMock.default(),
      toBuffer: () => Promise.reject(new Error('Sharp disabled')),
      metadata: () => Promise.reject(new Error('Sharp disabled')),
    };
  }
};

try {
  // 尝试解析 sharp 路径
  const sharpPath = require.resolve('sharp');
  // 预填充 cache，这样后续 require('sharp') 会返回我们的 mock
  require.cache[sharpPath] = {
    id: sharpPath,
    filename: sharpPath,
    loaded: true,
    exports: sharpMock.default
  };
  console.log('[EmbeddingChild] Sharp mock 已设置:', sharpPath);
} catch (e) {
  console.log('[EmbeddingChild] Sharp 未安装，无需 mock');
}

// ========== Embedding 逻辑 ==========

let pipeline = null;
let isInitialized = false;

/**
 * 初始化 Pipeline
 */
async function initialize(appPath) {
  if (isInitialized) {
    process.send({ type: 'initialized', success: true });
    return;
  }

  try {
    console.log('[EmbeddingChild] 开始初始化...');

    // 动态导入 transformers
    const { pipeline: createPipeline, env } = await import('@xenova/transformers');

    env.cacheDir = path.join(appPath, 'resources', 'models');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.useCustomCache = true;

    console.log('[EmbeddingChild] 模型目录:', env.cacheDir);

    pipeline = await createPipeline('feature-extraction', 'bge-base-zh-v1.5', {
      local_files_only: true,
      quantized: false,
    });

    isInitialized = true;
    console.log('[EmbeddingChild] ✓ 初始化完成');

    process.send({ type: 'initialized', success: true });
  } catch (error) {
    console.error('[EmbeddingChild] 初始化失败:', error.message);
    process.send({
      type: 'initialized',
      success: false,
      error: error.message,
    });
  }
}

/**
 * 生成向量
 */
async function generateEmbedding(id, text) {
  if (!pipeline) {
    process.send({
      type: 'embedding-result',
      id,
      success: false,
      error: 'Pipeline 未初始化',
    });
    return;
  }

  try {
    const output = await pipeline(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    process.send({
      type: 'embedding-result',
      id,
      success: true,
      vector,
    });
  } catch (error) {
    process.send({
      type: 'embedding-result',
      id,
      success: false,
      error: error.message,
    });
  }
}

// 监听来自主进程的消息
process.on('message', async (msg) => {
  const { type, id, data } = msg;

  switch (type) {
    case 'initialize':
      await initialize(data.appPath);
      break;

    case 'generate':
      await generateEmbedding(id, data.text);
      break;

    case 'shutdown':
      process.exit(0);
      break;
  }
});

// 通知主进程子进程已启动
process.send({ type: 'ready' });
