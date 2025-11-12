/**
 * SnippetService.ts
 * 渲染进程的片段服务，封装与主进程的 IPC 通信
 */

import type { Snippet, SnippetQuery, SnippetAPIResponse } from '@note-studio/shared';

/**
 * 片段服务类
 * 提供片段的 CRUD 操作，所有操作通过 IPC 与主进程通信
 */
class SnippetService {
  private initialized = false;

  /**
   * 确保 electron API 可用
   */
  private ensureElectronAPI() {
    if (!window.electron?.snippet) {
      throw new Error('[SnippetService] Electron API not available');
    }
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse = await window.electron!.snippet!.initialize();
      this.initialized = result.success;
      return result.success;
    } catch (error) {
      console.error('[SnippetService] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * 添加片段
   */
  async addSnippet(snippet: Snippet): Promise<number | null> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<number> = await window.electron!.snippet!.add(snippet);
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('[SnippetService] Failed to add snippet:', error);
      return null;
    }
  }

  /**
   * 更新片段
   */
  async updateSnippet(id: number, snippet: Partial<Snippet>): Promise<boolean> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<boolean> = await window.electron!.snippet!.update(id, snippet);
      return result.success && result.data === true;
    } catch (error) {
      console.error('[SnippetService] Failed to update snippet:', error);
      return false;
    }
  }

  /**
   * 删除片段
   */
  async deleteSnippet(id: number): Promise<boolean> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<boolean> = await window.electron!.snippet!.delete(id);
      return result.success && result.data === true;
    } catch (error) {
      console.error('[SnippetService] Failed to delete snippet:', error);
      return false;
    }
  }

  /**
   * 获取单个片段
   */
  async getSnippet(id: number): Promise<Snippet | null> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<Snippet> = await window.electron!.snippet!.get(id);
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('[SnippetService] Failed to get snippet:', error);
      return null;
    }
  }

  /**
   * 查询片段
   */
  async querySnippets(query: SnippetQuery = {}): Promise<Snippet[]> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<Snippet[]> = await window.electron!.snippet!.query(query);
      return result.success && result.data ? result.data : [];
    } catch (error) {
      console.error('[SnippetService] Failed to query snippets:', error);
      return [];
    }
  }

  /**
   * 获取所有片段
   */
  async getAllSnippets(limit?: number): Promise<Snippet[]> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<Snippet[]> = await window.electron!.snippet!.getAll(limit);
      return result.success && result.data ? result.data : [];
    } catch (error) {
      console.error('[SnippetService] Failed to get all snippets:', error);
      return [];
    }
  }

  /**
   * 批量导入片段
   */
  async importSnippets(snippets: Snippet[]): Promise<number> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse<number> = await window.electron!.snippet!.import(snippets);
      return result.success && result.data ? result.data : 0;
    } catch (error) {
      console.error('[SnippetService] Failed to import snippets:', error);
      return 0;
    }
  }

  /**
   * 清空所有片段
   */
  async clearAll(): Promise<boolean> {
    await this.ensureInitialized();

    try {
      this.ensureElectronAPI();
      const result: SnippetAPIResponse = await window.electron!.snippet!.clearAll();
      return result.success;
    } catch (error) {
      console.error('[SnippetService] Failed to clear snippets:', error);
      return false;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// 单例模式
export const snippetService = new SnippetService();

