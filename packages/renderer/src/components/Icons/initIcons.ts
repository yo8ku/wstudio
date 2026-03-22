/**
 * Icon system bootstrap.
 */

import { iconRegistry } from './IconRegistry';
import { availableIconSets } from './iconSets';

let initialized = false;

export function initIconSystem(): void {
  if (initialized) {
    console.warn('Icon system already initialized.');
    return;
  }

  iconRegistry.registerIconSets(availableIconSets);
  registerCommonAliases();

  initialized = true;
  console.log('Icon system initialized.');
}

function registerCommonAliases(): void {
  iconRegistry.registerAliases({
    'folder': 'ui:folder',
    'folder-open': 'ui:folder-open',

    'file': 'ui:file',
    'file-code': 'ui:file-code',
    'file-document': 'ui:file-document',

    'file-js': 'ui:file-code',
    'file-ts': 'ui:file-code',
    'file-jsx': 'ui:file-code',
    'file-tsx': 'ui:file-code',
    'file-html': 'ui:file-code',
    'file-css': 'ui:file-code',
    'file-json': 'ui:file-code',
    'file-md': 'ui:file-document',
    'file-py': 'ui:file-code',
    'file-java': 'ui:file-code',
    'file-go': 'ui:file-code',
    'file-rust': 'ui:file-code',
    'file-c': 'ui:file-code',
    'file-cpp': 'ui:file-code',
    'file-php': 'ui:file-code',

    'file-image': 'ui:image-icon',
    'file-video': 'ui:video-embed',
    'file-audio': 'ui:media',

    'file-pdf': 'ui:file-document',
    'file-book': 'ui:knowledge-base-book',
    'file-article': 'ui:file-document',

    'settings': 'ui:gear',
    'terminal': 'ui:terminal',
    'archive': 'ui:archive',
    'lock': 'ui:lock',
    'build': 'ui:tool',
    'git': 'ui:source-control',

    'public': 'ui:network',
    'test': 'ui:check',
    'library': 'ui:knowledge-base-book',
    'package': 'ui:package',
    'components': 'ui:extensions',
    'extension': 'ui:extensions',
    'database': 'ui:database',
    'font': 'ui:type-icon',

    'chevron-right': 'ui:chevron-right',
    'expand-more': 'ui:chevron-down',

    'explorer': 'ui:explorer',
    'search': 'ui:search',
    'source-control': 'ui:source-control',
    'extensions': 'ui:extensions',
    'knowledge-base': 'ui:knowledge-base',
    'ai-model': 'ui:ai-model',
    'settings-activity': 'ui:settings-activity',
    'bolt': 'ui:bolt',
    'user': 'ui:user',
    'circle-user-round': 'ui:circle-user-round',
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
    'extensions-manager': 'ui:extensions-manager',
    'background-settings': 'ui:background-settings',
    'editor-switch': 'ui:editor-switch',
    'filter': 'ui:filter',
    'save-all': 'ui:save-all',
    'close-all': 'ui:close-all',

    'download': 'ui:chevron-down',
    'palette': 'ui:gear',
    'puzzle': 'ui:extensions',
    'image': 'ui:image-icon',
    'file-text': 'ui:file-document',
    'box': 'ui:new-folder',
    'loading': 'ui:refresh',
    'inbox': 'ui:explorer',
    'list': 'ui:menu',

    'important-files': 'ui:important-files',
    'tags': 'ui:tags',
    'backlinks': 'ui:backlinks',
    'outline': 'ui:outline',
    'annotations': 'ui:annotations',
    'links': 'ui:links',
    'templates': 'ui:templates',
    'daily-note': 'ui:daily-note',
    'tag': 'ui:tag',

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

    'window': 'ui:close-window',
    'menubar': 'ui:menu',
    'statusbar': 'ui:chevron-down',
    'editor': 'ui:new-file',
    'activity-bar': 'ui:explorer',
    'component': 'ui:extensions',

    'google': 'ui:google',
    'baidu': 'ui:baidu',
    'bing': 'ui:bing',
    'yandex': 'ui:yandex',
    'yahoo': 'ui:yahoo',
    'aol': 'ui:aol',

    'copy': 'ui:copy',
    'thumb-up': 'ui:thumb-up',
    'thumb-down': 'ui:thumb-down',
    'regenerate': 'ui:regenerate',
    'add-to-chat': 'ui:add-to-chat',

    'edit': 'ui:edit',
    'sparkles': 'ui:sparkles',

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

    'cell-fill': 'ui:cell-fill',
    'cell-polish': 'ui:cell-polish',
    'cell-translate': 'ui:cell-translate',
    'cell-more': 'ui:cell-more',

    'send': 'ui:send',
    'star': 'ui:star',
    'skill-detail': 'ui:skill-detail',
    'circle-play': 'ui:circle-play',
    'video-embed': 'ui:video-embed',
    'media': 'ui:media',
    'sort-az': 'ui:sort-az',
    'row-height': 'ui:row-height',
    'row-height-low': 'ui:row-height-low',
    'row-height-medium': 'ui:row-height-medium',
    'row-height-high': 'ui:row-height-high',
    'row-height-extra-high': 'ui:row-height-extra-high',
    'text-search': 'ui:text-search',
  });
}

export function isIconSystemInitialized(): boolean {
  return initialized;
}
