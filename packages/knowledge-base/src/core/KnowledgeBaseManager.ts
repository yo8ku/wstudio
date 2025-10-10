/**
 * 知识库管理器
 */

import { EventEmitter } from 'events';
import { KnowledgeBase } from './KnowledgeBase';
import { KnowledgeBaseConfig } from './types';

export class KnowledgeBaseManager extends EventEmitter {
  private static instance: KnowledgeBaseManager;
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private configs: Map<string, KnowledgeBaseConfig> = new Map();

  private constructor() {
    super();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): KnowledgeBaseManager {
    if (!KnowledgeBaseManager.instance) {
      KnowledgeBaseManager.instance = new KnowledgeBaseManager();
    }
    return KnowledgeBaseManager.instance;
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(
    config: KnowledgeBaseConfig
  ): Promise<KnowledgeBase> {
    if (this.knowledgeBases.has(config.id)) {
      throw new Error(`Knowledge base with id ${config.id} already exists`);
    }

    const kb = new KnowledgeBase(config);
    await kb.initialize();

    this.knowledgeBases.set(config.id, kb);
    this.configs.set(config.id, config);

    this.emit('knowledge-base-created', kb);

    return kb;
  }

  /**
   * 获取知识库
   */
  getKnowledgeBase(id: string): KnowledgeBase | undefined {
    return this.knowledgeBases.get(id);
  }

  /**
   * 列出所有知识库
   */
  listKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values());
  }

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(id: string): Promise<void> {
    const kb = this.knowledgeBases.get(id);
    if (!kb) {
      throw new Error(`Knowledge base with id ${id} not found`);
    }

    await kb.destroy();
    this.knowledgeBases.delete(id);
    this.configs.delete(id);

    this.emit('knowledge-base-deleted', id);
  }

  /**
   * 更新知识库配置
   */
  async updateKnowledgeBaseConfig(
    id: string,
    updates: Partial<KnowledgeBaseConfig>
  ): Promise<KnowledgeBase> {
    const kb = this.knowledgeBases.get(id);
    if (!kb) {
      throw new Error(`Knowledge base with id ${id} not found`);
    }

    const config = this.configs.get(id);
    if (!config) {
      throw new Error(`Config for knowledge base ${id} not found`);
    }

    const newConfig = { ...config, ...updates };
    
    // 重新创建知识库
    await kb.destroy();
    this.knowledgeBases.delete(id);
    
    const newKb = await this.createKnowledgeBase(newConfig);
    
    this.emit('knowledge-base-updated', newKb);
    
    return newKb;
  }

  /**
   * 获取知识库配置
   */
  getKnowledgeBaseConfig(id: string): KnowledgeBaseConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * 检查知识库是否存在
   */
  hasKnowledgeBase(id: string): boolean {
    return this.knowledgeBases.has(id);
  }

  /**
   * 获取知识库数量
   */
  getCount(): number {
    return this.knowledgeBases.size;
  }

  /**
   * 销毁所有知识库
   */
  async destroyAll(): Promise<void> {
    const promises = Array.from(this.knowledgeBases.values()).map((kb) =>
      kb.destroy()
    );
    await Promise.all(promises);

    this.knowledgeBases.clear();
    this.configs.clear();

    this.emit('all-destroyed');
  }
}




















