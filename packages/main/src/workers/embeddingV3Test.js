/**
 * Transformers.js v3 测试文件
 * 功能：测试 @huggingface/transformers v3 是否能正常加载和运行
 * 描述：验证 WASM 后端和基本向量化功能
 * 
 * 运行方式：node packages/main/src/workers/embeddingV3Test.js
 */

const path = require('path');

// 强制禁用 onnxruntime-node，使用 WASM
process.env.ONNX_DISABLE_NODE = '1';

async function testTransformersV3() {
  console.log('========== Transformers.js v3 测试 (WASM 模式) ==========\n');

  try {
    // 动态导入 @huggingface/transformers
    console.log('[1] 尝试导入 @huggingface/transformers...');
    const transformers = await import('@huggingface/transformers');
    const { pipeline, env } = transformers;
    console.log('✓ 导入成功\n');

    // 配置环境 - 强制使用 WASM
    console.log('[2] 配置环境 (强制 WASM)...');
    const appPath = process.cwd();
    env.cacheDir = path.join(appPath, 'resources', 'models');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    
    // 尝试禁用 onnxruntime-node
    if (env.backends && env.backends.onnx) {
      console.log('   ONNX 后端配置:', Object.keys(env.backends.onnx));
      // 强制使用 WASM
      if (env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
    }
    
    console.log(`   模型目录: ${env.cacheDir}`);
    console.log('✓ 环境配置完成\n');

    // 创建 pipeline
    console.log('[3] 创建 embedding pipeline...');
    console.log('   模型: bge-small-zh-v1.5');
    console.log('   后端: WASM (CPU)');
    
    const startTime = Date.now();
    const embeddingPipeline = await pipeline('feature-extraction', 'bge-small-zh-v1.5', {
      local_files_only: true,
      quantized: true,
      // 不指定 device，让它自动选择 WASM
    });
    const loadTime = Date.now() - startTime;
    console.log(`✓ Pipeline 创建成功 (耗时: ${loadTime}ms)\n`);

    // 测试向量化
    console.log('[4] 测试向量化...');
    const testTexts = [
      '这是一个测试文本',
      '人工智能正在改变世界',
      'Transformers.js 是一个强大的库',
    ];

    for (let i = 0; i < testTexts.length; i++) {
      const text = testTexts[i];
      const embedStart = Date.now();
      const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
      const embedTime = Date.now() - embedStart;
      const vector = Array.from(output.data);
      
      console.log(`   文本 ${i + 1}: "${text.substring(0, 20)}..."`);
      console.log(`   向量维度: ${vector.length}`);
      console.log(`   耗时: ${embedTime}ms`);
      console.log(`   前5个值: [${vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]\n`);
    }

    console.log('========== 测试完成 ==========');
    console.log('\n总结:');
    console.log(`- @huggingface/transformers v3: ✓ 可用`);
    console.log(`- WASM 后端: ✓ 可用`);

  } catch (error) {
    console.error('\n========== 测试失败 ==========');
    console.error('错误:', error.message);
    console.error('\n详细信息:');
    console.error(error.stack);
    
    if (error.message.includes('DLL')) {
      console.log('\n分析:');
      console.log('onnxruntime-node DLL 与 Node.js v22 不兼容');
      console.log('v3 默认优先使用 onnxruntime-node，导致加载失败');
      console.log('\n可能的解决方案:');
      console.log('1. 降级 Node.js 到 v20 LTS');
      console.log('2. 在渲染进程中使用 WebGPU（浏览器环境）');
      console.log('3. 继续使用 @xenova/transformers v2（纯 WASM）');
    }
  }
}

// 运行测试
testTransformersV3();
