/**
 * Agent 记忆管理器
 * 功能：管理 Agent 的对话历史和上下文记忆
 * 描述：提供记忆存储、检索、压缩和持久化功能
 */

import {
  AgentMemoryEntry,
  AgentMemoryConfig,
  ToolResult
} from './types';
import type { ChatMessage } from '../../types/aiProvider';

/**
 * 默认记忆配置
 */
const DEFAULT_MEMORY_CONFIG: Required<AgentMemoryConfig> = {
  maxEntries: 100,
  maxTokens: 8000,
  enablePersistence: false,
  storageKey: 'agent_memory'
};

/**
 * 简单的 Token 估算函数
 * 粗略估算：中文约 2 字符/token，英文约 4 字符/token
 */
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 2 + otherChars / 4);
}

/**
 * Agent 记忆管理器类
 */
export class AgentMemory {
  /** 记忆条目列表 */
  private entries: AgentMemoryEntry[] = [];

  /** 配置 */
  private config: Required<AgentMemoryConfig>;

  /** 当前 Token 计数 */
  private currentTokenCount: number = 0;

  constructor(config?: AgentMemoryConfig) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };

    // 如果启用持久化，尝试加载已保存的记忆
    if (this.config.enablePersistence) {
      this.loadFromStorage();
    }
  }

  /**
   * 添加记忆条目
   */
  add(entry: Omit<AgentMemoryEntry, 'id' | 'timestamp'>): AgentMemoryEntry {
    const newEntry: AgentMemoryEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: Date.now()
    };

    // 估算新条目的 Token 数
    const entryTokens = estimateTokens(newEntry.content);

    // 检查是否需要压缩记忆
    if (this.currentTokenCount + entryTokens > this.config.maxTokens) {
      this.compress();
    }

    // 检查是否超过最大条目数
    if (this.entries.length >= this.config.maxEntries) {
      this.removeOldestEntries(1);
    }

    this.entries.push(newEntry);
    this.currentTokenCount += entryTokens;

    // 持久化
    if (this.config.enablePersistence) {
      this.saveToStorage();
    }

    return newEntry;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content: string, taskId?: string): AgentMemoryEntry {
    return this.add({
      role: 'user',
      content,
      taskId
    });
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(content: string, taskId?: string, stepId?: string): AgentMemoryEntry {
    return this.add({
      role: 'assistant',
      content,
      taskId,
      stepId
    });
  }

  /**
   * 添加系统消息
   */
  addSystemMessage(content: string): AgentMemoryEntry {
    return this.add({
      role: 'system',
      content
    });
  }

  /**
   * 添加工具调用结果
   */
  addToolResult(
    toolName: string,
    result: ToolResult,
    taskId?: string,
    stepId?: string
  ): AgentMemoryEntry {
    const content = result.success
      ? `工具 ${toolName} 执行成功: ${JSON.stringify(result.data)}`
      : `工具 ${toolName} 执行失败: ${result.error}`;

    return this.add({
      role: 'tool',
      content,
      taskId,
      stepId,
      toolCall: {
        name: toolName,
        result
      }
    });
  }

  /**
   * 获取所有记忆条目
   */
  getAll(): AgentMemoryEntry[] {
    return [...this.entries];
  }

  /**
   * 获取指定任务的记忆条目
   */
  getByTaskId(taskId: string): AgentMemoryEntry[] {
    return this.entries.filter(entry => entry.taskId === taskId);
  }

  /**
   * 获取最近的 N 条记忆
   */
  getRecent(count: number): AgentMemoryEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * 转换为 ChatMessage 格式（用于 AI 调用）
   */
  toChatMessages(options?: {
    includeSystem?: boolean;
    maxMessages?: number;
    taskId?: string;
  }): ChatMessage[] {
    const { includeSystem = true, maxMessages, taskId } = options || {};

    let filteredEntries = this.entries;

    // 按任务 ID 过滤
    if (taskId) {
      filteredEntries = filteredEntries.filter(
        entry => entry.taskId === taskId || entry.role === 'system'
      );
    }

    // 过滤系统消息
    if (!includeSystem) {
      filteredEntries = filteredEntries.filter(entry => entry.role !== 'system');
    }

    // 限制消息数量
    if (maxMessages && filteredEntries.length > maxMessages) {
      // 保留系统消息和最近的消息
      const systemMessages = filteredEntries.filter(e => e.role === 'system');
      const nonSystemMessages = filteredEntries.filter(e => e.role !== 'system');
      const recentMessages = nonSystemMessages.slice(-(maxMessages - systemMessages.length));
      filteredEntries = [...systemMessages, ...recentMessages];
    }

    // 转换为 ChatMessage 格式
    return filteredEntries.map(entry => ({
      role: entry.role === 'tool' ? 'assistant' : entry.role,
      content: entry.content
    }));
  }

  /**
   * 压缩记忆（移除旧的非关键条目）
   */
  compress(): void {
    console.log('[AgentMemory] 开始压缩记忆...');

    // 保留系统消息
    const systemEntries = this.entries.filter(e => e.role === 'system');

    // 保留最近的消息
    const nonSystemEntries = this.entries.filter(e => e.role !== 'system');
    const keepCount = Math.floor(nonSystemEntries.length * 0.6); // 保留 60%
    const recentEntries = nonSystemEntries.slice(-keepCount);

    this.entries = [...systemEntries, ...recentEntries];

    // 重新计算 Token 数
    this.recalculateTokenCount();

    console.log(`[AgentMemory] 压缩完成，剩余 ${this.entries.length} 条记忆`);

    // 持久化
    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * 移除最旧的 N 条非系统消息
   */
  private removeOldestEntries(count: number): void {
    let removed = 0;
    const newEntries: AgentMemoryEntry[] = [];

    for (const entry of this.entries) {
      if (entry.role === 'system' || removed >= count) {
        newEntries.push(entry);
      } else {
        removed++;
        this.currentTokenCount -= estimateTokens(entry.content);
      }
    }

    this.entries = newEntries;
  }

  /**
   * 重新计算 Token 数
   */
  private recalculateTokenCount(): void {
    this.currentTokenCount = this.entries.reduce(
      (sum, entry) => sum + estimateTokens(entry.content),
      0
    );
  }

  /**
   * 清空记忆
   */
  clear(): void {
    this.entries = [];
    this.currentTokenCount = 0;

    if (this.config.enablePersistence) {
      this.clearStorage();
    }

    console.log('[AgentMemory] 记忆已清空');
  }

  /**
   * 清空指定任务的记忆
   */
  clearByTaskId(taskId: string): void {
    const beforeCount = this.entries.length;
    this.entries = this.entries.filter(entry => entry.taskId !== taskId);
    this.recalculateTokenCount();

    console.log(
      `[AgentMemory] 已清除任务 ${taskId} 的记忆，移除 ${beforeCount - this.entries.length} 条`
    );

    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * 获取记忆统计信息
   */
  getStats(): {
    totalEntries: number;
    tokenCount: number;
    maxTokens: number;
    usagePercentage: number;
    entriesByRole: Record<string, number>;
  } {
    const entriesByRole: Record<string, number> = {};
    for (const entry of this.entries) {
      entriesByRole[entry.role] = (entriesByRole[entry.role] || 0) + 1;
    }

    return {
      totalEntries: this.entries.length,
      tokenCount: this.currentTokenCount,
      maxTokens: this.config.maxTokens,
      usagePercentage: Math.round((this.currentTokenCount / this.config.maxTokens) * 100),
      entriesByRole
    };
  }

  /**
   * 搜索记忆（简单的关键词匹配）
   */
  search(keyword: string): AgentMemoryEntry[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.entries.filter(entry =>
      entry.content.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 保存到存储
   */
  private saveToStorage(): void {
    try {
      const data = JSON.stringify({
        entries: this.entries,
        tokenCount: this.currentTokenCount
      });
      localStorage.setItem(this.config.storageKey, data);
    } catch (error) {
      console.error('[AgentMemory] 保存到存储失败:', error);
    }
  }

  /**
   * 从存储加载
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.config.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.entries = parsed.entries || [];
        this.currentTokenCount = parsed.tokenCount || 0;
        console.log(`[AgentMemory] 从存储加载了 ${this.entries.length} 条记忆`);
      }
    } catch (error) {
      console.error('[AgentMemory] 从存储加载失败:', error);
    }
  }

  /**
   * 清除存储
   */
  private clearStorage(): void {
    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.error('[AgentMemory] 清除存储失败:', error);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentMemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 导出记忆（用于调试或备份）
   */
  export(): string {
    return JSON.stringify({
      entries: this.entries,
      config: this.config,
      stats: this.getStats()
    }, null, 2);
  }

  /**
   * 导入记忆
   */
  import(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      if (parsed.entries && Array.isArray(parsed.entries)) {
        this.entries = parsed.entries;
        this.recalculateTokenCount();
        console.log(`[AgentMemory] 导入了 ${this.entries.length} 条记忆`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[AgentMemory] 导入记忆失败:', error);
      return false;
    }
  }
}

/** 导出默认实例 */
export const agentMemory = new AgentMemory();
