/**
 * Agent 工具抽象基类
 * 功能：定义所有工具的公共行为和接口规范
 * 描述：所有工具类必须继承此基类，实现 name、description、parameters、metadata 和 execute
 */

import type { AgentTool, ToolResult, ToolParameterSchema, FileChange } from '../../types';
import type { ToolMetadata, BaseToolConfig, IPCResult } from './types';

export abstract class BaseTool<TConfig extends BaseToolConfig = BaseToolConfig> {
  /** 工具配置 */
  protected config: TConfig;

  constructor(config: TConfig) {
    this.config = config;
  }

  /** 工具名称（唯一标识） */
  abstract readonly name: string;

  /** 工具描述（提供给 LLM 判断何时使用） */
  abstract readonly description: string;

  /** 参数 Schema（定义工具接受的参数） */
  abstract readonly parameters: ToolParameterSchema;

  /** 工具元数据（分类、权限、版本等） */
  abstract readonly metadata: ToolMetadata;

  /** 执行工具逻辑（子类必须实现） */
  abstract execute(params: Record<string, unknown>): Promise<ToolResult>;

  /**
   * 参数验证（可选覆盖）
   * 默认基于 parameters.required 做基础验证
   */
  validateParams(params: Record<string, unknown>): boolean {
    if (this.parameters.required) {
      for (const key of this.parameters.required) {
        if (!(key in params) || params[key] === undefined || params[key] === null) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 转换为 AgentTool 接口
   * 桥接方法，让类式工具兼容现有 ToolRegistry
   */
  toAgentTool(): AgentTool {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      requiresConfirmation: this.metadata.requiresConfirmation,
      execute: (params) => this.execute(params),
      validateParams: (params) => this.validateParams(params),
    };
  }

  /** 创建成功结果 */
  protected success(data: unknown, changes?: FileChange[]): ToolResult {
    return { success: true, data, changes };
  }

  /** 创建失败结果 */
  protected failure(error: string): ToolResult {
    return { success: false, error };
  }

  /** 通过 IPC 调用主进程 */
  protected async invokeIPC<T = unknown>(channel: string, ...args: unknown[]): Promise<IPCResult<T>> {
    const result = await window.electron?.ipcRenderer.invoke(channel, ...args);
    return result as IPCResult<T>;
  }

  /** 更新配置 */
  updateConfig(config: Partial<TConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
