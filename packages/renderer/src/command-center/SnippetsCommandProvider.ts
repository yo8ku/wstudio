/**
 * 常用片段命令提供者
 * 功能：提供片段管理的命令面板
 * 描述：显示所有片段列表，支持搜索、新建、编辑和插入片段
 */

import { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { CommandMode, CommandItem } from './CommandTypes';
import { snippetService } from '../services/SnippetService';
import type { Snippet as DBSnippet } from '@note-studio/shared';

interface Snippet {
  id: string;
  name: string;
  content: string;
  description?: string;
  language?: string;
  tags?: string[];
}

export class SnippetsCommandProvider {
  private commandCenter: VSCodeCommandCenter;
  private snippets: Snippet[] = [];

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerMode();
  }

  private registerMode(): void {
    // 注册片段选择模式
    const snippetsMode: CommandMode = {
      prefix: 'snippet:',
      name: '常用片段',
      placeholder: '输入片段名称搜索或新建...',
      icon: '',
      hidePrefix: true, // 不显示前缀
      provider: async (query: string) => {
        await this.loadSnippets();
        
        const items: CommandItem[] = [];
        
        // 如果有搜索词，显示新建片段选项
        if (query && query.trim()) {
          items.push({
            id: 'create-snippet',
            label: `新建片段: ${query}`,
            description: '创建一个新的代码片段',
            icon: 'add',
            value: {
              action: 'create',
              name: query.trim()
            }
          });
        }

        // 如果没有片段，显示提示信息
        if (this.snippets.length === 0 && !query) {
          items.push({
            id: 'no-snippets',
            label: '暂无常用片段',
            description: '输入名称创建第一个片段',
            icon: 'info',
            value: null
          });
          return items;
        }

        // 过滤片段列表
        const filteredSnippets = this.snippets.filter(snippet => {
          if (!query) return true;
          const searchText = query.toLowerCase();
          return (
            snippet.name.toLowerCase().includes(searchText) ||
            snippet.description?.toLowerCase().includes(searchText) ||
            snippet.tags?.some(tag => tag.toLowerCase().includes(searchText))
          );
        });

        // 添加片段
        filteredSnippets.forEach(snippet => {
          items.push({
            id: `snippet-${snippet.id}`,
            label: snippet.name,
            description: snippet.description || snippet.content.substring(0, 50) + '...',
            icon: 'file',
            value: {
              action: 'select',
              snippet
            }
          });
        });

        // 如果没有匹配结果，提示创建
        if (filteredSnippets.length === 0 && query) {
          items.push({
            id: 'no-results',
            label: `没有找到匹配的片段`,
            description: '点击上方"新建片段"创建',
            icon: '',
            value: null
          });
        }

        return items;
      }
    };

    this.commandCenter.registerMode(snippetsMode);
  }

  /**
   * 加载所有片段（从数据库）
   */
  private async loadSnippets(): Promise<void> {
    try {
      const dbSnippets = await snippetService.getAllSnippets();
      
      // 转换数据库格式到显示格式
      this.snippets = dbSnippets.map(snippet => ({
        id: snippet.id?.toString() || '',
        name: snippet.name,           // 使用 name 字段作为显示名称
        content: snippet.body,
        description: snippet.description,
        language: snippet.language,
        tags: snippet.tags ? snippet.tags.split(',') : undefined
      }));
    } catch (error) {
      console.error('[SnippetsCommandProvider] 加载片段失败:', error);
      this.snippets = [];
    }
  }

  /**
   * 显示片段选择器
   */
  public static async showSnippetSelector(): Promise<void> {
    const commandCenter = (window as any).__commandCenter;
    if (!commandCenter) {
      console.error('[SnippetsCommandProvider] 命令中心未初始化');
      return;
    }

    try {
      await commandCenter.show('snippet:');
      
      // 监听命令执行（选择片段后的操作）
      const handleCommandExecute = (event: Event) => {
        const customEvent = event as CustomEvent;
        const item = customEvent.detail;
        
        console.log('[SnippetsCommandProvider] 命令执行:', {
          label: item.label,
          icon: item.icon,
          value: item.value
        });
        
        if (!item.value) {
          window.removeEventListener('command-executed', handleCommandExecute);
          return;
        }

        const { action, snippet, name } = item.value;
        
        if (action === 'create') {
          // 创建新片段
          console.log('[SnippetsCommandProvider] 执行操作: 创建新片段 -', name);
          SnippetsCommandProvider.createSnippet(name);
        } else if (action === 'select') {
          // 插入片段
          console.log('[SnippetsCommandProvider] 执行操作: 插入片段 -', snippet?.name);
          SnippetsCommandProvider.insertSnippet(snippet);
        }
        
        // 移除监听
        window.removeEventListener('command-executed', handleCommandExecute);
      };
      
      window.addEventListener('command-executed', handleCommandExecute);
    } catch (error) {
      console.error('[SnippetsCommandProvider] 显示片段选择器失败', error);
    }
  }

  /**
   * 创建新片段（打开编辑器）
   */
  private static createSnippet(name: string): void {
    window.dispatchEvent(new CustomEvent('create-snippet', {
      detail: { name }
    }));
  }

  /**
   * 插入片段到编辑器
   */
  private static insertSnippet(snippet: Snippet): void {
    window.dispatchEvent(new CustomEvent('insert-snippet', {
      detail: { snippet }
    }));
  }
}

