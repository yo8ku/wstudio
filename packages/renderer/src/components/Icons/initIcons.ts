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
    'terminal': 'ui:terminal',
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
    'database': 'ui:database',
    'font': 'material:font',
    
    // UI 控制别名（优先使用 material 图标集）
    'chevron-right': 'material:chevron-right',
    'expand-more': 'material:expand-more',
    
    // UI 图标别名（活动栏、标题栏等）
    'explorer': 'ui:explorer',
    'search': 'ui:search',
    'source-control': 'ui:source-control',
    'extensions': 'ui:extensions',
    'knowledge-base': 'ui:knowledge-base',
    'ai-model': 'ui:ai-model',
    'settings-activity': 'ui:settings-activity',
    'user': 'ui:user',
    'menu': 'ui:menu',
    'ai-assistant': 'ui:ai-assistant',
    'theme': 'ui:theme',
    'minimize': 'ui:minimize',
    'maximize': 'ui:maximize',
    'close-window': 'ui:close-window',
    'app-icon': 'ui:app-icon',
    'submenu-arrow': 'ui:submenu-arrow',
    'plus': 'ui:plus',
    'close': 'ui:close',
    'chevron-down': 'ui:chevron-down',
    'chevron-up': 'ui:chevron-up',
    'chevron-left': 'ui:chevron-left',
    'eye': 'ui:eye',
    'eye-off': 'ui:eye-off',
    'refresh': 'ui:refresh',
    'check': 'ui:check',
    'error': 'ui:error',
    'warning': 'ui:warning',
    'info': 'ui:info',
    'gear': 'ui:gear',
    'more-vertical': 'ui:more-vertical',
    'more-horizontal': 'ui:more-horizontal',
    'new-file': 'ui:new-file',
    'new-folder': 'ui:new-folder',
    'collapse-all': 'ui:collapse-all',
    'more-tools': 'ui:more-tools',
    'extensions-manager': 'ui:extensions-manager',
    'background-settings': 'ui:background-settings',
    
    // 扩展管理窗口图标别名
    'download': 'ui:chevron-down', // 临时使用，后续可替换为真实下载图标
    'palette': 'ui:gear', // 临时使用gear图标代表主题
    'puzzle': 'ui:extensions', // 使用现有扩展图标
    'image': 'material:file-image',
    'file-text': 'ui:new-file',
    'box': 'ui:new-folder',
    'loading': 'ui:refresh',
    'inbox': 'ui:explorer',
    'list': 'ui:menu',
    
    // 右侧活动栏图标别名
    'important-files': 'ui:important-files',
    'tags': 'ui:tags',
    'backlinks': 'ui:backlinks',
    'outline': 'ui:outline',
    'annotations': 'ui:annotations',
    'links': 'ui:links',
    'templates': 'ui:templates',
    'daily-note': 'ui:daily-note',
    'tag': 'ui:tag',
    
    // AI 助手相关图标别名
    'delete': 'ui:delete',
    'history': 'ui:history',
    'code-snippet': 'ui:code-snippet',
    'file-upload': 'ui:file-upload',
    'streaming': 'ui:streaming',
    'context': 'ui:context',
    'clear-context': 'ui:clear-context',
    'code-execution': 'ui:code-execution',
    'deep-thinking': 'ui:deep-thinking',
    'reasoning': 'ui:reasoning',
    'empty-state': 'ui:empty-state',
    'split-vertical': 'ui:split-vertical',
    'wrench': 'ui:wrench',
    'network': 'ui:network',
    'files-folder': 'ui:files-folder',
    'ai-panel-maximize': 'ui:ai-panel-maximize',
    'import': 'ui:import',
    'tool': 'ui:tool',
    'knowledge-base-book': 'ui:knowledge-base-book',
    
    // 主题设置窗口侧边栏图标别名
    'window': 'ui:close-window',
    'menubar': 'ui:menu',
    'statusbar': 'material:expand-more',
    'editor': 'ui:new-file',
    'activity-bar': 'ui:explorer',
    'component': 'material:components',
    
    // 搜索引擎图标别名
    'google': 'ui:google',
    'baidu': 'ui:baidu',
    'bing': 'ui:bing',
    'yandex': 'ui:yandex',
    'yahoo': 'ui:yahoo',
    'aol': 'ui:aol',
    
    // AI聊天工具栏图标别名
    'copy': 'ui:copy',
    'thumb-up': 'ui:thumb-up',
    'thumb-down': 'ui:thumb-down',
    'regenerate': 'ui:regenerate',
    'add-to-chat': 'ui:add-to-chat',
    
    // 编辑图标别名
    'edit': 'ui:edit',
    
    // AI 魔法图标别名
    'sparkles': 'ui:sparkles',
    
    // 表格设计器图标别名
    'type-icon': 'ui:type-icon',
    'at-sign': 'ui:at-sign',
    'link-2': 'ui:link-2',
    'clock': 'ui:clock',
    'table-properties': 'ui:table-properties',
    'radio-select': 'ui:radio-select',
    'checkbox-select': 'ui:checkbox-select',
    'number-hash': 'ui:number-hash',
    'calendar-date': 'ui:calendar-date',
    'list-checks': 'ui:list-checks',
    'paint-bucket': 'ui:paint-bucket',
    'arrow-left': 'ui:arrow-left',
    'arrow-right': 'ui:arrow-right',
    'info-circle': 'ui:info-circle',
    'grip-vertical': 'ui:grip-vertical',
    
    // 单元格工具栏图标别名
    'cell-fill': 'ui:cell-fill',
    'cell-polish': 'ui:cell-polish',
    'cell-translate': 'ui:cell-translate',
    'cell-more': 'ui:cell-more',
    
    // 发送图标别名
    'send': 'ui:send',

    // Skills 市场图标别名
    'star': 'ui:star',
    'skill-detail': 'ui:skill-detail',

    // 媒体播放图标别名
    'circle-play': 'ui:circle-play',
  });
}

/**
 * 检查图标系统是否已初始化
 */
export function isIconSystemInitialized(): boolean {
  return initialized;
}

