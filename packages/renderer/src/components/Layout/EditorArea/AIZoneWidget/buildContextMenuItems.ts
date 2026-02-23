/**
 * 构建@菜单项的工具函数
 * 功能：根据当前状态构建Select组件需要的菜单项列表
 * 支持两级菜单：一级显示分类，二级显示具体选项
 */

import type { SelectGroup, SelectItem } from '../../../common/Select/Select';
import { snippetService } from '../../../../services/SnippetService';
import { knowledgeBaseService } from '../../../Layout/Sidebar/KnowledgeBase/knowledgeBaseService';
import { tableReferenceService } from '../../../../services/tableReference/TableReferenceService';
import { Icon } from '../../../Icons/Icon';
import React from 'react';

/**
 * 获取文件名（不包含路径）
 */
function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/**
 * 生成带有缩进的 label
 * @param name 文件或文件夹名称
 * @param depth 深度（从0开始，0表示根目录的直接子项）
 */
function createIndentedLabel(
  name: string,
  depth: number
): React.ReactElement {
  // 每层缩进 16px
  // const indentWidth = depth * 16;
  
  return React.createElement(
    'span',
    { 
      className: 'indented-label',
      style: { 
        display: 'flex', 
        alignItems: 'center',
        // paddingLeft: `${indentWidth}px`
      } 
    },
    React.createElement('span', { key: 'name' }, name)
  );
}

/**
 * 截断路径，从前面截断，只保留最后一个目录和文件名
 * 例如：E:\伟思笔记\AI 服务商.md -> 伟思笔记/AI 服务商.md
 * 例如：E:\aaaa\bbbbb\AI 服务商.md -> ..../bbbbb/AI 服务商.md
 * @param filePath 完整文件路径
 * @param maxPathSegments 最多保留的路径段数（包含文件名，默认2，只保留最后1个目录+文件名）
 * @returns 截断后的路径显示（只包含最后一个目录和文件名，使用 / 分隔符）
 */
function truncatePath(filePath: string, maxPathSegments: number = 2): string {
  // 过滤掉空字符串（处理路径分隔符连续的情况，如 E:\ 会分割成 ['E:', '']）
  const parts = filePath.split(/[/\\]/).filter(part => part.length > 0);
  
  // 如果路径段数 <= 1（只有盘符或只有文件名），返回空字符串（没有路径）
  if (parts.length <= 1) {
    return '';
  }
  
  // 判断第一个部分是否是盘符（如 E:）
  const isWindowsPath = parts[0] && parts[0].length === 2 && parts[0][1] === ':';
  
  // 如果包含盘符，去掉盘符；保留所有部分（包括文件名）
  const pathSegments = isWindowsPath ? parts.slice(1) : parts;
  
  // 如果路径段数 <= maxPathSegments，直接显示完整路径（不添加 ....）
  if (pathSegments.length <= maxPathSegments) {
    return pathSegments.join('/');
  }

  // 保留最后 maxPathSegments 个路径段（包含文件名）
  // 例如：pathSegments = ['aaaa', 'bbbbb', 'AI 服务商.md']
  // maxPathSegments = 2，则保留最后 2 个：['bbbbb', 'AI 服务商.md']
  const lastSegments = pathSegments.slice(-maxPathSegments);
  const result = `..../${lastSegments.join('/')}`;
  
  return result;
}

/**
 * 格式化最近文件的显示标签
 * 返回包含文件名和路径的 React 元素
 * 格式：文件名  ..../aaaa/xxx.md
 * 文件名正常显示，路径字体小一点、颜色淡一点
 */
function formatRecentFileLabel(filePath: string): React.ReactElement {
  const fileName = getFileName(filePath);
  const truncatedPath = truncatePath(filePath);
  const children: React.ReactNode[] = [
    React.createElement('span', { className: 'recent-file-name', key: 'name' }, fileName)
  ];
  
  // 只有当路径不为空时才显示路径
  if (truncatedPath) {
    children.push(
      React.createElement('span', { className: 'recent-file-path', key: 'path' }, `  ${truncatedPath}`)
    );
  }
  
  return React.createElement(
    'span',
    { className: 'recent-file-label' },
    ...children
  );
}

/**
 * 构建一级菜单（分类菜单）
 */
