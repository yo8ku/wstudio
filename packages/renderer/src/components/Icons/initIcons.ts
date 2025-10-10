/**
 * 图标系统初始化
 * 注册所有图标集和别名
 */

import { iconRegistry } from './IconRegistry';
import { availableIconSets } from './iconSets';

let initialized = false;

/**
 * 初始化图标系统
 * 注册所有可用的图标集和常用别名
 */
export function initIconSystem(): void {
  if (initialized) {
    console.warn('图标系统已经初始化，跳过重复初始化');
    return;
  }

  // 注册所有图标集
  iconRegistry.registerIconSets(availableIconSets);

  // 注册常用别名
  registerCommonAliases();

  initialized = true;
  console.log('图标系统初始化完成');
}

/**
 * 注册常用图标别名
 * 方便快速访问常用图标
 */
function registerCommonAliases(): void {
  iconRegistry.registerAliases({
    // 文件夹别名
    'folder': 'material:folder',
    'folder-open': 'material:folder-open',
    
    // 通用文件别名
    'file': 'material:file',
    'file-code': 'material:file-code',
    'file-document': 'material:file-document',
    
    // 编程语言别名（直接使用 file- 前缀的图标名）
    'file-js': 'material:file-js',
    'file-ts': 'material:file-ts',
    'file-jsx': 'material:file-jsx',
    'file-tsx': 'material:file-tsx',
    'file-html': 'material:file-html',
    'file-css': 'material:file-css',
    'file-json': 'material:file-json',
    'file-md': 'material:file-md',
    'file-py': 'material:file-py',
    'file-java': 'material:file-java',
    'file-go': 'material:file-go',
    'file-rust': 'material:file-rust',
    'file-c': 'material:file-c',
    'file-cpp': 'material:file-cpp',
    'file-php': 'material:file-php',
    
    // 媒体文件别名
    'file-image': 'material:file-image',
    'file-video': 'material:file-video',
    'file-audio': 'material:file-audio',
    
    // 文档别名
    'file-pdf': 'material:file-pdf',
    'file-book': 'material:file-book',
    'file-article': 'material:file-article',
    
    // 工具别名
    'settings': 'material:settings',
    'terminal': 'material:terminal',
    'archive': 'material:archive',
    'lock': 'material:lock',
    'build': 'material:build',
    'git': 'material:git',
    
    // 其他别名
    'public': 'material:public',
    'test': 'material:test',
    'library': 'material:library',
    'package': 'material:package',
    'components': 'material:components',
    'extension': 'material:extension',
    'database': 'material:database',
    'font': 'material:font',
    
    // UI 控制别名
    'chevron-right': 'material:chevron-right',
    'expand-more': 'material:expand-more',
  });
}

/**
 * 检查图标系统是否已初始化
 */
export function isIconSystemInitialized(): boolean {
  return initialized;
}

