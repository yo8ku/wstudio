/**
 * 文件图标映射 - 使用 xicons 图标系统
 * 模仿 VSCode 的文件图标系统
 */

import React from 'react';
import { Icon } from '../../Icons';
import { useIconTheme } from '../../../contexts/IconThemeContext';
import { iconThemeLoader } from '../../../services/IconThemeLoader';

export interface FileIconConfig {
  iconName: string; // 图标名称
  color?: string;   // 图标颜色
}

// 文件夹图标映射
export const getFolderIcon = (expanded: boolean, folderName?: string): FileIconConfig => {
  // 特殊文件夹
  const specialFolders: Record<string, FileIconConfig> = {
    '.git': { iconName: 'git', color: '#f34f29' },
    '.vscode': { iconName: 'settings', color: '#007acc' },
    'node_modules': { iconName: 'package', color: '#8bc34a' },
    'src': { iconName: 'folder', color: '#42a5f5' },
    'dist': { iconName: 'archive', color: '#ffa726' },
    'build': { iconName: 'build', color: '#ffa726' },
    'public': { iconName: 'public', color: '#66bb6a' },
    'assets': { iconName: 'file-image', color: '#ab47bc' },
    'components': { iconName: 'components', color: '#26c6da' },
    'utils': { iconName: 'build', color: '#78909c' },
    'lib': { iconName: 'library', color: '#78909c' },
    'test': { iconName: 'test', color: '#ff7043' },
    'tests': { iconName: 'test', color: '#ff7043' },
    '__tests__': { iconName: 'test', color: '#ff7043' },
    'docs': { iconName: 'book', color: '#5c6bc0' },
    'config': { iconName: 'settings', color: '#78909c' },
  };

  if (folderName && specialFolders[folderName]) {
    return specialFolders[folderName];
  }

  // 默认文件夹图标
  return {
    iconName: expanded ? 'folder-open' : 'folder',
    color: '#dcb67a',
  };
};