export async function buildLevel1MenuItems(): Promise<SelectGroup[]> {
  const groups: SelectGroup[] = [];

  // 1. 最近打开的文件（最多3个）
  try {
    const response = await window.electron?.workspace?.getRecentFiles();
    if (response?.success && response.data && Array.isArray(response.data) && response.data.length > 0) {
      const recentFilesItems = response.data.slice(0, 3).map((filePath: string, index: number) => ({
        value: `recent-file-${index}`,
        label: formatRecentFileLabel(filePath),
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
      }));
      
      if (recentFilesItems.length > 0) {
        groups.push({
          groupName: '',
          items: recentFilesItems,
        });
      }
    }
  } catch (error) {
    console.error('[buildContextMenuItems] 获取最近文件失败:', error);
  }

  // 2. 文件&文件夹（始终显示）
  groups.push({
    groupName: '',
    items: [
      {
        value: 'category-files',
        label: '文件&文件夹',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'folder', size: 14 }),
        rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
      },
    ],
    showDivider: true, // 在文件&文件夹上方显示分割线
  });

  // 3. 知识库（始终显示分类，即使没有数据）
  groups.push({
    groupName: '',
    items: [
      {
        value: 'category-knowledge-base',
        label: '知识库',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
        rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
      },
    ],
    showDivider: true, // 在知识库下方显示分割线
  });

  // 4. 表单（始终显示分类，即使没有数据）
  groups.push({
    groupName: '',
    items: [
      {
        value: 'category-forms',
        label: '表单',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 }),
        rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
      },
    ],
  });

  // 5. 提示词（始终显示）
  groups.push({
    groupName: '',
    items: [
      {
        value: 'category-prompts',
        label: '提示词',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'message-circle', size: 14 }),
        rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
      },
    ],
  });

  // 6. 规则（始终显示分类，即使没有数据）
  groups.push({
    groupName: '',
    items: [
      {
        value: 'category-rules',
        label: '规则',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file-code', size: 14 }),
        rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
      },
    ],
  });

  // 7. 常用片段（始终显示分类，即使没有数据）
  groups.push({
    groupName: '',
    items: [
      {
        value: 'category-snippets',
        label: '常用片段',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file-code', size: 14 }),
        rightIcon: React.createElement(Icon, { iconSet: 'ui', name: 'chevron-right', size: 14 }),
      },
    ],
  });

  return groups;
}

/**
 * 构建二级菜单（根据一级选择显示具体选项）
 */
