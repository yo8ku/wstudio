/**
 * Agent 工具注册表
 * 功能：管理和注册所有可用的 Agent 工具
 * 描述：提供工具的注册、查询、验证和执行功能
 */

import {
  AgentTool,
  ToolResult,
  ToolParameterSchema
} from '../types';

/**
 * 工具注册表类
 */
export class ToolRegistry {
  /** 已注册的工具映射 */
  private tools: Map<string, AgentTool> = new Map();

  /** 工具分类映射 */
  private categories: Map<string, Set<string>> = new Map();

  constructor() {
    // 初始化默认分类
    this.categories.set('file', new Set());
    this.categories.set('search', new Set());
    this.categories.set('execute', new Set());
    this.categories.set('query', new Set());
    this.categories.set('other', new Set());
  }

  /**
   * 注册工具
   */
  register(tool: AgentTool, category: string = 'other'): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 "${tool.name}" 已存在，将被覆盖`);
    }

    this.tools.set(tool.name, tool);

    // 添加到分类
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(tool.name);

    console.log(`[ToolRegistry] 已注册工具: ${tool.name} (分类: ${category})`);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Array<{ tool: AgentTool; category?: string }>): void {
    for (const { tool, category } of tools) {
      this.register(tool, category);
    }
  }

  /**
   * 注销工具
   */
  unregister(toolName: string): boolean {
    if (!this.tools.has(toolName)) {
      return false;
    }

    this.tools.delete(toolName);

    // 从所有分类中移除
    for (const categoryTools of this.categories.values()) {
      categoryTools.delete(toolName);
    }

    console.log(`[ToolRegistry] 已注销工具: ${toolName}`);
    return true;
  }

  /**
   * 获取工具
   */
  get(toolName: string): AgentTool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * 检查工具是否存在
   */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * 获取所有工具
   */
  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具名称列表
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category: string): AgentTool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is AgentTool => tool !== undefined);
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * 验证工具参数
   */
  validateParams(toolName: string, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`工具 "${toolName}" 不存在`] };
    }

    const errors: string[] = [];

    // 检查必需参数
    if (tool.parameters.required) {
      for (const requiredParam of tool.parameters.required) {
        if (!(requiredParam in params)) {
          errors.push(`缺少必需参数: ${requiredParam}`);
        }
      }
    }

    // 检查参数类型
    if (tool.parameters.properties) {
      for (const [paramName, paramValue] of Object.entries(params)) {
        const paramSchema = tool.parameters.properties[paramName] as ToolParameterSchema | undefined;
        if (paramSchema) {
          const typeError = this.validateParamType(paramName, paramValue, paramSchema);
          if (typeError) {
            errors.push(typeError);
          }
        }
      }
    }

    // 使用工具自定义验证器
    if (tool.validateParams && !tool.validateParams(params)) {
      errors.push('工具自定义验证失败');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证参数类型
   */
  private validateParamType(
    paramName: string,
    value: unknown,
    schema: ToolParameterSchema
  ): string | null {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `参数 "${paramName}" 应为字符串类型，实际为 ${actualType}`;
        }
        if (schema.enum && !schema.enum.includes(value)) {
          return `参数 "${paramName}" 的值必须是以下之一: ${schema.enum.join(', ')}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          return `参数 "${paramName}" 应为数字类型，实际为 ${actualType}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `参数 "${paramName}" 应为布尔类型，实际为 ${actualType}`;
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return `参数 "${paramName}" 应为数组类型，实际为 ${actualType}`;
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `参数 "${paramName}" 应为对象类型，实际为 ${actualType}`;
        }
        break;
    }

    return null;
  }

  /**
   * 执行工具
   */
  async execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具 "${toolName}" 不存在`
      };
    }

    // 验证参数
    const validation = this.validateParams(toolName, params);
    if (!validation.valid) {
      return {
        success: false,
        error: `参数验证失败: ${validation.errors.join('; ')}`
      };
    }

    const startTime = Date.now();

    try {
      console.log(`[ToolRegistry] 执行工具: ${toolName}`, params);
      const result = await tool.execute(params);
      const duration = Date.now() - startTime;

      console.log(`[ToolRegistry] 工具 ${toolName} 执行完成，耗时 ${duration}ms`);

      return {
        ...result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`[ToolRegistry] 工具 ${toolName} 执行失败:`, error);

      return {
        success: false,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * 获取工具描述（用于 LLM）
   */
  getToolDescriptions(): string {
    const descriptions: string[] = [];

    for (const tool of this.tools.values()) {
      let desc = `## ${tool.name}\n${tool.description}\n`;

      if (tool.parameters.properties) {
        desc += '\n### 参数\n';
        for (const [paramName, paramSchema] of Object.entries(tool.parameters.properties)) {
          const schema = paramSchema as ToolParameterSchema;
          const required = tool.parameters.required?.includes(paramName) ? '(必需)' : '(可选)';
          desc += `- **${paramName}** ${required}: ${schema.description || ''} (类型: ${schema.type})\n`;
        }
      }

      if (tool.requiresConfirmation) {
        desc += '\n⚠️ 此工具需要用户确认后才能执行\n';
      }

      descriptions.push(desc);
    }

    return descriptions.join('\n---\n');
  }

  /**
   * 转换为 OpenAI 工具格式
   */
  toOpenAITools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties || {},
          required: tool.parameters.required || []
        }
      }
    }));
  }

  /**
   * 获取需要确认的工具列表
   */
  getToolsRequiringConfirmation(): AgentTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.requiresConfirmation);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    for (const categoryTools of this.categories.values()) {
      categoryTools.clear();
    }
    console.log('[ToolRegistry] 已清空所有工具');
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    totalTools: number;
    toolsByCategory: Record<string, number>;
    toolsRequiringConfirmation: number;
  } {
    const toolsByCategory: Record<string, number> = {};
    for (const [category, tools] of this.categories.entries()) {
      toolsByCategory[category] = tools.size;
    }

    return {
      totalTools: this.tools.size,
      toolsByCategory,
      toolsRequiringConfirmation: this.getToolsRequiringConfirmation().length
    };
  }
}

/** 导出单例实例 */
export const toolRegistry = new ToolRegistry();
