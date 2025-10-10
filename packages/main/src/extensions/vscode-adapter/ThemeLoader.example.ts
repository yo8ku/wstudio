/**
 * VSCode 主题加载器使用示例
 */

import { VSCodeThemeLoader } from './ThemeLoader';
import * as path from 'path';

/**
 * 示例 1: 加载单个主题
 */
async function example1_LoadSingleTheme() {
  console.log('=== 示例 1: 加载单个主题 ===');
  
  const loader = new VSCodeThemeLoader();
  const extensionPath = path.join(__dirname, '../../../../extensions/dracula-theme');
  
  // 加载第一个主题（索引 0）
  const theme = await loader.loadTheme(extensionPath, 0);
  
  if (theme) {
    console.log('主题 ID:', theme.id);
    console.log('主题名称:', theme.name);
    console.log('主题类型:', theme.type);
    console.log('编辑器背景色:', theme.colors['editor.background']);
    console.log('Token 颜色数量:', theme.tokenColors?.length || 0);
  }
}

/**
 * 示例 2: 加载扩展的所有主题
 */
async function example2_LoadAllThemes() {
  console.log('=== 示例 2: 加载所有主题 ===');
  
  const loader = new VSCodeThemeLoader();
  const extensionPath = path.join(__dirname, '../../../../extensions/dracula-theme');
  
  const themes = await loader.loadAllThemes(extensionPath);
  
  console.log(`共加载 ${themes.length} 个主题:`);
  themes.forEach((theme, index) => {
    console.log(`  ${index + 1}. ${theme.name} (${theme.type})`);
  });
}

/**
 * 示例 3: 验证和预览主题
 */
async function example3_ValidateAndPreview() {
  console.log('=== 示例 3: 验证和预览主题 ===');
  
  const loader = new VSCodeThemeLoader();
  const extensionPath = path.join(__dirname, '../../../../extensions/dracula-theme');
  
  const theme = await loader.loadTheme(extensionPath);
  
  if (theme) {
    // 验证主题
    const isValid = loader.validateTheme(theme);
    console.log('主题有效性:', isValid);
    
    // 获取预览信息
    const preview = loader.getThemePreview(theme);
    console.log('预览信息:');
    console.log('  名称:', preview.name);
    console.log('  类型:', preview.type);
    console.log('  主要颜色:');
    console.log('    背景:', preview.primaryColors.background);
    console.log('    前景:', preview.primaryColors.foreground);
    console.log('    强调:', preview.primaryColors.accent);
  }
}

/**
 * 示例 4: 批量加载多个扩展的主题
 */
async function example4_LoadMultipleExtensions() {
  console.log('=== 示例 4: 批量加载多个扩展 ===');
  
  const loader = new VSCodeThemeLoader();
  const extensionsDir = path.join(__dirname, '../../../../extensions');
  
  const themeExtensions = [
    'dracula-theme',
    'github-theme',
    'night-owl-theme'
  ];
  
  const allThemes = [];
  
  for (const extName of themeExtensions) {
    const extPath = path.join(extensionsDir, extName);
    const themes = await loader.loadAllThemes(extPath);
    allThemes.push(...themes);
    console.log(`从 ${extName} 加载了 ${themes.length} 个主题`);
  }
  
  console.log(`\n总共加载了 ${allThemes.length} 个主题:`);
  allThemes.forEach(theme => {
    console.log(`  - ${theme.name} [${theme.id}]`);
  });
}

/**
 * 示例 5: 集成到扩展管理器
 */
async function example5_IntegrateWithExtensionManager() {
  console.log('=== 示例 5: 集成到扩展管理器 ===');
  
  const loader = new VSCodeThemeLoader();
  
  // 模拟扩展安装后的主题加载流程
  const onExtensionInstalled = async (extensionPath: string) => {
    console.log(`扩展已安装: ${extensionPath}`);
    
    // 加载主题
    const themes = await loader.loadAllThemes(extensionPath);
    
    if (themes.length > 0) {
      console.log(`发现 ${themes.length} 个主题，注册到主题管理器...`);
      
      // 这里应该调用主题管理器的注册方法
      // themeManager.registerThemes(themes);
      
      themes.forEach(theme => {
        const preview = loader.getThemePreview(theme);
        console.log(`  已注册主题: ${theme.name}`);
        console.log(`    ID: ${theme.id}`);
        console.log(`    类型: ${theme.type}`);
        console.log(`    背景色: ${preview.primaryColors.background}`);
      });
    } else {
      console.log('该扩展不包含主题');
    }
  };
  
  // 模拟安装扩展
  const extensionPath = path.join(__dirname, '../../../../extensions/dracula-theme');
  await onExtensionInstalled(extensionPath);
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  try {
    await example1_LoadSingleTheme();
    console.log('\n');
    
    await example2_LoadAllThemes();
    console.log('\n');
    
    await example3_ValidateAndPreview();
    console.log('\n');
    
    await example4_LoadMultipleExtensions();
    console.log('\n');
    
    await example5_IntegrateWithExtensionManager();
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}

// 取消注释以运行示例
// runAllExamples();

// 导出示例函数
export {
  example1_LoadSingleTheme,
  example2_LoadAllThemes,
  example3_ValidateAndPreview,
  example4_LoadMultipleExtensions,
  example5_IntegrateWithExtensionManager,
  runAllExamples
};










