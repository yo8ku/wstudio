/**
 * 编辑器区域容器
 * 功能：管理编辑器标签页、文件保存和快捷键
 * 描述：提供文件编辑、保存、预览等核心功能
 */

// 顶层日志 - 模块加载时立即执行
console.log('========================================');
console.log('[EditorArea 模块] 文件被加载！');
console.log('========================================');

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as jsonc from 'jsonc-parser';
import { TabBar } from '../TabBar';
import { Breadcrumb } from '../Breadcrumb';
import { EditorGroup } from '../EditorGroup';
import { SettingsView } from '../../../Settings/SettingsView';
import { MarkdownPreview } from '../../../Editor/MarkdownPreview';
import { KnowledgeBaseView } from '../KnowledgeBaseView';
import { AIConfigView } from '../../../AIConfig/AIConfigView';
import { AIAgentView } from '../AIAgentView';
import { ExtensionManagerView } from '../ExtensionManagerView';
import { ResizableDivider } from '../ResizableDivider';
import { LanceDBView } from '../LanceDBView';
import { DatabaseView } from '../DatabaseView';
import { SimpleNoteEditor } from '../../../NoteEditor/SimpleNoteEditor';
import { CodeMirrorEditor } from '../../../NoteEditor/CodeMirrorEditor';
import { htmlToMarkdown, markdownToHtml, isHtmlContent } from '../../../NoteEditor/utils/formatConverter';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import type { KnowledgeItem } from '../../Sidebar/KnowledgeBase/types';
import { toastService } from '../../../../services/ToastService';
import './EditorArea.scss';

export interface EditorTab {
  id: string;
  title: string;
  path: string;
  isDirty: boolean;
  language?: string;
  content?: string;
  type?: 'file' | 'settings' | 'markdown-preview' | 'knowledge' | 'ai-config' | 'ai-agent' | 'extension-manager' | 'lancedb-view' | 'database-view';
  isPreview?: boolean;  // 新增：是否为预览模式（单击打开）
  sourceTabId?: string;  // 新增：预览标签页关联的源文件标签页ID
  knowledgeData?: { id: string; items: KnowledgeItem[]; description?: string };  // 知识库数据（用于 knowledge 类型）
  configId?: string;  // 新增：AI配置ID（用于 ai-config 类型，优先使用此字段）
  configIndex?: number;  // 已废弃：AI配置索引（用于 ai-config 类型，保留用于向后兼容）
  agentData?: { categoryId: string; categoryName: string };  // 新增：AI智能体数据（用于 ai-agent 类型）
}

interface EditorAreaProps {
  className?: string;
}

