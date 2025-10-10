/**
 * 主题管理器集成示例
 */

import { ThemeManager } from './ThemeManager';
import { ExtensionManager } from './ExtensionManager';
import * as path from 'path';

/**
 * 示例 1: 基本使用
 */
async function example1_BasicUsage() {
  console.log('=== 示例 1: 基本使用 ===\n');
  
  const themeManager = new ThemeManager();
  
  // 加载内置主题
  const builtinThemePath = path.join(__dirname, '../../../builtin-extensions/theme-default');
  await themeManager.registerThemesFromExtension(builtinThemePath);
  
  // 获取所有主题
  const allThemes = themeManager.getAllThemes();
  console.log(`共有 ${allThemes.length} 个主题:\n`);
  
  allThemes.forEach(theme => {
    console.log(`  - ${theme.name} (${theme.id})`);
  });
  
  // 应用主题
  if (allThemes.length > 0) {
    await themeManager.applyTheme(allThemes[0].id);
    console.log(`\n已应用主题: ${allThemes[0].name}`);
  }
}

/**
 * 示例 2: 扩展管理器集成
 */
async function example2_ExtensionManagerIntegration() {
  console.log('\n=== 示例 2: 扩展管理器集成 ===\n');
  
  const extensionsPath = path.join(__dirname, '../../../extensions');
  const extensionManager = new ExtensionManager(extensionsPath);
  const themeManager = new ThemeManager();
  
  // 初始化扩展管理器
  await extensionManager.initialize();
  
  // 注意：ExtensionManager 目前不支持事件系统，这里仅作示例
  // extensionManager.on('extensionInstalled', async (extension: any) => {
  //   console.log(`\n扩展已安装: ${extension.name}`);
  //   
  //   // 尝试加载主题
  //   const count = await themeManager.registerThemesFromExtension(extension.extensionPath || '');
  //   if (count > 0) {
  //     console.log(`  从扩展加载了 ${count} 个主题`);
  //   }
  // });
  
  // extensionManager.on('extensionUninstalled', (extensionId: string) => {
  //   console.log(`\n扩展已卸载: ${extensionId}`);
  //   
  //   // 取消注册主题
  //   const count = themeManager.unregisterThemesByExtension(extensionId);
  //   if (count > 0) {
  //     console.log(`  取消注册了 ${count} 个主题`);
  //   }
  // });
  
  // 加载已安装扩展的主题
  const extensions = extensionManager.getAllExtensions();
  for (const ext of extensions) {
    await themeManager.registerThemesFromExtension(ext.extensionPath || extensionsPath + '/' + ext.id);
  }
  
  // 显示统计信息
  const stats = themeManager.getStats();
  console.log('\n主题统计:');
  console.log(`  总计: ${stats.total}`);
  console.log(`  浅色: ${stats.light}`);
  console.log(`  深色: ${stats.dark}`);
  console.log(`  高对比: ${stats.hc}`);
}

/**
 * 示例 3: 主题切换和预览
 */
async function example3_ThemeSwitchingAndPreview() {
  console.log('\n=== 示例 3: 主题切换和预览 ===\n');
  
  const themeManager = new ThemeManager();
  
  // 监听主题变更事件
  themeManager.on('themeChanged', (event: any) => {
    console.log(`\n主题已切换:`);
    console.log(`  ID: ${event.themeId}`);
    console.log(`  名称: ${event.theme.name}`);
    console.log(`  类型: ${event.theme.type}`);
  });
  
  // 加载多个主题扩展
  const extensionsDir = path.join(__dirname, '../../../extensions');
  const themeExtensions = ['dracula-theme', 'github-theme', 'night-owl-theme'];
  
  for (const extName of themeExtensions) {
    const extPath = path.join(extensionsDir, extName);
    await themeManager.registerThemesFromExtension(extPath);
  }
  
  // 获取所有深色主题
  const darkThemes = themeManager.getThemesByType('dark');
  console.log(`找到 ${darkThemes.length} 个深色主题:\n`);
  
  // 显示预览信息
  darkThemes.forEach(theme => {
    const preview = themeManager.getThemePreview(theme.id);
    if (preview) {
      console.log(`${theme.name}:`);
      console.log(`  背景: ${preview.primaryColors.background}`);
      console.log(`  前景: ${preview.primaryColors.foreground}`);
      console.log(`  强调: ${preview.primaryColors.accent}\n`);
    }
  });
  
  // 切换到第一个深色主题
  if (darkThemes.length > 0) {
    await themeManager.applyTheme(darkThemes[0].id);
  }
}

/**
 * 示例 4: 主题搜索
 */
