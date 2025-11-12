/**
 * migrateSnippets.ts
 * 将 snippets.json 中的片段迁移到 SQLite 数据库
 */

import { snippetService } from '../services/SnippetService';
import type { Snippet } from '@note-studio/shared';

/**
 * 迁移旧的 JSON 格式片段到数据库
 */
export async function migrateSnippetsFromJSON(): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    // 读取现有的 snippets.json
    const configContent = await window.electronAPI?.readSnippetsConfig?.();
    
    if (!configContent) {
      console.log('[migrateSnippets] 没有找到 snippets.json，跳过迁移');
      return { success: true, count: 0 };
    }
    
    // 解析 JSON
    const config = JSON.parse(configContent);
    const oldSnippets = config.snippets || [];
    
    if (oldSnippets.length === 0) {
      console.log('[migrateSnippets] snippets.json 中没有片段，跳过迁移');
      return { success: true, count: 0 };
    }
    
    console.log(`[migrateSnippets] 找到 ${oldSnippets.length} 个片段，开始迁移...`);
    
    // 转换格式并批量导入
    const snippetsToImport: Snippet[] = oldSnippets.map((oldSnippet: any) => {
      const snippetName = oldSnippet.name || oldSnippet.prefix || 'unnamed';
      return {
        name: snippetName,                                    // 片段名称
        prefix: oldSnippet.prefix || snippetName,            // 触发前缀
        body: oldSnippet.content || oldSnippet.body || '',
        description: oldSnippet.description,
        language: oldSnippet.language,
        tags: oldSnippet.tags && Array.isArray(oldSnippet.tags) 
          ? oldSnippet.tags.join(',') 
          : undefined
      };
    });
    
    // 导入到数据库
    const count = await snippetService.importSnippets(snippetsToImport);
    
    console.log(`[migrateSnippets] 成功迁移 ${count} 个片段到数据库`);
    
    return {
      success: true,
      count
    };
  } catch (error: any) {
    console.error('[migrateSnippets] 迁移失败:', error);
    return {
      success: false,
      count: 0,
      error: error.message
    };
  }
}

/**
 * 检查是否需要迁移
 * 如果数据库为空但 JSON 文件中有数据，则需要迁移
 */
export async function shouldMigrateSnippets(): Promise<boolean> {
  try {
    // 检查数据库中的片段数量
    const dbSnippets = await snippetService.getAllSnippets(1);
    
    // 如果数据库中已经有片段，不需要迁移
    if (dbSnippets.length > 0) {
      return false;
    }
    
    // 检查 JSON 文件
    const configContent = await window.electronAPI?.readSnippetsConfig?.();
    if (!configContent) {
      return false;
    }
    
    const config = JSON.parse(configContent);
    const oldSnippets = config.snippets || [];
    
    // 如果 JSON 中有片段，需要迁移
    return oldSnippets.length > 0;
  } catch (error) {
    console.error('[shouldMigrateSnippets] 检查迁移状态失败', error);
    return false;
  }
}

