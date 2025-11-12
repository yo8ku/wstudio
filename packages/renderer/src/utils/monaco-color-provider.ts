/**
 * Monaco Editor 颜色提供器工具
 * 
 * 为 Monaco Editor 提供十六进制颜色值的色块预览和颜色选择器功能。
 * 支持 #RGB、#RGBA、#RRGGBB、#RRGGBBAA 格式。
 */

import type { Monaco } from '@monaco-editor/react';

/**
 * 解析十六进制颜色值为 RGBA 对象
 * @param hex - 十六进制颜色值（如 #FFFFFF）
 * @returns RGBA 对象，值范围为 0-1
 */
export const parseHexColor = (hex: string): { red: number; green: number; blue: number; alpha: number } => {
  const cleanHex = hex.replace('#', '');
  let r = 0, g = 0, b = 0, a = 1;
  
  if (cleanHex.length === 3) {
    // #RGB
    r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
    g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
    b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
  } else if (cleanHex.length === 4) {
    // #RGBA
    r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
    g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
    b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
    a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
  } else if (cleanHex.length === 6) {
    // #RRGGBB
    r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  } else if (cleanHex.length === 8) {
    // #RRGGBBAA
    r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    a = parseInt(cleanHex.substring(6, 8), 16) / 255;
  }
  
  return { red: r, green: g, blue: b, alpha: a };
};

/**
 * 将 RGBA 对象转换为十六进制颜色字符串
 * @param color - RGBA 颜色对象
 * @returns 十六进制颜色字符串
 */
export const rgbaToHex = (color: { red: number; green: number; blue: number; alpha: number }): string => {
  const r = Math.round(color.red * 255);
  const g = Math.round(color.green * 255);
  const b = Math.round(color.blue * 255);
  const a = color.alpha;
  
  if (a === 1) {
    // 完全不透明，返回 #RRGGBB 格式
    return `#${r.toString(16).padStart(2, '0').toUpperCase()}${g.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
  } else {
    // 有透明度，返回 #RRGGBBAA 格式
    const alpha = Math.round(a * 255);
    return `#${r.toString(16).padStart(2, '0').toUpperCase()}${g.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}${alpha.toString(16).padStart(2, '0').toUpperCase()}`;
  }
};

/**
 * 创建 Monaco 颜色提供器
 * @param options - 配置选项
 * @returns 颜色提供器对象
 */
