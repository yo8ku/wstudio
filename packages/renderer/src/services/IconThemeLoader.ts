/**
 * 文件图标主题加载器
 * 负责从扩展目录加载和解析图标主题配置文件
 * 支持基于图像的图标主题（iconPath）和基于字体的图标主题（fontCharacter）
 */

export interface FontDefinition {
  id: string;
  src: Array<{ path: string; format: string }>;
  weight?: string;
  style?: string;
  size?: string;
}

export interface IconDefinition {
  iconPath?: string;
  fontCharacter?: string;
  fontColor?: string;
  fontId?: string;
}

export interface IconThemeConfiguration {
  fonts?: FontDefinition[];
  iconDefinitions: Record<string, IconDefinition>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  languageIds?: Record<string, string>;
  light?: {
    file?: string;
    folder?: string;
    folderExpanded?: string;
    fileExtensions?: Record<string, string>;
    fileNames?: Record<string, string>;
  };
  hidesExplorerArrows?: boolean;
}

export class IconThemeLoader {
  private cache: Map<string, IconThemeConfiguration> = new Map();
  private basePath: string = '';
  private loadedFonts: Set<string> = new Set();

  /**
   * 加载图标主题配置
   */
  async loadIconTheme(themePath: string): Promise<IconThemeConfiguration | null> {
    try {
      // 检查缓存
      if (this.cache.has(themePath)) {
        console.log('[IconThemeLoader] 从缓存加载图标主题:', themePath);
        return this.cache.get(themePath)!;
      }

      console.log('[IconThemeLoader] 正在加载图标主题配置:', themePath);

      // 使用 Electron IPC 读取文件内容
      const fileContent = await window.electronAPI?.fs?.readFile?.(themePath, 'utf-8');
      if (!fileContent) {
        console.error('[IconThemeLoader] 无法读取文件:', themePath);
        return null;
      }

      const config: IconThemeConfiguration = JSON.parse(fileContent);
      
      // 解析图标路径（相对于配置文件的路径）
      const baseUrl = themePath.substring(0, themePath.lastIndexOf('/'));
      this.basePath = baseUrl;

      // 处理字体图标：加载字体文件
      if (config.fonts && config.fonts.length > 0) {
        await this.loadFonts(config.fonts, baseUrl);
      }

      // 处理所有 iconPath，转换为绝对路径
      if (config.iconDefinitions) {
        for (const [key, def] of Object.entries(config.iconDefinitions)) {
          if (def.iconPath && def.iconPath.startsWith('./')) {
            config.iconDefinitions[key] = {
              ...def,
              iconPath: `${baseUrl}/${def.iconPath.substring(2)}`
            };
          } else if (def.iconPath && !def.iconPath.startsWith('http')) {
            config.iconDefinitions[key] = {
              ...def,
              iconPath: `${baseUrl}/${def.iconPath}`
            };
          }
        }
      }

      // 缓存配置
      this.cache.set(themePath, config);
      
      console.log('[IconThemeLoader] ✓ 图标主题配置加载成功:', themePath);
      console.log('[IconThemeLoader] 图标定义数量:', Object.keys(config.iconDefinitions || {}).length);
      if (config.fonts) {
        console.log('[IconThemeLoader] 字体数量:', config.fonts.length);
      }

      return config;
    } catch (error) {
      console.error('[IconThemeLoader] 加载图标主题失败:', error);
      return null;
    }
  }

