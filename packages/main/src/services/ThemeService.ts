/**
 * ThemeService - 主进程主题管理服务
 * 负责主题的加载、解析、存储和管理
 * 支持 JSON 和 JSONC（带注释的 JSON）格式
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import * as jsonc from 'jsonc-parser';
import type { AppTheme, TokenStyle } from '@note-studio/theme';
import type {
  ThemeInfo,
  ThemeData,
  ThemeConfigData,
} from '@note-studio/shared';
import { ElectronStoreService } from './ElectronStoreService';

/**
 * 主题服务
 */
export class ThemeService {
  private static instance: ThemeService;
  private themes: Map<string, AppTheme> = new Map();
  private store: ElectronStoreService;
  private themesDir: string;
  private initialized = false;

  private constructor() {
    this.store = ElectronStoreService.getInstance();

    // 主题存储目录
    const userDataPath = app.getPath('userData');
    this.themesDir = path.join(userDataPath, 'themes');
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  /**
   * 初始化主题服务
   */
  async initialize(): Promise<void> {
    // console.log('[ThemeService] initialize() 被调用, initialized:', this.initialized);
    if (this.initialized) {
      // console.log('[ThemeService] 已经初始化过，跳过');
      return;
    }

    // console.log('[ThemeService] 开始初始化...');

    try {
      // 确保主题目录存在
      await this.ensureThemeDirectories();

      // 加载内置主题
      await this.loadBuiltinThemes();

      // 加载用户主题
      await this.loadUserThemes();

      this.initialized = true;
      // console.log('[ThemeService] 初始化完成');
      console.log('[ThemeService] 已加载主题数量:', this.themes.size);
    } catch (error) {
      console.error('[ThemeService] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 确保主题目录存在（仅用户主题和市场主题）
   */
  private async ensureThemeDirectories(): Promise<void> {
    const dirs = [
      this.themesDir,
      path.join(this.themesDir, 'user'),    // 用户自定义/导入的主题
      path.join(this.themesDir, 'market'),  // 从市场下载的主题
    ];

    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log('[ThemeService] 创建目录:', dir);
      }
    }
  }

  /**
   * 加载内置主题（从项目目录直接加载，不复制）
   */
  private async loadBuiltinThemes(): Promise<void> {
    try {
      // 内置主题位于项目目录，直接从源目录加载
      // __dirname 实际编译后的路径: packages/main/dist/main/main/src/services
      // 使用多种方式尝试找到项目根目录
      // console.log('[ThemeService] ========== 路径调试 ==========');
      // console.log('[ThemeService] 当前 __dirname:', __dirname);
      
      // 尝试多个可能的项目根目录路径
      const possibleRoots = [
        // 从 __dirname 向上 7 级（到达 packages 目录，然后需要再上一级）
        path.resolve(__dirname, '../../../../../../../'),
        // 从 __dirname 向上 6 级（到达 packages 目录）
        path.resolve(__dirname, '../../../../../../'),
        // 使用 process.cwd()（当前工作目录，通常是项目根）
        process.cwd(),
      ];
      
      // 查找包含 packages/theme/themes/builtin 的根目录
      let projectRoot: string | undefined;
      for (const root of possibleRoots) {
        const testPath = path.join(root, 'packages', 'theme', 'themes', 'builtin');
        try {
          await fs.access(testPath);
          projectRoot = root;
          console.log('[ThemeService] 找到项目根目录:', projectRoot);
          break;
        } catch {
          // 继续尝试下一个路径
        }
      }
      
      if (!projectRoot) {
        // 如果都找不到，使用 process.cwd() 作为后备
        projectRoot = process.cwd();
        console.warn('[ThemeService] 无法自动检测项目根目录，使用 process.cwd():', projectRoot);
      }
      
      console.log('[ThemeService] 计算的项目根目录:', projectRoot);
      const builtinDir = path.join(projectRoot, 'packages', 'theme', 'themes', 'builtin');
      // console.log('[ThemeService] 内置主题目录:', builtinDir);
      // console.log('[ThemeService] =====================================');

      // 检查目录是否存在
      try {
        await fs.access(builtinDir);
        console.log('[ThemeService] ✅ 内置主题目录存在');
      } catch (error) {
        console.warn('[ThemeService] ❌ 内置主题目录不存在，跳过加载');
        console.warn('[ThemeService] 错误:', error);
        return;
      }

      // 递归加载所有主题文件
      const themeFiles = await this.findThemeFilesRecursive(builtinDir);
      // console.log('[ThemeService] 找到的 JSON 主题文件:', themeFiles);

      for (const themePath of themeFiles) {
        try {
          const theme = await this.loadThemeFile(themePath);
          if (theme) {
            // 标记为内置主题（只读）
            theme.isBuiltin = true;
            theme.source = 'builtin';
            
            this.themes.set(theme.id, theme);
            // console.log(`[ThemeService] ✅ 已加载内置主题: ${theme.name} (${theme.id})`);
          }
        } catch (error) {
          // console.error(`[ThemeService] 加载内置主题失败: ${themePath}`, error);
        }
      }

      console.log('[ThemeService] 已加载内置主题数量:', themeFiles.length);
    } catch (error) {
      console.error('[ThemeService] 加载内置主题目录失败:', error);
    }
  }

  /**
   * 递归查找目录中的所有主题文件（支持 .json 和 .jsonc）
   */
  private async findThemeFilesRecursive(dir: string): Promise<string[]> {
    const themeFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // 递归搜索子目录
          const subFiles = await this.findThemeFilesRecursive(fullPath);
          themeFiles.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonc'))) {
          // 找到 JSON 或 JSONC 文件
          themeFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[ThemeService] 读取目录失败: ${dir}`, error);
    }
    
    return themeFiles;
  }

  /**
   * 加载用户主题（支持 .json 和 .jsonc）
   */
  private async loadUserThemes(): Promise<void> {
    const userDir = path.join(this.themesDir, 'user');
    
    try {
      const files = await fs.readdir(userDir);
      const themeFiles = files.filter((f) => f.endsWith('.json') || f.endsWith('.jsonc'));

      console.log('[ThemeService] 开始加载用户主题覆盖文件...');

      for (const file of themeFiles) {
        try {
          const themePath = path.join(userDir, file);
          
          // 读取文件内容
          const content = await fs.readFile(themePath, 'utf-8');
          const errors: jsonc.ParseError[] = [];
          const data = jsonc.parse(content, errors);
          
          if (errors.length > 0) {
            console.warn(`[ThemeService] 解析覆盖文件失败: ${file}`, errors);
            continue;
          }
          
          // 检查是否是覆盖文件（只包含 colors 字段）
          // 如果是覆盖文件，应用到对应的内置主题
          if (data && data.colors && !data.name) {
            // 这是一个覆盖文件
            // 文件名 = 主题ID.json
            const baseThemeId = path.basename(file, '.json');
            console.log(`[ThemeService] 发现覆盖文件: ${file} -> 基础主题: ${baseThemeId}`);
            
            // 查找对应的内置主题
            const baseTheme = this.themes.get(baseThemeId);
            if (baseTheme && baseTheme.isBuiltin) {
              // 应用颜色覆盖
              const overrideColors = data.colors || {};
              const mergedColors = {
                ...baseTheme.colors,
                ...overrideColors,
              };
              
              // 更新主题颜色
              baseTheme.colors = mergedColors;
              console.log(`[ThemeService] ✓ 已应用 ${Object.keys(overrideColors).length} 个颜色覆盖到主题: ${baseTheme.name}`);
            } else {
              console.warn(`[ThemeService] 未找到对应的内置主题: ${baseThemeId}`);
            }
          } else if (data && data.name) {
            // 这是一个完整的自定义主题文件（旧格式，仍然支持）
            const theme = await this.loadThemeFile(themePath);
            if (theme) {
              this.themes.set(theme.id, theme);
              console.log(`[ThemeService] ✓ 加载自定义主题: ${theme.name}`);
            }
          }
        } catch (error) {
          console.error(`[ThemeService] 加载用户主题失败: ${file}`, error);
        }
      }

      console.log('[ThemeService] 用户主题覆盖加载完成');
    } catch (error) {
      console.warn('[ThemeService] 加载用户主题目录失败:', error);
    }
  }

  /**
   * 重新加载用户主题（用于手动刷新）
   */
  async reloadUserThemes(): Promise<void> {
    console.log('[ThemeService] 重新加载用户主题...');
    await this.loadUserThemes();
    console.log('[ThemeService] 用户主题重新加载完成，当前主题总数:', this.themes.size);
  }

  /**
   * 从文件加载主题（支持 JSONC 格式，允许注释）
   * 支持基于基础主题的继承机制
   */
  private async loadThemeFile(filePath: string): Promise<AppTheme | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // 使用 jsonc-parser 解析，支持注释
      const errors: jsonc.ParseError[] = [];
      const themeData = jsonc.parse(content, errors, {
        allowTrailingComma: true,  // 允许尾随逗号
        disallowComments: false,    // 允许注释
      }) as Partial<AppTheme>;

      // 如果有解析错误，记录警告但仍尝试返回结果
      if (errors.length > 0) {
        console.warn(`[ThemeService] 解析主题文件时发现警告: ${filePath}`, errors);
      }

      // 验证必需字段
      if (!themeData.name) {
        console.warn('[ThemeService] 主题文件缺少 name 字段:', filePath);
        return null;
      }

      // 优先使用文件中的 id，如果没有则从文件名生成
      // 注意：文件名本身应该是合法的 ID
      let id = themeData.id;
      if (!id) {
        // 从文件名生成 ID（而不是从主题名称）
        const fileName = path.basename(filePath, '.json');
        // 确保 ID 符合 Monaco 规范：只包含字母、数字、连字符、下划线
        let generatedId = fileName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        
        // 如果生成的 ID 只包含特殊字符（如全中文文件名），使用时间戳
        if (/^[-_]+$/.test(generatedId) || generatedId.length === 0) {
          generatedId = `user-theme-${Date.now()}`;
          console.log(`[ThemeService] 文件名无法生成有效 ID，使用时间戳: ${generatedId}`);
        } else {
          console.log(`[ThemeService] 主题文件未指定 id，从文件名生成: ${generatedId}`);
        }
        
        id = generatedId;
      }
      
      // 如果有 baseTheme，则从基础主题继承（可选功能）
      let baseColors: Record<string, string> = {};
      let baseTokenColors: any[] = [];
      
      if (themeData.baseTheme) {
        console.log(`[ThemeService] 主题 ${themeData.name} 尝试基于主题: ${themeData.baseTheme}`);
        
        // 支持通过 ID 或名称查找基础主题
        let baseTheme = this.themes.get(themeData.baseTheme);
        
        // 如果通过 ID 没找到，尝试通过名称查找
        if (!baseTheme) {
          baseTheme = Array.from(this.themes.values()).find(
            theme => theme.name === themeData.baseTheme
          );
        }
        
        if (baseTheme) {
          console.log(`[ThemeService] 找到基础主题: ${baseTheme.name} (${baseTheme.id})`);
          console.log(`[ThemeService] 继承颜色数量: ${Object.keys(baseTheme.colors).length}`);
          baseColors = { ...baseTheme.colors };
          baseTokenColors = [...(baseTheme.tokenColors || [])];
        } else {
          console.log(`[ThemeService] 未找到基础主题: ${themeData.baseTheme}，使用独立主题模式`);
          // 不输出警告，因为主题可以是完全独立的
        }
      } else {
        // console.log(`[ThemeService] 主题 ${themeData.name} 是独立主题（不基于任何基础主题）`);
      }
      
      // 合并基础主题和自定义配置
      // 自定义配置会覆盖基础主题的相同字段
      const mergedColors = {
        ...baseColors,
        ...(themeData.colors || {})
      };
      
      const mergedTokenColors = themeData.tokenColors && themeData.tokenColors.length > 0
        ? themeData.tokenColors
        : baseTokenColors;
      
      const finalColorCount = Object.keys(mergedColors).length;
      const customColorCount = Object.keys(themeData.colors || {}).length;
      
      console.log(`[ThemeService] 主题 ${themeData.name} 最终颜色数量: ${finalColorCount}`);
      if (baseColors && Object.keys(baseColors).length > 0) {
        console.log(`[ThemeService] - 继承自基础主题: ${Object.keys(baseColors).length}`);
      }
      console.log(`[ThemeService] - 自定义颜色: ${customColorCount}`);
      
      // 构建完整的主题对象，添加元数据
      const theme: AppTheme = {
        id,
        name: themeData.name,
        type: themeData.type || 'dark',
        baseTheme: themeData.baseTheme, // 保存基础主题引用
        author: themeData.author,
        description: themeData.description,
        version: themeData.version || '1.0.0',
        colors: mergedColors,
        tokenColors: mergedTokenColors,
        semanticHighlighting: themeData.semanticHighlighting,
        semanticTokenColors: themeData.semanticTokenColors,
        source: 'user',
        isBuiltin: false,
        isFavorite: themeData.isFavorite,
        usageCount: themeData.usageCount,
        lastUsedAt: themeData.lastUsedAt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return theme;
    } catch (error) {
      console.error('[ThemeService] 读取主题文件失败:', error);
      return null;
    }
  }

  /**
   * 保存主题到文件
   * 如果主题有 baseTheme，只保存自定义的字段
   */
  private async saveThemeFile(
    theme: AppTheme,
    source: 'builtin' | 'user' | 'market' = 'user'
  ): Promise<void> {
    const dir = path.join(this.themesDir, source);
    const filePath = path.join(dir, `${theme.id}.json`);

    console.log('[ThemeService] 准备保存主题文件');
    console.log('[ThemeService] - 主题目录:', this.themesDir);
    console.log('[ThemeService] - Source:', source);
    console.log('[ThemeService] - 目标目录:', dir);
    console.log('[ThemeService] - 文件路径:', filePath);
    console.log('[ThemeService] - 主题 ID:', theme.id);
    console.log('[ThemeService] - 主题名称:', theme.name);
    console.log('[ThemeService] - 基础主题:', theme.baseTheme || '无');

    try {
      // 确保目录存在
      try {
        await fs.access(dir);
      } catch {
        console.log('[ThemeService] 目录不存在，正在创建:', dir);
        await fs.mkdir(dir, { recursive: true });
        console.log('[ThemeService] 目录创建成功');
      }
      
      // 过滤掉元数据字段
      // 移除: id, source, isBuiltin, createdAt, updatedAt, isFavorite, usageCount, lastUsedAt
      const { 
        id, 
        source: _, 
        isBuiltin, 
        createdAt, 
        updatedAt, 
        isFavorite, 
        usageCount, 
        lastUsedAt,
        ...themeConfig 
      } = theme;
      
      let cleanTheme: Record<string, any>;
      
      // 如果有 baseTheme，只保存自定义的字段
      if (theme.baseTheme) {
        // 支持通过 ID 或名称查找基础主题
        let baseTheme = this.themes.get(theme.baseTheme);
        
        // 如果通过 ID 没找到，尝试通过名称查找
        if (!baseTheme) {
          baseTheme = Array.from(this.themes.values()).find(
            t => t.name === theme.baseTheme
          );
        }
        
        if (baseTheme) {
          console.log('[ThemeService] 检测到基础主题，只保存自定义字段');
          
          // 只保存与基础主题不同的颜色
          const customColors: Record<string, string> = {};
          for (const [key, value] of Object.entries(theme.colors)) {
            if (baseTheme.colors[key] !== value && typeof value === 'string') {
              customColors[key] = value;
            }
          }
          
          console.log(`[ThemeService] - 总颜色数: ${Object.keys(theme.colors).length}`);
          console.log(`[ThemeService] - 自定义颜色数: ${Object.keys(customColors).length}`);
          
          // 构建自定义主题配置（只保留核心字段）
          cleanTheme = {
            baseTheme: theme.baseTheme,
            name: theme.name,
            type: theme.type,
            colors: customColors, // 只保存自定义的颜色
          };
          
          // 如果有自定义的 tokenColors，也保存
          if (theme.tokenColors && theme.tokenColors.length > 0) {
            const baseTokenColorsStr = JSON.stringify(baseTheme.tokenColors || []);
            const themeTokenColorsStr = JSON.stringify(theme.tokenColors);
            
            if (baseTokenColorsStr !== themeTokenColorsStr) {
              cleanTheme.tokenColors = theme.tokenColors;
            }
          }
          
          // 保存其他自定义字段
          if (theme.semanticHighlighting !== undefined) {
            cleanTheme.semanticHighlighting = theme.semanticHighlighting;
          }
          if (theme.semanticTokenColors) {
            cleanTheme.semanticTokenColors = theme.semanticTokenColors;
          }
        } else {
          console.warn('[ThemeService] 未找到基础主题，保存完整配置');
          cleanTheme = {
            name: theme.name,
            type: theme.type,
            colors: theme.colors,
          };
          
          if (theme.tokenColors && theme.tokenColors.length > 0) {
            cleanTheme.tokenColors = theme.tokenColors;
          }
          
          if (theme.semanticHighlighting !== undefined) {
            cleanTheme.semanticHighlighting = theme.semanticHighlighting;
          }
          
          if (theme.semanticTokenColors) {
            cleanTheme.semanticTokenColors = theme.semanticTokenColors;
          }
        }
      } else {
        // 没有基础主题，保存完整配置，但只保留核心字段
        console.log('[ThemeService] 无基础主题，保存完整配置');
        cleanTheme = {
          name: theme.name,
          type: theme.type,
          colors: theme.colors,
        };
        
        // 如果有 tokenColors，则保存
        if (theme.tokenColors && theme.tokenColors.length > 0) {
          cleanTheme.tokenColors = theme.tokenColors;
        }
        
        // 如果有 semanticHighlighting，则保存
        if (theme.semanticHighlighting !== undefined) {
          cleanTheme.semanticHighlighting = theme.semanticHighlighting;
        }
        
        // 如果有 semanticTokenColors，则保存
        if (theme.semanticTokenColors) {
          cleanTheme.semanticTokenColors = theme.semanticTokenColors;
        }
      }
      
      const content = JSON.stringify(cleanTheme, null, 2);
      await fs.writeFile(filePath, content, 'utf-8');
      console.log('[ThemeService] 主题已保存到文件:', filePath);
      console.log('[ThemeService] 保存的主题内容预览:', content.substring(0, 300));
    } catch (error) {
      console.error('[ThemeService] 保存主题失败:', error);
      throw error;
    }
  }


  /**
   * 获取所有主题列表
   */
  getAllThemes(): ThemeInfo[] {
    return Array.from(this.themes.values()).map(theme => ({
      id: theme.id,
      name: theme.name,
      type: theme.type,
      author: theme.author,
      description: theme.description,
      source: theme.source,
      isFavorite: theme.isFavorite,
      lastUsedAt: theme.lastUsedAt,
    }));
  }

  /**
   * 获取主题详情
   */
  getTheme(themeId: string): ThemeData | null {
    const theme = this.themes.get(themeId);
    if (!theme) {
      return null;
    }

    return this.convertToThemeData(theme);
  }

  /**
   * 获取当前主题
   */
  async getCurrentTheme(): Promise<ThemeData | null> {
    const config = this.getThemeConfig();
    if (!config.activeThemeId) {
      return null;
    }

    const theme = this.themes.get(config.activeThemeId);
    if (!theme) {
      return null;
    }

    // 应用自定义颜色（简单合并）
    const mergedTheme: AppTheme = {
      ...theme,
      colors: {
        ...theme.colors,
        ...(config.customColors || {}),
      }
    };
    return this.convertToThemeData(mergedTheme);
  }

  /**
   * 设置当前主题
   */
  async setTheme(themeId: string, customColors?: Record<string, string>): Promise<boolean> {
    const theme = this.themes.get(themeId);
    if (!theme) {
      console.error('[ThemeService] 主题不存在:', themeId);
      return false;
    }

    try {
      // 更新配置
      const config = this.getThemeConfig();
      config.activeThemeId = themeId;
      
      if (customColors) {
        config.customColors = customColors;
      }

      // 更新最近使用
      if (!config.recentThemes) {
        config.recentThemes = [];
      }
      config.recentThemes = [
        themeId,
        ...config.recentThemes.filter((id: string) => id !== themeId),
      ].slice(0, 10);

      // 保存配置
      this.store.set('theme-config', config);

      // 记录使用次数和时间
      theme.usageCount = (theme.usageCount || 0) + 1;
      theme.lastUsedAt = Date.now();

      console.log('[ThemeService] 主题已设置:', themeId);
      return true;
    } catch (error) {
      console.error('[ThemeService] 设置主题失败:', error);
      return false;
    }
  }

  /**
   * 设置自定义颜色
   */
  async setCustomColors(customColors: Record<string, string>): Promise<boolean> {
    try {
      const config = this.getThemeConfig();
      config.customColors = {
        ...config.customColors,
        ...customColors,
      };

      this.store.set('theme-config', config);
      console.log('[ThemeService] 自定义颜色已更新');
      return true;
    } catch (error) {
      console.error('[ThemeService] 设置自定义颜色失败:', error);
      return false;
    }
  }

  /**
   * 将主题名称转换为 kebab-case ID
   */
  private generateThemeId(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-') // 将空格和下划线替换为连字符
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '') // 移除特殊字符，保留中文
      .replace(/-+/g, '-') // 合并多个连字符
      .replace(/^-|-$/g, ''); // 移除首尾连字符
  }

  /**
   * 检查主题名称是否已存在（排除指定的主题ID）
   */
  private isThemeNameExists(name: string, excludeId?: string): boolean {
    const normalizedName = name.trim().toLowerCase();
    
    for (const theme of this.themes.values()) {
      // 排除当前正在编辑的主题
      if (excludeId && theme.id === excludeId) {
        continue;
      }
      
      if (theme.name.trim().toLowerCase() === normalizedName) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 保存主题（用于 IPC 调用）
   */
  async saveTheme(
    themeData: Partial<AppTheme> & { id?: string; name: string },
    options?: { setAsActive?: boolean }
  ): Promise<{ success: boolean; error?: string; data?: ThemeData }> {
    console.log('[ThemeService] ========== 开始保存主题 ==========');
    console.log('[ThemeService] 接收到的主题数据:', JSON.stringify(themeData, null, 2));
    console.log('[ThemeService] 选项:', options);
    
    try {
      // 检查主题名称是否为空
      if (!themeData.name || themeData.name.trim() === '') {
        console.error('[ThemeService] ❌ 主题名称为空');
        return {
          success: false,
          error: '主题名称不能为空',
        };
      }

      // 确定主题 ID
      // 优先使用提供的 id，如果没有则从名称生成
      const providedId = themeData.id;
      const generatedId = providedId || this.generateThemeId(themeData.name);
      console.log('[ThemeService] 主题 ID:', generatedId);
      if (providedId) {
        console.log('[ThemeService] - 使用提供的 ID:', providedId);
      } else {
        console.log('[ThemeService] - 从名称生成 ID');
      }
      
      // 检查是否是更新现有主题
      const existingTheme = this.themes.get(generatedId);
      const isUpdate = !!existingTheme;

      console.log('[ThemeService] 保存模式:', isUpdate ? '更新现有主题' : '创建新主题');
      if (existingTheme) {
        console.log('[ThemeService] 找到现有主题:', existingTheme.name);
      }

      // 如果是新建主题，检查 ID 和名称是否重复
      if (!isUpdate) {
        // 检查 ID 是否已存在
        if (this.themes.has(generatedId)) {
          return {
            success: false,
            error: `主题 ID "${generatedId}" 已存在，请使用其他名称或 ID`,
          };
        }
        
        // 检查名称是否已存在
        if (this.isThemeNameExists(themeData.name, generatedId)) {
          return {
            success: false,
            error: `主题名称 "${themeData.name}" 已存在，请使用其他名称`,
          };
        }
      }

      // 如果有基础主题，合并基础主题的颜色
      let finalColors = themeData.colors || {};
      let finalTokenColors = themeData.tokenColors || [];
      
      if (themeData.baseTheme) {
        // 支持通过 ID 或名称查找基础主题
        let baseTheme = this.themes.get(themeData.baseTheme);
        
        // 如果通过 ID 没找到，尝试通过名称查找
        if (!baseTheme) {
          baseTheme = Array.from(this.themes.values()).find(
            theme => theme.name === themeData.baseTheme
          );
        }
        
        if (baseTheme) {
          console.log('[ThemeService] 合并基础主题颜色:', themeData.baseTheme);
          console.log('[ThemeService] - 基础主题 ID:', baseTheme.id);
          console.log('[ThemeService] - 基础主题颜色数量:', Object.keys(baseTheme.colors).length);
          console.log('[ThemeService] - 自定义颜色数量:', Object.keys(themeData.colors || {}).length);
          
          // 合并颜色：基础主题 + 自定义颜色
          finalColors = {
            ...baseTheme.colors,
            ...(themeData.colors || {})
          };
          
          // 如果没有自定义 tokenColors，使用基础主题的
          if (!themeData.tokenColors || themeData.tokenColors.length === 0) {
            finalTokenColors = baseTheme.tokenColors || [];
          }
          
          console.log('[ThemeService] - 合并后颜色数量:', Object.keys(finalColors).length);
        } else {
          console.warn('[ThemeService] 未找到基础主题:', themeData.baseTheme);
        }
      }
      
      // 构建完整的主题对象（只保留核心字段）
      const theme: AppTheme = {
        id: generatedId,
        name: themeData.name.trim(),
        type: themeData.type || 'dark',
        baseTheme: themeData.baseTheme, // 只有基于其他主题时才有此字段
        colors: finalColors, // 使用合并后的颜色
        tokenColors: finalTokenColors, // 使用合并后的 tokenColors
        semanticHighlighting: themeData.semanticHighlighting,
        semanticTokenColors: themeData.semanticTokenColors,
        source: 'user',
        isBuiltin: false,
        isFavorite: themeData.isFavorite,
        usageCount: themeData.usageCount,
        lastUsedAt: themeData.lastUsedAt,
        createdAt: existingTheme?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      // 保存到文件
      console.log('[ThemeService] 即将调用 saveThemeFile...');
      await this.saveThemeFile(theme, 'user');
      console.log('[ThemeService] saveThemeFile 调用完成');

      // 更新内存中的主题列表
      this.themes.set(theme.id, theme);
      console.log('[ThemeService] 已更新内存中的主题列表');

      // 如果选项指定设置为活动主题
      if (options?.setAsActive) {
        console.log('[ThemeService] 正在设置为活动主题...');
        await this.setTheme(theme.id);
        console.log('[ThemeService] 已设置为活动主题');
      }

      console.log('[ThemeService] ✅ 主题保存成功:', theme.id);

      return {
        success: true,
        data: this.convertToThemeData(theme),
      };
    } catch (error) {
      console.error('[ThemeService] 保存主题失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存主题失败',
      };
    }
  }

  /**
   * 删除主题
   */
  async deleteTheme(themeId: string): Promise<boolean> {
    try {
      const theme = this.themes.get(themeId);
      if (!theme) {
        return false;
      }

      // 不允许删除内置主题
      if (theme.isBuiltin) {
        console.error('[ThemeService] 不能删除内置主题');
        return false;
      }

      // 从Map中移除
      this.themes.delete(themeId);

      // 删除文件
      const source = theme.source || 'user';
      const filePath = path.join(this.themesDir, source, `${themeId}.json`);
      
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn('[ThemeService] 删除主题文件失败:', error);
      }

      console.log('[ThemeService] 主题已删除:', themeId);
      return true;
    } catch (error) {
      console.error('[ThemeService] 删除主题失败:', error);
      return false;
    }
  }

  /**
   * 获取主题配置
   */
  getThemeConfig(): ThemeConfigData {
    return this.store.get('theme-config') || {};
  }

  /**
   * 转换为传输格式
   */
  private convertToThemeData(theme: AppTheme): ThemeData {
    // 转换 semanticTokenColors 以匹配传输格式
    const semanticTokenColors = theme.semanticTokenColors
      ? Object.fromEntries(
          Object.entries(theme.semanticTokenColors).map(([key, value]) => {
            if (typeof value === 'string') {
              return [key, value];
            }
            // 将 TokenStyle 转换为 Record<string, string>
            const tokenStyle = value as TokenStyle;
            return [
              key,
              {
                foreground: tokenStyle.foreground,
                background: tokenStyle.background,
                fontStyle: tokenStyle.fontStyle,
              } as Record<string, string>,
            ];
          })
        )
      : undefined;

    return {
      id: theme.id,
      name: theme.name,
      type: theme.type,
      author: theme.author,
      description: theme.description,
      version: theme.version,
      colors: theme.colors,
      tokenColors: theme.tokenColors,
      semanticHighlighting: theme.semanticHighlighting,
      semanticTokenColors,
      source: theme.source,
      isBuiltin: theme.isBuiltin,
      isFavorite: theme.isFavorite,
      usageCount: theme.usageCount,
      lastUsedAt: theme.lastUsedAt,
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
      originalPath: theme.originalPath,
    };
  }

  /**
   * 获取最新的用户自定义主题文件路径和内容
   * 返回修改时间最新的主题文件
   */
  async getLatestUserThemeFile(): Promise<{ path: string; content: string } | null> {
    const userDir = path.join(this.themesDir, 'user');
    
    try {
      // 确保目录存在
      await fs.mkdir(userDir, { recursive: true });
      
      const files = await fs.readdir(userDir);
      const themeFiles = files.filter((f) => f.endsWith('.json') || f.endsWith('.jsonc'));

      if (themeFiles.length === 0) {
        console.log('[ThemeService] 未找到用户自定义主题文件');
        return null;
      }

      // 获取所有文件的修改时间
      const fileStats = await Promise.all(
        themeFiles.map(async (file) => {
          const filePath = path.join(userDir, file);
          const stats = await fs.stat(filePath);
          return { file, filePath, mtime: stats.mtime };
        })
      );

      // 按修改时间排序，最新的在前
      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // 读取最新的文件
      const latestFile = fileStats[0];
      const content = await fs.readFile(latestFile.filePath, 'utf-8');

      console.log('[ThemeService] 找到最新的用户主题文件:', latestFile.file);
      console.log('[ThemeService] 修改时间:', latestFile.mtime);

      return {
        path: latestFile.filePath,
        content,
      };
    } catch (error) {
      console.error('[ThemeService] 获取最新用户主题文件失败:', error);
      return null;
    }
  }

  /**
   * 保存主题颜色覆盖
   * 文件名 = baseThemeId.json
   * 内容只包含被修改的颜色
   */
  async saveThemeOverride(
    baseThemeId: string,
    colors: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[ThemeService] ========== 开始保存主题颜色覆盖 ==========');
    console.log('[ThemeService] 基础主题ID:', baseThemeId);
    console.log('[ThemeService] 覆盖颜色数量:', Object.keys(colors).length);

    try {
      // 验证基础主题是否存在
      const baseTheme = this.themes.get(baseThemeId);
      if (!baseTheme) {
        console.error('[ThemeService] 基础主题不存在:', baseThemeId);
        return {
          success: false,
          error: `基础主题 "${baseThemeId}" 不存在`,
        };
      }

      // 只允许覆盖内置主题
      if (!baseTheme.isBuiltin) {
        console.error('[ThemeService] 不能覆盖非内置主题:', baseThemeId);
        return {
          success: false,
          error: '只能覆盖内置主题的颜色',
        };
      }

      // 确保用户目录存在
      const userDir = path.join(this.themesDir, 'user');
      await fs.mkdir(userDir, { recursive: true });

      // 文件名 = 主题ID.json
      const filePath = path.join(userDir, `${baseThemeId}.json`);
      console.log('[ThemeService] 覆盖文件路径:', filePath);

      // 创建覆盖配置（只包含颜色）
      const overrideConfig = {
        colors,
      };

      // 保存到文件
      await fs.writeFile(filePath, JSON.stringify(overrideConfig, null, 2), 'utf-8');

      console.log('[ThemeService] ✅ 主题颜色覆盖保存成功');
      console.log('[ThemeService] 文件路径:', filePath);
      console.log('[ThemeService] 覆盖颜色数:', Object.keys(colors).length);

      // 重新加载用户主题以应用覆盖
      await this.loadUserThemes();

      return { success: true };
    } catch (error) {
      console.error('[ThemeService] 保存主题颜色覆盖失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 获取主题颜色覆盖
   * 读取 baseThemeId.json 文件
   */
  async getThemeOverride(
    baseThemeId: string
  ): Promise<{ success: boolean; colors?: Record<string, string>; error?: string }> {
    console.log('[ThemeService] 获取主题颜色覆盖:', baseThemeId);

    try {
      const userDir = path.join(this.themesDir, 'user');
      const filePath = path.join(userDir, `${baseThemeId}.json`);

      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        console.log('[ThemeService] 覆盖文件不存在:', filePath);
        return { success: true, colors: {} };
      }

      // 读取文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      const parseErrors: jsonc.ParseError[] = [];
      const overrideConfig = jsonc.parse(content, parseErrors);

      if (parseErrors.length > 0) {
        console.error('[ThemeService] 覆盖文件解析错误:', parseErrors);
        return {
          success: false,
          error: '覆盖文件格式错误',
        };
      }

      console.log('[ThemeService] 读取到覆盖颜色数量:', Object.keys(overrideConfig.colors || {}).length);

      return {
        success: true,
        colors: overrideConfig.colors || {},
      };
    } catch (error) {
      console.error('[ThemeService] 获取主题颜色覆盖失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 删除主题颜色覆盖
   */
  async deleteThemeOverride(baseThemeId: string): Promise<{ success: boolean; error?: string }> {
    console.log('[ThemeService] 删除主题颜色覆盖:', baseThemeId);

    try {
      const userDir = path.join(this.themesDir, 'user');
      const filePath = path.join(userDir, `${baseThemeId}.json`);

      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        console.log('[ThemeService] 覆盖文件不存在，无需删除');
        return { success: true };
      }

      // 删除文件
      await fs.unlink(filePath);

      console.log('[ThemeService] ✅ 主题颜色覆盖删除成功');

      // 重新加载用户主题以移除覆盖
      await this.loadUserThemes();

      return { success: true };
    } catch (error) {
      console.error('[ThemeService] 删除主题颜色覆盖失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }
}

