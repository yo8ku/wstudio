/**
 * Embedding 子进程 - 支持 Electron utilityProcess
 * 功能：在独立进程中执行向量化，完全不阻塞主进程
 * 描述：使用 Transformers.js 进行本地向量化，支持 WebGPU 加速检测
 */

// ========== ONNX Runtime 配置（必须在最顶端设置）==========
// CPU 线程限制（当使用 CPU 时生效）
process.env.OMP_NUM_THREADS = '1';
process.env.ONNX_NUM_THREADS = '1';
process.env.ORT_NUM_THREADS = '1';
process.env.MKL_NUM_THREADS = '1';
process.env.OPENBLAS_NUM_THREADS = '1';
process.env.VECLIB_MAXIMUM_THREADS = '1';
process.env.NUMEXPR_NUM_THREADS = '1';
process.env.TF_NUM_INTEROP_THREADS = '1';
process.env.TF_NUM_INTRAOP_THREADS = '1';

const path = require('path');

// ========== Sharp Mock ==========
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
  const sharpPath = require.resolve('sharp');
  require.cache[sharpPath] = {
    id: sharpPath,
    filename: sharpPath,
    loaded: true,
    exports: sharpMock.default
  };
} catch {
  // Sharp 未安装，无需 mock
}

// ========== Embedding 逻辑 ==========

let pipeline = null;
let isInitialized = false;

// ========== 运行模式配置 ==========
// 根据 WebGPU 检测结果动态调整
let runMode = 'cpu'; // 'webgpu' | 'cpu'
let delayPerText = 50; // 默认 CPU 模式延迟（毫秒）

// 后台模式配置（由主进程通知切换）
// CPU ~15%，禁用 SIMD 降低峰值
let isBackgroundMode = false;
const BG_DELAY_PER_TEXT = 120; // 后台模式延迟 120ms/文本

// 检测运行环境：utilityProcess 或 child_process.fork
const isUtilityProcess = typeof process.parentPort !== 'undefined';

/**
 * 发送消息到主进程（兼容两种模式）
 */
function sendMessage(msg) {
  if (isUtilityProcess) {
    process.parentPort.postMessage(msg);
  } else {
    process.send(msg);
  }
}

/**
 * 检测 WebGPU 支持（在 Node.js/Electron 环境中）
 * 注意：Node.js 原生不支持 WebGPU，需要通过 Electron 渲染进程或特殊库支持
 * 这里主要检测 ONNX Runtime 的 GPU 后端是否可用
 */
async function detectGPUSupport() {
  try {
    // 尝试检测 CUDA/DirectML 支持（Windows）
    // @xenova/transformers v2 不直接支持 WebGPU，但可以检测 ONNX 后端
    const os = require('os');
    const platform = os.platform();
    
    // Windows 上检测是否有 NVIDIA GPU（通过环境变量或系统信息）
    if (platform === 'win32') {
      // 检查是否有 CUDA 相关环境变量
      if (process.env.CUDA_PATH || process.env.CUDA_HOME) {
        console.log('[EmbeddingChild] 检测到 CUDA 环境');
        return true;
      }
    }
    
    // 目前 @xenova/transformers v2 主要使用 CPU
    // WebGPU 支持需要 @huggingface/transformers v3（但有 DLL 兼容问题）
    return false;
  } catch {
    return false;
  }
}

/**
 * 初始化 Pipeline
 */
