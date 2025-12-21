/**
 * BacklinksView.tsx
 * 反向链接视图组件
 * 功能：显示引用当前笔记的列表、未链接提及、点击跳转
 */

import React, { useEffect, useCallback } from 'react';
import { useLinkStore } from '../../../../stores/linkStore';
import { useNoteStore } from '../../../../stores/noteStore';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

export const BacklinksView: React.FC = () => {
  const { 
    backlinks, 
    unlinkedMentions, 
    isLoading,
    loadLinks,
    findUnlinkedMentions
  } = useLinkStore();
  
  const { currentNote, setCurrentNote } = useNoteStore();

  // 当前笔记变化时加载链接
  useEffect(() => {
    if (currentNote) {
      loadLinks(currentNote.id);
      findUnlinkedMentions(currentNote.title);
    }
  }, [currentNote, loadLinks, findUnlinkedMentions]);

  // 打开引用笔记
  const handleOpenNote = useCallback(async (noteId: string) => {
    try {
      const note = await window.electron?.ipcRenderer.invoke('note:get', noteId);
      if (note) {
        setCurrentNote(note);
      }
    } catch (error) {
      console.error('[BacklinksView] 打开笔记失败:', error);
    }
  }, [setCurrentNote]);

  // 空状态 - 无当前笔记
  if (!currentNote) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="backlinks" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          请先打开一个笔记
        </div>
      </div>
    );
  }

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

  const hasBacklinks = backlinks.length > 0;
  const hasUnlinkedMentions = unlinkedMentions.length > 0;

  // 空状态 - 无反向链接
  if (!hasBacklinks && !hasUnlinkedMentions) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="backlinks" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无反向链接
        </div>
        <div className="right-sidebar-empty-hint">
          其他笔记使用 [[{currentNote.title}]] 链接到此笔记时会显示在这里
        </div>
      </div>
    );
  }

  return (
    <div className="backlinks-view-container">
      {/* 反向链接列表 */}
      {hasBacklinks && (
        <div className="backlinks-section">
          <div className="section-header">
            <Icon name="backlinks" size={14} />
            <span className="section-title">反向链接</span>
            <span className="section-count">{backlinks.length}</span>
          </div>
          <div className="backlinks-list">
            {backlinks.map(link => (
              <div
                key={link.id}
                className="backlink-item"
                onClick={() => handleOpenNote(link.sourceId)}
              >
                <div className="backlink-header">
                  <Icon name="file" size={14} />
                  <span className="backlink-source">来自笔记</span>
                </div>
                {link.context && (
                  <div className="backlink-context">
                    {link.context}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 未链接提及 */}
      {hasUnlinkedMentions && (
        <div className="unlinked-section">
          <div className="section-header">
            <Icon name="link" size={14} />
            <span className="section-title">未链接提及</span>
            <span className="section-count">{unlinkedMentions.length}</span>
          </div>
          <div className="unlinked-list">
            {unlinkedMentions.map((mention, index) => (
              <div
                key={index}
                className="unlinked-item"
                onClick={() => handleOpenNote(mention.noteId)}
              >
                <div className="unlinked-context">
                  {mention.context}
                </div>
                <div className="unlinked-hint">
                  点击查看，可转换为链接
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
