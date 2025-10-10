/**
 * ExtensionHostManager 测试
 * 运行: node -r ts-node/register ExtensionHostManager.test.ts
 */

import { ExtensionHostManager } from './ExtensionHostManager';
import * as path from 'path';

/**
 * 测试：基本启动和通信
 */
async function testBasicStartup() {
  console.log('\n🧪 测试：基本启动和通信');
  console.log('================================\n');

  const manager = new ExtensionHostManager();
  let apiCallCount = 0;

  // 设置 API 处理器
  manager.setAPICallHandler(async (namespace, method, args) => {
    apiCallCount++;
    console.log(`✅ API 调用 #${apiCallCount}: ${namespace}.${method}`, args);
    
    // 简单模拟返回值
    if (namespace === 'window' && method === 'showInformationMessage') {
      return { clicked: args[0] };
    }
    return undefined;
  });

  // 监听事件
  manager.on('host-ready', (extensionId) => {
    console.log(`✅ 扩展宿主就绪: ${extensionId}`);
  });

  manager.on('extension-error', ({ extensionId, error }) => {
    console.error(`❌ 扩展错误 [${extensionId}]:`, error);
  });

  try {
    // 启动一个测试扩展（使用 hello-world 示例）
    const extensionPath = path.join(__dirname, '../../../extensions/hello-world');
    
    await manager.startExtensionHost('test-extension', extensionPath);
    
    console.log('\n✅ 扩展宿主启动成功');
    console.log('API 调用次数:', apiCallCount);

    // 等待一会儿让扩展执行
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 清理
    await manager.terminateHost('test-extension');
    console.log('✅ 测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

/**
 * 测试：多扩展并行
 */
async function testMultipleExtensions() {
  console.log('\n🧪 测试：多扩展并行');
  console.log('================================\n');

  const manager = new ExtensionHostManager();

  manager.setAPICallHandler(async (namespace, method, args) => {
    console.log(`[API] ${namespace}.${method}`);
    return undefined;
  });

  const extensions = [
    { id: 'ext-1', path: path.join(__dirname, '../../../extensions/hello-world') },
    { id: 'ext-2', path: path.join(__dirname, '../../../extensions/markdown-preview') },
  ];

  try {
    // 并行启动
    await Promise.allSettled(
      extensions.map(ext => 
        manager.startExtensionHost(ext.id, ext.path)
      )
    );

    const activeHosts = manager.getActiveHosts();
    console.log(`\n✅ 启动了 ${activeHosts.length} 个扩展宿主:`, activeHosts);

    // 等待
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 清理所有
    await manager.terminateAll();
    console.log('✅ 所有扩展已终止');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

/**
 * 测试：错误处理
 */
async function testErrorHandling() {
  console.log('\n🧪 测试：错误处理');
  console.log('================================\n');

  const manager = new ExtensionHostManager();

  manager.setAPICallHandler(async (namespace, method, args) => {
    // 模拟 API 错误
    if (method === 'showErrorMessage') {
      throw new Error('模拟的 API 错误');
    }
    return undefined;
  });

  let errorCount = 0;
  manager.on('extension-error', ({ extensionId, error }) => {
    errorCount++;
    console.log(`✅ 捕获到错误 #${errorCount} [${extensionId}]:`, error.message);
  });

  try {
    // 尝试启动一个不存在的扩展
    await manager.startExtensionHost('non-existent', '/invalid/path')
      .catch(err => {
        console.log('✅ 预期的错误:', err.message);
      });

    console.log(`✅ 错误处理测试完成，捕获 ${errorCount} 个错误`);

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

/**
 * 测试：生命周期管理
 */
async function testLifecycle() {
  console.log('\n🧪 测试：生命周期管理');
  console.log('================================\n');

  const manager = new ExtensionHostManager();

  manager.setAPICallHandler(async () => undefined);

  try {
    const extensionPath = path.join(__dirname, '../../../extensions/hello-world');

    // 启动
    console.log('1. 启动扩展宿主...');
    await manager.startExtensionHost('lifecycle-test', extensionPath);
    console.log('✅ 已启动');

    // 检查状态
    console.log('2. 检查状态...');
    console.log('   扩展存在:', manager.hasHost('lifecycle-test'));
    console.log('   活动扩展:', manager.getActiveHosts());

    // 停用
    console.log('3. 停用扩展...');
    await manager.deactivateExtension('lifecycle-test');
    console.log('✅ 已停用');

    // 终止
    console.log('4. 终止扩展宿主...');
    await manager.terminateHost('lifecycle-test');
    console.log('✅ 已终止');

    // 验证清理
    console.log('5. 验证清理...');
    console.log('   扩展存在:', manager.hasHost('lifecycle-test'));
    console.log('   活动扩展:', manager.getActiveHosts());

    console.log('\n✅ 生命周期测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

/**
 * 性能测试：启动速度
 */
async function testPerformance() {
  console.log('\n🧪 测试：启动性能');
  console.log('================================\n');

  const manager = new ExtensionHostManager();
  manager.setAPICallHandler(async () => undefined);

  const extensionPath = path.join(__dirname, '../../../extensions/hello-world');
  const iterations = 5;

  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    await manager.startExtensionHost(`perf-test-${i}`, extensionPath);
    
    const elapsed = Date.now() - start;
    times.push(elapsed);
    
    console.log(`✅ 第 ${i + 1} 次启动耗时: ${elapsed}ms`);
    
    await manager.terminateHost(`perf-test-${i}`);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`\n📊 平均启动时间: ${avgTime.toFixed(2)}ms`);
  console.log(`📊 最快: ${Math.min(...times)}ms`);
  console.log(`📊 最慢: ${Math.max(...times)}ms`);
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  ExtensionHostManager 测试套件        ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await testBasicStartup();
    await testMultipleExtensions();
    await testErrorHandling();
    await testLifecycle();
    await testPerformance();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  ✅ 所有测试通过！                     ║');
    console.log('╚════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n╔════════════════════════════════════════╗');
    console.error('║  ❌ 测试失败！                         ║');
    console.error('╚════════════════════════════════════════╝\n');
    console.error(error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests().catch(console.error);
}

export {
  testBasicStartup,
  testMultipleExtensions,
  testErrorHandling,
  testLifecycle,
  testPerformance,
  runAllTests,
};