// 文件图标映射
export const getFileIcon = (fileName: string): FileIconConfig => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.toLowerCase();

  // 特殊文件名映射
  const specialFiles: Record<string, FileIconConfig> = {
    'package.json': { iconName: 'file-json', color: '#8bc34a' },
    'package-lock.json': { iconName: 'lock', color: '#8bc34a' },
    'tsconfig.json': { iconName: 'file-json', color: '#007acc' },
    'webpack.config.js': { iconName: 'settings', color: '#8dd6f9' },
    'vite.config.ts': { iconName: 'settings', color: '#646cff' },
    'rollup.config.js': { iconName: 'settings', color: '#ff3333' },
    '.gitignore': { iconName: 'git', color: '#f34f29' },
    '.npmignore': { iconName: 'package', color: '#cb3837' },
    '.prettierrc': { iconName: 'settings', color: '#f7b93e' },
    '.eslintrc': { iconName: 'settings', color: '#4b32c3' },
    '.eslintrc.js': { iconName: 'settings', color: '#4b32c3' },
    'readme.md': { iconName: 'file-book', color: '#519aba' },
    'changelog.md': { iconName: 'file-article', color: '#519aba' },
    'license': { iconName: 'file-document', color: '#d4d4d4' },
    'dockerfile': { iconName: 'file', color: '#2496ed' },
    '.dockerignore': { iconName: 'file', color: '#2496ed' },
  };

  if (specialFiles[baseName]) {
    return specialFiles[baseName];
  }

  // 扩展名映射
  const extensionMap: Record<string, FileIconConfig> = {
    // TypeScript
    'ts': { iconName: 'file-ts', color: '#3178c6' },
    'tsx': { iconName: 'file-tsx', color: '#3178c6' },
    
    // JavaScript
    'js': { iconName: 'file-js', color: '#f1dd3f' },
    'jsx': { iconName: 'file-jsx', color: '#f1dd3f' },
    'mjs': { iconName: 'file-js', color: '#f1dd3f' },
    'cjs': { iconName: 'file-js', color: '#f1dd3f' },
    
    // JSON
    'json': { iconName: 'file-json', color: '#f1dd3f' },
    'jsonc': { iconName: 'file-json', color: '#f1dd3f' },
    
    // Markdown
    'md': { iconName: 'file-md', color: '#519aba' },
    'mdx': { iconName: 'file-md', color: '#519aba' },
    
    // CSS
    'css': { iconName: 'file-css', color: '#42a5f5' },
    'scss': { iconName: 'file-css', color: '#c6538c' },
    'sass': { iconName: 'file-css', color: '#c6538c' },
    'less': { iconName: 'file-css', color: '#1d365d' },
    
    // HTML
    'html': { iconName: 'file-html', color: '#e44d26' },
    'htm': { iconName: 'file-html', color: '#e44d26' },
    
    // Images
    'png': { iconName: 'file-image', color: '#a074c4' },
    'jpg': { iconName: 'file-image', color: '#a074c4' },
    'jpeg': { iconName: 'file-image', color: '#a074c4' },
    'gif': { iconName: 'file-image', color: '#a074c4' },
    'svg': { iconName: 'file-image', color: '#ffb13b' },
    'webp': { iconName: 'file-image', color: '#a074c4' },
    'ico': { iconName: 'file-image', color: '#a074c4' },
    
    // Python
    'py': { iconName: 'file-py', color: '#3776ab' },
    'pyc': { iconName: 'file-py', color: '#3776ab' },
    
    // Go
    'go': { iconName: 'file-go', color: '#00add8' },
    
    // Rust
    'rs': { iconName: 'file-rust', color: '#dea584' },
    
    // C/C++
    'c': { iconName: 'file-c', color: '#555555' },
    'cpp': { iconName: 'file-cpp', color: '#00599c' },
    'cc': { iconName: 'file-cpp', color: '#00599c' },
    'h': { iconName: 'file-c', color: '#a074c4' },
    'hpp': { iconName: 'file-cpp', color: '#a074c4' },
    
    // Java
    'java': { iconName: 'file-java', color: '#ea2d2e' },
    'class': { iconName: 'file-java', color: '#ea2d2e' },
    'jar': { iconName: 'archive', color: '#ea2d2e' },
    
    // PHP
    'php': { iconName: 'file-php', color: '#8892be' },
    
    // Ruby
    'rb': { iconName: 'file-code', color: '#cc342d' },
    
    // Shell
    'sh': { iconName: 'terminal', color: '#89e051' },
    'bash': { iconName: 'terminal', color: '#89e051' },
    'zsh': { iconName: 'terminal', color: '#89e051' },
    
    // XML
    'xml': { iconName: 'file-code', color: '#e37933' },
    
    // YAML
    'yml': { iconName: 'settings', color: '#cb171e' },
    'yaml': { iconName: 'settings', color: '#cb171e' },
    
    // Text
    'txt': { iconName: 'file-document', color: '#d4d4d4' },
    'log': { iconName: 'file-document', color: '#d4d4d4' },
    
    // Archives
    'zip': { iconName: 'archive', color: '#ffca28' },
    'rar': { iconName: 'archive', color: '#ffca28' },
    '7z': { iconName: 'archive', color: '#ffca28' },
    'tar': { iconName: 'archive', color: '#ffca28' },
    'gz': { iconName: 'archive', color: '#ffca28' },
    
    // Database
    'sql': { iconName: 'database', color: '#c58af9' },
    'db': { iconName: 'database', color: '#c58af9' },
    'sqlite': { iconName: 'database', color: '#c58af9' },
    
    // Config
    'env': { iconName: 'settings', color: '#faf594' },
    'ini': { iconName: 'settings', color: '#d4d4d4' },
    'toml': { iconName: 'settings', color: '#9c4221' },
    
    // Fonts
    'ttf': { iconName: 'font', color: '#d4d4d4' },
    'otf': { iconName: 'font', color: '#d4d4d4' },
    'woff': { iconName: 'font', color: '#d4d4d4' },
    'woff2': { iconName: 'font', color: '#d4d4d4' },
    
    // Video
    'mp4': { iconName: 'file-video', color: '#fd971f' },
    'avi': { iconName: 'file-video', color: '#fd971f' },
    'mov': { iconName: 'file-video', color: '#fd971f' },
    'webm': { iconName: 'file-video', color: '#fd971f' },
    
    // Audio
    'mp3': { iconName: 'file-audio', color: '#00b8d1' },
    'wav': { iconName: 'file-audio', color: '#00b8d1' },
    'ogg': { iconName: 'file-audio', color: '#00b8d1' },
    
    // PDF
    'pdf': { iconName: 'file-pdf', color: '#f40f02' },
  };

  return extensionMap[ext] || { iconName: 'file', color: '#d4d4d4' };
};

