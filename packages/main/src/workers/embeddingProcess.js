/**
 * Embedding 子进程 - 使用 Electron utilityProcess
 * 完全独立于主进程，不会阻塞 UI
 */

const path = require('path');
const os = require('os');
const Module = require('module');

// ========== ONNX Runtime 线程限制 ==========
const ONNX_THREADS = Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)));
process.env.OMP_NUM_THREADS = String(ONNX_THREADS);
process.env.ONNX_NUM_THREADS = String(ONNX_THREADS);
process.env.ORT_NUM_THREADS = String(ONNX_THREADS);
process.env.MKL_NUM_THREADS = String(ONNX_THREADS);
process.env.OPENBLAS_NUM_THREADS = String(ONNX_THREADS);

// ========== Sharp Mock ==========
// Transformers.js 会尝试加载 sharp 用于图像处理
// 我们只需要文本 embedding，不需要 sharp

// 创建 sharp mock 函数
const sharpMock = function() {
  return {
    resize: () => sharpMock(),
    toBuffer: () => Promise.reject(new Error('Sharp is not available')),
    metadata: () => Promise.reject(new Error('Sharp is not available')),
  };
};
sharpMock.default = sharpMock;

// 方法1: 拦截 Module._load
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  // 拦截 sharp 模块
  if (request === 'sharp') {
    return sharpMock;
  }
  return originalLoad.apply(this, arguments);
};

// ========== Embedding 逻辑 ==========

let pipeline = null;
let isInitialized = false;

/**
 * 初始化 Pipeline
 */
async function initialize(appPath) {
  if (isInitialized) {
    process.parentPort.postMessage({ type: 'initialized', success: true });
    return;
  }

  try {
    console.log('[EmbeddingProcess] 开始初始化...');

    const { pipeline: createPipeline, env } = await import('@xenova/transformers');

    env.cacheDir = path.join(appPath, 'resources', 'models');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.useCustomCache = true;
    
    console.log(`[EmbeddingProcess] ONNX 线程数: ${ONNX_THREADS}`);

    // quantized: true 使用量化模型，更小更快
    pipeline = await createPipeline('feature-extraction', 'bge-base-zh-v1.5', {
      local_files_only: true,
      quantized: true,
    });

    isInitialized = true;
    console.log('[EmbeddingProcess] ✓ 初始化完成');

    process.parentPort.postMessage({ type: 'initialized', success: true });
  } catch (error) {
    console.error('[EmbeddingProcess] 初始化失败:', error);
    process.parentPort.postMessage({
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
    process.parentPort.postMessage({
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

    process.parentPort.postMessage({
      type: 'embedding-result',
      id,
      success: true,
      vector,
    });
  } catch (error) {
    process.parentPort.postMessage({
      type: 'embedding-result',
      id,
      success: false,
      error: error.message,
    });
  }
}

// 监听来自主进程的消息
process.parentPort.on('message', async (event) => {
  const { type, id, data } = event.data;

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
process.parentPort.postMessage({ type: 'ready' });
