/**
 * Bookmark view types.
 * Defines persisted bookmark metadata for the explorer bookmark panel.
 */

import type { NoteItem } from '../../../types/electron';

export interface BookmarkGroupItem {
  id: string;
  name: string;
  collapsed: boolean;
  parentId: string | null;
}

export interface BookmarkEntryItem {
  noteId: string;
  name: string;
  groupId: string | null;
}

export interface BookmarkNoteDisplayItem {
  note: NoteItem;
  entry: BookmarkEntryItem;
}

export interface BookmarkGroupSection {
  group: BookmarkGroupItem;
  items: BookmarkNoteDisplayItem[];
  children: BookmarkGroupSection[];
  depth: number;
}
