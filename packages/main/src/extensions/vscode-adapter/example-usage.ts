/**
 * VSIX 安装器使用示例
 */

import * as path from 'path';
import { VSIXInstaller } from './VSIXInstaller';

// 创建安装器实例
const extensionsPath = path.join(__dirname, '../../../../extensions');
const installer = new VSIXInstaller(extensionsPath);

/**
 * 示例 1: 安装本地 VSIX 文件
 */
async function example1_InstallLocalVSIX() {
  console.log('\n=== 示例 1: 安装本地 VSIX 文件 ===\n');

  const vsixPath = path.join(__dirname, '../../../../extensions/markdown-all-in-one.vsix');
  
  const result = await installer.installVSIX(vsixPath);

  if (result.success) {
    console.log('✅ 安装成功！');
    console.log('扩展 ID:', result.extensionId);
    console.log('扩展名称:', result.extension.name);
    console.log('版本:', result.extension.version);
    console.log('描述:', result.extension.description);
    console.log('安装路径:', result.extension.extensionPath);
  } else {
    console.error('❌ 安装失败:', result.error);
  }
}

/**
 * 示例 2: 从 Marketplace 安装
 */
async function example2_InstallFromMarketplace() {
  console.log('\n=== 示例 2: 从 Marketplace 安装 ===\n');

  // 安装 Python 扩展
  const result = await installer.installFromMarketplace('ms-python.python');

  if (result.success) {
    console.log('✅ 从 Marketplace 安装成功！');
    console.log('扩展 ID:', result.extensionId);
    console.log('扩展信息:', result.extension);
  } else {
    console.error('❌ 安装失败:', result.error);
  }
}

/**
 * 示例 3: 安装指定版本
 */
async function example3_InstallSpecificVersion() {
  console.log('\n=== 示例 3: 安装指定版本 ===\n');

  const result = await installer.installFromMarketplace('dbaeumer.vscode-eslint', '2.4.0');

  if (result.success) {
    console.log('✅ 安装指定版本成功！');
    console.log('扩展:', result.extension.name);
    console.log('版本:', result.extension.version);
  } else {
    console.error('❌ 安装失败:', result.error);
  }
}

/**
 * 示例 4: 批量安装多个扩展
 */
async function example4_BatchInstall() {
  console.log('\n=== 示例 4: 批量安装多个扩展 ===\n');

  const extensionsToInstall = [
    'esbenp.prettier-vscode',
    'formulahendry.auto-rename-tag',
    'ritwickdey.LiveServer'
  ];

  for (const extensionId of extensionsToInstall) {
    console.log(`\n正在安装: ${extensionId}...`);
    
    const result = await installer.installFromMarketplace(extensionId);
    
    if (result.success) {
      console.log(`✅ ${extensionId} 安装成功`);
    } else {
      console.error(`❌ ${extensionId} 安装失败:`, result.error);
    }
  }
}

/**
 * 示例 5: 安装项目中已有的 VSIX 文件
 */
async function example5_InstallProjectVSIX() {
  console.log('\n=== 示例 5: 安装项目中的 VSIX 文件 ===\n');

  const vsixFiles = [
    'extensions/markdown-all-in-one.vsix',
    'extensions/markdown-preview-github-styles.vsix',
    'extensions/vscode-markdownlint.vsix',
    'yoelvismulen.cobalt2-theme-tweaked-0.3.4.vsix'
  ];

  for (const vsixFile of vsixFiles) {
    const fullPath = path.join(__dirname, '../../../..', vsixFile);
    console.log(`\n安装: ${vsixFile}`);
    
    const result = await installer.installVSIX(fullPath);
    
    if (result.success) {
      console.log(`✅ 成功: ${result.extension.name} v${result.extension.version}`);
    } else {
      console.error(`❌ 失败:`, result.error);
    }
  }
}

/**
 * 示例 6: 卸载扩展
 */
async function example6_UninstallExtension() {
  console.log('\n=== 示例 6: 卸载扩展 ===\n');

  const extensionId = 'ms-python.python';
  
  try {
    await installer.uninstall(extensionId);
    console.log(`✅ 扩展 ${extensionId} 已卸载`);
  } catch (error) {
    console.error(`❌ 卸载失败:`, error);
  }
}

/**
 * 示例 7: 完整的安装流程（带错误处理）
 */
async function example7_CompleteInstallFlow() {
  console.log('\n=== 示例 7: 完整的安装流程 ===\n');

  const extensionId = 'christian-kohler.path-intellisense';

  try {
    console.log(`步骤 1: 从 Marketplace 下载并安装 ${extensionId}...`);
    const result = await installer.installFromMarketplace(extensionId);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('✅ 步骤 1 完成 - 安装成功');
    console.log('扩展信息:');
    console.log('  - ID:', result.extensionId);
    console.log('  - 名称:', result.extension.name);
    console.log('  - 版本:', result.extension.version);
    console.log('  - 路径:', result.extension.extensionPath);

    // 模拟使用扩展...
    console.log('\n步骤 2: 扩展正在运行...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n步骤 3: 卸载扩展...');
    await installer.uninstall(result.extensionId);
    console.log('✅ 步骤 3 完成 - 卸载成功');

  } catch (error) {
    console.error('❌ 流程失败:', error);
  }
}

/**
 * 主函数 - 运行所有示例
 */
async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   VSIX 安装器使用示例演示             ║');
  console.log('╚═══════════════════════════════════════╝');

  try {
    // 取消注释以运行特定示例
    
    // await example1_InstallLocalVSIX();
    // await example2_InstallFromMarketplace();
    // await example3_InstallSpecificVersion();
    // await example4_BatchInstall();
    // await example5_InstallProjectVSIX();
    // await example6_UninstallExtension();
    await example7_CompleteInstallFlow();

    console.log('\n✅ 所有示例执行完成！');
  } catch (error) {
    console.error('\n❌ 发生错误:', error);
  }
}

// 导出示例函数供外部调用
export {
  example1_InstallLocalVSIX,
  example2_InstallFromMarketplace,
  example3_InstallSpecificVersion,
  example4_BatchInstall,
  example5_InstallProjectVSIX,
  example6_UninstallExtension,
  example7_CompleteInstallFlow
};

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main().catch(console.error);
}
