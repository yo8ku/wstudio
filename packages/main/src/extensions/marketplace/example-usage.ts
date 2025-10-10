/**
 * MarketplaceClient 使用示例
 */

import { MarketplaceClient } from './MarketplaceClient';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 使用示例
 */
export async function exampleUsage() {
  const client = new MarketplaceClient();

  // 示例 1: 搜索扩展
  console.log('=== 示例 1: 搜索扩展 ===');
  try {
    const results = await client.searchExtensions('prettier', 10);
    console.log(`找到 ${results.length} 个扩展:`);
    
    results.forEach((ext, index) => {
      console.log(`\n${index + 1}. ${ext.displayName}`);
      console.log(`   ID: ${ext.extensionId}`);
      console.log(`   发布者: ${ext.publisher.displayName}`);
      console.log(`   版本: ${ext.version}`);
      console.log(`   描述: ${ext.description}`);
      console.log(`   下载量: ${ext.installCount.toLocaleString()}`);
      console.log(`   评分: ${ext.rating.toFixed(1)} (${ext.ratingCount} 评价)`);
      if (ext.categories.length > 0) {
        console.log(`   分类: ${ext.categories.join(', ')}`);
      }
    });
  } catch (error) {
    console.error('搜索失败:', error);
  }

  // 示例 2: 获取扩展详情
  console.log('\n\n=== 示例 2: 获取扩展详情 ===');
  try {
    const extensionId = 'esbenp.prettier-vscode';
    const details = await client.getExtensionDetails(extensionId);
    
    if (details) {
      console.log(`扩展名称: ${details.displayName}`);
      console.log(`ID: ${details.extensionId}`);
      console.log(`发布者: ${details.publisher.displayName}`);
      console.log(`当前版本: ${details.version}`);
      console.log(`描述: ${details.description}`);
      console.log(`下载量: ${details.installCount.toLocaleString()}`);
      console.log(`评分: ${details.rating.toFixed(1)}`);
      console.log(`可用版本数量: ${details.versions.length}`);
      
      if (details.versions.length > 0) {
        console.log('\n最近的版本:');
        details.versions.slice(0, 5).forEach(v => {
          console.log(`  - ${v.version} (${new Date(v.lastUpdated).toLocaleDateString()})`);
        });
      }
    }
  } catch (error) {
    console.error('获取详情失败:', error);
  }

  // 示例 3: 下载扩展
  console.log('\n\n=== 示例 3: 下载扩展 ===');
  try {
    const extensionId = 'esbenp.prettier-vscode';
    const version = '10.1.0'; // 指定版本
    
    console.log(`开始下载: ${extensionId}@${version}`);
    const buffer = await client.downloadExtension(extensionId, version);
    
    // 保存到文件
    const outputDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `${extensionId.replace('.', '-')}-${version}.vsix`);
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`下载完成! 文件已保存到: ${outputPath}`);
    console.log(`文件大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error('下载失败:', error);
  }
}

/**
 * 批量下载扩展
 */
export async function batchDownloadExtensions(extensionIds: string[]) {
  const client = new MarketplaceClient();
  const outputDir = path.join(process.cwd(), 'downloads');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`准备批量下载 ${extensionIds.length} 个扩展...`);

  for (const extensionId of extensionIds) {
    try {
      // 获取最新版本
      const details = await client.getExtensionDetails(extensionId);
      if (!details) {
        console.error(`✗ 未找到扩展: ${extensionId}`);
        continue;
      }

      console.log(`\n正在下载: ${details.displayName} (${details.version})`);
      
      // 下载扩展
      const buffer = await client.downloadExtension(extensionId, details.version);
      
      // 保存文件
      const fileName = `${extensionId.replace('.', '-')}-${details.version}.vsix`;
      const outputPath = path.join(outputDir, fileName);
      fs.writeFileSync(outputPath, buffer);
      
      console.log(`✓ 下载成功: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      console.error(`✗ 下载失败: ${extensionId}`, error);
    }
  }

  console.log('\n批量下载完成!');
}

/**
 * 搜索并下载热门扩展
 */
export async function downloadPopularExtensions(query: string, count: number = 5) {
  const client = new MarketplaceClient();
  
  console.log(`搜索 "${query}" 相关的扩展...`);
  const results = await client.searchExtensions(query, count);
  
  if (results.length === 0) {
    console.log('未找到相关扩展');
    return;
  }

  // 按下载量排序
  results.sort((a, b) => b.installCount - a.installCount);
  
  console.log(`\n找到 ${results.length} 个扩展，按下载量排序:`);
  results.forEach((ext, index) => {
    console.log(`${index + 1}. ${ext.displayName} - ${ext.installCount.toLocaleString()} 下载`);
  });

  // 下载前 N 个
  const extensionIds = results.slice(0, count).map(ext => ext.extensionId);
  await batchDownloadExtensions(extensionIds);
}

// 如果直接运行此文件
if (require.main === module) {
  exampleUsage().catch(console.error);
  
  // 或者运行其他示例:
  // batchDownloadExtensions([
  //   'esbenp.prettier-vscode',
  //   'dbaeumer.vscode-eslint',
  //   'ms-python.python'
  // ]).catch(console.error);
  
  // downloadPopularExtensions('theme', 3).catch(console.error);
}



