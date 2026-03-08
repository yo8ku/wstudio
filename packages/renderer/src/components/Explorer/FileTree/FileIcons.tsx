/**
 * 闁哄倸娲ｅ▎銏ゅ炊閻愵剛鍨奸柡鍕Т閻?- 濞达綀娉曢弫?xicons 闁搞儳鍋撻悥锝囧寲閼姐倗鍩?
 * 婵☆垪鈧尪闆?VSCode 闁汇劌瀚弸鍐╃鐠虹儤绂堥柡宥呮川闁绱?
 */

import React from 'react';
import { Icon } from '../../Icons';
import { useIconTheme } from '../../../contexts/IconThemeContext';
import { iconThemeLoader } from '../../../services/IconThemeLoader';

export interface FileIconConfig {
  iconName: string; // 闁搞儳鍋撻悥锝夊触瀹ュ泦?
  color?: string;   // 闁搞儳鍋撻悥锝嗭紣濠婂棗顥?
}

// 闁哄倸娲ｅ▎銏″緞閻熺増绂堥柡宥呮处濡惭呬焊?
export const getFolderIcon = (expanded: boolean, folderName?: string): FileIconConfig => {
  // 闁绘顫夐悾鈺呭棘閸ワ附顐藉?
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

  // 濮掓稒顭堥濠氬棘閸ワ附顐藉鍓佹嚀濞存﹢寮?
  return {
    iconName: expanded ? 'folder-open' : 'folder',
    color: '#dcb67a',
  };
};

// 闁哄倸娲ｅ▎銏ゅ炊閻愵剛鍨奸柡鍕Т閻?
export const getFileIcon = (fileName: string): FileIconConfig => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.toLowerCase();

  // 闁绘顫夐悾鈺呭棘閸ワ附顐介柛姘У濡惭呬焊?
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

  // 闁圭鏅涢惈宥夊触瀹ュ棙衼閻?
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
 * 闁哄倸娲ｅ▎銏ゅ炊閻愵剛鍨肩紓浣稿濞?
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

  // 闁哄秷顫夊畵浣姐亹閹惧啿顤呴柛銉у亾閻栵絾绋夋繝姘兼毌闁兼儳鍢茶ぐ鍥炊閻愵剛鍨奸悗瑙勭煯缁?
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
      
      // 濠碘€冲€归悘澶愬嫉?iconPath闁挎稑鏈ˉ鍛村蓟閵夛附鐎ù鐘插鐞氼偊宕圭€ｎ亣瀚欓柛鏃傚Ь濞?
      if (def && def.iconPath) {
        try {
          // 濞寸姴姘﹂惌鎯ь嚗閸曨亣鍘柟缁樺姇瑜板洭鎯勭粙娆惧殸閻犱警鍨扮欢鐐烘晬閸繂绠甸柟?extensions/ 濞戞柨顑呮晶鐘绘儍閸曨垰鍔ラ柛鎺戞４缁?
          let iconPath = def.iconPath;
          // 濠碘€冲€归悘澶屾崉椤栨氨绐炲☉鎾崇У濡插憡绂?extensions/ 鐎殿喒鍋撳鎯版彧缁辨繄浜稿┑濠勬Ц濞ｅ浂鍠栭ˇ?
          if (!iconPath.startsWith('extensions/')) {
            // 閻犱警鍨扮欢鐐哄矗椤栨繂鍘撮柡鍕靛灣濞村鈧敻鈧稓鑹鹃柡灞惧姃闁叉粓宕洪搹璇℃敤閻犱警鍨扮欢鐐烘儍閸曞墎绀夐悘蹇旂箚閻︻垶寮婚妷锕€顥?extensions/
            const extensionsIndex = iconPath.indexOf('extensions/');
            if (extensionsIndex >= 0) {
              iconPath = iconPath.substring(extensionsIndex);
            }
          }
          
          // 闁告帇鍊栭弻鍥棘閸ワ附顐界紒顐ヮ嚙閻?
          const fileExt = iconPath.split('.').pop()?.toLowerCase();
          
          if (fileExt === 'svg') {
            // SVG 闁哄倸娲ｅ▎銏ゆ晬濮樻剚鍤㈤柛娆愮墪閸炲鈧湱鎳撻幃妤呭礃閸涢绮撴繛鎾冲级閻?
            const content = await window.electronAPI?.fs?.readFile?.(iconPath, 'utf-8');
            if (content) {
              setSvgContent(content);
            } else {
              setSvgContent(null);
            }
          } else if (fileExt === 'png' || fileExt === 'jpg' || fileExt === 'jpeg' || fileExt === 'gif') {
            // 闁搞儱澧芥晶鏍棘閸ワ附顐介柨娑欎亢椤曚即宕ｉ弽锕佺 base64 妤犵偞鍎煎ù鍡涘箲椤叀绀?data URL
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
            // 闁稿繑婀圭划顒勫冀閻撳海纭€闁哄棗鍊风粭澶愬绩椤栨稑鐦?
            console.warn('[FileIcon] 濞戞挸绉甸弫顕€骞愭担鐑樼暠闁搞儳鍋撻悥锝夊棘閸ワ附顐介柡宥囧帶缁?', fileExt);
            setSvgContent(null);
          }
        } catch (error) {
          console.error('[FileIcon] 闁告梻濮惧ù鍥炊閻愵剛鍨煎鎯扮簿鐟?', def.iconPath, error);
          setSvgContent(null);
        }
      } else {
        setSvgContent(null);
      }
    };
    
    loadIcon();
  }, [currentIconThemeConfig, fileName, folderName, isFolder, isExpanded]);

  // 闁烩晜鍨甸幆澶愬炊閻愵剛鍨煎☉鎾愁煼椤ｄ粙宕ｅΟ鍝勵嚙
  React.useEffect(() => {
    const handleIconThemeChange = () => {
      // 閻熸瑱绠戣ぐ鍌炴煂瀹ュ棙鐓€閻犱緤绱曢悾濠氬炊閻愵剛鍨?
      console.log('[FileIcon] 图标主题已变化，重新加载图标');
    };

    window.addEventListener('iconThemeChanged', handleIconThemeChange);
    return () => window.removeEventListener('iconThemeChanged', handleIconThemeChange);
  }, []);

  // 濠碘€冲€归悘澶愬嫉婢跺﹥绂堥柡宥呮矗鐎靛本锛愬鈧崢銈囩磾?
  if (iconDef) {
    // 闁糕晞妗ㄧ花顒勫炊閹冨壖闁汇劌瀚ù姗€寮介崶椋庣iconPath闁? 濞达綀娉曢弫銈夊礉閻樼儤绁伴柣銊ュ閸炲鈧?
    if (iconDef.iconPath && svgContent) {
      // 闁告帇鍊栭弻鍥及?SVG 闁告劕鎳庨鎰交濡粯笑 data URL
      if (svgContent.startsWith('data:')) {
        // 闁搞儱澧芥晶鏍棘閸ワ附顐介柨娑樻恭NG/JPG 缂佹稑顧€缁? 濞达綀娉曢弫?data URL
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
        // SVG 闁哄倸娲ｅ▎?- 闁告劕鎳撴禒鍫濄€掗崣澶屽帬
        // 濞ｅ浂鍠楅弫?SVG 濞寸姰鍎查崸濠囧礉閻樻剚鍔€缁绢収鍠氬▓鎴犱焊閸濆嫷鍤?
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
  }


  // 闁告熬绠戦崹顖涙媴鐠恒劍鏆忓娑欘焾椤撳鎯冮崟顐㈡暥缂傚喚鍠栧ù姗€寮?
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

