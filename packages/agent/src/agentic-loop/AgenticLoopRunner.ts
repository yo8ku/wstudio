/**
 * Core Agentic Loop runner that repeatedly calls the model, executes tools,
 * appends tool results to history, and stops on the configured conditions.
 */

import { AgentLoopMessageHistory } from './messageHistory';
import { parseAgentLoopDecision } from './decisionParser';
import type {
  AgenticLoopRunInput,
  AgenticLoopRunResult,
  AgentLoopFinalAnswerEvent,
  AgentLoopTerminationReason,
  AgentLoopToolCall,
} from './types';

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
};

const resolvePositiveInteger = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
};

const buildTerminationFallback = (reason: AgentLoopTerminationReason): string => {
  if (reason === 'max_model_calls') {
    return '已达到单次任务的模型调用上限，Agent 已停止继续请求模型。请检查当前工具结果后决定是否发起下一轮任务。';
  }

  return '已达到最大循环次数限制，Agent 已停止继续执行。请检查当前结果，并在需要时发起下一轮任务。';
};

export const runAgenticLoop = async <TToolContext = unknown>(
  input: AgenticLoopRunInput<TToolContext>,
): Promise<AgenticLoopRunResult> => {
  const maxIterations = resolvePositiveInteger(input.maxIterations, 1);
  const maxModelCalls = resolvePositiveInteger(input.maxModelCalls, maxIterations + 1);
  const maxFinalAnswerChars = resolvePositiveInteger(input.maxFinalAnswerChars, 24000);
  const callbacks = input.callbacks ?? {};
  const history = new AgentLoopMessageHistory(
    input.checkpoint?.messages && input.checkpoint.messages.length > 0
      ? input.checkpoint.messages
      : input.initialMessages,
  );

  const assertCanContinue = async (): Promise<void> => {
    await callbacks.assertCanContinue?.();
  };

  const emitFinalAnswer = async (event: AgentLoopFinalAnswerEvent): Promise<void> => {
    await callbacks.onFinalAnswer?.(event);
  };

  let nextIteration = input.checkpoint?.nextIteration ?? 1;
  let modelCallsUsed = Math.max(0, Math.floor(input.checkpoint?.modelCallsUsed ?? 0));

  const emitCheckpoint = async (checkpointIteration: number): Promise<void> => {
    await callbacks.onCheckpoint?.(history.createCheckpoint(checkpointIteration, modelCallsUsed));
  };

  const compactHistoryIfNeeded = async (iteration: number | null, checkpointIteration: number): Promise<void> => {
    const compactedEvent = await history.compactIfNeeded(iteration, input.historyCompression);
    if (!compactedEvent) {
      return;
    }

    await callbacks.onHistoryCompacted?.(compactedEvent);
    await emitCheckpoint(checkpointIteration);
  };

  if (!input.checkpoint) {
    await emitCheckpoint(nextIteration);
  }

  let iterationsCompleted = Math.max(0, nextIteration - 1);
  let terminationReason: AgentLoopTerminationReason = 'max_iterations';

  for (let iteration = nextIteration; iteration <= maxIterations; iteration += 1) {
    iterationsCompleted = iteration;
    await assertCanContinue();
    await compactHistoryIfNeeded(iteration, iteration);
    await emitCheckpoint(iteration);
    await callbacks.onIterationStart?.(iteration);

    if (modelCallsUsed >= maxModelCalls) {
      terminationReason = 'max_model_calls';
      nextIteration = iteration;
      break;
    }

    modelCallsUsed += 1;
    await emitCheckpoint(iteration);

    const rawDecision = await input.callModel(history.snapshot(), iteration);
    await assertCanContinue();

    const decision = parseAgentLoopDecision(rawDecision);
    if (!decision) {
      const directText = truncateText(normalizeText(rawDecision), maxFinalAnswerChars);
      if (directText) {
        await emitFinalAnswer({
          text: directText,
          iteration,
          reason: 'assistant_text',
        });

        return {
          finalOutput: directText,
          messages: history.snapshot(),
          iterationsCompleted,
          terminationReason: 'assistant_text',
          checkpoint: history.createCheckpoint(iteration, modelCallsUsed),
        };
      }

      nextIteration = iteration;
      break;
    }

    if (decision.thinking) {
      await callbacks.onThinking?.(decision, iteration);
    }

    if (decision.action === 'final') {
      const finalText = truncateText(decision.finalAnswer || '', maxFinalAnswerChars);
      if (finalText) {
        await emitFinalAnswer({
          text: finalText,
          iteration,
          reason: 'final_answer',
        });

        return {
          finalOutput: finalText,
          messages: history.snapshot(),
          iterationsCompleted,
          terminationReason: 'final_answer',
          checkpoint: history.createCheckpoint(iteration, modelCallsUsed),
        };
      }

      nextIteration = iteration;
      break;
    }

    const toolCall: AgentLoopToolCall = {
      iteration,
      toolName: decision.toolName || '',
      parameters: decision.parameters ?? {},
      thinking: decision.thinking,
    };

    const toolCallContext = (await callbacks.onToolCall?.(toolCall)) as TToolContext | undefined;
    history.appendAssistantToolCall(toolCall);

    const toolResult = await input.executeTool(
      toolCall.toolName,
      toolCall.parameters,
      iteration,
    );
    await assertCanContinue();

    const formattedResult = input.formatToolResult(toolCall.toolName, toolResult);
    await callbacks.onToolResult?.({
      toolCall,
      result: toolResult,
      formattedResult,
      toolCallContext,
    });

    history.appendToolResult(formattedResult);
    nextIteration = iteration + 1;
    await emitCheckpoint(nextIteration);
  }

  await assertCanContinue();
  await compactHistoryIfNeeded(null, nextIteration);

  if (terminationReason !== 'max_model_calls' && input.generateFinalAnswer) {
    if (modelCallsUsed < maxModelCalls) {
      modelCallsUsed += 1;
      await emitCheckpoint(nextIteration);

      const finalMessages = history.snapshot();
      const generatedFinalAnswer = truncateText(
        await input.generateFinalAnswer(finalMessages),
        maxFinalAnswerChars,
      );
      if (generatedFinalAnswer) {
        return {
          finalOutput: generatedFinalAnswer,
          messages: finalMessages,
          iterationsCompleted,
          terminationReason: 'generated_final_answer',
          checkpoint: history.createCheckpoint(nextIteration, modelCallsUsed),
        };
      }

      terminationReason = 'max_iterations';
    } else {
      terminationReason = 'max_model_calls';
    }
  }

  const finalMessages = history.snapshot();
  const fallbackFinalAnswer = truncateText(buildTerminationFallback(terminationReason), maxFinalAnswerChars);
  await emitFinalAnswer({
    text: fallbackFinalAnswer,
    iteration: terminationReason === 'max_model_calls' ? null : iterationsCompleted,
    reason: terminationReason,
  });

  return {
    finalOutput: fallbackFinalAnswer,
    messages: finalMessages,
    iterationsCompleted,
    terminationReason,
    checkpoint: history.createCheckpoint(nextIteration, modelCallsUsed),
  };
};
