/**
 * 用户提问工具
 * 功能：Agent 执行过程中向用户提出问题并等待回答
 * 描述：当 Agent 需要澄清需求、确认方案或获取额外信息时使用。
 *       通过事件机制与 UI 层交互，不走 IPC。
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, BaseToolConfig } from '../base/types';

/** 用户回答的 Promise 解析器 */
interface PendingQuestion {
  resolve: (answer: string) => void;
  reject: (reason: string) => void;
}

/** 全局事件名称 */
const ASK_USER_EVENT = 'agent:ask-user';
const USER_ANSWER_EVENT = 'agent:user-answer';

export class AskUserTool extends BaseTool<BaseToolConfig> {
  readonly name = 'ask_user';

  readonly description = '向用户提出问题并等待回答。当需要澄清需求、确认方案或获取额外信息时使用。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: '要向用户提出的问题',
      },
    },
    required: ['question'],
  };

  readonly metadata: ToolMetadata = {
    category: 'interaction',
    requiresConfirmation: false,
    readOnly: true,
    priority: 60,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { question } = params as { question: string };

    if (!question.trim()) {
      return this.failure('问题内容不能为空');
    }

    try {
      const answer = await this.askUser(question);
      return this.success({
        question,
        answer,
      });
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 向用户提问并等待回答
   * 通过 CustomEvent 与 UI 层通信
   */
  private askUser(question: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeoutMs = 300000; // 5分钟超时

      const timeoutId = setTimeout(() => {
        window.removeEventListener(USER_ANSWER_EVENT, handler);
        reject(new Error('等待用户回答超时'));
      }, timeoutMs);

      const handler = (event: Event) => {
        clearTimeout(timeoutId);
        window.removeEventListener(USER_ANSWER_EVENT, handler);
        const customEvent = event as CustomEvent<{ answer: string }>;
        resolve(customEvent.detail.answer);
      };

      window.addEventListener(USER_ANSWER_EVENT, handler);

      // 触发提问事件，UI 层监听此事件显示问题
      window.dispatchEvent(new CustomEvent(ASK_USER_EVENT, {
        detail: { question },
      }));
    });
  }
}