export async function buildLevel2MenuItems(
  category: string,
  onFileSelect: (filePath: string) => void,
  onPromptSelect: (promptId: string) => void,
  onKnowledgeBaseSelect: (kbId: string) => void,
  onSnippetSelect: (snippetId: number) => void,
  onAgentSelect: (agentId: string) => void,
  expandedFolders?: Set<string>,
  parentPath?: string,
  onFormSelect?: (formId: string) => void,
  expandedForms?: Set<string>
): Promise<SelectGroup[]> {
  const groups: SelectGroup[] = [];

  if (category === 'category-files') {
    // 文件&文件夹二级菜单 - 从资源管理器获取文件和文件夹
    try {
      // 获取当前工作区路径
      const workspaceResult = await window.electron?.workspace?.getDir();
      if (workspaceResult?.success && workspaceResult.data) {
        const workspacePath = workspaceResult.data;
        const targetPath = parentPath || workspacePath;
        
        // 只读取当前层级的文件和文件夹
        const fileItems: SelectItem[] = [];
        
        try {
          const treeResult = await window.electron?.folder?.readTree(targetPath);
          if (treeResult?.success && treeResult.data && Array.isArray(treeResult.data)) {
            // 过滤掉 .wstudio 目录
            const filteredData = treeResult.data.filter((item: any) => item.name !== '.wstudio');
            // 先添加文件夹，再添加文件
            const folders: typeof treeResult.data = [];
            const files: typeof treeResult.data = [];

            for (const item of filteredData) {
              if (item.type === 'directory') {
                folders.push(item);
              } else {
                files.push(item);
              }
            }
            
            // 计算当前深度（相对于工作区根目录）
            const getDepth = (path: string): number => {
              const workspaceParts = workspacePath.split(/[/\\]/).filter(p => p.length > 0);
              const pathParts = path.split(/[/\\]/).filter(p => p.length > 0);
              // 计算路径相对于工作区的深度
              return Math.max(0, pathParts.length - workspaceParts.length - 1);
            };
            
            // 计算总项数（文件夹 + 文件）
            const totalItems = folders.length + files.length;
            
            // 添加文件夹项
            for (let i = 0; i < folders.length; i++) {
              const folder = folders[i];
              const isExpanded = expandedFolders?.has(folder.path) || false;
              const depth = getDepth(folder.path);
              
              // 创建左侧图标（箭头 + 文件夹图标）
              // 统一使用 chevron-right 图标，展开时旋转90度
              const leftIcon = React.createElement(
                'span',
                { 
                  style: { 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: '6px'
                  } 
                },
                React.createElement(
                  'span',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease'
                    }
                  },
                  React.createElement(Icon, { 
                    iconSet: 'ui', 
                    name: 'chevron-right', 
                    size: 14 
                  })
                ),
                React.createElement(Icon, { iconSet: 'ui', name: 'folder', size: 14 })
              );
              
              fileItems.push({
                value: `folder-${folder.path}`,
                label: createIndentedLabel(folder.name, depth),
                icon: leftIcon,
                dataType: 'folder',
                depth: depth,
              });
              
              // 如果文件夹已展开，递归添加子项
              if (isExpanded) {
                const childGroups = await buildLevel2MenuItems(
                  category,
                  onFileSelect,
                  onPromptSelect,
                  onKnowledgeBaseSelect,
                  onSnippetSelect,
                  onAgentSelect,
                  expandedFolders,
                  folder.path
                );
                
                // 将子项添加到当前列表
                if (childGroups.length > 0 && childGroups[0].items) {
                  fileItems.push(...childGroups[0].items);
                }
              }
            }
            
            // 添加文件项
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const depth = getDepth(file.path);
              
              fileItems.push({
                value: `file-${file.path}`,
                label: createIndentedLabel(file.name, depth),
                icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
                dataType: 'file',
                depth: depth,
              });
            }
          }
        } catch (error) {
          console.warn(`[buildContextMenuItems] 读取目录失败: ${targetPath}`, error);
        }
        
        if (fileItems.length > 0) {
          groups.push({
            groupName: parentPath ? '' : '文件&文件夹',
            items: fileItems,
          });
        } else if (!parentPath) {
          // 如果没有文件和文件夹，显示提示（只在根目录时显示）
          groups.push({
            groupName: '文件&文件夹',
            items: [
              {
                value: 'no-files',
                label: '暂无文件和文件夹',
                icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
                disabled: true,
              },
            ],
          });
        }
      } else {
        // 没有工作区
        if (!parentPath) {
          groups.push({
            groupName: '文件&文件夹',
            items: [
              {
                value: 'no-workspace',
                label: '未打开工作区',
                icon: React.createElement(Icon, { iconSet: 'ui', name: 'folder', size: 14 }),
                disabled: true,
              },
            ],
          });
        }
      }
    } catch (error) {
      console.error('[buildContextMenuItems] 获取文件列表失败:', error);
      if (!parentPath) {
        groups.push({
          groupName: '文件&文件夹',
          items: [
            {
              value: 'error',
              label: '获取文件列表失败',
              icon: React.createElement(Icon, { iconSet: 'ui', name: 'file', size: 14 }),
              disabled: true,
            },
          ],
        });
      }
    }
  } else if (category === 'category-prompts') {
    // 提示词二级菜单（移除代码相关的）
    const promptItems: SelectItem[] = [
      {
        value: 'prompt-doc-summary',
        label: '文档摘要',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file-text', size: 14 }),
      },
      {
        value: 'prompt-doc-translate',
        label: '文档翻译',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'file-text', size: 14 }),
      },
      {
        value: 'prompt-summarize',
        label: '总结',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'message-circle', size: 14 }),
      },
      {
        value: 'prompt-rewrite',
        label: '重写',
        icon: React.createElement(Icon, { iconSet: 'ui', name: 'message-circle', size: 14 }),
      },
    ];

    groups.push({
      groupName: '提示词',
      items: promptItems,
    });
  } else if (category === 'category-knowledge-base') {
    // 知识库二级菜单
    try {
      const kbData = await knowledgeBaseService.loadFromStorage();
      const knowledgeBases = kbData.created || [];
      
      // 只显示类型为文件夹的知识库（排除文件类型的知识库项）
      const filteredKBs = knowledgeBases.filter((kb) => kb.type === 'folder');
      
      if (filteredKBs.length > 0) {
        const kbItems: SelectItem[] = filteredKBs.map((kb) => ({
          value: `kb-${kb.id}`,
          label: kb.title,
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
        }));

        groups.push({
          groupName: '知识库',
          items: kbItems,
        });
      } else {
        // 如果没有知识库，显示提示
        groups.push({
          groupName: '知识库',
          items: [
            {
              value: 'no-knowledge-base',
              label: '暂无知识库',
              icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
              disabled: true,
            },
          ],
        });
      }
    } catch (error) {
      console.error('[buildContextMenuItems] 获取知识库失败:', error);
      groups.push({
        groupName: '知识库',
        items: [
          {
            value: 'error',
            label: '获取知识库失败',
            icon: React.createElement(Icon, { iconSet: 'ui', name: 'book-open', size: 14 }),
            disabled: true,
          },
        ],
      });
    }
  } else if (category === 'category-forms') {
    // 表单二级菜单
    try {
      const forms = await tableReferenceService.getAllForms();
      
      if (forms.length > 0) {
        const formItems: SelectItem[] = [];
        
        for (const form of forms) {
          const isExpanded = expandedForms?.has(form.id) || false;
          
          // 创建左侧图标（箭头 + 表单图标）
          const leftIcon = React.createElement(
            'span',
            { 
              style: { 
                display: 'flex', 
                alignItems: 'center',
                gap: '6px'
              } 
            },
            React.createElement(
              'span',
              {
                className: 'form-expand-icon',
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  cursor: 'pointer',
                }
              },
              React.createElement(Icon, { 
                iconSet: 'ui', 
                name: 'chevron-right', 
                size: 14 
              })
            ),
            React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 })
          );
          
          // value 格式: form|{encodedFormName}
          // 使用 | 作为分隔符，避免与 ID 中的 - 冲突
          formItems.push({
            value: `form|${encodeURIComponent(form.name)}`,
            label: form.name,
            icon: leftIcon,
            dataType: 'form',
            expandValue: `form-expand-${form.id}`,
          });
          
          // 如果表单已展开，添加字段列
          if (isExpanded) {
            const columns = await tableReferenceService.getFormColumns(form.id);
            for (const column of columns) {
              // value 格式: form-column|{encodedFormName}|{encodedColumnName}
              // 使用 | 作为分隔符，避免与 ID 中的 - 冲突
              // 使用 encodeURIComponent 编码名称，避免特殊字符问题
              formItems.push({
                value: `form-column|${encodeURIComponent(form.name)}|${encodeURIComponent(column.name)}`,
                label: column.name,
                icon: React.createElement(Icon, { iconSet: 'ui', name: 'type-icon', size: 14 }),
                dataType: 'form-column',
                depth: 1,
              });
            }
          }
        }

        groups.push({
          groupName: '表单',
          items: formItems,
        });
      } else {
        // 如果没有表单，显示提示
        groups.push({
          groupName: '表单',
          items: [
            {
              value: 'no-forms',
              label: '暂无表单',
              icon: React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 }),
              disabled: true,
            },
          ],
        });
      }
    } catch (error) {
      console.error('[buildContextMenuItems] 获取表单失败:', error);
      groups.push({
        groupName: '表单',
        items: [
          {
            value: 'error',
            label: '获取表单失败',
            icon: React.createElement(Icon, { iconSet: 'ui', name: 'table-properties', size: 14 }),
            disabled: true,
          },
        ],
      });
    }
  } else if (category === 'category-rules') {
    // 规则二级菜单（只添加选项，不做其他操作）
    groups.push({
      groupName: '规则',
      items: [],
    });
  } else if (category === 'category-snippets') {
    // 常用片段二级菜单
    try {
      const snippets = await snippetService.getAllSnippets(10);
      
      if (snippets.length > 0) {
        const snippetItems: SelectItem[] = snippets.map((snippet) => ({
          value: `snippet-${snippet.id}`,
          label: snippet.name,
          icon: React.createElement(Icon, { iconSet: 'ui', name: 'file-code', size: 14 }),
        }));

        groups.push({
          groupName: '常用片段',
          items: snippetItems,
        });
      }
    } catch (error) {
      console.error('[buildContextMenuItems] 获取常用片段失败:', error);
    }
  }

  return groups;
}

/**
 * 构建@菜单项（返回Select组件需要的格式）
 * @deprecated 使用 buildLevel1MenuItems 和 buildLevel2MenuItems 代替
 */
export async function buildContextMenuItems(
  onSearch: () => void,
  onFileSelect: (filePath: string) => void,
  onPromptSelect: (promptId: string) => void,
  onKnowledgeBaseSelect: (kbId: string) => void,
  onSnippetSelect: (snippetId: number) => void,
  onAgentSelect: (agentId: string) => void
): Promise<SelectGroup[]> {
  // 默认返回一级菜单
  return buildLevel1MenuItems();
}

