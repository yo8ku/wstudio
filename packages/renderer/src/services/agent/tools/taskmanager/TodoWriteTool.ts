/**
 * 待办列表写入工具
 * 功能：创建、更新或删除待办项
 * 描述：Agent 可在执行过程中管理自己的待办列表，跟踪多步任务进度。
 *       支持与 AgentPlan 步骤状态同步。
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, BaseToolConfig } from '../base/types';
import { TodoStore, type TodoItem } from './TodoStore';

/** 写入操作类型 */
type TodoAction = 'add' | 'update' | 'delete' | 'clear';

export class TodoWriteTool extends BaseTool<BaseToolConfig> {
  readonly name = 'todo_write';

  readonly description = '管理待办列表。可添加、更新状态、删除待办项，用于跟踪多步任务进度。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作类型：add（添加）、update（更新状态）、delete（删除）、clear（清空）',
        enum: ['add', 'update', 'delete', 'clear'],
      },
      content: {
        type: 'string',
        description: '待办内容（add 时必填）',
      },
      todoId: {
        type: 'string',
        description: '待办项 ID（update、delete 时必填）',
      },
      status: {
        type: 'string',
        description: '新状态（update 时使用）：pending、in_progress、completed',
        enum: ['pending', 'in_progress', 'completed'],
      },
    },
    required: ['action'],
  };

  readonly metadata: ToolMetadata = {
    category: 'taskmanager',
    requiresConfirmation: false,
    readOnly: false,
    priority: 55,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { action, content, todoId, status } = params as {
      action: TodoAction;
      content?: string;
      todoId?: string;
      status?: TodoItem['status'];
    };

    const store = TodoStore.getInstance();

    switch (action) {
      case 'add': {
        if (!content || !content.trim()) {
          return this.failure('添加待办项时 content 不能为空');
        }
        const item = store.add(content.trim());
        return this.success({ action: 'add', todo: item });
      }

      case 'update': {
        if (!todoId) {
          return this.failure('更新待办项时 todoId 不能为空');
        }
        const updated = store.update(todoId, { status, content });
        if (!updated) {
          return this.failure(`待办项 ${todoId} 不存在`);
        }
        return this.success({ action: 'update', todo: updated });
      }

      case 'delete': {
        if (!todoId) {
          return this.failure('删除待办项时 todoId 不能为空');
        }
        const deleted = store.delete(todoId);
        if (!deleted) {
          return this.failure(`待办项 ${todoId} 不存在`);
        }
        return this.success({ action: 'delete', todoId });
      }

      case 'clear': {
        store.clear();
        return this.success({ action: 'clear' });
      }

      default:
        return this.failure(`未知操作: ${action}`);
    }
  }
}