async function initialize(appPath) {
  if (isInitialized) {
    sendMessage({ type: 'initialized', success: true, mode: runMode, delayPerText });
    return;
  }

  try {
    // 检测 GPU 支持
    const hasGPU = await detectGPUSupport();
    
    if (hasGPU) {
      runMode = 'gpu';
      delayPerText = 0; // GPU 模式：无延迟，高速处理
      console.log('[EmbeddingChild] 检测到 GPU 支持，启用高速模式（无延迟）');
    } else {
      runMode = 'cpu';
      delayPerText = 20; // CPU 模式：20ms 延迟（小模型可以更快）
      console.log('[EmbeddingChild] 使用 CPU 模式（小模型），延迟 20ms/文本');
    }

    const { pipeline: createPipeline, env } = await import('@xenova/transformers');

    // 配置 Transformers.js 环境
    env.cacheDir = path.join(appPath, 'resources', 'models');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.useCustomCache = true;
    
    // ONNX Runtime 优化配置（降低 CPU 占用）
    env.backends.onnx.wasm.numThreads = 1; // 限制 WASM 线程数
    env.backends.onnx.wasm.simd = false; // 禁用 SIMD（降低 CPU 峰值）

    console.log('[EmbeddingChild] 模型目录:', env.cacheDir);

    // 创建 pipeline
    // 使用 bge-small-zh-v1.5 模型（~30MB 量化版）
    // 相比 bge-base-zh-v1.5（~100MB），CPU 占用降低约 60-70%
    pipeline = await createPipeline('feature-extraction', 'bge-small-zh-v1.5', {
      local_files_only: true,
      quantized: true,
    });

    isInitialized = true;
    console.log('[EmbeddingChild] 初始化完成');

    // 通知主进程当前运行模式
    sendMessage({ type: 'initialized', success: true, mode: runMode, delayPerText });
  } catch (error) {
    console.error('[EmbeddingChild] 初始化失败:', error.message || error);
    sendMessage({
      type: 'initialized',
      success: false,
      error: error.message,
    });
  }
}

/**
 * 生成向量（单个）
 */
async function generateEmbedding(id, text) {
  if (!pipeline) {
    sendMessage({
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

    sendMessage({
      type: 'embedding-result',
      id,
      success: true,
      vector,
    });
  } catch (error) {
    sendMessage({
      type: 'embedding-result',
      id,
      success: false,
      error: error.message,
    });
  }
}

/**
 * 批量生成向量（自适应延迟）
 * GPU 模式：无延迟，高速处理
 * CPU 模式：每处理一个文本后添加延迟，确保 CPU 有时间处理其他任务
 * 后台模式：更长延迟（200ms），CPU ~10%
 */
async function generateEmbeddingBatch(id, texts) {
  if (!pipeline) {
    sendMessage({
      type: 'embedding-batch-result',
      id,
      success: false,
      error: 'Pipeline 未初始化',
    });
    return;
  }

  try {
    const vectors = [];
    // 根据模式选择延迟时间
    const currentDelay = isBackgroundMode ? BG_DELAY_PER_TEXT : delayPerText;

    for (let i = 0; i < texts.length; i++) {
      try {
        const output = await pipeline(texts[i], { pooling: 'mean', normalize: true });
        vectors.push({
          index: i,
          vector: Array.from(output.data),
          success: true,
        });
        
        // 根据运行模式决定是否添加延迟
        if (currentDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
      } catch (err) {
        vectors.push({
          index: i,
          vector: null,
          success: false,
          error: err.message,
        });
      }
    }

    sendMessage({
      type: 'embedding-batch-result',
      id,
      success: true,
      vectors,
      totalCount: texts.length,
      successCount: vectors.filter(v => v.success).length,
      mode: runMode,
      isBackgroundMode,
    });
  } catch (error) {
    sendMessage({
      type: 'embedding-batch-result',
      id,
      success: false,
      error: error.message,
    });
  }
}

/**
 * 设置后台模式
 */
function setBackgroundMode(enabled) {
  isBackgroundMode = enabled;
  console.log(`[EmbeddingChild] 后台模式: ${enabled ? '开启' : '关闭'}`);
}

/**
 * 处理消息
 */
function handleMessage(msg) {
  const { type, id, data } = msg;

  switch (type) {
    case 'initialize':
      initialize(data.appPath);
      break;

    case 'generate':
      generateEmbedding(id, data.text);
      break;

    case 'generate-batch':
      generateEmbeddingBatch(id, data.texts);
      break;

    case 'set-background-mode':
      setBackgroundMode(data.enabled);
      break;

    case 'shutdown':
      process.exit(0);
  }
}

// 根据运行环境设置消息监听
if (isUtilityProcess) {
  process.parentPort.on('message', (event) => {
    handleMessage(event.data);
  });
  process.parentPort.postMessage({ type: 'ready' });
} else {
  process.on('message', handleMessage);
  process.send({ type: 'ready' });
}
