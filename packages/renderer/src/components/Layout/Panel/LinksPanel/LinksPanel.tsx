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
import './LinksPanel.scss';

import type { LinkCollectionSort } from '../../../Links';

interface LinksPanelProps {
  query?: string;
  sortBy?: LinkCollectionSort;
  isSearchVisible?: boolean;
  showFullContext?: boolean;
  onQueryChange?: (query: string) => void;
  onToggleSearch?: () => void;
  onSortChange?: (sortBy: LinkCollectionSort) => void;
  onToggleContext?: () => void;
}

export const LinksPanel: React.FC<LinksPanelProps> = ({
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
    if (!currentNote) {
      return;
    }

    void Promise.all([
      loadLinks(currentNote.id),
      findUnlinkedMentions(currentNote.id)
    ]);
  }, [currentNote, findUnlinkedMentions, loadLinks]);

  const handleOpenNote = async (noteId?: string, lineNumber?: number): Promise<void> => {
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
      console.error('[LinksPanel] Failed to open note:', error);
    }
  };

  const handleConvertMention = async (
    sourceNoteId: string,
    position: { start: number; end: number },
    matchedText: string
  ): Promise<void> => {
    if (!currentNote) {
      return;
    }

    await convertUnlinkedMention(sourceNoteId, currentNote.id, position, matchedText);
  };

  if (!currentNote) {
    return (
      <div className="links-panel links-panel-empty-state">
        <div className="links-panel-empty">
          <Icon name="links" size={42} />
          <div className="links-panel-empty-title">{'\u8bf7\u5148\u6253\u5f00\u4e00\u7bc7\u7b14\u8bb0'}</div>
          <div className="links-panel-empty-description">
            {'\u6253\u5f00\u7b14\u8bb0\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u51fa\u94fe\u3001\u53cd\u5411\u94fe\u63a5\u548c\u672a\u94fe\u63a5\u63d0\u53ca\u3002'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="links-panel">
      <div className="links-panel-content">
        {isLoading ? (
          <div className="links-panel-empty">
            <div className="links-panel-empty-title">{'\u52a0\u8f7d\u4e2d...'}</div>
          </div>
        ) : (
          <>
            <LinkViewToolbar
              query={query}
              sortBy={sortBy}
              isSearchVisible={isSearchVisible}
              showFullContext={showFullContext}
              searchPlaceholder={'\u641c\u7d22\u51fa\u94fe\u3001\u53cd\u5411\u94fe\u63a5\u6216\u63d0\u53ca...'}
              stats={[
                { label: '\u51fa\u94fe', count: outlinks.length },
                { label: '\u53cd\u5411\u94fe\u63a5', count: backlinks.length },
                { label: '\u63d0\u53ca', count: unlinkedMentions.length }
              ]}
              onQueryChange={onQueryChange}
              onToggleSearch={onToggleSearch}
              onSortChange={onSortChange}
              onToggleContext={onToggleContext}
            />

            <LinkCollection
              title={'\u51fa\u94fe'}
              items={createOutlinkCollectionItems(outlinks, handleOpenNote)}
              emptyText={'\u5f53\u524d\u7b14\u8bb0\u6ca1\u6709\u51fa\u94fe'}
              defaultCollapsed
              resetKey={`${currentNote.id}-outlinks`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />

            <LinkCollection
              title={'\u53cd\u5411\u94fe\u63a5'}
              items={createBacklinkCollectionItems(backlinks, handleOpenNote)}
              emptyText={'\u5f53\u524d\u7b14\u8bb0\u6ca1\u6709\u53cd\u5411\u94fe\u63a5'}
              defaultCollapsed
              resetKey={`${currentNote.id}-backlinks`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />

            <LinkCollection
              title={'\u63d0\u53ca'}
              items={createMentionCollectionItems(
                unlinkedMentions,
                handleOpenNote,
                handleConvertMention
              )}
              emptyText={'\u5f53\u524d\u7b14\u8bb0\u6ca1\u6709\u672a\u94fe\u63a5\u63d0\u53ca'}
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
