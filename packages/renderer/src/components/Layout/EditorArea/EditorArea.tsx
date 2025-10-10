/**
 * 编辑器区域容器
 * 功能：管理编辑器标签页、文件保存和快捷键
 * 描述：提供文件编辑、保存、预览等核心功能
 */

import React, { useState, useEffect } from 'react';
import { TabBar } from './TabBar';
import { Breadcrumb } from './Breadcrumb';
import { EditorGroup } from './EditorGroup';
import { SettingsView } from '../../Settings/SettingsView';
import { MarkdownPreview } from '../../Editor/MarkdownPreview';
import { KnowledgeBaseView } from './KnowledgeBaseView';
import { knowledgeBaseService } from '../Sidebar/KnowledgeBase/knowledgeBaseService';
import './EditorArea.scss';

export interface EditorTab {
  id: string;
  title: string;
  path: string;
  isDirty: boolean;
  language?: string;
  content?: string;
  type?: 'file' | 'settings' | 'markdown-preview' | 'knowledge';  // 新增：knowledge 知识库类型
  isPreview?: boolean;  // 新增：是否为预览模式（单击打开）
  sourceTabId?: string;  // 新增：预览标签页关联的源文件标签页 ID
  knowledgeData?: any;  // 新增：知识库数据（用于 knowledge 类型）
}

interface EditorAreaProps {
  className?: string;
}

