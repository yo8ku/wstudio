/**
 * Development-only replay samples for validating agent frame rendering order.
 */

import type {
  AgentChatAssistantDeltaFrame,
  AgentChatFinalAnswerFrame,
  AgentChatReasoningDeltaFrame,
  AgentChatTaskFrame,
  AgentChatToolFinishedFrame,
  AgentChatToolStartedFrame,
  AgentChatProgressFrame,
} from '@note-studio/shared';

import type { AgentChatTurnFrame, AgentChatTurnStatus } from '@note-studio/shared';

export interface AgentFrameReplayStep {
  delayMs: number;
  frame: AgentChatTurnFrame;
}

export interface AgentFrameReplaySample {
  id: string;
  label: string;
  description: string;
  prompt: string;
  turnStatus: Extract<AgentChatTurnStatus, 'completed' | 'error' | 'interrupted'>;
  steps: AgentFrameReplayStep[];
}

const createFrameBase = <TKind extends AgentChatTurnFrame['kind']>(
  sampleId: string,
  index: number,
  kind: TKind,
): {
  id: string;
  threadId: string;
  turnId: string;
  itemId: string;
  kind: TKind;
  title: string | null;
  text: string | null;
  status: AgentChatTurnFrame['status'];
  createdAt: number;
  streamId: string | null;
  responseKey: string | null;
  iteration: number | null;
} => ({
  id: `${sampleId}-${kind}-${index}`,
  threadId: `replay-thread-${sampleId}`,
  turnId: `replay-turn-${sampleId}`,
  itemId: `${sampleId}-${kind}-${index}`,
  kind,
  title: null,
  text: null,
  status: 'running',
  createdAt: 1_700_000_000_000 + index * 1000,
  streamId: `replay-stream-${sampleId}`,
  responseKey: `replay-response-${sampleId}`,
  iteration: null,
});

const taskFrame = (
  sampleId: string,
  index: number,
  text: string,
): AgentChatTaskFrame => ({
  ...createFrameBase(sampleId, index, 'task'),
  title: 'Agent task',
  text,
});

const progressFrame = (
  sampleId: string,
  index: number,
  iteration: number,
): AgentChatProgressFrame => ({
  ...createFrameBase(sampleId, index, 'progress'),
  title: `Iteration ${iteration}`,
  iteration,
  nextIteration: iteration,
});

const reasoningFrame = (
  sampleId: string,
  index: number,
  text: string,
): AgentChatReasoningDeltaFrame => ({
  ...createFrameBase(sampleId, index, 'reasoning_delta'),
  text,
});

const toolStartedFrame = (
  sampleId: string,
  index: number,
  toolName: string,
  toolCallId: string,
  params: Record<string, unknown>,
): AgentChatToolStartedFrame => ({
  ...createFrameBase(sampleId, index, 'tool_started'),
  title: toolName,
  toolName,
  toolCallId,
  params,
  streamId: toolCallId,
});

const toolFinishedFrame = (
  sampleId: string,
  index: number,
  toolName: string,
  toolCallId: string,
  success: boolean,
  resultText: string,
): AgentChatToolFinishedFrame => ({
  ...createFrameBase(sampleId, index, 'tool_finished'),
  title: toolName,
  toolName,
  toolCallId,
  success,
  resultText,
  text: resultText,
  streamId: toolCallId,
  status: success ? 'completed' : 'failed',
});

const assistantDeltaFrame = (
  sampleId: string,
  index: number,
  text: string,
): AgentChatAssistantDeltaFrame => ({
  ...createFrameBase(sampleId, index, 'assistant_delta'),
  text,
  title: 'Assistant',
});

const finalAnswerFrame = (
  sampleId: string,
  index: number,
  text: string,
): AgentChatFinalAnswerFrame => ({
  ...createFrameBase(sampleId, index, 'final_answer'),
  text,
  title: 'Final answer',
  status: 'completed',
});

const stringifyToolResult = (payload: {
  success: boolean;
  error?: string | null;
  data?: Record<string, unknown>;
  changedFiles?: string[];
}): string => JSON.stringify({
  success: payload.success,
  error: payload.error ?? null,
  data: payload.data ?? null,
  changedFiles: payload.changedFiles ?? [],
});

