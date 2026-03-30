import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLinkStore } from '../../../../stores/linkStore';
import { useNoteStore } from '../../../../stores/noteStore';
import { openNoteInEditor } from '../../../../utils/noteLinking';
import {
  LinkCollection,
  LinkViewToolbar,
  createBacklinkCollectionItems,
  createMentionCollectionItems,
  createOutlinkCollectionItems,
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
  onToggleContext = () => {},
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  const {
    outlinks,
    backlinks,
    unlinkedMentions,
    isLoading,
    loadLinks,
    findUnlinkedMentions,
    convertUnlinkedMention,
  } = useLinkStore();
  const { currentNote, setCurrentNote } = useNoteStore();

  const collectionTexts = useMemo(() => ({
    unresolvedBadge: translateText('linksPanel.badges.unresolved', '未解析'),
    sourceNoteFallback: translateText('linksPanel.defaults.sourceNote', '来源笔记'),
    lineBadge: (lineNumber: number): string => translateText('linksPanel.badges.line', `第 ${lineNumber} 行`).replace('{{line}}', String(lineNumber)),
    convertMentionAction: translateText('linksPanel.actions.convertMention', '转为链接'),
  }), [t]);

  useEffect(() => {
    if (!currentNote) {
      return;
    }

    void Promise.all([
      loadLinks(currentNote.id),
      findUnlinkedMentions(currentNote.id),
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
        setCurrentNote,
      });
    } catch (error) {
      console.error('[LinksPanel] Failed to open note:', error);
    }
  };

  const handleConvertMention = async (
    sourceNoteId: string,
    position: { start: number; end: number },
    matchedText: string,
  ): Promise<void> => {
    if (!currentNote) {
      return;
    }

    await convertUnlinkedMention(sourceNoteId, currentNote.id, position, matchedText);
  };

  if (!currentNote) {
    return (
      <div className='links-panel links-panel-empty-state'>
        <div className='links-panel-empty'>
          <Icon name='links' size={42} />
          <div className='links-panel-empty-title'>
            {translateText('linksPanel.states.openNoteTitle', '请先打开一篇笔记')}
          </div>
          <div className='links-panel-empty-description'>
            {translateText('linksPanel.states.openNoteDescription', '打开笔记后，这里会显示出链、反向链接和提及。')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='links-panel'>
      <div className='links-panel-content'>
        {isLoading ? (
          <div className='links-panel-empty'>
            <div className='links-panel-empty-title'>
              {translateText('linksPanel.states.loading', '加载中...')}
            </div>
          </div>
        ) : (
          <>
            <LinkViewToolbar
              query={query}
              sortBy={sortBy}
              isSearchVisible={isSearchVisible}
              showFullContext={showFullContext}
              searchPlaceholder={translateText('linksPanel.toolbar.searchPlaceholder', '搜索出链、反向链接或提及...')}
              stats={[
                { label: translateText('linksPanel.collections.outlinks', '出链'), count: outlinks.length },
                { label: translateText('linksPanel.collections.backlinks', '反向链接'), count: backlinks.length },
                { label: translateText('linksPanel.collections.mentions', '提及'), count: unlinkedMentions.length },
              ]}
              onQueryChange={onQueryChange}
              onToggleSearch={onToggleSearch}
              onSortChange={onSortChange}
              onToggleContext={onToggleContext}
            />

            <LinkCollection
              title={translateText('linksPanel.collections.outlinks', '出链')}
              items={createOutlinkCollectionItems(outlinks, handleOpenNote, collectionTexts)}
              emptyText={translateText('linksPanel.emptyTexts.outlinks', '当前笔记没有出链')}
              defaultCollapsed
              resetKey={`${currentNote.id}-outlinks`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />

            <LinkCollection
              title={translateText('linksPanel.collections.backlinks', '反向链接')}
              items={createBacklinkCollectionItems(backlinks, handleOpenNote, collectionTexts)}
              emptyText={translateText('linksPanel.emptyTexts.backlinks', '当前笔记没有反向链接')}
              defaultCollapsed
              resetKey={`${currentNote.id}-backlinks`}
              query={query}
              sortBy={sortBy}
              showFullContext={showFullContext}
            />

            <LinkCollection
              title={translateText('linksPanel.collections.mentions', '提及')}
              items={createMentionCollectionItems(
                unlinkedMentions,
                handleOpenNote,
                handleConvertMention,
                collectionTexts,
              )}
              emptyText={translateText('linksPanel.emptyTexts.mentions', '当前笔记没有提及')}
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