export const EditorArea: React.FC<EditorAreaProps> = ({ className = '' }) => {
  // 左侧编辑器组
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  // 右侧编辑器组（用于分割视图）
  const [rightTabs, setRightTabs] = useState<EditorTab[]>([]);
  const [rightActiveTabId, setRightActiveTabId] = useState<string | null>(null);
  
  // 分割视图是否激活
  const [isSplitView, setIsSplitView] = useState(false);


  // 加载上次打开的文件
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
    const handleOpenFile = async (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        path?: string; 
        content?: string; 
        name?: string; 
        language?: string;
        isPreview?: boolean;  // 新增：是否为预览模式
        lineNumber?: number;  // 新增：要定位的行号
        column?: number;      // 新增：要定位的列号
      }>;
      
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
        
        // 检查是否已经打开了该文件
        const existingTab = tabs.find(tab => tab.path === path);
        
        if (existingTab) {
          // 如果是双击打开（非预览），将预览标签转为固定标签
          if (!isPreview && existingTab.isPreview) {
            setTabs(prev => prev.map(tab => 
              tab.id === existingTab.id ? { ...tab, isPreview: false } : tab
            ));
          }
          setActiveTabId(existingTab.id);
          
          // 如果指定了行号，触发定位事件
          if (lineNumber) {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('editor-reveal-line', {
                detail: { lineNumber, column: column || 1 }
              }));
            }, 100);
          }
        } else {
          // 如果是预览模式，替换现有的预览标签
          if (isPreview) {
            const previewTab = tabs.find(tab => tab.isPreview);
            if (previewTab) {
              // 替换预览标签
              const newId = `file-${Date.now()}`;
              setTabs(prev => prev.map(tab => 
                tab.isPreview ? {
                  id: newId,
                  title: name || 'Untitled',
                  path: path || '',
                  isDirty: false,
                  language: language || 'plaintext',
                  content: content || '',
                  type: 'file',
                  isPreview: true
                } : tab
              ));
              setActiveTabId(newId);
              
              // 如果指定了行号，触发定位事件
              if (lineNumber) {
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('editor-reveal-line', {
                    detail: { lineNumber, column: column || 1 }
                  }));
                }, 100);
              }
              return;
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
          
          setTabs(prev => [...prev, newTab]);
          setActiveTabId(newTab.id);
          
          // 如果指定了行号，触发定位事件
          if (lineNumber) {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('editor-reveal-line', {
                detail: { lineNumber, column: column || 1 }
              }));
            }, 100);
          }
        }
      } else {
        // 打开文件对话框（非预览模式）
        try {
          const result = await window.electron?.file?.open();
          if (result?.success && result.data) {
            const { path, content, name, language } = result.data;
            
            // 检查是否已经打开了该文件
            const existingTab = tabs.find(tab => tab.path === path);
            
            if (existingTab) {
              // 固定预览标签
              if (existingTab.isPreview) {
                setTabs(prev => prev.map(tab => 
                  tab.id === existingTab.id ? { ...tab, isPreview: false } : tab
                ));
              }
              setActiveTabId(existingTab.id);
            } else {
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
              setTabs(prev => [...prev, newTab]);
              setActiveTabId(newTab.id);
            }
          }
        } catch (error) {
          // 打开文件失败，静默处理
        }
      }
    };

    const handleOpenSettings = () => {
      // 检查是否已经有设置标签页
      const settingsTab = tabs.find(tab => tab.type === 'settings');
      
      if (settingsTab) {
        // 如果已存在，直接激活
        setActiveTabId(settingsTab.id);
      } else {
        // 否则创建新的设置标签页
        const newTab: EditorTab = {
          id: `settings-${Date.now()}`,
          title: '设置',
          path: 'settings:/',
          isDirty: false,
          type: 'settings'
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
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
          language: 'json',
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

    window.addEventListener('open-file', handleOpenFile as EventListener);
    window.addEventListener('open-settings', handleOpenSettings);
    window.addEventListener('open-settings-json', handleOpenSettingsJson as EventListener);
    window.addEventListener('show-markdown-preview', handleShowMarkdownPreview as EventListener);
    
    return () => {
      window.removeEventListener('open-file', handleOpenFile as EventListener);
      window.removeEventListener('open-settings', handleOpenSettings);
      window.removeEventListener('open-settings-json', handleOpenSettingsJson as EventListener);
      window.removeEventListener('show-markdown-preview', handleShowMarkdownPreview as EventListener);
    };
  }, [tabs, rightTabs]);

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
        
        if (existingKnowledgeTab) {
          // 如果已存在知识库标签页，更新其标题和数据
          setActiveTabId(existingKnowledgeTab.id);
          console.log('[EditorArea] 更新知识库标签页:', `知识库 - ${title}`);
          return prev.map(tab => 
            tab.id === existingKnowledgeTab.id 
              ? { 
                  ...tab, 
                  title: `知识库 - ${title}`,
                  path: `knowledge:/${id}`,
                  knowledgeData: { id, items, description } 
                } 
              : tab
          );
        } else {
          // 创建新的知识库标签页（首次打开）
          const newTab: EditorTab = {
            id: `knowledge-${Date.now()}`,
            title: `知识库 - ${title}`,
            path: `knowledge:/${id}`,
            isDirty: false,
            type: 'knowledge',
            knowledgeData: { id, items, description }
          };
          setActiveTabId(newTab.id);
          console.log('[EditorArea] 创建知识库标签页:', `知识库 - ${title}`);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    
    return () => {
      window.removeEventListener('open-knowledge', handleOpenKnowledge as EventListener);
    };
  }, []); // 无依赖，只注册一次

  // 监听知识库更新事件（刷新知识库数据）
  useEffect(() => {
    const handleKnowledgeBaseUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ knowledgeId: string }>;
      const { knowledgeId } = customEvent.detail;
      
      console.log('[EditorArea] 知识库已更新，重新加载数据:', knowledgeId);
      
      // 重新加载知识库数据
      const data = knowledgeBaseService.loadFromStorage();
      
      // 更新对应的知识库标签页数据
      setTabs(prev => prev.map(tab => {
        if (tab.type === 'knowledge' && tab.knowledgeData?.id === knowledgeId) {
          return {
            ...tab,
            knowledgeData: {
              id: knowledgeId,
              items: data.created
            }
          };
        }
        return tab;
      }));
    };

    window.addEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    
    return () => {
      window.removeEventListener('knowledge-base-updated', handleKnowledgeBaseUpdated as EventListener);
    };
  }, []);

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

  const handleTabClose = (tabId: string) => {
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);
    
    if (activeTabId === tabId && newTabs.length > 0) {
      setActiveTabId(newTabs[0].id);
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

  const handleContentChange = (content: string) => {
    setTabs(tabs.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, content, isDirty: true, isPreview: false }  // 编辑时自动固定预览标签
        : tab
    ));
    
    // 如果右侧有预览该文件的标签页，实时更新预览内容
    const previewTab = rightTabs.find(tab => tab.sourceTabId === activeTabId);
    if (previewTab) {
      setRightTabs(prev => prev.map(tab => 
        tab.id === previewTab.id ? { ...tab, content } : tab
      ));
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
      const result = await window.electron?.file?.save(tab.path, tab.content || '');
      if (result?.success) {
        // 清除脏标记
        setTabs(tabs.map(t => t.id === tab.id ? { ...t, isDirty: false } : t));
        setRightTabs(rightTabs.map(t => t.sourceTabId === tab.id ? { ...t, isDirty: false } : t));
      }
    } catch (error) {
      // 保存文件异常，静默处理
    }
  };

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
        >
          {/* 左侧标签栏 - 始终显示，即使没有标签 */}
          {tabs.length > 0 ? (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={setActiveTabId}
              onTabClose={handleTabClose}
            />
          ) : (
            <div className="tab-bar-placeholder" />
          )}

          {/* 左侧面包屑 */}
          {activeTab && activeTab.type !== 'settings' && activeTab.type !== 'markdown-preview' && activeTab.type !== 'knowledge' && (
            <Breadcrumb path={activeTab.path} />
          )}

          {/* 左侧编辑器内容 */}
          <div className="editor-area-content">
            {(() => {
              console.log('[EditorArea] Rendering content, activeTab:', activeTab);
              if (!activeTab) {
                console.log('[EditorArea] No active tab, showing empty state');
                return (
                  <div className="editor-area-empty">
                    <div className="editor-area-empty-content">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="title">没有打开的编辑器</p>
                      <p className="subtitle">从文件浏览器打开文件开始编辑</p>
                    </div>
                  </div>
                );
              }
              
              if (activeTab.type === 'settings') {
                console.log('[EditorArea] Rendering SettingsView');
                return <SettingsView />;
              }
              
              if (activeTab.type === 'markdown-preview') {
                console.log('[EditorArea] Rendering MarkdownPreview');
                return (
                  <MarkdownPreview 
                    content={activeTab.content || ''} 
                    title={activeTab.title}
                    sourceTabId={activeTab.sourceTabId}
                  />
                );
              }
              
              if (activeTab.type === 'knowledge') {
                console.log('[EditorArea] Rendering KnowledgeBaseView');
                return (
                  <KnowledgeBaseView
                    knowledgeId={activeTab.knowledgeData?.id || ''}
                    knowledgeTitle={activeTab.title}
                    knowledgeDescription={activeTab.knowledgeData?.description || ''}
                    items={activeTab.knowledgeData?.items || []}
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
                );
              }
              
              console.log('[EditorArea] Rendering EditorGroup with file:', {
                id: activeTab.id,
                title: activeTab.title,
                type: activeTab.type
              });
              return (
                <EditorGroup
                  file={activeTab}
                  onContentChange={handleContentChange}
                />
              );
            })()}
          </div>
        </div>

        {/* 分隔线 */}
        {isSplitView && (
          <div className="editor-area-divider" />
        )}

        {/* 右侧编辑器组 */}
        {isSplitView && (
          <div className="editor-area-group split-right">
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
            {rightActiveTab && rightActiveTab.type !== 'settings' && rightActiveTab.type !== 'markdown-preview' && rightActiveTab.type !== 'knowledge' && (
              <Breadcrumb path={rightActiveTab.path} />
            )}

            {/* 右侧编辑器内容 */}
            <div className="editor-area-content">
              {rightActiveTab ? (
                rightActiveTab.type === 'settings' ? (
                  <SettingsView />
                ) : rightActiveTab.type === 'markdown-preview' ? (
                  <MarkdownPreview 
                    content={rightActiveTab.content || ''} 
                    title={rightActiveTab.title}
                    sourceTabId={rightActiveTab.sourceTabId}
                  />
                ) : rightActiveTab.type === 'knowledge' ? (
                  <KnowledgeBaseView
                    knowledgeId={rightActiveTab.knowledgeData?.id || ''}
                    knowledgeTitle={rightActiveTab.title}
                    items={rightActiveTab.knowledgeData?.items || []}
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
                ) : (
                  <EditorGroup
                    file={rightActiveTab}
                    onContentChange={(content) => {
                      setRightTabs(rightTabs.map(tab => 
                        tab.id === rightActiveTabId 
                          ? { ...tab, content, isDirty: true, isPreview: false }
                          : tab
                      ));
                    }}
                  />
                )
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
