import React from 'react';
import type { SelectGroup, SelectItem } from '../../../common/Select/Select';
import { knowledgeBaseService } from '../../../Layout/Sidebar/KnowledgeBase/knowledgeBaseService';
import { tableReferenceService } from '../../../../services/tableReference/TableReferenceService';
import { getPromptTemplates } from '../../../../services/PromptTemplateService';
import { Icon } from '../../../Icons/Icon';

interface WorkspaceTreeEntry {
  name: string;
  path: string;
  type: string;
}

const LABEL_FILES = '\u6587\u4ef6&\u6587\u4ef6\u5939';
const LABEL_KNOWLEDGE_BASE = '\u77e5\u8bc6\u5e93';
const LABEL_FORMS = '\u8868\u5355';
const LABEL_PROMPTS = '\u63d0\u793a\u8bcd';
const LABEL_RULES = '\u89c4\u5219';

function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function truncatePath(filePath: string, maxSegments = 2): string {
  const parts = filePath.split(/[/\\]/).filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return '';
  }

  const isWindowsPath = parts[0]?.length === 2 && parts[0][1] === ':';
  const pathSegments = isWindowsPath ? parts.slice(1) : parts;

  if (pathSegments.length <= maxSegments) {
    return pathSegments.join('/');
  }

  return `..../${pathSegments.slice(-maxSegments).join('/')}`;
}

function formatRecentFileLabel(filePath: string): React.ReactElement {
  const fileName = getFileName(filePath);
  const truncatedPath = truncatePath(filePath);
  const children: React.ReactNode[] = [
    React.createElement('span', { className: 'recent-file-name', key: 'name' }, fileName)
  ];

  if (truncatedPath) {
    children.push(
      React.createElement('span', { className: 'recent-file-path', key: 'path' }, `  ${truncatedPath}`)
    );
  }

  return React.createElement('span', { className: 'recent-file-label' }, ...children);
}

function createIndentedLabel(name: string): React.ReactElement {
  return React.createElement(
    'span',
    {
      className: 'indented-label',
      style: {
        display: 'flex',
        alignItems: 'center',
      }
    },
    React.createElement('span', { key: 'name' }, name)
  );
}

async function buildRecentFilesGroup(): Promise<SelectGroup[]> {
  try {
    const response = await window.electron?.workspace?.getRecentFiles();
    if (!response?.success || !response.data || response.data.length === 0) {
      return [];
    }

    return [{
      groupName: '',
      items: response.data.slice(0, 3).map((filePath, index) => ({
        value: `recent-file-${index}`,
        label: formatRecentFileLabel(filePath),
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
      })),
    }];
  } catch (error) {
    console.error('[buildContextMenuItems] Failed to load recent files:', error);
    return [];
  }
}

function buildCategoryItem(
  value: string,
  label: string,
  iconName: string,
  showDivider = false
): SelectGroup {
  return {
    groupName: '',
    showDivider,
    items: [{
      value,
      label,
      icon: React.createElement(Icon, { iconSet: 'ui', name: iconName, size: 14 }),
      rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
    }],
  };
}

export async function buildLevel1MenuItems(): Promise<SelectGroup[]> {
  const groups = await buildRecentFilesGroup();

  groups.push(buildCategoryItem('category-files', LABEL_FILES, 'folder', groups.length > 0));
  groups.push(buildCategoryItem('category-knowledge-base', LABEL_KNOWLEDGE_BASE, 'book-open', true));
  groups.push(buildCategoryItem('category-forms', LABEL_FORMS, 'table-properties', true));
  groups.push(buildCategoryItem('category-prompts', LABEL_PROMPTS, 'message-circle'));
  groups.push(buildCategoryItem('category-rules', LABEL_RULES, 'file-code'));

  return groups;
}

async function loadWorkspaceEntries(targetPath: string): Promise<WorkspaceTreeEntry[]> {
  const result = await window.electron?.folder?.readTree(targetPath);
  if (!result?.success || !result.data || !Array.isArray(result.data)) {
    return [];
  }

  const entries = result.data as WorkspaceTreeEntry[];
  return entries.filter((entry) => entry.name !== '.wstudio');
}

async function buildWorkspaceFileItems(
  targetPath: string,
  expandedFolders: Set<string>
): Promise<SelectItem[]> {
  const entries = await loadWorkspaceEntries(targetPath);
  const folders = entries.filter((entry) => entry.type === 'directory');
  const files = entries.filter((entry) => entry.type !== 'directory');
  const items: SelectItem[] = [];

  for (const folder of folders) {
    const isExpanded = expandedFolders.has(folder.path);
    const leftIcon = React.createElement(
      'span',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }
      },
      React.createElement(
        'span',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }
        },
        React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 })
      ),
      React.createElement(Icon, { iconSet: 'ui', name: 'folder', size: 14 })
    );

    items.push({
      value: `folder-${folder.path}`,
      label: createIndentedLabel(folder.name),
      icon: leftIcon,
      dataType: 'folder',
    });

    if (isExpanded) {
      const childItems = await buildWorkspaceFileItems(folder.path, expandedFolders);
      items.push(...childItems);
    }
  }

  for (const file of files) {
    items.push({
      value: `file-${file.path}`,
      label: createIndentedLabel(file.name),
      icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
      dataType: 'file',
    });
  }

  return items;
}

