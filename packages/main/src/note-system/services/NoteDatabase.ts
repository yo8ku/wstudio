/**
 * NoteDatabase.ts
 * 笔记系统数据库服务
 * 功能：管理笔记、标签、链接、模板的数据库操作
 * 描述：提供笔记系统的完整 CRUD 功能，使用 SQLite 存储
 */

import { SQLiteDatabase, UpdateCondition, QueryResultRow } from '../../services/SQLiteDatabase';
import { v4 as uuidv4 } from 'uuid';
import {
  NoteItem,
  NoteType,
  TagItem,
  LinkItem,
  TemplateItem
} from '../types';

/**
 * 笔记数据库行类型
 */
interface NoteRow extends QueryResultRow {
  id: string;
  title: string;
  content: string;
  path: string;
  type: string;
  is_favorite: number;
  is_pinned: number;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

/**
 * 标签数据库行类型
 */
interface TagRow extends QueryResultRow {
  id: string;
  name: string;
  parent_id: string | null;
  note_count: number;
  created_at: number;
}

interface NoteTagNameRow extends QueryResultRow {
  note_id: string;
  tag_name: string;
}

/**
 * 链接数据库行类型
 */
interface LinkRow extends QueryResultRow {
  id: string;
  source_id: string;
  target_id: string | null;
  target_title: string;
  context: string;
  display_text: string | null;
  target_kind: string | null;
  target_anchor: string | null;
  source_start: number | null;
  source_end: number | null;
  source_title?: string | null;
  source_content?: string | null;
  source_line?: number | null;
  is_resolved: number | null;
  created_at: number;
}

/**
 * 笔记别名数据库行类型
 */
interface NoteAliasRow extends QueryResultRow {
  note_id: string;
  alias: string;
  alias_normalized: string;
  created_at: number;
}

/**
 * 模板数据库行类型
 */
interface TemplateRow extends QueryResultRow {
  id: string;
  name: string;
  content: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * 带别名的笔记查询结果
 */
export interface NoteWithAliases {
  note: NoteItem;
  aliases: string[];
}

/**
 * 笔记数据库服务类
 */
export class NoteDatabase {
  private db: SQLiteDatabase;
  private initialized: boolean = false;

  constructor(customPath?: string) {
    this.db = new SQLiteDatabase('note-system.db', customPath);
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();
      await this.createTables();
      this.initialized = true;
      console.log('[NoteDatabase] 数据库初始化成功');
    } catch (error) {
      console.error('[NoteDatabase] 数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    // 笔记表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        path TEXT,
        type TEXT NOT NULL DEFAULT 'normal' CHECK(type IN ('daily', 'quick', 'normal')),
        is_favorite INTEGER DEFAULT 0,
        is_pinned INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );
    `);

    // 标签表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        parent_id TEXT,
        note_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
      );
    `);

    // 笔记-标签关联表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (note_id, tag_id),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
    `);

    // 链接表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT,
        target_title TEXT NOT NULL,
        context TEXT,
        display_text TEXT,
        target_kind TEXT NOT NULL DEFAULT 'note',
        target_anchor TEXT,
        source_start INTEGER,
        source_end INTEGER,
        is_resolved INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE SET NULL
      );
    `);

    // 笔记别名表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_aliases (
        note_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        alias_normalized TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (note_id, alias_normalized),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `);

    // 模板表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // 创建索引
    await this.ensureLinkSchema(); // Ensure legacy link columns exist before indexing.
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_notes_is_favorite ON notes(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
      CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_links_source_id ON links(source_id);
      CREATE INDEX IF NOT EXISTS idx_links_target_id ON links(target_id);
      CREATE INDEX IF NOT EXISTS idx_links_target_title ON links(target_title);
      CREATE INDEX IF NOT EXISTS idx_links_target_kind ON links(target_kind);
      CREATE INDEX IF NOT EXISTS idx_links_target_anchor ON links(target_anchor);
      CREATE INDEX IF NOT EXISTS idx_links_is_resolved ON links(is_resolved);
      CREATE INDEX IF NOT EXISTS idx_note_aliases_alias_normalized ON note_aliases(alias_normalized);
    `);


