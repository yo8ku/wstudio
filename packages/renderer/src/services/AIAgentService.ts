/**
 * AI 智能体服务
 * 功能：管理用户创建的 AI 智能体
 * 描述：使用 electron-store 存储智能体数据
 */

import { electronStore } from './ElectronStoreService';

export interface AIAgent {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
  knowledgeBaseIds: string[];
  category?: string;  // 分类：'my' | 'featured' | 'profession' 等
  createdAt: number;
  updatedAt: number;
}

class AIAgentService {
  private static instance: AIAgentService;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): AIAgentService {
    if (!AIAgentService.instance) {
      AIAgentService.instance = new AIAgentService();
    }
    return AIAgentService.instance;
  }

  /**
   * 获取所有智能体
   */
  public async getAllAgents(): Promise<AIAgent[]> {
    try {
      const agents = await electronStore.get('ai-agents');
      return agents || [];
    } catch (error) {
      console.error('[AIAgentService] 获取智能体列表失败:', error);
      return [];
    }
  }

  /**
   * 获取"我的"智能体（用户创建的智能体）
   */
  public async getMyAgents(): Promise<AIAgent[]> {
    try {
      const agents = await this.getAllAgents();
      // 系统预设分类列表
      const systemCategories = ['featured', 'profession', 'creative', 'business'];
      // 过滤出用户创建的智能体（非系统预设分类）
      return agents.filter(agent => 
        !agent.category || 
        agent.category === 'my' || 
        !systemCategories.includes(agent.category)
      );
    } catch (error) {
      console.error('[AIAgentService] 获取我的智能体失败:', error);
      return [];
    }
  }

  /**
   * 根据分类获取智能体
   */
  public async getAgentsByCategory(category: string): Promise<AIAgent[]> {
    try {
      const agents = await this.getAllAgents();
      return agents.filter(agent => agent.category === category);
    } catch (error) {
      console.error('[AIAgentService] 获取分类智能体失败:', error);
      return [];
    }
  }

  /**
   * 创建智能体
   */
  public async createAgent(agentData: Omit<AIAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIAgent | null> {
    try {
      const agents = await this.getAllAgents();
      
      const newAgent: AIAgent = {
        ...agentData,
        id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: agentData.category || 'my',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      agents.push(newAgent);
      
      const success = await electronStore.set('ai-agents', agents);
      if (success) {
        console.log('[AIAgentService] 智能体创建成功:', newAgent.id);
        return newAgent;
      } else {
        console.error('[AIAgentService] 智能体创建失败：保存失败');
        return null;
      }
    } catch (error) {
      console.error('[AIAgentService] 创建智能体失败:', error);
      return null;
    }
  }

  /**
   * 更新智能体
   */
  public async updateAgent(id: string, updates: Partial<Omit<AIAgent, 'id' | 'createdAt'>>): Promise<boolean> {
    try {
      const agents = await this.getAllAgents();
      const index = agents.findIndex(agent => agent.id === id);
      
      if (index === -1) {
        console.error('[AIAgentService] 智能体不存在:', id);
        return false;
      }

      agents[index] = {
        ...agents[index],
        ...updates,
        updatedAt: Date.now(),
      };

      const success = await electronStore.set('ai-agents', agents);
      if (success) {
        console.log('[AIAgentService] 智能体更新成功:', id);
      }
      return success;
    } catch (error) {
      console.error('[AIAgentService] 更新智能体失败:', error);
      return false;
    }
  }

  /**
   * 删除智能体
   */
  public async deleteAgent(id: string): Promise<boolean> {
    try {
      const agents = await this.getAllAgents();
      const filteredAgents = agents.filter(agent => agent.id !== id);
      
      if (filteredAgents.length === agents.length) {
        console.error('[AIAgentService] 智能体不存在:', id);
        return false;
      }

      const success = await electronStore.set('ai-agents', filteredAgents);
      if (success) {
        console.log('[AIAgentService] 智能体删除成功:', id);
      }
      return success;
    } catch (error) {
      console.error('[AIAgentService] 删除智能体失败:', error);
      return false;
    }
  }

  /**
   * 根据 ID 获取智能体
   */
  public async getAgentById(id: string): Promise<AIAgent | null> {
    try {
      const agents = await this.getAllAgents();
      return agents.find(agent => agent.id === id) || null;
    } catch (error) {
      console.error('[AIAgentService] 获取智能体失败:', error);
      return null;
    }
  }

  /**
   * 搜索智能体
   */
  public async searchAgents(query: string): Promise<AIAgent[]> {
    try {
      const agents = await this.getAllAgents();
      const lowerQuery = query.toLowerCase();
      return agents.filter(agent => 
        agent.name.toLowerCase().includes(lowerQuery) ||
        agent.prompt.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('[AIAgentService] 搜索智能体失败:', error);
      return [];
    }
  }

  /**
   * 清空所有智能体
   */
  public async clearAllAgents(): Promise<boolean> {
    try {
      const success = await electronStore.set('ai-agents', []);
      if (success) {
        console.log('[AIAgentService] 所有智能体已清空');
      }
      return success;
    } catch (error) {
      console.error('[AIAgentService] 清空智能体失败:', error);
      return false;
    }
  }
}

// 导出单例实例
export const aiAgentService = AIAgentService.getInstance();

