/**
 * 知识库视图组件
 * 功能：在编辑器标签页中显示知识库的文件列表
 * 描述：提供文件浏览、打开、删除等操作
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { KnowledgeItem } from '../Sidebar/KnowledgeBase/types';
import { SearchFilterIcon, SortIcon, AddDocumentIcon, ClearIcon } from '../Sidebar/KnowledgeBase/KnowledgeBaseIcons';
import { AddFileMenu } from './AddFileMenu';
import { FileIcon } from '../../Explorer/FileTree/FileIcons';
import './KnowledgeBaseView.scss';

interface KnowledgeBaseViewProps {
  knowledgeId: string;
  knowledgeTitle: string;
  knowledgeDescription?: string;
  items: KnowledgeItem[];
  onFileOpen?: (item: KnowledgeItem) => void;
  onFileDelete?: (item: KnowledgeItem) => void;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  knowledgeId,
  knowledgeTitle,
  knowledgeDescription,
  items,
  onFileOpen,
  onFileDelete
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // 过滤出当前知识库的项（只显示 id 匹配的知识库及其子项）
  const currentKnowledgeItems = React.useMemo(() => {
    const knowledgeBase = items.find(item => item.id === knowledgeId);
    return knowledgeBase ? (knowledgeBase.children || []) : [];
  }, [items, knowledgeId]);

  // 搜索输入框显示时自动聚焦
  useEffect(() => {
    if (showSearchInput && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearchInput]);

  // 切换搜索输入框显示
  const handleToggleSearch = useCallback(() => {
    setShowSearchInput(prev => !prev);
    if (showSearchInput) {
      // 关闭时清空搜索
      setSearchQuery('');
    }
  }, [showSearchInput]);

  // 清除搜索
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // 排序处理
  const handleSort = useCallback(() => {
    // TODO: 实现排序功能
    console.log('[KnowledgeBaseView] 排序知识库');
  }, []);

  // 添加文件 - 切换菜单显示
  const handleAddFile = useCallback(() => {
    setShowAddMenu(prev => !prev);
  }, []);

  // 导入本地文件
  const handleImportFile = useCallback(() => {
    console.log('[KnowledgeBaseView] 导入本地文件');
    // TODO: 实现文件导入逻辑
  }, []);

  // 导入本地文件夹
  const handleImportFolder = useCallback(() => {
    console.log('[KnowledgeBaseView] 导入本地文件夹');
    // TODO: 实现文件夹导入逻辑
  }, []);

  // 导入笔记
  const handleImportNote = useCallback((noteId: string) => {
    console.log('[KnowledgeBaseView] 导入笔记:', noteId);
    // TODO: 实现笔记导入逻辑
  }, []);

  // 模拟笔记列表（后续从实际数据源获取）
  const mockNotes = [
    { id: 'note-1', title: '我的第一篇笔记' },
    { id: 'note-2', title: '学习笔记' },
    { id: 'note-3', title: '项目规划' },
  ];

  // 切换文件夹展开/折叠
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  // 处理文件点击
  const handleItemClick = useCallback((item: KnowledgeItem) => {
    setSelectedItem(item.id);
    if (item.type === 'folder') {
      toggleFolder(item.id);
    } else {
      onFileOpen?.(item);
    }
  }, [toggleFolder, onFileOpen]);

  // 处理文件双击
  const handleItemDoubleClick = useCallback((item: KnowledgeItem) => {
    if (item.type === 'file') {
      onFileOpen?.(item);
    }
  }, [onFileOpen]);

  // 获取文件图标（使用应用统一的图标系统）
  const getFileIcon = (item: KnowledgeItem) => {
    if (item.type === 'folder') {
      const isExpanded = expandedFolders.has(item.id);
      return (
        <FileIcon
          folderName={item.title}
          isFolder={true}
          isExpanded={isExpanded}
          size={16}
        />
      );
    } else {
      return (
        <FileIcon
          fileName={item.title}
          isFolder={false}
          size={16}
        />
      );
    }
  };

  // 递归渲染文件树
  const renderItems = (items: KnowledgeItem[], level: number = 0): React.ReactNode => {
    return items.map(item => {
      const isExpanded = expandedFolders.has(item.id);
      const isSelected = selectedItem === item.id;
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.id} className="knowledge-item-wrapper">
          <div
            className={`knowledge-item ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: item.type === 'folder' ? '28px' : '49px' }}
            onClick={() => handleItemClick(item)}
            onDoubleClick={() => handleItemDoubleClick(item)}
          >
            {item.type === 'folder' && (
              <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 4l4 4-4 4V4z"/>
                </svg>
              </span>
            )}
            <span className="item-icon">{getFileIcon(item)}</span>
            <span className="item-title">{item.title}</span>
            {item.type === 'file' && (
              <span className="item-actions">
                <button
                  className="action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileDelete?.(item);
                  }}
                  title="删除"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916Z"/>
                  </svg>
                </button>
              </span>
            )}
          </div>
          {item.type === 'folder' && isExpanded && hasChildren && (
            <div className="folder-children">
              {renderItems(item.children || [], level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // 统计信息
  const getTotalFiles = (items: KnowledgeItem[]): number => {
    let count = 0;
    items.forEach(item => {
      if (item.type === 'file') {
        count++;
      }
      if (item.children) {
        count += getTotalFiles(item.children);
      }
    });
    return count;
  };

  const totalFiles = getTotalFiles(currentKnowledgeItems);

  return (
    <div className="knowledge-base-view">
      <div className="knowledge-header">
        <div className="header-title">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
          </svg>
          <div className="title-content">
            <h2>{knowledgeTitle}</h2>
            {knowledgeDescription && (
              <p className="knowledge-description">{knowledgeDescription}</p>
            )}
          </div>
        </div>
        <div className="header-middle">
          <span className="stat-item">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707A1 1 0 0 0 13.707 4L10 .293A1 1 0 0 0 9.293 0H4z"/>
            </svg>
            {totalFiles} 个文件
          </span>
        </div>
        <div className="header-actions">
          {showSearchInput && (
            <div className="search-input-wrapper">
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="搜索文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleToggleSearch();
                  }
                }}
              />
              {searchQuery && (
                <button
                  className="clear-button"
                  onClick={handleClearSearch}
                  title="清除"
                >
                  <ClearIcon />
                </button>
              )}
            </div>
          )}
          <button 
            className={`action-button ${showSearchInput ? 'active' : ''}`}
            onClick={handleToggleSearch}
            title="搜索过滤"
          >
            <SearchFilterIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleSort}
            title="排序"
          >
            <SortIcon />
          </button>
          <button 
            ref={addButtonRef}
            className={`action-button ${showAddMenu ? 'active' : ''}`}
            onClick={handleAddFile}
            title="添加文件"
          >
            <AddDocumentIcon />
          </button>
        </div>
      </div>

      {/* 添加文件菜单 */}
      <AddFileMenu
        isOpen={showAddMenu}
        onClose={() => setShowAddMenu(false)}
        anchorEl={addButtonRef.current}
        onImportFile={handleImportFile}
        onImportFolder={handleImportFolder}
        onImportNote={handleImportNote}
        notes={mockNotes}
        knowledgeId={knowledgeId}
      />

      <div className="knowledge-content">
        {currentKnowledgeItems.length > 0 ? (
          renderItems(currentKnowledgeItems)
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
              <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
            </svg>
            <p>该知识库暂无文件</p>
          </div>
        )}
      </div>
    </div>
  );
};

