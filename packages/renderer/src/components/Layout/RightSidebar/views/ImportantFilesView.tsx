/**
 * ImportantFilesView.tsx
 * 重要文件视图组件
 * 功能：显示收藏的笔记列表，支持点击打开
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNoteStore } from '../../../../stores/noteStore';
import { NoteItem } from '../../../../types/electron';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

export const ImportantFilesView: React.FC = () => {
  const { setCurrentNote, toggleFavorite } = useNoteStore();
  
  const [favorites, setFavorites] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 加载收藏笔记
  const loadFavorites = useCallback(async () => {
    setIsLoading(true);
    try {
      const notes = await window.electron?.ipcRenderer.invoke('note:getFavorites');
      setFavorites(notes || []);
    } catch (error) {
      console.error('[ImportantFilesView] 加载收藏失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // 打开笔记
  const handleOpenNote = useCallback((note: NoteItem) => {
    setCurrentNote(note);
  }, [setCurrentNote]);

  // 取消收藏
  const handleRemoveFavorite = useCallback(async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    await toggleFavorite(noteId);
    // 重新加载收藏列表
    loadFavorites();
  }, [toggleFavorite, loadFavorites]);

  // 格式化日期
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    });
  };

  // 加载中
  if (isLoading) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-text">
          加载中...
        </div>
      </div>
    );
  }

  // 空状态
  if (favorites.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="important-files" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无收藏笔记
        </div>
        <div className="right-sidebar-empty-hint">
          在笔记列表中点击星标图标收藏笔记
        </div>
      </div>
    );
  }

  return (
    <div className="important-files-view-container">
      <div className="favorites-header">
        <span className="favorites-count">{favorites.length} 个收藏</span>
      </div>
      <div className="favorites-list">
        {favorites.map(note => (
          <div
            key={note.id}
            className="favorite-item"
            onClick={() => handleOpenNote(note)}
          >
            <div className="favorite-icon">
              <Icon name="file" size={16} />
            </div>
            <div className="favorite-content">
              <div className="favorite-title">{note.title}</div>
              <div className="favorite-meta">
                <span className="favorite-type">
                  {note.type === 'daily' ? '每日笔记' : note.type === 'quick' ? '快速笔记' : '笔记'}
                </span>
                <span className="favorite-date">{formatDate(note.updatedAt)}</span>
              </div>
            </div>
            <div
              className="favorite-remove"
              onClick={(e) => handleRemoveFavorite(e, note.id)}
              title="取消收藏"
            >
              <Icon name="star-filled" size={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
