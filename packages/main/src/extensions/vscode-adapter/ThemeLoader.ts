/**
 * VSCode 主题加载器 - 加载和转换 VSCode 主题插件
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ThemeContribution } from '@note-studio/shared';

// 辅助函数：读取 JSON 文件（支持注释）
async function readJSON(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // 移除 JSON 中的注释和清理格式
  let cleanContent = content;
  
  try {
    // 首先尝试直接解析，如果成功就不需要清理
    JSON.parse(cleanContent);
    return JSON.parse(cleanContent);
  } catch (e) {
    // 如果解析失败，才进行注释清理
  }
  
  // 1. 移除多行注释 /* */
  cleanContent = cleanContent.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // 2. 移除单行注释 // （更精确的处理）
  const lines = cleanContent.split('\n');
  const processedLines = lines.map(line => {
    // 跳过空行
    if (!line.trim()) return line;
    
    // 查找 // 注释，但要确保不在字符串内
    let inString = false;
    let escaped = false;
    let commentIndex = -1;
    
    for (let i = 0; i < line.length - 1; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString && char === '/' && nextChar === '/') {
        commentIndex = i;
        break;
      }
    }
    
    // 如果找到注释，移除它
    if (commentIndex >= 0) {
      return line.substring(0, commentIndex).trimEnd();
    }
    
    return line;
  });
  
  cleanContent = processedLines.join('\n');
  
  // 3. 移除空行和清理格式
  cleanContent = cleanContent
    .replace(/^\s*\n/gm, '')
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/,\s*,/g, ',');

  try {
    return JSON.parse(cleanContent);
  } catch (error) {
    console.error(`[ThemeLoader] JSON 解析失败: ${filePath}`);
    console.error(`[ThemeLoader] 错误详情:`, error);
    // 输出清理后的内容片段以便调试
    const lines = cleanContent.split('\n');
    const errorLine = (error as any).message.match(/line (\d+)/)?.[1];
    if (errorLine) {
      const lineNum = parseInt(errorLine);
      console.error(`[ThemeLoader] 问题行周围的内容:`);
      for (let i = Math.max(0, lineNum - 3); i < Math.min(lines.length, lineNum + 3); i++) {
        console.error(`${i + 1}: ${lines[i]}`);
      }
    }
    throw error;
  }
}

// 辅助函数：检查路径是否存在
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 内部主题接口
 */
export interface ITheme {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'hc';
  colors: ThemeColors;
  tokenColors?: TokenColor[];
  semanticTokenColors?: Record<string, any>;
}

/**
 * 主题颜色定义
 */
export interface ThemeColors {
  // 编辑器颜色
  'editor.background'?: string;
  'editor.foreground'?: string;
  'editor.lineHighlightBackground'?: string;
  'editor.selectionBackground'?: string;
  'editorCursor.foreground'?: string;
  'editorLineNumber.foreground'?: string;
  
  // 侧边栏颜色
  'sideBar.background'?: string;
  'sideBar.foreground'?: string;
  'sideBarTitle.foreground'?: string;
  
  // 活动栏颜色
  'activityBar.background'?: string;
  'activityBar.foreground'?: string;
  'activityBarBadge.background'?: string;
  
  // 状态栏颜色
  'statusBar.background'?: string;
  'statusBar.foreground'?: string;
  'statusBar.debuggingBackground'?: string;
  
  // 标题栏颜色
  'titleBar.activeBackground'?: string;
  'titleBar.activeForeground'?: string;
  'titleBar.inactiveBackground'?: string;
  
  // 其他颜色
  [key: string]: string | undefined;
}

/**
 * Token 颜色定义
 */
export interface TokenColor {
  name?: string;
  scope?: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

/**
 * VSCode 主题数据结构
 */
export interface VSCodeThemeData {
  name?: string;
  type?: 'light' | 'dark' | 'hc';
  colors?: Record<string, string>;
  tokenColors?: TokenColor[];
  semanticTokenColors?: Record<string, any>;
  include?: string; // 可能包含基础主题
}

/**
 * VSCode 主题加载器
 */
export class VSCodeThemeLoader {
  /**
   * ⭐ 加载 VSCode 颜色主题
   */
  async loadTheme(extensionPath: string, themeIndex: number = 0): Promise<ITheme | null> {
    try {
      const manifest = await readJSON(
        path.join(extensionPath, 'package.json')
      );
      
      // 解析 contributes.themes
      const themeContribution = manifest.contributes?.themes?.[themeIndex] as ThemeContribution;
      
      if (!themeContribution) {
        console.warn(`[ThemeLoader] 未找到主题贡献点，索引: ${themeIndex}`);
        return null;
      }
      
      const themePath = path.join(extensionPath, themeContribution.path);
      
      // 检查主题文件是否存在
      if (!await pathExists(themePath)) {
        console.error(`[ThemeLoader] 主题文件不存在: ${themePath}`);
        return null;
      }
      
      const themeData = await readJSON(themePath) as VSCodeThemeData;
      
      // ⭐ 转换为内部主题格式
      const theme = await this.convertVSCodeTheme(
        themeData, 
        themeContribution,
        extensionPath,
        manifest.name || 'unknown'
      );
      
      console.log(`[ThemeLoader] 成功加载主题: ${theme.name}`);
      return theme;
    } catch (error) {
      console.error(`[ThemeLoader] 加载主题失败:`, error);
      return null;
    }
  }