/**
 * 文件图标组件
 */
interface FileIconProps {
  fileName?: string;
  folderName?: string;
  isFolder?: boolean;
  isExpanded?: boolean;
  size?: number;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({
  fileName,
  folderName,
  isFolder = false,
  isExpanded = false,
  size = 16,
  className,
}) => {
  const { currentIconThemeConfig } = useIconTheme();
  const [iconDef, setIconDef] = React.useState<any>(null);
  const [svgContent, setSvgContent] = React.useState<string | null>(null);

  // 根据当前图标主题获取图标定义
  React.useEffect(() => {
    if (!currentIconThemeConfig) {
      setIconDef(null);
      setSvgContent(null);
      return;
    }

    const loadIcon = async () => {
      let def: any;
      if (isFolder) {
        def = iconThemeLoader.getIconForFolder(
          folderName || '',
          isExpanded,
          currentIconThemeConfig
        );
      } else {
        def = iconThemeLoader.getIconForFile(
          fileName || '',
          currentIconThemeConfig
        );
      }
      
      setIconDef(def);
      
      // 如果有 iconPath，检查文件类型并加载
      if (def && def.iconPath) {
        try {
          // 从路径中提取相对路径（去掉 extensions/ 之前的部分）
          let iconPath = def.iconPath;
          // 如果路径不是以 extensions/ 开头，尝试修复
          if (!iconPath.startsWith('extensions/')) {
            // 路径可能是相对于某个基础路径的，尝试查找 extensions/
            const extensionsIndex = iconPath.indexOf('extensions/');
            if (extensionsIndex >= 0) {
              iconPath = iconPath.substring(extensionsIndex);
            }
          }
          
          // 判断文件类型
          const fileExt = iconPath.split('.').pop()?.toLowerCase();
          
          if (fileExt === 'svg') {
            // SVG 文件：读取内容后内联渲染
            const content = await window.electronAPI?.fs?.readFile?.(iconPath, 'utf-8');
            if (content) {
              setSvgContent(content);
            } else {
              setSvgContent(null);
            }
          } else if (fileExt === 'png' || fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'gif') {
            // 图片文件：读取为 base64 并转换为 data URL
            const buffer = await window.electronAPI?.fs?.readFile?.(iconPath, 'base64');
            if (buffer) {
              const mimeType = fileExt === 'png' ? 'image/png' : 
                               fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' : 
                               fileExt === 'gif' ? 'image/gif' : 'image/png';
              const dataUrl = `data:${mimeType};base64,${buffer}`;
              setSvgContent(dataUrl);
            } else {
              setSvgContent(null);
            }
          } else {
            // 其他格式暂不支持
            console.warn('[FileIcon] 不支持的图标文件格式:', fileExt);
            setSvgContent(null);
          }
        } catch (error) {
          console.error('[FileIcon] 加载图标失败:', def.iconPath, error);
          setSvgContent(null);
        }
      } else {
        setSvgContent(null);
      }
    };
    
    loadIcon();
  }, [currentIconThemeConfig, fileName, folderName, isFolder, isExpanded]);

  // 监听图标主题变化
  React.useEffect(() => {
    const handleIconThemeChange = () => {
      // 触发重新计算图标
      console.log('[FileIcon] 图标主题已更改，重新加载图标');
    };

    window.addEventListener('iconThemeChanged', handleIconThemeChange);
    return () => window.removeEventListener('iconThemeChanged', handleIconThemeChange);
  }, []);

  // 如果有图标主题配置
  if (iconDef) {
    // 基于图像的图标（iconPath）- 使用加载的内容
    if (iconDef.iconPath && svgContent) {
      // 判断是 SVG 内容还是 data URL
      if (svgContent.startsWith('data:')) {
        // 图片文件（PNG/JPG 等）- 使用 data URL
        return (
          <img
            src={svgContent}
            alt={fileName || folderName || 'icon'}
            className={className}
            style={{
              width: size,
              height: size,
              objectFit: 'contain',
              display: 'block',
            }}
          />
        );
      } else {
        // SVG 文件 - 内联渲染
        // 修改 SVG 以添加正确的尺寸
        const modifiedSvg = svgContent.replace(
          /<svg/,
          `<svg width="${size}" height="${size}" style="display: block;"`
        );
        
        return (
          <span
            className={className}
            style={{
              width: size,
              height: size,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            dangerouslySetInnerHTML={{ __html: modifiedSvg }}
          />
        );
      }
    }
    
    // 基于字体的图标（fontCharacter）
    if (iconDef.fontCharacter) {
      const fontFamily = currentIconThemeConfig?.fonts?.[0]?.id || 'monokai-pro-icons';
      // size 是像素值，fontSize 也应该是像素值
      const fontSize = currentIconThemeConfig?.fonts?.[0]?.size 
        ? (typeof currentIconThemeConfig.fonts[0].size === 'string' 
           ? currentIconThemeConfig.fonts[0].size 
           : `${currentIconThemeConfig.fonts[0].size}px`)
        : `${size}px`;
      
      // 将 \EAXX 格式的字符串转换为实际的 Unicode 字符
      // 例如: "\\EA14" -> "\uEA14" 的实际字符
      let character = iconDef.fontCharacter;
      
      // 检查是否是转义序列格式（例如 "\EA14"）
      if (character.startsWith('\\')) {
        // 提取十六进制代码点
        let hexCode = '';
        if (character.startsWith('\\u') || character.startsWith('\\U')) {
          // \uEAXX 或 \UEAXX 格式
          hexCode = character.substring(2);
        } else if (character.startsWith('\\E')) {
          // \EAXX 格式 (常见于 VS Code 图标主题)
          hexCode = character.substring(1);
        }
        
        if (hexCode) {
          // 将十六进制转换为实际的 Unicode 字符
          const codePoint = parseInt(hexCode, 16);
          if (!isNaN(codePoint)) {
            character = String.fromCharCode(codePoint);
          }
        }
      }
      
      console.log('[FileIcon] 渲染字体图标:', {
        fileName: fileName || folderName,
        fontFamily,
        fontSize,
        fontCharacter: iconDef.fontCharacter,
        convertedChar: character,
        charCode: character.charCodeAt(0).toString(16),
        fontColor: iconDef.fontColor,
        fontsLoaded: Array.from(document.fonts).map(f => f.family)
      });
      
      return (
        <span
          className={className}
          style={{
            fontFamily,
            fontSize,
            color: iconDef.fontColor || 'var(--vscode-foreground)',
            width: size,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {character}
        </span>
      );
    }
  }

  // 否则使用默认的内置图标
  const iconConfig = isFolder
    ? getFolderIcon(isExpanded, folderName)
    : getFileIcon(fileName || '');

  return (
    <Icon
      name={iconConfig.iconName}
      size={size}
      color={iconConfig.color}
      className={className}
    />
  );
};