async function example4_ThemeSearch() {
  console.log('\n=== 示例 4: 主题搜索 ===\n');
  
  const themeManager = new ThemeManager();
  
  // 加载主题
  const extensionsDir = path.join(__dirname, '../../../extensions');
  await themeManager.registerThemesFromExtension(
    path.join(extensionsDir, 'dracula-theme')
  );
  await themeManager.registerThemesFromExtension(
    path.join(extensionsDir, 'github-theme')
  );
  
  // 搜索主题
  const searchTerms = ['dracula', 'github', 'dark'];
  
  searchTerms.forEach(term => {
    const results = themeManager.searchThemes(term);
    console.log(`搜索 "${term}": 找到 ${results.length} 个结果`);
    results.forEach(theme => {
      console.log(`  - ${theme.name} (${theme.id})`);
    });
    console.log('');
  });
}

/**
 * 示例 5: 主题导入导出
 */
async function example5_ImportExport() {
  console.log('\n=== 示例 5: 主题导入导出 ===\n');
  
  const themeManager = new ThemeManager();
  
  // 加载一个主题
  const themePath = path.join(__dirname, '../../../builtin-extensions/theme-default');
  await themeManager.registerThemesFromExtension(themePath);
  
  const themes = themeManager.getAllThemes();
  if (themes.length > 0) {
    const theme = themes[0];
    
    // 导出主题
    const exported = themeManager.exportTheme(theme.id);
    if (exported) {
      console.log('导出的主题配置:');
      console.log(exported.substring(0, 500) + '...\n');
      
      // 修改主题 ID 后重新导入
      const modifiedTheme = JSON.parse(exported);
      modifiedTheme.id = 'imported-theme';
      modifiedTheme.name = '导入的主题';
      
      const success = themeManager.importTheme(JSON.stringify(modifiedTheme));
      if (success) {
        console.log('主题导入成功!');
        console.log(`新主题数量: ${themeManager.getAllThemes().length}`);
      }
    }
  }
}

/**
 * 示例 6: 完整的应用集成流程
 */
async function example6_FullApplicationIntegration() {
  console.log('\n=== 示例 6: 完整应用集成 ===\n');
  
  // 1. 初始化主题管理器
  const themeManager = new ThemeManager();
  
  // 2. 加载内置主题
  console.log('1. 加载内置主题...');
  const builtinPath = path.join(__dirname, '../../../builtin-extensions/theme-default');
  await themeManager.registerThemesFromExtension(builtinPath);
  
  // 3. 加载已安装扩展的主题
  console.log('2. 加载扩展主题...');
  const extensionsDir = path.join(__dirname, '../../../extensions');
  const extensions = ['dracula-theme', 'github-theme'];
  
  for (const ext of extensions) {
    try {
      await themeManager.registerThemesFromExtension(path.join(extensionsDir, ext));
    } catch (error) {
      console.log(`  跳过 ${ext} (未找到或加载失败)`);
    }
  }
  
  // 4. 显示可用主题
  console.log('\n3. 可用主题列表:');
  themeManager.getAllThemes().forEach((theme, index) => {
    console.log(`  ${index + 1}. ${theme.name} (${theme.type})`);
  });
  
  // 5. 应用默认深色主题
  console.log('\n4. 应用默认主题...');
  const darkThemes = themeManager.getThemesByType('dark');
  if (darkThemes.length > 0) {
    await themeManager.applyTheme(darkThemes[0].id);
  }
  
  // 6. 显示当前主题
  const currentTheme = themeManager.getCurrentTheme();
  if (currentTheme) {
    console.log(`  当前主题: ${currentTheme.name}`);
  }
  
  // 7. 显示统计信息
  console.log('\n5. 统计信息:');
  const stats = themeManager.getStats();
  console.log(`  总主题数: ${stats.total}`);
  console.log(`  浅色主题: ${stats.light}`);
  console.log(`  深色主题: ${stats.dark}`);
  console.log(`  高对比主题: ${stats.hc}`);
  
  console.log('\n✨ 主题系统初始化完成!');
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  try {
    await example1_BasicUsage();
    await example2_ExtensionManagerIntegration();
    await example3_ThemeSwitchingAndPreview();
    await example4_ThemeSearch();
    await example5_ImportExport();
    await example6_FullApplicationIntegration();
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}

// 导出示例函数
export {
  example1_BasicUsage,
  example2_ExtensionManagerIntegration,
  example3_ThemeSwitchingAndPreview,
  example4_ThemeSearch,
  example5_ImportExport,
  example6_FullApplicationIntegration,
  runAllExamples
};

// 取消注释以运行所有示例
// runAllExamples();