  /**
   * 加载扩展中的所有主题
   */
  async loadAllThemes(extensionPath: string): Promise<ITheme[]> {
    try {
      const manifest = await readJSON(
        path.join(extensionPath, 'package.json')
      );
      
      const themes = manifest.contributes?.themes || [];
      const loadedThemes: ITheme[] = [];
      
      for (let i = 0; i < themes.length; i++) {
        const theme = await this.loadTheme(extensionPath, i);
        if (theme) {
          loadedThemes.push(theme);
        }
      }
      
      console.log(`[ThemeLoader] 共加载 ${loadedThemes.length} 个主题`);
      return loadedThemes;
    } catch (error) {
      console.error(`[ThemeLoader] 加载所有主题失败:`, error);
      return [];
    }
  }

  /**
   * ⭐ 转换 VSCode 主题为内部格式
   */
  private async convertVSCodeTheme(
    themeData: VSCodeThemeData,
    contribution: ThemeContribution,
    extensionPath: string,
    extensionName: string
  ): Promise<ITheme> {
    // 处理 include 字段（继承基础主题）
    let baseThemeData: VSCodeThemeData = {};
    if (themeData.include) {
      try {
        const includePath = path.join(
          path.dirname(path.join(extensionPath, contribution.path)),
          themeData.include
        );
        if (await pathExists(includePath)) {
          baseThemeData = await readJSON(includePath);
        }
      } catch (error) {
        console.warn(`[ThemeLoader] 加载基础主题失败:`, error);
      }
    }

    // 合并基础主题和当前主题
    const mergedColors = {
      ...baseThemeData.colors,
      ...themeData.colors
    };

    const mergedTokenColors = [
      ...(baseThemeData.tokenColors || []),
      ...(themeData.tokenColors || [])
    ];

    // 确定主题类型
    const type = this.determineThemeType(themeData, contribution);

    // 生成主题 ID
    const themeId = this.generateThemeId(extensionName, contribution.label);

    return {
      id: themeId,
      name: contribution.label || themeData.name || 'Unnamed Theme',
      type,
      colors: mergedColors as ThemeColors,
      tokenColors: mergedTokenColors,
      semanticTokenColors: {
        ...baseThemeData.semanticTokenColors,
        ...themeData.semanticTokenColors
      }
    };
  }

  /**
   * 确定主题类型
   */
  private determineThemeType(
    themeData: VSCodeThemeData, 
    contribution: ThemeContribution
  ): 'light' | 'dark' | 'hc' {
    // 优先使用主题数据中的类型
    if (themeData.type) {
      return themeData.type;
    }

    // 根据 uiTheme 判断
    switch (contribution.uiTheme) {
      case 'vs':
        return 'light';
      case 'vs-dark':
        return 'dark';
      case 'hc-black':
        return 'hc';
      default:
        return 'dark';
    }
  }

  /**
   * 生成主题 ID
   */
  private generateThemeId(extensionName: string, themeLabel: string): string {
    const sanitize = (str: string) => 
      str.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    return `${sanitize(extensionName)}-${sanitize(themeLabel)}`;
  }

  /**
   * 验证主题数据
   */
  validateTheme(theme: ITheme): boolean {
    if (!theme.id || !theme.name) {
      console.error('[ThemeLoader] 主题缺少必要字段: id 或 name');
      return false;
    }

    if (!['light', 'dark', 'hc'].includes(theme.type)) {
      console.error(`[ThemeLoader] 无效的主题类型: ${theme.type}`);
      return false;
    }

    if (!theme.colors || Object.keys(theme.colors).length === 0) {
      console.warn('[ThemeLoader] 主题没有颜色定义');
    }

    return true;
  }

  /**
   * 获取主题预览信息
   */
  getThemePreview(theme: ITheme): {
    name: string;
    type: string;
    primaryColors: {
      background: string;
      foreground: string;
      accent: string;
    };
  } {
    return {
      name: theme.name,
      type: theme.type,
      primaryColors: {
        background: theme.colors['editor.background'] || '#000000',
        foreground: theme.colors['editor.foreground'] || '#FFFFFF',
        accent: theme.colors['activityBarBadge.background'] || 
                theme.colors['button.background'] || 
                '#007ACC'
      }
    };
  }
}