export const createColorProvider = (options?: {
  /** 是否同时匹配带引号和不带引号的颜色值（默认为 true，同时匹配两种格式） */
  matchBoth?: boolean;
  /** 仅匹配带引号的颜色值（如 JSON 中的 "#FFFFFF"） */
  matchQuoted?: boolean;
  /** 自定义颜色匹配正则表达式 */
  customRegex?: RegExp;
}) => {
  const { matchBoth = true, matchQuoted = false, customRegex } = options || {};
  
  return {
    /**
     * 提供文档中的颜色信息
     */
    provideDocumentColors(model: any) {
      const text = model.getValue();
      const colors: any[] = [];
      const processedRanges = new Set<string>(); // 防止重复添加颜色
      
      // 定义要使用的正则表达式列表
      const regexList: RegExp[] = [];
      
      if (customRegex) {
        // 使用自定义正则
        regexList.push(customRegex);
      } else if (matchBoth) {
        // 同时匹配带引号和不带引号的颜色值
        regexList.push(/"(#[0-9A-Fa-f]{3,8})"/g); // 带双引号
        regexList.push(/'(#[0-9A-Fa-f]{3,8})'/g); // 带单引号
        regexList.push(/#[0-9A-Fa-f]{3,8}/g);      // 不带引号
      } else if (matchQuoted) {
        // 仅匹配带引号的颜色值
        regexList.push(/"(#[0-9A-Fa-f]{3,8})"/g);
        regexList.push(/'(#[0-9A-Fa-f]{3,8})'/g);
      } else {
        // 仅匹配不带引号的颜色值
        regexList.push(/#[0-9A-Fa-f]{3,8}/g);
      }
      
      // 遍历所有正则表达式
      for (const regex of regexList) {
        // 为每次循环创建新的正则实例
        const regexInstance = new RegExp(regex.source, regex.flags);
        let match: RegExpExecArray | null;
        
        while ((match = regexInstance.exec(text)) !== null) {
          // 判断是否有捕获组（带引号的情况）
          const hasQuotes = match[1] !== undefined;
          const colorValue = hasQuotes ? match[1] : match[0];
          const matchIndex = match.index;
          
          // 只处理有效长度的颜色值
          const hexLength = colorValue.length - 1; // 减去 # 号
          if (![3, 4, 6, 8].includes(hexLength)) {
            continue;
          }
          
          // 计算范围
          let startOffset: number;
          let endOffset: number;
          
          if (hasQuotes) {
            // 带引号：从引号后的 # 开始
            startOffset = matchIndex + 1; // 跳过开始的引号
            endOffset = startOffset + colorValue.length;
          } else {
            // 不带引号：直接使用颜色值范围
            startOffset = matchIndex;
            endOffset = matchIndex + colorValue.length;
          }
          
          // 使用范围作为唯一标识，避免重复
          const rangeKey = `${startOffset}-${endOffset}`;
          if (processedRanges.has(rangeKey)) {
            continue;
          }
          processedRanges.add(rangeKey);
          
          // 解析颜色
          const rgba = parseHexColor(colorValue);
          
          const startPos = model.getPositionAt(startOffset);
          const endPos = model.getPositionAt(endOffset);
          
          colors.push({
            color: rgba,
            range: {
              startLineNumber: startPos.lineNumber,
              startColumn: startPos.column,
              endLineNumber: endPos.lineNumber,
              endColumn: endPos.column
            }
          });
        }
      }
      
      console.log('[ColorProvider] 找到', colors.length, '个颜色');
      return colors;
    },
    
    /**
     * 提供颜色表示方式（用户选择颜色后如何显示）
     */
    provideColorPresentations(model: any, colorInfo: any) {
      const color = colorInfo.color;
      const presentations: any[] = [];
      
      // 转换为十六进制格式
      const hexColor = rgbaToHex(color);
      
      presentations.push({
        label: hexColor
      });
      
      return presentations;
    }
  };
};

/**
 * 为指定语言注册颜色提供器
 * @param monaco - Monaco 实例
 * @param languages - 要注册的语言列表
 * @param options - 配置选项
 * @returns 清理函数，用于取消注册
 */
export const registerColorProvider = (
  monaco: Monaco,
  languages: string | string[],
  options?: {
    /** 是否同时匹配带引号和不带引号的颜色值（默认为 true，同时匹配两种格式） */
    matchBoth?: boolean;
    /** 仅匹配带引号的颜色值（如 JSON 中的 "#FFFFFF"） */
    matchQuoted?: boolean;
    /** 自定义颜色匹配正则表达式 */
    customRegex?: RegExp;
  }
) => {
  const languageList = Array.isArray(languages) ? languages : [languages];
  const colorProvider = createColorProvider(options);
  
  console.log('[ColorProvider] 正在为以下语言注册颜色提供器:', languageList);
  console.log('[ColorProvider] 配置:', options);
  
  const disposables = languageList.map(lang => {
    const disposable = monaco.languages.registerColorProvider(lang, colorProvider);
    console.log('[ColorProvider] ✅ 已为语言注册颜色提供器:', lang);
    return disposable;
  });
  
  // 返回清理函数
  return () => {
    disposables.forEach(disposable => disposable.dispose());
  };
};

/**
 * 为 JSON/JSONC/Markdown 等语言注册通用颜色提供器
 * 自动匹配带引号和不带引号的颜色值，适用于大多数场景
 * 
 * 支持的颜色格式：
 * - 带双引号：`"#047aa6"`
 * - 带单引号：`'#047aa6'`
 * - 不带引号：`#047aa6`
 * - 短格式：`#fff`、`#f00`
 * - 带透明度：`#ff000080`
 * 
 * @param monaco - Monaco 实例
 * @returns 清理函数
 */
export const registerUniversalColorProvider = (monaco: Monaco) => {
  return registerColorProvider(
    monaco, 
    ['json', 'jsonc', 'markdown'], 
    { matchBoth: true } // 同时匹配带引号和不带引号的颜色值
  );
};

/**
 * 为 CSS/SCSS/LESS 注册颜色提供器（不带引号的颜色值）
 * CSS 文件中的颜色值通常不带引号
 * @param monaco - Monaco 实例
 * @returns 清理函数
 */
export const registerCssColorProvider = (monaco: Monaco) => {
  return registerColorProvider(monaco, ['css', 'scss', 'less'], { matchQuoted: false, matchBoth: false });
};

