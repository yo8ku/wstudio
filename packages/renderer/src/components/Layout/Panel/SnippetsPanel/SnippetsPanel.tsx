/**
 * SnippetsPanel.tsx
 * 底部链接面板。
 * 功能：显示当前文件的出链、反向链接和提到当前文件名。
 */

import React, { useEffect } from 'react';
import { useLinkStore } from '../../../../stores/linkStore';
import { useNoteStore } from '../../../../stores/noteStore';
import { openNoteInEditor } from '../../../../utils/noteLinking';
import {
  LinkCollection,
  LinkViewToolbar,
  createBacklinkCollectionItems,
  createMentionCollectionItems,
  createOutlinkCollectionItems
} from '../../../Links';
import { Icon } from '../../../Icons';
import './SnippetsPanel.scss';

import type { LinkCollectionSort } from '../../../Links';

interface SnippetsPanelProps {
  query?: string;
  sortBy?: LinkCollectionSort;
  isSearchVisible?: boolean;
  showFullContext?: boolean;
  onQueryChange?: (query: string) => void;
  onToggleSearch?: () => void;
  onSortChange?: (sortBy: LinkCollectionSort) => void;
  onToggleContext?: () => void;
}

export const SnippetsPanel: React.FC<SnippetsPanelProps> = ({
  query = '',
  sortBy = 'default',
  isSearchVisible = false,
  showFullContext = false,
  onQueryChange = () => {},
  onToggleSearch = () => {},
  onSortChange = () => {},
  onToggleContext = () => {}
}) => {
  const {
    outlinks,
    backlinks,
    unlinkedMentions,
    isLoading,
    loadLinks,
    findUnlinkedMentions,
    convertUnlinkedMention
  } = useLinkStore();
  const { currentNote, setCurrentNote } = useNoteStore();

  useEffect(() => {
    if (currentNote) {
      void Promise.all([
        loadLinks(currentNote.id),
        findUnlinkedMentions(currentNote.id)
      ]);
    }
  }, [currentNote, findUnlinkedMentions, loadLinks]);

  const handleOpenNote = async (noteId?: string, lineNumber?: number) => {
    if (!noteId) {
      return;
    }

    try {
      await openNoteInEditor(noteId, {
        lineNumber,
        column: 1,
        setCurrentNote
      });
    } catch (error) {
      console.error('[SnippetsPanel] 打开笔记失败:', error);
    }
  };

  const handleConvertMention = async (
    sourceNoteId: string,
    position: { start: number; end: number },
    matchedText: string
  ) => {
    if (!currentNote) {
      return;
    }

    await convertUnlinkedMention(sourceNoteId, currentNote.id, position, matchedText);
  };

  if (!currentNote) {
    return (
      <div className="snippets-panel snippets-panel-empty-state">
        <div className="snippets-panel-empty">
          <Icon name="links" size={42} />
          <div className="snippets-panel-empty-title">当前文件还没有链接索引</div>
          <div className="snippets-panel-empty-description">
            打开或保存一个可索引的文本文件后，这里会显示它的双向链接。
          </div>
        </div>
      </div>
    );
  }

  const mentionTitle = '提到当前文件名';

  return (
    <div className="snippets-panel">
      <div className="snippets-panel-content">
        {isLoading ? (
          <div className="snippets-panel-empty">
            <div className="snippets-panel-empty-title">加载中...</div>
          </div>
        ) : (
          <>
            <LinkViewToolbar
              query={query}
              sortBy={sortBy}
              isSearchVisible={isSearchVisible}
              showFullContext={showFullContext}
              searchPlaceholder="搜索链接、来源、锚点或上下文"
              stats={[
                { label: '出链', count: outlinks.length },
                { label: '反链', count: backlinks.length },
                { label: '提到', count: unlinkedMentions.length }
              ]}
              onQueryChange={onQueryChange}
              onToggleSearch={onToggleSearch}
              onSortChange={onSortChange}
              onToggleContext={onToggleContext}
            />

            <LinkCollection
              title="出链"
              items={createOutlinkCollectionItems(outlinks, handleOpenNote)}
              emptyText="暂无出链到其他文件"
              defaultCollapsed
              resetKey={`${currentNote.id}-outlinks`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />

            <LinkCollection
              title="反链"
              items={createBacklinkCollectionItems(backlinks, handleOpenNote)}
              emptyText="没有笔记链接当前文件"
              defaultCollapsed
              resetKey={`${currentNote.id}-backlinks`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />

            <LinkCollection
              title={mentionTitle}
              items={createMentionCollectionItems(
                unlinkedMentions,
                handleOpenNote,
                handleConvertMention
              )}
              emptyText="没有笔记提到当前文件名"
              defaultCollapsed
              resetKey={`${currentNote.id}-mentions`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />
          </>
        )}
      </div>
    </div>
  );
};
