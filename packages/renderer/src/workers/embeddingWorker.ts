/**
 * Embedding Web Worker
 * 功能：在独立线程中执行向量化，支持 WebGPU 加速
 * 描述：使用 @huggingface/transformers v3，利用 WebGPU 进行 GPU 加速向量化
 */

import { pipeline, env } from '@huggingface/transformers';

// 扩展 Navigator 类型以支持 WebGPU
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<GPUAdapter | null>;
    };
  }
  interface GPUAdapter {
    requestAdapterInfo(): Promise<{ vendor: string; architecture: string }>;
  }
}

// Pipeline 类型 - 使用简化类型避免复杂联合类型
interface SimplePipeline {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (text: string, options?: Record<string, unknown>): Promise<{ data: Float32Array }>;
}

// Worker 状态
let embeddingPipeline: SimplePipeline | null = null;
let isInitialized = false;
let currentDevice: 'webgpu' | 'wasm' = 'wasm';

// 消息类型定义
interface InitMessage {
  type: 'init';
  modelPath: string;
}

interface EmbedMessage {
  type: 'embed';
  id: string;
  texts: string[];
}

interface TestMessage {
  type: 'test';
}

type WorkerMessage = InitMessage | EmbedMessage | TestMessage;

/**
 * 检测 WebGPU 支持
 */
async function detectWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return false;
  }
  
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      const info = await adapter.requestAdapterInfo();
      self.postMessage({
        type: 'log',
        message: `WebGPU 适配器: ${info.vendor} - ${info.architecture}`,
      });
      return true;
    }
  } catch (e) {
    self.postMessage({
      type: 'log',
      message: `WebGPU 检测失败: ${e}`,
    });
  }
  
  return false;
}

/**
 * 初始化 Pipeline
 */
async function initialize(modelPath: string): Promise<void> {
  if (isInitialized) {
    self.postMessage({ type: 'initialized', success: true, device: currentDevice });
    return;
  }

  try {
    self.postMessage({ type: 'log', message: '开始初始化 Embedding Worker...' });

    // 检测 WebGPU
    const hasWebGPU = await detectWebGPU();
    currentDevice = hasWebGPU ? 'webgpu' : 'wasm';
    
    self.postMessage({ 
      type: 'log', 
      message: `使用设备: ${currentDevice}${hasWebGPU ? ' (GPU 加速)' : ' (CPU)'}` 
    });

    // 配置环境 - 使用 file:// 协议访问本地模型
    // 将 Windows 路径转换为 file:// URL
    let modelUrl = modelPath;
    if (modelPath.includes(':')) {
      // Windows 路径，如 E:\path\to\models
      modelUrl = 'file:///' + modelPath.replace(/\\/g, '/');
    } else if (!modelPath.startsWith('file://')) {
      modelUrl = 'file://' + modelPath;
    }
    
    self.postMessage({ type: 'log', message: `模型 URL: ${modelUrl}` });
    
    env.cacheDir = modelUrl;
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useBrowserCache = false;

    // 创建 pipeline
    self.postMessage({ type: 'log', message: '加载模型: bge-small-zh-v1.5...' });
    
    const startTime = performance.now();
    const pipelineResult = await pipeline('feature-extraction', 'bge-small-zh-v1.5', {
      local_files_only: true,
      device: currentDevice,
    });
    embeddingPipeline = pipelineResult as unknown as SimplePipeline;
    const loadTime = Math.round(performance.now() - startTime);

    isInitialized = true;
    self.postMessage({ 
      type: 'initialized', 
      success: true, 
      device: currentDevice,
      loadTime,
    });
    
    self.postMessage({ 
      type: 'log', 
      message: `模型加载完成 (${loadTime}ms)` 
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: 'initialized',
      success: false,
      error: errorMsg,
    });
    self.postMessage({ type: 'log', message: `初始化失败: ${errorMsg}` });
  }
}

/**
 * 批量生成向量
 */
async function generateEmbeddings(id: string, texts: string[]): Promise<void> {
  if (!embeddingPipeline) {
    self.postMessage({
      type: 'embed-result',
      id,
      success: false,
      error: 'Pipeline 未初始化',
    });
    return;
  }

  try {
    const startTime = performance.now();
    const vectors: Array<{ index: number; vector: number[]; success: boolean }> = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const output = await embeddingPipeline(texts[i], { 
          pooling: 'mean', 
          normalize: true 
        });
        vectors.push({
          index: i,
          vector: Array.from(output.data as Float32Array),
          success: true,
        });
      } catch (e) {
        vectors.push({
          index: i,
          vector: [],
          success: false,
        });
      }
    }

    const totalTime = Math.round(performance.now() - startTime);
    const avgTime = Math.round(totalTime / texts.length);

    self.postMessage({
      type: 'embed-result',
      id,
      success: true,
      vectors,
      totalTime,
      avgTime,
      device: currentDevice,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: 'embed-result',
      id,
      success: false,
      error: errorMsg,
    });
  }
}

/**
 * 运行测试
 */
async function runTest(): Promise<void> {
  self.postMessage({ type: 'log', message: '========== WebGPU 测试开始 ==========' });
  
  const testTexts = [
    '这是一个测试文本',
    '人工智能正在改变世界',
    'Transformers.js 是一个强大的库',
    '知识库向量化可以提高搜索效率',
    'WebGPU 可以加速机器学习推理',
  ];

  self.postMessage({ type: 'log', message: `测试文本数量: ${testTexts.length}` });

  if (!embeddingPipeline) {
    self.postMessage({ type: 'log', message: '错误: Pipeline 未初始化' });
    self.postMessage({ type: 'test-result', success: false, error: 'Pipeline 未初始化' });
    return;
  }

  try {
    const results: Array<{ text: string; time: number; dim: number }> = [];
    let totalTime = 0;

    for (let i = 0; i < testTexts.length; i++) {
      const text = testTexts[i];
      const start = performance.now();
      const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
      const time = Math.round(performance.now() - start);
      totalTime += time;
      
      const vector = Array.from(output.data as Float32Array);
      results.push({ text: text.substring(0, 15) + '...', time, dim: vector.length });
      
      self.postMessage({ 
        type: 'log', 
        message: `  [${i + 1}] "${text.substring(0, 15)}..." - ${time}ms (${vector.length}维)` 
      });
    }

    const avgTime = Math.round(totalTime / testTexts.length);
    
    self.postMessage({ type: 'log', message: '========== 测试结果 ==========' });
    self.postMessage({ type: 'log', message: `设备: ${currentDevice}` });
    self.postMessage({ type: 'log', message: `总耗时: ${totalTime}ms` });
    self.postMessage({ type: 'log', message: `平均耗时: ${avgTime}ms/文本` });
    
    self.postMessage({ 
      type: 'test-result', 
      success: true, 
      device: currentDevice,
      totalTime,
      avgTime,
      results,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: 'log', message: `测试失败: ${errorMsg}` });
    self.postMessage({ type: 'test-result', success: false, error: errorMsg });
  }
}

// 监听消息
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  switch (type) {
    case 'init':
      await initialize(event.data.modelPath);
      break;

    case 'embed':
      await generateEmbeddings(event.data.id, event.data.texts);
      break;

    case 'test':
      await runTest();
      break;
  }
};

// 通知主线程 Worker 已加载
self.postMessage({ type: 'ready' });
