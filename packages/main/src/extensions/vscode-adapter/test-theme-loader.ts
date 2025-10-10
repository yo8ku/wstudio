/**
 * 主题加载器测试脚本
 * 运行方式: npx tsx packages/main/src/extensions/vscode-adapter/test-theme-loader.ts
 */

import { VSCodeThemeLoader } from './ThemeLoader';
import * as path from 'path';

async function testThemeLoader() {
  console.log('🎨 VSCode 主题加载器测试\n');
  
  const loader = new VSCodeThemeLoader();
  
  // 测试 1: 加载 Dracula 主题
  console.log('📦 测试 1: 加载 Dracula 主题');
  console.log('─'.repeat(50));
  
  try {
    const draculaPath = path.join(__dirname, '../../../../../extensions/dracula-theme');
    const themes = await loader.loadAllThemes(draculaPath);
    
    if (themes.length > 0) {
      console.log(`✅ 成功加载 ${themes.length} 个主题`);
      
      themes.forEach((theme, index) => {
        console.log(`\n主题 ${index + 1}:`);
        console.log(`  ID: ${theme.id}`);
        console.log(`  名称: ${theme.name}`);
        console.log(`  类型: ${theme.type}`);
        console.log(`  颜色数量: ${Object.keys(theme.colors).length}`);
        console.log(`  Token 颜色: ${theme.tokenColors?.length || 0}`);
        
        // 显示主要颜色
        const preview = loader.getThemePreview(theme);
        console.log(`  主要颜色:`);
        console.log(`    背景: ${preview.primaryColors.background}`);
        console.log(`    前景: ${preview.primaryColors.foreground}`);
        console.log(`    强调: ${preview.primaryColors.accent}`);
        
        // 验证主题
        const isValid = loader.validateTheme(theme);
        console.log(`  有效性: ${isValid ? '✅ 有效' : '❌ 无效'}`);
      });
    } else {
      console.log('❌ 未找到主题');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
  
  console.log('\n');
  
  // 测试 2: 加载内置主题
  console.log('📦 测试 2: 加载内置默认主题');
  console.log('─'.repeat(50));
  
  try {
    const defaultThemePath = path.join(__dirname, '../../../../../packages/builtin-extensions/theme-default');
    const themes = await loader.loadAllThemes(defaultThemePath);
    
    if (themes.length > 0) {
      console.log(`✅ 成功加载 ${themes.length} 个主题`);
      
      themes.forEach((theme, index) => {
        console.log(`\n主题 ${index + 1}: ${theme.name}`);
        console.log(`  ID: ${theme.id}`);
        console.log(`  类型: ${theme.type}`);
        
        // 显示部分颜色
        console.log(`  部分颜色:`);
        const colorKeys = Object.keys(theme.colors).slice(0, 5);
        colorKeys.forEach(key => {
          console.log(`    ${key}: ${theme.colors[key]}`);
        });
      });
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
  
  console.log('\n');
  
  // 测试 3: 批量加载多个扩展
  console.log('📦 测试 3: 批量加载多个主题扩展');
  console.log('─'.repeat(50));
  
  const extensionsDir = path.join(__dirname, '../../../../../extensions');
  const themeExtensions = [
    'dracula-theme',
    'github-theme',
    'night-owl-theme'
  ];
  
  let totalThemes = 0;
  
  for (const extName of themeExtensions) {
    try {
      const extPath = path.join(extensionsDir, extName);
      const themes = await loader.loadAllThemes(extPath);
      
      if (themes.length > 0) {
        console.log(`\n✅ ${extName}:`);
        themes.forEach(theme => {
          console.log(`   - ${theme.name} (${theme.type})`);
        });
        totalThemes += themes.length;
      } else {
        console.log(`\n⚠️  ${extName}: 未找到主题或加载失败`);
      }
    } catch (error) {
      console.log(`\n❌ ${extName}: 加载失败`);
    }
  }
  
  console.log(`\n📊 总计加载了 ${totalThemes} 个主题`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ 测试完成!');
}

// 运行测试
testThemeLoader().catch(console.error);










