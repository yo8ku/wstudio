/**
 * TagsView.tsx
 * 标签视图组件
 * 功能：显示标签列表和标签云，支持标签筛选和管理
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTagStore } from '../../../../stores/tagStore';
import { useNoteStore } from '../../../../stores/noteStore';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

type ViewMode = 'list' | 'cloud';

export const TagsView: React.FC = () => {
  const { 
    tags, 
    selectedTag, 
    tagCloud,
    isLoading,
    loadTags, 
    selectTag,
    deleteTag
  } = useTagStore();
  
  const { setNotes } = useNoteStore();
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tagId: string } | null>(null);

  // 加载标签
  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // 处理标签点击
  const handleTagClick = useCallback(async (tagId: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (tag) {
      if (selectedTag?.id === tagId) {
        // 取消选择
        selectTag(null);
        // 重新加载所有笔记
        const notes = await window.electron?.ipcRenderer.invoke('note:getAll');
        if (notes) {
          setNotes(notes);
        }
      } else {
        selectTag(tag);
        // 加载该标签下的笔记
        const notes = await window.electron?.ipcRenderer.invoke('tag:getNotesByTag', tagId);
        if (notes) {
          setNotes(notes);
        }
      }
    }
  }, [tags, selectedTag, selectTag, setNotes]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, tagId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tagId });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 处理删除标签
  const handleDeleteTag = async () => {
    if (contextMenu) {
      await deleteTag(contextMenu.tagId);
      closeContextMenu();
    }
  };

  // 点击其他地方关闭菜单
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // 空状态
  if (!isLoading && tags.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="tags" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无标签
        </div>
        <div className="right-sidebar-empty-hint">
          在笔记中使用 #标签名 创建标签
        </div>
      </div>
    );
  }

  return (
    <div className="tags-view-container">
      {/* 视图切换 */}
      <div className="tags-view-header">
        <div className="view-mode-switch">
          <div
            className={`mode-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            role="button"
            tabIndex={0}
            title="列表视图"
          >
            <Icon name="list" size={14} />
          </div>
          <div
            className={`mode-btn ${viewMode === 'cloud' ? 'active' : ''}`}
            onClick={() => setViewMode('cloud')}
            role="button"
            tabIndex={0}
            title="标签云"
          >
            <Icon name="tags" size={14} />
          </div>
        </div>
        {selectedTag && (
          <div className="selected-tag-info">
            <span>筛选: {selectedTag.name}</span>
            <div
              className="clear-filter"
              onClick={() => handleTagClick(selectedTag.id)}
              role="button"
              tabIndex={0}
            >
              <Icon name="close" size={12} />
            </div>
          </div>
        )}
      </div>

      {/* 标签列表视图 */}
      {viewMode === 'list' && (
        <div className="tags-list">
          {tags.map(tag => (
            <div
              key={tag.id}
              className={`tag-list-item ${selectedTag?.id === tag.id ? 'selected' : ''}`}
              onClick={() => handleTagClick(tag.id)}
              onContextMenu={(e) => handleContextMenu(e, tag.id)}
            >
              <Icon name="tags" size={14} />
              <span className="tag-name">{tag.name}</span>
              <span className="tag-count">{tag.noteCount}</span>
            </div>
          ))}
        </div>
      )}

      {/* 标签云视图 */}
      {viewMode === 'cloud' && (
        <div className="tags-cloud">
          {tagCloud.map(({ tag, weight }) => (
            <div
              key={tag.id}
              className={`tag-cloud-item weight-${Math.min(5, Math.ceil(weight * 5))} ${selectedTag?.id === tag.id ? 'selected' : ''}`}
              onClick={() => handleTagClick(tag.id)}
              onContextMenu={(e) => handleContextMenu(e, tag.id)}
            >
              #{tag.name}
            </div>
          ))}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="tag-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="context-menu-item" onClick={handleDeleteTag}>
            <Icon name="trash" size={14} />
            <span>删除标签</span>
          </div>
        </div>
      )}
    </div>
  );
};