    console.log('[NoteDatabase] 数据库表创建成功');
  }

  /**
   * 向旧版本 links 表补齐缺失字段
   */
  private async ensureLinkSchema(): Promise<void> {
    const columns = await this.db.query<{ name: string }>('PRAGMA table_info(links)');
    const existingColumns = new Set(columns.map(column => column.name));
    const missingColumns = [
      { name: 'display_text', sql: 'ALTER TABLE links ADD COLUMN display_text TEXT' },
      { name: 'target_kind', sql: "ALTER TABLE links ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'note'" },
      { name: 'target_anchor', sql: 'ALTER TABLE links ADD COLUMN target_anchor TEXT' },
      { name: 'source_start', sql: 'ALTER TABLE links ADD COLUMN source_start INTEGER' },
      { name: 'source_end', sql: 'ALTER TABLE links ADD COLUMN source_end INTEGER' },
      { name: 'is_resolved', sql: 'ALTER TABLE links ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 0' }
    ];

    for (const column of missingColumns) {
      if (!existingColumns.has(column.name)) {
        await this.db.exec(column.sql);
      }
    }

    await this.db.exec(`
      UPDATE links
      SET is_resolved = CASE WHEN target_id IS NOT NULL THEN 1 ELSE 0 END
    `);
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 规范化链接引用，用于标题、路径和别名匹配
   */
  private normalizeReference(value: string): string {
    return value.trim().replace(/\\/g, '/').toLowerCase();
  }

  /**
   * 从 metadata 中提取别名列表
   */
  private extractAliases(metadata?: string | null): string[] {
    if (!metadata) {
      return [];
    }

    try {
      const parsed = JSON.parse(metadata) as { aliases?: unknown };
      if (!Array.isArray(parsed.aliases)) {
        return [];
      }

      return parsed.aliases
        .filter((alias): alias is string => typeof alias === 'string')
        .map(alias => alias.trim())
        .filter(alias => alias.length > 0);
    } catch (error) {
      console.warn('[NoteDatabase] 解析笔记 metadata 中的 aliases 失败:', error);
      return [];
    }
  }

  /**
   * 同步单篇笔记的别名索引
   */
  private async replaceNoteAliases(noteId: string, aliases: string[]): Promise<void> {
    const uniqueAliases = Array.from(new Set(
      aliases
        .map(alias => alias.trim())
        .filter(alias => alias.length > 0)
    ));

    await this.db.delete('note_aliases', [
      { field: 'note_id', operator: '=', value: noteId }
    ]);

    if (uniqueAliases.length === 0) {
      return;
    }

    const createdAt = Date.now();
    await this.db.insertBatch(
      'note_aliases',
      uniqueAliases.map(alias => ({
        note_id: noteId,
        alias,
        alias_normalized: this.normalizeReference(alias),
        created_at: createdAt
      }))
    );
  }

  // ==================== 笔记 CRUD 操作 ====================

  /**
   * 创建笔记
   */
  async createNote(note: Partial<NoteItem>): Promise<NoteItem> {
    await this.ensureInitialized();

    const now = Date.now();
    const newNote: NoteItem = {
      id: note.id || uuidv4(),
      title: note.title || '无标题',
      content: note.content || '',
      path: note.path || '',
      type: note.type || 'normal',
      isFavorite: note.isFavorite || false,
      isPinned: note.isPinned || false,
      createdAt: note.createdAt || now,
      updatedAt: note.updatedAt || now,
      metadata: note.metadata
    };

    await this.db.transaction(async () => {
      await this.db.insert('notes', {
        id: newNote.id,
        title: newNote.title,
        content: newNote.content,
        path: newNote.path,
        type: newNote.type,
        is_favorite: newNote.isFavorite ? 1 : 0,
        is_pinned: newNote.isPinned ? 1 : 0,
        created_at: newNote.createdAt,
        updated_at: newNote.updatedAt,
        metadata: newNote.metadata || null
      });

      await this.replaceNoteAliases(newNote.id, this.extractAliases(newNote.metadata));
    });

    console.log('[NoteDatabase] 创建笔记成功:', newNote.id);
    return newNote;
  }

  /**
   * 更新笔记
   */
  async updateNote(id: string, updates: Partial<NoteItem>): Promise<boolean> {
    await this.ensureInitialized();

    const updateData: Record<string, unknown> = {
      updated_at: Date.now()
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.path !== undefined) updateData.path = updates.path;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite ? 1 : 0;
    if (updates.isPinned !== undefined) updateData.is_pinned = updates.isPinned ? 1 : 0;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    const conditions: UpdateCondition[] = [
      { field: 'id', operator: '=', value: id }
    ];

    const rowsAffected = await this.db.transaction(async () => {
      const affectedRows = await this.db.update('notes', updateData, conditions);
      if (affectedRows > 0 && updates.metadata !== undefined) {
        await this.replaceNoteAliases(id, this.extractAliases(updates.metadata || null));
      }
      return affectedRows;
    });

    console.log('[NoteDatabase] 更新笔记:', id, '影响行数:', rowsAffected);
    return rowsAffected > 0;
  }

  /**
   * 删除笔记
   */
  async deleteNote(id: string): Promise<boolean> {
    return this.deleteNoteWithLinkCleanup(id);
  }

  /**
   * 删除笔记并清理相关链接
   */
  async deleteNoteWithLinkCleanup(id: string): Promise<boolean> {
    await this.ensureInitialized();

    return this.db.transaction(async () => {
      await this.clearLinksByTargetId(id);
      await this.deleteLinksBySource(id);
      await this.db.delete('note_aliases', [
        { field: 'note_id', operator: '=', value: id }
      ]);

      const conditions: UpdateCondition[] = [
        { field: 'id', operator: '=', value: id }
      ];

      const rowsAffected = await this.db.delete('notes', conditions);
      console.log('[NoteDatabase] 删除笔记并清理链接:', id, '影响行数:', rowsAffected);
      return rowsAffected > 0;
    });
  }

  /**
   * 获取单个笔记
   */
  async getNote(id: string): Promise<NoteItem | null> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<NoteRow>(
      'SELECT * FROM notes WHERE id = ?',
      [id]
    );

    if (!result) return null;

    return this.mapNoteRow(result);
  }

  /**
   * 根据路径获取单个笔记
   */
  async getNoteByPath(path: string): Promise<NoteItem | null> {
    await this.ensureInitialized();

    const normalizedPath = this.normalizeReference(path);
    if (!normalizedPath) {
      return null;
    }

    const results = await this.db.query<NoteRow>(
      'SELECT * FROM notes WHERE path IS NOT NULL AND path != "" ORDER BY updated_at DESC'
    );

    const matched = results.find(row => this.normalizeReference(row.path) === normalizedPath);
    return matched ? this.mapNoteRow(matched) : null;
  }

  /**
   * 获取所有笔记
   */
  async getAllNotes(): Promise<NoteItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<NoteRow>(
      'SELECT * FROM notes ORDER BY updated_at DESC'
    );

    return results.map(row => this.mapNoteRow(row));
  }

  /**
   * 搜索笔记
   */
  async searchNotes(query: string): Promise<NoteItem[]> {
    await this.ensureInitialized();

    const searchPattern = `%${query}%`;
    const results = await this.db.query<NoteRow>(
      'SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC',
      [searchPattern, searchPattern]
    );

    return results.map(row => this.mapNoteRow(row));
  }

  /**
   * 高级搜索笔记
   * @param options 搜索选项
   */
  async searchNotesAdvanced(options: {
    query?: string;
    tagIds?: string[];
    type?: NoteType;
    startDate?: number;
    endDate?: number;
    isFavorite?: boolean;
  }): Promise<NoteItem[]> {
    await this.ensureInitialized();

    let sql = 'SELECT DISTINCT n.* FROM notes n';
    const params: unknown[] = [];
    const conditions: string[] = [];

    // 如果有标签筛选，需要 JOIN note_tags 表
    if (options.tagIds && options.tagIds.length > 0) {
      sql += ' INNER JOIN note_tags nt ON n.id = nt.note_id';
      const placeholders = options.tagIds.map(() => '?').join(', ');
      conditions.push(`nt.tag_id IN (${placeholders})`);
      params.push(...options.tagIds);
    }

    // 关键词搜索
    if (options.query && options.query.trim()) {
      const searchPattern = `%${options.query}%`;
      conditions.push('(n.title LIKE ? OR n.content LIKE ?)');
      params.push(searchPattern, searchPattern);
    }

    // 类型筛选
    if (options.type) {
      conditions.push('n.type = ?');
      params.push(options.type);
    }

    // 日期范围筛选
    if (options.startDate) {
      conditions.push('n.created_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('n.created_at <= ?');
      params.push(options.endDate);
    }

    // 收藏筛选
    if (options.isFavorite !== undefined) {
      conditions.push('n.is_favorite = ?');
      params.push(options.isFavorite ? 1 : 0);
    }

    // 组合条件
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY n.updated_at DESC';

    const results = await this.db.query<NoteRow>(sql, params);
    return results.map(row => this.mapNoteRow(row));
  }

  /**
   * 映射数据库行到 NoteItem
   */
  private mapNoteRow(row: NoteRow): NoteItem {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      path: row.path,
      type: row.type as NoteType,
      isFavorite: row.is_favorite === 1,
      isPinned: row.is_pinned === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata || undefined
    };
  }


  // ==================== 每日笔记功能 ====================

  /**
   * 获取每日笔记
   * @param date 日期字符串，格式：YYYY-MM-DD
   */
  async getDailyNote(date: string): Promise<NoteItem | null> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<NoteRow>(
      "SELECT * FROM notes WHERE type = 'daily' AND title = ?",
      [date]
    );

    if (!result) return null;

    return this.mapNoteRow(result);
  }

  /**
   * 创建每日笔记
   * @param date 日期字符串，格式：YYYY-MM-DD
   * @param template 可选的模板内容
   */
  async createDailyNote(date: string, template?: string): Promise<NoteItem> {
    await this.ensureInitialized();

    // 检查是否已存在
    const existing = await this.getDailyNote(date);
    if (existing) {
      return existing;
    }

    const defaultContent = template || `# ${date}\n\n## 今日计划\n\n- \n\n## 笔记\n\n`;

    return this.createNote({
      title: date,
      content: defaultContent,
      path: `daily/${date}.md`,
      type: 'daily'
    });
  }

  // ==================== 标签管理 ====================

  /**
   * 创建标签
   */
  async createTag(tag: Partial<TagItem>): Promise<TagItem> {
    await this.ensureInitialized();

    const now = Date.now();
    const newTag: TagItem = {
      id: tag.id || uuidv4(),
      name: tag.name || '',
      parentId: tag.parentId,
      noteCount: tag.noteCount || 0,
      createdAt: tag.createdAt || now
    };

    await this.db.insert('tags', {
      id: newTag.id,
      name: newTag.name,
      parent_id: newTag.parentId || null,
      note_count: newTag.noteCount,
      created_at: newTag.createdAt
    });

    console.log('[NoteDatabase] 创建标签成功:', newTag.name);
    return newTag;
  }

  /**
   * 更新标签
   */
  async updateTag(id: string, updates: Partial<TagItem>): Promise<boolean> {
    await this.ensureInitialized();

    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.parentId !== undefined) updateData.parent_id = updates.parentId || null;
    if (updates.noteCount !== undefined) updateData.note_count = updates.noteCount;

    if (Object.keys(updateData).length === 0) return false;

    const conditions: UpdateCondition[] = [
      { field: 'id', operator: '=', value: id }
    ];

    const rowsAffected = await this.db.update('tags', updateData, conditions);
    return rowsAffected > 0;
  }

  /**
   * 删除标签
   */
  async deleteTag(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'id', operator: '=', value: id }
    ];

    const rowsAffected = await this.db.delete('tags', conditions);
    return rowsAffected > 0;
  }

  /**
   * 获取所有标签
   */
  async getAllTags(): Promise<TagItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<TagRow>(
      'SELECT * FROM tags ORDER BY name'
    );

    return results.map(row => this.mapTagRow(row));
  }

  /**
   * 根据名称获取标签
   */
  async getTagByName(name: string): Promise<TagItem | null> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<TagRow>(
      'SELECT * FROM tags WHERE name = ?',
      [name]
    );

    if (!result) return null;

    return this.mapTagRow(result);
  }

  /**
   * 获取笔记的标签
   */
  async getTagsByNote(noteId: string): Promise<TagItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<TagRow>(
      `SELECT t.* FROM tags t
       INNER JOIN note_tags nt ON t.id = nt.tag_id
       WHERE nt.note_id = ?
       ORDER BY t.name`,
      [noteId]
    );

    return results.map(row => this.mapTagRow(row));
  }

  /**
   * 根据标签获取笔记
   */
  async getNotesByTag(tagId: string): Promise<NoteItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<NoteRow>(
      `SELECT n.* FROM notes n
       INNER JOIN note_tags nt ON n.id = nt.note_id
       WHERE nt.tag_id = ?
       ORDER BY n.updated_at DESC`,
      [tagId]
    );

    return results.map(row => this.mapNoteRow(row));
  }

  /**
   * 添加笔记标签关联
   */
  async addNoteTag(noteId: string, tagId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      await this.db.insert('note_tags', {
        note_id: noteId,
        tag_id: tagId,
        created_at: Date.now()
      });

      // 更新标签计数
      await this.db.exec(
        `UPDATE tags SET note_count = note_count + 1 WHERE id = '${tagId}'`
      );
    } catch (error) {
      // 忽略重复插入错误
      console.log('[NoteDatabase] 添加笔记标签关联:', error);
    }
  }

  /**
   * 移除笔记标签关联
   */
  async removeNoteTag(noteId: string, tagId: string): Promise<void> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'note_id', operator: '=', value: noteId },
      { field: 'tag_id', operator: '=', value: tagId }
    ];

    const rowsAffected = await this.db.delete('note_tags', conditions);

    if (rowsAffected > 0) {
      // 更新标签计数
      await this.db.exec(
        `UPDATE tags SET note_count = MAX(0, note_count - 1) WHERE id = '${tagId}'`
      );
    }
  }

  /**
   * 映射数据库行到 TagItem
   */
  private mapTagRow(row: TagRow): TagItem {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id || undefined,
      noteCount: row.note_count,
      createdAt: row.created_at
    };
  }


  // ==================== 链接管理 ====================

  /**
   * 创建链接
   */
  async createLink(link: Partial<LinkItem>): Promise<LinkItem> {
    await this.ensureInitialized();

    const now = Date.now();
    const newLink: LinkItem = {
      id: link.id || uuidv4(),
      sourceId: link.sourceId || '',
      targetId: link.targetId,
      targetTitle: link.targetTitle || '',
      context: link.context || '',
      displayText: link.displayText,
      targetKind: link.targetKind || 'note',
      targetAnchor: link.targetAnchor,
      sourceStart: link.sourceStart,
      sourceEnd: link.sourceEnd,
      isResolved: link.isResolved ?? !!link.targetId,
      createdAt: link.createdAt || now
    };

    await this.db.insert('links', {
      id: newLink.id,
      source_id: newLink.sourceId,
      target_id: newLink.targetId || null,
      target_title: newLink.targetTitle,
      context: newLink.context,
      display_text: newLink.displayText || null,
      target_kind: newLink.targetKind || 'note',
      target_anchor: newLink.targetAnchor || null,
      source_start: newLink.sourceStart ?? null,
      source_end: newLink.sourceEnd ?? null,
      is_resolved: newLink.isResolved ? 1 : 0,
      created_at: newLink.createdAt
    });

    console.log('[NoteDatabase] 创建链接成功:', newLink.id);
    return newLink;
  }

  /**
   * 删除链接
   */
  async deleteLink(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'id', operator: '=', value: id }
    ];

    const rowsAffected = await this.db.delete('links', conditions);
    return rowsAffected > 0;
  }

  /**
   * 删除笔记的所有出链
   */
  async deleteLinksBySource(sourceId: string): Promise<number> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'source_id', operator: '=', value: sourceId }
    ];

    return await this.db.delete('links', conditions);
  }

  /**
   * 清空指向指定笔记的链接目标 ID，使其退化为悬空链接
   */
  async clearLinksByTargetId(targetId: string): Promise<number> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'target_id', operator: '=', value: targetId }
    ];

    return await this.db.update('links', { target_id: null, is_resolved: 0 }, conditions);
  }

  /**
   * 获取笔记的出链
   */
  async getOutlinks(noteId: string): Promise<LinkItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<LinkRow>(
      'SELECT * FROM links WHERE source_id = ? ORDER BY created_at',
      [noteId]
    );

    return results.map(row => this.mapLinkRow(row));
  }

  /**
   * 获取笔记的反向链接
   */
  async getBacklinks(noteId: string): Promise<LinkItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<LinkRow>(
      `SELECT links.*, notes.title as source_title, notes.content as source_content
       FROM links
       LEFT JOIN notes ON notes.id = links.source_id
       WHERE links.target_id = ?
       ORDER BY links.created_at`,
      [noteId]
    );

    return results.map(row => this.mapLinkRow(row));
  }

  /**
   * 根据标题获取反向链接
   */
  async getBacklinksByTitle(title: string): Promise<LinkItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<LinkRow>(
      `SELECT links.*, notes.title as source_title, notes.content as source_content
       FROM links
       LEFT JOIN notes ON notes.id = links.source_id
       WHERE links.target_title = ?
       ORDER BY links.created_at`,
      [title]
    );

    return results.map(row => this.mapLinkRow(row));
  }

  /**
   * 获取所有链接
   */
  async getAllLinks(): Promise<LinkItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<LinkRow>(
      'SELECT * FROM links ORDER BY created_at'
    );

    return results.map(row => this.mapLinkRow(row));
  }

  /**
   * 替换笔记的全部出链
   */
  async replaceLinksBySource(
    sourceId: string,
    links: Array<Pick<LinkItem, 'targetId' | 'targetTitle' | 'context' | 'displayText' | 'targetKind' | 'targetAnchor' | 'sourceStart' | 'sourceEnd' | 'isResolved'>>
  ): Promise<LinkItem[]> {
    await this.ensureInitialized();

    return this.db.transaction(async () => {
      await this.deleteLinksBySource(sourceId);

      if (links.length === 0) {
        return [];
      }

      const createdAt = Date.now();
      const newLinks: LinkItem[] = links.map((link, index) => ({
        id: uuidv4(),
        sourceId,
        targetId: link.targetId,
        targetTitle: link.targetTitle,
        context: link.context,
        displayText: link.displayText,
        targetKind: link.targetKind || 'note',
        targetAnchor: link.targetAnchor,
        sourceStart: link.sourceStart,
        sourceEnd: link.sourceEnd,
        isResolved: link.isResolved ?? !!link.targetId,
        createdAt: createdAt + index
      }));

      await this.db.insertBatch(
        'links',
        newLinks.map(link => ({
          id: link.id,
          source_id: link.sourceId,
          target_id: link.targetId || null,
          target_title: link.targetTitle,
          context: link.context,
          display_text: link.displayText || null,
          target_kind: link.targetKind || 'note',
          target_anchor: link.targetAnchor || null,
          source_start: link.sourceStart ?? null,
          source_end: link.sourceEnd ?? null,
          is_resolved: link.isResolved ? 1 : 0,
          created_at: link.createdAt
        }))
      );

      console.log('[NoteDatabase] 替换笔记出链成功:', sourceId, '链接数:', newLinks.length);
      return newLinks;
    });
  }

  /**
   * 更新链接的目标 ID
   */
  async updateLinkTargetId(targetTitle: string, targetId: string): Promise<number> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'target_title', operator: '=', value: targetTitle }
    ];

    const result = await this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM links WHERE target_title = ?',
      [targetTitle]
    );

    await this.db.update('links', { target_id: targetId, is_resolved: 1 }, conditions);
    return result?.count || 0;
  }

  /**
   * 映射数据库行到 LinkItem
   */
  private mapLinkRow(row: LinkRow): LinkItem {
    const sourceContent = row.source_content || '';
    const sourceStart = row.source_start ?? undefined;
    const sourceLine = sourceStart !== undefined
      ? sourceContent.slice(0, sourceStart).split('\n').length
      : undefined;

    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id || undefined,
      targetTitle: row.target_title,
      context: row.context,
      displayText: row.display_text || undefined,
      targetKind: (row.target_kind as LinkItem['targetKind']) || 'note',
      targetAnchor: row.target_anchor || undefined,
      sourceStart,
      sourceEnd: row.source_end ?? undefined,
      sourceNoteTitle: row.source_title || undefined,
      sourceLine,
      isResolved: row.is_resolved === 1,
      createdAt: row.created_at
    };
  }

  // ==================== 模板管理 ====================

  /**
   * 创建模板
   */
  async createTemplate(template: Partial<TemplateItem>): Promise<TemplateItem> {
    await this.ensureInitialized();

    const now = Date.now();
    const newTemplate: TemplateItem = {
      id: template.id || uuidv4(),
      name: template.name || '未命名模板',
      content: template.content || '',
      description: template.description,
      createdAt: template.createdAt || now,
      updatedAt: template.updatedAt || now
    };

    await this.db.insert('templates', {
      id: newTemplate.id,
      name: newTemplate.name,
      content: newTemplate.content,
      description: newTemplate.description || null,
      created_at: newTemplate.createdAt,
      updated_at: newTemplate.updatedAt
    });

    console.log('[NoteDatabase] 创建模板成功:', newTemplate.name);
    return newTemplate;
  }

  /**
   * 更新模板
   */
  async updateTemplate(id: string, updates: Partial<TemplateItem>): Promise<boolean> {
    await this.ensureInitialized();

    const updateData: Record<string, unknown> = {
      updated_at: Date.now()
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.description !== undefined) updateData.description = updates.description;

    const conditions: UpdateCondition[] = [
      { field: 'id', operator: '=', value: id }
    ];

    const rowsAffected = await this.db.update('templates', updateData, conditions);
    return rowsAffected > 0;
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const conditions: UpdateCondition[] = [
      { field: 'id', operator: '=', value: id }
    ];

    const rowsAffected = await this.db.delete('templates', conditions);
    return rowsAffected > 0;
  }

  /**
   * 获取所有模板
   */
  async getAllTemplates(): Promise<TemplateItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<TemplateRow>(
      'SELECT * FROM templates ORDER BY name'
    );

    return results.map(row => this.mapTemplateRow(row));
  }

  /**
   * 获取单个模板
   */
  async getTemplate(id: string): Promise<TemplateItem | null> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<TemplateRow>(
      'SELECT * FROM templates WHERE id = ?',
      [id]
    );

    if (!result) return null;

    return this.mapTemplateRow(result);
  }

  /**
   * 映射数据库行到 TemplateItem
   */
  private mapTemplateRow(row: TemplateRow): TemplateItem {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      description: row.description || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ==================== 收藏管理 ====================

  /**
   * 获取收藏的笔记
   */
  async getFavorites(): Promise<NoteItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<NoteRow>(
      'SELECT * FROM notes WHERE is_favorite = 1 ORDER BY updated_at DESC'
    );

    return results.map(row => this.mapNoteRow(row));
  }

  /**
   * 切换收藏状态
   */
  async toggleFavorite(noteId: string): Promise<boolean> {
    await this.ensureInitialized();

    const note = await this.getNote(noteId);
    if (!note) return false;

    const newFavoriteStatus = !note.isFavorite;
    await this.updateNote(noteId, { isFavorite: newFavoriteStatus });

    return newFavoriteStatus;
  }

  // ==================== 工具方法 ====================

  /**
   * 根据标题查找笔记
   */
  async getNoteByTitle(title: string): Promise<NoteItem | null> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<NoteRow>(
      'SELECT * FROM notes WHERE title = ?',
      [title]
    );

    if (!result) return null;

    return this.mapNoteRow(result);
  }

  /**
   * 批量根据标题查询笔记
   */
  async getNotesByTitles(titles: string[]): Promise<NoteItem[]> {
    await this.ensureInitialized();

    if (titles.length === 0) {
      return [];
    }

    const placeholders = titles.map(() => '?').join(', ');
    const results = await this.db.query<NoteRow>(
      `SELECT * FROM notes WHERE title IN (${placeholders}) ORDER BY updated_at DESC`,
      titles
    );

    return results.map(row => this.mapNoteRow(row));
  }

  /**
   * 获取笔记的别名列表
   */
  async getNoteAliases(noteId: string): Promise<string[]> {
    await this.ensureInitialized();

    const results = await this.db.query<NoteAliasRow>(
      'SELECT * FROM note_aliases WHERE note_id = ? ORDER BY alias',
      [noteId]
    );

    return results.map(row => row.alias);
  }

  /**
   * 获取全部笔记及其别名
   */
  async getAllNotesWithAliases(): Promise<NoteWithAliases[]> {
    await this.ensureInitialized();

    const notes = await this.getAllNotes();
    const aliasRows = await this.db.query<NoteAliasRow>(
      'SELECT * FROM note_aliases ORDER BY created_at'
    );

    const aliasesByNoteId = new Map<string, string[]>();
    for (const row of aliasRows) {
      const currentAliases = aliasesByNoteId.get(row.note_id) || [];
      currentAliases.push(row.alias);
      aliasesByNoteId.set(row.note_id, currentAliases);
    }

    return notes.map(note => ({
      note,
      aliases: aliasesByNoteId.get(note.id) || []
    }));
  }

  /**
   * 获取全部未解析链接
   */
  async getDanglingLinks(): Promise<LinkItem[]> {
    await this.ensureInitialized();

    const results = await this.db.query<LinkRow>(
      'SELECT * FROM links WHERE target_id IS NULL OR is_resolved = 0 ORDER BY created_at'
    );

    return results.map(row => this.mapLinkRow(row));
  }

  /**
   * 根据 ID 更新单条链接
   */
  async updateLink(id: string, updates: Partial<LinkItem>): Promise<boolean> {
    await this.ensureInitialized();

    const updateData: Record<string, unknown> = {};
    if (updates.targetId !== undefined) updateData.target_id = updates.targetId || null;
    if (updates.targetTitle !== undefined) updateData.target_title = updates.targetTitle;
    if (updates.context !== undefined) updateData.context = updates.context;
    if (updates.displayText !== undefined) updateData.display_text = updates.displayText || null;
    if (updates.targetKind !== undefined) updateData.target_kind = updates.targetKind;
    if (updates.targetAnchor !== undefined) updateData.target_anchor = updates.targetAnchor || null;
    if (updates.sourceStart !== undefined) updateData.source_start = updates.sourceStart;
    if (updates.sourceEnd !== undefined) updateData.source_end = updates.sourceEnd;
    if (updates.isResolved !== undefined) updateData.is_resolved = updates.isResolved ? 1 : 0;

    if (Object.keys(updateData).length === 0) {
      return false;
    }

    const rowsAffected = await this.db.update('links', updateData, [
      { field: 'id', operator: '=', value: id }
    ]);

    return rowsAffected > 0;
  }

  /**
   * 获取笔记数量
   */
  async getNoteCount(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM notes'
    );

    return result?.count || 0;
  }

  /**
   * 获取标签数量
   */
  async getTagCount(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM tags'
    );

    return result?.count || 0;
  }

  /**
   * 获取链接数量
   */
  async getLinkCount(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM links'
    );

    return result?.count || 0;
  }

  async getTagNamesByNoteIds(noteIds: readonly string[]): Promise<Record<string, string[]>> {
    await this.ensureInitialized();

    if (noteIds.length === 0) {
      return {};
    }

    const placeholders = noteIds.map(() => '?').join(', ');
    const results = await this.db.query<NoteTagNameRow>(
      `SELECT nt.note_id, t.name AS tag_name
       FROM note_tags nt
       INNER JOIN tags t ON t.id = nt.tag_id
       WHERE nt.note_id IN (${placeholders})
       ORDER BY t.name`,
      [...noteIds]
    );

    const noteTagNameMap: Record<string, string[]> = {};
    for (const result of results) {
      if (!noteTagNameMap[result.note_id]) {
        noteTagNameMap[result.note_id] = [];
      }

      noteTagNameMap[result.note_id].push(result.tag_name);
    }

    return noteTagNameMap;
  }
}

// 导出单例实例
export const noteDatabase = new NoteDatabase();