export const AGENT_FRAME_REPLAY_SAMPLES: AgentFrameReplaySample[] = [
  {
    id: 'search-summary',
    label: '检索总结',
    description: '验证思考、双工具调用和最终回答是否按一条自然线程收口。',
    prompt: '总结当前仓库里 Agent 消息渲染协议的关键阶段。',
    turnStatus: 'completed',
    steps: [
      { delayMs: 80, frame: taskFrame('search-summary', 1, 'Summarize the current message rendering protocol.') },
      { delayMs: 140, frame: progressFrame('search-summary', 2, 1) },
      { delayMs: 180, frame: reasoningFrame('search-summary', 3, '先归一化事件，再决定哪些细节进入主线程。') },
      {
        delayMs: 220,
        frame: toolStartedFrame('search-summary', 4, 'read_file', 'replay-read-protocol', {
          path: 'packages/shared/src/types/agentChat.ts',
        }),
      },
      {
        delayMs: 260,
        frame: toolFinishedFrame(
          'search-summary',
          5,
          'read_file',
          'replay-read-protocol',
          true,
          stringifyToolResult({
            success: true,
            data: {
              content: 'frame: task\nframe: reasoning_delta\nframe: tool_started\nframe: final_answer',
            },
          }),
        ),
      },
      { delayMs: 150, frame: assistantDeltaFrame('search-summary', 6, '我先把流事件拆成任务、思考、工具和正文四类。') },
      {
        delayMs: 210,
        frame: toolStartedFrame('search-summary', 7, 'list_files', 'replay-list-renderer', {
          path: 'packages/renderer/src/components/Layout/AIChatPanel',
        }),
      },
      {
        delayMs: 240,
        frame: toolFinishedFrame(
          'search-summary',
          8,
          'list_files',
          'replay-list-renderer',
          true,
          stringifyToolResult({
            success: true,
            data: {
              items: [
                'AIChatPanel.tsx',
                'AIChatPanel.scss',
                'streamProtocol.ts',
                'AgentMode/AgentMode.tsx',
              ],
            },
          }),
        ),
      },
      { delayMs: 160, frame: assistantDeltaFrame('search-summary', 9, '工具细节折叠进时间线卡片，正文只保留高层叙述。') },
      {
        delayMs: 220,
        frame: finalAnswerFrame(
          'search-summary',
          10,
          '现在主链路已经收敛为统一 frame，UI 先消费 frame，再映射成思考、工具和最终回答。',
        ),
      },
    ],
  },
  {
    id: 'bash-failure',
    label: '失败恢复',
    description: '验证 bash 失败时的工具摘要、错误状态和最终回答是否仍然连贯。',
    prompt: '检查构建失败原因并给出收敛建议。',
    turnStatus: 'error',
    steps: [
      { delayMs: 80, frame: taskFrame('bash-failure', 1, 'Inspect the build failure and propose a fix.') },
      { delayMs: 120, frame: progressFrame('bash-failure', 2, 1) },
      { delayMs: 160, frame: reasoningFrame('bash-failure', 3, '先跑一次构建，确认失败是类型问题还是工具链问题。') },
      {
        delayMs: 200,
        frame: toolStartedFrame('bash-failure', 4, 'bash', 'replay-bash-build', {
          command: 'pnpm --filter @note-studio/renderer build',
        }),
      },
      {
        delayMs: 320,
        frame: toolFinishedFrame(
          'bash-failure',
          5,
          'bash',
          'replay-bash-build',
          false,
          stringifyToolResult({
            success: false,
            error: 'Command failed with exit code 1',
            data: {
              command: 'pnpm --filter @note-studio/renderer build',
              stdout: 'src/components/Layout/AIChatPanel/AIChatPanel.tsx(5408,17): error TS2322',
              stderr: '',
              exitCode: 1,
            },
          }),
        ),
      },
      { delayMs: 180, frame: reasoningFrame('bash-failure', 6, '失败已经足够说明问题，不要继续重复工具调用。') },
      { delayMs: 180, frame: assistantDeltaFrame('bash-failure', 7, '构建在类型层报错，说明事件协议和 UI 适配还没完全对齐。') },
      {
        delayMs: 220,
        frame: finalAnswerFrame(
          'bash-failure',
          8,
          '先把重复的旧回调收口掉，再补回放样本，构建错误会更容易定位。',
        ),
      },
    ],
  },
  {
    id: 'write-flow',
    label: '写入完成',
    description: '验证写文件工具的摘要、文件卡片和最终完成态是否稳定。',
    prompt: '把统一事件协议写入共享层并通知前端更新。',
    turnStatus: 'completed',
    steps: [
      { delayMs: 80, frame: taskFrame('write-flow', 1, 'Move the unified frame protocol into shared and update renderer.') },
      { delayMs: 120, frame: progressFrame('write-flow', 2, 1) },
      { delayMs: 170, frame: reasoningFrame('write-flow', 3, '先更新 shared 类型，再让 renderer 直接消费 frame。') },
      {
        delayMs: 200,
        frame: toolStartedFrame('write-flow', 4, 'write_file', 'replay-write-shared', {
          path: 'packages/shared/src/types/agentChat.ts',
        }),
      },
      {
        delayMs: 260,
        frame: toolFinishedFrame(
          'write-flow',
          5,
          'write_file',
          'replay-write-shared',
          true,
          stringifyToolResult({
            success: true,
            data: {
              path: 'packages/shared/src/types/agentChat.ts',
              newContent: 'export type AgentChatTurnFrame = ...',
            },
            changedFiles: ['packages/shared/src/types/agentChat.ts'],
          }),
        ),
      },
      { delayMs: 160, frame: assistantDeltaFrame('write-flow', 6, '共享层已经收口，renderer 不需要再猜 item.kind。') },
      {
        delayMs: 220,
        frame: finalAnswerFrame(
          'write-flow',
          7,
          '主进程、shared、renderer 现在都可以围绕同一套 frame 协议协同工作。',
        ),
      },
    ],
  },
];

export const getAgentFrameReplaySample = (
  sampleId: string,
): AgentFrameReplaySample | null => AGENT_FRAME_REPLAY_SAMPLES.find(sample => sample.id === sampleId) ?? null;
