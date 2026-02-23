/**
 * 待办列表读取工具
 * 功能：读取当前 Agent 任务的待办列表
 * 描述：与 AgentPlan 步骤状态融合，提供统一的任务进度视图。
 *       同时支持 Agent 自行创建的自定义待办项。
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, BaseToolConfig } from '../base/types';
import { TodoStore, type TodoItem } from './TodoStore';

export class TodoReadTool extends BaseTool<BaseToolConfig> {
  readonly name = 'todo_read';

  readonly description = '读取当前任务的待办列表。返回所有待办项及其状态，可用于了解任务进度。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '按状态过滤：pending、in_progress、completed。不传则返回全部。',
        enum: ['pending', 'in_progress', 'completed'],
      },
    },
    required: [],
  };

  readonly metadata: ToolMetadata = {
    category: 'taskmanager',
    requiresConfirmation: false,
    readOnly: true,
    priority: 55,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { status } = params as { status?: TodoItem['status'] };

    const store = TodoStore.getInstance();
    let todos: TodoItem[];

    if (status) {
      todos = store.getByStatus(status);
    } else {
      todos = store.getAll();
    }

    const summary = {
      total: store.getAll().length,
      pending: store.getByStatus('pending').length,
      in_progress: store.getByStatus('in_progress').length,
      completed: store.getByStatus('completed').length,
    };

    return this.success({ todos, summary });
  }
}