export const EditorArea: React.FC<EditorAreaProps> = ({ className = '' }) => {
  console.log('========================================');
  console.log('[EditorArea 组件] 组件函数被调用（渲染）');
  console.log('========================================');
  
  // 左侧编辑器组
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  // 右侧编辑器组（用于分割视图）
  const [rightTabs, setRightTabs] = useState<EditorTab[]>([]);
  const [rightActiveTabId, setRightActiveTabId] = useState<string | null>(null);
  
  // 分割视图是否激活
  const [isSplitView, setIsSplitView] = useState(false);
  
  // 左侧编辑器组宽度（像素）
  const [leftWidth, setLeftWidth] = useState<number | null>(null);

  // 跟踪哪些配置标签页有未保存的更改
  const [unsavedConfigTabs, setUnsavedConfigTabs] = useState<Set<string>>(new Set());

  // 编辑器类型状态：'monaco' | 'tiptap' | 'codemirror'
  const [editorType, setEditorType] = useState<'monaco' | 'tiptap' | 'codemirror'>('monaco');


  // 处理创建新片段
  const handleCreateSnippet = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const { name } = customEvent.detail;
    console.log('[EditorArea] 创建新片段:', name);
    
    // 创建 JSONC 格式的片段配置标签页，支持注释
    const snippetTemplate = `{
  // 片段名称（用于显示和区分片段）
  "name": "${name}",
  
  // 触发前缀（必填，用于自动补全。应该是独一无二的，例如：rfc, mysnippet）
  "prefix": "myprefix",
  
  // 片段内容
  "body": "",
  
  // 片段描述（可选）
  "description": "",
  
  // 编程语言（可选）如：javascript, python, html, css 等
  "language": "",
  
  // 标签（可选，多个标签用逗号分隔）
  "tags": ""
}`;
    
    const newTab: EditorTab = {
      id: `snippet-${Date.now()}`,
      title: `${name}.json`,
      path: `snippet:/new/${name}`,
      isDirty: false,
      language: 'jsonc',  // 使用 jsonc 支持注释
      content: snippetTemplate,
      type: 'file'
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  // 处理插入片段到编辑器
  const handleInsertSnippet = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const { snippet } = customEvent.detail;
    console.log('[EditorArea] 插入片段:', snippet.name);
    
    // TODO: 插入片段到当前活动的编辑器
    // 暂时只是创建一个显示片段内容的标签页
    const newTab: EditorTab = {
      id: `snippet-preview-${Date.now()}`,
      title: `片段: ${snippet.name}`,
      path: `snippet:/preview/${snippet.id}`,
      isDirty: false,
      language: snippet.language || 'plaintext',
      content: snippet.content,
      type: 'file'
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  // 处理打开编辑器标签页
  const handleOpenEditorTab = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const { path, content, language, title } = customEvent.detail;
    console.log('[EditorArea] 打开编辑器标签页:', title);
    
    // 检查是否已经打开相同路径的标签页
    const existingTab = tabs.find(tab => tab.path === path);
    if (existingTab) {
      console.log('[EditorArea] 标签页已存在，激活该标签页');
      setActiveTabId(existingTab.id);
      return;
    }
    
    // 创建新的标签页
    const newTab: EditorTab = {
      id: `editor-${Date.now()}`,
      title: title || '新文件',
      path: path,
      isDirty: false,
      language: language || 'plaintext',
      content: content || '',
      type: 'file'
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs]);

  // 注册片段事件监听器（独立的 useEffect）
  useEffect(() => {
    window.addEventListener('create-snippet', handleCreateSnippet);
    window.addEventListener('insert-snippet', handleInsertSnippet);
    window.addEventListener('open-editor-tab', handleOpenEditorTab);
    
    return () => {
      window.removeEventListener('create-snippet', handleCreateSnippet);
      window.removeEventListener('insert-snippet', handleInsertSnippet);
      window.removeEventListener('open-editor-tab', handleOpenEditorTab);
    };
  }, [handleCreateSnippet, handleInsertSnippet, handleOpenEditorTab]);

  // 监听插入数据库表格事件，跳转到文件编辑器标签页
  useEffect(() => {
    const handleInsertDatabaseTable = (event: Event) => {
      const customEvent = event as CustomEvent<{ focusEditor?: boolean }>;
      if (customEvent.detail?.focusEditor) {
        // 找到第一个文件类型的标签页（非设计器）
        const fileTab = tabs.find(t => t.type === 'file');
        if (fileTab) {
          setActiveTabId(fileTab.id);
        }
      }
    };

    window.addEventListener('insert-database-table', handleInsertDatabaseTable as EventListener);
    return () => {
      window.removeEventListener('insert-database-table', handleInsertDatabaseTable as EventListener);
    };
  }, [tabs]);

  // 加载上次打开的文档
  useEffect(() => {
    const loadLastOpened = async () => {
      try {
        const result = await window.electron?.workspace?.getLastOpened();
        if (result?.success && result.data) {
          const { path, content, name, language } = result.data;
          const newTab: EditorTab = {
            id: `file-${Date.now()}`,
            title: name,
            path: path,
            isDirty: false,
            language: language || 'plaintext',
            content: content,
            type: 'file'
          };
          setTabs([newTab]);
          setActiveTabId(newTab.id);
        }
      } catch (error) {
        // 加载上次打开的文件失败，静默处理
      }
    };

    loadLastOpened();
  }, []);

  // 监听打开文件事件
  useEffect(() => {
    console.log('[EditorArea] ========== useEffect 开始注册事件监听器 ==========');
    console.log('[EditorArea] 当前 tabs 数量:', tabs.length);
    
    const handleOpenFile = async (event: Event) => {
      console.log('[EditorArea] ========== 收到 open-file 事件 ==========');
      console.log('[EditorArea] 事件类型:', event.type);
      console.log('[EditorArea] 事件对象:', event);
      
      const customEvent = event as CustomEvent<{ 
        path?: string; 
        content?: string; 
        name?: string; 
        language?: string;
        isPreview?: boolean;  // 新增：是否为预览模式
        lineNumber?: number;  // 新增：要定位的行号
        column?: number;      // 新增：要定位的列号
      }>;
      
      console.log('[EditorArea] 事件详情:', customEvent.detail);
      console.log('[EditorArea] 详情类型:', typeof customEvent.detail);
      
      if (customEvent.detail) {
        // 使用自定义事件中的文件数据
        const { path, content, name, language, isPreview = false, lineNumber, column } = customEvent.detail;
        
        console.log('[EditorArea] Opening file:', {
          path,
          name,
          language,
          contentLength: content?.length || 0,
          contentPreview: content?.substring(0, 100),
          isPreview
        });
        
        // 使用函数式更新来访问最新的 tabs 状态，避免闭包问题
        setTabs(currentTabs => {
          // 检查是否已经打开了该文件
          const existingTab = currentTabs.find(tab => tab.path === path);
          
          if (existingTab) {
            // 设置为活动标签
            setTimeout(() => setActiveTabId(existingTab.id), 0);
            
            // 如果是双击打开（非预览），将预览标签转为固定标签
            // 同时更新标签的内容（如果提供了）
            if (!isPreview && existingTab.isPreview) {
              return currentTabs.map(tab => 
                tab.id === existingTab.id 
                  ? { 
                      ...tab, 
                      isPreview: false,
                      content: content !== undefined ? content : tab.content,
                      language: language || tab.language
                    } 
                  : tab
              );
            } else if (content !== undefined) {
              // 更新内容（如果提供了新内容）
              return currentTabs.map(tab => 
                tab.id === existingTab.id 
                  ? { 
                      ...tab, 
                      content: content,
                      language: language || tab.language
                    } 
                  : tab
              );
            }
            // 没有变化，返回原数组
            return currentTabs;
          }
          
          // 如果是预览模式，替换现有的预览标签
          if (isPreview) {
            const previewTab = currentTabs.find(tab => tab.isPreview);
            if (previewTab) {
              // 替换预览标签
              const newId = `file-${Date.now()}`;
              setTimeout(() => setActiveTabId(newId), 0);
              return currentTabs.map(tab => 
                tab.isPreview ? {
                  id: newId,
                  title: name || 'Untitled',
                  path: path || '',
                  isDirty: false,
                  language: language || 'plaintext',
                  content: content || '',
                  type: 'file' as const,
                  isPreview: true
                } : tab
              );
            }
          }
          
          // 创建新标签
          const newTab: EditorTab = {
            id: `file-${Date.now()}`,
            title: name || 'Untitled',
            path: path || '',
            isDirty: false,
            language: language || 'plaintext',
            content: content || '',
            type: 'file',
            isPreview: isPreview
          };
          
          console.log('[EditorArea] Created new tab:', {
            id: newTab.id,
            title: newTab.title,
            contentLength: newTab.content?.length || 0,
            language: newTab.language
          });
          
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        });
        
        // 需要在状态更新后获取 existingTab.id 或 newTab.id 来设置活动标签
        // 由于我们在函数式更新中无法直接访问，我们使用 setTimeout 在上面的代码中设置
        
        // 如果指定了行号，触发定位事件
        if (lineNumber) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('editor-reveal-line', {
              detail: { lineNumber, column: column || 1 }
            }));
          }, 100);
        }
      } else {
        // 打开文件对话框（非预览模式）
        try {
          const result = await window.electron?.file?.open();
          if (result?.success && result.data) {
            const { path, content, name, language } = result.data;
            
            // 使用函数式更新
            setTabs(currentTabs => {
              // 检查是否已经打开了该文件
              const existingTab = currentTabs.find(tab => tab.path === path);
              
              if (existingTab) {
                // 固定预览标签
                if (existingTab.isPreview) {
                  setTimeout(() => setActiveTabId(existingTab.id), 0);
                  return currentTabs.map(tab => 
                    tab.id === existingTab.id ? { ...tab, isPreview: false } : tab
                  );
                }
                setTimeout(() => setActiveTabId(existingTab.id), 0);
                return currentTabs;
              }
              
              const newTab: EditorTab = {
                id: `file-${Date.now()}`,
                title: name,
                path: path,
                isDirty: false,
                language: language || 'plaintext',
                content: content,
                type: 'file',
                isPreview: false
              };
              setTimeout(() => setActiveTabId(newTab.id), 0);
              return [...currentTabs, newTab];
            });
          }
        } catch (error) {
          // 打开文件失败，静默处理
        }
      }
    };

    const handleOpenSettings = () => {
      // 使用函数式更新来访问最新的 tabs 状态
      setTabs(currentTabs => {
        // 检查是否已经有设置标签页
        const settingsTab = currentTabs.find(tab => tab.type === 'settings');
        
        if (settingsTab) {
          // 如果已存在，直接激活
          setTimeout(() => setActiveTabId(settingsTab.id), 0);
          return currentTabs;
        } else {
          // 否则创建新的设置标签页
          const newTab: EditorTab = {
            id: `settings-${Date.now()}`,
            title: '设置',
            path: 'settings:/',
            isDirty: false,
            type: 'settings'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenExtensionManager = () => {
      // 使用函数式更新来访问最新的 tabs 状态
      setTabs(currentTabs => {
        // 检查是否已经有扩展管理标签页
        const extensionManagerTab = currentTabs.find(tab => tab.type === 'extension-manager');
        
        if (extensionManagerTab) {
          // 如果已存在，直接激活
          setTimeout(() => setActiveTabId(extensionManagerTab.id), 0);
          console.log('[EditorArea] 激活现有扩展管理标签页');
          return currentTabs;
        } else {
          // 否则创建新的扩展管理标签页
          const newTab: EditorTab = {
            id: `extension-manager-${Date.now()}`,
            title: '扩展管理',
            path: 'extension-manager:/',
            isDirty: false,
            type: 'extension-manager'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          console.log('[EditorArea] 创建新的扩展管理标签页');
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenSettingsJson = (event: Event) => {
      const customEvent = event as CustomEvent<{ content: string }>;
      const jsonContent = customEvent.detail?.content || '{}';
      
      // 检查是否已经有 settings.json 标签页
      const settingsJsonTab = tabs.find(tab => tab.path === 'settings:/settings.json');
      
      if (settingsJsonTab) {
        // 如果已存在，更新内容并激活
        setTabs(prev => prev.map(tab => 
          tab.path === 'settings:/settings.json' 
            ? { ...tab, content: jsonContent }
            : tab
        ));
        setActiveTabId(settingsJsonTab.id);
      } else {
        // 否则创建新的 settings.json 标签页
        const newTab: EditorTab = {
          id: `settings-json-${Date.now()}`,
          title: 'settings.json',
          path: 'settings:/settings.json',
          isDirty: false,
          language: 'jsonc',  // 使用 jsonc 支持注释
          content: jsonContent,
          type: 'file'
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
    };

    const handleShowMarkdownPreview = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        content: string;
        sourceTabId: string;
        title: string;
      }>;
      const { content, sourceTabId, title } = customEvent.detail;
      
      // 在右侧编辑器组创建预览标签页
      const previewTab: EditorTab = {
        id: `preview-${sourceTabId}`,
        title: `预览 - ${title}`,
        path: `preview:/${sourceTabId}`,
        isDirty: false,
        language: 'markdown',
        content: content,
        type: 'markdown-preview',
        sourceTabId: sourceTabId
      };
      
      // 检查右侧是否已有该预览标签
      const existingPreview = rightTabs.find(tab => tab.sourceTabId === sourceTabId);
      
      if (existingPreview) {
        // 更新内容
        setRightTabs(prev => prev.map(tab => 
          tab.id === existingPreview.id ? { ...tab, content } : tab
        ));
        setRightActiveTabId(existingPreview.id);
      } else {
        // 创建新预览标签
        setRightTabs(prev => [...prev, previewTab]);
        setRightActiveTabId(previewTab.id);
      }
      
      // 激活分割视图
      setIsSplitView(true);
    };

    const handleOpenLanceDBView = () => {
      setTabs(currentTabs => {
        const existingTab = currentTabs.find(tab => tab.type === 'lancedb-view');
        
        if (existingTab) {
          setTimeout(() => setActiveTabId(existingTab.id), 0);
          return currentTabs;
        } else {
          const newTab: EditorTab = {
            id: `lancedb-view-${Date.now()}`,
            title: '查看分块数据',
            path: 'lancedb-view:/',
            isDirty: false,
            type: 'lancedb-view'
          };
          setTimeout(() => setActiveTabId(newTab.id), 0);
          return [...currentTabs, newTab];
        }
      });
    };

    const handleOpenDatabaseView = () => {
      setTabs(currentTabs => {
        // 每次都创建新的数据库设计器标签页
        const newTab: EditorTab = {
          id: `database-view-${Date.now()}`,
          title: '数据库设计器',
          path: `database-view:/${Date.now()}`,
          isDirty: false,
          type: 'database-view'
        };
        setTimeout(() => setActiveTabId(newTab.id), 0);
        return [...currentTabs, newTab];
      });
    };

    window.addEventListener('open-file', handleOpenFile as EventListener);
    window.addEventListener('open-settings', handleOpenSettings);
    window.addEventListener('open-extension-manager', handleOpenExtensionManager);
    window.addEventListener('open-lancedb-view', handleOpenLanceDBView);
    window.addEventListener('open-database-view', handleOpenDatabaseView);
    window.addEventListener('open-settings-json', handleOpenSettingsJson as EventListener);
    window.addEventListener('show-markdown-preview', handleShowMarkdownPreview as EventListener);
    
    console.log('[EditorArea] ========== 所有事件监听器已注册 ==========');
    console.log('[EditorArea] open-file 监听器:', handleOpenFile);

    // 监听关闭所有编辑器事件
    const handleCloseAllEditors = () => {
      console.log('[EditorArea] 关闭所有编辑器标签页');
      setTabs([]);
      setActiveTabId(null);
      setRightTabs([]);
      setRightActiveTabId(null);
      setIsSplitView(false);
    };
    window.addEventListener('close-all-editors', handleCloseAllEditors);

    // 监听切换编辑器类型事件
    const handleToggleEditorType = () => {
      setEditorType(prev => {
        if (prev === 'monaco') return 'tiptap';
        if (prev === 'tiptap') return 'codemirror';
        return 'monaco';
      });
    };
    window.addEventListener('toggle-editor-type', handleToggleEditorType);

    // 监听设置编辑器类型事件
    const handleSetEditorType = (event: Event) => {
      const customEvent = event as CustomEvent<'monaco' | 'tiptap' | 'codemirror'>;
      setEditorType(customEvent.detail);
    };
    window.addEventListener('set-editor-type', handleSetEditorType as EventListener);
    
    return () => {
      window.removeEventListener('open-file', handleOpenFile as EventListener);
      window.removeEventListener('open-settings', handleOpenSettings);
      window.removeEventListener('open-extension-manager', handleOpenExtensionManager);
      window.removeEventListener('open-lancedb-view', handleOpenLanceDBView);
      window.removeEventListener('open-database-view', handleOpenDatabaseView);
      window.removeEventListener('open-settings-json', handleOpenSettingsJson as EventListener);
      window.removeEventListener('show-markdown-preview', handleShowMarkdownPreview as EventListener);
      window.removeEventListener('close-all-editors', handleCloseAllEditors);
      window.removeEventListener('toggle-editor-type', handleToggleEditorType);
      window.removeEventListener('set-editor-type', handleSetEditorType as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听打开知识库事件（独立的 useEffect，无依赖）
  useEffect(() => {
    const handleOpenKnowledge = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        id: string;
        title: string;
        description?: string;
        items: any[];
        knowledgeData: any;
      }>;
      const { id, title, description, items } = customEvent.detail;
      
      setTabs(prev => {
        // 查找是否已存在知识库类型的标签页（不区分 id）
        const existingKnowledgeTab = prev.find(tab => tab.type === 'knowledge');
        
        // 标签页标题只显示知识库名称，不包含配置变化提示
        const tabTitle = `知识库 - ${title}`;
        
        if (existingKnowledgeTab) {
          // 如果已存在知识库标签页，更新其标题和数据
          setActiveTabId(existingKnowledgeTab.id);
          console.log('[EditorArea] 更新知识库标签页:', tabTitle);
          return prev.map(tab => 
            tab.id === existingKnowledgeTab.id 
              ? { 
                  ...tab, 
                  title: tabTitle,
                  path: `knowledge:/${id}`,
                  knowledgeData: { id, items, description } 
                } 
              : tab
          );
        } else {
          // 创建新的知识库标签页（首次打开）
          const newTab: EditorTab = {
            id: `knowledge-${Date.now()}`,
            title: tabTitle,
            path: `knowledge:/${id}`,
            isDirty: false,
            type: 'knowledge',
            knowledgeData: { id, items, description }
          };
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 创建知识库标签页:', tabTitle);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    
    return () => {
      window.removeEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    };
  }, []); // 无依赖，只注册一次

  // 监听关闭知识库标签页事件
  useEffect(() => {
    const handleCloseKnowledgeTab = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      setTabs(prev => {
        // 查找匹配的知识库标签页
        const knowledgeTab = prev.find(
          tab => tab.type === 'knowledge' && 
                 (tab.knowledgeData?.id === knowledgeId || tab.path === `knowledge:/${knowledgeId}`)
        );
        
        if (knowledgeTab) {
          console.log('[EditorArea] 关闭知识库标签页:', knowledgeTab.title, '知识库ID:', knowledgeId);
          
          // 移除知识库标签页
          const remainingTabs = prev.filter(tab => tab.id !== knowledgeTab.id);
          
          // 使用函数式更新来获取最新的 activeTabId
          setActiveTabId(currentActiveTabId => {
            // 如果关闭的是当前活动标签，需要切换到其他标签
            if (currentActiveTabId === knowledgeTab.id) {
              if (remainingTabs.length > 0) {
                // 切换到最后一个标签页
                return remainingTabs[remainingTabs.length - 1].id;
              } else {
                // 没有其他标签页了，清除活动标签
                return null;
              }
            }
            // 不是活动标签，保持当前活动标签不变
            return currentActiveTabId;
          });
          
          return remainingTabs;
        }
        
        return prev;
      });
    };

    window.addEventListener('close-knowledge-tab', handleCloseKnowledgeTab as EventListener);
    
    return () => {
      window.removeEventListener('close-knowledge-tab', handleCloseKnowledgeTab as EventListener);
    };
  }, []); // 无依赖，只注册一次

  // 修复函数：将进度为 100% 但状态仍为 processing 的文件更新为 completed
  const fixProcessingFilesWith100Percent = useCallback(async (knowledgeBase: KnowledgeItem): Promise<boolean> => {
    if (!knowledgeBase.children) {
      return false;
    }
    
    // 递归查找所有需要修复的文件（包括子文件夹中的文件）
    const collectFilesToFix = (items: KnowledgeItem[]): KnowledgeItem[] => {
      const filesToFix: KnowledgeItem[] = [];
      for (const item of items) {
        if (item.type === 'file' && 
            item.metadata?.processingStatus === 'processing' && 
            item.metadata?.processingProgress === 100 &&
            item.path) {
          filesToFix.push(item);
        }
        if (item.children && item.children.length > 0) {
          filesToFix.push(...collectFilesToFix(item.children));
        }
      }
      return filesToFix;
    };
    
    const filesToFix = collectFilesToFix(knowledgeBase.children);
    
    if (filesToFix.length > 0) {
      console.log('[EditorArea] 发现需要修复的文件（processing 100%）:', filesToFix.length);
      for (const file of filesToFix) {
        if (file.path) {
          try {
            await knowledgeBaseService.updateFileProcessingStatus(
              file.path,
              'completed',
              100
            );
            console.log('[EditorArea] 已修复文件状态:', file.title);
          } catch (error) {
            console.error('[EditorArea] 修复文件状态失败:', file.title, error);
          }
        }
      }
      return true; // 表示有文件被修复
    }
    return false; // 表示没有文件需要修复
  }, []);

  // 组件初始化时检查并修复所有知识库中的 processing 100% 文件
  useEffect(() => {
    const checkAndFixAllKnowledgeBases = async () => {
      try {
        const data = await knowledgeBaseService.loadFromStorage();
        let hasFixedAny = false;
        
        for (const knowledgeBase of data.created) {
          const hasFixed = await fixProcessingFilesWith100Percent(knowledgeBase);
          if (hasFixed) {
            hasFixedAny = true;
          }
        }
        
        if (hasFixedAny) {
          console.log('[EditorArea] 初始化时已修复所有知识库中的 processing 100% 文件');
          // 触发知识库更新事件以刷新UI
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId: 'all' }
          }));
        }
      } catch (error) {
        console.error('[EditorArea] 初始化检查知识库文件状态失败:', error);
      }
    };
    
    checkAndFixAllKnowledgeBases();
  }, [fixProcessingFilesWith100Percent]);

  // 监听知识库更新事件（刷新知识库数据）
  useEffect(() => {
    const handleKnowledgeBaseUpdated = async (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      console.log('[EditorArea] 知识库已更新，重新加载数据:', knowledgeId);
      
      // 重新加载知识库数据
      const data = await knowledgeBaseService.loadFromStorage();
      
      // 调试：检查数据中是否包含处理状态
      const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
      if (knowledgeBase && knowledgeBase.children) {
        const filesWithStatus = knowledgeBase.children.filter(
          (item: KnowledgeItem) => item.type === 'file' && item.metadata?.processingStatus
        );
        console.log('[EditorArea] 找到带处理状态的文件:', filesWithStatus.length, filesWithStatus.map(item => ({
          title: item.title,
          status: item.metadata?.processingStatus,
          progress: item.metadata?.processingProgress
        })));
        
        // 自动修复：将进度为 100% 但状态仍为 processing 的文件更新为 completed
        const hasFixed = await fixProcessingFilesWith100Percent(knowledgeBase);
        if (hasFixed) {
          // 重新加载数据以反映修复后的状态
          const fixedData = await knowledgeBaseService.loadFromStorage();
          // 更新 data 引用
          Object.assign(data, fixedData);
        }
      }
      
      // 更新左侧对应的知识库标签页数据
      setTabs(prev => {
        const updated = prev.map(tab => {
          if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
            // 查找知识库项，获取知识库名称
            const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            const baseTitle = knowledgeBase?.title || '';
            const configChanged = knowledgeBase?.metadata?.configChanged;
            // 标签页标题只显示知识库名称，不包含配置变化提示
            const newTitle = `知识库 - ${baseTitle}`;
            
            const newTab = {
              ...tab,
              title: newTitle,
              knowledgeData: {
                id: knowledgeId,
                items: data.created,
                description: tab.knowledgeData?.description // 保留原有描述
              }
            };
            console.log('[EditorArea] 更新左侧知识库标签页数据:', {
              tabId: tab.id,
              knowledgeId,
              itemsCount: data.created.length,
              configChanged,
              newTitle,
              hasProcessingFiles: data.created.some(kb => 
                kb.children?.some((item: KnowledgeItem) => 
                  item.type === 'file' && item.metadata?.processingStatus && item.metadata.processingStatus !== 'completed'
                )
              )
            });
            return newTab;
          }
          return tab;
        });
        return updated;
      });
      
      // 更新右侧对应的知识库标签页数据
      setRightTabs(prev => {
        const updated = prev.map(tab => {
          if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
            // 查找更新后的知识库数据
            const updatedKnowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            const baseTitle = updatedKnowledgeBase?.title || '';
            const configChanged = updatedKnowledgeBase?.metadata?.configChanged;
            // 标签页标题只显示知识库名称，不包含配置变化提示
            const newTitle = `知识库 - ${baseTitle}`;
            
            const newTab = {
              ...tab,
              title: newTitle,
              knowledgeData: {
                id: knowledgeId,
                items: data.created,
                description: tab.knowledgeData?.description // 保留原有描述
              }
            };
            console.log('[EditorArea] 更新右侧知识库标签页数据:', {
              tabId: tab.id,
              knowledgeId,
              itemsCount: data.created.length,
              knowledgeBaseFound: !!updatedKnowledgeBase,
              configChanged,
              newTitle,
              childrenCount: updatedKnowledgeBase?.children?.length || 0,
              hasProcessingFiles: updatedKnowledgeBase?.children?.some((item: KnowledgeItem) => 
                item.type === 'file' && item.metadata?.processingStatus && item.metadata.processingStatus !== 'completed'
              ) || false
            });
            return newTab;
          }
          return tab;
        });
        return updated;
      });
    };

    window.addEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    
    return () => {
      window.removeEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    };
  }, []);

  // 监听打开AI智能体事件（独立的 useEffect，无依赖）
  useEffect(() => {
    const handleOpenAIAgent = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        categoryId: string;
        categoryName: string;
      }>;
      const { categoryId, categoryName } = customEvent.detail;
      
      setTabs(prev => {
        // 查找是否已存在AI智能体类型的标签页（始终只能有一个）
        const existingAgentTab = prev.find(tab => tab.type === 'ai-agent');
        
        if (existingAgentTab) {
          // 如果已存在AI智能体标签页，更新其数据
          setActiveTabId(existingAgentTab.id);
          console.log('[EditorArea] 更新AI智能体标签页:', categoryName);
          return prev.map(tab => 
            tab.id === existingAgentTab.id 
              ? { 
                  ...tab, 
                  title: `智能体 - ${categoryName}`,
                  path: `ai-agent:/${categoryId}`,
                  agentData: { categoryId, categoryName } 
                } 
              : tab
          );
        } else {
          // 创建新的AI智能体标签页（首次打开）
          const newTab: EditorTab = {
            id: `ai-agent-${Date.now()}`,
            title: `智能体 - ${categoryName}`,
            path: `ai-agent:/${categoryId}`,
            isDirty: false,
            type: 'ai-agent',
            agentData: { categoryId, categoryName }
          };
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 创建AI智能体标签页:', categoryName);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-ai-agent', handleOpenAIAgent as EventListener);
    
    return () => {
      window.removeEventListener('open-ai-agent', handleOpenAIAgent as EventListener);
    };
  }, []); // 无依赖，只注册一次

  // 监听打开 AI 配置事件（独立的 useEffect，无依赖）
  useEffect(() => {
    const handleOpenAIConfig = async (event: Event) => {
      const customEvent = event as CustomEvent<{ configId?: string; configIndex?: number }>;
      // 优先使用 configId，如果没有则使用 configIndex（向后兼容）
      const configId = customEvent?.detail?.configId;
      const configIndex = customEvent?.detail?.configIndex;
      
      console.log('[EditorArea] 打开 AI 配置，配置ID:', configId, '配置索引(废弃):', configIndex);
      
      // 如果没有 configId，尝试从 configIndex 获取配置信息
      let actualConfigId = configId;
      let configName = 'AI 模型配置';
      
      if (!actualConfigId && configIndex !== undefined) {
        try {
          const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
          if (configs && configs[configIndex]) {
            actualConfigId = configs[configIndex].id;
            configName = configs[configIndex].name || configName;
          }
        } catch (error) {
          console.error('[EditorArea] 从索引获取配置ID失败:', error);
        }
      }
      
      // 如果没有 configId 也没有 configIndex，创建新配置
      if (!actualConfigId) {
        console.log('[EditorArea] 没有配置ID，创建新的 AI 配置标签页');
        const tempConfigId = `temp-config-${Date.now()}`;
        
        setTabs(prev => {
          const newTab: EditorTab = {
            id: `ai-config-${Date.now()}`,
            title: '新建配置',
            path: `ai-config:/${tempConfigId}`,
            isDirty: false,
            type: 'ai-config',
            configId: tempConfigId
          };
          
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 创建新的 AI 配置标签页成功，标签ID:', newTab.id);
          return [...prev, newTab];
        });
        return;
      }
      
      // 获取配置信息（用于标题）
      if (configId && !configName) {
        try {
          const config = await window.electron?.ipcRenderer.invoke('ai-model:get', actualConfigId);
          if (config && config.name) {
            configName = config.name;
          }
        } catch (error) {
          console.error('[EditorArea] 获取配置名称失败:', error);
        }
      }
      
      setTabs(prev => {
        // 查找是否已存在相同configId的AI配置标签页
        const existingAIConfigTab = prev.find(tab => 
          tab.type === 'ai-config' && tab.configId === actualConfigId
        );
        
        if (existingAIConfigTab) {
          // 如果已存在相同的AI配置标签页，直接激活它
          setActiveTabId(existingAIConfigTab.id);
          console.log('[EditorArea] 激活已存在的 AI 配置标签页，配置ID:', actualConfigId, '标签ID:', existingAIConfigTab.id);
          return prev; // 不修改 tabs
        } else {
          // 不存在相同的AI配置标签页，创建新的
          console.log('[EditorArea] 创建新的 AI 配置标签页，配置ID:', actualConfigId, '配置名称:', configName);
          
          const tabPath = `ai-config:/${actualConfigId}`;
          const newTab: EditorTab = {
            id: `ai-config-${Date.now()}`,
            title: `配置 - ${configName}`,
            path: tabPath,
            isDirty: false,
            type: 'ai-config',
            configId: actualConfigId,
            configIndex // 保留用于向后兼容
          };
          
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 创建新的 AI 配置标签页成功，标签ID:', newTab.id);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-ai-config', handleOpenAIConfig as EventListener);
    
    return () => {
      window.removeEventListener('open-ai-config', handleOpenAIConfig as EventListener);
    };
  }, []); // 无依赖，只注册一次

  // 监听 AI 配置保存事件，更新临时配置的 ID
  useEffect(() => {
    const handleAIConfigSaved = (event: Event) => {
      const customEvent = event as CustomEvent<{ tempId: string; realId: string; configName: string }>;
      const { tempId, realId, configName } = customEvent.detail;
      
      console.log('[EditorArea] 收到 AI 配置保存事件，更新临时配置ID:', { tempId, realId, configName });
      
      setTabs(prev => {
        return prev.map(tab => {
          if (tab.type === 'ai-config' && tab.configId === tempId) {
            console.log('[EditorArea] 更新标签页 configId:', { oldId: tempId, newId: realId });
            return {
              ...tab,
              configId: realId,
              title: `配置 - ${configName}`
            };
          }
          return tab;
        });
      });
      
      // 从未保存列表中移除（使用新的 realId）
      setUnsavedConfigTabs(prev => {
        const newSet = new Set(prev);
        newSet.delete(tempId);
        newSet.delete(realId);
        return newSet;
      });
    };

    window.addEventListener('ai-config-saved', handleAIConfigSaved as EventListener);
    return () => window.removeEventListener('ai-config-saved', handleAIConfigSaved as EventListener);
  }, []);

  // 监听 AI 配置未保存状态变化
  useEffect(() => {
    const handleUnsavedStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{ configId: string; hasUnsavedChanges: boolean }>;
      const { configId, hasUnsavedChanges } = customEvent.detail;
      
      console.log('[EditorArea] 收到 AI 配置未保存状态:', { configId, hasUnsavedChanges });
      
      setUnsavedConfigTabs(prev => {
        const newSet = new Set(prev);
        if (hasUnsavedChanges) {
          newSet.add(configId);
        } else {
          newSet.delete(configId);
        }
        return newSet;
      });
    };

    window.addEventListener('ai-config-unsaved-status', handleUnsavedStatus as EventListener);
    return () => window.removeEventListener('ai-config-unsaved-status', handleUnsavedStatus as EventListener);
  }, []);

  // 监听 AI 配置更新事件，更新标签页标题（独立的 useEffect，无依赖）
  useEffect(() => {
    const handleAIConfigUpdated = async () => {
      try {
        console.log('[EditorArea] 收到 AI 配置更新事件，开始更新标签页标题');
        
        // 获取最新的配置列表
        const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
        if (!configs || configs.length === 0) {
          console.log('[EditorArea] 未获取到配置列表，跳过标题更新');
          return;
        }
        
        // 创建配置ID到配置对象的映射
        const configMap = new Map<string, { id: string; name: string }>(
          configs.map((c: { id: string; name: string }) => [c.id, c])
        );
        
        // 更新所有 AI 配置标签页的标题
        setTabs(prev => {
          const updated = prev.map(tab => {
            if (tab.type === 'ai-config') {
              // 优先使用 configId
              if (tab.configId) {
                const config = configMap.get(tab.configId);
                if (config?.name) {
                  const newTitle = `配置 - ${config.name}`;
                  console.log('[EditorArea] 更新标签页标题(通过configId):', { oldTitle: tab.title, newTitle, configId: tab.configId });
                  return { ...tab, title: newTitle };
                }
              } 
              // 向后兼容：如果没有 configId，使用 configIndex
              else if (tab.configIndex !== undefined) {
                const config = configs[tab.configIndex];
                if (config?.name) {
                  const newTitle = `配置 - ${config.name}`;
                  console.log('[EditorArea] 更新标签页标题(通过configIndex):', { oldTitle: tab.title, newTitle, configIndex: tab.configIndex });
                  // 同时更新 configId 以便后续使用
                  return { ...tab, title: newTitle, configId: config.id };
                }
              }
            }
            return tab;
          });
          return updated;
        });
        
        console.log('[EditorArea] AI 配置标签页标题更新完成');
      } catch (error) {
        console.error('[EditorArea] 更新 AI 配置标签页标题失败:', error);
      }
    };

    window.addEventListener('ai-config-updated', handleAIConfigUpdated);
    
    // 监听 IPC 消息（用于主进程通知的更新）
    const ipcRenderer = window.electron?.ipcRenderer;
    if (ipcRenderer) {
      ipcRenderer.on('ai-model-config-updated', handleAIConfigUpdated);
    }
    
    return () => {
      window.removeEventListener('ai-config-updated', handleAIConfigUpdated);
      if (ipcRenderer) {
        ipcRenderer.removeListener('ai-model-config-updated', handleAIConfigUpdated);
      }
    };
  }, []); // 无依赖，只注册一次

  // 当活动标签改变时，通知文件树更新选中状态
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    
    if (activeTab && activeTab.type === 'file' && activeTab.path) {
      // 派发自定义事件，通知文件树当前激活的文件
      window.dispatchEvent(new CustomEvent('editor-active-file-change', {
        detail: { path: activeTab.path }
      }));
    }
  }, [activeTabId, tabs]);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // 当活动标签页变化时，通知状态栏更新语言类型
  useEffect(() => {
    if (activeTab?.language) {
      const event = new CustomEvent('tab:language-changed', {
        detail: { language: activeTab.language }
      });
      window.dispatchEvent(event);
    }
  }, [activeTab?.language, activeTabId]);

  // 处理标签页切换
  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    
    // 通知 FileExplorer 更新选中状态（仅针对文件类型的标签页）
    const clickedTab = tabs.find(tab => tab.id === tabId);
    if (clickedTab?.type === 'file' && clickedTab?.path) {
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { path: clickedTab.path }
      }));
      console.log('[EditorArea] 标签页切换:', clickedTab.path);
    }
  };

  const handleTabClose = (tabId: string) => {
    const closingTab = tabs.find(tab => tab.id === tabId);
    
    // 如果是 AI 配置标签页，检查是否有未保存的更改
    if (closingTab?.type === 'ai-config' && closingTab.configId) {
      if (unsavedConfigTabs.has(closingTab.configId)) {
        // 显示确认对话框
        const confirmed = window.confirm(
          '您有未保存的更改，关闭后将丢失。\n\n确定要关闭吗？'
        );
        
        if (!confirmed) {
          console.log('[EditorArea] 用户取消关闭未保存的配置');
          return; // 用户取消关闭
        }
        
        // 用户确认关闭，从未保存列表中移除
        setUnsavedConfigTabs(prev => {
          const newSet = new Set(prev);
          newSet.delete(closingTab.configId!);
          return newSet;
        });
      }
    }
    
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);
    
    // 通知 FileExplorer 移除对应的编辑器（仅针对文件类型的标签页）
    if (closingTab?.type === 'file' && closingTab?.path) {
      window.dispatchEvent(new CustomEvent('remove-editor', {
        detail: { path: closingTab.path }
      }));
      console.log('[EditorArea] 通知 FileExplorer 移除编辑器:', closingTab.path);
    }
    
    // 如果关闭的是 AI 配置标签页，通知侧边栏清除选中状态
    if (closingTab?.type === 'ai-config') {
      window.dispatchEvent(new Event('ai-config-tab-closed'));
      console.log('[EditorArea] AI 配置标签页已关闭');
    }
    
    if (activeTabId === tabId && newTabs.length > 0) {
      setActiveTabId(newTabs[0].id);
      
      // 通知 FileExplorer 更新选中状态到下一个标签页
      const nextTab = newTabs[0];
      if (nextTab.type === 'file' && nextTab.path) {
        window.dispatchEvent(new CustomEvent('tab-switched', {
          detail: { path: nextTab.path }
        }));
        console.log('[EditorArea] 关闭后切换到下一个标签页:', nextTab.path);
      }
    }
    
    // 关闭源文档时，同时关闭对应的预览标签页
    const newRightTabs = rightTabs.filter(tab => tab.sourceTabId !== tabId);
    if (newRightTabs.length !== rightTabs.length) {
      setRightTabs(newRightTabs);
      
      // 如果关闭的预览标签是当前激活的，切换到第一个
      if (rightActiveTabId && !newRightTabs.find(tab => tab.id === rightActiveTabId)) {
        if (newRightTabs.length > 0) {
          setRightActiveTabId(newRightTabs[0].id);
        } else {
          // 右侧没有标签页了，关闭分割视图
          setIsSplitView(false);
        }
      }
    }
  };

  const handleRightTabClose = (tabId: string) => {
    const newRightTabs = rightTabs.filter(tab => tab.id !== tabId);
    setRightTabs(newRightTabs);
    
    if (rightActiveTabId === tabId && newRightTabs.length > 0) {
      setRightActiveTabId(newRightTabs[0].id);
    } else if (newRightTabs.length === 0) {
      // 右侧没有标签页了，关闭分割视图
      setIsSplitView(false);
    }
  };

  const rightActiveTab = rightTabs.find(tab => tab.id === rightActiveTabId);

  // 保存文件函数
  const saveFile = async (tab: EditorTab) => {
    if (!tab || tab.type !== 'file') {
      return;
    }

    // 如果是 settings.json，已经自动保存，不需要再次保存
    if (tab.path === 'settings:/settings.json') {
      setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
      return;
    }

    // 如果是片段文件，已经自动保存，不需要再次保存
    if (tab.path.startsWith('snippet:/')) {
      setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
      return;
    }

    // 检查是否是主题覆盖文件（theme-override:// 协议）
    const isThemeOverride = tab.path.startsWith('theme-override://');
    
    // 如果是主题覆盖文件，使用主题覆盖保存API
    if (isThemeOverride) {
      try {
        console.log('[EditorArea] 处理主题覆盖文件保存:', tab.path);
        
        // 从路径提取基础主题ID
        // 例如：theme-override://quiet-light.json → quiet-light
        const baseThemeId = tab.path.replace('theme-override://', '').replace('.json', '');
        console.log('[EditorArea] 基础主题ID:', baseThemeId);
        
        // 解析颜色覆盖内容
        const parseErrors: jsonc.ParseError[] = [];
        const parsedConfig = jsonc.parse(tab.content || '', parseErrors, {
          allowTrailingComma: true,
          allowEmptyContent: false
        });
        
        // 检查解析错误
        if (parseErrors.length > 0) {
          console.warn('[EditorArea] 主题覆盖配置 JSON 解析错误，仅清除脏标记');
          setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
          return;
        }
        
        // 验证格式：必须包含 colors 对象
        if (!parsedConfig || !parsedConfig.colors) {
          console.warn('[EditorArea] 主题覆盖配置结构不完整，需要包含 colors 字段');
          toastService.error('保存失败', {
            description: '主题覆盖文件必须包含 colors 字段'
          });
          return;
        }
        
        console.log('[EditorArea] 准备保存主题颜色覆盖');
        console.log('[EditorArea] 基础主题:', baseThemeId);
        console.log('[EditorArea] 覆盖颜色数量:', Object.keys(parsedConfig.colors || {}).length);
        
        // 调用 IPC 保存主题覆盖到文件系统
        // 传递：基础主题ID + 覆盖的颜色
        try {
          const result = await window.electron?.ipcRenderer.invoke('theme:save-override', {
            baseThemeId,
            colors: parsedConfig.colors || {}
          });
          
          if (result?.success) {
            console.log('[EditorArea] ✓ 主题覆盖已成功保存:', baseThemeId);
            toastService.success('主题覆盖保存成功', {
              description: `已保存 ${Object.keys(parsedConfig.colors || {}).length} 个颜色覆盖`
            });
            // 清除脏标记，表示已保存
            setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
          } else {
            console.error('[EditorArea] 保存主题覆盖失败:', result?.error);
            toastService.error('保存主题覆盖失败', {
              description: result?.error || '未知错误'
            });
          }
        } catch (error) {
          console.error('[EditorArea] 调用主题覆盖保存 IPC 失败:', error);
          toastService.error('保存主题覆盖失败', {
            description: error instanceof Error ? error.message : '调用保存接口失败'
          });
        }
      } catch (error) {
        console.error('[EditorArea] 处理主题覆盖保存时发生错误:', error);
        // 发生错误时仍然清除脏标记
        setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
      }
      return;
    }

    // 如果文件没有路径，使用另存为
    if (!tab.path || tab.path === '') {
      try {
        const result = await window.electron?.file?.saveAs(tab.content || '');
        if (result?.success && result.data) {
          // 更新标签页信息
          if (result.data) {
            setTabs(tabs.map(t => 
              t.id === tab.id 
                ? { ...t, path: result.data!.path, title: result.data!.name, isDirty: false }
                : t
            ));
          }
        }
      } catch (error) {
        // 另存为文件失败，静默处理
      }
      return;
    }

    // 保存文件
    try {
      // 如果内容是 HTML 格式（TipTap 编辑器产生），转换为 Markdown 保存
      let contentToSave = tab.content || '';
      if (isHtmlContent(contentToSave)) {
        contentToSave = htmlToMarkdown(contentToSave);
      }
      
      const result = await window.electron?.file?.save(tab.path, contentToSave);
      if (result?.success) {
        // 清除脏标记
        setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
        setRightTabs(rightTabs.map(t => t.sourceTabId === tab.id ? { ...t, isDirty: false } : t));
      }
    } catch (error) {
      // 保存文件异常，静默处理
    }
  };

  // 监听活动标签页变化，通知状态栏和大纲
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    
    // 发送全局事件，告知状态栏当前标签页类型
    window.dispatchEvent(new CustomEvent('editor:active-tab-changed', {
      detail: {
        tabType: activeTab?.type || null,
        isSettingsTab: activeTab?.type === 'settings',
        isFileTab: activeTab?.type === 'file',
        isAIConfigTab: activeTab?.type === 'ai-config',
        language: activeTab?.language,
        path: activeTab?.path
      }
    }));

    // 通知大纲组件更新
    if (activeTab && activeTab.type === 'file') {
      window.dispatchEvent(new CustomEvent('editor:content-changed', {
        detail: {
          content: activeTab.content || '',
          language: activeTab.language || 'plaintext',
          path: activeTab.path
        }
      }));
    } else {
      // 非文件标签页，清空大纲
      window.dispatchEvent(new CustomEvent('editor:content-changed', {
        detail: {
          content: '',
          language: 'plaintext',
          path: ''
        }
      }));
    }
  }, [activeTabId, tabs]);

  // 监听保存事件
  useEffect(() => {
    const handleSaveFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      const targetTabId = customEvent.detail?.tabId || activeTabId;
      
      if (!targetTabId) {
        return;
      }

      // 查找要保存的标签页
      const tabToSave = tabs.find(tab => tab.id === targetTabId);
      if (tabToSave) {
        saveFile(tabToSave);
      }
    };

    window.addEventListener('save-file', handleSaveFile as EventListener);
    
    return () => {
      window.removeEventListener('save-file', handleSaveFile as EventListener);
    };
  }, [tabs, activeTabId, rightTabs]);

  // 监听关闭文件事件
  useEffect(() => {
    const handleCloseFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      const { path } = customEvent.detail;
      
      // 查找对应的标签页并关闭
      const tabToClose = tabs.find(tab => tab.path === path);
      if (tabToClose) {
        handleTabClose(tabToClose.id);
      }
    };

    window.addEventListener('close-file', handleCloseFile as EventListener);
    
    return () => {
      window.removeEventListener('close-file', handleCloseFile as EventListener);
    };
  }, [tabs]);

  // 将保存函数暴露到全局，供快捷键使用
  useEffect(() => {
    (window as any).__editorSaveFile = () => {
      if (activeTabId) {
        const tabToSave = tabs.find(tab => tab.id === activeTabId);
        if (tabToSave) {
          saveFile(tabToSave);
        }
      }
    };

    return () => {
      delete (window as any).__editorSaveFile;
    };
  }, [tabs, activeTabId, rightTabs]);

  return (
    <div className={`editor-area ${className}`}>
      {/* 编辑器组容器 - 支持左右分割 */}
      <div className="editor-area-groups">
        {/* 左侧编辑器组 */}
        <div 
          className={`editor-area-group ${isSplitView ? 'split-left' : 'full'}`}
          style={isSplitView && leftWidth !== null ? { width: `${leftWidth}px`, flex: 'none' } : undefined}
        >
          {/* 左侧标签栏 - 始终显示，即使没有标签 */}
          {tabs.length > 0 ? (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={handleTabClick}
              onTabClose={handleTabClose}
            />
          ) : (
            <div className="tab-bar-placeholder" />
          )}

          {/* 左侧面包屑 */}
          {activeTab && activeTab.type !== 'settings' && activeTab.type !== 'markdown-preview' && activeTab.type !== 'knowledge' && activeTab.type !== 'ai-config' && activeTab.type !== 'ai-agent' && activeTab.type !== 'lancedb-view' && (
            <Breadcrumb path={activeTab.path} />
          )}

          {/* 左侧编辑器内容 */}
          <div className="editor-area-content">
            {/* 空状态 */}
            {!activeTab && (
              <div className="editor-area-empty">
                <div className="editor-area-empty-content">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="title">没有打开的编辑器</p>
                  <p className="subtitle">从文件浏览器打开文件开始编辑</p>
                </div>
              </div>
            )}

            {/* 渲染所有标签页，通过 display 控制可见性，避免重新加载 */}
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              
              return (
                <div 
                  key={tab.id} 
                  className="editor-tab-content"
                  style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                >
                  {tab.type === 'settings' && <SettingsView />}
                  
                  {tab.type === 'extension-manager' && <ExtensionManagerView />}
                  
                  {tab.type === 'lancedb-view' && <LanceDBView />}
                  
                  {tab.type === 'database-view' && <DatabaseView />}
                  
                  {tab.type === 'ai-config' && (
                    <AIConfigView configId={tab.configId} configIndex={tab.configIndex} />
                  )}
                  
                  {tab.type === 'ai-agent' && (
                    <AIAgentView 
                      categoryId={tab.agentData?.categoryId || ''} 
                      categoryName={tab.agentData?.categoryName || ''}
                    />
                  )}
                  
                  {tab.type === 'markdown-preview' && (
                    <MarkdownPreview 
                      content={tab.content || ''} 
                      title={tab.title}
                      sourceTabId={tab.sourceTabId}
                    />
                  )}
                  
                  {tab.type === 'knowledge' && (
                    <KnowledgeBaseView
                      knowledgeId={tab.knowledgeData?.id || ''}
                      knowledgeTitle={tab.title}
                      knowledgeDescription={tab.knowledgeData?.description || ''}
                      items={tab.knowledgeData?.items || []}
                      onFileOpen={async (item) => {
                        // 在编辑器中打开文件
                        if (item.type === 'file' && item.path) {
                          try {
                            // 读取文件内容
                            const result = await window.electron?.file?.read(item.path);
                            if (result?.success && result.data) {
                              window.dispatchEvent(new CustomEvent('open-file', {
                                detail: {
                                  path: item.path,
                                  name: item.title,
                                  content: result.data.content,
                                  language: item.metadata?.fileType === 'markdown' ? 'markdown' : 'plaintext',
                                  isPreview: false
                                }
                              }));
                            }
                          } catch (error) {
                            console.error('[EditorArea] 读取文件失败:', error);
                          }
                        }
                      }}
                      onFileDelete={(item) => {
                        // 触发删除事件
                        window.dispatchEvent(new CustomEvent('delete-knowledge-item', {
                          detail: { itemId: item.id }
                        }));
                      }}
                    />
                  )}
                  
                  {tab.type === 'file' && editorType === 'monaco' && (
                    <EditorGroup
                      file={tab}
                      onContentChange={(content) => {
                        console.log('[EditorArea] Monaco content change, hasNewlines:', content.includes('\n'));
                        setTabs(prev => prev.map(t => 
                          t.id === tab.id 
                            ? { ...t, content, isDirty: true, isPreview: false }
                            : t
                        ));
                        
                        // 如果右侧有预览该文件的标签页，实时更新预览内容
                        const previewTab = rightTabs.find(t => t.sourceTabId === tab.id);
                        if (previewTab) {
                          setRightTabs(prev => prev.map(t => 
                            t.id === previewTab.id ? { ...t, content } : t
                          ));
                        }

                        // 如果是当前活动标签页，触发大纲更新事件
                        if (tab.id === activeTabId) {
                          window.dispatchEvent(new CustomEvent('editor:content-changed', {
                            detail: {
                              content: content,
                              language: tab.language || 'plaintext',
                              path: tab.path
                            }
                          }));
                        }
                      }}
                    />
                  )}
                  
                  {tab.type === 'file' && editorType === 'tiptap' && (
                    <SimpleNoteEditor
                      content={(() => {
                        const rawContent = tab.content || '';
                        // 如果内容已经是 HTML，直接使用；否则转换为 HTML
                        const isHtml = isHtmlContent(rawContent);
                        return isHtml ? rawContent : markdownToHtml(rawContent);
                      })()}
                      onChange={(htmlContent) => {
                        // TipTap 模式下直接保存 HTML 内容，避免循环转换导致光标跳动
                        setTabs(prev => prev.map(t => 
                          t.id === tab.id 
                            ? { ...t, content: htmlContent, isDirty: true, isPreview: false }
                            : t
                        ));
                        
                        // 如果右侧有预览该文件的标签页，实时更新预览内容（转换为 Markdown）
                        const previewTab = rightTabs.find(t => t.sourceTabId === tab.id);
                        if (previewTab) {
                          const markdownContent = htmlToMarkdown(htmlContent);
                          setRightTabs(prev => prev.map(t => 
                            t.id === previewTab.id ? { ...t, content: markdownContent } : t
                          ));
                        }

                        // 如果是当前活动标签页，触发大纲更新事件（转换为 Markdown）
                        if (tab.id === activeTabId) {
                          const markdownContent = htmlToMarkdown(htmlContent);
                          window.dispatchEvent(new CustomEvent('editor:content-changed', {
                            detail: {
                              content: markdownContent,
                              language: tab.language || 'plaintext',
                              path: tab.path
                            }
                          }));
                        }
                      }}
                      editable={true}
                    />
                  )}

                  {tab.type === 'file' && editorType === 'codemirror' && (
                    <CodeMirrorEditor
                      content={(() => {
                        const rawContent = tab.content || '';
                        // CodeMirror 使用 Markdown 源码
                        const isHtml = isHtmlContent(rawContent);
                        return isHtml ? htmlToMarkdown(rawContent) : rawContent;
                      })()}
                      onChange={(markdownContent) => {
                        setTabs(prev => prev.map(t => 
                          t.id === tab.id 
                            ? { ...t, content: markdownContent, isDirty: true, isPreview: false }
                            : t
                        ));
                        
                        // 如果右侧有预览该文件的标签页，实时更新预览内容
                        const previewTab = rightTabs.find(t => t.sourceTabId === tab.id);
                        if (previewTab) {
                          setRightTabs(prev => prev.map(t => 
                            t.id === previewTab.id ? { ...t, content: markdownContent } : t
                          ));
                        }

                        // 如果是当前活动标签页，触发大纲更新事件
                        if (tab.id === activeTabId) {
                          window.dispatchEvent(new CustomEvent('editor:content-changed', {
                            detail: {
                              content: markdownContent,
                              language: tab.language || 'plaintext',
                              path: tab.path
                            }
                          }));
                        }
                      }}
                      editable={true}
                      isActive={tab.id === activeTabId}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 可调整大小的分隔条 */}
        {isSplitView && (
          <ResizableDivider
            onResize={setLeftWidth}
            minLeftWidth={300}
            minRightWidth={300}
          />
        )}

        {/* 右侧编辑器组 */}
        {isSplitView && (
          <div 
            className="editor-area-group split-right"
            style={{ flex: 1, minWidth: 0 }}
          >
            {/* 右侧标签栏 */}
            {rightTabs.length > 0 && (
              <TabBar
                tabs={rightTabs}
                activeTabId={rightActiveTabId}
                onTabClick={setRightActiveTabId}
                onTabClose={handleRightTabClose}
              />
            )}

            {/* 右侧面包屑 */}
            {rightActiveTab && rightActiveTab.type !== 'settings' && rightActiveTab.type !== 'markdown-preview' && rightActiveTab.type !== 'knowledge' && rightActiveTab.type !== 'ai-config' && rightActiveTab.type !== 'ai-agent' && rightActiveTab.type !== 'lancedb-view' && (
              <Breadcrumb path={rightActiveTab.path} />
            )}

            {/* 右侧编辑器内容 */}
            <div className="editor-area-content">
              {/* 渲染所有右侧标签页，通过 display 控制可见性，避免重新加载 */}
              {rightTabs.map((tab) => {
                const isActive = tab.id === rightActiveTabId;
                
                return (
                  <div 
                    key={tab.id} 
                    className="editor-tab-content"
                    style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
                  >
                    {tab.type === 'settings' && <SettingsView />}
                    
                    {tab.type === 'extension-manager' && <ExtensionManagerView />}
                    
                    {tab.type === 'lancedb-view' && <LanceDBView />}
                    
                    {tab.type === 'database-view' && <DatabaseView />}
                    
                    {tab.type === 'ai-config' && (
                      <AIConfigView configId={tab.configId} configIndex={tab.configIndex} />
                    )}
                    
                    {tab.type === 'ai-agent' && (
                      <AIAgentView 
                        categoryId={tab.agentData?.categoryId || ''} 
                        categoryName={tab.agentData?.categoryName || ''}
                      />
                    )}
                    
                    {tab.type === 'markdown-preview' && (
                      <MarkdownPreview 
                        content={tab.content || ''} 
                        title={tab.title}
                        sourceTabId={tab.sourceTabId}
                      />
                    )}
                    
                    {tab.type === 'knowledge' && (
                      <KnowledgeBaseView
                        knowledgeId={tab.knowledgeData?.id || ''}
                        knowledgeTitle={tab.title}
                        items={tab.knowledgeData?.items || []}
                        onFileOpen={async (item) => {
                          if (item.type === 'file' && item.path) {
                            try {
                              const result = await window.electron?.file?.read(item.path);
                              if (result?.success && result.data) {
                                window.dispatchEvent(new CustomEvent('open-file', {
                                  detail: {
                                    path: item.path,
                                    name: item.title,
                                    content: result.data.content,
                                    language: item.metadata?.fileType === 'markdown' ? 'markdown' : 'plaintext',
                                    isPreview: false
                                  }
                                }));
                              }
                            } catch (error) {
                              console.error('[EditorArea] 读取文件失败:', error);
                            }
                          }
                        }}
                        onFileDelete={(item) => {
                          window.dispatchEvent(new CustomEvent('delete-knowledge-item', {
                            detail: { itemId: item.id }
                          }));
                        }}
                      />
                    )}
                    
                    {tab.type === 'file' && (
                      <EditorGroup
                        file={tab}
                        onContentChange={(content) => {
                          setRightTabs(prev => prev.map(t => 
                            t.id === tab.id 
                              ? { ...t, content, isDirty: true, isPreview: false }
                              : t
                          ));
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
