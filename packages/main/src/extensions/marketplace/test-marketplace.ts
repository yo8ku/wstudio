/**
 * MarketplaceClient 测试脚本
 * 运行: ts-node packages/main/src/extensions/marketplace/test-marketplace.ts
 */

import { MarketplaceClient } from './MarketplaceClient';

async function testMarketplaceClient() {
  const client = new MarketplaceClient();

  console.log('='.repeat(60));
  console.log('VSCode Marketplace 客户端测试');
  console.log('='.repeat(60));

  // 测试 1: 搜索扩展
  console.log('\n📦 测试 1: 搜索扩展');
  console.log('-'.repeat(60));
  try {
    const query = 'prettier';
    console.log(`搜索关键词: "${query}"`);
    
    const results = await client.searchExtensions(query, 5);
    console.log(`✓ 找到 ${results.length} 个扩展\n`);

    results.forEach((ext, index) => {
      console.log(`${index + 1}. ${ext.displayName}`);
      console.log(`   ID: ${ext.extensionId}`);
      console.log(`   发布者: ${ext.publisher.displayName}`);
      console.log(`   版本: ${ext.version}`);
      console.log(`   下载量: ${ext.installCount.toLocaleString()}`);
      console.log(`   评分: ${ext.rating.toFixed(1)} ⭐ (${ext.ratingCount} 评价)`);
      if (ext.categories.length > 0) {
        console.log(`   分类: ${ext.categories.join(', ')}`);
      }
      console.log();
    });
  } catch (error) {
    console.error('✗ 搜索失败:', error);
  }

  // 测试 2: 获取扩展详情
  console.log('\n📋 测试 2: 获取扩展详情');
  console.log('-'.repeat(60));
  try {
    const extensionId = 'esbenp.prettier-vscode';
    console.log(`扩展 ID: ${extensionId}`);
    
    const details = await client.getExtensionDetails(extensionId);
    
    if (details) {
      console.log('✓ 获取成功\n');
      console.log(`名称: ${details.displayName}`);
      console.log(`ID: ${details.extensionId}`);
      console.log(`发布者: ${details.publisher.displayName} (${details.publisher.publisherName})`);
      console.log(`当前版本: ${details.version}`);
      console.log(`描述: ${details.description}`);
      console.log(`下载量: ${details.installCount.toLocaleString()}`);
      console.log(`评分: ${details.rating.toFixed(2)} ⭐`);
      console.log(`可用版本数: ${details.versions.length}`);
      
      if (details.versions.length > 0) {
        console.log('\n最近 5 个版本:');
        details.versions.slice(0, 5).forEach((v, i) => {
          const date = new Date(v.lastUpdated).toLocaleDateString('zh-CN');
          console.log(`  ${i + 1}. v${v.version} - ${date}`);
        });
      }
      
      if (details.icon) {
        console.log(`\n图标: ${details.icon}`);
      }
    } else {
      console.log('✗ 未找到扩展');
    }
  } catch (error) {
    console.error('✗ 获取详情失败:', error);
  }

  // 测试 3: 获取下载 URL
  console.log('\n\n🔗 测试 3: 生成下载 URL');
  console.log('-'.repeat(60));
  try {
    const extensionId = 'esbenp.prettier-vscode';
    const version = '10.1.0';
    
    const downloadUrl = await client.getDownloadUrl(extensionId, version);
    console.log(`扩展: ${extensionId}@${version}`);
    console.log(`下载地址: ${downloadUrl}`);
    console.log('✓ URL 生成成功');
  } catch (error) {
    console.error('✗ 生成 URL 失败:', error);
  }

  // 测试 4: 测试兼容性方法
  console.log('\n\n🔄 测试 4: 兼容性方法');
  console.log('-'.repeat(60));
  try {
    // 使用旧的 search 方法
    const results = await client.search('theme');
    console.log(`search() 方法: 找到 ${results.length} 个扩展`);
    
    if (results.length > 0) {
      console.log(`第一个结果: ${results[0].name} by ${results[0].publisher}`);
    }
    
    // 使用旧的 getExtension 方法
    const extension = await client.getExtension('esbenp.prettier-vscode');
    if (extension) {
      console.log(`getExtension() 方法: ${extension.name} v${extension.version}`);
    }
    
    console.log('✓ 兼容性方法测试通过');
  } catch (error) {
    console.error('✗ 兼容性测试失败:', error);
  }

  // 测试 5: 错误处理
  console.log('\n\n⚠️  测试 5: 错误处理');
  console.log('-'.repeat(60));
  
  // 测试无效的扩展 ID
  try {
    console.log('测试无效的扩展 ID...');
    await client.getExtensionDetails('invalid-extension-id-format');
    console.log('✗ 应该抛出错误');
  } catch (error) {
    console.log('✓ 正确处理无效扩展 ID');
  }

  // 测试不存在的扩展
  try {
    console.log('测试不存在的扩展...');
    const result = await client.getExtensionDetails('nonexistent.publisher-extension-xyz');
    if (!result) {
      console.log('✓ 正确返回 null（扩展不存在）');
    }
  } catch (error) {
    console.log('✓ 正确处理不存在的扩展');
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成！');
  console.log('='.repeat(60));
}

// 运行测试
if (require.main === module) {
  testMarketplaceClient().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}