  /**
   * 加载字体文件
   */
  private async loadFonts(fonts: FontDefinition[], baseUrl: string): Promise<void> {
    for (const font of fonts) {
      const fontId = font.id;
      if (this.loadedFonts.has(fontId)) {
        console.log('[IconThemeLoader] 字体已加载:', fontId);
        continue;
      }

      let fontLoaded = false;
      for (const src of font.src) {
        const fontPath = src.path.startsWith('./') 
          ? `${baseUrl}/${src.path.substring(2)}`
          : `${baseUrl}/${src.path}`;
        
        try {
          console.log('[IconThemeLoader] 正在加载字体文件:', fontPath);
          
          // 使用 Electron IPC 读取字体文件为 base64
          const fontData = await window.electronAPI?.fs?.readFile?.(fontPath, 'base64');
          if (!fontData) {
            console.warn('[IconThemeLoader] 无法读取字体文件:', fontPath);
            continue;
          }

          console.log('[IconThemeLoader] 字体文件读取成功，大小:', fontData.length, '字符');

          // 确定 MIME 类型
          const format = src.format || 'woff';
          const mimeTypes: Record<string, string> = {
            'woff': 'font/woff',
            'woff2': 'font/woff2',
            'ttf': 'font/ttf',
            'otf': 'font/otf',
          };
          const mimeType = mimeTypes[format] || 'font/woff';

          // 创建 data URL
          const dataUrl = `data:${mimeType};base64,${fontData}`;
          console.log('[IconThemeLoader] 创建 data URL, MIME 类型:', mimeType);

          // 创建 @font-face 规则
          const fontFace = new FontFace(fontId, `url(${dataUrl})`, {
            weight: font.weight || 'normal',
            style: font.style || 'normal'
          });

          console.log('[IconThemeLoader] 正在加载字体到 FontFace API...');
          await fontFace.load();
          console.log('[IconThemeLoader] FontFace 加载完成，状态:', fontFace.status);
          
          document.fonts.add(fontFace);
          this.loadedFonts.add(fontId);
          
          console.log('[IconThemeLoader] ✓ 字体加载成功:', fontId);
          console.log('[IconThemeLoader] 当前已加载的字体:', Array.from(document.fonts).map(f => f.family));
          
          fontLoaded = true;
          break; // 只需要加载第一个成功的格式
        } catch (error) {
          console.error('[IconThemeLoader] 字体加载失败:', fontId, fontPath, error);
        }
      }
      
      if (!fontLoaded) {
        console.error('[IconThemeLoader] ⚠️ 字体未能加载:', fontId);
      }
    }
  }

  /**
   * 根据文件名获取图标定义
   */
  getIconForFile(fileName: string, config: IconThemeConfiguration): IconDefinition | null {
    if (!config) return null;


    // 1. 优先匹配完整文件名
    if (config.fileNames && config.fileNames[fileName.toLowerCase()]) {
      const iconKey = config.fileNames[fileName.toLowerCase()];
      const iconDef = config.iconDefinitions[iconKey];
      return iconDef || null;
    }

    // 2. 匹配文件扩展名
    const ext = fileName.includes('.') 
      ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase()
      : '';
    
    if (ext && config.fileExtensions && config.fileExtensions[ext]) {
      const iconKey = config.fileExtensions[ext];
      const iconDef = config.iconDefinitions[iconKey];
      return iconDef || null;
    }

    // 3. 使用默认文件图标
    if (config.file && config.iconDefinitions[config.file]) {
      const iconDef = config.iconDefinitions[config.file];
      return iconDef;
    }

    // 4. 使用 _file 作为最后备选
    if (config.iconDefinitions['_file']) {
      const iconDef = config.iconDefinitions['_file'];
      return iconDef;
    }

    return null;
  }

  /**
   * 根据文件夹名获取图标定义
   */
  getIconForFolder(
    folderName: string, 
    isExpanded: boolean, 
    config: IconThemeConfiguration
  ): IconDefinition | null {
    if (!config) return null;

    const lowerFolderName = folderName.toLowerCase();

    // 1. 优先匹配特定文件夹名
    if (isExpanded) {
      if (config.folderNamesExpanded && config.folderNamesExpanded[lowerFolderName]) {
        const iconKey = config.folderNamesExpanded[lowerFolderName];
        return config.iconDefinitions[iconKey] || null;
      }
    } else {
      if (config.folderNames && config.folderNames[lowerFolderName]) {
        const iconKey = config.folderNames[lowerFolderName];
        return config.iconDefinitions[iconKey] || null;
      }
    }

    // 2. 使用默认文件夹图标
    const folderKey = isExpanded ? config.folderExpanded : config.folder;
    if (folderKey && config.iconDefinitions[folderKey]) {
      return config.iconDefinitions[folderKey];
    }

    // 3. 使用 _folder 作为备选
    const fallbackKey = isExpanded ? '_folder_open' : '_folder';
    if (config.iconDefinitions[fallbackKey]) {
      return config.iconDefinitions[fallbackKey];
    }

    return null;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 预加载多个图标主题
   */
  async preloadThemes(themePaths: string[]): Promise<void> {
    const promises = themePaths.map(path => this.loadIconTheme(path));
    await Promise.all(promises);
  }
}

// 导出单例
export const iconThemeLoader = new IconThemeLoader();