async function buildFilesGroup(expandedFolders: Set<string>, parentPath?: string): Promise<SelectGroup[]> {
  try {
    const workspaceResult = await window.electron?.workspace?.getDir();
    if (!workspaceResult?.success || !workspaceResult.data) {
      if (parentPath) {
        return [];
      }

      return [{
        groupName: LABEL_FILES,
        items: [{
          value: 'no-workspace',
          label: '\u672a\u6253\u5f00\u5de5\u4f5c\u533a',
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'folder', size: 14 }),
          disabled: true,
        }],
      }];
    }

    const targetPath = parentPath || workspaceResult.data;
    const items = await buildWorkspaceFileItems(targetPath, expandedFolders);

    if (items.length === 0 && !parentPath) {
      return [{
        groupName: LABEL_FILES,
        items: [{
          value: 'no-files',
          label: '\u6682\u65e0\u6587\u4ef6\u548c\u6587\u4ef6\u5939',
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
          disabled: true,
        }],
      }];
    }

    if (items.length === 0) {
      return [];
    }

    return [{
      groupName: parentPath ? '' : LABEL_FILES,
      items,
    }];
  } catch (error) {
    console.error('[buildContextMenuItems] Failed to load workspace tree:', error);
    return [{
      groupName: LABEL_FILES,
      items: [{
        value: 'files-error',
        label: '\u83b7\u53d6\u6587\u4ef6\u5217\u8868\u5931\u8d25',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
        disabled: true,
      }],
    }];
  }
}

async function buildPromptGroup(): Promise<SelectGroup[]> {
  try {
    const promptTemplates = await getPromptTemplates();
    if (promptTemplates.length === 0) {
      return [{
        groupName: LABEL_PROMPTS,
        items: [{
          value: 'no-prompts',
          label: '\u6682\u65e0\u63d0\u793a\u8bcd',
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'message-circle', size: 14 }),
          disabled: true,
        }],
      }];
    }

    return [{
      groupName: LABEL_PROMPTS,
      items: promptTemplates.map((template) => ({
        value: `prompt-${template.id}`,
        label: template.name,
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'message-circle', size: 14 }),
      })),
    }];
  } catch (error) {
    console.error('[buildContextMenuItems] Failed to load prompt templates:', error);
    return [{
      groupName: LABEL_PROMPTS,
      items: [{
        value: 'prompt-error',
        label: '\u83b7\u53d6\u63d0\u793a\u8bcd\u5931\u8d25',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'message-circle', size: 14 }),
        disabled: true,
      }],
    }];
  }
}

async function buildKnowledgeBaseGroup(): Promise<SelectGroup[]> {
  try {
    const knowledgeBaseData = await knowledgeBaseService.loadFromStorage();
    const items = knowledgeBaseData.created
      .filter((knowledgeBase) => knowledgeBase.type === 'folder')
      .map((knowledgeBase) => ({
        value: `kb-${knowledgeBase.id}`,
        label: knowledgeBase.title,
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
      }));

    if (items.length === 0) {
      return [{
        groupName: LABEL_KNOWLEDGE_BASE,
        items: [{
          value: 'no-knowledge-base',
          label: '\u6682\u65e0\u77e5\u8bc6\u5e93',
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
          disabled: true,
        }],
      }];
    }

    return [{
      groupName: LABEL_KNOWLEDGE_BASE,
      items,
    }];
  } catch (error) {
    console.error('[buildContextMenuItems] Failed to load knowledge bases:', error);
    return [{
      groupName: LABEL_KNOWLEDGE_BASE,
      items: [{
        value: 'knowledge-base-error',
        label: '\u83b7\u53d6\u77e5\u8bc6\u5e93\u5931\u8d25',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
        disabled: true,
      }],
    }];
  }
}

async function buildFormsGroup(): Promise<SelectGroup[]> {
  try {
    const forms = await tableReferenceService.getAllForms();
    if (forms.length === 0) {
      return [{
        groupName: LABEL_FORMS,
        items: [{
          value: 'no-forms',
          label: '\u6682\u65e0\u8868\u5355',
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 }),
          disabled: true,
        }],
      }];
    }

    return [{
      groupName: LABEL_FORMS,
      items: forms.map((form) => ({
        value: `form-${form.id}`,
        label: form.name,
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 }),
      })),
    }];
  } catch (error) {
    console.error('[buildContextMenuItems] Failed to load forms:', error);
    return [{
      groupName: LABEL_FORMS,
      items: [{
        value: 'forms-error',
        label: '\u83b7\u53d6\u8868\u5355\u5931\u8d25',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 }),
        disabled: true,
      }],
    }];
  }
}

export async function buildLevel2MenuItems(
  category: string,
  onFileSelect: (filePath: string) => void,
  onPromptSelect: (promptId: string) => void,
  onKnowledgeBaseSelect: (kbId: string) => void,
  expandedFolders?: Set<string>,
  parentPath?: string,
  onFormSelect?: (formId: string) => void,
  expandedForms?: Set<string>
): Promise<SelectGroup[]> {
  void onFileSelect;
  void onPromptSelect;
  void onKnowledgeBaseSelect;
  void onFormSelect;
  void expandedForms;

  const folderState = expandedFolders ?? new Set<string>();

  if (category === 'category-files') {
    return buildFilesGroup(folderState, parentPath);
  }

  if (category === 'category-prompts') {
    return buildPromptGroup();
  }

  if (category === 'category-knowledge-base') {
    return buildKnowledgeBaseGroup();
  }

  if (category === 'category-forms') {
    return buildFormsGroup();
  }

  if (category === 'category-rules') {
    return [{
      groupName: LABEL_RULES,
      items: [],
    }];
  }

  return [];
}

export async function buildContextMenuItems(
  onSearch: () => void,
  onFileSelect: (filePath: string) => void,
  onPromptSelect: (promptId: string) => void,
  onKnowledgeBaseSelect: (kbId: string) => void,
): Promise<SelectGroup[]> {
  void onSearch;
  void onFileSelect;
  void onPromptSelect;
  void onKnowledgeBaseSelect;

  return buildLevel1MenuItems();
}
